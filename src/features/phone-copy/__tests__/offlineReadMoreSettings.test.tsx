/**
 * WH-348 (contract product/tech/app-offline-read-more.md section 8, S5 and S6; Design offline-capture.md 2.5, 2.11 and "Answers
 * to the WH-348 contracts", DQ1):
 *  - Settings: the Enrollment review row shows no count of waiting requests while the phone has no connection (Product PQ2:
 *    hidden, never shown stale); reachable it shows the count as today;
 *  - Rack buttons (a settings editor): the buttons show the copy's values, are disabled, Save says ", needs a connection" in its
 *    label only, and one "Needs a connection" line sits above the bottom bar.
 *
 * Real: the screens, the services, the sync engine, the copy, the store. Faked at the edge: the server's answers (the count of
 * waiting requests is the server's `user_profiles` count), the phone's native modules, the connection, the navigator.
 *
 * The feed format the WH-348 readers need is one constant, WH348_FORMAT (Product: format 3 comes with WH-328).
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import SettingsScreen from '../../../../app/settings';
import RackPresetsScreen from '../../../../app/rack-presets';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import authReducer from '@/store/slices/authSlice';
import themeReducer from '@/store/slices/themeSlice';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.fileSystem());
let mockWaiting = 3;
jest.mock('@/config/supabaseConfig', () => {
  const phone = require('@/tests/phoneCopy/phoneEnv');
  const supabase = phone.mockFactories.supabase();
  const client = async () => ({
    rpc: (name: string, args: Record<string, unknown>) => phone.env.feed.rpc(name, args ?? {}),
    // The count of people waiting for approval, the one direct table read of Settings.
    from: () => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'is', 'in']) query[method] = () => query;
      query.then = (resolve: (value: unknown) => unknown) => resolve({ count: mockWaiting, data: null, error: null });
      return query;
    },
  });
  return { ...supabase, getAuthenticatedClient: client, getSupabaseClient: client, RequestTimeoutError: class RequestTimeoutError extends Error {} };
});
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn() }));
let mockStore: { getState: () => unknown; subscribe: (l: () => void) => () => void; dispatch: (a: never) => unknown };
jest.mock('@/store', () => ({ get store() { return mockStore; } }));
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppSelector: (select: (state: unknown) => unknown) => useSyncExternalStore(mockStore.subscribe, () => select(mockStore.getState())),
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
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  useIsFocused: () => true,
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
jest.mock('@/config/backendFeatures', () => ({ backendHasFeature: () => true }));
jest.mock('@/hooks/useCapability', () => ({ useFacilityCapabilities: () => ({ printing: false, sensors: true, realtime: true, customerDocuments: false }) }));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn() }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn(), whileLeaving: (work: () => Promise<unknown>) => work() }));
jest.mock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined }));

/** The copy format whose readers WH-348 adds (contract section 2, "Format gate"). */
const WH348_FORMAT = 3;
const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };

let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  seedWarehouse();
  env.feed.format = WH348_FORMAT;
  env.feed.rows.settings.push({ id: 'rack_presets', row: { floor: ['F-1'], chamber: ['C-1', 'C-2'], version: 3, max_label_length: 12, max_per_list: 20 } });
  forgetQueries();
  mockWaiting = 3;
  mockNet.offline = false;
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    // The one read the server answers while the phone is reachable: the rack buttons' own request.
    if (name === 'get_rack_presets' && !mockNet.offline) {
      return { data: { success: true, floor: ['F-1'], chamber: ['C-1', 'C-2'], version: 3, max_label_length: 12, max_per_list: 20 }, error: null };
    }
    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  const auth = {
    ...authReducer(undefined, { type: 'test/init' }),
    user: { id: 'profile-1' }, session: {}, userProfile: { id: 'profile-1', role: 'admin', name: 'Asha Fictional', mobile: '919000000001' },
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

describe('S5: Settings, the count of people waiting for approval', () => {
  it('reachable: the Enrollment review row shows the count', async () => {
    await load({ expectDone: true });
    await render(<SettingsScreen />);
    expect(await screen.findByTestId('settings-feature-enrollmentReview')).toHaveAccessibleName(/3/);
  });

  it('goes away when the connection is lost: hidden, never shown stale', async () => {
    await load({ expectDone: true });
    await render(<SettingsScreen />);
    expect(await screen.findByTestId('settings-feature-enrollmentReview')).toHaveAccessibleName(/3/);
    await connection(true);
    expect(screen.getByTestId('settings-feature-enrollmentReview')).not.toHaveAccessibleName(/3/);
  });

  it('opened with no connection it shows no count, and the other rows are as today', async () => {
    await load({ expectDone: true });
    await connection(true);
    await render(<SettingsScreen />);
    expect(await screen.findByTestId('settings-feature-enrollmentReview')).not.toHaveAccessibleName(/3/);
    expect(screen.getByTestId('settings-feature-customers')).toHaveAccessibleName('Customers, Farmers and traders you store goods for');
  });

  it('an older server, offline: today\'s row (the count is kept as it was read)', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await render(<SettingsScreen />);
    expect(await screen.findByTestId('settings-feature-enrollmentReview')).toHaveAccessibleName(/3/);
    await connection(true);
    expect(screen.getByTestId('settings-feature-enrollmentReview')).toHaveAccessibleName(/3/);
  });
});

describe('S6: Rack buttons editor with no connection', () => {
  const open = async () => {
    await render(<RackPresetsScreen />);
    await screen.findByTestId('rack-presets-floor-0');
  };

  it('shows the copy\'s values, disabled, with one line above the bar and ", needs a connection" on Save only', async () => {
    await load({ expectDone: true });
    await connection(true);
    await open();
    expect(screen.getByTestId('rack-presets-floor-0')).toHaveDisplayValue('F-1');
    expect(screen.getByTestId('rack-presets-chamber-1')).toHaveDisplayValue('C-2');
    expect(screen.getByTestId('rack-presets-floor-0')).toBeDisabled();
    expect(screen.getByTestId('rack-presets-chamber-0')).toBeDisabled();
    expect(screen.getByTestId('rack-presets-floor-add')).toBeDisabled();
    expect(screen.getByTestId('rack-presets-chamber-add')).toBeDisabled();
    expect(screen.getByTestId('rack-presets-floor-0-remove')).toBeDisabled();
    expect(screen.getByTestId('rack-presets-bottom-bar-needs-connection')).toHaveTextContent('Needs a connection');
    expect(screen.getByRole('button', { name: 'Save rack buttons, needs a connection' })).toBeDisabled();
    // The reason is on Save only: a field or a button is read by its own name.
    expect(screen.queryByRole('button', { name: /Add a Floor button, needs a connection/ })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('rack-presets-error')).not.toBeOnTheScreen();
  });

  it('reachable: the fields and buttons are live and there is no line', async () => {
    await load({ expectDone: true });
    await open();
    expect(screen.getByTestId('rack-presets-floor-0')).toBeEnabled();
    expect(screen.getByTestId('rack-presets-floor-add')).toBeEnabled();
    expect(screen.queryByTestId('rack-presets-bottom-bar-needs-connection')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save rack buttons' })).toBeOnTheScreen();
  });

  it('on an older server, offline, today\'s screen: no line', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await connection(true);
    // Today the screen asks the server itself, which is out of reach: its error state, with its retry.
    await render(<RackPresetsScreen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByTestId('rack-presets-bottom-bar-needs-connection')).not.toBeOnTheScreen();
  });
});
