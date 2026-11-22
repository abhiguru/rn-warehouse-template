/** G-19: the save bar is an ordinary child below the scrolling form, never floating over a field. */
import { Keyboard, StyleSheet } from 'react-native';
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';

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
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
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
import { space } from '@/theme/tokens';

const mount = async () => {
  await render(<CustomerFormRoute />);
};
// The bar has no role or text to find it by; its testID is on its host View.
const bar = () => screen.getByTestId('customer-save-bar');

it('draws the save bar in the flow, as the last child of the root column', async () => {
  await mount();
  const style = StyleSheet.flatten(bar().props.style);
  expect(style.position).not.toBe('absolute');
  const column = bar().parent;
  const children = column?.children.filter(child => typeof child !== 'string') ?? [];
  expect((children[children.length - 1] as { props: { testID?: string } }).props.testID).toBe('customer-save-bar');
});

it('keeps the home-indicator space while the keyboard is hidden and gives it up while it is shown', async () => {
  // The test renderer has no keyboard: record the listeners the form registers and call them.
  const listeners: Record<string, (event?: unknown) => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    listeners[name] = handler;
    return { remove: jest.fn() };
  }) as never);
  await mount();
  expect(bar()).toHaveStyle({ paddingBottom: 24 + space.md });
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1350, height: 800 } }); });
  expect(bar()).toHaveStyle({ paddingBottom: space.md });
  await act(async () => { listeners.keyboardDidHide(); });
  expect(bar()).toHaveStyle({ paddingBottom: 24 + space.md });
});

it('adds the bottom inset to the save bar on iOS only; on Android the system handles it (WH-209)', async () => {
  const { Platform } = require('react-native');
  const original = Platform.OS;
  try {
    Platform.OS = 'android';
    await mount();
    expect(bar()).toHaveStyle({ paddingBottom: space.md });
    await screen.unmount();
    Platform.OS = 'ios';
    await mount();
    expect(bar()).toHaveStyle({ paddingBottom: 24 + space.md });
  } finally {
    Platform.OS = original;
  }
});
