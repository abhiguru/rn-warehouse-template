/** G-19: the save bar is an ordinary child below the scrolling form, never floating over a field. */
import { Keyboard, StyleSheet } from 'react-native';
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
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
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
import CustomerFormRoute from '../../../app/customer-form';
import { space } from '@/theme/tokens';

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const mount = async () => {
  await act(async () => { tree = create(<CustomerFormRoute />); });
  return tree as ReactTestRenderer;
};
const bar = (screen: ReactTestRenderer) => screen.root.findByProps({ testID: 'customer-save-bar' });

it('draws the save bar in the flow, as the last child of the root column', async () => {
  const screen = await mount();
  const style = StyleSheet.flatten(bar(screen).props.style);
  expect(style.position).not.toBe('absolute');
  const column = bar(screen).parent;
  const children = column?.children.filter(child => typeof child !== 'string') ?? [];
  expect((children[children.length - 1] as { props: { testID?: string } }).props.testID).toBe('customer-save-bar');
});

it('keeps the home-indicator space while the keyboard is hidden and gives it up while it is shown', async () => {
  // The test renderer has no keyboard: record the listeners the form registers and call them.
  const listeners: Record<string, () => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: () => void) => {
    listeners[name] = handler;
    return { remove: jest.fn() };
  }) as never);
  const screen = await mount();
  expect(StyleSheet.flatten(bar(screen).props.style).paddingBottom).toBe(24 + space.md);
  await act(async () => { listeners.keyboardDidShow(); });
  expect(StyleSheet.flatten(bar(screen).props.style).paddingBottom).toBe(space.md);
  await act(async () => { listeners.keyboardDidHide(); });
  expect(StyleSheet.flatten(bar(screen).props.style).paddingBottom).toBe(24 + space.md);
});
