/** "View default rate" on the Add customer rate form: Band | Rent | Labour | Tax %, one labelled row per default band. */
import React from 'react';
import * as ReactNative from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { DefaultRatesTable } from '@/features/item-pricing/components/DefaultRatesTable';
import { bandText } from '@/features/item-pricing/rateText';
import type { BandRow } from '@/features/item-pricing/components/BandList';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const bands: BandRow[] = [
  { id: 'b1', weight_min: 0, weight_max: 40, unit_price: 12, labour_rate: 1.5, tax_percent: 5 },
  { id: 'b2', weight_min: 40, weight_max: 60, unit_price: 14.25, labour_rate: 2, tax_percent: 12.5 },
];

async function draw(oneTime: boolean) {
  await render(<DefaultRatesTable bands={bands} oneTime={oneTime} />);
}
/** Every text on the screen, in the order drawn. */
const texts = () => screen.queryAllByText(/.+/).map(n => [n.props.children].flat(Infinity).join(''));
const bandName = (i: number) => bandText(bands[i].weight_min, bands[i].weight_max);
// A row has no role or text of its own: its testID is the way to it.
const row = (i: number) => screen.getByTestId(`add-rate-default-${i}`);

const WINDOW = ReactNative.Dimensions.get('window');
const setWindow = (fontScale: number) => ReactNative.Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
beforeEach(() => setWindow(1));
afterEach(() => ReactNative.Dimensions.set({ window: WINDOW }));

describe('DefaultRatesTable', () => {
  it('shows a heading row and one row per band, each figure in its column', async () => {
    await draw(false);
    const all = texts();
    expect(all).toHaveLength(12);
    expect(all.slice(0, 4)).toEqual(['Band', 'Rent', 'Labour', 'Tax %']);
    expect(all.slice(4)).toEqual([bandName(0), '12.00', '1.50', '5', bandName(1), '14.25', '2.00', '12.5']);
  });

  it('gives every row its own screen-reader label with its band and figures', async () => {
    await draw(false);
    expect(row(0).props.accessible).toBe(true);
    expect(row(0).props.accessibilityLabel).toContain('12.00');
    expect(row(0).props.accessibilityLabel).toContain('1.50');
    expect(row(1).props.accessibilityLabel).toContain('14.25');
    expect(row(1).props.accessibilityLabel).toContain('12.5');
    expect(row(0).props.accessibilityLabel).not.toBe(row(1).props.accessibilityLabel);
  });

  it('a one-time rate has no Labour column and its label says no labour', async () => {
    await draw(true);
    expect(texts()).not.toContain('Labour');
    expect(texts()).not.toContain('1.50');
    expect(texts()).toHaveLength(9);
    expect(row(0).props.accessibilityLabel).not.toContain('1.50');
  });

  it('at large text Rent stays the one figure column and labour and tax go under the band', async () => {
    setWindow(2);
    await draw(false);
    expect(texts().map(x => x.replace(/\u00a0/g, ' '))).toEqual(['Band', 'Rent', bandName(0), 'Labour ₹1.50 · Tax 5%', '12.00', bandName(1), 'Labour ₹2.00 · Tax 12.5%', '14.25']);
  });

  it('at large text a one-time rate puts only the tax under the band', async () => {
    setWindow(2);
    await draw(true);
    expect(texts().map(x => x.replace(/\u00a0/g, ' '))).toEqual(['Band', 'Rent', bandName(0), 'Tax 5%', '12.00', bandName(1), 'Tax 12.5%', '14.25']);
  });
});
