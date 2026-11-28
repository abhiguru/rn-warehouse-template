/**
 * WH-299 + WH-381 on screen: the Dispatch list (online-only under WH-381) and the stock reports over the phone copy.
 *  - WH-381 (Design Part 13.1 A): Dispatch list shows whole-screen `ScreenNeedsConnection` (`dispatch-needs-connection`)
 *    offline with zero kept rows, no `StaleListStrip`, no `LastUpdatedLine`, no "Try again", and reloads automatically
 *    on reconnect;
 *  - Stock summary & Stock aging stay on the phone copy: S1 (no time line of their own), S2 (pull to refresh syncs),
 *    PR9 (quiet re-read after a sync), S3b (sharing disabled offline with header line in English and Gujarati).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - With the copy ready and the connection up, the Dispatch list reads the SERVER (`get_dispatch_list_with_items`), not the
 *    copy (contract 4.4: `readVia` intercepts removed); its rows are the server's `row-<disp_no>`.
 *  - The Dispatch list's testIDs `dispatch-needs-connection`, `dispatch-stale-strip`, `dispatch-last-updated`.
 * ==================================
 *
 * Real: the screens, their header, filters and store, the services, the sync engine, the copy. Faked at the edge: the
 * server's answers, the phone's native modules, the connection, the navigator's focus, FlashList's native drawing.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import DispatchFlashList from '@/components/lists/DispatchFlashList';
import StockSummaryScreen from '../../../../app/reports/stock-summary';
import StockAgingScreen from '../../../../app/reports/stock-aging';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { resetScreenFocus } from '@/tests/components/focusHarness';
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
const NEEDS_EN = 'This needs a connection. It will load when you reconnect.';
const NEEDS_GU = 'આ માટે કનેક્શન જોઈએ. ફરી જોડાશો ત્યારે લોડ થશે.';

describe('WH-381: the Dispatch list is online-only (Design Part 13.1 A)', () => {
  const serverDispatchPage = {
    success: true,
    data: {
      dispatches: [{ id: 'server-d', disp_no: 'S1', dispatch_date: '2026-11-25', customer_name: 'Server Fictional Traders', items: [] }],
      total_count: 1,
      current_page: 1,
      total_pages: 1,
      limit: 20,
    },
  };

  it('cold-start offline with copy ready: whole-screen ScreenNeedsConnection, zero kept rows, no time line, no stale strip, no CustomerAgeStrip, no server call', async () => {
    await loadCopy();
    await connection(true);
    await render(<DispatchFlashList />);
    expect(await screen.findByTestId('dispatch-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(rows()).toEqual([]);
    expect(screen.queryByTestId('row-D3')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-last-updated')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-stale-strip')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-load-more-error')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Last updated/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('visited online then connection drops: zero kept rows, no stale strip, and reloads automatically on reconnect', async () => {
    serverAnswers.get_dispatch_list_with_items = serverDispatchPage;
    await loadCopy();
    await render(<DispatchFlashList />);
    expect(await screen.findByTestId('row-S1')).toBeOnTheScreen();
    expect(rows()).toEqual(['S1']);
    expect(screen.queryByTestId('dispatch-needs-connection')).not.toBeOnTheScreen();

    await connection(true);
    expect(await screen.findByTestId('dispatch-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(rows()).toEqual([]);
    expect(screen.queryByTestId('row-S1')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-stale-strip')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-last-updated')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();

    serverCalls.length = 0;
    await connection(false);
    expect(await screen.findByTestId('row-S1')).toBeOnTheScreen();
    expect(rows()).toEqual(['S1']);
    expect(screen.queryByTestId('dispatch-needs-connection')).not.toBeOnTheScreen();
    expect(serverCalls).toContain('get_dispatch_list_with_items');
  });

  it('Gujarati offline: dispatch-needs-connection shows Gujarati wording and zero rows', async () => {
    await setLanguage('gu');
    await loadCopy();
    await connection(true);
    await render(<DispatchFlashList />);
    expect(await screen.findByTestId('dispatch-needs-connection')).toHaveTextContent(NEEDS_GU);
    expect(rows()).toEqual([]);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
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
