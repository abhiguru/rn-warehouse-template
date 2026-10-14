/**
 * The one-page customer form (G-14, G-18, G-49): Add and Edit share it; there
 * are no steps, no Documents section and no example email in the Email box.
 */
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

const c1 = {
  id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', gst: '', active: true,
  document_urls: ['doc1.jpg'], image_urls: ['img1.jpg'], created_at: '2026-01-01',
};

const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label) as ReturnType<ReactTestRenderer['root']['findAllByType']>[number];
const shownText = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(3).join('')).join(' | ');
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

describe('Edit customer', () => {
  it('opens on one page titled Edit customer with the loaded values and four sections', async () => {
    const screen = await mountEdit();
    const text = shownText(screen);
    expect(text).toContain('Edit customer');
    expect(input(screen, 'Customer name, required').props.value).toBe('24 Seven Foods');
    expect(input(screen, 'City').props.value).toBe('Rajkot');
    for (const section of ['BASIC INFORMATION', 'ADDRESS', 'TAX DETAILS', 'CONTACT PERSON']) expect(text).toContain(section);
    expect(text).not.toMatch(/Step \d of/);
    expect(button(screen, 'Save customer')).toBeDefined();
  });

  it('saves with nothing changed without calling the server', async () => {
    const screen = await mountEdit();
    await act(async () => { await button(screen, 'Save customer').props.onPress(); });
    expect(customerService.updateCustomer).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('sends the changed city for the route id and keeps the saved photos', async () => {
    jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: '' } as never);
    const screen = await mountEdit();
    await type(screen, 'City', 'Rajkot X');
    await act(async () => { await button(screen, 'Save customer').props.onPress(); });
    expect(customerService.updateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        p_customer_id: 'c1',
        p_city: 'Rajkot X',
        p_name: '24 Seven Foods',
        p_mobile: '919999900302',
        p_image_urls: ['img1.jpg'],
      })
    );
  });
});

describe('Add customer', () => {
  it('is titled Add customer and offers the same four sections and an Add customer button', async () => {
    const screen = await mountAdd();
    const text = shownText(screen);
    expect(text).toContain('Add customer');
    for (const section of ['BASIC INFORMATION', 'ADDRESS', 'TAX DETAILS', 'CONTACT PERSON']) expect(text).toContain(section);
    expect(input(screen, 'Customer name, required').props.value).toBe('');
    expect(customerService.getCustomerById).not.toHaveBeenCalled();
  });

  it('creates the customer and replaces the form with the new customer page', async () => {
    jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
    const screen = await mountAdd();
    await type(screen, 'Customer name, required', 'Test Doc');
    await type(screen, 'Mobile number after plus 91, required', '9000000099');
    await act(async () => { await button(screen, 'Add customer').props.onPress(); });
    expect(customerService.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ p_name: 'Test Doc', p_mobile: '919000000099' })
    );
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'new-id' } });
  });

  it('groups the typed mobile number 5 + 5 and stores ten digits', async () => {
    const screen = await mountAdd();
    await type(screen, 'Mobile number after plus 91, required', '9000000099');
    expect(input(screen, 'Mobile number after plus 91, required').props.value).toBe('90000 00099');
  });
});

describe('no documents (G-18)', () => {
  it('has no Documents section and no word about the local demo', async () => {
    const screen = await mountAdd();
    const text = shownText(screen);
    expect(text).not.toMatch(/local demo/i);
    expect(text).not.toMatch(/documents/i);
    expect(text).not.toMatch(/uploads/i);
  });
});

describe('field wording (G-49)', () => {
  it('shows the Email box without an example address', async () => {
    const screen = await mountAdd();
    expect(input(screen, 'Email, optional').props.placeholder).toBeUndefined();
    expect(shownText(screen)).toContain('Optional. Used for sending invoices.');
  });
});

describe('empty form (G-48)', () => {
  it('asks for the name and the mobile number, and stays on the form', async () => {
    const screen = await mountAdd();
    await act(async () => { await button(screen, 'Add customer').props.onPress(); });
    const text = shownText(screen);
    expect(text).toContain('Enter the customer name.');
    expect(text).toContain('Enter a mobile number.');
    expect(text).not.toContain('Enter at least 2 characters.');
    expect(customerService.createCustomer).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
