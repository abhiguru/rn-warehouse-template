/**
 * Fixture F1 of the pricing spec (Review North names, today = 2026-10-14) and small finders for
 * the rate editor's tests. Not a test file: it holds no jest.mock.
 */
import { Text } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Input } from '@/components/ui/Input';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';

let seq = 0;
export const rate = (
  item_id: string,
  customer: { id: string; name: string } | null,
  min: number,
  max: number,
  unit_price: number,
  labour_rate: number,
  tax_percent: number,
  effective_from: string,
  effective_to: string | null,
  price_type: PriceType = 'monthly',
  item_name = item_id
): ItemStoragePrice => ({
  id: `rate-${(seq += 1)}`,
  item_id,
  item_name,
  customer_id: customer?.id ?? null,
  customer_name: customer?.name ?? null,
  price_type,
  unit_price,
  weight_min: min,
  weight_max: max,
  labour_rate,
  tax_percent,
  effective_from,
  effective_to,
  created_at: '',
  created_by: '',
});

export const ORCHARD_B = { id: 'cust-b', name: 'Review Orchard B' };

export const cuminRows = () => [
  rate('cumin', null, 0, 100, 10, 3, 5, '2025-01-01', '2026-03-31', 'monthly', 'Review Cumin Bold'),
  rate('cumin', null, 0, 100, 11, 3, 5, '2026-04-01', null, 'monthly', 'Review Cumin Bold'),
];
export const garlicRows = () => [
  rate('garlic', null, 0, 40, 6, 2.5, 5, '2025-01-01', null, 'monthly', 'Review Garlic Desi'),
  rate('garlic', null, 41, 100, 9.5, 2.5, 5, '2025-01-01', null, 'monthly', 'Review Garlic Desi'),
];
export const onionRows = () => [
  rate('onion', null, 0, 100, 3.5, 1.5, 5, '2025-01-01', null, 'monthly', 'Review Onion Red'),
  rate('onion', ORCHARD_B, 0, 100, 3, 1.5, 5, '2026-01-01', null, 'monthly', 'Review Onion Red'),
];
export const gingerRows = () => [rate('ginger', null, 0, 100, 8, 2, 5, '2025-01-01', null, 'monthly', 'Review Ginger Fresh')];

export const textsOf = (tree: ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));

export const inputsWithLabel = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(Input).filter(n => n.props.label === label);

/** The chip of a radio group (ChoiceChips). */
export const chip = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

export const chipState = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')
    .map(n => `${n.props.accessibilityLabel}:${n.props.accessibilityState?.selected ? 'on' : 'off'}`);
