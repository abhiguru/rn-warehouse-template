/**
 * Load errors on the Orders list are inline, never a snackbar (style guide §13.9; owner, 2026-10-17):
 * a failed refresh with orders on screen shows a critical strip that says when they were loaded and offers
 * "Try again"; a failed next page says so in the list's last row with "Try again"; offline, the first heading
 * says when the orders were loaded (§14.9).
 */
import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import OrderFlashList from '@/components/lists/OrderFlashList';
import { OrderService } from '@/services/order-service';
import type { Order, OrderServiceResponse } from '@/types/order.types';

let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline, useNetworkStatus: () => ({ isConnected: !mockOffline }) }));
// The list stand-in draws the header, the headings and the footer, and keeps the list's props on a host element.
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: jest.fn() }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1, onSessionChange: jest.fn() }));
// The list's search and filters read the session-only filter store and the list configurations.
jest.mock('@/store/slices/authSlice', () => ({
  forceLogoutOnInvalidToken: jest.fn(),
  logout: { fulfilled: { type: 'auth/logout/fulfilled', match: () => false } },
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/features/filters/configs', () => ({ ...jest.requireActual('@/features/filters/configs/order'), FILTER_CONFIGS: {} }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const profile = { role: 'admin', name: 'Fictional Administrator' };
    // Theme state for the token hooks; auth for the list; the profile itself for older selectors.
    return selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: profile, ...profile }, listFilters: { lists: {} }, ...profile });
  },
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedOrderItem: () => null }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));

const getOrdersList = jest.mocked(OrderService.getOrdersList);
const orders = [{ id: 'fictional-order', customer_id: 'fictional-customer', status: 'OPEN', item_count: 1 }] as Order[];
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) =>
  ({ id: `fictional-order-${from + i}`, customer_id: 'fictional-customer', status: 'OPEN', item_count: 1 })) as Order[];
const TIME = /\d{1,2}:\d{2} (am|pm)/;
const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const strip = (all = false) => screen.queryAllByTestId('orders-stale-strip', all ? hidden : undefined);
// The list stand-in (src/tests/helpers/flashListMock.tsx) draws the header, the headings and the footer, and keeps the
// list's props on a host element. The order rows are a null stand-in (MemoizedOrderItem), so the rows the list was
// given are read from that prop.
const hosts = (type: string) => (screen.root ? [screen.root, ...screen.root.queryAll(() => true)] : []).filter(node => (node.type as unknown) === type);
const list = () => hosts('FlashList')[0];
const rows = () => list().props.data.filter((row: { type: string }) => row.type !== 'header');
// The screen-reader "Refresh" action (WH-220) sits on the list's title ("Orders"), which every state shows: the
// same refresh as the pull.
const refreshTarget = () => {
  const title = screen.getAllByRole('header').filter(node => Array.isArray(node.props.accessibilityActions)
    && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'refresh'));
  expect(title).toHaveLength(1);
  expect(title[0].props.children).toBe('Orders');
  return title[0];
};
const refresh = () => fireEvent(refreshTarget(), 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });

beforeEach(() => {
  mockOffline = false;
  getOrdersList.mockReset();
});

it('keeps the orders after a failed refresh in a strip with the load time and Try again, until a refresh works', async () => {
  getOrdersList.mockResolvedValueOnce({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  await render(<OrderFlashList />);
  expect(strip(true)).toHaveLength(0);

  getOrdersList.mockResolvedValueOnce({ success: false, message: 'Warehouse connection unavailable' });
  await refresh();
  expect(strip().length).toBeGreaterThan(0);
  expect(screen.getByText("Couldn't refresh orders.")).toBeOnTheScreen();
  expect(screen.getByText(new RegExp(`^Showing the orders loaded at ${TIME.source}\\.$`))).toBeOnTheScreen();
  expect(rows().map((row: { data: Order }) => row.data.id)).toEqual(['fictional-order']);
  // No snackbar: the error stays on screen instead of going after four seconds.
  expect(hosts('Snackbar')).toHaveLength(0);

  // Try again: the strip stays while the retry runs and its button is disabled.
  let complete!: (value: OrderServiceResponse<Order[]>) => void;
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const retry = screen.getByTestId('orders-stale-strip-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading the orders again');
  await user.press(retry);
  expect(getOrdersList).toHaveBeenCalledTimes(3);
  expect(strip().length).toBeGreaterThan(0);
  expect(screen.getByTestId('orders-stale-strip-retry')).toBeDisabled();
  expect(screen.getByTestId('orders-stale-strip-retry').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

  await act(async () => { complete({ success: true, data: [{ ...orders[0], id: 'fresh-order' }] } as OrderServiceResponse<Order[]>); });
  expect(strip(true)).toHaveLength(0);
  expect(rows().map((row: { data: Order }) => row.data.id)).toEqual(['fresh-order']);
});

it('says a failed next page in the last row with Try again, and appends the page when it works', async () => {
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  await render(<OrderFlashList />);
  expect(screen.queryByTestId('orders-load-more-error-retry', hidden)).not.toBeOnTheScreen();

  getOrdersList.mockResolvedValueOnce({ success: false, message: 'Warehouse connection unavailable' });
  await fireEvent(list(), 'endReached');
  expect(screen.getByText("Couldn't load more orders.")).toBeOnTheScreen();
  const retry = screen.getByTestId('orders-load-more-error-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading more orders again');
  expect(rows()).toHaveLength(20);

  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 3), metadata: { has_more: false } });
  await user.press(retry);
  expect(getOrdersList.mock.calls[2][0]).toEqual(expect.objectContaining({ offset: 20 }));
  expect(rows()).toHaveLength(23);
  expect(screen.queryByTestId('orders-load-more-error-retry', hidden)).not.toBeOnTheScreen();
  expect(screen.queryByText("Couldn't load more orders.", hidden)).not.toBeOnTheScreen();
});

it('says when the orders were loaded under the first heading only while offline', async () => {
  getOrdersList.mockResolvedValue({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  await render(<OrderFlashList />);
  expect(screen.queryByText(/^Last updated/, hidden)).not.toBeOnTheScreen();

  mockOffline = true;
  await screen.rerender(<OrderFlashList />);
  expect(screen.getByText(new RegExp(`^Last updated ${TIME.source}$`))).toBeOnTheScreen();
});

it('counts "20+" in the first heading while more pages remain, and the plain count once all are loaded', async () => {
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  await render(<OrderFlashList />);
  expect(screen.getByText('20+')).toBeOnTheScreen();
  expect(screen.getByLabelText(/, more than 20 orders$/)).toBeOnTheScreen();

  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 3), metadata: { has_more: false } });
  await fireEvent(list(), 'endReached');
  expect(screen.getByText('23')).toBeOnTheScreen();
  expect(screen.queryByText('23+', hidden)).not.toBeOnTheScreen();
  expect(screen.getByLabelText(/, 23 orders$/)).toBeOnTheScreen();
});

it('offline, the line under the first heading shows the date as well as the time when the orders were loaded on an earlier day (WH-220)', async () => {
  getOrdersList.mockResolvedValue({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  const real = Date.now();
  jest.useFakeTimers({ now: new Date(2026, 9, 9, 16, 5), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  try {
    await render(<OrderFlashList />);
    jest.setSystemTime(real);
    mockOffline = true;
    await screen.rerender(<OrderFlashList />);
    expect(screen.getByText('Last updated 09/10/26, 4:05 pm')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

it('the list offers a screen-reader Refresh action that reloads the orders like a pull (WH-220)', async () => {
  getOrdersList.mockResolvedValue({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  await render(<OrderFlashList />);
  expect(refreshTarget().props.accessibilityActions).toEqual([{ name: 'refresh', label: 'Refresh' }]);
  const before = getOrdersList.mock.calls.length;
  await refresh();
  expect(getOrdersList.mock.calls.length).toBe(before + 1);
  await fireEvent(refreshTarget(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(getOrdersList.mock.calls.length).toBe(before + 1);
  expect(screen.queryByLabelText('Refresh orders', hidden)).not.toBeOnTheScreen();
});
