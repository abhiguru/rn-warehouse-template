/**
 * The rate sheet of the GRN review step: what it starts with, its checks, and the confirmation before a
 * change of a rate in force (three buttons: Change the rate / Only this GRN / Back).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { Input } from '@/components/ui/Input';
import { GrnRateSheet } from '../GrnRateSheet';
import { priceRows, type RateContext } from '../grnRateModel';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('@gorhom/bottom-sheet', () => {
  const R = require('react');
  const modal = R.forwardRef((props: { children?: unknown }, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return R.createElement('BottomSheetModal', null, props.children);
  });
  return {
    __esModule: true,
    BottomSheetModal: modal,
    BottomSheetScrollView: 'BottomSheetScrollView',
    BottomSheetBackdrop: 'BottomSheetBackdrop',
  };
});

const DAY = '2026-10-12';
let seq = 0;
const stored = (min: number, max: number, rent: number, from: string, customer: string | null = null, to: string | null = null): ItemStoragePrice => ({
  id: `r${(seq += 1)}`, item_id: 'gur', item_name: 'Fictional Gur', customer_id: customer, customer_name: customer ? 'Fictional Traders' : null, price_type: 'monthly',
  unit_price: rent, weight_min: min, weight_max: max, labour_rate: 1.5, tax_percent: 5, effective_from: from, effective_to: to, created_at: '', created_by: '',
});
const ctx: RateContext = { customerId: 'cust-a', day: DAY, priceType: 'monthly' as PriceType };

let tree: ReactTestRenderer | undefined;
const onSave = jest.fn();
const onClose = jest.fn();
const input = (label: string) => tree!.root.findAllByType(Input).find(n => n.props.label === label);
const type = async (label: string, value: string) => { await act(async () => { input(label)!.props.onChangeText(value); }); };
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const save = async () => { await act(async () => { tree!.root.find(n => n.props.testID === 'rate-save' && typeof n.props.onPress === 'function').props.onPress(); }); };
const confirm = () => tree!.root.find(n => n.props.testID === 'rate-confirm' && 'onMiddle' in n.props);
const chip = (label: string) => tree!.root.find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

function open(rates: ItemStoragePrice[], weight: number, c = ctx) {
  const row = priceRows([{ key: `gur|${weight}`, item_id: 'gur', item_name: 'Fictional Gur', weight }], { rates, ctx: c, grnRates: [], changes: [] })[0];
  act(() => {
    tree = create(
      <GrnRateSheet visible onClose={onClose} row={row} input={{ rates, ctx: c, standard: null }} customerName="Fictional Traders" priceTypeText="Monthly" onSave={onSave} />,
    );
  });
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => tree?.unmount()); tree = undefined; });

describe('Add rate', () => {
  it('starts with the band and figures of the rate that starts later, ending the day before it, scope Everyone', () => {
    open([stored(11, 20, 4, '2026-11-01')], 12);
    expect(texts()).toContain('Add rate');
    expect(texts()).toContain('Fictional Gur, 12 kg');
    expect(texts()).toContain('12 Oct 2026 · Fictional Traders · Monthly');
    expect(input('From')!.props.value).toBe('11');
    expect(input('Up to')!.props.value).toBe('20');
    expect(input('Rent per bag, per month')!.props.value).toBe('4');
    expect(chip('Everyone (this weight band)').props.accessibilityState.selected).toBe(true);
    expect(texts()).toContain('12 Oct 2026, the GRN date');
  });

  it('refuses blank figures, a band that does not hold the weight and shows nothing saved', async () => {
    open([], 12);
    await type('From', '20'); await type('Up to', '30');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(input('Rent per bag, per month')!.props.error).toBe('Enter a rent of 0 or more.');
    expect(input('Labour per bag')!.props.error).toBe('Enter a labour rate of 0 or more.');
    expect(input('Tax')!.props.error).toBe('Enter the tax rate for this item.');
    await type('Rent per bag, per month', '3'); await type('Labour per bag', '1'); await type('Tax', '5');
    await save();
    expect(input('Up to')!.props.error).toBe('The band must include 12 kg.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a tax above 100 and a rent with three decimals', async () => {
    open([], 12);
    await type('Rent per bag, per month', '3.125'); await type('Labour per bag', '1'); await type('Tax', '101');
    await save();
    expect(input('Rent per bag, per month')!.props.error).toBe('Enter a rent of 0 or more.');
    expect(input('Tax')!.props.error).toBe('Enter a tax rate from 0 to 100.');
  });

  it('saves the entry once everything is right; a rate in no one\'s way needs no question', async () => {
    open([], 12);
    await type('Rent per bag, per month', '3'); await type('Labour per bag', '1.5'); await type('Tax', '5');
    await save();
    expect(onSave).toHaveBeenCalledWith({ scope: 'everyone', weight_min: 12, weight_max: 12, unit_price: 3, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('a one-time GRN has no labour field and sends labour 0', async () => {
    open([], 12, { ...ctx, priceType: 'one_time' });
    expect(input('Labour per bag')).toBeUndefined();
    expect(input('Rent per bag, once')).toBeDefined();
    await type('Rent per bag, once', '3'); await type('Tax', '5');
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ labour_rate: 0 }));
  });
});

describe('Change', () => {
  const rates = [stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.8, '2026-11-15')];

  it('starts with the current figures, Only this GRN, the band fixed and the GRN date shown, not editable', () => {
    open(rates, 12, { ...ctx, customerId: null });
    expect(texts()).toContain('Change rate');
    expect(chip('Only this GRN').props.accessibilityState.selected).toBe(true);
    expect(input('From')).toBeUndefined();
    expect(texts()).toContain('0 kg');
    expect(texts()).toContain('50 kg');
    expect(input('Rent per bag, per month')!.props.value).toBe('4');
  });

  it('Only this GRN saves at once, without a question and without an end', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await type('Rent per bag, per month', '3.25');
    await save();
    expect(confirm().props.visible).toBe(false);
    expect(onSave).toHaveBeenCalledWith({ scope: 'grn', weight_min: 0, weight_max: 50, unit_price: 3.25, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('Everyone starts its last day the day before the planned rate; the question lists the facts and has three buttons', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone (this weight band)').props.onPress(); });
    await type('Rent per bag, per month', '3.5');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    const dialog = confirm();
    expect(dialog.props.visible).toBe(true);
    expect(dialog.props.title).toBe('Change the rate?');
    expect(dialog.props.message.split('\n')).toEqual([
      'Fictional Gur, 0–50 kg',
      'For: every customer (this weight band)',
      'Rent: ₹4.00 → ₹3.50',
      'Labour: ₹1.50 → ₹1.50',
      'Tax: 5% → 5%',
      'From 12 Oct 2026 to 14 Nov 2026',
      'The ₹4.00 rate ends on 11 Oct 2026.',
      'The ₹4.00 rate applies again from 15 Nov 2026.',
      'GRNs of every customer from 12 Oct 2026 that are not invoiced yet will use it. Saved invoices keep their figures.',
    ]);
    expect([dialog.props.confirmText, dialog.props.middleText, dialog.props.cancelText]).toEqual(['Change the rate', 'Only this GRN', 'Back']);
  });

  it('Change the rate saves the scope chosen; Only this GRN turns it into a rate for this GRN only; Back saves nothing', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone (this weight band)').props.onPress(); });
    await type('Rent per bag, per month', '3.5');
    await save();
    await act(async () => { confirm().props.onCancel(); });
    expect(onSave).not.toHaveBeenCalled();
    expect(confirm().props.visible).toBe(false);

    await save();
    await act(async () => { confirm().props.onConfirm(); });
    expect(onSave).toHaveBeenLastCalledWith({ scope: 'everyone', weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5, to: '2026-11-14' });

    await save();
    await act(async () => { confirm().props.onMiddle(); });
    expect(onSave).toHaveBeenLastCalledWith({ scope: 'grn', weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('This customer only over the rate for everyone says it stays for other customers', async () => {
    open([stored(0, 50, 4, '2026-01-01')], 12);
    await act(async () => { chip('This customer only').props.onPress(); });
    await type('Rent per bag, per month', '3.5');
    await save();
    expect(confirm().props.message).toContain('Fictional Traders pays the new rate. The ₹4.00 rate stays for other customers.');
    expect(confirm().props.message).toContain('For: Fictional Traders only');
    expect(confirm().props.message).toContain('From 12 Oct 2026, no end date');
  });

  it('a last day before the planned rate is the only one accepted: clearing the end is refused', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone (this weight band)').props.onPress(); });
    await act(async () => { chip('No end date').props.onPress(); });
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(texts()).toContain('A rate for this band starts on 15 Nov 2026. Choose a last day before it.');
  });
});
