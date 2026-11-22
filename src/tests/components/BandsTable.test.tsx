/**
 * The editable band table: a cell per figure, the setters behind them, shared or per-band labour and tax,
 * a customer's From cells, the card-per-band fallback for large text and narrow screens, and what a screen
 * reader hears.
 */
import React, { useState } from 'react';
import { Dimensions } from 'react-native';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { BandsTable } from '@/features/item-pricing/components/BandsTable';
import type { FieldRegistry } from '@/features/item-pricing/components/fieldLink';
import { initialDraft, validate, type Draft, type EditorContext } from '@/features/item-pricing/editModel';
import type { ItemStoragePrice } from '@/types/item-pricing.types';
import { ORCHARD_B, garlicRows, onionRows, rate, textsOf } from '@/tests/helpers/rateEditorFixtures';
import { getTokens } from '@/theme/tokens';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

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
const setWindow = (width: number, fontScale: number) => Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } });
beforeEach(() => {
  onChange = jest.fn();
  setWindow(392, 1);
});
afterEach(() => {
  Dimensions.set({ window: WINDOW });
});

async function mount(rows: ItemStoragePrice[], itemId: string, props: Partial<React.ComponentProps<typeof Harness>> = {}, customer?: { id: string; name: string }) {
  const { draft, context } = open(rows, itemId, customer);
  await render(<Harness start={draft} ctx={context} {...props} />);
}
const cell = (id: string) => screen.getByTestId(id);
const cells = () => screen.queryAllByDisplayValue(/^/).map(n => n.props.testID as string);
/** Replace what a cell holds with `text`, as one paste (one change). */
const type = async (id: string, text: string) => {
  await userEvent.paste(cell(id), text);
};
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const addBand = () => screen.getByRole('button', { name: 'Add weight band' });

describe('shared labour and tax (the bands do not differ)', () => {
  it('shows a cell for the Up to and the rent of each band, From as text, labour and tax as two rows', async () => {
    await mount(garlicRows(), 'garlic');
    expect(cells()).toEqual(['band-0-upTo', 'band-0-rent', 'band-1-upTo', 'band-1-rent', 'labour', 'tax']);
    const shownValues = ['40', '6.00', '100', '9.50', '2.50', '5'];
    ['band-0-upTo', 'band-0-rent', 'band-1-upTo', 'band-1-rent', 'labour', 'tax'].forEach((id, i) => expect(cell(id)).toHaveDisplayValue(shownValues[i]));
    for (const text of ['Up to (kg)', 'Rent (₹)', '0 –', '41 –', 'Labour (₹)', 'Tax (%)', 'Tap a figure to change it.']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    // The per-band columns are not there.
    expect(textsOf().filter(s => s === 'Labour (₹)' || s === 'Tax (%)')).toHaveLength(2);
    expect(screen.getAllByTestId('labour-row')).toHaveLength(1);
  });

  it('opens a number pad, selects the text on focus and keeps a touch-sized cell', async () => {
    await mount(garlicRows(), 'garlic');
    const upTo = cell('band-0-upTo');
    const rent = cell('band-0-rent');
    expect(upTo).toHaveProp('keyboardType', 'number-pad');
    expect(upTo).toHaveProp('selectTextOnFocus', true);
    expect(upTo).toHaveProp('returnKeyType', 'next');
    expect(rent).toHaveProp('keyboardType', 'decimal-pad');
    expect(rent).toHaveProp('selectTextOnFocus', true);
    expect(rent).toHaveProp('returnKeyType', 'next');
    expect(cell('tax')).toHaveProp('returnKeyType', 'done');
    expect(flat(rent.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(rent).toHaveProp('maxFontSizeMultiplier', 1.3);
  });

  it('draws the 2 px focus ring only on the focused cell', async () => {
    await mount(garlicRows(), 'garlic');
    expect(cell('band-0-rent')).toHaveStyle({ borderWidth: 2, borderColor: 'transparent' });
    await fireEvent(cell('band-0-rent'), 'focus', {});
    expect(cell('band-0-rent')).toHaveStyle({ borderColor: lightTokens.border.fieldFocus });
    expect(cell('band-1-rent')).toHaveStyle({ borderColor: 'transparent' });
    await fireEvent(cell('band-0-rent'), 'blur', {});
    expect(cell('band-0-rent')).toHaveStyle({ borderColor: 'transparent' });
  });

  it('typing in a cell calls the setters: Up to moves the From of the next band, rent, labour and tax land in the draft', async () => {
    await mount(garlicRows(), 'garlic');
    await type('band-0-upTo', '60');
    expect(latest.bands[0].upTo).toBe('60');
    expect(screen.getByText('61 –')).toBeOnTheScreen();
    await type('band-1-rent', '10.25');
    await type('labour', '3');
    await type('tax', '12');
    expect([latest.bands[1].rent, latest.labour, latest.tax]).toEqual(['10.25', '3', '12']);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('adds an empty band and removes one by its button; a single band has no remove control', async () => {
    await mount(garlicRows(), 'garlic');
    await userEvent.press(addBand());
    expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100', '']);
    expect(cells()).toContain('band-2-rent');
    expect(screen.getByText('101 –')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Remove the From 101 kg band' }));
    expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100']);

    // Down to one band: no remove controls.
    await userEvent.press(screen.getByTestId('band-1-remove'));
    expect(latest.bands).toHaveLength(1);
    expect(screen.queryAllByTestId(/-remove$/)).toHaveLength(0);
  });

  it('Add band is off with a reason until the last "Up to" is a whole number', async () => {
    await mount(garlicRows(), 'garlic');
    expect(addBand()).toBeEnabled();
    await userEvent.press(addBand());
    // The new band starts at 101 kg and has an empty "Up to"; another one waits for it.
    expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100', '']);
    expect(addBand()).toBeDisabled();
    expect(screen.getByText('Enter the "Up to" weight of the last band first.')).toBeOnTheScreen();
    await type('band-2-upTo', '150');
    expect(addBand()).toBeEnabled();
    expect(screen.queryByText('Enter the "Up to" weight of the last band first.')).not.toBeOnTheScreen();
  });

  it('a one-time rate has no labour row, only the note, and a tax row', async () => {
    const once = [rate('garlic', null, 0, 100, 9, 0, 5, '2025-01-01', null, 'one_time', 'Review Garlic Desi')];
    const { draft, context } = initialDraft({ mode: 'change', params: { mode: 'change', item_id: 'garlic', price_type: 'one_time' }, rows: once, role: 'admin', today: TODAY });
    await render(<Harness start={draft} ctx={context} />);
    expect(cells()).toEqual(['band-0-upTo', 'band-0-rent', 'tax']);
    expect(screen.getByText('Labour is included in a one-time rate.')).toBeOnTheScreen();
  });
});

describe('labour and tax that differ per band', () => {
  const perBandRows = () => [
    rate('garlic', null, 0, 40, 6, 2, 5, '2025-01-01', null, 'monthly', 'Review Garlic Desi'),
    rate('garlic', null, 41, 100, 9.5, 3, 12, '2025-01-01', null, 'monthly', 'Review Garlic Desi'),
  ];

  it('are columns of their own, with a cell in every band and no shared rows', async () => {
    setWindow(700, 1);
    await mount(perBandRows(), 'garlic');
    expect(cells()).toEqual(['band-0-upTo', 'band-0-rent', 'band-0-labour', 'band-0-tax', 'band-1-upTo', 'band-1-rent', 'band-1-labour', 'band-1-tax']);
    for (const text of ['Up to (kg)', 'Rent (₹)', 'Labour (₹)', 'Tax (%)']) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('labour-row')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('tax-row')).not.toBeOnTheScreen();
    expect(cell('band-1-labour')).toHaveDisplayValue('3.00');
    expect(cell('band-1-tax')).toHaveDisplayValue('12');
    await type('band-1-labour', '3.5');
    await type('band-0-tax', '18');
    expect([latest.bands[1].labour, latest.bands[0].tax]).toEqual(['3.5', '18']);
  });

  it('too many columns for the width fall back to the cards', async () => {
    setWindow(360, 1);
    await mount(perBandRows(), 'garlic');
    expect(screen.getAllByTestId('bands-table-stacked').length).toBeGreaterThan(0);
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
    expect(cell('first-from')).toHaveDisplayValue('10');
    expect(cell('band-1-from')).toHaveDisplayValue('61');
    expect(screen.getByText('From – Up to (kg)')).toBeOnTheScreen();
    // The weights between 41 and 60 pay the default rate: said under the band.
    expect(textsOf().some(s => s.includes('default rate'))).toBe(true);
    await type('first-from', '5');
    expect(latest.firstFrom).toBe(5);
    expect(latest.firstFromText).toBe('5');
    await type('band-1-from', '50');
    expect(latest.bands[1].fromText).toBe('50');
    expect(screen.getByText('Bags outside these weights pay the default rate.')).toBeOnTheScreen();
  });

  it('a default rate has no From cell: it is text', async () => {
    await mount(garlicRows(), 'garlic');
    expect(cells().some(id => id.endsWith('from'))).toBe(false);
  });
});

describe('large text and the fallback', () => {
  it('at font scale 1.3 draws the card-per-band editor with the shared labour and tax under it', async () => {
    setWindow(392, 1.3);
    await mount(garlicRows(), 'garlic');
    expect(screen.getAllByTestId('bands-table-stacked').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('band-0-rent')).not.toBeOnTheScreen();
    const inputs = screen.getAllByDisplayValue(/^/);
    expect(inputs.map(n => n.props.accessibilityLabel)).toEqual([
      'Up to, required', 'Rent per bag, per month, required', 'Up to, required', 'Rent per bag, per month, required', 'Labour per bag, required', 'Tax, required',
    ]);
    // The same draft and setters: typing in a card reaches the draft.
    await userEvent.clear(inputs[0]);
    await userEvent.paste(inputs[0], '50');
    expect(latest.bands[0].upTo).toBe('50');
    await userEvent.clear(inputs[4]);
    await userEvent.paste(inputs[4], '4');
    expect(latest.labour).toBe('4');
    expect(screen.getAllByTestId('add-band').length).toBeGreaterThan(0);
  });

  it('at font scale 1.29 still draws the table', async () => {
    setWindow(392, 1.29);
    await mount(garlicRows(), 'garlic');
    expect(cells()).toContain('band-0-rent');
  });
});

describe('what a screen reader hears', () => {
  it('labels each cell with the field, the band and the unit', async () => {
    await mount(garlicRows(), 'garlic');
    expect(cell('band-0-rent')).toHaveAccessibleName('Rent, 0 to 40 kg, rupees per bag, per month');
    expect(cell('band-1-upTo')).toHaveAccessibleName('Up to, 41 to 100 kg, kilograms');
    expect(cell('labour')).toHaveAccessibleName('Labour, all weight bands, rupees per bag');
    expect(cell('tax')).toHaveAccessibleName('Tax, all weight bands, percent');
  });

  it('puts the error of a row in the cell hint and in a line under the row', async () => {
    await mount(garlicRows(), 'garlic', { showErrors: true });
    await type('band-1-rent', '');
    const message = 'Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.';
    expect(cell('band-1-rent')).toHaveProp('accessibilityHint', message);
    expect(cell('band-0-rent').props.accessibilityHint).toBeUndefined();
    expect(screen.getByRole('alert', { name: message })).toHaveProp('testID', 'band-1-error');
    // The ring of a wrong cell is the error ring.
    expect(cell('band-1-rent')).toHaveStyle({ borderColor: lightTokens.status.negative.border });
  });

  it('shows the error of the bands as a whole under the table', async () => {
    const { draft, context } = open(garlicRows(), 'garlic');
    await render(<BandsTable draft={draft} ctx={context} errors={{ bands: 'The bands overlap.' }} onChange={jest.fn()} />);
    expect(screen.getByText('The bands overlap.')).toBeOnTheScreen();
  });
});

describe('the Next key and reading', () => {
  it('registers every cell under its key and passes Next on', async () => {
    const registered: string[] = [];
    const registry: FieldRegistry = { register: jest.fn((key: string, node: unknown) => { if (node) registered.push(key); }), onFocus: jest.fn(), next: jest.fn() };
    await mount(garlicRows(), 'garlic', { fields: registry });
    expect(registered).toEqual(['band.0.upTo', 'band.0.rent', 'band.1.upTo', 'band.1.rent', 'labour', 'tax']);
    await fireEvent(cell('band-1-upTo'), 'focus', {});
    expect(registry.onFocus).toHaveBeenCalledWith('band.1.upTo');
    await fireEvent(cell('band-1-upTo'), 'submitEditing', {});
    expect(registry.next).toHaveBeenCalledWith('band.1.upTo');
  });

  it('a read-only table cannot be typed in, has no remove control, no Add band and no hint', async () => {
    await mount(garlicRows(), 'garlic', { readOnly: true });
    expect(cell('band-0-rent')).toHaveProp('editable', false);
    expect(screen.queryAllByTestId(/-remove$/)).toHaveLength(0);
    expect(screen.queryByTestId('add-band')).not.toBeOnTheScreen();
    expect(screen.queryByText('Tap a figure to change it.')).not.toBeOnTheScreen();
  });

  it('shows a tag under the band it belongs to', async () => {
    await mount(garlicRows(), 'garlic', { tags: ['standard', 'item'] });
    const tags = screen.queryAllByTestId(/^band-tag-/);
    expect(tags.map(n => `${n.props.testID}:${within(n).queryAllByText(/[\s\S]*/).map(x => [x.props.children].flat(Infinity).join('')).join('')}`)).toEqual(['band-tag-0:Standard', 'band-tag-1:This item']);
  });
});
