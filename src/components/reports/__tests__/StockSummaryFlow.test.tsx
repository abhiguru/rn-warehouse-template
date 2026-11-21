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
import { act, render, screen, userEvent, waitFor, within, type RenderResult } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateCustomerStockPDF, generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { getAllStockSummary, getCustomerStockSummary } from '@/services/reporting';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, touchTarget, type Brand, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
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
  onOperatorServerChange: () => () => {},
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
  jest.useRealTimers();
});

type Tree = RenderResult['container'];

const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
/** The words a host element shows, nested Text included. */
const contentOf = (node: Tree): string => node.children.map(child => (typeof child === 'string' ? child : contentOf(child))).join('');

async function open(store: Store) {
  mockStore = store;
  const user = userEvent.setup({ delay: 0 });
  await render(<StockSummaryScreen />);
  await screen.findByText(/Last updated/);

  const control = (label: string) => screen.getByRole('button', { name: label });
  return {
    user,
    control,
    press: (label: string) => user.press(control(label)),
    /** A choice in the sort sheet: a radio button. */
    choose: (label: string) => user.press(screen.getByRole('radio', { name: label })),
    has: (label: string) => screen.queryByRole('button', { name: label }) !== null,
    /** Customer names in the order the rows show them. */
    customers: () =>
      screen
        .queryAllByHintText("Opens this customer's stock")
        .map(row => String(row.props.accessibilityLabel))
        .filter(label => !label.startsWith('Last opened'))
        .map(label => label.split(', ')[0]),
    /** Item cards, in stock and out of stock, in the order they are drawn. */
    // The card names the item with its packaging word ("Cumin · Bag", WH-41); the lists below are the item names.
    items: () =>
      screen
        .queryAllByHintText(/^(Shows the GRNs for this item|Hides the GRNs)$/)
        .map(card => String(card.props.accessibilityLabel).split(', ')[0].replace(/ · [^·]+$/, '')),
    /** At one customer's level: the lines the item cards draw naming what a search found inside a closed card. */
    matchLines: () => screen.queryAllByTestId('stock-item-match-line').map(contentOf),
    search: async (text: string) => {
      const field = screen.getByPlaceholderText(/^search/i);
      await user.clear(field);
      await user.type(field, text, { submitEditing: true });
    },
    searchField: () => screen.getByPlaceholderText(/^search/i),
    refresh: () => act(() => screen.root!.queryAll(node => node.type === 'FlashList')[0].props.refreshControl.props.onRefresh()),
    /** The list's own rows, as FlashList is given them: each row's type (getItemType) and key. */
    listRows: () => {
      const list = screen.root!.queryAll(node => node.type === 'FlashList')[0].props;
      return (list.data as unknown[]).map((row, index) => `${list.getItemType(row)} ${list.keyExtractor(row, index)}`);
    },
    footer: () => screen.root!.queryAll(node => node.type === 'FlashList')[0].props.ListFooterComponent,
    // A style has no query of its own, so these read the rendered Text and host elements.
    bold: () => screen.root!.queryAll(node => node.type === 'Text' && flat(node.props.style).fontWeight === fontWeight.bold).map(contentOf),
    backgrounds: () => screen.root!.queryAll(() => true).map(node => flat(node.props.style).backgroundColor),
  };
}

const DEFAULT_ORDER = ['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co'];
const ITEMS_BY_STOCK = ['Cumin', 'Garlic', 'Turmeric', 'Red chilli'];
const openCustomerC2 = () => {
  mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
};
const showsAll = (texts: string[]) => texts.forEach(text => expect(screen.getByText(text)).toBeOnTheScreen());

// ---------------------------------------------------------------------------

describe('stock summary, every customer', () => {
  it('asks for today\'s stock with no period, and shows the customers by stock, highest first', async () => {
    const view = await open(makeStore());
    expect(allStock.mock.calls).toEqual([[]]);
    expect(customerStock).not.toHaveBeenCalled();
    expect(view.customers()).toEqual(DEFAULT_ORDER);
    // No dates: the status line says only when the figures were read.
    expect(screen.getByText('Last updated 10:00 am')).toBeOnTheScreen();
    expect(view.has('Sorted by Stock, highest first. Change sort')).toBe(true);
    // The figure is "Stock", as on the item stock summary.
    for (const label of ['Items: 17', 'Stock: 550']) expect(screen.getByLabelText(label)).toBeOnTheScreen();
    expect(screen.queryByText('Units in stock')).not.toBeOnTheScreen();
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const view = await open(makeStore());
    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('Customer');
    // The field changed and the direction was kept: Z to A.
    expect(view.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Green Valley Traders']);
    await view.choose('A to Z');
    expect(view.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await view.choose('Items');
    expect(view.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Sunrise Agro Foods', 'Riverbank Produce']);
    await view.choose('GRNs');
    expect(view.customers()).toEqual(['Sunrise Agro Foods', 'Green Valley Traders', 'Riverbank Produce', 'Hillside Produce Co']);
    // Sorting is done on the rows already read: nothing more is asked.
    expect(allStock).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the sort kept', async () => {
    const view = await open(makeStore());
    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('Customer');
    await view.choose('A to Z');
    await view.press('Close');

    await view.search('produce');
    expect(view.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce']);
    expect(view.bold()).toEqual(['Produce', 'Produce']);
    expect(screen.getByText('Showing 2 of 4 · Last updated 10:00 am')).toBeOnTheScreen();

    await view.press('Clear all filters and the search');
    expect(view.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    expect(view.searchField()).toHaveDisplayValue('');
    expect(view.bold()).toEqual([]);
    expect(view.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(allStock).toHaveBeenCalledTimes(1);
  });

  it('opens a customer as a route and remembers it; after a restart the sort and that customer are back', async () => {
    const store = makeStore();
    const view = await open(store);
    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('GRNs');
    await view.press('Close');
    const byGrns = ['Hillside Produce Co', 'Riverbank Produce', 'Green Valley Traders', 'Sunrise Agro Foods'];
    expect(view.customers()).toEqual(byGrns);
    expect(screen.queryByText('Last opened')).not.toBeOnTheScreen();

    await view.press('Riverbank Produce, 7 items · 9 GRNs, 80 units');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/stock-summary', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'stock-summary': { id: 'c1', name: 'Riverbank Produce' } });

    // A restart: only the persisted choices come back, read as the app reads them from the phone.
    await screen.unmount();
    forgetQueries();
    allStock.mockClear();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(allStock.mock.calls).toEqual([[]]);
    expect(again.customers()).toEqual(byGrns);
    expect(again.has('Sorted by GRNs, highest first. Change sort')).toBe(true);
    expect(screen.getByText('Last opened')).toBeOnTheScreen();
    expect(screen.getAllByText('Riverbank Produce').length).toBeGreaterThan(1);

    await again.press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/stock-summary', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
  });

  it('keeps the rows when a refresh fails, and says they are not current', async () => {
    const view = await open(makeStore());
    allStock.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await view.refresh();
    await waitFor(() => expect(allStock).toHaveBeenCalledTimes(2));
    expect(view.customers()).toEqual(DEFAULT_ORDER);
    // The service's own words for a failure are not shown; the screen's are (useReportQuery).
    expect(await screen.findByText("Couldn't update. These figures were loaded earlier.")).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load the stock summary. Check your connection and try again.")).toBeOnTheScreen();
  });

  it('puts the share button beside the row, as a target of its own with its own label', async () => {
    const view = await open(makeStore());
    const row = view.control('Riverbank Produce, 7 items · 9 GRNs, 80 units');
    const share = view.control('Share PDF for Riverbank Produce');
    // Not inside the row's target, so a screen reader reaches it separately.
    expect(within(row).queryByLabelText('Share PDF for Riverbank Produce')).not.toBeOnTheScreen();
    // A full target: square beside the row; under a stacked card (Jest's text size of 2 stacks it)
    // drawn just around its icon, the rest of its height a hitSlop below it, never over the row.
    const drawn = flat(share.props.style) as { width: number; height: number };
    const slop = share.props.hitSlop ?? {};
    expect(drawn.width).toBe(touchTarget);
    expect(drawn.height + (slop.top ?? 0) + (slop.bottom ?? 0)).toBe(touchTarget);
    expect(slop.top ?? 0).toBe(0);

    await view.user.press(share);
    await waitFor(() => expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c1' }]]));
    // Sharing does not open the customer.
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('stock summary, the stock PDF', () => {
  const busy = (view: Awaited<ReturnType<typeof open>>, name: string) => view.control(`Share PDF for ${name}`);
  const idle = (view: Awaited<ReturnType<typeof open>>, name: string) => {
    expect(busy(view, name).props.accessibilityState).toEqual({ busy: false, disabled: false });
  };
  const working = (view: Awaited<ReturnType<typeof open>>, name: string) => {
    expect(busy(view, name).props.accessibilityState).toEqual({ busy: true, disabled: true });
  };
  // Two taps reach the button in one go, before React draws it busy and disabled (a double tap): a Pressable answers its
  // host's click with its onPress, so the second one gets to the handler's own guard. userEvent waits for a draw between presses.
  const doubleTap = async (view: Awaited<ReturnType<typeof open>>, name: string) => {
    const click = busy(view, name).props.onClick as (event: unknown) => void;
    await act(() => { click({}); click({}); });
  };

  it('keeps each row busy until its own PDF is shared, and ignores a second tap meanwhile', async () => {
    const green = deferred<ReportPdfResult>();
    makePdf.mockImplementation(async request =>
      request.customer_id === 'c2' ? green.promise : { success: true, pdfUrl: 'https://warehouse.example.test/riverbank.pdf' }
    );
    const view = await open(makeStore());

    await doubleTap(view, 'Green Valley Traders');
    working(view, 'Green Valley Traders');
    idle(view, 'Riverbank Produce');
    expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c2' }]]);

    // Another customer's PDF is not held up, and its end does not clear the first one's spinner.
    await view.press('Share PDF for Riverbank Produce');
    await waitFor(() => expect(sharePdf.mock.calls).toEqual([['https://warehouse.example.test/riverbank.pdf', 'Stock_summary_Riverbank_Produce.pdf']]));
    expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c2' }], [{ report: 'stock-summary', customer_id: 'c1' }]]);
    idle(view, 'Riverbank Produce');
    working(view, 'Green Valley Traders');

    green.resolve({ success: true, pdfUrl: 'https://warehouse.example.test/green.pdf' });
    await waitFor(() => expect(sharePdf).toHaveBeenLastCalledWith('https://warehouse.example.test/green.pdf', 'Stock_summary_Green_Valley_Traders.pdf'));
    await waitFor(() => idle(view, 'Green Valley Traders'));
    expect(alert).not.toHaveBeenCalled();
  });

  it('says so in an alert when the PDF cannot be made, and when it cannot be shared', async () => {
    const view = await open(makeStore());
    const serverBusy = "The server couldn't make the PDF right now. Try again in a moment.";
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-unavailable', error: serverBusy });
    await view.press('Share PDF for Sunrise Agro Foods');
    await waitFor(() => expect(alert.mock.calls).toEqual([["Couldn't create the PDF", serverBusy]]));
    expect(sharePdf).not.toHaveBeenCalled();
    idle(view, 'Sunrise Agro Foods');

    // The share helper's own reason, in the app's words.
    sharePdf.mockResolvedValueOnce({ success: false, error: 'Sharing is not available on this device' });
    await view.press('Share PDF for Sunrise Agro Foods');
    await waitFor(() => expect(alert.mock.calls[1]).toEqual(["Couldn't share the PDF", 'Sharing is not available on this device']));

    sharePdf.mockRejectedValueOnce(new Error('native failure'));
    await view.press('Share PDF for Sunrise Agro Foods');
    await waitFor(() => expect(alert.mock.calls[2]).toEqual(["Couldn't create the PDF", 'Check your connection and try again.']));
    idle(view, 'Sunrise Agro Foods');
  });

  it('on a server without report PDFs, a row still shares the older stock PDF with no alert, and the all-customers header goes', async () => {
    const view = await open(makeStore());
    const needsUpdate = "This facility's server needs an update before reports can be shared as PDF.";
    expect(view.has('Share PDF')).toBe(true);
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: needsUpdate });
    await view.press('Share PDF for Sunrise Agro Foods');
    await waitFor(() => expect(sharePdf.mock.calls).toEqual([['https://warehouse.example.test/older-c3.pdf', 'Stock_summary_Sunrise_Agro_Foods.pdf']]));
    expect(makePdf.mock.calls).toEqual([[{ report: 'stock-summary', customer_id: 'c3' }]]);
    expect(olderStockPdf.mock.calls).toEqual([['c3']]);
    expect(alert).not.toHaveBeenCalled();
    idle(view, 'Sunrise Agro Foods');
    // The rows keep their share buttons; the all-customers PDF has no older one.
    expect(view.has('Share PDF for Sunrise Agro Foods')).toBe(true);
    expect(view.has('Share PDF for Riverbank Produce')).toBe(true);
    expect(view.has('Share PDF')).toBe(false);
    expect(view.customers()).toEqual(DEFAULT_ORDER);

    // The next row goes straight to the older PDF.
    await view.press('Share PDF for Riverbank Produce');
    await waitFor(() => expect(sharePdf).toHaveBeenLastCalledWith('https://warehouse.example.test/older-c1.pdf', 'Stock_summary_Riverbank_Produce.pdf'));
    expect(makePdf).toHaveBeenCalledTimes(1);
    expect(olderStockPdf.mock.calls).toEqual([['c3'], ['c1']]);
    expect(alert).not.toHaveBeenCalled();
  });

  it('on a server without report PDFs, one customer\'s header shares the older stock PDF with no alert and stays', async () => {
    openCustomerC2();
    const view = await open(makeStore());
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: 'needs an update' });
    await view.press('Share PDF');
    await waitFor(() => expect(sharePdf.mock.calls).toEqual([['https://warehouse.example.test/older-c2.pdf', 'Stock_summary_Green_Valley_Traders.pdf']]));
    expect(olderStockPdf.mock.calls).toEqual([['c2']]);
    expect(alert).not.toHaveBeenCalled();
    expect(view.has('Share PDF')).toBe(true);
    await waitFor(() => expect(view.control('Share PDF')).not.toBeBusy());
  });

  it('says so with the connection words when the older stock PDF cannot be made either', async () => {
    const view = await open(makeStore());
    makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: 'needs an update' });
    olderStockPdf.mockResolvedValueOnce({ success: false, error: 'Customer not found' });
    await view.press('Share PDF for Sunrise Agro Foods');
    await waitFor(() => expect(alert.mock.calls).toEqual([["Couldn't create the PDF", 'Check your connection and try again.']]));
    expect(sharePdf).not.toHaveBeenCalled();
    expect(view.has('Share PDF for Sunrise Agro Foods')).toBe(true);
  });

  it('names the file after the customer in any script, and after the customer id when no letter is left', async () => {
    allStock.mockResolvedValue(
      answerCustomers([
        customer('c1', 'Patel & Sons (Rajkot)', 30, 1, 1),
        customer('c2', 'ગ્રીન વેલી ટ્રેડર્સ', 20, 1, 1),
        customer('9f8e7d6c-5b4a-4321-9876-0123456789ab', '', 10, 1, 1),
      ]) as never
    );
    const view = await open(makeStore());
    await view.press('Share PDF for Patel & Sons (Rajkot)');
    await view.press('Share PDF for ગ્રીન વેલી ટ્રેડર્સ');
    // The third customer has no name, so its button is "Share PDF for " (the matcher trims, the label does not).
    await view.user.press(screen.getByRole('button', { name: /^Share PDF for\s*$/ }));
    await waitFor(() => expect(sharePdf).toHaveBeenCalledTimes(3));
    expect(sharePdf.mock.calls.map(call => call[1])).toEqual([
      'Stock_summary_Patel_Sons_Rajkot.pdf',
      'Stock_summary_ગ્રીન_વેલી_ટ્રેડર્સ.pdf',
      'Stock_summary_9f8e7d6c.pdf',
    ]);
  });

  it('every customer: the header shares the sort on screen as the PDF names it, with no customer and no dates', async () => {
    const view = await open(makeStore());
    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('Items');
    await view.press('Close');
    expect(view.has('Sorted by Items, highest first. Change sort')).toBe(true);
    await sharesThePdf(view, { report: 'stock-summary', sort: { field: 'items', order: 'desc' } }, 'Stock_summary_All_customers.pdf');
  });

  it('one customer: the header shares that customer and the sort on screen, with no dates', async () => {
    openCustomerC2();
    const view = await open(makeStore());
    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('Item');
    await view.press('Close');
    expect(view.has('Sorted by Item, Z to A. Change sort')).toBe(true);
    await sharesThePdf(
      view,
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
    const view = await open(makeStore());
    expect(customerStock.mock.calls).toEqual([['c2']]);
    expect(allStock).not.toHaveBeenCalled();
    expect(view.items()).toEqual(ITEMS_BY_STOCK);
    expect(screen.getByText('Last updated 10:00 am')).toBeOnTheScreen();
    showsAll(['Green Valley Traders', 'GRNs with stock', 'Out of stock']);
    for (const label of ['Stock: 195', 'GRNs with stock: 5']) expect(screen.getByLabelText(label)).toBeOnTheScreen();
    // The header's action has the words of every other report.
    expect(view.has('Share PDF')).toBe(true);
    expect(screen.queryByLabelText('Share stock PDF')).not.toBeOnTheScreen();

    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('Item');
    expect(view.items()).toEqual(['Turmeric', 'Red chilli', 'Garlic', 'Cumin']);
    await view.choose('A to Z');
    await view.press('Close');
    expect(view.items()).toEqual(['Cumin', 'Garlic', 'Red chilli', 'Turmeric']);
    expect(customerStock).toHaveBeenCalledTimes(1);
  });

  it('finds an item by a GRN number its closed card does not show, names the GRN under it, and Clear all keeps the sort', async () => {
    openCustomerC2();
    const view = await open(makeStore());
    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('Item');
    await view.choose('A to Z');
    await view.press('Close');

    await view.search('a0042');
    expect(view.items()).toEqual(['Red chilli']);
    // The card itself names the GRN (no wrapper around it), in bold, and says it to a screen reader.
    expect(view.matchLines()).toEqual(['GRN A0042']);
    expect(view.bold()).toEqual(['A0042']);
    expect(view.has('Red chilli · Bag, 5 units, 2 GRNs, GRN A0042')).toBe(true);
    expect(screen.getByText('Showing 1 of 4 · Last updated 10:00 am')).toBeOnTheScreen();

    // Opened, the card shows its GRNs: the line is not needed, the GRN number is in bold, and a GRN opens.
    await view.press('Red chilli · Bag, 5 units, 2 GRNs, GRN A0042');
    expect(view.matchLines()).toEqual([]);
    expect(view.has('Red chilli · Bag, 5 units, 2 GRNs')).toBe(true);
    // "GRN A0042" is drawn as "GRN " and a bold "A0042" inside it.
    showsAll(['GRN A0009', 'GRN A0042']);
    expect(view.bold()).toEqual(['A0042']);
    await view.user.press(screen.getByRole('button', { name: /^GRN A0042/ }));
    expect(mockRouterPush).toHaveBeenCalledWith('/grn-details/g3');

    // A word the card's name already shows needs no line; the name shows it in bold.
    await view.search('garlic');
    expect(view.items()).toEqual(['Garlic']);
    expect(view.matchLines()).toEqual([]);
    expect(view.bold()).toEqual(['Garlic']);

    await view.press('Clear all filters and the search');
    expect(view.items()).toEqual(['Cumin', 'Garlic', 'Red chilli', 'Turmeric']);
    expect(view.searchField()).toHaveDisplayValue('');
    expect(view.has('Sorted by Item, A to Z. Change sort')).toBe(true);
    expect(customerStock).toHaveBeenCalledTimes(1);
  });

  it('offers the items that ran out under the empty message when nothing is in stock, in the chosen order', async () => {
    openCustomerC2();
    customerStock.mockResolvedValue(answerItems([]) as never);
    const view = await open(makeStore());
    showsAll(['No stock for this customer', 'Out of stock', 'Last 360 days']);
    // No figures for an empty stock, as before.
    expect(screen.queryAllByLabelText(/^Stock:/)).toEqual([]);
    expect(view.items()).toEqual([]);
    const section = 'Out of stock, 2 items, last 360 days';
    expect(view.control(section)).toBeCollapsed();

    await view.press(section);
    expect(view.control(section)).toBeExpanded();
    expect(view.items()).toEqual(['Example Mustard', 'Fictional Onions']);

    await view.press('Sorted by Stock, highest first. Change sort');
    await view.choose('Item');
    await view.choose('A to Z');
    await view.press('Close');
    expect(view.items()).toEqual(['Example Mustard', 'Fictional Onions']);

    await view.press(section);
    expect(view.items()).toEqual([]);
  });

  it('draws the items that ran out as rows of the list, under a header row that opens and closes them', async () => {
    openCustomerC2();
    const view = await open(makeStore());
    const section = 'Out of stock, 2 items, last 360 days';
    // Closed by default: the header is a row after the items in stock, and nothing is in the footer.
    expect(view.listRows()).toEqual(['item item:i3', 'item item:i1', 'item item:i4', 'item item:i2', 'emptiedHeader emptiedHeader']);
    expect(view.footer()).toBeNull();
    expect(view.control(section)).toBeCollapsed();
    expect(view.items()).toEqual(ITEMS_BY_STOCK);

    // Opened: each item that ran out is a row of its own, of its own type, so the list draws
    // (and recycles) them as they scroll into view instead of all at once.
    await view.press(section);
    expect(view.control(section)).toBeExpanded();
    expect(view.listRows()).toEqual([
      'item item:i3', 'item item:i1', 'item item:i4', 'item item:i2', 'emptiedHeader emptiedHeader', 'emptied emptied:o2', 'emptied emptied:o1',
    ]);
    expect(view.items()).toEqual([...ITEMS_BY_STOCK, 'Example Mustard', 'Fictional Onions']);
    expect(view.footer()).toBeNull();

    // An item that ran out opens on its own, and says it was dispatched.
    await view.press('Fictional Onions · Bag, 1 GRN dispatched, Out of stock');
    expect(view.has('Fictional Onions · Bag, 1 GRN dispatched, Out of stock')).toBe(true);
    expect(screen.getByText('GRN A0003')).toBeOnTheScreen();

    // The header closes them again: they are no longer rows at all.
    await view.press(section);
    expect(view.listRows()).toEqual(['item item:i3', 'item item:i1', 'item item:i4', 'item item:i2', 'emptiedHeader emptiedHeader']);
    expect(view.items()).toEqual(ITEMS_BY_STOCK);
    expect(screen.queryByText('GRN A0003')).not.toBeOnTheScreen();
  });

  it('a search that finds only items that ran out says so, and opens them under the message', async () => {
    openCustomerC2();
    const view = await open(makeStore());
    const section = 'Out of stock, 1 item, last 360 days';
    await view.search('onions');
    // Not "No items match": the matches are there, below, and already open.
    showsAll(['No items in stock match "onions"', '1 emptied item matches below.']);
    expect(screen.queryByText('No items match "onions"')).not.toBeOnTheScreen();
    expect(view.listRows()).toEqual(['nothingInStock nothingInStock', 'emptiedHeader emptiedHeader', 'emptied emptied:o1']);
    expect(view.control(section)).toBeExpanded();
    expect(view.items()).toEqual(['Fictional Onions']);
    expect(view.bold()).toEqual(['Onions']);
    expect(screen.getByText('Showing 0 of 4 · Last updated 10:00 am')).toBeOnTheScreen();

    // The header still closes them, under the same message.
    await view.press(section);
    expect(view.items()).toEqual([]);
    expect(screen.getByText('No items in stock match "onions"')).toBeOnTheScreen();

    // A search that finds items in stock: no message, and the section is as the person left it.
    await view.search('garlic');
    expect(screen.queryByText('No items in stock match "garlic"')).not.toBeOnTheScreen();
    expect(view.items()).toEqual(['Garlic']);
    expect(view.listRows()).toEqual(['item item:i1']);

    // Matching nothing anywhere: the list's own "No items match".
    await view.search('saffron');
    expect(view.listRows()).toEqual([]);
    expect(screen.getByText('No items match "saffron"')).toBeOnTheScreen();

    // Clear search and filters, offered by the message, brings everything back.
    await view.search('onions');
    expect(view.items()).toEqual(['Fictional Onions']);
    await view.press('Clear search and filters');
    expect(view.searchField()).toHaveDisplayValue('');
    expect(view.items()).toEqual(['Cumin', 'Garlic', 'Turmeric', 'Red chilli', 'Example Mustard', 'Fictional Onions']);
  });

  it('with nothing in stock, a search that finds items that ran out counts them in the message', async () => {
    openCustomerC2();
    customerStock.mockResolvedValue(answerItems([]) as never);
    const view = await open(makeStore());
    await view.search('a000');
    showsAll(['No items in stock match "a000"', '2 emptied items match below.']);
    expect(view.control('Out of stock, 2 items, last 360 days')).toBeExpanded();
    expect(view.items()).toEqual(['Example Mustard', 'Fictional Onions']);
  });

  it('an item with no GRN to list says so when opened, in stock and out of stock', async () => {
    openCustomerC2();
    customerStock.mockResolvedValue(answerItems([item('i9', 'Fictional Peas', 10, [])], [item('o9', 'Example Beans', 0, [])]) as never);
    const view = await open(makeStore());
    expect(screen.queryByText('No GRNs with this item in stock.')).not.toBeOnTheScreen();
    await view.press('Fictional Peas · Bag, 10 units, 0 GRNs');
    expect(screen.getByText('No GRNs with this item in stock.')).toBeOnTheScreen();

    await view.press('Out of stock, 1 item, last 360 days');
    expect(screen.queryByText('No GRNs to show for this item.')).not.toBeOnTheScreen();
    await view.press('Example Beans · Bag, 0 GRNs dispatched, Out of stock');
    expect(screen.getByText('No GRNs to show for this item.')).toBeOnTheScreen();
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    mockStore = makeStore(account);
    await render(<StockSummaryScreen />);
    expect(await screen.findByText('No customer linked')).toBeOnTheScreen();
    expect(allStock).not.toHaveBeenCalled();
    expect(customerStock).not.toHaveBeenCalled();
    expect(screen.getByText('No customer is linked to your account. Ask your facility to link one.')).toBeOnTheScreen();
    expect(screen.queryByText('Riverbank Produce')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });
});

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

describe.each(THEMES)('stock summary in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('every customer: cards and share buttons on theme tokens', async () => {
    const view = await open(makeStore(STAFF, undefined, { brand, mode }));
    expect(view.backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    const icons = screen.root!.queryAll(node => node.props.name === 'file-pdf-box' && typeof node.props.color === 'string');
    expect(new Set(icons.map(node => node.props.color))).toEqual(new Set([t.brand.tint]));
  });

  it('one customer: item cards, the match line and the out-of-stock section on theme tokens', async () => {
    openCustomerC2();
    const view = await open(makeStore(STAFF, undefined, { brand, mode }));
    // The out-of-stock count badge is on brand.fill.
    expect(view.backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.fill]));
    await view.search('a0042');
    expect(screen.getByTestId('stock-item-match-line')).toHaveStyle({ color: t.text.secondary });
    // The item card carries its own surface: no second card around it. Of everything above its header
    // up to the list, one element (the card itself) is on the card surface.
    const around: unknown[] = [];
    for (let node = screen.getByHintText('Shows the GRNs for this item').parent; node && node.type !== 'FlashList'; node = node.parent) {
      around.push(flat(node.props.style).backgroundColor);
    }
    expect(around.filter(color => color === t.surface.card)).toHaveLength(1);
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
  view: Awaited<ReturnType<typeof open>>,
  request: Record<string, unknown>,
  filename: string,
  label = 'Share PDF',
  olderPdfCustomer?: string
) {
  let answer!: (result: ReportPdfResult) => void;
  makePdf.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  await view.press(label);
  expect(makePdf.mock.calls).toEqual([[request]]);
  for (const field of ['customer_id', 'from', 'to', 'sort']) {
    if (!(field in request)) expect(makePdf.mock.calls[0][0]).not.toHaveProperty(field);
  }
  expect(view.control(label)).toBeBusy();
  expect(sharePdf).not.toHaveBeenCalled();
  answer({ success: true, pdfUrl: PDF_URL });
  await waitFor(() => expect(sharePdf.mock.calls).toEqual([[PDF_URL, filename]]));
  await waitFor(() => expect(view.control(label)).not.toBeBusy());
  expect(alert).not.toHaveBeenCalled();

  makePdf.mockResolvedValueOnce({ success: false, reason: 'forbidden', error: NOT_AVAILABLE });
  await view.press(label);
  await waitFor(() => expect(alert.mock.calls).toEqual([["Couldn't create the PDF", NOT_AVAILABLE]]));
  expect(sharePdf).toHaveBeenCalledTimes(1);
  expect(view.has(label)).toBe(true);

  makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: NEEDS_UPDATE });
  await view.press(label);
  if (olderPdfCustomer) {
    await waitFor(() => expect(sharePdf).toHaveBeenLastCalledWith(`https://warehouse.example.test/older-${olderPdfCustomer}.pdf`, filename));
    expect(olderStockPdf.mock.calls).toEqual([[olderPdfCustomer]]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(view.has(label)).toBe(true);
    return;
  }
  await waitFor(() => expect(alert.mock.calls[1]).toEqual(["Couldn't create the PDF", NEEDS_UPDATE]));
  expect(olderStockPdf).not.toHaveBeenCalled();
  await waitFor(() => expect(view.has(label)).toBe(false));
}
