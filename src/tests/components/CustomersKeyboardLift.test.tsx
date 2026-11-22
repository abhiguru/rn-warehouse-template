/**
 * WH-239: while the keyboard is up, the Customers list area ends at the keyboard's top (useKeyboardCoverLift as a
 * margin), so the "no match" state (title, hint and Clear search) is centred in the part that is not covered. The real
 * screen and hook; the keyboard is a recorded stand-in.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Keyboard, StyleSheet, View } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerList: jest.fn(), getCustomerCounts: jest.fn(async () => null), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));

const rows = [
  { id: 'c1', name: 'Acme Foods', mobile: '9999900308', city: 'Surat', active: true },
  { id: 'c2', name: 'Green Valley Traders', mobile: '9999900312', city: 'Anand', active: true },
];

let listeners: Record<string, (event?: unknown) => void>;

beforeEach(() => {
  jest.useFakeTimers();
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    listeners[name] = handler;
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.mocked(customerService.getCustomerList).mockReset();
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 2 } } as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

type Node = NonNullable<typeof screen.root>;
/**
 * The View that holds the list and the no-match state: it carries the lift as its marginBottom. It has no role or text,
 * so it is found as the nearest laid-out View above the "Clear search" button.
 */
const listArea = (): Node => {
  let node: Node | null = screen.getByText('Clear search');
  while (node) {
    if (typeof node.props.onLayout === 'function' && 'marginBottom' in (StyleSheet.flatten(node.props.style) ?? {})) return node;
    node = node.parent;
  }
  throw new Error('the list area was not found above "Clear search"');
};
const margin = (node: Node) => Number((StyleSheet.flatten(node.props.style) as { marginBottom?: number }).marginBottom ?? 0);

it('lifts the list area by the part the keyboard covers while the no-match state shows, and drops the lift when it hides', async () => {
  await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
  await screen.findByText('Acme Foods');
  await userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime }).paste(screen.getByPlaceholderText('Search customers'), 'zzzz');
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(screen.getByText(/No customers match "zzzz"/)).toBeOnTheScreen();

  expect(listArea()).toBeDefined();
  // The jest View keeps its methods on a shared prototype, and the area's own ref is inside the screen: the one
  // measuring View on this screen is the area, so the prototype answers for it.
  jest.spyOn(View.prototype as unknown as { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }, 'measureInWindow')
    .mockImplementation(cb => cb(0, 300, 1080, 1100)); // the area's un-lifted bottom is at 1400 (+ the current lift)
  expect(margin(listArea())).toBe(0);
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1000, height: 800 } }); });
  expect(margin(listArea())).toBe(400);
  // The state stays whole: Clear search is still in the (shorter) area.
  expect(screen.getByText('Clear search')).toBeOnTheScreen();
  await act(async () => { listeners.keyboardDidHide(); });
  expect(margin(listArea())).toBe(0);
});
