/**
 * Search and the one filter of the Orders list, and the search of the Queue.
 *
 * The backend has one fixed order for orders, so these lists have no sort and
 * no "Sort and filter" page: the search field and one chip are all there is.
 * Orders show no date or number, so nothing typed is read as a date or range.
 */
import { normalizeDigits, t } from '@/i18n';
import type { OrderFilters } from '@/types/order.types';
import type { FilterListConfig } from '../types';

export type OrderListRequest = Pick<OrderFilters, 'has_items' | 'search'>;

const toRequest = (withItemsAlways: boolean): FilterListConfig<OrderListRequest>['toRequest'] => values => {
  const request: OrderListRequest = {};
  if (withItemsAlways || values.withItems === true) request.has_items = true;
  if (typeof values.search === 'string' && values.search.trim()) request.search = normalizeDigits(values.search).trim().split(/\s+/).join(' ');
  return request;
};

// Chips apply on tap and these lists have no page, so no result count is ever asked for.
const noCount = async () => {
  throw new Error('The order lists have no result count');
};

export const ORDER_FILTERS: FilterListConfig<OrderListRequest> = {
  listKey: 'order-list',
  // Labels are getters so they follow the app's language (see FieldBase in ../types).
  get title() { return t('filters.list.order.title'); },
  noun: ['order', 'orders'],
  search: { get placeholder() { return t('filters.list.order.search'); }, dates: false, range: null },
  fields: [{ kind: 'toggle', key: 'withItems', get label() { return t('filters.field.withItems'); }, icon: 'cart-check' }],
  fastFilters: ['withItems'],
  toRequest: toRequest(false),
  fetchCount: noCount,
};

/** The Queue lists only orders that have items. */
export const ORDER_QUEUE_FILTERS: FilterListConfig<OrderListRequest> = {
  listKey: 'order-queue-list',
  get title() { return t('filters.list.queue.title'); },
  noun: ['order', 'orders'],
  search: { get placeholder() { return t('filters.list.queue.search'); }, dates: false, range: null },
  fields: [],
  fastFilters: [],
  toRequest: toRequest(true),
  fetchCount: noCount,
};
