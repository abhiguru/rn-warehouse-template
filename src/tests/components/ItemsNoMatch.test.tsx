/** Items search that matches nothing: the message and Clear search show (not a blank list). */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const flat = (children: unknown) => [children].flat().join('');
const shownText = () => tree!.root.findAllByType(Text).map(node => flat(node.props.children)).join(' | ');
/** The first element with this accessibility label that can be pressed. */
const byLabel = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = async (label: string) => { await act(async () => { byLabel(label).props.onPress(); }); };
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text?: string; onPress?: () => void }[] };
};
const rowFor = (name: string) => tree!.root.find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(name) && node.props.accessibilityActions);

const ITEMS = [
  { id: 'i1', name: 'Dry Red Chillies', packaging: 'Bag', description: '', active: true },
  { id: 'i2', name: 'Garlic', packaging: 'Box', description: 'Peeled', active: true },
];
const listOf = (data: unknown[], total = data.length) => ({ success: true, message: '', data, pagination: { total_count: total } });
const type = async (text: string) => {
  const field = tree!.root.find(node => node.props.accessibilityLabel === 'Search by name, packaging or description' && typeof node.props.onChangeText === 'function');
  await act(async () => { field.props.onChangeText(text); });
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
    await act(async () => { tree = create(<ItemsScreen />); });
    expect(shownText()).toContain('Garlic');
    await type('zzzz');
    expect(shownText()).toContain('No items match "zzzz". Try fewer letters.');
    expect(shownText()).not.toContain('Garlic');
    expect(shownText()).not.toContain('No items yet');
    expect(byLabel('Clear search')).toBeDefined();
    // A list directly under the header must fill the space itself (as Customers' list does), or the
    // centred empty state has no height to draw in and the screen is blank.
    const list = tree!.root.find(node => typeof node.props.ListEmptyComponent === 'function' && node.props.data !== undefined && node.props.renderItem !== undefined && node.props.numColumns === undefined || (typeof node.props.ListEmptyComponent === 'function' && node.props.contentContainerStyle));
    expect(StyleSheet.flatten(list.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toEqual(expect.objectContaining({ flexGrow: 1 }));
  });
});
