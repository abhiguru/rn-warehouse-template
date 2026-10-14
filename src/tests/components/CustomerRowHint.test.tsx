/** G-22: the row's spoken hint no longer tells a TalkBack user to swipe left. */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';

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
  customerService: { getCustomerList: jest.fn(), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));

const rows = [
  { id: 'c1', name: 'Hilltop Fresh Mart', mobile: '9999900320', city: 'Rajkot', active: true },
  { id: 'c2', name: 'Old Stores', mobile: '9999900321', city: 'Surat', active: false },
];
const rowOf = (screen: ReactTestRenderer, name: string) =>
  screen.root.find(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' &&
    typeof node.props.accessibilityHint === 'string' && String(node.props.accessibilityLabel).startsWith(name));

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 2 } } as never);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});
const mount = async () => {
  await act(async () => { tree = create(<CustomersScreen />); });
  return tree as ReactTestRenderer;
};

it('says only that the row opens the customer, for an active and an inactive customer', async () => {
  const screen = await mount();
  expect(rowOf(screen, 'Hilltop Fresh Mart').props.accessibilityHint).toBe('Opens the customer.');
  expect(rowOf(screen, 'Old Stores').props.accessibilityHint).toBe('Opens the customer.');
});

it('keeps the Deactivate and Activate actions for TalkBack', async () => {
  const screen = await mount();
  expect(rowOf(screen, 'Hilltop Fresh Mart').props.accessibilityActions).toEqual([{ name: 'toggleActive', label: 'Deactivate' }]);
  expect(rowOf(screen, 'Old Stores').props.accessibilityActions).toEqual([{ name: 'toggleActive', label: 'Activate' }]);
});

it('opens the customer page when the row is pressed', async () => {
  const { router } = require('expo-router');
  const screen = await mount();
  const row = screen.root.findAll(node => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith('Hilltop Fresh Mart'))[0];
  await act(async () => { row.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'c1' } });
});
