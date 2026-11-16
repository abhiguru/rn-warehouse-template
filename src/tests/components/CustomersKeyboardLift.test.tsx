/**
 * WH-239: while the keyboard is up, the Customers list area ends at the keyboard's top (useKeyboardCoverLift as a
 * margin), so the "no match" state (title, hint and Clear search) is centred in the part that is not covered. The real
 * screen and hook; the keyboard is a recorded stand-in.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Keyboard, StyleSheet, Text, TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer | undefined;
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
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const hasClear = (node: ReactTestInstance) => node.findAllByType(Text).some(t => t.props.children === 'Clear search');
/** The View that holds the list and the no-match state: it carries the lift as its marginBottom. */
const listArea = (screen: ReactTestRenderer) => {
  const candidates = screen.root.findAll(node =>
    node.instance != null && typeof node.props.onLayout === 'function' && hasClear(node)
    && 'marginBottom' in (StyleSheet.flatten(node.props.style) ?? {}));
  return candidates[candidates.length - 1];
};
const margin = (node: ReactTestInstance) => Number((StyleSheet.flatten(node.props.style) as { marginBottom?: number }).marginBottom ?? 0);

it('lifts the list area by the part the keyboard covers while the no-match state shows, and drops the lift when it hides', async () => {
  await act(async () => { tree = create(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>); });
  const field = tree!.root.findAllByType(TextInput).find(node => node.props.placeholder === 'Search customers')!;
  await act(async () => { field.props.onChangeText('zzzz'); });
  await act(async () => { jest.advanceTimersByTime(400); });
  const screen = tree!;
  expect(screen.root.findAllByType(Text).some(t => [t.props.children].flat(3).join('').includes('No customers match "zzzz"'))).toBe(true);

  const area = listArea(screen);
  expect(area).toBeDefined();
  (area.instance as { measureInWindow: unknown }).measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) =>
    cb(0, 300, 1080, 1100); // the area's un-lifted bottom is at 1400 (+ the current lift)
  expect(margin(listArea(screen))).toBe(0);
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1000, height: 800 } }); });
  expect(margin(listArea(screen))).toBe(400);
  // The state stays whole: Clear search is still in the (shorter) area.
  expect(hasClear(listArea(screen))).toBe(true);
  await act(async () => { listeners.keyboardDidHide(); });
  expect(margin(listArea(screen))).toBe(0);
});
