/**
 * WH-299 slices 4 and 6 on screen: the Dispatch list and the stock reports over the phone copy.
 *  - contract product/tech/app-offline-read-from-copy.md 11 (S1, S2): no time line of their own; pull to refresh syncs;
 *  - 2.2 (R4): a restarted list asks its first page again;
 *  - 11.1 (PR9, Q2, Q3, Q4, Q6, Q7): the quiet re-read after a sync;
 *  - 10.2 and Design 2.10 (DS3, S3b): a report's sharing needs a connection.
 *
 * Real: the screens, their header, filters and store, the services, the sync engine, the copy. Faked at the edge: the
 * server's answers, the phone's native modules, the connection, the navigator's focus, FlashList's native drawing.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The Dispatch list is told of a scroll by the FlashList's `onScrollBeginDrag` and `onMomentumScrollEnd`, as the GRN
 *    list is.
 * ==================================
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import DispatchFlashList from '@/components/lists/DispatchFlashList';
import StockSummaryScreen from '../../../../app/reports/stock-summary';
import StockAgingScreen from '../../../../app/reports/stock-aging';
import * as dispatchService from '@/services/dispatch-service';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse, lotNamed } from '@/tests/phoneCopy/grnDataset';
import { dispatchRow, seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { resetScreenFocus, setScreenFocused } from '@/tests/components/focusHarness';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import themeReducer from '@/store/slices/themeSlice';
import { setLanguage } from '@/i18n';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.fileSystem());
jest.mock('@/config/supabaseConfig', () => ({
  ...require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase(),
  RequestTimeoutError: class RequestTimeoutError extends Error {},
}));
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({
  ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(),
  setLanContext: () => undefined,
}));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn() }));
let mockStore: { getState: () => unknown; subscribe: (l: () => void) => () => void; dispatch: (a: never) => unknown };
jest.mock('@/store', () => ({ get store() { return mockStore; } }));
jest.mock('@/store/hooks', () => {
  const { useRef, useSyncExternalStore } = require('react');
  return {
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
    useAppDispatch: () => mockStore.dispatch,
  };
});
const mockNet = {
  offline: false,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    mockNet.listeners.add(listener);
    return () => { mockNet.listeners.delete(listener); };
  },
  set(offline: boolean) {
    mockNet.offline = offline;
    for (const listener of [...mockNet.listeners]) listener();
  },
};
jest.mock('@/hooks/useNetworkStatus', () => {
  const { useSyncExternalStore } = require('react');
  const useOffline = () => useSyncExternalStore(mockNet.subscribe, () => mockNet.offline);
  return { useIsOffline: useOffline, useNetworkStatus: () => ({ isConnected: !useOffline(), type: 'wifi' }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
let mockParams: Record<string, string> = {};
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => false }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/list-items', () => ({
  MemoizedDispatchItem: ({ dispatch }: { dispatch: { disp_no: string; customer_name: string } }) => {
    const { Text } = require('react-native');
    return <Text testID={`row-${dispatch.disp_no}`}>{dispatch.customer_name}</Text>;
  },
}));
const mockList = { props: null as any };
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const draw = (part: unknown) => (typeof part === 'function' ? React.createElement(part) : part ?? null);
  return {
    FlashList: React.forwardRef((props: any, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: () => {}, scrollToIndex: () => {} }));
      mockList.props = props;
      return React.createElement(React.Fragment, null, draw(props.ListHeaderComponent),
        props.data.map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: props.keyExtractor(item, index) }, props.renderItem({ item, index }))),
        props.data.length ? null : draw(props.ListEmptyComponent), draw(props.ListFooterComponent));
    }),
  };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const serverCalls: string[] = [];
let serverAnswers: Record<string, unknown> = {};

let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());
beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  seedWarehouse();
  seedDocuments();
  forgetQueries();
  serverCalls.length = 0;
  serverAnswers = {};
  mockParams = {};
  mockList.props = null;
  mockNet.offline = false;
  resetScreenFocus();
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    serverCalls.push(name);
    return name in serverAnswers ? { data: serverAnswers[name], error: null } : { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  const store = configureStore({ reducer: { auth: authReducer, listFilters: listFilterReducer, reportPrefs: reportPrefsReducer, theme: themeReducer } });
  mockStore = store as unknown as typeof mockStore;
  store.dispatch(setUserProfile({ id: 'profile-1', role: 'staff', name: 'Asha Fictional' } as never));
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  await setLanguage('en');
  jest.restoreAllMocks();
});

const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
async function loadCopy() {
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
}
async function connection(offline: boolean) {
  await act(async () => {
    await setReachable(!offline);
    engine.setCopyOffline(offline);
    mockNet.set(offline);
  });
}
async function sync(changes: unknown[]) {
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: changes as never });
  await act(async () => { expect(await engine.syncNow('interval')).toBe('done'); });
}
const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'b000000000000001', row });
const rows = () => screen.queryAllByTestId(/^row-/).map(row => String(row.props.testID).slice(4));
const ALL = ['D3', 'D2', 'D1', 'D10', 'D4'];

/** The Dispatch list open over a ready copy, with the reads that follow counted. */
async function openDispatchList() {
  const read = jest.spyOn(dispatchService, 'getDispatchListWithItems');
  await loadCopy();
  await render(<DispatchFlashList />);
  await screen.findByTestId('row-D3');
  await wait(50);
  read.mockClear();
  return read;
}

describe('the Dispatch list over the copy', () => {
  it('S1: shows the copy\'s rows with no connection, with no time line or stale strip of its own', async () => {
    await loadCopy();
    await connection(true);
    await render(<DispatchFlashList />);
    await screen.findByTestId('row-D3');
    expect(rows()).toEqual(ALL);
    expect(screen.queryByTestId('dispatch-last-updated')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-stale-strip')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Last updated/)).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('S2: pull to refresh syncs once and reads the list again', async () => {
    const read = await openDispatchList();
    const syncNow = jest.spyOn(engine, 'syncNow').mockResolvedValue('done');
    await act(async () => { mockList.props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(syncNow).toHaveBeenCalledWith('pull-to-refresh'));
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(serverCalls).toEqual([]);
  });

  it('R4: on a restart drops its pages and asks the first page again, showing no error', async () => {
    for (let n = 11; n <= 30; n += 1) {
      env.feed.rows.dispatch.push({ id: `d-D${n}`, row: { ...dispatchRow('D10'), id: `d-D${n}`, disp_no: `D${n}`, disp_date: '2026-11-01T05:00:00+00:00' } });
    }
    const read = await openDispatchList();
    await act(async () => { await copyDb.eraseCopy(); });
    serverAnswers.get_dispatch_list_with_items = {
      success: true,
      data: { dispatches: [{ id: 'server-d', disp_no: 'S1', dispatch_date: '2026-11-25', customer_name: 'Server Fictional Traders', items: [] }], total_count: 1, current_page: 1, total_pages: 1, limit: 20 },
    };
    await act(async () => { mockList.props.onEndReached(); });
    expect(await screen.findByTestId('row-S1')).toBeOnTheScreen();
    expect(read.mock.calls.map(call => call[0]?.offset)).toEqual([20, 0]);
    expect(rows()).toEqual(['S1']);
    expect(screen.queryByTestId('dispatch-load-more-error')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-stale-strip')).not.toBeOnTheScreen();
  });

  it('Q6: a dispatch deleted on the server goes after the sync, read quietly, the others in their order', async () => {
    const read = await openDispatchList();
    await sync([{ e: 'dispatch', id: 'd-D1', op: 'delete' }]);
    await waitFor(() => expect(rows()).toEqual(['D3', 'D2', 'D10', 'D4']));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toMatchObject({ offset: 0 });
    expect(mockList.props.refreshControl.props.refreshing).toBe(false);
    expect(serverCalls).toEqual([]);
  });

  it('Q2: a change of a lot it shows reads the list once', async () => {
    const read = await openDispatchList();
    await sync([upsert('goodsreceived_trl', 'l02', { ...lotNamed('l02'), rack: 'Z-9' })]);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  });

  it('Q1, Q3: a sync that brought nothing, or only GRN photos, reads nothing', async () => {
    const read = await openDispatchList();
    await sync([]);
    await sync([{ e: 'grn_images', id: 'ph-lot', op: 'delete' }]);
    await wait(300);
    expect(read).not.toHaveBeenCalled();
  });

  it('Q4: waits while the list is scrolled, then reads', async () => {
    await openDispatchList();
    expect(mockList.props.onScrollBeginDrag).toEqual(expect.any(Function));
    await act(async () => { mockList.props.onScrollBeginDrag({ nativeEvent: {} }); });
    await sync([{ e: 'dispatch', id: 'd-D1', op: 'delete' }]);
    await wait(1300);
    expect(screen.getByTestId('row-D1')).toBeOnTheScreen();
    await act(async () => { mockList.props.onMomentumScrollEnd({ nativeEvent: {} }); });
    await waitFor(() => expect(screen.queryByTestId('row-D1')).not.toBeOnTheScreen(), { timeout: 3000 });
  }, 15000);

  it('Q7: a list that is not in view reads again when it comes back', async () => {
    const read = await openDispatchList();
    await act(async () => { setScreenFocused(false); });
    await sync([{ e: 'dispatch', id: 'd-D1', op: 'delete' }]);
    await wait(300);
    expect(read).not.toHaveBeenCalled();
    await act(async () => { setScreenFocused(true); });
    await waitFor(() => expect(screen.queryByTestId('row-D1')).not.toBeOnTheScreen());
  });
});

const REPORTS: [string, () => React.JSX.Element][] = [
  ['stock-summary', () => <StockSummaryScreen />],
  ['stock-aging', () => <StockAgingScreen />],
];
const LINE = 'Sharing and PDFs need a connection.';

describe.each(REPORTS)('the %s report over the copy', (id, screenOf) => {
  it('S1: shows the copy\'s figures with no time line of its own', async () => {
    await loadCopy();
    await render(screenOf());
    await screen.findByText('Bhavin Foods');
    expect(screen.queryByText(/Last updated/)).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('S3b: offline, sharing is disabled and says why, with one line under the header', async () => {
    await loadCopy();
    await connection(true);
    await render(screenOf());
    await screen.findByText('Bhavin Foods');
    expect(screen.getByRole('button', { name: 'Share PDF, needs a connection' })).toBeDisabled();
    expect(screen.getAllByTestId(`${id}-header-needs-connection`)).toHaveLength(1);
    expect(screen.getByTestId(`${id}-header-needs-connection`)).toHaveTextContent(LINE);
  });

  it('reachable: sharing is as today', async () => {
    await loadCopy();
    await render(screenOf());
    await screen.findByText('Bhavin Foods');
    expect(screen.getByRole('button', { name: 'Share PDF' })).toBeEnabled();
    expect(screen.queryByTestId(`${id}-header-needs-connection`)).not.toBeOnTheScreen();
  });

  it('says the line in Gujarati', async () => {
    await setLanguage('gu');
    await loadCopy();
    await connection(true);
    await render(screenOf());
    expect(await screen.findByTestId(`${id}-header-needs-connection`)).toHaveTextContent('શેર અને PDF માટે કનેક્શન જોઈએ.');
  });
});

describe('the stock summary after a sync', () => {
  it('PR9: reads again when stock changed, and not for photos', async () => {
    await loadCopy();
    await render(<StockSummaryScreen />);
    await screen.findByText('Bhavin Foods');
    expect(screen.queryByText('Renamed Fictional Foods')).not.toBeOnTheScreen();
    await sync([upsert('customers', 'c2', { id: 'c2', name: 'Renamed Fictional Foods', mobile: '09000000002', active: true, deleted_at: null })]);
    expect(await screen.findByText('Renamed Fictional Foods')).toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('S2: pull to refresh syncs once', async () => {
    await loadCopy();
    await render(<StockSummaryScreen />);
    await screen.findByText('Bhavin Foods');
    const syncNow = jest.spyOn(engine, 'syncNow').mockResolvedValue('done');
    await act(async () => { mockList.props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(syncNow).toHaveBeenCalledWith('pull-to-refresh'));
    expect(syncNow).toHaveBeenCalledTimes(1);
  });
});
