/**
 * A report left underneath another screen shows the facility's new figures when the person
 * comes back to it (review 2026-10-13, SR-10): the GRN activity report with a real store,
 * its route's focus driven through the real NavigationContext, and only the services and the
 * router as stand-ins.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { NavigationContext } from 'expo-router/react-navigation';
import { invalidateReportQueries } from '@/lib/queryClient';
import { getAllGRNActivity } from '@/services/reporting/grn-activity-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { makeRoute } from '@/tests/helpers/fakeRoute';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import GRNActivityScreen from '../../../../app/reports/grn-activity';

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
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
  onOperatorServerChange: () => () => {},
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('@/services/reporting/grn-activity-service', () => ({ getAllGRNActivity: jest.fn(), getCustomerGRNActivity: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const allActivity = jest.mocked(getAllGRNActivity);
const STAFF = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } };

const customer = (id: string, name: string, grns: number, bags: number) => ({
  customer_id: id,
  customer_name: name,
  grn_count: grns,
  total_quantity: bags,
  total_weight: bags * 50,
  latest_grn_date: '2026-10-02',
});
const answer = (rows: ReturnType<typeof customer>[]) => ({
  success: true,
  message: '',
  data: {
    summary: { total_grns: rows.reduce((sum, row) => sum + row.grn_count, 0), total_customers: rows.length, total_items: 0, total_quantity: rows.reduce((sum, row) => sum + row.total_quantity, 0), total_weight_kg: 0 },
    by_customer: rows,
  },
});
const BEFORE = [customer('c1', 'Riverbank Produce', 9, 80), customer('c2', 'Green Valley Traders', 2, 300)];
// A GRN saved for a new customer while the report was underneath.
const AFTER = [...BEFORE, customer('c3', 'Sunrise Agro Foods', 1, 500)];

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

jest.setTimeout(30_000);
const START = new Date(2026, 9, 12, 10, 0);
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(() => {
  // Only the calendar is faked; timers run as usual. Moving it on is how a test "waits".
  jest.useFakeTimers({
    now: START,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
  forgetQueries();
  jest.clearAllMocks();
  // An answer queued by a test that stopped early must not reach the next one.
  allActivity.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});

async function openOnRoute() {
  mockStore = makeStore();
  const route = makeRoute();
  await render(
    <NavigationContext.Provider value={route.navigation as never}>
      <GRNActivityScreen />
    </NavigationContext.Provider>
  );
  await act(settleQueries);
  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });
  const user = userEvent.setup({ delay: 0 });
  const NAMES = /^(Sunrise Agro Foods|Green Valley Traders|Riverbank Produce)$/;
  return {
    run,
    customers: () => screen.queryAllByText(NAMES).map(node => [node.props.children].flat().join('')),
    /** Away (a drill-through on top) and back after `seconds`. */
    awayAndBack: async (seconds: number) => {
      await run(() => route.blur());
      jest.setSystemTime(START.getTime() + seconds * 1000);
      await run(() => route.focus());
    },
    press: async (label: string) => {
      await user.press(screen.getByRole('button', { name: label }));
      await act(settleQueries);
    },
  };
}

describe('a report underneath another screen', () => {
  it('asks once on the return and shows the changed answer', async () => {
    allActivity.mockResolvedValueOnce(answer(BEFORE) as never);
    const report = await openOnRoute();
    expect(report.customers()).toEqual(['Green Valley Traders', 'Riverbank Produce']);
    expect(allActivity).toHaveBeenCalledTimes(1);

    allActivity.mockResolvedValueOnce(answer(AFTER) as never);
    await report.awayAndBack(31);
    expect(allActivity).toHaveBeenCalledTimes(2);
    expect(report.customers()).toEqual(['Sunrise Agro Foods', 'Green Valley Traders', 'Riverbank Produce']);
    expect(screen.getByText(/Last updated 10:00 am/)).toBeOnTheScreen();
  });

  it('asks nothing for a return within 30 seconds', async () => {
    allActivity.mockResolvedValue(answer(BEFORE) as never);
    const report = await openOnRoute();
    await report.awayAndBack(20);
    expect(allActivity).toHaveBeenCalledTimes(1);
  });

  it('keeps the rows when the return\'s request fails, says they are not current and offers Retry', async () => {
    allActivity.mockResolvedValueOnce(answer(BEFORE) as never);
    const report = await openOnRoute();
    allActivity.mockResolvedValueOnce({ success: false, message: 'Could not reach the facility' } as never);
    await report.awayAndBack(31);
    expect(allActivity).toHaveBeenCalledTimes(2);
    expect(report.customers()).toEqual(['Green Valley Traders', 'Riverbank Produce']);
    expect(screen.getByText("Couldn't update. These figures were loaded earlier.")).toBeOnTheScreen();

    allActivity.mockResolvedValueOnce(answer(AFTER) as never);
    await report.press('Try again');
    expect(allActivity).toHaveBeenCalledTimes(3);
    expect(report.customers()).toEqual(['Sunrise Agro Foods', 'Green Valley Traders', 'Riverbank Produce']);
  });

  it('asks once when a saved document marks the reports out of date', async () => {
    allActivity.mockResolvedValueOnce(answer(BEFORE) as never);
    const report = await openOnRoute();
    allActivity.mockResolvedValueOnce(answer(AFTER) as never);
    await report.run(() => {
      void invalidateReportQueries();
    });
    expect(allActivity).toHaveBeenCalledTimes(2);
    expect(report.customers()).toEqual(['Sunrise Agro Foods', 'Green Valley Traders', 'Riverbank Produce']);
  });
});
