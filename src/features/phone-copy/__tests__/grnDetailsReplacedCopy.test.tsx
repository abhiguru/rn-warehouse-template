/**
 * WH-303 on the GRN details page over the phone copy (contract product/tech/app-offline-edit-grn.md sections 2 and 5.6;
 * Design offline-capture.md 6.2, 6.x):
 *  - the replaced-entries strip is read from the copy (entity `grn_replacements`, feed format 4), offline too, and a copy of
 *    an older format shows none;
 *  - "Mark as checked" is there for an administrator and says it needs a connection while the phone is offline;
 *  - "Edit" works with no connection exactly when the server has the field-change save (`grnFieldChanges`): with the
 *    feature off it is disabled and says it needs a connection, as before WH-303.
 * The harness is detailsCopyScreens.test.tsx's.
 *
 * Real: the pages and their parts, the services, the sync engine, the copy, the store. Faked at the edge: the server's
 * answers, the phone's native modules and files, the connection, the navigator.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The photo frame's testID is `photo-needs-connection-<image id>` (contract 10.2).
 *  - The bottom-bar line is `grn-details-bottom-bar-needs-connection` / `dispatch-details-bottom-bar-needs-connection`.
 * ==================================
 */
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import GRNDetailScreen from '../../../../app/grn-details/[id]';
import DispatchDetailScreen from '../../../../app/dispatch-details/[id]';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { grnFeedRow, grnNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { dispatchRow, seedDocuments } from '@/tests/phoneCopy/documentsDataset';
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
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: (props: object) => require('react').createElement('ExpoImage', props) }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The test phone reports no server migration: the field-change save is switched per case.
let mockFieldChanges = true;
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: (feature: string) => feature === 'grnFieldChanges' && mockFieldChanges }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const NEEDS = 'This needs a connection. It will load when you reconnect.';
const serverCalls: string[] = [];

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  files.reset();
  seedWarehouse();
  seedDocuments();
  serverCalls.length = 0;
  mockNet.offline = false;
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    serverCalls.push(name);    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  const auth = {
    ...authReducer(undefined, { type: 'test/init' }),
    user: { id: 'profile-1' }, session: {}, userProfile: { id: 'profile-1', role: 'admin', name: 'Asha Fictional' },
  };
  mockStore = configureStore({
    reducer: { auth: authReducer, theme: themeReducer },
    preloadedState: { auth: auth as never },
  }) as unknown as typeof mockStore;
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  jest.restoreAllMocks();
});

const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
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
async function openGrn() {
  mockParams = { id: 'g-A2' };
  await render(<GRNDetailScreen />);
  await screen.findByRole('tab', { name: /overview/i });
}
async function openDispatch() {
  mockParams = { id: 'd-D2' };
  await render(<DispatchDetailScreen />);
  await screen.findByRole('tab', { name: /overview/i });
}
const tab = (name: RegExp) => userEvent.press(screen.getByRole('tab', { name }));

/** Two unchecked entries on GRN A2, in the server's row shape (`get_grn_replacements` plus `grn_id`). */
function seedReplacements() {
  const entry = (id: string, sentAt: string, over: Record<string, unknown> = {}) => ({
    id, grn_id: 'g-A2', kind: 'field', field: 'rack', newer_value: 'D-5', newer_by_name: 'Meena Fictional', newer_at: '2026-11-26T10:45:00+00:00',
    sent_value: 'C-2', sent_by_name: 'Ravi Fictional', sent_at: sentAt, recorded_at: null, ...over,
  });
  env.feed.rows.grn_replacements.push(
    { id: 'rp1', row: entry('rp1', '2026-11-26T10:50:00+00:00') },
    { id: 'rp2', row: entry('rp2', '2026-11-26T11:50:00+00:00', { field: 'note', newer_value: 'old', sent_value: 'new' }) },
  );
}
async function bootWith(format: number) {
  await engine.stopPhoneCopy();
  await copyDb.eraseCopy();
  env.feed.format = format;
  if (format >= 4) seedReplacements();
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
}

describe('the replaced-entries strip from the copy', () => {
  beforeEach(() => { mockFieldChanges = true; });

  it('shows the entries offline, newest first, with no call to the server', async () => {
    await bootWith(4);
    await connection(true);
    await openGrn();
    expect(await screen.findByText("A change here replaced someone's newer entry. Check it is right.")).toBeOnTheScreen();
    expect(screen.getByTestId('grn-details-replaced-line-rp1')).toHaveTextContent(/Rack: D-5 \(Meena Fictional, .*\) was replaced by C-2 \(Ravi Fictional, .*\)\./);
    expect(screen.getByTestId('grn-details-replaced-line-rp2')).toHaveTextContent(/Notes?: old/);
    const lines = screen.getAllByTestId(/^grn-details-replaced-line-/).map(node => node.props.testID);
    expect(lines).toEqual(['grn-details-replaced-line-rp2', 'grn-details-replaced-line-rp1']);
    expect(serverCalls).toEqual([]);
  });

  it('offline, an administrator sees Mark as checked disabled with the needs-a-connection line, and a tap sends nothing', async () => {
    await bootWith(4);
    await connection(true);
    await openGrn();
    const button = await screen.findByRole('button', { name: /Mark as checked, needs a connection/i });
    expect(button).toBeDisabled();
    expect(screen.getByTestId('grn-details-replaced-mark-checked-needs-connection')).toBeOnTheScreen();
    await userEvent.press(button);
    expect(serverCalls).toEqual([]);
  });

  it('with a connection, Mark as checked is enabled and asks the server to mark exactly the shown entries', async () => {
    await bootWith(4);
    const rpc = env.feed.rpc;
    env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'mark_grn_replacements_checked') { serverCalls.push(name); serverArgs.push(args); return { data: { success: true }, error: null }; }
      return rpc(name, args);
    };
    await openGrn();
    const button = await screen.findByRole('button', { name: 'Mark as checked' });
    expect(button).toBeEnabled();
    await userEvent.press(button);
    await waitFor(() => expect(serverCalls).toContain('mark_grn_replacements_checked'));
    expect(serverArgs[0]).toEqual({ p_grn_id: 'g-A2', p_ids: ['rp2', 'rp1'] });
  });

  it('a copy of format 3 holds no entries, so the page shows no strip', async () => {
    await bootWith(3);
    await openGrn();
    expect(screen.queryByTestId('grn-details-replaced-strip')).not.toBeOnTheScreen();
  });
});

describe('Edit offline', () => {
  it('is enabled with no connection when the server takes the edit as field changes', async () => {
    mockFieldChanges = true;
    await bootWith(4);
    await connection(true);
    await openGrn();
    await tab(/overview/i);
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Edit.*needs a connection/ })).not.toBeOnTheScreen();
  });

  it('is disabled with no connection, and says why, when the server has not got the field-change save', async () => {
    mockFieldChanges = false;
    await bootWith(4);
    await connection(true);
    await openGrn();
    await tab(/overview/i);
    expect(await screen.findByRole('button', { name: /^Edit.*, needs a connection$/ })).toBeDisabled();
  });

  it('is enabled with a connection whichever way the feature is', async () => {
    mockFieldChanges = false;
    await bootWith(4);
    await openGrn();
    await tab(/overview/i);
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeEnabled();
  });
});

const serverArgs: Record<string, unknown>[] = [];
