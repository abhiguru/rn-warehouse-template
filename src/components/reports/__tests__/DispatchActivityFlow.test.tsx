/**
 * The dispatch activity report with a real store: the period, sort, search and
 * "Clear all" are worked through the filter bar and the search field as a
 * person would, and what the report remembers is read back from the store,
 * also by a new screen after a restart. Only the services and the router are
 * stand-ins. The rows are made so that every change gives an order of its own.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { getAllDispatchActivity, getCustomerDispatchActivity } from '@/services/reporting';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import DispatchActivityScreen from '../../../../app/reports/dispatch-activity';

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
jest.mock('@/services/reporting', () => ({ getAllDispatchActivity: jest.fn(), getCustomerDispatchActivity: jest.fn() }));

const allActivity = jest.mocked(getAllDispatchActivity);
const customerActivity = jest.mocked(getCustomerDispatchActivity);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

// ---------------------------------------------------------------------------
// Rows. No two share a value in a sorted column; the 240-day period adds one.
// ---------------------------------------------------------------------------

const customer = (id: string, name: string, dispatches: number, bags: number) => ({
  customer_id: id,
  customer_name: name,
  dispatch_count: dispatches,
  total_quantity: bags,
  total_weight: bags * 50,
});
const CUSTOMERS = [
  customer('c1', 'Riverbank Produce', 9, 80),
  customer('c2', 'Green Valley Traders', 2, 300),
  customer('c3', 'Sunrise Agro Foods', 4, 120),
  customer('c4', 'Hillside Produce Co', 12, 50),
];
const OLD_MILL = customer('c5', 'Old Mill Stores', 1, 10);
const answerCustomers = (rows: ReturnType<typeof customer>[]) => ({
  success: true,
  message: '',
  data: { summary: { total_dispatches: 27, total_customers: rows.length, total_quantity: 550, total_weight: 27500 }, by_customer: rows },
});

const item = (name: string, over: Record<string, unknown> = {}) => ({ item_name: name, qty: 10, source_grn: 'A0001', ...over });
const dispatch = (id: string, number: string, date: string, bags: number, weight: number, supervisor: string, items: unknown[]) => ({
  disp_id: id,
  disp_no: number,
  disp_date: date,
  supervisor_name: supervisor,
  total_qty: bags,
  total_weight: weight,
  items,
});
const DISPATCHES = [
  dispatch('d1', 'DD0010', '2026-10-12', 50, 2600, 'Asha Example', [
    item('Garlic', { qty: 50, orig_qty: 60, weight: 2600, source_grn: 'A0010', source_grn_id: 'g1', rack: 'B-14', package_mark: 'GV' }),
  ]),
  dispatch('d2', 'DD0009', '2026-10-11', 200, 900, 'Ravi Example', [item('Red chilli', { qty: 200, source_grn: 'A0009' })]),
  dispatch('d3', 'DD0100', '2026-10-11', 120, 6100, 'Asha Example', [item('Cumin', { qty: 120, source_grn: 'A0100' })]),
  dispatch('d4', 'DD0050', '2026-09-20', 20, 3000, 'Meera Example', [item('Turmeric', { qty: 20, source_grn: 'A0050' })]),
];
const answerDispatches = {
  success: true,
  message: '',
  data: { summary: { total_dispatches: 4, total_quantity: 390, total_weight: 12600 }, dispatches: DISPATCHES },
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeStore(auth: unknown = STAFF, reportPrefs?: ReportPrefsState, theme = { preference: 'light', brand: 'orange' }) {
  return configureStore({
    reducer: {
      auth: (state: unknown = auth) => state,
      theme: (state = theme) => state,
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
  allActivity.mockImplementation(async ({ fromDate }) => answerCustomers(fromDate < '2026-06-15' ? [...CUSTOMERS, OLD_MILL] : CUSTOMERS) as never);
  customerActivity.mockResolvedValue(answerDispatches as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

const textOf = (node: ReactTestInstance): string =>
  [node.props.children].flat().map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : child?.props ? textOf(child as ReactTestInstance) : '')).join('');

async function open(store: Store) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<DispatchActivityScreen />);
    await settleQueries();
  });
  mounted.push(tree);

  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const controls = (match: (label: string) => boolean) =>
    tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && match(node.props.accessibilityLabel) && typeof node.props.onPress === 'function');
  const control = (label: string) => {
    const found = controls(text => text === label);
    if (found.length === 0) throw new Error(`No control labelled "${label}"`);
    return found[0];
  };
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(textOf);
  return {
    tree,
    texts,
    control,
    controls,
    press: (label: string) => run(() => control(label).props.onPress()),
    has: (label: string) => controls(text => text === label).length > 0,
    /** Customer names in the order the rows show them. */
    customers: () => tree.root.findAllByType(ReportCustomerCard).map(card => card.props.title as string),
    /** Dispatch cards and date headings in the order they are drawn. */
    dispatchRows: () =>
      tree.root
        .findAll(node => (node.type as unknown) === 'Text' && (node.props.accessibilityRole === 'header' || /^Dispatch DD\d+$/.test(textOf(node))))
        .map(textOf)
        // Not the screen's title, nor the heading of the sort sheet while it is open.
        .filter(text => text !== 'Dispatch activity' && text !== 'Sort by'),
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
        .map(textOf),
  };
}

const DEFAULT_ORDER = ['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co'];
const BY_DATE = ['Today', 'Dispatch DD0010', 'Yesterday', 'Dispatch DD0009', 'Dispatch DD0100', 'Sun, 20 Sep', 'Dispatch DD0050'];
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });
const GREEN = { customerId: 'c2', customerName: 'Green Valley Traders' };

// ---------------------------------------------------------------------------

describe('dispatch activity, every customer', () => {
  it('asks for the last 120 days, and asks again for 240 days when that period is chosen', async () => {
    const screen = await open(makeStore());
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
    expect(screen.status()).toBe('15 Jun – 12 Oct · Last updated 10:00 am');
    expect(screen.texts()).toEqual(expect.arrayContaining(['Dispatches', '27', 'Bags dispatched', '550']));

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(screen.has('Period: Last 240 days. Change')).toBe(true);
    expect(screen.status()).toBe('15 Feb – 12 Oct · Last updated 10:00 am');
    expect(screen.customers()).toEqual([...DEFAULT_ORDER, 'Old Mill Stores']);

    // One request for each new period, reaching further back to the same day.
    await screen.press('Period: Last 240 days. Change');
    await screen.press('Last 420 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')], [days('2025-08-19')]]);
    expect(customerActivity).not.toHaveBeenCalled();
  });

  it('says what a search found nothing for, and its clear action brings the customers back', async () => {
    const screen = await open(makeStore());
    // The list scrolls with the keyboard open, and a tap on a row is not swallowed by it.
    expect(screen.tree.root.findByType('FlashList' as never).props.keyboardShouldPersistTaps).toBe('handled');
    await screen.search('zzzz');
    expect(screen.customers()).toEqual([]);
    expect(screen.texts()).toContain('No customers match "zzzz"');
    await screen.press('Clear search and filters');
    expect(screen.customers()).toEqual(DEFAULT_ORDER);
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const screen = await open(makeStore());
    await screen.press('Sorted by Bags, highest first. Change sort');
    await screen.press('Customer');
    // The field changed and the direction was kept: Z to A.
    expect(screen.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Green Valley Traders']);
    await screen.press('A to Z');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await screen.press('Dispatches');
    expect(screen.customers()).toEqual(['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co']);
    await screen.press('Highest first');
    expect(screen.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders']);
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
    await screen.press('Dispatches');
    await screen.press('Done');
    const byDispatches = ['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders', 'Old Mill Stores'];
    expect(screen.customers()).toEqual(byDispatches);
    expect(screen.texts()).not.toContain('Last opened');

    await screen.press('Riverbank Produce, 9 dispatches, 80 bags');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/dispatch-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'dispatch-activity': { id: 'c1', name: 'Riverbank Produce' } });

    // A restart: the screen is gone, the answers in memory are gone, and only the
    // persisted choices come back, read as the app reads them from the phone.
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));
    forgetQueries();
    allActivity.mockClear();
    const stored = sanitizeReportPrefs(JSON.parse(JSON.stringify(store.getState().reportPrefs)));
    const again = await open(makeStore(STAFF, stored));
    expect(allActivity.mock.calls).toEqual([[days('2026-02-15')]]);
    expect(again.customers()).toEqual(byDispatches);
    expect(again.has('Period: Last 240 days. Change')).toBe(true);
    expect(again.has('Sorted by Dispatches, highest first. Change sort')).toBe(true);
    expect(again.texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));

    await again.press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reports/dispatch-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
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

describe('dispatch activity, one customer', () => {
  it('puts date headings between the dispatches while sorted by date, and none for another sort', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c2', ...days('2026-06-15') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    expect(screen.dispatchRows()).toEqual(BY_DATE);

    await screen.press('Sorted by Date, newest first. Change sort');
    await screen.press('Bags');
    expect(screen.dispatchRows()).toEqual(['Dispatch DD0009', 'Dispatch DD0100', 'Dispatch DD0010', 'Dispatch DD0050']);
    await screen.press('Weight');
    expect(screen.dispatchRows()).toEqual(['Dispatch DD0100', 'Dispatch DD0050', 'Dispatch DD0010', 'Dispatch DD0009']);
    await screen.press('Dispatch number');
    expect(screen.dispatchRows()).toEqual(['Dispatch DD0100', 'Dispatch DD0050', 'Dispatch DD0010', 'Dispatch DD0009']);
    await screen.press('Lowest number first');
    expect(screen.dispatchRows()).toEqual(['Dispatch DD0009', 'Dispatch DD0010', 'Dispatch DD0050', 'Dispatch DD0100']);
    await screen.press('Done');
    // With no heading above it, each card gives its own date.
    expect(screen.texts()).toEqual(expect.arrayContaining(['11 Oct', '12 Oct', '20 Sep']));

    await screen.press('Sorted by Number, lowest number first. Change sort');
    await screen.press('Date');
    await screen.press('Done');
    expect(screen.dispatchRows()).toEqual(['Sun, 20 Sep', 'Dispatch DD0050', 'Yesterday', 'Dispatch DD0009', 'Dispatch DD0100', 'Today', 'Dispatch DD0010']);
    expect(customerActivity).toHaveBeenCalledTimes(1);
  });

  it('finds dispatches by supervisor and by an item inside the card, names that item, and Clear all keeps the sort', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    await screen.search('asha');
    expect(screen.dispatchRows()).toEqual(['Today', 'Dispatch DD0010', 'Yesterday', 'Dispatch DD0100']);
    expect(screen.bold()).toEqual(['Asha', 'Asha']);
    expect(screen.status()).toBe('15 Jun – 12 Oct · Showing 2 of 4 · Last updated 10:00 am');

    await screen.search('chilli');
    expect(screen.dispatchRows()).toEqual(['Yesterday', 'Dispatch DD0009']);
    // The item is not on the closed card, so the card names it, with the word in bold.
    expect(screen.texts()).toContain('Red chilli');
    expect(screen.bold()).toEqual(['chilli']);
    expect(screen.controls(label => label.startsWith('Dispatch DD0009,'))[0].props.accessibilityLabel).toMatch(/, Red chilli$/);

    await screen.press('Clear all filters and the search');
    expect(screen.dispatchRows()).toEqual(BY_DATE);
    expect(screen.has('Sorted by Date, newest first. Change sort')).toBe(true);
  });

  it('opens the dispatch from its own target beside the card, and the card itself shows the items', async () => {
    mockParams = GREEN;
    const screen = await open(makeStore());
    const card = screen.controls(label => label.startsWith('Dispatch DD0010,'))[0];
    const openTarget = screen.control('Open dispatch DD0010');
    expect(card.props.accessibilityLabel).toBe('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    expect(card.props.accessibilityState).toEqual({ expanded: false });
    // Siblings, not one inside the other: no pressable around the open target.
    for (let node = openTarget.parent; node; node = node.parent) {
      expect(typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string').toBe(false);
    }
    expect(screen.texts()).not.toContain('Garlic');

    await screen.press('Open dispatch DD0010');
    expect(mockRouterPush).toHaveBeenCalledWith('/dispatch-details/d1');
    expect(screen.texts()).not.toContain('Garlic');

    await screen.press('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    expect(screen.control('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags').props.accessibilityState).toEqual({ expanded: true });
    expect(screen.texts()).toEqual(expect.arrayContaining(['Garlic', 'GV', 'GRN A0010 · B-14', 'of 60', '2,600 kg']));
    // The item row reads everything it shows.
    await screen.press('Garlic, 50 bags of 60, 2,600 kg, GRN A0010, Rack B-14, mark GV');
    expect(mockRouterPush).toHaveBeenLastCalledWith('/grn-details/g1');
    // An item without a source GRN id is read but opens nothing.
    await screen.press('Dispatch DD0009, 11 Oct 2026, Ravi Example, 200 bags');
    expect(screen.has('Red chilli, 200 bags, GRN A0009')).toBe(false);
    expect(screen.tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Red chilli, 200 bags, GRN A0009' && node.props.accessible === true)).toHaveLength(1);

    await screen.press('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    expect(screen.texts()).not.toContain('Garlic');
  });

  it('a customer account with one customer: that customer at once, and again for a new period; never the list', async () => {
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c1', ...days('2026-06-15') }]]);
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 364 days');
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c1', ...days('2026-06-15') }], [{ customerId: 'c1', ...days('2025-10-14') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    // Its only customer: nothing to change to.
    expect(screen.has('Change customer')).toBe(false);
  });

  it('opened for a named customer: that customer only, and again for a new period', async () => {
    mockParams = { customerId: 'c7', customerName: 'Example Agro' };
    const screen = await open(makeStore());
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c7', ...days('2026-06-15') }], [{ customerId: 'c7', ...days('2026-02-15') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    expect(screen.texts()).toContain('Example Agro');
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const screen = await open(makeStore(account));
    expect(allActivity).not.toHaveBeenCalled();
    expect(customerActivity).not.toHaveBeenCalled();
    expect(screen.texts()).toEqual(expect.arrayContaining(['No customer linked', 'No customer is linked to your account. Ask your facility to add one.']));
    expect(screen.texts()).not.toContain('Riverbank Produce');
    expect(screen.has('Try again')).toBe(false);
  });

  it('suggests a longer period when empty, but not at the longest period', async () => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue({ success: true, message: '', data: { summary: { total_dispatches: 0, total_quantity: 0, total_weight: 0 }, dispatches: [] } } as never);
    const screen = await open(makeStore());
    expect(screen.texts()).toEqual(expect.arrayContaining(['No dispatches in this period', 'This customer has no dispatches in the selected period. Choose a longer period to see more.']));
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 420 days');
    expect(screen.texts()).toContain('No dispatches in this period');
    expect(screen.texts()).not.toContain('This customer has no dispatches in the selected period. Choose a longer period to see more.');
    expect(screen.texts()).not.toContain('Items you create appear here.');
  });

  it('says what failed and why when the report could not be read', async () => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    const screen = await open(makeStore());
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't load dispatch activity", 'The facility refused this report.', 'Try again']));
  });
});

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('dispatch activity in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  const flat = (node: ReactTestInstance) =>
    (StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style) ?? {}) as Record<string, unknown>;

  it('draws both levels on theme tokens', async () => {
    const theme = { preference: mode, brand };
    const list = await open(makeStore(STAFF, undefined, theme));
    expect(flat(list.tree.root.findAllByType('View' as never)[0]).backgroundColor).toBe(t.background.base);
    expect(flat(list.controls(label => label.startsWith('Green Valley Traders,'))[0]).backgroundColor).toBe(t.surface.card);
    act(() => mounted.splice(0).forEach(tree => tree.unmount()));

    mockParams = GREEN;
    const one = await open(makeStore(STAFF, undefined, theme));
    const card = one.tree.root.findAll(node => (node.type as unknown) === 'View' && flat(node).borderRadius !== undefined && flat(node).backgroundColor === t.surface.card);
    expect(card.length).toBeGreaterThan(0);
    await one.press('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    const itemRow = one.controls(label => label.startsWith('Garlic,'))[0];
    expect(flat(itemRow).backgroundColor).toBe(t.background.base);
    const mark = one.tree.root.findAll(node => (node.type as unknown) === 'Text' && node.props.children === 'GV')[0];
    expect(flat(mark).color).toBe(t.status.neutral.text);
  });
});
