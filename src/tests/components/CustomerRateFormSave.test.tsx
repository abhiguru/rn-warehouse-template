/**
 * Saving on the Add customer rate form and on the item's default-rate form (ported from the removed invoice-pencil
 * editor's tests): one call to replaceItemRates, a toast and no alert on success, the server's refusals shown where
 * they belong, the Save bar outside the scroll area. (The same flow for every mode is tested in
 * src/features/item-pricing/__tests__/useRateEditor.test.ts.) The customer form opens as a copy of Onion Red's default
 * rate: one band, 0 to 100 kg, rent 3.50.
 */
import React from 'react';
import { Platform, ScrollView } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';
import { RateForm } from '@/features/item-pricing/components/RateForm';
import { subscribeRatesChanged } from '@/features/item-pricing/contract';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { chip, inputsWithLabel, onionRows, rate, textsOf } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

const ORCHARD_A = { id: 'cust-a', name: 'Review Orchard A' };
const DEFAULT_ONLY = onionRows().filter(r => !r.customer_id);
const replace = jest.mocked(replaceItemRates);
let tree: ReactTestRenderer | undefined;
const originalOS = Platform.OS;

const ratesFor = (rows = DEFAULT_ONLY): UseItemRatesForResult => ({
  itemRates: { item: { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' } as never, rows },
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
});
/** The form for Orchard A, who has no rate of their own: the draft is a copy of the default rate. */
async function openCustomer(rows = DEFAULT_ONLY) {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor(rows));
  await act(async () => { tree = create(<CustomerRateForm itemId="onion" customerId={ORCHARD_A.id} customerName={ORCHARD_A.name} customerDeactivated={false} />); });
  return tree!;
}
const save = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => b.props.testID === 'add-rate-save')!;
const type = async (t: ReactTestRenderer, label: string, text: string, index = 0) => {
  await act(async () => { inputsWithLabel(t, label)[index].props.onChangeText(text); });
};
const press = async (t: ReactTestRenderer, id: string) => {
  await act(async () => { t.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); });
};
/** Choose Other date and pick a day in the Android calendar. */
const pickDay = async (t: ReactTestRenderer, year: number, month: number, day: number) => {
  await act(async () => { chip(t, 'Other date').props.onPress(); });
  const calls = jest.mocked(DateTimePickerAndroid.open).mock.calls;
  await act(async () => { calls[calls.length - 1][0].onChange!({ type: 'set' } as never, new Date(year, month - 1, day)); });
};

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

describe('a new customer rate', () => {
  it('saves in one call from today, with a toast, no alert, and the pages told', async () => {
    const t = await openCustomer();
    const told: string[] = [];
    const stop = subscribeRatesChanged(id => told.push(id));
    replace.mockResolvedValue({ success: true });
    await type(t, 'Rent ₹/month', '3.2');

    await act(async () => { save(t).props.onPress(); });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith({
      mode: 'change',
      item_id: 'onion',
      customer_id: ORCHARD_A.id,
      price_type: 'monthly',
      starts_on: '2026-10-14',
      seen_rows: expect.any(Array),
      bands: [{ weight_min: 0, weight_max: 100, unit_price: 3.2, labour_rate: 1.5, tax_percent: 5 }],
    });
    expect(showToast).toHaveBeenCalledWith('Customer rate saved.');
    expect(showAlert).not.toHaveBeenCalled();
    expect(told).toEqual(['onion']);
    expect(router.back).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a refused save is one call and no other write is made', async () => {
    const t = await openCustomer();
    await type(t, 'Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'UNKNOWN', message: 'The server is busy.' });
    await act(async () => { save(t).props.onPress(); });
    expect(replace).toHaveBeenCalledTimes(1);
    // The only function of the service this form calls is replaceItemRates (the rows come from the session cache).
    expect(listItemRates).not.toHaveBeenCalled();
    expect(Object.keys(jest.requireMock('@/services/item-pricing-service'))).toEqual(['replaceItemRates', 'listItemRates']);
    expect(textsOf(t)).toContain('The server is busy.');
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not call the server while a field is wrong, and says which', async () => {
    const t = await openCustomer();
    await type(t, 'Rent ₹/month', '');
    await act(async () => { save(t).props.onPress(); });
    expect(replace).not.toHaveBeenCalled();
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.error).toBe('Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.');
    // Fixing the field clears the message.
    await type(t, 'Rent ₹/month', '3.30');
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.error).toBeUndefined();
  });

  it('LATER_RATES_EXIST asks before replacing the planned rate, then sends replace_later', async () => {
    const t = await openCustomer();
    await type(t, 'Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({
      success: false,
      errorCode: 'LATER_RATES_EXIST',
      later: [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }],
    });
    await act(async () => { save(t).props.onPress(); });
    const dialog = t.root.findAllByType(ConfirmDialog).find(d => d.props.confirmText === 'Replace it')!;
    expect(dialog.props.visible).toBe(true);
    expect(dialog.props.title).toBe('Replace the rate from 1 Apr 2027?');
    expect(dialog.props.message).toBe('A rate from 1 Apr 2027 (₹12.50) comes after this date. Saving removes it.');
    expect(dialog.props.cancelText).toBe('Keep it');

    replace.mockResolvedValueOnce({ success: true });
    await act(async () => { dialog.props.onConfirm(); });
    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls[1][0]).toMatchObject({ replace_later: true, starts_on: '2026-10-14' });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('"Keep it" closes the question and sends nothing more', async () => {
    const t = await openCustomer();
    await type(t, 'Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({
      success: false,
      errorCode: 'LATER_RATES_EXIST',
      later: [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }],
    });
    await act(async () => { save(t).props.onPress(); });
    const question = () => t.root.findAllByType(ConfirmDialog).find(d => d.props.confirmText === 'Replace it')!;
    expect(question().props.visible).toBe(true);
    await act(async () => { question().props.onCancel(); });
    expect(question().props.visible).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('INVALID_BAND puts the message under that band', async () => {
    const t = await openCustomer();
    await type(t, 'Up to (kg)', '60');
    await press(t, 'add-band');
    // The new band opens (the bands are an accordion), starting where the first ends.
    await type(t, 'Up to (kg)', '100');
    await type(t, 'Rent ₹/month', '3.5');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_BAND', bandIndex: 1, message: 'Enter whole kilograms, for example 40.' });
    await act(async () => { save(t).props.onPress(); });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.testID).toBe('add-rate-band.1.upTo');
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.error).toBe('Enter whole kilograms, for example 40.');
    // Band 1 is not the wrong one: open it and its Up to has no message.
    await press(t, 'add-rate-band-0-toggle');
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.testID).toBe('add-rate-band.0.upTo');
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.error).toBeUndefined();
  });

  it('INVALID_AMOUNT on the rent of band 1 shows under that rent', async () => {
    const t = await openCustomer();
    await type(t, 'Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_AMOUNT', bandIndex: 0, field: 'unit_price', message: 'Check the rent, labour and tax amounts.' });
    await act(async () => { save(t).props.onPress(); });
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.error).toBe('Check the rent, labour and tax amounts.');
  });

  it('PAST_DATE_NOT_ALLOWED shows a red strip at the top and keeps the typed values', async () => {
    const t = await openCustomer();
    await pickDay(t, 2026, 10, 1);
    await type(t, 'Rent ₹/month', '3.9');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'PAST_DATE_NOT_ALLOWED', message: 'Only an administrator or supervisor can start a rate in the past.' });
    await act(async () => { save(t).props.onPress(); });
    const strip = t.root.findAll(n => n.props.testID === 'add-rate-error' && n.props.message)[0];
    expect(strip.props.variant).toBe('critical');
    expect(strip.props.message).toBe('Only an administrator or supervisor can start a rate in the past.');
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.value).toBe('3.9');
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('the Save button is in a bar outside the scroll area', async () => {
    const t = await openCustomer();
    const scroll = t.root.findByType(ScrollView);
    expect(scroll.findAll(n => n.props.testID === 'add-rate-footer')).toHaveLength(0);
    expect(t.root.findAll(n => n.props.testID === 'add-rate-footer').length).toBeGreaterThan(0);
    expect(scroll.findAllByType(Button).some(b => b.props.testID === 'add-rate-save')).toBe(false);
  });

  it('Save is off until something differs from the copy of the default rate', async () => {
    const t = await openCustomer();
    expect(save(t).props.disabled).toBe(true);
    await type(t, 'Rent ₹/month', '3.2');
    expect(save(t).props.disabled).toBe(false);
  });
});

describe("the item's default rate (RateForm)", () => {
  const stopping = (to: string | null) => [
    rate('onion', null, 0, 100, 3.5, 1.5, 5, '2025-01-01', to, 'monthly', 'Review Onion Red'),
  ];
  async function openCorrect(rows: ReturnType<typeof stopping>) {
    jest.mocked(useItemRatesFor).mockReturnValue(ratesFor(rows as never));
    await act(async () => { tree = create(<RateForm itemId="onion" mode="correct" priceType="monthly" />); });
    return tree!;
  }

  it("a correction saves from the rate's own start day and toasts 'Correction saved.'", async () => {
    const t = await openCorrect(stopping(null));
    await type(t, 'Rent ₹/month', '3.6');
    replace.mockResolvedValue({ success: true });
    await act(async () => { save(t).props.onPress(); });
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'correct', customer_id: null, starts_on: '2025-01-01' });
    expect(showToast).toHaveBeenCalledWith('Correction saved.');
  });

  // CR-02: the stop that the server keeps is named in the toast.
  it('the success toast says the rate still stops when the server kept the stop', async () => {
    const t = await openCorrect(stopping('2027-03-31'));
    await type(t, 'Rent ₹/month', '3.6');
    replace.mockResolvedValueOnce({ success: true, keptEnd: '2027-03-31' });
    await act(async () => { save(t).props.onPress(); });
    expect(showToast).toHaveBeenCalledWith('Correction saved. This rate still stops after 31 Mar 2027.');
  });
});
