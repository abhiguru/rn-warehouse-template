/**
 * The keyboard on the Add customer rate form (ported from the removed invoice-pencil editor's tests): the fields
 * sit in a scroll area inside a KeyboardAvoidingView, the Next key walks From, Up to, Rent, then Labour, Tax, a
 * focused field is scrolled clear of the keypad and of the pinned Save bar, and the number fields select their
 * text on focus. The form opens as a copy of Onion Red's default rate: one band, 0 to 100 kg.
 */
import React from 'react';
import { Dimensions, Keyboard, ScrollView, TextInput } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { inputsWithLabel, inputsWithLabelMounted, onionRows } from '@/tests/helpers/rateEditorFixtures';

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

/**
 * The jest stand-ins of TextInput and ScrollView keep their native methods (focus, measureInWindow, scrollTo) on a shared
 * prototype, and the app calls them on the component instance, which Testing Library does not return. So the methods are
 * spied on the prototype, and each call knows its field by `this.props.accessibilityLabel`.
 */
type FieldInstance = { props: { accessibilityLabel?: string } };
let focused: string[] = [];
/** The top edge that measureInWindow reports for the field whose accessibility label starts with the key. */
let measured: Record<string, number> = {};
const focusCount = (label: string) => focused.filter(l => l.startsWith(label)).length;
const input = (label: string, index = 0) => inputsWithLabel(label)[index];
/** The host elements around an element, nearest first. */
const hostAncestors = (el: ReturnType<typeof screen.getByTestId>) => {
  const list: ReturnType<typeof screen.getByTestId>[] = [];
  for (let up = el.parent; up; up = up.parent) list.push(up);
  return list;
};
const scrollArea = () => hostAncestors(input('Rent ₹/month')).find(n => n.type === 'RCTScrollView')!;

async function open() {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
  await render(<CustomerRateForm itemId="onion" customerId={ORCHARD_A.id} customerName={ORCHARD_A.name} customerDeactivated={false} />);
}
const measure = (cb: (x: number, y: number, w: number, h: number) => void, y: number, h = 50) => cb(0, y, 300, h);
const submit = (label: string) => fireEvent(input(label), 'submitEditing', {});

// A stand-in for the keyboard-avoiding view that can be found again: it draws a View with a test id around its children.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: { children: unknown }) => R.createElement(View, { testID: 'keyboard-avoiding' }, children) };
});

beforeEach(() => {
  jest.clearAllMocks();
  focused = [];
  measured = {};
  jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus').mockImplementation(function (this: FieldInstance) {
    focused.push(String(this.props.accessibilityLabel));
  });
  jest.spyOn(TextInput.prototype as unknown as { measureInWindow: (cb: never) => void }, 'measureInWindow').mockImplementation(function (this: FieldInstance, cb: never) {
    const key = Object.keys(measured).find(k => String(this.props.accessibilityLabel).startsWith(k));
    if (key) measure(cb, measured[key]);
  });
  jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo').mockImplementation(() => undefined);
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
const scrollTo = () => ScrollView.prototype.scrollTo as unknown as jest.Mock;
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('puts the fields in a scroll area that keeps taps working, inside a KeyboardAvoidingView, with the Save bar beside it', async () => {
  await open();
  expect(scrollArea()).toHaveProp('keyboardShouldPersistTaps', 'handled');
  // The scroll area and the Save bar are both inside the keyboard-avoiding view, and the bar is not inside the scroll area.
  const footer = screen.getByTestId('add-rate-footer');
  expect(hostAncestors(scrollArea()).some(n => n.props.testID === 'keyboard-avoiding')).toBe(true);
  expect(hostAncestors(footer).some(n => n.props.testID === 'keyboard-avoiding')).toBe(true);
  expect(hostAncestors(footer).some(n => n.type === 'RCTScrollView')).toBe(false);
});

it('every number field has a Next key, the last one Done', async () => {
  await open();
  const keys = (label: string) => inputsWithLabel(label).map(n => n.props.returnKeyType);
  // A customer rate has a From on its band.
  expect(keys('From (kg)')).toEqual(['next']);
  expect(keys('Up to (kg)')).toEqual(['next']);
  expect(keys('Rent ₹/month')).toEqual(['next']);
  expect(keys('Labour ₹')).toEqual(['next']);
  expect(keys('Tax')).toEqual(['done']);
});

it('Next walks From, Up to, Rent, Labour, Tax and then closes the keyboard', async () => {
  await open();
  await submit('From (kg)');
  expect(focusCount('Up to')).toBe(1);
  await submit('Up to (kg)');
  expect(focusCount('Rent')).toBe(1);
  await submit('Rent ₹/month');
  expect(focusCount('Labour')).toBe(1);
  await submit('Labour ₹');
  expect(focusCount('Tax')).toBe(1);
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
  await submit('Tax');
  expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
});

it('focusing Labour with the keypad up scrolls it 24 above the keypad', async () => {
  await open();
  // The keypad's top edge is at 400; the Labour field sits at 380 to 430.
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  measured = { Labour: 380 };
  await fireEvent(input('Labour ₹'), 'focus', {});
  // Bottom edge 430 + 24 = 454; 54 below the keypad's top.
  expect(scrollTo()).toHaveBeenCalledWith({ y: 54, animated: true });
});

it('a field already clear of the keypad does not scroll', async () => {
  await open();
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 700 } }); });
  measured = { Tax: 300 };
  await fireEvent(input('Tax'), 'focus', {});
  expect(scrollTo()).not.toHaveBeenCalled();
});

// The Save bar is a sibling under the scroll area (not laid over it), so the content needs no padding for it; what is left
// to check is that a focused field is scrolled clear of the bar.
describe('the pinned Save bar never covers a field', () => {
  it('scrolls a field that ends under the bar above it, with the keyboard closed', async () => {
    await open();
    await fireEvent(screen.getByTestId('add-rate-footer'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 170 } } });
    const windowHeight = Dimensions.get('window').height;
    // The field's bottom edge sits 10 above the window's bottom, inside the bar's 170.
    measured = { Tax: windowHeight - 60 };
    await fireEvent(input('Tax'), 'focus', {});
    // Bar top is windowHeight - 170; the field must end 24 above it: bottom (wh - 10) + 24 - (wh - 170) = 184.
    expect(scrollTo()).toHaveBeenCalledWith({ y: 184, animated: true });
  });
});

it('every number field selects its text on focus', async () => {
  await open();
  for (const label of ['From (kg)', 'Up to (kg)', 'Rent ₹/month', 'Labour ₹', 'Tax']) {
    expect(inputsWithLabel(label).map(n => n.props.selectTextOnFocus)).toEqual([true]);
  }
});

describe('with a second band', () => {
  const addBand = () => userEvent.press(screen.getByTestId('add-band'));

  it('the new band opens (the bands are an accordion) and Next walks its From, Up to, Rent, then Labour and Tax', async () => {
    await open();
    await addBand();
    // Band 1 is closed, band 2 is open: one From, Up to and Rent are on the screen, the second band's.
    expect(inputsWithLabelMounted('From (kg)')).toHaveLength(1);
    expect(inputsWithLabel('Rent ₹/month')[0]).toHaveProp('testID', 'add-rate-band.1.rent');
    await submit('Rent ₹/month');
    expect(focusCount('Labour')).toBe(1);
    expect(Keyboard.dismiss).not.toHaveBeenCalled();
  });

  // Next skips the fields of a closed band (they are not on the screen) and goes on to the next one that is.
  it('Next from the rent of an open first band goes on to the labour, not out of the form', async () => {
    await open();
    await addBand();
    // Open band 1 again: band 2 is now the closed one, and its fields are not on the screen.
    await userEvent.press(screen.getByTestId('add-rate-band-0-toggle'));
    expect(inputsWithLabel('Rent ₹/month')[0]).toHaveProp('testID', 'add-rate-band.0.rent');
    await submit('Rent ₹/month');
    expect(Keyboard.dismiss).not.toHaveBeenCalled();
    expect(focusCount('Labour')).toBe(1);
  });
});
