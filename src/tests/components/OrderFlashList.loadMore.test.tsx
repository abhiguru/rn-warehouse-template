import React from 'react';
import { act, create } from 'react-test-renderer';
import OrderFlashList from '@/components/lists/OrderFlashList';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
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
let mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { role: 'admin', name: 'Fictional Administrator' } },
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

const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({
  id: `order-${from + i}`, customer_id: `customer-${from + i}`, status: 'OPEN', item_count: 1,
})) as Order[];

const listedIds = (renderer: ReturnType<typeof create>) =>
  renderer.root.findByType('FlashList' as unknown as React.ElementType).props.data
    .filter((row: { data?: Order }) => row.data).map((row: { data: Order }) => row.data.id);

it('appends the next page at the end of the list and stops when the server has no more', async () => {
  const getOrdersList = jest.mocked(OrderService.getOrdersList);
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderFlashList />); });
  expect(getOrdersList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: 20 }));
  const list = () => renderer.root.findByType('FlashList' as unknown as React.ElementType);
  expect(list().props.onEndReached).toEqual(expect.any(Function));

  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 5), metadata: { has_more: false } });
  await act(async () => { await list().props.onEndReached(); });
  expect(getOrdersList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20, limit: 20 }));
  expect(listedIds(renderer)).toHaveLength(25);
  expect(listedIds(renderer).slice(-1)).toEqual(['order-24']);

  await act(async () => { await list().props.onEndReached(); });
  expect(getOrdersList).toHaveBeenCalledTimes(2);
  await act(async () => { renderer.unmount(); });
});

it('refreshes the whole loaded window so live updates do not drop scrolled rows', async () => {
  const getOrdersList = jest.mocked(OrderService.getOrdersList);
  getOrdersList.mockReset();
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 20), metadata: { has_more: true } });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderFlashList />); });
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(20, 20), metadata: { has_more: true } });
  await act(async () => {
    await renderer.root.findByType('FlashList' as unknown as React.ElementType).props.onEndReached();
  });
  getOrdersList.mockResolvedValueOnce({ success: true, message: '', data: page(0, 40), metadata: { has_more: true } });
  await act(async () => {
    renderer.root.find(node =>
      node.type === ('IconButton' as unknown) && node.props.accessibilityLabel === 'Refresh orders'
    ).props.onPress();
  });
  expect(getOrdersList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: 40 }));
  expect(listedIds(renderer)).toHaveLength(40);
  await act(async () => { renderer.unmount(); });
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
      let renderer!: ReturnType<typeof create>;
      await act(async () => { renderer = create(<OrderFlashList />); });
      const backgrounds = renderer.root.findAll(node => {
        const style = [].concat(node.props.style ?? []).filter(Boolean) as Array<{ backgroundColor?: string }>;
        return style.some(s => s.backgroundColor === t.background.base);
      });
      expect(backgrounds.length).toBeGreaterThan(0);
      const refresh = renderer.root.findByType('FlashList' as unknown as React.ElementType).props.refreshControl;
      expect(refresh.props.tintColor).toBe(t.brand.tint);
      await act(async () => { renderer.unmount(); });
    });
  },
);
