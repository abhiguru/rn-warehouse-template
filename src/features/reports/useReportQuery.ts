/**
 * One report's data: asked for by key, shown from the last answer while a new
 * one is fetched, and never mixed between keys.
 *
 * The key names everything the answer depends on (report, customer, dates), so
 * an answer that arrives late for an earlier customer or period is filed under
 * its own key and cannot appear under the current one. A key that was asked
 * before shows its last answer at once and refreshes behind it. The answers
 * are held by the query client, which the session teardown empties
 * (src/store/sessionScopedState.ts).
 *
 * Each answer is also kept on the phone (./reportCache.ts). A key asked for
 * the first time since the app started shows the kept answer, with the time it
 * was given, while the request is out; the request does not wait for it.
 *
 * A key the caller does not `persist` (a later page, a search) is neither
 * written to the phone nor read from it: such an answer is never shown from the
 * phone, and it would push other reports' answers out of the phone's budget.
 *
 * A refusal is different from a failure. When the facility refuses (the account
 * lost the role or the customer: `isAccessRefusal`), nothing it gave before is
 * shown: the kept answer is removed from the phone and not shown, and the
 * answer held in memory for that key is dropped, so the screen shows the
 * refusal alone. For a key that names a customer (`[report, 'customer', id,
 * ...]`) that goes for every key of that customer's report, whatever its
 * period. Any other failure keeps the last answer on screen beside it.
 *
 * What is shown as the reason: the service's message for a refusal (in the
 * app's language), and the caller's `fallbackError` for any other failure. A
 * service's message for a failure ("Failed to fetch ...") and a thrown error's
 * text ("Network request failed") are not for people (docs/STYLE_GUIDE.md §12.1).
 */
import { useCallback, useState } from 'react';
import { useQuery, type Query } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { isAccessRefusal } from '@/utils/rpcRefusal';
import { readReportCache, removeReportCache, removeReportCachePrefix, writeReportCache } from './reportCache';

/** What the report services answer with. */
export interface ReportServiceResult<T> {
  success: boolean;
  data?: T | null;
  message?: string;
  error?: unknown;
}

/** A report the server answered but did not give: refused, or failed. Asking again unchanged gives the same. */
export class ReportLoadError extends Error {
  /**
   * The facility refused this account the report (`isAccessRefusal`), as
   * opposed to failing to give it: no earlier answer for the key may be shown.
   */
  readonly refused: boolean;

  constructor(message: string, refused = false) {
    super(message);
    this.name = 'ReportLoadError';
    this.refused = refused;
  }
}

/**
 * The service's failure is an access refusal. The services put the server's
 * code (refusedReport: an SQLSTATE such as 42501) or the server's own sentence
 * (a PostgREST error) in `error`, and a sentence, the server's or the app's, in
 * `message`.
 */
function isRefusal(result: ReportServiceResult<unknown>): boolean {
  const detail = typeof result.error === 'string' ? result.error : undefined;
  return isAccessRefusal({ code: detail, text: result.message }) || isAccessRefusal({ text: detail });
}

const isRefusedError = (error: unknown): boolean => error instanceof ReportLoadError && error.refused;

export type ReportPhase = 'loading' | 'ready' | 'error';

export interface ReportQuery<T> {
  data: T | undefined;
  /** `loading`: nothing to show yet. `error`: nothing to show, and the last try failed. `ready`: `data` is set. */
  phase: ReportPhase;
  /** The person pulled to refresh. */
  isRefreshing: boolean;
  /** A request is out, whoever started it. */
  isFetching: boolean;
  /** When `data` was answered. */
  updatedAt: number | undefined;
  /** Why the last try failed. With `data` set, the data on screen is older than the person asked for. */
  error: string | null;
  /**
   * `data` is the answer kept on the phone, shown while the facility is asked
   * again; false once the facility has answered in this run of the app.
   */
  isKeptCopy: boolean;
  /** Ask again because the person pulled; resolves true when the facility gave a new answer. */
  refresh: () => Promise<boolean>;
  retry: () => void;
}

export interface ReportQueryOptions<T> {
  /** Report id, level and every argument of the request. */
  key: readonly unknown[];
  fetch: () => Promise<ReportServiceResult<T>>;
  /** Text for a failure the service gave no message for. */
  fallbackError: string;
  enabled?: boolean;
  /**
   * Keep the answer on the phone and show the kept one while asking (default
   * true). False for an answer that can never be shown from the phone, such as
   * a later page or a search: nothing is written or read for the key.
   */
  persist?: boolean;
}

/** Answers that came from the phone, not the facility, while they are on screen. */
const keptAnswers = new WeakSet<object>();
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

/**
 * The part of a key that names one customer's report (`[report, 'customer',
 * customerId]`), or undefined for a key that names no customer.
 */
function customerPrefix(key: readonly unknown[]): readonly unknown[] | undefined {
  return key.length >= 3 && key[1] === 'customer' && key[2] !== undefined && key[2] !== null ? key.slice(0, 3) : undefined;
}

/**
 * A key with nothing in memory: show the answer kept on the phone. The phone
 * answers after this returns, so whatever reached the query first wins: the
 * request's answer, a refusal, or a teardown that emptied the query client.
 */
function showKeptAnswer<T>(query: Query<T, Error>, key: readonly unknown[]): void {
  if (query.state.data !== undefined) return;
  void readReportCache<T>(key).then(kept => {
    if (!kept || queryClient.getQueryCache().get(query.queryHash) !== query || query.state.data !== undefined) return;
    const failure = query.state.status === 'error' ? query.state.error : null;
    // The facility refused this account the key: the kept figures are not its to read.
    if (isRefusedError(failure)) return;
    // A request that failed before the phone answered still says so: the kept figures show as not updated.
    if (isObject(kept.data)) keptAnswers.add(kept.data);
    queryClient.setQueryData<T>(query.queryKey, kept.data, { updatedAt: kept.updatedAt });
    if (failure) query.setState({ status: 'error', error: failure });
  });
}

/**
 * The facility refused `query`'s key: forget what it gave before, on the phone
 * and in memory, so that the refusal shows alone. The query is still fetching;
 * the error that follows keeps `data` as it finds it, now empty.
 *
 * A key that names a customer takes every key of that customer's report with
 * it: a query no screen shows is removed, one on screen loses its data (shown
 * loading while its own request is out, else refused).
 */
function forgetAnswer<T>(
  query: Query<T, Error> | undefined,
  key: readonly unknown[],
  generation: number,
  refusal: ReportLoadError
): void {
  const prefix = customerPrefix(key);
  if (prefix) {
    void removeReportCachePrefix(prefix, generation);
    for (const other of queryClient.getQueryCache().findAll({ queryKey: ['report', ...prefix] })) {
      if (other === query) continue;
      if (other.getObserversCount() === 0) queryClient.getQueryCache().remove(other);
      else if (other.state.fetchStatus === 'fetching') other.setState({ data: undefined, dataUpdatedAt: 0, status: 'pending' });
      else other.setState({ data: undefined, dataUpdatedAt: 0, status: 'error', error: refusal, errorUpdatedAt: Date.now() });
    }
  } else {
    void removeReportCache(key, generation);
  }
  if (!query || queryClient.getQueryCache().get(query.queryHash) !== query || query.state.data === undefined) return;
  query.setState({ data: undefined, dataUpdatedAt: 0, status: 'pending' });
}

/**
 * The answer held in memory for `key` (as `useReportQuery` names it), without
 * asking for it: undefined when it is not held. Read where it is drawn; a
 * change to it does not draw again by itself.
 */
export function peekReportAnswer<T>(key: readonly unknown[]): T | undefined {
  return queryClient.getQueryData<T>(['report', ...key]);
}

export function useReportQuery<T>({ key, fetch, fallbackError, enabled = true, persist = true }: ReportQueryOptions<T>): ReportQuery<T> {
  const [isRefreshing, setRefreshing] = useState(false);
  const queryKey = ['report', ...key];
  const query = useQuery<T, Error>(
    {
      queryKey,
      queryFn: async () => {
        const generation = getSessionGeneration();
        const current = queryClient.getQueryCache().find<T, Error>({ queryKey, exact: true });
        if (current && persist) showKeptAnswer<T>(current, key);
        const result = await fetch();
        if (!result.success || result.data === undefined || result.data === null) {
          const refused = !result.success && isRefusal(result);
          const failure = new ReportLoadError(result.message || fallbackError, refused);
          if (refused) forgetAnswer<T>(current, key, generation, failure);
          throw failure;
        }
        // The kept copy on screen is now confirmed or replaced (the library keeps the old object when equal).
        if (current && isObject(current.state.data)) keptAnswers.delete(current.state.data);
        // Not awaited. A failed request (thrown above) keeps the last good copy; a refused one removed it.
        if (persist) void writeReportCache(key, { data: result.data, updatedAt: Date.now() }, generation);
        return result.data;
      },
      enabled,
      // Reports are read for today's figures: show the last answer, and always ask again.
      staleTime: 0,
      refetchOnMount: 'always',
      // The services already report a failure as an answer; a second identical request would fail the same way.
      retry: false,
    },
    queryClient
  );

  const { refetch } = query;
  const refresh = useCallback(() => {
    setRefreshing(true);
    return refetch()
      .then(result => result.status === 'success' && !result.isError)
      .catch(() => false)
      .finally(() => setRefreshing(false));
  }, [refetch]);
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const hasData = query.data !== undefined;
  // An error with no data and a request out is a retry in progress: show loading, not the old error.
  const phase: ReportPhase = hasData ? 'ready' : query.isError && !query.isFetching ? 'error' : 'loading';
  return {
    data: query.data,
    phase,
    isRefreshing,
    isFetching: query.isFetching,
    updatedAt: hasData ? query.dataUpdatedAt : undefined,
    error: query.isError && !query.isFetching ? (isRefusedError(query.error) && query.error.message) || fallbackError : null,
    isKeptCopy: hasData && isObject(query.data) && keptAnswers.has(query.data),
    refresh,
    retry,
  };
}
