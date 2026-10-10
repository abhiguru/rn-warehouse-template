/**
 * How many results a set of filters would give, for the "Show N items" button.
 * Waits 400 ms after the last change; when answers arrive out of order the
 * latest question wins; the previous number stays visible while loading.
 */
import { useEffect, useRef, useState } from 'react';
import type { CountableFilterList } from './configs';
import type { FilterContext, FilterValues, SortState } from './types';

export const COUNT_DEBOUNCE_MS = 400;

export interface FilterResultCount {
  /** Null until the first answer, and after a failure. */
  count: number | null;
  loading: boolean;
}

export function useFilterResultCount(
  config: CountableFilterList,
  values: FilterValues,
  sort: SortState | undefined,
  ctx: FilterContext,
  enabled = true
): FilterResultCount {
  const [state, setState] = useState<FilterResultCount>({ count: null, loading: enabled });
  const latest = useRef(0);
  // Compare by content: callers build a new values object on every render.
  const signature = JSON.stringify([values, sort]);

  useEffect(() => {
    if (!enabled) return undefined;
    const request = ++latest.current;
    setState(previous => ({ count: previous.count, loading: true }));
    const timer = setTimeout(() => {
      config
        .countResults(values, sort, ctx)
        .then(count => {
          if (request === latest.current) setState({ count, loading: false });
        })
        .catch(() => {
          if (request === latest.current) setState({ count: null, loading: false });
        });
    }, COUNT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `values` and `sort` are covered by `signature`.
     
  }, [config, ctx, enabled, signature]);

  return state;
}

/** Label of the apply button for a count. */
export function resultsLabel(result: FilterResultCount, noun: [string, string]): string {
  if (result.count === null) return 'Show results';
  if (result.count === 0) return `No ${noun[1]} match`;
  return `Show ${new Intl.NumberFormat('en-IN').format(result.count)} ${result.count === 1 ? noun[0] : noun[1]}`;
}
