/** G-58: Items and Users do not add the bottom inset twice (the root layout already pads Android screens). */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ItemsScreen from '../../../app/items';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import UsersScreen from '../../../app/users';
import { adminUserService } from '@/services/admin-user-service';
let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
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

jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));
jest.mock('@/config/roles', () => ({ ...jest.requireActual('@/config/roles'), canOpenScreen: () => true }));
import { Platform, StyleSheet } from 'react-native';

const containerStyle = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
// The list's content padding is a prop of the scroll view the list draws: nothing is drawn for a query to reach.
const listPadding = () => StyleSheet.flatten(screen.root!.queryAll(node => (node.type as unknown) === 'RCTScrollView')[0].props.contentContainerStyle).paddingBottom;
const realOS = Platform.OS;
afterEach(() => { Platform.OS = realOS; });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(adminUserService.getUsersList).mockResolvedValue({ success: true, data: { users: [], pagination: { total_count: 0 } } } as never);
});

describe.each([['Items', 'items-screen', ItemsScreen], ['Users', 'users-screen', UsersScreen]] as const)('%s on Android with a 24 dp inset', (_name, testID, Screen) => {
  it('adds no bottom padding of its own', async () => {
    Platform.OS = 'android';
    await render(<Screen />);
    expect(containerStyle(testID).paddingBottom).toBeUndefined();
    expect(listPadding()).toBeLessThan(24 + 16);
  });
});

describe.each([['Items', ItemsScreen], ['Users', UsersScreen]] as const)('%s on iOS with a 24 dp inset', (_name, Screen) => {
  it('puts the inset inside the list content', async () => {
    Platform.OS = 'ios';
    await render(<Screen />);
    expect(listPadding()).toBeGreaterThanOrEqual(24);
  });
});
