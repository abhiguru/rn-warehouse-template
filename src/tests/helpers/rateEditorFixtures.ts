/**
 * Fixture F1 of the pricing spec (Review North names, today = 2026-10-14) and small finders for
 * the rate editor's tests. Not a test file: it holds no jest.mock.
 */
import { screen, within } from '@testing-library/react-native';
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

const shownText = (props: { children?: unknown }): string => [props.children].flat(Infinity).join('');

/** The text of every Text on the screen, in order (a Text inside another Text appears twice). */
export const textsOf = (): string[] => screen.queryAllByText(/[\s\S]*/).map(n => shownText(n.props));

/** The text fields whose label is `label` (a required field adds ", required"), in order. */
export const inputsWithLabel = (label: string) =>
  screen.queryAllByDisplayValue(/^/).filter(n => n.props.accessibilityLabel === label || n.props.accessibilityLabel === `${label}, required`);

/** The words a chip shows (its accessibilityLabel can be a date in words instead: "1 Nov 2026" for "01/11/26"). */
const chipText = (node: ReturnType<typeof screen.getByRole>): string =>
  within(node).queryAllByText(/[\s\S]*/).map(n => shownText(n.props)).join('');

const chips = () => screen.queryAllByRole('radio');

/** The chip of a radio group (ChoiceChips), found by the words it shows. */
export const chip = (label: string) => chips().find(n => chipText(n) === label)!;

/** The shown label of each chip and whether it is on. */
export const chipState = () => chips().map(n => `${chipText(n)}:${n.props.accessibilityState?.selected ? 'on' : 'off'}`);

/** For "not on the screen" counts: these also see nodes that are mounted but hidden (the old tree walk did). Positive checks use the visible helpers above. */
const HIDDEN = { includeHiddenElements: true } as const;
export const textsMounted = (): string[] => screen.queryAllByText(/[\s\S]*/, HIDDEN).map(n => shownText(n.props));
export const inputsWithLabelMounted = (label: string) =>
  screen.queryAllByDisplayValue(/^/, HIDDEN).filter(n => n.props.accessibilityLabel === label || n.props.accessibilityLabel === `${label}, required`);
