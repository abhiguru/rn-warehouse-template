/**
 * A report whose figures are never shown from an earlier answer: the customer statement and the customer dues list (WH-155).
 *
 * Unlike useReportQuery, nothing is kept: not on the phone, not in the query client, not across a failure. The facility is
 * asked when the screen opens (and again when `key` changes) and when the person pulls down. While a request is out the
 * figures on screen stay; when it fails they are taken away and the screen shows the failure alone (spec edge case: "it never
 * shows figures from an earlier visit"). An answer that arrives after a newer request was sent, or after the screen closed,
 * is dropped. The shape is the one ReportScaffold reads.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportPhase } from './useReportQuery';

export interface LiveReportResult<T> {
  success: boolean;
  data?: T | null;
  message?: string;
}

export interface LiveReport<T> {
  data: T | undefined;
  phase: ReportPhase;
  isRefreshing: boolean;
  isFetching: boolean;
  /** Never set: the screen says "As of" from the server's own time, so the status line names no time of its own. */
  updatedAt: undefined;
  error: string | null;
  refresh: () => Promise<boolean>;
  retry: () => void;
}

interface State<T> {
  data: T | undefined;
  phase: ReportPhase;
  error: string | null;
}

export function useLiveReport<T>(key: string, fetch: () => Promise<LiveReportResult<T>>, fallbackError: string): LiveReport<T> {
  const [state, setState] = useState<State<T>>({ data: undefined, phase: 'loading', error: null });
  const [isFetching, setFetching] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  const fallbackRef = useRef(fallbackError);
  fallbackRef.current = fallbackError;
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (pulled: boolean): Promise<boolean> => {
    const id = ++sequence.current;
    setFetching(true);
    if (pulled) setRefreshing(true);
    let result: LiveReportResult<T>;
    try {
      result = await fetchRef.current();
    } catch {
      result = { success: false };
    }
    if (!mounted.current || id !== sequence.current) return false;
    setFetching(false);
    setRefreshing(false);
    if (result.success && result.data) {
      setState({ data: result.data, phase: 'ready', error: null });
      return true;
    }
    // A failure takes the earlier figures away: they are no longer the facility's word.
    setState({ data: undefined, phase: 'error', error: result.message || fallbackRef.current });
    return false;
  }, []);

  useEffect(() => {
    setState({ data: undefined, phase: 'loading', error: null });
    void load(false);
  }, [key, load]);

  const refresh = useCallback(() => load(true), [load]);
  const retry = useCallback(() => {
    setState({ data: undefined, phase: 'loading', error: null });
    void load(false);
  }, [load]);

  return { data: state.data, phase: state.phase, isRefreshing, isFetching, updatedAt: undefined, error: state.error, refresh, retry };
}
