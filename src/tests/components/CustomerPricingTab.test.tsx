/**
 * The Pricing tab of a customer: the items the customer has an own rate for (rows from the session cache, a mocked
 * useItemRates), "+ Add item" over the items that have none, the row's path, the empty and load states, and the
 * `item` link that opens one box once.
 */
import React from 'react';
import { Dimensions, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const host = (tree: ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const pressable = (tree: ReactTestRenderer, match: (n: any) => boolean) => tree.root.findAll(n => typeof n.props.onPress === 'function' && match(n))[0];
const byLabel = (tree: ReactTestRenderer, label: string) => pressable(tree, n => n.props.accessibilityLabel === label);

const WINDOW = Dimensions.get('window');
let tree: ReactTestRenderer;
async function mount(customerId = 'orchard-b', customerName = 'Review Orchard B', props: Partial<React.ComponentProps<typeof CustomerPricingTab>> = {}) {
  await act(async () => { tree = create(<CustomerPricingTab customerId={customerId} customerName={customerName} {...props} />); });
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
  act(() => tree.unmount());
  Dimensions.set({ window: WINDOW });
  jest.useRealTimers();
});

describe('a customer with one own rate', () => {
  it('lists the item with since, its band line, the default beside it, the section count and the footer', async () => {
    await mount();
    const s = texts(tree);
    expect(s).toContain('Review Onion Red');
    expect(s).toContain('since 1 Jan 2026');
    expect(s).toContain('0–100 kg · ₹3.00 · Labour ₹1.50 · Tax 5%');
    expect(s).toContain('Default rate: ₹3.50 per bag, per month');
    expect(s).toContain('ITEMS WITH THEIR OWN RATE');
    expect(s).toContain('1');
    expect(s).toContain('All other items are charged at the default rate.');
    expect(pressable(tree, n => n.props.testID === 'customer-item-row-onion')).toBeDefined();
    // No other customer's rate and no item without an own rate.
    expect(s).not.toContain('Review Cumin Bold');
  });

  it('reads the row as one sentence', async () => {
    await mount();
    expect(pressable(tree, n => n.props.testID === 'customer-item-row-onion').props.accessibilityLabel)
      .toBe('Review Onion Red, since 1 Jan 2026, 0–100 kg · ₹3.00 · Labour ₹1.50 · Tax 5%, Default rate: ₹3.50 per bag, per month');
  });

  it('a tap on the row opens the customer\'s box of that item, with the customer\'s name', async () => {
    await mount();
    await act(async () => { pressable(tree, n => n.props.testID === 'customer-item-row-onion').props.onPress(); });
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
    const rows = tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('customer-item-row-') && typeof n.props.onPress === 'function');
    expect(rows.map(n => n.props.testID)).toEqual([
      'customer-item-row-cumin', 'customer-item-row-garlic', 'customer-item-row-onion', 'customer-item-row-potato',
    ]);
    const s = texts(tree);
    // Garlic: a line for each of its two bands.
    expect(s).toContain('0–40 kg · ₹5.00 · Labour ₹2.50 · Tax 5%');
    expect(s).toContain('41–100 kg · ₹8.00 · Labour ₹2.50 · Tax 5%');
    expect(s).toContain('Rate ends 31 Dec 2026');
    expect(s).toContain('New rate from 1 Jan 2027');
    // The potato rate is not in force yet: its line is the later rate, its default is today's.
    expect(s).toContain('since 1 Jan 2027');
    expect(s).toContain('0–100 kg · ₹3.75 · Labour ₹2.00 · Tax 0%');
    expect(s).toContain('Default rate: ₹4.00 per bag, per month');
  });

  it('counts the rows in the section header', async () => {
    await mount();
    const header = tree.root.find(n => n.props.accessibilityRole === 'header' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Items with their own rate'));
    expect(header.props.accessibilityLabel).toBe('Items with their own rate, 4');
  });
});

describe('+ Add item', () => {
  it('offers the active items that have no own rate for this customer, and opens the full-screen Add customer rate form for the chosen one', async () => {
    jest.mocked(useItemRates).mockReturnValue(result({ rates: [...F1, ...MORE] }));
    await mount();
    expect(sheetProps.isVisible).toBe(false);
    await act(async () => { byLabel(tree, 'Add item').props.onPress(); });
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
    await act(async () => { byLabel(tree, 'Add item').props.onPress(); });
    const ids = (await sheetProps.searchFn('')).map((i: { id: string }) => i.id);
    expect(ids).not.toContain('potato');
  });

  it('does offer an item whose own rate for this customer ended (the tab then has no row for it)', async () => {
    const ended = F1.map(r => (r.customer_id === 'orchard-b' ? { ...r, effective_to: '2026-06-30' } : r));
    jest.mocked(useItemRates).mockReturnValue(result({ rates: ended }));
    await mount();
    expect(texts(tree)).toContain('Review Orchard B has no rates of their own yet.');
    await act(async () => { byLabel(tree, 'Add item').props.onPress(); });
    expect((await sheetProps.searchFn('')).map((i: { id: string }) => i.id)).toContain('onion');
  });
});

describe('a customer with no own rate yet', () => {
  it('says so, with + Add item, and the picker offers every active item', async () => {
    await mount('orchard-z', 'Review Orchard Z');
    expect(texts(tree)).toContain('Review Orchard Z has no rates of their own yet.');
    expect(host(tree, 'customer-pricing-empty').length).toBeGreaterThan(0);
    expect(texts(tree)).not.toContain('ITEMS WITH THEIR OWN RATE');
    await act(async () => { pressable(tree, n => n.props.accessibilityLabel === '+ Add item' || n.props.children === '+ Add item').props.onPress(); });
    expect(sheetProps.isVisible).toBe(true);
    expect((await sheetProps.searchFn('')).map((i: { id: string }) => i.id)).toHaveLength(ITEMS.length);
  });
});

describe('loading and error', () => {
  it('loading shows skeletons, no rows and no empty text', async () => {
    jest.mocked(useItemRates).mockReturnValue(result({ items: [], rates: [], status: 'loading' }));
    await mount();
    expect(host(tree, 'customer-pricing-skeleton').length).toBeGreaterThan(0);
    expect(texts(tree).some(s => s.includes('no rates of their own'))).toBe(false);
  });

  it('an error says so and Try again reads again', async () => {
    const d = result({ items: [], rates: [], status: 'error' });
    jest.mocked(useItemRates).mockReturnValue(d);
    await mount();
    expect(host(tree, 'customer-pricing-error').length).toBeGreaterThan(0);
    await act(async () => { byLabel(tree, 'Try again').props.onPress(); });
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
    await act(async () => { tree.update(<CustomerPricingTab customerId="orchard-b" customerName="Review Orchard B" openItemId="onion" onOpened={onOpened} />); });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('without the link nothing opens', async () => {
    await mount();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('a deactivated customer', () => {
  it('shows the rows and the strip, but no + Add item, and the row link says deactivated', async () => {
    await mount('orchard-b', 'Review Orchard B', { deactivated: true });
    expect(host(tree, 'customer-pricing-deactivated').length).toBeGreaterThan(0);
    expect(texts(tree)).toContain('This customer is deactivated. Activate them to change their rates.');
    expect(texts(tree)).toContain('Review Onion Red');
    expect(byLabel(tree, 'Add item')).toBeUndefined();
    await act(async () => { pressable(tree, n => n.props.testID === 'customer-item-row-onion').props.onPress(); });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer/[customerId]',
      params: { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '1' },
    });
  });

  it('with no own rate it says so and offers no Add item', async () => {
    await mount('orchard-z', 'Review Orchard Z', { deactivated: true });
    expect(host(tree, 'customer-pricing-empty').length).toBeGreaterThan(0);
    expect(byLabel(tree, 'Add item')).toBeUndefined();
  });
});
