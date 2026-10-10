/**
 * Filters, search and sort of the GRN list.
 *
 * `toRequest` is the only place a filter value becomes a request parameter.
 * The list and the result count both call it, and a test checks that every
 * field changes the request, so a field cannot be shown and then ignored.
 */
import { getAllGRNItems, getAssignedCustomerGRNItems, type GRNFilters, type GRNListParams } from '@/services/grn-service';
import { resolveDateRange } from '../datePresets';
import { currentSort, readSearch } from '../filterModel';
import { customerSource, itemSource } from '../pickerSources';
import { customerFilterVisible, endOfDay, ids, startOfDay } from './shared';
import type {
  DateRangeValue,
  FilterListConfig,
  NumberRangeValue,
  TextRangeValue,
} from '../types';

export type GrnListRequest = Pick<GRNListParams, 'p_date_from' | 'p_date_to' | 'p_filters' | 'p_sort_by' | 'p_sort_order'>;

export const GRN_FILTERS: FilterListConfig<GrnListRequest> = {
  listKey: 'grn-list',
  title: 'Filter GRNs',
  // The backend counts receipt lines, not receipts.
  noun: ['item', 'items'],
  search: { placeholder: 'Search GRNs', dates: true, range: 'document', dateField: 'date', rangeField: 'numberRange' },
  sort: {
    options: [
      { field: 'gr_no', label: 'GRN number', chipLabel: 'GRN no.', kind: 'number' },
      { field: 'date', label: 'Date', kind: 'date' },
    ],
    default: { field: 'gr_no', order: 'desc' },
  },
  fields: [
    {
      kind: 'choice',
      key: 'stock',
      label: 'Stock',
      icon: 'chart-bar',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'All' },
        { value: 'in_stock', label: 'In stock' },
        { value: 'out_of_stock', label: 'Out of stock' },
      ],
    },
    { kind: 'dateRange', key: 'date', label: 'Date', icon: 'calendar-range' },
    {
      kind: 'picker',
      key: 'customers',
      label: 'Customer',
      icon: 'account',
      noun: ['customer', 'customers'],
      source: customerSource,
      // A customer account with one customer has nothing to choose between.
      visibleTo: customerFilterVisible,
    },
    { kind: 'picker', key: 'items', label: 'Item', icon: 'package-variant', noun: ['item', 'items'], source: itemSource },
    { kind: 'textRange', key: 'numberRange', label: 'GRN number', icon: 'file-document-outline', placeholder: ['From', 'To'] },
    // Whole kilograms: the backend column is an integer.
    { kind: 'numberRange', key: 'weight', label: 'Weight', icon: 'weight-kilogram', unit: 'kg', integer: true },
    { kind: 'text', key: 'package', label: 'Package', icon: 'tag-outline', placeholder: 'Package name' },
  ],
  fastFilters: ['stock', 'date', 'customers'],

  toRequest(values, sort, ctx, today = new Date()) {
    const filters: GRNFilters = {};
    const search = readSearch(GRN_FILTERS, values, today);

    if (typeof values.stock === 'string' && values.stock !== 'all') {
      filters.stock_status = values.stock as GRNFilters['stock_status'];
    }
    const customerIds = ids(values.customers);
    if (customerIds.length > 0) filters.customer_ids = customerIds;
    const itemIds = ids(values.items);
    if (itemIds.length > 0) filters.item_ids = itemIds;

    const numbers = (values.numberRange as TextRangeValue | undefined) ?? search.range;
    if (numbers?.from?.trim()) filters.gr_no_from = numbers.from.trim();
    if (numbers?.to?.trim()) filters.gr_no_to = numbers.to.trim();

    const weight = values.weight as NumberRangeValue | undefined;
    if (typeof weight?.min === 'number') filters.weight_min = Math.round(weight.min);
    if (typeof weight?.max === 'number') filters.weight_max = Math.round(weight.max);

    if (typeof values.package === 'string' && values.package.trim()) filters.package_mark = values.package.trim();
    if (search.text) filters.search = search.text;

    const dates = values.date ? resolveDateRange(values.date as DateRangeValue, today) : search.date ?? {};
    const active = currentSort(GRN_FILTERS, sort) ?? GRN_FILTERS.sort!.default;
    const request: GrnListRequest = {
      p_sort_by: active.field as GRNListParams['p_sort_by'],
      p_sort_order: active.order,
    };
    if (Object.keys(filters).length > 0) request.p_filters = filters;
    if (dates.from) request.p_date_from = startOfDay(dates.from);
    if (dates.to) request.p_date_to = endOfDay(dates.to);
    return request;
  },

  async fetchCount(request, ctx) {
    const params = { ...request, p_limit: 1, p_offset: 0 };
    const response = ctx.isWarehouseRole
      ? await getAllGRNItems(params)
      : await getAssignedCustomerGRNItems(ctx.assignedCustomers.map(customer => customer.id), params);
    if (!response.success) throw new Error(response.message || 'Count failed');
    return response.data.pagination.total_count;
  },
};
