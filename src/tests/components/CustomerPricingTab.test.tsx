/**
 * The Pricing tab of a customer: the items the customer has an own rate for (rows from the session cache, a mocked
 * useItemRates), "+ Add item" over the items that have none, the row's path, the empty and load states, and the
 * `item` link that opens one box once.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CustomerPricingTab } from '@/features/item-pricing/components/CustomerPricingTab';
import { useItemRates, type UseItemRatesResult } from '@/features/item-pricing/useItemRates';
import { F1, ITEMS, ORCHARD_B, row } from '@/tests/helpers/ratesFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let sheetProps: Record<string, any> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; },
}));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRates: jest.fn() }));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: () => require('react').createElement('Skeleton') }));

const result = (over: Partial<UseItemRatesResult> = {}): UseItemRatesResult => ({
  items: ITEMS,
  rates: F1,
  status: 'ready',
  refreshing: false,
  lastUpdated: Date.now(),
  refreshError: false,
  error: null,
  refresh: jest.fn().mockResolvedValue(undefined),
  refreshIfStale: jest.fn().mockResolvedValue(undefined),
  itemRates: jest.fn(),
  ...over,
});
// Review Orchard B also has an own rate for cumin that stops, and a later one for potato.
const MORE = [
  row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 10.5, labour_rate: 3, effective_from: '2026-04-01', effective_to: '2026-12-31', ...ORCHARD_B }),
  row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 3.75, labour_rate: 2, tax_percent: 0, effective_from: '2027-01-01', ...ORCHARD_B }),
  row({ item_id: 'garlic', weight_min: 0, weight_max: 40, unit_price: 5, effective_from: '2025-06-01', ...ORCHARD_B }),
  row({ item_id: 'garlic', weight_min: 41, weight_max: 100, unit_price: 8, effective_from: '2025-06-01', ...ORCHARD_B }),
];

const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
/** A text on the screen, as written (once or more). */
const shown = (text: string | RegExp) => screen.queryAllByText(text);
const expectShown = (text: string | RegExp) => expect(shown(text).length).toBeGreaterThan(0);
const expectNotShown = (text: string | RegExp) => expect(shown(text)).toHaveLength(0);
// The rows, the empty state, the skeleton and the strips have no role or text of their own: their testID is the way to them.
const host = (id: string) => screen.queryAllByTestId(id);
const rowOf = (item: string) => screen.getByTestId(`customer-item-row-${item}`);
const byLabel = (label: string) => screen.queryByRole('button', { name: label });
const press = async (node: Parameters<ReturnType<typeof user>['press']>[0]) => { await user().press(node); };

const WINDOW = Dimensions.get('window');
async function mount(customerId = 'orchard-b', customerName = 'Review Orchard B', props: Partial<React.ComponentProps<typeof CustomerPricingTab>> = {}) {
  await render(<CustomerPricingTab customerId={customerId} customerName={customerName} {...props} />);
}
beforeEach(() => {
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
  jest.clearAllMocks();
  sheetProps = {};
  jest.mocked(useItemRates).mockReturnValue(result());
});
afterEach(() => {
  Dimensions.set({ window: WINDOW });
  jest.useRealTimers();
});

describe('a customer with one own rate', () => {
  it('lists the item with since, its band line, the default beside it, the section count and the footer', async () => {
    await mount();
    expectShown('Review Onion Red');
    expectShown('Since 01/01/26');
    expectShown('0–100 kg · ₹3.00 · Labour ₹1.50 · Tax 5%');
    expectShown('Default rate: ₹3.50 per bag, per month');
    expectShown('ITEMS WITH THEIR OWN RATE');
    expectShown('1');
    expectShown('All other items are charged at the default rate.');
    expect(rowOf('onion')).toBeOnTheScreen();
    // No other customer's rate and no item without an own rate.
    expectNotShown('Review Cumin Bold');
  });

  it('reads the row as one sentence', async () => {
    await mount();
    expect(rowOf('onion')).toHaveAccessibleName(
      'Review Onion Red, Since 1 Jan 2026, 0–100 kg · ₹3.00 · Labour ₹1.50 · Tax 5%, Default rate: ₹3.50 per bag, per month'
    );
  });

  it('a tap on the row opens the customer\'s box of that item, with the customer\'s name', async () => {
    await mount();
    await press(rowOf('onion'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer/[customerId]',
      params: { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '0' },
    });
  });
});

describe('a customer with several own rates', () => {
  beforeEach(() => { jest.mocked(useItemRates).mockReturnValue(result({ rates: [...F1, ...MORE] })); });

  it('is sorted by item name, one line per band, and tags a rate that stops and one that begins later', async () => {
    await mount();
    expect(screen.getAllByTestId(/^customer-item-row-/).map(n => n.props.testID)).toEqual([
      'customer-item-row-cumin', 'customer-item-row-garlic', 'customer-item-row-onion', 'customer-item-row-potato',
    ]);
    // Garlic: a line for each of its two bands.
    expectShown('0–40 kg · ₹5.00 · Labour ₹2.50 · Tax 5%');
    expectShown('41–100 kg · ₹8.00 · Labour ₹2.50 · Tax 5%');
    expectShown('Rate ends 31/12/26');
    expectShown('New rate from 01/01/27');
    // The potato rate is not in force yet: its line is the later rate, its default is today's.
    expectShown('Since 01/01/27');
    expectShown('0–100 kg · ₹3.75 · Labour ₹2.00 · Tax 0%');
    expectShown('Default rate: ₹4.00 per bag, per month');
  });

  it('counts the rows in the section header', async () => {
    await mount();
    expect(screen.getByRole('header', { name: /^Items with their own rate/ })).toHaveAccessibleName('Items with their own rate, 4');
  });
});

describe('+ Add item', () => {
  it('offers the active items that have no own rate for this customer, and opens the full-screen Add customer rate form for the chosen one', async () => {
    jest.mocked(useItemRates).mockReturnValue(result({ rates: [...F1, ...MORE] }));
    await mount();
    expect(sheetProps.isVisible).toBe(false);
    await press(byLabel('Add item')!);
    expect(sheetProps.isVisible).toBe(true);
    expect(sheetProps.title).toBe('Add an item rate for Review Orchard B');
    // 7 active items; cumin, garlic, onion and potato already have one.
    const searched = await sheetProps.searchFn('');
    expect(searched.map((i: { id: string }) => i.id).sort()).toEqual(['ajwain-a', 'ajwain-bold', 'onion-small']);
    await act(async () => { sheetProps.onSelect({ id: 'onion-small', name: 'Review Onion Red Small' }); });
    expect(sheetProps.isVisible).toBe(false);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer-add/[customerId]',
      params: { itemId: 'onion-small', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '0' },
    });
  });

  it('does not offer an item whose own rate for this customer only begins later', async () => {
    jest.mocked(useItemRates).mockReturnValue(result({ rates: [...F1, ...MORE] }));
    await mount();
    await press(byLabel('Add item')!);
    const ids = (await sheetProps.searchFn('')).map((i: { id: string }) => i.id);
    expect(ids).not.toContain('potato');
  });

  it('does offer an item whose own rate for this customer ended (the tab then has no row for it)', async () => {
    const ended = F1.map(r => (r.customer_id === 'orchard-b' ? { ...r, effective_to: '2026-06-30' } : r));
    jest.mocked(useItemRates).mockReturnValue(result({ rates: ended }));
    await mount();
    expectShown('Review Orchard B has no rates of their own yet.');
    await press(byLabel('Add item')!);
    expect((await sheetProps.searchFn('')).map((i: { id: string }) => i.id)).toContain('onion');
  });
});

describe('a customer with no own rate yet', () => {
  it('says so, with + Add item, and the picker offers every active item', async () => {
    await mount('orchard-z', 'Review Orchard Z');
    expectShown('Review Orchard Z has no rates of their own yet.');
    expect(host('customer-pricing-empty').length).toBeGreaterThan(0);
    expectNotShown('ITEMS WITH THEIR OWN RATE');
    expectShown('+ Add item');
    await press(byLabel('Add item')!);
    expect(sheetProps.isVisible).toBe(true);
    expect((await sheetProps.searchFn('')).map((i: { id: string }) => i.id)).toHaveLength(ITEMS.length);
  });
});

describe('loading and error', () => {
  it('loading shows skeletons, no rows and no empty text', async () => {
    jest.mocked(useItemRates).mockReturnValue(result({ items: [], rates: [], status: 'loading' }));
    await mount();
    expect(host('customer-pricing-skeleton').length).toBeGreaterThan(0);
    expectNotShown(/no rates of their own/);
  });

  it('an error says so and Try again reads again', async () => {
    const d = result({ items: [], rates: [], status: 'error' });
    jest.mocked(useItemRates).mockReturnValue(d);
    await mount();
    expect(host('customer-pricing-error').length).toBeGreaterThan(0);
    await press(byLabel('Try again')!);
    expect(d.refresh).toHaveBeenCalled();
  });
});

describe('the `item` link', () => {
  it('opens that item\'s box once, and does not open it again on a later render', async () => {
    const onOpened = jest.fn();
    await mount('orchard-b', 'Review Orchard B', { openItemId: 'onion', onOpened });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer/[customerId]',
      params: { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '0' },
    });
    expect(onOpened).toHaveBeenCalledTimes(1);
    await screen.rerender(<CustomerPricingTab customerId="orchard-b" customerName="Review Orchard B" openItemId="onion" onOpened={onOpened} />);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('without the link nothing opens', async () => {
    await mount();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('an item that is deactivated', () => {
  it('lists the customer\'s rate tagged Deactivated, opening the item\'s own Pricing tab (no rate box), and is not the empty state', async () => {
    const gone = row({ item_id: 'gone', item_name: 'Review Gone Seed', weight_min: 0, weight_max: 100, unit_price: 12.5, effective_from: '2026-09-01', ...ORCHARD_B });
    jest.mocked(useItemRates).mockReturnValue(result({ rates: [gone] }));
    await mount();
    expect(host('customer-pricing-empty')).toHaveLength(0);
    expectShown('Review Gone Seed');
    expectShown('Deactivated');
    expect(rowOf('gone')).toHaveAccessibleName(/Deactivated/);
    await press(rowOf('gone'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'gone', tab: 'pricing' } });
  });
});

describe('a deactivated customer', () => {
  it('shows the rows but no strip of its own, no + Add item, and the row link says deactivated', async () => {
    await mount('orchard-b', 'Review Orchard B', { deactivated: true });
    // The one strip is under the page header on every tab (WH-209); the tab no longer draws its own.
    expect(host('customer-pricing-deactivated')).toHaveLength(0);
    expectNotShown('This customer is deactivated. Activate them to change their rates.');
    expectShown('Review Onion Red');
    expect(byLabel('Add item')).toBeNull();
    await press(rowOf('onion'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer/[customerId]',
      params: { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '1' },
    });
  });

  it('with no own rate it says so and offers no Add item', async () => {
    await mount('orchard-z', 'Review Orchard Z', { deactivated: true });
    expect(host('customer-pricing-empty').length).toBeGreaterThan(0);
    expect(byLabel('Add item')).toBeNull();
  });
});

describe('a refresh that failed (WH-209)', () => {
  it('keeps the rows and shows one error strip above them, with the time of the last good load', async () => {
    jest.mocked(useItemRates).mockReturnValue(result({ refreshError: true }));
    await mount();
    expect(host('customer-pricing-refresh-failed')).toHaveLength(1);
    expectShown('Review Onion Red');
    // The error variant of the strip is the one that is announced as an alert.
    expect(screen.getByRole('alert')).toHaveAccessibleName(/refresh/i);
  });

  it('shows no strip when the refresh worked', async () => {
    await mount();
    expect(host('customer-pricing-refresh-failed')).toHaveLength(0);
  });
});
