/**
 * The creates that were in flight: a GRN, a dispatch or an invoice whose save request was sent and whose answer had not come back.
 *
 * Before a create is sent, the app writes down which request it is (the request code that is actually sent, the
 * document number and the customer's name). The entry is removed as soon as the server's answer is known: saved, refused
 * ("not sent" too). It stays when the answer is lost, so that if the app dies before it is settled, the next start can ask
 * the server what became of the request (src/services/unfinishedSaveCheck.ts) and tell the person, who would otherwise
 * enter the same document again.
 *
 * Kept on the phone (AsyncStorage), apart from the list caches, per facility (server origin and instance) and per
 * signed-in person: the key of each group is the session scope, so a second person on the phone, or another facility of
 * the same person, never sees or settles an entry that is not theirs. The entries are not removed when a session ends
 * (clearSessionScopedState), on purpose: a forced sign-out or a switch to another facility must not make the note of a
 * save in doubt disappear; the entry waits for the same person at the same facility. An entry older than 7 days is
 * dropped (the server keeps a request code for 7 days and cannot answer for it after that).
 *
 * Nothing here ever rejects or blocks a save: a storage error is logged (a code, no values) and the save goes on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger } from '@/utils/logger';

const log = createLogger('UnfinishedSaves');

const STORAGE_KEY = 'unfinished_saves_v1';
/** The server keeps a request code for 7 days. */
export const UNFINISHED_SAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Per person and facility; the newest are kept. A person does not leave dozens of saves in doubt. */
const MAX_PER_SCOPE = 20;

export type UnfinishedSaveKind = 'grn' | 'dispatch' | 'invoice';

export interface UnfinishedSave {
  kind: UnfinishedSaveKind;
  /** The request code the save was sent with (the idempotency key): what the server is asked about. */
  requestKey: string;
  /** The document number the form held (a GRN's gr_no, a dispatch's disp_no, an invoice's number), as typed. */
  number: string;
  customerName: string;
  /** When the request was written down (ms since the epoch). */
  startedAt: number;
}

/** By session scope (`getSessionCacheScope`: origin, instance, subject). */
type Table = Record<string, UnfinishedSave[]>;

const isEntry = (value: unknown): value is UnfinishedSave => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.kind === 'grn' || entry.kind === 'dispatch' || entry.kind === 'invoice') &&
    typeof entry.requestKey === 'string' &&
    entry.requestKey !== '' &&
    typeof entry.number === 'string' &&
    typeof entry.customerName === 'string' &&
    typeof entry.startedAt === 'number' &&
    Number.isFinite(entry.startedAt)
  );
};

/** The table as stored, without anything unreadable or older than 7 days; a scope left with nothing is dropped. */
function parse(raw: string | null, now: number): Table {
  if (!raw) return {};
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const table: Table = {};
  for (const [scope, entries] of Object.entries(stored as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    const fresh = entries.filter(isEntry).filter(entry => now - entry.startedAt <= UNFINISHED_SAVE_MAX_AGE_MS);
    if (fresh.length > 0) table[scope] = fresh;
  }
  return table;
}

// Reads and writes run one at a time, so that two saves written down together do not lose each other.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>, fallback: T): Promise<T> {
  const run = queue.then(job).catch((error: unknown) => {
    log.warn('Storage failed; the unfinished-save note was skipped', { name: error instanceof Error ? error.name : undefined });
    return fallback;
  });
  queue = run;
  return run;
}

/** The request codes written down in this run of the app: the start-up check leaves them to the screen that is saving. */
const startedThisRun = new Set<string>();

/**
 * Writes down a create that is about to be sent. `requestKey` is the code the request carries. Call it before the
 * request is sent and await it; it never rejects. Without a session (no scope) nothing is written.
 */
export function rememberUnfinishedSave(entry: Omit<UnfinishedSave, 'startedAt'> & { startedAt?: number }): Promise<void> {
  startedThisRun.add(entry.requestKey);
  return enqueue(async () => {
    const scope = await getSessionCacheScope();
    if (!scope) return;
    const now = Date.now();
    const table = parse(await AsyncStorage.getItem(STORAGE_KEY), now);
    const others = (table[scope] ?? []).filter(existing => existing.requestKey !== entry.requestKey);
    table[scope] = [...others, { ...entry, startedAt: entry.startedAt ?? now }].slice(-MAX_PER_SCOPE);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  }, undefined);
}

/**
 * Removes a create whose answer is known (saved, refused, or never sent). A code that is not written down is ignored.
 * Looks in every scope: a request code is a hash that belongs to one request only.
 */
export function forgetUnfinishedSave(requestKey: string): Promise<void> {
  return enqueue(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const table = parse(raw, Date.now());
    let changed = false;
    for (const scope of Object.keys(table)) {
      const kept = table[scope].filter(entry => entry.requestKey !== requestKey);
      if (kept.length !== table[scope].length) changed = true;
      if (kept.length > 0) table[scope] = kept;
      else delete table[scope];
    }
    if (!changed) return;
    if (Object.keys(table).length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  }, undefined);
}

/**
 * The creates in doubt for the signed-in person at this facility, oldest first. Entries older than 7 days (of any
 * person or facility) are removed from storage here. Empty without a session. Never rejects.
 */
export function readUnfinishedSaves(): Promise<UnfinishedSave[]> {
  return enqueue(async () => {
    const scope = await getSessionCacheScope();
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const now = Date.now();
    const table = parse(raw, now);
    // Drop what expired (or was unreadable) from storage too.
    const clean = JSON.stringify(table);
    if (clean !== raw) {
      if (Object.keys(table).length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
      else await AsyncStorage.setItem(STORAGE_KEY, clean);
    }
    return scope ? [...(table[scope] ?? [])].sort((a, b) => a.startedAt - b.startedAt) : [];
  }, [] as UnfinishedSave[]);
}

/**
 * The screen that was saving gives up on this request (the person left, or the check was stopped) while its answer is still
 * unknown: from now on the start-up check may settle the note (at a later sign-in or start; it runs once per session), so the
 * note is no longer "this run's". The note itself stays.
 */
export const releaseUnfinishedSave = (requestKey: string): void => {
  startedThisRun.delete(requestKey);
};

/** True for a code written down in this run of the app (the screen that sent it is still dealing with it). */
export const wasStartedThisRun = (requestKey: string): boolean => startedThisRun.has(requestKey);

/** Test-only: forget the codes of this run. */
export function resetUnfinishedSavesForTests(): void {
  startedThisRun.clear();
  queue = Promise.resolve();
}
