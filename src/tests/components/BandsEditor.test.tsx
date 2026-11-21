/**
 * The weight-band editor: whole kilograms, bands that follow on, one field per line.
 */
import React, { useState } from 'react';
import { Dimensions } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BandsEditor } from '@/features/item-pricing/components/BandsEditor';
import { initialDraft, setUpTo, validate, type Draft, type EditorContext } from '@/features/item-pricing/editModel';
import { setLanguage, t } from '@/i18n';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const row = (min: number, max: number, rent: number): ItemStoragePrice => ({
  id: `r${min}`, item_id: 'garlic', item_name: 'Review Garlic Desi', customer_id: null, customer_name: null, price_type: 'monthly',
  unit_price: rent, weight_min: min, weight_max: max, labour_rate: 2.5, tax_percent: 5,
  effective_from: '2025-01-01', effective_to: null, created_at: '', created_by: '',
});
const rows = [row(0, 40, 6), row(41, 100, 9.5)];
const opened = () => initialDraft({ mode: 'change', params: { mode: 'change', item_id: 'garlic', price_type: 'monthly' }, rows, role: 'admin', today: '2026-10-14' });

let latest: Draft;
function Harness({ start, ctx }: { start: Draft; ctx: EditorContext }) {
  const [draft, setDraft] = useState(start);
  latest = draft;
  // Errors as the screen shows them once a first save was tried.
  return <BandsEditor draft={draft} ctx={ctx} errors={validate(draft, ctx).errors} onChange={setDraft} />;
}

const WINDOW = Dimensions.get('window');
const atTextSize = (fontScale: number) => Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
beforeEach(() => atTextSize(1));
afterEach(() => {
  Dimensions.set({ window: WINDOW });
  setLanguage('en');
});

const mount = async () => {
  const { draft, context } = opened();
  await render(<Harness start={draft} ctx={context} />);
};
const upToFields = () => screen.getAllByLabelText(/^Up to/);
const rentFields = () => screen.getAllByLabelText(/^Rent per bag, per month/);
/** Replaces what is in the field with `text`, as a person selecting all and typing. */
const retype = async (field: ReturnType<typeof screen.getByLabelText>, text: string) => {
  const user = userEvent.setup({ delay: 0 });
  await user.clear(field);
  await user.paste(field, text);
};

it('uses Input for every number and number-pad for the weights', async () => {
  await mount();
  const up = upToFields();
  const rent = rentFields();
  expect(up).toHaveLength(2);
  expect(rent).toHaveLength(2);
  up.forEach(n => {
    expect(n).toHaveProp('keyboardType', 'number-pad');
    expect(n).toHaveProp('returnKeyType', 'next');
  });
  rent.forEach(n => expect(n).toHaveProp('keyboardType', 'decimal-pad'));
  // `numeric` is not a prop of the field on screen: it shows as the digits of the language (Gujarati digits in Gujarati).
  await screen.unmount();
  setLanguage('gu');
  await mount();
  // The labels are Gujarati too; the fields are found by their Gujarati names.
  expect(screen.getAllByLabelText(new RegExp(`^${t('pricing.edit.upTo')}`))[0]).toHaveDisplayValue('૪૦');
  expect(screen.getAllByLabelText(new RegExp(`^${t('pricing.edit.rentMonthly')}`))[1]).toHaveDisplayValue('૯.૫૦');
});

it('typing 40.5 shows the whole-kilograms error and leaves band 2 starting at 41 kg', async () => {
  await mount();
  await retype(upToFields()[0], '40.5');
  expect(screen.getByText('Enter whole kilograms, for example 40.')).toBeOnTheScreen();
  expect(screen.getByText('From 41 kg')).toBeOnTheScreen();
  expect(screen.queryByText('From 42 kg')).not.toBeOnTheScreen();
});

it('typing 60 on band 1 moves the start of band 2 to 61 kg', async () => {
  await mount();
  expect(screen.getByText('From 41 kg')).toBeOnTheScreen();
  await retype(upToFields()[0], '60');
  expect(screen.getByText('From 61 kg')).toBeOnTheScreen();
  expect(latest.bands[0].upTo).toBe('60');
});

it('shows what each band is now under its rent', async () => {
  await mount();
  expect(screen.getByText('Now ₹6.00')).toBeOnTheScreen();
  expect(screen.getByText('Now ₹9.50')).toBeOnTheScreen();
  // Each under its own rent field: the rents are in the bands' order.
  expect(rentFields()[0]).toHaveDisplayValue('6.00');
  expect(rentFields()[1]).toHaveDisplayValue('9.50');
});

it('adds an empty band after the last and removes a band by its button', async () => {
  await mount();
  const user = userEvent.setup({ delay: 0 });
  await user.press(screen.getByRole('button', { name: 'Add weight band' }));
  expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100', '']);
  expect(screen.getAllByText('From 101 kg')[0]).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Remove the From 101 kg band' }));
  // The band just added has no weights to hand over: the band before keeps its own.
  expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100']);
});

it('has no remove button for a single band', async () => {
  const { draft, context } = initialDraft({ mode: 'change', params: { mode: 'change', item_id: 'garlic', price_type: 'monthly' }, rows: [row(0, 100, 6)], role: 'admin', today: '2026-10-14' });
  await render(<Harness start={setUpTo(draft, 0, '100')} ctx={context} />);
  expect(screen.queryByRole('button', { name: /^Remove the/ })).not.toBeOnTheScreen();
});

it('puts From above Up to at text size 2 and beside it at text size 1', async () => {
  // The span has no role or label: its testID is the only handle on it.
  await mount();
  expect(screen.getByTestId('band-0-span')).toHaveStyle({ flexDirection: 'row' });
  await screen.unmount();
  atTextSize(2);
  await mount();
  expect(screen.getByTestId('band-0-span')).toHaveStyle({ flexDirection: 'column' });
});

it('imports no TextInput and no Modal of its own', () => {
  const source = readFileSync(join(__dirname, '../../features/item-pricing/components/BandsEditor.tsx'), 'utf8');
  expect(source).not.toMatch(/\bTextInput\b/);
  expect(source).not.toMatch(/\bModal\b/);
});
