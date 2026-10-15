/** The Rates rows at large text: the rent drops under the name (as on the Item pricing list) so nothing is cut. */
import React from 'react';
import * as ReactNative from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnRatesSection } from '../GrnRatesSection';
import type { PricedRow } from '../grnRateModel';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const row: PricedRow = {
  key: 'gur|12', item_id: 'gur', item_name: 'Fictional Gur', weight: 12,
  rate: { source: 'item', weight_min: 0, weight_max: 50, unit_price: 3, labour_rate: 1.5, tax_percent: 5 },
};

function figureColumn(fontScale: number) {
  mockFontScale = fontScale;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <GrnRatesSection rows={[row]} status="ready" offline={false} oneTime={false} day="2026-10-12" onChange={jest.fn()} onAdd={jest.fn()} onUndo={jest.fn()} onRetry={jest.fn()} />,
    );
  });
  const rent = tree.root.find(n => n.props.testID === 'grn-rate-rent-0' && n.type === ReactNative.Text);
  const top = rent.parent!.parent!.parent!;
  const result = {
    direction: ReactNative.StyleSheet.flatten(top.props.style).flexDirection,
    align: ReactNative.StyleSheet.flatten(rent.parent!.props.style).alignItems,
  };
  act(() => tree.unmount());
  return result;
}

it('puts the rent on the right at normal text and under the name at large text', () => {
  expect(figureColumn(1)).toEqual({ direction: 'row', align: 'flex-end' });
  expect(figureColumn(1.6)).toEqual({ direction: 'column', align: 'flex-start' });
});
