/**
 * A report's search, filters, sort and period (docs/STYLE_GUIDE.md §14.5, §14.10).
 *
 * It answers with the same shape as `useListFilters`, so the filter bar and
 * its sheets work on a report as they do on a list. Two things are kept
 * elsewhere than a list keeps them, because a report remembers them:
 *
 * - the period: one for every report, so it carries from report to report;
 * - the sort: per report.
 *
 * Both live in the persisted report choices. The search and the other filters
 * stay with the session, like a list's. "Clear all" touches neither the period
 * nor the sort.
 */
import { useCallback, useMemo } from 'react';
import { countActiveFilters, currentSort, hasAnyFilter, isRequiredField } from '@/features/filters/filterModel';
import type { DateRangeValue, FilterListConfig, FilterValue, FilterValues, SortState } from '@/features/filters/types';
import { useListFilters } from '@/features/filters/useListFilters';
import { indiaDay } from '@/utils/formatters';
import { useReportPrefs } from './useReportPrefs';

/** The period of a report nobody has chosen a period for yet. */
export const DEFAULT_REPORT_PERIOD: DateRangeValue = { preset: 'last120' };

export function useReportFilters<TRequest>(config: FilterListConfig<TRequest>): ReturnType<typeof useListFilters<TRequest>> {
  const list = useListFilters(config);
  const { prefs, setPeriod, setSort: rememberSort } = useReportPrefs();

  // The key of the report's period, if it has one: its one range that always has a value.
  const periodKey = useMemo(() => config.fields.find(isRequiredField)?.key, [config]);
  const period = prefs.period ?? DEFAULT_REPORT_PERIOD;
  const values = useMemo<FilterValues>(
    () => (periodKey ? { ...list.values, [periodKey]: period } : list.values),
    [list.values, periodKey, period]
  );
  const storedSort = prefs.sort[config.listKey];
  const sort = useMemo(() => currentSort(config, storedSort), [config, storedSort]);

  // The day is part of the key, as in useListFilters: a period such as "This month" is turned into dates here.
  // It is India's day, the one a report's `toRequest` counts from (`todayInIST`): the request is made
  // again when the day turns over there, and not when it turns over in the zone of the phone.
  const day = indiaDay(new Date());
  const request = useMemo(() => config.toRequest(values, sort, list.ctx), [config, values, sort, list.ctx, day]);

  const { setField: setListField, apply: applyList } = list;
  const setField = useCallback(
    (field: string, value: FilterValue | undefined) => {
      if (field !== periodKey) return setListField(field, value);
      // A period cannot be removed: only replaced.
      if (value) setPeriod(value as DateRangeValue);
      return undefined;
    },
    [periodKey, setListField, setPeriod]
  );
  const setSort = useCallback((next: SortState) => rememberSort(config.listKey, next), [rememberSort, config.listKey]);
  const apply = useCallback(
    (next: FilterValues, nextSort?: SortState) => {
      const rest = { ...next };
      if (periodKey) {
        if (rest[periodKey]) setPeriod(rest[periodKey] as DateRangeValue);
        delete rest[periodKey];
      }
      if (nextSort) rememberSort(config.listKey, nextSort);
      return applyList(rest);
    },
    [periodKey, setPeriod, rememberSort, config.listKey, applyList]
  );

  return {
    ...list,
    values,
    sort,
    request,
    activeCount: countActiveFilters(config, values, list.ctx),
    hasAny: hasAnyFilter(config, values, list.ctx),
    apply,
    setField,
    setSort,
  } as ReturnType<typeof useListFilters<TRequest>>;
}
