/**
 * G-15: leaving the customer form asks once, only when something changed, on
 * every way out. Runs the real expo-router stack with the real customer page
 * and form (the in-memory route context, as src/hooks/__tests__/useLeaveGuard.test.tsx).
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store as routerStore } from 'expo-router/build/global-state/router-store';
import { router, Stack } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';
import CustomerPage from '../../../app/customer/[id]';
import CustomerEditRoute from '../../../app/customer-edit/[id]';
import CustomerFormRoute from '../../../app/customer-form';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children?: React.ReactNode }) => children,
}));
// expo-router's test mocks replace Reanimated, which the skeleton needs.
jest.mock('@/components/skeletons/SkeletonBox', () => ({ SkeletonBox: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
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

const c1 = { id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', active: true, created_at: '2026-01-01' };

let tree: ReactTestRenderer;
let backKey: ReturnType<typeof installHardwareBack>;
const settle = async () => { await act(async () => { await jest.runAllTimersAsync(); }); };
const pathname = () => routerStore.getRouteInfo().pathname;
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text?: string; onPress?: () => void }[] };
};
const nameInput = () =>
  tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Customer name, required');
const go = async (path: string) => {
  await act(async () => { router.push(path as never); });
  await settle();
};
const type = async (text: string) => {
  await act(async () => { nameInput()?.props.onChangeText(text); });
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  backKey = installHardwareBack();
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
  const context = getMockContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    index: () => <Text>Settings</Text>,
    customers: () => <Text>Customers</Text>,
    'customer/[id]': CustomerPage,
    'customer-edit/[id]': CustomerEditRoute,
    'customer-form': CustomerFormRoute,
  });
  await act(async () => { tree = create(<ExpoRoot context={context} location="/" />); });
  await settle();
});

afterEach(async () => {
  await act(async () => { tree.unmount(); });
  backKey.restore();
  jest.useRealTimers();
});

describe('Edit customer', () => {
  it('leaves without a question when nothing changed', async () => {
    await go('/customer/c1');
    await go('/customer-edit/c1');
    expect(nameInput()?.props.value).toBe('24 Seven Foods');

    await act(async () => { router.back(); });
    await settle();

    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/customer/c1');
  });

  it('asks exactly once after a change, and Discard returns to the customer page', async () => {
    await go('/customer/c1');
    await go('/customer-edit/c1');
    await type('24 Seven Foods X');

    await act(async () => { router.back(); });
    await settle();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Discard changes?');
    expect(lastAlert().message).toBe('Your unsaved changes will be lost.');
    expect(lastAlert().buttons.map(b => b.text)).toEqual(['Keep editing', 'Discard']);
    expect(pathname()).toBe('/customer-edit/c1');

    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    await settle();
    expect(pathname()).toBe('/customer/c1');
    expect(showAlert).toHaveBeenCalledTimes(1);
  });

  it('asks the same question for the phone Back key', async () => {
    await go('/customer/c1');
    await go('/customer-edit/c1');
    await type('24 Seven Foods X');

    let taken = false;
    await act(async () => { taken = backKey.press(); });
    await settle();

    expect(taken).toBe(true);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/customer-edit/c1');
  });

  it('does not ask when a change is typed back to the original', async () => {
    await go('/customer/c1');
    await go('/customer-edit/c1');
    await type('24 Seven Foods X');
    await type('24 Seven Foods');

    await act(async () => { router.back(); });
    await settle();
    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/customer/c1');
  });
});

describe('Add customer', () => {
  it('leaves without a question when nothing is typed', async () => {
    await go('/customer-form');
    await act(async () => { router.back(); });
    await settle();
    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
  });

  it('asks "Discard this customer?" once something is typed', async () => {
    await go('/customer-form');
    await type('Test');

    await act(async () => { router.back(); });
    await settle();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Discard this customer?');
    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    await settle();
    expect(pathname()).toBe('/');
  });
});
