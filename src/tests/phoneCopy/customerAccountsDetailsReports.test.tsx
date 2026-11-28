/**
 * WH-306 + WH-381 (commits b877979d, cd10e951; Design Part 13.1 A & C; settled Q1):
 *  - `CustomerAgeStrip` under the header of GRN details and kept stock reports (`ReportScaffold`);
 *    absent on Statement and Customer activity (customer accounts keep their own age, Design 9.7 DQ2/DQ4),
 *    on Temperature report (server-only), and on Dispatch details (WH-381: server-only, shows `dispatch-details-needs-connection`).
 *  - Offline: Stock summary's "Change customer" stays enabled while "Share PDF" is disabled and says it needs a connection;
 *    Temperature report's "Share PDF" is disabled and says so; warehouse roles on Customer activity see `customer-activity-needs-connection` (Q1).
 *
 * Real: the screens, the report layout and header, the services, the sync engine, the copy, the store, role access.
 * Faked at the edge: the server's answers, the phone's native modules and files, the connection, the navigator.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import StockSummaryScreen from '../../../app/reports/stock-summary';
import StatementScreen from '../../../app/reports/statement';
import CustomerActivityScreen from '../../../app/reports/customer-activity';
import TemperatureReportScreen from '../../../app/reports/temperature-report';
import * as engine from '@/features/phone-copy/syncEngine';
import * as syncStore from '@/features/phone-copy/syncStore';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { seedCustomerAccount } from '@/tests/phoneCopy/customerAccountFeed';
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

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('expo-file-system/legacy', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule(), { virtual: true });
jest.mock('@/config/supabaseConfig', () => {
  const phone = require('@/tests/phoneCopy/phoneEnv');
  const supabase = phone.mockFactories.supabase();
  const lost = { data: null, error: { message: 'Network request failed' } };
  const client = async () => ({
    rpc: (name: string, args: Record<string, unknown>) => phone.env.feed.rpc(name, args ?? {}),
    from: () => { throw new TypeError('Network request failed'); },
    storage: { from: () => ({ createSignedUrl: async () => lost }) },
  });
  return {
    ...supabase,
    getAuthenticatedClient: client,
    getSupabaseClient: client,
    createAuthenticatedFetch: jest.fn(),
    getCurrentConfig: () => ({ url: 'https://warehouse.example.test', anonKey: 'k' }),
    RequestTimeoutError: class RequestTimeoutError extends Error {},
  };
});
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({
  ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(),
  setLanContext: () => undefined,
  viaCurrentPath: (url: string) => url,
  toCanonicalUrl: (url: string) => url,
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
    useAppStore: () => mockStore,
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
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  useIsFocused: () => true,
  Redirect: () => null,
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-paper', () => ({ Portal: ({ children }: { children?: React.ReactNode }) => children, Snackbar: () => null, ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn(), useHaptics: () => ({ selection: jest.fn(), light: jest.fn(), medium: jest.fn() }) }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => false }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: (props: object) => require('react').createElement('ExpoImage', props) }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-native-gesture-handler', () => ({ ...jest.requireActual('react-native-gesture-handler'), GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
// Passes everything through; it only records the query the temperature report hands its scaffold, so a test can call the screen's own refresh and Retry.
const mockScaffold: { query?: { refresh: () => Promise<boolean>; retry: () => void } } = {};
jest.mock('@/components/reports', () => {
  const actual = jest.requireActual('@/components/reports');
  const react = require('react');
  return {
    ...actual,
    ReportScaffold: (props: { query: { refresh: () => Promise<boolean>; retry: () => void } }) => {
      mockScaffold.query = props.query;
      return react.createElement(actual.ReportScaffold, props);
    },
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const OWN = [{ id: 'c1', name: 'asha Traders' }, { id: 'c2', name: 'Bhavin Foods' }];
const SENSOR = { id: 'sensor-1', name: 'North chamber probe', location: 'Chamber 1', active: true, first_reading_at: '2026-11-01T00:00:00Z', last_reading_at: '2026-11-25T06:00:00Z' };

let sensorCalls = 0;
let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());

/** Who is signed in, the feed the server sends that role, and the server's answers to anything but the feed. */
async function boot(role: 'customer' | 'staff' | 'admin', photosMissing?: number) {
  if (role === 'customer') seedCustomerAccount(OWN.map(c => c.id));
  else { seedWarehouse(); seedDocuments(); }
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    if (name === 'get_sensor_report_devices') sensorCalls += 1;
    if (name === 'get_sensor_report_devices') return { data: { success: true, data: [SENSOR] }, error: null };
    return { data: null, error: { message: 'Network request failed' } };
  };
  const store = configureStore({ reducer: { auth: authReducer, listFilters: listFilterReducer, reportPrefs: reportPrefsReducer, theme: themeReducer } });
  mockStore = store as unknown as typeof mockStore;
  const customers = role === 'customer' ? OWN : [];
  store.dispatch(setUserProfile({
    id: 'profile-1', role, name: 'Fictional Person',
    assignedCustomerIds: customers.map(c => c.id), assignedCustomers: customers, assignedCustomersStatus: 'loaded',
  } as never));
  if (photosMissing !== undefined) {
    (env.feed.rows.goodsreceived.find(each => each.id === 'g-A2')!.row as Record<string, unknown>).photos_missing = photosMissing;
  }
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
  expect(syncStore.getSyncSnapshot()).toMatchObject({ feature: 'on', phase: 'ready', kind: role === 'customer' ? 'customer' : 'warehouse' });
}

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  files.reset();
  forgetQueries();
  resetScreenFocus();
  mockNet.offline = false;
  mockParams = {};
  sensorCalls = 0;
  mockScaffold.query = undefined;
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  jest.restoreAllMocks();
});

async function connection(offline: boolean) {
  await act(async () => {
    await setReachable(!offline);
    engine.setCopyOffline(offline);
    mockNet.set(offline);
  });
}
/** A customer account with two customers picks one in the report's picker. */
async function pickCustomer(name: string) {
  await userEvent.press(await screen.findByText(name));
}

describe('CustomerAgeStrip on the details pages (WH-306 + WH-381)', () => {
  it('GRN details, a customer account offline: the strip is under the header, with the time of the copy', async () => {
    await boot('customer');
    await connection(true);
    mockParams = { id: 'g-A2' };
    await render(<GRNDetailScreen />);
    await screen.findByRole('tab', { name: /overview/i });
    expect(screen.getByTestId('customer-age-strip')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-age-time')).toBeOnTheScreen();
  });

  it('GRN details, staff offline: no strip', async () => {
    await boot('staff');
    await connection(true);
    mockParams = { id: 'g-A2' };
    await render(<GRNDetailScreen />);
    await screen.findByRole('tab', { name: /overview/i });
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
  });

  it.each(['customer', 'staff'] as const)('dispatch details (%s) offline: whole-screen ScreenNeedsConnection and NO CustomerAgeStrip (WH-381)', async (role) => {
    await boot(role);
    await connection(true);
    mockParams = { id: 'd-D2' };
    await render(<DispatchDetailScreen />);
    expect(await screen.findByTestId('dispatch-details-needs-connection')).toHaveTextContent(
      'This needs a connection. It will load when you reconnect.'
    );
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: /overview/i })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
  });
});

describe('reports for a customer account with two customers, offline (WH-306 + WH-381)', () => {
  it('Stock summary (the report layout): the strip; "Change customer" enabled; "Share PDF" disabled and says it needs a connection', async () => {
    await boot('customer');
    await connection(true);
    await render(<StockSummaryScreen />);
    await pickCustomer('asha Traders');
    expect(await screen.findByTestId('customer-age-strip')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-age-time')).toBeOnTheScreen();

    const change = screen.getByRole('button', { name: 'Change customer' });
    expect(change).toBeEnabled();
    expect(await screen.findByRole('button', { name: 'Share PDF, needs a connection' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Share PDF' })).not.toBeOnTheScreen();
    expect(screen.getByTestId('stock-summary-header-needs-connection')).toHaveTextContent('Sharing and PDFs need a connection.');

    // "Change customer" still works offline: back to the picker, where the other customer can be chosen.
    await userEvent.press(change);
    expect(await screen.findByText('Bhavin Foods')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Change customer' })).not.toBeOnTheScreen();
  });

  it.each([
    ['Statement', StatementScreen],
    ['Customer activity', CustomerActivityScreen],
  ] as const)('%s: no CustomerAgeStrip (a money screen keeps its own age); "Change customer" enabled', async (_name, Screen) => {
    await boot('customer');
    await connection(true);
    await render(<Screen />);
    await pickCustomer('asha Traders');
    const change = await screen.findByRole('button', { name: 'Change customer' });
    expect(change).toBeEnabled();
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
  });

  it('Temperature report: no strip; with a sensor open, "Share PDF" is disabled offline and says it needs a connection', async () => {
    await boot('customer');
    mockParams = { deviceId: SENSOR.id };
    await render(<TemperatureReportScreen />);
    const share = await screen.findByTestId('temperature-report-share-pdf');
    expect(share).toBeEnabled();
    await connection(true);
    expect(share).toBeDisabled();
    expect(screen.getByLabelText('Share PDF, needs a connection')).toBeOnTheScreen();
    expect(screen.getByTestId('temperature-report-share-pdf-needs-connection')).toHaveTextContent('Needs a connection');
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
  });

  describe('Temperature report: going offline and back (WH-348)', () => {
    const quiet = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });

    it('offline pull-to-refresh and Retry make no request and keep the sensor open, with Share PDF disabled', async () => {
      await boot('customer');
      await render(<TemperatureReportScreen />);
      expect(await screen.findByText('North chamber probe')).toBeOnTheScreen();
      expect(sensorCalls).toBe(1);
      await connection(true);
      expect(await screen.findByTestId('temperature-report-needs-connection')).toBeOnTheScreen();
      const query = mockScaffold.query!;
      let refreshed: boolean | undefined;
      await act(async () => { refreshed = await query.refresh(); query.retry(); });
      await quiet();
      expect(refreshed).toBe(false);
      expect(sensorCalls).toBe(1);

      // The sensor opens now: its data is still there, so the form shows, not the whole-screen state.
      mockParams = { deviceId: SENSOR.id };
      await screen.rerender(<TemperatureReportScreen />);
      expect(await screen.findByTestId('temperature-report-share-pdf')).toBeDisabled();
      expect(screen.getByTestId('temperature-report-share-pdf-needs-connection')).toHaveTextContent('Needs a connection');
      expect(screen.queryByTestId('temperature-report-needs-connection')).not.toBeOnTheScreen();
    });

    it('going back online makes exactly one request, and the open sensor stays', async () => {
      await boot('customer');
      mockParams = { deviceId: SENSOR.id };
      await render(<TemperatureReportScreen />);
      await screen.findByTestId('temperature-report-share-pdf');
      expect(sensorCalls).toBe(1);
      await connection(true);
      await quiet();
      expect(sensorCalls).toBe(1);
      await connection(false);
      await quiet();
      expect(sensorCalls).toBe(2);
      expect(await screen.findByTestId('temperature-report-share-pdf')).toBeEnabled();
    });

    it('a sensor opened while offline shows the needs-connection state and makes no request', async () => {
      await boot('customer');
      await connection(true);
      mockParams = { deviceId: SENSOR.id };
      await render(<TemperatureReportScreen />);
      expect(await screen.findByTestId('temperature-report-needs-connection')).toBeOnTheScreen();
      await quiet();
      expect(screen.queryByTestId('temperature-report-share-pdf')).not.toBeOnTheScreen();
      expect(sensorCalls).toBe(0);
    });
  });

  it.each(['staff', 'admin'] as const)('Customer activity (%s, warehouse role) offline: whole-screen customer-activity-needs-connection (WH-381 Q1)', async (role) => {
    await boot(role);
    await connection(true);
    await render(<CustomerActivityScreen />);
    expect(await screen.findByTestId('customer-activity-needs-connection')).toHaveTextContent(
      'This needs a connection. It will load when you reconnect.'
    );
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
  });
});

// WH-385: the count travels from the GRN's copy row through the screen to the Images tab, for everyone who sees the photos.
describe('GRN details › Images: photos that could not be sent (WH-385)', () => {
  const openImages = async () => {
    mockParams = { id: 'g-A2' };
    await render(<GRNDetailScreen />);
    await userEvent.press(await screen.findByRole('tab', { name: /images/i }));
  };

  it.each(['customer', 'staff'] as const)('%s, offline: the tab says how many', async role => {
    await boot(role, 2);
    await connection(true);
    await openImages();
    expect(await screen.findByTestId('grn-photos-missing')).toHaveTextContent('2 photos taken with this GRN could not be sent.');
  });

  it('a GRN with none says nothing', async () => {
    await boot('staff');
    await connection(true);
    await openImages();
    expect(screen.queryByTestId('grn-photos-missing')).not.toBeOnTheScreen();
    expect(screen.queryByText(/could not be sent/)).not.toBeOnTheScreen();
  });
});
