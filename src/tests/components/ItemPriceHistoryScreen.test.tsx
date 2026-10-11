/**
 * The price history screen (administrators and supervisors) and the action on Item
 * pricing that opens it.
 */
import React from 'react';
import { FlatList, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import { formatDateTime } from '@/utils/formatters';
import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: require('react-native').View,
  Swipeable: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
// The pricing list reaches the auth slice (and Sentry's timers) through its filters.
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({
  forceLogoutOnInvalidToken: jest.fn(),
  logout: Object.assign(jest.fn(), { fulfilled: { type: 'auth/logout/fulfilled', match: () => false } }),
}));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({
  PRICE_HISTORY_PAGE_SIZE: 50,
  getItemPriceHistory: jest.fn(),
  getItemStoragePrices: jest.fn(async () => ({
    success: true,
    data: [],
    pagination: { total_count: 0, limit: 50, offset: 0, has_more: false },
  })),
  deleteItemStoragePrice: jest.fn(),
}));

import ItemPriceHistoryScreen from '../../../app/item-price-history';
import ItemPricingScreen from '../../../app/item-pricing';
import { getItemPriceHistory } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';

const history = jest.mocked(getItemPriceHistory);

const price = (unitPrice: number, more: Record<string, unknown> = {}) => ({
  price_type: 'monthly',
  unit_price: unitPrice,
  unit_price_monthly: unitPrice,
  unit_price_one_time: 0,
  labour_rate: 2,
  tax_percent: 5,
  weight_min: 0,
  weight_max: 100,
  effective_from: '2026-01-01',
  effective_to: null,
  ...more,
});

const entry = (id: number, more: Partial<ItemPriceHistoryEntry>): ItemPriceHistoryEntry => ({
  id,
  changed_at: '2026-10-11T09:15:27.123456+00:00',
  action: 'update',
  price_id: 'price-1',
  item_id: 'item-1',
  item_name: 'Example Chillies',
  customer_id: null,
  customer_name: null,
  old_values: null,
  new_values: null,
  changed_by: 'user-1',
  changed_by_name: 'Meera Joshi',
  changed_by_role: 'staff',
  ...more,
});

const UPDATE = entry(14, { action: 'update', old_values: price(5), new_values: price(6) });
const INSERT = entry(13, {
  action: 'insert',
  item_name: 'Example Garlic',
  customer_id: 'customer-1',
  customer_name: 'Example Traders',
  new_values: price(8, { effective_to: '2026-12-31' }),
  changed_by_name: 'Kiran Shah',
  changed_by_role: 'supervisor',
});
const DELETE = entry(12, {
  action: 'delete',
  item_name: null,
  customer_id: 'customer-2',
  customer_name: null,
  old_values: price(40, { price_type: 'one_time', unit_price_one_time: 40, unit_price_monthly: 0 }),
  changed_by_role: 'admin',
});
const TRUNCATE = entry(11, {
  action: 'truncate',
  price_id: null,
  item_id: null,
  item_name: null,
  old_values: { rows: 12 },
  changed_by: null,
  changed_by_name: null,
  changed_by_role: null,
});

const page = (data: ItemPriceHistoryEntry[], pagination: Partial<{ total: number; limit: number; offset: number; has_more: boolean }> = {}) => ({
  success: true,
  data,
  pagination: { total: data.length, limit: 50, offset: 0, has_more: false, ...pagination },
});
const failure = (message: string) => ({
  success: false,
  data: [],
  pagination: { total: 0, limit: 50, offset: 0, has_more: false },
  message,
});

const signedInAs = (role: string, brand = 'orange', mode: Mode = 'light') => {
  mockState = {
    theme: { preference: mode, brand },
    auth: { user: { id: 'a1' }, userProfile: { id: 'u1', name: 'Asha Mehta', role, mobile: '9876543210' } },
    listFilters: { lists: {} },
  };
};

const render = async (element: React.ReactElement) => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  return tree;
};
const unmount = (tree: ReactTestRenderer) => act(async () => { tree.unmount(); });

/** Every text on screen, in order. */
const shown = (tree: ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
/** The texts of one entry's card, in order. */
const card = (tree: ReactTestRenderer, id: number): string[] =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && node.props.testID === `price-history-entry-${id}`)[0]
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(''));
const cardLabel = (tree: ReactTestRenderer, id: number): string =>
  tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === `price-history-entry-${id}`)[0].props
    .accessibilityLabel;
const cardIds = (tree: ReactTestRenderer): string[] =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && String(node.props.testID ?? '').startsWith('price-history-entry-'))
    .map((node) => String(node.props.testID).replace('price-history-entry-', ''));
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      (node.props.accessibilityLabel === label || node.findAllByType(Text).some((text) => text.props.children === label))
  )[0];

beforeEach(() => {
  history.mockReset();
  mockPush.mockReset();
  jest.mocked(showAlert).mockReset();
  signedInAs('supervisor');
});
afterEach(() => setLanguage('en'));

describe('price history entries', () => {
  const WHEN = formatDateTime(UPDATE.changed_at);

  it('asks for the newest 50 and shows them in the order the server gives', async () => {
    history.mockResolvedValue(page([UPDATE, INSERT, DELETE, TRUNCATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    expect(shown(tree)).toContain('Price history');
    expect(cardIds(tree)).toEqual(['14', '13', '12', '11']);
    await unmount(tree);
  });

  it('an update shows only the changed value, old then new, once', async () => {
    history.mockResolvedValue(page([UPDATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(WHEN).toContain('2026');
    expect(card(tree, 14)).toEqual([
      'Price changed',
      'Example Chillies',
      'Default price',
      'Monthly price',
      '₹5',
      '₹6',
      WHEN,
      'Meera Joshi (Staff)',
    ]);
    expect(cardLabel(tree, 14)).toBe(
      `Price changed, Example Chillies, Default price, Monthly price: ₹5 changed to ₹6, ${WHEN}, Meera Joshi (Staff)`
    );
    await unmount(tree);
  });

  it('an update in which nothing differs says so', async () => {
    history.mockResolvedValue(page([entry(20, { action: 'update', old_values: price(5), new_values: price(5) })]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(card(tree, 20)).toEqual(['Price changed', 'Example Chillies', 'Default price', 'No values changed', WHEN, 'Meera Joshi (Staff)']);
    await unmount(tree);
  });

  it('an insert shows the customer and the values of the new price', async () => {
    history.mockResolvedValue(page([INSERT]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(card(tree, 13)).toEqual([
      'Price added',
      'Example Garlic',
      'Example Traders',
      'Price type', 'Monthly',
      'Monthly price', '₹8',
      'Weight range', '0–100 kg',
      'Labour rate', '₹2',
      'Tax', '5%',
      'Start date', '1 Jan 2026',
      'End date', '31 Dec 2026',
      WHEN,
      'Kiran Shah (Supervisor)',
    ]);
    await unmount(tree);
  });

  it('a delete shows the values of the old price, and says when the item or customer is gone', async () => {
    history.mockResolvedValue(page([DELETE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(card(tree, 12)).toEqual([
      'Price deleted',
      'Deleted item',
      'Deleted customer',
      'Price type', 'One-time',
      'One-time price', '₹40',
      'Weight range', '0–100 kg',
      'Labour rate', '₹2',
      'Tax', '5%',
      'Start date', '1 Jan 2026',
      'End date', 'No end date',
      WHEN,
      'Meera Joshi (Admin)',
    ]);
    await unmount(tree);
  });

  it('a truncate shows how many prices were removed and that no app user made it', async () => {
    history.mockResolvedValue(page([TRUNCATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(card(tree, 11)).toEqual(['All prices removed', '12 prices removed', WHEN, 'Not an app user']);
    await unmount(tree);
  });

  it('offers nothing to edit or delete', async () => {
    history.mockResolvedValue(page([UPDATE, INSERT, DELETE, TRUNCATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    const labels = tree.root
      .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
      .map((node) => node.props.accessibilityLabel);
    expect([...new Set(labels)]).toEqual(['Back']);
    await unmount(tree);
  });

  it('writes the texts and digits of Gujarati in Gujarati', async () => {
    setLanguage('gu');
    history.mockResolvedValue(page([UPDATE, TRUNCATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(shown(tree)).toContain('દરનો ઇતિહાસ');
    expect(card(tree, 14)).toEqual([
      'દર બદલાયો',
      'Example Chillies',
      'મૂળ દર',
      'માસિક દર',
      '₹૫',
      '₹૬',
      formatDateTime(UPDATE.changed_at),
      'Meera Joshi (સ્ટાફ)',
    ]);
    expect(formatDateTime(UPDATE.changed_at)).toContain('૨૦૨૬');
    expect(card(tree, 11).slice(0, 2)).toEqual(['બધા દર કાઢી નખાયા', '૧૨ દર કાઢી નખાયા']);
    expect(card(tree, 11)[3]).toBe('ઍપનો યુઝર નથી');
    await unmount(tree);
  });
});

describe('price history states', () => {
  it('shows the empty state when there are no changes', async () => {
    history.mockResolvedValue(page([]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(shown(tree)).toContain('No price changes yet');
    expect(shown(tree)).toContain('Prices that are added, changed or deleted appear here.');
    expect(cardIds(tree)).toEqual([]);
    await unmount(tree);
  });

  it('shows a retryable error, not the empty state, when the first page fails', async () => {
    history
      .mockResolvedValueOnce(failure('You do not have permission to perform this action.'))
      .mockResolvedValueOnce(page([UPDATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(shown(tree)).toContain("Couldn't load the price history");
    expect(shown(tree)).toContain('You do not have permission to perform this action.');
    expect(shown(tree)).not.toContain('No price changes yet');
    await act(async () => { button(tree, 'Try again').props.onPress(); });
    expect(history).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 0 });
    expect(shown(tree)).not.toContain("Couldn't load the price history");
    expect(cardIds(tree)).toEqual(['14']);
    await unmount(tree);
  });

  it('loads the next page at the end of the list while the server says there is more', async () => {
    history
      .mockResolvedValueOnce(page([UPDATE, INSERT], { total: 4, has_more: true }))
      // The first entry of the next page was already shown: a price changed while paging.
      .mockResolvedValueOnce(page([INSERT, DELETE, TRUNCATE], { total: 5, offset: 50, has_more: false }));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(cardIds(tree)).toEqual(['14', '13']);

    await act(async () => { tree.root.findByType(FlatList).props.onEndReached(); });
    expect(history).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 50 });
    expect(cardIds(tree)).toEqual(['14', '13', '12', '11']);

    // The last page said there is no more.
    await act(async () => { tree.root.findByType(FlatList).props.onEndReached(); });
    expect(history).toHaveBeenCalledTimes(2);
    await unmount(tree);
  });

  it('does not ask for more when the first page is the last', async () => {
    history.mockResolvedValue(page([UPDATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    await act(async () => { tree.root.findByType(FlatList).props.onEndReached(); });
    expect(history).toHaveBeenCalledTimes(1);
    await unmount(tree);
  });

  it('keeps the entries when a further page fails and offers to try that page again', async () => {
    history
      .mockResolvedValueOnce(page([UPDATE], { total: 2, has_more: true }))
      .mockResolvedValueOnce(failure('Try again in a moment.'))
      .mockResolvedValueOnce(page([INSERT], { total: 2, offset: 50, has_more: false }));
    const tree = await render(<ItemPriceHistoryScreen />);
    await act(async () => { tree.root.findByType(FlatList).props.onEndReached(); });
    expect(cardIds(tree)).toEqual(['14']);
    expect(shown(tree)).toContain("Couldn't load more price changes.");
    // Reaching the end again does not repeat the failed request by itself.
    await act(async () => { tree.root.findByType(FlatList).props.onEndReached(); });
    expect(history).toHaveBeenCalledTimes(2);
    await act(async () => { button(tree, 'Try again').props.onPress(); });
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 50 });
    expect(cardIds(tree)).toEqual(['14', '13']);
    expect(shown(tree)).not.toContain("Couldn't load more price changes.");
    await unmount(tree);
  });

  it('pull to refresh loads the first page again; a failed refresh keeps the entries', async () => {
    history
      .mockResolvedValueOnce(page([INSERT]))
      .mockResolvedValueOnce(page([UPDATE, INSERT]))
      .mockResolvedValueOnce(failure('Try again in a moment.'));
    const tree = await render(<ItemPriceHistoryScreen />);
    const refresh = () => tree.root.findByType(FlatList).props.refreshControl.props.onRefresh();
    await act(async () => { refresh(); });
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 0 });
    expect(cardIds(tree)).toEqual(['14', '13']);
    await act(async () => { refresh(); });
    expect(cardIds(tree)).toEqual(['14', '13']);
    expect(showAlert).toHaveBeenCalledWith("Couldn't load the price history", 'Try again in a moment.');
    await unmount(tree);
  });

  it.each(['staff', 'customer'])('makes no request for a %s', async (role) => {
    signedInAs(role);
    history.mockResolvedValue(page([UPDATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    expect(history).not.toHaveBeenCalled();
    expect(cardIds(tree)).toEqual([]);
    await unmount(tree);
  });
});

const MODES: Mode[] = ['light', 'dark'];

describe.each(BRANDS.flatMap((brand) => MODES.map((mode) => [brand, mode] as const)))('price history in %s %s', (brand, mode) => {
  it('draws the entries on the theme background and card', async () => {
    signedInAs('admin', brand, mode);
    history.mockResolvedValue(page([UPDATE, INSERT, DELETE, TRUNCATE]));
    const tree = await render(<ItemPriceHistoryScreen />);
    const tokens = getTokens(brand, mode);
    const styles = tree.root
      .findAll((node) => typeof node.type === 'string' && !!node.props.style)
      .flatMap((node) => [node.props.style].flat(Infinity).filter(Boolean) as Record<string, string>[]);
    const backgrounds = styles.map((style) => style.backgroundColor).filter(Boolean);
    expect(backgrounds).toContain(tokens.background.base);
    expect(backgrounds).toContain(tokens.surface.card);
    const textColours = new Set(styles.map((style) => style.color).filter(Boolean));
    expect([...textColours].every((colour) => [tokens.text.primary, tokens.text.secondary, tokens.brand.tint].includes(colour))).toBe(true);
    await unmount(tree);
  });
});

describe('History on Item pricing', () => {
  // The pricing list logs its load timings.
  let log: jest.SpyInstance;
  beforeEach(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => log.mockRestore());

  it.each(['admin', 'supervisor'])('is offered to a %s and opens the price history', async (role) => {
    signedInAs(role);
    const tree = await render(<ItemPricingScreen />);
    const open = button(tree, 'History');
    expect(open).toBeDefined();
    await act(async () => { open.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/item-price-history');
    await unmount(tree);
  });

  it('is not offered to staff, who still get the list and Add price', async () => {
    signedInAs('staff');
    const tree = await render(<ItemPricingScreen />);
    expect(button(tree, 'History')).toBeUndefined();
    expect(button(tree, 'Add price')).toBeDefined();
    expect(shown(tree)).toContain('Item pricing');
    await unmount(tree);
  });
});
