import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import OrderFlashList from '@/components/lists/OrderFlashList';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { OrderService } from '@/services/order-service';
import type { Order } from '@/types/order.types';

// The lists say when their rows were loaded while offline (useIsOffline); online here.
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useNetworkStatus: () => ({ isConnected: true }) }));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: jest.fn() }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1, onSessionChange: jest.fn(), onCredentialsSettled: jest.fn() }));
// The list's search and filters read the session-only filter store and the list configurations.
jest.mock('@/store/slices/authSlice', () => ({
  forceLogoutOnInvalidToken: jest.fn(),
  logout: { fulfilled: { type: 'auth/logout/fulfilled', match: () => false } },
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/features/filters/configs', () => ({ ...jest.requireActual('@/features/filters/configs/order'), FILTER_CONFIGS: {} }));
let mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { role: 'admin', name: 'Fictional Administrator' } },
  listFilters: { lists: {} },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedOrderItem: () => null }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));

const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({
  id: `order-${from + i}`, customer_id: `customer-${from + i}`, status: 'OPEN', item_count: 1,
})) as Order[];

// MemoizedOrderItem is a null stand-in and FlashList a plain host element, so the rows the list was given are read from
// the list's own `data` prop: no role or text shows them.
const everything = () => (screen.root ? [screen.root, ...screen.root.queryAll(() => true)] : []);
const flash = () => {
  const found = everything().filter(node => (node.type as unknown) === 'FlashList');
  if (found.length !== 1) throw new Error(`Expected one list, found ${found.length}`);
  return found[0];
};
const rowsOf = () => flash().props.data as Array<{ type: string; title?: string; data?: Order }>;
const listedIds = () => rowsOf().filter(row => row.data).map(row => row.data!.id);

it('appends the next page at the end of the list and stops when the server has no more', async () => {
  const getOrdersList = jest.mocked(OrderService.getOrdersList);
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  await render(<OrderFlashList />);
  expect(getOrdersList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: 20 }));
  expect(flash().props.onEndReached).toEqual(expect.any(Function));

  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 5), metadata: { has_more: false } });
  await fireEvent(flash(), 'endReached');
  expect(getOrdersList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20, limit: 20 }));
  expect(listedIds()).toHaveLength(25);
  expect(listedIds().slice(-1)).toEqual(['order-24']);

  await fireEvent(flash(), 'endReached');
  expect(getOrdersList).toHaveBeenCalledTimes(2);
});

it('refreshes the whole loaded window so live updates do not drop scrolled rows', async () => {
  const getOrdersList = jest.mocked(OrderService.getOrdersList);
  getOrdersList.mockReset();
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  await render(<OrderFlashList />);
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 20), metadata: { has_more: true } });
  await fireEvent(flash(), 'endReached');
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 40), metadata: { has_more: true } });
  // The screen-reader Refresh action sits on the list's title (WH-220), which the list always shows.
  const refreshTargets = screen.getAllByRole('header').filter(node => Array.isArray(node.props.accessibilityActions)
    && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'refresh'));
  expect(refreshTargets).toHaveLength(1);
  await fireEvent(refreshTargets[0], 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
  expect(getOrdersList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: 40 }));
  expect(listedIds()).toHaveLength(40);
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  'themes: %s %s',
  (brand, mode) => {
    it('renders the list on the theme background with a brand-tinted refresh control', async () => {
      mockState = { ...mockState, theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      const getOrdersList = jest.mocked(OrderService.getOrdersList);
      getOrdersList.mockReset();
      getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 3), metadata: { has_more: false } });
      await render(<OrderFlashList />);
      const backgrounds = everything().filter(node => {
        const style = [].concat(node.props.style ?? []).filter(Boolean) as Array<{ backgroundColor?: string }>;
        return style.some(s => s.backgroundColor === t.background.base);
      });
      expect(backgrounds.length).toBeGreaterThan(0);
      const refresh = flash().props.refreshControl;
      expect(refresh.props.tintColor).toBe(t.brand.tint);
    });
  },
);

it('lists only orders with lines, under one heading: no "Empty orders" section', async () => {
  const getOrdersList = jest.mocked(OrderService.getOrdersList);
  getOrdersList.mockReset();
  const withLines = page(0, 2);
  const empty = [{ id: 'order-empty', customer_id: 'customer-empty', status: 'OPEN', item_count: 0 }] as Order[];
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: [...withLines, ...empty], metadata: { has_more: false } });
  await render(<OrderFlashList />);
  const rows = rowsOf();
  expect(rows.filter(row => row.type === 'header')).toHaveLength(1);
  expect(rows.filter(row => row.type === 'header').map(row => row.title)).not.toContain('Empty orders');
  expect(rows.filter(row => row.data).map(row => row.data!.id)).toEqual(['order-0', 'order-1']);
});
