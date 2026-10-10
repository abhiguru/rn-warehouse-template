/**
 * Filters, search and sort of the GRN list.
 *
 * `toRequest` is the only place a filter value becomes a request parameter.
 * The list and the result count both call it, and a test checks that every
 * field changes the request, so a field cannot be shown and then ignored.
 */
import { getAllGRNItems, getAssignedCustomerGRNItems, type GRNFilters, type GRNListParams } from '@/services/grn-service';
import { t } from '@/i18n';
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
  // Labels are getters so they follow the app's language (see FieldBase in ../types).
  get title() { return t('filters.list.grn.title'); },
  // The backend counts receipt lines, not receipts.
  noun: ['item', 'items'],
  search: { get placeholder() { return t('filters.list.grn.search'); }, dates: true, range: 'document', dateField: 'date', rangeField: 'numberRange' },
  sort: {
    options: [
      { field: 'gr_no', get label() { return t('common.grnNumber'); }, get chipLabel() { return t('filters.sort.grnNumberChip'); }, kind: 'number' },
      { field: 'date', get label() { return t('common.date'); }, kind: 'date' },
    ],
    default: { field: 'gr_no', order: 'desc' },
  },
  fields: [
    {
      kind: 'choice',
      key: 'stock',
      get label() { return t('common.stock'); },
      icon: 'chart-bar',
      defaultValue: 'all',
      options: [
        { value: 'all', get label() { return t('common.all'); } },
        { value: 'in_stock', get label() { return t('common.inStock'); } },
        { value: 'out_of_stock', get label() { return t('common.outOfStock'); } },
      ],
    },
    { kind: 'dateRange', key: 'date', get label() { return t('common.date'); }, icon: 'calendar-range' },
    {
      kind: 'picker',
      key: 'customers',
      get label() { return t('common.customer'); },
      icon: 'account',
      noun: ['customer', 'customers'],
      source: customerSource,
      // A customer account with one customer has nothing to choose between.
      visibleTo: customerFilterVisible,
    },
    { kind: 'picker', key: 'items', get label() { return t('common.item'); }, icon: 'package-variant', noun: ['item', 'items'], source: itemSource },
    { kind: 'textRange', key: 'numberRange', get label() { return t('common.grnNumber'); }, icon: 'file-document-outline', get placeholder(): [string, string] { return [t('filters.range.from'), t('filters.range.to')]; } },
    // Whole kilograms: the backend column is an integer.
    { kind: 'numberRange', key: 'weight', get label() { return t('common.weight'); }, icon: 'weight-kilogram', get unit() { return t('filters.unit.kg'); }, integer: true },
    { kind: 'text', key: 'package', get label() { return t('filters.field.package'); }, icon: 'tag-outline', get placeholder() { return t('filters.placeholder.packageName'); } },
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
