/**
 * "Copy weight bands from another item": the items other than this one that have a default rate in force today of the
 * type being edited, searchable, and the rows handed back with the one chosen. Today is 14 Oct 2026.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CopyTiersSheet } from '../components/CopyTiersSheet';
import { clearItemRatesCache } from '../useItemRates';
import { listActiveItems, listAllRates } from '@/services/item-pricing-service';
import { cuminRows, garlicRows, gingerRows, rate } from '@/tests/helpers/rateEditorFixtures';

let sheetProps: Record<string, any> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ instanceId: 'test-facility' }) }));
jest.mock('@/services/item-pricing-service', () => ({ listActiveItems: jest.fn(), listAllRates: jest.fn() }));

const ITEMS = [
  { id: 'cumin', name: 'Review Cumin Bold', packaging: null },
  { id: 'garlic', name: 'Review Garlic Desi', packaging: null },
  { id: 'ginger', name: 'Review Ginger Fresh', packaging: null },
  { id: 'saffron', name: 'Review Saffron Stopped', packaging: null },
];
// Saffron's only default rate ended: it has no rate in force today and must not be offered.
const saffron = rate('saffron', null, 0, 100, 9, 2, 5, '2025-01-01', '2026-03-31', 'monthly', 'Review Saffron Stopped');
// Ginger also has a one-time default and a customer's own rate: neither is a default monthly rate.
const gingerOneTime = rate('ginger', null, 0, 100, 20, 0, 5, '2025-01-01', null, 'one_time', 'Review Ginger Fresh');
const customerOnly = rate('cumin', { id: 'cust-a', name: 'Review Orchard A' }, 0, 100, 5, 1, 5, '2025-01-01', null, 'monthly', 'Review Cumin Bold');

let tree: ReactTestRenderer | undefined;
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const mount = async (over: Partial<React.ComponentProps<typeof CopyTiersSheet>> = {}) => {
  const onPick = jest.fn();
  await act(async () => {
    tree = create(<CopyTiersSheet visible onClose={jest.fn()} itemId="cumin" priceType="monthly" today="2026-10-14" onPick={onPick} {...over} />);
  });
  await flush();
  return onPick;
};

beforeEach(() => {
  jest.clearAllMocks();
  clearItemRatesCache();
  sheetProps = {};
  jest.mocked(listActiveItems).mockResolvedValue(ITEMS);
  jest.mocked(listAllRates).mockResolvedValue([...cuminRows(), customerOnly, ...garlicRows(), ...gingerRows(), gingerOneTime, saffron]);
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

it('offers the other items that have a default monthly rate in force today, not this one, not a stopped one', async () => {
  await mount();
  expect(sheetProps.title).toBe('Choose an item to copy');
  let offered: { name: string }[] = [];
  let filtered: unknown[] = [];
  await act(async () => { offered = await sheetProps.searchFn(''); filtered = await sheetProps.searchFn('gar'); });
  expect(offered.map(i => i.name)).toEqual(['Review Garlic Desi', 'Review Ginger Fresh']);
  expect(filtered).toHaveLength(1);
});

it('the one-time type offers the items with a one-time default only', async () => {
  await mount({ priceType: 'one_time' });
  let offered: { name: string }[] = [];
  await act(async () => { offered = await sheetProps.searchFn(''); });
  expect(offered.map(i => i.name)).toEqual(['Review Ginger Fresh']);
});

it('hands back the item chosen with its default rows in force', async () => {
  const onPick = await mount();
  let offered: { id: string; name: string }[] = [];
  await act(async () => { offered = await sheetProps.searchFn(''); });
  await act(async () => { sheetProps.onSelect(offered[0]); });
  expect(onPick).toHaveBeenCalledTimes(1);
  const [item, rows] = onPick.mock.calls[0];
  expect(item.name).toBe('Review Garlic Desi');
  expect(rows.map((r: { weight_max: number; unit_price: number }) => [r.weight_max, r.unit_price])).toEqual([[40, 6], [100, 9.5]]);
});

it('says there is nothing to copy when no other item has such a rate', async () => {
  jest.mocked(listAllRates).mockResolvedValue([...cuminRows(), saffron]);
  await mount();
  expect(sheetProps.emptyInitialText).toBe('No other item has a rate in force today to copy.');
});
