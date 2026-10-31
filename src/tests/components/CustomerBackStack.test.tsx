/**
 * G-16: after saving, closing or adding a customer, Back never shows the
 * Customers list a second time. Runs the real expo-router stack with the real
 * customer page and form (the in-memory route context, as
 * src/hooks/__tests__/useLeaveGuard.test.tsx).
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { routerStore } from '@/tests/helpers/routerStore';
import { router, Stack } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { customerService } from '@/services/customer-service';
import { showAlert } from '@/utils/alert';
import CustomerPage from '../../../app/customer/[id]';
import CustomerEditRoute from '../../../app/customer-edit/[id]';
import CustomerFormRoute from '../../../app/customer-form';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
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
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
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
/** The screens in the app's stack, bottom first. */
const routeNames = () => (routerStore.state?.routes[0]?.state?.routes ?? []).map(route => route.name);
const go = async (path: string) => {
  await act(async () => { router.push(path as never); });
  await settle();
};
const back = async () => {
  await act(async () => { router.back(); });
  await settle();
};
const input = (label: string) => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label);
const type = async (label: string, text: string) => {
  await act(async () => { input(label)?.props.onChangeText(text); });
};
const press = async (label: string) => {
  const target = tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0];
  await act(async () => { await target.props.onPress(); });
  await settle();
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  backKey = installHardwareBack();
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
  jest.mocked(customerService.searchCustomers).mockResolvedValue([]);
  const context = getMockContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    settings: () => <Text>Settings</Text>,
    customers: () => <Text>Customers</Text>,
    'customer/[id]': CustomerPage,
    'customer-edit/[id]': CustomerEditRoute,
    'customer-form': CustomerFormRoute,
  });
  await act(async () => { tree = create(<ExpoRoot context={context} location="/settings" />); });
  await settle();
  await go('/customers');
});

afterEach(async () => {
  await act(async () => { tree.unmount(); });
  backKey.restore();
  jest.useRealTimers();
});

it('Edit then Save returns to the customer page; Back then goes to Customers, then Settings', async () => {
  jest.mocked(customerService.updateCustomer).mockResolvedValue({ success: true, message: '' } as never);
  await go('/customer/c1');
  await go('/customer-edit/c1');
  await type('City', 'Rajkot X');
  await press('Save customer');

  expect(customerService.updateCustomer).toHaveBeenCalledTimes(1);
  expect(pathname()).toBe('/customer/c1');
  expect(routeNames()).toEqual(['settings', 'customers', 'customer/[id]']);

  await back();
  expect(pathname()).toBe('/customers');
  await back();
  expect(pathname()).toBe('/settings');
});

it('closing the form without changes and then Back never shows Customers twice', async () => {
  await go('/customer/c1');
  await go('/customer-edit/c1');
  await back();
  expect(routeNames()).toEqual(['settings', 'customers', 'customer/[id]']);
  await back();
  expect(routeNames()).toEqual(['settings', 'customers']);
  await back();
  expect(pathname()).toBe('/settings');
});

it('Add customer replaces the form with the new customer page, so Back goes to the list', async () => {
  jest.mocked(customerService.createCustomer).mockResolvedValue({ success: true, message: '', data: { id: 'new-id' } } as never);
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: { ...c1, id: 'new-id', name: 'Test Doc' } } as never);
  await go('/customer-form');
  await type('Customer name, required', 'Test Doc');
  await type('Mobile number after plus 91, required', '9000000099');
  await press('Add customer');

  expect(pathname()).toBe('/customer/new-id');
  expect(routeNames()).toEqual(['settings', 'customers', 'customer/[id]']);
  await back();
  expect(pathname()).toBe('/customers');
});
