/**
 * The person's unfinished forms on this phone (WH-301, contract sections 1 and 8): a form's state is saved as the person
 * types, kept by every close but the person's own "Discard" and a successful save, and offered again when the form is opened.
 * A picked photo is copied into the unsent-work folder, so the form's own cache files may be released as they always were.
 */
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { isAppOwnedFileUri } from '@/utils/localPhotoFiles';
import { createLogger, loggableError } from '@/utils/logger';
import { getUnsentDb, unsentPhotoDirectory, type UnsentDb } from './unsentDb';
import { formTextFromStored, formTextToStored, fromStored, ownFilesInText, toStoredOrNull } from './storedPath';
import { announceUnsentChange, removePhotoFile } from './unsentRows';

const logger = createLogger('[unsent-forms]');

/** The forms that are kept: a new GRN and the changes to one GRN. */
export type FormKind = 'grn' | 'grnEdit';

/** An unfinished form as it is read back. */
export interface FormDraft {
  id: string;
  kind: FormKind;
  grnId: string | null;
  /** The slice state as saved (a JSON value; the caller checks its shape). */
  state: unknown;
  customer: string | null;
  startedAt: number;
}

/** Goes up whenever a form is ended, so that a save that was waiting for its turn knows it is stale. */
let epoch = 0;
export const formDraftEpoch = (): number => epoch;

// True while the end of a session empties the forms: that reset is not the person's Discard and keeps the unfinished form.
let sessionEnding = false;
export const isSessionEnding = (): boolean => sessionEnding;
export function whileSessionEnds(work: () => void): void {
  sessionEnding = true;
  try {
    work();
  } finally {
    sessionEnding = false;
  }
}

const FILE_ADDRESS = /file:\/\/[^"\\]+/g;

async function ownScope(): Promise<string | null> {
  return getSessionCacheScope();
}

/** The photo files a form's `photos` column names. */
function filesOfColumn(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.flatMap(entry => (typeof entry === 'string' ? fullFiles(entry) : [])) : [];
  } catch {
    return [];
  }
}

/** A stored file address as the full current one (none when it cannot be one). */
function fullFiles(stored: string): string[] {
  const full = fromStored(stored);
  return full === null ? [] : [full];
}

/** The addresses as the `photos` column keeps them. */
const storedFiles = (files: readonly string[]): string[] => files.flatMap(file => toStoredOrNull(file) ?? []);

/**
 * Copies the files the state names into the unsent folder (a file already there is left) and gives back the state text with
 * their addresses and the list of the copies. A file that cannot be copied stays where it was.
 */
async function keepPhotoFiles(text: string): Promise<{ text: string; files: string[] }> {
  const folder = unsentPhotoDirectory();
  const kept: string[] = [];
  let result = text;
  for (const address of new Set(text.match(FILE_ADDRESS) ?? [])) {
    if (address.startsWith(folder.uri)) {
      kept.push(address);
      continue;
    }
    if (!isAppOwnedFileUri(address)) continue;
    try {
      const name = address.slice(address.lastIndexOf('/') + 1);
      const target = new File(folder, `form-${name}`);
      if (!target.exists) {
        folder.create({ intermediates: true, idempotent: true });
        await new File(address).copy(target);
      }
      result = result.split(address).join(target.uri);
      kept.push(target.uri);
    } catch (error) {
      logger.warn('A photo of an unfinished form could not be kept', loggableError(error));
    }
  }
  return { text: result, files: kept };
}

/**
 * Saves the form (one per kind, and per GRN for an edit). Never throws; false when nothing could be saved. Photo files the
 * form no longer names are removed.
 */
export async function saveFormDraft(input: { kind: FormKind; grnId?: string | null; state: unknown; customer?: string | null; at?: number }): Promise<boolean> {
  try {
    const scope = await ownScope();
    if (!scope) return false;
    const copied = await keepPhotoFiles(JSON.stringify(input.state));
    // Nothing absolute is stored: the text names the copies as `app-doc:///...` and the column relative to the documents folder.
    const text = formTextToStored(copied.text);
    // A file the text still names (a legacy address of an old container, say) stays listed and is never dropped below (WH-301).
    const files = [...new Set([...copied.files, ...ownFilesInText(text)])];
    const kept = { text, files, stored: JSON.stringify(storedFiles(files)) };
    const grnId = input.grnId ?? '';
    const now = input.at ?? Date.now();
    const db = await getUnsentDb();
    let dropped: string[] = [];
    await db.transaction(async tx => {
      const [old] = await tx.all<{ id: string; photos: string | null }>('SELECT id, photos FROM forms WHERE scope = ? AND kind = ? AND grn_id = ?', [scope, input.kind, grnId]);
      if (old) {
        dropped = filesOfColumn(old.photos).filter(file => !kept.files.includes(file));
        await tx.run('UPDATE forms SET state = ?, photos = ?, customer = ?, updated_at = ? WHERE id = ?', [kept.text, kept.stored, input.customer ?? null, now, old.id]);
      } else {
        await tx.run('INSERT INTO forms (id, scope, kind, grn_id, state, photos, customer, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          Crypto.randomUUID(),
          scope,
          input.kind,
          grnId,
          kept.text,
          kept.stored,
          input.customer ?? null,
          now,
          now,
        ]);
      }
    });
    for (const file of dropped) removePhotoFile(file);
    await announceUnsentChange();
    return true;
  } catch (error) {
    logger.warn('An unfinished form could not be saved', loggableError(error));
    return false;
  }
}

/** The person's unfinished form of this kind (of this GRN for an edit), or null. */
export async function loadFormDraft(kind: FormKind, grnId?: string | null): Promise<FormDraft | null> {
  try {
    const scope = await ownScope();
    if (!scope) return null;
    const db = await getUnsentDb();
    const [row] = await db.all<{ id: string; state: string; photos: string | null; customer: string | null; started_at: number }>(
      'SELECT id, state, photos, customer, started_at FROM forms WHERE scope = ? AND kind = ? AND grn_id = ?',
      [scope, kind, grnId ?? '']
    );
    if (!row) return null;
    await listFilesTheStateNames(db, row);
    return { id: row.id, kind, grnId: grnId ?? null, state: JSON.parse(formTextFromStored(row.state)) as unknown, customer: row.customer, startedAt: row.started_at };
  } catch (error) {
    logger.warn('An unfinished form could not be read', loggableError(error));
    return null;
  }
}

/**
 * A form saved before WH-301 was fixed can name a photo in its text that its `photos` column does not list. The column is
 * rebuilt from the text, so the next save keeps the file and its clean-up still finds it. Never throws.
 */
async function listFilesTheStateNames(db: UnsentDb, row: { id: string; state: string; photos: string | null }): Promise<void> {
  try {
    const listed = new Set(filesOfColumn(row.photos));
    const named = ownFilesInText(row.state).filter(file => !listed.has(file));
    if (named.length === 0) return;
    const stored = JSON.stringify(storedFiles([...listed, ...named]));
    await db.run('UPDATE forms SET photos = ? WHERE id = ?', [stored, row.id]);
  } catch (error) {
    logger.warn('The photo list of an unfinished form could not be rebuilt', loggableError(error));
  }
}

/** Ends one unfinished form: the person's Discard, "Start new" after its confirm, the row's Delete, or a saved form. */
export async function endFormDraft(kind: FormKind, grnId?: string | null): Promise<void> {
  epoch += 1;
  try {
    const scope = await ownScope();
    if (!scope) return;
    const db = await getUnsentDb();
    const files: string[] = [];
    await db.transaction(async tx => {
      const rows = await tx.all<{ photos: string | null }>('SELECT photos FROM forms WHERE scope = ? AND kind = ? AND grn_id = ?', [scope, kind, grnId ?? '']);
      for (const row of rows) files.push(...filesOfColumn(row.photos));
      await tx.run('DELETE FROM forms WHERE scope = ? AND kind = ? AND grn_id = ?', [scope, kind, grnId ?? '']);
    });
    for (const uri of files) removePhotoFile(uri);
    await announceUnsentChange();
  } catch (error) {
    logger.warn('An unfinished form could not be ended', loggableError(error));
  }
}

/** The person's unfinished forms, oldest first, for "Not finished". */
export async function listOwnForms(): Promise<{ id: string; kind: FormKind; grnId: string | null; customer: string | null; startedAt: number; number: string | null }[]> {
  try {
    const scope = await ownScope();
    if (!scope) return [];
    const db = await getUnsentDb();
    const rows = await db.all<{ id: string; kind: FormKind; grn_id: string; customer: string | null; started_at: number; state: string }>(
      'SELECT id, kind, grn_id, customer, started_at, state FROM forms WHERE scope = ? ORDER BY started_at',
      [scope]
    );
    return rows.map(row => ({ id: row.id, kind: row.kind, grnId: row.grn_id === '' ? null : row.grn_id, customer: row.customer, startedAt: row.started_at, number: grNumberOf(row.state) }));
  } catch (error) {
    logger.warn('The unfinished forms could not be listed', loggableError(error));
    return [];
  }
}

/** The GRN number an edit form shows ("Changes to GRN 311"), read from the saved header. */
function grNumberOf(raw: string): string | null {
  try {
    const state: unknown = JSON.parse(raw);
    if (typeof state === 'object' && state !== null && 'header' in state) {
      const header: unknown = state.header;
      if (typeof header === 'object' && header !== null && 'gr_no' in header && typeof header.gr_no === 'string' && header.gr_no !== '') return header.gr_no;
    }
  } catch {
    return null;
  }
  return null;
}

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
      if (typeof entry === 'string') return fullFiles(entry);
      if (typeof entry === 'object' && entry !== null && 'file' in entry && typeof entry.file === 'string') return fullFiles(entry.file);
      return [];
    });
  } catch {
    return [];
  }
}
