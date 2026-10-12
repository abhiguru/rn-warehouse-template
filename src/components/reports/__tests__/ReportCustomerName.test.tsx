/**
 * Whose name a report screen shows, shares and remembers, with real screens, a
 * real store and the real record of names (src/features/reports/customerNames.ts).
 *
 * A route can pair a customer's id with any name:
 * `warehousemanager://reports/grn-activity?customerId=c1&customerName=Other%20Company`.
 * The id decides whose figures are shown. The name on screen, in the PDF's file
 * name and in "Last opened" is the facility's own, and never the route's.
 *
 * Only the facility (its report answers, its `customers` table, its PDF
 * function), the share sheet, the alert and the router are stand-ins.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { forgetCustomerNames, trustedCustomerName } from '@/features/reports/customerNames';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateReportPDF } from '@/services/pdf-service';
import { getAllCustomerActivity, getCustomerActivityDetail } from '@/services/reporting/customer-activity-service';
import { getAllGRNActivity, getCustomerGRNActivity } from '@/services/reporting/grn-activity-service';
import { StockService } from '@/services/stock-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import CustomerActivityScreen from '../../../../app/reports/customer-activity';
import DispatchActivityScreen from '../../../../app/reports/dispatch-activity';
import GRNActivityScreen from '../../../../app/reports/grn-activity';
import InvoiceHistoryScreen from '../../../../app/reports/invoice-history';
import ItemStockSummaryScreen from '../../../../app/reports/item-stock-summary';
import StockAgingScreen from '../../../../app/reports/stock-aging';
import StockSummaryScreen from '../../../../app/reports/stock-summary';

// The real question to the facility, not the stand-in every other test gets (jest.setup.js).
jest.unmock('@/features/reports/customerNames');

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockStore: Store;
// The app's hooks reading the test's store, as in GRNActivityFlow.test.tsx.
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
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));

// The facility's `customers` table as the signed-in account may read it: id -> name.
type NameAnswer = { data: { id: string; name: string | null }[] | null; error: Error | null };
let mockCustomers: Record<string, string> = {};
/** Set by a test that holds the facility's answer back, or makes it fail. */
let mockAnswer: ((ids: string[]) => Promise<NameAnswer>) | undefined;
const mockNameQuery = jest.fn();
function mockTable(ids: string[]): NameAnswer {
  return { data: ids.filter(id => id in mockCustomers).map(id => ({ id, name: mockCustomers[id] })), error: null };
}
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        in: (column: string, ids: string[]) => {
          mockNameQuery(table, columns, column, ids);
          return mockAnswer ? mockAnswer(ids) : Promise.resolve(mockTable(ids));
        },
      }),
    }),
  }),
  getSupabaseClient: jest.fn(),
  // Without a session nothing is kept on the phone.
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } }, forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/services/reporting/grn-activity-service', () => ({ getAllGRNActivity: jest.fn(), getCustomerGRNActivity: jest.fn() }));
jest.mock('@/services/reporting/customer-activity-service', () => ({ getAllCustomerActivity: jest.fn(), getCustomerActivityDetail: jest.fn() }));
// The other reports are only opened to see what stands under their title: their requests are refused.
function mockRefused() {
  return jest.fn(async () => ({ success: false, message: 'not loaded in this test' }));
}
jest.mock('@/services/reporting', () => ({
  getAllStockSummary: mockRefused(),
  getCustomerStockSummary: mockRefused(),
  getAllDispatchActivity: mockRefused(),
  getCustomerDispatchActivity: mockRefused(),
}));
jest.mock('@/services/reporting/stock-aging-service', () => ({ getAllStockAging: mockRefused(), getCustomerStockAging: mockRefused() }));
jest.mock('@/services/reporting/invoice-history-service', () => ({ getAllInvoiceHistory: mockRefused(), getCustomerInvoiceHistory: mockRefused() }));
jest.mock('@/services/stock-service', () => ({ ...jest.requireActual('@/services/stock-service'), StockService: { getItemWiseStockList: jest.fn() } }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getCustomerGRNItems: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateReportPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const makePdf = jest.mocked(generateReportPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };
/** A customer's own login, with the profile a sign-in stores: the assigned ids, no names. */
const CUSTOMER_ACCOUNT = { userProfile: { id: 'user-a', name: 'Kiran Example', role: 'customer', assignedCustomerIds: ['c1'] } };
/** The facility's name for c1 is Riverbank Produce; the link says otherwise. */
const LINK = { customerId: 'c1', customerName: 'Other Company' };
const PDF_URL = 'https://warehouse.example.test/storage/v1/object/sign/documents/report/r.pdf?token=fictional';

const GRN_CUSTOMERS = [
  { customer_id: 'c1', customer_name: 'Riverbank Produce', grn_count: 9, total_quantity: 80, total_weight: 4000, latest_grn_date: '2026-08-11' },
  { customer_id: 'c2', customer_name: 'Green Valley Traders', grn_count: 2, total_quantity: 300, total_weight: 15000, latest_grn_date: '2026-09-20' },
];
const GRN = {
  grn_id: 'g1',
  gr_no: 'A0010',
  grn_date: '2026-10-12',
  registration: '',
  sender_name: 'Fictional Farms',
  supervisor_name: '',
  note: null,
  total_items: 1,
  total_qty: 50,
  total_weight: 0,
  image_count: 0,
  invoice_status: { is_invoiced: true, invoice_id: null, invoice_number: null },
  dispatch_summary: { total_dispatched: 0, current_stock: 60, dispatch_count: 0, last_dispatch_date: null, is_fully_dispatched: false },
  items: [],
};
const DETAIL = {
  customer_id: 'c1',
  customer_name: 'Riverbank Produce',
  customer_city: 'Rajkot',
  summary: {
    current_stock: 300, total_grns: 12, total_grn_quantity: 900, total_dispatches: 7, total_dispatch_quantity: 600,
    total_invoice_amount: 15400, total_paid_amount: 10000, total_pending_amount: 5400, average_stock_age_days: 140,
  },
  monthly_trends: [{ month: '2026-10', grn_count: 3, grn_quantity: 0, dispatch_count: 4, dispatch_quantity: 900, invoice_amount: 0, stock_level_end: 300 }],
  by_bucket: { '0-120': { item_count: 2, total_quantity: 200, percentage: 100 } },
  recent_grns: [{ grn_id: 'g1', gr_no: 'A0010', grn_date: '2026-10-05', total_qty: 100, current_stock: 60, is_invoiced: false }],
  recent_dispatches: [],
  top_stock_items: [],
  recent_invoices: [],
};

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
const lastOpened = (store: Store) => store.getState().reportPrefs.byScope[SCOPE]?.lastCustomer;
const storedLastOpened = (customer: { id: string; name: string }): ReportPrefsState => ({
  byScope: { [SCOPE]: { sort: {}, pinned: [], recent: [], lastCustomer: { 'grn-activity': customer }, usedAt: 1 } },
});

jest.setTimeout(30_000);

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
  forgetCustomerNames();
  jest.clearAllMocks();
  resetReportExportAvailability();
  mockParams = {};
  mockCustomers = { c1: 'Riverbank Produce', c2: 'Green Valley Traders' };
  mockAnswer = undefined;
  jest.mocked(getAllGRNActivity).mockResolvedValue({
    success: true,
    message: '',
    data: { summary: { total_grns: 11, total_customers: 2, total_items: 0, total_quantity: 380, total_weight_kg: 0 }, by_customer: GRN_CUSTOMERS },
  } as never);
  jest.mocked(getCustomerGRNActivity).mockResolvedValue({
    success: true,
    message: '',
    data: { summary: { total_grns: 1, total_items: 1, total_quantity: 50, total_weight_kg: 0, total_invoiced_grns: 1, total_images: 0 }, grns: [GRN] },
  } as never);
  jest.mocked(getAllCustomerActivity).mockResolvedValue({ success: false, message: 'not asked for in this test' } as never);
  jest.mocked(getCustomerActivityDetail).mockResolvedValue({ success: true, message: '', data: DETAIL } as never);
  jest.mocked(StockService.getItemWiseStockList).mockResolvedValue({ success: false, message: 'not loaded in this test' } as never);
  makePdf.mockResolvedValue({ success: true, pdfUrl: PDF_URL });
  sharePdf.mockResolvedValue({ success: true });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

/** Hold the facility's names back; the returned function lets them arrive. */
function holdNames() {
  const waiting: (() => void)[] = [];
  mockAnswer = ids => new Promise<NameAnswer>(resolve => { waiting.push(() => resolve(mockTable(ids))); });
  return () =>
    act(async () => {
      waiting.splice(0).forEach(answer => answer());
      await settleQueries();
    });
}

async function open(Screen: React.ComponentType, store: Store) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<Screen />);
    await settleQueries();
  });
  mounted.push(tree);
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const press = (label: string) =>
    act(async () => {
      const found = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
      if (found.length === 0) throw new Error(`No control labelled "${label}"`);
      found[0].props.onPress();
      await settleQueries();
    });
  return {
    texts,
    press,
    /** The line under the report's title: the customer's name, or nothing. */
    subtitle: () => tree.root.findAllByType(ReportHeader)[0].props.subtitle as string | undefined,
    close: () => act(() => mounted.splice(mounted.indexOf(tree), 1).forEach(shown => shown.unmount())),
  };
}
/** The file names the share sheet was given, oldest first. */
const sharedAs = () => sharePdf.mock.calls.map(([, filename]) => filename);
/** Every word the screens drew and every file name shared, to show what never appeared. */
const everythingShown = (...screens: { texts: () => string[] }[]) => [...screens.flatMap(screen => screen.texts()), ...sharedAs()].join('\n');

describe('GRN activity opened by a link that pairs a customer with another name', () => {
  it("a warehouse role: no name until the facility has answered, then the facility's, on screen and in the PDF's file name", async () => {
    const nameArrives = holdNames();
    mockParams = LINK;
    const store = makeStore();
    const screen = await open(GRNActivityScreen, store);

    // The customer's figures are there, asked for by the id; only the name waits.
    expect(getCustomerGRNActivity).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1' }));
    expect(screen.texts()).toContain('GRN A0010');
    expect(mockNameQuery.mock.calls).toEqual([['customers', 'id, name', 'id', ['c1']]]);
    expect(screen.subtitle()).toBeUndefined();
    // Shared now, the file is named by the id, not by the link.
    await screen.press('Share PDF');
    expect(sharedAs()).toEqual(['GRN_activity_c1_2026_06_15_to_2026_10_12.pdf']);

    await nameArrives();
    expect(screen.subtitle()).toBe('Riverbank Produce');
    await screen.press('Share PDF');
    expect(sharedAs()[1]).toBe('GRN_activity_Riverbank_Produce_2026_06_15_to_2026_10_12.pdf');

    expect(everythingShown(screen)).not.toContain('Other');
    // A link is not what "Last opened" remembers.
    expect(lastOpened(store)).toEqual({});
    expect(mockNameQuery).toHaveBeenCalledTimes(1);
  });

  it('a customer account assigned that customer: the same', async () => {
    const nameArrives = holdNames();
    mockParams = LINK;
    const screen = await open(GRNActivityScreen, makeStore(CUSTOMER_ACCOUNT));
    expect(getCustomerGRNActivity).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1' }));
    expect(getAllGRNActivity).not.toHaveBeenCalled();
    expect(screen.texts()).toContain('GRN A0010');
    expect(screen.subtitle()).toBeUndefined();

    await nameArrives();
    expect(screen.subtitle()).toBe('Riverbank Produce');
    await screen.press('Share PDF');
    expect(sharedAs()).toEqual(['GRN_activity_Riverbank_Produce_2026_06_15_to_2026_10_12.pdf']);
    expect(everythingShown(screen)).not.toContain('Other');
  });

  it("the PDF's file is named as the function names the customer, even before the screen has the name", async () => {
    holdNames();
    mockParams = LINK;
    makePdf.mockResolvedValue({
      success: true,
      pdfUrl: PDF_URL,
      document: { type: 'report', report: 'grn-activity', customer: 'Riverbank Produce', rows_count: 1, rows_total: 1, truncated: false, sort: { field: 'date', order: 'desc' } },
    });
    const screen = await open(GRNActivityScreen, makeStore());
    expect(screen.subtitle()).toBeUndefined();
    await screen.press('Share PDF');
    expect(sharedAs()).toEqual(['GRN_activity_Riverbank_Produce_2026_06_15_to_2026_10_12.pdf']);
  });

  it('the facility cannot be asked for the name: the report is shown without one, and can still be shared', async () => {
    mockAnswer = () => Promise.reject(new Error('Network request failed'));
    mockParams = LINK;
    const screen = await open(GRNActivityScreen, makeStore());
    expect(mockNameQuery).toHaveBeenCalledTimes(1);
    expect(screen.subtitle()).toBeUndefined();
    expect(screen.texts()).toContain('GRN A0010');
    expect(screen.texts()).not.toContain("Couldn't load GRN activity. Check your connection and try again.");
    await screen.press('Share PDF');
    expect(sharedAs()).toEqual(['GRN_activity_c1_2026_06_15_to_2026_10_12.pdf']);
    expect(everythingShown(screen)).not.toContain('Other');
  });
});

describe('every report with a customer, opened by that link', () => {
  // Customer activity names the customer from its own answer: see the end of this file.
  it.each([
    ['stock summary', StockSummaryScreen],
    ['stock aging', StockAgingScreen],
    ['item stock summary', ItemStockSummaryScreen],
    ['dispatch activity', DispatchActivityScreen],
    ['GRN activity', GRNActivityScreen],
    ['invoice history', InvoiceHistoryScreen],
  ] as [string, React.ComponentType][])("%s: nothing under the title until the facility has answered, then the facility's name, never the link's", async (_report, Screen) => {
    const nameArrives = holdNames();
    mockParams = LINK;
    const screen = await open(Screen, makeStore());
    expect(mockNameQuery.mock.calls).toEqual([['customers', 'id, name', 'id', ['c1']]]);
    expect(screen.subtitle()).toBeUndefined();
    expect(screen.texts().join('\n')).not.toContain('Other');

    await nameArrives();
    expect(screen.subtitle()).toBe('Riverbank Produce');
    expect(screen.texts().join('\n')).not.toContain('Other');
    expect(mockNameQuery).toHaveBeenCalledTimes(1);
  });
});

describe('GRN activity opened from its customers list', () => {
  it("a row tap: the report shows the row's name at once without asking the facility, and \"Last opened\" keeps that name", async () => {
    const store = makeStore();
    const list = await open(GRNActivityScreen, store);
    await list.press('Riverbank Produce, 9 GRNs · Latest 11 Aug, 80 bags');
    expect(lastOpened(store)).toEqual({ 'grn-activity': { id: 'c1', name: 'Riverbank Produce' } });

    // The route the tap pushed opens the customer. The facility's names are held back: none is needed.
    holdNames();
    mockParams = mockPush.mock.calls[0][0].params;
    const report = await open(GRNActivityScreen, store);
    expect(report.subtitle()).toBe('Riverbank Produce');
    expect(mockNameQuery).not.toHaveBeenCalled();
  });

  it('"Last opened" kept by an earlier version with a link\'s name: shown as kept, not taken for the facility\'s, and put right when opened', async () => {
    const store = makeStore(STAFF, storedLastOpened({ id: 'c1', name: 'Other Company' }));
    const list = await open(GRNActivityScreen, store);
    // The row says what the phone kept, as it did before.
    expect(list.texts()).toEqual(expect.arrayContaining(['Last opened', 'Other Company']));

    await list.press('Last opened: Other Company');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Other Company' } });
    expect(trustedCustomerName('c1')).toBe('');
    await list.close();

    // The report it opens asks the facility, shows the facility's name, and stores that one.
    const nameArrives = holdNames();
    mockParams = mockPush.mock.calls[0][0].params;
    const report = await open(GRNActivityScreen, store);
    expect(report.subtitle()).toBeUndefined();
    await nameArrives();
    expect(report.subtitle()).toBe('Riverbank Produce');
    expect(report.texts()).not.toContain('Other Company');
    expect(lastOpened(store)).toEqual({ 'grn-activity': { id: 'c1', name: 'Riverbank Produce' } });
  });
});

describe('customer activity opened by a link that pairs a customer with another name', () => {
  it("shows the name its own answer gives, and a quick-access card opens, stores and shares under that name", async () => {
    // The names cannot be read at all: the dashboard's own answer is enough.
    mockAnswer = () => Promise.reject(new Error('Network request failed'));
    mockParams = LINK;
    const store = makeStore();
    const screen = await open(CustomerActivityScreen, store);
    expect(getCustomerActivityDetail).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1' }));
    expect(screen.subtitle()).toBe('Riverbank Produce');

    await screen.press('Recent GRNs, 12 GRNs. View all');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(lastOpened(store)).toEqual({ 'grn-activity': { id: 'c1', name: 'Riverbank Produce' } });
    // The report the card opens has the name at once.
    expect(trustedCustomerName('c1')).toBe('Riverbank Produce');

    await screen.press('Share PDF');
    expect(sharedAs()).toEqual(['Customer_activity_Riverbank_Produce_2026_06_15_to_2026_10_12.pdf']);
    expect(everythingShown(screen)).not.toContain('Other');
  });

  it('shows no name while its answer is out, not the link\'s', async () => {
    holdNames();
    let answer!: (value: unknown) => void;
    jest.mocked(getCustomerActivityDetail).mockImplementation(() => new Promise(resolve => { answer = resolve as (value: unknown) => void; }) as never);
    mockParams = LINK;
    const screen = await open(CustomerActivityScreen, makeStore());
    expect(screen.subtitle()).toBeUndefined();
    expect(screen.texts()).not.toContain('Other Company');

    await act(async () => {
      answer({ success: true, message: '', data: DETAIL });
      await settleQueries();
    });
    expect(screen.subtitle()).toBe('Riverbank Produce');
  });
});
