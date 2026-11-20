/**
 * The dispatch activity report with a real store: the period, sort, search and
 * "Clear all" are worked through the filter bar and the search field as a
 * person would, and what the report remembers is read back from the store,
 * also by a new screen after a restart. The report PDF is shared from the
 * header at both levels. Only the services, the share sheet, the alert and the
 * router are stand-ins. The rows are made so that every change gives an order
 * of its own.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { resetReportExportAvailability } from '@/features/reports/useReportExport';
import { generateReportPDF, type ReportPdfResult } from '@/services/pdf-service';
import { getAllDispatchActivity, getCustomerDispatchActivity } from '@/services/reporting';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { sanitizeReportPrefs, type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, fontWeight, getTokens, touchTarget, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import { showAlert } from '@/utils/alert';
import { downloadAndSharePDF } from '@/utils/shareDocument';
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
  onOperatorServerChange: () => () => {},
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('@/services/reporting', () => ({ getAllDispatchActivity: jest.fn(), getCustomerDispatchActivity: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateReportPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const allActivity = jest.mocked(getAllDispatchActivity);
const customerActivity = jest.mocked(getCustomerDispatchActivity);
const makePdf = jest.mocked(generateReportPDF);
const sharePdf = jest.mocked(downloadAndSharePDF);
const alert = jest.mocked(showAlert);
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
const dispatch = (id: string, number: string, date: string, bags: number, supervisor: string, kg: number, items: unknown[]) => ({
  disp_id: id,
  disp_no: number,
  disp_date: date,
  supervisor_name: supervisor,
  total_qty: bags,
  total_weight: kg,
  items,
});
// What a server sends today (backend migration 58): every dispatch has `total_weight` and every
// line `weight`, and both are TOTALS: the bags times the weight of one bag (Garlic: 50 bags of
// 52 kg = 2,600 kg). Total weights are not shown, so none of these numbers may reach the screen,
// drawn or read. By weight the dispatches would be DD0100, DD0010, DD0050, DD0009 (highest first),
// an order no other sort gives: DD0010, DD0009, DD0100, DD0050 by date, DD0100, DD0050, DD0010,
// DD0009 by number and DD0009, DD0100, DD0010, DD0050 by bags.
const DISPATCHES = [
  dispatch('d1', 'DD0010', '2026-10-12', 50, 'Asha Example', 2600, [
    item('Garlic', { qty: 50, orig_qty: 60, weight: 2600, source_grn: 'A0010', source_grn_id: 'g1', rack: 'B-14', package_mark: 'GV' }),
  ]),
  dispatch('d2', 'DD0009', '2026-10-11', 200, 'Ravi Example', 900, [item('Red chilli', { qty: 200, weight: 900, source_grn: 'A0009' })]),
  dispatch('d3', 'DD0100', '2026-10-11', 120, 'Asha Example', 6100.5, [item('Cumin', { qty: 120, weight: 6100.5, source_grn: 'A0100' })]),
  dispatch('d4', 'DD0050', '2026-09-20', 20, 'Meera Example', 2000, [item('Turmeric', { qty: 20, weight: 2000, source_grn: 'A0050' })]),
];
const answerDispatches = {
  success: true,
  message: '',
  data: { summary: { total_dispatches: 4, total_quantity: 390, total_weight: 11600.5 }, dispatches: DISPATCHES },
};
/** Every weight in `answerDispatches`, as the screen would have worded it: the dispatches' and the lines'. */
const TOTAL_WEIGHTS = ['2,600 kg', '900 kg', '6,100.5 kg', '2,000 kg'];
// The same four dispatches from a server without that migration: no weight on a dispatch (the
// service maps it to 0) or on a line. The report must look the same for both.
const answerUnweighed = {
  success: true,
  message: '',
  data: {
    summary: { total_dispatches: 4, total_quantity: 390, total_weight: 0 },
    dispatches: DISPATCHES.map(row => ({ ...row, total_weight: 0, items: row.items.map(line => ({ ...(line as Record<string, unknown>), weight: undefined })) })),
  },
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

type Host = NonNullable<typeof screen.root>;
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
  resetReportExportAvailability();
  sharePdf.mockResolvedValue({ success: true });
});
afterEach(() => {
  jest.useRealTimers();
});

const textOf = (node: Host | string): string => (typeof node === 'string' ? node : node.children.map(textOf).join(''));
/** Every host element drawn, in the order drawn (styles, list order and nesting have no role or text to query by). */
function hosts(): Host[] {
  const found: Host[] = [];
  const visit = (node: Host | string) => {
    if (typeof node === 'string') return;
    found.push(node);
    node.children.forEach(visit);
  };
  visit(screen.root!);
  return found;
}
const labelOf = (node: Host): string => (typeof node.props.accessibilityLabel === 'string' ? node.props.accessibilityLabel : '');
/** A host that takes a press (a Pressable's host takes the responder). */
const isPressable = (node: Host) => typeof node.props.onStartShouldSetResponder === 'function';
/** Lets the promises behind a query answer run, and the screen draw what they bring. */
const settle = () =>
  act(async () => {
    await settleQueries();
  });

async function open(store: Store) {
  mockStore = store;
  const user = userEvent.setup();
  await render(<DispatchActivityScreen />);
  await settle();

  const controls = (match: (label: string) => boolean) => hosts().filter(node => isPressable(node) && labelOf(node) !== '' && match(labelOf(node)));
  /** The control with this label: by its role and name, else any pressable with that label. */
  const find = (label: string): Host | undefined =>
    (['button', 'radio'] as const).flatMap(role => screen.queryAllByRole(role, { name: label }))[0] ?? screen.queryAllByLabelText(label).find(isPressable);
  const control = (label: string): Host => {
    const found = find(label);
    if (!found) throw new Error(`No control labelled "${label}"`);
    return found;
  };
  const texts = () => hosts().filter(node => node.type === 'Text').map(textOf);
  const field = () => screen.getByPlaceholderText(/search/i);
  return {
    texts,
    control,
    controls,
    press: async (label: string) => {
      await user.press(control(label));
      await settle();
    },
    has: (label: string) => find(label) !== undefined,
    /** Customer names in the order the rows show them (each card is read as "name, facts"). */
    customers: () => controls(label => ALL_CUSTOMERS.some(name => label.startsWith(`${name}, `))).map(node => labelOf(node).split(', ')[0]),
    /** Dispatch cards and date headings in the order they are drawn. */
    dispatchRows: () =>
      hosts()
        .filter(node => node.type === 'Text' && (node.props.accessibilityRole === 'header' || /^Dispatch DD\d+$/.test(textOf(node))))
        .map(textOf)
        // Not the screen's title, nor the heading of the sort sheet while it is open.
        .filter(text => text !== 'Dispatch activity' && text !== 'Sort by'),
    status: () => texts().find(text => text.includes('Last updated')),
    search: async (text: string) => {
      await user.clear(field());
      // Submitting commits at once, without waiting for the field's 300 ms pause.
      await user.type(field(), text, { submitEditing: true });
      await settle();
    },
    searchValue: () => field().props.value as string,
    /** The sort field choices of the open sort sheet, in the order they are drawn. */
    sortOptions: () => within(screen.getByLabelText('Sort by')).queryAllByRole('radio').map(labelOf),
    /** The accessibility label of every dispatch card, in the order they are drawn. */
    cardLabels: () => [...new Set(controls(label => /^Dispatch DD\d+,/.test(label)).map(labelOf))],
    /** Every text on the screen that states a weight, in the order they are drawn. There must be none. */
    weights: () => texts().filter(text => /\bkg\b|કિલો/.test(text)),
    /** The same in what a screen reader says: every label on the screen that states a weight. */
    spokenWeights: () => [...new Set(hosts().map(labelOf).filter(label => /\bkg\b|કિલો/.test(label)))],
    list: () => hosts().find(node => node.type === 'FlashList')!,
    refresh: async () => {
      await act(async () => {
        hosts().find(node => node.type === 'FlashList')!.props.refreshControl.props.onRefresh();
        await settleQueries();
      });
    },
    bold: () => hosts().filter(node => node.type === 'Text' && StyleSheet.flatten(node.props.style)?.fontWeight === fontWeight.bold).map(textOf),
    unmount: () => screen.unmount(),
  };
}

const ALL_CUSTOMERS = ['Riverbank Produce', 'Green Valley Traders', 'Sunrise Agro Foods', 'Hillside Produce Co', 'Old Mill Stores'];

const DEFAULT_ORDER = ['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co'];
const BY_DATE = ['Today', 'Dispatch DD0010', 'Yesterday', 'Dispatch DD0009', 'Dispatch DD0100', '20/09/26', 'Dispatch DD0050'];
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });
const GREEN = { customerId: 'c2', customerName: 'Green Valley Traders' };

// ---------------------------------------------------------------------------

describe('dispatch activity, every customer', () => {
  it('asks for the last 120 days, and asks again for 240 days when that period is chosen', async () => {
    const report = await open(makeStore());
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(report.customers()).toEqual(DEFAULT_ORDER);
    expect(report.status()).toBe('15/06/26 – 12/10/26 · Last updated 10:00 am');
    expect(report.texts()).toEqual(expect.arrayContaining(['Dispatches', '27', 'Units dispatched', '550']));

    await report.press('Period: Last 120 days. Change');
    await report.press('Last 240 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(report.has('Period: Last 240 days. Change')).toBe(true);
    expect(report.status()).toBe('15/02/26 – 12/10/26 · Last updated 10:00 am');
    expect(report.customers()).toEqual([...DEFAULT_ORDER, 'Old Mill Stores']);

    // One request for each new period, reaching further back to the same day.
    await report.press('Period: Last 240 days. Change');
    await report.press('Last 420 days');
    expect(allActivity.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')], [days('2025-08-19')]]);
    expect(customerActivity).not.toHaveBeenCalled();
  });

  it('says what a search found nothing for, and its clear action brings the customers back', async () => {
    const report = await open(makeStore());
    // The list scrolls with the keyboard open, and a tap on a row is not swallowed by it.
    expect(report.list().props.keyboardShouldPersistTaps).toBe('handled');
    await report.search('zzzz');
    expect(report.customers()).toEqual([]);
    expect(report.texts()).toContain('No customers match "zzzz"');
    await report.press('Clear search and filters');
    expect(report.customers()).toEqual(DEFAULT_ORDER);
  });

  it('orders the rows by the field chosen in the sort sheet, and the other direction reverses them', async () => {
    const report = await open(makeStore());
    await report.press('Sorted by Units, highest first. Change sort');
    await report.press('Customer');
    // The field changed and the direction was kept: Z to A.
    expect(report.customers()).toEqual(['Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co', 'Green Valley Traders']);
    await report.press('A to Z');
    expect(report.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods']);
    await report.press('Dispatches');
    expect(report.customers()).toEqual(['Green Valley Traders', 'Sunrise Agro Foods', 'Riverbank Produce', 'Hillside Produce Co']);
    await report.press('Highest first');
    expect(report.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders']);
    // Sorting is done on the rows already read: nothing more is asked.
    expect(allActivity).toHaveBeenCalledTimes(1);
  });

  it('narrows to the customers a search finds, in bold, and Clear all brings the rest back with the period and sort kept', async () => {
    const report = await open(makeStore());
    await report.press('Period: Last 120 days. Change');
    await report.press('Last 240 days');
    await report.press('Sorted by Units, highest first. Change sort');
    await report.press('Customer');
    await report.press('A to Z');
    await report.press('Close');

    await report.search('produce');
    expect(report.customers()).toEqual(['Hillside Produce Co', 'Riverbank Produce']);
    expect(report.bold()).toEqual(['Produce', 'Produce']);
    expect(report.status()).toBe('15/02/26 – 12/10/26 · Showing 2 of 5 · Last updated 10:00 am');

    await report.press('Clear all filters and the search');
    expect(report.customers()).toEqual(['Green Valley Traders', 'Hillside Produce Co', 'Old Mill Stores', 'Riverbank Produce', 'Sunrise Agro Foods']);
    expect(report.searchValue()).toBe('');
    expect(report.bold()).toEqual([]);
    expect(report.has('Period: Last 240 days. Change')).toBe(true);
    expect(report.has('Sorted by Customer, A to Z. Change sort')).toBe(true);
    expect(allActivity).toHaveBeenCalledTimes(2);
  });

  it('opens a customer as a route and remembers it; after a restart the period, sort and that customer are back', async () => {
    const store = makeStore();
    const report = await open(store);
    await report.press('Period: Last 120 days. Change');
    await report.press('Last 240 days');
    await report.press('Sorted by Units, highest first. Change sort');
    await report.press('Dispatches');
    await report.press('Close');
    const byDispatches = ['Hillside Produce Co', 'Riverbank Produce', 'Sunrise Agro Foods', 'Green Valley Traders', 'Old Mill Stores'];
    expect(report.customers()).toEqual(byDispatches);
    expect(report.texts()).not.toContain('Last opened');

    await report.press('Riverbank Produce, 9 dispatches, 80 units');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/dispatch-activity', params: { customerId: 'c1', customerName: 'Riverbank Produce' } });
    expect(store.getState().reportPrefs.byScope[SCOPE].lastCustomer).toEqual({ 'dispatch-activity': { id: 'c1', name: 'Riverbank Produce' } });

    // A restart: the screen is gone, the answers in memory are gone, and only the
    // persisted choices come back, read as the app reads them from the phone.
    await report.unmount();
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
    const report = await open(makeStore());
    allActivity.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await report.refresh();
    expect(allActivity).toHaveBeenCalledTimes(2);
    expect(report.customers()).toEqual(DEFAULT_ORDER);
    // The service's own words for a failure are not shown; the screen's are (useReportQuery).
    expect(report.texts()).toEqual(expect.arrayContaining(["Couldn't update. These figures were loaded earlier.", "Couldn't load dispatch activity. Check your connection and try again."]));
  });
});

describe('dispatch activity, one customer', () => {
  it('puts date headings between the dispatches while sorted by date, and none for another sort', async () => {
    mockParams = GREEN;
    const report = await open(makeStore());
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c2', ...days('2026-06-15') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    expect(report.dispatchRows()).toEqual(BY_DATE);

    await report.press('Sorted by Date, newest first. Change sort');
    await report.press('Units');
    expect(report.dispatchRows()).toEqual(['Dispatch DD0009', 'Dispatch DD0100', 'Dispatch DD0010', 'Dispatch DD0050']);
    await report.press('Dispatch number');
    expect(report.dispatchRows()).toEqual(['Dispatch DD0100', 'Dispatch DD0050', 'Dispatch DD0010', 'Dispatch DD0009']);
    await report.press('Lowest number first');
    expect(report.dispatchRows()).toEqual(['Dispatch DD0009', 'Dispatch DD0010', 'Dispatch DD0050', 'Dispatch DD0100']);
    await report.press('Close');
    // With no heading above it, each card gives its own date.
    expect(report.texts()).toEqual(expect.arrayContaining(['11/10/26', '12/10/26', '20/09/26']));

    await report.press('Sorted by Dispatch number, lowest number first. Change sort');
    await report.press('Date');
    await report.press('Close');
    expect(report.dispatchRows()).toEqual(['20/09/26', 'Dispatch DD0050', 'Yesterday', 'Dispatch DD0009', 'Dispatch DD0100', 'Today', 'Dispatch DD0010']);
    expect(customerActivity).toHaveBeenCalledTimes(1);
  });

  const CARD_LABELS = [
    'Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags',
    'Dispatch DD0009, 11 Oct 2026, Ravi Example, 200 bags',
    'Dispatch DD0100, 11 Oct 2026, Asha Example, 120 bags',
    'Dispatch DD0050, 20 Sep 2026, Meera Example, 20 bags',
  ];

  it('total weights in the answer (a dispatch\'s and each line\'s): none is drawn or read, closed or open, and the sorts are Date, Dispatch number and Bags', async () => {
    mockParams = GREEN;
    const report = await open(makeStore());
    // The answer does carry them: 2,600 kg, 900 kg, 6,100.5 kg and 2,000 kg, on the dispatch and on its line.
    expect(customerActivity).toHaveBeenCalledTimes(1);
    expect(DISPATCHES.map(row => row.total_weight)).toEqual([2600, 900, 6100.5, 2000]);
    expect(DISPATCHES.map(row => (row.items[0] as { weight: number }).weight)).toEqual([2600, 900, 6100.5, 2000]);

    expect(report.weights()).toEqual([]);
    expect(report.spokenWeights()).toEqual([]);
    expect(report.cardLabels()).toEqual(CARD_LABELS);

    // Open every card: the lines show their bags, GRN and rack, and no weight either.
    for (const label of CARD_LABELS) await report.press(label);
    expect(report.texts()).toEqual(expect.arrayContaining(['Garlic', 'Red chilli', 'Cumin', 'Turmeric', 'GRN A0010 · B-14', 'of 60']));
    expect(report.weights()).toEqual([]);
    expect(report.spokenWeights()).toEqual([]);
    for (const weight of TOTAL_WEIGHTS) expect(report.texts().some(text => text.includes(weight))).toBe(false);
    expect(report.has('Garlic, 50 bags of 60, GRN A0010, Rack B-14, mark GV')).toBe(true);

    await report.press('Sorted by Date, newest first. Change sort');
    expect(report.sortOptions()).toEqual(['Date', 'Dispatch number', 'Units']);
    expect(report.has('Weight')).toBe(false);
  });

  it('a server that sends no weights: the same cards, labels and sorts', async () => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue(answerUnweighed as never);
    const report = await open(makeStore());
    expect(report.dispatchRows()).toEqual(BY_DATE);
    expect(report.weights()).toEqual([]);
    expect(report.cardLabels()).toEqual(CARD_LABELS);

    await report.press('Sorted by Date, newest first. Change sort');
    expect(report.sortOptions()).toEqual(['Date', 'Dispatch number', 'Units']);
    expect(report.has('Weight')).toBe(false);
  });

  it('a Weight sort this phone remembers from an earlier version: the report opens on Date, newest first (chip, order, sort sheet, PDF), though the answer has weights', async () => {
    mockParams = GREEN;
    const remembered = sanitizeReportPrefs({
      byScope: { [SCOPE]: { sort: { 'report-dispatch-activity-customer': { field: 'weight', order: 'asc' } }, usedAt: 1 } },
    });
    // The stored choice is read back as it was written (a sort by weight, lowest first)...
    expect(remembered.byScope[SCOPE].sort['report-dispatch-activity-customer']).toEqual({ field: 'weight', order: 'asc' });
    const report = await open(makeStore(STAFF, remembered));
    // ...but the report offers no such sort any more, so it opens on its default. Had the weight sort been
    // applied, the order would be DD0009, DD0050, DD0010, DD0100 with no date headings.
    expect(report.has('Sorted by Date, newest first. Change sort')).toBe(true);
    expect(report.has('Sorted by Weight, lowest first. Change sort')).toBe(false);
    expect(report.dispatchRows()).toEqual(BY_DATE);
    expect(report.dispatchRows()).not.toEqual(['Dispatch DD0009', 'Dispatch DD0050', 'Dispatch DD0010', 'Dispatch DD0100']);

    await report.press('Sorted by Date, newest first. Change sort');
    expect(report.sortOptions()).toEqual(['Date', 'Dispatch number', 'Units']);
    expect(report.has('Weight')).toBe(false);
    await report.press('Close');

    makePdf.mockResolvedValueOnce({ success: true, pdfUrl: PDF_URL });
    await report.press('Share PDF');
    expect(makePdf.mock.calls).toEqual([[{ report: 'dispatch-activity', customer_id: 'c2', from: '2026-06-15', to: '2026-10-12', sort: { field: 'date', order: 'desc' } }]]);

    // A sort chosen now replaces the remembered one, and is what the next opening finds.
    await report.press('Sorted by Date, newest first. Change sort');
    await report.press('Units');
    await report.press('Close');
    expect(report.has('Sorted by Units, highest first. Change sort')).toBe(true);
    expect(report.dispatchRows()).toEqual(['Dispatch DD0009', 'Dispatch DD0100', 'Dispatch DD0010', 'Dispatch DD0050']);
    expect(mockStore.getState().reportPrefs.byScope[SCOPE].sort['report-dispatch-activity-customer']).toEqual({ field: 'bags', order: 'desc' });
  });

  it('finds dispatches by supervisor and by an item inside the card, names that item, and Clear all keeps the sort', async () => {
    mockParams = GREEN;
    const report = await open(makeStore());
    await report.search('asha');
    expect(report.dispatchRows()).toEqual(['Today', 'Dispatch DD0010', 'Yesterday', 'Dispatch DD0100']);
    expect(report.bold()).toEqual(['Asha', 'Asha']);
    expect(report.status()).toBe('15/06/26 – 12/10/26 · Showing 2 of 4 · Last updated 10:00 am');

    await report.search('chilli');
    expect(report.dispatchRows()).toEqual(['Yesterday', 'Dispatch DD0009']);
    // The item is not on the closed card, so the card names it, with the word in bold.
    expect(report.texts()).toContain('Red chilli');
    expect(report.bold()).toEqual(['chilli']);
    expect(report.controls(label => label.startsWith('Dispatch DD0009,'))[0].props.accessibilityLabel).toMatch(/, Red chilli$/);

    await report.press('Clear all filters and the search');
    expect(report.dispatchRows()).toEqual(BY_DATE);
    expect(report.has('Sorted by Date, newest first. Change sort')).toBe(true);
  });

  it('opens the dispatch from its own target beside the card, and the card itself shows the items', async () => {
    mockParams = GREEN;
    const report = await open(makeStore());
    const card = report.controls(label => label.startsWith('Dispatch DD0010,'))[0];
    const openTarget = report.control('Open dispatch DD0010');
    expect(card.props.accessibilityLabel).toBe('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    expect(card).toBeCollapsed();
    // Siblings, not one inside the other: no pressable around the open target.
    for (let node = openTarget.parent; node; node = node.parent) {
      expect(isPressable(node) && labelOf(node) !== '').toBe(false);
    }
    expect(report.texts()).not.toContain('Garlic');

    await report.press('Open dispatch DD0010');
    expect(mockRouterPush).toHaveBeenCalledWith('/dispatch-details/d1');
    expect(report.texts()).not.toContain('Garlic');

    await report.press('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    expect(report.control('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags')).toBeExpanded();
    expect(report.texts()).toEqual(expect.arrayContaining(['Garlic', 'GV', 'GRN A0010 · B-14', 'of 60']));
    // The line's 2,600 kg (50 bags × 52 kg) is a total: not drawn.
    expect(report.texts()).not.toContain('2,600 kg');
    expect(report.weights()).toEqual([]);
    // The item row reads everything it shows, and no weight.
    await report.press('Garlic, 50 bags of 60, GRN A0010, Rack B-14, mark GV');
    expect(mockRouterPush).toHaveBeenLastCalledWith('/grn-details/g1');
    // An item without a source GRN id is read but opens nothing.
    await report.press('Dispatch DD0009, 11 Oct 2026, Ravi Example, 200 bags');
    expect(report.has('Red chilli, 200 bags, GRN A0009')).toBe(false);
    expect(hosts().filter(node => labelOf(node) === 'Red chilli, 200 bags, GRN A0009' && node.props.accessible === true)).toHaveLength(1);

    await report.press('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    expect(report.texts()).not.toContain('Garlic');
  });

  it('a customer account with one customer: that customer at once, and again for a new period; never the list', async () => {
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const report = await open(makeStore(account));
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c1', ...days('2026-06-15') }]]);
    await report.press('Period: Last 120 days. Change');
    await report.press('Last 364 days');
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c1', ...days('2026-06-15') }], [{ customerId: 'c1', ...days('2025-10-14') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    // Its only customer: nothing to change to.
    expect(report.has('Change customer')).toBe(false);
  });

  it('opened for a named customer: that customer only, and again for a new period', async () => {
    mockParams = { customerId: 'c7', customerName: 'Example Agro' };
    const report = await open(makeStore());
    await report.press('Period: Last 120 days. Change');
    await report.press('Last 240 days');
    expect(customerActivity.mock.calls).toEqual([[{ customerId: 'c7', ...days('2026-06-15') }], [{ customerId: 'c7', ...days('2026-02-15') }]]);
    expect(allActivity).not.toHaveBeenCalled();
    expect(report.texts()).toContain('Example Agro');
  });

  it('asks nothing for a customer account whose route names a customer it is not assigned', async () => {
    mockParams = { customerId: 'c9', customerName: 'Riverbank Produce' };
    const account = { userProfile: { id: 'user-a', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }] } };
    const report = await open(makeStore(account));
    expect(allActivity).not.toHaveBeenCalled();
    expect(customerActivity).not.toHaveBeenCalled();
    expect(report.texts()).toEqual(expect.arrayContaining(['No customer linked', 'No customer is linked to your account. Ask your facility to link one.']));
    expect(report.texts()).not.toContain('Riverbank Produce');
    expect(report.has('Try again')).toBe(false);
  });

  it('suggests a longer period when empty, but not at the longest period', async () => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue({ success: true, message: '', data: { summary: { total_dispatches: 0, total_quantity: 0, total_weight: 0 }, dispatches: [] } } as never);
    const report = await open(makeStore());
    expect(report.texts()).toEqual(expect.arrayContaining(['No dispatches in this period', 'This customer has no dispatches in the selected period. Choose a longer period to see more.']));
    await report.press('Period: Last 120 days. Change');
    await report.press('Last 420 days');
    expect(report.texts()).toContain('No dispatches in this period');
    expect(report.texts()).not.toContain('This customer has no dispatches in the selected period. Choose a longer period to see more.');
    expect(report.texts()).not.toContain('Items you create appear here.');
  });

  it('says what failed and why when the report could not be read', async () => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    const report = await open(makeStore());
    // Not an access refusal: the screen's own words, not the service's.
    expect(report.texts()).toEqual(expect.arrayContaining(["Couldn't load dispatch activity", "Couldn't load dispatch activity. Check your connection and try again.", 'Try again']));
    expect(report.texts()).not.toContain('The facility refused this report.');
  });
});

// ---------------------------------------------------------------------------
// The card's layout
// ---------------------------------------------------------------------------

/** The host elements directly under a node. */
const hostChildren = (node: Host): Host[] => node.children.filter((child): child is Host => typeof child !== 'string');
/** A node and every host element under it. */
const under = (node: Host): Host[] => [node, ...hostChildren(node).flatMap(under)];
const hostParent = (node: Host): Host => node.parent!;
type Outline = string | Outline[];
/** A card as it is built: a text is its words, an icon its name, a box the list of what is in it. */
const outline = (node: Host): Outline =>
  node.type === 'Text' ? textOf(node) : node.type === 'Icon' ? `icon ${node.props.name}` : hostChildren(node).map(outline);
const styleOf = (node: Host) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;

describe('dispatch activity, the layout of a dispatch card', () => {
  /** The pressable head of the card of a dispatch (the part that shows its items), as the phone draws it. */
  const head = (report: Awaited<ReturnType<typeof open>>, number: string) =>
    report.controls(label => label.startsWith(`Dispatch ${number},`))[0];
  const text = (inside: Host, words: string) => under(inside).find(node => node.type === 'Text' && textOf(node) === words)!;
  const AVATAR = ['icon truck-delivery-outline'];

  // The card had a second shape for a dispatch with a weight (the weight on a line of its own under
  // the title and the bags). Total weights are not shown, so the shape below is the only one.
  it('a card is built in one shape though the answer has total weights: the texts in one column, the bags in theirs, nothing more', async () => {
    mockParams = GREEN;
    const report = await open(makeStore());
    // Sorted by date the heading above gives the day; any other sort puts it on the card.
    expect(outline(head(report, 'DD0010'))).toEqual([AVATAR, ['Dispatch DD0010', 'Asha Example'], ['50', 'bags'], 'icon chevron-down']);
    await report.press('Sorted by Date, newest first. Change sort');
    await report.press('Units');
    await report.press('Close');
    const card = head(report, 'DD0009');
    expect(outline(card)).toEqual([AVATAR, ['Dispatch DD0009', 'Ravi Example', '11/10/26'], ['200', 'bags'], 'icon chevron-down']);
    // Every card of the list has that shape, whatever its total weight (900 kg to 6,100.5 kg).
    const shape = (value: Outline): Outline => (typeof value === 'string' ? (value.startsWith('icon ') ? value : 'text') : value.map(shape));
    const shapes = ['DD0100', 'DD0010', 'DD0050', 'DD0009'].map(number => JSON.stringify(shape(outline(head(report, number)))));
    expect(new Set(shapes)).toEqual(new Set([JSON.stringify([['icon truck-delivery-outline'], ['text', 'text', 'text'], ['text', 'text'], 'icon chevron-down'])]));

    // The row and its two columns: the texts take the room the bags leave, the bags end at the right.
    const [, texts, bags] = hostChildren(card);
    expect(styleOf(card)).toMatchObject({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 4, minHeight: 72 });
    expect(styleOf(texts)).toEqual({ flex: 1, gap: 2 });
    expect(styleOf(bags)).toEqual({ alignItems: 'flex-end' });
    expect(under(bags).filter(node => node.type === 'Text').map(textOf)).toEqual(['200', 'bags']);
    // No line of the card wraps as a row, and nothing is pushed to an edge by a margin: the
    // weight's own line, which did both, is gone.
    for (const box of under(card).filter(node => node.type === 'View' || node.type === 'Text')) {
      expect(styleOf(box).flexWrap).toBeUndefined();
      expect(styleOf(box).marginLeft).toBeUndefined();
    }
    // No number is cut: neither the bags nor the dispatch number has a line limit.
    for (const words of ['200', 'Dispatch DD0009']) {
      expect(text(card, words).props.numberOfLines).toBeUndefined();
      expect(text(card, words).props.ellipsizeMode).toBeUndefined();
    }
    // A found item is named under the date, in the texts' column.
    await report.search('chilli');
    expect(outline(head(report, 'DD0009'))).toEqual([AVATAR, ['Dispatch DD0009', 'Ravi Example', '11/10/26', 'Red chilli'], ['200', 'bags'], 'icon chevron-down']);
    expect(report.weights()).toEqual([]);
  });

  it.each([
    ['total weights in the answer', answerDispatches],
    ['a server that sends no weights', answerUnweighed],
  ])('the two controls at the right keep their targets, and the card is the same card: %s', async (_name, answer) => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue(answer as never);
    const report = await open(makeStore());
    expect(outline(head(report, 'DD0009'))).toEqual([AVATAR, ['Dispatch DD0009', 'Ravi Example'], ['200', 'bags'], 'icon chevron-down']);
    expect(outline(head(report, 'DD0010'))).toEqual([AVATAR, ['Dispatch DD0010', 'Asha Example'], ['50', 'bags'], 'icon chevron-down']);

    for (const number of ['DD0009', 'DD0010']) {
      // Showing the items is the whole head (at least an object cell high); opening the dispatch is its own target.
      const toggle = head(report, number);
      expect(styleOf(toggle)).toMatchObject({ flex: 1, minHeight: 72 });
      expect(hostChildren(toggle).map(outline).slice(-1)).toEqual(['icon chevron-down']);
      const openTarget = report.control(`Open dispatch ${number}`);
      expect(styleOf(openTarget)).toMatchObject({ width: touchTarget, minHeight: touchTarget });
      expect(hostParent(openTarget)).toBe(hostParent(toggle));
    }
  });
});

const MODES: Mode[] = ['light', 'dark'];
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
async function sharesThePdf(report: Awaited<ReturnType<typeof open>>, request: Record<string, unknown>, filename: string, label = 'Share PDF') {
  let answer!: (result: ReportPdfResult) => void;
  makePdf.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  await report.press(label);
  expect(makePdf.mock.calls).toEqual([[request]]);
  for (const field of ['customer_id', 'from', 'to', 'sort']) {
    if (!(field in request)) expect(makePdf.mock.calls[0][0]).not.toHaveProperty(field);
  }
  expect(report.control(label)).toBeBusy();
  expect(sharePdf).not.toHaveBeenCalled();
  await act(async () => {
    answer({ success: true, pdfUrl: PDF_URL });
    await settleQueries();
  });
  expect(sharePdf.mock.calls).toEqual([[PDF_URL, filename]]);
  expect(report.control(label)).not.toBeBusy();
  expect(alert).not.toHaveBeenCalled();

  makePdf.mockResolvedValueOnce({ success: false, reason: 'forbidden', error: NOT_AVAILABLE });
  await report.press(label);
  expect(alert.mock.calls).toEqual([["Couldn't create the PDF", NOT_AVAILABLE]]);
  expect(sharePdf).toHaveBeenCalledTimes(1);
  expect(report.has(label)).toBe(true);

  makePdf.mockResolvedValueOnce({ success: false, reason: 'server-outdated', error: NEEDS_UPDATE });
  await report.press(label);
  expect(alert.mock.calls[1]).toEqual(["Couldn't create the PDF", NEEDS_UPDATE]);
  expect(report.has(label)).toBe(false);
}

describe('dispatch activity, the report PDF', () => {
  it('every customer: shares the period and the sort on screen as the PDF names them, with no customer', async () => {
    const report = await open(makeStore());
    await report.press('Sorted by Units, highest first. Change sort');
    await report.press('Dispatches');
    await report.press('Close');
    expect(report.has('Sorted by Dispatches, highest first. Change sort')).toBe(true);
    await sharesThePdf(
      report,
      { report: 'dispatch-activity', from: '2026-06-15', to: '2026-10-12', sort: { field: 'dispatches', order: 'desc' } },
      'Dispatch_activity_All_customers_2026_06_15_to_2026_10_12.pdf'
    );
  });

  it('one customer: shares that customer, the period and the sort on screen', async () => {
    mockParams = GREEN;
    const report = await open(makeStore());
    await report.press('Sorted by Date, newest first. Change sort');
    await report.press('Dispatch number');
    await report.press('Close');
    expect(report.has('Sorted by Dispatch number, highest number first. Change sort')).toBe(true);
    await sharesThePdf(
      report,
      { report: 'dispatch-activity', customer_id: 'c2', from: '2026-06-15', to: '2026-10-12', sort: { field: 'disp_no', order: 'desc' } },
      'Dispatch_activity_Green_Valley_Traders_2026_06_15_to_2026_10_12.pdf'
    );
  });
});

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('dispatch activity in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  const flat = (node: Host) =>
    (StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style) ?? {}) as Record<string, unknown>;

  it('draws both levels on theme tokens', async () => {
    const theme = { preference: mode, brand };
    const list = await open(makeStore(STAFF, undefined, theme));
    expect(flat(hosts().find(node => node.type === 'View')!).backgroundColor).toBe(t.background.base);
    expect(flat(list.controls(label => label.startsWith('Green Valley Traders,'))[0]).backgroundColor).toBe(t.surface.card);
    await list.unmount();

    mockParams = GREEN;
    const one = await open(makeStore(STAFF, undefined, theme));
    const card = hosts().filter(node => node.type === 'View' && flat(node).borderRadius !== undefined && flat(node).backgroundColor === t.surface.card);
    expect(card.length).toBeGreaterThan(0);
    await one.press('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 bags');
    const itemRow = one.controls(label => label.startsWith('Garlic,'))[0];
    expect(flat(itemRow).backgroundColor).toBe(t.background.base);
    const mark = hosts().find(node => node.type === 'Text' && node.props.children === 'GV')!;
    expect(flat(mark).color).toBe(t.status.neutral.text);
  });

  it('draws a card on theme tokens: the title and the bags in the primary text colour, the supervisor, the unit and the date in the secondary', async () => {
    mockParams = GREEN;
    const one = await open(makeStore(STAFF, undefined, { preference: mode, brand }));
    await one.press('Sorted by Date, newest first. Change sort');
    await one.press('Units');
    await one.press('Close');
    const find = (words: string) => hosts().find(node => node.type === 'Text' && textOf(node) === words);
    const text = (words: string) => find(words)!;
    expect(flat(text('Dispatch DD0100'))).toMatchObject({ color: t.text.primary, fontWeight: fontWeight.semibold });
    expect(flat(text('Asha Example')).color).toBe(t.text.secondary);
    expect(flat(text('120'))).toMatchObject({ color: t.text.primary, fontWeight: fontWeight.semibold, fontVariant: ['tabular-nums'] });
    expect(flat(text('bags')).color).toBe(t.text.secondary);
    expect(flat(text('11/10/26')).color).toBe(t.text.secondary);
    // The dispatch's 6,100.5 kg is in the answer and not on the card.
    expect(find('6,100.5 kg')).toBeUndefined();
    expect(one.weights()).toEqual([]);
    const card = hosts().filter(node => node.type === 'View' && flat(node).borderRadius !== undefined && flat(node).backgroundColor === t.surface.card);
    expect(card.length).toBeGreaterThan(0);
  });
});

describe('dispatch activity, what a dispatch is counted in (D18)', () => {
  const PACKED = {
    success: true,
    message: '',
    data: {
      summary: { total_dispatches: 3, total_quantity: 90, total_weight: 0 },
      dispatches: [
        dispatch('d1', 'DD0010', '2026-10-12', 50, 'Asha Example', 0, [item('Garlic', { qty: 50, orig_qty: 60, source_grn: 'A0010', source_grn_id: 'g1', packaging: 'Box' })]),
        dispatch('d2', 'DD0009', '2026-10-11', 30, 'Ravi Example', 0, [
          item('Cumin', { qty: 10, source_grn: 'A0100', packaging: 'Box' }),
          item('Turmeric', { qty: 20, source_grn: 'A0050', packaging: 'Bag' }),
        ]),
        dispatch('d3', 'DD0008', '2026-10-10', 10, 'Meera Example', 0, [item('Ginger', { qty: 10, source_grn: 'A0001' })]),
      ],
    },
  };

  it('a Box dispatch reads boxes, a dispatch of mixed packaging reads units, one with none reads bags', async () => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue(PACKED as never);
    const report = await open(makeStore());
    expect(report.cardLabels()).toEqual([
      'Dispatch DD0010, 12 Oct 2026, Asha Example, 50 boxes',
      'Dispatch DD0009, 11 Oct 2026, Ravi Example, 30 units',
      'Dispatch DD0008, 10 Oct 2026, Meera Example, 10 bags',
    ]);
    await report.press('Dispatch DD0010, 12 Oct 2026, Asha Example, 50 boxes');
    expect(report.has('Garlic, 50 boxes of 60, GRN A0010')).toBe(true);
  });

  it('the single-customer tile names the word of every dispatch of the period, and units when they differ', async () => {
    mockParams = GREEN;
    customerActivity.mockResolvedValue(PACKED as never);
    const mixed = await open(makeStore());
    expect(mixed.texts()).toContain('Units dispatched');
    expect(mixed.texts()).not.toContain('Bags dispatched');

    const boxes = {
      ...PACKED,
      data: { ...PACKED.data, dispatches: [PACKED.data.dispatches[0], dispatch('d4', 'DD0007', '2026-10-09', 5, 'Meera Example', 0, [item('Ginger', { qty: 5, source_grn: 'A0001', packaging: 'Box' })])] },
    };
    customerActivity.mockResolvedValue(boxes as never);
    const report = await open(makeStore());
    expect(report.texts()).toContain('Boxes dispatched');
  });
});

