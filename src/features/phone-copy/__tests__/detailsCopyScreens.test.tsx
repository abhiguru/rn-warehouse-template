/**
 * WH-299 slices 3 and 4 on screen: the GRN and dispatch details pages over the phone copy.
 *  - DS1 (contract product/tech/app-offline-read-from-copy.md 10.2, S3a): rates and invoice amounts need a connection;
 *  - Design 2.5 and 2.7 (S3): actions that need the server, offline;
 *  - contract 11.1 (PR9): the page reads again after a sync that changed what it shows;
 *  - contract section 9 and Design 2.5 (S4): a photo that is not on the phone, and one that is.
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

describe('DS1: a section that needs the server', () => {
  it.each([[false], [true]])('GRN rates (offline: %s): the heading, then one line, with no error and no retry', async offline => {
    await connection(offline);
    await openGrn();
    await tab(/overview/i);
    const line = await screen.findByTestId('grn-details-section-needs-connection-rates');
    expect(line).toHaveTextContent(NEEDS);
    expect(screen.getByText('RATES')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-item-rates-loading')).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('dispatch invoice amounts: one line in place of them', async () => {
    await openDispatch();
    await tab(/invoices/i);
    expect(await screen.findByTestId('dispatch-details-section-needs-connection-invoice-amounts')).toHaveTextContent(NEEDS);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });
});

describe('S3: actions that need the server, offline', () => {
  it.each<[string, () => Promise<void>, string, RegExp[]]>([
    ['GRN', openGrn, 'grn-details', [/^Delete.*, needs a connection$/, /^Share PDF, needs a connection$/, /^Print.*, needs a connection$/, /^Edit.*, needs a connection$/]],
    ['dispatch', openDispatch, 'dispatch-details', [/^Delete.*, needs a connection$/, /^Share.*, needs a connection$/, /^Print.*, needs a connection$/, /^Edit.*, needs a connection$/]],
  ])('%s details: each is disabled and says why, with one line above the bar', async (_name, open, id, labels) => {
    await connection(true);
    await open();
    await tab(/overview/i);
    for (const name of labels) expect(await screen.findByRole('button', { name })).toBeDisabled();
    expect(screen.getByTestId(`${id}-bottom-bar-needs-connection`)).toHaveTextContent('Needs a connection');
  });

  it.each<[string, () => Promise<void>, string]>([
    ['GRN', openGrn, 'grn-details'],
    ['dispatch', openDispatch, 'dispatch-details'],
  ])('%s details, reachable: the actions are as today', async (_name, open, id) => {
    await open();
    await tab(/overview/i);
    expect(await screen.findByRole('button', { name: /^Delete/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /needs a connection/ })).not.toBeOnTheScreen();
    expect(screen.queryByTestId(`${id}-bottom-bar-needs-connection`)).not.toBeOnTheScreen();
  });
});

describe('PR9: a details page after a sync', () => {
  it('GRN: shows a change at once', async () => {
    await openGrn();
    await tab(/overview/i);
    expect(await screen.findByText('Fictional note')).toBeOnTheScreen();
    await sync([upsert('goodsreceived', 'g-A2', { ...grnFeedRow(grnNamed('A2')), note: 'Changed fictional note' })]);
    expect(await screen.findByText('Changed fictional note')).toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('GRN: deleted meanwhile, it says it is not found', async () => {
    await openGrn();
    await sync([{ e: 'goodsreceived', id: 'g-A2', op: 'delete' }]);
    expect(await screen.findByText('GRN not found')).toBeOnTheScreen();
  });

  it('dispatch: shows a change at once', async () => {
    await openDispatch();
    await tab(/overview/i);
    expect(await screen.findByText('Fictional dispatch note')).toBeOnTheScreen();
    await sync([upsert('dispatch', 'd-D2', { ...dispatchRow('D2'), note: 'Changed dispatch note' })]);
    expect(await screen.findByText('Changed dispatch note')).toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('dispatch: deleted meanwhile, it says it is not found', async () => {
    await openDispatch();
    await sync([{ e: 'dispatch', id: 'd-D2', op: 'delete' }]);
    expect(await screen.findByText('Dispatch not found')).toBeOnTheScreen();
  });

  it('Q1: a sync that brought nothing does not read the page again', async () => {
    const read = jest.spyOn(copyDb, 'currentCopy');
    await openGrn();
    await tab(/overview/i);
    await screen.findByText('Fictional note');
    await wait(100);
    await sync([]);
    read.mockClear();
    await wait(300);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('S4: photos offline', () => {
  it('a photo never viewed shows that it needs a connection', async () => {
    await connection(true);
    await openGrn();
    await tab(/images|photos/i);
    for (const id of ['ph-first', 'ph-second', 'ph-lot']) {
      expect(await screen.findByTestId(`photo-needs-connection-${id}`)).toHaveTextContent('Photo needs a connection');
    }
  });

  it('a photo kept on the phone is shown from the phone', async () => {
    const store = require(`@/features/phone-copy/${'photoStore'}`) as {
      keepPhoto: (path: string, url: string) => Promise<unknown>; photoFile: (path: string) => Promise<string | null>;
    };
    await store.keepPhoto('fictional/ph-first.jpg', 'https://warehouse.example.test/signed/ph-first.jpg');
    const file = await store.photoFile('fictional/ph-first.jpg');
    expect(file).toMatch(/phone-copy-photos\//);
    await connection(true);
    await openGrn();
    await tab(/images|photos/i);
    await screen.findByTestId('photo-needs-connection-ph-second');
    expect(screen.queryByTestId('photo-needs-connection-ph-first')).not.toBeOnTheScreen();
    // The picture's source is the kept file (no role or text names an image's source).
    await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain(file as string));
  });
});
