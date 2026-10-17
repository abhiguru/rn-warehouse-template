/** "View default rate" on the Add customer rate form: Band | Rent | Labour | Tax %, one labelled row per default band. */
import React from 'react';
import * as ReactNative from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DefaultRatesTable } from '@/features/item-pricing/components/DefaultRatesTable';
import { bandText } from '@/features/item-pricing/rateText';
import type { BandRow } from '@/features/item-pricing/components/BandList';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const bands: BandRow[] = [
  { id: 'b1', weight_min: 0, weight_max: 40, unit_price: 12, labour_rate: 1.5, tax_percent: 5 },
  { id: 'b2', weight_min: 40, weight_max: 60, unit_price: 14.25, labour_rate: 2, tax_percent: 12.5 },
];

function draw(oneTime: boolean) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<DefaultRatesTable bands={bands} oneTime={oneTime} />);
  });
  return tree;
}
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(ReactNative.Text).map(n => [n.props.children].flat(Infinity).join(''));
const bandName = (i: number) => bandText(bands[i].weight_min, bands[i].weight_max);
const row = (tree: ReactTestRenderer, i: number) => tree.root.findAll(n => n.props.testID === `add-rate-default-${i}` && typeof n.type === 'string')[0];

describe('DefaultRatesTable', () => {
  it('shows a heading row and one row per band, each figure in its column', () => {
    const tree = draw(false);
    const all = texts(tree);
    expect(all).toHaveLength(12);
    expect(all.slice(0, 4)).toEqual(['Band', 'Rent', 'Labour', 'Tax %']);
    expect(all.slice(4)).toEqual([bandName(0), '12.00', '1.50', '5', bandName(1), '14.25', '2.00', '12.5']);
    act(() => tree.unmount());
  });

  it('gives every row its own screen-reader label with its band and figures', () => {
    const tree = draw(false);
    expect(row(tree, 0).props.accessible).toBe(true);
    expect(row(tree, 0).props.accessibilityLabel).toContain('12.00');
    expect(row(tree, 0).props.accessibilityLabel).toContain('1.50');
    expect(row(tree, 1).props.accessibilityLabel).toContain('14.25');
    expect(row(tree, 1).props.accessibilityLabel).toContain('12.5');
    expect(row(tree, 0).props.accessibilityLabel).not.toBe(row(tree, 1).props.accessibilityLabel);
    act(() => tree.unmount());
  });

  it('a one-time rate has no Labour column and its label says no labour', () => {
    const tree = draw(true);
    expect(texts(tree)).not.toContain('Labour');
    expect(texts(tree)).not.toContain('1.50');
    expect(texts(tree)).toHaveLength(9);
    expect(row(tree, 0).props.accessibilityLabel).not.toContain('1.50');
    act(() => tree.unmount());
  });
});
