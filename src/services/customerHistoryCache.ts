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
 */
import { getSessionGeneration } from '@/config/sessionLifecycle';

/** How long a collected history answers list requests before it is read again. */
export const CUSTOMER_HISTORY_TTL_MS = 2 * 60 * 1000;

type Entry = { generation: number; loadedAt: number; value: Promise<unknown> };
const entries = new Map<string, Entry>();

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
  for (const [name, entry] of entries) if (entry.generation !== generation) entries.delete(name);
  const existing = entries.get(key);
  if (existing && !options.fresh && Date.now() - existing.loadedAt < CUSTOMER_HISTORY_TTL_MS)
    return existing.value as Promise<T>;

  const value = load();
  const entry: Entry = { generation, loadedAt: Date.now(), value };
  entries.set(key, entry);
  const drop = () => {
    if (entries.get(key) === entry) entries.delete(key);
  };
  value.then(result => {
    if (options.keep && !options.keep(result)) drop();
  }, drop);
  return value;
}

export function clearCustomerHistoryCache(): void {
  entries.clear();
}
