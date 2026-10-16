/**
 * The invoice pencil lands in the editor, the only way into app/item-rates/edit.tsx (spec section 10): the mode is
 * resolved from the rows, the strip says the change is for every invoice from now on, Back with Discard saves nothing;
 * the states (loading, failed, offline, not an invoice link) and the start day of a customer rate.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { Platform } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  ORCHARD_A, ORCHARD_B, chip, chipState, cuminRows, inputWithLabel, inputsWithLabel, onionRows, pressable, textsOf,
} from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';

let mockRole = 'admin';
let mockParams: Record<string, string> = {};
let mockOffline = false;
let mockGuard: { hasChanges: boolean; title?: string } = { hasChanges: false };
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
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
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
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
const line = {
  mode: 'invoice',
  item_id: 'onion',
  item_name: 'Review Onion Red',
  customer_id: ORCHARD_B.id,
  customer_name: ORCHARD_B.name,
  price_type: 'monthly',
  unit_price: '3.2',
  labour_rate: '1.75',
  tax_percent: '5',
  weight_min: '0',
  weight_max: '60',
  grn_date: '2026-05-02',
};
async function open(params: Record<string, string>, role = 'admin', rows = onionRows()) {
  mockRole = role;
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(rows);
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}

const NOTE = (customer: string) =>
  `This changes ${customer}'s rate for every invoice made from now on for goods received from 2 May 2026, not only this invoice. To change only this invoice, go back and edit the line.`;

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
  jest.useRealTimers();
});

it('admin, Orchard B has an own rate: Correct rate, the note names the customer and 2 May 2026, the line figures are in the fields', async () => {
  const t = await open(line);
  const texts = textsOf(t);
  expect(texts).toContain('Correct rate');
  expect(texts).toContain(NOTE('Review Orchard B'));
  expect(texts).toContain('1 Jan 2026 (a correction keeps the start date)');
  expect(inputWithLabel(t, 'Rent per bag, per month')?.props.value).toBe('3.20');
  expect(inputWithLabel(t, 'Labour per bag')?.props.value).toBe('1.75');
  expect(inputsWithLabel(t, 'Up to').map(n => n.props.value)).toEqual(['100']);
});

it('admin, Orchard A has none: Add customer rate with the default bands (0 to 100, not 0 to the line weight 60) from the received day', async () => {
  const t = await open({ ...line, customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name });
  const texts = textsOf(t);
  expect(texts).toContain('Add customer rate');
  expect(texts).toContain(NOTE('Review Orchard A'));
  expect(inputsWithLabel(t, 'Up to').map(n => n.props.value)).toEqual(['100']);
  expect(inputWithLabel(t, 'Rent per bag, per month')?.props.value).toBe('3.20');
  expect(chipState(t)[0]).toBe('Received 2 May 2026:on');
});

it('Correct rate: a red warning that names the day, the start day as text, Save correction, no chips', async () => {
  const t = await open(line);
  const texts = textsOf(t);
  expect(texts).toContain(
    "This changes the rate since 1 Jan 2026. Lots received since then that aren't invoiced yet will be charged the corrected rate."
  );
  expect(texts.join(' ')).not.toContain('Change rate');
  expect(chipState(t)).toEqual([]);
  const save = t.root.findAllByType(Button).find(b => b.props.children === 'Save correction');
  expect(save?.props.disabled).toBe(false);
});

it('Add customer rate: the received day is chosen, with Today, the next chips and Other date after it; Save customer rate is on', async () => {
  const t = await open({ ...line, customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name });
  expect(chipState(t)).toEqual(['Received 2 May 2026:on', 'Today:off', '1 Nov 2026:off', '1 Apr 2027:off', 'Other date:off']);
  expect(textsOf(t)).toContain('Copied from the default rate. Change what is different.');
  expect(textsOf(t)).toContain('Bags outside these weights pay the default rate.');
  const save = t.root.findAllByType(Button).find(b => b.props.children === 'Save customer rate');
  expect(save?.props.disabled).toBe(false);
  // The first band of a customer rate has a From of its own.
  expect(inputWithLabel(t, 'From')?.props.value).toBe('0');
});

it('says so when the group holds lots received on different days', async () => {
  const t = await open({ ...line, grn_dates_differ: '1' });
  expect(textsOf(t)).toContain('This group holds lots received on different days. The latest, 2 May 2026, is used.');
});

describe('Other date on a new customer rate', () => {
  const originalOS = Platform.OS;
  beforeEach(() => { Platform.OS = 'android'; });
  afterEach(() => { Platform.OS = originalOS; });
  const add = { ...line, customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name };

  it('opens the calendar at once on 1 Nov 2026, past days allowed, and a past day warns', async () => {
    const t = await open(add);
    await act(async () => { chip(t, 'Other date').props.onPress(); });
    const opts = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
    expect([opts.value.getFullYear(), opts.value.getMonth(), opts.value.getDate()]).toEqual([2026, 10, 1]);
    expect(opts.minimumDate!.getFullYear()).toBe(2023);
    await act(async () => { opts.onChange!({ type: 'set' } as never, new Date(2026, 9, 1)); });
    expect(chipState(t)[4]).toBe('Other date:on');
    expect(textsOf(t)).toContain("This date is in the past. Lots received since 1 Oct 2026 that aren't invoiced yet will be charged the new rate.");
  });

  it('a calendar closed without a day changes nothing', async () => {
    const t = await open(add);
    await act(async () => { chip(t, 'Other date').props.onPress(); });
    const opts = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
    await act(async () => { opts.onChange!({ type: 'dismissed' } as never, undefined); });
    expect(chipState(t)).toEqual(['Received 2 May 2026:on', 'Today:off', '1 Nov 2026:off', '1 Apr 2027:off', 'Other date:off']);
  });

  it('a 1 Apr 2027 start and a rent of 3.60 say which lots pay what', async () => {
    const t = await open(add);
    await act(async () => { chip(t, '1 Apr 2027').props.onPress(); });
    await act(async () => { inputsWithLabel(t, 'Rent per bag, per month')[0].props.onChangeText('3.60'); });
    expect(chipState(t)[3]).toBe('1 Apr 2027:on');
    expect(textsOf(t)).toContain('Lots received from 1 Apr 2027 are charged this rate.');
  });
});

describe('states', () => {
  it('a failed load shows the cause and Try again, which loads again', async () => {
    mockParams = line;
    jest.mocked(listItemRates).mockRejectedValueOnce(new Error('No connection')).mockResolvedValueOnce(onionRows());
    await act(async () => { tree = create(<RateEditorScreen />); });
    expect(textsOf(tree!)).toContain("Couldn't load the rates of this item. No connection");
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    await act(async () => { pressable(tree!, 'Try again').props.onPress(); });
    expect(listItemRates).toHaveBeenCalledTimes(2);
    expect(inputWithLabel(tree!, 'Rent per bag, per month')?.props.value).toBe('3.20');
  });

  it('offline: Save is disabled and the helper says to connect', async () => {
    mockOffline = true;
    const t = await open({ ...line, customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name });
    expect(t.root.findAllByType(Button).find(b => b.props.children === 'Save customer rate')?.props.disabled).toBe(true);
    expect(textsOf(t)).toContain('Connect to change rates.');
  });

  it('an invoice line without a customer cannot open: it would edit the default rate of everyone', async () => {
    const t = await open({ ...line, customer_id: '', customer_name: '' });
    expect(textsOf(t)).toContain("Couldn't load the rates of this item. This rate has changed or no longer exists.");
    expect(listItemRates).not.toHaveBeenCalled();
    expect(t.root.findAllByType(Input)).toHaveLength(0);
    expect(t.root.findAllByType(Button).some(b => String(b.props.children).startsWith('Save'))).toBe(false);
  });

  it.each(['change', 'correct', 'upcoming', 'add', 'addCustomer'])('a link of mode %s is not an invoice line: it cannot open and loads nothing', async mode => {
    const t = await open({ ...line, mode, customer_id: ORCHARD_B.id, customer_name: ORCHARD_B.name }, 'admin', cuminRows());
    expect(textsOf(t)).toContain("Couldn't load the rates of this item. This rate has changed or no longer exists.");
    expect(listItemRates).not.toHaveBeenCalled();
    expect(t.root.findAllByType(Input)).toHaveLength(0);
    expect(t.root.findAllByType(Button).some(b => String(b.props.children).startsWith('Save'))).toBe(false);
  });
});

it('Back with nothing typed saves nothing; typing then makes the guard ask', async () => {
  const t = await open({ ...line, customer_id: ORCHARD_A.id });
  expect(mockGuard.hasChanges).toBe(false);
  expect(replaceItemRates).not.toHaveBeenCalled();
  await act(async () => { inputsWithLabel(t, 'Rent per bag, per month')[0].props.onChangeText('3.30'); });
  expect(mockGuard.hasChanges).toBe(true);
  expect(mockGuard.title).toBe('Discard this rate?');
  expect(replaceItemRates).not.toHaveBeenCalled();
});

it('has no "Copy weight bands from another item" in invoice mode (the rate belongs to this customer and line)', async () => {
  const t = await open(line);
  expect(t.root.findAll(n => n.props.testID === 'copy-tiers')).toHaveLength(0);
  const own = await open({ ...line, customer_id: ORCHARD_A.id });
  expect(own.root.findAll(n => n.props.testID === 'copy-tiers')).toHaveLength(0);
});
