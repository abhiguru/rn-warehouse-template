/**
 * The held items this phone's copy holds (WH-304, product/tech/app-offline-holding-list.md 4, 5.3, 11.7, 12.4).
 *
 * The copy's `held_items` rows are read into memory when a sync run ends (and when a readable copy is first asked), so the
 * stock overlay, the status bar and the "Unsent items" list can read them without waiting. Whose row it is is told by its
 * shape: only the recorder's own rows carry `body`; a manager's and a staff member's carry the state and the bags of a held
 * dispatch only. An outcome the recorder opened is hidden at once; the server is told now, or at the next sync when offline.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { currentCopy } from '@/features/phone-copy/copyDb';
import { businessDate } from '@/features/phone-copy/pgCompat';
import { isCopyOffline, isCopyReadable, subscribeSyncRunEnd } from '@/features/phone-copy/syncEngine';
import { getUnsentDb } from '@/features/unsent/unsentDb';
import { sweepHeldRows } from '@/features/unsent/unsentRows';
import { createLogger, loggableError } from '@/utils/logger';

const logger = createLogger('[held-rows]');

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** One row of the copy's `held_items`, with the members every reader's shape has read out. */
export interface HeldCopyRow {
  id: string;
  kind: string;
  state: string;
  needsDecision: boolean;
  /** The recorder's own row (it carries `body`). */
  own: boolean;
  raw: Fields;
}

const state = {
  rows: [] as HeldCopyRow[],
  /** The copy handle the rows were read from, so a new copy is read again. */
  readFrom: null as unknown,
  reading: null as Promise<void> | null,
  /** Outcomes the person opened on this phone, hidden at once. */
  seen: new Set<string>(),
  listeners: new Set<() => void>(),
};

const SEEN_KEY = 'held_seen';
const NO_ROWS: readonly HeldCopyRow[] = [];

function rowOf(raw: unknown): HeldCopyRow | null {
  if (!isFields(raw) || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    kind: textOf(raw.kind) ?? '',
    state: textOf(raw.state) ?? '',
    needsDecision: raw.needs_decision === true,
    own: isFields(raw.body),
    raw,
  };
}

/** Reads the copy's rows into memory. A copy that cannot be read gives none. */
export async function refreshHeldRows(): Promise<void> {
  const db = currentCopy();
  let rows: HeldCopyRow[] = [];
  if (db && isCopyReadable()) {
    try {
      const found = await db.all<{ row: string }>('SELECT row FROM held_items ORDER BY id');
      rows = found.flatMap(entry => {
        const row = rowOf(JSON.parse(entry.row) as unknown);
        // A dispatch is made online only (WH-381): a held dispatch from before is neither counted nor listed on the phone.
        return row && row.kind !== 'newDispatch' ? [row] : [];
      });
    } catch (error) {
      logger.warn('The held items could not be read from the copy', loggableError(error));
    }
  }
  state.rows = rows;
  state.readFrom = db;
  for (const listener of [...state.listeners]) listener();
}

/** Every held row of the copy, as of the last read; a readable copy not read yet is read in the background. */
export function heldCopyRows(): readonly HeldCopyRow[] {
  if (!isCopyReadable()) return NO_ROWS;
  if (state.readFrom !== currentCopy() && state.reading === null) {
    state.reading = refreshHeldRows().finally(() => {
      state.reading = null;
    });
  }
  return state.rows;
}

/** Tells `listener` whenever the rows are read again. */
export function subscribeHeldRows(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

/** The recorder's own rows still to show: held, a rejection not opened yet, an acceptance of today. */
export function ownHeldCopyRows(): HeldCopyRow[] {
  const today = businessDate(Date.now());
  return heldCopyRows().filter(row => {
    if (!row.own || state.seen.has(row.id)) return false;
    if (row.state === 'held') return true;
    if (row.state === 'rejected') return row.raw.seen_at === null || row.raw.seen_at === undefined;
    if (row.state !== 'accepted') return false;
    const decided = textOf(row.raw.decided_at);
    return decided !== null && businessDate(decided) === today;
  });
}

/** The recorder's own decided (accepted or rejected) photos items that follow `parentId`: opening the parent clears them too (WH-414, the `countEntries` parent rule). */
export function decidedFollowerIds(parentId: string): string[] {
  return heldCopyRows()
    .filter(row => row.own && row.kind === 'photos' && (row.state === 'rejected' || row.state === 'accepted') && row.raw.follows === parentId)
    .map(row => row.id);
}

/** Held dispatches to decide, for a manager's strip (the decision of a photos item that follows another is not counted). */
export function heldNeedingDecision(): number {
  return heldCopyRows().filter(row => row.state === 'held' && row.needsDecision).length;
}

async function readSeenMeta(): Promise<string[]> {
  const db = await getUnsentDb();
  const [row] = await db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [SEEN_KEY]);
  if (!row) return [];
  try {
    const list: unknown = JSON.parse(row.value);
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function writeSeenMeta(ids: readonly string[]): Promise<void> {
  const db = await getUnsentDb();
  if (ids.length === 0) await db.run('DELETE FROM meta WHERE key = ?', [SEEN_KEY]);
  else await db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [SEEN_KEY, JSON.stringify(ids)]);
}

/** Tells the server the person has seen an outcome; true when it took it (a repeat counts). */
async function tellSeen(id: string): Promise<boolean> {
  try {
    const client = await getAuthenticatedClient();
    const answer = (await client.rpc('mark_held_item_seen', { p_id: id })) as { data: unknown; error: unknown };
    return answer.error === null || answer.error === undefined ? isFields(answer.data) && answer.data.success === true : false;
  } catch {
    return false;
  }
}

/**
 * The person opened an outcome (a rejection): it is hidden on this phone at once, and the server is told now; offline, the id
 * is kept in the unsent file (`meta` key `held_seen`) and told at the end of the next sync run.
 */
export async function markHeldSeen(heldId: string, followerIds: readonly string[] = []): Promise<void> {
  const ids = [heldId, ...followerIds];
  for (const id of ids) state.seen.add(id);
  for (const listener of [...state.listeners]) listener();
  const untold: string[] = [];
  for (const id of ids) {
    if (isCopyOffline() || !(await tellSeen(id))) untold.push(id);
  }
  if (untold.length === 0) return;
  try {
    const kept = await readSeenMeta();
    const add = untold.filter(id => !kept.includes(id));
    if (add.length > 0) await writeSeenMeta([...kept, ...add]);
  } catch (error) {
    logger.warn('An opened outcome could not be kept for later', loggableError(error));
  }
}

/** Tells the server every outcome opened while offline; each one told leaves the list. */
async function sendKeptSeen(): Promise<void> {
  try {
    const kept = await readSeenMeta();
    const left: string[] = [];
    for (const id of kept) {
      state.seen.add(id);
      if (!(await tellSeen(id))) left.push(id);
    }
    if (left.length !== kept.length) await writeSeenMeta(left);
  } catch (error) {
    logger.warn('Opened outcomes could not be told to the server', loggableError(error));
  }
}

// The rows are read, and what was opened offline is told, when a sync run ends: a run that works is waited for.
subscribeSyncRunEnd(async () => {
  await refreshHeldRows();
  // The copy now holds these items, so the phone's own rows of them are no longer the only source (contract section 3).
  await sweepHeldRows(state.rows.map(row => row.id)).catch((error: unknown) => logger.warn('Held rows could not be removed', loggableError(error)));
  await sendKeptSeen();
});
