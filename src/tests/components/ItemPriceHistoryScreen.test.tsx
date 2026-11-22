/**
 * The price history screen ("Changes", administrators and supervisors). The action on the pricing
 * list and the item page that opens it is tested with those screens.
 */
import React from 'react';

import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';

let mockState: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: require('react-native').View,
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
}));

import ItemPriceHistoryScreen from '../../../app/item-price-history';
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

const signedInAs = (role: string | null, brand = 'orange', mode: Mode = 'light') => {
  mockState = {
    theme: { preference: mode, brand },
    auth: {
      user: { id: 'a1' },
      // Null: signed in, the profile not loaded yet.
      userProfile: role === null ? null : { id: 'u1', name: 'Asha Mehta', role, mobile: '9876543210' },
    },
    listFilters: { lists: {} },
  };
};

/** A request the test answers when it chooses. */
const deferred = () => {
  let resolve!: (value: ReturnType<typeof page> | ReturnType<typeof failure>) => void;
  const promise = new Promise<ReturnType<typeof page> | ReturnType<typeof failure>>((done) => { resolve = done; });
  return { promise: promise as never, resolve };
};

const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const has = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const lacks = (text: string) => expect(screen.queryByText(text, hidden)).not.toBeOnTheScreen();

// The cards, their parts and the list's own props have no role or text a query can reach: they are read as
// host elements by test id, host type and props.
const textsOf = (host: ReturnType<typeof screen.getByTestId>): string[] =>
  host.queryAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
/** The texts of one entry's card, in order. */
const card = (id: number): string[] => textsOf(screen.getByTestId(`price-history-entry-${id}`));
const cardLabel = (id: number): string => screen.getByTestId(`price-history-entry-${id}`).props.accessibilityLabel;
const cardIds = (all = false): string[] =>
  screen
    .queryAllByTestId(/^price-history-entry-/, all ? hidden : undefined)
    .map((node) => String(node.props.testID).replace('price-history-entry-', ''));
/** The list: the scroll view the FlatList draws. */
const list = () => {
  const found = screen.root!.queryAll((node) => (node.type as unknown) === 'RCTScrollView');
  if (found.length !== 1) throw new Error(`Expected one list, found ${found.length}`);
  return found[0];
};
const endReached = async () => { await fireEvent(list(), 'endReached'); };
const refresh = async () => { await act(async () => { list().props.refreshControl.props.onRefresh(); }); };
const refreshing = () => list().props.refreshControl.props.refreshing;
const press = async (label: string) => { await user.press(screen.getByRole('button', { name: label })); };

beforeEach(() => {
  history.mockReset();
  mockPush.mockReset();
  jest.mocked(showAlert).mockReset();
  signedInAs('supervisor');
  // The screen needs an item or a customer (there is no all-items view): most tests read one item's changes.
  mockParams = { item_id: 'item-all' };
});
afterEach(() => setLanguage('en'));

describe('price history entries', () => {
  // 09:15 UTC in India (jest.global-setup.js runs the suite in Asia/Kolkata): written out,
  // not computed with the formatter this checks.
  const WHEN = '11/10/26, 2:45 pm';
  // The same moment as a screen reader is given it.
  const WHEN_SPOKEN = '11 Oct 2026, 2:45 pm';

  it('runs in the time zone the expected times are written for', () => {
    expect(new Date(UPDATE.changed_at).getTimezoneOffset()).toBe(-330);
  });

  it('asks for the newest 50 and shows them in the order the server gives', async () => {
    history.mockResolvedValue(page([UPDATE, INSERT, DELETE, TRUNCATE]));
    await render(<ItemPriceHistoryScreen />);
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith({ limit: 50, offset: 0, itemId: 'item-all' });
    // The entries name the item, so the title is that item's Changes.
    has('Changes: Example Chillies');
    expect(cardIds()).toEqual(['14', '13', '12', '11']);
  });

  it('an update shows only the changed value, old then new, once', async () => {
    history.mockResolvedValue(page([UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    expect(card(14)).toEqual([
      'Price changed',
      'Example Chillies',
      'Default price',
      'Monthly price',
      '₹5.00',
      '₹6.00',
      WHEN,
      'Meera Joshi (Staff)',
    ]);
    expect(cardLabel(14)).toBe(
      `Price changed, Example Chillies, Default price, Monthly price: ₹5.00 changed to ₹6.00, ${WHEN_SPOKEN}, Meera Joshi (Staff)`
    );
  });

  it('an update in which nothing differs says so', async () => {
    history.mockResolvedValue(page([entry(20, { action: 'update', old_values: price(5), new_values: price(5) })]));
    await render(<ItemPriceHistoryScreen />);
    expect(card(20)).toEqual(['Price changed', 'Example Chillies', 'Default price', 'No values changed', WHEN, 'Meera Joshi (Staff)']);
  });

  it('an insert shows the customer and the values of the new price', async () => {
    history.mockResolvedValue(page([INSERT]));
    await render(<ItemPriceHistoryScreen />);
    expect(card(13)).toEqual([
      'Price added',
      'Example Garlic',
      'Example Traders',
      'Price type', 'Monthly',
      'Monthly price', '₹8.00',
      'Weight range', '0–100 kg',
      'Labour rate', '₹2.00',
      'Tax', '5%',
      'Start date', '01/01/26',
      'End date', '31/12/26',
      WHEN,
      'Kiran Shah (Supervisor)',
    ]);
    // Read aloud, the same dates are words.
    const spoken = cardLabel(13);
    expect(spoken).toContain('Start date, 1 Jan 2026');
    expect(spoken).toContain('End date, 31 Dec 2026');
    expect(spoken).not.toMatch(/\d\d\/\d\d\/\d\d/);
  });

  it('a delete shows the values of the old price, and says when the item or customer is gone', async () => {
    history.mockResolvedValue(page([DELETE]));
    await render(<ItemPriceHistoryScreen />);
    expect(card(12)).toEqual([
      'Price deleted',
      'Deleted item',
      'Deleted customer',
      'Price type', 'One-time',
      'One-time price', '₹40.00',
      'Weight range', '0–100 kg',
      'Labour rate', '₹2.00',
      'Tax', '5%',
      'Start date', '01/01/26',
      'End date', 'No end date',
      WHEN,
      'Meera Joshi (Admin)',
    ]);
  });

  it('a truncate shows how many prices were removed and that no app user made it', async () => {
    history.mockResolvedValue(page([TRUNCATE]));
    await render(<ItemPriceHistoryScreen />);
    expect(card(11)).toEqual(['All prices removed', '12 prices removed', WHEN, 'Not an app user']);
  });

  // Finding 1: the column of the other kind is a copy, not a price.
  it('does not show the column of the other kind as a price or as a change', async () => {
    const allEqual = price(91.5, { unit_price_one_time: 91.5 });
    history.mockResolvedValue(
      page([
        entry(31, { action: 'update', old_values: allEqual, new_values: price(91.5, { labour_rate: 3 }) }),
        entry(30, { action: 'insert', new_values: allEqual }),
      ])
    );
    await render(<ItemPriceHistoryScreen />);
    expect(card(31)).toEqual(['Price changed', 'Example Chillies', 'Default price', 'Labour rate', '₹2.00', '₹3.00', WHEN, 'Meera Joshi (Staff)']);
    expect(card(30)).toEqual([
      'Price added',
      'Example Chillies',
      'Default price',
      'Price type', 'Monthly',
      'Monthly price', '₹91.50',
      'Weight range', '0–100 kg',
      'Labour rate', '₹2.00',
      'Tax', '5%',
      'Start date', '01/01/26',
      'End date', 'No end date',
      WHEN,
      'Meera Joshi (Staff)',
    ]);
  });

  it('a changed price type shows the old price under the old label and the new price under the new one', async () => {
    const oneTime = price(7, { price_type: 'one_time', unit_price_one_time: 7, unit_price_monthly: 0 });
    history.mockResolvedValue(page([entry(32, { action: 'update', old_values: price(5), new_values: oneTime })]));
    await render(<ItemPriceHistoryScreen />);
    expect(card(32)).toEqual([
      'Price changed',
      'Example Chillies',
      'Default price',
      'Price type', 'Monthly', 'One-time',
      'Monthly price', '₹5.00',
      'One-time price', '₹7.00',
      WHEN,
      'Meera Joshi (Staff)',
    ]);
    expect(cardLabel(32)).toBe(
      `Price changed, Example Chillies, Default price, Price type: Monthly changed to One-time, Monthly price, ₹5.00, One-time price, ₹7.00, ${WHEN_SPOKEN}, Meera Joshi (Staff)`
    );
  });

  // Finding 6: the side shown is the one that is there, whatever the action says.
  it('an update that has only its old values shows them, not dashes', async () => {
    history.mockResolvedValue(
      page([
        entry(33, { action: 'update', old_values: price(5), new_values: null }),
        entry(34, { action: 'update', old_values: null, new_values: price(6) }),
      ])
    );
    await render(<ItemPriceHistoryScreen />);
    const values = (unitPrice: string) => [
      'Price changed',
      'Example Chillies',
      'Default price',
      'Price type', 'Monthly',
      'Monthly price', unitPrice,
      'Weight range', '0–100 kg',
      'Labour rate', '₹2.00',
      'Tax', '5%',
      'Start date', '01/01/26',
      'End date', 'No end date',
      WHEN,
      'Meera Joshi (Staff)',
    ];
    expect(card(33)).toEqual(values('₹5.00'));
    expect(card(34)).toEqual(values('₹6.00'));
    expect(card(33)).not.toContain('—');
  });

  it('offers nothing to edit or delete', async () => {
    history.mockResolvedValue(page([UPDATE, INSERT, DELETE, TRUNCATE]));
    await render(<ItemPriceHistoryScreen />);
    const labels = screen.queryAllByRole('button', hidden).map((node) => node.props.accessibilityLabel);
    expect([...new Set(labels)]).toEqual(['Back']);
  });

  it('writes the texts and digits of Gujarati in Gujarati', async () => {
    setLanguage('gu');
    history.mockResolvedValue(page([UPDATE, TRUNCATE]));
    await render(<ItemPriceHistoryScreen />);
    has('ફેરફારો: Example Chillies');
    expect(card(14)).toEqual([
      'દર બદલાયો',
      'Example Chillies',
      'મૂળ દર',
      'માસિક દર',
      '₹૫.૦૦',
      '₹૬.૦૦',
      '૧૧/૧૦/૨૬, ૨:૪૫ PM',
      'Meera Joshi (સ્ટાફ)',
    ]);
    expect(card(11).slice(0, 2)).toEqual(['બધા દર કાઢી નખાયા', '૧૨ દર કાઢી નખાયા']);
    expect(card(11)[3]).toBe('ઍપનો યુઝર નથી');
  });
});

describe('price history states', () => {
  it('shows the empty state when there are no changes', async () => {
    history.mockResolvedValue(page([]));
    await render(<ItemPriceHistoryScreen />);
    has('No price changes yet');
    has('Prices that are added, changed or deleted appear here.');
    expect(cardIds(true)).toEqual([]);
  });

  it('shows a retryable error, not the empty state, when the first page fails', async () => {
    history
      .mockResolvedValueOnce(failure('You do not have permission to perform this action.'))
      .mockResolvedValueOnce(page([UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    has("Couldn't load the price history");
    has('You do not have permission to perform this action.');
    lacks('No price changes yet');
    await press('Try again');
    expect(history).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 0, itemId: 'item-all' });
    lacks("Couldn't load the price history");
    expect(cardIds()).toEqual(['14']);
  });

  it('loads the next page at the end of the list while the server says there is more', async () => {
    history
      .mockResolvedValueOnce(page([UPDATE, INSERT], { total: 4, has_more: true }))
      // The first entry of the next page was already shown: a price changed while paging.
      .mockResolvedValueOnce(page([INSERT, DELETE, TRUNCATE], { total: 5, offset: 50, has_more: false }));
    await render(<ItemPriceHistoryScreen />);
    expect(cardIds()).toEqual(['14', '13']);

    await endReached();
    expect(history).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 50, itemId: 'item-all' });
    expect(cardIds()).toEqual(['14', '13', '12', '11']);

    // The last page said there is no more.
    await endReached();
    expect(history).toHaveBeenCalledTimes(2);
  });

  it('does not ask for more when the first page is the last', async () => {
    history.mockResolvedValue(page([UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    await endReached();
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('keeps the entries when a further page fails and offers to try that page again', async () => {
    history
      .mockResolvedValueOnce(page([UPDATE], { total: 2, has_more: true }))
      .mockResolvedValueOnce(failure('Try again in a moment.'))
      .mockResolvedValueOnce(page([INSERT], { total: 2, offset: 50, has_more: false }));
    await render(<ItemPriceHistoryScreen />);
    await endReached();
    expect(cardIds()).toEqual(['14']);
    has("Couldn't load more price changes.");
    // Reaching the end again does not repeat the failed request by itself.
    await endReached();
    expect(history).toHaveBeenCalledTimes(2);
    await press('Try again');
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 50, itemId: 'item-all' });
    expect(cardIds()).toEqual(['14', '13']);
    lacks("Couldn't load more price changes.");
  });

  it('pull to refresh loads the first page again; a failed refresh keeps the entries', async () => {
    history
      .mockResolvedValueOnce(page([INSERT]))
      .mockResolvedValueOnce(page([UPDATE, INSERT]))
      .mockResolvedValueOnce(failure('Try again in a moment.'));
    await render(<ItemPriceHistoryScreen />);
    await refresh();
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 0, itemId: 'item-all' });
    expect(cardIds()).toEqual(['14', '13']);
    await refresh();
    expect(cardIds()).toEqual(['14', '13']);
    // A failed refresh is a strip above the entries that stay, not a dialog.
    expect(showAlert).not.toHaveBeenCalled();
    expect(screen.getByRole('alert', { name: "Error: Couldn't refresh. These are the changes loaded earlier. Try again in a moment." })).toBeOnTheScreen();
  });

  // Finding 2: 50 or more changes written between two pages make the next page all repeats.
  it('asks for the page after one that held only entries already shown', async () => {
    history
      .mockResolvedValueOnce(page([UPDATE, INSERT], { total: 5, has_more: true }))
      .mockResolvedValueOnce(page([UPDATE, INSERT], { total: 105, offset: 50, has_more: true }))
      .mockResolvedValueOnce(page([INSERT, DELETE], { total: 105, offset: 100, has_more: false }));
    await render(<ItemPriceHistoryScreen />);
    await endReached();
    expect(history.mock.calls.map(([params]) => params?.offset)).toEqual([0, 50, 100]);
    expect(cardIds()).toEqual(['14', '13', '12']);
    expect(screen.queryByRole('button', { name: 'Load more changes', ...hidden })).not.toBeOnTheScreen();
  });

  it('stops after a few such pages and offers Load more changes, which goes on from there', async () => {
    const repeats = (offset: number) => page([UPDATE, INSERT], { total: 900, offset, has_more: true });
    history.mockImplementation(async (params) => repeats(params?.offset ?? 0));
    await render(<ItemPriceHistoryScreen />);
    await endReached();
    // The page asked for and three more, then no further request by itself.
    expect(history.mock.calls.map(([params]) => params?.offset)).toEqual([0, 50, 100, 150, 200]);
    expect(cardIds()).toEqual(['14', '13']);
    lacks('Loading more…');

    history.mockImplementation(async (params) => page([DELETE], { total: 900, offset: params?.offset ?? 0, has_more: false }));
    await press('Load more changes');
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 250, itemId: 'item-all' });
    expect(cardIds()).toEqual(['14', '13', '12']);
    expect(screen.queryByRole('button', { name: 'Load more changes', ...hidden })).not.toBeOnTheScreen();
  });

  // Finding 3.
  it('a pull to refresh while a further page loads is not dropped, and the late page is ignored', async () => {
    const more = deferred();
    const refreshed = deferred();
    history
      .mockResolvedValueOnce(page([INSERT], { total: 60, has_more: true }))
      .mockReturnValueOnce(more.promise)
      .mockReturnValueOnce(refreshed.promise);
    await render(<ItemPriceHistoryScreen />);
    await endReached();
    has('Loading more…');

    await refresh();
    expect(history).toHaveBeenCalledTimes(3);
    expect(history).toHaveBeenLastCalledWith({ limit: 50, offset: 0, itemId: 'item-all' });
    expect(refreshing()).toBe(true);
    lacks('Loading more…');

    await act(async () => { refreshed.resolve(page([UPDATE, INSERT], { total: 2, has_more: false })); });
    expect(cardIds()).toEqual(['14', '13']);
    expect(refreshing()).toBe(false);

    // The page asked for before the refresh answers last: it is for a list that is gone.
    await act(async () => { more.resolve(page([DELETE, TRUNCATE], { total: 60, offset: 50, has_more: true })); });
    expect(cardIds()).toEqual(['14', '13']);
    await endReached();
    expect(history).toHaveBeenCalledTimes(3);
  });

  it('the late page is ignored when it failed, too', async () => {
    const more = deferred();
    history
      .mockResolvedValueOnce(page([INSERT], { total: 60, has_more: true }))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page([UPDATE, INSERT]));
    await render(<ItemPriceHistoryScreen />);
    await endReached();
    await refresh();
    await act(async () => { more.resolve(failure('Try again in a moment.')); });
    expect(cardIds()).toEqual(['14', '13']);
    lacks("Couldn't load more price changes.");
  });

  // Finding 4.
  it('a refresh that fails after the screen was left shows no alert', async () => {
    const refreshed = deferred();
    history.mockResolvedValueOnce(page([INSERT])).mockReturnValueOnce(refreshed.promise);
    await render(<ItemPriceHistoryScreen />);
    await refresh();
    await screen.unmount();
    await act(async () => { refreshed.resolve(failure('Try again in a moment.')); });
    expect(showAlert).not.toHaveBeenCalled();
  });

  it.each([['staff'], [null]])('a refresh that fails after the role became %s shows no alert', async (role) => {
    const refreshed = deferred();
    history.mockResolvedValueOnce(page([INSERT])).mockReturnValueOnce(refreshed.promise);
    await render(<ItemPriceHistoryScreen />);
    await refresh();
    signedInAs(role);
    await screen.rerender(<ItemPriceHistoryScreen />);
    await act(async () => { refreshed.resolve(failure('Try again in a moment.')); });
    expect(showAlert).not.toHaveBeenCalled();
    expect(cardIds(true)).toEqual([]);
  });

  it('entries that arrive after the role changed are not shown, and a manager who returns gets a fresh list', async () => {
    const first = deferred();
    history.mockReturnValueOnce(first.promise).mockResolvedValueOnce(page([UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    signedInAs('staff');
    await screen.rerender(<ItemPriceHistoryScreen />);
    await act(async () => { first.resolve(page([INSERT])); });
    expect(cardIds(true)).toEqual([]);
    signedInAs('admin');
    await screen.rerender(<ItemPriceHistoryScreen />);
    expect(history).toHaveBeenCalledTimes(2);
    expect(cardIds()).toEqual(['14']);
  });

  it.each(['staff', 'customer'])('makes no request for a %s', async (role) => {
    signedInAs(role);
    history.mockResolvedValue(page([UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    expect(history).not.toHaveBeenCalled();
    expect(cardIds(true)).toEqual([]);
  });
});

const MODES: Mode[] = ['light', 'dark'];

describe.each(BRANDS.flatMap((brand) => MODES.map((mode) => [brand, mode] as const)))('price history in %s %s', (brand, mode) => {
  it('draws the entries on the theme background and card', async () => {
    signedInAs('admin', brand, mode);
    history.mockResolvedValue(page([UPDATE, INSERT, DELETE, TRUNCATE]));
    await render(<ItemPriceHistoryScreen />);
    const tokens = getTokens(brand, mode);
    const root = screen.root!;
    const styles = [root, ...root.queryAll((node) => typeof node.type === 'string')]
      .filter((node) => !!node.props.style)
      .flatMap((node) => [node.props.style].flat(Infinity).filter(Boolean) as Record<string, string>[]);
    const backgrounds = styles.map((style) => style.backgroundColor).filter(Boolean);
    expect(backgrounds).toContain(tokens.background.base);
    expect(backgrounds).toContain(tokens.surface.card);
    const textColours = new Set(styles.map((style) => style.color).filter(Boolean));
    expect([...textColours].every((colour) => [tokens.text.primary, tokens.text.secondary, tokens.brand.tint].includes(colour))).toBe(true);
  });
});

// "All rate changes" was a button on the old Item pricing list, which is gone: the history opens from an item's
// Pricing tab ("Changes", an item's page) and from a customer's rate page, both of which pass the item.

describe('Changes need an item or a customer', () => {
  it('without either nothing is requested: there is no all-items view', async () => {
    mockParams = {};
    history.mockResolvedValue(page([UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    expect(history).not.toHaveBeenCalled();
    expect(cardIds(true)).toEqual([]);
  });

  it('a customer\'s changes for an item name both in the title', async () => {
    mockParams = { item_id: 'item-cumin', customer_id: 'customer-1', item_name: 'Review Cumin Bold', customer_name: 'Review Orchard B' };
    history.mockResolvedValue(page([UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    has('Changes · Review Orchard B · Review Cumin Bold');
  });
});

describe('Changes of one item', () => {
  // Job (b): at one moment the rate in force was ended and the new rate added; the feed has one row each.
  const AT = '2026-10-14T05:00:00.123456+00:00';
  const cumin = (id: number, more: Partial<ItemPriceHistoryEntry>) =>
    entry(id, { changed_at: AT, item_id: 'item-cumin', item_name: 'Review Cumin Bold', changed_by_name: 'Dev Administrator', changed_by_role: 'admin', ...more });
  const ENDED = cumin(22, {
    action: 'update',
    old_values: price(11, { effective_from: '2026-04-01' }),
    new_values: price(11, { effective_from: '2026-04-01', effective_to: '2026-12-31' }),
  });
  const ADDED = cumin(23, { action: 'insert', new_values: price(12, { effective_from: '2027-01-01' }) });
  const WHEN_JOB = '14/10/26, 10:30 am';

  it('asks the server for that item only, and names it in the title', async () => {
    mockParams = { item_id: 'item-cumin', item_name: 'Review Cumin Bold' };
    history.mockResolvedValue(page([ADDED, ENDED]));
    await render(<ItemPriceHistoryScreen />);
    expect(history).toHaveBeenCalledWith({ limit: 50, offset: 0, itemId: 'item-cumin' });
    has('Changes: Review Cumin Bold');
    lacks('Price history');
  });

  it('passes the customer on, and takes the title from the first entry when no name was sent', async () => {
    mockParams = { item_id: 'item-cumin', customer_id: 'customer-1' };
    history.mockResolvedValue(page([ADDED, ENDED]));
    await render(<ItemPriceHistoryScreen />);
    expect(history).toHaveBeenCalledWith({ limit: 50, offset: 0, itemId: 'item-cumin', customerId: 'customer-1' });
    has('Changes: Review Cumin Bold');
  });

  it('two rows written by one save are one card, with only the changed value, two decimals', async () => {
    mockParams = { item_id: 'item-cumin', item_name: 'Review Cumin Bold' };
    history.mockResolvedValue(page([ADDED, ENDED]));
    await render(<ItemPriceHistoryScreen />);
    const group = screen.getByTestId('price-history-group-23');
    expect(group).toBeDefined();
    expect(cardIds(true)).toEqual([]);
    const texts = textsOf(group);
    expect(texts).toEqual([
      'Rate changed from 01/01/27',
      'Review Cumin Bold',
      'Default price',
      'Monthly price',
      '₹11.00 → ₹12.00',
      WHEN_JOB,
      'Dev Administrator (Admin)',
    ]);
  });

  it('a save that only ended the rate reads "Rate stopped after"', async () => {
    mockParams = { item_id: 'item-cumin' };
    history.mockResolvedValue(page([ENDED, cumin(21, { action: 'update', old_values: price(9, { effective_from: '2026-04-01' }), new_values: price(9, { effective_from: '2026-04-01', effective_to: '2026-12-31' }) })]));
    await render(<ItemPriceHistoryScreen />);
    const group = screen.getByTestId('price-history-group-22');
    expect(textsOf(group).slice(0, 1)).toEqual(['Rate stopped after 31/12/26']);
  });

  it('a lone entry still draws as before, and rows of different saves stay apart', async () => {
    history.mockResolvedValue(page([ADDED, UPDATE]));
    await render(<ItemPriceHistoryScreen />);
    expect(cardIds()).toEqual(['23', '14']);
  });

  it('a group split by the page edge joins when the next page arrives', async () => {
    mockParams = { item_id: 'item-cumin' };
    history
      .mockResolvedValueOnce(page([ADDED], { total: 2, has_more: true }))
      .mockResolvedValueOnce(page([ENDED], { total: 2, offset: 50, has_more: false }));
    await render(<ItemPriceHistoryScreen />);
    expect(cardIds()).toEqual(['23']);
    await endReached();
    expect(cardIds(true)).toEqual([]);
    expect(screen.queryAllByTestId('price-history-group-23', hidden)).toHaveLength(1);
  });

  it('writes the group in Gujarati', async () => {
    setLanguage('gu');
    mockParams = { item_id: 'item-cumin', item_name: 'Review Cumin Bold' };
    history.mockResolvedValue(page([ADDED, ENDED]));
    await render(<ItemPriceHistoryScreen />);
    has('ફેરફારો: Review Cumin Bold');
    const group = screen.getByTestId('price-history-group-23');
    const texts = textsOf(group);
    expect(texts[0]).toBe('૦૧/૦૧/૨૭ થી દર બદલાયો');
    expect(texts).toContain('₹૧૧.૦૦ → ₹૧૨.૦૦');
  });
});
