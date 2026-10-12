/**
 * Customer activity report: its customers list, and one customer's dashboard.
 * Both levels share the period. The dashboard has no rows to search or sort:
 * its configuration is only the period chip.
 */
import { t } from '@/i18n';
import type { CustomerActivityRow } from '@/types/report.types';
import { todayInIST } from '@/utils/formatters';
import { matchesSearch } from '../../searchMatch';
import type { FilterListConfig } from '../../types';
import { PERIOD_FIELD, reportPeriod, reportView, sortRows, type PeriodReportRequest, type ReportView } from './shared';

export type CustomerActivityCustomersRequest = PeriodReportRequest;

export const CUSTOMER_ACTIVITY_CUSTOMERS: FilterListConfig<CustomerActivityCustomersRequest> = {
  listKey: 'report-customer-activity',
  // Labels are getters so they follow the app's language (see FieldBase in ../../types).
  get title() { return t('reports.titles.customerActivity'); },
  noun: ['customer', 'customers'],
  search: { get placeholder() { return t('reports.components.searchCustomers'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'lastActive', get label() { return t('reports.sort.lastActive'); }, kind: 'date' },
      { field: 'stock', get label() { return t('common.stock'); }, kind: 'amount' },
      { field: 'invoiced', get label() { return t('reports.sort.invoicedAmount'); }, kind: 'amount' },
      { field: 'name', get label() { return t('common.customer'); }, kind: 'text' },
    ],
    default: { field: 'lastActive', order: 'desc' },
  },
  fields: [PERIOD_FIELD],
  fastFilters: [],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: reportView(CUSTOMER_ACTIVITY_CUSTOMERS, values, sort),
  }),
};

/** The customers a search leaves, in the chosen order. */
export function customerActivityCustomersView(rows: readonly CustomerActivityRow[], view: ReportView): CustomerActivityRow[] {
  return sortRows(
    rows.filter(row => matchesSearch(view.words, [row.customer_name])),
    view.sort,
    {
      lastActive: row => row.last_activity_date,
      stock: row => row.current_stock,
      invoiced: row => row.total_invoice_amount,
      name: row => row.customer_name,
    }
  );
}

export type CustomerActivityDetailRequest = PeriodReportRequest;

/** One customer's dashboard: the period, nothing else. */
export const CUSTOMER_ACTIVITY_CUSTOMER: FilterListConfig<CustomerActivityDetailRequest> = {
  listKey: 'report-customer-activity-customer',
  get title() { return t('reports.titles.customerActivity'); },
  noun: ['customer', 'customers'],
  fields: [PERIOD_FIELD],
  fastFilters: [],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: reportView(CUSTOMER_ACTIVITY_CUSTOMER, values, sort),
  }),
};
