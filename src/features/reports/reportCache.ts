/**
 * The last answer of each report, kept on the phone (docs/STYLE_GUIDE.md §14.9:
 * cached data with "Last updated 10:42 am").
 *
 * A report opened after the app was closed shows these figures, with the time
 * they were answered, while `useReportQuery` asks the facility again.
 *
 * An entry belongs to one session. Its key starts with the session scope
 * (server origin, instance, account); without a session nothing is read or
 * written; the session teardown removes every entry by its prefix
 * (`clearAllCaches`, src/store/sessionScopedState.ts); and a read or write that
 * began before a sign-in, sign-out or server switch does nothing.
 *
 * Bounded three ways: an entry older than CACHE_DURATION_REPORT_MS is not
 * shown; an answer longer than MAX_ENTRY_CHARS is not kept; and only the newest
 * entries are kept, up to MAX_TOTAL_CHARS and MAX_ENTRIES in all. Android keeps
 * all of AsyncStorage in one database of 6 MB (the library's default, which
 * this app does not change) that also holds the form drafts, so the reports
 * may not fill it.
 *
 * Storage errors are swallowed: the cache only ever saves a wait. Values are
 * never logged.
 *
 * An answer is written only when the facility gave it, and only for a key the
 * caller asks to keep (useReportQuery's `persist`). A refusal (the account lost
 * the role or the customer) removes the key's entry (`removeReportCache`), or
 * every entry of that customer's report (`removeReportCachePrefix`); any other
 * failure leaves it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashKey } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { CACHE_DURATION_REPORT_MS, CACHE_PREFIXES } from '@/config/cacheConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { generateScopedCacheKey, getSessionCacheScope } from '@/utils/cacheManager';

/**
 * Longest answer kept, in UTF-16 units of its JSON. Every one-customer KPI
 * set, every customers list and a few hundred dispatches or GRNs with their
 * items fit; a long period of a busy customer (a 420-day dispatch list of a
 * thousand dispatches is about 1 MB) does not, and is fetched as before.
 */
export const MAX_ENTRY_CHARS = 256 * 1024;
/** All entries together: about a sixth of Android's 6 MB storage database. */
export const MAX_TOTAL_CHARS = 1024 * 1024;
/** All entries together, so that the index stays small. */
export const MAX_ENTRIES = 20;

/** An entry written by another app version may hold a report in a shape this one no longer reads. */
const FORMAT = `1:${Constants.expoConfig?.version ?? ''}`;
/** Which entries exist, when each was answered and how long it is: [key, updatedAt, length]. */
const INDEX_KEY = `${CACHE_PREFIXES.REPORT}_index`;

type IndexRow = [key: string, updatedAt: number, length: number];

export interface ReportCacheEntry<T> {
  data: T;
  /** When the facility gave this answer (ms since the epoch). */
  updatedAt: number;
}

// Hashed as the query client hashes it, so that the order of an object's fields does not matter.
const entryKey = (scope: string, key: readonly unknown[]): string =>
  generateScopedCacheKey(CACHE_PREFIXES.REPORT, scope, { key: hashKey(key) });

function readIndex(raw: string | null): IndexRow[] {
  try {
    const rows: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (row): row is IndexRow =>
        Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number' && typeof row[2] === 'number'
    );
  } catch {
    return [];
  }
}

/** The last answer kept for `key` in this session, or null. Never rejects. */
export async function readReportCache<T>(key: readonly unknown[]): Promise<ReportCacheEntry<T> | null> {
  const generation = getSessionGeneration();
  try {
    const scope = await getSessionCacheScope();
    if (!scope || generation !== getSessionGeneration()) return null;
    const raw = await AsyncStorage.getItem(entryKey(scope, key));
    if (!raw || generation !== getSessionGeneration()) return null;
    const stored = JSON.parse(raw) as { v?: unknown; updatedAt?: unknown; data?: T | null } | null;
    if (stored?.v !== FORMAT || typeof stored.updatedAt !== 'number') return null;
    if (stored.data === undefined || stored.data === null) return null;
    if (Date.now() - stored.updatedAt > CACHE_DURATION_REPORT_MS) return null;
    return { data: stored.data, updatedAt: stored.updatedAt };
  } catch {
    return null;
  }
}

// Writes run one at a time, so that two reports answering together do not lose each other from the index.
let writes: Promise<void> = Promise.resolve();

/**
 * Keep `entry` as the last answer for `key`. `generation` is the session
 * generation when the request was sent: an answer to an earlier session is not
 * kept. Never rejects; the returned promise is for tests.
 */
export function writeReportCache<T>(
  key: readonly unknown[],
  entry: ReportCacheEntry<T>,
  generation: number = getSessionGeneration()
): Promise<void> {
  writes = writes.then(() => write(key, entry, generation));
  return writes;
}

async function write<T>(key: readonly unknown[], entry: ReportCacheEntry<T>, generation: number): Promise<void> {
  try {
    if (generation !== getSessionGeneration()) return;
    const scope = await getSessionCacheScope();
    if (!scope || generation !== getSessionGeneration()) return;
    const value = JSON.stringify({ v: FORMAT, updatedAt: entry.updatedAt, data: entry.data });
    if (value.length > MAX_ENTRY_CHARS) return;
    const own = entryKey(scope, key);
    const others = readIndex(await AsyncStorage.getItem(INDEX_KEY))
      .filter(([other]) => other !== own)
      .sort((a, b) => b[1] - a[1]);
    const kept: IndexRow[] = [[own, entry.updatedAt, value.length]];
    const dropped: string[] = [];
    let total = value.length;
    for (const row of others) {
      if (kept.length < MAX_ENTRIES && total + row[2] <= MAX_TOTAL_CHARS) {
        kept.push(row);
        total += row[2];
      } else {
        dropped.push(row[0]);
      }
    }
    // Checked again, and both requests sent without waiting in between: a
    // teardown that starts later lists the keys after this write has landed.
    if (generation !== getSessionGeneration()) return;
    await Promise.all([
      AsyncStorage.multiSet([
        [own, value],
        [INDEX_KEY, JSON.stringify(kept)],
      ]),
      dropped.length > 0 ? AsyncStorage.multiRemove(dropped) : undefined,
    ]);
  } catch {
    // Keeping a copy is never worth failing or delaying the report for.
  }
}

/**
 * Forget the last answer for `key`: the facility refused it, so this account
 * may no longer read those figures. Queued with the writes, so a write that was
 * sent earlier cannot put the entry back. `generation` is the session generation
 * when the request was sent: after a change of session the teardown has already
 * removed every entry. Never rejects; the returned promise is for tests.
 */
export function removeReportCache(key: readonly unknown[], generation: number = getSessionGeneration()): Promise<void> {
  writes = writes.then(() => remove(key, generation));
  return writes;
}

async function remove(key: readonly unknown[], generation: number): Promise<void> {
  try {
    if (generation !== getSessionGeneration()) return;
    const scope = await getSessionCacheScope();
    if (!scope || generation !== getSessionGeneration()) return;
    const own = entryKey(scope, key);
    const rows = readIndex(await AsyncStorage.getItem(INDEX_KEY));
    const kept = rows.filter(([other]) => other !== own);
    if (generation !== getSessionGeneration()) return;
    await Promise.all([
      AsyncStorage.removeItem(own),
      kept.length !== rows.length ? AsyncStorage.setItem(INDEX_KEY, JSON.stringify(kept)) : undefined,
    ]);
  } catch {
    // The read side refuses to show a refused key's entry anyway (useReportQuery).
  }
}

/**
 * Forget every answer whose key starts with `prefix` (the key itself and every
 * longer key, element for element): the facility refused one customer's
 * report, so none of that customer's kept figures for it may show, whatever
 * the period. Queued with the writes, like `removeReportCache`. Never rejects.
 */
export function removeReportCachePrefix(prefix: readonly unknown[], generation: number = getSessionGeneration()): Promise<void> {
  writes = writes.then(() => removePrefix(prefix, generation));
  return writes;
}

async function removePrefix(prefix: readonly unknown[], generation: number): Promise<void> {
  try {
    if (generation !== getSessionGeneration()) return;
    const scope = await getSessionCacheScope();
    if (!scope || generation !== getSessionGeneration()) return;
    // The stored key ends with the query client's hash of the key, a JSON array: a longer key
    // with the same first elements starts with the prefix's hash less its "]", then a comma.
    const exact = entryKey(scope, prefix);
    const longer = `${exact.slice(0, -1)},`;
    const matches = (stored: string) => stored === exact || stored.startsWith(longer);
    const [allKeys, rawIndex] = await Promise.all([AsyncStorage.getAllKeys(), AsyncStorage.getItem(INDEX_KEY)]);
    const doomed = allKeys.filter(matches);
    const rows = readIndex(rawIndex);
    const kept = rows.filter(([stored]) => !matches(stored));
    if (generation !== getSessionGeneration()) return;
    await Promise.all([
      doomed.length > 0 ? AsyncStorage.multiRemove(doomed) : undefined,
      kept.length !== rows.length ? AsyncStorage.setItem(INDEX_KEY, JSON.stringify(kept)) : undefined,
    ]);
  } catch {
    // The read side refuses to show a refused key's entry anyway (useReportQuery).
  }
}
