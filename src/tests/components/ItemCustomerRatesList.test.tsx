/** Customer rates of one item (app/item-rates/[itemId]/customers): a row per customer with an own rate, opening their Pricing tab. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import ItemCustomersPage from '../../../app/item-rates/[itemId]/customers';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { customerPricingPath } from '@/features/item-pricing/contract';
import { ITEMS, row } from '@/tests/helpers/ratesFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
let mockParams: Record<string, string> = { itemId: 'onion' };
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));

const ONION = ITEMS.find(i => i.id === 'onion')!;
const own = (id: string, name: string, rent: number, from: string, to: string | null = null) =>
  row({ item_id: 'onion', customer_id: id, customer_name: name, weight_min: 0, weight_max: 100, unit_price: rent, labour_rate: 1.5, effective_from: from, effective_to: to });
const ROWS = [
  row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, labour_rate: 1.5, effective_from: '2025-01-01' }),
  own('orchard-b', 'Review Orchard B', 3, '2026-01-01'),
  own('orchard-a', 'Review Orchard A', 3.25, '2026-02-01'),
  own('orchard-c', 'Review Orchard C', 3.2, '2027-01-01'),
  own('orchard-d', 'Review Orchard D', 2.5, '2025-01-01', '2026-06-30'),
];
const page = (over: Partial<UseItemRatesForResult> = {}): UseItemRatesForResult => ({
  itemRates: { item: ONION, rows: ROWS },
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
async function open(data: Partial<UseItemRatesForResult> = {}, params: Record<string, string> = { itemId: 'onion' }) {
  mockParams = params;
  jest.mocked(useItemRatesFor).mockReturnValue(page(data));
  await act(async () => { tree = create(<ItemCustomersPage />); });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

it('has the header "Customer rates" and the item name, and a row for each customer with a rate in force or coming, by name', async () => {
  await open();
  const header = tree.root.findAll(n => n.props.accessibilityRole === 'header' && typeof n.type === 'string').map(n => [n.props.children].flat().join(''));
  expect(header).toEqual(['Customer rates']);
  expect(texts()).toContain('Review Onion Red');
  const rows = tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('customer-rate-row-') && typeof n.type === 'string');
  expect(rows.map(r => r.props.testID)).toEqual(['customer-rate-row-orchard-a', 'customer-rate-row-orchard-b', 'customer-rate-row-orchard-c']);
  const shown = texts().join(' | ');
  expect(shown).toContain('New rate from 1 Jan 2027');
  // D's rate ended in June: not listed today.
  expect(shown).not.toContain('Review Orchard D');
});

it('a tap on a customer opens their Pricing tab on this item', async () => {
  await open();
  const row = tree.root.find(n => n.props.testID === 'customer-rate-row-orchard-b' && typeof n.props.onPress === 'function');
  act(() => row.props.onPress());
  expect(router.push).toHaveBeenCalledWith(customerPricingPath('orchard-b', 'onion'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/customer/[id]', params: { id: 'orchard-b', tab: 'pricing', item: 'onion' } });
});

it('the day of the item page decides who is listed', async () => {
  await open({}, { itemId: 'onion', on: '2026-03-01' });
  const ids = tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('customer-rate-row-') && typeof n.type === 'string').map(r => r.props.testID);
  // On 1 Mar 2026 D's rate was in force and C's had not been set to start yet (it is still coming).
  expect(ids).toEqual(['customer-rate-row-orchard-a', 'customer-rate-row-orchard-b', 'customer-rate-row-orchard-c', 'customer-rate-row-orchard-d']);
});

it('says so when no customer has an own rate', async () => {
  await open({ itemRates: { item: ONION, rows: ROWS.slice(0, 1) } });
  expect(texts()).toContain('No customer has their own rate for this item.');
});

it('loading shows skeletons; an error shows Try again; not found says so', async () => {
  await open({ status: 'loading', itemRates: undefined });
  expect(tree.root.findAll(n => n.props.testID === 'customers-skeleton').length).toBeGreaterThan(0);
  act(() => tree.unmount());
  const refresh = jest.fn().mockResolvedValue(undefined);
  await open({ status: 'error', itemRates: undefined, refresh });
  expect(texts()).toContain("Couldn't load rates");
  act(() => tree.root.find(n => n.props.accessibilityRole === 'button' && n.findAllByType(Text).some(x => x.props.children === 'Try again')).props.onPress());
  expect(refresh).toHaveBeenCalled();
  act(() => tree.unmount());
  await open({ status: 'ready', notFound: true, itemRates: undefined });
  expect(texts()).toContain('This item is no longer active.');
});
