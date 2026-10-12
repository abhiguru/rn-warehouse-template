/**
 * What every report's configuration shares (docs/STYLE_GUIDE.md §14.5, §14.10).
 *
 * A report's request has two parts. `period` is what the server is asked: the
 * report RPCs take two days and return every row between them. `view` is what
 * the app then does with those rows: the search, the sort and any choice.
 * Each configuration exports the pure function that applies its view, and
 * `reportViews.test.ts` checks that every field, the search and every sort
 * changes the rows or their order: a request that only looks different would
 * prove nothing for work done in the app.
 */
import { t } from '@/i18n';
import { todayInIST } from '@/utils/formatters';
import { REPORT_DATE_PRESETS, presetRange, resolveDateRange } from '../../datePresets';
import { readSearch } from '../../filterModel';
import { searchTerms } from '../../searchMatch';
import type { DateRangeField, DateRangeValue, FilterListDefinition, FilterValues, SortState } from '../../types';

export const PERIOD_KEY = 'period';

/** The period chip of a report: always set, one for every report, remembered (useReportFilters). */
export const PERIOD_FIELD: DateRangeField = {
  kind: 'dateRange',
  key: PERIOD_KEY,
  get label() { return t('reports.period.label'); },
  icon: 'calendar-range',
  presets: REPORT_DATE_PRESETS,
  required: true,
  applyPresetOnTap: true,
};

export interface ReportPeriod {
  from: string;
  to: string;
}
export interface ReportView {
  sort?: SortState;
  /** The words of the search, as the list backends read a search. */
  words: string[];
}
export interface ReportRequest<TView extends object = Record<never, never>> {
  /** Missing for a report of today's stock, which has no period. */
  period?: ReportPeriod;
  view: ReportView & TView;
}
/** The request of a report that covers a period: its two days are always there. */
export type PeriodReportRequest<TView extends object = Record<never, never>> = ReportRequest<TView> & { period: ReportPeriod };

/** The two days a report asks the server for. A period always has both. */
export function reportPeriod(values: FilterValues, today: Date): ReportPeriod {
  const range = resolveDateRange(values[PERIOD_KEY] as DateRangeValue | undefined, today);
  const fallback = resolveDateRange({ preset: 'last120' }, today) as ReportPeriod;
  return range.from && range.to ? { from: range.from, to: range.to } : fallback;
}

/**
 * Whether a period reaches back at least as far as the longest quick range.
 * An empty report then has no longer period to suggest.
 */
export function isLongestPeriod(period: ReportPeriod, today: Date = todayInIST()): boolean {
  const earliest = REPORT_DATE_PRESETS.map(preset => presetRange(preset.id, today).from).sort()[0];
  return period.from <= earliest;
}

export function reportView(config: FilterListDefinition, values: FilterValues, sort: SortState | undefined): ReportView {
  return { sort, words: searchTerms(readSearch(config, values).text) };
}

type SortValue = string | number | null | undefined;
const isEmpty = (value: SortValue) => value === null || value === undefined || value === '';

/**
 * Rows in the order a sort asks for. Numbers sort as numbers and text as people
 * read it ("A9" before "A10", whatever its case). A row with no value comes
 * last in either direction, and rows that tie keep the order they came in.
 */
export function sortRows<T>(rows: readonly T[], sort: SortState | undefined, by: Record<string, (row: T) => SortValue>): T[] {
  const pick = sort ? by[sort.field] : undefined;
  if (!sort || !pick) return [...rows];
  const sign = sort.order === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: pick(row) }))
    .sort((left, right) => {
      const a = left.value;
      const b = right.value;
      if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? left.index - right.index : isEmpty(a) ? 1 : -1;
      const order =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      return order === 0 ? left.index - right.index : sign * order;
    })
    .map(entry => entry.row);
}
