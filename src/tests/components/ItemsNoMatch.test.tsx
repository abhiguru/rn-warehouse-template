/** Items search that matches nothing: the message and Clear search show (not a blank list). */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import ItemsScreen from '../../../app/items';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'staff', name: 'Dev Staff' } } };
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
  itemService: {
    getItemList: jest.fn(),
    getItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    toggleItemActive: jest.fn(),
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));

// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });

const ITEMS = [
  { id: 'i1', name: 'Dry Red Chillies', packaging: 'Bag', description: '', active: true },
  { id: 'i2', name: 'Garlic', packaging: 'Box', description: 'Peeled', active: true },
];
const listOf = (data: unknown[], total = data.length) => ({ success: true, message: '', data, pagination: { total_count: total } });
const type = async (text: string) => {
  const field = screen.getByLabelText('Search by name, packaging or description');
  await user.clear(field);
  await user.type(field, text);
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});
afterEach(() => { jest.useRealTimers(); });

describe('Items search with no match', () => {
  it('says nothing matches and offers Clear search', async () => {
    jest.mocked(itemService.getItemList).mockImplementation((async (filters: { search?: string }) =>
      filters.search === 'zzzz' ? listOf([]) : listOf(ITEMS)) as never);
    await render(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>);
    expect(await screen.findByText(/Garlic/)).toBeOnTheScreen();
    await type('zzzz');
    expect(screen.getByText('No items match "zzzz"')).toBeOnTheScreen();
    expect(screen.getByText('Try fewer letters or another spelling.')).toBeOnTheScreen();
    expect(screen.queryByText(/Garlic/, hidden)).not.toBeOnTheScreen();
    expect(screen.queryByText(/No items yet/, hidden)).not.toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Clear search' }).length).toBeGreaterThan(0);
    // A list directly under the header must fill the space itself (as Customers' list does), or the
    // centred empty state has no height to draw in and the screen is blank. The scroll view the list draws
    // has no role or text a query can reach, so its host props are read.
    const list = screen.root!.queryAll(node => (node.type as unknown) === 'RCTScrollView')[0];
    expect(StyleSheet.flatten(list.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toEqual(expect.objectContaining({ flexGrow: 1 }));
  });
});
