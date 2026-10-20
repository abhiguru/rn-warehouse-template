/**
 * G-02: opening customer B after customer A always shows B. The values live in
 * the edit screen's own state, loaded by the route's id; the old wizard kept
 * them in Redux and showed the previous customer's details.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomerEditRoute from '../../../../app/customer-edit/[id]';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';
import { useLocalSearchParams } from 'expo-router';

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
  },
}));

const c1 = { id: 'c1', name: '24 Seven Foods', mobile: '9999900302', active: true, created_at: '2026-01-01' };
const c2 = { id: 'c2', name: 'Acme Foods', mobile: '9999900308', active: true, created_at: '2026-01-01' };

const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label);
const valueOf = (tree: ReactTestRenderer, label: string) => input(tree, label)?.props.value;
const NAME = 'Customer name, required';

let params: { id: string };
let tree: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => {
    tree = create(<CustomerEditRoute />);
  });
  return tree as ReactTestRenderer;
};

beforeEach(() => {
  jest.clearAllMocks();
  params = { id: 'c1' };
  jest.mocked(useLocalSearchParams).mockImplementation(() => params as never);
  jest.mocked(customerService.getCustomerById).mockImplementation((async (id: string) => ({
    success: true,
    message: '',
    data: id === 'c1' ? c1 : c2,
  })) as never);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

it('shows customer B, not customer A, when B is opened after A was left', async () => {
  let screen = await mount();
  expect(valueOf(screen, NAME)).toBe('24 Seven Foods');
  expect(valueOf(screen, 'Mobile number after plus 91, required')).toBe('99999 00302');
  await act(async () => { screen.unmount(); });

  params = { id: 'c2' };
  screen = await mount();

  expect(customerService.getCustomerById).toHaveBeenLastCalledWith('c2');
  expect(valueOf(screen, NAME)).toBe('Acme Foods');
  expect(valueOf(screen, 'Mobile number after plus 91, required')).toBe('99999 00308');
});

it('draws no fields until the load for this id has finished', async () => {
  let release: (value: unknown) => void = () => undefined;
  jest.mocked(customerService.getCustomerById).mockReturnValue(new Promise(resolve => { release = resolve; }) as never);
  const screen = await mount();
  expect(input(screen, NAME)).toBeUndefined();
  expect(screen.root.findAll(node => node.props.accessibilityRole === 'progressbar').length).toBeGreaterThan(0);
  await act(async () => { release({ success: true, message: '', data: c1 }); });
  expect(valueOf(screen, NAME)).toBe('24 Seven Foods');
});

it('ignores a late answer for the customer that was left', async () => {
  let releaseC1: (value: unknown) => void = () => undefined;
  jest.mocked(customerService.getCustomerById).mockImplementation(((id: string) =>
    id === 'c1'
      ? new Promise(resolve => { releaseC1 = resolve; })
      : Promise.resolve({ success: true, message: '', data: c2 })) as never);

  const screen = await mount();
  params = { id: 'c2' };
  await act(async () => { screen.update(<CustomerEditRoute />); });
  expect(valueOf(screen, NAME)).toBe('Acme Foods');

  await act(async () => { releaseC1({ success: true, message: '', data: c1 }); });
  expect(valueOf(screen, NAME)).toBe('Acme Foods');
  expect(valueOf(screen, 'Mobile number after plus 91, required')).toBe('99999 00308');
});

it('saves the values loaded for the route id onto that id', async () => {
  params = { id: 'c2' };
  jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: '' } as never);
  const screen = await mount();
  await act(async () => { input(screen, NAME)?.props.onChangeText('Acme Foods X'); });
  const save = screen.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Save customer')[0];
  await act(async () => { await save.props.onPress(); });

  expect(customerService.updateCustomer).toHaveBeenCalledTimes(1);
  expect(customerService.updateCustomer).toHaveBeenCalledWith(expect.objectContaining({ p_customer_id: 'c2', p_name: 'Acme Foods X' }));
  expect(showAlert).not.toHaveBeenCalled();
});

it('offers Try again when the customer cannot be loaded', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false, message: '', error: 'Network request failed' } as never);
  const screen = await mount();
  expect(input(screen, NAME)).toBeUndefined();
  const retry = screen.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Try again')[0];
  await act(async () => { retry.props.onPress(); });
  expect(valueOf(screen, NAME)).toBe('24 Seven Foods');
});

const button = (screen: ReactTestRenderer, label: string) =>
  screen.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0];

it('says the customer is gone, with Back and no Try again, when the load is refused as not found', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false, message: 'x', error: 'NOT_FOUND' } as never);
  const screen = await mount();
  expect(JSON.stringify(screen.toJSON())).toContain('Customer not found');
  expect(button(screen, 'Try again')).toBeUndefined();
  expect(button(screen, 'Back')).toBeDefined();
});

it('after a save that timed out, a stale answer says the last save may have gone through', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: { ...c1, updated_at: 't1' } } as never);
  jest.mocked(customerService.updateCustomer)
    .mockResolvedValueOnce({ success: false, message: 'timed out', error: 'Request timed out' } as never)
    .mockResolvedValueOnce({ success: false, message: '', code: 'STALE_CUSTOMER' } as never);
  const screen = await mount();
  await act(async () => { input(screen, NAME)?.props.onChangeText('24 Seven Foods X'); });
  await act(async () => { await button(screen, 'Save customer').props.onPress(); });
  await act(async () => { await button(screen, 'Save customer').props.onPress(); });
  const calls = jest.mocked(showAlert).mock.calls;
  expect(calls[calls.length - 1][1]).toBe('Your last save may have gone through. Reload to see this customer as it is now.');
});

it('a stale answer without an earlier timeout still says someone else changed the customer', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: { ...c1, updated_at: 't1' } } as never);
  jest.mocked(customerService.updateCustomer).mockResolvedValueOnce({ success: false, message: '', code: 'STALE_CUSTOMER' } as never);
  const screen = await mount();
  await act(async () => { input(screen, NAME)?.props.onChangeText('24 Seven Foods X'); });
  await act(async () => { await button(screen, 'Save customer').props.onPress(); });
  const calls = jest.mocked(showAlert).mock.calls;
  expect(calls[calls.length - 1][1]).toBe('Someone else changed this customer. Reload to see their changes.');
});
