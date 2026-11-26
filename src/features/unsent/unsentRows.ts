/**
 * Rows of the unsent-work file and the writes on them (WH-301, contract sections 1 and 3). The queue, the send engine and the
 * store all go through here; nothing else writes `items` or `item_photos`. Every write announces itself (`onUnsentChange`) so
 * the store reloads its snapshot.
 */
import { File } from 'expo-file-system';
import { createLogger, loggableError } from '@/utils/logger';
import { getUnsentDb, unsentPhotoDirectory, type SqlValue, type UnsentDb } from './unsentDb';

const logger = createLogger('[unsent]');

export type ItemState = 'saved' | 'sending' | 'sent' | 'refused' | 'waiting';

/**
 * The states of an item that is still unsent: the bar, the 2-hour clock and the account refusals count them. A refused item
 * and the items that depend on it are "held" and no longer count (Product's ruling and Design 4.6, 2026-11-26); they stay on
 * the phone, listed under "Held".
 */
export const UNSENT_STATES: readonly ItemState[] = ['saved', 'sending'];

export interface ItemRow {
  id: string;
  seq: number;
  scope: string;
  recorder_name: string;
  kind: string;
  request_key: string;
  body: string;
  depends_on: string | null;
  target_ref: string | null;
  what: string;
  customer: string | null;
  state: ItemState;
  attempts: number;
  first_sent_at: number | null;
  last_sent_at: number | null;
  last_error: string | null;
  recorded_at: number;
  recorded_tick: number;
  result: string | null;
  sent_day: string | null;
}

export interface PhotoRow {
  item_id: string;
  file: string;
  client_photo_id: string;
  role: string;
  line_ref: string | null;
  done: number;
  missing: number;
}

export interface NewItem {
  id: string;
  scope: string;
  recorderName: string;
  kind: string;
  requestKey: string;
  body: unknown;
  dependsOn?: string | undefined;
  targetRef?: unknown;
  what: string;
  customer?: string | undefined;
  recordedAt: number;
  recordedTick: number;
  photos: { file: string; clientPhotoId: string; role: string; lineRef?: string | undefined }[];
}

/** A listener list kept in a closure. */
function createEmitter() {
  const listeners = new Set<() => void | Promise<void>>();
  return {
    subscribe: (listener: () => void | Promise<void>): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: async (): Promise<void> => {
      for (const listener of [...listeners]) {
        try {
          await listener();
        } catch (error) {
          logger.warn('A listener of the unsent store failed', loggableError(error));
        }
      }
    },
  };
}
const changes = createEmitter();

/** Told after every write on the file; a write returns once its listeners have (the snapshot is then current). */
export const onUnsentChange = changes.subscribe;
export const announceUnsentChange = changes.emit;

const SEQ_KEY = 'seq_counter';

/**
 * Saves an item, its photo rows and its photo files as one step. A file is moved into the folder before the commit and moved
 * back when anything fails, so a failed save leaves no row and no moved file.
 */
export async function insertItem(db: UnsentDb, item: NewItem): Promise<void> {
  const moved: { from: string; to: string }[] = [];
  const photoRows: { uri: string; clientPhotoId: string; role: string; lineRef?: string | undefined }[] = [];
  try {
    if (item.photos.length > 0) unsentPhotoDirectory().create({ intermediates: true, idempotent: true });
    for (const photo of item.photos) {
      const source = new File(photo.file);
      const name = photo.file.slice(photo.file.lastIndexOf('/') + 1);
      const target = new File(unsentPhotoDirectory(), `${photo.clientPhotoId}-${name}`);
      await source.move(target);
      moved.push({ from: photo.file, to: target.uri });
      photoRows.push({ ...photo, uri: target.uri });
    }
    await db.transaction(async tx => {
      const [counter] = await tx.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [SEQ_KEY]);
      const [highest] = await tx.all<{ top: number | null }>('SELECT max(seq) AS top FROM items');
      const seq = Math.max(Number(counter?.value ?? 0), highest?.top ?? 0) + 1;
      await tx.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [SEQ_KEY, String(seq)]);
      await tx.run(
        `INSERT INTO items (id, seq, scope, recorder_name, kind, request_key, body, depends_on, target_ref, what, customer,
           state, attempts, recorded_at, recorded_tick) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved', 0, ?, ?)`,
        [
          item.id,
          seq,
          item.scope,
          item.recorderName,
          item.kind,
          item.requestKey,
          JSON.stringify(item.body ?? {}),
          item.dependsOn ?? null,
          item.targetRef === undefined ? null : JSON.stringify(item.targetRef),
          item.what,
          item.customer ?? null,
          item.recordedAt,
          item.recordedTick,
        ]
      );
      for (const photo of photoRows) {
        await tx.run(
          'INSERT INTO item_photos (item_id, file, client_photo_id, role, line_ref, done, missing) VALUES (?, ?, ?, ?, ?, 0, 0)',
          [item.id, photo.uri, photo.clientPhotoId, photo.role, photo.lineRef ?? null]
        );
      }
    });
  } catch (error) {
    for (const entry of moved) {
      try {
        await new File(entry.to).move(new File(entry.from));
      } catch {
        logger.warn('A photo file could not be put back after a failed save');
      }
    }
    throw error;
  }
  await announceUnsentChange();
}

export async function allItems(): Promise<ItemRow[]> {
  const db = await getUnsentDb();
  return db.all<ItemRow>('SELECT * FROM items ORDER BY seq');
}

export async function itemsOfScope(scope: string): Promise<ItemRow[]> {
  const db = await getUnsentDb();
  return db.all<ItemRow>('SELECT * FROM items WHERE scope = ? ORDER BY seq', [scope]);
}

export async function photosOf(itemId: string): Promise<PhotoRow[]> {
  const db = await getUnsentDb();
  return db.all<PhotoRow>('SELECT * FROM item_photos WHERE item_id = ? ORDER BY rowid', [itemId]);
}

export async function itemById(id: string): Promise<ItemRow | null> {
  const db = await getUnsentDb();
  const [row] = await db.all<ItemRow>('SELECT * FROM items WHERE id = ?', [id]);
  return row ?? null;
}

/** Changes columns of one item and announces it. */
export async function updateItem(id: string, fields: Record<string, SqlValue>): Promise<void> {
  const names = Object.keys(fields);
  if (names.length === 0) return;
  const db = await getUnsentDb();
  await db.run(`UPDATE items SET ${names.map(name => `${name} = ?`).join(', ')} WHERE id = ?`, [...names.map(name => fields[name] ?? null), id]);
  await announceUnsentChange();
}

export async function markPhoto(itemId: string, clientPhotoId: string, fields: { done?: 1; missing?: 1 }): Promise<void> {
  const db = await getUnsentDb();
  const names = Object.keys(fields);
  if (names.length === 0) return;
  await db.run(
    `UPDATE item_photos SET ${names.map(name => `${name} = 1`).join(', ')} WHERE item_id = ? AND client_photo_id = ?`,
    [itemId, clientPhotoId]
  );
  await announceUnsentChange();
}

/** Removes a photo file; a file already gone is not an error. */
export function removePhotoFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    logger.warn('A photo file could not be removed', loggableError(error));
  }
}

/**
 * Deletes the items `ids` (and the items that wait for them, to any depth) with their photo rows, and their photo files
 * after the rows are gone. Only rows of `scope` are touched.
 */
export async function deleteItems(scope: string, ids: string[]): Promise<void> {
  const db = await getUnsentDb();
  const files: string[] = [];
  await db.transaction(async tx => {
    const doomed = new Set<string>();
    let next = ids;
    while (next.length > 0) {
      const own = await tx.all<{ id: string }>(
        `SELECT id FROM items WHERE scope = ? AND id IN (${next.map(() => '?').join(', ')})`,
        [scope, ...next]
      );
      const fresh = own.map(row => row.id).filter(id => !doomed.has(id));
      for (const id of fresh) doomed.add(id);
      next = [];
      for (const id of fresh) {
        const dependants = await tx.all<{ id: string }>('SELECT id FROM items WHERE scope = ? AND depends_on = ?', [scope, id]);
        next.push(...dependants.map(row => row.id).filter(other => !doomed.has(other)));
      }
    }
    for (const id of doomed) {
      const photos = await tx.all<{ file: string }>('SELECT file FROM item_photos WHERE item_id = ?', [id]);
      files.push(...photos.map(photo => photo.file));
      await tx.run('DELETE FROM item_photos WHERE item_id = ?', [id]);
      await tx.run('DELETE FROM items WHERE id = ?', [id]);
    }
  });
  for (const uri of files) removePhotoFile(uri);
  await announceUnsentChange();
}

/**
 * Removes the "Sent" rows of an earlier day (Product: a sent item stays listed, with its number, until the end of that day).
 * A sent item that others still wait for is kept: they need its answer.
 */
export async function sweepSentRows(today: string): Promise<void> {
  const db = await getUnsentDb();
  const files: string[] = [];
  await db.transaction(async tx => {
    const old = await tx.all<{ id: string }>(
      `SELECT id FROM items WHERE state = 'sent' AND (sent_day IS NULL OR sent_day <> ?)
         AND NOT EXISTS (SELECT 1 FROM items d WHERE d.depends_on = items.id AND d.state <> 'sent')`,
      [today]
    );
    for (const { id } of old) {
      const photos = await tx.all<{ file: string }>('SELECT file FROM item_photos WHERE item_id = ?', [id]);
      files.push(...photos.map(photo => photo.file));
      await tx.run('DELETE FROM item_photos WHERE item_id = ?', [id]);
      await tx.run('DELETE FROM items WHERE id = ?', [id]);
    }
  });
  for (const uri of files) removePhotoFile(uri);
  await announceUnsentChange();
}

const LAST_SENT_KEY = 'last_sent_at';

/** When anything was last sent from this phone (ms), for "Last sent" on the Unsent items screen; null before the first. */
export async function getLastSentAt(): Promise<number | null> {
  const db = await getUnsentDb();
  const [row] = await db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [LAST_SENT_KEY]);
  const at = row ? Number(row.value) : NaN;
  return Number.isFinite(at) ? at : null;
}

export async function setLastSentAt(at: number): Promise<void> {
  const db = await getUnsentDb();
  await db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [LAST_SENT_KEY, String(at)]);
}
