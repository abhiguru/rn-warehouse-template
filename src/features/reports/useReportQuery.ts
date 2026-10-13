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
 * A refusal also stops what was already on its way. Refusals are counted, and
 * the count is noted for the customer's report (or for the key, when it names
 * no customer) the moment it is refused, before anything is cleared. A request
 * sent before that count was reached brings nothing back: the kept answer it
 * asked the phone for is not shown, and its own answer is neither shown nor
 * kept, so the query shows the refusal. A request sent afterwards is an
 * ordinary one, and the report comes back when access does.
 *
 * Coming back to a report asks again (review 2026-10-13, SR-10). A report
 * left underneath another screen stays mounted, so the mount's request does
 * not run again: when its route is focused again, or the app comes back to the
 * foreground, and its answer is more than `RETURN_REFRESH_AFTER_MS` old, it is
 * asked again once, behind the rows on screen. A request already out is joined,
 * not repeated. A first mount and a re-render ask nothing extra. A write that
 * changes what reports count marks them out of date instead
 * (`invalidateReportQueries` in src/lib/queryClient.ts).
 *
 * What is shown as the reason: the service's message for a refusal (in the
 * app's language), and the caller's `fallbackError` for any other failure. A
 * service's message for a failure ("Failed to fetch ...") and a thrown error's
 * text ("Network request failed") are not for people (docs/STYLE_GUIDE.md §12.1).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { hashKey, useQuery, type Query } from '@tanstack/react-query';
import { useAppForeground, useRouteFocus } from '@/hooks/useRouteFocus';
import { queryClient } from '@/lib/queryClient';
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';
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
  /**
   * Ask again when the person comes back to the report (its route focused again, or the
   * app back in the foreground) and the answer is older than `RETURN_REFRESH_AFTER_MS`
   * (default true). False for a query that must not move by itself, such as a later page
   * of a paged list, whose first page decides when it is asked again.
   */
  revalidateOnReturn?: boolean;
}

/** An answer younger than this is not asked for again on a return: a quick look elsewhere and back. */
export const RETURN_REFRESH_AFTER_MS = 30_000;

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

/** The last refusal of one customer's report, or of one key that names no customer. */
interface NotedRefusal {
  /** What the count of refusals stood at once this one was counted. */
  count: number;
  refusal: ReportLoadError;
  /** Settles when the phone no longer holds what it kept before the refusal: the removal is queued, not done at once. */
  forgotten?: Promise<void>;
}

/**
 * Refusals in this session, counted, and the last one of each customer's report
 * (or of a key that names no customer, under the key itself). A request sent
 * when the count was lower than that refusal's was sent before it: neither the
 * kept answer it asked the phone for nor its own answer may show or be kept.
 * The count never goes back, so a request sent after the refusal is not held
 * to it.
 */
let refusalCount = 0;
const lastRefusals = new Map<string, NotedRefusal>();
// A refusal was given to one account on one server.
onSessionChange(() => lastRefusals.clear());

/** How many customers' reports (or keys) have a refusal noted. For tests: a change of session leaves none. */
export const notedRefusals = (): number => lastRefusals.size;

/** What a refusal of `key` covers, as the map names it: the customer's report, or the key itself. */
const refusalScope = (key: readonly unknown[]): string => hashKey(customerPrefix(key) ?? key);

/** The refusal that `key`'s customer report (or `key`) was given after the count stood at `sentAt`, or undefined. */
function refusedSince(key: readonly unknown[], sentAt: number): ReportLoadError | undefined {
  const last = lastRefusals.get(refusalScope(key));
  return last && last.count > sentAt ? last.refusal : undefined;
}

/**
 * A key with nothing in memory: show the answer kept on the phone. The phone
 * answers after this returns, so whatever reached the query first wins: the
 * request's answer, a refusal, or a teardown that emptied the query client.
 * `sentAt` is the refusal count when the request was sent.
 */
function showKeptAnswer<T>(query: Query<T, Error>, key: readonly unknown[], sentAt: number): void {
  if (query.state.data !== undefined) return;
  // After a refusal the phone is asked only once it has forgotten: the removal waits its turn
  // behind the phone's writes, and a read sent meanwhile would find the entry still there.
  const forgotten = lastRefusals.get(refusalScope(key))?.forgotten;
  const read = () => readReportCache<T>(key);
  void (forgotten ? forgotten.then(read) : read()).then(kept => {
    if (!kept || queryClient.getQueryCache().get(query.queryHash) !== query || query.state.data !== undefined) return;
    // Refused since the phone was asked, under this key or another of the same customer's report. The
    // query may not say so yet (its own refusal is recorded a moment after it is thrown; another
    // period's request is still out): the count does.
    if (refusedSince(key, sentAt)) return;
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
 * and in memory, so that the refusal shows alone. As a rule the query is still
 * waiting for the refused request, and the error that follows keeps `data` as
 * it finds it, now empty.
 *
 * A key that names a customer takes every key of that customer's report with
 * it: a query no screen shows is removed, one on screen loses its data (shown
 * loading while its own request is out, else refused).
 *
 * First of all the refusal is counted and noted (`lastRefusals`), so that what
 * was sent before it cannot bring the figures back after they are cleared here.
 * Two things the count cannot see are seen to here: an answer the library was
 * about to record when the refusal landed, and a query with no request out to
 * record the refusal on.
 */
function forgetAnswer<T>(
  query: Query<T, Error> | undefined,
  key: readonly unknown[],
  generation: number,
  refusal: ReportLoadError
): void {
  let noted: NotedRefusal | undefined;
  // A refusal answered to an earlier session says nothing about this one's requests.
  if (generation === getSessionGeneration()) {
    refusalCount += 1;
    noted = { count: refusalCount, refusal };
    lastRefusals.set(refusalScope(key), noted);
  }
  const cache = queryClient.getQueryCache();
  const prefix = customerPrefix(key);
  const forgotten = prefix ? removeReportCachePrefix(prefix, generation) : removeReportCache(key, generation);
  if (noted) noted.forgotten = forgotten;

  // Nothing is out for it that would say so: the refusal is put in place of what it held.
  const showRefusal = <D>(held: Query<D, Error>): void => {
    if (cache.get(held.queryHash) !== held) return;
    held.setState({ data: undefined, dataUpdatedAt: 0, status: 'error', error: refusal, errorUpdatedAt: Date.now() });
  };
  // A request is out for it. Its answer may have passed the check in `queryFn` a step before this
  // refusal landed and be on its way into the query, where the library records it after this
  // returns: taken back as soon as it is. The library has waited on this promise since it sent
  // the request, so it records first. (An answer that has not got that far is refused by the
  // check, and a failure or a newer request leaves this with nothing to do.)
  const takeBackAnswer = <D>(held: Query<D, Error>): void => {
    void held.promise?.then(
      () => showRefusal(held),
      () => {}
    );
  };

  for (const other of prefix ? cache.findAll({ queryKey: ['report', ...prefix] }) : []) {
    if (other === query) continue;
    if (other.getObserversCount() === 0) {
      cache.remove(other);
    } else if (other.state.fetchStatus === 'fetching') {
      other.setState({ data: undefined, dataUpdatedAt: 0, status: 'pending' });
      takeBackAnswer(other);
    } else {
      showRefusal(other);
    }
  }
  if (!query || cache.get(query.queryHash) !== query) return;
  if (query.state.fetchStatus === 'fetching') {
    if (query.state.data !== undefined) query.setState({ data: undefined, dataUpdatedAt: 0, status: 'pending' });
    // The request it waits for may be a newer one than the refused (the person pulled to refresh).
    takeBackAnswer(query);
  } else {
    // That newer request has answered already, so no error follows: left as it is, the query
    // would show loading, with nothing out, for good.
    showRefusal(query);
  }
}

/**
 * The answer held in memory for `key` (as `useReportQuery` names it), without
 * asking for it: undefined when it is not held. Read where it is drawn; a
 * change to it does not draw again by itself.
 */
export function peekReportAnswer<T>(key: readonly unknown[]): T | undefined {
  return queryClient.getQueryData<T>(['report', ...key]);
}

export function useReportQuery<T>({
  key,
  fetch,
  fallbackError,
  enabled = true,
  persist = true,
  revalidateOnReturn = true,
}: ReportQueryOptions<T>): ReportQuery<T> {
  const [isRefreshing, setRefreshing] = useState(false);
  const queryKey = ['report', ...key];
  const query = useQuery<T, Error>(
    {
      queryKey,
      queryFn: async () => {
        const generation = getSessionGeneration();
        const sentAt = refusalCount;
        const current = queryClient.getQueryCache().find<T, Error>({ queryKey, exact: true });
        if (current && persist) showKeptAnswer<T>(current, key, sentAt);
        const result = await fetch();
        if (!result.success || result.data === undefined || result.data === null) {
          const refused = !result.success && isRefusal(result);
          const failure = new ReportLoadError(result.message || fallbackError, refused);
          if (refused) forgetAnswer<T>(current, key, generation, failure);
          throw failure;
        }
        // The customer's report was refused while this request was out (under this key or another
        // period's): the answer is from before the refusal. Not shown and, below, not kept.
        const refusal = refusedSince(key, sentAt);
        if (refusal) throw refusal;
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

  // A return to the report: its route focused again, or the app back in the foreground.
  const focused = useRouteFocus(revalidateOnReturn);
  const foreground = useAppForeground();
  const inFront = focused && foreground;
  const wasInFront = useRef(inFront);
  // Read when the return happens, so the effect runs on a change of `inFront` alone.
  const latest = useRef({ enabled, revalidateOnReturn, hasData: false, dataUpdatedAt: 0, refetch });
  latest.current = { enabled, revalidateOnReturn, hasData: query.data !== undefined, dataUpdatedAt: query.dataUpdatedAt, refetch };
  useEffect(() => {
    const returned = inFront && !wasInFront.current;
    wasInFront.current = inFront;
    const now = latest.current;
    if (!returned || !now.revalidateOnReturn || !now.enabled || !now.hasData) return;
    if (Date.now() - now.dataUpdatedAt <= RETURN_REFRESH_AFTER_MS) return;
    // Joins a request already out; the rows on screen stay while it is answered.
    void now.refetch({ cancelRefetch: false });
  }, [inFront]);

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
