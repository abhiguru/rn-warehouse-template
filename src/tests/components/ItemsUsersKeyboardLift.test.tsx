/**
 * WH-239: Items and Users end their list area at the keyboard's top while the keyboard is up (the screen's container
 * takes the lift as its marginBottom), so the "no match" state stays above it. Real screens and hook; the keyboard is
 * a recorded stand-in; the container's measureInWindow is given a place.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Keyboard, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemsScreen from '../../../app/items';
import UsersScreen from '../../../app/users';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { adminUserService } from '@/services/admin-user-service';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
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
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));

let tree: ReactTestRenderer | undefined;
let listeners: Record<string, (event?: unknown) => void>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    listeners[name] = handler;
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const container = (testID: string) => tree!.root.find(node => node.props.testID === testID && node.instance != null);
const margin = (testID: string) => Number((StyleSheet.flatten(container(testID).props.style) as { marginBottom?: number }).marginBottom ?? 0);

async function checkLift(testID: string) {
  (container(testID).instance as { measureInWindow: unknown }).measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) =>
    cb(0, 100, 1080, 1300); // un-lifted bottom at 1400
  expect(margin(testID)).toBe(0);
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1000, height: 800 } }); });
  expect(margin(testID)).toBe(400);
  await act(async () => { listeners.keyboardDidHide(); });
  expect(margin(testID)).toBe(0);
}

it('Items: the container takes the covered part as its bottom margin while the keyboard is up, and none when it hides', async () => {
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  await act(async () => { tree = create(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>); });
  await checkLift('items-screen');
});

it('Users: the container takes the covered part as its bottom margin while the keyboard is up, and none when it hides', async () => {
  jest.mocked(adminUserService.getUsersList).mockResolvedValue({ success: true, data: { users: [], pagination: { total_count: 0, limit: 20, offset: 0, has_more: false } } } as never);
  await act(async () => { tree = create(<UsersScreen />); });
  await checkLift('users-screen');
});
