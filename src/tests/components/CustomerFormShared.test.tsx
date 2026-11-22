/**
 * WH-227: the Customer form uses the shared ui/Input fields and ui/FormSaveBar. Real form, Input, FormSaveBar and
 * customer service shape (only the service calls are faked): field order, hard limits, +91 prefixes, the multiline
 * address, the State picker, the keyboard Next flow, validation and saving through the shared bar.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
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

const user = userEvent.setup({ delay: 0 });
// The field labels and the +91 prefixes are drawn inside elements the screen reader skips (the field itself carries the spoken label).
const everything = { includeHiddenElements: true } as const;
const mount = async () => {
  await render(<CustomerFormRoute />);
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
});

type Node = NonNullable<typeof screen.root>;
// Every typed field in the order drawn: a field without a label would not be reached by a label query, so the tree is walked.
const inputs = (): Node[] => {
  const found: Node[] = [];
  const walk = (node: Node) => {
    if ((node.type as unknown) === 'TextInput') found.push(node);
    for (const child of node.children) if (typeof child !== 'string') walk(child as Node);
  };
  walk(screen.root as Node);
  return found;
};
const input = (label: string) => screen.getByLabelText(label);
/** Every text on the screen, in the order drawn. */
const shown = () => screen.getAllByText(/.+/, everything).map(node => [node.props.children].flat(3).join(''));
/** Where the first text that starts with the label comes among all the texts. */
const positionOf = (label: string) => shown().findIndex(text => text.startsWith(label));
const type = async (label: string, text: string) => {
  await user.clear(input(label));
  await user.paste(input(label), text);
};
const press = async (label: string) => {
  await user.press(screen.getByRole('button', { name: label }));
  await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
};

describe('Customer form on the shared parts (WH-227)', () => {
  it('keeps the field order from name to the contact email, with the State picker between City and Pincode', async () => {
    await mount();
    // The labels of the two required fields hold a nested " *" text and are not texts of their own, so the first
    // three typed fields stand for them: name, then mobile, then email.
    const labels = ['Email', 'Full address', 'City', 'State', 'Pincode', 'GST', 'PAN', 'Contact'];
    const positions = labels.map(positionOf);
    positions.forEach(p => expect(p).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(inputs()[0]).toHaveProp('accessibilityLabel', 'Customer name, required');
    expect(inputs()[1]).toHaveProp('accessibilityLabel', 'Mobile number after plus 91, required');
    expect(inputs()[2]).toHaveProp('accessibilityLabel', 'Email, optional');
  });

  it('stops typing at the column sizes (hard limit) and draws +91 on both mobile fields, not in the value', async () => {
    await mount();
    expect(input('Customer name, required')).toHaveProp('maxLength', 80);
    expect(input('City')).toHaveProp('maxLength', 25);
    expect(input('Full address')).toHaveProp('maxLength', 300);
    expect(screen.getAllByText('+91', everything)).toHaveLength(2);
    await type('Mobile number after plus 91, required', '9000000099');
    expect(input('Mobile number after plus 91, required')).toHaveDisplayValue('90000 00099');
  });

  it('lays the address out as a multiline field and no other field', async () => {
    await mount();
    expect(input('Full address')).toHaveProp('multiline', true);
    const others = inputs().filter(node => node.props.accessibilityLabel !== 'Full address');
    others.forEach(node => expect(node.props.multiline).toBeFalsy());
  });

  it('moves with the keyboard Next key from name to mobile, and ends the last field with Done', async () => {
    await mount();
    const typed = inputs();
    expect(typed[0]).toHaveProp('returnKeyType', 'next');
    expect(typed[1]).toHaveProp('returnKeyType', 'next');
    expect(typed[typed.length - 1]).toHaveProp('returnKeyType', 'done');
    // Every field except the multiline address and the last one offers Next.
    typed.slice(0, -1).filter(node => !node.props.multiline).forEach(node => expect(node).toHaveProp('returnKeyType', 'next'));
  });

  it('Next on a field focuses the following field (name to mobile to email)', async () => {
    const focused: string[] = [];
    const spy = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(function (this: { props: { accessibilityLabel?: string } }) {
      focused.push(String(this.props.accessibilityLabel));
    });
    try {
      await mount();
      await user.type(input('Customer name, required'), '', { submitEditing: true });
      await user.type(input('Mobile number after plus 91, required'), '', { submitEditing: true });
    } finally {
      spy.mockRestore();
    }
    expect(focused).toEqual(['Mobile number after plus 91, required', 'Email, optional']);
  });

  it('asks for the name and the mobile number through the shared fields and does not save', async () => {
    await mount();
    await press('Add customer');
    expect(screen.getByText('Enter the customer name.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a mobile number.')).toBeOnTheScreen();
    expect(customerService.createCustomer).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('saves through the shared Save bar', async () => {
    jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
    await mount();
    await type('Customer name, required', 'Test Doc');
    await type('Mobile number after plus 91, required', '9000000099');
    await press('Add customer');
    expect(customerService.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ p_name: 'Test Doc', p_mobile: '919000000099' }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'new-id' } });
  });
});

describe('State field (WH-151 picker, shared Input on an older server)', () => {
  afterEach(() => { mockStatePicker = false; });

  it('a server with the picker shows the State picker between City and Pincode and no typed State box', async () => {
    mockStatePicker = true;
    await mount();
    expect(screen.queryAllByTestId('customer-state-picker').length).toBeGreaterThan(0);
    const labels = inputs().map(node => node.props.accessibilityLabel ?? node.props.placeholder);
    expect(labels.some(label => /^State/.test(String(label)))).toBe(false);
    const state = positionOf('State');
    expect(state).toBeGreaterThan(positionOf('City'));
    expect(state).toBeLessThan(positionOf('Pincode'));
  });

  it('an older server shows State as a shared typed field with its 50-character hard limit', async () => {
    mockStatePicker = false;
    await mount();
    expect(screen.queryAllByTestId('customer-state-picker')).toHaveLength(0);
    const state = inputs().find(node => node.props.maxLength === 50 && node.props.textContentType === 'addressState');
    expect(state).toBeDefined();
  });
});
