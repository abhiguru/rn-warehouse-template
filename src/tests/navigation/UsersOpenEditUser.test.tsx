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
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { routerStore } from '@/tests/helpers/routerStore';
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
// The stale-list strip reads the network state from NetInfo (a native module, absent under Jest): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: ReturnType<typeof mockStore.getState>) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

const settle = async () => {
  await act(async () => { await jest.runAllTimersAsync(); });
};
const pathname = () => routerStore.getRouteInfo().pathname;
const routeNames = () => (routerStore.state?.routes[0]?.state?.routes ?? []).map((route) => route.name);

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
  await render(<ExpoRoot context={context} location="/users" />);
  await settle();
});

afterEach(() => {
  jest.useRealTimers();
});

// A check that something is NOT drawn must also see a node that is mounted but hidden.
const rowFor = (label: string) => screen.getByLabelText(label);
const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });

it('pressing a user row opens Edit user for that person', async () => {
  expect(pathname()).toBe('/users');
  await user().press(rowFor('Dev Customer One, Customer, +91 90000 00003, 1 customer assigned'));
  await settle();

  expect(pathname()).toBe('/user-edit/u3');
  expect(routeNames()).toEqual(['users', 'user-edit/[id]']);
  expect(adminUserService.getUserDetails).toHaveBeenCalledWith('u3');
  expect(screen.getAllByText('Edit user')[0]).toBeOnTheScreen();
  expect(screen.getAllByText('Dev Customer One')[0]).toBeOnTheScreen();
});

it('Edit user shows the title and a Back button in the stack header, even while loading', async () => {
  // WH-216: the title and Back come from the stack header (Stack.Screen options), which the loading state also renders.
  jest.mocked(adminUserService.getUserDetails).mockReturnValue(new Promise(() => undefined) as never);
  await user().press(rowFor('Dev Staff, Staff, +91 90000 00002'));
  await settle();

  expect(pathname()).toBe('/user-edit/u2');
  expect(screen.getAllByText('Edit user')[0]).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: 'Back' }).length).toBeGreaterThan(0);
});
