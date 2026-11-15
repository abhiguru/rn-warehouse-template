/**
 * WH-227: the Customer form uses the shared ui/Input fields and ui/FormSaveBar. Real form, Input, FormSaveBar and
 * customer service shape (only the service calls are faked): field order, hard limits, +91 prefixes, the multiline
 * address, the State picker, the keyboard Next flow, validation and saving through the shared bar.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';

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
let mockStatePicker = false;
jest.mock('@/config/backendFeatures', () => ({
  ...jest.requireActual('@/config/backendFeatures'),
  backendHasFeature: () => mockStatePicker,
}));
import CustomerFormRoute from '../../../app/customer-form';

let tree: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => { tree = create(<CustomerFormRoute />); });
  return tree as ReactTestRenderer;
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const inputs = (screen: ReactTestRenderer) => screen.root.findAllByType(TextInput);
const input = (screen: ReactTestRenderer, label: string) =>
  inputs(screen).find(node => node.props.accessibilityLabel === label) as ReturnType<ReactTestRenderer['root']['findAllByType']>[number];
const shown = (screen: ReactTestRenderer) => screen.root.findAllByType(Text).map(n => [n.props.children].flat(3).join(''));
const type = async (screen: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { input(screen, label).props.onChangeText(text); });
};
const saveButton = (screen: ReactTestRenderer) =>
  screen.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Add customer');

describe('Customer form on the shared parts (WH-227)', () => {
  it('keeps the field order from name to the contact email, with the State picker between City and Pincode', async () => {
    const screen = await mount();
    const order = shown(screen);
    const at = (label: string) => order.findIndex(text => text.startsWith(label));
    const labels = ['Customer name', 'Mobile number', 'Email', 'Full address', 'City', 'State', 'Pincode', 'GST', 'PAN', 'Contact'];
    const positions = labels.map(at);
    positions.forEach(p => expect(p).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // Name and mobile are the first two typed fields.
    expect(inputs(screen)[0].props.accessibilityLabel).toBe('Customer name, required');
    expect(inputs(screen)[1].props.accessibilityLabel).toBe('Mobile number after plus 91, required');
  });

  it('stops typing at the column sizes (hard limit) and draws +91 on both mobile fields, not in the value', async () => {
    const screen = await mount();
    expect(input(screen, 'Customer name, required').props.maxLength).toBe(80);
    expect(input(screen, 'City').props.maxLength).toBe(25);
    expect(input(screen, 'Full address').props.maxLength).toBe(300);
    expect(shown(screen).filter(text => text === '+91').length).toBe(2);
    await type(screen, 'Mobile number after plus 91, required', '9000000099');
    expect(input(screen, 'Mobile number after plus 91, required').props.value).toBe('90000 00099');
  });

  it('lays the address out as a multiline field and no other field', async () => {
    const screen = await mount();
    expect(input(screen, 'Full address').props.multiline).toBe(true);
    const others = inputs(screen).filter(node => node.props.accessibilityLabel !== 'Full address');
    others.forEach(node => expect(node.props.multiline).toBeFalsy());
  });

  it('moves with the keyboard Next key from name to mobile, and ends the last field with Done', async () => {
    const screen = await mount();
    const typed = inputs(screen);
    expect(typed[0].props.returnKeyType).toBe('next');
    expect(typed[1].props.returnKeyType).toBe('next');
    expect(typed[typed.length - 1].props.returnKeyType).toBe('done');
    // Every field except the multiline address and the last one offers Next.
    typed.slice(0, -1).filter(node => !node.props.multiline).forEach(node => expect(node.props.returnKeyType).toBe('next'));
  });

  it('Next on a field focuses the following field (name to mobile to email)', async () => {
    const focused: string[] = [];
    const spy = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(function (this: { props: { accessibilityLabel?: string } }) {
      focused.push(String(this.props.accessibilityLabel));
    });
    try {
      const screen = await mount();
      await act(async () => { input(screen, 'Customer name, required').props.onSubmitEditing(); });
      await act(async () => { input(screen, 'Mobile number after plus 91, required').props.onSubmitEditing(); });
    } finally {
      spy.mockRestore();
    }
    expect(focused).toEqual(['Mobile number after plus 91, required', 'Email, optional']);
  });

  it('asks for the name and the mobile number through the shared fields and does not save', async () => {
    const screen = await mount();
    await act(async () => { await saveButton(screen).props.onPress(); });
    const text = shown(screen);
    expect(text).toContain('Enter the customer name.');
    expect(text).toContain('Enter a mobile number.');
    expect(customerService.createCustomer).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('saves through the shared Save bar', async () => {
    jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
    const screen = await mount();
    await type(screen, 'Customer name, required', 'Test Doc');
    await type(screen, 'Mobile number after plus 91, required', '9000000099');
    const bar = screen.root.find(node => node.props.testID === 'customer-save-bar' && (node.type as unknown) !== 'View' && typeof node.props.onPress === 'function');
    await act(async () => { await bar.props.onPress(); });
    expect(customerService.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ p_name: 'Test Doc', p_mobile: '919000000099' }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'new-id' } });
  });
});

describe('State field (WH-151 picker, shared Input on an older server)', () => {
  afterEach(() => { mockStatePicker = false; });

  it('a server with the picker shows the State picker between City and Pincode and no typed State box', async () => {
    mockStatePicker = true;
    const screen = await mount();
    expect(screen.root.findAll(node => node.props.testID === 'customer-state-picker').length).toBeGreaterThan(0);
    const labels = inputs(screen).map(node => node.props.accessibilityLabel ?? node.props.placeholder);
    expect(labels.some(label => /^State/.test(String(label)))).toBe(false);
    const order = shown(screen);
    const state = order.findIndex(text => text.startsWith('State'));
    expect(state).toBeGreaterThan(order.findIndex(text => text.startsWith('City')));
    expect(state).toBeLessThan(order.findIndex(text => text.startsWith('Pincode')));
  });

  it('an older server shows State as a shared typed field with its 50-character hard limit', async () => {
    mockStatePicker = false;
    const screen = await mount();
    expect(screen.root.findAll(node => node.props.testID === 'customer-state-picker').length).toBe(0);
    const state = inputs(screen).find(node => node.props.maxLength === 50 && node.props.textContentType === 'addressState');
    expect(state).toBeDefined();
  });
});
