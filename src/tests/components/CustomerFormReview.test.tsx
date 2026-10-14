/** Code-review fixes CR-08, 21, 22, 23, 24 for the customer form. */
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
import CustomerFormRoute from '../../../app/customer-form';
import CustomerEditRoute from '../../../app/customer-edit/[id]';

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


type Button = { text?: string; onPress?: () => void };
const lastButtons = () => (jest.mocked(showAlert).mock.calls.slice(-1)[0][2] ?? []) as Button[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
});
const fill = async (screen: ReactTestRenderer, name: string) => {
  await type(screen, 'Customer name, required', name);
  await type(screen, 'Mobile number after plus 91, required', '9000000099');
};

it('CR-08: clearing the email in Edit sends an empty email, not undefined', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({
    success: true, message: '',
    data: { id: 'c1', name: 'Acme Foods', mobile: '9999900308', email: 'old@example.com', city: 'Rajkot', active: true, created_at: 'x' },
  } as never);
  jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: '' } as never);
  const screen = await mountEdit();
  await type(screen, 'Email, optional', '');
  await act(async () => { await button(screen, 'Save customer').props.onPress(); });
  const sent = jest.mocked(customerService.updateCustomer).mock.calls[0][0];
  expect(sent.p_email).toBe('');
  expect(sent.p_city).toBe('Rajkot');
  expect(sent.p_gst_number).toBe('');
});

it('CR-08: Add still leaves an empty optional field out', async () => {
  const screen = await mountAdd();
  await fill(screen, 'Zeta Traders');
  await act(async () => { await button(screen, 'Add customer').props.onPress(); });
  expect(jest.mocked(customerService.createCustomer).mock.calls[0][0].p_email).toBeUndefined();
});

it('CR-21: a second tap while the first save is still searching does nothing', async () => {
  let release: (v: never[]) => void = () => {};
  jest.mocked(customerService.searchCustomers).mockReturnValue(new Promise(resolve => { release = resolve as never; }));
  const screen = await mountAdd();
  await fill(screen, 'Zeta Traders');
  let first: Promise<void> | undefined;
  await act(async () => {
    first = button(screen, 'Add customer').props.onPress();
    await button(screen, 'Add customer').props.onPress();
  });
  await act(async () => { release([]); await first; });
  // One save searches twice (name, mobile); a second tap would make it four.
  expect(customerService.searchCustomers).toHaveBeenCalledTimes(2);
  expect(customerService.createCustomer).toHaveBeenCalledTimes(1);
});

it('CR-22: an exact name match offers Cancel and Open customer only', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
  const screen = await mountAdd();
  await fill(screen, 'Acme Foods');
  await act(async () => { await button(screen, 'Add customer').props.onPress(); });
  expect(lastButtons().map(b => b.text)).toEqual(['Cancel', 'Open customer']);
  expect(jest.mocked(showAlert).mock.calls[0][1]).toContain('name must be different');
});

it('CR-22: DUPLICATE_NAME from the server are shown in the app\'s own words', async () => {
  jest.mocked(customerService.createCustomer).mockResolvedValue({
    success: false, message: 'A customer with this name already exists', error: 'DUPLICATE_NAME', code: 'DUPLICATE_NAME',
  } as never);
  const screen = await mountAdd();
  await fill(screen, 'Zeta Traders');
  await act(async () => { await button(screen, 'Add customer').props.onPress(); });
  expect(jest.mocked(showAlert).mock.calls[0][1]).toBe('A customer with this name already exists. Use a different name.');
});

it('CR-23: the length limits are the column sizes (name 80, city 25, address 300)', async () => {
  const screen = await mountAdd();
  expect(input(screen, 'Customer name, required').props.maxLength).toBe(80);
  expect(input(screen, 'City').props.maxLength).toBe(25);
  expect(input(screen, 'Full address').props.maxLength).toBe(300);
});

it('CR-24: the duplicate search also looks for the mobile number and merges the answers', async () => {
  jest.mocked(customerService.searchCustomers).mockImplementation(async (query: string) =>
    query === '919000000099' ? ([{ id: 'c9', name: 'Patel Traders', mobile: '919000000099', active: true }] as never) : []
  );
  const screen = await mountAdd();
  await fill(screen, 'R. Patel & Sons');
  await act(async () => { await button(screen, 'Add customer').props.onPress(); });
  expect(customerService.searchCustomers).toHaveBeenCalledWith('R. Patel & Sons', 5);
  expect(customerService.searchCustomers).toHaveBeenCalledWith('919000000099', 5);
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Patel Traders already exists');
  expect(customerService.createCustomer).not.toHaveBeenCalled();
});
