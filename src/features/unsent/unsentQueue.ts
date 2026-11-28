/**
 * The queue of unsent work (WH-301, product/tech/app-offline-unsent-work.md sections 2 and 3): save an item, merge a change
 * into one that has not been tried, delete, list. Own items only, except `otherPeople`, which counts the others' for the
 * strip and never lists them. Sending is `sendEngine.ts`.
 */
import * as Crypto from 'expo-crypto';
import { businessDate } from '@/features/phone-copy/pgCompat';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { holdingOn } from '@/features/holding/handOver';
import { getUnsentDb } from './unsentDb';
import { allItems, announceUnsentChange, deleteItems, giveBackForm, insertItem, insertItems, itemById, itemsOfScope, photosOf, replaceItemWithPhotos, UNSENT_STATES, type ItemRow, type ItemState } from './unsentRows';
import { currentPersonName } from './unsentRole';
import { DEPENDS_ON_REFUSED, sendNow } from './sendEngine';
import { persistWorkClock, workNow } from './workClock';

export interface TargetRef {
  grnId?: string;
  lotIds?: string[];
  number?: string;
}

export interface EnqueueInput {
  kind: string;
  body: unknown;
  dependsOn?: string;
  targetRef?: TargetRef;
  what: string;
  customer?: string;
  photos?: { file: string; role: string; lineRef?: string }[];
}

export interface UnsentRowView {
  id: string;
  kind: string;
  state: ItemState;
  what: string;
  customer: string | null;
  recordedAt: number;
  /** "Not sent yet", "Held" (refused, with what depends on it) or "Sent today" (Design 4.2, 4.6). */
  section: 'unsent' | 'held' | 'sent';
  tag: 'refused' | null;
  /** The id the server gave the item when it holds it (WH-304), and whether a hand-over attempt has failed (Design 7.11). */
  heldId: string | null;
  handoverFailed: boolean;
  /** The item this one waits for or follows, if any. */
  dependsOn: string | null;
  /** Why a held item was not sent: the server's reason, or `dependsOnRefused` for what follows a refused item. */
  reason: string | null;
  /** The number the server gave, once sent. */
  result: unknown;
  /** The number of the record the item is about (a GRN's number, for its photos), as an identifier. */
  targetNumber: string | null;
  /** The record the item is about, when it already exists on the server (a tap opens it). */
  target: { grnId?: string };
  /** Which kind of document a photos item is for (its body's `doc`), or null for any other item. */
  photoDoc: 'grn' | null;
}

function photoDocOf(kind: string): UnsentRowView['photoDoc'] {
  return kind === 'photos' ? 'grn' : null;
}

async function ownScope(): Promise<string> {
  const scope = await getSessionCacheScope();
  if (!scope) throw new Error('No session: nothing can be saved');
  return scope;
}

/**
 * Saves an item for the signed-in person: the item, its photo rows and its photo files in one step. Its request ID is made
 * here once and never again. Throws without a session, and when the file cannot be written (nothing is kept then).
 */
export async function enqueue(input: EnqueueInput): Promise<{ id: string; requestKey: string }> {
  const scope = await ownScope();
  const db = await getUnsentDb();
  const id = Crypto.randomUUID();
  const requestKey = `warehouse-${input.kind}-${Crypto.randomUUID()}`;
  await insertItem(db, {
    id,
    scope,
    recorderName: currentPersonName(),
    kind: input.kind,
    requestKey,
    body: input.body,
    dependsOn: input.dependsOn,
    targetRef: input.targetRef,
    what: input.what,
    customer: input.customer,
    recordedAt: Date.now(),
    recordedTick: workNow(),
    photos: (input.photos ?? []).map(photo => ({ ...photo, clientPhotoId: Crypto.randomUUID() })),
  });
  // The clock is written with every save: a kill right after must not lose the time before it.
  await persistWorkClock(db).catch(() => undefined);
  // Sent at once while reachable (contract section 4); a pass that finds nothing to do ends at once.
  void sendNow('saved');
  return { id, requestKey };
}

/** An input of `enqueueAll`: a later input names an earlier one by its position (`dependsOn: 0`), as no id exists yet. */
export type EnqueueAllInput = Omit<EnqueueInput, 'dependsOn'> & { dependsOn?: number };

/**
 * Saves a record and the items that follow it (its photos) in one step, in input order, and removes the person's unfinished
 * form of `form.kind` in the same step, taking over its photo files (WH-161). A failure writes nothing and leaves the form.
 */
export async function enqueueAll(inputs: readonly EnqueueAllInput[], form?: { kind: 'grn' }): Promise<{ id: string; requestKey: string }[]> {
  const scope = await ownScope();
  const db = await getUnsentDb();
  const made = inputs.map(input => ({ id: Crypto.randomUUID(), requestKey: `warehouse-${input.kind}-${Crypto.randomUUID()}` }));
  const recordedAt = Date.now();
  const recordedTick = workNow();
  await insertItems(
    db,
    inputs.map((input, index) => {
      const earlier = input.dependsOn === undefined ? undefined : made[input.dependsOn];
      if (input.dependsOn !== undefined && (!earlier || input.dependsOn >= index)) throw new Error('An item can only wait for one before it');
      return {
        id: made[index]?.id ?? '',
        scope,
        recorderName: currentPersonName(),
        kind: input.kind,
        requestKey: made[index]?.requestKey ?? '',
        body: input.body,
        dependsOn: earlier?.id,
        targetRef: input.targetRef,
        what: input.what,
        customer: input.customer,
        recordedAt,
        recordedTick,
        photos: (input.photos ?? []).map(photo => ({ ...photo, clientPhotoId: Crypto.randomUUID() })),
      };
    }),
    form ? { scope, kind: form.kind } : undefined
  );
  await persistWorkClock(db).catch(() => undefined);
  void sendNow('saved');
  return made;
}

/**
 * Takes a saved record and its photos item back out and gives the person's unfinished form back, photo files included
 * (WH-161: a refusal during the Save wait is told on the form). One step; a failure throws and changes nothing.
 */
export async function returnToForm(itemId: string): Promise<void> {
  await giveBackForm(await getUnsentDb(), await ownScope(), itemId);
}

/**
 * Changes the body of an item that has not been tried yet. False once it has been (`attempts > 0`): its request is frozen
 * and the change becomes a new item that depends on it (the caller's). `what` is the row's new title, when the change makes
 * the old one wrong (WH-302); without it the title stays.
 */
export async function mergeInto(id: string, patch: (body: unknown) => unknown, what?: string): Promise<boolean> {
  const scope = await ownScope();
  const db = await getUnsentDb();
  let merged = false;
  await db.transaction(async tx => {
    const [row] = await tx.all<ItemRow>('SELECT * FROM items WHERE id = ? AND scope = ?', [id, scope]);
    if (!row || row.attempts > 0 || row.state !== 'saved') return;
    const next = patch(JSON.parse(row.body) as unknown);
    const done =
      what === undefined
        ? await tx.run('UPDATE items SET body = ? WHERE id = ? AND attempts = 0 AND state = ?', [JSON.stringify(next), id, 'saved'])
        : await tx.run('UPDATE items SET body = ?, what = ? WHERE id = ? AND attempts = 0 AND state = ?', [JSON.stringify(next), what, id, 'saved']);
    merged = done.changes > 0;
  });
  if (merged) await announceUnsentChange();
  return merged;
}

/**
 * Puts a refused item back to a waiting one (WH-302 PQ7): the body and title it had before the newer save was merged in,
 * not tried, no error, with a new request ID, and the items that went with it (refused only because it was) waiting again. One transaction.
 * False when the item is not a refused one of this person.
 */
export async function reviveItem(id: string, body: unknown, what: string): Promise<boolean> {
  const scope = await ownScope();
  const db = await getUnsentDb();
  let revived = false;
  await db.transaction(async tx => {
    const [row] = await tx.all<ItemRow>('SELECT * FROM items WHERE id = ? AND scope = ?', [id, scope]);
    if (row?.state !== 'refused') return;
    // A new request ID, made as a new item's is: the refused send may have left an answer under the old one, and the
    // earlier change never reached the server (a merge only happens at attempts 0). Dependants follow by `depends_on` (the id).
    const requestKey = `warehouse-${row.kind}-${Crypto.randomUUID()}`;
    await tx.run(
      'UPDATE items SET body = ?, what = ?, request_key = ?, state = ?, attempts = 0, first_sent_at = NULL, last_sent_at = NULL, last_error = NULL, result = NULL WHERE id = ?',
      [JSON.stringify(body), what, requestKey, 'saved', id]
    );
    // The items that waited for it were refused only for that: they wait again (any depth, as the engine marked them).
    let next = [id];
    while (next.length > 0) {
      const found: string[] = [];
      for (const parent of next) {
        const rows = await tx.all<{ id: string }>('SELECT id FROM items WHERE scope = ? AND depends_on = ? AND state = ? AND last_error = ?', [scope, parent, 'refused', DEPENDS_ON_REFUSED]);
        for (const dependant of rows) {
          await tx.run('UPDATE items SET state = ?, last_error = NULL WHERE id = ?', ['saved', dependant.id]);
          found.push(dependant.id);
        }
      }
      next = found;
    }
    revived = true;
  });
  if (revived) await announceUnsentChange();
  return revived;
}

function targetNumberOf(raw: string | null): string | null {
  if (raw === null) return null;
  const { number } = JSON.parse(raw) as TargetRef;
  return typeof number === 'string' ? number : null;
}

function targetOf(raw: string | null): UnsentRowView['target'] {
  if (raw === null) return {};
  const { grnId } = JSON.parse(raw) as TargetRef;
  return grnId === undefined ? {} : { grnId };
}

/**
 * Replaces a waiting item's body and photos in place, keeping its id and request key (WH-161 §8).
 * Returns false once the item is sending or has been attempted.
 */
export async function replaceItem(
  id: string,
  next: {
    body: unknown;
    targetRef?: TargetRef;
    what: string;
    customer?: string;
    photos: { file: string; role: string; lineRef?: string }[];
    photoDoc: 'grn';
    photoWhat: string;
    formGrnId?: string;
  }
): Promise<boolean> {
  const scope = await ownScope();
  const db = await getUnsentDb();
  const ok = await replaceItemWithPhotos(db, scope, id, {
    body: next.body,
    targetRef: next.targetRef,
    what: next.what,
    customer: next.customer,
    photos: next.photos.map(photo => ({ ...photo, clientPhotoId: Crypto.randomUUID() })),
    photoDoc: next.photoDoc,
    photoWhat: next.photoWhat,
    newPhotosItemId: Crypto.randomUUID(),
    newPhotosRequestKey: Crypto.randomUUID(),
    formGrnId: next.formGrnId,
  });
  if (ok) void sendNow('saved');
  return ok;
}

/** Deletes one of the signed-in person's items, the items that wait for it and their photo files. */
export async function deleteItem(id: string): Promise<void> {
  await deleteItems(await ownScope(), [id]);
}

/**
 * Deletes an item for an undo (WH-387): only while it is still `saved` with no attempt, decided in the same transaction as the
 * delete. False when it was not deleted (sending has begun, or it is gone); the undo is then a new change.
 */
export async function deleteUntriedItem(id: string): Promise<boolean> {
  return deleteItems(await ownScope(), [id], true);
}

/**
 * The section of a row (Design 4.2, 4.6, 7.9). Sent rows are "Sent today"; a row the server holds is "Held"; a refused row is
 * "Held" too, except while its hand-over is still to come and the holding list is on (Product PQ1: it is "Not sent yet", counted,
 * until the server holds it).
 */
function sectionOf(row: ItemRow, handingOver: boolean): UnsentRowView['section'] {
  if (row.state === 'sent') return 'sent';
  if (row.state === 'held') return 'held';
  if (row.state === 'refused') return handingOver && (row.held_id ?? null) === null ? 'unsent' : 'held';
  return 'unsent';
}

/** The signed-in person's items, oldest first. Another person's are never listed. */
export async function listItems(): Promise<UnsentRowView[]> {
  const scope = await getSessionCacheScope();
  if (!scope) return [];
  const today = businessDate(Date.now());
  const handingOver = holdingOn();
  return (await itemsOfScope(scope))
    .filter(row => row.state !== 'sent' || row.sent_day === today)
    .map(row => ({
      id: row.id,
      kind: row.kind,
      state: row.state,
      what: row.what,
      customer: row.customer,
      recordedAt: row.recorded_at,
      section: sectionOf(row, handingOver),
      dependsOn: row.depends_on,
      reason: row.last_error,
      tag: row.state === 'refused' || row.state === 'held' ? ('refused' as const) : null,
      heldId: row.held_id ?? null,
      handoverFailed: row.handover_failed === 1,
      result: row.result === null ? null : (JSON.parse(row.result) as unknown),
      targetNumber: targetNumberOf(row.target_ref),
      target: targetOf(row.target_ref),
      photoDoc: photoDocOf(row.kind),
    }));
}

/** Other people's unsent items on this phone for this facility: their name and how many, nothing more (spec step 27). */
export async function otherPeople(): Promise<{ name: string; count: number }[]> {
  return (await otherPeopleBySubject()).map(({ name, count }) => ({ name, count }));
}

/** The same people with the subject each is kept under, for an administrator's "Move to the holding list" (WH-304). */
export async function otherPeopleBySubject(): Promise<{ subject: string; name: string; count: number }[]> {
  const scope = await getSessionCacheScope();
  if (!scope) return [];
  const [origin, instance, subject] = JSON.parse(scope) as [string, string, string];
  const people = new Map<string, { subject: string; name: string; count: number }>();
  for (const row of await allItems()) {
    if (!UNSENT_STATES.includes(row.state)) continue;
    const [rowOrigin, rowInstance, rowSubject] = JSON.parse(row.scope) as [string, string, string];
    if (rowOrigin !== origin || rowInstance !== instance || rowSubject === subject) continue;
    const person = people.get(rowSubject) ?? { subject: rowSubject, name: row.recorder_name, count: 0 };
    person.count += 1;
    people.set(rowSubject, person);
  }
  return [...people.values()];
}

/** The photo rows of an item (the screen's "photo missing" line and the photos kind read them). */
export const photosOfItem = photosOf;
export { itemById };
