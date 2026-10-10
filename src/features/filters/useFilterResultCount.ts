/**
 * How many results a set of filters would give, for the "Show N items" button.
 * Waits 400 ms after the last change; when answers arrive out of order the
 * latest question wins; the previous number stays visible while loading.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
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

/** The nouns a list can count. Each has its own whole sentences (`filters.results.<noun>`). */
const RESULT_NOUNS = ['item', 'dispatch', 'invoice', 'order', 'price'] as const;
type ResultNoun = (typeof RESULT_NOUNS)[number];
const isResultNoun = (noun: string): noun is ResultNoun => (RESULT_NOUNS as readonly string[]).includes(noun);

/** Label of the apply button for a count: "Show 24 items", "No items match", "Show results". */
export function resultsLabel(result: FilterResultCount, noun: [string, string]): string {
  if (result.count === null) return t('filters.results.showResults');
  const [singular, plural] = noun;
  if (isResultNoun(singular)) {
    return result.count === 0 ? t(`filters.results.${singular}.none`) : t(`filters.results.${singular}.show`, { count: result.count });
  }
  // A noun without texts of its own (none in the app today): English, as before.
  if (result.count === 0) return `No ${plural} match`;
  return `Show ${new Intl.NumberFormat('en-IN').format(result.count)} ${result.count === 1 ? singular : plural}`;
}
