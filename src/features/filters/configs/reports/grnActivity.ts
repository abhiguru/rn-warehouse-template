/**
 * GRN activity report: its customers list, and one customer's GRNs.
 * The two levels sort and search separately; they share the period.
 */
import { t } from '@/i18n';
import type { CustomerGRNSummary, GRNActivityRecord } from '@/types/report.types';
import { todayInIST } from '@/utils/formatters';
import { matchesSearch } from '../../searchMatch';
import type { FilterListConfig } from '../../types';
import { PERIOD_FIELD, reportPeriod, reportView, sortRows, type PeriodReportRequest, type ReportView } from './shared';

export type GRNCustomersRequest = PeriodReportRequest;

export const GRN_ACTIVITY_CUSTOMERS: FilterListConfig<GRNCustomersRequest> = {
  listKey: 'report-grn-activity',
  // Labels are getters so they follow the app's language (see FieldBase in ../../types).
  get title() { return t('reports.titles.grnActivity'); },
  noun: ['customer', 'customers'],
  search: { get placeholder() { return t('reports.components.searchCustomers'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'bags', get label() { return t('common.bags'); }, kind: 'amount' },
      { field: 'grns', get label() { return t('reports.sort.grns'); }, kind: 'amount' },
      { field: 'latest', get label() { return t('reports.sort.latestGrn'); }, kind: 'date' },
      { field: 'name', get label() { return t('common.customer'); }, kind: 'text' },
    ],
    default: { field: 'bags', order: 'desc' },
  },
  fields: [PERIOD_FIELD],
  fastFilters: [],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: reportView(GRN_ACTIVITY_CUSTOMERS, values, sort),
  }),
};

/** The customers a search leaves, in the chosen order. */
export function grnCustomersView(rows: readonly CustomerGRNSummary[], view: ReportView): CustomerGRNSummary[] {
  return sortRows(
    rows.filter(row => matchesSearch(view.words, [row.customer_name])),
    view.sort,
    {
      bags: row => row.total_quantity,
      grns: row => row.grn_count,
      latest: row => row.latest_grn_date,
      name: row => row.customer_name,
    }
  );
}

export type GRNInvoicedChoice = 'all' | 'invoiced' | 'not_invoiced';
export type GRNRecordsRequest = PeriodReportRequest<{ invoiced: GRNInvoicedChoice }>;

export const GRN_ACTIVITY_CUSTOMER: FilterListConfig<GRNRecordsRequest> = {
  listKey: 'report-grn-activity-customer',
  get title() { return t('reports.titles.grnActivity'); },
  noun: ['GRN', 'GRNs'],
  search: { get placeholder() { return t('filters.list.grn.search'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'date', get label() { return t('common.date'); }, kind: 'date' },
      { field: 'number', get label() { return t('common.grnNumber'); }, get chipLabel() { return t('filters.sort.grnNumberChip'); }, kind: 'number' },
      { field: 'bags', get label() { return t('common.bags'); }, kind: 'amount' },
      { field: 'stock', get label() { return t('reports.sort.stockLeft'); }, kind: 'amount' },
    ],
    default: { field: 'date', order: 'desc' },
  },
  fields: [
    PERIOD_FIELD,
    {
      kind: 'choice',
      key: 'invoiced',
      get label() { return t('reports.filters.invoicing'); },
      icon: 'receipt-text-outline',
      defaultValue: 'all',
      options: [
        { value: 'all', get label() { return t('common.all'); } },
        { value: 'invoiced', get label() { return t('reports.grnActivity.invoiced'); } },
        { value: 'not_invoiced', get label() { return t('reports.grnActivity.notInvoiced'); } },
      ],
    },
  ],
  fastFilters: ['invoiced'],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: {
      ...reportView(GRN_ACTIVITY_CUSTOMER, values, sort),
      invoiced: values.invoiced === 'invoiced' || values.invoiced === 'not_invoiced' ? values.invoiced : 'all',
    },
  }),
};

/** What a search looks in: the GRN's own numbers and names, and every item on it. */
const grnColumns = (grn: GRNActivityRecord) => [
  grn.gr_no,
  grn.sender_name,
  grn.supervisor_name,
  grn.registration,
  grn.invoice_status?.invoice_number,
  ...(grn.items ?? []).flatMap(item => [item.item_name, item.packaging, item.package_mark]),
];

/** One customer's GRNs after the search and the invoicing choice, in the chosen order. */
export function grnRecordsView(rows: readonly GRNActivityRecord[], view: GRNRecordsRequest['view']): GRNActivityRecord[] {
  return sortRows(
    rows.filter(grn => {
      if (view.invoiced !== 'all' && Boolean(grn.invoice_status?.is_invoiced) !== (view.invoiced === 'invoiced')) return false;
      return matchesSearch(view.words, grnColumns(grn));
    }),
    view.sort,
    {
      date: grn => grn.grn_date,
      number: grn => grn.gr_no,
      bags: grn => grn.total_qty,
      stock: grn => grn.dispatch_summary?.current_stock,
    }
  );
}
