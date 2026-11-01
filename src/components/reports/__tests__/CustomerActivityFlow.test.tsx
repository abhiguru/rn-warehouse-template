/**
 * The customer activity report with a real store: the period, sort, search and
 * "Clear all" are worked through the filter bar and the search field as a
 * person would, and what the report remembers is read back from the store.
 * One customer's dashboard is checked for what it asks, what its cards count
 * and open, its stock trend (empty, full screen, chart or table) and its empty
 * state. Only the services, the chart library and the router are stand-ins.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { getAllCustomerActivity, getCustomerActivityDetail } from '@/services/reporting/customer-activity-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, touchTarget, type Brand, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { showAlert } from '@/utils/alert';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import CustomerActivityScreen from '../../../../app/reports/customer-activity';

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
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Riverside', companyName: 'Riverside Cold Storage' }),
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
jest.mock('@/services/reporting/customer-activity-service', () => ({ getAllCustomerActivity: jest.fn(), getCustomerActivityDetail: jest.fn() }));

const allActivity = jest.mocked(getAllCustomerActivity);
const detail = jest.mocked(getCustomerActivityDetail);
const makePdf = jest.mocked(generateReportPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const alert = jest.mocked(showAlert);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// ---------------------------------------------------------------------------
// Rows. No two share a value in a sorted column; the 240-day period adds one.
// ---------------------------------------------------------------------------

const customer = (id: string, name: string, city: string, stock: number, invoiced: number, lastActive: string) => ({
  customer_id: id,
  customer_name: name,
  customer_city: city,
  current_stock: stock,
  total_grns: 2,
  total_dispatches: 1,
  total_invoice_amount: invoiced,
  last_activity_date: lastActive,
  last_activity_type: 'grn' as const,
});
const CUSTOMERS = [
  customer('c1', 'Riverbank Produce', 'Rajkot', 80, 5000, '2026-08-11'),
  customer('c2', 'Green Valley Traders', 'Surat', 300, 1200, '2026-09-20'),
  customer('c3', 'Sunrise Agro Foods', 'Anand', 120, 9000, '2026-07-01'),
  customer('c4', 'Hillside Produce Co', 'Morbi', 50, 300, '2026-10-12'),
];
const OLD_MILL = customer('c5', 'Old Mill Stores', 'Vadodara', 10, 50, '2026-03-02');
const answerCustomers = (rows: ReturnType<typeof customer>[]) => ({
  success: true,
  message: '',
  data: { summary: { total_customers: rows.length, total_current_stock: 550, total_grns: 8, total_dispatches: 4, total_invoice_amount: 15500 }, customers: rows },
});

// The preview arrays are shorter than the period's totals, as the RPC sends them.
const DETAIL = {
  customer_id: 'c2',
  customer_name: 'Green Valley Traders',
  customer_city: 'Surat',
  summary: {
    current_stock: 300, total_grns: 12, total_grn_quantity: 900, total_dispatches: 7, total_dispatch_quantity: 600,
    total_invoice_amount: 15400, total_paid_amount: 10000, total_pending_amount: 5400, average_stock_age_days: 140,
  },
  monthly_trends: [
    { month: '2026-08', grn_count: 3, grn_quantity: 300, dispatch_count: 1, dispatch_quantity: 100, invoice_amount: 0, stock_level_end: 200 },
    { month: '2026-09', grn_count: 6, grn_quantity: 1100, dispatch_count: 2, dispatch_quantity: 100, invoice_amount: 0, stock_level_end: 1200 },
    { month: '2026-10', grn_count: 3, grn_quantity: 0, dispatch_count: 4, dispatch_quantity: 900, invoice_amount: 0, stock_level_end: 300 },
  ],
  by_bucket: {
    '0-120': { item_count: 2, total_quantity: 200, percentage: 66.7 },
    '364+': { item_count: 1, total_quantity: 100, percentage: 33.3 },
  },
  recent_grns: [
    { grn_id: 'g1', gr_no: 'A0010', grn_date: '2026-10-05', total_qty: 100, current_stock: 60, is_invoiced: false },
    { grn_id: 'g2', gr_no: 'A0009', grn_date: '2026-09-28', total_qty: 50, current_stock: 50, is_invoiced: true },
  ],
  recent_dispatches: [{ dispatch_id: 'd1', dispatch_no: 'D0005', dispatch_date: '2026-10-08', total_qty: 40, supervisor_name: 'Ravi Example' }],
  top_stock_items: [
    { item_name: 'Garlic', total_stock: 200, grn_count: 2 },
    { item_name: 'Cumin', total_stock: 100, grn_count: 1 },
  ],
  recent_invoices: [{ invoice_id: 'i1', invoice_number: '2026-0042', invoice_date: '2026-10-01', net_total: 1540, status: 'paid' as const }],
};
const answerDetail = (over: Partial<typeof DETAIL> = {}) => ({ success: true, message: '', data: { ...DETAIL, ...over } });

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
  allActivity.mockImplementation(async ({ fromDate } = {}) => answerCustomers((fromDate ?? '') < '2026-06-15' ? [...CUSTOMERS, OLD_MILL] : CUSTOMERS) as never);
  detail.mockResolvedValue(answerDetail() as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

const textOf = (node: TestRenderer.ReactTestInstance) => [node.props.children].flat().join('');
const flat = (style: unknown) => (StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {}) as Record<string, unknown>;

async function open(store: Store) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<CustomerActivityScreen />);
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
  return {
    tree,
    texts,
    controls,
    control,
    press: (label: string) => run(() => control(label).props.onPress()),
    pressStarting: (start: string) => run(() => controls(text => text.startsWith(start))[0].props.onPress()),
    has: (label: string) => controls(text => text === label).length > 0,
    labels: () => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string),
    customers: () => tree.root.findAllByType(ReportCustomerCard).map(card => card.props.title as string),
    status: () => texts().find(text => text.includes('Last updated')),
    searchFields: () => tree.root.findAll(node => typeof node.props.onChangeText === 'function'),
    search: async (text: string) => {
      const field = tree.root.findAll(node => typeof node.props.onChangeText === 'function' && typeof node.props.onSubmitEditing === 'function')[0];
      await run(() => field.props.onChangeText(text));
      await run(() => tree.root.findAll(node => typeof node.props.onSubmitEditing === 'function')[0].props.onSubmitEditing());
    },
    refresh: () => run(() => tree.root.findByType('FlashList' as never).props.refreshControl.props.onRefresh()),
    bold: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
        .map(textOf),
  };
}

const DEFAULT_ORDER = ['Hillside Produce Co', 'Green Valley Traders', 'Riverbank Produce', 'Sunrise Agro Foods'];
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });
const openGreenValley = () => {
  mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
};

// ---------------------------------------------------------------------------

describe('customer activity, every customer', () => {
  it('asks for the last 120 days, and asks again for 240 days when that period is chosen', async () => {
    const screen = await open(makeStore());
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(detail).not.toHaveBeenCalled();
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.status()).toBe('15/06/26 – 12/10/26 · Last updated 10:00 am');
    expect(screen.labels()).toEqual(expect.arrayContaining(['Customers: 4', 'Stock: 550']));
    // City, when last active, and the stock.
    expect(screen.labels()).toContain('Hillside Produce Co, Morbi · Active today, 50 in stock');
    expect(screen.labels()).toContain('Riverbank Produce, Rajkot · Last active 11/08/26, 80 in stock');

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.status()).toBe('15/02/26 – 12/10/26 · Last updated 10:00 am');
    expect(screen.customers()).toEqual([...DEFAULT_ORDER, 'Old Mill Stores']);
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Last active, newest first. Change sort');
    await screen.press('Stock');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co']);
    // Sorted by stock, the figure on the card is the stock: no invoiced amount is added.
    expect(screen.labels().filter(label => label.includes('Invoiced ₹'))).toEqual([]);
    await screen.press('Invoiced amount');
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Green Valley Traders', 'Hillside Produce Co']);
    // Sorted by the invoiced amount, each card says it first, so the order can be read off the cards.
    expect(screen.labels()).toEqual(
      expect.arrayContaining([
        'Sunrise Agro Foods, Invoiced ₹9,000 · Anand · Last active 01/07/26, 120 in stock',
        'Riverbank Produce, Invoiced ₹5,000 · Rajkot · Last active 11/08/26, 80 in stock',
        'Green Valley Traders, Invoiced ₹1,200 · Surat · Last active 20/09/26, 300 in stock',
        'Hillside Produce Co, Invoiced ₹300 · Morbi · Active today, 50 in stock',
      ])
    );
    await screen.press('Lowest first');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Green Valley Traders', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Customer');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Done');
    expect(screen.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(screen.labels()).toContain('Green Valley Traders, Surat · Last active 20/09/26, 300 in stock');
    expect(screen.labels().filter(label => label.includes('Invoiced ₹'))).toEqual([]);
    expect(allActivity).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the period and sort kept', async () => {
    const screen = await open(makeStore());
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await screen.press('Sorted by Last active, newest first. Change sort');
    await screen.press('Stock');
    await screen.press('Done');

    await screen.search('produce');
    expect(screen.customers()).toEqual(['Riverbank Produce', 'Hillside Produce Co']);
    expect(screen.bold()).toEqual(['Produce', 'Produce']);
    expect(screen.status()).toBe('15/02/26 – 12/10/26 · Showing 2 of 5 · Last updated 10:00 am');

    await screen.press('Clear all filters and the search');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Old Mill Stores']);
    expect(screen.bold()).toEqual([]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.has('Sorted by Stock, highest first. Change sort')).toBe(true);
    expect(allActivity).toHaveBeenCalledTimes(2);
  });

  it('opens a customer as a route and remembers it; after a restart the sort and that customer are back', async () => {
    const store = makeStore();
    const screen = await open(store);
    await screen.press('Sorted by Last active, newest first. Change sort');
    await screen.press('Invoiced amount');
    await screen.press('Done');
    await screen.pressStarting('Riverbank Produce, ');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/customer-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'customer-activity': { id: 'c1', name: 'Riverbank Produce' } });

    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    forgetQueries();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(again.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Green Valley Traders', 'Hillside Produce Co']);
    expect(again.texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));
  });

  it('says there is no activity, and suggests a longer period unless the period is already the longest', async () => {
    allActivity.mockResolvedValue(answerCustomers([]) as never);
    const screen = await open(makeStore());
    expect(screen.texts()).toEqual(expect.arrayContaining(['No customer activity', 'No GRNs, dispatches or invoices in this period. Try a longer period.']));

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 420 days');
    expect(screen.texts()).toContain('No customer activity');
    expect(screen.texts()).toContain('No GRNs, dispatches or invoices in this period.');
    expect(screen.texts()).not.toContain('No GRNs, dispatches or invoices in this period. Try a longer period.');
  });

  it('keeps the rows when a refresh fails, and says they are not current', async () => {
    const screen = await open(makeStore());
    allActivity.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await screen.refresh();
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    // The service's own words for a failure are not shown; the screen's are (useReportQuery).
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", "Couldn't load customer activity. Check your connection and try again."]));
  });
});

describe('customer activity, one customer', () => {
  it('asks for the customer and the period, with the period chip as its only control', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    expect(detail.mock.calls).toEqual([[{ customerId: 'c2', ...days('2026-06-15') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    expect(screen.texts()).toEqual(expect.arrayContaining(['Customer activity', 'Green Valley Traders']));
    // The facility the figures come from, under the title: the report, then the facility, then the customer.
    const header = screen.texts();
    expect(header.indexOf('Customer activity')).toBeLessThan(header.indexOf('Riverside Cold Storage'));
    expect(header.indexOf('Riverside Cold Storage')).toBeLessThan(header.indexOf('Green Valley Traders'));
    expect(screen.labels()).toContain('Facility: Riverside Cold Storage');
    expect(screen.labels()).toEqual(expect.arrayContaining(['Stock: 300', 'GRNs: 12', 'Dispatches: 7']));
    expect(screen.status()).toBe('15/06/26 – 12/10/26 · Last updated 10:00 am');
    // Nothing to search or sort.
    expect(screen.searchFields()).toEqual([]);
    expect(screen.labels().filter(label => label.startsWith('Sorted by'))).toEqual([]);
    // No "No customer activity" under the dashboard.
    expect(screen.texts()).not.toContain('No customer activity');

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(detail.mock.calls).toEqual([[{ customerId: 'c2', ...days('2026-06-15') }], [{ customerId: 'c2', ...days('2026-02-15') }]]);
    expect(screen.status()).toBe('15/02/26 – 12/10/26 · Last updated 10:00 am');
  });

  it('counts each card from the period\'s totals, not from its few preview rows, and names the period and what the action opens', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    const cards = screen.controls(label => label.includes('. View ')).map(node => node.props.accessibilityLabel);
    expect(cards).toEqual([
      'GRNs in 15/06/26 – 12/10/26: 12. View GRNs in 15/06/26 – 12/10/26',
      'Dispatches in 15/06/26 – 12/10/26: 7. View dispatches in 15/06/26 – 12/10/26',
      'Current stock: 300 bags. View stock age',
      'Invoiced in 15/06/26 – 12/10/26: ₹15,400. View invoices in 15/06/26 – 12/10/26',
    ]);
    // The preview rows are the latest of any date, under a heading that says so; the stock card's are its top items.
    const headings = screen.tree.root.findAll(node => (node.type as unknown) === 'Text' && node.props.accessibilityRole === 'header').map(textOf);
    expect(headings).toEqual(expect.arrayContaining(['Latest GRNs (any date)', 'Latest dispatches (any date)', 'Top stock items', 'Latest invoices (any date)']));
    expect(screen.texts()).toEqual(expect.arrayContaining(['View GRNs in 15/06/26 – 12/10/26', 'View stock age']));
    expect(screen.texts()).not.toContain('View all');
  });

  it('under Last month, counts September and says so, while its preview rows are the latest GRNs of any date', async () => {
    openGreenValley();
    // One GRN in September; the three latest GRNs are October's (as a phone showed it).
    const october = [
      { grn_id: 'g12', gr_no: 'A0012', grn_date: '2026-10-09', total_qty: 40, current_stock: 40, is_invoiced: false },
      { grn_id: 'g11', gr_no: 'A0011', grn_date: '2026-10-07', total_qty: 30, current_stock: 30, is_invoiced: false },
      { grn_id: 'g10', gr_no: 'A0010', grn_date: '2026-10-05', total_qty: 100, current_stock: 60, is_invoiced: false },
    ];
    detail.mockImplementation(async ({ fromDate } = {} as never) =>
      (fromDate === '2026-09-01' ? answerDetail({ summary: { ...DETAIL.summary, total_grns: 1 }, recent_grns: october }) : answerDetail()) as never
    );
    const store = makeStore();
    const screen = await open(store);
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last month');
    expect(detail.mock.calls.at(-1)).toEqual([{ customerId: 'c2', fromDate: '2026-09-01', toDate: '2026-09-30' }]);

    const card = 'GRNs in 01/09/26 – 30/09/26: 1. View GRNs in 01/09/26 – 30/09/26';
    expect(screen.has(card)).toBe(true);
    // The October rows sit under "Latest GRNs (any date)", not under the September count.
    const texts = screen.texts();
    expect(texts.indexOf('GRNs in 01/09/26 – 30/09/26: 1')).toBeLessThan(texts.indexOf('Latest GRNs (any date)'));
    expect(texts.indexOf('Latest GRNs (any date)')).toBeLessThan(texts.indexOf('GRN A0012'));
    expect(screen.labels()).toEqual(expect.arrayContaining(['GRN A0012, 09/10/26, 40 of 40 in stock', 'GRN A0010, 05/10/26, 60 of 100 in stock']));

    // The action opens GRN activity with the period it names: the one period every report shares.
    await screen.press(card);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c2', customerName: 'Green Valley Traders' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].period).toEqual({ preset: 'lastMonth' });
  });

  it('opens each card\'s report for the customer, as a customers list opens one, and remembers the customer there', async () => {
    openGreenValley();
    const store = makeStore();
    const screen = await open(store);
    await screen.press('GRNs in 15/06/26 – 12/10/26: 12. View GRNs in 15/06/26 – 12/10/26');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c2', customerName: 'Green Valley Traders' } });
    // The stock card says where it goes: the customer's stock age.
    await screen.press('Current stock: 300 bags. View stock age');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/stock-aging', params: { customerId: 'c2', customerName: 'Green Valley Traders' } });
    await screen.press('Dispatches in 15/06/26 – 12/10/26: 7. View dispatches in 15/06/26 – 12/10/26');
    await screen.press('Invoiced in 15/06/26 – 12/10/26: ₹15,400. View invoices in 15/06/26 – 12/10/26');
    expect(mockPush.mock.calls.map(([target]) => target.pathname)).toEqual(['/reports/grn-activity', '/reports/stock-aging', '/reports/dispatch-activity', '/reports/invoice-history']);
    const green = { id: 'c2', name: 'Green Valley Traders' };
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({
      'grn-activity': green,
      'stock-aging': green,
      'dispatch-activity': green,
      'invoice-history': green,
    });
  });

  it('opens a GRN, a dispatch or an invoice from its preview row; an item row is not a button', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    await screen.pressStarting('GRN A0010, ');
    expect(mockRouterPush).toHaveBeenLastCalledWith('/grn-details/g1');
    await screen.pressStarting('Dispatch D0005, ');
    expect(mockRouterPush).toHaveBeenLastCalledWith('/dispatch-details/d1');
    await screen.pressStarting('Invoice 2026-0042, ');
    expect(mockRouterPush).toHaveBeenLastCalledWith('/invoice-details/i1');
    // The item rows are read as one element each, with nothing to press and no chevron.
    expect(screen.labels()).toContain('Garlic, 2 GRNs, 200 bags');
    expect(screen.controls(label => label.startsWith('Garlic'))).toEqual([]);
  });

  it('draws the stock trend with axis numbers in the number format and a unit, and opens it as a chart or a table', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    const chart = screen.tree.root.findAll(node => (node.type as unknown) === 'LineChart')[0];
    expect(chart.props.formatYLabel('1200')).toBe('1,200');
    expect(chart.props.formatYLabel('433.3333')).toBe('433');
    expect(screen.texts()).toContain('bags');
    // October is in progress on 12 October: its figure is the stock as of today, not a month end.
    expect(screen.texts()).toContain('Stock went from 200 in Aug 2026 to 1,200 at the end of Sep 2026, and 300 as of 12/10/26. Highest 1,200.');

    await screen.pressStarting('Stock level trend. ');
    const segments = screen.tree.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
    expect(segments.map(node => node.props.accessibilityLabel)).toEqual(['Chart', 'Table of values']);
    // Each segment is a whole touch target, not a short one padded by hitSlop inside a clipping parent.
    for (const segment of segments) {
      expect(flat(segment.props.style).minHeight).toBe(touchTarget);
      expect(segment.props.hitSlop).toBeUndefined();
    }
    expect(segments.map(node => node.props.accessibilityState.selected)).toEqual([true, false]);

    await screen.press('Table of values');
    expect(screen.labels()).toEqual(expect.arrayContaining(['Aug 2026, 200', 'Sep 2026, 1,200', 'Oct 2026, as of 12 Oct 2026, 300']));
    expect(screen.texts()).toEqual(expect.arrayContaining(['Stock at month end', 'as of 12/10/26', 'Oct 2026: as of 12/10/26']));
    const after = screen.tree.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
    expect(after.map(node => node.props.accessibilityState.selected)).toEqual([false, true]);
  });

  it('ends the stock trend at the Stock tile\'s figure, so its Latest and Highest never fall short of the tile', async () => {
    openGreenValley();
    // As a phone showed it: the stock the server keeps (the tile) above its own figure for the
    // month in progress (300 for October here) and above every month end of the period (1,200 at most).
    detail.mockResolvedValue(answerDetail({ summary: { ...DETAIL.summary, current_stock: 1300 } }) as never);
    const screen = await open(makeStore());
    expect(screen.labels()).toContain('Stock: 1,300');
    expect(screen.texts()).toContain('Stock went from 200 in Aug 2026 to 1,200 at the end of Sep 2026, and 1,300 as of 12/10/26. Highest 1,300.');
    expect(screen.texts()).not.toContain('Stock went from 200 in Aug 2026 to 1,200 at the end of Sep 2026, and 300 as of 12/10/26. Highest 1,200.');
    const chart = screen.tree.root.findAll(node => (node.type as unknown) === 'LineChart')[0];
    expect((chart.props.data as { value: number }[]).map(dot => dot.value)).toEqual([200, 1200, 1300]);

    await screen.pressStarting('Stock level trend. ');
    expect(screen.labels()).toEqual(expect.arrayContaining(['Latest 1,300', 'Highest 1,300']));
    await screen.press('Table of values');
    // The months that are over keep the server's month-end figures.
    expect(screen.labels()).toEqual(expect.arrayContaining(['Aug 2026, 200', 'Sep 2026, 1,200', 'Oct 2026, as of 12 Oct 2026, 1,300']));
    expect(screen.labels()).not.toContain('Oct 2026, as of 12 Oct 2026, 300');
  });

  it('says so when the period has no stock trend, instead of leaving the section out', async () => {
    openGreenValley();
    detail.mockResolvedValue(answerDetail({ monthly_trends: [] }) as never);
    const screen = await open(makeStore());
    // The section header writes its title in capitals.
    expect(screen.texts()).toEqual(expect.arrayContaining(['CHARTS', 'Stock level trend', 'No stock levels to show for this period.']));
    expect(screen.controls(label => label.startsWith('Stock level trend'))).toEqual([]);
    // The rest of the dashboard is still there.
    expect(screen.labels()).toContain('GRNs in 15/06/26 – 12/10/26: 12. View GRNs in 15/06/26 – 12/10/26');
  });

  it('shows the report\'s empty state for a customer with nothing in the period', async () => {
    openGreenValley();
    const nothing = { ...DETAIL.summary, current_stock: 0, total_grns: 0, total_dispatches: 0, total_invoice_amount: 0 };
    detail.mockResolvedValue(answerDetail({ summary: nothing, monthly_trends: [], recent_grns: [], recent_dispatches: [], recent_invoices: [], top_stock_items: [] }) as never);
    const screen = await open(makeStore());
    expect(screen.texts()).toEqual(expect.arrayContaining(['No customer activity', 'No GRNs, dispatches or invoices in this period. Try a longer period.']));
    expect(screen.controls(label => label.includes('. View '))).toEqual([]);
  });

  it('says what failed and why when the report could not be read', async () => {
    openGreenValley();
    detail.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    const screen = await open(makeStore());
    // Not an access refusal: the screen's own words, not the service's.
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't load customer activity", "Couldn't load this customer's activity. Check your connection and try again.", 'Try again']));
    expect(screen.texts()).not.toContain('The facility refused this report.');
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(allActivity).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
    expect(screen.texts()).toContain('No customer linked');
    expect(screen.texts()).not.toContain('Riverbank Produce');
  });
});

// SR-06: a card's "View …" opens everything of the period, not what the destination was last narrowed to.
describe('customer activity, a card\'s "View …" clears what the destination was narrowed to', () => {
  // Written as the destination screens write them (applyListFilters with the customer as scope).
  const narrow = (store: Store, key: string, values: Record<string, unknown>, scope: string) =>
    store.dispatch({ type: 'listFilters/applyListFilters', payload: { key, values, scope } });

  it("clears the GRN report's search and Not-invoiced choice for this customer, and another customer's search stays", async () => {
    openGreenValley();
    const store = makeStore();
    narrow(store, 'report-grn-activity-customer', { invoiced: 'not_invoiced', search: 'A0009' }, 'c2');
    narrow(store, 'report-grn-activity-customer', { invoiced: 'not_invoiced', search: 'E0014' }, 'c1');
    expect(store.getState().listFilters.lists['report-grn-activity-customer']).toEqual({
      values: { invoiced: 'not_invoiced' },
      searches: { c2: 'A0009', c1: 'E0014' },
    });
    const screen = await open(store);
    await screen.press('GRNs in 15/06/26 – 12/10/26: 12. View GRNs in 15/06/26 – 12/10/26');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c2', customerName: 'Green Valley Traders' } });
    const after = store.getState().listFilters.lists['report-grn-activity-customer'];
    expect(after.values).toEqual({});
    expect(after.searches?.c2).toBeUndefined();
    expect(after.searches).toEqual({ c1: 'E0014' });
  });

  it("clears the invoice report's Payment choice and search for this customer", async () => {
    openGreenValley();
    const store = makeStore();
    narrow(store, 'report-invoice-history-customer', { payment: 'paid', search: '2026/0042' }, 'c2');
    const screen = await open(store);
    await screen.press('Invoiced in 15/06/26 – 12/10/26: ₹15,400. View invoices in 15/06/26 – 12/10/26');
    const after = store.getState().listFilters.lists['report-invoice-history-customer'];
    expect(after.values).toEqual({});
    expect(after.searches?.c2).toBeUndefined();
  });
});

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('customer activity in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  const backgrounds = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAll(node => typeof node.type === 'string').map(node => flat(node.props.style).backgroundColor);

  it('every customer: rows on theme tokens', async () => {
    const screen = await open(makeStore(STAFF, undefined, { preference: mode, brand }));
    expect(backgrounds(screen.tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.surface.header]));
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
  });

  it('one customer: the dashboard and its full-screen trend on theme tokens', async () => {
    openGreenValley();
    const screen = await open(makeStore(STAFF, undefined, { preference: mode, brand }));
    expect(backgrounds(screen.tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.subtle, t.status.positive.element]));
    const chart = screen.tree.root.findAll(node => (node.type as unknown) === 'LineChart')[0];
    expect(chart.props.color).toBe(t.chart[0]);
    expect(chart.props.yAxisTextStyle.color).toBe(t.text.secondary);
    await screen.pressStarting('Stock level trend. ');
    expect(backgrounds(screen.tree)).toEqual(expect.arrayContaining([t.brand.fill, t.surface.header]));
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

describe('customer activity, the report PDF', () => {
  it('every customer: shares the period and the sort on screen as the PDF names them, with no customer', async () => {
    const screen = await open(makeStore());
    // The screen's "Last active" is the PDF's last_activity column.
    expect(screen.has('Sorted by Last active, newest first. Change sort')).toBe(true);
    await sharesThePdf(
      screen,
      { report: 'customer-activity', from: '2026-06-15', to: '2026-10-12', sort: { field: 'last_activity', order: 'desc' } },
      'Customer_activity_All_customers_2026_06_15_to_2026_10_12.pdf'
    );
  });

  it('one customer: shares that customer and the period, with no sort (the dashboard has none)', async () => {
    openGreenValley();
    const screen = await open(makeStore());
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await sharesThePdf(
      screen,
      { report: 'customer-activity', customer_id: 'c2', from: '2026-02-15', to: '2026-10-12' },
      'Customer_activity_Green_Valley_Traders_2026_02_15_to_2026_10_12.pdf'
    );
  });
});
