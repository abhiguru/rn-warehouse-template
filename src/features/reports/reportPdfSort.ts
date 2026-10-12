/**
 * The sort a report PDF is asked for (generate-report-pdf), from the sort the
 * screen shows.
 *
 * The screens sort by their own field names; the PDF sorts by its columns
 * (backend functions/_shared/report-definitions.ts: every column key of the
 * level is a sort the server accepts). One table, keyed by report and level,
 * holds the column for each screen sort. A screen sort the PDF has no column
 * for is not sent, so the PDF keeps its own order instead of being refused
 * (the server accepts only short lower-case names).
 */
import type { SortState } from '@/features/filters/types';
import type { ReportPdfName, ReportPdfSort } from '@/services/pdf-service';

/** The all-customers list, or one customer's report. */
export type ReportPdfLevel = 'customers' | 'customer';

type SortColumns = Readonly<Record<string, string>>;

const ITEM_STOCK: SortColumns = { item_name: 'item', total_stock: 'stock', total_qty: 'received', grn_count: 'grns' };

/** Screen sort field → PDF column, per report and level. */
export const REPORT_PDF_SORT_COLUMNS: Readonly<Record<ReportPdfName, Readonly<Record<ReportPdfLevel, SortColumns>>>> = {
  'grn-activity': {
    customers: { bags: 'quantity', grns: 'grns', latest: 'latest', name: 'customer' },
    customer: { date: 'date', number: 'gr_no', bags: 'quantity', stock: 'stock' },
  },
  'dispatch-activity': {
    customers: { bags: 'quantity', dispatches: 'dispatches', name: 'customer' },
    // The PDF has no weight column: a sort by weight is not sent.
    customer: { date: 'date', number: 'disp_no', bags: 'quantity' },
  },
  'invoice-history': {
    // The screen's amount is the net amount.
    customers: { amount: 'net', invoices: 'invoices', name: 'customer' },
    customer: { date: 'date', number: 'invoice_no', total: 'net' },
  },
  'customer-activity': {
    customers: { lastActive: 'last_activity', stock: 'stock', invoiced: 'amount', name: 'customer' },
    // One customer's dashboard has no sort.
    customer: {},
  },
  'stock-summary': {
    customers: { stock: 'stock', items: 'items', grns: 'grns', name: 'customer' },
    customer: { stock: 'stock', name: 'item' },
  },
  'stock-aging': {
    customers: { age: 'average_age', stock: 'stock', name: 'customer' },
    customer: { age: 'age', stock: 'stock', item: 'item' },
  },
  // One list for both levels; the sorts are the list RPC's own names.
  'item-stock-summary': { customers: ITEM_STOCK, customer: ITEM_STOCK },
};

/** The PDF's `{ field, order }` for the screen's sort; undefined when there is no sort or the PDF has no column for it. */
export function reportPdfSort(report: ReportPdfName, level: ReportPdfLevel, sort: SortState | undefined): ReportPdfSort | undefined {
  if (!sort) return undefined;
  const columns = REPORT_PDF_SORT_COLUMNS[report]?.[level];
  // Own keys only: a field such as "constructor" names no column.
  if (!columns || !Object.prototype.hasOwnProperty.call(columns, sort.field)) return undefined;
  return { field: columns[sort.field], order: sort.order };
}
