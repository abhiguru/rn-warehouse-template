/**
 * The stock summary report with a real store: the sort, search and "Clear all"
 * are worked through the filter bar and the search field as a person would,
 * and what the report remembers is read back from the store, also by a new
 * screen after a restart. The stock PDF (generate-report-pdf) is shared from a
 * customer's row and from the header at both levels; on an older backend one
 * customer's PDF comes from generate-customer-stock-pdf instead. Only the
 * services, the share sheet, the alert and the router are stand-ins. The rows
 * are made so that every change gives an order of its own.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { StockItemCard } from '@/components/reports/StockItemCard';
import { HighlightedText } from '@/features/filters/components/HighlightedText';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateCustomerStockPDF, generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { getAllStockSummary, getCustomerStockSummary } from '@/services/reporting';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, touchTarget, type Brand, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { showAlert } from '@/utils/alert';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import StockSummaryScreen from '../../../../app/reports/stock-summary';

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
jest.mock('@/services/reporting', () => ({ getAllStockSummary: jest.fn(), getCustomerStockSummary: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({
  ...jest.requireActual('@/services/pdf-service'),
  generateReportPDF: jest.fn(),
  generateCustomerStockPDF: jest.fn(),
}));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const allStock = jest.mocked(getAllStockSummary);
const customerStock = jest.mocked(getCustomerStockSummary);
const makePdf = jest.mocked(generateReportPDF);
const olderStockPdf = jest.mocked(generateCustomerStockPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const alert = jest.mocked(showAlert);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// ---------------------------------------------------------------------------
// Rows. No two share a value in a sorted column.
// ---------------------------------------------------------------------------

const customer = (id: string, name: string, stock: number, items: number, grns: number) => ({
  customer_id: id,
  customer_name: name,
  total_stock: stock,
  total_weight: stock * 50,
  item_count: items,
  grn_count: grns,
});
const CUSTOMERS = [
  customer('c1', 'Riverbank Produce', 80, 7, 9),
  customer('c2', 'Green Valley Traders', 300, 2, 4),
  customer('c3', 'Sunrise Agro Foods', 120, 5, 2),
  customer('c4', 'Hillside Produce Co', 50, 3, 12),
];
const answerCustomers = (rows: ReturnType<typeof customer>[]) => ({
  success: true,
  message: '',
  data: { summary: { total_customers_with_stock: rows.length, total_items: 17, total_quantity: 550, total_weight_kg: 0 }, customers: rows },
});

const item = (id: string, name: string, stock: number, grns: [string, string][]) => ({
  item_id: id,
  item_name: name,
  total_stock: stock,
  total_weight: stock * 50,
  grn_count: grns.length,
  grns: grns.map(([grnId, number]) => ({
    grn_id: grnId,
    gr_no: number,
    date: '2026-09-01',
    orig_qty: 100,
    stock,
    item_weight: 50,
    rack: '',
    packaging: 'Bag',
    emptied_date: stock === 0 ? '2026-10-01' : undefined,
  })),
});
const ITEMS = [
  item('i1', 'Garlic', 60, [['g1', 'A0010']]),
  item('i2', 'Red chilli', 5, [['g2', 'A0009'], ['g3', 'A0042']]),
  item('i3', 'Cumin', 90, [['g4', 'A0100']]),
  item('i4', 'Turmeric', 40, [['g5', 'A0050']]),
];
const EMPTIED = [item('o1', 'Fictional Onions', 0, [['g6', 'A0003']]), item('o2', 'Example Mustard', 0, [['g7', 'A0004']])];
const answerItems = (items: unknown[], outOfStock: unknown[] = EMPTIED) => ({
  success: true,
  message: '',
  data: {
    summary: { total_items: items.length, total_quantity: 195, total_weight_kg: 0, oldest_stock_date: '2026-09-01', grn_count: 5, grn_count_empty: 2 },
    items,
    out_of_stock_items: outOfStock,
  },
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeStore(auth: unknown = STAFF, reportPrefs?: ReportPrefsState, theme: { brand: Brand; mode: Mode } = { brand: 'orange', mode: 'light' }) {
  return configureStore({
    reducer: {
      auth: (state: unknown = auth) => state,
      theme: (state = { preference: theme.mode, brand: theme.brand }) => state,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
    },
    preloadedState: reportPrefs ? { reportPrefs } : undefined,
  });
}
type Store = ReturnType<typeof makeStore>;

/** A request that stays unanswered until the test answers it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

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
  jest.clearAllMocks();
  mockParams = {};
  allStock.mockResolvedValue(answerCustomers(CUSTOMERS) as never);
  customerStock.mockResolvedValue(answerItems(ITEMS) as never);
  makePdf.mockResolvedValue({ success: true, pdfUrl: 'https://warehouse.example.test/stock.pdf' });
  olderStockPdf.mockImplementation(async customerId => ({ success: true, pdfUrl: `https://warehouse.example.test/older-${customerId}.pdf` }));
  sharePdf.mockResolvedValue({ success: true });
  resetReportExportAvailability();
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

const pressedStyle = (node: ReactTestInstance) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style) ?? {};

async function open(store: Store) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<StockSummaryScreen />);
    await settleQueries();
  });
  mounted.push(tree);

  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const controls = (label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  const control = (label: string) => {
    const found = controls(label);
    if (found.length === 0) throw new Error(`No control labelled "${label}"`);
    return found[0];
  };
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const matchLineNodes = () =>
    tree.root.findAllByType(StockItemCard).flatMap(card => card.findAllByType(HighlightedText).filter(node => node.props.testID === 'stock-item-match-line'));
  return {
    tree,
    texts,
    control,
    press: (label: string) => run(() => control(label).props.onPress()),
    has: (label: string) => controls(label).length > 0,
    labels: () => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string),
    /** Customer names in the order the rows show them. */
    customers: () => tree.root.findAllByType(ReportCustomerCard).map(card => card.props.title as string),
    /** Item cards, in stock and out of stock, in the order they are drawn. */
    items: () => tree.root.findAllByType(StockItemCard).map(card => card.props.name as string),
    /** At one customer's level: the lines the item cards draw naming what a search found inside a closed card. */
    matchLines: () => matchLineNodes().map(node => node.props.text as string),
    matchLineNodes,
    status: () => texts().find(text => text.includes('Last updated')),
    search: async (text: string) => {
      const field = tree.root.findAll(node => typeof node.props.onChangeText === 'function' && typeof node.props.onSubmitEditing === 'function')[0];
      await run(() => field.props.onChangeText(text));
      await run(() => tree.root.findAll(node => typeof node.props.onSubmitEditing === 'function')[0].props.onSubmitEditing());
    },
    searchValue: () => tree.root.findAll(node => typeof node.props.onChangeText === 'function')[0].props.value as string,
    refresh: () => run(() => tree.root.findByType('FlashList' as never).props.refreshControl.props.onRefresh()),
    /** The list's own rows, as FlashList is given them: each row's type (getItemType) and key. */
    listRows: () => {
      const list = tree.root.findByType('FlashList' as never).props;
      return (list.data as unknown[]).map((row, index) => `${list.getItemType(row)} ${list.keyExtractor(row, index)}`);
    },
    footer: () => tree.root.findByType('FlashList' as never).props.ListFooterComponent,
    bold: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
        .map(node => [node.props.children].flat().join('')),
    backgrounds: () => tree.root.findAll(node => typeof node.type === 'string').map(node => pressedStyle(node).backgroundColor),
  };
}

const DEFAULT_ORDER = ['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co'];
const ITEMS_BY_STOCK = ['Cumin', 'Garlic', 'Turmeric', 'Red chilli'];
const openCustomerC2 = () => {
  mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
};

// ---------------------------------------------------------------------------

describe('stock summary, every customer', () => {
  it('asks for today\'s stock with no period, and shows the customers by stock, highest first', async () => {
    const screen = await open(makeStore());
    expect(allStock.mock.calls).toEqual([[]]);
    expect(customerStock).not.toHaveBeenCalled();
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    // No dates: the status line says only when the figures were read.
    expect(screen.status()).toBe('Last updated 10:00 am');
    expect(screen.has('Sorted by Stock, highest first. Change sort')).toBe(true);
    // The figure is "Stock", as on the item stock summary.
    expect(screen.labels()).toEqual(expect.arrayContaining(['Items: 17', 'Stock: 550']));
    expect(screen.texts()).not.toContain('Units in stock');
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('Customer');
    // The field changed and the direction was kept: Z to A.
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Green Valley Traders']);
    await screen.press('A to Z');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Items');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Sunrise Agro Foods', 'Riverbank Produce']);
    await screen.press('GRNs');
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Green Valley Traders', 'Riverbank Produce', 'Hillside Produce Co']);
    // Sorting is done on the rows already read: nothing more is asked.
    expect(allStock).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the sort kept', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('Customer');
    await screen.press('A to Z');
    await screen.press('Done');

    await screen.search('produce');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce']);
    expect(screen.bold()).toEqual(['Produce', 'Produce']);
    expect(screen.status()).toBe('Showing 2 of 4 · Last updated 10:00 am');

    await screen.press('Clear all filters and the search');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    expect(screen.searchValue()).toBe('');
    expect(screen.bold()).toEqual([]);
    expect(screen.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(allStock).toHaveBeenCalledTimes(1);
  });

  it('opens a customer as a route and remembers it; after a restart the sort and that customer are back', async () => {
    const store = makeStore();
    const screen = await open(store);
    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('GRNs');
    await screen.press('Done');
    const byGrns = ['Hillside Produce Co', 'Riverbank Produce', 'Green Valley Traders', 'Sunrise Agro Foods'];
    expect(screen.customers()).toEqual(byGrns);
    expect(screen.texts()).not.toContain('Last opened');

    await screen.press('Riverbank Produce, 7 items · 9 GRNs, 80 units');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/stock-summary', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'stock-summary': { id: 'c1', name: 'Riverbank Produce' } });

    // A restart: only the persisted choices come back, read as the app reads them from the phone.
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    forgetQueries();
    allStock.mockClear();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(allStock.mock.calls).toEqual([[]]);
    expect(again.customers()).toEqual(byGrns);
    expect(again.has('Sorted by GRNs, highest first. Change sort')).toBe(true);
    expect(again.texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));

    await again.press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/stock-summary', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
  });

  it('keeps the rows when a refresh fails, and says they are not current', async () => {
    const screen = await open(makeStore());
    allStock.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await screen.refresh();
    expect(allStock).toHaveBeenCalledTimes(2);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", 'Could not reach the facility']));
  });

  it('puts the share button beside the row, as a target of its own with its own label', async () => {
    const screen = await open(makeStore());
    const row = screen.control('Riverbank Produce, 7 items · 9 GRNs, 80 units');
    const share = screen.control('Share PDF for Riverbank Produce');
    // Not inside the row's target, so a screen reader reaches it separately.
    expect(row.findAll(node => node.props.accessibilityLabel === 'Share PDF for Riverbank Produce')).toHaveLength(0);
    for (let node = share.parent; node; node = node.parent) expect(node).not.toBe(row);
    expect(share.props.accessibilityRole).toBe('button');
    expect(pressedStyle(share)).toMatchObject({ width: touchTarget, height: touchTarget });

    await screen.press('Share PDF for Riverbank Produce');
    expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c1' }]]);
    // Sharing does not open the customer.
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('stock summary, the stock PDF', () => {
  const busy = (screen: Awaited<ReturnType<typeof open>>, name: string) => screen.control(`Share PDF for ${name}`).props.accessibilityState;

  it('keeps each row busy until its own PDF is shared, and ignores a second tap meanwhile', async () => {
    const green = deferred<ReportPdfResult>();
    makePdf.mockImplementation(async request =>
      request.customer_id === 'c2' ? green.promise : { success: true, pdfUrl: 'https://warehouse.example.test/riverbank.pdf' }
    );
    const screen = await open(makeStore());

    await screen.press('Share PDF for Green Valley Traders');
    expect(busy(screen, 'Green Valley Traders')).toEqual({ busy: true, disabled: true });
    expect(busy(screen, 'Riverbank Produce')).toEqual({ busy: false, disabled: false });
    await screen.press('Share PDF for Green Valley Traders');
    expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c2' }]]);

    // Another customer's PDF is not held up, and its end does not clear the first one's spinner.
    await screen.press('Share PDF for Riverbank Produce');
    expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c2' }], [{ report: 'stock-summary', customer_id: 'c1' }]]);
    expect(sharePdf.mock.calls).toEqual([['https://warehouse.example.test/riverbank.pdf', 'Stock_summary_Riverbank_Produce.pdf']]);
    expect(busy(screen, 'Riverbank Produce')).toEqual({ busy: false, disabled: false });
    expect(busy(screen, 'Green Valley Traders')).toEqual({ busy: true, disabled: true });

    await act(async () => {
      green.resolve({ success: true, pdfUrl: 'https://warehouse.example.test/green.pdf' });
      await settleQueries();
    });
    expect(sharePdf).toHaveBeenLastCalledWith('https://warehouse.example.test/green.pdf', 'Stock_summary_Green_Valley_Traders.pdf');
    expect(busy(screen, 'Green Valley Traders')).toEqual({ busy: false, disabled: false });
    expect(alert).not.toHaveBeenCalled();
  });

  it('says so in an alert when the PDF cannot be made, and when it cannot be shared', async () => {
    const screen = await open(makeStore());
    const serverBusy = "The server couldn't make the PDF right now. Try again in a moment.";
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-unavailable', error: serverBusy });
    await screen.press('Share PDF for Sunrise Agro Foods');
    expect(alert.mock.calls).toEqual([["Couldn't create the PDF", serverBusy]]);
    expect(sharePdf).not.toHaveBeenCalled();
    expect(busy(screen, 'Sunrise Agro Foods')).toEqual({ busy: false, disabled: false });

    // The share helper's own reason, in the app's words.
    sharePdf.mockResolvedValueOnce({ success: false, error: 'Sharing is not available on this device' });
    await screen.press('Share PDF for Sunrise Agro Foods');
    expect(alert.mock.calls[1]).toEqual(["Couldn't share the PDF", 'Sharing is not available on this device']);

    sharePdf.mockRejectedValueOnce(new Error('native failure'));
    await screen.press('Share PDF for Sunrise Agro Foods');
    expect(alert.mock.calls[2]).toEqual(["Couldn't create the PDF", 'Check your connection and try again.']);
    expect(busy(screen, 'Sunrise Agro Foods')).toEqual({ busy: false, disabled: false });
  });

  it('on a server without report PDFs, a row still shares the older stock PDF with no alert, and the all-customers header goes', async () => {
    const screen = await open(makeStore());
    const needsUpdate = "This facility's server needs an update before reports can be shared as PDF.";
    expect(screen.has('Share PDF')).toBe(true);
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: needsUpdate });
    await screen.press('Share PDF for Sunrise Agro Foods');
    expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c3' }]]);
    expect(olderStockPdf.mock.calls).toEqual([['c3']]);
    expect(sharePdf.mock.calls).toEqual([['https://warehouse.example.test/older-c3.pdf', 'Stock_summary_Sunrise_Agro_Foods.pdf']]);
    expect(alert).not.toHaveBeenCalled();
    expect(busy(screen, 'Sunrise Agro Foods')).toEqual({ busy: false, disabled: false });
    // The rows keep their share buttons; the all-customers PDF has no older one.
    expect(screen.has('Share PDF for Sunrise Agro Foods')).toBe(true);
    expect(screen.has('Share PDF for Riverbank Produce')).toBe(true);
    expect(screen.has('Share PDF')).toBe(false);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);

    // The next row goes straight to the older PDF.
    await screen.press('Share PDF for Riverbank Produce');
    expect(makePdf).toHaveBeenCalledTimes(1);
    expect(olderStockPdf.mock.calls).toEqual([['c3'], ['c1']]);
    expect(sharePdf).toHaveBeenLastCalledWith('https://warehouse.example.test/older-c1.pdf', 'Stock_summary_Riverbank_Produce.pdf');
    expect(alert).not.toHaveBeenCalled();
  });

  it('on a server without report PDFs, one customer\'s header shares the older stock PDF with no alert and stays', async () => {
    openCustomerC2();
    const screen = await open(makeStore());
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: 'needs an update' });
    await screen.press('Share PDF');
    expect(olderStockPdf.mock.calls).toEqual([['c2']]);
    expect(sharePdf.mock.calls).toEqual([['https://warehouse.example.test/older-c2.pdf', 'Stock_summary_Green_Valley_Traders.pdf']]);
    expect(alert).not.toHaveBeenCalled();
    expect(screen.has('Share PDF')).toBe(true);
    expect(screen.control('Share PDF').props.accessibilityState).toMatchObject({ busy: false });
  });

  it('says so with the connection words when the older stock PDF cannot be made either', async () => {
    const screen = await open(makeStore());
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: 'needs an update' });
    olderStockPdf.mockResolvedValueOnce({ success: false, error: 'Customer not found' });
    await screen.press('Share PDF for Sunrise Agro Foods');
    expect(alert.mock.calls).toEqual([["Couldn't create the PDF", 'Check your connection and try again.']]);
    expect(sharePdf).not.toHaveBeenCalled();
    expect(screen.has('Share PDF for Sunrise Agro Foods')).toBe(true);
  });

  it('names the file after the customer in any script, and after the customer id when no letter is left', async () => {
    allStock.mockResolvedValue(
      answerCustomers([
        customer('c1', 'Patel & Sons (Rajkot)', 30, 1, 1),
        customer('c2', 'ગ્રીન વેલી ટ્રેડર્સ', 20, 1, 1),
        customer('9f8e7d6c-5b4a-4321-9876-0123456789ab', '', 10, 1, 1),
      ]) as never
    );
    const screen = await open(makeStore());
    await screen.press('Share PDF for Patel & Sons (Rajkot)');
    await screen.press('Share PDF for ગ્રીન વેલી ટ્રેડર્સ');
    await screen.press('Share PDF for ');
    expect(sharePdf.mock.calls.map(call => call[1])).toEqual([
      'Stock_summary_Patel_Sons_Rajkot.pdf',
      'Stock_summary_ગ્રીન_વેલી_ટ્રેડર્સ.pdf',
      'Stock_summary_9f8e7d6c.pdf',
    ]);
  });

  it('every customer: the header shares the sort on screen as the PDF names it, with no customer and no dates', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('Items');
    await screen.press('Done');
    expect(screen.has('Sorted by Items, highest first. Change sort')).toBe(true);
    await sharesThePdf(screen, { report: 'stock-summary', sort: { field: 'items', order: 'desc' } }, 'Stock_summary_All.pdf');
  });

  it('one customer: the header shares that customer and the sort on screen, with no dates', async () => {
    openCustomerC2();
    const screen = await open(makeStore());
    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('Item');
    await screen.press('Done');
    expect(screen.has('Sorted by Item, Z to A. Change sort')).toBe(true);
    await sharesThePdf(
      screen,
      { report: 'stock-summary', customer_id: 'c2', sort: { field: 'item', order: 'desc' } },
      'Stock_summary_Green_Valley_Traders.pdf',
      'Share PDF',
      'c2'
    );
  });
});

describe('stock summary, one customer', () => {
  it('asks for that customer only, shows its items by stock, and sorts them by name in either direction', async () => {
    openCustomerC2();
    const screen = await open(makeStore());
    expect(customerStock.mock.calls).toEqual([['c2']]);
    expect(allStock).not.toHaveBeenCalled();
    expect(screen.items()).toEqual(ITEMS_BY_STOCK);
    expect(screen.status()).toBe('Last updated 10:00 am');
    expect(screen.texts()).toEqual(expect.arrayContaining(['Green Valley Traders', 'GRNs with stock', 'Out of stock']));
    expect(screen.labels()).toEqual(expect.arrayContaining(['Stock: 195', 'GRNs with stock: 5']));
    // The header's action has the words of every other report.
    expect(screen.has('Share PDF')).toBe(true);
    expect(screen.labels()).not.toContain('Share stock PDF');

    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('Item');
    expect(screen.items()).toEqual(['Turmeric', 'Red chilli', 'Garlic', 'Cumin']);
    await screen.press('A to Z');
    await screen.press('Done');
    expect(screen.items()).toEqual(['Cumin', 'Garlic', 'Red chilli', 'Turmeric']);
    expect(customerStock).toHaveBeenCalledTimes(1);
  });

  it('finds an item by a GRN number its closed card does not show, names the GRN under it, and Clear all keeps the sort', async () => {
    openCustomerC2();
    const screen = await open(makeStore());
    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('Item');
    await screen.press('A to Z');
    await screen.press('Done');

    await screen.search('a0042');
    expect(screen.items()).toEqual(['Red chilli']);
    // The card itself names the GRN (no wrapper around it), in bold, and says it to a screen reader.
    const [card] = screen.tree.root.findAllByType(StockItemCard);
    expect(card.props.matchLine).toBe('GRN A0042');
    expect(card.props.highlightWords).toEqual(['a0042']);
    expect(screen.matchLines()).toEqual(['GRN A0042']);
    expect(screen.bold()).toEqual(['A0042']);
    expect(screen.has('Red chilli, 5 units, 2 GRNs, GRN A0042')).toBe(true);
    expect(screen.status()).toBe('Showing 1 of 4 · Last updated 10:00 am');

    // Opened, the card shows its GRNs: the line is not needed, the GRN number is in bold, and a GRN opens.
    await screen.press('Red chilli, 5 units, 2 GRNs, GRN A0042');
    expect(screen.matchLines()).toEqual([]);
    expect(screen.has('Red chilli, 5 units, 2 GRNs')).toBe(true);
    // "GRN A0042" is drawn as "GRN " and a bold "A0042" inside it.
    expect(screen.texts()).toContain('GRN A0009');
    const rowTitles = screen.tree.root.findAllByType(HighlightedText).map(node => node.props.text as string);
    expect(rowTitles).toEqual(expect.arrayContaining(['GRN A0009', 'GRN A0042']));
    expect(screen.bold()).toEqual(['A0042']);
    await screen.press(screen.tree.root.findAll(node => String(node.props.accessibilityLabel ?? '').startsWith('GRN A0042') && typeof node.props.onPress === 'function')[0].props.accessibilityLabel);
    expect(mockRouterPush).toHaveBeenCalledWith('/grn-details/g3');

    // A word the card's name already shows needs no line; the name shows it in bold.
    await screen.search('garlic');
    expect(screen.items()).toEqual(['Garlic']);
    expect(screen.matchLines()).toEqual([]);
    expect(screen.bold()).toEqual(['Garlic']);

    await screen.press('Clear all filters and the search');
    expect(screen.items()).toEqual(['Cumin', 'Garlic', 'Red chilli', 'Turmeric']);
    expect(screen.searchValue()).toBe('');
    expect(screen.has('Sorted by Item, A to Z. Change sort')).toBe(true);
    expect(customerStock).toHaveBeenCalledTimes(1);
  });

  it('offers the items that ran out under the empty message when nothing is in stock, in the chosen order', async () => {
    openCustomerC2();
    customerStock.mockResolvedValue(answerItems([]) as never);
    const screen = await open(makeStore());
    expect(screen.texts()).toEqual(expect.arrayContaining(['No stock for this customer', 'Out of stock', 'Last 360 days']));
    // No figures for an empty stock, as before.
    expect(screen.labels().filter(label => label.startsWith('Stock:'))).toEqual([]);
    expect(screen.items()).toEqual([]);
    const section = 'Out of stock, 2 items, last 360 days';
    expect(screen.control(section).props.accessibilityState).toEqual({ expanded: false });

    await screen.press(section);
    expect(screen.control(section).props.accessibilityState).toEqual({ expanded: true });
    expect(screen.items()).toEqual(['Fictional Onions', 'Example Mustard']);

    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('Item');
    await screen.press('A to Z');
    await screen.press('Done');
    expect(screen.items()).toEqual(['Example Mustard', 'Fictional Onions']);

    await screen.press(section);
    expect(screen.items()).toEqual([]);
  });

  it('draws the items that ran out as rows of the list, under a header row that opens and closes them', async () => {
    openCustomerC2();
    const screen = await open(makeStore());
    const section = 'Out of stock, 2 items, last 360 days';
    // Closed by default: the header is a row after the items in stock, and nothing is in the footer.
    expect(screen.listRows()).toEqual(['item item:i3', 'item item:i1', 'item item:i4', 'item item:i2', 'emptiedHeader emptiedHeader']);
    expect(screen.footer()).toBeNull();
    expect(screen.control(section).props.accessibilityState).toEqual({ expanded: false });
    expect(screen.items()).toEqual(ITEMS_BY_STOCK);

    // Opened: each item that ran out is a row of its own, of its own type, so the list draws
    // (and recycles) them as they scroll into view instead of all at once.
    await screen.press(section);
    expect(screen.control(section).props.accessibilityState).toEqual({ expanded: true });
    expect(screen.listRows()).toEqual([
      'item item:i3', 'item item:i1', 'item item:i4', 'item item:i2', 'emptiedHeader emptiedHeader', 'emptied emptied:o1', 'emptied emptied:o2',
    ]);
    expect(screen.items()).toEqual([...ITEMS_BY_STOCK, 'Fictional Onions', 'Example Mustard']);
    expect(screen.footer()).toBeNull();

    // An item that ran out opens on its own, and says it was dispatched.
    await screen.press('Fictional Onions, 1 GRN dispatched, Out of stock');
    expect(screen.has('Fictional Onions, 1 GRN dispatched, Out of stock')).toBe(true);
    expect(screen.texts()).toContain('GRN A0003');

    // The header closes them again: they are no longer rows at all.
    await screen.press(section);
    expect(screen.listRows()).toEqual(['item item:i3', 'item item:i1', 'item item:i4', 'item item:i2', 'emptiedHeader emptiedHeader']);
    expect(screen.items()).toEqual(ITEMS_BY_STOCK);
    expect(screen.texts()).not.toContain('GRN A0003');
  });

  it('a search that finds only items that ran out says so, and opens them under the message', async () => {
    openCustomerC2();
    const screen = await open(makeStore());
    const section = 'Out of stock, 1 item, last 360 days';
    await screen.search('onions');
    // Not "No items match": the matches are there, below, and already open.
    expect(screen.texts()).toEqual(expect.arrayContaining(['No items in stock match "onions"', '1 emptied item matches below.']));
    expect(screen.texts()).not.toContain('No items match "onions"');
    expect(screen.listRows()).toEqual(['nothingInStock nothingInStock', 'emptiedHeader emptiedHeader', 'emptied emptied:o1']);
    expect(screen.control(section).props.accessibilityState).toEqual({ expanded: true });
    expect(screen.items()).toEqual(['Fictional Onions']);
    expect(screen.bold()).toEqual(['Onions']);
    expect(screen.status()).toBe('Showing 0 of 4 · Last updated 10:00 am');

    // The header still closes them, under the same message.
    await screen.press(section);
    expect(screen.items()).toEqual([]);
    expect(screen.texts()).toContain('No items in stock match "onions"');

    // A search that finds items in stock: no message, and the section is as the person left it.
    await screen.search('garlic');
    expect(screen.texts()).not.toContain('No items in stock match "garlic"');
    expect(screen.items()).toEqual(['Garlic']);
    expect(screen.listRows()).toEqual(['item item:i1']);

    // Matching nothing anywhere: the list's own "No items match".
    await screen.search('saffron');
    expect(screen.listRows()).toEqual([]);
    expect(screen.texts()).toContain('No items match "saffron"');

    // Clear search and filters, offered by the message, brings everything back.
    await screen.search('onions');
    expect(screen.items()).toEqual(['Fictional Onions']);
    await screen.press('Clear search and filters');
    expect(screen.searchValue()).toBe('');
    expect(screen.items()).toEqual(['Cumin', 'Garlic', 'Turmeric', 'Red chilli', 'Fictional Onions', 'Example Mustard']);
  });

  it('with nothing in stock, a search that finds items that ran out counts them in the message', async () => {
    openCustomerC2();
    customerStock.mockResolvedValue(answerItems([]) as never);
    const screen = await open(makeStore());
    await screen.search('a000');
    expect(screen.texts()).toEqual(expect.arrayContaining(['No items in stock match "a000"', '2 emptied items match below.']));
    expect(screen.control('Out of stock, 2 items, last 360 days').props.accessibilityState).toEqual({ expanded: true });
    expect(screen.items()).toEqual(['Fictional Onions', 'Example Mustard']);
  });

  it('an item with no GRN to list says so when opened, in stock and out of stock', async () => {
    openCustomerC2();
    customerStock.mockResolvedValue(answerItems([item('i9', 'Fictional Peas', 10, [])], [item('o9', 'Example Beans', 0, [])]) as never);
    const screen = await open(makeStore());
    expect(screen.texts()).not.toContain('No GRNs with this item in stock.');
    await screen.press('Fictional Peas, 10 units, 0 GRNs');
    expect(screen.texts()).toContain('No GRNs with this item in stock.');

    await screen.press('Out of stock, 1 item, last 360 days');
    expect(screen.texts()).not.toContain('No GRNs to show for this item.');
    await screen.press('Example Beans, 0 GRNs dispatched, Out of stock');
    expect(screen.texts()).toContain('No GRNs to show for this item.');
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(allStock).not.toHaveBeenCalled();
    expect(customerStock).not.toHaveBeenCalled();
    expect(screen.texts()).toEqual(expect.arrayContaining(['No customer linked', 'No customer is linked to your account. Ask your facility to link one.']));
    expect(screen.texts()).not.toContain('Riverbank Produce');
    expect(screen.has('Try again')).toBe(false);
  });
});

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

describe.each(THEMES)('stock summary in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('every customer: cards and share buttons on theme tokens', async () => {
    const screen = await open(makeStore(STAFF, undefined, { brand, mode }));
    expect(screen.backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    const icons = screen.tree.root.findAll(node => node.props.name === 'file-pdf-box' && typeof node.props.color === 'string');
    expect(new Set(icons.map(node => node.props.color))).toEqual(new Set([t.brand.tint]));
  });

  it('one customer: item cards, the match line and the out-of-stock section on theme tokens', async () => {
    openCustomerC2();
    const screen = await open(makeStore(STAFF, undefined, { brand, mode }));
    // The out-of-stock count badge is on brand.fill.
    expect(screen.backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.fill]));
    await screen.search('a0042');
    const [line] = screen.matchLineNodes();
    expect(StyleSheet.flatten(line.props.style).color).toBe(t.text.secondary);
    // The item card carries its own surface: no second card around it.
    const [card] = screen.tree.root.findAllByType(StockItemCard);
    const around: unknown[] = [];
    for (let node = card.parent; node; node = node.parent) {
      if (typeof node.type === 'string') around.push(StyleSheet.flatten(node.props.style)?.backgroundColor);
    }
    expect(around).not.toContain(t.surface.card);
    expect(StyleSheet.flatten(card.findAllByType('View' as never)[0].props.style).backgroundColor).toBe(t.surface.card);
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
 * is said once and the action goes, unless the action has the older stock PDF
 * of `olderPdfCustomer` to share instead (no alert, the action stays).
 */
async function sharesThePdf(
  screen: Awaited<ReturnType<typeof open>>,
  request: Record<string, unknown>,
  filename: string,
  label = 'Share PDF',
  olderPdfCustomer?: string
) {
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
  if (olderPdfCustomer) {
    expect(olderStockPdf.mock.calls).toEqual([[olderPdfCustomer]]);
    expect(sharePdf).toHaveBeenLastCalledWith(`https://warehouse.example.test/older-${olderPdfCustomer}.pdf`, filename);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.has(label)).toBe(true);
    return;
  }
  expect(olderStockPdf).not.toHaveBeenCalled();
  expect(alert.mock.calls[1]).toEqual(["Couldn't create the PDF", NEEDS_UPDATE]);
  expect(screen.has(label)).toBe(false);
}
