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
import { render, screen, userEvent, waitFor, within, type RenderResult } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { getCustomerStockAging } from '@/services/reporting/stock-aging-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { fontWeight } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
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
  onOperatorServerChange: () => () => {},
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


type Tree = RenderResult['container'];

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
  jest.useRealTimers();
});

const isBold = (node: Tree) => node.type === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold;
const textOf = (node: Tree) => [node.props.children].flat().join('');
/** The words in bold in a tree. A style has no query of its own, so this reads the rendered Text nodes. */
const boldIn = (root: Tree) => root.queryAll(isBold).map(textOf);
const LOT_NAME = /^GRN A\d{4},/;

async function open() {
  mockStore = makeStore();
  const user = userEvent.setup({ delay: 0 });
  await render(<StockAgingScreen />);
  // A later `render` (one list cell) replaces `screen`; the screen under test keeps its own queries.
  const tree = screen.container;
  const app = within(tree);
  const header = await app.findByRole('button', { name: /^Example Garlic/ });
  const list = () => tree.queryAll(node => node.type === 'FlashList')[0].props;
  /** Draws one list cell on its own, as FlashList draws (and recycles) it. */
  const drawCell = async <T,>(index: number, read: (root: Tree) => T): Promise<T> => {
    const props = list();
    const cell = await render(props.renderItem({ item: (props.data as unknown[])[index], index }));
    const result = read(cell.container);
    await cell.unmount();
    return result;
  };
  return {
    app,
    list,
    drawCell,
    user,
    header,
    toggle: () => user.press(header),
    pressLot: async (number: string) => user.press(app.getByRole('button', { name: new RegExp(`^GRN ${number},`) })),
    /** The rows the list is given: [type, key]. */
    rows: () => {
      const props = list();
      return (props.data as unknown[]).map((row, index) => [props.getItemType?.(row) ?? 'row', props.keyExtractor(row, index)] as const);
    },
    /** How many lot lines each list cell holds. The old screen has one cell with all 500. */
    linesPerCell: async () => {
      const counts: number[] = [];
      for (let index = 0; index < (list().data as unknown[]).length; index += 1) {
        counts.push(await drawCell(index, root => new Set(within(root).queryAllByRole('button', { name: LOT_NAME }).map(node => node.props.accessibilityLabel)).size));
      }
      return counts;
    },
    search: async (text: string) => {
      await user.type(app.getByPlaceholderText(/search/i), text, { submitEditing: true });
    },
    bold: () => boldIn(tree),
  };
}

describe('stock aging: an opened item with 500 lots', () => {
  it('is one row closed, and 501 rows open, each lot in a cell of its own under a key of its item', async () => {
    const view = await open();
    const { app } = view;
    const closed = view.rows();
    expect(closed).toHaveLength(1);
    const [itemType, itemKey] = closed[0];
    expect(view.header).not.toBeExpanded();
    const header = 'Example Garlic · Bag, 500 GRNs, 1,000 units, oldest 600 days';
    expect(view.header).toHaveAccessibleName(header);
    // The figures count item cards (1), not the server's 500 stock lines.
    const totals = ['Items: 1', 'Items over 364 days: 1'];
    totals.forEach(label => expect(app.getByLabelText(label)).toBeOnTheScreen());

    await view.toggle();
    await waitFor(() => expect(view.header).toBeExpanded());
    const rows = view.rows();
    expect(rows).toHaveLength(LOTS + 1);
    // The item keeps its key and its type; its lots follow it, oldest first.
    expect(rows[0]).toEqual([itemType, itemKey]);
    expect(rows.slice(1).every(([type, key]) => type === 'line' && key.startsWith(`${itemKey}|`))).toBe(true);
    expect(new Set(rows.map(([, key]) => key)).size).toBe(LOTS + 1);
    const data = view.list().data as { parentId?: string }[];
    expect(data.slice(1).every(row => row.parentId === 'Example Garlic')).toBe(true);
    const drawn = [...new Set(app.getAllByRole('button', { name: LOT_NAME }).map(node => String(node.props.accessibilityLabel).split(',')[0]))];
    expect(drawn).toEqual(Array.from({ length: LOTS }, (_, index) => `GRN ${grnNumber(index)}`));
    // The header, the figures and the status line count items, not rows.
    expect(view.header).toHaveAccessibleName(header);
    totals.forEach(label => expect(app.getByLabelText(label)).toBeOnTheScreen());
    expect(app.getByText('Last updated 10:00 am')).toBeOnTheScreen();

    // A lot opens in its own row; the list keeps the same rows.
    await view.pressLot('A0002');
    expect(app.getAllByText('View GRN A0002')).toHaveLength(1);
    expect(view.rows()).toEqual(rows);

    await view.toggle();
    await waitFor(() => expect(view.header).not.toBeExpanded());
    expect(view.rows()).toEqual([[itemType, itemKey]]);
    expect(app.queryByText('View GRN A0002')).not.toBeOnTheScreen();
    totals.forEach(label => expect(app.getByLabelText(label)).toBeOnTheScreen());

    // No cell holds more than one lot: the list mounts what is on screen, not all 500 at once.
    // Last, because drawing a cell on its own replaces `screen`.
    await view.toggle();
    await waitFor(() => expect(view.header).toBeExpanded());
    const perCell = await view.linesPerCell();
    expect(Math.max(...perCell)).toBe(1);
    expect(perCell.reduce((sum, count) => sum + count, 0)).toBe(LOTS);
  });

  it('shows a searched GRN number in bold in its own row once the item is open', async () => {
    const view = await open();
    const { app } = view;
    await view.search('a0042');
    // Closed: the card names the lot the search found.
    await waitFor(() => expect(view.rows()).toHaveLength(1));
    expect(app.getByRole('button', { name: /^Example Garlic/ })).toHaveAccessibleName('Example Garlic · Bag, 1 GRN, 2 units, oldest 559 days, GRN A0042');
    expect(view.bold()).toEqual(['A0042']);

    await view.toggle();
    // Open: the one lot left is a row of its own, with the searched words in bold.
    await waitFor(() => expect(view.rows()).toHaveLength(2));
    const rows = view.rows();
    expect(rows[1]).toEqual(['line', `${rows[0][1]}|line:g42|Bag||`]);
    expect(view.bold()).toEqual(['A0042']);
    // The status line counts items (1 of 1), not the 501 rows.
    expect(app.getByText('Last updated 10:00 am')).toBeOnTheScreen();
    expect(await view.drawCell(1, boldIn)).toEqual(['A0042']);
  });
});
