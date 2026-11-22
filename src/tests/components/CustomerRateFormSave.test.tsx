/**
 * Saving on the Add customer rate form and on the item's default-rate form (ported from the removed invoice-pencil
 * editor's tests): one call to replaceItemRates, a toast and no alert on success, the server's refusals shown where
 * they belong, the Save bar outside the scroll area. (The same flow for every mode is tested in
 * src/features/item-pricing/__tests__/useRateEditor.test.ts.) The customer form opens as a copy of Onion Red's default
 * rate: one band, 0 to 100 kg, rent 3.50.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';
import { RateForm } from '@/features/item-pricing/components/RateForm';
import { subscribeRatesChanged } from '@/features/item-pricing/contract';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { chip, inputsWithLabel, onionRows, rate } from '@/tests/helpers/rateEditorFixtures';

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
const DEFAULT_ONLY = onionRows().filter(r => !r.customer_id);
const replace = jest.mocked(replaceItemRates);
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
  await render(<CustomerRateForm itemId="onion" customerId={ORCHARD_A.id} customerName={ORCHARD_A.name} customerDeactivated={false} />);
}
const save = () => screen.getByTestId('add-rate-save');
const type = async (label: string, text: string, index = 0) => {
  await userEvent.paste(inputsWithLabel(label)[index], text);
};
const press = async (id: string) => {
  await userEvent.press(screen.getByTestId(id));
};
/** Choose Other date and pick a day in the Android calendar. */
const pickDay = async (year: number, month: number, day: number) => {
  await userEvent.press(chip('Other date'));
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
  Platform.OS = originalOS;
  jest.useRealTimers();
});

describe('a new customer rate', () => {
  it('saves in one call from today, with a toast, no alert, and the pages told', async () => {
    await openCustomer();
    const told: string[] = [];
    const stop = subscribeRatesChanged(id => told.push(id));
    replace.mockResolvedValue({ success: true });
    await type('Rent ₹/month', '3.2');

    await userEvent.press(save());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith({
      mode: 'change',
      item_id: 'onion',
      customer_id: ORCHARD_A.id,
      price_type: 'monthly',
      starts_on: '2026-10-14',
      seen_rows: expect.any(Array),
      request_key: expect.stringMatching(/^warehouse-rate-replace-/),
      bands: [{ weight_min: 0, weight_max: 100, unit_price: 3.2, labour_rate: 1.5, tax_percent: 5 }],
    }, { signal: expect.anything() });
    expect(showToast).toHaveBeenCalledWith('Customer rate saved.');
    expect(showAlert).not.toHaveBeenCalled();
    expect(told).toEqual(['onion']);
    expect(router.back).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a refused save is one call and no other write is made', async () => {
    await openCustomer();
    await type('Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'UNKNOWN', message: 'The server is busy.' });
    await userEvent.press(save());
    expect(replace).toHaveBeenCalledTimes(1);
    // The only function of the service this form calls is replaceItemRates (the rows come from the session cache).
    expect(listItemRates).not.toHaveBeenCalled();
    expect(Object.keys(jest.requireMock('@/services/item-pricing-service'))).toEqual(['replaceItemRates', 'listItemRates']);
    expect(screen.getByText('The server is busy.')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not call the server while a field is wrong, and says which', async () => {
    await openCustomer();
    await type('Rent ₹/month', '');
    await userEvent.press(save());
    expect(replace).not.toHaveBeenCalled();
    expect(inputsWithLabel('Rent ₹/month')[0]).toHaveProp('accessibilityHint', 'Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.');
    // Fixing the field clears the message.
    await type('Rent ₹/month', '3.30');
    expect(inputsWithLabel('Rent ₹/month')[0].props.accessibilityHint).toBeUndefined();
  });

  it('LATER_RATES_EXIST asks before replacing the planned rate, then sends replace_later', async () => {
    await openCustomer();
    await type('Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({
      success: false,
      errorCode: 'LATER_RATES_EXIST',
      later: [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }],
    });
    await userEvent.press(save());
    expect(screen.getByText('Replace the rate from 01/04/27?')).toBeOnTheScreen();
    expect(screen.getByText('A rate from 01/04/27 (₹12.50) comes after this date. Saving removes it.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeOnTheScreen();

    replace.mockResolvedValueOnce({ success: true });
    await userEvent.press(screen.getByRole('button', { name: 'Replace it' }));
    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls[1][0]).toMatchObject({ replace_later: true, starts_on: '2026-10-14' });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('"Keep it" closes the question and sends nothing more', async () => {
    await openCustomer();
    await type('Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({
      success: false,
      errorCode: 'LATER_RATES_EXIST',
      later: [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }],
    });
    await userEvent.press(save());
    expect(screen.getByRole('button', { name: 'Replace it' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('button', { name: 'Replace it' })).not.toBeOnTheScreen();
    expect(screen.queryByText('Replace the rate from 01/04/27?')).not.toBeOnTheScreen();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('INVALID_BAND puts the message under that band', async () => {
    await openCustomer();
    await type('Up to (kg)', '60');
    await press('add-band');
    // The new band opens (the bands are an accordion), starting where the first ends.
    await type('Up to (kg)', '100');
    await type('Rent ₹/month', '3.5');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_BAND', bandIndex: 1, message: 'Enter whole kilograms, for example 40.' });
    await userEvent.press(save());
    expect(replace).toHaveBeenCalledTimes(1);
    expect(inputsWithLabel('Up to (kg)')[0]).toHaveProp('testID', 'add-rate-band.1.upTo');
    expect(inputsWithLabel('Up to (kg)')[0]).toHaveProp('accessibilityHint', 'Enter whole kilograms, for example 40.');
    // Band 1 is not the wrong one: open it and its Up to has no message.
    await press('add-rate-band-0-toggle');
    expect(inputsWithLabel('Up to (kg)')[0]).toHaveProp('testID', 'add-rate-band.0.upTo');
    expect(inputsWithLabel('Up to (kg)')[0].props.accessibilityHint).toBeUndefined();
  });

  it('INVALID_AMOUNT on the rent of band 1 shows under that rent', async () => {
    await openCustomer();
    await type('Rent ₹/month', '3.2');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_AMOUNT', bandIndex: 0, field: 'unit_price', message: 'Check the rent, labour and tax amounts.' });
    await userEvent.press(save());
    expect(inputsWithLabel('Rent ₹/month')[0]).toHaveProp('accessibilityHint', 'Check the rent, labour and tax amounts.');
  });

  it('PAST_DATE_NOT_ALLOWED shows a red strip at the top and keeps the typed values', async () => {
    await openCustomer();
    await pickDay(2026, 10, 1);
    await type('Rent ₹/month', '3.9');
    replace.mockResolvedValueOnce({ success: false, errorCode: 'PAST_DATE_NOT_ALLOWED', message: 'Only an administrator or supervisor can start a rate in the past.' });
    await userEvent.press(save());
    expect(screen.getByRole('alert', { name: 'Only an administrator or supervisor can start a rate in the past.' })).toHaveProp('testID', 'add-rate-error');
    expect(inputsWithLabel('Rent ₹/month')[0]).toHaveDisplayValue('3.9');
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('the Save button is in a bar outside the scroll area', async () => {
    await openCustomer();
    // The scroll area is a host RCTScrollView: walk up from an element to see whether it sits inside one.
    const insideScroll = (el: ReturnType<typeof screen.getByTestId>) => {
      for (let up = el.parent; up; up = up.parent) if (up.type === 'RCTScrollView') return true;
      return false;
    };
    expect(insideScroll(inputsWithLabel('Rent ₹/month')[0])).toBe(true);
    expect(insideScroll(screen.getByTestId('add-rate-footer'))).toBe(false);
    expect(insideScroll(save())).toBe(false);
  });

  it('Save is off until something differs from the copy of the default rate', async () => {
    await openCustomer();
    expect(save()).toBeDisabled();
    await type('Rent ₹/month', '3.2');
    expect(save()).toBeEnabled();
  });
});

describe("the item's default rate (RateForm)", () => {
  const stopping = (to: string | null) => [
    rate('onion', null, 0, 100, 3.5, 1.5, 5, '2025-01-01', to, 'monthly', 'Review Onion Red'),
  ];
  async function openCorrect(rows: ReturnType<typeof stopping>) {
    jest.mocked(useItemRatesFor).mockReturnValue(ratesFor(rows as never));
    await render(<RateForm itemId="onion" mode="correct" priceType="monthly" />);
  }

  it("a correction saves from the rate's own start day and toasts 'Correction saved.'", async () => {
    await openCorrect(stopping(null));
    await type('Rent ₹/month', '3.6');
    replace.mockResolvedValue({ success: true });
    await userEvent.press(save());
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'correct', customer_id: null, starts_on: '2025-01-01' });
    expect(showToast).toHaveBeenCalledWith('Correction saved.');
  });

  // CR-02: the stop that the server keeps is named in the toast.
  it('the success toast says the rate still stops when the server kept the stop', async () => {
    await openCorrect(stopping('2027-03-31'));
    await type('Rent ₹/month', '3.6');
    replace.mockResolvedValueOnce({ success: true, keptEnd: '2027-03-31' });
    await userEvent.press(save());
    expect(showToast).toHaveBeenCalledWith('Correction saved. This rate still stops after 31/03/27.');
  });
});
