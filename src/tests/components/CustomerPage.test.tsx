/** G-14: tapping a customer opens a read-only page, not an edit wizard. */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router, useLocalSearchParams } from 'expo-router';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
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
import CustomerPage from '../../../app/customer/[id]';

const c1 = {
  id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', gst: '', active: true, created_at: '2026-01-01',
};
const shownText = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(3).join('')).join(' | ');
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(node => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || node.props.accessibilityLabel?.startsWith(label)))[0];

let tree: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => { tree = create(<CustomerPage />); });
  return tree as ReactTestRenderer;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockImplementation(() => ({ id: 'c1' }) as never);
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

it('shows the name, the grouped mobile, the city under Address and no empty sections', async () => {
  const screen = await mount();
  const text = shownText(screen);
  expect(text).toContain('24 Seven Foods');
  expect(text).toContain('+91 99999 00302');
  expect(text).toContain('ADDRESS');
  expect(text).toContain('Rajkot');
  expect(text).not.toContain('TAX DETAILS');
  expect(text).not.toContain('CONTACT PERSON');
  expect(screen.root.findAllByType(TextInput)).toHaveLength(0);
});

it('offers a Call action for the number', async () => {
  const screen = await mount();
  expect(button(screen, 'Call 24 Seven Foods')).toBeDefined();
});

it('Edit pushes the edit form of this customer', async () => {
  const screen = await mount();
  await act(async () => { button(screen, 'Edit').props.onPress(); });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/customer-edit/[id]', params: { id: 'c1' } });
});

it('asks before deactivating, in words that say what it does, and then deactivates', async () => {
  jest.mocked(customerService.inactivateCustomer).mockResolvedValue({ success: true, message: '' } as never);
  const screen = await mount();
  await act(async () => { button(screen, 'Deactivate customer').props.onPress(); });
  const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
  expect(title).toBe('Deactivate 24 Seven Foods?');
  expect(message).toContain("They won't appear when you choose a customer for a new GRN, dispatch or order.");
  expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
  await act(async () => { (buttons as { text: string; onPress?: () => void }[]).find(b => b.text === 'Deactivate customer')?.onPress?.(); });
  expect(customerService.inactivateCustomer).toHaveBeenCalledWith('c1');
  expect(shownText(screen)).toContain('Deactivated');
  expect(shownText(screen)).toContain('Activate customer');
});

it('activates an inactive customer without a question', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: { ...c1, active: false } } as never);
  jest.mocked(customerService.restoreCustomer).mockResolvedValue({ success: true, message: '' } as never);
  const screen = await mount();
  await act(async () => { button(screen, 'Activate customer').props.onPress(); });
  expect(showAlert).not.toHaveBeenCalled();
  expect(customerService.restoreCustomer).toHaveBeenCalledWith('c1');
});

it('shows the sections that have a value: tax details and the contact person', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({
    success: true, message: '', data: { ...c1, gst: '22AAAAA0000A1Z5', contact_name: 'Test Person', contact_mobile: '9999900399' },
  } as never);
  const screen = await mount();
  const text = shownText(screen);
  expect(text).toContain('TAX DETAILS');
  expect(text).toContain('22AAAAA0000A1Z5');
  expect(text).toContain('CONTACT PERSON');
  expect(text).toContain('Test Person');
});

it('shows a retry when the customer cannot be opened', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false, message: '' } as never);
  const screen = await mount();
  expect(shownText(screen)).toContain("Couldn't open this customer. Check your connection and try again.");
  await act(async () => { button(screen, 'Try again').props.onPress(); });
  expect(shownText(screen)).toContain('Rajkot');
});

it('CR-60: while loading there is no empty heading; once shown the name is the heading', async () => {
  let release: (value: unknown) => void = () => {};
  jest.mocked(customerService.getCustomerById).mockReturnValue(new Promise(resolve => { release = resolve; }) as never);
  await act(async () => { tree = create(<CustomerPage />); });
  const headings = () => tree!.root.findAll(node => node.props.accessibilityRole === 'header' && typeof node.type === 'string');
  expect(headings().filter(node => [node.props.children].flat(3).join('') === '')).toHaveLength(0);
  await act(async () => { release({ success: true, message: '', data: c1 }); });
  expect(headings().map(node => [node.props.children].flat(3).join(''))).toContain('24 Seven Foods');
});
