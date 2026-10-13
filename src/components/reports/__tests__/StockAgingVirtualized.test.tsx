/**
 * P2F-UI-2: an opened item of one customer's stock aging must not draw all its
 * lots inside one list cell. Each lot line is a row of the report's FlashList
 * of its own (type "line", a key under its item's key), so the list mounts only
 * the rows on screen however many lots one item has.
 *
 * FlashList is the test stand-in, which hands every row to `renderItem`: the
 * test reads the rows the list is given and draws each cell on its own to count
 * the lot lines inside it. On the old screen the item is one row whose cell
 * holds all 500 lines.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { getCustomerStockAging } from '@/services/reporting/stock-aging-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { fontWeight } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import StockAgingScreen from '../../../../app/reports/stock-aging';

const mockRouterPush = jest.fn();
let mockStore: Store;
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
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ customerId: 'c2', customerName: 'Green Valley Traders' }),
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

const customerAging = jest.mocked(getCustomerStockAging);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// One item on 500 lots (GRNs A0001 to A0500), 2 units each: 1,000 units. A0001 is the
// oldest (600 days) and each later GRN a day younger, so the lots are listed A0001 first.
const LOTS = 500;
const grnNumber = (index: number) => `A${String(index + 1).padStart(4, '0')}`;
const bucketOf = (age: number) => (age > 364 ? '364+' : age > 240 ? '241-364' : age > 120 ? '121-240' : '0-120');
const LINES = Array.from({ length: LOTS }, (_, index) => ({
  grn_id: `g${index + 1}`,
  gr_no: grnNumber(index),
  item_name: 'Example Garlic',
  packaging: 'Bag',
  current_stock: 2,
  original_qty: 10,
  weight: 0,
  rack: '',
  package_mark: '',
  grn_date: '2025-02-20',
  aging_days: 600 - index,
  aging_bucket: bucketOf(600 - index),
  dispatch_info: null,
}));
const ANSWER = {
  success: true,
  message: '',
  data: {
    summary: {
      total_items: LOTS, total_quantity: LOTS * 2, total_weight_kg: 0, oldest_stock_days: 600, average_age_days: 350,
      items_over_365_days: 236, qty_over_365_days: 472, avg_dispatch_velocity_days: null, items_no_recent_dispatch: 0,
    },
    by_bucket: {
      '0-120': { item_count: 20, total_quantity: 40, total_weight: 0, percentage: 4 },
      '121-240': { item_count: 120, total_quantity: 240, total_weight: 0, percentage: 24 },
      '241-364': { item_count: 124, total_quantity: 248, total_weight: 0, percentage: 24.8 },
      '364+': { item_count: 236, total_quantity: 472, total_weight: 0, percentage: 47.2 },
    },
    items: LINES,
  },
};

function makeStore() {
  return configureStore({
    reducer: {
      auth: (state: unknown = STAFF) => state,
      theme: (state = { preference: 'light', brand: 'orange' }) => state,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
    },
  });
}
type Store = ReturnType<typeof makeStore>;

jest.setTimeout(60_000);

const mounted: TestRenderer.ReactTestRenderer[] = [];
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(() => {
  jest.useFakeTimers({
    now: new Date(2026, 9, 12, 10, 0),
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
  forgetQueries();
  jest.clearAllMocks();
  customerAging.mockResolvedValue(ANSWER as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

const isLotToggle = (node: ReactTestInstance) =>
  typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string' && /^GRN A\d{4}/.test(node.props.accessibilityLabel);
const boldIn = (root: ReactTestInstance) =>
  root
    .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
    .map(node => [node.props.children].flat().join(''));

async function open() {
  mockStore = makeStore();
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
  const list = () => tree.root.findByType('FlashList' as never).props;
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const header = () =>
    tree.root.findAll(
      node => typeof node.props.onPress === 'function' && typeof node.props.accessibilityState?.expanded === 'boolean' && String(node.props.accessibilityLabel).startsWith('Example Garlic')
    )[0];
  /** Draws one list cell on its own, as FlashList draws (and recycles) it. */
  const drawCell = <T,>(index: number, read: (root: ReactTestInstance) => T): T => {
    const props = list();
    let cell!: TestRenderer.ReactTestRenderer;
    act(() => {
      cell = TestRenderer.create(props.renderItem({ item: (props.data as unknown[])[index], index }));
    });
    const result = read(cell.root);
    act(() => cell.unmount());
    return result;
  };
  return {
    tree,
    list,
    texts,
    drawCell,
    toggle: () => run(() => header().props.onPress()),
    headerLabel: () => String(header().props.accessibilityLabel),
    expanded: () => header().props.accessibilityState.expanded as boolean,
    pressLot: (number: string) =>
      run(() => tree.root.findAll(node => isLotToggle(node) && String(node.props.accessibilityLabel).startsWith(`GRN ${number},`))[0].props.onPress()),
    labels: () => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string),
    /** The rows the list is given: [type, key]. */
    rows: () => {
      const props = list();
      return (props.data as unknown[]).map((row, index) => [props.getItemType?.(row) ?? 'row', props.keyExtractor(row, index)] as const);
    },
    /** How many lot lines each list cell holds. The old screen has one cell with all 500. */
    linesPerCell: () =>
      (list().data as unknown[]).map((_, index) => drawCell(index, root => new Set(root.findAll(isLotToggle).map(node => node.props.accessibilityLabel)).size)),
    search: async (text: string) => {
      const field = tree.root.findAll(node => typeof node.props.onChangeText === 'function' && typeof node.props.onSubmitEditing === 'function')[0];
      await run(() => field.props.onChangeText(text));
      await run(() => tree.root.findAll(node => typeof node.props.onSubmitEditing === 'function')[0].props.onSubmitEditing());
    },
    bold: () => boldIn(tree.root),
    status: () => texts().find(text => text.includes('Last updated')),
  };
}

describe('stock aging: an opened item with 500 lots', () => {
  it('is one row closed, and 501 rows open, each lot in a cell of its own under a key of its item', async () => {
    const screen = await open();
    const closed = screen.rows();
    expect(closed).toHaveLength(1);
    const [itemType, itemKey] = closed[0];
    expect(screen.expanded()).toBe(false);
    const header = 'Example Garlic, 500 GRNs, 1,000 units, oldest 600 days';
    expect(screen.headerLabel()).toBe(header);
    // The figures count item cards (1), not the server's 500 stock lines.
    const totals = ['Items: 1', 'Items over 364 days: 1'];
    expect(screen.labels()).toEqual(expect.arrayContaining(totals));

    await screen.toggle();
    expect(screen.expanded()).toBe(true);
    const rows = screen.rows();
    expect(rows).toHaveLength(LOTS + 1);
    // The item keeps its key and its type; its lots follow it, oldest first.
    expect(rows[0]).toEqual([itemType, itemKey]);
    expect(rows.slice(1).every(([type, key]) => type === 'line' && key.startsWith(`${itemKey}|`))).toBe(true);
    expect(new Set(rows.map(([, key]) => key)).size).toBe(LOTS + 1);
    const data = screen.list().data as { parentId?: string }[];
    expect(data.slice(1).every(row => row.parentId === 'Example Garlic')).toBe(true);
    // No cell holds more than one lot: the list mounts what is on screen, not all 500 at once.
    const perCell = screen.linesPerCell();
    expect(Math.max(...perCell)).toBe(1);
    expect(perCell.reduce((sum, count) => sum + count, 0)).toBe(LOTS);
    const drawn = [...new Set(screen.labels().filter(label => /^GRN A\d{4},/.test(label)).map(label => label.split(',')[0]))];
    expect(drawn).toEqual(Array.from({ length: LOTS }, (_, index) => `GRN ${grnNumber(index)}`));
    // The header, the figures and the status line count items, not rows.
    expect(screen.headerLabel()).toBe(header);
    expect(screen.labels()).toEqual(expect.arrayContaining(totals));
    expect(screen.status()).toBe('Last updated 10:00 am');

    // A lot opens in its own row; the list keeps the same rows.
    await screen.pressLot('A0002');
    expect(screen.texts().filter(text => text === 'View GRN A0002')).toHaveLength(1);
    expect(screen.rows()).toEqual(rows);

    await screen.toggle();
    expect(screen.expanded()).toBe(false);
    expect(screen.rows()).toEqual([[itemType, itemKey]]);
    expect(screen.texts()).not.toContain('View GRN A0002');
    expect(screen.labels()).toEqual(expect.arrayContaining(totals));
  });

  it('shows a searched GRN number in bold in its own row once the item is open', async () => {
    const screen = await open();
    await screen.search('a0042');
    // Closed: the card names the lot the search found.
    expect(screen.rows()).toHaveLength(1);
    expect(screen.headerLabel()).toBe('Example Garlic, 1 GRN, 2 units, oldest 559 days, GRN A0042');
    expect(screen.bold()).toEqual(['A0042']);

    await screen.toggle();
    // Open: the one lot left is a row of its own, with the searched words in bold.
    const rows = screen.rows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['line', `${rows[0][1]}|line:g42|Bag||`]);
    expect(screen.bold()).toEqual(['A0042']);
    expect(screen.drawCell(1, boldIn)).toEqual(['A0042']);
    // The status line counts items (1 of 1), not the 501 rows.
    expect(screen.status()).toBe('Last updated 10:00 am');
  });
});
