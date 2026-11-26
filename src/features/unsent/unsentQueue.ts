/**
 * The queue of unsent work (WH-301, product/tech/app-offline-unsent-work.md sections 2 and 3): save an item, merge a change
 * into one that has not been tried, delete, list. Own items only, except `otherPeople`, which counts the others' for the
 * strip and never lists them. Sending is `sendEngine.ts`.
 */
import * as Crypto from 'expo-crypto';
import { businessDate } from '@/features/phone-copy/pgCompat';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { getUnsentDb } from './unsentDb';
import { allItems, announceUnsentChange, deleteItems, insertItem, itemById, itemsOfScope, photosOf, UNSENT_STATES, type ItemRow, type ItemState } from './unsentRows';
import { currentPersonName } from './unsentRole';
import { sendNow } from './sendEngine';
import { persistWorkClock, workNow } from './workClock';

export interface TargetRef {
  grnId?: string;
  lotIds?: string[];
  dispatchId?: string;
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
  /** "Not sent yet" or "Sent today" (Design 4.2). */
  section: 'unsent' | 'sent';
  tag: 'refused' | null;
  /** The number the server gave, once sent. */
  result: unknown;
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

/**
 * Changes the body of an item that has not been tried yet. False once it has been (`attempts > 0`): its request is frozen
 * and the change becomes a new item that depends on it (the caller's).
 */
export async function mergeInto(id: string, patch: (body: unknown) => unknown): Promise<boolean> {
  const scope = await ownScope();
  const db = await getUnsentDb();
  let merged = false;
  await db.transaction(async tx => {
    const [row] = await tx.all<ItemRow>('SELECT * FROM items WHERE id = ? AND scope = ?', [id, scope]);
    if (!row || row.attempts > 0 || row.state !== 'saved') return;
    const next = patch(JSON.parse(row.body) as unknown);
    const done = await tx.run('UPDATE items SET body = ? WHERE id = ? AND attempts = 0 AND state = ?', [JSON.stringify(next), id, 'saved']);
    merged = done.changes > 0;
  });
  if (merged) await announceUnsentChange();
  return merged;
}

/** Deletes one of the signed-in person's items, the items that wait for it and their photo files. */
export async function deleteItem(id: string): Promise<void> {
  await deleteItems(await ownScope(), [id]);
}

/** The signed-in person's items, oldest first. Another person's are never listed. */
export async function listItems(): Promise<UnsentRowView[]> {
  const scope = await getSessionCacheScope();
  if (!scope) return [];
  const today = businessDate(Date.now());
  return (await itemsOfScope(scope))
    .filter(row => row.state !== 'sent' || row.sent_day === today)
    .map(row => ({
      id: row.id,
      kind: row.kind,
      state: row.state,
      what: row.what,
      customer: row.customer,
      recordedAt: row.recorded_at,
      section: row.state === 'sent' ? ('sent' as const) : ('unsent' as const),
      tag: row.state === 'refused' ? ('refused' as const) : null,
      result: row.result === null ? null : (JSON.parse(row.result) as unknown),
    }));
}

/** Other people's unsent items on this phone for this facility: their name and how many, nothing more (spec step 27). */
export async function otherPeople(): Promise<{ name: string; count: number }[]> {
  const scope = await getSessionCacheScope();
  if (!scope) return [];
  const [origin, instance, subject] = JSON.parse(scope) as [string, string, string];
  const people = new Map<string, { name: string; count: number }>();
  for (const row of await allItems()) {
    if (!UNSENT_STATES.includes(row.state)) continue;
    const [rowOrigin, rowInstance, rowSubject] = JSON.parse(row.scope) as [string, string, string];
    if (rowOrigin !== origin || rowInstance !== instance || rowSubject === subject) continue;
    const person = people.get(rowSubject) ?? { name: row.recorder_name, count: 0 };
    person.count += 1;
    people.set(rowSubject, person);
  }
  return [...people.values()];
}

/** The photo rows of an item (the screen's "photo missing" line and the photos kind read them). */
export const photosOfItem = photosOf;
export { itemById };
