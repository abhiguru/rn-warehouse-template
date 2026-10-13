/**
 * R1 (performance review 2026-10-13): the order queue has one loading owner.
 * Mount, a search change and a customer filter change each load once; a real return
 * to the screen (blur, then focus) refreshes once and folds open cards; live updates
 * still coalesce behind a load in flight. The queue has no sort.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
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
jest.mock('@/features/filters/configs', () => ({ ORDER_QUEUE_FILTERS: { listKey: 'order-queue' } }));
const mockHeader: { loading?: boolean } = {};
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: (props: { loading?: boolean }) => { mockHeader.loading = props.loading; return null; },
  filteredEmptyProps: () => ({}),
}));
const mockFilters: { request: { search?: string }; values: object } = { request: {}, values: {} };
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'supervisor', name: 'Fictional Supervisor' } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list/ListEmptyState', () => ({ ListEmptyState: () => null }));
jest.mock('@/components/list-items/CustomerOrderGroupCard', () => ({ CustomerOrderGroupCard: 'CustomerOrderGroupCard' }));
jest.mock('@/components/RecentDispatchedOrdersSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));

const orders = [{ id: 'order-fictional-1', customer_id: 'customer-fictional-1', status: 'OPEN', item_count: 2 }] as Order[];
const answer = { success: true, message: '', data: orders, metadata: { has_more: false } } as OrderServiceResponse<Order[]>;
const getOrdersList = jest.mocked(OrderService.getOrdersList);
const searches = () => getOrdersList.mock.calls.map(([filters]) => filters?.search);
const list = (renderer: ReturnType<typeof create>) => renderer.root.findByType('FlashList' as unknown as React.ElementType);

beforeEach(() => {
  resetScreenFocus();
  mockFilters.request = {};
  getOrdersList.mockReset().mockResolvedValue(answer);
});

it('loads once on mount, once per search or customer filter change, and once on a real return', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SupervisorOrderQueueList />); });
  expect(searches()).toEqual([undefined]);

  mockFilters.request = { search: 'onion' };
  await act(async () => { renderer.update(<SupervisorOrderQueueList />); });
  expect(searches()).toEqual([undefined, 'onion']);

  mockFilters.request = {};
  await act(async () => { renderer.update(<SupervisorOrderQueueList customerFilter="Fictional Farms" />); });
  expect(searches()).toEqual([undefined, 'onion', 'Fictional Farms']);

  // An open card stays open through filter changes and folds on a return to the screen.
  await act(async () => { list(renderer).props.renderItem({ item: orders[0] }).props.onToggleExpand('order-fictional-1'); });
  expect(list(renderer).props.extraData.has('order-fictional-1')).toBe(true);

  await act(async () => { setScreenFocused(false); });
  expect(getOrdersList).toHaveBeenCalledTimes(3);
  await act(async () => { setScreenFocused(true); });
  expect(searches()).toEqual([undefined, 'onion', 'Fictional Farms', 'Fictional Farms']);
  expect(list(renderer).props.extraData.size).toBe(0);

  // The list owns the return; the live updates hook must not refresh on focus as well.
  expect(mockLive.args?.[2]).toEqual({ refreshOnFocus: false });
  await act(async () => { renderer.unmount(); });
});

it('coalesces live updates that arrive while a load is in flight into one rerun', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<SupervisorOrderQueueList />); });
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
  await act(async () => { renderer = create(<SupervisorOrderQueueList />); });
  await act(async () => { setScreenFocused(false); });
  mockFilters.request = { search: 'garlic' };
  await act(async () => { renderer.update(<SupervisorOrderQueueList />); });
  expect(getOrdersList).toHaveBeenCalledTimes(1);

  // Back with a changed request: one load, shown as loading like an inline filter change.
  let finish!: (value: OrderServiceResponse<Order[]>) => void;
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { setScreenFocused(true); });
  expect(searches()).toEqual([undefined, 'garlic']);
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
