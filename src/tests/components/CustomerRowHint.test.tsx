/** G-22: the row's spoken hint no longer tells a TalkBack user to swipe left. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { render, screen, userEvent } from '@testing-library/react-native';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';

// The stale-list strip reads the network state from NetInfo (a native module, absent under Jest): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerList: jest.fn(), getCustomerCounts: jest.fn(async () => null), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));

const rows = [
  { id: 'c1', name: 'Hilltop Fresh Mart', mobile: '9999900320', city: 'Rajkot', active: true },
  { id: 'c2', name: 'Old Stores', mobile: '9999900321', city: 'Surat', active: false },
];
const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 2 } } as never);
});
const mount = async () => {
  await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
  await screen.findByText('Hilltop Fresh Mart');
};

it('says only that the row opens the customer, for an active and an inactive customer', async () => {
  await mount();
  expect(rowOf('Hilltop Fresh Mart')).toHaveProp('accessibilityHint', 'Opens the customer.');
  expect(rowOf('Old Stores')).toHaveProp('accessibilityHint', 'Opens the customer.');
});

it('keeps the Deactivate and Activate actions for TalkBack', async () => {
  await mount();
  expect(rowOf('Hilltop Fresh Mart')).toHaveProp('accessibilityActions', [{ name: 'toggleActive', label: 'Deactivate' }]);
  expect(rowOf('Old Stores')).toHaveProp('accessibilityActions', [{ name: 'toggleActive', label: 'Activate' }]);
});

it('opens the customer page when the row is pressed', async () => {
  const { router } = require('expo-router');
  await mount();
  await userEvent.setup({ delay: 0 }).press(rowOf('Hilltop Fresh Mart'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'c1' } });
});
