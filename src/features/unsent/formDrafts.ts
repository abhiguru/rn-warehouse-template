/**
 * The person's unfinished forms on this phone (WH-301, contract sections 1 and 8). Slice 4 needs only what "Delete my
 * account" reads: how many there are, and removing them. The form saving itself is a later slice.
 */
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger, loggableError } from '@/utils/logger';
import { getUnsentDb } from './unsentDb';
import { announceUnsentChange, removePhotoFile } from './unsentRows';

const logger = createLogger('[unsent-forms]');

/** How many unfinished forms the signed-in person has on this phone; 0 when they cannot be counted. */
export async function countOwnForms(): Promise<number> {
  try {
    const scope = await getSessionCacheScope();
    if (!scope) return 0;
    const db = await getUnsentDb();
    const [row] = await db.all<{ n: number }>('SELECT count(*) AS n FROM forms WHERE scope = ?', [scope]);
    return row?.n ?? 0;
  } catch (error) {
    logger.warn('The unfinished forms could not be counted', loggableError(error));
    return 0;
  }
}

/**
 * Removes the signed-in person's unfinished forms and their photo files, in one step. Never throws. `scope` is the person's
 * scope read before an action that ends the session (Delete my account), when it can no longer be asked for.
 */
export async function deleteOwnForms(given?: string | null): Promise<void> {
  try {
    const scope = given ?? (await getSessionCacheScope());
    if (!scope) return;
    const db = await getUnsentDb();
    const files: string[] = [];
    await db.transaction(async tx => {
      const forms = await tx.all<{ photos: string | null }>('SELECT photos FROM forms WHERE scope = ?', [scope]);
      for (const form of forms) files.push(...photoFilesOf(form.photos));
      await tx.run('DELETE FROM forms WHERE scope = ?', [scope]);
    });
    for (const uri of files) removePhotoFile(uri);
    await announceUnsentChange();
  } catch (error) {
    logger.warn('The unfinished forms could not be deleted', loggableError(error));
  }
}

/** The files a form's `photos` column names (a JSON list of file addresses, or of objects with a `file`). */
function photoFilesOf(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry: unknown) => {
      if (typeof entry === 'string') return [entry];
      if (typeof entry === 'object' && entry !== null && 'file' in entry && typeof entry.file === 'string') return [entry.file];
      return [];
    });
  } catch {
    return [];
  }
}
