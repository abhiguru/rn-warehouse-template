/**
 * The earliest day a rate may start is the day of the facility's oldest GRN (backend migration 86, B2 c), read with
 * the rates (`earliest_start`): the calendar starts there, a day before it is refused at the field with the date
 * named, and so is the server's INVALID_DATE (data.earliest). An older server sends no floor and the form keeps
 * three years before today. Here on the Add customer rate form (ported from the removed invoice-pencil editor's
 * tests; the hook and the calendar have their own tests: useRateEditor.test.ts, StartsOnField.test.tsx).
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button } from '@/components/ui/Button';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { replaceItemRates } from '@/services/item-pricing-service';
import { clearRateStartFloor, rememberRateStartFloor } from '@/services/rateStartFloor';
import { chip, inputsWithLabel, onionRows, textsOf } from '@/tests/helpers/rateEditorFixtures';

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
const originalOS = Platform.OS;
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Orchard A has no rate of its own for Onion Red (only the default, 3.50 rent): the form adds one, as a copy of the default.
const DEFAULT_ONLY = onionRows().filter(r => !r.customer_id);
const ratesFor = (rows = DEFAULT_ONLY): UseItemRatesForResult => ({
  itemRates: { item: { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' } as never, rows },
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
});

async function open() {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
  await act(async () => { tree = create(<CustomerRateForm itemId="onion" customerId={ORCHARD_A.id} customerName={ORCHARD_A.name} customerDeactivated={false} />); });
  return tree!;
}
const save = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => b.props.testID === 'add-rate-save')!;
const type = async (t: ReactTestRenderer, label: string, text: string, index = 0) => {
  await act(async () => { inputsWithLabel(t, label)[index].props.onChangeText(text); });
};
/** Change the copy of the default rate, so that Save is on (it stays off until something differs). */
const changeRent = (t: ReactTestRenderer) => type(t, 'Rent ₹/month', '3.9');

beforeEach(() => {
  jest.clearAllMocks();
  clearRateStartFloor();
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

const openCalendar = async (t: ReactTestRenderer) => {
  await act(async () => { chip(t, 'Other date').props.onPress(); });
  const calls = jest.mocked(DateTimePickerAndroid.open).mock.calls;
  return calls[calls.length - 1][0];
};
/** Choose Other date and pick a day in the Android calendar, bypassing the calendar's own limits. */
const pickDay = async (t: ReactTestRenderer, year: number, month: number, d: number) => {
  const opts = await openCalendar(t);
  await act(async () => { opts.onChange!({ type: 'set' } as never, new Date(year, month - 1, d)); });
};

it('the calendar starts on the day of the oldest GRN', async () => {
  rememberRateStartFloor('2022-01-01');
  const t = await open();
  expect(day((await openCalendar(t)).minimumDate as Date)).toBe('2022-01-01');
});

it('without a floor from the server the calendar keeps three years back (older server)', async () => {
  const t = await open();
  expect(day((await openCalendar(t)).minimumDate as Date)).toBe('2023-10-15');
});

it('a day before the oldest GRN is refused at the field, naming the date, and nothing is sent', async () => {
  rememberRateStartFloor('2022-01-01');
  const t = await open();
  await changeRent(t);
  await pickDay(t, 2021, 12, 31);
  expect(save(t).props.disabled).toBe(false);
  await act(async () => { save(t).props.onPress(); });
  expect(replaceItemRates).not.toHaveBeenCalled();
  expect(textsOf(t)).toContain('Choose a start date on or after 01/01/22.');
});

it('the oldest GRN day itself is accepted', async () => {
  rememberRateStartFloor('2022-01-01');
  const t = await open();
  await changeRent(t);
  await pickDay(t, 2022, 1, 1);
  jest.mocked(replaceItemRates).mockResolvedValue({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(replaceItemRates).toHaveBeenCalledTimes(1);
  expect(replaceItemRates).toHaveBeenCalledWith(expect.objectContaining({ starts_on: '2022-01-01' }), expect.anything());
  expect(textsOf(t)).not.toContain('Choose a start date on or after 01/01/22.');
});

it("the server's INVALID_DATE shows the same text at the field and moves the floor", async () => {
  const t = await open();
  await changeRent(t);
  await pickDay(t, 2026, 11, 1);
  jest.mocked(replaceItemRates).mockResolvedValue({
    success: false,
    errorCode: 'INVALID_DATE',
    earliest: '2026-11-02',
    message: 'Choose a start date on or after 02/11/26.',
  });
  await act(async () => { save(t).props.onPress(); });
  expect(textsOf(t)).toContain('Choose a start date on or after 02/11/26.');
  // The typed rent is still there, and the calendar now starts on the day the server named.
  expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.value).toBe('3.9');
  expect(day((await openCalendar(t)).minimumDate as Date)).toBe('2026-11-02');
});
