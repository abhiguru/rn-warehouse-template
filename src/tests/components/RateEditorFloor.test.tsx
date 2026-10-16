/**
 * The earliest day a rate may start is the day of the facility's oldest GRN (backend migration 86, B2 c),
 * read with the rates (`earliest_start`): the calendar starts there, a day before it is refused at the
 * field with the date named, and so is the server's INVALID_DATE (data.earliest). An older server sends
 * no floor and the editor keeps three years before today. Here on the editor of the invoice pencil adding a
 * customer rate (the hook and the calendar have their own tests: useRateEditor.test.ts, StartsOnField.test.tsx).
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button } from '@/components/ui/Button';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { clearRateStartFloor, rememberRateStartFloor } from '@/services/rateStartFloor';
import { ORCHARD_A, chip, inputsWithLabel, onionRows, textsOf } from '@/tests/helpers/rateEditorFixtures';
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
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

let tree: ReactTestRenderer | undefined;
const originalOS = Platform.OS;
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function open(params: Record<string, string>) {
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(onionRows());
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}
const save = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => String(b.props.children).startsWith('Save'))!;
// Orchard A has no rate of its own for Onion Red: an invoice line received on 2 May 2026 adds one.
const add = {
  mode: 'invoice', item_id: 'onion', item_name: 'Review Onion Red', customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name, price_type: 'monthly',
  unit_price: '3.2', labour_rate: '1.75', tax_percent: '5', weight_min: '0', weight_max: '60', grn_date: '2026-05-02',
};

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

it('the calendar starts on the day of the oldest GRN', async () => {
  rememberRateStartFloor('2022-01-01');
  const t = await open(add);
  expect(day((await openCalendar(t)).minimumDate as Date)).toBe('2022-01-01');
});

it('without a floor from the server the calendar keeps three years back (older server)', async () => {
  const t = await open(add);
  expect(day((await openCalendar(t)).minimumDate as Date)).toBe('2023-10-15');
});

/** Choose Other date and pick a day in the Android calendar, bypassing the calendar's own limits. */
const pickDay = async (t: ReactTestRenderer, year: number, month: number, d: number) => {
  const opts = await openCalendar(t);
  await act(async () => { opts.onChange!({ type: 'set' } as never, new Date(year, month - 1, d)); });
};

it('a day before the oldest GRN is refused at the field, naming the date, and nothing is sent', async () => {
  rememberRateStartFloor('2022-01-01');
  const t = await open(add);
  await pickDay(t, 2021, 12, 31);
  await act(async () => { save(t).props.onPress(); });
  expect(replaceItemRates).not.toHaveBeenCalled();
  expect(textsOf(t)).toContain('Choose a start date on or after 1 Jan 2022.');
});

it('the oldest GRN day itself is accepted', async () => {
  rememberRateStartFloor('2022-01-01');
  const t = await open(add);
  await pickDay(t, 2022, 1, 1);
  jest.mocked(replaceItemRates).mockResolvedValue({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(replaceItemRates).toHaveBeenCalledWith(expect.objectContaining({ starts_on: '2022-01-01' }));
});

it("the server's INVALID_DATE shows the same text at the field and moves the floor", async () => {
  const t = await open(add);
  await pickDay(t, 2026, 11, 1);
  jest.mocked(replaceItemRates).mockResolvedValue({
    success: false,
    errorCode: 'INVALID_DATE',
    earliest: '2026-11-02',
    message: 'Choose a start date on or after 2 Nov 2026.',
  });
  await act(async () => { save(t).props.onPress(); });
  expect(textsOf(t)).toContain('Choose a start date on or after 2 Nov 2026.');
  expect(inputsWithLabel(t, 'Rent per bag, per month').length).toBeGreaterThan(0);
  expect(day((await openCalendar(t)).minimumDate as Date)).toBe('2026-11-02');
});
