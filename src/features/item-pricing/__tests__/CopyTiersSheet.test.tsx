/**
 * "Copy weight bands from another item": the items other than this one that have a default rate in force today of the
 * type being edited, searchable, and the rows handed back with the one chosen. Today is 14 Oct 2026.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { CopyTiersSheet } from '../components/CopyTiersSheet';
import { clearItemRatesCache } from '../useItemRates';
import { listActiveItems, listAllRates } from '@/services/item-pricing-service';
import { cuminRows, garlicRows, gingerRows, rate } from '@/tests/helpers/rateEditorFixtures';

// A stand-in for the bottom sheet: it draws the title, a search box, the rows the sheet's search returns (each drawn by the
// caller's renderItem) and the empty text, and hands a pressed row to onSelect.
jest.mock('@/components/common/SearchableBottomSheet', () => {
  const R = require('react');
  const { Text, TextInput, View } = require('react-native');
  return {
    SearchableBottomSheet: (props: {
      title: string;
      placeholder?: string;
      emptyInitialText?: string;
      searchFn: (query: string) => Promise<unknown[]>;
      renderItem: (item: unknown, onSelect: (item: unknown) => void) => React.ReactElement;
      onSelect: (item: unknown) => void;
      keyExtractor: (item: unknown) => string;
    }) => {
      const [query, setQuery] = R.useState('');
      const [rows, setRows] = R.useState([] as unknown[]);
      R.useEffect(() => { void props.searchFn(query).then(setRows); }, [props.searchFn, query]);
      return R.createElement(
        View,
        null,
        R.createElement(Text, null, props.title),
        R.createElement(TextInput, { placeholder: props.placeholder, value: query, onChangeText: setQuery }),
        rows.length === 0
          ? R.createElement(Text, null, props.emptyInitialText)
          : rows.map((row: unknown) => R.createElement(View, { key: props.keyExtractor(row) }, props.renderItem(row, props.onSelect))),
      );
    },
  };
});
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

const mount = async (over: Partial<React.ComponentProps<typeof CopyTiersSheet>> = {}) => {
  const onPick = jest.fn();
  await render(<CopyTiersSheet visible onClose={jest.fn()} itemId="cumin" priceType="monthly" today="2026-10-14" onPick={onPick} {...over} />);
  return onPick;
};
/** The item names the sheet offers, in order. */
const offeredNames = () => screen.queryAllByRole('button').map(n => (n.props.accessibilityLabel as string).split(' · ')[0]);

beforeEach(() => {
  jest.clearAllMocks();
  clearItemRatesCache();
  jest.mocked(listActiveItems).mockResolvedValue(ITEMS);
  jest.mocked(listAllRates).mockResolvedValue([...cuminRows(), customerOnly, ...garlicRows(), ...gingerRows(), gingerOneTime, saffron]);
});

it('offers the other items that have a default monthly rate in force today, not this one, not a stopped one', async () => {
  await mount();
  expect(screen.getByText('Choose an item to copy')).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: /^Review Garlic Desi/ })).toBeOnTheScreen();
  expect(offeredNames()).toEqual(['Review Garlic Desi', 'Review Ginger Fresh']);
  const user = userEvent.setup({ delay: 0 });
  await user.type(screen.getByPlaceholderText('Search items'), 'gar');
  expect(offeredNames()).toEqual(['Review Garlic Desi']);
});

it('the one-time type offers the items with a one-time default only', async () => {
  await mount({ priceType: 'one_time' });
  expect(await screen.findByRole('button', { name: /^Review Ginger Fresh/ })).toBeOnTheScreen();
  expect(offeredNames()).toEqual(['Review Ginger Fresh']);
});

it('hands back the item chosen with its default rows in force', async () => {
  const onPick = await mount();
  const user = userEvent.setup({ delay: 0 });
  await user.press(await screen.findByRole('button', { name: /^Review Garlic Desi/ }));
  expect(onPick).toHaveBeenCalledTimes(1);
  const [item, rows] = onPick.mock.calls[0];
  expect(item.name).toBe('Review Garlic Desi');
  expect(rows.map((r: { weight_max: number; unit_price: number }) => [r.weight_max, r.unit_price])).toEqual([[40, 6], [100, 9.5]]);
});

it('says there is nothing to copy when no other item has such a rate', async () => {
  jest.mocked(listAllRates).mockResolvedValue([...cuminRows(), saffron]);
  await mount();
  expect(await screen.findByText('No other item has a rate in force today to copy.')).toBeOnTheScreen();
});
