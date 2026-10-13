/**
 * P2F-UI-2: an opened item of one customer's stock summary must not draw all its
 * GRNs inside one list cell. Each GRN is a row of the report's FlashList of its
 * own (type "grn", a key under its item's key), so the list mounts only the
 * rows on screen however many GRNs one item has.
 *
 * FlashList is the test stand-in, which hands every row to `renderItem`: the
 * test reads the rows the list is given and draws each cell on its own to count
 * the GRN rows inside it. On the old screen the item is one row whose cell holds
 * all 500 GRNs.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { getCustomerStockSummary } from '@/services/reporting';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { fontWeight } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import StockSummaryScreen from '../../../../app/reports/stock-summary';

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
  router: { push: jest.fn(), back: jest.fn() },
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

const customerStock = jest.mocked(getCustomerStockSummary);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// One item stored on 500 GRNs (A0001 to A0500), 2 units on each: 1,000 units.
const LOTS = 500;
const grnNumber = (index: number) => `A${String(index + 1).padStart(4, '0')}`;
const BIG_ITEM = {
  item_id: 'i1',
  item_name: 'Example Garlic',
  total_stock: LOTS * 2,
  total_weight: LOTS * 100,
  grn_count: LOTS,
  grns: Array.from({ length: LOTS }, (_, index) => ({
    grn_id: `g${index + 1}`,
    gr_no: grnNumber(index),
    date: '2026-09-01',
    orig_qty: 10,
    stock: 2,
    item_weight: 50,
    rack: '',
    packaging: 'Bag',
  })),
};
const ANSWER = {
  success: true,
  message: '',
  data: {
    summary: { total_items: 1, total_quantity: LOTS * 2, total_weight_kg: 0, oldest_stock_date: '2026-09-01', grn_count: LOTS, grn_count_empty: 0 },
    items: [BIG_ITEM],
    out_of_stock_items: [],
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
  customerStock.mockResolvedValue(ANSWER as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

const isGrnLabel = (node: ReactTestInstance) => typeof node.props.accessibilityLabel === 'string' && /^GRN A\d{4}/.test(node.props.accessibilityLabel);

async function open() {
  mockStore = makeStore();
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
  const list = () => tree.root.findByType('FlashList' as never).props;
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const header = () =>
    tree.root.findAll(
      node => typeof node.props.onPress === 'function' && typeof node.props.accessibilityState?.expanded === 'boolean' && String(node.props.accessibilityLabel).startsWith('Example Garlic')
    )[0];
  return {
    tree,
    list,
    texts,
    toggle: () => run(() => header().props.onPress()),
    expanded: () => header().props.accessibilityState.expanded as boolean,
    labels: () => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string),
    /** The rows the list is given: [type, key]. */
    rows: () => {
      const props = list();
      return (props.data as unknown[]).map((row, index) => [props.getItemType?.(row) ?? 'row', props.keyExtractor(row, index)] as const);
    },
    /**
     * Each list cell drawn on its own, as FlashList draws (and recycles) it: how
     * many GRN rows each one holds. The old screen has one cell with all 500.
     */
    grnRowsPerCell: () => {
      const props = list();
      return (props.data as unknown[]).map((row, index) => {
        let cell!: TestRenderer.ReactTestRenderer;
        act(() => {
          cell = TestRenderer.create(props.renderItem({ item: row, index }));
        });
        const count = new Set(cell.root.findAll(isGrnLabel).map(node => node.props.accessibilityLabel)).size;
        act(() => cell.unmount());
        return count;
      });
    },
    search: async (text: string) => {
      const field = tree.root.findAll(node => typeof node.props.onChangeText === 'function' && typeof node.props.onSubmitEditing === 'function')[0];
      await run(() => field.props.onChangeText(text));
      await run(() => tree.root.findAll(node => typeof node.props.onSubmitEditing === 'function')[0].props.onSubmitEditing());
    },
    bold: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
        .map(node => [node.props.children].flat().join('')),
    status: () => texts().find(text => text.includes('Last updated')),
  };
}

describe('stock summary: an opened item with 500 GRNs', () => {
  it('is one row closed, and 501 rows open, each GRN in a cell of its own under a key of its item', async () => {
    const screen = await open();
    expect(screen.rows()).toEqual([['item', 'item:i1']]);
    expect(screen.expanded()).toBe(false);
    const totals = ['Stock: 1,000', 'GRNs with stock: 500'];
    expect(screen.labels()).toEqual(expect.arrayContaining(totals));

    await screen.toggle();
    expect(screen.expanded()).toBe(true);
    const rows = screen.rows();
    expect(rows).toHaveLength(LOTS + 1);
    // The item keeps its key and its place; its GRNs follow it in the service's order.
    expect(rows[0]).toEqual(['item', 'item:i1']);
    expect(rows.slice(1).every(([type, key]) => type === 'grn' && key.startsWith('item:i1|'))).toBe(true);
    expect(new Set(rows.map(([, key]) => key)).size).toBe(LOTS + 1);
    // Each GRN row says which item it is under.
    const data = screen.list().data as { parentId?: string }[];
    expect(data.slice(1).every(row => row.parentId === 'i1')).toBe(true);
    // No cell holds more than one GRN: the list mounts what is on screen, not all 500 at once.
    const perCell = screen.grnRowsPerCell();
    expect(Math.max(...perCell)).toBe(1);
    expect(perCell.reduce((sum, count) => sum + count, 0)).toBe(LOTS);
    // The GRNs are drawn in order, and the figures are the same as with the item closed.
    const drawn = [...new Set(screen.labels().filter(label => /^GRN A\d{4}/.test(label)).map(label => label.split(',')[0]))];
    expect(drawn).toEqual(Array.from({ length: LOTS }, (_, index) => `GRN ${grnNumber(index)}`));
    expect(screen.labels()).toEqual(expect.arrayContaining(totals));
    expect(screen.status()).toBe('Last updated 10:00 am');

    // The keys of the same answer are the same keys: a refresh does not remount the rows.
    expect(screen.rows()).toEqual(rows);

    await screen.toggle();
    expect(screen.expanded()).toBe(false);
    expect(screen.rows()).toEqual([['item', 'item:i1']]);
    expect(screen.labels()).toEqual(expect.arrayContaining(totals));
  });

  it('shows a searched GRN number in bold in its own row once the item is open', async () => {
    const screen = await open();
    await screen.search('a0042');
    // Closed: the card names the match under its facts.
    expect(screen.rows()).toEqual([['item', 'item:i1']]);
    expect(screen.bold()).toEqual(['A0042']);
    expect(screen.labels()).toContain('Example Garlic, 1,000 units, 500 GRNs, GRN A0042');

    await screen.toggle();
    // Open: every GRN is a row, and the searched one shows the words in bold in its own row.
    expect(screen.rows()).toHaveLength(LOTS + 1);
    expect(screen.bold()).toEqual(['A0042']);
    const data = screen.list().data as unknown[];
    const props = screen.list();
    const row42 = data.findIndex((row, index) => props.keyExtractor(row, index).includes('A0042'));
    expect(row42).toBeGreaterThan(0);
    let cell!: TestRenderer.ReactTestRenderer;
    act(() => {
      cell = TestRenderer.create(props.renderItem({ item: data[row42], index: row42 }));
    });
    const bold = cell.root
      .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
      .map(node => [node.props.children].flat().join(''));
    expect(bold).toEqual(['A0042']);
    act(() => cell.unmount());
    // The status line counts items (1 of 1), not the 501 rows.
    expect(screen.status()).toBe('Last updated 10:00 am');
  });
});
