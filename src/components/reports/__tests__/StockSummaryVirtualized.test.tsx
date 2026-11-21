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
import { act, render, userEvent, within, type RenderResult } from '@testing-library/react-native';
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
  jest.useRealTimers();
});

const HIDDEN = { includeHiddenElements: true } as const;
const GRN_LABEL = /^GRN A\d{4}/;
const settle = () => act(async () => settleQueries());
const boldTexts = (texts: ReturnType<ReturnType<typeof within>['queryAllByText']>) =>
  texts
    .filter(node => StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
    .map(node => [node.props.children].flat().join(''));

async function open() {
  mockStore = makeStore();
  const user = userEvent.setup({ delay: 0 });
  const rendered = await render(<StockSummaryScreen />);
  const main = within(rendered.container);
  await settle();
  const list = () => {
    let props: Record<string, any> | undefined;
    const walk = (node: ReturnType<RenderResult['toJSON']> | string | null): void => {
      if (!node || typeof node === 'string' || props) return;
      if (Array.isArray(node)) return node.forEach(walk);
      if ((node.type as string) === 'FlashList') props = node.props;
      else node.children?.forEach(walk);
    };
    walk(rendered.toJSON());
    return props!;
  };
  const header = () => main.getByRole('button', { name: /^Example Garlic/ });
  return {
    main,
    list,
    header,
    toggle: async () => {
      await user.press(header());
      await settle();
    },
    labels: (match: string | RegExp) => main.queryAllByLabelText(match, HIDDEN),
    /** The rows the list is given: [type, key]. */
    rows: () => {
      const props = list();
      return (props.data as unknown[]).map((row, index) => [props.getItemType?.(row) ?? 'row', props.keyExtractor(row, index)] as const);
    },
    /**
     * Each list cell drawn on its own, as FlashList draws (and recycles) it: how
     * many GRN rows each one holds. The old screen has one cell with all 500.
     */
    grnRowsPerCell: async (props: Record<string, any>) => {
      const counts: number[] = [];
      for (const [index, row] of (props.data as unknown[]).entries()) {
        const cell = await render(props.renderItem({ item: row, index }));
        const inCell = within(cell.container);
        counts.push(new Set(inCell.queryAllByLabelText(GRN_LABEL, HIDDEN).map(node => node.props.accessibilityLabel)).size);
        await cell.unmount();
      }
      return counts;
    },
    search: async (text: string) => {
      const field = main.getByPlaceholderText(/^Search items/);
      await user.type(field, text, { submitEditing: true });
      await settle();
    },
    bold: () => boldTexts(main.queryAllByText(/./, HIDDEN)),
  };
}

describe('stock summary: an opened item with 500 GRNs', () => {
  it('is one row closed, and 501 rows open, each GRN in a cell of its own under a key of its item', async () => {
    const screen = await open();
    expect(screen.rows()).toEqual([['item', 'item:i1']]);
    expect(screen.header()).toBeCollapsed();
    const totals = ['Stock: 1,000', 'GRNs with stock: 500'];
    const showsTotals = () => totals.forEach(total => expect(screen.labels(total).length).toBeGreaterThan(0));
    showsTotals();

    await screen.toggle();
    expect(screen.header()).toBeExpanded();
    const rows = screen.rows();
    expect(rows).toHaveLength(LOTS + 1);
    // The item keeps its key and its place; its GRNs follow it in the service's order.
    expect(rows[0]).toEqual(['item', 'item:i1']);
    expect(rows.slice(1).every(([type, key]) => type === 'grn' && key.startsWith('item:i1|'))).toBe(true);
    expect(new Set(rows.map(([, key]) => key)).size).toBe(LOTS + 1);
    // Each GRN row says which item it is under.
    const data = screen.list().data as { parentId?: string }[];
    expect(data.slice(1).every(row => row.parentId === 'i1')).toBe(true);
    const opened = screen.list();
    // The GRNs are drawn in order, and the figures are the same as with the item closed.
    const drawn = [...new Set(screen.labels(GRN_LABEL).map(node => String(node.props.accessibilityLabel).split(',')[0]))];
    expect(drawn).toEqual(Array.from({ length: LOTS }, (_, index) => `GRN ${grnNumber(index)}`));
    showsTotals();
    expect(screen.main.queryAllByText('Last updated 10:00 am', HIDDEN)).toHaveLength(1);

    // The keys of the same answer are the same keys: a refresh does not remount the rows.
    expect(screen.rows()).toEqual(rows);

    await screen.toggle();
    expect(screen.header()).toBeCollapsed();
    expect(screen.rows()).toEqual([['item', 'item:i1']]);
    showsTotals();

    // No cell holds more than one GRN: the list mounts what is on screen, not all 500 at once.
    // (Last: drawing a cell on its own replaces the screen the helpers act on.)
    const perCell = await screen.grnRowsPerCell(opened);
    expect(Math.max(...perCell)).toBe(1);
    expect(perCell.reduce((sum, count) => sum + count, 0)).toBe(LOTS);
  });

  it('shows a searched GRN number in bold in its own row once the item is open', async () => {
    const screen = await open();
    await screen.search('a0042');
    // Closed: the card names the match under its facts.
    expect(screen.rows()).toEqual([['item', 'item:i1']]);
    expect(screen.bold()).toEqual(['A0042']);
    expect(screen.labels('Example Garlic · Bag, 1,000 units, 500 GRNs, GRN A0042').length).toBeGreaterThan(0);

    await screen.toggle();
    // Open: every GRN is a row, and the searched one shows the words in bold in its own row.
    expect(screen.rows()).toHaveLength(LOTS + 1);
    expect(screen.bold()).toEqual(['A0042']);
    const data = screen.list().data as unknown[];
    const props = screen.list();
    const row42 = data.findIndex((row, index) => props.keyExtractor(row, index).includes('A0042'));
    expect(row42).toBeGreaterThan(0);
    const cell = await render(props.renderItem({ item: data[row42], index: row42 }));
    expect(boldTexts(within(cell.container).queryAllByText(/./, HIDDEN))).toEqual(['A0042']);
    await cell.unmount();
    // The status line counts items (1 of 1), not the 501 rows.
    expect(screen.main.queryAllByText('Last updated 10:00 am', HIDDEN)).toHaveLength(1);
  });
});
