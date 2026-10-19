/**
 * Filters, search and sort of the GRN list.
 *
 * `toRequest` is the only place a filter value becomes a request parameter.
 * The list and the result count both call it, and a test checks that every
 * field changes the request, so a field cannot be shown and then ignored.
 */
import { getAllGRNItems, getAssignedCustomerGRNItems, withReceiptPages, type GRNFilters, type GRNListParams } from '@/services/grn-service';
import { t } from '@/i18n';
import { resolveDateRange } from '../datePresets';
import { currentSort, readSearch } from '../filterModel';
import { customerSource, itemSource } from '../pickerSources';
import { customerFilterVisible, documentRange, endOfDay, ids, startOfDay } from './shared';
import type {
  DateRangeValue,
  FilterListConfig,
  NumberRangeValue,
  TextRangeValue,
} from '../types';

export type GrnListRequest = Pick<GRNListParams, 'p_date_from' | 'p_date_to' | 'p_filters' | 'p_sort_by' | 'p_sort_order'>;

/**
 * Whether the request's filters leave out lines of the GRNs they return. The line-level filters (Stock other
 * than All, Item, Weight each, Package and the search text) return only the matching lines of each GRN, so
 * the card's item count and totals are those of the matching lines, not of the whole GRN. Customer, Date and
 * GRN number keep whole GRNs.
 */
export function grnLinesHidden(request: Pick<GrnListRequest, 'p_filters'>): boolean {
  const filters = request.p_filters;
  if (!filters) return false;
  return (
    (filters.stock_status !== undefined && filters.stock_status !== 'all') ||
    Boolean(filters.item_ids?.length) ||
    filters.weight_min !== undefined ||
    filters.weight_max !== undefined ||
    Boolean(filters.package_mark) ||
    Boolean(filters.search)
  );
}

export const GRN_FILTERS: FilterListConfig<GrnListRequest> = {
  listKey: 'grn-list',
  // Labels are getters so they follow the app's language (see FieldBase in ../types).
  get title() { return t('filters.list.grn.title'); },
  // Counted in receipts (backend migration 98): "Show 9 GRNs".
  noun: ['grn', 'grns'],
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
      // The words of the cards' stock tags (style guide 3.5). Each is per line: a GRN shows its matching lines.
      options: [
        { value: 'all', get label() { return t('common.all'); } },
        { value: 'in_stock', get label() { return t('common.inStock'); } },
        {
          value: 'low_stock',
          get label() { return t('common.lowStock'); },
          // A facility without migration 98 answers this wrongly (staff: every line, customer: none): offered
          // only once its list has answered in receipts (code review 2026-10-18, R1-07, R3-02).
          visibleTo: (ctx) => ctx.pagesByReceipt === true,
        },
        { value: 'out_of_stock', get label() { return t('grn.status.fullyDispatched'); } },
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
    // The weight of one package, in whole kilograms: the backend column is an integer.
    { kind: 'numberRange', key: 'weight', get label() { return t('common.weightEach'); }, icon: 'weight-kilogram', get unit() { return t('filters.unit.kg'); }, integer: true },
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

    const numbers = documentRange((values.numberRange as TextRangeValue | undefined) ?? search.range);
    if (numbers.from) filters.gr_no_from = numbers.from;
    if (numbers.to) filters.gr_no_to = numbers.to;

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
    const params = withReceiptPages({ ...request, p_limit: 1, p_offset: 0 });
    const response = ctx.isWarehouseRole
      ? await getAllGRNItems(params)
      : await getAssignedCustomerGRNItems(ctx.assignedCustomers.map(customer => customer.id), params);
    if (!response.success) throw new Error(response.message || 'Count failed');
    // A facility without migration 98 counts lines, not GRNs: no number then, and the button reads "Show results".
    if (response.data.pagination.unit !== 'receipt') throw new Error('Count of GRNs not available');
    return response.data.pagination.total_count;
  },
};
