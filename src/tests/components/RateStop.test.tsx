/**
 * Stop this rate (app/item-rates/stop.tsx): the last day, what happens after it, one call.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { subscribeRatesChanged } from '@/features/item-pricing/contract';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { showToast } from '@/utils/toast';
import { ORCHARD_B, chip, chipState, onionRows, rate, textsOf } from '@/tests/helpers/rateEditorFixtures';
import RateStopScreen from '../../../app/item-rates/stop';

let mockParams: Record<string, string> = {};
let mockOffline = false;
const mockGuardCalls = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'staff' } } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: (o: unknown) => { mockGuardCalls(o); return { leaveWithoutAsking: (go: () => void) => go() }; } }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'DateTimePicker',
  DateTimePickerAndroid: { open: jest.fn() },
}));

const replace = jest.mocked(replaceItemRates);
let tree: ReactTestRenderer | undefined;
const originalOS = Platform.OS;
const customer = { mode: 'x', item_id: 'onion', item_name: 'Review Onion Red', customer_id: ORCHARD_B.id, customer_name: ORCHARD_B.name, price_type: 'monthly' };

async function open(params: Record<string, string>, rows = onionRows()) {
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(rows);
  await act(async () => { tree = create(<RateStopScreen />); });
  return tree!;
}
const stopButton = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => b.props.children === 'Stop rate')!;

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
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

it('a customer rate: says the customer pays the default rate (3.50) afterwards, Today preselected', async () => {
  const t = await open(customer);
  const texts = textsOf(t);
  expect(texts).toContain('Stop this rate');
  expect(texts).toContain('After the last day Review Orchard B pays the default rate, ₹3.50 per bag, per month.');
  expect(texts).toContain('Last day');
  expect(chipState(t)).toEqual(['Today, 14/10/26:on', '31/10/26:off', '31/03/27:off', 'Other date:off']);
});

// CR-14: the default rate quoted is the one in force the day after the chosen last day.
it('the quoted default rate follows the chosen last day', async () => {
  const rows = [...onionRows().map(r => (r.customer_id ? r : { ...r, effective_to: '2026-12-31' })), rate('onion', null, 0, 100, 4.5, 1.5, 5, '2027-01-01', null, 'monthly', 'Review Onion Red')];
  const t = await open(customer, rows);
  expect(textsOf(t)).toContain('After the last day Review Orchard B pays the default rate, ₹3.50 per bag, per month.');
  await act(async () => { chip(t, '31/03/27').props.onPress(); });
  expect(textsOf(t)).toContain('After the last day Review Orchard B pays the default rate, ₹4.50 per bag, per month.');
});

it('the default rate: says invoices cannot price lots received after the last day', async () => {
  const t = await open({ ...customer, customer_id: '', customer_name: '' });
  expect(textsOf(t)).toContain(
    "Review Onion Red will have no default rate after the last day. Invoices can't price lots received after it until you add a new rate."
  );
});

it('a customer whose weights the default does not hold has no rate afterwards', async () => {
  const rows = [onionRows()[1], rate('onion', null, 0, 40, 3.5, 1.5, 5, '2025-01-01', null)];
  const t = await open(customer, rows);
  expect(textsOf(t)).toContain('After the last day Review Orchard B has no rate for these weights.');
});

it('Stop rate with Today sends the day after as the start of nothing, then toasts and goes back', async () => {
  const t = await open(customer);
  const told: string[] = [];
  const stop = subscribeRatesChanged(id => told.push(id));
  replace.mockResolvedValue({ success: true });
  await act(async () => { stopButton(t).props.onPress(); });
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith({ item_id: 'onion', customer_id: 'cust-b', price_type: 'monthly', starts_on: '2026-10-15', bands: [], seen_rows: expect.any(Array), request_key: expect.stringMatching(/^warehouse-rate-stop-/) }, { signal: expect.anything() });
  expect(showToast).toHaveBeenCalledWith('Rate stopped. Last day 14/10/26.');
  expect(told).toEqual(['onion']);
  expect(router.back).toHaveBeenCalledTimes(1);
  stop();
});

it('a rate that started today can be stopped with last day today', async () => {
  const rows = [rate('onion', ORCHARD_B, 0, 100, 3, 1.5, 5, '2026-10-14', null), rate('onion', null, 0, 100, 3.5, 1.5, 5, '2025-01-01', null)];
  const t = await open(customer, rows);
  replace.mockResolvedValue({ success: true });
  await act(async () => { stopButton(t).props.onPress(); });
  expect(replace.mock.calls[0][0]).toMatchObject({ starts_on: '2026-10-15', bands: [] });
  expect(t.root.findAll(n => n.props.testID === 'editor-error')).toHaveLength(0);
});

it('the 31/03/27 chip stops after that day', async () => {
  const t = await open(customer);
  await act(async () => { chip(t, '31/03/27').props.onPress(); });
  replace.mockResolvedValue({ success: true });
  await act(async () => { stopButton(t).props.onPress(); });
  expect(replace.mock.calls[0][0].starts_on).toBe('2027-04-01');
  expect(showToast).toHaveBeenCalledWith('Rate stopped. Last day 31/03/27.');
});

it('Other date opens the calendar at once; no past day for any role', async () => {
  Platform.OS = 'android';
  const t = await open(customer);
  await act(async () => { chip(t, 'Other date').props.onPress(); });
  const opts = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
  expect([opts.minimumDate!.getFullYear(), opts.minimumDate!.getMonth(), opts.minimumDate!.getDate()]).toEqual([2026, 9, 14]);
  expect(opts.maximumDate!.getFullYear()).toBe(2028);
  await act(async () => { opts.onChange!({ type: 'set' } as never, new Date(2026, 11, 20)); });
  replace.mockResolvedValue({ success: true });
  await act(async () => { stopButton(t).props.onPress(); });
  expect(replace.mock.calls[0][0].starts_on).toBe('2026-12-21');
});

it('NOTHING_TO_STOP shows the message and keeps the screen', async () => {
  const t = await open(customer);
  replace.mockResolvedValue({ success: false, errorCode: 'NOTHING_TO_STOP', message: 'This rate has already stopped.' });
  await act(async () => { stopButton(t).props.onPress(); });
  expect(textsOf(t)).toContain('This rate has already stopped.');
  expect(router.back).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it('a planned rate after the last day asks before it is replaced', async () => {
  const t = await open(customer);
  replace.mockResolvedValueOnce({
    success: false,
    errorCode: 'LATER_RATES_EXIST',
    later: [{ effective_from: '2027-01-01', weight_min: 0, weight_max: 100, unit_price: 3.75 }],
  });
  await act(async () => { stopButton(t).props.onPress(); });
  const dialog = t.root.findByType(ConfirmDialog);
  expect(dialog.props.title).toBe('Replace the rate from 01/01/27?');
  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { dialog.props.onConfirm(); });
  expect(replace.mock.calls[1][0]).toMatchObject({ replace_later: true, starts_on: '2026-10-15', bands: [] });
});

// Server rule (migration 76): a stop on a planned rate's start day is refused without p_replace_later,
// and p_seen_rows must list the planned row. The screen asks first, then sends both.
it('a planned rate that starts the day after the last day asks, then sends replace_later with its id in seen_rows', async () => {
  const planned = rate('onion', ORCHARD_B, 0, 100, 4.25, 1.5, 5, '2026-10-15', null);
  const t = await open(customer, [...onionRows(), planned]);
  await act(async () => { chip(t, 'Today, 14/10/26').props.onPress(); });
  await act(async () => { stopButton(t).props.onPress(); });
  expect(replace).not.toHaveBeenCalled();
  const dialog = t.root.findByType(ConfirmDialog);
  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { dialog.props.onConfirm(); });
  const sent = replace.mock.calls[0][0];
  expect(sent).toMatchObject({ replace_later: true, starts_on: '2026-10-15', bands: [] });
  expect(sent.seen_rows).toContain(planned.id);
});

it('Cancel goes back and sends nothing; there is no discard question (a chip is the only input)', async () => {
  const t = await open(customer);
  const cancel = t.root.findAllByType(Button).find(b => b.props.children === 'Cancel')!;
  await act(async () => { cancel.props.onPress(); });
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
  expect(mockGuardCalls).not.toHaveBeenCalled();
});

it('offline: Stop rate is disabled and says to connect', async () => {
  mockOffline = true;
  const t = await open(customer);
  expect(stopButton(t).props.disabled).toBe(true);
  expect(textsOf(t)).toContain('Connect to change rates.');
});

it('a failed load shows the cause and Try again', async () => {
  mockParams = customer;
  jest.mocked(listItemRates).mockRejectedValueOnce(new Error('No connection'));
  await act(async () => { tree = create(<RateStopScreen />); });
  expect(textsOf(tree!)).toContain("Couldn't load the rates of this item. No connection");
  expect(tree!.root.findAllByType(Button).some(b => b.props.children === 'Stop rate')).toBe(false);
});
