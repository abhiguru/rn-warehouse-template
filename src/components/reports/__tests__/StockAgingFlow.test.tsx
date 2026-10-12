/**
 * The stock aging report with a real store: the sort, search, bucket choice
 * and "Clear all" are worked through the filter bar and the search field as a
 * person would, and what the report remembers is read back from the store,
 * also by a new screen after a restart. Only the services and the router are
 * stand-ins. The rows are made so that every change gives an order of its own.
 *
 * The report is of today's stock: it has no period, and each level asks the
 * server once, with the same arguments whatever is chosen.
 */
import React from 'react';
import { LayoutAnimation, StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { setLanguage } from '@/i18n';
import { EXPAND_ANIMATION } from '@/components/reports/StockItemCard';
import { getAllStockAging, getCustomerStockAging } from '@/services/reporting/stock-aging-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { showAlert } from '@/utils/alert';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import StockAgingScreen from '../../../../app/reports/stock-aging';

const mockPush = jest.fn();
const mockRouterPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockStore: Store;
// The app's hooks, reading the test's store and drawing again when it changes, as react-redux
// does (react-redux itself is not set up to load under Jest here).
jest.mock('@/store/hooks', () => {
  const { useRef, useSyncExternalStore } = jest.requireActual('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) => {
      const last = useRef(null);
      const read = () => {
        const state = mockStore.getState();
        if (!last.current || last.current.state !== state || last.current.selector !== selector) {
          last.current = { state, selector, value: selector(state) };
        }
        return last.current.value;
      };
      return useSyncExternalStore(mockStore.subscribe, read);
    },
  };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateReportPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});
jest.mock('@/services/reporting/stock-aging-service', () => ({ getAllStockAging: jest.fn(), getCustomerStockAging: jest.fn() }));

const allAging = jest.mocked(getAllStockAging);
const customerAging = jest.mocked(getCustomerStockAging);
const makePdf = jest.mocked(generateReportPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const alert = jest.mocked(showAlert);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// ---------------------------------------------------------------------------
// Rows. No two share a value in a sorted column.
// ---------------------------------------------------------------------------

const customer = (id: string, name: string, averageAge: number, stock: number, over: number) => ({
  customer_id: id,
  customer_name: name,
  total_stock: stock,
  average_age_days: averageAge,
  oldest_stock_days: averageAge + 50,
  items_over_365_days: over,
  aging_distribution: {},
});
const CUSTOMERS = [
  customer('c1', 'Riverbank Produce', 400, 80, 2),
  customer('c2', 'Green Valley Traders', 50, 300, 0),
  customer('c3', 'Sunrise Agro Foods', 200, 120, 1),
  customer('c4', 'Hillside Produce Co', 130, 50, 0),
];
// The bar's "Over 364 days" bucket has 4 items; the RPC's count over 365 days says 9.
// The KPI must agree with the bar.
const BY_BUCKET = {
  '0-120': { item_count: 5, total_quantity: 300, percentage: 54.5 },
  '121-240': { item_count: 3, total_quantity: 120, percentage: 21.8 },
  '241-364': { item_count: 2, total_quantity: 50, percentage: 9.1 },
  '364+': { item_count: 4, total_quantity: 80, percentage: 14.6 },
};
const answerCustomers = {
  success: true,
  message: '',
  data: {
    summary: { total_customers: 4, total_items: 14, total_quantity: 550, oldest_stock_days: 450, average_age_days: 160, items_over_365_days: 9, qty_over_365_days: 70 },
    by_bucket: BY_BUCKET,
    by_customer: CUSTOMERS,
  },
};

const line = (grnId: string, number: string, item: string, stock: number, age: number, bucket: string, over: Record<string, unknown> = {}) => ({
  grn_id: grnId,
  gr_no: number,
  item_name: item,
  packaging: 'Bag',
  current_stock: stock,
  original_qty: stock + 10,
  weight: 0,
  rack: '',
  package_mark: '',
  grn_date: '2025-09-07',
  aging_days: age,
  aging_bucket: bucket,
  dispatch_info: { total_dispatched: 10, dispatch_count: 2, last_dispatch_date: '2026-09-01', days_since_last_dispatch: 41, avg_days_between_dispatches: 12.4 },
  ...over,
});
// Turmeric is stored as two lines of the same GRN (a bag and a crate), which open separately.
const LINES = [
  line('g1', 'A0010', 'Garlic', 30, 400, '364+'),
  line('g2', 'A0020', 'Cumin', 200, 150, '121-240'),
  line('g3', 'A0030', 'Turmeric', 10, 300, '241-364', { rack: 'R1' }),
  line('g4', 'A0011', 'Garlic', 20, 90, '0-120'),
  line('g3', 'A0030', 'Turmeric', 15, 300, '241-364', { rack: 'R2', packaging: 'Crate' }),
  line('g5', 'A0040', 'Red chilli', 120, 30, '0-120'),
];
const answerLines = {
  success: true,
  message: '',
  data: {
    summary: {
      total_items: 6, total_quantity: 395, total_weight_kg: 0, oldest_stock_days: 400, average_age_days: 210,
      items_over_365_days: 7, qty_over_365_days: 30, avg_dispatch_velocity_days: null, items_no_recent_dispatch: 0,
    },
    by_bucket: {
      '0-120': { item_count: 2, total_quantity: 140, total_weight: 0, percentage: 35.4 },
      '121-240': { item_count: 1, total_quantity: 200, total_weight: 0, percentage: 50.6 },
      '241-364': { item_count: 2, total_quantity: 25, total_weight: 0, percentage: 6.3 },
      '364+': { item_count: 1, total_quantity: 30, total_weight: 0, percentage: 7.6 },
    },
    items: LINES,
  },
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeStore(auth: unknown = STAFF, reportPrefs?: ReportPrefsState, theme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' }) {
  return configureStore({
    reducer: {
      auth: (state: unknown = auth) => state,
      theme: (state = theme) => state,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
    },
    preloadedState: reportPrefs ? { reportPrefs } : undefined,
  });
}
type Store = ReturnType<typeof makeStore>;

// Each test is a run of several taps, sheets and answers: under a full parallel run the first
// one, which draws the screen for the first time, can take longer than Jest's 5 seconds.
jest.setTimeout(30_000);

// A mounted skeleton or query keeps timers alive: every tree is taken down after its test.
const mounted: TestRenderer.ReactTestRenderer[] = [];
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(() => {
  // Only the calendar is fixed (Monday 12 October 2026, 10:00); timers run as usual.
  jest.useFakeTimers({
    now: new Date(2026, 9, 12, 10, 0),
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
  forgetQueries();
  jest.clearAllMocks();
  resetReportExportAvailability();
  sharePdf.mockResolvedValue({ success: true });
  mockParams = {};
  allAging.mockResolvedValue(answerCustomers as never);
  customerAging.mockResolvedValue(answerLines as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
  setLanguage('en');
});

const textOf = (node: TestRenderer.ReactTestInstance) => [node.props.children].flat().join('');

async function open(store: Store) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<StockAgingScreen />);
    await settleQueries();
  });
  mounted.push(tree);

  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const controls = (match: (label: string) => boolean) =>
    tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && match(node.props.accessibilityLabel) && typeof node.props.onPress === 'function');
  const control = (label: string) => {
    const found = controls(text => text === label);
    if (found.length === 0) throw new Error(`No control labelled "${label}"`);
    return found[0];
  };
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(textOf);
  /** The item rows (buttons that open and close), with their state. */
  const toggles = () => tree.root.findAll(node => typeof node.props.onPress === 'function' && typeof node.props.accessibilityState?.expanded === 'boolean');
  return {
    tree,
    texts,
    control,
    press: (label: string) => run(() => control(label).props.onPress()),
    pressStarting: (start: string, index = 0) => run(() => controls(text => text.startsWith(start))[index].props.onPress()),
    has: (label: string) => controls(text => text === label).length > 0,
    labels: () => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string),
    /** Customer names in the order the rows show them. */
    customers: () => tree.root.findAllByType(ReportCustomerCard).map(card => card.props.title as string),
    /** Item names in the order the rows show them. */
    items: () => toggles().map(node => String(node.props.accessibilityLabel)).filter(label => !label.startsWith('GRN ')).map(label => label.split(',')[0]),
    /** GRN lines of the open items: their label's title and whether each is open. */
    lines: () => toggles().map(node => [String(node.props.accessibilityLabel), node.props.accessibilityState.expanded] as const).filter(([label]) => label.startsWith('GRN ')).map(([label, expanded]) => `${label.split(',')[0]}${expanded ? ' (open)' : ''}`),
    status: () => texts().find(text => text.includes('Last updated')),
    search: async (text: string) => {
      const field = tree.root.findAll(node => typeof node.props.onChangeText === 'function' && typeof node.props.onSubmitEditing === 'function')[0];
      await run(() => field.props.onChangeText(text));
      // Submitting commits at once, without waiting for the field's 300 ms pause.
      await run(() => tree.root.findAll(node => typeof node.props.onSubmitEditing === 'function')[0].props.onSubmitEditing());
    },
    searchValue: () => tree.root.findAll(node => typeof node.props.onChangeText === 'function')[0].props.value as string,
    refresh: () => run(() => tree.root.findByType('FlashList' as never).props.refreshControl.props.onRefresh()),
    bold: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
        .map(textOf),
  };
}

const DEFAULT_ORDER = ['Riverbank Produce', 'Sunrise Agro Foods', 'Hillside Produce Co', 'Green Valley Traders'];
const ITEMS_BY_AGE = ['Garlic', 'Turmeric', 'Cumin', 'Red chilli'];
const openGreenValley = () => {
  mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
};

// ---------------------------------------------------------------------------

describe('stock aging, every customer', () => {
  it('asks once with no period, oldest average first, and its oldest-stock figure is the bar\'s over-364 bucket', async () => {
    const screen = await open(makeStore());
    // Today's stock: no dates, and no arguments at all.
    expect(allAging.mock.calls).toEqual([[]]);
    expect(customerAging).not.toHaveBeenCalled();
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    // No range in the status line.
    expect(screen.status()).toBe('Last updated 10:00 am');
    expect(screen.has('Sorted by Average age, highest first. Change sort')).toBe(true);
    expect(screen.labels().filter(label => label.startsWith('Period'))).toEqual([]);

    // The KPI is by_bucket['364+'].item_count (4), named as a count of items in the bucket's own
    // words; not the RPC's items_over_365_days (9), which counts from 365.
    expect(screen.labels()).toEqual(expect.arrayContaining(['Items: 14', 'Average age: 160 days', 'Items over 364 days: 4']));
    expect(screen.labels()).not.toContain('Items over 364 days: 9');
    expect(screen.labels()).not.toContain('Over 364 days: 4');
    expect(screen.labels().filter(label => label.startsWith('Over 1 year'))).toEqual([]);
    expect(screen.texts()).toEqual(expect.arrayContaining(['Stock age', '0–120 days', '121–240 days', '241–364 days', 'Over 364 days']));
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Average age, highest first. Change sort');
    await screen.press('Stock');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co']);
    await screen.press('Lowest first');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders']);
    // The field changed and the direction was kept: A to Z.
    await screen.press('Customer');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Done');
    expect(screen.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    // Sorting is done on the rows already read: nothing more is asked.
    expect(allAging).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the sort kept', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Average age, highest first. Change sort');
    await screen.press('Stock');
    await screen.press('Done');

    await screen.search('produce');
    expect(screen.customers()).toEqual(['Riverbank Produce', 'Hillside Produce Co']);
    expect(screen.bold()).toEqual(['Produce', 'Produce']);
    expect(screen.status()).toBe('Showing 2 of 4 · Last updated 10:00 am');
    // The figures are the whole stock's, not what the search leaves.
    expect(screen.labels()).toContain('Items over 364 days: 4');

    await screen.press('Clear all filters and the search');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co']);
    expect(screen.searchValue()).toBe('');
    expect(screen.bold()).toEqual([]);
    expect(screen.has('Sorted by Stock, highest first. Change sort')).toBe(true);
    expect(allAging).toHaveBeenCalledTimes(1);
  });

  it('gives each customer its average age alone, on up to two lines: no "over 1 year" count', async () => {
    const screen = await open(makeStore());
    const cards = screen.tree.root.findAllByType(ReportCustomerCard);
    // Average ages 400, 200, 130 and 50 days; Riverbank has 2 lines over 365 days and Sunrise 1.
    expect(cards.map(card => card.props.subtitle)).toEqual(['Average age 400 days', 'Average age 200 days', 'Average age 130 days', 'Average age 50 days']);
    expect(cards.map(card => card.props.subtitleLines)).toEqual([2, 2, 2, 2]);
    expect(screen.texts().filter(text => /over 1 year/i.test(text))).toEqual([]);
    expect(screen.labels().filter(label => /over 1 year/i.test(label))).toEqual([]);
    // The drawn subtitle may wrap to a second line rather than be cut.
    const subtitle = cards[0].findAll(node => (node.type as unknown) === 'Text' && [node.props.children].flat().join('') === 'Average age 400 days');
    expect(subtitle).toHaveLength(1);
    expect(subtitle[0].props.numberOfLines).toBe(2);
    expect(screen.has('Riverbank Produce, Average age 400 days, 80 units, Average: Over 364 days')).toBe(true);
  });

  it('tags each customer with the bucket of its average age, saying it is the average', async () => {
    const screen = await open(makeStore());
    const tags = screen.tree.root.findAllByType(ReportCustomerCard).map(card => card.props.status);
    // Average ages 400, 200, 130 and 50 days.
    expect(tags).toEqual([
      { status: 'negative', label: 'Average: Over 364 days' },
      { status: 'informative', label: 'Average: 121–240 days' },
      { status: 'informative', label: 'Average: 121–240 days' },
      { status: 'positive', label: 'Average: 0–120 days' },
    ]);
  });

  it('opens a customer as a route and remembers it; after a restart the sort and that customer are back', async () => {
    const store = makeStore();
    const screen = await open(store);
    await screen.press('Sorted by Average age, highest first. Change sort');
    await screen.press('Customer');
    await screen.press('A to Z');
    await screen.press('Done');
    const byName = ['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods'];
    expect(screen.customers()).toEqual(byName);
    expect(screen.texts()).not.toContain('Last opened');

    await screen.pressStarting('Riverbank Produce, ');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/stock-aging', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'stock-aging': { id: 'c1', name: 'Riverbank Produce' } });

    // A restart: the screen is gone, the answers in memory are gone, and only the
    // persisted choices come back, read as the app reads them from the phone.
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    forgetQueries();
    allAging.mockClear();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(allAging.mock.calls).toEqual([[]]);
    expect(again.customers()).toEqual(byName);
    expect(again.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(again.texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));

    await again.press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/stock-aging', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
  });

  it('keeps the rows when a refresh fails, and says they are not current', async () => {
    const screen = await open(makeStore());
    allAging.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await screen.refresh();
    expect(allAging).toHaveBeenCalledTimes(2);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    // The service's own words for a failure are not shown; the screen's are (useReportQuery).
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", "Couldn't load stock aging. Check your connection and try again."]));
  });

  it('says what failed and why when the report could not be read', async () => {
    allAging.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    const screen = await open(makeStore());
    // Not an access refusal: the screen's own words, not the service's.
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't load stock aging", "Couldn't load stock aging. Check your connection and try again.", 'Try again']));
    expect(screen.texts()).not.toContain('The facility refused this report.');
  });
});

describe('stock aging, one customer', () => {
  it('asks for the customer alone, oldest item first, with the figures of the whole stock', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    expect(customerAging.mock.calls).toEqual([[{ customerId: 'c2' }]]);
    expect(allAging).not.toHaveBeenCalled();
    expect(screen.items()).toEqual(ITEMS_BY_AGE);
    expect(screen.status()).toBe('Last updated 10:00 am');
    // The server's total_items says 6, which counts stock lines (Garlic and Turmeric are on two
    // lines each). The tile counts what the cards below show: 4 items.
    // by_bucket['364+'].item_count is 1; items_over_365_days says 7.
    expect(screen.items()).toHaveLength(4);
    expect(screen.labels()).toEqual(expect.arrayContaining(['Items: 4', 'Items over 364 days: 1']));
    expect(screen.labels()).not.toContain('Items: 6');
    // The tag on an item gives its oldest line's age, and says so.
    expect(screen.texts()).toEqual(expect.arrayContaining(['Oldest 400 days', 'Oldest 300 days', 'Oldest 150 days', 'Oldest 30 days']));
  });

  it('orders the items by age, stock or name, and the other direction reverses them', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    await screen.press('Sorted by Age, highest first. Change sort');
    await screen.press('Stock');
    expect(screen.items()).toEqual(['Cumin', 'Red chilli', 'Garlic', 'Turmeric']);
    await screen.press('Item');
    // The direction was kept: Z to A.
    expect(screen.items()).toEqual(['Turmeric', 'Red chilli', 'Garlic', 'Cumin']);
    await screen.press('A to Z');
    expect(screen.items()).toEqual(['Cumin', 'Garlic', 'Red chilli', 'Turmeric']);
    await screen.press('Age');
    expect(screen.items()).toEqual(['Red chilli', 'Cumin', 'Turmeric', 'Garlic']);
    await screen.press('Done');
    expect(customerAging).toHaveBeenCalledTimes(1);
  });

  it('narrows to the lines of one age bucket, and Clear all brings the rest back with the sort kept', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    await screen.press('Sorted by Age, highest first. Change sort');
    await screen.press('Stock');
    await screen.press('Done');

    await screen.press('Filter by stock age');
    await screen.press('0–120 days');
    // Garlic keeps only its 90-day line (20 units), Red chilli its one line.
    expect(screen.items()).toEqual(['Red chilli', 'Garlic']);
    expect(screen.labels()).toEqual(expect.arrayContaining(['Garlic, 1 GRN, 20 units, oldest 90 days']));
    expect(screen.status()).toBe('Showing 2 of 4 · Last updated 10:00 am');
    expect(screen.has('Stock age: 0–120 days. Change')).toBe(true);

    await screen.press('Clear all filters and the search');
    expect(screen.items()).toEqual(['Cumin', 'Red chilli', 'Garlic', 'Turmeric']);
    expect(screen.has('Sorted by Stock, highest first. Change sort')).toBe(true);
    expect(customerAging).toHaveBeenCalledTimes(1);
  });

  it('searches the item names and the GRN numbers, and names a GRN found inside a closed item', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    await screen.search('garlic');
    expect(screen.items()).toEqual(['Garlic']);
    expect(screen.labels()).toContain('Garlic, 2 GRNs, 50 units, oldest 400 days');

    await screen.search('a0011');
    expect(screen.items()).toEqual(['Garlic']);
    expect(screen.labels()).toContain('Garlic, 1 GRN, 20 units, oldest 90 days, GRN A0011');
    expect(screen.bold()).toEqual(['A0011']);

    await screen.search('a0030');
    expect(screen.items()).toEqual(['Turmeric']);
    expect(screen.status()).toBe('Showing 1 of 4 · Last updated 10:00 am');
  });

  it('opens an item and each of its lines on its own, two lines of one GRN included, and a line opens its GRN', async () => {
    const animate = jest.spyOn(LayoutAnimation, 'configureNext');
    openGreenValley();
    const screen = await open(makeStore());
    expect(screen.lines()).toEqual([]);

    await screen.pressStarting('Turmeric, ');
    expect(screen.lines()).toEqual(['GRN A0030 · Rack R1', 'GRN A0030 · Rack R2']);
    expect(animate).toHaveBeenLastCalledWith(EXPAND_ANIMATION);

    // Only the line pressed opens, though both are on GRN A0030.
    await screen.pressStarting('GRN A0030 · Rack R2, ');
    expect(screen.lines()).toEqual(['GRN A0030 · Rack R1', 'GRN A0030 · Rack R2 (open)']);
    expect(screen.texts().filter(text => text === 'View GRN A0030')).toHaveLength(1);
    // The details are key-value cells, which stack at large text.
    const cells = screen.tree.root.findAllByType(KeyValueCell).map(cell => [cell.props.keyLabel, cell.props.value]);
    expect(cells).toEqual([
      ['Received quantity', '25'],
      ['Package mark', '—'],
      ['Dispatched', '10 in 2 dispatches'],
      ['Last dispatch', '1 Sep 2026'],
      ['Average time between dispatches', '12 days'],
    ]);

    await screen.pressStarting('GRN A0030 · Rack R1, ');
    expect(screen.lines()).toEqual(['GRN A0030 · Rack R1 (open)', 'GRN A0030 · Rack R2 (open)']);
    await screen.pressStarting('GRN A0030 · Rack R2, ');
    expect(screen.lines()).toEqual(['GRN A0030 · Rack R1 (open)', 'GRN A0030 · Rack R2']);

    await screen.pressStarting('View GRN A0030');
    expect(mockRouterPush).toHaveBeenCalledWith('/grn-details/g3');

    // Another item opens without touching this one's lines.
    await screen.pressStarting('Garlic, ');
    expect(screen.lines()).toEqual(['GRN A0010', 'GRN A0011', 'GRN A0030 · Rack R1 (open)', 'GRN A0030 · Rack R2']);
    animate.mockRestore();
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(allAging).not.toHaveBeenCalled();
    expect(customerAging).not.toHaveBeenCalled();
    expect(screen.texts()).toContain('No customer linked');
    expect(screen.texts()).not.toContain('Riverbank Produce');
    expect(screen.has('Try again')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A stock of one reads "1 unit"; the Items tile counts the item cards
// ---------------------------------------------------------------------------

describe('stock aging, units and the Items tile', () => {
  // Seed Item 01 has a stock of one, Seed Item 02 a stock of two: the wording must differ.
  const SEED = {
    success: true,
    message: '',
    data: {
      ...answerLines.data,
      summary: { ...answerLines.data.summary, total_items: 2 },
      items: [line('g1', 'A0001', 'Seed Item 01', 1, 11, '0-120'), line('g2', 'A0002', 'Seed Item 02', 2, 40, '0-120')],
    },
  };

  it('every customer: a customer with a stock of one says "1 unit", one with more says "units"', async () => {
    allAging.mockResolvedValue({ ...answerCustomers, data: { ...answerCustomers.data, by_customer: [customer('c5', 'Single Bag Traders', 50, 1, 0), CUSTOMERS[1]] } } as never);
    const screen = await open(makeStore());
    const cards = screen.tree.root.findAllByType(ReportCustomerCard);
    expect(cards.map(card => [card.props.title, card.props.valueLabel])).toEqual([
      ['Green Valley Traders', 'units'],
      ['Single Bag Traders', 'unit'],
    ]);
    expect(screen.labels()).toEqual(
      expect.arrayContaining(['Single Bag Traders, Average age 50 days, 1 unit, Average: 0–120 days', 'Green Valley Traders, Average age 50 days, 300 units, Average: 0–120 days'])
    );
    expect(screen.labels().filter(label => label.includes(' 1 units'))).toEqual([]);
  });

  it('one customer: the card, the stock label under the figure and the lot line say "1 unit"', async () => {
    openGreenValley();
    customerAging.mockResolvedValue(SEED as never);
    const screen = await open(makeStore());
    expect(screen.items()).toEqual(['Seed Item 02', 'Seed Item 01']);
    expect(screen.labels()).toEqual(
      expect.arrayContaining(['Seed Item 01, 1 GRN, 1 unit, oldest 11 days', 'Seed Item 02, 1 GRN, 2 units, oldest 40 days'])
    );
    // The word under each figure, in the order of the cards.
    expect(screen.texts().filter(text => text === 'unit' || text === 'units')).toEqual(['units', 'unit']);

    await screen.pressStarting('Seed Item 01, ');
    await screen.pressStarting('Seed Item 02, ');
    // (A pressable repeats its label on the wrappers React draws around it: each is listed once.)
    const lots = [...new Set(screen.labels().filter(label => label.startsWith('GRN A000')))];
    expect(lots.sort()).toEqual(['GRN A0001, received 7 Sep 2025, 11 days in storage, 1 unit', 'GRN A0002, received 7 Sep 2025, 40 days in storage, 2 units']);
    expect(screen.labels().filter(label => label.endsWith(', 1 units'))).toEqual([]);
  });

  it('one customer in Gujarati: the noun does not change, and is written once', async () => {
    setLanguage('gu');
    openGreenValley();
    customerAging.mockResolvedValue(SEED as never);
    const screen = await open(makeStore());
    expect(screen.labels()).toEqual(
      expect.arrayContaining([
        'Seed Item 01, ૧ આવક પાવતી, ૧ નંગ, સૌથી જૂનો માલ ૧૧ દિવસથી',
        'Seed Item 02, ૧ આવક પાવતી, ૨ નંગ, સૌથી જૂનો માલ ૪૦ દિવસથી',
      ])
    );
    expect(screen.texts().filter(text => text === 'નંગ')).toEqual(['નંગ', 'નંગ']);
    await screen.pressStarting('Seed Item 01, ');
    expect([...new Set(screen.labels().filter(label => label.startsWith('આવક પાવતી A0001')))]).toEqual(['આવક પાવતી A0001, આવક તા. ૭ સપ્ટે ૨૦૨૫, ૧૧ દિવસથી પડ્યો છે, ૧ નંગ']);
  });

  it('one customer: the Items tile counts the item cards, whatever the search or the filter leaves', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    // 6 stock lines on 4 items: Garlic and Turmeric are each on two lines.
    expect(answerLines.data.items).toHaveLength(6);
    expect(screen.items()).toHaveLength(4);
    expect(screen.labels()).toContain('Items: 4');

    await screen.search('garlic');
    expect(screen.items()).toEqual(['Garlic']);
    expect(screen.status()).toBe('Showing 1 of 4 · Last updated 10:00 am');
    expect(screen.labels()).toContain('Items: 4');

    await screen.press('Clear all filters and the search');
    await screen.press('Filter by stock age');
    await screen.press('0–120 days');
    expect(screen.items()).toEqual(['Garlic', 'Red chilli']);
    expect(screen.labels()).toContain('Items: 4');
  });

  it('every customer: the Items tile is still the server\'s figure, as the list has customers and no items to count', async () => {
    const screen = await open(makeStore());
    expect(screen.customers()).toHaveLength(4);
    expect(screen.labels()).toContain('Items: 14');
  });
});

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('stock aging in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  const backgrounds = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAll(node => typeof node.type === 'string').map(node => {
      const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
      return StyleSheet.flatten(style)?.backgroundColor;
    });

  it('every customer: rows, bar and figures on theme tokens', async () => {
    const screen = await open(makeStore(STAFF, undefined, { preference: mode, brand }));
    expect(backgrounds(screen.tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.status.positive.element, t.status.negative.element]));
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
  });

  it('one customer: an open item and an open line on theme tokens', async () => {
    openGreenValley();
    const screen = await open(makeStore(STAFF, undefined, { preference: mode, brand }));
    await screen.pressStarting('Garlic, ');
    await screen.pressStarting('GRN A0010, ');
    expect(backgrounds(screen.tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.subtle, t.status.negative.background]));
    expect(screen.lines()).toEqual(['GRN A0010 (open)', 'GRN A0011']);
  });
});

// ---------------------------------------------------------------------------
// The report PDF
// ---------------------------------------------------------------------------

const PDF_URL = 'https://warehouse.example.test/storage/v1/object/sign/documents/report/r.pdf?token=fictional';
const NOT_AVAILABLE = 'This report is not available to your account as a PDF.';
const NEEDS_UPDATE = "This facility's server needs an update before reports can be shared as PDF.";

/**
 * The header's export action sends exactly `request` (a field it leaves out is
 * not sent at all) and is busy until the file is shared under `filename`; a
 * 403 is said in an alert and the action stays; a server without report PDFs
 * is said once and the action goes.
 */
async function sharesThePdf(screen: Awaited<ReturnType<typeof open>>, request: Record<string, unknown>, filename: string, label = 'Share PDF') {
  let answer!: (result: ReportPdfResult) => void;
  makePdf.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  await screen.press(label);
  expect(makePdf.mock.calls).toEqual([[request]]);
  for (const field of ['customer_id', 'from', 'to', 'sort']) {
    if (!(field in request)) expect(makePdf.mock.calls[0][0]).not.toHaveProperty(field);
  }
  expect(screen.control(label).props.accessibilityState).toMatchObject({ busy: true });
  expect(sharePdf).not.toHaveBeenCalled();
  await act(async () => {
    answer({ success: true, pdfUrl: PDF_URL });
    await settleQueries();
  });
  expect(sharePdf.mock.calls).toEqual([[PDF_URL, filename]]);
  expect(screen.control(label).props.accessibilityState).toMatchObject({ busy: false });
  expect(alert).not.toHaveBeenCalled();

  makePdf.mockResolvedValueOnce({ success: false, reason: 'forbidden', error: NOT_AVAILABLE });
  await screen.press(label);
  expect(alert.mock.calls).toEqual([["Couldn't create the PDF", NOT_AVAILABLE]]);
  expect(sharePdf).toHaveBeenCalledTimes(1);
  expect(screen.has(label)).toBe(true);

  makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: NEEDS_UPDATE });
  await screen.press(label);
  expect(alert.mock.calls[1]).toEqual(["Couldn't create the PDF", NEEDS_UPDATE]);
  expect(screen.has(label)).toBe(false);
}

describe('stock aging, the report PDF', () => {
  it('every customer: shares the sort on screen as the PDF names it, with no customer and no dates', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Average age, highest first. Change sort');
    await screen.press('Customer');
    await screen.press('Done');
    expect(screen.has('Sorted by Customer, Z to A. Change sort')).toBe(true);
    await sharesThePdf(screen, { report: 'stock-aging', sort: { field: 'customer', order: 'desc' } }, 'Stock_aging_All_customers.pdf');
  });

  it('one customer: shares that customer and the sort on screen, with no dates', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    // The screen's "Age" is the PDF's age column.
    expect(screen.has('Sorted by Age, highest first. Change sort')).toBe(true);
    await sharesThePdf(
      screen,
      { report: 'stock-aging', customer_id: 'c2', sort: { field: 'age', order: 'desc' } },
      'Stock_aging_Green_Valley_Traders.pdf'
    );
  });
});
