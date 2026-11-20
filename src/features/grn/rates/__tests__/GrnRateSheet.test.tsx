/**
 * The rate sheet of the GRN review step (a full-screen Modal): what it starts with, its layout and checks, and the
 * confirmation before a change of a rate in force (its parts, and three buttons: Change the rate / Only this GRN / Back).
 */
import React from 'react';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { GrnRateSheet } from '../GrnRateSheet';
import { contextKey, priceRows, type RateContext } from '../grnRateModel';
import { getTokens } from '@/theme/tokens';
import type { GrnRate, RateChange } from '../types';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { showAlert } from '@/utils/alert';

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
// A stand-in for the native picker: it draws the day it shows and the earliest day it allows, as the real one would.
jest.mock('@react-native-community/datetimepicker', () => {
  const { Text } = require('react-native');
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return {
    __esModule: true,
    default: ({ value, minimumDate }: { value: Date; minimumDate?: Date }) => (
      <Text>{`Picker shows ${day(value)}, earliest ${minimumDate ? day(minimumDate) : 'any day'}`}</Text>
    ),
    DateTimePickerAndroid: { open: jest.fn() },
  };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const DAY = '2026-10-12';
let seq = 0;
const stored = (min: number, max: number, rent: number, from: string, customer: string | null = null, to: string | null = null): ItemStoragePrice => ({
  id: `r${(seq += 1)}`, item_id: 'gur', item_name: 'Fictional Gur', customer_id: customer, customer_name: customer ? 'Fictional Traders' : null, price_type: 'monthly',
  unit_price: rent, weight_min: min, weight_max: max, labour_rate: 1.5, tax_percent: 5, effective_from: from, effective_to: to, created_at: '', created_by: '',
});
const ctx: RateContext = { customerId: 'cust-a', day: DAY, priceType: 'monthly' as PriceType };
const tokens = getTokens('orange', 'light');

type El = ReturnType<typeof screen.getByTestId>;
const onSave = jest.fn();
const onClose = jest.fn();
const user = () => userEvent.setup({ delay: 0 });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A field by its label; a weight field in error carries its limit after it ("From (kg) · at most 12 kg").
const labelRe = (label: string) => new RegExp(`^${escapeRe(label)}( · .*)?$`);
const input = (label: string) => screen.getByLabelText(labelRe(label));
const maybeInput = (label: string) => screen.queryByLabelText(labelRe(label));
/** The visible label text above a field (it turns red when the field is wrong). */
const labelText = (label: string) => screen.getByText(labelRe(label));
const redLabel = { color: tokens.status.negative.text };
const type = async (label: string, value: string) => { await fireEvent.changeText(input(label), value); };
/** The block of one field (its label, input and error line): the nearest parent of its input that also holds its label text. */
const fieldBlock = (label: string) => {
  let node = input(label).parent;
  while (node && within(node).queryAllByText(labelRe(label)).length === 0) node = node.parent;
  return within(node!);
};
const textOf = (n: El) => [n.props.children].flat(Infinity).join('');
const texts = () => screen.queryAllByText(/[\s\S]/).map(textOf);
const pressButton = async (name: string | RegExp) => { await user().press(screen.getByRole('button', { name })); };
const SAVE = 'Save rate';
const save = () => pressButton(SAVE);
const confirmOpen = () => screen.queryByText('Change the rate?') !== null;
/** The texts of one part of the open confirmation, in order. The parts have no role, so they are found by their testID. */
const part = (id: string) => within(screen.getByTestId(id)).getAllByText(/./).map(textOf);
/** A figure row of the confirmation as [label, old, new]; the row is one accessible element with its own spoken label. */
const figureRow = (key: string) => {
  const row = screen.getByTestId(`rate-confirm-${key}`);
  return { cells: within(row).getAllByText(/./).map(textOf), row };
};
/** The Modal that holds the rate screen: the nearest host above the screen that answers Android Back. */
const modalNode = () => {
  let node = screen.getByTestId('rate-screen').parent;
  while (node && typeof node.props.onRequestClose !== 'function') node = node.parent;
  return node!;
};
const chip = (label: string) => screen.getByRole('radio', { name: label });
const maybeChip = (label: string) => screen.queryByRole('radio', { name: label });
const tap = (name: string) => pressButton(name);
const hostText = (id: string) => textOf(screen.getByTestId(id));

// A test that opens the sheet twice gets a new key, so the second sheet is mounted afresh, not updated.
let opened = 0;
let rendered = false;
async function open(rates: ItemStoragePrice[], weight: number, c = ctx, grnNumber?: string, extra: { grnRates?: GrnRate[]; changes?: RateChange[] } = {}) {
  const row = priceRows([{ key: `gur|${weight}`, item_id: 'gur', item_name: 'Fictional Gur', weight }], { rates, ctx: c, grnRates: extra.grnRates ?? [], changes: extra.changes ?? [] })[0];
  const sheet = (
    <GrnRateSheet key={++opened} visible onClose={onClose} row={row} input={{ rates, ctx: c, standard: null }} customerName="Fictional Traders" priceTypeText="Monthly" grnNumber={grnNumber} onSave={onSave} />
  );
  if (rendered) await screen.rerender(sheet);
  else {
    rendered = true;
    await render(sheet);
  }
}
beforeEach(() => {
  jest.clearAllMocks();
  rendered = false;
});
afterEach(() => { mockFontScale = 2; });

describe('Add rate', () => {
  it('starts with the band and figures of the rate that starts later, ending the day before it, scope Everyone', async () => {
    mockFontScale = 1;
    // An earlier rate that has ended makes this a real gap: before an item's first rate that rate covers the day.
    await open([stored(0, 100, 3, '2026-01-01', null, '2026-02-28'), stored(11, 20, 4, '2026-11-01')], 12);
    expect(screen.getByText('Add rate · 12 kg each · Monthly')).toBeOnTheScreen();
    expect(screen.getByText('Fictional Gur')).toBeOnTheScreen();
    expect(input('From (kg)')).toHaveDisplayValue('11');
    expect(input('Up to (kg)')).toHaveDisplayValue('20');
    // Rent and labour carry two decimals, tax is plain.
    expect(input('Rent ₹/month')).toHaveDisplayValue('4.00');
    expect(input('Labour ₹')).toHaveDisplayValue('1.50');
    expect(input('Tax')).toHaveDisplayValue('5');
    expect(chip('Everyone')).toBeSelected();
    // A rate starts later in the band, so the last day is set: the chips show "Until a date" and a date field is open.
    expect(screen.getByText('From 12/10/26')).toBeOnTheScreen();
    expect(chip('Until a date')).toBeSelected();
    expect(chip('No end date').props.accessibilityState.selected).toBe(false);
    expect(screen.getAllByRole('button', { name: /^Date, / })).toHaveLength(1);
    // The day the field holds is the day before the rate that starts later (31 Oct).
    await user().press(screen.getByRole('button', { name: /^Date, / }));
    expect(screen.getByText('Picker shows 2026-10-31, earliest 2026-10-12')).toBeOnTheScreen();
    mockFontScale = 2;
  });

  it('refuses a labour above 999999 and takes 999999', async () => {
    await open([], 12);
    await type('Rent ₹/month', '3'); await type('Tax', '5');
    await type('Labour ₹', '1000000');
    await save();
    expect(fieldBlock('Labour ₹').getByText('Enter a labour rate from 0 to 999999.')).toBeOnTheScreen();
    await type('Labour ₹', '999999');
    await save();
    expect(fieldBlock('Labour ₹').queryByText('Enter a labour rate from 0 to 999999.')).not.toBeOnTheScreen();
  });

  it('refuses blank figures, a band that does not hold the weight and shows nothing saved', async () => {
    await open([], 12);
    await type('From (kg)', '20'); await type('Up to (kg)', '30');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.')).toBeOnTheScreen();
    expect(fieldBlock('Labour ₹').getByText('Enter a labour rate from 0 to 999999.')).toBeOnTheScreen();
    expect(fieldBlock('Tax').getByText('Enter the tax rate for this item.')).toBeOnTheScreen();
    await type('Rent ₹/month', '3'); await type('Labour ₹', '1'); await type('Tax', '5');
    await save();
    // A wrong band is a red field, with the reason for a screen reader; no message under it.
    // From 20 leaves out 12 kg: From is the wrong field, red, its label naming the limit; no message under it.
    expect(labelText('From (kg)')).toHaveStyle(redLabel);
    expect(input('From (kg)')).toHaveAccessibleName('From (kg) · at most 12 kg');
    expect(screen.queryByText('at most 12 kg')).not.toBeOnTheScreen();
    expect(input('From (kg)')).toHaveProp('accessibilityHint', 'at most 12 kg');
    expect(labelText('Up to (kg)')).not.toHaveStyle(redLabel);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the rent message while a stored rent above the limit stays in the box, and drops it once it is lowered', async () => {
    await open([stored(0, 50, 12000, '2026-01-01')], 12);
    const ERR = 'Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.';
    expect(screen.getByText(ERR)).toBeOnTheScreen();
    // Typing one more digit than the stored rent has is refused, and the message stays; so does an accepted key that is still too high.
    await type('Rent ₹/month', '12000');
    expect(screen.getByText(ERR)).toBeOnTheScreen();
    await type('Rent ₹/month', '9999');
    expect(screen.queryByText(ERR)).not.toBeOnTheScreen();
  });

  it('refuses a tax above 100 and a rent with three decimals', async () => {
    await open([], 12);
    await type('Rent ₹/month', '3.125'); await type('Labour ₹', '1'); await type('Tax', '101');
    await save();
    expect(screen.getByText('Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a tax rate from 0 to 100.')).toBeOnTheScreen();
  });

  it('saves the entry once everything is right; a rate in no one\'s way needs no question', async () => {
    await open([], 12);
    await type('Rent ₹/month', '3'); await type('Labour ₹', '1.5'); await type('Tax', '5');
    await save();
    expect(onSave).toHaveBeenCalledWith({ scope: 'everyone', weight_min: 12, weight_max: 12, unit_price: 3, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('a one-time GRN has no labour field and sends labour 0', async () => {
    await open([], 12, { ...ctx, priceType: 'one_time' });
    expect(maybeInput('Labour ₹')).toBeNull();
    expect(input('Rent ₹')).toBeOnTheScreen();
    await type('Rent ₹', '3'); await type('Tax', '5');
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ labour_rate: 0 }));
  });
});

describe('Change', () => {
  const rates = [stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.8, '2026-11-15')];

  it('starts with the current figures, Only this GRN, the band of the rate and the GRN date', async () => {
    await open(rates, 12, { ...ctx, customerId: null });
    expect(screen.getByText('Change rate · 12 kg each · Monthly')).toBeOnTheScreen();
    expect(chip('This GRN')).toBeSelected();
    // The band can be changed too, starting from the rate's own.
    expect(input('From (kg)')).toHaveDisplayValue('0');
    expect(input('Up to (kg)')).toHaveDisplayValue('50');
    // This GRN has no end: the dates line says so and there is no end choice.
    expect(screen.getByText('From 12/10/26 · No end date')).toBeOnTheScreen();
    expect(maybeChip('Until a date')).toBeNull();
    expect(input('Rent ₹/month')).toHaveDisplayValue('4.00');
    expect(input('Labour ₹')).toHaveDisplayValue('1.50');
    expect(input('Tax')).toHaveDisplayValue('5');
  });

  it('Only this GRN saves at once, without a question and without an end', async () => {
    await open(rates, 12, { ...ctx, customerId: null });
    await type('Rent ₹/month', '3.25');
    await save();
    expect(confirmOpen()).toBe(false);
    expect(onSave).toHaveBeenCalledWith({ scope: 'grn', weight_min: 0, weight_max: 50, unit_price: 3.25, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('Everyone starts its last day the day before the planned rate; the question sorts the facts into parts and has three buttons', async () => {
    await open(rates, 12, { ...ctx, customerId: null });
    await user().press(chip('Everyone'));
    await type('Rent ₹/month', '3.5');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(confirmOpen()).toBe(true);
    expect(screen.getByText('Fictional Gur, 0–50 kg')).toBeOnTheScreen();
    expect(part('rate-confirm-audience')).toEqual(['For: every customer (this weight band)']);
    // The figures as Old / New: only the rent changes, so only the rent reads as a change.
    // The Old / New headings are hidden from the screen reader (each row speaks its own old and new), so they are looked up hidden.
    expect(screen.getByText('Old', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('New', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(figureRow('rent').cells).toEqual(['Rent', '₹4.00', '₹3.50']);
    expect(figureRow('rent').row).toHaveAccessibleName('Rent: old ₹4.00, new ₹3.50');
    expect(figureRow('labour').cells).toEqual(['Labour', '₹1.50', '₹1.50']);
    expect(figureRow('labour').row).toHaveAccessibleName('Labour: ₹1.50, no change');
    expect(figureRow('tax').cells).toEqual(['Tax', '5%', '5%']);
    expect(figureRow('tax').row).toHaveAccessibleName('Tax: 5%, no change');
    expect(part('rate-confirm-period')).toEqual([
      'From 12/10/26 to 14/11/26',
      'The ₹4.00 rate ends on 11/10/26.',
      'The ₹4.00 rate applies again from 15/11/26.',
    ]);
    expect(part('rate-confirm-reach')).toEqual(['GRNs of every customer from 12/10/26 that are not invoiced yet will use it. Saved invoices keep their figures.']);
    // The action is the primary (filled) button; the other two are plain.
    const buttons = ['Change the rate', 'Only this GRN', 'Back'].map(name => screen.getByRole('button', { name }));
    expect(buttons[0]).toHaveStyle({ backgroundColor: tokens.brand.fill });
    expect(buttons[1]).not.toHaveStyle({ backgroundColor: tokens.brand.fill });
    expect(buttons[2]).not.toHaveStyle({ backgroundColor: tokens.brand.fill });
    // They are drawn in this order, the action first (the dialog stacks them).
    const names = screen.getAllByRole('button').map(b => b.props.accessibilityLabel as string).filter(l => ['Change the rate', 'Only this GRN', 'Back'].includes(l));
    expect(names).toEqual(['Change the rate', 'Only this GRN', 'Back']);
  });

  it('a one-time GRN has no labour row in the question', async () => {
    const oneTime = [{ ...stored(0, 50, 4, '2026-01-01'), price_type: 'one_time' as PriceType, labour_rate: 0 }];
    await open(oneTime, 12, { ...ctx, customerId: null, priceType: 'one_time' });
    await user().press(chip('Everyone'));
    await type('Rent ₹', '5');
    await save();
    expect(confirmOpen()).toBe(true);
    expect(screen.queryByTestId('rate-confirm-labour')).toBeNull();
    expect(figureRow('rent').cells).toEqual(['Rent', '₹4.00', '₹5.00']);
  });

  it('Change the rate saves the scope chosen; Only this GRN turns it into a rate for this GRN only; Back saves nothing', async () => {
    await open(rates, 12, { ...ctx, customerId: null });
    await user().press(chip('Everyone'));
    await type('Rent ₹/month', '3.5');
    await save();
    await tap('Back');
    expect(onSave).not.toHaveBeenCalled();
    expect(confirmOpen()).toBe(false);

    await save();
    await tap('Change the rate');
    expect(onSave).toHaveBeenLastCalledWith({ scope: 'everyone', weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5, to: '2026-11-14' });
    expect(confirmOpen()).toBe(false);

    await save();
    await tap('Only this GRN');
    expect(onSave).toHaveBeenLastCalledWith({ scope: 'grn', weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5, to: null });
  });

  it('This customer only over the rate for everyone says it stays for other customers', async () => {
    await open([stored(0, 50, 4, '2026-01-01')], 12);
    await user().press(chip('Customer'));
    await type('Rent ₹/month', '3.5');
    await save();
    // Who pays it, with what it means for the others, sits together; the period has no note about the old rate.
    expect(part('rate-confirm-audience')).toEqual(['For: Fictional Traders only', 'Fictional Traders pays the new rate. The ₹4.00 rate stays for other customers.']);
    expect(part('rate-confirm-period')).toEqual(['From 12/10/26, no end date']);
    expect(part('rate-confirm-reach')).toEqual(['GRNs of Fictional Traders from 12/10/26 that are not invoiced yet will use it. Saved invoices keep their figures.']);
  });

  it('a last day before the planned rate is the only one accepted: clearing the end is refused', async () => {
    await open(rates, 12, { ...ctx, customerId: null });
    await user().press(chip('Everyone'));
    await user().press(chip('No end date'));
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('A rate for this band starts on 15/11/26. Choose a last day before it.')).toBeOnTheScreen();
  });
});

describe('round 3', () => {
  it('D1: Everyone over a customer who has an own rate says the customer keeps it', async () => {
    await open([stored(0, 50, 3, '2026-01-01'), stored(0, 50, 3.5, '2026-01-01', 'cust-a')], 12);
    await user().press(chip('Everyone'));
    await type('Rent ₹/month', '4');
    await save();
    expect(figureRow('rent').cells).toEqual(['Rent', '₹3.00', '₹4.00']);
    expect(part('rate-confirm-audience')).toEqual(['For: every customer (this weight band)', 'Fictional Traders keeps their own rate of ₹3.50.']);
  });

  it('D5: a planned band of the scope over the weights is refused with its start day; the preloaded last day is the day before', async () => {
    const rates = [stored(0, 50, 3, '2026-01-01', null, '2026-10-31'), stored(0, 20, 3, '2026-11-01'), stored(21, 50, 4, '2026-11-01')];
    await open(rates, 12, { ...ctx, customerId: null });
    await user().press(chip('Everyone'));
    await user().press(chip('No end date'));
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('A rate for this band starts on 01/11/26. Choose a last day before it.')).toBeOnTheScreen();
    await user().press(chip('Until a date'));
    await save();
    expect(part('rate-confirm-period')[0]).toBe('From 12/10/26 to 31/10/26');
  });

});

describe('header, close and layout (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  type Json = NonNullable<ReturnType<typeof screen.toJSON>>;
  /**
   * The elements of the tree that match, in the order they are drawn. Order is nothing a query can say, so the rendered
   * tree is walked, from the element with `root` as its testID (or the whole screen).
   */
  const inOrder = (match: (props: Record<string, unknown>) => boolean, root?: string): Record<string, unknown>[] => {
    const found: Record<string, unknown>[] = [];
    let inside = root === undefined;
    const walk = (node: Json | string) => {
      if (typeof node === 'string') return;
      const props = node.props as Record<string, unknown>;
      const wasInside = inside;
      if (root !== undefined && props.testID === root) inside = true;
      if (inside && match(props)) found.push(props);
      (node.children ?? []).forEach(walk);
      inside = wasInside;
    };
    const tree = screen.toJSON();
    (Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(walk);
    return found;
  };

  it('is a full-screen Modal; the header names what is done, the item, the weight and the price type; ✕ is a Close button', async () => {
    await open([], 12);
    const modal = modalNode();
    expect(modal).toHaveProp('visible', true);
    expect(modal).toHaveProp('presentationStyle', 'fullScreen');
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Add rate, Fictional Gur, 12 kg each, Monthly' })).toBeOnTheScreen();
    expect(screen.getByText('Add rate · 12 kg each · Monthly')).toBeOnTheScreen();
    expect(screen.getByText('Fictional Gur')).toBeOnTheScreen();
    await open(rates, 12, { ...ctx, priceType: 'monthly' });
    expect(screen.getByRole('header', { name: 'Change rate, Fictional Gur, 12 kg each, Monthly' })).toBeOnTheScreen();
    expect(screen.getByText('Change rate · 12 kg each · Monthly')).toBeOnTheScreen();
  });

  it('is filled top to bottom: For, the dates, the weight band, the in-force table, then the figures', async () => {
    await open(rates, 12);
    const order = ['rate-for-group', 'rate-dates', 'rate-band', 'rate-ref-toggle', 'rate-figures'];
    const all = inOrder(props => order.includes(props.testID as string)).map(props => props.testID as string);
    expect(all.filter((id, i) => all.indexOf(id) === i)).toEqual(order);
  });

  it('at normal text the figures sit in one row and For is a segmented choice; at 1.3 they stack and For wraps as chips', async () => {
    const figures = () => StyleSheet.flatten(screen.getByTestId('rate-figures').props.style);
    const groups = () => inOrder(props => props.accessibilityRole === 'radiogroup');
    mockFontScale = 1;
    await open(rates, 12);
    expect(screen.getByTestId('rate-figures')).toHaveStyle({ flexDirection: 'row' });
    // The segmented choice has no group label of its own; the chips are labelled "For".
    // A group is not an accessible element a query can reach, so the groups are read from the rendered tree.
    expect(groups().some(g => g.accessibilityLabel === 'For')).toBe(false);
    expect(groups().length).toBeGreaterThan(0);
    mockFontScale = 1.3;
    await open(rates, 12);
    expect(figures().flexDirection).toBeUndefined();
    expect(groups().some(g => g.accessibilityLabel === 'For')).toBe(true);
  });

  it('For lists this GRN first, named by its number (read out as "This GRN, <number>"), then Customer, then Everyone', async () => {
    const labels = () => screen.getAllByRole('radio').map(n => n.props.accessibilityLabel as string);
    const shown = (label: string) => within(chip(label)).getAllByText(/./).map(textOf).join('');
    for (const scale of [1, 2]) {
      mockFontScale = scale;
      await open(rates, 12, ctx, 'A0010');
      expect(labels().filter(l => ['This GRN, A0010', 'Customer', 'Everyone'].includes(l))).toEqual(['This GRN, A0010', 'Customer', 'Everyone']);
      expect(shown('This GRN, A0010')).toBe('A0010');
      expect(chip('This GRN, A0010')).toBeSelected();
      await open(rates, 12);
      expect(labels().slice(0, 3)).toEqual(['This GRN', 'Customer', 'Everyone']);
      expect(shown('This GRN')).toBe('This GRN');
    }
  });

  it('the For line names what the chosen option changes', async () => {
    await open(rates, 12, ctx, 'A0010');
    expect(screen.getByTestId('rate-for-what')).toHaveTextContent('Only A0010 changes');
    await user().press(chip('Customer'));
    expect(screen.getByTestId('rate-for-what')).toHaveTextContent("Only this customer's rate changes");
    await user().press(chip('Everyone'));
    expect(screen.getByTestId('rate-for-what')).toHaveTextContent('The default rate changes');
    await user().press(chip('This GRN, A0010'));
    expect(screen.getByTestId('rate-for-what')).toHaveTextContent('Only A0010 changes');
    await open(rates, 12);
    expect(screen.getByTestId('rate-for-what')).toHaveTextContent('Only this GRN changes');
  });

  it('the line is a disclosure: closed at first; a tap opens what the three mean, above the choices; a second tap closes it', async () => {
    mockFontScale = 1;
    await open(rates, 12, ctx, 'A0010');
    const explain = () => screen.getByRole('button', { name: 'Only A0010 changes' });
    // What is drawn inside the For group, in order: the line, the explanation (when open) and the choices.
    const order = () => {
      const ids = inOrder(props => ['rate-explain', 'rate-explain-text'].includes(props.testID as string) || props.accessibilityRole === 'radiogroup', 'rate-for-group')
        .map(props => (props.testID ?? 'choices') as string);
      return ids.filter((id, i) => ids.indexOf(id) === i);
    };
    expect(explain().props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByTestId('rate-explain-text')).toBeNull();
    expect(order()).toEqual(['rate-explain', 'choices']);
    await user().press(explain());
    expect(explain().props.accessibilityState).toEqual({ expanded: true });
    expect(order()).toEqual(['rate-explain', 'rate-explain-text', 'choices']);
    const lines = within(screen.getByTestId('rate-explain-text')).getAllByText(/./).map(n => [n.props.children].flat(Infinity).filter(c => typeof c === 'string').join(''));
    expect(lines).toEqual(expect.arrayContaining(['A0010: ', 'Customer: ', 'Everyone: ']));
    expect(within(screen.getByTestId('rate-explain-text')).getByText('Used for this GRN only. It is archived once the GRN is invoiced.', { exact: false })).toBeOnTheScreen();
    await user().press(explain());
    expect(explain().props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByTestId('rate-explain-text')).toBeNull();
  });
});

describe('dates (owner, 2026-10-17)', () => {
  const planned = [stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.8, '2026-11-15')];
  const dateField = () => screen.queryAllByRole('button', { name: /^Date, / });

  it('This GRN: one line, "No end date", and no end choice; Customer and Everyone: the start and the chips, always visible', async () => {
    await open([stored(0, 50, 4, '2026-01-01')], 12);
    expect(screen.getByText('From 12/10/26 · No end date')).toBeOnTheScreen();
    expect(maybeChip('No end date')).toBeNull();
    expect(dateField()).toHaveLength(0);
    await user().press(chip('Customer'));
    expect(screen.getByText('From 12/10/26')).toBeOnTheScreen();
    expect(chip('No end date')).toBeSelected();
    expect(chip('Until a date').props.accessibilityState.selected).toBe(false);
    expect(dateField()).toHaveLength(0);
    await user().press(chip('Until a date'));
    expect(chip('Until a date')).toBeSelected();
    expect(dateField()).toHaveLength(1);
    await user().press(chip('No end date'));
    expect(dateField()).toHaveLength(0);
    // Back to This GRN: the chips go and the line says "No end date" again.
    await user().press(chip('This GRN'));
    expect(screen.getByText('From 12/10/26 · No end date')).toBeOnTheScreen();
    expect(maybeChip('Until a date')).toBeNull();
  });

  it('Everyone over a planned rate starts with "Until a date" set to the day before it', async () => {
    await open(planned, 12, { ...ctx, customerId: null });
    await user().press(chip('Everyone'));
    expect(chip('Until a date')).toBeSelected();
    await user().press(screen.getByRole('button', { name: /^Date, / }));
    // The field holds 14 Nov (the day before the planned rate) and allows no day before the GRN's own (12 Oct).
    expect(screen.getByText('Picker shows 2026-11-14, earliest 2026-10-12')).toBeOnTheScreen();
  });
});

describe('weight band (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  const press = (name: string) => pressButton(name);
  const stepper = (name: string) => screen.getByRole('button', { name });
  const blur = async (label: string) => { await fireEvent(input(label), 'blur', {}); };

  it('the wrong weight field turns red and its label names its limit, when it is left; the other stays as it is', async () => {
    await open(rates, 12);
    const red = (label: string) => StyleSheet.flatten(labelText(label).props.style).color === tokens.status.negative.text;
    expect(input('From (kg)').props.accessibilityHint).toBeUndefined();
    // Typing alone checks nothing; leaving the field does.
    await type('From (kg)', '13');
    expect(red('From (kg)')).toBe(false);
    await blur('From (kg)');
    expect(red('From (kg)')).toBe(true);
    expect(input('From (kg)')).toHaveAccessibleName('From (kg) · at most 12 kg');
    expect(input('From (kg)')).toHaveProp('accessibilityHint', 'at most 12 kg');
    expect(red('Up to (kg)')).toBe(false);
    expect(input('Up to (kg)')).toHaveAccessibleName('Up to (kg)');
    // Up to below the weight: Up to is wrong, From is fine again.
    await type('From (kg)', '0'); await type('Up to (kg)', '10');
    await blur('Up to (kg)');
    expect(red('From (kg)')).toBe(false);
    expect(input('From (kg)')).toHaveAccessibleName('From (kg)');
    expect(red('Up to (kg)')).toBe(true);
    expect(input('Up to (kg)')).toHaveAccessibleName('Up to (kg) · at least 12 kg');
    // Not whole kilograms.
    await type('Up to (kg)', '12.5');
    await blur('Up to (kg)');
    expect(input('Up to (kg)')).toHaveAccessibleName('Up to (kg) · whole kg');
    // Right again: both plain.
    await type('Up to (kg)', '20');
    await blur('Up to (kg)');
    expect(red('Up to (kg)')).toBe(false);
    expect(input('Up to (kg)')).toHaveAccessibleName('Up to (kg)');
  });

  it('the weight band has + then − by 1 kg, checked at once: a band stepped past the weight is refused', async () => {
    await open(rates, 12);
    expect(stepper('Lower the up-to weight by 1 kg')).toBeOnTheScreen();
    expect(stepper('Raise the from weight by 1 kg')).toBeOnTheScreen();
    expect(stepper('Lower the from weight by 1 kg')).toBeDisabled();
    await press('Raise the from weight by 1 kg');
    expect(input('From (kg)')).toHaveDisplayValue('1');
    await type('Up to (kg)', '13');
    await press('Lower the up-to weight by 1 kg');
    expect(input('Up to (kg)')).toHaveDisplayValue('12');
    expect(labelText('Up to (kg)')).not.toHaveStyle(redLabel);
    await press('Lower the up-to weight by 1 kg');
    expect(input('Up to (kg)')).toHaveDisplayValue('11');
    expect(labelText('Up to (kg)')).toHaveStyle(redLabel);
    expect(input('Up to (kg)')).toHaveAccessibleName('Up to (kg) · at least 12 kg');
    // Only the wrong field is red.
    expect(labelText('From (kg)')).not.toHaveStyle(redLabel);
    await press('Raise the up-to weight by 1 kg');
    expect(labelText('Up to (kg)')).not.toHaveStyle(redLabel);
    // From stepped above the weight is refused on From alone.
    await type('From (kg)', '12');
    await press('Raise the from weight by 1 kg');
    expect(input('From (kg)')).toHaveDisplayValue('13');
    expect(input('From (kg)')).toHaveAccessibleName('From (kg) · at most 12 kg');
    expect(labelText('Up to (kg)')).not.toHaveStyle(redLabel);
  });

  it('a band that clashes with another band of the rate in force says so in words under the band', async () => {
    // 12 kg has no rate: Add rate. The band 0-10 exists, so 5-12 overlaps it without being it.
    await open([stored(0, 10, 4, '2026-01-01')], 12);
    const CLASH = "This band overlaps another band of the rate in force. Use that band's weights, or change the bands on the item's Pricing tab.";
    expect(screen.queryByText(CLASH)).toBeNull();
    await type('From (kg)', '5');
    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(CLASH)).toBeOnTheScreen();
    // Leaving a weight field clears the clash message with the other band errors.
    await blur('From (kg)');
    expect(screen.queryByText(CLASH)).toBeNull();
  });
});

describe('rates in force (owner, 2026-10-17)', () => {
  const TOGGLE = 'View customer and everyone rates';
  const has = (id: string) => screen.queryByTestId(id) !== null;
  const rowTexts = (id: string) => within(screen.getByTestId(id)).getAllByText(/./).map(textOf);
  const toggle = () => screen.getByRole('button', { name: TOGGLE });

  it('is closed at first; the toggle opens a caption with the day and the Customer and Everyone rows', async () => {
    await open([stored(0, 50, 4, '2026-01-01')], 12);
    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    // The toggle sits inside the one outlined box that also holds the caption and the rows once open.
    expect(within(screen.getByTestId('rate-reference')).getAllByRole('button', { name: TOGGLE })).toHaveLength(1);
    expect(has('rate-ref-date')).toBe(false);
    expect(has('rate-ref-customer')).toBe(false);
    expect(has('rate-ref-everyone')).toBe(false);
    await tap(TOGGLE);
    expect(toggle().props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByText('In force on 12/10/26')).toBeOnTheScreen();
    for (const id of ['rate-ref-date', 'rate-ref-customer', 'rate-ref-everyone']) {
      expect(within(screen.getByTestId('rate-reference')).getAllByTestId(id)).toHaveLength(1);
    }
    // The rate comes from the item (for everyone): no current row; the customer has none.
    expect(has('rate-ref-current')).toBe(false);
    expect(screen.getByTestId('rate-ref-customer')).toHaveAccessibleName('Customer: no rate in force');
    expect(rowTexts('rate-ref-customer')[0]).toBe('Customer');
    expect(rowTexts('rate-ref-customer')).toContain('None');
    expect(rowTexts('rate-ref-everyone')[0]).toBe('Everyone');
    expect(rowTexts('rate-ref-everyone')).toEqual(expect.arrayContaining(['4.00', '1.50', '5']));
    await tap(TOGGLE);
    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    expect(has('rate-ref-everyone')).toBe(false);
  });

  it('shows the customer\'s own rate when there is one, and no Labour column for a one-time GRN', async () => {
    await open([stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.5, '2026-01-01', 'cust-a')], 12);
    await tap(TOGGLE);
    expect(rowTexts('rate-ref-customer')).toEqual(expect.arrayContaining(['Customer', '3.50', '1.50', '5']));
    expect(rowTexts('rate-ref-customer')).not.toContain('None');
    expect(rowTexts('rate-ref-everyone')).toEqual(expect.arrayContaining(['4.00']));
    const once = (min: number, max: number, rent: number, customer: string | null = null) => ({ ...stored(min, max, rent, '2026-01-01', customer), price_type: 'one_time' as PriceType, labour_rate: 0 });
    await open([once(0, 50, 4)], 12, { ...ctx, priceType: 'one_time' });
    await tap(TOGGLE);
    expect(screen.getByTestId('rate-ref-everyone')).toHaveAccessibleName(/^Everyone, .*: rent .*, tax 5%$/);
    expect(rowTexts('rate-ref-everyone')).not.toContain('1.50');
  });

  it('a row for the line\'s own rate appears only when it is this GRN\'s own or a change not saved', async () => {
    const own: GrnRate = { item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 3, labour_rate: 1, tax_percent: 5 };
    await open([stored(0, 50, 4, '2026-01-01')], 12, ctx, 'A0010', { grnRates: [own] });
    await tap(TOGGLE);
    expect(rowTexts('rate-ref-current')[0]).toBe('A0010');
    expect(rowTexts('rate-ref-current')).toEqual(expect.arrayContaining(['3.00', '1.00', '5']));
    const change: RateChange = { ...own, scope: 'everyone', to: null, ctx: contextKey(ctx), unit_price: 3.5 };
    await open([stored(0, 50, 4, '2026-01-01')], 12, ctx, 'A0010', { changes: [change] });
    await tap(TOGGLE);
    expect(rowTexts('rate-ref-current')[0]).toBe('Changed, not saved');
    expect(rowTexts('rate-ref-current')).toEqual(expect.arrayContaining(['3.50']));
    // The stored rates stay as they are in their own rows.
    expect(rowTexts('rate-ref-everyone')).toEqual(expect.arrayContaining(['4.00']));
  });
});

describe('figures, − / + and keypad (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  const press = (name: string) => pressButton(name);
  const stepper = (name: string) => screen.getByRole('button', { name });

  it('the figures are labelled Rent ₹/month, Labour ₹ and Tax, have no asterisk and no "was" text; one-time has Rent ₹ and Tax only', async () => {
    await open(rates, 12);
    for (const label of ['Rent ₹/month', 'Labour ₹', 'Tax']) {
      // A required field is named "<label>, required" and drawn with an asterisk.
      expect(input(label)).toHaveAccessibleName(label);
      expect(screen.queryByText('*', { exact: false })).toBeNull();
    }
    // Changing a figure adds no "was …" text.
    await type('Rent ₹/month', '4.5');
    expect(screen.queryByText(/\bwas\b/i)).toBeNull();
    await open(rates, 12, { ...ctx, priceType: 'one_time' });
    expect(input('Rent ₹')).toBeOnTheScreen();
    expect(maybeInput('Rent ₹/month')).toBeNull();
    expect(maybeInput('Labour ₹')).toBeNull();
    expect(input('Tax')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /labour/i })).toBeNull();
  });

  it('+ comes before − under every field', async () => {
    await open(rates, 12);
    const names = screen.getAllByRole('button', { name: /^(Raise|Lower) the / }).map(n => n.props.accessibilityLabel as string);
    expect(names).toEqual([
      'Raise the from weight by 1 kg', 'Lower the from weight by 1 kg', 'Raise the up-to weight by 1 kg', 'Lower the up-to weight by 1 kg',
      'Raise the rent by ₹0.25', 'Lower the rent by ₹0.25', 'Raise the labour by ₹0.25', 'Lower the labour by ₹0.25', 'Raise the tax by 1%', 'Lower the tax by 1%',
    ]);
  });

  it('− and + step rent and labour by ₹0.25 and tax by 1%, never below 0 or tax above 100', async () => {
    await open(rates, 12);
    await press('Raise the rent by ₹0.25');
    expect(input('Rent ₹/month')).toHaveDisplayValue('4.25');
    await press('Lower the labour by ₹0.25');
    expect(input('Labour ₹')).toHaveDisplayValue('1.25');
    await press('Lower the tax by 1%');
    expect(input('Tax')).toHaveDisplayValue('4');
    await type('Tax', '100');
    expect(stepper('Raise the tax by 1%')).toBeDisabled();
    await type('Rent ₹/month', '0');
    expect(stepper('Lower the rent by ₹0.25')).toBeDisabled();
    // A blank figure steps up from 0.
    await type('Labour ₹', '');
    await press('Raise the labour by ₹0.25');
    expect(input('Labour ₹')).toHaveDisplayValue('0.25');
  });

  it('the keypad says Next on every field but Tax, which says Done', async () => {
    await open(rates, 12);
    for (const label of ['From (kg)', 'Up to (kg)', 'Rent ₹/month', 'Labour ₹']) {
      expect(input(label)).toHaveProp('returnKeyType', 'next');
      expect(typeof input(label).props.onSubmitEditing).toBe('function');
    }
    expect(input('Tax')).toHaveProp('returnKeyType', 'done');
    expect(input('Tax').props.onSubmitEditing).toBeUndefined();
    // One-time has no Labour: Rent is followed by Tax.
    await open(rates, 12, { ...ctx, priceType: 'one_time' });
    expect(input('Rent ₹')).toHaveProp('returnKeyType', 'next');
    expect(input('Tax')).toHaveProp('returnKeyType', 'done');
  });
});

describe('Save and leaving (owner, 2026-10-17)', () => {
  const rates = [stored(0, 50, 4, '2026-01-01')];
  const saveButton = () => screen.getByRole('button', { name: SAVE });
  const closeX = () => pressButton('Close');
  const DISCARD = 'Discard changes?';

  it('Save rate is pinned in the footer, outside the scrolling content', async () => {
    await open(rates, 12);
    // The scrolling content is the nearest scroll view above the figures.
    let scroll = screen.getByTestId('rate-figures').parent;
    while (scroll && scroll.type !== 'RCTScrollView') scroll = scroll.parent;
    expect(scroll).not.toBeNull();
    expect(within(scroll!).queryByRole('button', { name: SAVE })).toBeNull();
    expect(within(screen.getByTestId('rate-footer')).getAllByRole('button', { name: SAVE }).length).toBeGreaterThan(0);
  });

  it('on Change, Save is disabled until something differs from what the sheet started with', async () => {
    await open(rates, 12);
    expect(saveButton()).toBeDisabled();
    await type('Rent ₹/month', '4.5');
    expect(saveButton()).toBeEnabled();
    // Back to the start (the same text as the preload): nothing differs again.
    await type('Rent ₹/month', '4.00');
    expect(saveButton()).toBeDisabled();
    // A change of "For" is a change too.
    await user().press(chip('Everyone'));
    expect(saveButton()).toBeEnabled();
    await user().press(chip('This GRN'));
    expect(saveButton()).toBeDisabled();
    // So is a weight.
    await pressButton('Raise the up-to weight by 1 kg');
    expect(saveButton()).toBeEnabled();
  });

  it('on Change of a row with a pending Everyone change, Save is on for "This GRN" with the same figures', async () => {
    const change: RateChange = { item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1, tax_percent: 5, scope: 'everyone', to: null, ctx: contextKey(ctx) };
    await open(rates, 12, ctx, 'A0010', { changes: [change] });
    expect(chip('This GRN, A0010').props.accessibilityState?.selected).toBe(true);
    expect(saveButton()).toBeEnabled();
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ scope: 'grn', unit_price: 3.5 }));
  });

  it('on Add, Save is enabled before anything is typed', async () => {
    await open([], 12);
    expect(saveButton()).toBeEnabled();
  });

  // The question is drawn inside the rate screen (a Modal opened from outside it is not shown on iPhone).
  const discardOpen = () => screen.queryByText(DISCARD) !== null;

  it('✕ with changes asks "Discard changes?" inside the screen; Keep editing stays, Discard closes', async () => {
    await open(rates, 12);
    expect(discardOpen()).toBe(false);
    await type('Rent ₹/month', '5');
    await closeX();
    expect(onClose).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(screen.getByText(DISCARD)).toBeOnTheScreen();
    expect(screen.getByText('Your changes have not been saved.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeOnTheScreen();
    expect(screen.getByTestId('rate-discard')).toBeOnTheScreen();
    // The question is drawn inside the rate screen's own Modal.
    expect(within(modalNode()).getByTestId('rate-discard')).toBeOnTheScreen();
    await pressButton('Keep editing');
    expect(discardOpen()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    await closeX();
    await pressButton('Discard');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Android Back (the Modal\'s onRequestClose) asks the same, and closes at once when nothing changed', async () => {
    await open(rates, 12);
    await fireEvent(modalNode(), 'requestClose');
    expect(discardOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    jest.clearAllMocks();
    await type('Tax', '6');
    await fireEvent(modalNode(), 'requestClose');
    expect(onClose).not.toHaveBeenCalled();
    expect(discardOpen()).toBe(true);
    expect(screen.getByText(DISCARD)).toBeOnTheScreen();
  });

  it('the "Change the rate?" question is inside the rate screen too', async () => {
    await open([stored(0, 50, 4, '2026-01-01'), stored(0, 50, 3.8, '2026-11-15')], 12, { ...ctx, customerId: null });
    await user().press(chip('Everyone'));
    await type('Rent ₹/month', '3.5');
    await save();
    expect(within(modalNode()).getByText('Change the rate?')).toBeOnTheScreen();
  });

  it('✕ without changes closes at once, without a question', async () => {
    await open(rates, 12);
    await closeX();
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
