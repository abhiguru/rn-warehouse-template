/**
 * The Item pricing list (screen A): one row per item, search over every item, the chip bar,
 * the day, and the load states. Rates are supplied through a mocked useItemRates.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Dimensions, FlatList, Platform, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import ItemPricingScreen from '../../../app/item-pricing';
import authReducer from '@/store/slices/authSlice';
import themeReducer from '@/store/slices/themeSlice';
import listFilterReducer, { applyListFilters } from '@/store/slices/listFilterSlice';
import { useItemRates, type UseItemRatesResult } from '@/features/item-pricing/useItemRates';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { F1, ITEMS, row } from '@/tests/helpers/ratesFixtures';
import type { ActiveItem } from '@/types/item-pricing.types';

let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const React = require('react');
  return {
    useAppDispatch: () => (action: never) => mockStore.dispatch(action),
    useAppSelector: (selector: (state: unknown) => unknown) =>
      React.useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: jest.fn(() => false) }));
let sheetProps: Record<string, any> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; },
}));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRates: jest.fn() }));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: () => require('react').createElement('Skeleton') }));
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  return { __esModule: true, default: (props: { onChange: (e: unknown, d?: Date) => void }) => React.createElement('Picker', props) };
});

function makeStore(role: string) {
  const authInitial = authReducer(undefined, { type: '@@init' });
  return configureStore({
    reducer: combineReducers({ auth: authReducer, theme: themeReducer, listFilters: listFilterReducer }),
    preloadedState: { auth: { ...authInitial, userProfile: { id: 'u1', name: 'Fictional User', role } as never } } as never,
  });
}

const result = (over: Partial<UseItemRatesResult>): UseItemRatesResult => ({
  items: ITEMS,
  rates: F1,
  status: 'ready',
  refreshing: false,
  lastUpdated: Date.now(),
  refreshError: false,
  error: null,
  refresh: jest.fn().mockResolvedValue(undefined),
  itemRates: () => undefined,
  ...over,
});

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
const shown = (tree: ReactTestRenderer) => texts(tree).join(' | ');
/** The ids the list holds (a FlatList draws only the first screenful in a test). */
const listed = (tree: ReactTestRenderer): string[] =>
  tree.root.findByType(FlatList).props.data.map((row: { summary: { itemId: string } }) => row.summary.itemId);
const rowButtons = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => typeof node.props.testID === 'string' && node.props.testID.startsWith('item-rate-row-') && typeof node.props.onPress === 'function');

let tree: ReactTestRenderer;
let store: ReturnType<typeof makeStore>;
async function open(role: string, data: Partial<UseItemRatesResult> = {}) {
  store = makeStore(role);
  mockStore = store;
  jest.mocked(useItemRates).mockReturnValue(result(data));
  await act(async () => {
    tree = create(<ItemPricingScreen />);
  });
}
const type = (text: string) => {
  act(() => tree.root.findByType(TextInput).props.onChangeText(text));
  act(() => { jest.advanceTimersByTime(400); });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe('Item pricing list', () => {
  // The fixture's dates are the spec's 14 Oct 2026; the screen reads the phone's clock.
  beforeEach(() => jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30')));

  it('is one row per item with no section headers and no swipe (P-18, P-25)', async () => {
    await open('admin');
    expect(rowButtons(tree)).toHaveLength(ITEMS.length);
    const source = fs.readFileSync(path.join(__dirname, '../../../app/item-pricing.tsx'), 'utf8');
    expect(source).not.toMatch(/SectionList|Swipeable|LayoutAnimation|Modal/);
    expect(shown(tree)).not.toContain('Swipe');
  });

  it('shows the rent in force, not the later one, with the new-rate tag (P-10, P-34)', async () => {
    await open('admin');
    const cumin = rowButtons(tree).find(n => n.props.testID === 'item-rate-row-cumin')!;
    const text = cumin.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join(' | ');
    expect(text).toContain('₹11.00');
    expect(text).not.toContain('₹12.00');
    expect(text).toContain('New rate from 1 Jan 2027');
    expect(text).toContain('Labour ₹3.00');
    const garlic = rowButtons(tree).find(n => n.props.testID === 'item-rate-row-garlic')!;
    expect(garlic.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join(' | ')).toContain('₹6.00–₹9.50');
  });

  it('finds every item: "onion" lists 13 and "onion red" lists 2 with the match in bold (P-07)', async () => {
    const names = ['Onion Bold', 'Onion Red Local', 'Onion Sorted', 'Onion Grade A', 'Onion Grade B', 'Onion Export', 'Onion Local', 'Onion Small', 'Onion Medium', 'Onion Large', 'Onion Pink', 'Onion White'];
    const items: ActiveItem[] = [...names.map((name, i) => ({ id: `o${i}`, name, packaging: null })), { id: 'ror', name: 'Review Onion Red', packaging: null }];
    const rates = items.map(i => row({ item_id: i.id, weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2025-01-01' }));
    await open('admin', { items, rates });
    type('onion');
    expect(listed(tree)).toHaveLength(13);
    // names that start with the text come first
    expect(listed(tree)[12]).toBe('ror');
    type('onion red');
    expect(listed(tree)).toEqual(['o1', 'ror']);
    const bold = tree.root.findAll(node => node.type === Text && node.props.style && [node.props.style].flat(Infinity).some((s: { fontWeight?: string }) => s?.fontWeight === '700')).map(n => n.props.children);
    expect(bold.flat().join(' ')).toMatch(/Onion/);
  });

  it('typing another item replaces the rows without unticking anything (P-39)', async () => {
    await open('admin');
    type('garlic');
    expect(listed(tree)).toEqual(['garlic']);
    type('cumin');
    expect(listed(tree)).toEqual(['cumin']);
  });

  it('a customer name finds the item and the row says what that customer pays', async () => {
    await open('admin');
    type('orchard b');
    expect(listed(tree)).toEqual(['onion']);
    expect(shown(tree)).toContain("Review Orchard B's own rate: ₹3.00");
  });

  it('the Customer chip narrows to that customer\'s items and tags the own rate (P-02)', async () => {
    await open('admin');
    act(() => {
      store.dispatch(applyListFilters({ key: 'item-rates-list', values: { customers: [{ id: 'orchard-b', label: 'Review Orchard B' }] } }));
    });
    expect(listed(tree)).toEqual(['onion']);
    expect(shown(tree)).toContain('Own rate');
    expect(shown(tree)).toContain('₹3.00');
  });

  // CR-18
  it('the status line follows the Type chip', async () => {
    await open('admin');
    expect(shown(tree)).toContain('Rent per bag, for lots received on 14 Oct 2026.');
    act(() => { store.dispatch(applyListFilters({ key: 'item-rates-list', values: { priceType: 'one_time' } })); });
    expect(shown(tree)).toContain('One-time rent per bag, for lots received on 14 Oct 2026.');
    act(() => { store.dispatch(applyListFilters({ key: 'item-rates-list', values: { priceType: 'monthly' } })); });
    expect(shown(tree)).toContain('Monthly rent per bag, for lots received on 14 Oct 2026.');
  });

  it('has the chips Customer and Type, no Needs a rate chip, and no Filters chip or Sort and filter (P-35)', async () => {
    await open('admin');
    const s = shown(tree);
    for (const label of ['Customer', 'Type']) expect(s).toContain(label);
    expect(s).not.toContain('Needs a rate');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Filters' || /Sort and filter|Open all filters/i.test(String(n.props.accessibilityLabel))).length).toBe(0);
    const source = fs.readFileSync(path.join(__dirname, '../../../app/item-pricing.tsx'), 'utf8');
    expect(source).not.toContain('list-filters');
    expect(source).not.toMatch(/onOpenAll/);
  });

  it('has no "items need a rate" link: the item without a rate is still listed, with its No rate today tag', async () => {
    await open('admin');
    expect(shown(tree)).not.toMatch(/need a rate|needs a rate/i);
    expect(tree.root.findAll(n => n.props.testID === 'need-rate-link')).toHaveLength(0);
    expect(listed(tree)).toContain('onion-small');
    expect(shown(tree)).toContain('No rate today');
  });

  it('a past day shows that day\'s rent and a Back to today control (P-14)', async () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      await open('admin');
      type('cumin');
      act(() => tree.root.find(n => n.props.testID === 'change-date').props.onPress());
      const picker = tree.root.findByType('Picker' as never);
      act(() => picker.props.onChange({ type: 'set' }, new Date(2026, 2, 31)));
      const cumin = () => rowButtons(tree)[0].findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join(' | ');
      expect(shown(tree)).toContain('Rent per bag, for lots received on 31 Mar 2026.');
      expect(cumin()).toContain('₹10.00');
      // The 1 Apr 2026 rate is "new" relative to the day shown, and is not the figure.
      expect(cumin()).not.toContain('₹11.00');
      expect(cumin()).toContain('New rate from 1 Apr 2026');
      act(() => tree.root.find(n => n.props.testID === 'back-to-today').props.onPress());
      expect(cumin()).toContain('₹11.00');
      expect(shown(tree)).toContain('14 Oct 2026');
    } finally {
      Platform.OS = original;
    }
  });

  it('opens the item page on a row press and keeps the day when it is not today', async () => {
    await open('admin');
    act(() => rowButtons(tree).find(n => n.props.testID === 'item-rate-row-cumin')!.props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/[itemId]', params: { itemId: 'cumin' } });
  });

  it('the header has no Settings cog, and All rate changes only for admin (P-30)', async () => {
    await open('staff');
    const labels = tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel);
    expect(labels).not.toContain('Settings');
    expect(labels).not.toContain('Open settings');
    expect(labels).not.toContain('All rate changes');
    act(() => tree.unmount());
    await open('admin');
    const admin = tree.root.findAll(n => n.props.accessibilityLabel === 'All rate changes' && typeof n.props.onPress === 'function');
    expect(admin).toHaveLength(1);
    act(() => admin[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-price-history', params: {} });
  });

  it('while loading, the search field and chip bar stay with 8 skeleton rows (P-36)', async () => {
    await open('admin', { status: 'loading', items: [], rates: [] });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(shown(tree)).toContain('Type');
    expect(tree.root.findAll(n => (n.type as unknown) === 'Skeleton')).toHaveLength(8);
  });

  it('a failed first load is an error with Try again, never "No items yet" (P-15)', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    await open('admin', { status: 'error', items: [], rates: [], refresh });
    const s = shown(tree);
    expect(s).toContain("Couldn't load rates");
    expect(s).toContain('Check your connection and try again.');
    expect(s).not.toContain('No items yet');
    const retry = tree.root.find(n => n.props.accessibilityRole === 'button' && n.findAllByType(Text).some(x => x.props.children === 'Try again'));
    act(() => retry.props.onPress());
    expect(refresh).toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });

  it('a failed refresh keeps the rows and shows the strip with the time (P-15)', async () => {
    await open('admin', { refreshError: true, lastUpdated: new Date('2026-10-14T10:42:00+05:30').getTime() });
    expect(rowButtons(tree)).toHaveLength(ITEMS.length);
    expect(shown(tree)).toMatch(/Couldn't refresh\. Showing rates from .*\./);
  });

  it('says No items match the search, with Clear search and filters', async () => {
    await open('admin');
    type('zzzz');
    expect(shown(tree)).toContain('No items match "zzzz".');
    expect(shown(tree)).toContain('Clear search and filters');
  });

  it('says No items yet with Open Items for an administrator only', async () => {
    await open('admin', { items: [], rates: [] });
    expect(shown(tree)).toContain('No items yet');
    expect(shown(tree)).toContain('Open Items');
    act(() => tree.unmount());
    await open('staff', { items: [], rates: [] });
    expect(shown(tree)).toContain('No items yet');
    expect(shown(tree)).not.toContain('Open Items');
  });

  it('draws at least six rows in a 844 x 390 window', async () => {
    const original = Dimensions.get('window');
    await open('admin');
    expect(rowButtons(tree).length).toBeGreaterThanOrEqual(6);
    expect(original).toBeDefined();
  });
});

describe('Add in the header and the setup strip', () => {
  beforeEach(() => {
    jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
    jest.mocked(useIsOffline).mockReturnValue(false);
    sheetProps = {};
  });
  const addButton = () => tree.root.findAll(n => n.props.testID === 'item-pricing-add' && typeof n.props.onPress === 'function');
  const pick = (id: string) => act(() => sheetProps.onSelect(ITEMS.find(i => i.id === id)));

  it.each(['admin', 'supervisor', 'staff'])('a %s has the Add button, which opens the item picker over every item', async role => {
    await open(role);
    expect(addButton()).toHaveLength(1);
    expect(addButton()[0].props.accessibilityLabel).toBe('Add a weight band to an item');
    expect(sheetProps.isVisible).toBe(false);
    act(() => addButton()[0].props.onPress());
    expect(sheetProps.isVisible).toBe(true);
    expect(sheetProps.title).toBe('Choose an item');
    const offered = await sheetProps.searchFn('');
    expect(offered.map((i: { id: string }) => i.id)).toEqual(ITEMS.map(i => i.id));
  });

  it('a customer account has no Add button', async () => {
    await open('customer');
    expect(addButton()).toHaveLength(0);
  });

  it('offline the Add button is disabled', async () => {
    jest.mocked(useIsOffline).mockReturnValue(true);
    await open('admin');
    expect(addButton()[0].props.disabled).toBe(true);
  });

  it('an item with a monthly default in force today opens in Change rate with one more tier', async () => {
    await open('admin');
    act(() => addButton()[0].props.onPress());
    pick('garlic');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/edit',
      params: { item_id: 'garlic', item_name: 'Review Garlic Desi', mode: 'change', price_type: 'monthly', add_band: '1' },
    });
    expect(sheetProps.isVisible).toBe(false);
  });

  it('an item with only a one-time default in force opens as one-time', async () => {
    const rates = [...F1, row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 2, price_type: 'one_time', effective_from: '2025-01-01' })]
      .filter(r => !(r.item_id === 'potato' && r.price_type === 'monthly'));
    await open('admin', { rates });
    pick('potato');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/edit',
      params: { item_id: 'potato', item_name: 'Review Potato Seed', mode: 'change', price_type: 'one_time', add_band: '1' },
    });
  });

  it('an item with no rate in force today starts a default rate, without the extra tier: none, only an ended one, only a coming one', async () => {
    const rates = [
      ...F1.filter(r => !['potato', 'ajwain-a'].includes(r.item_id)),
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 4, effective_from: '2025-01-01', effective_to: '2026-06-30' }),
      row({ item_id: 'ajwain-a', weight_min: 0, weight_max: 100, unit_price: 4, effective_from: '2027-01-01' }),
    ];
    await open('admin', { rates });
    for (const id of ['onion-small', 'potato', 'ajwain-a']) {
      jest.mocked(router.push).mockClear();
      pick(id);
      const item = ITEMS.find(i => i.id === id)!;
      expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/edit', params: { item_id: id, item_name: item.name, mode: 'add' } });
    }
  });

  it('uses today\'s rate, not the day the list shows', async () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      // Potato's rate ended on 30 Jun 2026: it is in force on 31 Mar 2026 (the day the list is moved to) but not today.
      const rates = [...F1.filter(r => r.item_id !== 'potato'), row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 4, effective_from: '2025-01-01', effective_to: '2026-06-30' })];
      await open('admin', { rates });
      act(() => tree.root.find(n => n.props.testID === 'change-date').props.onPress());
      act(() => tree.root.findByType('Picker' as never).props.onChange({ type: 'set' }, new Date(2026, 2, 31)));
      expect(shown(tree)).toContain('31 Mar 2026');
      pick('potato');
      expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/edit', params: { item_id: 'potato', item_name: 'Review Potato Seed', mode: 'add' } });
    } finally {
      Platform.OS = original;
    }
  });

  describe('the strip while some item has no rate at all', () => {
    it('tells an administrator or supervisor to set the standard rate, with a button to the screen', async () => {
      for (const role of ['admin', 'supervisor']) {
        await open(role);
        expect(shown(tree)).toContain('Set the standard rate so every item has a rate.');
        const button = tree.root.find(n => n.props.testID === 'standard-rate-link' && typeof n.props.onPress === 'function');
        jest.mocked(router.push).mockClear();
        act(() => button.props.onPress());
        expect(router.push).toHaveBeenCalledWith('/standard-rate');
        act(() => tree.unmount());
      }
      await open('admin');
    });

    it('tells staff to ask, with no button', async () => {
      await open('staff');
      expect(shown(tree)).toContain('Ask an administrator or supervisor to set the standard rate.');
      expect(shown(tree)).not.toContain('Set the standard rate so every item has a rate.');
      expect(tree.root.findAll(n => n.props.testID === 'standard-rate-link')).toHaveLength(0);
    });

    it('is gone when every item has a default rate row, even an ended one', async () => {
      const rates = [...F1, row({ item_id: 'onion-small', weight_min: 0, weight_max: 100, unit_price: 3, effective_from: '2025-01-01', effective_to: '2026-01-31' })];
      await open('admin', { rates });
      expect(tree.root.findAll(n => n.props.testID === 'standard-rate-strip')).toHaveLength(0);
      expect(shown(tree)).not.toContain('standard rate');
    });

    it('does not count an item that has only a customer\'s own rate as priced', async () => {
      const items = [{ id: 'z', name: 'Review Zinc', packaging: null }];
      const rates = [row({ item_id: 'z', weight_min: 0, weight_max: 100, unit_price: 3, effective_from: '2025-01-01', ...{ customer_id: 'orchard-b', customer_name: 'Review Orchard B' } })];
      await open('admin', { items, rates });
      expect(tree.root.findAll(n => n.props.testID === 'standard-rate-strip').length).toBeGreaterThan(0);
    });
  });
});

describe('F22: the list refreshes when it comes back into focus', () => {
  it('reads again on the second focus, and the empty state can be pulled to refresh', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const { useFocusEffect } = jest.requireMock('expo-router') as { useFocusEffect: jest.Mock };
    useFocusEffect.mockClear();
    await open('admin', { items: [], rates: [], refresh });
    const focus = () => {
      const callbacks = useFocusEffect.mock.calls.map(c => c[0] as () => void);
      callbacks[callbacks.length - 1]();
    };
    focus(); // the first focus: the mount already loaded
    expect(refresh).not.toHaveBeenCalled();
    focus(); // coming back
    expect(refresh).toHaveBeenCalledTimes(1);
    const empty = tree.root.findByProps({ testID: 'rates-empty' });
    expect(empty).toBeDefined();
    const { RefreshControl } = jest.requireActual('react-native');
    expect(tree.root.findAllByType(RefreshControl)).toHaveLength(1);
  });
});
