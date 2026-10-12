/**
 * The item stock summary with a real store and the real stock service: the
 * search field, the sort sheet and the end of the list are worked as a person
 * would, and what reaches the server is read where it leaves the app, as the
 * parameters of get_item_wise_stock_list. Only the server (the RPC), the GRN
 * drill-down service, the report PDF service, the share sheet, the alert and
 * the router are stand-ins.
 *
 * The server is played by `facility`: a backend with migration 52 searches,
 * sorts, pages and totals; one without it refuses p_sort_by and p_sort_order
 * (PGRST202) and pages in item-name order with no totals. Each test says
 * which one it plays.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { StockItemCard } from '@/components/reports/StockItemCard';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { getAllGRNItems } from '@/services/grn-service';
import { generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { forgetItemSortSupport } from '@/services/stock-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { showAlert } from '@/utils/alert';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import ItemStockSummaryScreen from '../../../../app/reports/item-stock-summary';

let mockStore: Store;
let mockParams: Record<string, string> = {};
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
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn(), back: jest.fn() },
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
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } }, forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getCustomerGRNItems: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateReportPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const grnItems = jest.mocked(getAllGRNItems);
const makePdf = jest.mocked(generateReportPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const alert = jest.mocked(showAlert);

// ---------------------------------------------------------------------------
// The facility
// ---------------------------------------------------------------------------

interface Item {
  item_id: string;
  item_name: string;
  packaging: string;
  total_qty: number;
  total_stock: number;
  grn_count: number;
}
const item = (id: string, name: string, stock: number, qty: number, grns: number): Item => ({
  item_id: id,
  item_name: name,
  packaging: 'Bag',
  total_qty: qty,
  total_stock: stock,
  grn_count: grns,
});
/** Three items whose order differs by every sort. */
const FEW = [item('i1', 'Example Garlic', 30, 200, 5), item('i2', 'Example Onions', 90, 120, 1), item('i3', 'Example Cumin', 10, 300, 3)];
/** 123 items, none sharing a stock: "Example Item 001" holds 1001 - 7 % 123 ... (any order but the name's). */
const MANY = Array.from({ length: 123 }, (_, index) => {
  const n = index + 1;
  return item(`m${n}`, `Example Item ${String(n).padStart(3, '0')}`, ((n * 37) % 123) + 1, 500 + n, (n % 9) + 1);
});

type Params = { p_customer_id: string | null; p_search_query: string | null; p_limit: number; p_offset: number; p_sort_by?: string; p_sort_order?: string };
type Answer = { data: unknown; error: unknown };
const SORT_KEYS: Record<string, (row: Item) => string | number> = {
  item_name: row => row.item_name,
  total_stock: row => row.total_stock,
  total_qty: row => row.total_qty,
  grn_count: row => row.grn_count,
};

/** What a facility answers for a page of `items`. */
function facility(items: Item[], { sorts }: { sorts: boolean }) {
  return (params: Params): Answer => {
    if (!sorts && ('p_sort_by' in params || 'p_sort_order' in params)) {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_item_wise_stock_list in the schema cache' } };
    }
    const search = params.p_search_query?.toLowerCase();
    const found = items.filter(row => !search || row.item_name.toLowerCase().includes(search));
    const key = SORT_KEYS[sorts ? params.p_sort_by ?? 'item_name' : 'item_name'];
    const sign = sorts && params.p_sort_order === 'desc' ? -1 : 1;
    const ordered = [...found].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sign;
    });
    const page = ordered.slice(params.p_offset, params.p_offset + params.p_limit);
    const summary = { total_stock: 4321, total_qty: 9876, item_count: found.length };
    return { data: { success: true, data: { items: page, total_count: found.length, ...(sorts ? { summary } : {}) } }, error: null };
  };
}

const rpc = jest.fn<Promise<Answer>, [string, Params]>();
const calls = () => rpc.mock.calls.map(([, params]) => params);
/** Answers every call at once from `answer`. */
const serve = (answer: (params: Params) => Answer) => rpc.mockImplementation(async (_name, params) => answer(params));

/** Calls that wait until the test answers them, in the order they were made. */
function holdCalls(answer: (params: Params) => Answer) {
  const held: { params: Params; release: () => void }[] = [];
  rpc.mockImplementation(
    (_name, params) =>
      new Promise<Answer>(resolve => {
        held.push({ params, release: () => resolve(answer(params)) });
      })
  );
  return held;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeStore(theme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' }) {
  return configureStore({
    reducer: {
      auth: (state: unknown = STAFF) => state,
      theme: (state = theme) => state,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
    },
  });
}
type Store = ReturnType<typeof makeStore>;

jest.setTimeout(30_000);

const mounted: TestRenderer.ReactTestRenderer[] = [];
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(() => {
  // Only the calendar is fixed (Monday 12 October 2026, 10:00): the search waits its real 300 ms.
  jest.useFakeTimers({
    now: new Date(2026, 9, 12, 10, 0),
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
  forgetQueries();
  forgetItemSortSupport();
  jest.clearAllMocks();
  mockParams = {};
  resetReportExportAvailability();
  sharePdf.mockResolvedValue({ success: true });
  rpc.mockReset();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

/** Longer than the search field's 300 ms pause. */
const pause = () => new Promise(resolve => setTimeout(resolve, 350));

async function open(store: Store = makeStore()) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<ItemStockSummaryScreen />);
    await settleQueries();
  });
  mounted.push(tree);
  const run = (callback: () => void | Promise<unknown>) =>
    act(async () => {
      await callback();
      await settleQueries();
    });
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const control = (label: string) => {
    const found = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    if (found.length === 0) throw new Error(`No control labelled "${label}"`);
    return found[0];
  };
  const searchField = () => tree.root.findAll(node => typeof node.props.onChangeText === 'function' && node.props.accessibilityLabel === 'Search items')[0];
  return {
    tree,
    texts,
    store,
    control,
    press: (label: string) => run(() => control(label).props.onPress()),
    has: (label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').length > 0,
    bold: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
        .map(node => [node.props.children].flat().join('')),
    /** Item names in the order the rows show them. */
    items: () => tree.root.findAllByType(StockItemCard).map(card => card.props.name as string),
    status: () => texts().find(text => text.includes('Last updated')),
    /** The value of a figure tile, by its label. */
    figure: (label: string) => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(`${label}: `))[0]?.props.accessibilityLabel as string | undefined,
    /** Letters typed one after the other, faster than the field's pause. */
    type: (...steps: string[]) => run(() => steps.forEach(text => searchField().props.onChangeText(text))),
    waitForSearch: () => run(pause),
    endReached: () => run(() => tree.root.findByType('FlashList' as never).props.onEndReached()),
    run,
  };
}

const page0 = (over: Partial<Params> = {}) => ({ p_customer_id: null, p_search_query: null, p_limit: 50, p_offset: 0, p_sort_by: 'item_name', p_sort_order: 'asc', ...over });

// ---------------------------------------------------------------------------

describe('the search (backend with migration 52)', () => {
  it('asks once, after the pause, for what was typed last; an answer to an earlier search that comes late is dropped', async () => {
    const held = holdCalls(facility(FEW, { sorts: true }));
    const screen = await open();
    expect(calls()).toEqual([page0()]);
    await screen.run(() => held[0].release());
    expect(screen.items()).toEqual(['Example Cumin', 'Example Garlic', 'Example Onions']);

    // One letter is not searched for; two are, once the typing pauses.
    await screen.type('g', 'ga');
    expect(rpc).toHaveBeenCalledTimes(1);
    await screen.waitForSearch();
    expect(calls()).toEqual([page0(), page0({ p_search_query: 'ga' })]);

    // Typed again before "ga" was answered: one more call, for "oni" only.
    await screen.type('o', 'on', 'oni');
    await screen.waitForSearch();
    expect(calls()).toEqual([page0(), page0({ p_search_query: 'ga' }), page0({ p_search_query: 'oni' })]);

    await screen.run(() => held[2].release());
    expect(screen.items()).toEqual(['Example Onions']);
    // The answer to "ga" arrives last, and changes nothing.
    await screen.run(() => held[1].release());
    expect(screen.items()).toEqual(['Example Onions']);
    expect(screen.figure('Items')).toBe('Items: 1');
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe('the sort (backend with migration 52)', () => {
  it('asks the server for the order chosen in the sort sheet, and the Stock figure is the server\'s total', async () => {
    serve(facility(FEW, { sorts: true }));
    const screen = await open();
    expect(screen.items()).toEqual(['Example Cumin', 'Example Garlic', 'Example Onions']);
    // The whole list's stock as the server totals it, not the sum of the rows on screen (130).
    expect(screen.figure('Stock')).toBe('Stock: 4,321');

    await screen.press('Sorted by Item, A to Z. Change sort');
    await screen.press('Stock');
    // The field changed and the direction was kept: lowest first.
    expect(calls()[1]).toEqual(page0({ p_sort_by: 'total_stock', p_sort_order: 'asc' }));
    expect(screen.items()).toEqual(['Example Cumin', 'Example Garlic', 'Example Onions']);
    await screen.press('Highest first');
    await screen.press('Done');
    expect(calls()[2]).toEqual(page0({ p_sort_by: 'total_stock', p_sort_order: 'desc' }));
    expect(screen.items()).toEqual(['Example Onions', 'Example Garlic', 'Example Cumin']);

    await screen.press('Sorted by Stock, highest first. Change sort');
    await screen.press('GRNs');
    await screen.press('Done');
    expect(calls()[3]).toEqual(page0({ p_sort_by: 'grn_count', p_sort_order: 'desc' }));
    expect(screen.items()).toEqual(['Example Garlic', 'Example Cumin', 'Example Onions']);
    expect(screen.figure('Stock')).toBe('Stock: 4,321');
    expect(rpc).toHaveBeenCalledTimes(4);
    // Remembered for this facility and account.
    expect(screen.store.getState().reportPrefs.byScope[SCOPE].sort['report-item-stock']).toEqual({ field: 'grn_count', order: 'desc' });
  });
});

describe('a backend without migration 52', () => {
  it('asks again without the sort, sorts the items loaded here, and gives the Stock figure only once every item is loaded', async () => {
    serve(facility(MANY, { sorts: false }));
    const screen = await open();
    // Refused with the sort, asked again without it.
    expect(calls()).toEqual([page0(), { p_customer_id: null, p_search_query: null, p_limit: 50, p_offset: 0 }]);
    expect(screen.items()).toHaveLength(50);
    expect(screen.items().slice(0, 2)).toEqual(['Example Item 001', 'Example Item 002']);
    // 73 items are not loaded: their stock is not known here.
    expect(screen.figure('Stock')).toBe('Stock: —');
    expect(screen.status()).toBe('Showing 50 of 123 · Last updated 10:00 am');

    await screen.press('Sorted by Item, A to Z. Change sort');
    await screen.press('Stock');
    await screen.press('Highest first');
    await screen.press('Done');
    // The facility is known not to sort: no second refused call, and the 50 loaded are sorted here.
    expect(calls().slice(2)).toEqual([
      { p_customer_id: null, p_search_query: null, p_limit: 50, p_offset: 0 },
      { p_customer_id: null, p_search_query: null, p_limit: 50, p_offset: 0 },
    ]);
    const firstFifty = MANY.slice(0, 50).sort((a, b) => b.total_stock - a.total_stock).map(row => row.item_name);
    expect(screen.items()).toEqual(firstFifty);

    await screen.endReached();
    await screen.endReached();
    await screen.endReached();
    expect(calls().slice(4).map(params => params.p_offset)).toEqual([50, 100]);
    expect(calls().slice(4).every(params => !('p_sort_by' in params))).toBe(true);
    expect(screen.items()).toEqual([...MANY].sort((a, b) => b.total_stock - a.total_stock).map(row => row.item_name));
    expect(screen.status()).toBe('Last updated 10:00 am');
    const allStock = MANY.reduce((sum, row) => sum + row.total_stock, 0);
    expect(screen.figure('Stock')).toBe(`Stock: ${allStock.toLocaleString('en-IN')}`);
  });
});

describe('the next page (backend with migration 52)', () => {
  it('is asked for at the end of the list from the next offset, and the status says how many are shown', async () => {
    const held = holdCalls(facility(MANY, { sorts: true }));
    const screen = await open();
    await screen.run(() => held[0].release());
    expect(screen.status()).toBe('Showing 50 of 123 · Last updated 10:00 am');
    expect(screen.texts()).not.toContain('Loading more items');

    await screen.endReached();
    expect(calls()[1]).toEqual(page0({ p_offset: 50 }));
    expect(screen.texts()).toContain('Loading more items');

    await screen.run(() => held[1].release());
    expect(screen.items()).toHaveLength(100);
    expect(screen.items()[50]).toBe('Example Item 051');
    expect(screen.status()).toBe('Showing 100 of 123 · Last updated 10:00 am');
    expect(screen.texts()).not.toContain('Loading more items');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('a search typed while the next page loads takes its place: the footer goes, and the late page is not added', async () => {
    const held = holdCalls(facility([...MANY, item('o1', 'Example Onions', 7, 70, 1)], { sorts: true }));
    const screen = await open();
    await screen.run(() => held[0].release());
    await screen.endReached();
    expect(screen.texts()).toContain('Loading more items');

    await screen.type('oni');
    await screen.waitForSearch();
    expect(calls()[2]).toEqual(page0({ p_search_query: 'oni' }));
    // The page of the list that is gone no longer shows as loading.
    expect(screen.texts()).not.toContain('Loading more items');

    await screen.run(() => held[2].release());
    expect(screen.items()).toEqual(['Example Onions']);
    await screen.run(() => held[1].release());
    expect(screen.items()).toEqual(['Example Onions']);
    expect(screen.texts()).not.toContain('Loading more items');
    expect(screen.texts()).not.toContain('Show more items');
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe('the GRNs of an item', () => {
  const GRN = { id: 'gi-1', grn_id: 'g1', gr_no: '311', customer_name: 'Fictional Traders', date: '2026-10-01', stock: 30, qty: 200 };

  it('shows that they are loading, a failure with "Try again", and the GRNs once they come', async () => {
    serve(facility(FEW, { sorts: true }));
    let answer!: (value: unknown) => void;
    grnItems.mockImplementationOnce(() => new Promise(resolve => (answer = resolve)) as never);
    const screen = await open();
    const card = () => screen.tree.root.findAllByType(StockItemCard).find(found => found.props.name === 'Example Garlic')!;
    await screen.run(() => card().props.onToggle());
    expect(grnItems).toHaveBeenCalledWith({ p_filters: { item_ids: ['i1'], stock_status: 'in_stock' }, p_limit: 100 });
    expect(screen.texts()).toContain('Loading GRNs');

    await screen.run(() => answer({ success: false, message: 'refused' }));
    expect(screen.texts()).toContain("Couldn't load the GRNs for this item.");

    grnItems.mockResolvedValueOnce({ success: true, message: '', data: { items: [GRN] } } as never);
    await screen.run(() => card().props.grns.onRetry());
    expect(grnItems).toHaveBeenCalledTimes(2);
    expect(screen.texts()).toContain('GRN 311');
    expect(screen.texts()).not.toContain("Couldn't load the GRNs for this item.");
  });
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))('in %s %s', (brand, mode) => {
  it('draws the figures, the item cards and the footer in the theme\'s colours', async () => {
    serve(facility(MANY, { sorts: true }));
    const screen = await open(makeStore({ preference: mode, brand }));
    const t = getTokens(brand, mode);
    const backgrounds = screen.tree.root
      .findAll(node => typeof node.type === 'string')
      .map(node => (StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style) ?? {}).backgroundColor);
    expect(backgrounds).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.subtle]));
    expect(screen.texts()).toEqual(expect.arrayContaining(['Item stock summary', 'All customers', 'Example Item 001', 'Show more items']));
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

describe('the report PDF (backend with migration 52)', () => {
  it('every customer: shares the sort on screen as the PDF names it, with no customer and no dates', async () => {
    serve(facility(FEW, { sorts: true }));
    const screen = await open();
    await screen.press('Sorted by Item, A to Z. Change sort');
    await screen.press('Received quantity');
    await screen.press('Highest first');
    await screen.press('Done');
    expect(screen.has('Sorted by Received quantity, highest first. Change sort')).toBe(true);
    await sharesThePdf(screen, { report: 'item-stock-summary', sort: { field: 'received', order: 'desc' } }, 'Item_stock_summary_All.pdf');
  });

  it('one customer: shares that customer and the sort on screen, with no dates', async () => {
    serve(facility(FEW, { sorts: true }));
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const screen = await open();
    expect(calls()).toEqual([page0({ p_customer_id: 'c2' })]);
    await sharesThePdf(
      screen,
      { report: 'item-stock-summary', customer_id: 'c2', sort: { field: 'item', order: 'asc' } },
      'Item_stock_summary_Green_Valley_Traders.pdf'
    );
  });
});

describe('the search words in bold', () => {
  it('gives the item cards the search words, so the matching part of the item name is bold', async () => {
    serve(facility(FEW, { sorts: true }));
    const screen = await open();
    expect(screen.bold()).toEqual([]);
    await screen.type('ga', 'garlic');
    await screen.waitForSearch();
    expect(screen.items()).toEqual(['Example Garlic']);
    const [card] = screen.tree.root.findAllByType(StockItemCard);
    expect(card.props.highlightWords).toEqual(['garlic']);
    expect(screen.bold()).toEqual(['Garlic']);
  });
});
