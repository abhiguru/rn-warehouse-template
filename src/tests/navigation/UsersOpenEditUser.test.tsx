/**
 * G-04 (Settings review 2026-10-14): tapping a user in Users opened nothing.
 *
 * The real expo-router stack runs here (the in-memory route context of
 * expo-router's own testing library) with the real Users list and the real
 * Edit user screen. Pressing the row must put /user-edit/<id> on top of the
 * stack and Edit user must show its own header ("Edit user" and a Back button)
 * and the person it loaded.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store as routerStore } from 'expo-router/build/global-state/router-store';
import { Stack } from 'expo-router';
import { adminUserService } from '@/services/admin-user-service';
import UsersScreen from '../../../app/users';
import UserEditScreen from '../../../app/user-edit/[id]';

const makeStore = () =>
  configureStore({
    reducer: {
      auth: () => ({ userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } }),
      theme: () => ({ preference: 'light', brand: 'orange' }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
const mockStore = makeStore();
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: ReturnType<typeof mockStore.getState>) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/components/RolePickerBottomSheet', () => ({ RolePickerBottomSheet: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/customer-service', () => ({ customerService: { searchCustomers: jest.fn() } }));
jest.mock('@/services/admin-user-service', () => ({
  adminUserService: {
    getUsersList: jest.fn(),
    getUserDetails: jest.fn(),
    updateUserRole: jest.fn(),
    updateUserStatus: jest.fn(),
    assignCustomerToUser: jest.fn(),
    removeCustomerAssignment: jest.fn(),
  },
}));

const USERS = [
  { id: 'u3', name: 'Dev Customer One', mobile: '9000000003', role: 'customer', active: true, assigned_customers_count: 1 },
  { id: 'u2', name: 'Dev Staff', mobile: '9000000002', role: 'staff', active: true, assigned_customers_count: 0 },
];

let tree: ReactTestRenderer;
const settle = async () => {
  await act(async () => { await jest.runAllTimersAsync(); });
};
const pathname = () => routerStore.getRouteInfo().pathname;
const routeNames = () => (routerStore.state?.routes[0]?.state?.routes ?? []).map((route) => route.name);
const shownText = () =>
  tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join('')).join(' | ');

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  jest.mocked(adminUserService.getUsersList).mockResolvedValue({
    success: true,
    data: { users: USERS, pagination: { total_count: 2 } },
  } as never);
  jest.mocked(adminUserService.getUserDetails).mockImplementation((async (id: string) => ({
    success: true,
    data: {
      id,
      name: id === 'u3' ? 'Dev Customer One' : 'Dev Staff',
      mobile: id === 'u3' ? '9000000003' : '9000000002',
      role: id === 'u3' ? 'customer' : 'staff',
      active: true,
      assigned_customers: [],
    },
  })) as never);
  const context = getMockContext({
    _layout: () => <Stack />,
    users: UsersScreen,
    'user-edit/[id]': UserEditScreen,
  });
  await act(async () => {
    tree = create(<ExpoRoot context={context} location="/users" />);
  });
  await settle();
});

afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.useRealTimers();
});

const rowFor = (label: string) =>
  tree.root.find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label);

it('pressing a user row opens Edit user for that person', async () => {
  expect(pathname()).toBe('/users');
  const row = rowFor('Dev Customer One, Customer, +91 90000 00003, 1 customer assigned');
  await act(async () => { row.props.onPress(); });
  await settle();

  expect(pathname()).toBe('/user-edit/u3');
  expect(routeNames()).toEqual(['users', 'user-edit/[id]']);
  expect(adminUserService.getUserDetails).toHaveBeenCalledWith('u3');
  const text = shownText();
  expect(text).toContain('Edit user');
  expect(text).toContain('Dev Customer One');
});

it('Edit user draws its own header: the title and a Back button, even while loading', async () => {
  // Edit user must not depend on Stack.Screen options for its header (Edit item does not).
  const screenOptions = jest.spyOn(Stack, 'Screen').mockImplementation((() => null) as never);
  jest.mocked(adminUserService.getUserDetails).mockReturnValue(new Promise(() => undefined) as never);
  await act(async () => { rowFor('Dev Staff, Staff, +91 90000 00002').props.onPress(); });
  await settle();

  expect(pathname()).toBe('/user-edit/u2');
  expect(shownText()).toContain('Edit user');
  const back = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Back');
  expect(back.length).toBeGreaterThan(0);
  screenOptions.mockRestore();
});
