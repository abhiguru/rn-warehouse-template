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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import { StockItemCard } from '@/components/reports/StockItemCard';
import { getAuthenticatedClient, getSessionIdentity } from '@/config/supabaseConfig';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
import { readReportCache, writeReportCache } from '@/features/reports/reportCache';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { getAllGRNItems, getCustomerGRNItems } from '@/services/grn-service';
import { queryClient } from '@/lib/queryClient';
import { generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { forgetItemSortSupport } from '@/services/stock-service';
import listFilterReducer, { applyListFilters } from '@/store/slices/listFilterSlice';
import { SEARCH_KEY } from '@/features/filters/types';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { showAlert } from '@/utils/alert';
import { alertTexts, pressAlertButton } from '@/tests/helpers/alertMock';
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
// Without a session (the default) nothing is kept on the phone; the tests of the phone's copy sign in.
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } }, forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getCustomerGRNItems: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateReportPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
// askAlert draws through the stand-in showAlert: a dialog the export waits on is answered by pressing its button.
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
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

/**
 * What a facility answers for a page of `items`. The totals of its summary are constant (the count
 * follows the items); `stock` and `qty` say other whole-list totals, for a list whose stock moved.
 */
function facility(items: Item[], { sorts, stock = 4321, qty = 9876 }: { sorts: boolean; stock?: number; qty?: number }) {
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
    const summary = { total_stock: stock, total_qty: qty, item_count: found.length };
    return { data: { success: true, data: { items: page, total_count: found.length, ...(sorts ? { summary } : {}) } }, error: null };
  };
}

const rpc = jest.fn<Promise<Answer>, [string, Params]>();
const calls = () => rpc.mock.calls.map(([, params]) => params);
/** Answers every call at once from `answer`. */
const serve = (answer: (params: Params) => Answer) => rpc.mockImplementation(async (_name, params) => answer(params));

/** Calls that wait until the test answers them, in the order they were made; `release(other)` answers with `other`. */
function holdCalls(answer: (params: Params) => Answer) {
  const held: { params: Params; release: (other?: Answer) => void }[] = [];
  rpc.mockImplementation(
    (_name, params) =>
      new Promise<Answer>(resolve => {
        held.push({ params, release: (other?: Answer) => resolve(other ?? answer(params)) });
      })
  );
  return held;
}
/** A failure that is not a refusal: the facility could not answer. */
const FAILED: Answer = { data: null, error: { code: 'XX000', message: 'fictional internal failure' } };

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
beforeEach(async () => {
  await AsyncStorage.clear();
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
  // A once-answer a failed test left unused must not answer the next test's drill-down.
  grnItems.mockReset();
  jest.mocked(getCustomerGRNItems).mockReset();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.mocked(getSessionIdentity).mockResolvedValue(null);
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
    /** Pull to refresh; the test settles, it does not wait for the answer. */
    refresh: () => run(() => void tree.root.findByType('FlashList' as never).props.refreshControl.props.onRefresh()),
    /** The card of the item named so. */
    card: (name: string) => tree.root.findAllByType(StockItemCard).find(found => found.props.name === name),
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
    // The search runs on the server: while it is answered the field shows a spinner, not its clear button.
    expect(screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Searching').length).toBeGreaterThan(0);
    expect(screen.has('Clear search')).toBe(false);

    // Typed again before "ga" was answered: one more call, for "oni" only.
    await screen.type('o', 'on', 'oni');
    await screen.waitForSearch();
    expect(calls()).toEqual([page0(), page0({ p_search_query: 'ga' }), page0({ p_search_query: 'oni' })]);

    await screen.run(() => held[2].release());
    expect(screen.items()).toEqual(['Example Onions']);
    // The answer to "ga" arrives last, and changes nothing.
    await screen.run(() => held[1].release());
    expect(screen.items()).toEqual(['Example Onions']);
    // Answered: the spinner gives way to the clear button.
    expect(screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Searching')).toHaveLength(0);
    expect(screen.has('Clear search')).toBe(true);
    // The figures cover every item, not the one the search leaves (§14.10), and say so.
    expect(screen.figure('All items')).toBe('All items: 3');
    expect(screen.figure('Items')).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe('the figures with a search typed (backend with migration 52)', () => {
  /** A facility whose totals follow the search, as the real one's do. */
  const totalling = (items: Item[]) => (params: Params): Answer => {
    const answer = facility(items, { sorts: true })(params) as { data: { data: { items: Item[]; total_count: number } } };
    const search = params.p_search_query?.toLowerCase();
    const found = items.filter(row => !search || row.item_name.toLowerCase().includes(search));
    const summary = { total_stock: found.reduce((sum, row) => sum + row.total_stock, 0), total_qty: 0, item_count: found.length };
    return { data: { success: true, data: { ...answer.data.data, summary } }, error: null };
  };

  const figures = (screen: Awaited<ReturnType<typeof open>>) => [screen.figure('All items'), screen.figure('All stock')];

  it('are those of the whole list, from its first page already read, under any sort, and nothing more is asked', async () => {
    serve(totalling(FEW));
    const screen = await open();
    expect([screen.figure('Items'), screen.figure('Stock')]).toEqual(['Items: 3', 'Stock: 130']);

    await screen.type('oni');
    await screen.waitForSearch();
    expect(screen.items()).toEqual(['Example Onions']);
    // A broken screen would show the searched list's figures: Items 1, Stock 90.
    expect(figures(screen)).toEqual(['All items: 3', 'All stock: 130']);
    expect(calls()).toEqual([page0(), page0({ p_search_query: 'oni' })]);

    // Sorted otherwise with the search still typed: the whole list read under the other sort still counts.
    await screen.press('Sorted by Item, A to Z. Change sort');
    await screen.press('Stock');
    await screen.press('Done');
    expect(calls()).toEqual([page0(), page0({ p_search_query: 'oni' }), page0({ p_search_query: 'oni', p_sort_by: 'total_stock' })]);
    // A broken screen falls back to the searched figures here: Items 1, Stock 90.
    expect(figures(screen)).toEqual(['All items: 3', 'All stock: 130']);
    expect([screen.figure('Items'), screen.figure('Stock')]).toEqual([undefined, undefined]);
  });

  it('with a search kept from before the screen opened, the whole list is asked for once, after the searched one', async () => {
    serve(totalling(FEW));
    const store = makeStore();
    store.dispatch(applyListFilters({ key: 'report-item-stock', values: { [SEARCH_KEY]: 'oni' } }));
    const screen = await open(store);
    expect(screen.items()).toEqual(['Example Onions']);
    // A broken screen asks for the searched list alone and shows Items 1, Stock 90.
    expect(calls()).toEqual([page0({ p_search_query: 'oni' }), page0()]);
    expect(figures(screen)).toEqual(['All items: 3', 'All stock: 130']);

    // Sorted otherwise: the whole list already read stands; it is not asked for again.
    await screen.press('Sorted by Item, A to Z. Change sort');
    await screen.press('Stock');
    await screen.press('Done');
    expect(calls()).toEqual([page0({ p_search_query: 'oni' }), page0(), page0({ p_search_query: 'oni', p_sort_by: 'total_stock' })]);
    expect(figures(screen)).toEqual(['All items: 3', 'All stock: 130']);
  });

  it('say when the figures were read, not when the search was answered, until a pull to refresh reads them again', async () => {
    let stock = 130;
    serve(params => {
      const answer = totalling(FEW)(params) as { data: { data: { summary: { total_stock: number } } } };
      if (!params.p_search_query) answer.data.data.summary.total_stock = stock;
      return answer as Answer;
    });
    const screen = await open();
    expect(screen.status()).toBe('Last updated 10:00 am');

    jest.setSystemTime(new Date(2026, 9, 12, 10, 5));
    stock = 140;
    await screen.type('oni');
    await screen.waitForSearch();
    expect(screen.items()).toEqual(['Example Onions']);
    // The figures are the ones read at 10:00. A broken screen says 10:05, as if they had been read again.
    expect(screen.status()).toBe('Last updated 10:00 am');
    expect(figures(screen)).toEqual(['All items: 3', 'All stock: 130']);

    await screen.refresh();
    await screen.run(() => undefined);
    // The pull reads the searched list and the whole list again.
    expect(calls().slice(2)).toEqual([page0({ p_search_query: 'oni' }), page0()]);
    expect(screen.status()).toBe('Last updated 10:05 am');
    expect(figures(screen)).toEqual(['All items: 3', 'All stock: 140']);
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
    // In name order the server's own order holds for the whole list: no note. No PDF on this backend.
    expect(screen.texts().filter(text => text.startsWith('Sorted among'))).toEqual([]);
    expect(screen.has('Share PDF')).toBe(false);

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
    expect(screen.texts()).toContain('Sorted among the 50 items loaded');

    await screen.endReached();
    await screen.endReached();
    await screen.endReached();
    expect(calls().slice(4).map(params => params.p_offset)).toEqual([50, 100]);
    expect(screen.texts().filter(text => text.startsWith('Sorted among'))).toEqual([]);
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

  it('adds every page of a list that did not change, page after page, and asks for nothing else', async () => {
    serve(facility(MANY, { sorts: true }));
    const screen = await open();
    await screen.endReached();
    await screen.endReached();
    expect(calls().map(params => params.p_offset)).toEqual([0, 50, 100]);
    expect(screen.items()).toEqual(MANY.map(row => row.item_name));
    expect(screen.status()).toBe('Last updated 10:00 am');
    await screen.run(() => undefined);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  describe('when the list changed between two pages', () => {
    const offsets = () => calls().map(params => params.p_offset);

    it('an item that left the list: page two is not added, page one is read again and has the live item 051 in place of the removed 025', async () => {
      // The reviewer's reproduction: page one is items 001 to 050 of 100; item 025 is removed before page two.
      let dataset = MANY.slice(0, 100);
      serve(params => facility(dataset, { sorts: true })(params));
      const screen = await open();
      expect(screen.items()).toHaveLength(50);
      expect(screen.items()).toContain('Example Item 025');
      expect(screen.items()).not.toContain('Example Item 051');
      expect(screen.status()).toBe('Showing 50 of 100 · Last updated 10:00 am');

      dataset = dataset.filter(row => row.item_id !== 'm25');
      await screen.endReached();
      await screen.run(() => undefined);
      // Page two (offset 50) said 99 items against page one's 100: it was not added, page one was asked for again.
      // A broken screen adds it: 99 rows with 051 missing and 025 kept (offsets 0, 50 and nothing more).
      expect(offsets()).toEqual([0, 50, 0]);
      expect(screen.items()).toHaveLength(50);
      expect(screen.items()).toContain('Example Item 051');
      expect(screen.items()).not.toContain('Example Item 025');
      expect(screen.status()).toBe('Showing 50 of 99 · Last updated 10:00 am');
      expect(screen.texts()).not.toContain('Loading more items');

      // The next scroll to the end asks for page two of the list as it is now, and nothing is missing or twice.
      await screen.endReached();
      expect(offsets()).toEqual([0, 50, 0, 50]);
      expect(screen.items()).toEqual(dataset.map(row => row.item_name));
      expect(screen.status()).toBe('Last updated 10:00 am');
    });

    it('the count the same but the Stock figure moved: page two is not added either, and the new Stock shows', async () => {
      let stock = 4321;
      serve(params => facility(MANY.slice(0, 100), { sorts: true, stock })(params));
      const screen = await open();
      expect(screen.figure('Stock')).toBe('Stock: 4,321');

      stock = 4000;
      await screen.endReached();
      await screen.run(() => undefined);
      // A broken screen adds page two (100 rows, offsets 0 and 50) and still says 4,321.
      expect(offsets()).toEqual([0, 50, 0]);
      expect(screen.items()).toHaveLength(50);
      expect(screen.figure('Stock')).toBe('Stock: 4,000');

      await screen.endReached();
      expect(offsets()).toEqual([0, 50, 0, 50]);
      expect(screen.items()).toEqual(MANY.slice(0, 100).map(row => row.item_name));
    });

    it('the Total quantity moved with the count and the Stock the same: page two is not added', async () => {
      let qty = 9876;
      serve(params => facility(MANY.slice(0, 100), { sorts: true, qty })(params));
      const screen = await open();
      qty = 9000;
      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0]);
      expect(screen.items()).toHaveLength(50);
    });

    it('a server without migration 52 has no summary: the count alone says it changed, and an equal count adds the page', async () => {
      let dataset = MANY.slice(0, 100);
      serve(params => facility(dataset, { sorts: false })(params));
      const screen = await open();
      // The sort is refused once (offset 0 twice); the offsets of the calls that carry no sort are the pages.
      const pages = () => calls().filter(params => !('p_sort_by' in params)).map(params => params.p_offset);
      expect(pages()).toEqual([0]);

      dataset = dataset.filter(row => row.item_id !== 'm25');
      await screen.endReached();
      await screen.run(() => undefined);
      expect(pages()).toEqual([0, 50, 0]);
      expect(screen.items()).toHaveLength(50);
      expect(screen.items()).toContain('Example Item 051');

      // Nothing changes now: the equal count is no sign of a change, and page two is added.
      await screen.endReached();
      expect(pages()).toEqual([0, 50, 0, 50]);
      expect(screen.items()).toEqual(dataset.map(row => row.item_name));
    });

    it('starts over twice at most for one list: the third change in a row is added, and nothing is asked for again', async () => {
      // Every time page two is asked for, the stock has moved once more since page one.
      let stock = 4000;
      serve(params => {
        if (params.p_offset > 0) stock += 1;
        return facility(MANY.slice(0, 100), { sorts: true, stock })(params);
      });
      const screen = await open();
      expect(screen.figure('Stock')).toBe('Stock: 4,000');

      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0]);
      expect(screen.items()).toHaveLength(50);
      expect(screen.figure('Stock')).toBe('Stock: 4,001');

      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0, 50, 0]);
      expect(screen.items()).toHaveLength(50);
      expect(screen.figure('Stock')).toBe('Stock: 4,002');

      // The third time the page differs from page one again (4,003 against 4,002): it is added all the same.
      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0, 50, 0, 50]);
      expect(screen.items()).toEqual(MANY.slice(0, 100).map(row => row.item_name));
      expect(screen.status()).toBe('Last updated 10:00 am');
      expect(rpc).toHaveBeenCalledTimes(6);
    });

    it('a pull to refresh gives the list its two restarts again', async () => {
      let stock = 4000;
      serve(params => {
        if (params.p_offset > 0) stock += 1;
        return facility(MANY.slice(0, 100), { sorts: true, stock })(params);
      });
      const screen = await open();
      await screen.endReached();
      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0, 50, 0]);

      await screen.refresh();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0, 50, 0, 0]);
      // Two restarts are allowed again: the page that differs is not added, the first page is asked for again.
      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0, 50, 0, 0, 50, 0]);
      expect(screen.items()).toHaveLength(50);
    });

    it('the restarts are counted again after a page that fits is added', async () => {
      let stock = 4000;
      serve(params => facility(MANY, { sorts: true, stock })(params));
      const screen = await open();
      stock = 4001;
      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0]);

      // Nothing moves now: page two fits the new page one and is added.
      await screen.endReached();
      expect(offsets()).toEqual([0, 50, 0, 50]);
      expect(screen.items()).toHaveLength(100);

      // Page three finds the stock moved again: it is not added, though a restart has been made already.
      stock = 4002;
      await screen.endReached();
      await screen.run(() => undefined);
      expect(offsets()).toEqual([0, 50, 0, 50, 100, 0]);
      expect(screen.items()).toHaveLength(50);
    });

    it('when the first page cannot be read again, the footer does not stay on "loading", and the pages on screen stay', async () => {
      let dataset = MANY.slice(0, 100);
      const held = holdCalls(params => facility(dataset, { sorts: true })(params));
      const screen = await open();
      await screen.run(() => held[0].release());
      dataset = dataset.filter(row => row.item_id !== 'm25');
      await screen.endReached();
      expect(screen.texts()).toContain('Loading more items');

      await screen.run(() => held[1].release());
      // Page two said the list changed: page one is being asked for again, and nothing waits for page two.
      expect(offsets()).toEqual([0, 50, 0]);
      expect(screen.texts()).not.toContain('Loading more items');

      await screen.run(() => held[2].release(FAILED));
      expect(screen.texts()).not.toContain('Loading more items');
      expect(screen.texts()).toContain("Couldn't update. These figures were loaded earlier.");
      // The page one that was read stays, and page two can be asked for again.
      expect(screen.items()).toHaveLength(50);
      expect(screen.texts()).toContain('Show more items');
    });
  });
});

describe('a pull to refresh with later pages loaded (backend with migration 52)', () => {
  it('keeps the later pages until the new first page has come, asks for no next page meanwhile, and starts over from it', async () => {
    const held = holdCalls(facility(MANY, { sorts: true }));
    const screen = await open();
    await screen.run(() => held[0].release());
    await screen.endReached();
    await screen.run(() => held[1].release());
    expect(screen.items()).toHaveLength(100);

    await screen.refresh();
    expect(calls()[2]).toEqual(page0());
    // A broken screen empties the list to 50 at once.
    expect(screen.items()).toHaveLength(100);
    // The first page is being asked for again: no next page is asked against it.
    await screen.endReached();
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(screen.texts()).not.toContain('Show more items');

    await screen.run(() => held[2].release());
    expect(screen.items()).toHaveLength(50);
    expect(screen.status()).toBe('Showing 50 of 123 · Last updated 10:00 am');
    await screen.endReached();
    expect(calls()[3]).toEqual(page0({ p_offset: 50 }));
    // Nothing left out: a request still out at the end would hold Jest open.
    await screen.run(() => held[3].release());
  });

  it('keeps every page loaded when the refresh fails, and says the figures are not current', async () => {
    const held = holdCalls(facility(MANY, { sorts: true }));
    const screen = await open();
    await screen.run(() => held[0].release());
    await screen.endReached();
    await screen.run(() => held[1].release());
    expect(screen.items()).toHaveLength(100);

    await screen.refresh();
    await screen.run(() => held[2].release(FAILED));
    expect(screen.items()).toHaveLength(100);
    expect(screen.texts()).toEqual(
      expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", "Couldn't load items. Check your connection and try again."])
    );
    // The developer text of the server's failure is not shown.
    expect(screen.texts().some(text => text.includes('fictional internal failure'))).toBe(false);
    // The pages on screen came from the facility in this run: the next one may still be asked for.
    await screen.endReached();
    expect(calls()[3]).toEqual(page0({ p_offset: 100 }));
    await screen.run(() => held[3].release());
  });
});

describe('the first page answered again without a pull (backend with migration 52)', () => {
  // As a return to the screen or a saved document asks it again: the first page alone, not the later ones.
  const FIRST = ['report', 'item-stock-summary', 'customers', '', 'item_name', 'asc', 0];
  const askFirstAgain = () => queryClient.refetchQueries({ queryKey: FIRST, exact: true });
  const offsets = () => calls().map(params => params.p_offset);

  it('drops the later pages when the first page came back different: the next page is asked from offset 50', async () => {
    let stock = 4321;
    serve(params => facility(MANY, { sorts: true, stock })(params));
    const screen = await open();
    await screen.endReached();
    expect(screen.items()).toHaveLength(100);

    stock = 4000;
    await screen.run(askFirstAgain);
    expect(offsets()).toEqual([0, 50, 0]);
    // A broken screen keeps the 100 rows built on the old first page and next asks for offset 100.
    expect(screen.items()).toHaveLength(50);
    expect(screen.figure('Stock')).toBe('Stock: 4,000');
    await screen.endReached();
    expect(offsets()).toEqual([0, 50, 0, 50]);
    expect(screen.items()).toEqual(MANY.slice(0, 100).map(row => row.item_name));
  });

  it('keeps the later pages when the first page came back the same: the next page is asked from offset 100', async () => {
    serve(facility(MANY, { sorts: true }));
    const screen = await open();
    await screen.endReached();
    expect(screen.items()).toHaveLength(100);

    await screen.run(askFirstAgain);
    expect(offsets()).toEqual([0, 50, 0]);
    expect(screen.items()).toHaveLength(100);
    await screen.endReached();
    expect(offsets()).toEqual([0, 50, 0, 100]);
    expect(screen.items()).toEqual(MANY.map(row => row.item_name));
  });
});

describe('the copy kept on the phone (backend with migration 52)', () => {
  const account = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
  const FIRST_KEY = ['item-stock-summary', 'customers', '', 'item_name', 'asc', 0];

  it('asks for no next page against the first page kept on the phone, only once the facility has given it', async () => {
    jest.mocked(getSessionIdentity).mockResolvedValue(account);
    const keptPage = {
      items: MANY.slice(0, 50),
      pagination: { totalCount: 123, hasMore: true, limit: 50, offset: 0 },
      summary: { total_stock: 4321, total_qty: 9876, item_count: 123 },
      sortApplied: true,
    };
    await writeReportCache(FIRST_KEY, { data: keptPage, updatedAt: new Date(2026, 9, 12, 8, 0).getTime() });
    const held = holdCalls(facility(MANY, { sorts: true }));
    const screen = await open();
    await screen.run(() => undefined);
    // The phone's copy is on screen while the facility is asked.
    expect(screen.items()).toHaveLength(50);
    expect(screen.status()).toBe('Showing 50 of 123 · Saved copy, refreshing… · Last updated 8:00 am');
    await screen.endReached();
    // A broken screen asks for offset 50 here, against a first page that may have changed.
    expect(calls()).toEqual([page0()]);
    expect(screen.texts()).not.toContain('Show more items');

    await screen.run(() => held[0].release());
    expect(screen.status()).toBe('Showing 50 of 123 · Last updated 10:00 am');
    await screen.endReached();
    expect(calls()).toEqual([page0(), page0({ p_offset: 50 })]);
    await screen.run(() => held[1].release());
  });

  it('keeps only the first page without a search: no later page and no searched list is written', async () => {
    jest.mocked(getSessionIdentity).mockResolvedValue(account);
    serve(facility(MANY, { sorts: true }));
    const screen = await open();
    await screen.endReached();
    expect(screen.items()).toHaveLength(100);
    await screen.type('item 01');
    await screen.waitForSearch();
    expect(screen.items()).toHaveLength(10);
    await screen.run(() => undefined);
    expect(calls().map(params => [params.p_search_query, params.p_offset])).toEqual([[null, 0], [null, 50], ['item 01', 0]]);

    expect(await readReportCache(FIRST_KEY)).not.toBeNull();
    expect(await readReportCache(['item-stock-summary', 'customers', '', 'item_name', 'asc', 50])).toBeNull();
    expect(await readReportCache(['item-stock-summary', 'customers', 'item 01', 'item_name', 'asc', 0])).toBeNull();
    const index = JSON.parse((await AsyncStorage.getItem(`${CACHE_PREFIXES.REPORT}_index`)) ?? '[]') as unknown[];
    expect(index).toHaveLength(1);
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

  it('a GRN line gives the weight of one bag as "50 kg each" after its rack; a line without a weight gives none', async () => {
    serve(facility(FEW, { sorts: true }));
    // get_all_grn_items sends the line's own weight (grt.weight): kg for one bag, not for the 200 received.
    grnItems.mockResolvedValueOnce({
      success: true,
      message: '',
      data: {
        items: [
          { ...GRN, rack: 'B-14', weight: 50 },
          { ...GRN, id: 'gi-2', grn_id: 'g2', gr_no: '312', rack: 'C-02', weight: 0 },
          { ...GRN, id: 'gi-3', grn_id: 'g3', gr_no: '313', rack: 'D-07', weight: null },
        ],
      },
    } as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    expect(screen.texts()).toEqual(expect.arrayContaining(['GRN 311', 'Rack B-14 · 50 kg each', 'GRN 312', 'Rack C-02', 'GRN 313', 'Rack D-07']));
    // The one weight on the screen, worded "each": no bare "50 kg", no "0 kg", and no total (200 bags × 50 kg).
    expect(screen.texts().filter(text => /kg/.test(text))).toEqual(['Rack B-14 · 50 kg each']);
    expect(screen.has('GRN 311, Fictional Traders, Received 1 Oct 2026, Rack B-14 · 50 kg each, 30 of 200 in stock')).toBe(true);
    expect(screen.has('GRN 312, Fictional Traders, Received 1 Oct 2026, Rack C-02, 30 of 200 in stock')).toBe(true);
  });

  /**
   * The GRN lines of an item as the drill-down answers: `count` rows from `offset`, `total` in all
   * (no pagination at all when `total` is left out); `has_more` as the server says it, by default
   * whether lines remain after these.
   */
  const grnPage = (count: number, total?: number, { offset = 0, hasMore }: { offset?: number; hasMore?: boolean } = {}) => ({
    success: true,
    message: '',
    data: {
      items: Array.from({ length: count }, (_, index) => ({
        ...GRN,
        id: `gi-${offset + index}`,
        grn_id: `g${offset + index}`,
        gr_no: String(400 + offset + index),
      })),
      ...(total === undefined ? {} : { pagination: { total_count: total, limit: 100, offset, has_more: hasMore ?? offset + count < total } }),
    },
  });
  const footnotes = (screen: Awaited<ReturnType<typeof open>>) => screen.texts().filter(text => text.startsWith('Showing') && !text.includes('Last updated'));
  /** What the drill-down asks for the item `itemId`: the first 100 lines, or 100 from `offset`. */
  const drillDown = (itemId: string, offset = 0) => ({
    p_filters: { item_ids: [itemId], stock_status: 'in_stock' },
    p_limit: 100,
    ...(offset > 0 ? { p_offset: offset } : {}),
  });
  const MORE = 'Show more GRN lines';

  it('reads every GRN line of an item, 100 at a time: "Show more GRN lines" asks from where the lines end', async () => {
    serve(facility(FEW, { sorts: true }));
    grnItems.mockResolvedValueOnce(grnPage(100, 240) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    expect(grnItems).toHaveBeenLastCalledWith(drillDown('i1'));
    expect(screen.card('Example Garlic')!.props.grns.rows).toHaveLength(100);
    expect(footnotes(screen)).toEqual(['Showing 100 of 240 GRN lines']);
    // A broken screen stops here: the note, and no way to the other 140 lines.
    expect(screen.has(MORE)).toBe(true);

    grnItems.mockResolvedValueOnce(grnPage(100, 240, { offset: 100 }) as never);
    await screen.press(MORE);
    expect(grnItems).toHaveBeenLastCalledWith(drillDown('i1', 100));
    const rows = () => screen.card('Example Garlic')!.props.grns.rows as { key: string; grNo: string }[];
    expect(rows()).toHaveLength(200);
    expect(rows()[100].grNo).toBe('500');
    expect(footnotes(screen)).toEqual(['Showing 200 of 240 GRN lines']);

    grnItems.mockResolvedValueOnce(grnPage(40, 240, { offset: 200 }) as never);
    await screen.press(MORE);
    expect(grnItems).toHaveBeenLastCalledWith(drillDown('i1', 200));
    expect(rows()).toHaveLength(240);
    expect(new Set(rows().map(row => row.key)).size).toBe(240);
    // Every line read: no note, nothing more to show.
    expect(footnotes(screen)).toEqual([]);
    expect(screen.has(MORE)).toBe(false);
    expect(grnItems).toHaveBeenCalledTimes(3);
  });

  it('every line read at once (3 of 3): no note and nothing more to show', async () => {
    serve(facility(FEW, { sorts: true }));
    grnItems.mockResolvedValueOnce(grnPage(3, 3) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Onions')!.props.onToggle());
    expect(screen.card('Example Onions')!.props.grns.rows).toHaveLength(3);
    expect(screen.card('Example Onions')!.props.grnsFooter).toBeUndefined();
    expect(footnotes(screen)).toEqual([]);
    expect(screen.has(MORE)).toBe(false);
  });

  it("without a total in the answer: a page shorter than 100 is the end (the item's GRN count is not taken for a line count)", async () => {
    serve(facility(FEW, { sorts: true }));
    grnItems.mockResolvedValueOnce(grnPage(2) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Cumin')!.props.onToggle());
    // Cumin has 3 GRNs. A broken screen says "Showing 2 of 3", counting GRNs against lines.
    expect(footnotes(screen)).toEqual([]);
    expect(screen.has(MORE)).toBe(false);
  });

  it('without a total in the answer: a full page says how many lines are shown and offers more until a page is short', async () => {
    serve(facility(FEW, { sorts: true }));
    grnItems.mockResolvedValueOnce(grnPage(100) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    expect(footnotes(screen)).toEqual(['Showing 100 GRN lines']);
    expect(screen.has(MORE)).toBe(true);

    grnItems.mockResolvedValueOnce(grnPage(30, undefined, { offset: 100 }) as never);
    await screen.press(MORE);
    expect(grnItems).toHaveBeenLastCalledWith(drillDown('i1', 100));
    expect(screen.card('Example Garlic')!.props.grns.rows).toHaveLength(130);
    expect(footnotes(screen)).toEqual([]);
    expect(screen.has(MORE)).toBe(false);
  });

  it('a failure to read more keeps the lines read and offers "Try again", which asks from the same place', async () => {
    serve(facility(FEW, { sorts: true }));
    grnItems.mockResolvedValueOnce(grnPage(100, 240) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());

    let answer!: (value: unknown) => void;
    grnItems.mockImplementationOnce(() => new Promise(resolve => (answer = resolve)) as never);
    await screen.press(MORE);
    expect(screen.texts()).toContain('Loading more GRN lines');
    expect(screen.has(MORE)).toBe(false);
    await screen.run(() => answer({ success: false, message: 'fictional failure' }));
    expect(screen.card('Example Garlic')!.props.grns.rows).toHaveLength(100);
    expect(screen.texts()).toContain("Couldn't load more GRN lines.");
    expect(screen.texts()).not.toContain("Couldn't load the GRNs for this item.");
    expect(footnotes(screen)).toEqual(['Showing 100 of 240 GRN lines']);

    grnItems.mockResolvedValueOnce(grnPage(100, 240, { offset: 100 }) as never);
    await screen.press('Try again');
    expect(grnItems).toHaveBeenLastCalledWith(drillDown('i1', 100));
    expect(screen.card('Example Garlic')!.props.grns.rows).toHaveLength(200);
    expect(screen.texts()).not.toContain("Couldn't load more GRN lines.");
    expect(footnotes(screen)).toEqual(['Showing 200 of 240 GRN lines']);
  });

  it("one customer: follows the server's has_more, not the size of the page, and asks that customer's lines", async () => {
    serve(facility(FEW, { sorts: true }));
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const customerGrnItems = jest.mocked(getCustomerGRNItems);
    customerGrnItems.mockResolvedValueOnce(grnPage(100, 100, { hasMore: false }) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    expect(customerGrnItems).toHaveBeenLastCalledWith('c2', drillDown('i1'));
    // A full page that the server says is the last: nothing more.
    expect(screen.has(MORE)).toBe(false);
    expect(footnotes(screen)).toEqual([]);

    customerGrnItems.mockResolvedValueOnce(grnPage(100, 150) as never);
    await screen.run(() => screen.card('Example Onions')!.props.onToggle());
    expect(footnotes(screen)).toEqual(['Showing 100 of 150 GRN lines']);
    customerGrnItems.mockResolvedValueOnce(grnPage(50, 150, { offset: 100 }) as never);
    await screen.press(MORE);
    expect(customerGrnItems).toHaveBeenLastCalledWith('c2', drillDown('i2', 100));
    expect(screen.card('Example Onions')!.props.grns.rows).toHaveLength(150);
    expect(screen.has(MORE)).toBe(false);
    expect(grnItems).not.toHaveBeenCalled();
  });

  it('more lines that answer after the search has changed are not added anywhere', async () => {
    serve(facility(FEW, { sorts: true }));
    grnItems.mockResolvedValueOnce(grnPage(100, 240) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    let answer!: (value: unknown) => void;
    grnItems.mockImplementationOnce(() => new Promise(resolve => (answer = resolve)) as never);
    await screen.press(MORE);

    await screen.type('ga');
    await screen.waitForSearch();
    expect(screen.items()).toEqual(['Example Garlic']);
    // The search closed the card; opened again, its lines are read from the start.
    expect(screen.card('Example Garlic')!.props.isExpanded).toBe(false);
    grnItems.mockResolvedValueOnce(grnPage(100, 240) as never);
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    expect(grnItems).toHaveBeenLastCalledWith(drillDown('i1'));

    // The lines asked for before the search answer now. A broken screen adds them: 200 rows.
    await screen.run(() => answer(grnPage(100, 240, { offset: 100 })));
    expect(screen.card('Example Garlic')!.props.grns.rows).toHaveLength(100);
    expect(footnotes(screen)).toEqual(['Showing 100 of 240 GRN lines']);
    expect(screen.has(MORE)).toBe(true);
  });

  it('a late answer for a search that has gone leaves the cards opened since alone', async () => {
    serve(facility(FEW, { sorts: true }));
    let answerGarlic!: (value: unknown) => void;
    grnItems.mockImplementationOnce(() => new Promise(resolve => (answerGarlic = resolve)) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    expect(screen.card('Example Garlic')!.props.isExpanded).toBe(true);

    await screen.type('oni');
    await screen.waitForSearch();
    expect(screen.items()).toEqual(['Example Onions']);
    grnItems.mockResolvedValueOnce({ success: true, message: '', data: { items: [{ ...GRN, gr_no: '312' }] } } as never);
    await screen.run(() => screen.card('Example Onions')!.props.onToggle());
    expect(screen.card('Example Onions')!.props.isExpanded).toBe(true);
    expect(screen.texts()).toContain('GRN 312');

    // Garlic's GRNs answer now, for the search before. A broken screen closes Onions here.
    await screen.run(() => answerGarlic({ success: true, message: '', data: { items: [GRN] } }));
    expect(screen.card('Example Onions')!.props.isExpanded).toBe(true);
    expect(screen.texts()).toContain('GRN 312');
    expect(screen.texts()).not.toContain('GRN 311');
  });

  it('a late answer from before a pull to refresh leaves the cards opened since alone', async () => {
    serve(facility(FEW, { sorts: true }));
    let answerGarlic!: (value: unknown) => void;
    grnItems.mockImplementationOnce(() => new Promise(resolve => (answerGarlic = resolve)) as never);
    const screen = await open();
    await screen.run(() => screen.card('Example Garlic')!.props.onToggle());
    await screen.refresh();
    // The refresh closed the cards.
    expect(screen.card('Example Garlic')!.props.isExpanded).toBe(false);
    grnItems.mockResolvedValueOnce({ success: true, message: '', data: { items: [{ ...GRN, gr_no: '312' }] } } as never);
    await screen.run(() => screen.card('Example Onions')!.props.onToggle());
    expect(screen.card('Example Onions')!.props.isExpanded).toBe(true);

    await screen.run(() => answerGarlic({ success: true, message: '', data: { items: [GRN] } }));
    expect(screen.card('Example Onions')!.props.isExpanded).toBe(true);
    expect(screen.card('Example Garlic')!.props.isExpanded).toBe(false);
    expect(screen.texts()).toContain('GRN 312');
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
    await sharesThePdf(screen, { report: 'item-stock-summary', sort: { field: 'received', order: 'desc' } }, 'Item_stock_summary_All_customers.pdf');
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

describe('the report PDF of the list on screen (backend with migration 52)', () => {
  const ALL = { report: 'item-stock-summary', sort: { field: 'item', order: 'asc' } };
  const FILE = 'Item_stock_summary_All_customers.pdf';
  const answerDialog = (text: string) =>
    act(async () => {
      pressAlertButton(alert, text);
      await settleQueries();
    });

  it('sends the search as the server searched the rows, and asks nothing', async () => {
    serve(facility(FEW, { sorts: true }));
    makePdf.mockResolvedValue({ success: true, pdfUrl: PDF_URL });
    const screen = await open();
    await screen.type('oni');
    await screen.waitForSearch();
    expect(screen.items()).toEqual(['Example Onions']);
    await screen.press('Share PDF');
    // A broken screen leaves the search out: the PDF lists all three items.
    expect(makePdf.mock.calls).toEqual([[{ ...ALL, search: 'oni' }]]);
    expect(alert).not.toHaveBeenCalled();
    expect(sharePdf.mock.calls).toEqual([[PDF_URL, FILE]]);

    // One customer: the same, with the customer.
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    makePdf.mockClear();
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const one = await open();
    await one.type('gar');
    await one.waitForSearch();
    await one.press('Share PDF');
    expect(makePdf.mock.calls).toEqual([[{ report: 'item-stock-summary', customer_id: 'c2', sort: { field: 'item', order: 'asc' }, search: 'gar' }]]);
    expect(alert).not.toHaveBeenCalled();
  });

  it('a search longer than a PDF can carry (81 characters) is said first, and the PDF is of every item', async () => {
    const long = `Example ${'x'.repeat(73)}`;
    expect(long).toHaveLength(81);
    serve(facility([...FEW, item('i9', long, 5, 50, 1)], { sorts: true }));
    makePdf.mockResolvedValue({ success: true, pdfUrl: PDF_URL });
    const screen = await open();
    await screen.type(long);
    await screen.waitForSearch();
    expect(screen.items()).toEqual([long]);
    await screen.press('Share PDF');
    expect(alertTexts(alert)).toEqual([
      ['Share the full report?', `The PDF will include all the stock, not only the 1 matching "Example ${'x'.repeat(32)}…".`],
    ]);
    expect(makePdf).not.toHaveBeenCalled();
    await answerDialog('Share full report');
    expect(makePdf.mock.calls).toEqual([[ALL]]);
  });

  it('a server that cannot search the PDF yet: asks before sharing every item, and asks for it without the search', async () => {
    serve(facility(FEW, { sorts: true }));
    makePdf
      .mockResolvedValueOnce({ success: false, reason: 'filter-unsupported', error: 'fictional refusal' })
      .mockResolvedValueOnce({ success: true, pdfUrl: PDF_URL });
    const screen = await open();
    await screen.type('oni');
    await screen.waitForSearch();
    await screen.press('Share PDF');
    expect(makePdf.mock.calls).toEqual([[{ ...ALL, search: 'oni' }]]);
    expect(alertTexts(alert)).toEqual([
      [
        'Share the full report?',
        "This facility's server can't apply your filter or search to the PDF yet. You can share the full report, or cancel and ask for a server update.",
      ],
    ]);
    // Nothing is shared until the person agrees.
    expect(sharePdf).not.toHaveBeenCalled();
    await answerDialog('Share full report');
    expect(makePdf.mock.calls[1]).toEqual([ALL]);
    expect(sharePdf.mock.calls).toEqual([[PDF_URL, FILE]]);
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
