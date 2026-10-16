/**
 * Saving in the rate editor of the invoice pencil: one call to replaceItemRates, a toast and no alert on success, the
 * server's refusals shown where they belong, the save bar outside the scroll area. (The same flow for every mode
 * of the rate boxes is tested in src/features/item-pricing/__tests__/useRateEditor.test.ts.)
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
import { ORCHARD_A, ORCHARD_B, chip, rate, onionRows, inputsWithLabel, textsOf } from '@/tests/helpers/rateEditorFixtures';
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

async function open(params: Record<string, string>, rows = onionRows()) {
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
// The invoice line: 60 kg of Onion Red received on 2 May 2026 (before today, 14 Oct 2026), charged 3.20.
const line = {
  mode: 'invoice',
  item_id: 'onion',
  item_name: 'Review Onion Red',
  price_type: 'monthly',
  unit_price: '3.2',
  labour_rate: '1.75',
  tax_percent: '5',
  weight_min: '0',
  weight_max: '60',
  grn_date: '2026-05-02',
};
/** Orchard A has no rate of its own: the editor adds one. */
const add = { ...line, customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name };
/** Orchard B has its own rate since 1 Jan 2026: the editor corrects it. */
const correct = { ...line, customer_id: ORCHARD_B.id, customer_name: ORCHARD_B.name };

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

it('saves a new customer rate in one call from the received day, with a toast, no alert, and the pages told', async () => {
  const t = await open(add);
  const told: string[] = [];
  const stop = subscribeRatesChanged(id => told.push(id));
  replace.mockResolvedValue({ success: true });

  await act(async () => { save(t).props.onPress(); });

  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith({
    mode: 'change',
    item_id: 'onion',
    customer_id: ORCHARD_A.id,
    price_type: 'monthly',
    starts_on: '2026-05-02',
    seen_rows: expect.any(Array),
    bands: [{ weight_min: 0, weight_max: 100, unit_price: 3.2, labour_rate: 1.75, tax_percent: 5 }],
  });
  expect(showToast).toHaveBeenCalledWith('Customer rate saved.');
  expect(showAlert).not.toHaveBeenCalled();
  expect(told).toEqual(['onion']);
  expect(router.back).toHaveBeenCalledTimes(1);
  stop();
});

it('the editor uses no other service call to write (create, update or delete)', () => {
  expect(Object.keys(jest.requireMock('@/services/item-pricing-service'))).toEqual(['replaceItemRates', 'listItemRates']);
});

it("a correction saves from the rate's own start day and toasts 'Correction saved.'", async () => {
  const t = await open(correct);
  replace.mockResolvedValue({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'correct', customer_id: ORCHARD_B.id, starts_on: '2026-01-01' });
  expect(showToast).toHaveBeenCalledWith('Correction saved.');
});

// CR-02: the stop that the server keeps is named in the toast.
it('the success toast says the rate still stops when the server kept the stop', async () => {
  const rows = [...onionRows().filter(r => !r.customer_id), rate('onion', ORCHARD_B, 0, 100, 3, 1.5, 5, '2026-01-01', '2027-03-31', 'monthly', 'Review Onion Red')];
  const t = await open(correct, rows);
  expect(textsOf(t)).toContain('This rate still stops after 31 Mar 2027.');
  replace.mockResolvedValueOnce({ success: true, keptEnd: '2027-03-31' });
  await act(async () => { save(t).props.onPress(); });
  expect(showToast).toHaveBeenCalledWith('Correction saved. This rate still stops after 31 Mar 2027.');
});

it('does not call the server while a field is wrong, and says which', async () => {
  const t = await open(add);
  await type(t, 'Rent per bag, per month', '');
  await act(async () => { save(t).props.onPress(); });
  expect(replace).not.toHaveBeenCalled();
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBe('Enter a rent of 0 or more.');
  // Fixing the field clears the message.
  await type(t, 'Rent per bag, per month', '3.30');
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBeUndefined();
});

it('LATER_RATES_EXIST asks before replacing the planned rate, then sends replace_later', async () => {
  const t = await open(add);
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
  expect(replace.mock.calls[1][0]).toMatchObject({ replace_later: true, starts_on: '2026-05-02' });
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('"Keep it" closes the question and sends nothing more', async () => {
  const t = await open(add);
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

it('INVALID_BAND puts the message under that band', async () => {
  const t = await open(add);
  await act(async () => { inputsWithLabel(t, 'Up to')[0].props.onChangeText('60'); });
  await act(async () => { t.root.find(n => n.props.testID === 'add-band' && typeof n.props.onPress === 'function').props.onPress(); });
  await act(async () => { inputsWithLabel(t, 'Up to')[1].props.onChangeText('100'); });
  await type(t, 'Rent per bag, per month', '3.5', 1);
  replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_BAND', bandIndex: 1, message: 'Enter whole kilograms, for example 40.' });
  await act(async () => { save(t).props.onPress(); });
  expect(replace).toHaveBeenCalledTimes(1);
  expect(inputsWithLabel(t, 'Up to')[1].props.error).toBe('Enter whole kilograms, for example 40.');
  expect(inputsWithLabel(t, 'Up to')[0].props.error).toBeUndefined();
});

it('INVALID_AMOUNT on the rent of band 1 shows under that rent', async () => {
  const t = await open(add);
  replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_AMOUNT', bandIndex: 0, field: 'unit_price', message: 'Check the rent, labour and tax amounts.' });
  await act(async () => { save(t).props.onPress(); });
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBe('Check the rent, labour and tax amounts.');
});

it('PAST_DATE_NOT_ALLOWED shows a red strip at the top and keeps the typed values', async () => {
  const t = await open(add);
  await pickDay(t, 2026, 10, 1);
  await type(t, 'Rent per bag, per month', '3.9');
  replace.mockResolvedValueOnce({ success: false, errorCode: 'PAST_DATE_NOT_ALLOWED', message: 'Only an administrator or supervisor can start a rate in the past.' });
  await act(async () => { save(t).props.onPress(); });
  expect(textsOf(t)).toContain('Only an administrator or supervisor can start a rate in the past.');
  expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.value).toBe('3.9');
  expect(showToast).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

it('the Save button is in a bar outside the scroll area', async () => {
  const t = await open(add);
  const scroll = t.root.findByType(ScrollView);
  expect(scroll.findAll(n => n.props.testID === 'save-bar')).toHaveLength(0);
  expect(t.root.findAll(n => n.props.testID === 'save-bar').length).toBeGreaterThan(0);
  expect(scroll.findAllByType(Button).some(b => String(b.props.children).startsWith('Save'))).toBe(false);
});
