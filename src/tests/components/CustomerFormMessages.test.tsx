/** G-17: a saved customer is a toast, a failure is a plain dialog; no 'Success' or 'Error'. */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router, useLocalSearchParams } from 'expo-router';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: {
    getCustomerById: jest.fn(),
    updateCustomer: jest.fn(),
    createCustomer: jest.fn(),
    searchCustomers: jest.fn(),
    inactivateCustomer: jest.fn(),
    restoreCustomer: jest.fn(),
  },
}));
import CustomerEditRoute from '../../../app/customer-edit/[id]';
import CustomerFormRoute from '../../../app/customer-form';

const c1 = { id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', active: true, created_at: '2026-01-01' };

const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label) as ReturnType<ReactTestRenderer['root']['findAllByType']>[number];
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0];
const type = async (tree: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { input(tree, label).props.onChangeText(text); });
};
let tree: ReactTestRenderer | undefined;
const mountEdit = async () => {
  jest.mocked(useLocalSearchParams).mockImplementation(() => ({ id: 'c1' }) as never);
  await act(async () => { tree = create(<CustomerEditRoute />); });
  return tree as ReactTestRenderer;
};
const mountAdd = async () => {
  await act(async () => { tree = create(<CustomerFormRoute />); });
  return tree as ReactTestRenderer;
};
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
});

it('shows the saved name as a toast, with no dialog, after Edit', async () => {
  jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: 'Customer updated successfully' } as never);
  const screen = await mountEdit();
  await type(screen, 'City', 'Rajkot X');
  await act(async () => { await button(screen, 'Save customer').props.onPress(); });
  expect(showToast).toHaveBeenCalledWith('24 Seven Foods saved.');
  expect(showAlert).not.toHaveBeenCalled();
});

it('says the customer could not be saved, with the connection hint, when the server is out of reach', async () => {
  jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: false, message: 'network request failed' } as never);
  const screen = await mountEdit();
  await type(screen, 'City', 'Rajkot X');
  await act(async () => { await button(screen, 'Save customer').props.onPress(); });
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe("Couldn't save the customer");
  expect(showToast).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

it('shows "<name> added." after Add', async () => {
  jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
  const screen = await mountAdd();
  await type(screen, 'Customer name, required', 'Test Doc');
  await type(screen, 'Mobile number after plus 91, required', '9000000099');
  await act(async () => { await button(screen, 'Add customer').props.onPress(); });
  expect(showToast).toHaveBeenCalledWith('Test Doc added.');
  expect(showAlert).not.toHaveBeenCalled();
});

it('never uses the old developer wording', async () => {
  const { en } = require('@/i18n/locales/en');
  const all = JSON.stringify(en.customers);
  for (const old of ['Validation Error', 'Customer created successfully', 'Customer updated successfully', 'An unexpected error occurred']) {
    expect(all).not.toContain(old);
  }
});
