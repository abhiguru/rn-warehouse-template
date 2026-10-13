/**
 * A customer account's dispatch and invoice lists are put together in the app:
 * the list RPCs that search, sort and page on the server are for warehouse
 * roles, and the customer RPCs return a customer's history without filters.
 *
 * This keeps a collected history in memory for a short time, so the next page,
 * a sort, a search and the "Show N" count are answered from one download
 * instead of one download each. Requests made at the same moment share the
 * download. An entry belongs to one session: after a sign-out, a sign-in or a
 * server switch nothing is served from it.
 *
 * A history can be thousands of rows, so it is not held longer than it is
 * useful: a change of session empties the cache at once, every call drops the
 * histories older than the TTL (whichever key it asks for), and at most
 * MAX_HISTORY_ENTRIES answered histories are kept, the least recently used
 * going first. A load still in flight is never dropped to make room.
 */
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';

/** How long a collected history answers list requests before it is read again. */
export const CUSTOMER_HISTORY_TTL_MS = 2 * 60 * 1000;
/** Most answered histories kept at once (customers times dispatch/invoice). */
export const MAX_HISTORY_ENTRIES = 8;

type Entry = { generation: number; loadedAt: number; value: Promise<unknown>; settled: boolean };
/** In order of last use: the least recently used first. */
const entries = new Map<string, Entry>();

// Sign-in, sign-out, token store or clear, server switch: nothing of the old session stays.
onSessionChange(() => entries.clear());

/** Drops the least recently used answered histories beyond MAX_HISTORY_ENTRIES. */
function trim(): void {
  let settled = 0;
  for (const entry of entries.values()) if (entry.settled) settled++;
  for (const [name, entry] of entries) {
    if (settled <= MAX_HISTORY_ENTRIES) break;
    if (entry.settled) {
      entries.delete(name);
      settled--;
    }
  }
}

/**
 * The history stored under `key`, loaded with `load` when there is none, it is
 * older than the TTL, it is from another session, or `fresh` asks for a new
 * read (pull to refresh). A load that fails, or whose result `keep` rejects,
 * is not kept.
 */
export function customerHistory<T>(
  key: string,
  load: () => Promise<T>,
  options: { fresh?: boolean; keep?: (value: T) => boolean } = {}
): Promise<T> {
  const generation = getSessionGeneration();
  const now = Date.now();
  for (const [name, entry] of entries)
    if (entry.generation !== generation || now - entry.loadedAt >= CUSTOMER_HISTORY_TTL_MS) entries.delete(name);
  const existing = entries.get(key);
  if (existing && !options.fresh) {
    // Used again: now the most recently used.
    entries.delete(key);
    entries.set(key, existing);
    return existing.value as Promise<T>;
  }

  const value = load();
  const entry: Entry = { generation, loadedAt: Date.now(), value, settled: false };
  entries.delete(key);
  entries.set(key, entry);
  const drop = () => {
    if (entries.get(key) === entry) entries.delete(key);
  };
  value.then(result => {
    entry.settled = true;
    if (options.keep && !options.keep(result)) drop();
    else trim();
  }, drop);
  return value;
}

export function clearCustomerHistoryCache(): void {
  entries.clear();
}

/** Number of histories held, answered or in flight. For tests only. */
export function __sizeForTests(): number {
  return entries.size;
}
