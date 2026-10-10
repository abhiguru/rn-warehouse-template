/**
 * Filters of the item pricing list (Settings). No search and no sort: the list
 * is grouped by item, in item order.
 */
import { getItemStoragePrices } from '@/services/item-pricing-service';
import type { ItemPricingFilters, ItemPricingListParams } from '@/types/item-pricing.types';
import { resolveDateRange } from '../datePresets';
import { customerSource, itemSource } from '../pickerSources';
import type { DateRangeValue, FilterListConfig, NumberRangeValue } from '../types';
import { ids } from './shared';

export type ItemPricingRequest = Pick<ItemPricingListParams, 'p_filters'>;

export const ITEM_PRICING_FILTERS: FilterListConfig<ItemPricingRequest> = {
  listKey: 'item-pricing-list',
  title: 'Filter prices',
  noun: ['price', 'prices'],
  fields: [
    { kind: 'picker', key: 'items', label: 'Item', icon: 'package-variant', noun: ['item', 'items'], source: itemSource },
    { kind: 'picker', key: 'customers', label: 'Customer', icon: 'account', noun: ['customer', 'customers'], source: customerSource },
    {
      kind: 'choice',
      key: 'priceType',
      label: 'Price type',
      icon: 'cash',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'All' },
        { value: 'one_time', label: 'One-time' },
        { value: 'monthly', label: 'Monthly' },
      ],
    },
    { kind: 'numberRange', key: 'weight', label: 'Weight', icon: 'weight-kilogram', unit: 'kg' },
    // The date a price takes effect: whole days, as the backend compares them.
    { kind: 'dateRange', key: 'effective', label: 'Effective date', icon: 'calendar-range' },
    { kind: 'toggle', key: 'expired', label: 'Include expired', icon: 'clock-alert-outline' },
  ],
  fastFilters: ['items', 'customers', 'priceType', 'expired'],

  toRequest(values, _sort, _ctx, today = new Date()) {
    const filters: ItemPricingFilters = {};
    const itemIds = ids(values.items);
    if (itemIds.length > 0) filters.item_ids = itemIds;
    const customerIds = ids(values.customers);
    if (customerIds.length > 0) filters.customer_ids = customerIds;
    if (values.priceType === 'one_time' || values.priceType === 'monthly') filters.price_type = values.priceType;

    const weight = values.weight as NumberRangeValue | undefined;
    if (typeof weight?.min === 'number') filters.weight_min = weight.min;
    if (typeof weight?.max === 'number') filters.weight_max = weight.max;

    const dates = values.effective ? resolveDateRange(values.effective as DateRangeValue, today) : {};
    if (dates.from) filters.effective_from = dates.from;
    if (dates.to) filters.effective_to = dates.to;

    if (values.expired === true) filters.include_expired = true;
    return Object.keys(filters).length > 0 ? { p_filters: filters } : {};
  },

  async fetchCount(request) {
    const response = await getItemStoragePrices({ ...request, p_sort_by: 'item_name', p_sort_order: 'asc', p_limit: 1, p_offset: 0 });
    if (!response.success) throw new Error(response.message || 'Count failed');
    return response.pagination?.total_count ?? 0;
  },
};
