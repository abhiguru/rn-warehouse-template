/**
 * Saving in the rate editor: one call to replaceItemRates, a toast and no alert on success, the
 * server's refusals shown where they belong, the save bar outside the scroll area.
 */
import React from 'react';
import { Platform, ScrollView } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { subscribeRatesChanged } from '@/features/item-pricing/contract';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { chip, cuminRows, rate, garlicRows, inputsWithLabel, textsOf } from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';

let mockParams: Record<string, string> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'DateTimePicker',
  DateTimePickerAndroid: { open: jest.fn() },
}));

const replace = jest.mocked(replaceItemRates);
let tree: ReactTestRenderer | undefined;
const originalOS = Platform.OS;

async function open(params: Record<string, string>, rows = cuminRows()) {
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(rows);
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}
const save = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => String(b.props.children).startsWith('Save'))!;
const type = async (t: ReactTestRenderer, label: string, text: string, index = 0) => {
  await act(async () => { inputsWithLabel(t, label)[index].props.onChangeText(text); });
};
/** Choose Other date and pick a day in the Android calendar. */
const pickDay = async (t: ReactTestRenderer, year: number, month: number, day: number) => {
  await act(async () => { chip(t, 'Other date').props.onPress(); });
  const calls = jest.mocked(DateTimePickerAndroid.open).mock.calls;
  await act(async () => { calls[calls.length - 1][0].onChange!({ type: 'set' } as never, new Date(year, month - 1, day)); });
};
const change = { mode: 'change', item_id: 'cumin', price_type: 'monthly' };

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  jest.useFakeTimers({
    now: new Date('2026-10-14T10:00:00+05:30'),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'hrtime'],
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  Platform.OS = originalOS;
  jest.useRealTimers();
});

it('saves job (b) in one call: 12.00 from 1 Jan 2027, with a toast, no alert, and the pages told', async () => {
  const t = await open(change);
  await pickDay(t, 2027, 1, 1);
  await type(t, 'Rent per bag, per month', '12');
  const told: string[] = [];
  const stop = subscribeRatesChanged(id => told.push(id));
  replace.mockResolvedValue({ success: true });

  await act(async () => { save(t).props.onPress(); });

  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith({
    mode: 'change',
    item_id: 'cumin',
    customer_id: null,
    price_type: 'monthly',
    starts_on: '2027-01-01',
    seen_rows: expect.any(Array),
    bands: [{ weight_min: 0, weight_max: 100, unit_price: 12, labour_rate: 3, tax_percent: 5 }],
  });
  expect(showToast).toHaveBeenCalledWith('New rate saved. Starts 1 Jan 2027.');
  expect(showAlert).not.toHaveBeenCalled();
  expect(told).toEqual(['cumin']);
  expect(router.back).toHaveBeenCalledTimes(1);
  stop();
});

it('the editor uses no other service call to write (create, update or delete)', () => {
  expect(Object.keys(jest.requireMock('@/services/item-pricing-service'))).toEqual(['replaceItemRates', 'listItemRates']);
});

it("a correction saves from the rate's own start day and toasts 'Correction saved.'", async () => {
  const t = await open({ mode: 'correct', item_id: 'cumin', price_type: 'monthly' });
  replace.mockResolvedValue({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(replace).toHaveBeenCalledWith(expect.objectContaining({ starts_on: '2026-04-01' }));
  expect(showToast).toHaveBeenCalledWith('Correction saved.');
});

it('does not call the server while a field is wrong, and says which', async () => {
  const t = await open(change);
  await pickDay(t, 2027, 1, 1);
  await type(t, 'Rent per bag, per month', '');
  await act(async () => { save(t).props.onPress(); });
  expect(replace).not.toHaveBeenCalled();
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBe('Enter a rent of 0 or more.');
  // Fixing the field clears the message.
  await type(t, 'Rent per bag, per month', '12');
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBeUndefined();
});

it('LATER_RATES_EXIST asks before replacing the planned rate, then sends replace_later', async () => {
  const t = await open(change);
  await pickDay(t, 2027, 1, 1);
  await type(t, 'Rent per bag, per month', '12');
  replace.mockResolvedValueOnce({
    success: false,
    errorCode: 'LATER_RATES_EXIST',
    later: [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }],
  });
  await act(async () => { save(t).props.onPress(); });
  const dialog = t.root.findByType(ConfirmDialog);
  expect(dialog.props.visible).toBe(true);
  expect(dialog.props.title).toBe('Replace the rate from 1 Apr 2027?');
  expect(dialog.props.message).toBe('A rate from 1 Apr 2027 (₹12.50) comes after this date. Saving removes it.');
  expect(dialog.props.confirmText).toBe('Replace it');
  expect(dialog.props.cancelText).toBe('Keep it');

  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { dialog.props.onConfirm(); });
  expect(replace).toHaveBeenCalledTimes(2);
  expect(replace.mock.calls[1][0]).toMatchObject({ replace_later: true, starts_on: '2027-01-01' });
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('"Keep it" closes the question and sends nothing more', async () => {
  const t = await open(change);
  await pickDay(t, 2027, 1, 1);
  replace.mockResolvedValueOnce({
    success: false,
    errorCode: 'LATER_RATES_EXIST',
    later: [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }],
  });
  await act(async () => { save(t).props.onPress(); });
  await act(async () => { t.root.findByType(ConfirmDialog).props.onCancel(); });
  expect(t.root.findByType(ConfirmDialog).props.visible).toBe(false);
  expect(replace).toHaveBeenCalledTimes(1);
  expect(router.back).not.toHaveBeenCalled();
});

it('INVALID_BAND for band 2 puts the message under that band', async () => {
  const t = await open({ mode: 'change', item_id: 'garlic', price_type: 'monthly' }, garlicRows());
  await pickDay(t, 2027, 1, 1);
  replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_BAND', bandIndex: 1, message: 'Enter whole kilograms, for example 40.' });
  await act(async () => { save(t).props.onPress(); });
  expect(inputsWithLabel(t, 'Up to')[1].props.error).toBe('Enter whole kilograms, for example 40.');
  expect(inputsWithLabel(t, 'Up to')[0].props.error).toBeUndefined();
});

it('INVALID_AMOUNT on the rent of band 1 shows under that rent', async () => {
  const t = await open(change);
  await pickDay(t, 2027, 1, 1);
  replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_AMOUNT', bandIndex: 0, field: 'unit_price', message: 'Check the rent, labour and tax amounts.' });
  await act(async () => { save(t).props.onPress(); });
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBe('Check the rent, labour and tax amounts.');
});

it('PAST_DATE_NOT_ALLOWED shows a red strip at the top and keeps the typed values', async () => {
  const t = await open(change);
  await pickDay(t, 2026, 10, 1);
  await type(t, 'Rent per bag, per month', '12');
  replace.mockResolvedValueOnce({ success: false, errorCode: 'PAST_DATE_NOT_ALLOWED', message: 'Only an administrator or supervisor can start a rate in the past.' });
  await act(async () => { save(t).props.onPress(); });
  expect(textsOf(t)).toContain('Only an administrator or supervisor can start a rate in the past.');
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.value).toBe('12');
  expect(showToast).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

it('the Save button is in a bar outside the scroll area', async () => {
  const t = await open(change);
  const scroll = t.root.findByType(ScrollView);
  expect(scroll.findAll(n => n.props.testID === 'save-bar')).toHaveLength(0);
  expect(t.root.findAll(n => n.props.testID === 'save-bar').length).toBeGreaterThan(0);
  expect(scroll.findAllByType(Button).some(b => String(b.props.children).startsWith('Save'))).toBe(false);
});

// CR-03: the question never calls a rate planned when it is in force today.
it('LATER_RATES_EXIST names the later rate as the one in force today when it is', async () => {
  const t = await open(change);
  await pickDay(t, 2027, 1, 1);
  replace.mockResolvedValueOnce({
    success: false,
    errorCode: 'LATER_RATES_EXIST',
    later: [{ effective_from: '2026-04-01', weight_min: 0, weight_max: 100, unit_price: 11 }],
  });
  await act(async () => { save(t).props.onPress(); });
  const dialog = t.root.findByType(ConfirmDialog);
  expect(dialog.props.message).toBe('A rate from 1 Apr 2026 (₹11.00) comes after this date. Saving removes it. It is the rate in force today.');
});

it('Correct this rate sends the correct mode with the rate\'s own start and no later question can follow', async () => {
  const t = await open({ mode: 'correct', item_id: 'cumin', price_type: 'monthly', starts_on: '2026-04-01' });
  await type(t, 'Rent per bag, per month', '11.50');
  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'correct', starts_on: '2026-04-01' });
});

// CR-02: the stop that the server keeps is named in the toast.
it('the success toast says the rate still stops when the server kept the stop', async () => {
  const rows = [rate('cumin', null, 0, 100, 11, 3, 5, '2026-04-01', '2027-03-31', 'monthly', 'Review Cumin Bold')];
  const t = await open({ mode: 'correct', item_id: 'cumin', price_type: 'monthly', starts_on: '2026-04-01' }, rows);
  expect(textsOf(t)).toContain('This rate still stops after 31 Mar 2027.');
  await type(t, 'Rent per bag, per month', '11.50');
  replace.mockResolvedValueOnce({ success: true, keptEnd: '2027-03-31' });
  await act(async () => { save(t).props.onPress(); });
  expect(showToast).toHaveBeenCalledWith('Correction saved. This rate still stops after 31 Mar 2027.');
});

// CR-01: Edit new rate keeps its date chips and moves the planned rate.
it('Edit new rate with a moved date sends change with move_from; with the same date sends correct', async () => {
  const rows = [...cuminRows(), rate('cumin', null, 0, 100, 12, 3, 5, '2027-01-01', null, 'monthly', 'Review Cumin Bold')];
  const upcoming = { mode: 'upcoming', item_id: 'cumin', price_type: 'monthly', starts_on: '2027-01-01' };
  const t = await open(upcoming, rows);
  await pickDay(t, 2027, 2, 1);
  expect(textsOf(t)).toContain('Moves the new rate from 1 Jan 2027 to 1 Feb 2027');
  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', move_from: '2027-01-01', starts_on: '2027-02-01' });
  act(() => t.unmount());

  const u = await open(upcoming, rows);
  await type(u, 'Rent per bag, per month', '12.50');
  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { save(u).props.onPress(); });
  expect(replace.mock.calls[1][0]).toMatchObject({ mode: 'correct', starts_on: '2027-01-01' });
});
