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
 */
import { useCallback, useState } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { readReportCache, writeReportCache } from './reportCache';

/** What the report services answer with. */
export interface ReportServiceResult<T> {
  success: boolean;
  data?: T | null;
  message?: string;
  error?: unknown;
}

/** A report the server answered but did not give: refused, or failed. Asking again unchanged gives the same. */
export class ReportLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportLoadError';
  }
}

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
  refresh: () => void;
  retry: () => void;
}

export interface ReportQueryOptions<T> {
  /** Report id, level and every argument of the request. */
  key: readonly unknown[];
  fetch: () => Promise<ReportServiceResult<T>>;
  /** Text for a failure the service gave no message for. */
  fallbackError: string;
  enabled?: boolean;
}

/**
 * A key with nothing in memory: show the answer kept on the phone. The phone
 * answers after this returns, so whatever reached the query first wins: the
 * request's answer, or a teardown that emptied the query client.
 */
function showKeptAnswer<T>(queryKey: QueryKey, key: readonly unknown[]): void {
  const query = queryClient.getQueryCache().find<T, Error>({ queryKey, exact: true });
  if (!query || query.state.data !== undefined) return;
  void readReportCache<T>(key).then(kept => {
    if (!kept || queryClient.getQueryCache().get(query.queryHash) !== query || query.state.data !== undefined) return;
    // A request that failed before the phone answered still says so: the kept figures show as not updated.
    const failure = query.state.status === 'error' ? query.state.error : null;
    queryClient.setQueryData<T>(queryKey, kept.data, { updatedAt: kept.updatedAt });
    if (failure) query.setState({ status: 'error', error: failure });
  });
}

export function useReportQuery<T>({ key, fetch, fallbackError, enabled = true }: ReportQueryOptions<T>): ReportQuery<T> {
  const [isRefreshing, setRefreshing] = useState(false);
  const queryKey = ['report', ...key];
  const query = useQuery<T, Error>(
    {
      queryKey,
      queryFn: async () => {
        const generation = getSessionGeneration();
        showKeptAnswer<T>(queryKey, key);
        const result = await fetch();
        if (!result.success || result.data === undefined || result.data === null) {
          throw new ReportLoadError(result.message || fallbackError);
        }
        // Not awaited; a failed or refused request (thrown above) keeps the last good copy.
        void writeReportCache(key, { data: result.data, updatedAt: Date.now() }, generation);
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
    refetch().finally(() => setRefreshing(false));
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
    error: query.isError && !query.isFetching ? query.error.message || fallbackError : null,
    refresh,
    retry,
  };
}
