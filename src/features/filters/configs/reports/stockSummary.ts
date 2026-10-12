/**
 * Stock summary report: its customers list, and one customer's items.
 *
 * The report is today's stock, so it has no period: neither configuration has
 * PERIOD_FIELD, and the request carries no `period`. The two levels search and
 * sort separately.
 */
import { t } from '@/i18n';
import type { CustomerStockRow, StockItemSummary } from '@/types/report.types';
import { matchesSearch } from '../../searchMatch';
import type { FilterListConfig } from '../../types';
import { reportView, sortRows, type ReportRequest, type ReportView } from './shared';

/** A request of today's stock: the view only. */
export type StockSummaryRequest = ReportRequest & { period?: undefined };

export const STOCK_SUMMARY_CUSTOMERS: FilterListConfig<StockSummaryRequest> = {
  listKey: 'report-stock-summary',
  // Labels are getters so they follow the app's language (see FieldBase in ../../types).
  get title() { return t('reports.titles.stockSummary'); },
  noun: ['customer', 'customers'],
  search: { get placeholder() { return t('reports.components.searchCustomers'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'stock', get label() { return t('common.stock'); }, kind: 'amount' },
      { field: 'items', get label() { return t('common.items'); }, kind: 'amount' },
      { field: 'grns', get label() { return t('reports.sort.grns'); }, kind: 'amount' },
      { field: 'name', get label() { return t('common.customer'); }, kind: 'text' },
    ],
    default: { field: 'stock', order: 'desc' },
  },
  fields: [],
  fastFilters: [],
  toRequest: (values, sort) => ({ view: reportView(STOCK_SUMMARY_CUSTOMERS, values, sort) }),
};

/** The customers a search leaves, in the chosen order. */
export function stockSummaryCustomersView(rows: readonly CustomerStockRow[], view: ReportView): CustomerStockRow[] {
  return sortRows(
    rows.filter(row => matchesSearch(view.words, [row.customer_name])),
    view.sort,
    {
      stock: row => row.total_stock,
      items: row => row.item_count,
      grns: row => row.grn_count,
      name: row => row.customer_name,
    }
  );
}

export const STOCK_SUMMARY_CUSTOMER: FilterListConfig<StockSummaryRequest> = {
  listKey: 'report-stock-summary-customer',
  get title() { return t('reports.titles.stockSummary'); },
  noun: ['item', 'items'],
  search: { get placeholder() { return t('reports.stockSummary.searchItems'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'stock', get label() { return t('common.stock'); }, kind: 'amount' },
      { field: 'name', get label() { return t('common.item'); }, kind: 'text' },
    ],
    default: { field: 'stock', order: 'desc' },
  },
  fields: [],
  fastFilters: [],
  toRequest: (values, sort) => ({ view: reportView(STOCK_SUMMARY_CUSTOMER, values, sort) }),
};

/** What a search looks in: the item's name and the number of every GRN it is on. */
const itemColumns = (item: StockItemSummary) => [item.item_name, ...(item.grns ?? []).map(grn => grn.gr_no)];

/**
 * One customer's items after the search, in the chosen order. The screen applies
 * it to the items in stock and to the out-of-stock items alike.
 */
export function stockSummaryItemsView(rows: readonly StockItemSummary[], view: ReportView): StockItemSummary[] {
  return sortRows(
    rows.filter(item => matchesSearch(view.words, itemColumns(item))),
    view.sort,
    {
      stock: item => item.total_stock,
      name: item => item.item_name,
    }
  );
}
