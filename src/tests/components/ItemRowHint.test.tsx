/** G-33: the spoken hint of an item row does not tell TalkBack users to swipe. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
  useLocalSearchParams: () => ({ id: 'i2' }),
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
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));

const rowFor = (name: string) => screen.findByLabelText(new RegExp(`^${name}`));

const ITEMS = [
  { id: 'i1', name: 'Dry Red Chillies', packaging: 'Bag', description: '', active: true },
  { id: 'i2', name: 'Garlic', packaging: 'Box', description: 'Peeled', active: true },
  { id: 'i3', name: 'Review Item 03', packaging: '', description: '', active: true },
];
const listOf = (data: unknown[], total = data.length) => ({ success: true, message: '', data, pagination: { total_count: total } });
const renderItems = async () => {
  jest.mocked(itemService.getItemList).mockResolvedValue(listOf(ITEMS, 91) as never);
  await render(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>);
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});

describe('item row hint', () => {
  it('only says what a tap does, and keeps the two actions', async () => {
    await renderItems();
    const row = await rowFor('Dry Red Chillies');
    expect(row.props.accessibilityHint).toBe('Opens the item.');
    expect(row.props.accessibilityHint).not.toContain('Swipe');
    expect(row.props.accessibilityActions).toEqual([
      { name: 'toggleActive', label: 'Deactivate' },
      { name: 'delete', label: 'Delete' },
    ]);
  });
});
