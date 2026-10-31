/**
 * Every day a report shows is the day in India, whatever the clock zone of the
 * phone: the day of a card, the heading over the cards of a day, "Today" and
 * "Yesterday", "Active today", and the date of an activity.
 *
 * The server sends the time of an invoice, a GRN or a dispatch as an instant.
 * The rows here fall a minute to either side of midnight in India, and the
 * clock stands a minute after it, which is the afternoon of the day before in
 * New York: a screen that read any of them in the phone's zone would show
 * another day there. The expected days are written out, so these tests give the
 * same result in every zone.
 *
 * The suite itself runs in India's zone (jest.global-setup.js), where the
 * phone's day and India's are the same day. So each test also watches how the
 * rows' instants are read (`watchPhoneZone`): a screen that takes the day of
 * one with the phone's calendar fails here too.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { KeyValueCell } from '@/components/fiori';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { ReportDateHeading } from '@/components/reports/ReportDateHeading';
import { StockItemCard, type StockGRNRowData } from '@/components/reports/StockItemCard';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { getOperationsDashboard } from '@/services/reporting';
import { getAllCustomerActivity, getCustomerActivityDetail } from '@/services/reporting/customer-activity-service';
import { getAllGRNActivity, getCustomerGRNActivity } from '@/services/reporting/grn-activity-service';
import { getAllInvoiceHistory, getCustomerInvoiceHistory } from '@/services/reporting/invoice-history-service';
import { getAllStockAging, getCustomerStockAging } from '@/services/reporting/stock-aging-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { watchPhoneZone, type PhoneZoneWatch } from '@/tests/helpers/phoneZone';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import CustomerActivityScreen from '../../../../app/reports/customer-activity';
import GRNActivityScreen from '../../../../app/reports/grn-activity';
import InvoiceHistoryScreen from '../../../../app/reports/invoice-history';
import OperationsDashboardScreen from '../../../../app/reports/operations-dashboard';
import StockAgingScreen from '../../../../app/reports/stock-aging';

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
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
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
jest.mock('@/services/reporting/invoice-history-service', () => ({ getAllInvoiceHistory: jest.fn(), getCustomerInvoiceHistory: jest.fn() }));
jest.mock('@/services/reporting/grn-activity-service', () => ({ getAllGRNActivity: jest.fn(), getCustomerGRNActivity: jest.fn() }));
jest.mock('@/services/reporting/customer-activity-service', () => ({ getAllCustomerActivity: jest.fn(), getCustomerActivityDetail: jest.fn() }));
jest.mock('@/services/reporting/stock-aging-service', () => ({ getAllStockAging: jest.fn(), getCustomerStockAging: jest.fn() }));
jest.mock('@/services/reporting', () => ({ getOperationsDashboard: jest.fn() }));

// ---------------------------------------------------------------------------
// The clock and the instants of the rows
// ---------------------------------------------------------------------------

/** Monday 12 October 2026, 00:01 in India. In New York it is Sunday the 11th, 2:31 pm. */
const NOW = new Date('2026-10-11T18:31:07Z');
/** Half a minute into Monday the 12th in India; still the 11th in UTC and to the west of it. */
const TODAY = '2026-10-11T18:30:30+00:00';
/** The last minute of Sunday the 11th in India. */
const YESTERDAY = '2026-10-11T18:29:00+00:00';
/** 01:30 on Thursday 1 October in India; 30 September in UTC and to the west of it. */
const FIRST_OF_OCTOBER = '2026-09-30T20:00:00+00:00';
const ROW_TIMES = [TODAY, YESTERDAY, FIRST_OF_OCTOBER];

const GREEN = { customerId: 'c2', customerName: 'Green Valley Traders' };
const ADMIN = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'admin' } };

function makeStore() {
  return configureStore({
    reducer: {
      auth: (state: unknown = ADMIN) => state,
      theme: (state = { preference: 'light', brand: 'orange' }) => state,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
    },
  });
}
type Store = ReturnType<typeof makeStore>;

jest.setTimeout(30_000);

const mounted: TestRenderer.ReactTestRenderer[] = [];
let restoreQueries: () => void;
let watch: PhoneZoneWatch;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(() => {
  // Only the calendar is fixed; timers run as usual.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
  forgetQueries();
  jest.clearAllMocks();
  resetReportExportAvailability();
  mockParams = {};
  watch = watchPhoneZone(ROW_TIMES);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  watch.restore();
  jest.useRealTimers();
});

const textOf = (node: ReactTestInstance): string =>
  [node.props.children].flat().map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : child?.props ? textOf(child as ReactTestInstance) : '')).join('');

async function open(Screen: React.ComponentType, params: Record<string, string> = {}) {
  mockParams = params;
  mockStore = makeStore();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<Screen />);
    await settleQueries();
  });
  mounted.push(tree);

  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const controls = (start: string) =>
    tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(start) && typeof node.props.onPress === 'function');
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(textOf);
  return {
    tree,
    texts,
    /** The spoken label of the first control whose label starts with `start`. */
    label: (start: string) => controls(start)[0]?.props.accessibilityLabel as string | undefined,
    /** Presses the first control whose label starts with `start`. */
    press: (start: string) => {
      if (controls(start).length === 0) throw new Error(`No control labelled "${start}…"`);
      return run(() => controls(start)[0].props.onPress());
    },
    /** The date headings and the cards' titles (those that match `card`), in the order drawn. */
    rows: (card: RegExp) =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && (node.props.accessibilityRole === 'header' || card.test(textOf(node))))
        .map(textOf)
        .filter(text => !['Invoice history', 'GRN activity', 'Sort by'].includes(text)),
    /** Each customer row: its name and the facts under it. */
    customers: () => Object.fromEntries(tree.root.findAllByType(ReportCustomerCard).map(card => [card.props.title as string, card.props.subtitle as unknown])),
  };
}

// ---------------------------------------------------------------------------
// Invoice history
// ---------------------------------------------------------------------------

// The amount is `total`; `net_total` equals it, as a server with backend migration 61 sends.
const invoice = (id: string, number: string, date: string, total: number) => ({
  invoice_id: id,
  invoice_number: number,
  invoice_date: date,
  financial_year: '2026-27',
  grn_ref: `A${number.slice(-4)}`,
  grn_id: `g-${id}`,
  total,
  labour: 0,
  discount: 0,
  tax_amount: 0,
  net_total: total,
  item_count: 1,
  total_quantity: 10,
  notes: null,
  payment_status: { status: 'paid', paid_date: null, payment_ref: null },
  line_items: [{ item_id: `item-${id}`, item_name: 'Garlic', packaging: 'Bag' }],
});
const INVOICES = [
  invoice('inv-12', '2026/0012', TODAY, 5000),
  invoice('inv-11', '2026/0011', YESTERDAY, 20000),
  invoice('inv-01', '2026/0001', FIRST_OF_OCTOBER, 12000),
];
const answerInvoices = {
  success: true,
  message: '',
  data: {
    summary: {
      total_invoices: 3, total_amount: 37000, total_labour: 0, total_tax: 0, total_discount: 0, net_amount: 37000,
      paid_count: 3, pending_count: 0, paid_amount: 37000, pending_amount: 0,
    },
    invoices: INVOICES,
    by_month: [],
  },
};
const answerInvoiceCustomers = {
  success: true,
  message: '',
  data: {
    summary: { total_invoices: 3, total_customers: 1, total_amount: 37000, total_tax: 0, net_amount: 37000 },
    // The time of the customer's latest invoice: an instant, as the invoices' own.
    by_customer: [{ customer_id: 'c2', customer_name: 'Green Valley Traders', invoice_count: 3, total_amount: 37000, net_amount: 37000, latest_invoice_date: FIRST_OF_OCTOBER }],
    by_month: [],
  },
};

describe('invoice history', () => {
  beforeEach(() => {
    jest.mocked(getCustomerInvoiceHistory).mockResolvedValue(answerInvoices as never);
    jest.mocked(getAllInvoiceHistory).mockResolvedValue(answerInvoiceCustomers as never);
  });

  it('heads each day as it is in India, and a card names the day its heading names', async () => {
    const screen = await open(InvoiceHistoryScreen, GREEN);
    expect(screen.rows(/^Invoice \d{4}\/\d{4}$/)).toEqual([
      'Today', 'Invoice 2026/0012',
      'Yesterday', 'Invoice 2026/0011',
      '01/10/26', 'Invoice 2026/0001',
    ]);
    // The date a screen reader hears with the card (no heading is read with it).
    expect(screen.label('Invoice 2026/0012,')).toContain('Invoice 2026/0012, 12 Oct 2026 · ');
    expect(screen.label('Invoice 2026/0011,')).toContain('Invoice 2026/0011, 11 Oct 2026 · ');
    expect(screen.label('Invoice 2026/0001,')).toContain('Invoice 2026/0001, 1 Oct 2026 · ');
    expect(watch.reads).toEqual([]);
  });

  it('gives each card its own day, India\'s, when the cards are not in date order', async () => {
    const screen = await open(InvoiceHistoryScreen, GREEN);
    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('Amount');
    await screen.press('Done');
    expect(screen.rows(/^Invoice \d{4}\/\d{4}$/)).toEqual(['Invoice 2026/0011', 'Invoice 2026/0001', 'Invoice 2026/0012']);
    const dates = screen.texts().filter(text => /^\d{2}\/\d{2}\/\d{2}$/.test(text));
    expect(dates).toEqual(['11/10/26', '01/10/26', '12/10/26']);
    expect(watch.reads).toEqual([]);
  });

  it('names the day of a customer\'s latest invoice as it is in India', async () => {
    const screen = await open(InvoiceHistoryScreen);
    expect(screen.label('Green Valley Traders,')).toContain('3 invoices, Latest 01/10/26, ');
    expect(watch.reads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GRN activity
// ---------------------------------------------------------------------------

const grn = (id: string, number: string, date: string, bags: number) => ({
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
  invoice_status: { is_invoiced: false, invoice_id: null, invoice_number: null },
  dispatch_summary: { total_dispatched: 0, current_stock: bags, dispatch_count: 0, last_dispatch_date: null, is_fully_dispatched: false },
  items: [],
});
const answerGrns = {
  success: true,
  message: '',
  data: {
    summary: { total_grns: 3, total_items: 3, total_quantity: 370, total_weight_kg: 0, total_invoiced_grns: 0, total_images: 0 },
    grns: [grn('g12', 'A0012', TODAY, 50), grn('g11', 'A0011', YESTERDAY, 200), grn('g01', 'A0001', FIRST_OF_OCTOBER, 120)],
  },
};
const answerGrnCustomers = {
  success: true,
  message: '',
  data: {
    summary: { total_grns: 3, total_customers: 1, total_items: 0, total_quantity: 370, total_weight_kg: 0 },
    // The day of the latest GRN comes as a plain day in India (the server cuts it).
    by_customer: [{ customer_id: 'c2', customer_name: 'Green Valley Traders', grn_count: 3, total_quantity: 370, total_weight: 0, latest_grn_date: '2026-10-12' }],
  },
};

describe('GRN activity', () => {
  beforeEach(() => {
    jest.mocked(getCustomerGRNActivity).mockResolvedValue(answerGrns as never);
    jest.mocked(getAllGRNActivity).mockResolvedValue(answerGrnCustomers as never);
  });

  it('heads each day as it is in India, and a card names the day its heading names', async () => {
    const screen = await open(GRNActivityScreen, GREEN);
    expect(screen.rows(/^GRN A\d+$/)).toEqual(['Today', 'GRN A0012', 'Yesterday', 'GRN A0011', '01/10/26', 'GRN A0001']);
    expect(screen.label('GRN A0012,')).toContain('GRN A0012, 12 Oct 2026, ');
    expect(screen.label('GRN A0011,')).toContain('GRN A0011, 11 Oct 2026, ');
    expect(screen.label('GRN A0001,')).toContain('GRN A0001, 1 Oct 2026, ');
    expect(watch.reads).toEqual([]);
  });

  it('gives each card its own day, India\'s, when the cards are not in date order', async () => {
    const screen = await open(GRNActivityScreen, GREEN);
    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('Bags');
    await screen.press('Done');
    expect(screen.rows(/^GRN A\d+$/)).toEqual(['GRN A0011', 'GRN A0001', 'GRN A0012']);
    const dates = screen.texts().filter(text => /^\d{2}\/\d{2}\/\d{2}$/.test(text));
    expect(dates).toEqual(['11/10/26', '01/10/26', '12/10/26']);
    expect(watch.reads).toEqual([]);
  });

  it('shows a plain day of a customer row as the server sent it', async () => {
    const screen = await open(GRNActivityScreen);
    expect(screen.label('Green Valley Traders,')).toContain('Latest 12/10/26');
  });
});

// ---------------------------------------------------------------------------
// Customer activity
// ---------------------------------------------------------------------------

const activeCustomer = (id: string, name: string, city: string, stock: number, lastActive: string) => ({
  customer_id: id,
  customer_name: name,
  customer_city: city,
  current_stock: stock,
  total_grns: 2,
  total_dispatches: 1,
  total_invoice_amount: 1000,
  last_activity_date: lastActive,
  last_activity_type: 'grn' as const,
});
const answerActiveCustomers = {
  success: true,
  message: '',
  data: {
    summary: { total_customers: 3, total_current_stock: 500, total_grns: 6, total_dispatches: 3, total_invoice_amount: 3000 },
    customers: [
      activeCustomer('c1', 'Riverbank Produce', 'Rajkot', 80, TODAY),
      activeCustomer('c2', 'Green Valley Traders', 'Surat', 300, YESTERDAY),
      activeCustomer('c3', 'Sunrise Agro Foods', 'Anand', 120, FIRST_OF_OCTOBER),
    ],
  },
};
const answerCustomerDetail = {
  success: true,
  message: '',
  data: {
    customer_id: 'c2',
    customer_name: 'Green Valley Traders',
    customer_city: 'Surat',
    summary: {
      current_stock: 300, total_grns: 12, total_grn_quantity: 900, total_dispatches: 7, total_dispatch_quantity: 600,
      total_invoice_amount: 15400, total_paid_amount: 10000, total_pending_amount: 5400, average_stock_age_days: 140,
    },
    monthly_trends: [{ month: '2026-10', grn_count: 3, grn_quantity: 0, dispatch_count: 4, dispatch_quantity: 900, invoice_amount: 0, stock_level_end: 300 }],
    by_bucket: { '0-120': { item_count: 2, total_quantity: 200, percentage: 100 } },
    recent_grns: [{ grn_id: 'g12', gr_no: 'A0012', grn_date: TODAY, total_qty: 100, current_stock: 60, is_invoiced: false }],
    recent_dispatches: [{ dispatch_id: 'd11', dispatch_no: 'D0011', dispatch_date: YESTERDAY, total_qty: 40, supervisor_name: 'Ravi Example' }],
    top_stock_items: [{ item_name: 'Garlic', total_stock: 200, grn_count: 2 }],
    recent_invoices: [{ invoice_id: 'i01', invoice_number: '2026-0001', invoice_date: FIRST_OF_OCTOBER, net_total: 1540, status: 'paid' as const }],
  },
};

describe('customer activity', () => {
  beforeEach(() => {
    jest.mocked(getAllCustomerActivity).mockResolvedValue(answerActiveCustomers as never);
    jest.mocked(getCustomerActivityDetail).mockResolvedValue(answerCustomerDetail as never);
  });

  it('calls a customer active today when the last activity was today in India, and names India\'s day otherwise', async () => {
    const screen = await open(CustomerActivityScreen);
    expect(screen.customers()).toEqual({
      'Riverbank Produce': ['Rajkot', 'Active today'],
      'Green Valley Traders': ['Surat', 'Last active 11/10/26'],
      'Sunrise Agro Foods': ['Anand', 'Last active 01/10/26'],
    });
    expect(watch.reads).toEqual([]);
  });

  it('dates a customer\'s latest GRN, dispatch and invoice by the day in India', async () => {
    const screen = await open(CustomerActivityScreen, GREEN);
    expect(screen.label('GRN A0012,')).toContain('GRN A0012, 12/10/26, ');
    expect(screen.label('Dispatch D0011,')).toContain('Dispatch D0011, 11/10/26, ');
    expect(screen.label('Invoice 2026-0001,')).toContain('Invoice 2026-0001, 01/10/26, ');
    expect(watch.reads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Stock aging
// ---------------------------------------------------------------------------

const answerAgingLines = {
  success: true,
  message: '',
  data: {
    summary: {
      total_items: 1, total_quantity: 30, total_weight_kg: 0, oldest_stock_days: 11, average_age_days: 11,
      items_over_365_days: 0, qty_over_365_days: 0, avg_dispatch_velocity_days: null, items_no_recent_dispatch: 0,
    },
    by_bucket: { '0-120': { item_count: 1, total_quantity: 30, total_weight: 0, percentage: 100 } },
    items: [
      {
        grn_id: 'g01', gr_no: 'A0001', item_name: 'Garlic', packaging: 'Bag', current_stock: 30, original_qty: 40, weight: 0, rack: '', package_mark: '',
        grn_date: FIRST_OF_OCTOBER, aging_days: 11, aging_bucket: '0-120',
        dispatch_info: { total_dispatched: 10, dispatch_count: 2, last_dispatch_date: TODAY, days_since_last_dispatch: 0, avg_days_between_dispatches: 5 },
      },
    ],
  },
};

describe('stock aging', () => {
  beforeEach(() => {
    jest.mocked(getCustomerStockAging).mockResolvedValue(answerAgingLines as never);
    jest.mocked(getAllStockAging).mockResolvedValue({ success: true, message: '', data: { summary: {}, by_bucket: {}, by_customer: [] } } as never);
  });

  it('dates the receipt of a line and its last dispatch by the day in India', async () => {
    const screen = await open(StockAgingScreen, GREEN);
    await screen.press('Garlic, ');
    expect(screen.label('GRN A0001')).toContain('received 1 Oct 2026, ');
    expect(screen.texts()).toContain('Received 01/10/26');
    await screen.press('GRN A0001');
    const cells = Object.fromEntries(screen.tree.root.findAllByType(KeyValueCell).map(cell => [cell.props.keyLabel as string, cell.props.value as string]));
    expect(cells['Last dispatch']).toBe('12/10/26');
    expect(watch.reads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Operations dashboard
// ---------------------------------------------------------------------------

describe('operations dashboard', () => {
  it('dates an activity of a day or more ago by the day in India, and a newer one by how long ago', async () => {
    jest.mocked(getOperationsDashboard).mockResolvedValue({
      success: true,
      message: '',
      data: {
        kpis: { total_grns: 12, total_dispatches: 7, pending_orders: 3, active_customers: 5, total_stock_qty: 1200, total_stock_weight: 5400.5 },
        trends: { grn_daily: [], dispatch_daily: [] },
        recent_activity: [
          { type: 'dispatch', ref: 'D0011', customer: 'Riverbank Produce', time: YESTERDAY },
          { type: 'grn', ref: 'A0001', customer: 'Green Valley Traders', time: FIRST_OF_OCTOBER },
        ],
      },
    } as never);
    const screen = await open(OperationsDashboardScreen);
    const activity = screen.tree.root
      .findAll(node => typeof node.type === 'string' && node.props.accessible === true && /^(GRN|Dispatch) /.test(String(node.props.accessibilityLabel)))
      .map(node => node.props.accessibilityLabel as string);
    expect(activity).toEqual(['Dispatch D0011, Riverbank Produce, 2 min ago', 'GRN A0001, Green Valley Traders, 1 Oct 2026']);
    expect(watch.reads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The shared parts
// ---------------------------------------------------------------------------

describe('the GRNs of a stock item', () => {
  it('are dated by the day in India when the server sends the time of receipt', () => {
    const rows: StockGRNRowData[] = [
      // A customer's own list sends the time of receipt; the staff list sends a plain day.
      { key: 'a', grnId: 'g01', grNo: 'A0001', receivedDate: FIRST_OF_OCTOBER, stock: 60, total: 100 },
      { key: 'b', grnId: 'g02', grNo: 'A0002', receivedDate: '2026-09-02', emptiedDate: TODAY, stock: 0, total: 40 },
    ];
    mockStore = makeStore();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <StockItemCard
          name="Example Potatoes"
          packaging="50 kg bag"
          grnCount={2}
          stock={60}
          total={140}
          isExpanded
          onToggle={jest.fn()}
          grns={{ status: 'loaded', rows }}
          emptyGRNsText="No GRNs with this item in stock."
          onOpenGRN={jest.fn()}
        />
      );
    });
    mounted.push(tree);
    const labels = tree.root
      .findAll(node => typeof node.type !== 'string' && typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith('GRN A'))
      .map(node => node.props.accessibilityLabel as string);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('GRN A0001, Received 1 Oct 2026, ');
    expect(labels[1]).toContain('GRN A0002, Received 2 Sep 2026, Emptied 12 Oct 2026');
    expect(watch.reads).toEqual([]);
  });
});

describe('the heading over a day', () => {
  const heading = (date: string) => {
    mockStore = makeStore();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ReportDateHeading date={date} />);
    });
    mounted.push(tree);
    return textOf(tree.root.findByProps({ accessibilityRole: 'header' }));
  };

  it('says Today and Yesterday by the day it is in India, without reading the clock in the phone\'s zone', () => {
    // The clock itself is watched here: nothing else is drawn that reads it.
    watch.restore();
    watch = watchPhoneZone([NOW, ...ROW_TIMES]);
    expect(heading('2026-10-12')).toBe('Today');
    expect(heading('2026-10-11')).toBe('Yesterday');
    expect(heading('2026-10-10')).toBe('10/10/26');
    expect(heading(TODAY)).toBe('Today');
    expect(heading(YESTERDAY)).toBe('Yesterday');
    expect(heading(FIRST_OF_OCTOBER)).toBe('01/10/26');
    expect(heading('2025-10-08')).toBe('08/10/25');
    expect(watch.reads).toEqual([]);
  });
});
