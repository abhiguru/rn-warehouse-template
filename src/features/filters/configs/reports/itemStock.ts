/**
 * Item stock summary: every item in stock, across the customers the account
 * may see. The one paged report: the server searches, sorts and pages it
 * (get_item_wise_stock_list, backend migration 52), so its request is shaped
 * for the server (`server`), not only for the app (`view`).
 *
 * `itemStockFallbackView` is what the app does itself with a backend older
 * than migration 52, which cannot sort: the rows loaded so far, in the chosen
 * order. Its search keeps the rows that have every word of the search in the
 * item name. The server already kept only the names that contain the whole
 * search, so on the server's rows it removes nothing; it is there so that the
 * view stands on its own (reportViews.test.ts).
 */
import { t } from '@/i18n';
import type { ItemStockSortBy, ItemStockSortOrder } from '@/services/stock-service';
import type { ItemWiseStockItem } from '@/types/stock.types';
import { readSearch } from '../../filterModel';
import { matchesSearch } from '../../searchMatch';
import type { FilterListConfig } from '../../types';
import { reportView, sortRows, type ReportRequest, type ReportView } from './shared';

/** What get_item_wise_stock_list is asked with, besides the customer and the page. */
export interface ItemStockServerQuery {
  /** The search as typed (two characters or more), or undefined for none. */
  searchQuery?: string;
  sortBy: ItemStockSortBy;
  sortOrder: ItemStockSortOrder;
}
export type ItemStockRequest = ReportRequest & { server: ItemStockServerQuery };

/** The sort fields are the server's own names for them. */
const SORT_FIELDS: readonly ItemStockSortBy[] = ['item_name', 'total_stock', 'total_qty', 'grn_count'];
const isSortField = (field: string | undefined): field is ItemStockSortBy => SORT_FIELDS.includes(field as ItemStockSortBy);

export const ITEM_STOCK: FilterListConfig<ItemStockRequest> = {
  listKey: 'report-item-stock',
  get title() { return t('reports.titles.itemStockSummary'); },
  noun: ['item', 'items'],
  search: { get placeholder() { return t('reports.itemStockSummary.searchItems'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'item_name', get label() { return t('common.item'); }, kind: 'text' },
      { field: 'total_stock', get label() { return t('common.stock'); }, kind: 'amount' },
      { field: 'total_qty', get label() { return t('reports.stockAging.receivedQuantity'); }, kind: 'amount' },
      { field: 'grn_count', get label() { return t('reports.sort.grns'); }, kind: 'amount' },
    ],
    default: { field: 'item_name', order: 'asc' },
  },
  // Today's stock: no period, and no filter besides the search.
  fields: [],
  fastFilters: [],
  toRequest: (values, sort) => {
    const search = readSearch(ITEM_STOCK, values).text;
    const field = sort?.field;
    return {
      view: reportView(ITEM_STOCK, values, sort),
      server: {
        searchQuery: search || undefined,
        sortBy: isSortField(field) ? field : 'item_name',
        sortOrder: sort?.order === 'desc' ? 'desc' : 'asc',
      },
    };
  },
};

/** The items loaded so far in the chosen order, for a backend that could not sort them (see above). */
export function itemStockFallbackView(rows: readonly ItemWiseStockItem[], view: ReportView): ItemWiseStockItem[] {
  return sortRows(
    rows.filter(row => matchesSearch(view.words, [row.item_name])),
    view.sort,
    {
      item_name: row => row.item_name,
      total_stock: row => row.total_stock,
      total_qty: row => row.total_qty,
      grn_count: row => row.grn_count,
    }
  );
}
