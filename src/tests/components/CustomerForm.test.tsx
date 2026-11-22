/**
 * The one-page customer form (G-14, G-18, G-49): Add and Edit share it; there
 * are no steps, no Documents section and no example email in the Email box.
 */
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

import CustomerEditRoute from '../../../app/customer-edit/[id]';
import CustomerFormRoute from '../../../app/customer-form';

const c1 = {
  id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', gst: '', active: true,
  document_urls: ['doc1.jpg'], image_urls: ['img1.jpg'], created_at: '2026-01-01', updated_at: '2026-02-02T10:00:00Z',
};

const user = userEvent.setup({ delay: 0 });
const input = (label: string) => screen.getByLabelText(label);
const shown = (text: string | RegExp) => screen.queryAllByText(text);
const button = (label: string) => screen.getByRole('button', { name: label });
const press = async (label: string) => {
  await user.press(button(label));
};
const type = async (label: string, text: string) => {
  await user.clear(input(label));
  await user.paste(input(label), text);
};

const mountEdit = async () => {
  jest.mocked(useLocalSearchParams).mockImplementation(() => ({ id: 'c1' }) as never);
  await render(<CustomerEditRoute />);
};
const mountAdd = async () => {
  await render(<CustomerFormRoute />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
});
describe('Edit customer', () => {
  it('opens on one page titled Edit customer with the loaded values and four sections', async () => {
    await mountEdit();
    expect(shown(/Edit customer/).length).toBeGreaterThan(0);
    expect(input('Customer name, required')).toHaveDisplayValue('24 Seven Foods');
    expect(input('City')).toHaveDisplayValue('Rajkot');
    for (const section of ['BASIC INFORMATION', 'ADDRESS', 'TAX DETAILS', 'CONTACT PERSON']) expect(shown(section).length).toBeGreaterThan(0);
    expect(shown(/Step \d of/)).toHaveLength(0);
    expect(button('Save customer')).toBeOnTheScreen();
  });

  it('saves with nothing changed without calling the server', async () => {
    await mountEdit();
    // Save is switched off while nothing changed (WH-227), so the tap is sent past that: the handler's own guard is what is tested.
    // Testing Library shows host views only; the Pressable's own onPress is on the fiber above the button's view.
    let fiber = button('Save customer').unstable_fiber;
    while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
    const onPress = fiber?.memoizedProps.onPress as () => Promise<void>;
    await act(async () => { await onPress(); });
    expect(customerService.updateCustomer).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('keeps Save switched off until a value changes, and on after one (WH-227)', async () => {
    await mountEdit();
    const disabled = () => button('Save customer').props.accessibilityState?.disabled;
    expect(disabled()).toBe(true);
    expect(button('Save customer')).toBeDisabled();
    await type('City', 'Rajkot X');
    expect(disabled()).toBe(false);
    expect(button('Save customer')).toBeEnabled();
    await type('City', 'Rajkot');
    expect(disabled()).toBe(true);
  });

  it('sends the changed city for the route id and keeps the saved photos', async () => {
    jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: '' } as never);
    await mountEdit();
    await type('City', 'Rajkot X');
    await press('Save customer');
    // Only the changed field is sent (never the untouched name or mobile), with the updated_at that was read.
    expect(customerService.updateCustomer).toHaveBeenCalledWith({
      p_customer_id: 'c1',
      p_city: 'Rajkot X',
      p_image_urls: ['img1.jpg'],
      p_expected_updated_at: '2026-02-02T10:00:00Z',
    });
  });
});

describe('Add customer', () => {
  it('is titled Add customer and offers the same four sections and an Add customer button', async () => {
    await mountAdd();
    expect(shown(/Add customer/).length).toBeGreaterThan(0);
    for (const section of ['BASIC INFORMATION', 'ADDRESS', 'TAX DETAILS', 'CONTACT PERSON']) expect(shown(section).length).toBeGreaterThan(0);
    expect(input('Customer name, required')).toHaveDisplayValue('');
    expect(customerService.getCustomerById).not.toHaveBeenCalled();
  });

  it('creates the customer and replaces the form with the new customer page', async () => {
    jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
    await mountAdd();
    await type('Customer name, required', 'Test Doc');
    await type('Mobile number after plus 91, required', '9000000099');
    await press('Add customer');
    expect(customerService.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ p_name: 'Test Doc', p_mobile: '919000000099' })
    );
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'new-id' } });
  });

  it('groups the typed mobile number 5 + 5 and stores ten digits', async () => {
    await mountAdd();
    await type('Mobile number after plus 91, required', '9000000099');
    expect(input('Mobile number after plus 91, required')).toHaveDisplayValue('90000 00099');
  });
});

describe('no documents (G-18)', () => {
  it('has no Documents section and no word about the local demo', async () => {
    await mountAdd();
    expect(shown(/local demo/i)).toHaveLength(0);
    expect(shown(/documents/i)).toHaveLength(0);
    expect(shown(/uploads/i)).toHaveLength(0);
  });
});

describe('field wording (G-49)', () => {
  it('shows the Email box without an example address', async () => {
    await mountAdd();
    expect(input('Email, optional').props.placeholder).toBeUndefined();
    expect(shown(/Optional\. Used for sending invoices\./).length).toBeGreaterThan(0);
  });
});

describe('empty form (G-48)', () => {
  it('asks for the name and the mobile number, and stays on the form', async () => {
    await mountAdd();
    await press('Add customer');
    expect(shown(/Enter the customer name\./).length).toBeGreaterThan(0);
    expect(shown(/Enter a mobile number\./).length).toBeGreaterThan(0);
    expect(shown(/Enter at least 2 characters\./)).toHaveLength(0);
    expect(customerService.createCustomer).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
