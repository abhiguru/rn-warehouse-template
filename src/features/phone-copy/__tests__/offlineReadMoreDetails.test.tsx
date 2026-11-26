/**
 * WH-348 (contract product/tech/app-offline-read-more.md section 8, S3 and S4; Design offline-capture.md 2.5 and 2.11):
 *  - dispatch details over a copy that carries invoice amounts: no WH-299 DS1 line in their place; over a format-2 copy the
 *    DS1 line stays;
 *  - Sensor details, Enrollment review and Accountant export say they need a connection, with no "Try again"; reachable they
 *    are as today.
 *
 * Real: the screens, the services, the sync engine, the copy, the store. Faked at the edge: the server's answers, the phone's
 * native modules, the connection, the navigator.
 *
 * The feed format the WH-348 readers need is one constant, WH348_FORMAT (Product: format 3 comes with WH-328).
 * Not here (see the hand-back): GRN rates, which need the `grn_rates` entity the fake feed does not have yet.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import DispatchDetailScreen from '../../../../app/dispatch-details/[id]';
import SensorDetailScreen from '../../../../app/sensor-detail/[id]';
import EnrollmentReviewScreen from '../../../../app/enrollment-review';
import AccountantExportScreen from '../../../../app/accountant-export';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import authReducer from '@/store/slices/authSlice';
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
  const { useSyncExternalStore } = require('react');
  return {
    useAppSelector: (select: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => select(mockStore.getState())),
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
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'admin', canManageOrders: true, assignedCustomerIds: [] }) }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => true }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: (props: object) => require('react').createElement('ExpoImage', props) }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => children }));
// The customer picker's sheet is closed in every case here.
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
// react-redux is not transformed by this repo's Jest config; the screens read the store through the mocked '@/store/hooks'.
jest.mock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined }));

/** The copy format whose readers WH-348 adds (contract section 2, "Format gate"). */
const WH348_FORMAT = 3;
const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const NEEDS = 'This needs a connection. It will load when you reconnect.';

let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  files.reset();
  seedWarehouse();
  seedDocuments();
  env.feed.format = WH348_FORMAT;
  forgetQueries();
  mockNet.offline = false;
  mockParams = {};
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  const auth = {
    ...authReducer(undefined, { type: 'test/init' }),
    user: { id: 'profile-1' }, session: {}, userProfile: { id: 'profile-1', role: 'admin', name: 'Asha Fictional' },
  };
  mockStore = configureStore({ reducer: { auth: authReducer, theme: themeReducer }, preloadedState: { auth: auth as never } }) as unknown as typeof mockStore;
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  jest.restoreAllMocks();
});

async function load({ expectDone }: { expectDone: boolean }) {
  await engine.startPhoneCopy();
  const result = await engine.syncNow('open');
  if (expectDone) expect(result).toBe('done');
}
async function connection(offline: boolean) {
  await act(async () => {
    await setReachable(!offline);
    engine.setCopyOffline(offline);
    mockNet.set(offline);
  });
}

describe('S3: dispatch details, invoice amounts', () => {
  const AMOUNTS_LINE = 'dispatch-details-section-needs-connection-invoice-amounts';
  async function openInvoices() {
    mockParams = { id: 'd-D2' };
    await render(<DispatchDetailScreen />);
    await userEvent.press(await screen.findByRole('tab', { name: /invoices/i }));
  }

  it.each([[false], [true]])('a copy that carries the amounts (offline: %s): no "needs a connection" line in their place', async offline => {
    await load({ expectDone: true });
    await connection(offline);
    await openInvoices();
    // The seeded invoice of this dispatch (number 7001, total 4321) is listed, as online.
    expect((await screen.findAllByText(/7001/)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId(AMOUNTS_LINE)).not.toBeOnTheScreen();
  });

  it('shows the stored total of the invoice', async () => {
    await load({ expectDone: true });
    await connection(true);
    await openInvoices();
    expect((await screen.findAllByText(/4,?321/)).length).toBeGreaterThan(0);
  });

  it('a format-2 copy keeps WH-299\'s line, as today', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await openInvoices();
    expect(await screen.findByTestId(AMOUNTS_LINE)).toHaveTextContent(NEEDS);
  });
});

type ServerScreen = [string, React.ComponentType, Record<string, string>, string];
const SERVER_SCREENS: ServerScreen[] = [
  ['Sensor details', SensorDetailScreen, { id: 'sensor-1' }, 'sensor-detail-needs-connection'],
  ['Enrollment review', EnrollmentReviewScreen, {}, 'enrollment-review-needs-connection'],
  ['Accountant export', AccountantExportScreen, {}, 'accountant-export-needs-connection'],
];

describe('S4: a screen that needs the server', () => {
  it.each(SERVER_SCREENS)('%s offline says so, with no "Try again"', async (_name, Screen, params, testID) => {
    mockParams = params;
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    expect(await screen.findByTestId(testID)).toHaveTextContent(NEEDS);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it.each(SERVER_SCREENS)('%s reachable: today\'s screen, not told to reconnect', async (_name, Screen, params, testID) => {
    mockParams = params;
    await load({ expectDone: true });
    await render(<Screen />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(screen.queryByTestId(testID)).not.toBeOnTheScreen();
  });

  it.each(SERVER_SCREENS)('%s offline on an older server: no WH-348 line', async (_name, Screen, params, testID) => {
    env.feed.format = 2;
    mockParams = params;
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(screen.queryByTestId(testID)).not.toBeOnTheScreen();
  });
});
