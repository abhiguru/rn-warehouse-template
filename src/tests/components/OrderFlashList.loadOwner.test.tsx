/**
 * R1 (performance review 2026-10-13): the orders list has one loading owner.
 * Mount, a search change and a filter change each load once; a real return to the
 * screen (blur, then focus) refreshes once; live updates still coalesce behind a
 * load in flight. The orders list has no sort.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import OrderFlashList from '@/components/lists/OrderFlashList';
import { OrderService } from '@/services/order-service';
import type { Order, OrderServiceResponse } from '@/types/order.types';
import { resetScreenFocus, setScreenFocused } from './focusHarness';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
const mockLive: { refresh?: () => unknown; args?: unknown[] } = {};
jest.mock('@/hooks/useOrderLiveUpdates', () => ({
  useOrderLiveUpdates: (...args: unknown[]) => { mockLive.refresh = args[0] as () => unknown; mockLive.args = args; },
}));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/features/filters/configs', () => ({ ORDER_FILTERS: { listKey: 'order-list' } }));
const mockHeader: { loading?: boolean } = {};
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: (props: { loading?: boolean }) => { mockHeader.loading = props.loading; return null; },
  filteredEmptyProps: () => ({}),
}));
const mockFilters: { request: { has_items?: boolean; search?: string }; values: object } = { request: {}, values: {} };
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'admin', name: 'Fictional Administrator' } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedOrderItem: () => null }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));

const orders = [{ id: 'order-fictional-1', customer_id: 'customer-fictional-1', status: 'OPEN', item_count: 2 }] as Order[];
const answer = { success: true, message: '', data: orders, metadata: { has_more: false } } as OrderServiceResponse<Order[]>;
const getOrdersList = jest.mocked(OrderService.getOrdersList);
const requests = () => getOrdersList.mock.calls.map(([filters]) => ({ search: filters?.search, has_items: filters?.has_items }));

beforeEach(() => {
  resetScreenFocus();
  mockFilters.request = {};
  getOrdersList.mockReset().mockResolvedValue(answer);
});

it('loads once on mount, once per search or filter change, and once on a real return', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderFlashList />); });
  expect(requests()).toEqual([{ search: undefined, has_items: undefined }]);

  mockFilters.request = { search: 'onion' };
  await act(async () => { renderer.update(<OrderFlashList />); });
  expect(requests()).toHaveLength(2);
  expect(requests()[1]).toEqual({ search: 'onion', has_items: undefined });

  mockFilters.request = { search: 'onion', has_items: true };
  await act(async () => { renderer.update(<OrderFlashList />); });
  expect(requests()).toHaveLength(3);
  expect(requests()[2]).toEqual({ search: 'onion', has_items: true });

  await act(async () => { setScreenFocused(false); });
  expect(requests()).toHaveLength(3);
  await act(async () => { setScreenFocused(true); });
  expect(requests()).toHaveLength(4);
  expect(requests()[3]).toEqual({ search: 'onion', has_items: true });

  // The list owns the return; the live updates hook must not refresh on focus as well.
  expect(mockLive.args?.[2]).toEqual({ refreshOnFocus: false });
  await act(async () => { renderer.unmount(); });
});

it('coalesces live updates that arrive while a load is in flight into one rerun', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderFlashList />); });
  expect(getOrdersList).toHaveBeenCalledTimes(1);

  let finish!: (value: OrderServiceResponse<Order[]>) => void;
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { void mockLive.refresh?.(); });
  expect(getOrdersList).toHaveBeenCalledTimes(2);
  await act(async () => { void mockLive.refresh?.(); void mockLive.refresh?.(); });
  expect(getOrdersList).toHaveBeenCalledTimes(2);
  await act(async () => { finish(answer); });
  expect(getOrdersList).toHaveBeenCalledTimes(3);
  await act(async () => { renderer.unmount(); });
});

it('loads a change made while hidden once on the return as a new first page, and a plain revisit silently', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderFlashList />); });
  await act(async () => { setScreenFocused(false); });
  mockFilters.request = { search: 'garlic', has_items: true };
  await act(async () => { renderer.update(<OrderFlashList />); });
  expect(getOrdersList).toHaveBeenCalledTimes(1);

  // Back with a changed request: one load, shown as loading like an inline filter change.
  let finish!: (value: OrderServiceResponse<Order[]>) => void;
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { setScreenFocused(true); });
  expect(requests()).toEqual([{ search: undefined, has_items: undefined }, { search: 'garlic', has_items: true }]);
  expect(getOrdersList.mock.calls[1][0]).toEqual(expect.objectContaining({ offset: 0, limit: 20 }));
  expect(mockHeader.loading).toBe(true);
  await act(async () => { finish(answer); });
  expect(mockHeader.loading).toBe(false);

  // Away and back with nothing changed: one silent refresh of the loaded rows.
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { setScreenFocused(false); });
  await act(async () => { setScreenFocused(true); });
  expect(getOrdersList).toHaveBeenCalledTimes(3);
  expect(mockHeader.loading).toBe(false);
  await act(async () => { finish(answer); });
  expect(getOrdersList).toHaveBeenCalledTimes(3);
  await act(async () => { renderer.unmount(); });
});
