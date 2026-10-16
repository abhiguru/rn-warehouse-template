/**
 * The editable band table: a cell per figure, the setters behind them, shared or per-band labour and tax,
 * a customer's From cells, the card-per-band fallback for large text and narrow screens, and what a screen
 * reader hears.
 */
import React, { useState } from 'react';
import { Dimensions, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Input } from '@/components/ui/Input';
import { BandsTable } from '@/features/item-pricing/components/BandsTable';
import type { FieldRegistry } from '@/features/item-pricing/components/fieldLink';
import { initialDraft, validate, type Draft, type EditorContext } from '@/features/item-pricing/editModel';
import type { ItemStoragePrice } from '@/types/item-pricing.types';
import { ORCHARD_B, garlicRows, onionRows, rate } from '@/tests/helpers/rateEditorFixtures';
import { getTokens } from '@/theme/tokens';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const TODAY = '2026-10-14';
const lightTokens = getTokens('orange', 'light');
const open = (rows: ItemStoragePrice[], itemId: string, customer?: { id: string; name: string }) =>
  initialDraft({
    mode: 'change',
    params: { mode: 'change', item_id: itemId, price_type: 'monthly', ...(customer ? { customer_id: customer.id, customer_name: customer.name } : {}) },
    rows,
    role: 'admin',
    today: TODAY,
  });

let latest: Draft;
let onChange: jest.Mock;
function Harness({ start, ctx, showErrors = false, ...rest }: { start: Draft; ctx: EditorContext; showErrors?: boolean } & Partial<React.ComponentProps<typeof BandsTable>>) {
  const [draft, setDraft] = useState(start);
  latest = draft;
  return (
    <BandsTable
      draft={draft}
      ctx={ctx}
      errors={showErrors ? validate(draft, ctx).errors : {}}
      onChange={next => {
        onChange(next);
        setDraft(next);
      }}
      {...rest}
    />
  );
}

const WINDOW = Dimensions.get('window');
const screen = (width: number, fontScale: number) => Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } });
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  onChange = jest.fn();
  screen(392, 1);
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  Dimensions.set({ window: WINDOW });
});

async function mount(rows: ItemStoragePrice[], itemId: string, props: Partial<React.ComponentProps<typeof Harness>> = {}, customer?: { id: string; name: string }) {
  const { draft, context } = open(rows, itemId, customer);
  await act(async () => { tree = create(<Harness start={draft} ctx={context} {...props} />); });
  return tree!;
}
const cell = (id: string) => tree!.root.findAllByType(TextInput).find(n => n.props.testID === id)!;
const cells = () => tree!.root.findAllByType(TextInput).map(n => n.props.testID as string);
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const type = (id: string, text: string) => act(() => cell(id).props.onChangeText(text));
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('shared labour and tax (the bands do not differ)', () => {
  it('shows a cell for the Up to and the rent of each band, From as text, labour and tax as two rows', async () => {
    await mount(garlicRows(), 'garlic');
    expect(cells()).toEqual(['band-0-upTo', 'band-0-rent', 'band-1-upTo', 'band-1-rent', 'labour', 'tax']);
    expect([cell('band-0-upTo'), cell('band-0-rent'), cell('band-1-upTo'), cell('band-1-rent'), cell('labour'), cell('tax')].map(n => n.props.value))
      .toEqual(['40', '6.00', '100', '9.50', '2.50', '5']);
    const shown = texts();
    expect(shown).toEqual(expect.arrayContaining(['Up to (kg)', 'Rent (₹)', '0 –', '41 –', 'Labour (₹)', 'Tax (%)', 'Tap a figure to change it.']));
    // The per-band columns are not there.
    expect(shown.filter(s => s === 'Labour (₹)' || s === 'Tax (%)')).toHaveLength(2);
    expect(tree!.root.findAll(n => n.props.testID === 'labour-row' && typeof n.type === 'string')).toHaveLength(1);
  });

  it('opens a number pad, selects the text on focus and keeps a touch-sized cell', async () => {
    await mount(garlicRows(), 'garlic');
    const upTo = cell('band-0-upTo');
    const rent = cell('band-0-rent');
    expect(upTo.props).toMatchObject({ keyboardType: 'number-pad', selectTextOnFocus: true, returnKeyType: 'next' });
    expect(rent.props).toMatchObject({ keyboardType: 'decimal-pad', selectTextOnFocus: true, returnKeyType: 'next' });
    expect(cell('tax').props.returnKeyType).toBe('done');
    expect(flat(rent.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(rent.props.maxFontSizeMultiplier).toBe(1.3);
  });

  it('draws the 2 px focus ring only on the focused cell', async () => {
    await mount(garlicRows(), 'garlic');
    expect(flat(cell('band-0-rent').props.style)).toMatchObject({ borderWidth: 2, borderColor: 'transparent' });
    act(() => cell('band-0-rent').props.onFocus());
    expect(flat(cell('band-0-rent').props.style).borderColor).toBe(lightTokens.border.fieldFocus);
    expect(flat(cell('band-1-rent').props.style).borderColor).toBe('transparent');
    act(() => cell('band-0-rent').props.onBlur());
    expect(flat(cell('band-0-rent').props.style).borderColor).toBe('transparent');
  });

  it('typing in a cell calls the setters: Up to moves the From of the next band, rent, labour and tax land in the draft', async () => {
    await mount(garlicRows(), 'garlic');
    type('band-0-upTo', '60');
    expect(latest.bands[0].upTo).toBe('60');
    expect(texts()).toContain('61 –');
    type('band-1-rent', '10.25');
    type('labour', '3');
    type('tax', '12');
    expect([latest.bands[1].rent, latest.labour, latest.tax]).toEqual(['10.25', '3', '12']);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('adds an empty band and removes one by its button; a single band has no remove control', async () => {
    await mount(garlicRows(), 'garlic');
    const add = tree!.root.findAll(n => n.props.testID === 'add-band' && typeof n.props.onPress === 'function')[0];
    await act(async () => { add.props.onPress(); });
    expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100', '']);
    expect(cells()).toContain('band-2-rent');
    expect(texts()).toContain('101 –');

    const remove = () => tree!.root.findAll(n => n.props.testID === 'band-2-remove' && typeof n.props.onPress === 'function')[0];
    expect(remove().props.accessibilityLabel).toBe('Remove the From 101 kg band');
    await act(async () => { remove().props.onPress(); });
    expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100']);

    // Down to one band: no remove controls.
    await act(async () => { tree!.root.findAll(n => n.props.testID === 'band-1-remove' && typeof n.props.onPress === 'function')[0].props.onPress(); });
    expect(latest.bands).toHaveLength(1);
    expect(tree!.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.endsWith('-remove'))).toHaveLength(0);
  });

  it('Add band is off with a reason until the last "Up to" is a whole number', async () => {
    await mount(garlicRows(), 'garlic');
    const add = () => tree!.root.find(n => n.props.testID === 'add-band' && typeof n.props.onPress === 'function');
    expect(add().props.disabled).toBe(false);
    await act(async () => { add().props.onPress(); });
    // The new band starts at 101 kg and has an empty "Up to"; another one waits for it.
    expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100', '']);
    expect(add().props.disabled).toBe(true);
    expect(texts()).toContain('Enter the "Up to" weight of the last band first.');
    await type('band-2-upTo', '150');
    expect(add().props.disabled).toBe(false);
    expect(texts()).not.toContain('Enter the "Up to" weight of the last band first.');
  });

  it('a one-time rate has no labour row, only the note, and a tax row', async () => {
    const once = [rate('garlic', null, 0, 100, 9, 0, 5, '2025-01-01', null, 'one_time', 'Review Garlic Desi')];
    const { draft, context } = initialDraft({ mode: 'change', params: { mode: 'change', item_id: 'garlic', price_type: 'one_time' }, rows: once, role: 'admin', today: TODAY });
    await act(async () => { tree = create(<Harness start={draft} ctx={context} />); });
    expect(cells()).toEqual(['band-0-upTo', 'band-0-rent', 'tax']);
    expect(texts()).toContain('Labour is included in a one-time rate.');
  });
});

describe('labour and tax that differ per band', () => {
  const perBandRows = () => [
    rate('garlic', null, 0, 40, 6, 2, 5, '2025-01-01', null, 'monthly', 'Review Garlic Desi'),
    rate('garlic', null, 41, 100, 9.5, 3, 12, '2025-01-01', null, 'monthly', 'Review Garlic Desi'),
  ];

  it('are columns of their own, with a cell in every band and no shared rows', async () => {
    screen(700, 1);
    await mount(perBandRows(), 'garlic');
    expect(cells()).toEqual(['band-0-upTo', 'band-0-rent', 'band-0-labour', 'band-0-tax', 'band-1-upTo', 'band-1-rent', 'band-1-labour', 'band-1-tax']);
    expect(texts()).toEqual(expect.arrayContaining(['Up to (kg)', 'Rent (₹)', 'Labour (₹)', 'Tax (%)']));
    expect(tree!.root.findAll(n => n.props.testID === 'labour-row' || n.props.testID === 'tax-row')).toHaveLength(0);
    expect([cell('band-1-labour').props.value, cell('band-1-tax').props.value]).toEqual(['3.00', '12']);
    type('band-1-labour', '3.5');
    type('band-0-tax', '18');
    expect([latest.bands[1].labour, latest.bands[0].tax]).toEqual(['3.5', '18']);
  });

  it('too many columns for the width fall back to the cards', async () => {
    screen(360, 1);
    await mount(perBandRows(), 'garlic');
    expect(tree!.root.findAll(n => n.props.testID === 'bands-table-stacked').length).toBeGreaterThan(0);
    expect(cells()).toEqual([]);
  });
});

describe('a customer rate', () => {
  it('has a From cell in the first band and in the ones after it, set through setFirstFrom / setBandFrom', async () => {
    const rows = [
      rate('onion', ORCHARD_B, 10, 40, 3, 1.5, 5, '2026-01-01', null, 'monthly', 'Review Onion Red'),
      rate('onion', ORCHARD_B, 61, 100, 4, 1.5, 5, '2026-01-01', null, 'monthly', 'Review Onion Red'),
      ...onionRows().filter(r => !r.customer_id),
    ];
    await mount(rows, 'onion', {}, { id: ORCHARD_B.id, name: ORCHARD_B.name });
    expect(cells()).toEqual(['first-from', 'band-0-upTo', 'band-0-rent', 'band-1-from', 'band-1-upTo', 'band-1-rent', 'labour', 'tax']);
    expect([cell('first-from').props.value, cell('band-1-from').props.value]).toEqual(['10', '61']);
    expect(texts()).toContain('From – Up to (kg)');
    // The weights between 41 and 60 pay the default rate: said under the band.
    expect(texts().some(s => s.includes('default rate'))).toBe(true);
    type('first-from', '5');
    expect(latest.firstFrom).toBe(5);
    expect(latest.firstFromText).toBe('5');
    type('band-1-from', '50');
    expect(latest.bands[1].fromText).toBe('50');
    expect(texts()).toContain('Bags outside these weights pay the default rate.');
  });

  it('a default rate has no From cell: it is text', async () => {
    await mount(garlicRows(), 'garlic');
    expect(cells().some(id => id.endsWith('from'))).toBe(false);
  });
});

describe('large text and the fallback', () => {
  it('at font scale 1.3 draws the card-per-band editor with the shared labour and tax under it', async () => {
    screen(392, 1.3);
    await mount(garlicRows(), 'garlic');
    expect(tree!.root.findAll(n => n.props.testID === 'bands-table-stacked').length).toBeGreaterThan(0);
    expect(tree!.root.findAllByType(TextInput).filter(n => n.props.testID === 'band-0-rent')).toHaveLength(0);
    const inputs = tree!.root.findAllByType(Input);
    expect(inputs.map(n => n.props.label)).toEqual([
      'Up to', 'Rent per bag, per month', 'Up to', 'Rent per bag, per month', 'Labour per bag', 'Tax',
    ]);
    // The same draft and setters: typing in a card reaches the draft.
    act(() => inputs[0].props.onChangeText('50'));
    expect(latest.bands[0].upTo).toBe('50');
    act(() => inputs[4].props.onChangeText('4'));
    expect(latest.labour).toBe('4');
    expect(tree!.root.findAll(n => n.props.testID === 'add-band').length).toBeGreaterThan(0);
  });

  it('at font scale 1.29 still draws the table', async () => {
    screen(392, 1.29);
    await mount(garlicRows(), 'garlic');
    expect(cells()).toContain('band-0-rent');
  });
});

describe('what a screen reader hears', () => {
  it('labels each cell with the field, the band and the unit', async () => {
    await mount(garlicRows(), 'garlic');
    expect(cell('band-0-rent').props.accessibilityLabel).toBe('Rent, 0 to 40 kg, rupees per bag, per month');
    expect(cell('band-1-upTo').props.accessibilityLabel).toBe('Up to, 41 to 100 kg, kilograms');
    expect(cell('labour').props.accessibilityLabel).toBe('Labour, all weight bands, rupees per bag');
    expect(cell('tax').props.accessibilityLabel).toBe('Tax, all weight bands, percent');
  });

  it('puts the error of a row in the cell hint and in a line under the row', async () => {
    await mount(garlicRows(), 'garlic', { showErrors: true });
    type('band-1-rent', '');
    const message = 'Enter a rent of 0 or more.';
    expect(cell('band-1-rent').props.accessibilityHint).toBe(message);
    expect(cell('band-0-rent').props.accessibilityHint).toBeUndefined();
    const line = tree!.root.findAll(n => n.props.testID === 'band-1-error')[0];
    expect(line.props.accessibilityRole).toBe('alert');
    expect(line.props.children).toBe(message);
    // The ring of a wrong cell is the error ring.
    expect(flat(cell('band-1-rent').props.style).borderColor).toBe(lightTokens.status.negative.border);
  });

  it('shows the error of the bands as a whole under the table', async () => {
    const { draft, context } = open(garlicRows(), 'garlic');
    await act(async () => { tree = create(<BandsTable draft={draft} ctx={context} errors={{ bands: 'The bands overlap.' }} onChange={jest.fn()} />); });
    expect(texts()).toContain('The bands overlap.');
  });
});

describe('the Next key and reading', () => {
  it('registers every cell under its key and passes Next on', async () => {
    const registered: string[] = [];
    const registry: FieldRegistry = { register: jest.fn((key: string, node: unknown) => { if (node) registered.push(key); }), onFocus: jest.fn(), next: jest.fn() };
    await mount(garlicRows(), 'garlic', { fields: registry });
    expect(registered).toEqual(['band.0.upTo', 'band.0.rent', 'band.1.upTo', 'band.1.rent', 'labour', 'tax']);
    act(() => cell('band-1-upTo').props.onFocus());
    expect(registry.onFocus).toHaveBeenCalledWith('band.1.upTo');
    act(() => cell('band-1-upTo').props.onSubmitEditing());
    expect(registry.next).toHaveBeenCalledWith('band.1.upTo');
  });

  it('a read-only table cannot be typed in, has no remove control, no Add band and no hint', async () => {
    await mount(garlicRows(), 'garlic', { readOnly: true });
    expect(cell('band-0-rent').props.editable).toBe(false);
    expect(tree!.root.findAll(n => typeof n.props.testID === 'string' && (n.props.testID.endsWith('-remove') || n.props.testID === 'add-band'))).toHaveLength(0);
    expect(texts()).not.toContain('Tap a figure to change it.');
  });

  it('shows a tag under the band it belongs to', async () => {
    await mount(garlicRows(), 'garlic', { tags: ['standard', 'item'] });
    const tags = tree!.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('band-tag-') && n.props.label);
    expect(tags.map(n => `${n.props.testID}:${n.props.label}`)).toEqual(['band-tag-0:Standard', 'band-tag-1:This item']);
  });
});
