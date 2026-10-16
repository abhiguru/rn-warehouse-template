/** Rates typed on single GRNs, for one item (app/item-rates/[itemId]/grns): a row per GRN, opening the GRN. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import ItemGrnRatesPage from '../../../app/item-rates/[itemId]/grns';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { getItemGrnRates } from '@/services/item-pricing-service';
import { ITEMS } from '@/tests/helpers/ratesFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ itemId: 'cumin' }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemGrnRates: jest.fn() }));

const grnRate = (over: Record<string, unknown>) => ({
  id: 'g1', gr_id: 'gr1', gr_no: 'A0010', grn_date: '2026-10-12', customer_id: 'c1', customer_name: 'Review Orchard A',
  price_type: 'monthly', weight_min: 11, weight_max: 20, unit_price: 4.5, labour_rate: 1.5, tax_percent: 5,
  archived: false, created_at: '2026-10-12T05:00:00Z', ...over,
});
const page = (over: Partial<UseItemRatesForResult> = {}): UseItemRatesForResult => ({
  itemRates: { item: ITEMS.find(i => i.id === 'cumin')!, rows: [] },
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
  ...over,
});
const texts = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
let tree: ReactTestRenderer;
async function open(rates: unknown[] | Error, data: Partial<UseItemRatesForResult> = {}) {
  jest.mocked(useItemRatesFor).mockReturnValue(page(data));
  if (rates instanceof Error) jest.mocked(getItemGrnRates).mockRejectedValue(rates);
  else jest.mocked(getItemGrnRates).mockResolvedValue(rates as never);
  await act(async () => { tree = create(<ItemGrnRatesPage />); });
}
const rowsShown = () => tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('grn-rate-row-') && typeof n.type === 'string');

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => tree.unmount()));

it('has the header "Rates typed on single GRNs" and the item name', async () => {
  await open([grnRate({})]);
  expect(tree.root.findAll(n => n.props.accessibilityRole === 'header' && typeof n.type === 'string').map(n => [n.props.children].flat().join(''))).toEqual(['Rates typed on single GRNs']);
  expect(texts()).toContain('Review Cumin Bold');
  expect(getItemGrnRates).toHaveBeenCalledWith('cumin');
});

it('one row per GRN: number, customer, date and the figures of each band; invoiced GRNs are not listed', async () => {
  await open([
    grnRate({ id: 'b2', weight_min: 21, weight_max: 40, unit_price: 6 }),
    grnRate({}),
    grnRate({ id: 'o1', gr_id: 'gr5', gr_no: 'A0015', grn_date: '2026-10-13', price_type: 'one_time', customer_name: 'Review Orchard B', unit_price: 9, tax_percent: 0 }),
    grnRate({ id: 'g9', gr_id: 'gr9', gr_no: 'A0007', archived: true }),
  ]);
  expect(rowsShown().map(r => r.props.testID)).toEqual(['grn-rate-row-gr1', 'grn-rate-row-gr5']);
  const first = rowsShown()[0].findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
  expect(first).toEqual(['GRN A0010', 'Review Orchard A', '12 Oct 2026', '11–20 kg · ₹4.50 rent · ₹1.50 labour · 5% tax', '21–40 kg · ₹6.00 rent · ₹1.50 labour · 5% tax']);
  const second = rowsShown()[1].findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
  expect(second[0]).toBe('GRN A0015');
  expect(second).toContain('Review Orchard B');
  expect(texts().join(' | ')).not.toContain('A0007');
  expect(rowsShown()[0].props.accessibilityLabel).toBe('GRN A0010, Review Orchard A, 12 Oct 2026, 11–20 kg · ₹4.50 rent · ₹1.50 labour · 5% tax, 21–40 kg · ₹6.00 rent · ₹1.50 labour · 5% tax');
});

it('a tap opens the GRN', async () => {
  await open([grnRate({})]);
  act(() => tree.root.find(n => n.props.testID === 'grn-rate-row-gr1' && typeof n.props.onPress === 'function').props.onPress());
  expect(router.push).toHaveBeenCalledWith({ pathname: '/grn-details/[id]', params: { id: 'gr1' } });
});

it('says so when no GRN has a rate of its own, or all of them are invoiced', async () => {
  await open([grnRate({ archived: true })]);
  expect(texts()).toContain('No GRN has a rate of its own for this item.');
  expect(rowsShown()).toHaveLength(0);
});

it('shows the skeleton while loading, and Try again when the rates cannot be read', async () => {
  let resolve!: (rates: unknown[]) => void;
  jest.mocked(useItemRatesFor).mockReturnValue(page());
  jest.mocked(getItemGrnRates).mockReturnValue(new Promise(r => { resolve = r as never; }) as never);
  await act(async () => { tree = create(<ItemGrnRatesPage />); });
  expect(tree.root.findAll(n => n.props.testID === 'grns-skeleton').length).toBeGreaterThan(0);
  await act(async () => { resolve([]); });
  expect(tree.root.findAll(n => n.props.testID === 'grns-skeleton')).toHaveLength(0);
  act(() => tree.unmount());

  await open(new Error('down'));
  expect(texts()).toContain("Couldn't load the rates set for single GRNs.");
  jest.mocked(getItemGrnRates).mockResolvedValue([grnRate({})] as never);
  await act(async () => {
    tree.root.find(n => n.props.accessibilityRole === 'button' && n.findAllByType(Text).some(x => x.props.children === 'Try again')).props.onPress();
  });
  expect(rowsShown()).toHaveLength(1);
});
