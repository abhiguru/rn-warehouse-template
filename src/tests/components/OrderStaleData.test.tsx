import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderFlashList from '@/components/lists/OrderFlashList';
import { OrderService } from '@/services/order-service';
import type { Order } from '@/types/order.types';

jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: jest.fn() }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const profile = { role: 'admin', name: 'Fictional Administrator' };
    // Theme state for the token hooks; auth for the list; the profile itself for older selectors.
    return selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: profile, ...profile }, ...profile });
  },
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedOrderItem: () => null }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));

it('marks retained orders stale after failure, even after the snackbar closes and while retry is pending', async () => {
  const orders = [{ id: 'fictional-order', customer_id: 'fictional-customer', status: 'EMPTY' }] as Order[];
  jest.mocked(OrderService.getOrdersList).mockResolvedValueOnce({ success: true, data: orders });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderFlashList />); });
  const warning = () => renderer.root.findAllByType(Text)
    .some(node => node.props.children === 'Showing previously loaded orders. Refresh to get current data.');
  const refresh = () => renderer.root.find(node =>
    node.type === ('IconButton' as unknown) && node.props.accessibilityLabel === 'Refresh orders'
  ).props.onPress();
  expect(warning()).toBe(false);
  jest.mocked(OrderService.getOrdersList).mockResolvedValueOnce({ success: false, message: 'Warehouse connection unavailable' });
  await act(async () => { refresh(); });
  await act(async () => { renderer.root.findByType('Snackbar' as unknown as React.ElementType).props.onDismiss(); });
  expect(warning()).toBe(true);
  const retained = () => renderer.root.findByType('FlashList' as unknown as React.ElementType).props.data;
  expect(retained().some((row: { data?: Order }) => row.data?.id === 'fictional-order')).toBe(true);
  let complete!: (value: { success: boolean; data: Order[] }) => void;
  jest.mocked(OrderService.getOrdersList).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  await act(async () => { refresh(); });
  expect(warning()).toBe(true);
  await act(async () => { complete({ success: true, data: [{ ...orders[0], id: 'fresh-order' }] }); });
  expect(warning()).toBe(false);
  expect(retained().some((row: { data?: Order }) => row.data?.id === 'fresh-order')).toBe(true);
  await act(async () => { renderer.unmount(); });
});
