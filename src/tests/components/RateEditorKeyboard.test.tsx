/**
 * The keyboard in the rate editor (P-09): the form shrinks above it, a focused field is scrolled
 * clear of it, the Next key walks Up to, Rent, Labour, Tax.
 */
import React from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { garlicRows, inputWithLabel, inputsWithLabel } from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';

let mockRole = 'admin';
let mockParams: Record<string, string> = {};
let mockGuard: { hasChanges: boolean; title?: string } = { hasChanges: false };
import { listItemRates } from '@/services/item-pricing-service';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean; title?: string }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'DateTimePicker',
  DateTimePickerAndroid: { open: jest.fn() },
}));

let tree: ReactTestRenderer | undefined;
const listeners: Record<string, (event: unknown) => void> = {};

/** The jest stand-in of a TextInput keeps its methods on a shared prototype: give each field its own. */
const fieldNodes = (t: ReactTestRenderer) =>
  t.root.findAllByType(TextInput).map(node => {
    const instance = node.instance as { focus: jest.Mock; measureInWindow: jest.Mock };
    instance.focus = jest.fn();
    instance.measureInWindow = jest.fn();
    return { label: String(node.props.accessibilityLabel), instance };
  });
let nodes: ReturnType<typeof fieldNodes> = [];
/** The native node of the nth field whose accessibility label starts with this text. */
const native = (label: string, index = 0) => nodes.filter(n => n.label.startsWith(label))[index].instance;

async function open() {
  mockParams = { mode: 'change', item_id: 'garlic', price_type: 'monthly' };
  jest.mocked(listItemRates).mockResolvedValue(garlicRows());
  await act(async () => { tree = create(<RateEditorScreen />); });
  nodes = fieldNodes(tree!);
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (event: unknown) => void) => {
    listeners[name] = fn;
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
  jest.useFakeTimers({
    now: new Date('2026-10-14T10:00:00+05:30'),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'hrtime'],
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('puts the fields in a scroll area that keeps taps working, inside a KeyboardAvoidingView', async () => {
  const t = await open();
  const avoiding = t.root.findByType(KeyboardAvoidingView);
  const scroll = avoiding.findByType(ScrollView);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(avoiding.findAll(n => n.props.testID === 'save-bar').length).toBeGreaterThan(0);
});

it('every number field has a Next key, the last one Done', async () => {
  const t = await open();
  const keys = (label: string) => inputsWithLabel(t, label).map(n => n.props.returnKeyType);
  expect(keys('Up to')).toEqual(['next', 'next']);
  expect(keys('Rent per bag, per month')).toEqual(['next', 'next']);
  expect(keys('Labour per bag')).toEqual(['next']);
  expect(keys('Tax')).toEqual(['done']);
});

it('Next walks Up to, Rent, the next band, Labour, Tax and then closes the keyboard', async () => {
  const t = await open();
  const submit = async (label: string, index = 0) => { await act(async () => { inputsWithLabel(t, label)[index].props.onSubmitEditing(); }); };
  await submit('Up to', 0);
  expect(native('Rent per bag, per month', 0).focus).toHaveBeenCalledTimes(1);
  // Band 1's rent goes on to band 2's Up to.
  await submit('Rent per bag, per month', 0);
  expect(native('Up to', 1).focus).toHaveBeenCalledTimes(1);
  await submit('Up to', 1);
  expect(native('Rent per bag, per month', 1).focus).toHaveBeenCalledTimes(1);
  await submit('Rent per bag, per month', 1);
  expect(native('Labour per bag').focus).toHaveBeenCalledTimes(1);
  await submit('Labour per bag');
  expect(native('Tax').focus).toHaveBeenCalledTimes(1);
  await submit('Tax');
  expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
});

it('focusing Labour with the keypad up scrolls it 24 above the keypad', async () => {
  const t = await open();
  const scroll = t.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
  scroll.scrollTo = jest.fn();
  // The keypad's top edge is at 400; the Labour field sits at 380 to 430.
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  native('Labour per bag').measureInWindow.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 380, 300, 50));
  await act(async () => { inputWithLabel(t, 'Labour per bag')!.props.onFocus(); });
  // Bottom edge 430 + 24 = 454; 54 below the keypad's top.
  expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 54, animated: true });
});

it('a field already clear of the keypad does not scroll', async () => {
  const t = await open();
  const scroll = t.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
  scroll.scrollTo = jest.fn();
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 700 } }); });
  native('Tax').measureInWindow.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 300, 300, 50));
  await act(async () => { inputWithLabel(t, 'Tax')!.props.onFocus(); });
  expect(scroll.scrollTo).not.toHaveBeenCalled();
});
