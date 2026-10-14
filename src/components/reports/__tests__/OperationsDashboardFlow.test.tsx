/**
 * The operations dashboard with a real store: the period chip is worked as a
 * person would and the days asked for are read from the service's arguments.
 * The service, the role hook's profile and the router are stand-ins.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { KPICard } from '@/components/reports/KPICard';
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
  dashboard.mockResolvedValue(answer(RECENT) as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

async function open(store: Store = makeStore()) {
  mockStore = store;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<OperationsDashboardScreen />);
    await settleQueries();
  });
  mounted.push(tree);
  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const control = (label: string) => {
    const found = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    if (found.length === 0) throw new Error(`No control labelled "${label}"`);
    return found[0];
  };
  return {
    tree,
    texts,
    run,
    press: (label: string) => run(() => control(label).props.onPress()),
    // The two figures of "Period averages", as they are read out: "GRNs per day: 0.4".
    averages: () =>
      tree.root
        .findAll(node => typeof node.type === 'string' && node.props.accessible === true && /^(GRNs|Dispatches) per day: /.test(node.props.accessibilityLabel ?? ''))
        .map(node => node.props.accessibilityLabel as string),
    status: () => texts().find(text => text.includes('Last updated')),
  };
}
const days = (fromDate: string) => ({ fromDate, toDate: '2026-10-12' });

describe('the period', () => {
  it('asks for the last 120 days, and for 240 days once that period is chosen on the chip', async () => {
    const screen = await open();
    expect(dashboard.mock.calls).toEqual([[days('2026-06-15')]]);
    expect(screen.status()).toBe('15 Jun – 12 Oct · Last updated 10:00 am');

    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last 240 days');
    expect(dashboard.mock.calls).toEqual([[days('2026-06-15')], [days('2026-02-15')]]);
    expect(screen.status()).toBe('15 Feb – 12 Oct · Last updated 10:00 am');
    expect(screen.texts()).not.toContain('Last 120 days');
  });

  it('shows the five figures, the daily averages and the recent activity of the answer', async () => {
    const screen = await open();
    expect(screen.texts()).toEqual(
      expect.arrayContaining(['GRNs', 'Dispatches', 'Pending orders', 'Active customers', 'Total stock', 'Period averages', 'Latest activity (any date)'])
    );
    // Over the 120 days of 15 Jun to 12 Oct, not over the 2 days (GRNs) and 1 day (dispatches) that had events:
    // 5 GRNs / 120 = 0.04 and 1 dispatch / 120 = 0.008: not zero, and too small for one decimal, so "<0.1" and
    // never "0" (the active-day figures were 2.5 and 1).
    expect(screen.averages()).toEqual(['GRNs per day: <0.1', 'Dispatches per day: <0.1']);
    // generate-report-pdf has no operations dashboard: the header offers no PDF.
    expect(screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Share PDF')).toEqual([]);
    expect(screen.tree.root.findAll(node => node.props.name === 'file-pdf-box')).toEqual([]);
  });

  it('says what each figure covers: the period\'s GRNs and dispatches, then what is true right now, then the latest activity of any date', async () => {
    const screen = await open();
    const headers = () =>
      screen.tree.root
        .findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'header')
        .map(node => (node.props.accessibilityLabel as string | undefined) ?? [node.props.children].flat().join(''));
    expect(headers()).toEqual(['Operations dashboard', 'In 15 Jun – 12 Oct', 'Right now', 'Period averages', 'Latest activity (any date)']);
    // The facility whose figures these are, under the title, and read out as such.
    expect(screen.texts()).toContain('Riverside Cold Storage');
    expect(screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Facility: Riverside Cold Storage').length).toBeGreaterThan(0);
    // Each group's figures are under its own heading.
    const texts = screen.texts();
    const at = (words: string) => texts.indexOf(words);
    const order = ['IN 15 JUN – 12 OCT', 'GRNs', 'Dispatches', 'RIGHT NOW', 'Pending orders', 'Active customers', 'Total stock'].map(at);
    expect(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1]))).toBe(true);
    expect(texts).not.toContain('Recent activity');

    // Last month (all of September): the movement is September's; stock and pending orders are still today's.
    await screen.press('Period: Last 120 days. Change');
    await screen.press('Last month');
    expect(headers()).toEqual(['Operations dashboard', 'In 1 Sep – 30 Sep', 'Right now', 'Period averages', 'Latest activity (any date)']);
  });

  it('with no latest activity says none yet under the figures, without naming the period', async () => {
    dashboard.mockResolvedValue(answer([]) as never);
    const screen = await open();
    // The list is the latest GRNs and dispatches of any date, so the empty text does not speak of the period.
    expect(screen.texts()).toEqual(expect.arrayContaining(['Total stock', 'No GRNs or dispatches yet. The latest ones appear here.']));
    expect(screen.texts().filter(text => /in this period/.test(text))).toEqual([]);
  });

  it('with no activity offers "Show last 420 days", which asks for those days, until that period is chosen', async () => {
    dashboard.mockResolvedValue(answer([]) as never);
    const screen = await open();
    expect(screen.status()).toBe('15 Jun – 12 Oct · Last updated 10:00 am');
    const button = () => screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Show last 420 days' && typeof node.props.onPress === 'function');
    expect(button()).not.toEqual([]);
    await screen.press('Show last 420 days');
    expect(dashboard.mock.calls).toEqual([[days('2026-06-15')], [days('2025-08-19')]]);
    expect(screen.status()).toBe('19 Aug 2025 – 12 Oct · Last updated 10:00 am');
    expect(button()).toEqual([]);
  });
});

// The answer carries the stock's total weight (kpis.total_stock_weight: 5,400.5 kg, every lot's
// bags in stock times the weight of one bag). Total weights are not shown, so "Right now" has
// three tiles, not four, and nothing on the screen states that weight.
describe('the figures: no total weight', () => {
  const before = Dimensions.get('window');
  afterEach(() => Dimensions.set({ window: before }));
  /** A phone 392 dp wide at the given text size. */
  const phone = (fontScale: number, width = 392) => Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } });

  const tiles = (screen: Awaited<ReturnType<typeof open>>) => screen.tree.root.findAllByType(KPICard);
  /** The tiles row by row, each by its label: a row is the parent of its tiles. */
  const rows = (screen: Awaited<ReturnType<typeof open>>) => {
    const byRow = new Map<ReactTestInstance, string[]>();
    for (const tile of tiles(screen)) byRow.set(tile.parent!, [...(byRow.get(tile.parent!) ?? []), tile.props.label as string]);
    return [...byRow.values()];
  };
  /** What a screen reader says for each tile. */
  const spoken = (screen: Awaited<ReturnType<typeof open>>) =>
    tiles(screen).map(tile => tile.findAll(node => typeof node.type === 'string' && node.props.accessible === true)[0].props.accessibilityLabel as string);

  it('"Right now" has three tiles, pending orders, active customers and total stock; the 5,400.5 kg of the answer is nowhere', async () => {
    phone(1);
    const screen = await open();

    expect(spoken(screen)).toEqual(['GRNs: 12', 'Dispatches: 7', 'Pending orders: 3', 'Active customers: 5', 'Total stock: 1,200']);
    expect(tiles(screen).map(tile => tile.props.icon)).toEqual(['package-down', 'truck-delivery-outline', 'clipboard-list-outline', 'account-group-outline', 'warehouse']);
    // No tile, text or label names a weight: not the label, the figure, its unit or its scale icon.
    const texts = screen.texts();
    for (const gone of ['Total weight', '5,400.50', '5,400.5', 'kg']) expect(texts).not.toContain(gone);
    expect(texts.filter(text => /weight|\bkg\b/i.test(text))).toEqual([]);
    expect(screen.tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && /weight|\bkg\b|5,400/i.test(node.props.accessibilityLabel))).toEqual([]);
    expect(screen.tree.root.findAll(node => node.props.name === 'scale-balance')).toEqual([]);
  });

  it('lays the three tiles out in one row at ordinary text sizes, the two of the period in a row above them', async () => {
    for (const fontScale of [1, 1.2]) {
      phone(fontScale);
      const screen = await open();
      expect(rows(screen)).toEqual([['GRNs', 'Dispatches'], ['Pending orders', 'Active customers', 'Total stock']]);
      act(() => mounted.splice(0).forEach(tree => tree.unmount()));
      forgetQueries();
    }
  });

  it('above 1.2 times the text size puts two across: total stock alone in a second row, at the width of one tile', async () => {
    for (const fontScale of [1.3, 2]) {
      phone(fontScale);
      const screen = await open();
      expect(rows(screen)).toEqual([['GRNs', 'Dispatches'], ['Pending orders', 'Active customers'], ['Total stock']]);
      // The short row is filled out by an empty cell, so the lone tile is not stretched across the screen.
      const lastRow = tiles(screen).at(-1)!.parent!;
      expect(lastRow.children).toHaveLength(2);
      act(() => mounted.splice(0).forEach(tree => tree.unmount()));
      forgetQueries();
    }
  });

  it('on a tablet all three share one row, a third of the width each', async () => {
    phone(1, 800);
    const screen = await open();
    expect(rows(screen)).toEqual([['GRNs', 'Dispatches'], ['Pending orders', 'Active customers', 'Total stock']]);
    expect(tiles(screen).at(-1)!.parent!.children).toHaveLength(3);
  });

  it('while the first answer is awaited, draws five placeholder tiles: as many as the figures that follow', async () => {
    phone(1);
    let answerNow!: (value: unknown) => void;
    dashboard.mockImplementationOnce(() => new Promise(resolve => (answerNow = resolve)) as never);
    const screen = await open();
    expect(tiles(screen)).toHaveLength(5);
    expect(tiles(screen).every(tile => tile.props.isLoading === true)).toBe(true);
    expect(screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Loading figures').length).toBeGreaterThan(0);

    await screen.run(() => answerNow(answer(RECENT)));
    expect(tiles(screen)).toHaveLength(5);
    expect(tiles(screen).some(tile => tile.props.isLoading === true)).toBe(false);
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
    const screen = await open(week());
    expect(dashboard.mock.calls).toEqual([[{ fromDate: '2026-10-05', toDate: '2026-10-11' }]]);
    // 7 / 7 days = 1 (by active days it was 7 / 1 = 7); 3 / 7 days = 0.43 (it was 3 / 2 = 1.5).
    expect(screen.averages()).toEqual(['GRNs per day: 1', 'Dispatches per day: 0.4']);
  });

  it('are 0 only for a period with no event on any day', async () => {
    dashboard.mockResolvedValue(answer([], { grn_daily: [], dispatch_daily: [] }) as never);
    const screen = await open(week());
    expect(screen.averages()).toEqual(['GRNs per day: 0', 'Dispatches per day: 0']);
  });

  it('count only the days that have come when the period runs past today, and every day of a past month', async () => {
    const screen = await open();
    expect(screen.averages()).toEqual(['GRNs per day: <0.1', 'Dispatches per day: <0.1']);

    // This month is 1 to 31 Oct, but today is 12 Oct: 12 days. 5 / 12 = 0.42, 1 / 12 = 0.08 (not 5 / 31 = 0.16).
    await screen.press('Period: Last 120 days. Change');
    await screen.press('This month');
    expect(dashboard.mock.calls.at(-1)).toEqual([{ fromDate: '2026-10-01', toDate: '2026-10-31' }]);
    expect(screen.averages()).toEqual(['GRNs per day: 0.4', 'Dispatches per day: 0.1']);

    // Last month is all 30 days of September: 5 / 30 = 0.17, 1 / 30 = 0.03 (not zero: "<0.1").
    await screen.press('Period: This month. Change');
    await screen.press('Last month');
    expect(dashboard.mock.calls.at(-1)).toEqual([{ fromDate: '2026-09-01', toDate: '2026-09-30' }]);
    expect(screen.averages()).toEqual(['GRNs per day: 0.2', 'Dispatches per day: <0.1']);
  });
});

describe('the recent activity', () => {
  it('rows open nothing: no button, no chevron, and the reference read as it is shown', async () => {
    const screen = await open();
    const rows = screen.tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string' && /^(GRN|Dispatch) /.test(node.props.accessibilityLabel) && node.props.accessible === true);
    expect(rows.map(row => row.props.accessibilityLabel)).toEqual(['GRN A0311, Green Valley Traders, Today', 'Dispatch 2026042, Riverbank Produce, Yesterday']);
    for (const row of rows) {
      expect(row.props.onPress).toBeUndefined();
      expect(row.props.accessibilityRole).toBeUndefined();
      expect(row.findAll(node => typeof node.props.onPress === 'function')).toHaveLength(0);
      expect(row.findAll(node => node.props.name === 'chevron-right')).toHaveLength(0);
    }
    // The visible title is the same reference the label speaks.
    expect(screen.texts()).toEqual(expect.arrayContaining(['A0311', '2026042', 'GRN · Green Valley Traders', 'Dispatch · Riverbank Produce']));
  });
});

describe('a refused dashboard', () => {
  it('a role the server refuses: the error state with its reason, asked once, and again only on "Try again"', async () => {
    dashboard.mockResolvedValue({ success: false, message: 'Access denied. This report is for staff only.', error: 'STAFF_ONLY' } as never);
    const screen = await open();
    await screen.run(() => undefined);
    expect(dashboard).toHaveBeenCalledTimes(1);
    expect(screen.texts()).toEqual(expect.arrayContaining(["Couldn't load the operations dashboard", 'This report is for staff only']));
    expect(screen.texts()).not.toContain('Latest activity (any date)');
    expect(screen.texts()).not.toContain('RIGHT NOW');

    await screen.press('Try again');
    expect(dashboard).toHaveBeenCalledTimes(2);
    expect(screen.texts()).toContain('This report is for staff only');
  });

  it('another failure shows the screen\'s own words, not the server\'s', async () => {
    dashboard.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    const screen = await open();
    expect(screen.texts()).toEqual(
      expect.arrayContaining(["Couldn't load the operations dashboard", "Couldn't load the operations dashboard. Check your connection and try again."])
    );
    expect(screen.texts()).not.toContain('The facility refused this report.');
  });

  it('a staff account is not offered it, and nothing is asked', async () => {
    const screen = await open(makeStore({ userProfile: { id: 'user-b', name: 'Ravi Example', role: 'staff' } }));
    expect(dashboard).not.toHaveBeenCalled();
    expect(screen.texts()).toEqual(expect.arrayContaining(['Staff only', 'This report is available to staff members only.']));
  });
});
