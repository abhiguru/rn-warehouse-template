/** The Rates table of the Review step: four columns at normal text; at large text labour and tax move under the item. */
import React from 'react';
import * as ReactNative from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnRatesSection, rowA11y } from '../GrnRatesSection';
import type { PricedRow } from '../grnRateModel';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const row: PricedRow = {
  key: 'gur|12', item_id: 'gur', item_name: 'Fictional Gur', weight: 12,
  rate: { source: 'item', weight_min: 0, weight_max: 50, unit_price: 3, labour_rate: 1.5, tax_percent: 5 },
};

function layoutAt(fontScale: number) {
  mockFontScale = fontScale;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <GrnRatesSection rows={[row]} status="ready" offline={false} oneTime={false} day="2026-10-12" onChange={jest.fn()} onAdd={jest.fn()} onUndo={jest.fn()} onRetry={jest.fn()} />,
    );
  });
  const texts = tree.root.findAllByType(ReactNative.Text).map(n => [n.props.children].flat(Infinity).join('').replace(/\u00a0/g, ' '));
  act(() => tree.unmount());
  return texts;
}

it('is a table Item | Rent (₹) | Labour (₹) | Tax (%) at normal text, the figures in their cells', () => {
  expect(layoutAt(1)).toEqual(['Item', 'Rent (₹)', 'Labour (₹)', 'Tax (%)', 'Fictional Gur', '12 kg each', 'Item rate', '3.00', '1.50', '5', 'Change']);
});

it('at large text keeps the Rent column and moves labour and tax under the item', () => {
  expect(layoutAt(1.6)).toEqual(['Item', 'Rent (₹)', 'Fictional Gur', '12 kg each · Labour ₹1.50 · Tax 5%', 'Item rate', '3.00', 'Change']);
});

describe('the screen reader text names the item\'s packaging', () => {
  const priced = (packaging?: string) => ({
    key: 'k', item_id: 'i', item_name: 'Fictional Gur', weight: 12, packaging,
    rate: { source: 'item' as const, weight_min: 0, weight_max: 50, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5 },
  });
  it('says per box for a Box item', () => {
    expect(rowA11y(priced('Box'), false, '2026-10-12')).toContain('per box, per month, 0–50 kg, labour ₹1.50 per box, tax 5%');
  });
  it('says per bag when the packaging is unknown', () => {
    expect(rowA11y(priced(), false, '2026-10-12')).toContain('per bag, per month, 0–50 kg, labour ₹1.50 per bag, tax 5%');
  });
});
