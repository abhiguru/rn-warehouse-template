/**
 * The weight-band editor: whole kilograms, bands that follow on, one field per line.
 */
import React, { useState } from 'react';
import { Dimensions, Text } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Input } from '@/components/ui/Input';
import { BandsEditor } from '@/features/item-pricing/components/BandsEditor';
import { initialDraft, setUpTo, validate, type Draft, type EditorContext } from '@/features/item-pricing/editModel';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

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
let tree: ReactTestRenderer | undefined;
beforeEach(() => atTextSize(1));
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  Dimensions.set({ window: WINDOW });
});

const mount = async () => {
  const { draft, context } = opened();
  await act(async () => { tree = create(<Harness start={draft} ctx={context} />); });
  return tree!;
};
const inputs = (t: ReactTestRenderer) => t.root.findAllByType(Input);
const texts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const upTo = (t: ReactTestRenderer, i: number) => inputs(t).filter(n => n.props.label?.startsWith('Up to'))[i];

it('uses Input for every number and number-pad for the weights', async () => {
  const t = await mount();
  const up = inputs(t).filter(n => n.props.label === 'Up to');
  const rent = inputs(t).filter(n => n.props.label === 'Rent per bag, per month');
  expect(up).toHaveLength(2);
  expect(rent).toHaveLength(2);
  expect(up.every(n => n.props.keyboardType === 'number-pad' && n.props.numeric)).toBe(true);
  expect(rent.every(n => n.props.keyboardType === 'decimal-pad' && n.props.numeric)).toBe(true);
  expect(up.every(n => n.props.returnKeyType === 'next')).toBe(true);
});

it('typing 40.5 shows the whole-kilograms error and leaves band 2 starting at 41 kg', async () => {
  const t = await mount();
  await act(async () => { upTo(t, 0).props.onChangeText('40.5'); });
  expect(upTo(t, 0).props.error).toBe('Enter whole kilograms, for example 40.');
  expect(texts(t)).toContain('From 41 kg');
  expect(texts(t)).not.toContain('From 42 kg');
});

it('typing 60 on band 1 moves the start of band 2 to 61 kg', async () => {
  const t = await mount();
  expect(texts(t)).toContain('From 41 kg');
  await act(async () => { upTo(t, 0).props.onChangeText('60'); });
  expect(texts(t)).toContain('From 61 kg');
  expect(latest.bands[0].upTo).toBe('60');
});

it('shows what each band is now under its rent', async () => {
  const t = await mount();
  const rent = inputs(t).filter(n => n.props.label === 'Rent per bag, per month');
  expect(rent.map(n => n.props.helperText)).toEqual(['Now ₹6.00', 'Now ₹9.50']);
});

it('splits the last band and removes a band by its button', async () => {
  const t = await mount();
  const add = t.root.findAll(n => n.props.accessibilityLabel === 'Add weight band' || n.props.children === 'Add weight band')[0];
  expect(add).toBeDefined();
  await act(async () => { t.root.findAll(n => typeof n.props.onPress === 'function' && n.props.children === 'Add weight band')[0].props.onPress(); });
  expect(latest.bands.map(b => b.upTo)).toEqual(['40', '70', '100']);
  const remove = t.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Remove the 71 to 100 kg band');
  expect(remove.length).toBeGreaterThan(0);
  await act(async () => { remove[0].props.onPress(); });
  // The band before takes over the weights of the one removed.
  expect(latest.bands.map(b => b.upTo)).toEqual(['40', '100']);
});

it('has no remove button for a single band', async () => {
  const { draft, context } = initialDraft({ mode: 'change', params: { mode: 'change', item_id: 'garlic', price_type: 'monthly' }, rows: [row(0, 100, 6)], role: 'admin', today: '2026-10-14' });
  await act(async () => { tree = create(<Harness start={setUpTo(draft, 0, '100')} ctx={context} />); });
  expect(tree!.root.findAll(n => String(n.props.accessibilityLabel ?? '').startsWith('Remove the'))).toHaveLength(0);
});

it('puts From above Up to at text size 2 and beside it at text size 1', async () => {
  const flexDirection = (t: ReactTestRenderer) =>
    [t.root.findAll(n => n.props.testID === 'band-0-span')[0].props.style].flat(Infinity).find(s => s?.flexDirection)?.flexDirection;
  const small = await mount();
  expect(flexDirection(small)).toBe('row');
  act(() => small.unmount());
  tree = undefined;
  atTextSize(2);
  const big = await mount();
  expect(flexDirection(big)).toBe('column');
});

it('imports no TextInput and no Modal of its own', () => {
  const source = readFileSync(join(__dirname, '../../features/item-pricing/components/BandsEditor.tsx'), 'utf8');
  expect(source).not.toMatch(/\bTextInput\b/);
  expect(source).not.toMatch(/\bModal\b/);
});
