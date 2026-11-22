/** G-55: an item row wears the same cube glyph, not a person's initials. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { render, screen, within } from '@testing-library/react-native';
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

// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
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

describe('item row', () => {
  it('shows a cube icon and no initials', async () => {
    await renderItems();
    const row = await rowFor('Dry Red Chillies');
    expect(within(row).getByText('Dry Red Chillies · Bag')).toBeOnTheScreen();
    expect(within(row).queryByText('DR', hidden)).not.toBeOnTheScreen();
    // The glyph is an icon element with no role or text a query can reach: its name is read from the row's host tree.
    const icons = row.queryAll(node => (node.type as unknown) === 'Icon').map(node => node.props.name);
    expect(icons).toContain('cube-outline');
    expect(icons).not.toContain('package-variant');
    // The glyph is decoration: it is hidden from screen readers.
    const glyph = row.queryAll(node => node.props.importantForAccessibility === 'no-hide-descendants');
    expect(glyph.length).toBeGreaterThan(0);
  });
});
