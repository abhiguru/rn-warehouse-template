/**
 * The operations dashboard with a real store: the period chip is worked as a
 * person would and the days asked for are read from the service's arguments.
 * The service, the role hook's profile and the router are stand-ins.
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { getOperationsDashboard } from '@/services/reporting';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer, { setReportPeriod } from '@/store/slices/reportPrefsSlice';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import OperationsDashboardScreen from '../../../../app/reports/operations-dashboard';

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
  useLocalSearchParams: () => ({}),
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Riverside', companyName: 'Riverside Cold Storage' }),
  onOperatorServerChange: () => () => {},
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('@/services/reporting', () => ({ getOperationsDashboard: jest.fn() }));

const dashboard = jest.mocked(getOperationsDashboard);
const ADMIN = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'admin' } };

// The server sends only the days that had events: here GRNs on two days (2 and 3, 5 in all) and a dispatch on one day (1).
const DAILY = { grn_daily: [{ date: '2026-10-01', count: 2 }, { date: '2026-10-02', count: 3 }], dispatch_daily: [{ date: '2026-10-01', count: 1 }] };
const answer = (recent: unknown[], trends: { grn_daily: { date: string; count: number }[]; dispatch_daily: { date: string; count: number }[] } = DAILY) => ({
  success: true,
  message: '',
  data: {
    kpis: { total_grns: 12, total_dispatches: 7, pending_orders: 3, active_customers: 5, total_stock_qty: 1200, total_stock_weight: 5400.5 },
    trends,
    recent_activity: recent,
  },
});
const RECENT = [
  { type: 'grn', ref: 'A0311', customer: 'Green Valley Traders', time: 'Today' },
  // The server sends JSON: a number can arrive as a number.
  { type: 'dispatch', ref: 2026042, customer: 'Riverbank Produce', time: 'Yesterday' },
];

function makeStore(auth: unknown = ADMIN) {
  return configureStore({
    reducer: {
      auth: (state: unknown = auth) => state,
      theme: (state = { preference: 'light', brand: 'orange' }) => state,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
    },
  });
}
type Store = ReturnType<typeof makeStore>;

jest.setTimeout(30_000);
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
  dashboard.mockResolvedValue(answer(RECENT) as never);
});
afterEach(() => {
  jest.useRealTimers();
});

const flat = (node: TestInstance) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const elements = (node: TestInstance): TestInstance[] => node.children.filter((child): child is TestInstance => typeof child !== 'string');
const texts = () => screen.container.queryAll(node => node.type === 'Text').map(node => [node.props.children].flat().join(''));
const status = () => texts().find(text => text.includes('Last updated'));

/**
 * Open the screen. It waits for the first answer (the "Last updated" line) unless the test says the
 * answer is held back or refused.
 */
async function open(store: Store = makeStore(), { waitForAnswer = true } = {}) {
  mockStore = store;
  await render(<OperationsDashboardScreen />);
  if (waitForAnswer) await screen.findByText(/Last updated/);
  return userEvent.setup();
}
/** Wait until the status line reads exactly this (the answer for another period has arrived). */
const statusIs = async (line: string) => expect(await screen.findByText(line)).toBeOnTheScreen();
/** The two figures of "Period averages", as they are read out: "GRNs per day: 0.4". */
const averages = () =>
  screen
    .queryAllByLabelText(/^(GRNs|Dispatches) per day: /)
    .filter(node => node.props.accessible === true)
    .map(node => node.props.accessibilityLabel as string);
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });

describe('the period', () => {
  it('asks for the last 120 days, and for 240 days once that period is chosen on the chip', async () => {
    const user = await open();
    expect(dashboard.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(status()).toBe('15/06/26 – 12/10/26 · Last updated 10:00 am');

    await user.press(screen.getByRole('button', { name: 'Period: Last 120 days. Change' }));
    await user.press(screen.getByText('Last 240 days'));
    await statusIs('15/02/26 – 12/10/26 · Last updated 10:00 am');
    expect(dashboard.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(screen.queryByText('Last 120 days')).not.toBeOnTheScreen();
  });

  it('shows the five figures, the daily averages and the recent activity of the answer', async () => {
    await open();
    expect(texts()).toEqual(
      expect.arrayContaining(['GRNs', 'Dispatches', 'Pending orders', 'Active customers', 'Total stock', 'Period averages', 'LATEST ACTIVITY (ANY DATE)'])
    );
    // Over the 120 days of 15/06/26 to 12/10/26, not over the 2 days (GRNs) and 1 day (dispatches) that had events:
    // 5 GRNs / 120 = 0.04 and 1 dispatch / 120 = 0.008: not zero, and too small for one decimal, so "<0.1" and
    // never "0" (the active-day figures were 2.5 and 1).
    expect(averages()).toEqual(['GRNs per day: <0.1', 'Dispatches per day: <0.1']);
    // generate-report-pdf has no operations dashboard: the header offers no PDF.
    expect(screen.queryByLabelText('Share PDF')).not.toBeOnTheScreen();
    expect(screen.container.queryAll(node => node.props.name === 'file-pdf-box').length).toBe(0);
  });

  it('says what each figure covers: the period\'s GRNs and dispatches, then what is true right now, then the latest activity of any date', async () => {
    const user = await open();
    const headers = () =>
      screen
        .getAllByRole('header')
        .map(node => (node.props.accessibilityLabel as string | undefined) ?? [node.props.children].flat().join(''));
    expect(headers()).toEqual(['Operations dashboard', 'In 15/06/26 – 12/10/26', 'Right now', 'Period averages', 'Latest activity (any date)']);
    // The facility whose figures these are, under the title, and read out as such.
    expect(screen.getByText('Riverside Cold Storage')).toBeOnTheScreen();
    expect(screen.getByLabelText('Facility: Riverside Cold Storage')).toBeOnTheScreen();
    // Each group's figures are under its own heading.
    const shown = texts();
    const at = (words: string) => shown.indexOf(words);
    const order = ['IN 15/06/26 – 12/10/26', 'GRNs', 'Dispatches', 'RIGHT NOW', 'Pending orders', 'Active customers', 'Total stock'].map(at);
    expect(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1]))).toBe(true);
    expect(shown).not.toContain('Recent activity');

    // Last month (all of September): the movement is September's; stock and pending orders are still today's.
    await user.press(screen.getByRole('button', { name: 'Period: Last 120 days. Change' }));
    await user.press(screen.getByText('Last month'));
    expect(await screen.findByLabelText('In 01/09/26 – 30/09/26')).toBeOnTheScreen();
    expect(headers()).toEqual(['Operations dashboard', 'In 01/09/26 – 30/09/26', 'Right now', 'Period averages', 'Latest activity (any date)']);
  });

  it('with no latest activity says none yet under the figures, without naming the period', async () => {
    dashboard.mockResolvedValue(answer([]) as never);
    await open();
    // The list is the latest GRNs and dispatches of any date, so the empty text does not speak of the period.
    expect(screen.getByText('Total stock')).toBeOnTheScreen();
    expect(screen.getByText('No GRNs or dispatches yet. The latest ones appear here.')).toBeOnTheScreen();
    expect(texts().filter(text => /in this period/.test(text))).toEqual([]);
  });

  it('with no activity offers "Show last 420 days", which asks for those days, until that period is chosen', async () => {
    dashboard.mockResolvedValue(answer([]) as never);
    const user = await open();
    expect(status()).toBe('15/06/26 – 12/10/26 · Last updated 10:00 am');
    expect(screen.getByRole('button', { name: 'Show last 420 days' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Show last 420 days' }));
    await statusIs('19/08/25 – 12/10/26 · Last updated 10:00 am');
    expect(dashboard.mock.calls).toEqual([[days('2026-06-15')], [days('2025-08-19')]]);
    expect(screen.queryByRole('button', { name: 'Show last 420 days' })).not.toBeOnTheScreen();
  });
});

// The answer carries the stock's total weight (kpis.total_stock_weight: 5,400.5 kg, every lot's
// bags in stock times the weight of one bag). Total weights are not shown, so "Right now" has
// three tiles, not four, and nothing on the screen states that weight.
describe('the figures: no total weight', () => {
  const before = Dimensions.get('window');
  let release: (() => void) | undefined;
  afterEach(async () => {
    release?.();
    release = undefined;
    // Unmount first: a mounted screen would see the window change outside act.
    await screen.unmount();
    Dimensions.set({ window: before });
  });
  /** A phone 392 dp wide at the given text size. */
  const phone = (fontScale: number, width = 392) => Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } });

  /** A tile is the figure's own card: the view that is read out as one thing and takes its share of the row. */
  const tiles = () => screen.container.queryAll(node => node.type === 'View' && node.props.accessible === true && flat(node).flex === 1 && flat(node).borderRadius !== undefined);
  /** What a screen reader says for each tile. */
  const spoken = () => tiles().map(tile => tile.props.accessibilityLabel as string);
  /** The tiles row by row, each by its label: a row is the parent of its tiles. */
  const rows = () => {
    const byRow = new Map<TestInstance, string[]>();
    for (const tile of tiles()) byRow.set(tile.parent!, [...(byRow.get(tile.parent!) ?? []), (tile.props.accessibilityLabel as string).replace(/: .*$/, '')]);
    return [...byRow.values()];
  };

  it('"Right now" has three tiles, pending orders, active customers and total stock; the 5,400.5 kg of the answer is nowhere', async () => {
    phone(1);
    await open();

    expect(spoken()).toEqual(['GRNs: 12', 'Dispatches: 7', 'Pending orders: 3', 'Active customers: 5', 'Total stock: 1,200']);
    expect(tiles().map(tile => tile.queryAll(node => node.type === 'Icon')[0].props.name)).toEqual([
      'package-down',
      'truck-delivery-outline',
      'clipboard-list-outline',
      'account-group-outline',
      'warehouse',
    ]);
    // No tile, text or label names a weight: not the label, the figure, its unit or its scale icon.
    const shown = texts();
    for (const gone of ['Total weight', '5,400.50', '5,400.5', 'kg']) expect(shown).not.toContain(gone);
    expect(shown.filter(text => /weight|\bkg\b/i.test(text))).toEqual([]);
    expect(screen.container.queryAll(node => typeof node.props.accessibilityLabel === 'string' && /weight|\bkg\b|5,400/i.test(node.props.accessibilityLabel)).length).toBe(0);
    expect(screen.container.queryAll(node => node.props.name === 'scale-balance').length).toBe(0);
  });

  it('lays the three tiles out in one row at ordinary text sizes, the two of the period in a row above them', async () => {
    for (const fontScale of [1, 1.2]) {
      phone(fontScale);
      await open();
      expect(rows()).toEqual([['GRNs', 'Dispatches'], ['Pending orders', 'Active customers', 'Total stock']]);
      await screen.unmount();
      forgetQueries();
    }
  });

  it('above 1.2 times the text size puts two across: total stock alone in a second row, at the width of one tile', async () => {
    for (const fontScale of [1.3, 2]) {
      phone(fontScale);
      await open();
      expect(rows()).toEqual([['GRNs', 'Dispatches'], ['Pending orders', 'Active customers'], ['Total stock']]);
      // The short row is filled out by an empty cell, so the lone tile is not stretched across the screen.
      const lastRow = tiles().at(-1)!.parent!;
      expect(elements(lastRow).length).toBe(2);
      await screen.unmount();
      forgetQueries();
    }
  });

  it('on a tablet all three share one row, a third of the width each', async () => {
    phone(1, 800);
    await open();
    expect(rows()).toEqual([['GRNs', 'Dispatches'], ['Pending orders', 'Active customers', 'Total stock']]);
    expect(elements(tiles().at(-1)!.parent!).length).toBe(3);
  });

  it('while the first answer is awaited, draws five placeholder tiles: as many as the figures that follow', async () => {
    phone(1);
    let answerNow!: (value: unknown) => void;
    dashboard.mockImplementationOnce(() => new Promise(resolve => (answerNow = resolve)) as never);
    // A test that fails before the answer arrives must not leave the request open.
    release = () => answerNow(answer(RECENT));
    await open(makeStore(), { waitForAnswer: false });
    expect(tiles().length).toBe(5);
    expect(tiles().every(tile => tile.props.accessibilityState?.busy === true)).toBe(true);
    expect(screen.getAllByLabelText('Loading figures').length).toBeGreaterThan(0);

    answerNow(answer(RECENT));
    release = undefined;
    await screen.findByText(/Last updated/);
    expect(tiles().length).toBe(5);
    expect(tiles().some(tile => tile.props.accessibilityState?.busy === true)).toBe(false);
  });
});

describe('the daily averages', () => {
  const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
  const week = () => {
    const store = makeStore();
    store.dispatch(setReportPeriod({ scope: SCOPE, period: { from: '2026-10-05', to: '2026-10-11' } }));
    return store;
  };

  it('divide by every day of the period: seven GRNs on one day of a week are 1 a day, not 7', async () => {
    dashboard.mockResolvedValue(
      answer([], { grn_daily: [{ date: '2026-10-07', count: 7 }], dispatch_daily: [{ date: '2026-10-06', count: 2 }, { date: '2026-10-09', count: 1 }] }) as never
    );
    await open(week());
    expect(dashboard.mock.calls).toEqual([[{ fromDate: '2026-10-05', toDate: '2026-10-11' }]]);
    // 7 / 7 days = 1 (by active days it was 7 / 1 = 7); 3 / 7 days = 0.43 (it was 3 / 2 = 1.5).
    expect(averages()).toEqual(['GRNs per day: 1', 'Dispatches per day: 0.4']);
  });

  it('are 0 only for a period with no event on any day', async () => {
    dashboard.mockResolvedValue(answer([], { grn_daily: [], dispatch_daily: [] }) as never);
    await open(week());
    expect(averages()).toEqual(['GRNs per day: 0', 'Dispatches per day: 0']);
  });

  it('count only the days that have come when the period runs past today, and every day of a past month', async () => {
    const user = await open();
    expect(averages()).toEqual(['GRNs per day: <0.1', 'Dispatches per day: <0.1']);

    // This month is 1 to 31/10/26, but today is 12/10/26: 12 days. 5 / 12 = 0.42, 1 / 12 = 0.08 (not 5 / 31 = 0.16).
    await user.press(screen.getByRole('button', { name: 'Period: Last 120 days. Change' }));
    await user.press(screen.getByText('This month'));
    expect(await screen.findByLabelText('GRNs per day: 0.4')).toBeOnTheScreen();
    expect(dashboard.mock.calls.at(-1)).toEqual([{ fromDate: '2026-10-01', toDate: '2026-10-31' }]);
    expect(averages()).toEqual(['GRNs per day: 0.4', 'Dispatches per day: 0.1']);

    // Last month is all 30 days of September: 5 / 30 = 0.17, 1 / 30 = 0.03 (not zero: "<0.1").
    await user.press(screen.getByRole('button', { name: 'Period: This month. Change' }));
    await user.press(screen.getByText('Last month'));
    expect(await screen.findByLabelText('GRNs per day: 0.2')).toBeOnTheScreen();
    expect(dashboard.mock.calls.at(-1)).toEqual([{ fromDate: '2026-09-01', toDate: '2026-09-30' }]);
    expect(averages()).toEqual(['GRNs per day: 0.2', 'Dispatches per day: <0.1']);
  });
});

describe('the recent activity', () => {
  it('rows open nothing: no button, no chevron, and the reference read as it is shown', async () => {
    await open();
    const rows = screen.container.queryAll(node => node.type === 'View' && typeof node.props.accessibilityLabel === 'string' && /^(GRN|Dispatch) /.test(node.props.accessibilityLabel) && node.props.accessible === true);
    expect(rows.map(row => row.props.accessibilityLabel)).toEqual(['GRN A0311, Green Valley Traders, Today', 'Dispatch 2026042, Riverbank Produce, Yesterday']);
    const touchable = (node: TestInstance) => typeof node.props.onPress === 'function' || typeof node.props.onClick === 'function' || node.props.accessibilityRole === 'button';
    for (const row of rows) {
      expect(row.props.onPress).toBeUndefined();
      expect(row.props.accessibilityRole).toBeUndefined();
      expect(touchable(row)).toBe(false);
      expect(row.queryAll(touchable).length).toBe(0);
      expect(within(row).queryAllByRole('button').length).toBe(0);
      expect(row.queryAll(node => node.props.name === 'chevron-right').length).toBe(0);
    }
    // The visible title is the same reference the label speaks.
    expect(texts()).toEqual(expect.arrayContaining(['A0311', '2026042', 'GRN · Green Valley Traders', 'Dispatch · Riverbank Produce']));
    expect(screen.getByText('A0311')).toBeOnTheScreen();
    expect(screen.getByText('2026042')).toBeOnTheScreen();
  });
});

describe('a refused dashboard', () => {
  it('a role the server refuses: the error state with its reason, asked once, and again only on "Try again"', async () => {
    dashboard.mockResolvedValue({ success: false, message: 'Access denied. This report is for staff only.', error: 'STAFF_ONLY' } as never);
    const user = await open(makeStore(), { waitForAnswer: false });
    expect(await screen.findByText('This report is for staff only')).toBeOnTheScreen();
    // Let anything else the screen would do on its own run before counting.
    await settleQueries();
    expect(dashboard).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Couldn't load the operations dashboard")).toBeOnTheScreen();
    expect(screen.queryByText('LATEST ACTIVITY (ANY DATE)')).not.toBeOnTheScreen();
    expect(screen.queryByText('RIGHT NOW')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(dashboard).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('This report is for staff only')).toBeOnTheScreen();
  });

  it('another failure shows the screen\'s own words, not the server\'s', async () => {
    dashboard.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    await open(makeStore(), { waitForAnswer: false });
    expect(await screen.findByText("Couldn't load the operations dashboard. Check your connection and try again.")).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load the operations dashboard")).toBeOnTheScreen();
    expect(screen.queryByText('The facility refused this report.')).not.toBeOnTheScreen();
  });

  it('a staff account is not offered it, and nothing is asked', async () => {
    await open(makeStore({ userProfile: { id: 'user-b', name: 'Ravi Example', role: 'staff' } }), { waitForAnswer: false });
    expect(dashboard).not.toHaveBeenCalled();
    expect(screen.getByText('Administrators and supervisors only')).toBeOnTheScreen();
    expect(screen.getByText('This report is available to administrators and supervisors only.')).toBeOnTheScreen();
  });
});
