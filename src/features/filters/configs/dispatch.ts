/**
 * Filters, search and sort of the dispatch list.
 *
 * `toRequest` is the only place a filter value becomes a request parameter
 * (see configs/grn.ts). Warehouse roles send the request to the backend;
 * customer accounts apply the same filter keys in the app
 * (`selectCustomerDispatches`), because their list is assembled there.
 */
import {
  getAssignedCustomerDispatchList,
  getDispatchListWithItems,
  type GetDispatchListWithItemsParams,
} from '@/services/dispatch-service';
import { t } from '@/i18n';
import { resolveDateRange } from '../datePresets';
import { currentSort, readSearch } from '../filterModel';
import { customerSource, itemSource } from '../pickerSources';
import type { DateRangeValue, FilterListConfig, NumberRangeValue, TextRangeValue } from '../types';
import { customerFilterVisible, endOfDay, ids, startOfDay } from './shared';

export interface DispatchListRequest {
  p_sort_by: 'dispatch_date' | 'disp_no';
  p_sort_order: 'asc' | 'desc';
  p_filters: NonNullable<GetDispatchListWithItemsParams['p_filters']>;
}

export const DISPATCH_FILTERS: FilterListConfig<DispatchListRequest> = {
  listKey: 'dispatch-list',
  // Labels are getters so they follow the app's language (see FieldBase in ../types).
  get title() { return t('filters.list.dispatch.title'); },
  noun: ['dispatch', 'dispatches'],
  search: { get placeholder() { return t('filters.list.dispatch.search'); }, dates: true, range: 'document', dateField: 'date', rangeField: 'numberRange' },
  sort: {
    options: [
      { field: 'dispatch_date', get label() { return t('common.date'); }, kind: 'date' },
      { field: 'disp_no', get label() { return t('common.dispatchNumber'); }, get chipLabel() { return t('filters.sort.numberChip'); }, kind: 'number' },
    ],
    default: { field: 'dispatch_date', order: 'desc' },
  },
  fields: [
    { kind: 'dateRange', key: 'date', get label() { return t('common.date'); }, icon: 'calendar-range' },
    {
      kind: 'picker',
      key: 'customers',
      get label() { return t('common.customer'); },
      icon: 'account',
      noun: ['customer', 'customers'],
      source: customerSource,
      visibleTo: customerFilterVisible,
    },
    { kind: 'picker', key: 'items', get label() { return t('common.item'); }, icon: 'package-variant', noun: ['item', 'items'], source: itemSource },
    { kind: 'textRange', key: 'numberRange', get label() { return t('common.dispatchNumber'); }, icon: 'file-document-outline', get placeholder(): [string, string] { return [t('filters.range.from'), t('filters.range.to')]; } },
    // Bags on one line of the dispatch, as the backend compares them.
    { kind: 'numberRange', key: 'bags', get label() { return t('filters.field.bagsOnLine'); }, icon: 'sack', get unit() { return t('filters.unit.bags'); }, integer: true },
    { kind: 'text', key: 'package', get label() { return t('filters.field.package'); }, icon: 'tag-outline', get placeholder() { return t('filters.placeholder.packageName'); } },
  ],
  fastFilters: ['date', 'customers', 'items'],

  toRequest(values, sort, _ctx, today = new Date()) {
    const filters: DispatchListRequest['p_filters'] = {};
    const search = readSearch(DISPATCH_FILTERS, values, today);

    const customerIds = ids(values.customers);
    if (customerIds.length > 0) filters.customer_ids = customerIds;
    const itemIds = ids(values.items);
    if (itemIds.length > 0) filters.item_ids = itemIds;

    const numbers = (values.numberRange as TextRangeValue | undefined) ?? search.range;
    if (numbers?.from?.trim()) filters.disp_no_from = numbers.from.trim();
    if (numbers?.to?.trim()) filters.disp_no_to = numbers.to.trim();

    const bags = values.bags as NumberRangeValue | undefined;
    if (typeof bags?.min === 'number') filters.disp_qty_min = Math.round(bags.min);
    if (typeof bags?.max === 'number') filters.disp_qty_max = Math.round(bags.max);

    if (typeof values.package === 'string' && values.package.trim()) filters.package_mark = values.package.trim();
    if (search.text) filters.search = search.text;

    const dates = values.date ? resolveDateRange(values.date as DateRangeValue, today) : search.date ?? {};
    if (dates.from) filters.date_from = startOfDay(dates.from);
    if (dates.to) filters.date_to = endOfDay(dates.to);

    const active = currentSort(DISPATCH_FILTERS, sort) ?? DISPATCH_FILTERS.sort!.default;
    return {
      p_sort_by: active.field as DispatchListRequest['p_sort_by'],
      p_sort_order: active.order,
      p_filters: filters,
    };
  },

  async fetchCount(request, ctx) {
    const response = ctx.isWarehouseRole
      ? await getDispatchListWithItems({ ...request, p_limit: 1, offset: 0, p_include_items: false })
      : await getAssignedCustomerDispatchList(ctx.assignedCustomers.map(customer => customer.id), { ...request, p_limit: 1, offset: 0 });
    if (!response.success) throw new Error(response.message || 'Count failed');
    return response.data.pagination.total_count;
  },
};
