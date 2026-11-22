/** Code-review fixes CR-08, 21, 22, 23, 24 for the customer form. */
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
  if (text) await user.paste(input(label), text);
};
/** Presses a button and lets the checks and the save that follow finish. */
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
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
});
const fill = async (name: string) => {
  await type('Customer name, required', name);
  await type('Mobile number after plus 91, required', '9000000099');
};

it('CR-08: clearing the email in Edit sends an empty email, not undefined', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({
    success: true, message: '',
    data: { id: 'c1', name: 'Acme Foods', mobile: '9999900308', email: 'old@example.com', city: 'Rajkot', active: true, created_at: 'x' },
  } as never);
  jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: '' } as never);
  await mountEdit();
  await type('Email, optional', '');
  await press('Save customer');
  const sent = jest.mocked(customerService.updateCustomer).mock.calls[0][0];
  expect(sent.p_email).toBe('');
  // Edit sends only what was changed: the city, mobile and GST were not touched.
  expect(sent.p_city).toBeUndefined();
  expect(sent.p_mobile).toBeUndefined();
  expect(sent.p_gst_number).toBeUndefined();
  expect(sent.p_customer_id).toBe('c1');
});

it('CR-08: Add still leaves an empty optional field out', async () => {
  await mountAdd();
  await fill('Zeta Traders');
  await press('Add customer');
  expect(jest.mocked(customerService.createCustomer).mock.calls[0][0].p_email).toBeUndefined();
});

it('CR-21: a second tap while the first save is still searching does nothing', async () => {
  let release: (v: never[]) => void = () => {};
  jest.mocked(customerService.searchCustomers).mockReturnValue(new Promise(resolve => { release = resolve as never; }));
  await mountAdd();
  await fill('Zeta Traders');
  // Two taps reach the button before React has drawn anything between them: userEvent and fireEvent each wait for a draw
  // between presses, so the host's click is called twice inside one act.
  const click = screen.getByRole('button', { name: 'Add customer' }).props.onClick as (event: unknown) => void;
  await act(async () => { click({}); click({}); });
  await act(async () => { release([]); for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
  // One save searches twice (name, mobile); a second tap would make it four.
  expect(customerService.searchCustomers).toHaveBeenCalledTimes(2);
  expect(customerService.createCustomer).toHaveBeenCalledTimes(1);
});

it('CR-22: an exact name match offers Cancel and Open customer only', async () => {
  jest.mocked(customerService.searchCustomers).mockResolvedValue([{ id: 'c8', name: 'Acme Foods', mobile: '9999900308', active: true }] as never);
  await mountAdd();
  await fill('Acme Foods');
  await press('Add customer');
  expect(lastButtons().map(b => b.text)).toEqual(['Cancel', 'Open customer']);
  expect(jest.mocked(showAlert).mock.calls[0][1]).toContain('name must be different');
});

it('CR-22: DUPLICATE_NAME from the server is shown under the name field in the app\'s own words', async () => {
  jest.mocked(customerService.createCustomer).mockResolvedValue({
    success: false, message: 'A customer with this name already exists', error: 'DUPLICATE_NAME', code: 'DUPLICATE_NAME',
  } as never);
  await mountAdd();
  await fill('Zeta Traders');
  await press('Add customer');
  expect(showAlert).not.toHaveBeenCalled();
  expect(screen.getByText('A customer with this name already exists. Use a different name.')).toBeOnTheScreen();
});

it('CR-23: the length limits are the column sizes (name 80, city 25, address 300)', async () => {
  await mountAdd();
  expect(input('Customer name, required')).toHaveProp('maxLength', 80);
  expect(input('City')).toHaveProp('maxLength', 25);
  expect(input('Full address')).toHaveProp('maxLength', 300);
});

it('CR-24: the duplicate search also looks for the mobile number and merges the answers', async () => {
  jest.mocked(customerService.searchCustomers).mockImplementation(async (query: string) =>
    query === '919000000099' ? ([{ id: 'c9', name: 'Patel Traders', mobile: '919000000099', active: true }] as never) : []
  );
  await mountAdd();
  await fill('R. Patel & Sons');
  await press('Add customer');
  expect(customerService.searchCustomers).toHaveBeenCalledWith('R. Patel & Sons', 5, { includeInactive: true });
  expect(customerService.searchCustomers).toHaveBeenCalledWith('919000000099', 5, { includeInactive: true });
  // The active customer with this number is named under the mobile field; no dialog.
  expect(showAlert).not.toHaveBeenCalled();
  expect(screen.getByText('Patel Traders already uses this mobile number. Use a different number.')).toBeOnTheScreen();
  expect(customerService.createCustomer).not.toHaveBeenCalled();
});
