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
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

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

export function useReportQuery<T>({ key, fetch, fallbackError, enabled = true }: ReportQueryOptions<T>): ReportQuery<T> {
  const [isRefreshing, setRefreshing] = useState(false);
  const query = useQuery<T, Error>(
    {
      queryKey: ['report', ...key],
      queryFn: async () => {
        const result = await fetch();
        if (!result.success || result.data === undefined || result.data === null) {
          throw new ReportLoadError(result.message || fallbackError);
        }
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
