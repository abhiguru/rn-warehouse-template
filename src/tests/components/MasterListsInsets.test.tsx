/** G-58: Items and Users do not add the bottom inset twice (the root layout already pads Android screens). */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));
jest.mock('@/config/roles', () => ({ ...jest.requireActual('@/config/roles'), canOpenScreen: () => true }));
import { Platform, StyleSheet } from 'react-native';

const containerStyle = (testID: string) => StyleSheet.flatten(tree!.root.find(node => node.props.testID === testID).props.style);
const listPadding = () => StyleSheet.flatten(tree!.root.find(node => typeof node.props.data === 'object' && node.props.renderItem).props.contentContainerStyle).paddingBottom;
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
    await act(async () => { tree = create(<Screen />); });
    expect(containerStyle(testID).paddingBottom).toBeUndefined();
    expect(listPadding()).toBeLessThan(24 + 16);
  });
});

describe.each([['Items', ItemsScreen], ['Users', UsersScreen]] as const)('%s on iOS with a 24 dp inset', (_name, Screen) => {
  it('puts the inset inside the list content', async () => {
    Platform.OS = 'ios';
    await act(async () => { tree = create(<Screen />); });
    expect(listPadding()).toBeGreaterThanOrEqual(24);
  });
});
