/**
 * G-42: Account details on Change name. A warehouse role (admin, supervisor, staff) sees
 * every active customer by rule, so it shows one count ("24 customers") instead of one row
 * for each; a customer account keeps the list of its assigned customers.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ userId: 'profile-1' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }),
}));
jest.mock('@/store/slices/authSlice', () => ({ setUserProfile: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null }));
jest.mock('@/services/user-service', () => ({
  UserService: { getUserById: jest.fn(), getAccessibleCustomers: jest.fn(), updateUser: jest.fn() },
}));

import { UserService } from '@/services/user-service';
import OwnProfileEditScreen from '../../../app/user/edit/[userId]';

const customers = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `customer-${index + 1}`,
    name: `Fictional Traders ${index + 1}`,
    mobile: '9000000001',
    city: 'Rajkot',
    active: true,
  }));
const profile = (role: string, assigned: ReturnType<typeof customers>) => ({
  success: true,
  message: 'ok',
  data: {
    id: 'profile-1',
    auth_user_id: 'auth-1',
    name: 'Asha Example',
    email: '',
    mobile: '9000000002',
    role: role as never,
    supervisor: false,
    active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    assignedCustomers: assigned,
    assignedCustomersStatus: 'loaded' as const,
  },
});

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  mockState = {
    theme: { preference: 'light', brand: 'orange', language: 'en' },
    auth: { userProfile: { id: 'profile-1', name: 'Asha Example', role: 'staff' } },
  };
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

async function openDetails(role: string, count: number) {
  jest.mocked(UserService.getUserById).mockResolvedValue(profile(role, customers(count)));
  await act(async () => {
    tree = create(<OwnProfileEditScreen />);
  });
  const toggle = tree!.root.findAll(node => node.props.testID === 'self-edit-account-details' && typeof node.props.onPress === 'function')[0];
  await act(async () => {
    toggle.props.onPress();
  });
  return tree!.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
}

it('staff with 24 active customers: one count, no row for each, no Active tags', async () => {
  const shown = await openDetails('staff', 24);
  expect(shown).toContain('24 customers');
  expect(shown.filter(text => text.startsWith('Fictional Traders'))).toHaveLength(0);
  // Only the Status row says Active; there is no Active tag per customer.
  expect(shown.filter(text => text === 'Active')).toHaveLength(1);
  expect(shown).toContain('Your role lets you see every active customer of this facility.');
});

it('one customer reads "1 customer"', async () => {
  const shown = await openDetails('admin', 1);
  expect(shown).toContain('1 customer');
});

it('a customer account with 2 assignments keeps its 2 rows', async () => {
  const shown = await openDetails('customer', 2);
  expect(shown.filter(text => text.startsWith('Fictional Traders'))).toHaveLength(2);
  expect(shown).not.toContain('2 customers');
});
