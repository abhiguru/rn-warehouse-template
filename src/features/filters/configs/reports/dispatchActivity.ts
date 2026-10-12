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

export const DISPATCH_ACTIVITY_CUSTOMER: FilterListConfig<DispatchRecordsRequest> = {
  listKey: 'report-dispatch-activity-customer',
  get title() { return t('reports.titles.dispatchActivity'); },
  noun: ['dispatch', 'dispatches'],
  search: { get placeholder() { return t('filters.list.dispatch.search'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'date', get label() { return t('common.date'); }, kind: 'date' },
      { field: 'number', get label() { return t('common.dispatchNumber'); }, get chipLabel() { return t('filters.sort.numberChip'); }, kind: 'number' },
      { field: 'bags', get label() { return t('common.bags'); }, kind: 'amount' },
    ],
    default: { field: 'date', order: 'desc' },
  },
  fields: [PERIOD_FIELD],
  fastFilters: [],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: reportView(DISPATCH_ACTIVITY_CUSTOMER, values, sort),
  }),
};

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
    }
  );
}
