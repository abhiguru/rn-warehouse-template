/**
 * Invoice history report: its customers list, and one customer's invoices.
 * The two levels sort and search separately; they share the period.
 */
import { t } from '@/i18n';
import type { CustomerInvoiceSummary, InvoiceHistoryRecord } from '@/types/report.types';
import { todayInIST } from '@/utils/formatters';
import { matchesSearch } from '../../searchMatch';
import type { FilterListConfig } from '../../types';
import { invoicePayment } from './invoicePayment';
import { PERIOD_FIELD, reportPeriod, reportView, sortRows, type PeriodReportRequest, type ReportView } from './shared';

export type InvoiceCustomersRequest = PeriodReportRequest;

export const INVOICE_HISTORY_CUSTOMERS: FilterListConfig<InvoiceCustomersRequest> = {
  listKey: 'report-invoice-history',
  // Labels are getters so they follow the app's language (see FieldBase in ../../types).
  get title() { return t('reports.titles.invoiceHistory'); },
  noun: ['customer', 'customers'],
  search: { get placeholder() { return t('reports.components.searchCustomers'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'amount', get label() { return t('common.amount'); }, kind: 'amount' },
      { field: 'invoices', get label() { return t('reports.invoiceHistory.invoices'); }, kind: 'amount' },
      { field: 'name', get label() { return t('common.customer'); }, kind: 'text' },
    ],
    default: { field: 'amount', order: 'desc' },
  },
  fields: [PERIOD_FIELD],
  fastFilters: [],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: reportView(INVOICE_HISTORY_CUSTOMERS, values, sort),
  }),
};

/**
 * The customers a search leaves, in the chosen order. The amount is the customer's
 * `total_amount`, the sum of the invoices' `total`: right on every server, unlike
 * `net_amount`, which counts labour and tax twice before backend migration 61.
 */
export function invoiceCustomersView(rows: readonly CustomerInvoiceSummary[], view: ReportView): CustomerInvoiceSummary[] {
  return sortRows(
    rows.filter(row => matchesSearch(view.words, [row.customer_name])),
    view.sort,
    {
      amount: row => row.total_amount,
      invoices: row => row.invoice_count,
      name: row => row.customer_name,
    }
  );
}

export type InvoicePaymentChoice = 'all' | 'paid' | 'pending';
export type InvoiceRecordsRequest = PeriodReportRequest<{ payment: InvoicePaymentChoice }>;

export const INVOICE_HISTORY_CUSTOMER: FilterListConfig<InvoiceRecordsRequest> = {
  listKey: 'report-invoice-history-customer',
  get title() { return t('reports.titles.invoiceHistory'); },
  noun: ['invoice', 'invoices'],
  search: { get placeholder() { return t('filters.list.invoice.search'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'date', get label() { return t('common.date'); }, kind: 'date' },
      { field: 'number', get label() { return t('common.invoiceNumber'); }, get chipLabel() { return t('filters.sort.numberChip'); }, kind: 'number' },
      { field: 'total', get label() { return t('common.amount'); }, kind: 'amount' },
    ],
    default: { field: 'date', order: 'desc' },
  },
  fields: [
    PERIOD_FIELD,
    {
      kind: 'choice',
      key: 'payment',
      get label() { return t('reports.filters.payment'); },
      icon: 'cash-check',
      defaultValue: 'all',
      options: [
        { value: 'all', get label() { return t('common.all'); } },
        { value: 'paid', get label() { return t('reports.customerActivity.paid'); } },
        { value: 'pending', get label() { return t('common.pending'); } },
      ],
    },
  ],
  fastFilters: ['payment'],
  toRequest: (values, sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: {
      ...reportView(INVOICE_HISTORY_CUSTOMER, values, sort),
      payment: values.payment === 'paid' || values.payment === 'pending' ? values.payment : 'all',
    },
  }),
};

/** What a search looks in: the invoice and GRN numbers, and the name of every item billed. */
const invoiceColumns = (invoice: InvoiceHistoryRecord) => [
  invoice.invoice_number,
  invoice.grn_ref,
  ...(invoice.line_items ?? []).map(line => line.item_name),
];

/**
 * One customer's invoices after the search and the payment choice, in the chosen
 * order. "Paid" takes the invoices on which nothing is owed and "Pending" those
 * with a balance, a part-paid one included (see invoicePayment).
 */
export function invoiceRecordsView(rows: readonly InvoiceHistoryRecord[], view: InvoiceRecordsRequest['view']): InvoiceHistoryRecord[] {
  return sortRows(
    rows.filter(invoice => {
      if (view.payment !== 'all' && invoicePayment(invoice).status !== view.payment) return false;
      return matchesSearch(view.words, invoiceColumns(invoice));
    }),
    view.sort,
    {
      date: invoice => invoice.invoice_date,
      number: invoice => invoice.invoice_number,
      total: invoice => invoice.total,
    }
  );
}
