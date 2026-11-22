/**
 * WH-215: the Items "no rate" view, searched for something it does not hold, says so with the same title and message as the
 * main list (items.list.noMatchTitle and customers.search.noMatchMessage) and offers Clear search; it is not the old one-line text.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, render, screen, userEvent } from '@testing-library/react-native';
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

afterEach(() => {
  jest.useRealTimers();
});

// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const ITEMS = [
  { id: 'i1', name: 'Dry Red Chillies', packaging: 'Bag', description: '', active: true },
  { id: 'i2', name: 'Garlic', packaging: 'Box', description: 'Peeled', active: true },
];

it('says no item without a rate matches the search, with the main list\'s title and message, and Clear search brings the rows back', async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  clearItemRatesCache();
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: ITEMS, pagination: { total_count: 2 } } as never);
  // Two active items and no rate at all: both are "no rate".
  jest.mocked(listActiveItems).mockResolvedValue(ITEMS.map(({ id, name, packaging }) => ({ id, name, packaging })));
  jest.mocked(listAllRates).mockResolvedValue([]);
  await render(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>);
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });

  await user.press(screen.getByTestId('no-rate-show'));
  expect(screen.getByText('Showing only items with no rate.')).toBeOnTheScreen();
  expect(screen.getByText(/Garlic/)).toBeOnTheScreen();

  const field = screen.getByLabelText('Search by name, packaging or description');
  await user.type(field, 'zzzz');
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  expect(screen.getByText('No items match "zzzz"')).toBeOnTheScreen();
  expect(screen.getByText('Try fewer letters or another spelling.')).toBeOnTheScreen();
  expect(screen.queryByText(/Garlic/, hidden)).not.toBeOnTheScreen();
  // Not the "every item has a rate" state: the search is what matched nothing.
  expect(screen.queryByText(/Every item has a rate\./, hidden)).not.toBeOnTheScreen();

  await user.press(screen.getByText('Clear search'));
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  expect(screen.getByText(/Garlic/)).toBeOnTheScreen();
  expect(screen.getByText(/Dry Red Chillies/)).toBeOnTheScreen();
});
