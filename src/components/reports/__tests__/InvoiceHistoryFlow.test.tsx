/**
 * The invoice history report with a real store: the period, sort, search, the
 * payment choice and "Clear all" are worked through the filter bar and the
 * search field as a person would, and what the report remembers is read back
 * from the store, also by a new screen after a restart. The report PDF is
 * shared from the header at both levels. Only the services, the share sheet,
 * the alert and the router are stand-ins. The rows are made so that every
 * change gives an order of its own.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { invoicePaymentStatus } from '@/components/reports/invoicePaymentStatus';
import { getAllInvoiceHistory, getCustomerInvoiceHistory } from '@/services/reporting/invoice-history-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { showAlert } from '@/utils/alert';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import InvoiceHistoryScreen from '../../../../app/reports/invoice-history';

const mockPush = jest.fn();
const mockRouterPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockStore: Store;
// The app's hooks, reading the test's store and drawing again when it changes, as react-redux
// does (react-redux itself is not set up to load under Jest here). A selector is read again
// only when the state or the selector changes, so a snapshot is stable within a render.
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
jest.mock('@/services/reporting/invoice-history-service', () => ({ getAllInvoiceHistory: jest.fn(), getCustomerInvoiceHistory: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateReportPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const allHistory = jest.mocked(getAllInvoiceHistory);
const customerHistory = jest.mocked(getCustomerInvoiceHistory);
const makePdf = jest.mocked(generateReportPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const alert = jest.mocked(showAlert);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// ---------------------------------------------------------------------------
// Rows. No two share a value in a sorted column; the 240-day period adds one.
// ---------------------------------------------------------------------------

const customer = (id: string, name: string, invoices: number, net: number, latest: string) => ({
  customer_id: id,
  customer_name: name,
  invoice_count: invoices,
  total_amount: net + 500,
  net_amount: net,
  latest_invoice_date: latest,
});
const CUSTOMERS = [
  customer('c1', 'Riverbank Produce', 9, 8000, '2026-08-11'),
  customer('c2', 'Green Valley Traders', 2, 30000, '2026-09-20'),
  customer('c3', 'Sunrise Agro Foods', 4, 12000, '2026-07-01'),
  customer('c4', 'Hillside Produce Co', 12, 5000, '2026-10-02'),
];
const OLD_MILL = customer('c5', 'Old Mill Stores', 1, 1000, '2026-03-02');
const answerCustomers = (rows: ReturnType<typeof customer>[]) => ({
  success: true,
  message: '',
  data: {
    summary: { total_invoices: 27, total_customers: rows.length, total_amount: 57000, total_tax: 0, net_amount: 55000 },
    by_customer: rows,
    by_month: [],
  },
});

const invoice = (id: string, number: string, date: string, net: number, status: string, grn: string, itemName: string) => ({
  invoice_id: id,
  invoice_number: number,
  invoice_date: date,
  financial_year: '2026-27',
  grn_ref: grn,
  grn_id: `g-${grn}`,
  total: net,
  labour: 0,
  discount: 0,
  tax_amount: 0,
  net_total: net,
  item_count: 1,
  total_quantity: 10,
  notes: null,
  payment_status: { status, paid_date: null, payment_ref: null },
  line_items: [{ item_id: `item-${id}`, item_name: itemName, packaging: 'Bag' }],
});
const INVOICES = [
  invoice('inv-1', '2026/0010', '2026-10-12', 5000, 'paid', 'A0010', 'Garlic'),
  invoice('inv-2', '2026/0009', '2026-10-11', 20000, 'pending', 'A0009', 'Red chilli'),
  invoice('inv-3', '2026/0100', '2026-10-11', 12000, 'paid', 'A0100', 'Cumin'),
  // A status the app does not know: neither paid nor pending.
  invoice('inv-4', '2026/0050', '2026-09-20', 2000, 'partly_paid', 'A0050', 'Turmeric'),
];
const answerInvoices = {
  success: true,
  message: '',
  data: {
    summary: {
      total_invoices: 4, total_amount: 39000, total_labour: 0, total_tax: 0, total_discount: 0, net_amount: 39000,
      paid_count: 2, pending_count: 1, paid_amount: 17000, pending_amount: 20000,
    },
    invoices: INVOICES,
    by_month: [
      { month: '2026-10', invoice_count: 3, total_amount: 37000, paid_amount: 17000, pending_amount: 20000 },
      { month: '2026-09', invoice_count: 1, total_amount: 2000, paid_amount: 0, pending_amount: 0 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeStore(auth: unknown = STAFF, reportPrefs?: ReportPrefsState, theme = { preference: 'light', brand: 'orange' }) {
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
  mockParams = {};
  allHistory.mockImplementation(async ({ fromDate }) => answerCustomers(fromDate < '2026-06-15' ? [...CUSTOMERS, OLD_MILL] : CUSTOMERS) as never);
  customerHistory.mockResolvedValue(answerInvoices as never);
  resetReportExportAvailability();
  sharePdf.mockResolvedValue({ success: true });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

const textOf = (node: ReactTestInstance): string =>
  [node.props.children].flat().map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : child?.props ? textOf(child as ReactTestInstance) : '')).join('');

async function open(store: Store) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<InvoiceHistoryScreen />);
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
    control,
    controls,
    press: (label: string) => run(() => control(label).props.onPress()),
    has: (label: string) => controls(text => text === label).length > 0,
    /** Customer names in the order the rows show them. */
    customers: () => tree.root.findAllByType(ReportCustomerCard).map(card => card.props.title as string),
    /** Invoice cards and date headings in the order they are drawn. */
    invoiceRows: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && (node.props.accessibilityRole === 'header' || /^Invoice \d{4}\/\d{4}$/.test(textOf(node))))
        .map(textOf)
        // Not the screen's title, nor the heading of the sort sheet while it is open.
        .filter(text => text !== 'Invoice history' && text !== 'Sort by'),
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
    /** The figure tiles drawn as placeholders while the first answer is out. */
    loadingTiles: () =>
      tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityState?.busy === true && String(node.props.accessibilityLabel).endsWith(', loading')).length,
  };
}

const DEFAULT_ORDER = ['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co'];
const BY_DATE = ['Today', 'Invoice 2026/0010', 'Yesterday', 'Invoice 2026/0009', 'Invoice 2026/0100', 'Sun, 20 Sep', 'Invoice 2026/0050'];
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });
const GREEN = { customerId: 'c2', customerName: 'Green Valley Traders' };

/** A request that stays unanswered until the test answers it. */
function pending() {
  let answer!: (value: unknown) => void;
  const promise = new Promise<never>(resolve => {
    answer = resolve as (value: unknown) => void;
  });
  return { promise, answer };
}

// ---------------------------------------------------------------------------

describe('invoice history, every customer', () => {
  it('asks for the last 120 days, and asks again for 240 days when that period is chosen', async () => {
    const screen = await open(makeStore());
    expect(allHistory.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.status()).toBe('15 Jun – 12 Oct · Last updated 10:00 am');
    expect(screen.texts()).toEqual(expect.arrayContaining(['Invoices', '27', 'Net amount', '₹55,000']));
    // Each customer row has its amount, like the rows of the other reports.
    expect(screen.texts()).toEqual(expect.arrayContaining(['₹30,000', '₹12,000', '₹8,000', '₹5,000']));

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(allHistory.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.status()).toBe('15 Feb – 12 Oct · Last updated 10:00 am');
    expect(screen.customers()).toEqual([...DEFAULT_ORDER, 'Old Mill Stores']);
    expect(customerHistory).not.toHaveBeenCalled();
  });

  it('says what a search found nothing for, and its clear action brings the customers back', async () => {
    const screen = await open(makeStore());
    expect(screen.tree.root.findByType('FlashList' as never).props.keyboardShouldPersistTaps).toBe('handled');
    await screen.search('zzzz');
    expect(screen.customers()).toEqual([]);
    expect(screen.texts()).toContain('No customers match "zzzz"');
    await screen.press('Clear search and filters');
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Net amount, highest first. Change sort');
    await screen.press('Customer');
    // The field changed and the direction was kept: Z to A.
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Green Valley Traders']);
    await screen.press('A to Z');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Invoices');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co']);
    await screen.press('Highest first');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders']);
    expect(allHistory).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the period and sort kept', async () => {
    const screen = await open(makeStore());
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await screen.press('Sorted by Net amount, highest first. Change sort');
    await screen.press('Customer');
    await screen.press('A to Z');
    await screen.press('Done');

    await screen.search('produce');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce']);
    expect(screen.bold()).toEqual(['Produce', 'Produce']);
    expect(screen.status()).toBe('15 Feb – 12 Oct · Showing 2 of 5 · Last updated 10:00 am');

    await screen.press('Clear all filters and the search');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Old Mill Stores', 'Riverbank Produce', 'Sunrise Agro Foods']);
    expect(screen.searchValue()).toBe('');
    expect(screen.bold()).toEqual([]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(allHistory).toHaveBeenCalledTimes(2);
  });

  it('opens a customer as a route and remembers it; after a restart the period, sort and that customer are back', async () => {
    const store = makeStore();
    const screen = await open(store);
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await screen.press('Sorted by Net amount, highest first. Change sort');
    await screen.press('Invoices');
    await screen.press('Done');
    const byInvoices = ['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders', 'Old Mill Stores'];
    expect(screen.customers()).toEqual(byInvoices);
    expect(screen.texts()).not.toContain('Last opened');

    await screen.press('Riverbank Produce, 9 invoices, Latest 11 Aug, Net amount: ₹8,000');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/invoice-history', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'invoice-history': { id: 'c1', name: 'Riverbank Produce' } });

    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    forgetQueries();
    allHistory.mockClear();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(allHistory.mock.calls).toEqual([[days('2026-02-15')]]);
    expect(again.customers()).toEqual(byInvoices);
    expect(again.has('Period: Last 240 days. Change')).toBe(true);
    expect(again.has('Sorted by Invoices, highest first. Change sort')).toBe(true);
    expect(again.texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));

    await again.press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/invoice-history', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
  });

  it('keeps the rows when a refresh fails, and says they are not current', async () => {
    const screen = await open(makeStore());
    allHistory.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await screen.refresh();
    expect(allHistory).toHaveBeenCalledTimes(2);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", 'Could not reach the facility']));
  });
});

describe('invoice history, one customer', () => {
  it('puts date headings between the invoices while sorted by date, and none for another sort', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    expect(customerHistory.mock.calls).toEqual([[{ customerId: 'c2', ...days('2026-06-15') }]]);
    expect(allHistory).not.toHaveBeenCalled();
    expect(screen.invoiceRows()).toEqual(BY_DATE);

    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('Net amount');
    expect(screen.invoiceRows()).toEqual(['Invoice 2026/0009', 'Invoice 2026/0100', 'Invoice 2026/0010', 'Invoice 2026/0050']);
    await screen.press('Invoice number');
    expect(screen.invoiceRows()).toEqual(['Invoice 2026/0100', 'Invoice 2026/0050', 'Invoice 2026/0010', 'Invoice 2026/0009']);
    await screen.press('Lowest number first');
    expect(screen.invoiceRows()).toEqual(['Invoice 2026/0009', 'Invoice 2026/0010', 'Invoice 2026/0050', 'Invoice 2026/0100']);
    await screen.press('Done');
    expect(screen.texts()).toEqual(expect.arrayContaining(['11 Oct', '12 Oct', '20 Sep']));

    await screen.press('Sorted by Invoice number, lowest number first. Change sort');
    await screen.press('Date');
    await screen.press('Done');
    expect(screen.invoiceRows()).toEqual(['Sun, 20 Sep', 'Invoice 2026/0050', 'Yesterday', 'Invoice 2026/0009', 'Invoice 2026/0100', 'Today', 'Invoice 2026/0010']);
    expect(customerHistory).toHaveBeenCalledTimes(1);
  });

  it('narrows to paid or pending invoices with the figures of the whole period kept, and Clear all brings the others back', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    const figures = ['Invoices', '4', 'Paid (2)', '₹17,000', 'Pending (1)', '₹20,000'];
    expect(screen.texts()).toEqual(expect.arrayContaining(figures));
    // The figures come before the invoices (§14.10).
    expect(screen.texts().indexOf('Pending (1)')).toBeLessThan(screen.texts().indexOf('Invoice 2026/0010'));

    await screen.press('Filter by payment');
    await screen.press('Paid');
    expect(screen.invoiceRows()).toEqual(['Today', 'Invoice 2026/0010', 'Yesterday', 'Invoice 2026/0100']);
    expect(screen.status()).toBe('15 Jun – 12 Oct · Showing 2 of 4 · Last updated 10:00 am');
    expect(screen.texts()).toEqual(expect.arrayContaining(figures));

    await screen.press('Payment: Paid. Change');
    await screen.press('Pending');
    // The invoice whose status the app does not know is neither paid nor pending.
    expect(screen.invoiceRows()).toEqual(['Yesterday', 'Invoice 2026/0009']);

    await screen.press('Clear all filters and the search');
    expect(screen.invoiceRows()).toEqual(BY_DATE);
    expect(customerHistory).toHaveBeenCalledTimes(1);
  });

  it('finds invoices by number, GRN and an item inside the card, names that item, in bold', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    await screen.search('a0100');
    expect(screen.invoiceRows()).toEqual(['Yesterday', 'Invoice 2026/0100']);
    expect(screen.bold()).toEqual(['A0100']);

    await screen.search('chilli');
    expect(screen.invoiceRows()).toEqual(['Yesterday', 'Invoice 2026/0009']);
    expect(screen.texts()).toContain('Red chilli');
    expect(screen.bold()).toEqual(['chilli']);
    expect(screen.controls(label => label.startsWith('Invoice 2026/0009,'))[0].props.accessibilityLabel).toMatch(/, Red chilli$/);

    await screen.search('0050');
    expect(screen.invoiceRows()).toEqual(['Sun, 20 Sep', 'Invoice 2026/0050']);
    expect(screen.bold()).toEqual(['0050', '0050']);
  });

  it('shows each status as a word, an unknown one as "Unknown" in neutral, and opens the invoice', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    const card = (number: string) => screen.controls(label => label.startsWith(`Invoice ${number},`))[0];
    expect(card('2026/0010').props.accessibilityLabel).toBe('Invoice 2026/0010, 12 Oct 2026 · GRN A0010, ₹5,000.00, 1 item, Paid');
    expect(card('2026/0009').props.accessibilityLabel).toBe('Invoice 2026/0009, 11 Oct 2026 · GRN A0009, ₹20,000.00, 1 item, Pending');
    expect(card('2026/0050').props.accessibilityLabel).toBe('Invoice 2026/0050, 20 Sep 2026 · GRN A0050, ₹2,000.00, 1 item, Unknown');
    expect(invoicePaymentStatus('partly_paid')).toEqual({ kind: 'neutral', label: 'Unknown' });
    expect(invoicePaymentStatus(undefined)).toEqual({ kind: 'neutral', label: 'Unknown' });

    await screen.press(card('2026/0010').props.accessibilityLabel);
    expect(mockRouterPush).toHaveBeenCalledWith('/invoice-details/inv-1');
  });

  it('shows the month by month table above the invoices when asked, with its totals', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    expect(screen.control('Monthly breakdown').props.accessibilityState).toEqual({ expanded: false });
    expect(screen.texts()).not.toContain('Oct 2026');

    await screen.press('Monthly breakdown');
    expect(screen.control('Monthly breakdown').props.accessibilityState).toEqual({ expanded: true });
    const all = screen.texts();
    expect(all).toEqual(expect.arrayContaining(['Month', 'Amount', 'Oct 2026', 'Sep 2026', '₹37,000', '₹2,000', 'Total', '₹39,000']));
    expect(all.indexOf('Total')).toBeLessThan(all.indexOf('Invoice 2026/0010'));
    expect(all.indexOf('Monthly breakdown')).toBeLessThan(all.indexOf('Invoice 2026/0010'));

    await screen.press('Monthly breakdown');
    expect(screen.texts()).not.toContain('Oct 2026');
  });

  it('draws as many loading tiles as the level shows once loaded', async () => {
    const waiting = pending();
    allHistory.mockImplementationOnce(() => waiting.promise);
    const list = await open(makeStore());
    expect(list.loadingTiles()).toBe(2);
    await act(async () => {
      waiting.answer(answerCustomers(CUSTOMERS));
      await settleQueries();
    });
    expect(list.loadingTiles()).toBe(0);
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));

    // Opened from a link: one customer from the first frame, so three tiles, not two then three.
    mockParams = GREEN;
    const second = pending();
    customerHistory.mockImplementationOnce(() => second.promise);
    const one = await open(makeStore());
    expect(one.loadingTiles()).toBe(3);
    await act(async () => {
      second.answer(answerInvoices);
      await settleQueries();
    });
    expect(one.loadingTiles()).toBe(0);
    expect(one.texts()).toEqual(expect.arrayContaining(['Paid (2)', 'Pending (1)']));
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(allHistory).not.toHaveBeenCalled();
    expect(customerHistory).not.toHaveBeenCalled();
    expect(screen.texts()).toContain('No customer linked');
    expect(screen.texts()).not.toContain('Riverbank Produce');
    expect(screen.has('Try again')).toBe(false);
  });

  it('suggests a longer period when empty, but not at the longest period, and names a failure', async () => {
    mockParams = GREEN;
    customerHistory.mockResolvedValue({ success: true, message: '', data: { ...answerInvoices.data, invoices: [], by_month: [] } } as never);
    const screen = await open(makeStore());
    expect(screen.texts()).toEqual(expect.arrayContaining(['No invoices in this period', 'Choose a longer period to see older invoices.']));
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 420 days');
    expect(screen.texts()).toContain('No invoices in this period');
    expect(screen.texts()).not.toContain('Choose a longer period to see older invoices.');
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));

    forgetQueries();
    customerHistory.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    const failed = await open(makeStore());
    expect(failed.texts()).toEqual(expect.arrayContaining(["Couldn't load the invoice history", 'The facility refused this report.', 'Try again']));
  });
});

const MODES: Mode[] = ['light', 'dark'];
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

describe('invoice history, the report PDF', () => {
  it('every customer: shares the period and the sort on screen as the PDF names them, with no customer', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Net amount, highest first. Change sort');
    await screen.press('Invoices');
    await screen.press('Done');
    expect(screen.has('Sorted by Invoices, highest first. Change sort')).toBe(true);
    await sharesThePdf(
      screen,
      { report: 'invoice-history', from: '2026-06-15', to: '2026-10-12', sort: { field: 'invoices', order: 'desc' } },
      'Invoice_history_All_2026_06_15_to_2026_10_12.pdf'
    );
  });

  it('one customer: shares that customer, the period and the sort on screen', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('Invoice number');
    await screen.press('Done');
    expect(screen.has('Sorted by Invoice number, highest number first. Change sort')).toBe(true);
    await sharesThePdf(
      screen,
      { report: 'invoice-history', customer_id: 'c2', from: '2026-06-15', to: '2026-10-12', sort: { field: 'invoice_no', order: 'desc' } },
      'Invoice_history_Green_Valley_Traders_2026_06_15_to_2026_10_12.pdf'
    );
  });
});

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('invoice history in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  const flat = (node: ReactTestInstance) =>
    (StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style) ?? {}) as Record<string, unknown>;
  const textNode = (screen: Awaited<ReturnType<typeof open>>, text: string) =>
    screen.tree.root.findAll(node => (node.type as unknown) === 'Text' && node.props.children === text)[0];

  it('draws both levels, the status words and the table on theme tokens', async () => {
    const theme = { preference: mode, brand };
    const list = await open(makeStore(STAFF, undefined, theme));
    expect(flat(list.tree.root.findAllByType('View' as never)[0]).backgroundColor).toBe(t.background.base);
    // The row's own pressable (ReportCustomerCard itself also carries the label and onPress).
    expect(flat(list.controls(label => label.startsWith('Green Valley Traders,')).filter(node => node.props.style)[0]).backgroundColor).toBe(t.surface.card);
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));

    mockParams = GREEN;
    const one = await open(makeStore(STAFF, undefined, theme));
    expect(flat(one.controls(label => label.startsWith('Invoice 2026/0010,'))[0]).backgroundColor).toBe(t.surface.card);
    expect(flat(textNode(one, 'Paid')).color).toBe(t.status.positive.text);
    expect(flat(textNode(one, 'Pending')).color).toBe(t.status.critical.text);
    expect(flat(textNode(one, 'Unknown')).color).toBe(t.status.neutral.text);
    await one.press('Monthly breakdown');
    // The totals row: weight 600 over a separator (§13.7).
    expect(flat(textNode(one, '₹39,000')).fontWeight).toBe(fontWeight.semibold);
    const totalsRow = one.tree.root.findAll(node => typeof node.type === 'string' && flat(node).borderTopColor === t.border.separator && flat(node).borderTopWidth === 1);
    expect(totalsRow.length).toBeGreaterThan(0);
  });
});
