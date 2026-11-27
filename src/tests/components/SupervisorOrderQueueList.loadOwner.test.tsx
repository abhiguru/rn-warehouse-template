/**
 * R1 (performance review 2026-10-13): the order queue has one loading owner.
 * Mount, a search change and a customer filter change each load once; a real return
 * to the screen (blur, then focus) refreshes once and folds open cards; live updates
 * still coalesce behind a load in flight. The queue has no sort.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import { OrderService } from '@/services/order-service';
import type { Order, OrderServiceResponse } from '@/types/order.types';
import { resetScreenFocus, setScreenFocused } from './focusHarness';

// The lists say when their rows were loaded while offline (useIsOffline); online here.
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useNetworkStatus: () => ({ isConnected: true }) }));
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
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1, onSessionChange: () => () => undefined }));
jest.mock('@/features/filters/configs', () => ({ ORDER_QUEUE_FILTERS: { listKey: 'order-queue' } }));
const mockHeader: { loading?: boolean } = {};
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: (props: { loading?: boolean; actions?: React.ReactNode }) => { mockHeader.loading = props.loading; return props.actions ?? null; },
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// Stand-ins that draw a text, so a test sees whether the skeleton or the empty state is on the screen.
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => require('react').createElement(require('react-native').Text, null, 'skeleton shown') }));
jest.mock('@/components/list/ListEmptyState', () => ({ ListEmptyState: () => require('react').createElement(require('react-native').Text, null, 'empty state shown') }));
jest.mock('@/components/list-items/CustomerOrderGroupCard', () => ({ CustomerOrderGroupCard: 'CustomerOrderGroupCard' }));
jest.mock('@/components/RecentDispatchedOrdersSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));

const orders = [{ id: 'order-fictional-1', customer_id: 'customer-fictional-1', status: 'OPEN', item_count: 2 }] as Order[];
const answer = { success: true, message: '', data: orders, metadata: { has_more: false } } as OrderServiceResponse<Order[]>;
const getOrdersList = jest.mocked(OrderService.getOrdersList);
const searches = () => getOrdersList.mock.calls.map(([filters]) => filters?.search);
// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
// The list is the stand-in host named FlashList: no role or text, and the test reads and calls its props
// (renderItem, extraData, refreshControl, the header element), so it is found by its type.
const list = () => {
  const root = screen.root!;
  return root.type === 'FlashList' ? root : root.queryAll(node => (node.type as unknown) === 'FlashList')[0];
};

beforeEach(() => {
  resetScreenFocus();
  mockFilters.request = {};
  getOrdersList.mockReset().mockResolvedValue(answer);
});

it('loads once on mount, once per search or customer filter change, and once on a real return', async () => {
  await render(<SupervisorOrderQueueList />);
  expect(searches()).toEqual([undefined]);

  mockFilters.request = { search: 'onion' };
  await screen.rerender(<SupervisorOrderQueueList />);
  expect(searches()).toEqual([undefined, 'onion']);

  mockFilters.request = {};
  await screen.rerender(<SupervisorOrderQueueList customerFilter="Fictional Farms" />);
  expect(searches()).toEqual([undefined, 'onion', 'Fictional Farms']);

  // An open card stays open through filter changes and folds on a return to the screen.
  await act(async () => { list().props.renderItem({ item: orders[0] }).props.onToggleExpand('order-fictional-1'); });
  expect(list().props.extraData.has('order-fictional-1')).toBe(true);

  await act(async () => { setScreenFocused(false); });
  expect(getOrdersList).toHaveBeenCalledTimes(3);
  await act(async () => { setScreenFocused(true); });
  expect(searches()).toEqual([undefined, 'onion', 'Fictional Farms', 'Fictional Farms']);
  expect(list().props.extraData.size).toBe(0);

  // The list owns the return; the live updates hook must not refresh on focus as well.
  expect(mockLive.args?.[2]).toEqual({ refreshOnFocus: false });
});

it('coalesces live updates that arrive while a load is in flight into one rerun', async () => {
  await render(<SupervisorOrderQueueList />);
  expect(getOrdersList).toHaveBeenCalledTimes(1);

  let finish!: (value: OrderServiceResponse<Order[]>) => void;
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { void mockLive.refresh?.(); });
  expect(getOrdersList).toHaveBeenCalledTimes(2);
  await act(async () => { void mockLive.refresh?.(); void mockLive.refresh?.(); });
  expect(getOrdersList).toHaveBeenCalledTimes(2);
  await act(async () => { finish(answer); });
  expect(getOrdersList).toHaveBeenCalledTimes(3);
});

it('loads a change made while hidden once on the return as a new first page, and a plain revisit silently', async () => {
  await render(<SupervisorOrderQueueList />);
  await act(async () => { setScreenFocused(false); });
  mockFilters.request = { search: 'garlic' };
  await screen.rerender(<SupervisorOrderQueueList />);
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
});

it('reads "Recently dispatched" again, quietly, on a real return to the queue and on a pull to refresh', async () => {
  await render(<SupervisorOrderQueueList />);
  // The list header holds the line "last updated" (offline only) and the section: its props are the triggers.
  const recent = () => (list().props.ListHeaderComponent.props.children[1].props as { refreshTrigger: number; quietRefreshTrigger: number });
  expect(recent()).toMatchObject({ refreshTrigger: 0, quietRefreshTrigger: 0 });

  // Away (a dispatch is made from an order) and back: the section is told to read again, without a loading state.
  await act(async () => { setScreenFocused(false); });
  expect(recent().quietRefreshTrigger).toBe(0);
  await act(async () => { setScreenFocused(true); });
  expect(recent()).toMatchObject({ refreshTrigger: 0, quietRefreshTrigger: 1 });

  await act(async () => { setScreenFocused(false); });
  await act(async () => { setScreenFocused(true); });
  expect(recent().quietRefreshTrigger).toBe(2);

  // A pull to refresh uses its own trigger.
  await act(async () => { list().props.refreshControl.props.onRefresh(); });
  expect(recent()).toMatchObject({ refreshTrigger: 1, quietRefreshTrigger: 2 });
});

it('counts the whole queue in the header, not only the cards loaded', async () => {
  getOrdersList.mockResolvedValue({ ...answer, metadata: { has_more: true, total_count: 21 } } as OrderServiceResponse<Order[]>);
  await render(<SupervisorOrderQueueList />);
  expect(screen.queryAllByLabelText(/21/, everything).length).toBeGreaterThan(0);
});

it('shows the skeleton, not the empty state, while a new search with no rows on screen is pending', async () => {
  getOrdersList.mockResolvedValue({ success: true, message: '', data: [], metadata: { has_more: false, total_count: 0 } } as OrderServiceResponse<Order[]>);
  await render(<SupervisorOrderQueueList />);
  expect(screen.queryAllByText('empty state shown', everything)).toHaveLength(1);

  let finish!: (value: OrderServiceResponse<Order[]>) => void;
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mockFilters.request = { search: 'onion' };
  await screen.rerender(<SupervisorOrderQueueList />);
  expect(screen.queryAllByText('skeleton shown', everything)).toHaveLength(1);
  expect(screen.queryAllByText('empty state shown', everything)).toHaveLength(0);
  await act(async () => { finish({ success: true, message: '', data: [], metadata: { has_more: false, total_count: 0 } } as OrderServiceResponse<Order[]>); });
  expect(screen.queryAllByText('empty state shown', everything)).toHaveLength(1);
});
