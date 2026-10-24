/**
 * The keyboard on the Add customer rate form (ported from the removed invoice-pencil editor's tests): the fields
 * sit in a scroll area inside a KeyboardAvoidingView, the Next key walks From, Up to, Rent, then Labour, Tax, a
 * focused field is scrolled clear of the keypad and of the pinned Save bar, and the number fields select their
 * text on focus. The form opens as a copy of Onion Red's default rate: one band, 0 to 100 kg.
 */
import React from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, ScrollView, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { inputsWithLabel, onionRows } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

const ORCHARD_A = { id: 'cust-a', name: 'Review Orchard A' };
let tree: ReactTestRenderer | undefined;
const listeners: Record<string, (event: unknown) => void> = {};

const ratesFor = (): UseItemRatesForResult => ({
  itemRates: { item: { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' } as never, rows: onionRows().filter(r => !r.customer_id) },
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
});

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
const input = (t: ReactTestRenderer, label: string, index = 0) => inputsWithLabel(t, label)[index];

async function open() {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
  await act(async () => { tree = create(<CustomerRateForm itemId="onion" customerId={ORCHARD_A.id} customerName={ORCHARD_A.name} customerDeactivated={false} />); });
  nodes = fieldNodes(tree!);
  return tree!;
}
const measure = (cb: (x: number, y: number, w: number, h: number) => void, y: number, h = 50) => cb(0, y, 300, h);

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

it('puts the fields in a scroll area that keeps taps working, inside a KeyboardAvoidingView, with the Save bar beside it', async () => {
  const t = await open();
  const avoiding = t.root.findByType(KeyboardAvoidingView);
  const scroll = avoiding.findByType(ScrollView);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(scroll.findAll(n => n.props.testID === 'add-rate-footer')).toHaveLength(0);
  expect(avoiding.findAll(n => n.props.testID === 'add-rate-footer').length).toBeGreaterThan(0);
});

it('every number field has a Next key, the last one Done', async () => {
  const t = await open();
  const keys = (label: string) => inputsWithLabel(t, label).map(n => n.props.returnKeyType);
  // A customer rate has a From on its band.
  expect(keys('From (kg)')).toEqual(['next']);
  expect(keys('Up to (kg)')).toEqual(['next']);
  expect(keys('Rent ₹/month')).toEqual(['next']);
  expect(keys('Labour ₹')).toEqual(['next']);
  expect(keys('Tax')).toEqual(['done']);
});

it('Next walks From, Up to, Rent, Labour, Tax and then closes the keyboard', async () => {
  const t = await open();
  const submit = async (label: string) => { await act(async () => { input(t, label).props.onSubmitEditing(); }); };
  await submit('From (kg)');
  expect(native('Up to').focus).toHaveBeenCalledTimes(1);
  await submit('Up to (kg)');
  expect(native('Rent').focus).toHaveBeenCalledTimes(1);
  await submit('Rent ₹/month');
  expect(native('Labour').focus).toHaveBeenCalledTimes(1);
  await submit('Labour ₹');
  expect(native('Tax').focus).toHaveBeenCalledTimes(1);
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
  await submit('Tax');
  expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
});

it('focusing Labour with the keypad up scrolls it 24 above the keypad', async () => {
  const t = await open();
  const scroll = t.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
  scroll.scrollTo = jest.fn();
  // The keypad's top edge is at 400; the Labour field sits at 380 to 430.
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  native('Labour').measureInWindow.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => measure(cb, 380));
  await act(async () => { input(t, 'Labour ₹').props.onFocus(); });
  // Bottom edge 430 + 24 = 454; 54 below the keypad's top.
  expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 54, animated: true });
});

it('a field already clear of the keypad does not scroll', async () => {
  const t = await open();
  const scroll = t.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
  scroll.scrollTo = jest.fn();
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 700 } }); });
  native('Tax').measureInWindow.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => measure(cb, 300));
  await act(async () => { input(t, 'Tax').props.onFocus(); });
  expect(scroll.scrollTo).not.toHaveBeenCalled();
});

// The Save bar is a sibling under the scroll area (not laid over it), so the content needs no padding for it; what is left
// to check is that a focused field is scrolled clear of the bar.
describe('the pinned Save bar never covers a field', () => {
  const bar = (t: ReactTestRenderer) => t.root.findAll(n => n.props.testID === 'add-rate-footer' && typeof n.props.onLayout === 'function')[0];

  it('scrolls a field that ends under the bar above it, with the keyboard closed', async () => {
    const t = await open();
    await act(async () => { bar(t).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 170 } } }); });
    const scroll = t.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
    scroll.scrollTo = jest.fn();
    const windowHeight = Dimensions.get('window').height;
    // The field's bottom edge sits 10 above the window's bottom, inside the bar's 170.
    native('Tax').measureInWindow.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => measure(cb, windowHeight - 60));
    await act(async () => { input(t, 'Tax').props.onFocus(); });
    // Bar top is windowHeight - 170; the field must end 24 above it: bottom (wh - 10) + 24 - (wh - 170) = 184.
    expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 184, animated: true });
  });
});

it('every number field selects its text on focus', async () => {
  const t = await open();
  for (const label of ['From (kg)', 'Up to (kg)', 'Rent ₹/month', 'Labour ₹', 'Tax']) {
    expect(inputsWithLabel(t, label).map(n => n.props.selectTextOnFocus)).toEqual([true]);
  }
});

describe('with a second band', () => {
  const addBand = async (t: ReactTestRenderer) => {
    await act(async () => { t.root.find(n => n.props.testID === 'add-band' && typeof n.props.onPress === 'function').props.onPress(); });
    nodes = fieldNodes(t);
  };

  it('the new band opens (the bands are an accordion) and Next walks its From, Up to, Rent, then Labour and Tax', async () => {
    const t = await open();
    await addBand(t);
    // Band 1 is closed, band 2 is open: one From, Up to and Rent are on the screen, the second band's.
    expect(inputsWithLabel(t, 'From (kg)')).toHaveLength(1);
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.testID).toBe('add-rate-band.1.rent');
    await act(async () => { input(t, 'Rent ₹/month').props.onSubmitEditing(); });
    expect(native('Labour').focus).toHaveBeenCalledTimes(1);
    expect(Keyboard.dismiss).not.toHaveBeenCalled();
  });

  // Next skips the fields of a closed band (they are not on the screen) and goes on to the next one that is.
  it('Next from the rent of an open first band goes on to the labour, not out of the form', async () => {
    const t = await open();
    await addBand(t);
    // Open band 1 again: band 2 is now the closed one, and its fields are not on the screen.
    await act(async () => { t.root.find(n => n.props.testID === 'add-rate-band-0-toggle' && typeof n.props.onPress === 'function').props.onPress(); });
    nodes = fieldNodes(t);
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.testID).toBe('add-rate-band.0.rent');
    await act(async () => { input(t, 'Rent ₹/month').props.onSubmitEditing(); });
    expect(Keyboard.dismiss).not.toHaveBeenCalled();
    expect(native('Labour').focus).toHaveBeenCalledTimes(1);
  });
});
