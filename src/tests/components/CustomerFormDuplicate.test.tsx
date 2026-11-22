/** G-52: Add customer refuses a second customer with the same name or an active customer's number, and asks about a deactivated one. */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
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
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
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

const user = userEvent.setup({ delay: 0 });
const input = (label: string) => screen.getByLabelText(label);
const type = async (label: string, text: string) => {
  await user.clear(input(label));
  await user.paste(input(label), text);
};
/** Presses a button and lets the checks that follow it (the search, then the save) finish. */
const press = async (label: string) => {
  await user.press(screen.getByRole('button', { name: label }));
  await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
};
const mountEdit = async () => {
  jest.mocked(useLocalSearchParams).mockImplementation(() => ({ id: 'c1' }) as never);
  await render(<CustomerEditRoute />);
};
const mountAdd = async () => {
  await render(<CustomerFormRoute />);
};

type Button = { text?: string; onPress?: () => void };
const lastButtons = () => (jest.mocked(showAlert).mock.calls.slice(-1)[0][2] ?? []) as Button[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
});

const fill = async (name: string) => {
  await type('Customer name, required', name);
  await type('Mobile number after plus 91, required', '9000000099');
};

it('stops when a customer with the same name (any case) exists: Cancel and Open customer only, nothing is created', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
  await mountAdd();
  await fill('acme  foods');
  await press('Add customer');

  expect(customerService.searchCustomers).toHaveBeenCalledWith('acme  foods', 5, { includeInactive: true });
  expect(showAlert).toHaveBeenCalledTimes(1);
  const [title, message] = jest.mocked(showAlert).mock.calls[0];
  expect(title).toBe('Acme Foods already exists');
  expect(message).toContain('It has the mobile number +91 99999 00308.');
  expect(lastButtons().map(b => b.text)).toEqual(['Cancel', 'Open customer']);
  expect(customerService.createCustomer).not.toHaveBeenCalled();
});

it('Open customer goes to the existing customer page', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
  await mountAdd();
  await fill('Acme Foods');
  await press('Add customer');
  await act(async () => { lastButtons()[1].onPress?.(); });
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'c8' } });
  expect(customerService.createCustomer).not.toHaveBeenCalled();
});

it('refuses an active customer\'s mobile number under the field, naming the customer, with no dialog and no create', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c9', name: 'Other Name', mobile: '919000000099', active: true }] as never);
  await mountAdd();
  await fill('Zeta Traders');
  await press('Add customer');
  expect(showAlert).not.toHaveBeenCalled();
  expect(screen.getByText('Other Name already uses this mobile number. Use a different number.')).toBeOnTheScreen();
  expect(customerService.createCustomer).not.toHaveBeenCalled();
});

it('a deactivated customer with only the same number can be added anyway (Cancel, Open customer, Add new customer)', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c9', name: 'Old Name', mobile: '919000000099', active: false }] as never);
  await mountAdd();
  await fill('Zeta Traders');
  await press('Add customer');
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Old Name is deactivated');
  expect(lastButtons().map(b => b.text)).toEqual(['Cancel', 'Open customer', 'Add new customer']);
  expect(customerService.createCustomer).not.toHaveBeenCalled();
  await act(async () => { lastButtons()[2].onPress?.(); });
  expect(customerService.createCustomer).toHaveBeenCalledTimes(1);
});

it('a deactivated customer with the same name cannot be added again (Cancel, Open customer, Use a different name)', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c9', name: 'Zeta Traders', mobile: '919111111111', active: false }] as never);
  await mountAdd();
  await fill('zeta traders');
  await press('Add customer');
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Zeta Traders is deactivated');
  expect(lastButtons().map(b => b.text)).toEqual(['Cancel', 'Open customer', 'Use a different name']);
  expect(customerService.createCustomer).not.toHaveBeenCalled();
});

it('creates at once when nothing matches', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
  await mountAdd();
  await fill('Zeta Traders');
  await press('Add customer');
  expect(showAlert).not.toHaveBeenCalled();
  expect(customerService.createCustomer).toHaveBeenCalledTimes(1);
});

it('does not block the save when the search fails', async () => {
  jest.mocked(customerService.searchCustomers).mockRejectedValue(new Error('offline'));
  await mountAdd();
  await fill('Zeta Traders');
  await press('Add customer');
  expect(customerService.createCustomer).toHaveBeenCalledTimes(1);
});

it('does not search when editing', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: { id: 'c1', name: 'Acme Foods', mobile: '9999900308', active: true, created_at: 'x' } } as never);
  jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: '' } as never);
  await mountEdit();
  await type('City', 'Rajkot');
  await press('Save customer');
  expect(customerService.searchCustomers).not.toHaveBeenCalled();
});
