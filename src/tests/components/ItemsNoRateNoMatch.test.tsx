/**
 * WH-215: the Items "no rate" view, searched for something it does not hold, says so with the same title and message as the
 * main list (items.list.noMatchTitle and customers.search.noMatchMessage) and offers Clear search; it is not the old one-line text.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemsScreen from '../../../app/items';
import { itemService } from '@/services/item-service';
import { listActiveItems, listAllRates } from '@/services/item-pricing-service';
import { clearItemRatesCache } from '@/features/item-pricing/useItemRates';

let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Admin' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({
  itemService: { getItemList: jest.fn(), getItemById: jest.fn(), createItem: jest.fn(), updateItem: jest.fn(), deleteItem: jest.fn(), toggleItemActive: jest.fn() },
}));
jest.mock('@/services/item-pricing-service', () => ({
  getItemStoragePrices: jest.fn(),
  listActiveItems: jest.fn(),
  listAllRates: jest.fn(),
  listItemRates: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
});

const flat = (children: unknown) => [children].flat().join('');
const shownText = () => tree!.root.findAllByType(Text).map(node => flat(node.props.children)).join(' | ');
const ITEMS = [
  { id: 'i1', name: 'Dry Red Chillies', packaging: 'Bag', description: '', active: true },
  { id: 'i2', name: 'Garlic', packaging: 'Box', description: 'Peeled', active: true },
];

it('says no item without a rate matches the search, with the main list\'s title and message, and Clear search brings the rows back', async () => {
  jest.useFakeTimers();
  clearItemRatesCache();
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: ITEMS, pagination: { total_count: 2 } } as never);
  // Two active items and no rate at all: both are "no rate".
  jest.mocked(listActiveItems).mockResolvedValue(ITEMS.map(({ id, name, packaging }) => ({ id, name, packaging })));
  jest.mocked(listAllRates).mockResolvedValue([]);
  await act(async () => { tree = create(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>); });
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });

  const show = tree!.root.find(node => node.props.testID === 'no-rate-show' && typeof node.props.onPress === 'function');
  await act(async () => { show.props.onPress(); });
  expect(shownText()).toContain('Showing only items with no rate.');
  expect(shownText()).toContain('Garlic');

  const field = tree!.root.find(node => node.props.accessibilityLabel === 'Search by name, packaging or description' && typeof node.props.onChangeText === 'function');
  await act(async () => { field.props.onChangeText('zzzz'); });
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  expect(shownText()).toContain('No items match "zzzz"');
  expect(shownText()).toContain('Try fewer letters or another spelling.');
  expect(shownText()).not.toContain('Garlic');
  // Not the "every item has a rate" state: the search is what matched nothing.
  expect(shownText()).not.toContain('Every item has a rate.');

  const clear = tree!.root.findAll(node => node.props.accessibilityRole === 'button' && node.findAllByType(Text).some(t => flat(t.props.children) === 'Clear search'))[0];
  await act(async () => { clear.props.onPress(); });
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  expect(shownText()).toContain('Garlic');
  expect(shownText()).toContain('Dry Red Chillies');
});
