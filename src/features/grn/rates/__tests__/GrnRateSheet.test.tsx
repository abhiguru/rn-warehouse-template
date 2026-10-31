/**
 * The rate sheet of the GRN review step (a full-screen Modal): what it starts with, its layout and checks, and the
 * confirmation before a change of a rate in force (its parts, and three buttons: Change the rate / Only this GRN / Back).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Modal, ScrollView, StyleSheet, Text } from 'react-native';
import { Input } from '@/components/ui/Input';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { showAlert } from '@/utils/alert';
import { GrnRateSheet } from '../GrnRateSheet';
import { contextKey, priceRows, type RateContext } from '../grnRateModel';
import type { GrnRate, RateChange } from '../types';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// Jest's window has font scale 2 (large text); the compact-layout cases set 1 or 1.3.
let mockFontScale = 2;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 393, height: 851, scale: 2.75, fontScale: mockFontScale }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

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
// A field by its label; a weight field in error carries its limit after it ("From (kg) · at most 12 kg").
const input = (label: string) => tree!.root.findAllByType(Input).find(n => n.props.label === label || String(n.props.label).startsWith(`${label} · `));
const type = async (label: string, value: string) => { await act(async () => { input(label)!.props.onChangeText(value); }); };
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const save = async () => { await act(async () => { tree!.root.find(n => n.props.testID === 'rate-save' && typeof n.props.onPress === 'function').props.onPress(); }); };
const confirm = () => tree!.root.find(n => typeof n.props.onOnlyGrn === 'function');
const confirmOpen = () => confirm().props.summary !== null;
/** The texts of one part of the open confirmation, in order. */
const part = (id: string) => tree!.root.find(n => n.props.testID === id && typeof n.type !== 'string').findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
/** A figure row of the confirmation as [label, old, new] and whether it reads as changed. */
const figureRow = (key: string) => {
  const row = tree!.root.find(n => n.props.testID === `rate-confirm-${key}` && typeof n.props.accessibilityLabel === 'string');
  return { cells: row.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')), a11y: row.props.accessibilityLabel as string };
};
const tap = async (id: string) => { await act(async () => { tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); }); };
const modalNode = () => tree!.root.findAllByType(Modal)[0];
const hostText = (id: string) => [tree!.root.find(n => n.props.testID === id && typeof n.type === 'string').props.children].flat(Infinity).join('');
const chip = (label: string) => tree!.root.find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

function open(rates: ItemStoragePrice[], weight: number, c = ctx, grnNumber?: string, extra: { grnRates?: GrnRate[]; changes?: RateChange[] } = {}) {
  const row = priceRows([{ key: `gur|${weight}`, item_id: 'gur', item_name: 'Fictional Gur', weight }], { rates, ctx: c, grnRates: extra.grnRates ?? [], changes: extra.changes ?? [] })[0];
  act(() => {
    tree = create(
      <GrnRateSheet visible onClose={onClose} row={row} input={{ rates, ctx: c, standard: null }} customerName="Fictional Traders" priceTypeText="Monthly" grnNumber={grnNumber} onSave={onSave} />,
    );
  });
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => tree?.unmount()); tree = undefined; mockFontScale = 2; });

describe('Add rate', () => {
  it('starts with the band and figures of the rate that starts later, ending the day before it, scope Everyone', () => {
    mockFontScale = 1;
    open([stored(11, 20, 4, '2026-11-01')], 12);
    expect(hostText('rate-sheet-kicker')).toBe('Add rate · 12 kg each · Monthly');
    expect(hostText('rate-sheet-item')).toBe('Fictional Gur');
    expect(input('From (kg)')!.props.value).toBe('11');
    expect(input('Up to (kg)')!.props.value).toBe('20');
    // Rent and labour carry two decimals, tax is plain.
    expect(input('Rent ₹/month')!.props.value).toBe('4.00');
    expect(input('Labour ₹')!.props.value).toBe('1.50');
    expect(input('Tax')!.props.value).toBe('5');
    expect(chip('Everyone').props.accessibilityState.selected).toBe(true);
    // A rate starts later in the band, so the last day is set: the chips show "Until a date" and a date field is open.
    expect(hostText('rate-from-date')).toBe('From 12 Oct 2026');
    expect(chip('Until a date').props.accessibilityState.selected).toBe(true);
    expect(chip('No end date').props.accessibilityState.selected).toBe(false);
    expect(tree!.root.findAllByType(DatePickerInput)).toHaveLength(1);
    expect(tree!.root.findByType(DatePickerInput).props.value).toEqual(new Date(2026, 9, 31));
    mockFontScale = 2;
  });

  it('refuses a labour above 999999 and takes 999999', async () => {
    open([], 12);
    await type('Rent ₹/month', '3'); await type('Tax', '5');
    await type('Labour ₹', '1000000');
    await save();
    expect(input('Labour ₹')!.props.error).toBe('Enter a labour rate from 0 to 999999.');
    await type('Labour ₹', '999999');
    await save();
    expect(input('Labour ₹')!.props.error).toBeUndefined();
  });

  it('refuses blank figures, a band that does not hold the weight and shows nothing saved', async () => {
    open([], 12);
    await type('From (kg)', '20'); await type('Up to (kg)', '30');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(input('Rent ₹/month')!.props.error).toBe('Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.');
    expect(input('Labour ₹')!.props.error).toBe('Enter a labour rate from 0 to 999999.');
    expect(input('Tax')!.props.error).toBe('Enter the tax rate for this item.');
    await type('Rent ₹/month', '3'); await type('Labour ₹', '1'); await type('Tax', '5');
    await save();
    // A wrong band is a red field, with the reason for a screen reader; no message under it.
    // From 20 leaves out 12 kg: From is the wrong field, red, its label naming the limit; no message under it.
    expect(input('From (kg)')!.props.invalid).toBe(true);
    expect(input('From (kg)')!.props.label).toBe('From (kg) · at most 12 kg');
    expect(input('From (kg)')!.props.error).toBeUndefined();
    expect(input('From (kg)')!.props.accessibilityHint).toBe('at most 12 kg');
    expect(input('Up to (kg)')!.props.invalid).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the rent message while a stored rent above the limit stays in the box, and drops it once it is lowered', async () => {
    open([stored(0, 50, 12000, '2026-01-01')], 12);
    const ERR = 'Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.';
    expect(input('Rent ₹/month')!.props.error).toBe(ERR);
    // Typing one more digit than the stored rent has is refused, and the message stays; so does an accepted key that is still too high.
    await type('Rent ₹/month', '12000');
    expect(input('Rent ₹/month')!.props.error).toBe(ERR);
    await type('Rent ₹/month', '9999');
    expect(input('Rent ₹/month')!.props.error).toBeUndefined();
  });

  it('refuses a tax above 100 and a rent with three decimals', async () => {
    open([], 12);
    await type('Rent ₹/month', '3.125'); await type('Labour ₹', '1'); await type('Tax', '101');
    await save();
    expect(input('Rent ₹/month')!.props.error).toBe('Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.');
    expect(input('Tax')!.props.error).toBe('Enter a tax rate from 0 to 100.');
  });

  it('saves the entry once everything is right; a rate in no one\'s way needs no question', async () => {
    open([], 12);
    await type('Rent ₹/month', '3'); await type('Labour ₹', '1.5'); await type('Tax', '5');
    await save();
    expect(onSave).toHaveBeenCalledWith({ scope: 'everyone', weight_min: 12, weight_max: 12, unit_price: 3, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('a one-time GRN has no labour field and sends labour 0', async () => {
    open([], 12, { ...ctx, priceType: 'one_time' });
    expect(input('Labour ₹')).toBeUndefined();
    expect(input('Rent ₹')).toBeDefined();
    await type('Rent ₹', '3'); await type('Tax', '5');
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ labour_rate: 0 }));
  });
});

describe('Change', () => {
  const rates = [stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.8, '2026-11-15')];

  it('starts with the current figures, Only this GRN, the band of the rate and the GRN date', () => {
    open(rates, 12, { ...ctx, customerId: null });
    expect(hostText('rate-sheet-kicker')).toBe('Change rate · 12 kg each · Monthly');
    expect(chip('This GRN').props.accessibilityState.selected).toBe(true);
    // The band can be changed too, starting from the rate's own.
    expect(input('From (kg)')!.props.value).toBe('0');
    expect(input('Up to (kg)')!.props.value).toBe('50');
    // This GRN has no end: the dates line says so and there is no end choice.
    expect(hostText('rate-from-date')).toBe('From 12 Oct 2026 · No end date');
    expect(tree!.root.findAll(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === 'Until a date')).toHaveLength(0);
    expect(input('Rent ₹/month')!.props.value).toBe('4.00');
    expect(input('Labour ₹')!.props.value).toBe('1.50');
    expect(input('Tax')!.props.value).toBe('5');
  });

  it('Only this GRN saves at once, without a question and without an end', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await type('Rent ₹/month', '3.25');
    await save();
    expect(confirmOpen()).toBe(false);
    expect(onSave).toHaveBeenCalledWith({ scope: 'grn', weight_min: 0, weight_max: 50, unit_price: 3.25, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('Everyone starts its last day the day before the planned rate; the question sorts the facts into parts and has three buttons', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone').props.onPress(); });
    await type('Rent ₹/month', '3.5');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(confirmOpen()).toBe(true);
    expect(texts()).toContain('Change the rate?');
    expect(texts()).toContain('Fictional Gur, 0–50 kg');
    expect(part('rate-confirm-audience')).toEqual(['For: every customer (this weight band)']);
    // The figures as Old / New: only the rent changes, so only the rent reads as a change.
    expect(texts()).toEqual(expect.arrayContaining(['Old', 'New']));
    expect(figureRow('rent')).toEqual({ cells: ['Rent', '₹4.00', '₹3.50'], a11y: 'Rent: old ₹4.00, new ₹3.50' });
    expect(figureRow('labour')).toEqual({ cells: ['Labour', '₹1.50', '₹1.50'], a11y: 'Labour: ₹1.50, no change' });
    expect(figureRow('tax')).toEqual({ cells: ['Tax', '5%', '5%'], a11y: 'Tax: 5%, no change' });
    expect(part('rate-confirm-period')).toEqual([
      'From 12 Oct 2026 to 14 Nov 2026',
      'The ₹4.00 rate ends on 11 Oct 2026.',
      'The ₹4.00 rate applies again from 15 Nov 2026.',
    ]);
    expect(part('rate-confirm-reach')).toEqual(['GRNs of every customer from 12 Oct 2026 that are not invoiced yet will use it. Saved invoices keep their figures.']);
    const buttons = ['rate-confirm-change', 'rate-confirm-only-grn', 'rate-confirm-back'].map(id => tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function'));
    expect(buttons.map(b => [b.props.type, b.props.children])).toEqual([['primary', 'Change the rate'], ['secondary', 'Only this GRN'], ['secondary', 'Back']]);
  });

  it('a one-time GRN has no labour row in the question', async () => {
    const oneTime = [{ ...stored(0, 50, 4, '2026-01-01'), price_type: 'one_time' as PriceType, labour_rate: 0 }];
    open(oneTime, 12, { ...ctx, customerId: null, priceType: 'one_time' });
    await act(async () => { chip('Everyone').props.onPress(); });
    await type('Rent ₹', '5');
    await save();
    expect(confirmOpen()).toBe(true);
    expect(tree!.root.findAll(n => n.props.testID === 'rate-confirm-labour')).toHaveLength(0);
    expect(figureRow('rent').cells).toEqual(['Rent', '₹4.00', '₹5.00']);
  });

  it('Change the rate saves the scope chosen; Only this GRN turns it into a rate for this GRN only; Back saves nothing', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone').props.onPress(); });
    await type('Rent ₹/month', '3.5');
    await save();
    await tap('rate-confirm-back');
    expect(onSave).not.toHaveBeenCalled();
    expect(confirmOpen()).toBe(false);

    await save();
    await tap('rate-confirm-change');
    expect(onSave).toHaveBeenLastCalledWith({ scope: 'everyone', weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5, to: '2026-11-14' });
    expect(confirmOpen()).toBe(false);

    await save();
    await tap('rate-confirm-only-grn');
    expect(onSave).toHaveBeenLastCalledWith({ scope: 'grn', weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('This customer only over the rate for everyone says it stays for other customers', async () => {
    open([stored(0, 50, 4, '2026-01-01')], 12);
    await act(async () => { chip('Customer').props.onPress(); });
    await type('Rent ₹/month', '3.5');
    await save();
    // Who pays it, with what it means for the others, sits together; the period has no note about the old rate.
    expect(part('rate-confirm-audience')).toEqual(['For: Fictional Traders only', 'Fictional Traders pays the new rate. The ₹4.00 rate stays for other customers.']);
    expect(part('rate-confirm-period')).toEqual(['From 12 Oct 2026, no end date']);
    expect(part('rate-confirm-reach')).toEqual(['GRNs of Fictional Traders from 12 Oct 2026 that are not invoiced yet will use it. Saved invoices keep their figures.']);
  });

  it('a last day before the planned rate is the only one accepted: clearing the end is refused', async () => {
    open(rates, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone').props.onPress(); });
    await act(async () => { chip('No end date').props.onPress(); });
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(texts()).toContain('A rate for this band starts on 15 Nov 2026. Choose a last day before it.');
  });
});

describe('round 3', () => {
  it('D1: Everyone over a customer who has an own rate says the customer keeps it', async () => {
    open([stored(0, 50, 3, '2026-01-01'), stored(0, 50, 3.5, '2026-01-01', 'cust-a')], 12);
    await act(async () => { chip('Everyone').props.onPress(); });
    await type('Rent ₹/month', '4');
    await save();
    expect(figureRow('rent').cells).toEqual(['Rent', '₹3.00', '₹4.00']);
    expect(part('rate-confirm-audience')).toEqual(['For: every customer (this weight band)', 'Fictional Traders keeps their own rate of ₹3.50.']);
  });

  it('D5: a planned band of the scope over the weights is refused with its start day; the preloaded last day is the day before', async () => {
    const rates = [stored(0, 50, 3, '2026-01-01', null, '2026-10-31'), stored(0, 20, 3, '2026-11-01'), stored(21, 50, 4, '2026-11-01')];
    open(rates, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone').props.onPress(); });
    await act(async () => { chip('No end date').props.onPress(); });
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(texts()).toContain('A rate for this band starts on 1 Nov 2026. Choose a last day before it.');
    await act(async () => { chip('Until a date').props.onPress(); });
    await save();
    expect(part('rate-confirm-period')[0]).toBe('From 12 Oct 2026 to 31 Oct 2026');
  });

});

describe('header, close and layout (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  const at = (id: string) => tree!.root.find(n => n.props.testID === id && typeof n.type === 'string');
  const press = async (id: string) => { await act(async () => { tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); }); };
  const disabled = (id: string) => Boolean(tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.disabled);

  it('is a full-screen Modal; the header names what is done, the item, the weight and the price type; ✕ is a Close button', () => {
    open([], 12);
    const modal = modalNode();
    expect(modal.props.visible).toBe(true);
    expect(modal.props.presentationStyle).toBe('fullScreen');
    expect(at('rate-close').props.accessibilityLabel).toBe('Close');
    expect(at('rate-close').props.accessibilityRole).toBe('button');
    expect(tree!.root.find(n => typeof n.type === 'string' && n.props.accessibilityRole === 'header').props.accessibilityLabel).toBe('Add rate, Fictional Gur, 12 kg each, Monthly');
    expect(hostText('rate-sheet-kicker')).toBe('Add rate · 12 kg each · Monthly');
    expect(hostText('rate-sheet-item')).toBe('Fictional Gur');
    act(() => tree!.unmount());
    open(rates, 12, { ...ctx, priceType: 'monthly' });
    expect(tree!.root.find(n => typeof n.type === 'string' && n.props.accessibilityRole === 'header').props.accessibilityLabel).toBe('Change rate, Fictional Gur, 12 kg each, Monthly');
    expect(hostText('rate-sheet-kicker')).toBe('Change rate · 12 kg each · Monthly');
  });

  it('is filled top to bottom: For, the dates, the weight band, the in-force table, then the figures', () => {
    open(rates, 12);
    const order = ['rate-for-group', 'rate-dates', 'rate-band', 'rate-ref-toggle', 'rate-figures'];
    const all = tree!.root.findAll(n => typeof n.type === 'string' && order.includes(n.props.testID)).map(n => n.props.testID as string);
    expect(all.filter((id, i) => all.indexOf(id) === i)).toEqual(order);
  });

  it('at normal text the figures sit in one row and For is a segmented choice; at 1.3 they stack and For wraps as chips', () => {
    const figures = () => StyleSheet.flatten(at('rate-figures').props.style);
    const groups = () => tree!.root.findAll(n => n.props.accessibilityRole === 'radiogroup');
    mockFontScale = 1;
    open(rates, 12);
    expect(figures()).toMatchObject({ flexDirection: 'row' });
    // The segmented choice has no group label of its own; the chips are labelled "For".
    expect(groups().some(n => n.props.accessibilityLabel === 'For')).toBe(false);
    expect(groups().length).toBeGreaterThan(0);
    act(() => tree!.unmount());
    mockFontScale = 1.3;
    open(rates, 12);
    expect(figures().flexDirection).toBeUndefined();
    expect(groups().some(n => n.props.accessibilityLabel === 'For')).toBe(true);
  });

  it('For lists this GRN first, named by its number (read out as "This GRN, <number>"), then Customer, then Everyone', () => {
    const labels = () => {
      const all = tree!.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function' && typeof n.type !== 'string').map(n => n.props.accessibilityLabel as string);
      return all.filter((l, i) => all.indexOf(l) === i);
    };
    const shown = (label: string) => chip(label).findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join('');
    for (const scale of [1, 2]) {
      mockFontScale = scale;
      open(rates, 12, ctx, 'A0010');
      expect(labels().filter(l => ['This GRN, A0010', 'Customer', 'Everyone'].includes(l))).toEqual(['This GRN, A0010', 'Customer', 'Everyone']);
      expect(shown('This GRN, A0010')).toBe('A0010');
      expect(chip('This GRN, A0010').props.accessibilityState.selected).toBe(true);
      act(() => tree!.unmount());
      open(rates, 12);
      expect(labels().slice(0, 3)).toEqual(['This GRN', 'Customer', 'Everyone']);
      expect(shown('This GRN')).toBe('This GRN');
      act(() => tree!.unmount());
    }
  });

  it('the For line names what the chosen option changes', async () => {
    open(rates, 12, ctx, 'A0010');
    expect(hostText('rate-for-what')).toBe('Only A0010 changes');
    await act(async () => { chip('Customer').props.onPress(); });
    expect(hostText('rate-for-what')).toBe("Only this customer's rate changes");
    await act(async () => { chip('Everyone').props.onPress(); });
    expect(hostText('rate-for-what')).toBe('The default rate changes');
    await act(async () => { chip('This GRN, A0010').props.onPress(); });
    expect(hostText('rate-for-what')).toBe('Only A0010 changes');
    act(() => tree!.unmount());
    open(rates, 12);
    expect(hostText('rate-for-what')).toBe('Only this GRN changes');
  });

  it('the line is a disclosure: closed at first; a tap opens what the three mean, above the choices; a second tap closes it', async () => {
    mockFontScale = 1;
    open(rates, 12, ctx, 'A0010');
    const explain = () => tree!.root.find(n => n.props.testID === 'rate-explain' && typeof n.props.onPress === 'function');
    const group = () => at('rate-for-group');
    const order = () => {
      const ids = group().findAll(n => typeof n.type === 'string' && (['rate-explain', 'rate-explain-text'].includes(n.props.testID) || n.props.accessibilityRole === 'radiogroup')).map(n => (n.props.testID ?? 'choices') as string);
      return ids.filter((id, i) => ids.indexOf(id) === i);
    };
    expect(explain().props.accessibilityState).toEqual({ expanded: false });
    expect(tree!.root.findAll(n => n.props.testID === 'rate-explain-text')).toHaveLength(0);
    expect(order()).toEqual(['rate-explain', 'choices']);
    await press('rate-explain');
    expect(explain().props.accessibilityState).toEqual({ expanded: true });
    expect(order()).toEqual(['rate-explain', 'rate-explain-text', 'choices']);
    const lines = at('rate-explain-text').findAllByType(Text).map(n => [n.props.children].flat(Infinity).filter(c => typeof c === 'string').join(''));
    expect(lines).toEqual(expect.arrayContaining(['A0010: ', 'Customer: ', 'Everyone: ', 'Used for this GRN only. It is archived once the GRN is invoiced.']));
    await press('rate-explain');
    expect(explain().props.accessibilityState).toEqual({ expanded: false });
    expect(tree!.root.findAll(n => n.props.testID === 'rate-explain-text')).toHaveLength(0);
  });
});

describe('dates (owner, 2026-10-17)', () => {
  const planned = [stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.8, '2026-11-15')];

  it('This GRN: one line, "No end date", and no end choice; Customer and Everyone: the start and the chips, always visible', async () => {
    open([stored(0, 50, 4, '2026-01-01')], 12);
    expect(hostText('rate-from-date')).toBe('From 12 Oct 2026 · No end date');
    expect(tree!.root.findAll(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === 'No end date')).toHaveLength(0);
    expect(tree!.root.findAllByType(DatePickerInput)).toHaveLength(0);
    await act(async () => { chip('Customer').props.onPress(); });
    expect(hostText('rate-from-date')).toBe('From 12 Oct 2026');
    expect(chip('No end date').props.accessibilityState.selected).toBe(true);
    expect(chip('Until a date').props.accessibilityState.selected).toBe(false);
    expect(tree!.root.findAllByType(DatePickerInput)).toHaveLength(0);
    await act(async () => { chip('Until a date').props.onPress(); });
    expect(chip('Until a date').props.accessibilityState.selected).toBe(true);
    expect(tree!.root.findAllByType(DatePickerInput)).toHaveLength(1);
    await act(async () => { chip('No end date').props.onPress(); });
    expect(tree!.root.findAllByType(DatePickerInput)).toHaveLength(0);
    // Back to This GRN: the chips go and the line says "No end date" again.
    await act(async () => { chip('This GRN').props.onPress(); });
    expect(hostText('rate-from-date')).toBe('From 12 Oct 2026 · No end date');
    expect(tree!.root.findAll(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === 'Until a date')).toHaveLength(0);
  });

  it('Everyone over a planned rate starts with "Until a date" set to the day before it', async () => {
    open(planned, 12, { ...ctx, customerId: null });
    await act(async () => { chip('Everyone').props.onPress(); });
    expect(chip('Until a date').props.accessibilityState.selected).toBe(true);
    expect(tree!.root.findByType(DatePickerInput).props.value).toEqual(new Date(2026, 10, 14));
    expect(tree!.root.findByType(DatePickerInput).props.minimumDate).toEqual(new Date(2026, 9, 12));
  });
});

describe('weight band (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  const at = (id: string) => tree!.root.find(n => n.props.testID === id && typeof n.type === 'string');
  const press = async (id: string) => { await act(async () => { tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); }); };
  const disabled = (id: string) => tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.disabled;

  it('the wrong weight field turns red and its label names its limit, when it is left; the other stays as it is', async () => {
    open(rates, 12);
    const red = (label: string) => input(label)!.props.invalid === true;
    expect(input('From (kg)')!.props.accessibilityHint).toBeUndefined();
    // Typing alone checks nothing; leaving the field does.
    await type('From (kg)', '13');
    expect(red('From (kg)')).toBe(false);
    await act(async () => { input('From (kg)')!.props.onBlur(); });
    expect(red('From (kg)')).toBe(true);
    expect(input('From (kg)')!.props.label).toBe('From (kg) · at most 12 kg');
    expect(input('From (kg)')!.props.accessibilityHint).toBe('at most 12 kg');
    expect(red('Up to (kg)')).toBe(false);
    expect(input('Up to (kg)')!.props.label).toBe('Up to (kg)');
    // Up to below the weight: Up to is wrong, From is fine again.
    await type('From (kg)', '0'); await type('Up to (kg)', '10');
    await act(async () => { input('Up to (kg)')!.props.onBlur(); });
    expect(red('From (kg)')).toBe(false);
    expect(input('From (kg)')!.props.label).toBe('From (kg)');
    expect(red('Up to (kg)')).toBe(true);
    expect(input('Up to (kg)')!.props.label).toBe('Up to (kg) · at least 12 kg');
    // Not whole kilograms.
    await type('Up to (kg)', '12.5');
    await act(async () => { input('Up to (kg)')!.props.onBlur(); });
    expect(input('Up to (kg)')!.props.label).toBe('Up to (kg) · whole kg');
    // Right again: both plain.
    await type('Up to (kg)', '20');
    await act(async () => { input('Up to (kg)')!.props.onBlur(); });
    expect(red('Up to (kg)')).toBe(false);
    expect(input('Up to (kg)')!.props.label).toBe('Up to (kg)');
  });

  it('the weight band has + then − by 1 kg, checked at once: a band stepped past the weight is refused', async () => {
    open(rates, 12);
    expect(at('rate-upTo-down').props.accessibilityLabel).toBe('Lower the up-to weight by 1 kg');
    expect(at('rate-from-up').props.accessibilityLabel).toBe('Raise the from weight by 1 kg');
    expect(disabled('rate-from-down')).toBe(true);
    await press('rate-from-up');
    expect(input('From (kg)')!.props.value).toBe('1');
    await type('Up to (kg)', '13');
    await press('rate-upTo-down');
    expect(input('Up to (kg)')!.props.value).toBe('12');
    expect(input('Up to (kg)')!.props.invalid).toBe(false);
    await press('rate-upTo-down');
    expect(input('Up to (kg)')!.props.value).toBe('11');
    expect(input('Up to (kg)')!.props.invalid).toBe(true);
    expect(input('Up to (kg)')!.props.label).toBe('Up to (kg) · at least 12 kg');
    // Only the wrong field is red.
    expect(input('From (kg)')!.props.invalid).toBe(false);
    await press('rate-upTo-up');
    expect(input('Up to (kg)')!.props.invalid).toBe(false);
    // From stepped above the weight is refused on From alone.
    await type('From (kg)', '12');
    await press('rate-from-up');
    expect(input('From (kg)')!.props.value).toBe('13');
    expect(input('From (kg)')!.props.label).toBe('From (kg) · at most 12 kg');
    expect(input('Up to (kg)')!.props.invalid).toBe(false);
  });

  it('a band that clashes with another band of the rate in force says so in words under the band', async () => {
    // 12 kg has no rate: Add rate. The band 0-10 exists, so 5-12 overlaps it without being it.
    open([stored(0, 10, 4, '2026-01-01')], 12);
    expect(tree!.root.findAll(n => n.props.testID === 'rate-band-overlap')).toHaveLength(0);
    await type('From (kg)', '5');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(hostText('rate-band-overlap')).toBe("This band overlaps another band of the rate in force. Use that band's weights, or change the bands on the item's Pricing tab.");
    // Leaving a weight field clears the clash message with the other band errors.
    await act(async () => { input('From (kg)')!.props.onBlur(); });
    expect(tree!.root.findAll(n => n.props.testID === 'rate-band-overlap')).toHaveLength(0);
  });
});

describe('rates in force (owner, 2026-10-17)', () => {
  const at = (id: string) => tree!.root.find(n => n.props.testID === id && typeof n.type === 'string');
  const has = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.type === 'string').length > 0;
  const rowTexts = (id: string) => at(id).findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
  const toggle = () => tree!.root.find(n => n.props.testID === 'rate-ref-toggle' && typeof n.props.onPress === 'function');

  it('is closed at first; the toggle opens a caption with the day and the Customer and Everyone rows', async () => {
    open([stored(0, 50, 4, '2026-01-01')], 12);
    expect(toggle().props.accessibilityLabel).toBe('View customer and everyone rates');
    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    // The toggle sits inside the one outlined box that also holds the caption and the rows once open.
    expect(at('rate-reference').findAll(n => n.props.testID === 'rate-ref-toggle' && typeof n.type === 'string')).toHaveLength(1);
    expect(has('rate-ref-date')).toBe(false);
    expect(has('rate-ref-customer')).toBe(false);
    expect(has('rate-ref-everyone')).toBe(false);
    await tap('rate-ref-toggle');
    expect(toggle().props.accessibilityState).toEqual({ expanded: true });
    expect(hostText('rate-ref-date')).toBe('In force on 12 Oct 2026');
    for (const id of ['rate-ref-date', 'rate-ref-customer', 'rate-ref-everyone']) {
      expect(at('rate-reference').findAll(n => n.props.testID === id && typeof n.type === 'string')).toHaveLength(1);
    }
    // The rate comes from the item (for everyone): no current row; the customer has none.
    expect(has('rate-ref-current')).toBe(false);
    expect(at('rate-ref-customer').props.accessibilityLabel).toBe('Customer: no rate in force');
    expect(rowTexts('rate-ref-customer')[0]).toBe('Customer');
    expect(rowTexts('rate-ref-customer')).toContain('None');
    expect(rowTexts('rate-ref-everyone')[0]).toBe('Everyone');
    expect(rowTexts('rate-ref-everyone')).toEqual(expect.arrayContaining(['4.00', '1.50', '5']));
    await tap('rate-ref-toggle');
    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    expect(has('rate-ref-everyone')).toBe(false);
  });

  it('shows the customer\'s own rate when there is one, and no Labour column for a one-time GRN', async () => {
    open([stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.5, '2026-01-01', 'cust-a')], 12);
    await tap('rate-ref-toggle');
    expect(rowTexts('rate-ref-customer')).toEqual(expect.arrayContaining(['Customer', '3.50', '1.50', '5']));
    expect(rowTexts('rate-ref-customer')).not.toContain('None');
    expect(rowTexts('rate-ref-everyone')).toEqual(expect.arrayContaining(['4.00']));
    act(() => tree!.unmount());
    const once = (min: number, max: number, rent: number, customer: string | null = null) => ({ ...stored(min, max, rent, '2026-01-01', customer), price_type: 'one_time' as PriceType, labour_rate: 0 });
    open([once(0, 50, 4)], 12, { ...ctx, priceType: 'one_time' });
    await tap('rate-ref-toggle');
    expect(at('rate-ref-everyone').props.accessibilityLabel).toMatch(/^Everyone, .*: rent .*, tax 5%$/);
    expect(rowTexts('rate-ref-everyone')).not.toContain('1.50');
  });

  it('a row for the line\'s own rate appears only when it is this GRN\'s own or a change not saved', async () => {
    const own: GrnRate = { item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 3, labour_rate: 1, tax_percent: 5 };
    open([stored(0, 50, 4, '2026-01-01')], 12, ctx, 'A0010', { grnRates: [own] });
    await tap('rate-ref-toggle');
    expect(rowTexts('rate-ref-current')[0]).toBe('A0010');
    expect(rowTexts('rate-ref-current')).toEqual(expect.arrayContaining(['3.00', '1.00', '5']));
    act(() => tree!.unmount());
    const change: RateChange = { ...own, scope: 'everyone', to: null, ctx: contextKey(ctx), unit_price: 3.5 };
    open([stored(0, 50, 4, '2026-01-01')], 12, ctx, 'A0010', { changes: [change] });
    await tap('rate-ref-toggle');
    expect(rowTexts('rate-ref-current')[0]).toBe('Changed, not saved');
    expect(rowTexts('rate-ref-current')).toEqual(expect.arrayContaining(['3.50']));
    // The stored rates stay as they are in their own rows.
    expect(rowTexts('rate-ref-everyone')).toEqual(expect.arrayContaining(['4.00']));
  });
});

describe('figures, − / + and keypad (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  const at = (id: string) => tree!.root.find(n => n.props.testID === id && typeof n.type === 'string');
  const press = async (id: string) => { await act(async () => { tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); }); };
  const disabled = (id: string) => tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.disabled;

  it('the figures are labelled Rent ₹/month, Labour ₹ and Tax, have no asterisk and no "was" text; one-time has Rent ₹ and Tax only', async () => {
    open(rates, 12);
    for (const label of ['Rent ₹/month', 'Labour ₹', 'Tax']) {
      expect(input(label)).toBeDefined();
      expect(input(label)!.props.required).toBeFalsy();
    }
    // Changing a figure adds no "was …" text.
    await type('Rent ₹/month', '4.5');
    expect(input('Rent ₹/month')!.props.helperText).toBeUndefined();
    act(() => tree!.unmount());
    open(rates, 12, { ...ctx, priceType: 'one_time' });
    expect(input('Rent ₹')).toBeDefined();
    expect(input('Rent ₹/month')).toBeUndefined();
    expect(input('Labour ₹')).toBeUndefined();
    expect(input('Tax')).toBeDefined();
    expect(tree!.root.findAll(n => n.props.testID === 'rate-labour-up')).toHaveLength(0);
  });

  it('+ comes before − under every field', () => {
    open(rates, 12);
    const steps = tree!.root.findAll(n => typeof n.type === 'string' && /^rate-(from|upTo|rent|labour|tax)-(up|down)$/.test(n.props.testID)).map(n => n.props.testID as string);
    expect(steps.filter((id, i) => steps.indexOf(id) === i)).toEqual([
      'rate-from-up', 'rate-from-down', 'rate-upTo-up', 'rate-upTo-down',
      'rate-rent-up', 'rate-rent-down', 'rate-labour-up', 'rate-labour-down', 'rate-tax-up', 'rate-tax-down',
    ]);
  });

  it('− and + step rent and labour by ₹0.25 and tax by 1%, never below 0 or tax above 100', async () => {
    open(rates, 12);
    await press('rate-rent-up');
    expect(input('Rent ₹/month')!.props.value).toBe('4.25');
    await press('rate-labour-down');
    expect(input('Labour ₹')!.props.value).toBe('1.25');
    await press('rate-tax-down');
    expect(input('Tax')!.props.value).toBe('4');
    expect(at('rate-rent-up').props.accessibilityLabel).toBe('Raise the rent by ₹0.25');
    expect(at('rate-tax-down').props.accessibilityLabel).toBe('Lower the tax by 1%');
    await type('Tax', '100');
    expect(disabled('rate-tax-up')).toBe(true);
    await type('Rent ₹/month', '0');
    expect(disabled('rate-rent-down')).toBe(true);
    // A blank figure steps up from 0.
    await type('Labour ₹', '');
    await press('rate-labour-up');
    expect(input('Labour ₹')!.props.value).toBe('0.25');
  });

  it('the keypad says Next on every field but Tax, which says Done', () => {
    open(rates, 12);
    for (const label of ['From (kg)', 'Up to (kg)', 'Rent ₹/month', 'Labour ₹']) {
      expect(input(label)!.props.returnKeyType).toBe('next');
      expect(typeof input(label)!.props.onSubmitEditing).toBe('function');
    }
    expect(input('Tax')!.props.returnKeyType).toBe('done');
    expect(input('Tax')!.props.onSubmitEditing).toBeUndefined();
    act(() => tree!.unmount());
    // One-time has no Labour: Rent is followed by Tax.
    open(rates, 12, { ...ctx, priceType: 'one_time' });
    expect(input('Rent ₹')!.props.returnKeyType).toBe('next');
    expect(input('Tax')!.props.returnKeyType).toBe('done');
  });
});

describe('Save and leaving (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  const saveButton = () => tree!.root.find(n => n.props.testID === 'rate-save' && typeof n.props.onPress === 'function');
  const closeX = async () => { await act(async () => { tree!.root.find(n => n.props.testID === 'rate-close' && typeof n.props.onPress === 'function').props.onPress(); }); };

  it('Save rate is pinned in the footer, outside the scrolling content', () => {
    open(rates, 12);
    const scroll = tree!.root.findByType(ScrollView);
    expect(scroll.findAll(n => n.props.testID === 'rate-save')).toHaveLength(0);
    const footer = tree!.root.find(n => n.props.testID === 'rate-footer' && typeof n.type === 'string');
    expect(footer.findAll(n => n.props.testID === 'rate-save' && typeof n.props.onPress === 'function').length).toBeGreaterThan(0);
  });

  it('on Change, Save is disabled until something differs from what the sheet started with', async () => {
    open(rates, 12);
    expect(saveButton().props.disabled).toBe(true);
    await type('Rent ₹/month', '4.5');
    expect(saveButton().props.disabled).toBe(false);
    // Back to the start (the same text as the preload): nothing differs again.
    await type('Rent ₹/month', '4.00');
    expect(saveButton().props.disabled).toBe(true);
    // A change of "For" is a change too.
    await act(async () => { chip('Everyone').props.onPress(); });
    expect(saveButton().props.disabled).toBe(false);
    await act(async () => { chip('This GRN').props.onPress(); });
    expect(saveButton().props.disabled).toBe(true);
    // So is a weight.
    await press('rate-upTo-up');
    expect(saveButton().props.disabled).toBe(false);
  });

  it('on Add, Save is enabled before anything is typed', () => {
    open([], 12);
    expect(saveButton().props.disabled).toBeFalsy();
  });

  it('✕ with changes asks "Discard changes?"; Keep editing stays, Discard closes', async () => {
    open(rates, 12);
    await type('Rent ₹/month', '5');
    await closeX();
    expect(onClose).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [title, message, buttons, options] = (showAlert as jest.Mock).mock.calls[0];
    expect(title).toBe('Discard changes?');
    expect(message).toBe('Your changes have not been saved.');
    expect(buttons.map((b: { text: string; style?: string }) => [b.text, b.style])).toEqual([['Keep editing', 'cancel'], ['Discard', 'destructive']]);
    expect(buttons[0].onPress).toBeUndefined();
    expect(options).toEqual({ cancelable: true });
    expect(onClose).not.toHaveBeenCalled();
    buttons[1].onPress();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Android Back (the Modal\'s onRequestClose) asks the same, and closes at once when nothing changed', async () => {
    open(rates, 12);
    await act(async () => { modalNode().props.onRequestClose(); });
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    jest.clearAllMocks();
    await type('Tax', '6');
    await act(async () => { modalNode().props.onRequestClose(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect((showAlert as jest.Mock).mock.calls[0][0]).toBe('Discard changes?');
  });

  it('✕ without changes closes at once, without a question', async () => {
    open(rates, 12);
    await closeX();
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  async function press(id: string) { await act(async () => { tree!.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); }); }
});
