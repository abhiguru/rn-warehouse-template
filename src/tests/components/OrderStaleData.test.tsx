/**
 * Load errors on the Orders list are inline, never a snackbar (style guide §13.9; owner, 2026-10-17):
 * a failed refresh with orders on screen shows a critical strip that says when they were loaded and offers
 * "Try again"; a failed next page says so in the list's last row with "Try again"; offline, the first heading
 * says when the orders were loaded (§14.9).
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderFlashList from '@/components/lists/OrderFlashList';
import { OrderService } from '@/services/order-service';
import type { Order, OrderServiceResponse } from '@/types/order.types';

let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline, useNetworkStatus: () => ({ isConnected: !mockOffline }) }));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
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

type Tree = ReturnType<typeof create>;
const getOrdersList = jest.mocked(OrderService.getOrdersList);
const orders = [{ id: 'fictional-order', customer_id: 'fictional-customer', status: 'OPEN', item_count: 1 }] as Order[];
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) =>
  ({ id: `fictional-order-${from + i}`, customer_id: 'fictional-customer', status: 'OPEN', item_count: 1 })) as Order[];
const texts = (tree: Tree) => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const TIME = /\d{1,2}:\d{2} (am|pm)/;
const strip = (tree: Tree) => tree.root.findAll(node => node.props.testID === 'orders-stale-strip');
const pressable = (tree: Tree, testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const list = (tree: Tree) => tree.root.findByType('FlashList' as unknown as React.ElementType);
const rows = (tree: Tree) => list(tree).props.data.filter((row: { type: string }) => row.type !== 'header');
// A list row drawn on its own (FlashList is a stub here, so it draws no rows itself).
const draw = (element: React.ReactElement) => {
  let drawn!: Tree;
  act(() => { drawn = create(element); });
  return drawn;
};
// The screen-reader "Refresh" action (WH-220) sits on the section heading, an element a screen reader focuses: the
// same refresh as the pull. The heading row is drawn the way the list would draw it.
const refreshTarget = (tree: Tree) => {
  const heading = list(tree).props.data.find((row: { type: string }) => row.type === 'header');
  const drawn = draw(list(tree).props.renderItem({ item: heading, index: 0 }));
  return drawn.root.find(node => typeof node.type === 'string'
    && Array.isArray(node.props.accessibilityActions) && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'refresh'));
};
const refresh = (tree: Tree) => {
  const target = refreshTarget(tree);
  return () => target.props.onAccessibilityAction({ nativeEvent: { actionName: 'refresh' } });
};
const footer = (tree: Tree) => {
  const Footer = list(tree).props.ListFooterComponent;
  return Footer ? draw(Footer) : null;
};

beforeEach(() => {
  mockOffline = false;
  getOrdersList.mockReset();
});

it('keeps the orders after a failed refresh in a strip with the load time and Try again, until a refresh works', async () => {
  getOrdersList.mockResolvedValueOnce({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  let tree!: Tree;
  await act(async () => { tree = create(<OrderFlashList />); });
  expect(strip(tree)).toHaveLength(0);

  getOrdersList.mockResolvedValueOnce({ success: false, message: 'Warehouse connection unavailable' });
  const runRefresh = refresh(tree);
  await act(async () => { runRefresh(); });
  expect(strip(tree).length).toBeGreaterThan(0);
  expect(texts(tree)).toContain("Couldn't refresh orders.");
  const stale = texts(tree).find(text => text.startsWith('Showing the orders loaded at '));
  expect(stale).toMatch(new RegExp(`^Showing the orders loaded at ${TIME.source}\\.$`));
  expect(rows(tree).map((row: { data: Order }) => row.data.id)).toEqual(['fictional-order']);
  // No snackbar: the error stays on screen instead of going after four seconds.
  expect(tree.root.findAll(node => node.type === ('Snackbar' as unknown))).toHaveLength(0);

  // Try again: the strip stays while the retry runs and its button is disabled.
  let complete!: (value: OrderServiceResponse<Order[]>) => void;
  getOrdersList.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const retry = pressable(tree, 'orders-stale-strip-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading the orders again');
  await act(async () => { retry.props.onPress(); });
  expect(getOrdersList).toHaveBeenCalledTimes(3);
  expect(strip(tree).length).toBeGreaterThan(0);
  expect(pressable(tree, 'orders-stale-strip-retry').props.disabled).toBe(true);

  await act(async () => { complete({ success: true, data: [{ ...orders[0], id: 'fresh-order' }] } as OrderServiceResponse<Order[]>); });
  expect(strip(tree)).toHaveLength(0);
  expect(rows(tree).map((row: { data: Order }) => row.data.id)).toEqual(['fresh-order']);
  await act(async () => { tree.unmount(); });
});

it('says a failed next page in the last row with Try again, and appends the page when it works', async () => {
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  let tree!: Tree;
  await act(async () => { tree = create(<OrderFlashList />); });
  expect(footer(tree)).toBeNull();

  getOrdersList.mockResolvedValueOnce({ success: false, message: 'Warehouse connection unavailable' });
  await act(async () => { await list(tree).props.onEndReached(); });
  const failed = footer(tree)!;
  expect(texts(failed)).toContain("Couldn't load more orders.");
  const retry = pressable(failed, 'orders-load-more-error-retry');
  expect(retry.props.accessibilityLabel).toBe('Try loading more orders again');
  expect(rows(tree)).toHaveLength(20);

  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 3), metadata: { has_more: false } });
  await act(async () => { await retry.props.onPress(); });
  expect(getOrdersList.mock.calls[2][0]).toEqual(expect.objectContaining({ offset: 20 }));
  expect(rows(tree)).toHaveLength(23);
  expect(footer(tree)).toBeNull();
  await act(async () => { tree.unmount(); });
});

it('says when the orders were loaded under the first heading only while offline', async () => {
  getOrdersList.mockResolvedValue({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  let tree!: Tree;
  const firstHeading = () => {
    const { renderItem, data } = list(tree).props;
    return draw(renderItem({ item: data[0], index: 0 }));
  };
  await act(async () => { tree = create(<OrderFlashList />); });
  expect(texts(firstHeading()).some(text => text.startsWith('Last updated'))).toBe(false);

  mockOffline = true;
  await act(async () => { tree.update(<OrderFlashList />); });
  const updated = texts(firstHeading()).find(text => text.startsWith('Last updated'));
  expect(updated).toMatch(new RegExp(`^Last updated ${TIME.source}$`));
  await act(async () => { tree.unmount(); });
});

it('counts "20+" in the first heading while more pages remain, and the plain count once all are loaded', async () => {
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  let tree!: Tree;
  const heading = () => {
    const { renderItem, data } = list(tree).props;
    return draw(renderItem({ item: data[0], index: 0 }));
  };
  const spoken = (drawn: Tree) => drawn.root.findAll(node => typeof node.props.accessibilityLabel === 'string')[0].props.accessibilityLabel;
  await act(async () => { tree = create(<OrderFlashList />); });
  expect(texts(heading())).toContain('20+');
  expect(spoken(heading())).toMatch(/, more than 20 orders$/);

  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 3), metadata: { has_more: false } });
  await act(async () => { await list(tree).props.onEndReached(); });
  expect(texts(heading())).toContain('23');
  expect(texts(heading())).not.toContain('23+');
  expect(spoken(heading())).toMatch(/, 23 orders$/);
  await act(async () => { tree.unmount(); });
});

it('offline, the line under the first heading shows the date as well as the time when the orders were loaded on an earlier day (WH-220)', async () => {
  getOrdersList.mockResolvedValue({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  const real = Date.now();
  jest.useFakeTimers({ now: new Date(2026, 9, 9, 16, 5), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  let tree!: Tree;
  try {
    await act(async () => { tree = create(<OrderFlashList />); });
    jest.setSystemTime(real);
    mockOffline = true;
    await act(async () => { tree.update(<OrderFlashList />); });
    const { renderItem, data } = list(tree).props;
    expect(texts(draw(renderItem({ item: data[0], index: 0 }))).find(text => text.startsWith('Last updated'))).toBe('Last updated 09/10/26, 4:05 pm');
  } finally {
    jest.useRealTimers();
  }
  await act(async () => { tree.unmount(); });
});

it('the list offers a screen-reader Refresh action that reloads the orders like a pull (WH-220)', async () => {
  getOrdersList.mockResolvedValue({ success: true, data: orders } as OrderServiceResponse<Order[]>);
  let tree!: Tree;
  await act(async () => { tree = create(<OrderFlashList />); });
  expect(refreshTarget(tree).props.accessibilityActions).toEqual([{ name: 'refresh', label: 'Refresh' }]);
  const before = getOrdersList.mock.calls.length;
  const runRefresh = refresh(tree);
  await act(async () => { runRefresh(); });
  expect(getOrdersList.mock.calls.length).toBe(before + 1);
  const target = refreshTarget(tree);
  await act(async () => { target.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }); });
  expect(getOrdersList.mock.calls.length).toBe(before + 1);
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Refresh orders')).toHaveLength(0);
  await act(async () => { tree.unmount(); });
});
