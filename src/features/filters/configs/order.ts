/**
 * Search and the one filter of the Orders list, and the search of the Queue.
 *
 * The backend has one fixed order for orders, so these lists have no sort and
 * no "Sort and filter" page: the search field and one chip are all there is.
 * Orders show no date or number, so nothing typed is read as a date or range.
 */
import type { OrderFilters } from '@/types/order.types';
import type { FilterListConfig } from '../types';

export type OrderListRequest = Pick<OrderFilters, 'has_items' | 'search'>;

const toRequest = (withItemsAlways: boolean): FilterListConfig<OrderListRequest>['toRequest'] => values => {
  const request: OrderListRequest = {};
  if (withItemsAlways || values.withItems === true) request.has_items = true;
  if (typeof values.search === 'string' && values.search.trim()) request.search = values.search.trim().split(/\s+/).join(' ');
  return request;
};

// Chips apply on tap and these lists have no page, so no result count is ever asked for.
const noCount = async () => {
  throw new Error('The order lists have no result count');
};

export const ORDER_FILTERS: FilterListConfig<OrderListRequest> = {
  listKey: 'order-list',
  title: 'Filter orders',
  noun: ['order', 'orders'],
  search: { placeholder: 'Search orders', dates: false, range: null },
  fields: [{ kind: 'toggle', key: 'withItems', label: 'With items', icon: 'cart-check' }],
  fastFilters: ['withItems'],
  toRequest: toRequest(false),
  fetchCount: noCount,
};

/** The Queue lists only orders that have items. */
export const ORDER_QUEUE_FILTERS: FilterListConfig<OrderListRequest> = {
  listKey: 'order-queue-list',
  title: 'Filter the queue',
  noun: ['order', 'orders'],
  search: { placeholder: 'Search the queue', dates: false, range: null },
  fields: [],
  fastFilters: [],
  toRequest: toRequest(true),
  fetchCount: noCount,
};
