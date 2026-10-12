/**
 * The GRN activity report with a real store: the period, sort, search and
 * "Clear all" are worked through the filter bar and the search field as a
 * person would, and what the report remembers is read back from the store,
 * also by a new screen after a restart. Only the services and the router are
 * stand-ins. The rows are made so that every change gives an order of its own.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { getAllGRNActivity, getCustomerGRNActivity } from '@/services/reporting/grn-activity-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { fontWeight } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import GRNActivityScreen from '../../../../app/reports/grn-activity';

const mockPush = jest.fn();
const mockRouterPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockStore: Store;
// The app's hooks, reading the test's store and drawing again when it changes, as react-redux
// does (react-redux itself is not set up to load under Jest here). A selector is read again
// only when the state or the selector changes, so a snapshot is stable within a render.
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
jest.mock('@/services/reporting/grn-activity-service', () => ({ getAllGRNActivity: jest.fn(), getCustomerGRNActivity: jest.fn() }));

const allActivity = jest.mocked(getAllGRNActivity);
const customerActivity = jest.mocked(getCustomerGRNActivity);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// ---------------------------------------------------------------------------
// Rows. No two share a value in a sorted column; the 240-day period adds one.
// ---------------------------------------------------------------------------

const customer = (id: string, name: string, grns: number, bags: number, latest: string) => ({
  customer_id: id,
  customer_name: name,
  grn_count: grns,
  total_quantity: bags,
  total_weight: bags * 50,
  latest_grn_date: latest,
});
const CUSTOMERS = [
  customer('c1', 'Riverbank Produce', 9, 80, '2026-08-11'),
  customer('c2', 'Green Valley Traders', 2, 300, '2026-09-20'),
  customer('c3', 'Sunrise Agro Foods', 4, 120, '2026-07-01'),
  customer('c4', 'Hillside Produce Co', 12, 50, '2026-10-02'),
];
const OLD_MILL = customer('c5', 'Old Mill Stores', 1, 10, '2026-03-02');
const answerCustomers = (rows: ReturnType<typeof customer>[]) => ({
  success: true,
  message: '',
  data: { summary: { total_grns: 28, total_customers: rows.length, total_items: 0, total_quantity: 560, total_weight_kg: 0 }, by_customer: rows },
});

const grn = (id: string, number: string, date: string, bags: number, stock: number, invoiced: boolean) => ({
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
  invoice_status: { is_invoiced: invoiced, invoice_id: null, invoice_number: null },
  dispatch_summary: { total_dispatched: 0, current_stock: stock, dispatch_count: 0, last_dispatch_date: null, is_fully_dispatched: false },
  items: [],
});
const GRNS = [
  grn('g1', 'A0010', '2026-10-12', 50, 60, true),
  grn('g2', 'A0009', '2026-10-11', 200, 5, false),
  grn('g3', 'A0100', '2026-10-11', 120, 90, true),
  grn('g4', 'A0050', '2026-09-20', 20, 40, false),
];
const answerGrns = {
  success: true,
  message: '',
  data: { summary: { total_grns: 4, total_items: 4, total_quantity: 390, total_weight_kg: 0, total_invoiced_grns: 2, total_images: 0 }, grns: GRNS },
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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

// Each test is a run of several taps, sheets and answers: under a full parallel run the first
// one, which draws the screen for the first time, can take longer than Jest's 5 seconds.
jest.setTimeout(30_000);

// A mounted skeleton or query keeps timers alive: every tree is taken down after its test.
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
  allActivity.mockImplementation(async ({ fromDate }) => answerCustomers(fromDate < '2026-06-15' ? [...CUSTOMERS, OLD_MILL] : CUSTOMERS));
  customerActivity.mockResolvedValue(answerGrns as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

async function open(store: Store) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<GRNActivityScreen />);
    await settleQueries();
  });
  mounted.push(tree);

  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const control = (label: string) => {
    const found = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    if (found.length === 0) throw new Error(`No control labelled "${label}"`);
    return found[0];
  };
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  return {
    tree,
    texts,
    press: (label: string) => run(() => control(label).props.onPress()),
    has: (label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').length > 0,
    /** Customer names in the order the rows show them. */
    customers: () => tree.root.findAllByType(ReportCustomerCard).map(card => card.props.title as string),
    /** GRN cards and date headings in the order they are drawn. */
    grnRows: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && (node.props.accessibilityRole === 'header' || /^GRN A\d+$/.test([node.props.children].flat().join(''))))
        .map(node => [node.props.children].flat().join(''))
        .filter(text => text !== 'GRN activity'),
    status: () => texts().find(text => text.includes('Last updated')),
    search: async (text: string) => {
      const field = tree.root.findAll(node => typeof node.props.onChangeText === 'function' && typeof node.props.onSubmitEditing === 'function')[0];
      await run(() => field.props.onChangeText(text));
      // Submitting commits at once, without waiting for the field's 300 ms pause.
      await run(() => tree.root.findAll(node => typeof node.props.onSubmitEditing === 'function')[0].props.onSubmitEditing());
    },
    searchValue: () => tree.root.findAll(node => typeof node.props.onChangeText === 'function')[0].props.value as string,
    refresh: () => run(() => tree.root.findByType('FlashList' as never).props.refreshControl.props.onRefresh()),
    bold: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold)
        .map(node => [node.props.children].flat().join('')),
  };
}

const DEFAULT_ORDER = ['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co'];
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });

// ---------------------------------------------------------------------------

describe('GRN activity, every customer', () => {
  it('asks for the last 120 days, and asks again for 240 days when that period is chosen', async () => {
    const screen = await open(makeStore());
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.status()).toBe('15 Jun – 12 Oct · Last updated 10:00 am');

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.status()).toBe('15 Feb – 12 Oct · Last updated 10:00 am');
    expect(screen.customers()).toEqual([...DEFAULT_ORDER, 'Old Mill Stores']);
    expect(customerActivity).not.toHaveBeenCalled();
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Customer');
    // The field changed and the direction was kept: Z to A.
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Green Valley Traders']);
    await screen.press('A to Z');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Latest GRN');
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Green Valley Traders', 'Hillside Produce Co']);
    // Sorting is done on the rows already read: nothing more is asked.
    expect(allActivity).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the period and sort kept', async () => {
    const screen = await open(makeStore());
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Customer');
    await screen.press('A to Z');
    await screen.press('Done');

    await screen.search('produce');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce']);
    expect(screen.bold()).toEqual(['Produce', 'Produce']);
    expect(screen.status()).toBe('15 Feb – 12 Oct · Showing 2 of 5 · Last updated 10:00 am');

    await screen.press('Clear all filters and the search');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Old Mill Stores', 'Riverbank Produce', 'Sunrise Agro Foods']);
    expect(screen.searchValue()).toBe('');
    expect(screen.bold()).toEqual([]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(allActivity).toHaveBeenCalledTimes(2);
  });

  it('opens a customer as a route and remembers it; after a restart the period, sort and that customer are back', async () => {
    const store = makeStore();
    const screen = await open(store);
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('GRNs');
    await screen.press('Done');
    const byGrns = ['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders', 'Old Mill Stores'];
    expect(screen.customers()).toEqual(byGrns);
    expect(screen.texts()).not.toContain('Last opened');

    await screen.press('Riverbank Produce, 9 GRNs · Latest 11 Aug, 80 bags');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'grn-activity': { id: 'c1', name: 'Riverbank Produce' } });

    // A restart: the screen is gone, the answers in memory are gone, and only the
    // persisted choices come back, read as the app reads them from the phone.
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    forgetQueries();
    allActivity.mockClear();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(allActivity.mock.calls).toEqual([[days('2026-02-15')]]);
    expect(again.customers()).toEqual(byGrns);
    expect(again.has('Period: Last 240 days. Change')).toBe(true);
    expect(again.has('Sorted by GRNs, highest first. Change sort')).toBe(true);
    expect(again.texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));

    await again.press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
  });

  it('keeps the rows when a refresh fails, and says they are not current', async () => {
    const screen = await open(makeStore());
    allActivity.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await screen.refresh();
    expect(allActivity).toHaveBeenCalledTimes(2);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", 'Could not reach the facility']));
  });
});

describe('GRN activity, one customer', () => {
  it('puts date headings between the GRNs while sorted by date, and none for another sort', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const screen = await open(makeStore());
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c2', ...days('2026-06-15') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    expect(screen.grnRows()).toEqual(['Today', 'GRN A0010', 'Yesterday', 'GRN A0009', 'GRN A0100', 'Sun, 20 Sep', 'GRN A0050']);

    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('Bags');
    await screen.press('Done');
    expect(screen.grnRows()).toEqual(['GRN A0009', 'GRN A0100', 'GRN A0010', 'GRN A0050']);
    // With no heading above it, each card gives its own date.
    expect(screen.texts()).toEqual(expect.arrayContaining(['11 Oct', '12 Oct', '20 Sep']));

    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Date');
    await screen.press('Oldest first');
    await screen.press('Done');
    expect(screen.grnRows()).toEqual(['Sun, 20 Sep', 'GRN A0050', 'Yesterday', 'GRN A0009', 'GRN A0100', 'Today', 'GRN A0010']);
  });

  it('narrows to the GRNs not invoiced, and Clear all brings the others back', async () => {
    mockParams = { customerId: 'c2', customerName: 'Green Valley Traders' };
    const screen = await open(makeStore());
    await screen.press('Filter by invoicing');
    await screen.press('Not invoiced');
    expect(screen.grnRows()).toEqual(['Yesterday', 'GRN A0009', 'Sun, 20 Sep', 'GRN A0050']);
    expect(screen.status()).toBe('15 Jun – 12 Oct · Showing 2 of 4 · Last updated 10:00 am');
    // The figures are the whole period's.
    expect(screen.texts()).toContain('2 of 4');

    await screen.press('Clear all filters and the search');
    expect(screen.grnRows()).toEqual(['Today', 'GRN A0010', 'Yesterday', 'GRN A0009', 'GRN A0100', 'Sun, 20 Sep', 'GRN A0050']);
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(allActivity).not.toHaveBeenCalled();
    expect(customerActivity).not.toHaveBeenCalled();
    expect(screen.texts()).toContain('No customer linked to your account');
    expect(screen.texts()).not.toContain('Riverbank Produce');
    expect(screen.has('Try again')).toBe(false);
  });
});
