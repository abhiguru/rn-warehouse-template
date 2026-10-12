/**
 * Dispatch activity report: its customers list, and one customer's dispatches.
 * The two levels sort and search separately; they share the period.
 */
import { t } from '@/i18n';
import type { CustomerDispatchRow, DispatchActivityRecord } from '@/types/report.types';
import { todayInIST } from '@/utils/formatters';
import { matchesSearch } from '../../searchMatch';
import type { FilterListConfig } from '../../types';
import { PERIOD_FIELD, reportPeriod, reportView, sortRows, type PeriodReportRequest, type ReportView } from './shared';

export type DispatchCustomersRequest = PeriodReportRequest;

export const DISPATCH_ACTIVITY_CUSTOMERS: FilterListConfig<DispatchCustomersRequest> = {
  listKey: 'report-dispatch-activity',
  // Labels are getters so they follow the app's language (see FieldBase in ../../types).
  get title() { return t('reports.titles.dispatchActivity'); },
  noun: ['customer', 'customers'],
  search: { get placeholder() { return t('reports.components.searchCustomers'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'bags', get label() { return t('common.bags'); }, kind: 'amount' },
      { field: 'dispatches', get label() { return t('reports.customerActivity.dispatches'); }, kind: 'amount' },
      { field: 'name', get label() { return t('common.customer'); }, kind: 'text' },
    ],
    default: { field: 'bags', order: 'desc' },
  },
  fields: [PERIOD_FIELD],
  fastFilters: [],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: reportView(DISPATCH_ACTIVITY_CUSTOMERS, values, sort),
  }),
};

/** The customers a search leaves, in the chosen order. */
export function dispatchCustomersView(rows: readonly CustomerDispatchRow[], view: ReportView): CustomerDispatchRow[] {
  return sortRows(
    rows.filter(row => matchesSearch(view.words, [row.customer_name])),
    view.sort,
    {
      bags: row => row.total_quantity,
      dispatches: row => row.dispatch_count,
      name: row => row.customer_name,
    }
  );
}

export type DispatchRecordsRequest = PeriodReportRequest;

/**
 * One customer's dispatches. Two configurations share this list key, fields
 * and search, and differ in one sort option: Weight. The server sends a
 * dispatch's weight only once its backend has the migration that adds it (an
 * older one sends none, and the service maps that to 0), and a sort over a
 * column of zeros orders nothing (§14.5: a sort that is shown must work). The
 * screen offers the one with Weight only while a loaded dispatch has a weight
 * (`hasDispatchWeights`).
 *
 * Built by a function that returns an object literal, never by copying one:
 * the labels are getters, and a copy would keep the language the app started in.
 */
function dispatchRecordsConfig(withWeight: boolean): FilterListConfig<DispatchRecordsRequest> {
  const config: FilterListConfig<DispatchRecordsRequest> = {
    listKey: 'report-dispatch-activity-customer',
    get title() { return t('reports.titles.dispatchActivity'); },
    noun: ['dispatch', 'dispatches'],
    search: { get placeholder() { return t('filters.list.dispatch.search'); }, dates: false, range: null },
    sort: {
      options: [
        { field: 'date', get label() { return t('common.date'); }, kind: 'date' },
        { field: 'number', get label() { return t('common.dispatchNumber'); }, get chipLabel() { return t('filters.sort.numberChip'); }, kind: 'number' },
        { field: 'bags', get label() { return t('common.bags'); }, kind: 'amount' },
        ...(withWeight ? [{ field: 'weight', get label() { return t('common.weight'); }, kind: 'amount' as const }] : []),
      ],
      default: { field: 'date', order: 'desc' },
    },
    fields: [PERIOD_FIELD],
    fastFilters: [],
    toRequest: (values, sort, _ctx, today = todayInIST()) => ({
      period: reportPeriod(values, today),
      view: reportView(config, values, sort),
    }),
  };
  return config;
}

/** Date, Dispatch number and Bags: what a server that sends no weights can be sorted by. */
export const DISPATCH_ACTIVITY_CUSTOMER: FilterListConfig<DispatchRecordsRequest> = dispatchRecordsConfig(false);
/** The same with Weight (kg, highest first). Only for dispatches of which one has a weight. */
export const DISPATCH_ACTIVITY_CUSTOMER_WITH_WEIGHT: FilterListConfig<DispatchRecordsRequest> = dispatchRecordsConfig(true);

/** The weight of a dispatch if it has one (kg, above zero), else null: the server's 0 and a missing weight both mean none. */
export function dispatchWeight(dispatch: Pick<DispatchActivityRecord, 'total_weight'>): number | null {
  const weight = Number(dispatch.total_weight);
  return weight > 0 ? weight : null;
}

/** Whether any of the dispatches has a weight: when it is worth offering a sort by it. */
export const hasDispatchWeights = (dispatches: readonly Pick<DispatchActivityRecord, 'total_weight'>[] | undefined): boolean =>
  (dispatches ?? []).some(dispatch => dispatchWeight(dispatch) !== null);

/** What a search looks in: the dispatch's number, its supervisor, and the name of every item on it. */
const dispatchColumns = (dispatch: DispatchActivityRecord) => [
  dispatch.disp_no,
  dispatch.supervisor_name,
  ...(dispatch.items ?? []).map(item => item.item_name),
];

/** One customer's dispatches after the search, in the chosen order. */
export function dispatchRecordsView(rows: readonly DispatchActivityRecord[], view: ReportView): DispatchActivityRecord[] {
  return sortRows(
    rows.filter(dispatch => matchesSearch(view.words, dispatchColumns(dispatch))),
    view.sort,
    {
      date: dispatch => dispatch.disp_date,
      number: dispatch => dispatch.disp_no,
      bags: dispatch => dispatch.total_qty,
      // Only offered while a dispatch has a weight (DISPATCH_ACTIVITY_CUSTOMER_WITH_WEIGHT).
      weight: dispatch => dispatch.total_weight,
    }
  );
}
