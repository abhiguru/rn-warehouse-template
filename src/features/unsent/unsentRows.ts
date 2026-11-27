/**
 * Rows of the unsent-work file and the writes on them (WH-301, contract sections 1 and 3). The queue, the send engine and the
 * store all go through here; nothing else writes `items` or `item_photos`. Every write announces itself (`onUnsentChange`) so
 * the store reloads its snapshot.
 */
import { File } from 'expo-file-system';
import { createLogger, loggableError } from '@/utils/logger';
import { fileOfStored, formTextFromStored, formTextToStored, toStored } from './storedPath';
import { getUnsentDb, unsentPhotoDirectory, type SqlValue, type UnsentDb } from './unsentDb';

/** A photo row as read: its `file` is the full current address, whatever way it was stored (see storedPath.ts). */
const readPhoto = <T extends { file: string }>(row: T): T => ({ ...row, file: fileOfStored(row.file) });

const logger = createLogger('[unsent]');

export type ItemState = 'saved' | 'sending' | 'sent' | 'refused' | 'waiting' | 'held';

/**
 * The states of an item that is still unsent: the bar, the 2-hour clock and the account refusals count them. A refused item
 * and the items that depend on it still count until the server holds them (Product's sharpened ruling, 2026-11-26); `held`
 * (WH-304: the server holds the item) is left out, and with it the bar, the clock and the account refusals.
 */
export const UNSENT_STATES: readonly ItemState[] = ['saved', 'sending', 'refused'];

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
  /** The unfinished form a saved new record came from (WH-161), as JSON; phone only, never sent. */
  form_row?: string | null;
  /** The id the server gave the item when it holds it (WH-304); null until then. A `refused` photos row may have one while its files go up. */
  held_id?: string | null;
  /** 1 once a hand-over attempt did not end held (WH-304, Design 7.11); the row then reads "Not passed on". */
  handover_failed?: number;
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
  await insertItems(db, [item]);
}

/** Moves files back after a failed step; a file that cannot be moved back is logged, never thrown. */
async function moveBack(moved: readonly { from: string; to: string }[]): Promise<void> {
  for (const entry of moved) {
    try {
      await new File(entry.to).move(new File(entry.from));
    } catch {
      logger.warn('A photo file could not be put back after a failed save');
    }
  }
}

/**
 * Saves several items, their photo rows and photo files as one step (WH-161). `form` names the unfinished form the items came
 * from: its row is removed in the same step and kept as JSON on the first item (`form_row`, phone only), so `returnToForm` can
 * give it back; the form's own photo files that were not taken over are removed after the commit. A failure writes nothing,
 * leaves the form row and puts every moved file back.
 */
export async function insertItems(db: UnsentDb, items: readonly NewItem[], form?: { scope: string; kind: string }): Promise<void> {
  const moved: { from: string; to: string }[] = [];
  const rowsOf = new Map<string, { uri: string; clientPhotoId: string; role: string; lineRef?: string | undefined }[]>();
  let leftovers: string[] = [];
  try {
    if (items.some(item => item.photos.length > 0)) unsentPhotoDirectory().create({ intermediates: true, idempotent: true });
    for (const item of items) {
      const photoRows: { uri: string; clientPhotoId: string; role: string; lineRef?: string | undefined }[] = [];
      for (const photo of item.photos) {
        const source = new File(photo.file);
        if (!source.exists) throw new Error('A photo file is not on the phone any more');
        const name = photo.file.slice(photo.file.lastIndexOf('/') + 1);
        const target = new File(unsentPhotoDirectory(), `${photo.clientPhotoId}-${name}`);
        await source.move(target);
        moved.push({ from: photo.file, to: target.uri });
        photoRows.push({ ...photo, uri: target.uri });
      }
      rowsOf.set(item.id, photoRows);
    }
    await db.transaction(async tx => {
      const [counter] = await tx.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [SEQ_KEY]);
      const [highest] = await tx.all<{ top: number | null }>('SELECT max(seq) AS top FROM items');
      let seq = Math.max(Number(counter?.value ?? 0), highest?.top ?? 0);
      for (const item of items) {
        seq += 1;
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
        for (const photo of rowsOf.get(item.id) ?? []) {
          await tx.run(
            'INSERT INTO item_photos (item_id, file, client_photo_id, role, line_ref, done, missing) VALUES (?, ?, ?, ?, ?, 0, 0)',
            [item.id, toStored(photo.uri), photo.clientPhotoId, photo.role, photo.lineRef ?? null]
          );
        }
      }
      await tx.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [SEQ_KEY, String(seq)]);
      const first = items[0];
      if (form && first) {
        const [row] = await tx.all<Record<string, SqlValue>>('SELECT * FROM forms WHERE scope = ? AND kind = ? AND grn_id = ?', [form.scope, form.kind, '']);
        await tx.run('UPDATE items SET form_row = ? WHERE id = ?', [JSON.stringify({ ...(row ?? {}), hadForm: row !== undefined, taken: moved.map(entry => ({ from: entry.from, to: toStored(entry.to) })) }), first.id]);
        if (row) {
          await tx.run('DELETE FROM forms WHERE id = ?', [String(row.id)]);
          leftovers = formFiles(row.photos);
        }
      }
    });
  } catch (error) {
    await moveBack(moved);
    throw error;
  }
  for (const uri of leftovers) removePhotoFile(uri);
  await announceUnsentChange();
}

/** The photo files a `forms.photos` column names. */
function formFiles(raw: SqlValue | undefined): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.flatMap(entry => (typeof entry === 'string' && fileOfStored(entry) !== '' ? [fileOfStored(entry)] : [])) : [];
  } catch {
    return [];
  }
}

/**
 * Takes the record item `recordId` and its dependants back out of the queue and puts the unfinished form back (WH-161): the
 * forms row from `form_row`, its state with the photo addresses now pointing at the photo files, which are moved back to the form's
 * folder names. One step; a failure changes nothing (the files are moved back).
 */
export async function giveBackForm(db: UnsentDb, scope: string, recordId: string): Promise<void> {
  const moved: { from: string; to: string }[] = [];
  try {
    const [record] = await db.all<{ id: string; form_row: string | null }>('SELECT id, form_row FROM items WHERE id = ? AND scope = ?', [recordId, scope]);
    if (!record) throw new Error('The saved item is not there any more');
    if (record.form_row === null) throw new Error('The saved item has no form to give back');
    const form = JSON.parse(record.form_row) as Record<string, SqlValue> & { taken?: { from: string; to: string }[]; hadForm?: boolean };
    const dependants = await db.all<{ id: string }>('SELECT id FROM items WHERE scope = ? AND depends_on = ?', [scope, recordId]);
    const ids = [recordId, ...dependants.map(row => row.id)];
    const photos = (await db.all<PhotoRow & { item_id: string }>(`SELECT * FROM item_photos WHERE item_id IN (${ids.map(() => '?').join(', ')}) ORDER BY rowid`, ids)).map(readPhoto);
    const taken = form.taken?.map(entry => ({ from: entry.from, to: fileOfStored(entry.to) }));
    unsentPhotoDirectory().create({ intermediates: true, idempotent: true });
    let state = typeof form.state === 'string' ? formTextFromStored(form.state) : '{}';
    const back: string[] = [];
    for (const photo of photos) {
      const name = photo.file.slice(photo.file.lastIndexOf('/') + 1).replace(/^[0-9a-f-]{36}-/, '');
      const origin = taken?.find(entry => entry.to === photo.file)?.from;
      // No form was saved for it: the photo goes back where it came from.
      const target = !form.hadForm && origin ? new File(origin) : new File(unsentPhotoDirectory(), `form-${name}`);
      const source = new File(photo.file);
      if (!source.exists) continue;
      await source.move(target);
      moved.push({ from: photo.file, to: target.uri });
      back.push(target.uri);
      // The cache file the form first named is no longer there: the form names the moved file instead.
      const first = taken?.find(entry => entry.to === photo.file);
      if (first) state = state.split(first.from).join(target.uri);
    }
    await db.transaction(async tx => {
      if (form.hadForm) {
        await tx.run('DELETE FROM forms WHERE scope = ? AND kind = ? AND grn_id = ?', [scope, String(form.kind), String(form.grn_id ?? '')]);
        await tx.run('INSERT INTO forms (id, scope, kind, grn_id, state, photos, customer, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          String(form.id),
          scope,
          String(form.kind),
          String(form.grn_id ?? ''),
          formTextToStored(state),
          JSON.stringify(back.map(toStored)),
          typeof form.customer === 'string' ? form.customer : null,
          Number(form.started_at ?? Date.now()),
          Date.now(),
        ]);
      }
      for (const id of ids) {
        await tx.run('DELETE FROM item_photos WHERE item_id = ?', [id]);
        await tx.run('DELETE FROM items WHERE id = ?', [id]);
      }
    });
  } catch (error) {
    await moveBack(moved);
    throw error;
  }
  await announceUnsentChange();
}

export interface ReplaceItemInput {
  body: unknown;
  targetRef?: unknown;
  what: string;
  customer?: string | undefined;
  /** The replacement photos item's details; an empty `photos` array removes any dependent photos item. */
  photos: { file: string; clientPhotoId: string; role: string; lineRef?: string | undefined }[];
  photoDoc: 'grn' | 'dispatch';
  photoWhat: string;
  newPhotosItemId: string;
  newPhotosRequestKey: string;
  /** Unfinished `grnEdit` form id to clear in the same step, when present. */
  formGrnId?: string;
}

/**
 * Replaces the body and photo rows of an unsent record item that has not been attempted yet (`state = 'saved'`, `attempts = 0`),
 * keeping the same `id` and `request_key` (WH-161 §8). Photos already kept in the unsent folder stay where they are; new files
 * are moved in before the commit (and moved back if anything fails or the item started sending meanwhile); removed old files are
 * deleted after the commit. Returns false when the item is gone, sending, or already attempted.
 */
export async function replaceItemWithPhotos(db: UnsentDb, scope: string, itemId: string, next: ReplaceItemInput): Promise<boolean> {
  const [current] = await db.all<ItemRow>('SELECT * FROM items WHERE id = ? AND scope = ?', [itemId, scope]);
  if (current?.state !== 'saved' || current.attempts > 0) return false;
  const [existingPhotosItem] = await db.all<ItemRow>(
    "SELECT * FROM items WHERE scope = ? AND depends_on = ? AND kind = 'photos' ORDER BY seq LIMIT 1",
    [scope, itemId]
  );
  const existingPhotos = existingPhotosItem
    ? (await db.all<PhotoRow>('SELECT * FROM item_photos WHERE item_id = ? ORDER BY rowid', [existingPhotosItem.id])).map(readPhoto)
    : [];
  const existingByFile = new Map(existingPhotos.map(photo => [photo.file, photo]));

  const moved: { from: string; to: string }[] = [];
  const prepared: { uri: string; clientPhotoId: string; role: string; lineRef?: string | undefined }[] = [];
  let replaced = false;
  let removedFormFiles: string[] = [];

  try {
    if (next.photos.some(photo => !existingByFile.has(photo.file))) {
      unsentPhotoDirectory().create({ intermediates: true, idempotent: true });
    }
    for (const photo of next.photos) {
      const kept = existingByFile.get(photo.file);
      if (kept) {
        prepared.push({ uri: kept.file, clientPhotoId: kept.client_photo_id, role: photo.role, lineRef: photo.lineRef });
        continue;
      }
      const source = new File(photo.file);
      if (!source.exists) throw new Error('A photo file is not on the phone any more');
      const name = photo.file.slice(photo.file.lastIndexOf('/') + 1);
      const target = new File(unsentPhotoDirectory(), `${photo.clientPhotoId}-${name}`);
      await source.move(target);
      moved.push({ from: photo.file, to: target.uri });
      prepared.push({ uri: target.uri, clientPhotoId: photo.clientPhotoId, role: photo.role, lineRef: photo.lineRef });
    }

    await db.transaction(async tx => {
      const [row] = await tx.all<ItemRow>('SELECT * FROM items WHERE id = ? AND scope = ?', [itemId, scope]);
      if (row?.state !== 'saved' || row.attempts > 0) return;
      const done = await tx.run(
        `UPDATE items SET body = ?, target_ref = ?, what = ?, customer = ? WHERE id = ? AND scope = ? AND state = 'saved' AND attempts = 0`,
        [
          JSON.stringify(next.body ?? {}),
          next.targetRef === undefined ? null : JSON.stringify(next.targetRef),
          next.what,
          next.customer ?? null,
          itemId,
          scope,
        ]
      );
      if (done.changes === 0) return;

      const [dep] = await tx.all<ItemRow>(
        "SELECT * FROM items WHERE scope = ? AND depends_on = ? AND kind = 'photos' ORDER BY seq LIMIT 1",
        [scope, itemId]
      );
      if (prepared.length === 0) {
        if (dep) {
          await tx.run('DELETE FROM item_photos WHERE item_id = ?', [dep.id]);
          await tx.run('DELETE FROM items WHERE id = ?', [dep.id]);
        }
      } else if (dep) {
        await tx.run('UPDATE items SET what = ?, customer = ? WHERE id = ?', [next.photoWhat, next.customer ?? null, dep.id]);
        await tx.run('DELETE FROM item_photos WHERE item_id = ?', [dep.id]);
        for (const photo of prepared) {
          await tx.run(
            'INSERT INTO item_photos (item_id, file, client_photo_id, role, line_ref, done, missing) VALUES (?, ?, ?, ?, ?, 0, 0)',
            [dep.id, toStored(photo.uri), photo.clientPhotoId, photo.role, photo.lineRef ?? null]
          );
        }
      } else {
        const [counter] = await tx.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [SEQ_KEY]);
        const [highest] = await tx.all<{ top: number | null }>('SELECT max(seq) AS top FROM items');
        const seq = Math.max(Number(counter?.value ?? 0), highest?.top ?? 0) + 1;
        await tx.run(
          `INSERT INTO items (id, seq, scope, recorder_name, kind, request_key, body, depends_on, target_ref, what, customer,
             state, attempts, recorded_at, recorded_tick) VALUES (?, ?, ?, ?, 'photos', ?, ?, ?, NULL, ?, ?, 'saved', 0, ?, ?)`,
          [
            next.newPhotosItemId,
            seq,
            scope,
            row.recorder_name,
            next.newPhotosRequestKey,
            JSON.stringify({ doc: next.photoDoc }),
            itemId,
            next.photoWhat,
            next.customer ?? null,
            row.recorded_at,
            row.recorded_tick,
          ]
        );
        await tx.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [SEQ_KEY, String(seq)]);
        for (const photo of prepared) {
          await tx.run(
            'INSERT INTO item_photos (item_id, file, client_photo_id, role, line_ref, done, missing) VALUES (?, ?, ?, ?, ?, 0, 0)',
            [next.newPhotosItemId, toStored(photo.uri), photo.clientPhotoId, photo.role, photo.lineRef ?? null]
          );
        }
      }

      if (next.formGrnId !== undefined) {
        const [formRow] = await tx.all<Record<string, SqlValue>>(
          "SELECT * FROM forms WHERE scope = ? AND kind = 'grnEdit' AND grn_id = ?",
          [scope, next.formGrnId]
        );
        if (formRow) {
          await tx.run('DELETE FROM forms WHERE id = ?', [String(formRow.id)]);
          removedFormFiles = formFiles(formRow.photos);
        }
      }
      replaced = true;
    });
  } catch (error) {
    await moveBack(moved);
    throw error;
  }

  if (!replaced) {
    await moveBack(moved);
    return false;
  }
  const keptUris = new Set(prepared.map(photo => photo.uri));
  for (const old of existingPhotos) {
    if (!keptUris.has(old.file)) removePhotoFile(old.file);
  }
  for (const uri of removedFormFiles) {
    if (!keptUris.has(uri)) removePhotoFile(uri);
  }
  await announceUnsentChange();
  return true;
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
  return (await db.all<PhotoRow>('SELECT * FROM item_photos WHERE item_id = ? ORDER BY rowid', [itemId])).map(readPhoto);
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
    if (uri === '') return;
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
      // A row the server holds is never deleted here (WH-304): it is already on the server, with its own outcome.
      const own = await tx.all<{ id: string }>(
        `SELECT id FROM items WHERE scope = ? AND state <> 'held' AND id IN (${next.map(() => '?').join(', ')})`,
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
      files.push(...photos.map(photo => fileOfStored(photo.file)));
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
      files.push(...photos.map(photo => fileOfStored(photo.file)));
      await tx.run('DELETE FROM item_photos WHERE item_id = ?', [id]);
      await tx.run('DELETE FROM items WHERE id = ?', [id]);
    }
  });
  for (const uri of files) removePhotoFile(uri);
  await announceUnsentChange();
}

/**
 * Removes the rows the server holds and the copy has the row of (WH-304: "a held row leaves the phone at the first sync run that
 * ends after its hand-over and whose copy holds its `held_items` row"). A photos row that still has files to send is not a held
 * row (it stays `refused`), so it is never removed here.
 */
export async function sweepHeldRows(heldIds: readonly string[]): Promise<void> {
  if (heldIds.length === 0) return;
  const db = await getUnsentDb();
  const files: string[] = [];
  let removed = 0;
  await db.transaction(async tx => {
    const marks = heldIds.map(() => '?').join(', ');
    const rows = await tx.all<{ id: string }>(`SELECT id FROM items WHERE state = 'held' AND held_id IN (${marks})`, [...heldIds]);
    for (const { id } of rows) {
      const photos = await tx.all<{ file: string }>('SELECT file FROM item_photos WHERE item_id = ?', [id]);
      files.push(...photos.map(photo => fileOfStored(photo.file)));
      await tx.run('DELETE FROM item_photos WHERE item_id = ?', [id]);
      await tx.run('DELETE FROM items WHERE id = ?', [id]);
      removed += 1;
    }
  });
  for (const uri of files) removePhotoFile(uri);
  if (removed > 0) await announceUnsentChange();
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
