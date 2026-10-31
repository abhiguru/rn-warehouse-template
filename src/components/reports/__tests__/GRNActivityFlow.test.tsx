/**
 * The GRN activity report with a real store: the period, sort, search and
 * "Clear all" are worked through the filter bar and the search field as a
 * person would, and what the report remembers is read back from the store,
 * also by a new screen after a restart. The report PDF is shared from the
 * header at both levels. Only the services, the share sheet, the alert and the
 * router are stand-ins. The rows are made so that every change gives an order
 * of its own.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { getAllGRNActivity, getCustomerGRNActivity } from '@/services/reporting/grn-activity-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { fontWeight } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { showAlert } from '@/utils/alert';
import { alertTexts, pressAlertButton } from '@/tests/helpers/alertMock';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import GRNActivityScreen from '../../../../app/reports/grn-activity';

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
// A tree wrapped in the test's ParamsContext reads its own route's params (two customers'
// reports on the stack at once); any other tree reads `mockParams`, and so does a read made
// outside a render (the customer-name stand-in in jest.setup.js reads it from an effect).
jest.mock('expo-router', () => {
  const { createContext, useContext } = jest.requireActual('react');
  const ParamsContext = createContext(null);
  const readParams = () => {
    try {
      return useContext(ParamsContext) ?? mockParams;
    } catch {
      return mockParams;
    }
  };
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
    router: { push: (...args: unknown[]) => mockRouterPush(...args), back: jest.fn() },
    useLocalSearchParams: readParams,
    ParamsContext,
  };
});
const ParamsContext: React.Context<Record<string, string> | null> = jest.requireMock('expo-router').ParamsContext;
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('@/services/reporting/grn-activity-service', () => ({ getAllGRNActivity: jest.fn(), getCustomerGRNActivity: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateReportPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
// askAlert draws through the stand-in showAlert: a dialog the export waits on is answered by pressing its button.
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const allActivity = jest.mocked(getAllGRNActivity);
const customerActivity = jest.mocked(getCustomerGRNActivity);
const makePdf = jest.mocked(generateReportPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const alert = jest.mocked(showAlert);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// ---------------------------------------------------------------------------
// Rows. No two share a value in a sorted column; the 240-day period adds one.
// ---------------------------------------------------------------------------

const customer = (id: string, name: string, grns: number, bags: number, latest: string) => ({
  customer_id: id,
  customer_name: name,
  grn_count: grns,
  total_quantity: bags,
  total_weight: bags * 50,
  latest_grn_date: latest,
});
const CUSTOMERS = [
  customer('c1', 'Riverbank Produce', 9, 80, '2026-08-11'),
  customer('c2', 'Green Valley Traders', 2, 300, '2026-09-20'),
  customer('c3', 'Sunrise Agro Foods', 4, 120, '2026-07-01'),
  customer('c4', 'Hillside Produce Co', 12, 50, '2026-10-02'),
];
const OLD_MILL = customer('c5', 'Old Mill Stores', 1, 10, '2026-03-02');
const answerCustomers = (rows: ReturnType<typeof customer>[]) => ({
  success: true,
  message: '',
  data: { summary: { total_grns: 28, total_customers: rows.length, total_items: 0, total_quantity: 560, total_weight_kg: 0 }, by_customer: rows },
});

const grn = (id: string, number: string, date: string, bags: number, stock: number, invoiced: boolean) => ({
  grn_id: id,
  gr_no: number,
  grn_date: date,
  registration: '',
  sender_name: 'Fictional Farms',
  supervisor_name: '',
  note: null,
  total_items: 1,
  total_qty: bags,
  total_weight: 0,
  image_count: 0,
  invoice_status: { is_invoiced: invoiced, invoice_id: null, invoice_number: null },
  dispatch_summary: { total_dispatched: 0, current_stock: stock, dispatch_count: 0, last_dispatch_date: null, is_fully_dispatched: false },
  items: [],
});
const GRNS = [
  grn('g1', 'A0010', '2026-10-12', 50, 60, true),
  grn('g2', 'A0009', '2026-10-11', 200, 5, false),
  grn('g3', 'A0100', '2026-10-11', 120, 90, true),
  grn('g4', 'A0050', '2026-09-20', 20, 40, false),
];
const answerGrns = {
  success: true,
  message: '',
  data: { summary: { total_grns: 4, total_items: 4, total_quantity: 390, total_weight_kg: 0, total_invoiced_grns: 2, total_images: 0 }, grns: GRNS },
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeStore(auth: unknown = STAFF, reportPrefs?: ReportPrefsState) {
  return configureStore({
    reducer: {
      auth: (state: unknown = auth) => state,
      theme: (state = { preference: 'light', brand: 'orange' }) => state,
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
  allActivity.mockImplementation(async ({ fromDate }) => answerCustomers(fromDate < '2026-06-15' ? [...CUSTOMERS, OLD_MILL] : CUSTOMERS));
  customerActivity.mockResolvedValue(answerGrns as never);
  resetReportExportAvailability();
  sharePdf.mockResolvedValue({ success: true });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

/** `params`: the route's own, for a tree that stands for one entry of the stack. */
async function open(store: Store, params?: Record<string, string>) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      params ? (
        <ParamsContext.Provider value={params}>
          <GRNActivityScreen />
        </ParamsContext.Provider>
      ) : (
        <GRNActivityScreen />
      )
    );
    await settleQueries();
  });
  mounted.push(tree);

  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const control = (label: string) => {
    const found = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    if (found.length === 0) throw new Error(`No control labelled "${label}"`);
    return found[0];
  };
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  return {
    tree,
    texts,
    control,
    press: (label: string) => run(() => control(label).props.onPress()),
    has: (label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').length > 0,
    /** Customer names in the order the rows show them. */
    customers: () => tree.root.findAllByType(ReportCustomerCard).map(card => card.props.title as string),
    /** GRN cards and date headings in the order they are drawn. */
    grnRows: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && (node.props.accessibilityRole === 'header' || /^GRN A\d+$/.test([node.props.children].flat().join(''))))
        .map(node => [node.props.children].flat().join(''))
        .filter(text => text !== 'GRN activity'),
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
        .map(node => [node.props.children].flat().join('')),
  };
}

const DEFAULT_ORDER = ['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co'];
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });

// ---------------------------------------------------------------------------

describe('GRN activity, every customer', () => {
  it('asks for the last 120 days, and asks again for 240 days when that period is chosen', async () => {
    const screen = await open(makeStore());
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.status()).toBe('15/06/26 – 12/10/26 · Last updated 10:00 am');

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.status()).toBe('15/02/26 – 12/10/26 · Last updated 10:00 am');
    expect(screen.customers()).toEqual([...DEFAULT_ORDER, 'Old Mill Stores']);
    expect(customerActivity).not.toHaveBeenCalled();
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Customer');
    // The field changed and the direction was kept: Z to A.
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Green Valley Traders']);
    await screen.press('A to Z');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Latest GRN');
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Green Valley Traders', 'Hillside Produce Co']);
    // Sorting is done on the rows already read: nothing more is asked.
    expect(allActivity).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the period and sort kept', async () => {
    const screen = await open(makeStore());
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Customer');
    await screen.press('A to Z');
    await screen.press('Done');

    await screen.search('produce');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce']);
    expect(screen.bold()).toEqual(['Produce', 'Produce']);
    expect(screen.status()).toBe('15/02/26 – 12/10/26 · Showing 2 of 5 · Last updated 10:00 am');

    await screen.press('Clear all filters and the search');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Old Mill Stores', 'Riverbank Produce', 'Sunrise Agro Foods']);
    expect(screen.searchValue()).toBe('');
    expect(screen.bold()).toEqual([]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(allActivity).toHaveBeenCalledTimes(2);
  });

  it('opens a customer as a route and remembers it; after a restart the period, sort and that customer are back', async () => {
    const store = makeStore();
    const screen = await open(store);
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('GRNs');
    await screen.press('Done');
    const byGrns = ['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders', 'Old Mill Stores'];
    expect(screen.customers()).toEqual(byGrns);
    expect(screen.texts()).not.toContain('Last opened');

    await screen.press('Riverbank Produce, 9 GRNs · Latest 11/08/26, 80 bags');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'grn-activity': { id: 'c1', name: 'Riverbank Produce' } });

    // A restart: the screen is gone, the answers in memory are gone, and only the
    // persisted choices come back, read as the app reads them from the phone.
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    forgetQueries();
    allActivity.mockClear();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(allActivity.mock.calls).toEqual([[days('2026-02-15')]]);
    expect(again.customers()).toEqual(byGrns);
    expect(again.has('Period: Last 240 days. Change')).toBe(true);
    expect(again.has('Sorted by GRNs, highest first. Change sort')).toBe(true);
    expect(again.texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));

    await again.press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
  });

  it('keeps the rows when a refresh fails, and says they are not current', async () => {
    const screen = await open(makeStore());
    allActivity.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await screen.refresh();
    expect(allActivity).toHaveBeenCalledTimes(2);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    // The service's own words for a failure are not shown; the screen's are (useReportQuery).
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", "Couldn't load GRN activity. Check your connection and try again."]));
  });
});

describe('GRN activity, one customer', () => {
  it('puts date headings between the GRNs while sorted by date, and none for another sort', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const screen = await open(makeStore());
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c2', ...days('2026-06-15') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    expect(screen.grnRows()).toEqual(['Today', 'GRN A0010', 'Yesterday', 'GRN A0009', 'GRN A0100', '20/09/26', 'GRN A0050']);

    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('Bags');
    await screen.press('Done');
    expect(screen.grnRows()).toEqual(['GRN A0009', 'GRN A0100', 'GRN A0010', 'GRN A0050']);
    // With no heading above it, each card gives its own date.
    expect(screen.texts()).toEqual(expect.arrayContaining(['11/10/26', '12/10/26', '20/09/26']));

    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Date');
    await screen.press('Oldest first');
    await screen.press('Done');
    expect(screen.grnRows()).toEqual(['20/09/26', 'GRN A0050', 'Yesterday', 'GRN A0009', 'GRN A0100', 'Today', 'GRN A0010']);
  });

  it('puts a GRN under the day it fell on in India, one heading per day, when the date is an instant', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    // A timestamptz comes in UTC: the first two are both 12/10/26 in India (09:30 and 01:30), the third is
    // 11/10/26 01:30. By the first ten characters the second would be 11/10/26, and by the whole string every
    // GRN would have a heading of its own.
    const instants = [
      grn('g5', 'A0120', '2026-10-12T04:00:00+00:00', 10, 10, false),
      grn('g6', 'A0119', '2026-10-11T20:00:00+00:00', 20, 20, false),
      grn('g7', 'A0118', '2026-10-10T20:00:00+00:00', 30, 30, false),
    ];
    customerActivity.mockResolvedValue({ ...answerGrns, data: { ...answerGrns.data, grns: instants } } as never);
    const screen = await open(makeStore());
    expect(screen.grnRows()).toEqual(['Today', 'GRN A0120', 'GRN A0119', 'Yesterday', 'GRN A0118']);
  });

  it('narrows to the GRNs not invoiced, and Clear all brings the others back', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const screen = await open(makeStore());
    await screen.press('Filter by invoicing');
    await screen.press('Not invoiced');
    expect(screen.grnRows()).toEqual(['Yesterday', 'GRN A0009', '20/09/26', 'GRN A0050']);
    expect(screen.status()).toBe('15/06/26 – 12/10/26 · Showing 2 of 4 · Last updated 10:00 am');
    // The figures are the whole period's.
    expect(screen.texts()).toContain('2 of 4');

    await screen.press('Clear all filters and the search');
    expect(screen.grnRows()).toEqual(['Today', 'GRN A0010', 'Yesterday', 'GRN A0009', 'GRN A0100', '20/09/26', 'GRN A0050']);
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(allActivity).not.toHaveBeenCalled();
    expect(customerActivity).not.toHaveBeenCalled();
    expect(screen.texts()).toEqual(expect.arrayContaining(['No customer linked', 'No customer is linked to your account. Ask your facility to link one.']));
    expect(screen.texts()).not.toContain('Riverbank Produce');
    expect(screen.has('Try again')).toBe(false);
  });
});

// SR-06: a search typed for one customer must not narrow another customer's GRNs.
describe('GRN activity, a search across customers', () => {
  const GREEN = { customerId: 'c2', customerName: 'Green Valley Traders' };
  const RIVER = { customerId: 'c1', customerName: 'Riverbank Produce' };
  const ALL_ROWS = ['A0010', 'A0009', 'A0100', 'A0050'];
  /** The GRN numbers the list draws (a search marks the match in bold, so the card's text is split). */
  const grns = (screen: Awaited<ReturnType<typeof open>>) =>
    (screen.tree.root.findByType('FlashList' as never).props.data as { kind: string; grn?: { gr_no: string } }[])
      .filter(row => row.kind === 'grn')
      .map(row => row.grn?.gr_no);

  it("another customer's report opens on all its GRNs, and Back finds the first customer's search", async () => {
    const store = makeStore();
    const green = await open(store, GREEN);
    await green.search('A0009');
    expect(grns(green)).toEqual(['A0009']);

    // Riverbank opened on top of it: the search typed for Green Valley is not Riverbank's.
    const river = await open(store, RIVER);
    expect(river.searchValue()).toBe('');
    expect(grns(river)).toEqual(ALL_ROWS);
    expect(grns(green)).toEqual(['A0009']);

    // Back: Riverbank is gone, Green Valley still shows its search and the GRNs it found.
    act(() => river.tree.unmount());
    mounted.splice(mounted.indexOf(river.tree), 1);
    expect(green.searchValue()).toBe('A0009');
    expect(grns(green)).toEqual(['A0009']);
  });

  it('opening a customer from the customers list again forgets its search and keeps the invoicing choice', async () => {
    const store = makeStore();
    const green = await open(store, GREEN);
    await green.press('Filter by invoicing');
    await green.press('Not invoiced');
    await green.search('A0009');
    expect(grns(green)).toEqual(['A0009']);
    act(() => green.tree.unmount());
    mounted.splice(mounted.indexOf(green.tree), 1);

    const list = await open(store);
    const row = list.tree.root.findAll(
      node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Green Valley Traders,') && typeof node.props.onPress === 'function'
    )[0];
    await act(async () => {
      row.props.onPress();
      await settleQueries();
    });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/grn-activity', params: GREEN });
    expect(store.getState().listFilters.lists['report-grn-activity-customer'].searches?.c2).toBeUndefined();

    const again = await open(store, GREEN);
    expect(again.searchValue()).toBe('');
    expect(grns(again)).toEqual(['A0009', 'A0050']);
    expect(again.has('Filter by invoicing')).toBe(false);
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

describe('GRN activity, the report PDF', () => {
  it('every customer: shares the period and the sort on screen as the PDF names them, with no customer', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Latest GRN');
    await screen.press('Done');
    await sharesThePdf(
      screen,
      { report: 'grn-activity', from: '2026-06-15', to: '2026-10-12', sort: { field: 'latest', order: 'desc' } },
      'GRN_activity_All_customers_2026_06_15_to_2026_10_12.pdf'
    );
  });

  it('one customer: shares that customer, the period and the sort on screen', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const screen = await open(makeStore());
    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('GRN number');
    await screen.press('Done');
    await sharesThePdf(
      screen,
      { report: 'grn-activity', customer_id: 'c2', from: '2026-06-15', to: '2026-10-12', sort: { field: 'gr_no', order: 'desc' } },
      'GRN_activity_Green_Valley_Traders_2026_06_15_to_2026_10_12.pdf'
    );
  });
});

describe('GRN activity, the report PDF of what the screen shows', () => {
  const FILE = 'GRN_activity_Green_Valley_Traders_2026_06_15_to_2026_10_12.pdf';
  const BASE = { report: 'grn-activity', customer_id: 'c2', from: '2026-06-15', to: '2026-10-12', sort: { field: 'date', order: 'desc' } };
  /** Answers the dialog the export waits on. */
  const answerDialog = (text: string) =>
    act(async () => {
      pressAlertButton(alert, text);
      await settleQueries();
    });

  it('one customer: sends the Invoicing choice, "not_invoiced" or "invoiced", and none for All', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    makePdf.mockResolvedValue({ success: true, pdfUrl: PDF_URL });
    const screen = await open(makeStore());
    await screen.press('Share PDF');
    expect(makePdf.mock.calls).toEqual([[BASE]]);

    await screen.press('Filter by invoicing');
    await screen.press('Not invoiced');
    expect(screen.grnRows()).toEqual(['Yesterday', 'GRN A0009', '20/09/26', 'GRN A0050']);
    makePdf.mockClear();
    await screen.press('Share PDF');
    // A broken screen sends no choice, and the PDF lists all four GRNs of the period.
    expect(makePdf.mock.calls).toEqual([[{ ...BASE, invoicing: 'not_invoiced' }]]);

    await screen.press('Invoicing: Not invoiced. Change');
    await screen.press('Invoiced');
    makePdf.mockClear();
    await screen.press('Share PDF');
    expect(makePdf.mock.calls).toEqual([[{ ...BASE, invoicing: 'invoiced' }]]);
    expect(sharePdf).toHaveBeenLastCalledWith(PDF_URL, FILE);
    expect(sharePdf).toHaveBeenCalledTimes(3);
    expect(alert).not.toHaveBeenCalled();
  });

  it('one customer with a search and an invoicing choice: asks first to share without the search; Cancel shares nothing, the consent shares it with the choice', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    makePdf.mockResolvedValue({ success: true, pdfUrl: PDF_URL });
    const screen = await open(makeStore());
    await screen.press('Filter by invoicing');
    await screen.press('Not invoiced');
    await screen.search('A0009');
    // One GRN left on screen (its number is drawn with the search in bold, so it is counted by the status line).
    expect(screen.status()).toBe('15/06/26 – 12/10/26 · Showing 1 of 4 · Last updated 10:00 am');

    await screen.press('Share PDF');
    // A broken screen asks for the PDF at once, without a word about the search.
    // The PDF keeps the invoicing choice, so it is not called the full report (review Step 3 M1).
    expect(alertTexts(alert)).toEqual([
      ['Share without the search?', 'The PDF will list every row of the period that your other choices keep, not only the 1 matching "A0009".'],
    ]);
    expect(makePdf).not.toHaveBeenCalled();
    await answerDialog('Cancel');
    expect(makePdf).not.toHaveBeenCalled();
    expect(sharePdf).not.toHaveBeenCalled();
    expect(screen.control('Share PDF').props.accessibilityState).toMatchObject({ busy: false });

    await screen.press('Share PDF');
    await answerDialog('Share without the search');
    expect(makePdf.mock.calls).toEqual([[{ ...BASE, invoicing: 'not_invoiced' }]]);
    expect(sharePdf.mock.calls).toEqual([[PDF_URL, FILE]]);
  });

  it('every customer with a search: the customers it leaves are counted, and nothing of the search is sent', async () => {
    makePdf.mockResolvedValue({ success: true, pdfUrl: PDF_URL });
    const screen = await open(makeStore());
    await screen.search('green');
    expect(screen.customers()).toEqual(['Green Valley Traders']);
    await screen.press('Share PDF');
    expect(alertTexts(alert)).toEqual([['Share the full report?', 'The PDF will include every row of the period, not only the 1 matching "green".']]);
    await answerDialog('Share full report');
    expect(makePdf).toHaveBeenCalledTimes(1);
    expect(Object.keys(makePdf.mock.calls[0][0]).sort()).toEqual(['from', 'report', 'sort', 'to']);
  });
});

describe('GRN activity, nothing in the period', () => {
  it('offers "Show last 420 days" until the longest period is chosen, and pressing it asks for those days', async () => {
    allActivity.mockImplementation(async () => answerCustomers([]));
    const screen = await open(makeStore());
    expect(screen.customers()).toEqual([]);
    expect(screen.texts()).toEqual(expect.arrayContaining(['No GRNs in this period', 'Choose a longer period to see more GRNs.']));
    expect(screen.status()).toBe('15/06/26 – 12/10/26 · Last updated 10:00 am');
    expect(screen.has('Show last 420 days')).toBe(true);

    await screen.press('Show last 420 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2025-08-19')]]);
    expect(screen.has('Period: Last 420 days. Change')).toBe(true);
    expect(screen.status()).toBe('19/08/25 – 12/10/26 · Last updated 10:00 am');
    // The longest period has nothing longer to offer: no button, and no "Choose a longer period".
    expect(screen.texts()).toContain('No GRNs in this period');
    expect(screen.texts()).not.toContain('Choose a longer period to see more GRNs.');
    expect(screen.has('Show last 420 days')).toBe(false);
  });

  it("one customer: the same button asks for that customer's last 420 days", async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    customerActivity.mockResolvedValue({ ...answerGrns, data: { ...answerGrns.data, grns: [] } } as never);
    const screen = await open(makeStore());
    expect(screen.has('Show last 420 days')).toBe(true);
    await screen.press('Show last 420 days');
    expect(customerActivity).toHaveBeenLastCalledWith({ customerId: 'c2', ...days('2025-08-19') });
    expect(screen.has('Show last 420 days')).toBe(false);
  });
});
