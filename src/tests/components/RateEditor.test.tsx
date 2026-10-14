/**
 * The rate editor (app/item-rates/edit.tsx): modes, start days, prefill, rights, states.
 * Fixture F1; today is 14 Oct 2026.
 */
import React from 'react';
import { Platform, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/RadioButton';
import {
  ORCHARD_A, chip, chipState, cuminRows, garlicRows, gingerRows, inputWithLabel, inputsWithLabel, onionRows, pressable, rate, textsOf,
} from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';

let mockRole = 'admin';
let mockParams: Record<string, string> = {};
let mockOffline = false;
import { listItemRates } from '@/services/item-pricing-service';
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
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'DateTimePicker',
  DateTimePickerAndroid: { open: jest.fn() },
}));

const load = jest.mocked(listItemRates);
let tree: ReactTestRenderer | undefined;

async function open(params: Record<string, string>, rows = cuminRows(), role = 'admin') {
  mockRole = role;
  mockParams = params;
  load.mockResolvedValue(rows);
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}
const saveButton = (t: ReactTestRenderer, label: string) => t.root.findAllByType(Button).find(b => b.props.children === label);

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
  // Only the clock is pinned: 14 Oct 2026, 10:00 in India.
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

describe('Change rate', () => {
  const params = { mode: 'change', item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'monthly' };

  it('opens on the loaded rate with no start day chosen and Save disabled', async () => {
    const t = await open(params);
    expect(load).toHaveBeenCalledWith('cumin');
    const texts = textsOf(t);
    expect(texts).toContain('Change rate');
    expect(texts).toContain('Review Cumin Bold');
    expect(texts).toContain('All customers (default rate)');
    expect(texts).toContain('Monthly');
    expect(chipState(t)).toEqual(['Today:off', '1 Nov 2026:off', '1 Apr 2027:off', 'Other date:off']);
    expect(texts).toContain('Choose a start date.');
    expect(saveButton(t, 'Save new rate')?.props.disabled).toBe(true);
    const rent = inputWithLabel(t, 'Rent per bag, per month');
    expect(rent?.props.value).toBe('11.00');
    expect(rent?.props.helperText).toBe('Now ₹11.00');
    expect(inputWithLabel(t, 'Labour per bag')?.props.value).toBe('3.00');
    expect(inputWithLabel(t, 'Tax')?.props.value).toBe('5');
  });

  it('a 1 Apr 2027 chip and a rent of 12 say which lots pay what', async () => {
    const t = await open(params);
    await act(async () => { chip(t, '1 Apr 2027').props.onPress(); });
    await act(async () => { inputWithLabel(t, 'Rent per bag, per month')!.props.onChangeText('12'); });
    const texts = textsOf(t);
    expect(chipState(t)[2]).toBe('1 Apr 2027:on');
    expect(texts).toContain('Lots received from 1 Apr 2027 are charged the new rate. Lots received before keep ₹11.00.');
    expect(texts).toContain('Until 31 Mar 2027: ₹11.00 per bag, per month');
    expect(texts).toContain('From 1 Apr 2027: ₹12.00 per bag, per month');
    expect(saveButton(t, 'Save new rate')?.props.disabled).toBe(false);
  });

  it('offers no 1 Apr chip for a start in 2026 that falls on the first of next month', async () => {
    jest.setSystemTime(new Date('2026-03-20T10:00:00+05:30'));
    const t = await open(params);
    expect(chipState(t)).toEqual(['Today:off', '1 Apr 2026:off', 'Other date:off']);
  });
});

describe('Other date', () => {
  const params = { mode: 'change', item_id: 'cumin', price_type: 'monthly' };
  const originalOS = Platform.OS;
  beforeEach(() => { Platform.OS = 'android'; });
  afterEach(() => { Platform.OS = originalOS; });

  it('admin: the calendar opens at once on 1 Nov 2026, past days allowed, and a past day warns', async () => {
    const t = await open(params);
    await act(async () => { chip(t, 'Other date').props.onPress(); });
    const opts = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
    expect(opts.value.getFullYear()).toBe(2026);
    expect([opts.value.getMonth(), opts.value.getDate()]).toEqual([10, 1]);
    expect(opts.minimumDate!.getFullYear()).toBe(2023);
    await act(async () => { opts.onChange!({ type: 'set' } as never, new Date(2026, 9, 1)); });
    expect(chipState(t)[3]).toBe('Other date:on');
    expect(textsOf(t)).toContain("This date is in the past. Lots received since 1 Oct 2026 that aren't invoiced yet will be charged the new rate.");
  });

  it('staff: the calendar starts today, so 13 Oct cannot be chosen', async () => {
    const t = await open(params, cuminRows(), 'staff');
    await act(async () => { chip(t, 'Other date').props.onPress(); });
    const opts = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
    expect([opts.minimumDate!.getFullYear(), opts.minimumDate!.getMonth(), opts.minimumDate!.getDate()]).toEqual([2026, 9, 14]);
    expect(textsOf(t).join('|')).not.toContain('in the past');
  });

  it('a calendar closed without a day changes nothing', async () => {
    const t = await open(params);
    await act(async () => { chip(t, 'Other date').props.onPress(); });
    const opts = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
    await act(async () => { opts.onChange!({ type: 'dismissed' } as never, undefined); });
    expect(chipState(t)).toEqual(['Today:off', '1 Nov 2026:off', '1 Apr 2027:off', 'Other date:off']);
  });
});

describe('Add default / customer rate', () => {
  it('a customer rate for Orchard A starts from the default rate of that item, Today chosen', async () => {
    const t = await open({ mode: 'addCustomer', item_id: 'onion', customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name, price_type: 'monthly' }, onionRows());
    const texts = textsOf(t);
    expect(texts).toContain('Add customer rate');
    expect(texts).toContain('Review Orchard A');
    expect(texts).toContain('Monthly');
    // A customer rate's first band has a From of its own (F25).
    expect(inputWithLabel(t, 'From')?.props.value).toBe('0');
    expect(inputWithLabel(t, 'Up to')?.props.value).toBe('100');
    expect(inputWithLabel(t, 'Rent per bag, per month')?.props.value).toBe('3.50');
    expect(inputWithLabel(t, 'Labour per bag')?.props.value).toBe('1.50');
    expect(inputWithLabel(t, 'Tax')?.props.value).toBe('5');
    // The Type control (Monthly / One-time) is a chip row now, before the start chips (F24).
    expect(chipState(t)).toEqual(expect.arrayContaining(['Monthly:on', 'Today:on']));
    expect(texts).toContain('Copied from the default rate. Change what is different.');
    expect(texts).toContain('Bags outside these weights pay the default rate.');
    expect(saveButton(t, 'Save customer rate')?.props.disabled).toBe(false);
  });

  it('another item gets its own figures, not the first one (tax 0, rent 4.00)', async () => {
    const potato = [rate('potato', null, 0, 100, 4, 2, 0, '2025-01-01', null, 'monthly', 'Review Potato Seed')];
    const t = await open({ mode: 'addCustomer', item_id: 'potato', customer_id: ORCHARD_A.id, price_type: 'monthly' }, potato);
    expect(inputWithLabel(t, 'Rent per bag, per month')?.props.value).toBe('4.00');
    expect(inputWithLabel(t, 'Tax')?.props.value).toBe('0');
  });

  it('an item with no rate: Monthly, one band 0 to 100, labour and tax empty', async () => {
    const t = await open({ mode: 'add', item_id: 'new-item', item_name: 'Review Onion Red Small' }, []);
    expect(textsOf(t)).toContain('Add default rate');
    expect(inputWithLabel(t, 'Labour per bag')?.props.value).toBe('');
    expect(inputWithLabel(t, 'Tax')?.props.value).toBe('');
    expect(inputWithLabel(t, 'Up to')?.props.value).toBe('100');
    // Type is a choice only here: Monthly | One-time.
    const type = t.root.findAllByType(SegmentedControl);
    expect(type).toHaveLength(1);
    expect(type[0].props.options.map((o: { label: string }) => o.label)).toEqual(['Monthly', 'One-time']);
    expect(type[0].props.value).toBe('monthly');
  });
});

describe('Correct rate', () => {
  const params = { mode: 'correct', item_id: 'cumin', price_type: 'monthly' };

  it('admin: a red warning, the start day as text, Save correction', async () => {
    const t = await open(params);
    const texts = textsOf(t);
    expect(texts).toContain('Correct rate');
    expect(texts).toContain(
      "This changes the rate since 1 Apr 2026. Lots received since then that aren't invoiced yet will be charged the corrected rate. To change the rate from a date, use Change rate."
    );
    expect(texts).toContain('1 Apr 2026 (a correction keeps the start date)');
    expect(chipState(t)).toEqual([]);
    expect(saveButton(t, 'Save correction')).toBeDefined();
    expect(saveButton(t, 'Save correction')?.props.disabled).toBe(false);
  });

  it('staff who arrive here see the manager-only sentence and no fields', async () => {
    const t = await open(params, cuminRows(), 'staff');
    expect(textsOf(t)).toContain('Only an administrator or supervisor can correct a rate that is already in force.');
    expect(t.root.findAllByType(Input)).toHaveLength(0);
    expect(t.root.findAllByType(Button).some(b => String(b.props.children).startsWith('Save'))).toBe(false);
  });
});

describe('Edit new rate', () => {
  it('shows the planned rate and its day as Other date', async () => {
    const rows = [...cuminRows(), rate('cumin', null, 0, 100, 12, 3, 5, '2027-01-01', null, 'monthly', 'Review Cumin Bold')];
    const t = await open({ mode: 'upcoming', item_id: 'cumin', price_type: 'monthly', starts_on: '2027-01-01' }, rows);
    expect(textsOf(t)).toContain('Edit new rate');
    expect(chipState(t)[3]).toBe('Other date:on');
    expect(inputWithLabel(t, 'Rent per bag, per month')?.props.value).toBe('12.00');
    expect(inputWithLabel(t, 'Rent per bag, per month')?.props.helperText).toBe('Now ₹11.00');
  });
});

describe('Weight bands in the editor', () => {
  it('Garlic Desi shows two bands with "Now" figures and the second starts at 41 kg', async () => {
    const t = await open({ mode: 'change', item_id: 'garlic', price_type: 'monthly' }, garlicRows());
    expect(inputsWithLabel(t, 'Up to').map(n => n.props.value)).toEqual(['40', '100']);
    expect(inputsWithLabel(t, 'Rent per bag, per month').map(n => n.props.helperText)).toEqual(['Now ₹6.00', 'Now ₹9.50']);
    expect(textsOf(t)).toContain('From 41 kg');
  });
});

describe('Controls', () => {
  it('every text field is a ui/Input: the editor has no raw TextInput of its own', async () => {
    const t = await open({ mode: 'change', item_id: 'garlic', price_type: 'monthly' }, garlicRows());
    const raw = t.root.findAllByType(TextInput).filter(node => {
      let p = node.parent;
      while (p) { if (p.type === Input) return false; p = p.parent; }
      return true;
    });
    expect(raw).toHaveLength(0);
    const labels = t.root.findAllByType(Input).map(n => n.props.label);
    expect(labels).toEqual(expect.arrayContaining(['Up to', 'Rent per bag, per month', 'Labour per bag', 'Tax']));
    expect(t.root.findAllByType(Input).every(n => n.props.label && typeof n.props.label === 'string')).toBe(true);
  });
});

describe('States', () => {
  it('a failed load shows the cause and Try again, which loads again', async () => {
    mockParams = { mode: 'change', item_id: 'cumin' };
    load.mockRejectedValueOnce(new Error('No connection')).mockResolvedValueOnce(cuminRows());
    await act(async () => { tree = create(<RateEditorScreen />); });
    const texts = textsOf(tree!);
    expect(texts).toContain("Couldn't load the rates of this item. No connection");
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    await act(async () => { pressable(tree!, 'Try again').props.onPress(); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(inputWithLabel(tree!, 'Rent per bag, per month')?.props.value).toBe('11.00');
  });

  it('offline: Save is disabled and the helper says to connect', async () => {
    mockOffline = true;
    const t = await open({ mode: 'add', item_id: 'ginger', price_type: 'monthly' }, gingerRows());
    expect(saveButton(t, 'Save new rate')?.props.disabled).toBe(true);
    expect(textsOf(t)).toContain('Connect to change rates.');
  });

  it('an add customer rate with no customer cannot open', async () => {
    const t = await open({ mode: 'addCustomer', item_id: 'onion' }, onionRows());
    expect(textsOf(t)).toContain('Choose a customer first, from the item page.');
    expect(t.root.findAllByType(Input)).toHaveLength(0);
  });
});

// CR-19
describe('Add weight band', () => {
  it('is disabled with a reason when the last band cannot be split, and works otherwise', async () => {
    const t = await open({ mode: 'change', item_id: 'garlic', price_type: 'monthly' }, garlicRows());
    const add = () => t.root.find(n => n.props.testID === 'add-band' && typeof n.props.onPress === 'function');
    expect(add().props.disabled).toBe(false);
    await act(async () => { inputsWithLabel(t, 'Up to')[1].props.onChangeText('41'); });
    await act(async () => { inputsWithLabel(t, 'Up to')[1].props.onChangeText(''); });
    expect(add().props.disabled).toBe(true);
    expect(textsOf(t)).toContain("This band can't be split. Enter an \"Up to\" weight at least 1 kg above where it starts.");
  });
});
