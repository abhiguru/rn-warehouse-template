/**
 * The 2 -> 3 step of the unsent-work file (WH-381): a dispatch is made online only, so any dispatch work queued by an earlier
 * version is removed: the `newDispatch` items, the `photos` items of a dispatch (and whatever waits for them), their photo
 * rows, and the saved `dispatch` forms. Everything of a GRN stays.
 *
 * Photo safety (the 2026-11-27 data-loss defect): a file goes only when dispatch work named it and nothing that stays names it,
 * by a photo row, a form's photo list, or the text of a form or of a kept `form_row`. When any row cannot be read, no file goes.
 * The rows go in the caller's one transaction; the files are removed by the caller after it commits.
 */
import { File } from 'expo-file-system';
import { createLogger, loggableError } from '@/utils/logger';
import { fileOfStored, formFiles, ownFilesInText } from './storedPath';

const logger = createLogger('[unsent]');

/** The part of the raw connection this step uses. */
export interface StepDb {
  runAsync(source: string, params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: (string | number | null)[]): Promise<T[]>;
}

interface ItemRow {
  id: string;
  kind: string;
  body: unknown;
  depends_on: string | null;
  form_row: unknown;
}

const isDispatchWork = (row: ItemRow): boolean => {
  if (row.kind === 'newDispatch') return true;
  if (row.kind !== 'photos' || typeof row.body !== 'string') return false;
  try {
    return (JSON.parse(row.body) as { doc?: unknown } | null)?.doc === 'dispatch';
  } catch {
    return false;
  }
};

/** The files a kept-form_row text names, listed or in its text. Throws when it cannot be read. */
function rowFiles(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== 'string') throw new TypeError('A kept form row is not readable');
  const kept = JSON.parse(raw) as { photos?: string };
  return [...ownFilesInText(raw), ...formFiles(kept.photos)];
}

/** The files a form row names. Throws when it cannot be read. */
function formRowFiles(row: { state: unknown; photos: unknown }): string[] {
  if (typeof row.state !== 'string') throw new TypeError('A form row has no readable text');
  if (row.photos !== null && (typeof row.photos !== 'string' || !Array.isArray(JSON.parse(row.photos)))) {
    throw new TypeError('A form row has an unreadable photo list');
  }
  return [...ownFilesInText(row.state), ...formFiles(row.photos)];
}

/** Deletes the legacy dispatch rows; returns the files to remove once the transaction has committed. */
export async function removeDispatchWork(db: StepDb): Promise<string[]> {
  const items = await db.getAllAsync<ItemRow>('SELECT id, kind, body, depends_on, form_row FROM items', []);
  const doomed = new Set(items.filter(isDispatchWork).map(row => row.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of items) {
      if (!doomed.has(row.id) && row.depends_on !== null && doomed.has(row.depends_on)) {
        doomed.add(row.id);
        grew = true;
      }
    }
  }
  const forms = await db.getAllAsync<{ id: string; kind: string; state: unknown; photos: unknown }>('SELECT id, kind, state, photos FROM forms', []);
  const doomedForms = forms.filter(form => form.kind === 'dispatch');
  const photos = await db.getAllAsync<{ item_id: string; file: string }>('SELECT item_id, file FROM item_photos', []);

  let files: string[] = [];
  try {
    const named = new Set<string>();
    const candidates = new Set<string>();
    for (const photo of photos) (doomed.has(photo.item_id) ? candidates : named).add(fileOfStored(photo.file));
    for (const form of forms) for (const file of formRowFiles(form)) (form.kind === 'dispatch' ? candidates : named).add(file);
    for (const row of items) for (const file of rowFiles(row.form_row)) (doomed.has(row.id) ? candidates : named).add(file);
    files = [...candidates].filter(file => file !== '' && !named.has(file));
  } catch (error) {
    // Nothing is removed when any row cannot be read: a file kept is harmless, a file lost is not.
    logger.warn('Dispatch photo files are kept: a row could not be read', loggableError(error));
  }

  for (const id of doomed) {
    await db.runAsync('DELETE FROM item_photos WHERE item_id = ?', [id]);
    await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
  }
  for (const form of doomedForms) await db.runAsync('DELETE FROM forms WHERE id = ?', [form.id]);
  return files;
}

/** Removes the files; one that cannot be removed is left (the start-up sweep takes the unnamed ones). */
export function removeFiles(uris: readonly string[]): void {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (error) {
      logger.warn('A photo file could not be removed', loggableError(error));
    }
  }
}
