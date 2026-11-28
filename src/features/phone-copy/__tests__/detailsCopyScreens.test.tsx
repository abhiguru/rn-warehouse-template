/**
 * WH-299 + WH-381 on screen: GRN details over the phone copy and Dispatch details online-only (Design Part 13.1 A & B):
 *  - DS1: GRN rates, GRN Dispatches tab (`grn-details-section-needs-connection-dispatches`), and GRN Invoices tab
 *    (`grn-details-section-needs-connection-invoices`, no `grn-invoice-state`, no `grn-create-invoice`);
 *  - GRNTabNavigator offline: no dispatch/invoice count badges; tabs remain selectable;
 *  - GRN Items tab expanded lot offline: `grn-item-dispatches-<lotId>` disabled with `", needs a connection"` label +
 *    `grn-item-dispatches-needs-connection-<lotId>`, while "Change rack or mark" stays enabled;
 *  - Dispatch details offline: whole-screen `ScreenNeedsConnection` (`dispatch-details-needs-connection`), no kept rows;
 *  - PR9: GRN details reads again after a sync that changed what it shows;
 *  - S4: GRN photos offline (not on phone vs kept on phone).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The photo frame's testID is `photo-needs-connection-<image id>` (contract 10.2).
 *  - The bottom-bar line is `grn-details-bottom-bar-needs-connection`.
 *  - The lot's quick-change button is `grn-lot-quick-change-<lotId>`; Dispatch details drops its tab bar and every section
 *    offline (the whole screen is `dispatch-details-needs-connection`, contract 4.1).
 * ==================================
 *
 * Real: the pages and their parts, the services, the sync engine, the copy, the store. Faked at the edge: the server's
 * answers, the phone's native modules and files, the connection, the navigator.
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
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { setLanguage } from '@/i18n';
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
const NEEDS_GU = 'આ માટે કનેક્શન જોઈએ. ફરી જોડાશો ત્યારે લોડ થશે.';
const serverCalls: string[] = [];
/** What the fake server answers to a read a test names; every other read is a lost connection. */
const serverAnswers: Record<string, unknown> = {};

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  files.reset();
  seedWarehouse();
  seedDocuments();
  serverCalls.length = 0;
  for (const key of Object.keys(serverAnswers)) delete serverAnswers[key];
  mockNet.offline = false;
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    serverCalls.push(name);
    if (name in serverAnswers) return { data: serverAnswers[name], error: null };
    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  // The quick change of a lot's rack and mark is gated by the backend release (backendFeatures lotQuickChange, migration 226); below 233 so GRN Edit still needs a connection (S3).
  setFacilityRelease(SERVER, { schemaHead: '00000000000226_lot_rack_and_mark' });
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
  resetFacilityRelease();
  await setLanguage('en');
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
  await screen.findByRole('tab', { name: /overview|સારાંશ/i });
}
async function openDispatch() {
  mockParams = { id: 'd-D2' };
  await render(<DispatchDetailScreen />);
}
const tab = (name: RegExp) => userEvent.press(screen.getByRole('tab', { name }));

describe('DS1: sections that need the server on GRN details (WH-299 + WH-381 Part 13.1 B)', () => {
  it.each([[false], [true]])('GRN rates (offline: %s): the heading, then one line, with no error and no retry', async offline => {
    await connection(offline);
    await openGrn();
    await tab(/overview/i);
    const line = await screen.findByTestId('grn-details-section-needs-connection-rates');
    expect(line).toHaveTextContent(NEEDS);
    expect(screen.getByText('RATES')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-item-rates-loading')).not.toBeOnTheScreen();
    // Online the Items and Dispatches tabs read a lot's dispatches from the server (WH-381); offline nothing is asked of it.
    expect(offline ? serverCalls : serverCalls.filter(name => name !== 'get_grn_item_dispatches')).toEqual([]);
  });

  it('GRNTabNavigator offline: omits dispatch and invoice count badges while keeping both tabs selectable', async () => {
    await connection(true);
    await openGrn();
    const dispatchesTab = screen.getByRole('tab', { name: 'Dispatches' });
    const invoicesTab = screen.getByRole('tab', { name: 'Invoices' });
    expect(dispatchesTab).toBeOnTheScreen();
    expect(invoicesTab).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: /^Dispatches, / })).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: /^Invoices, / })).not.toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Items, 2' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Images, 3' })).toBeOnTheScreen();
    await userEvent.press(dispatchesTab);
    expect(dispatchesTab).toBeSelected();
    await userEvent.press(invoicesTab);
    expect(invoicesTab).toBeSelected();
  });

  it('GRN Dispatches tab offline: DS1 screenNeedsConnection, no rows, no Retry, no server calls', async () => {
    await connection(true);
    await openGrn();
    await tab(/^Dispatches/);
    expect(await screen.findByTestId('grn-details-section-needs-connection-dispatches')).toHaveTextContent(NEEDS);
    expect(screen.queryByTestId('grn-dispatches-table')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('GRN Invoices tab offline: DS1 screenNeedsConnection, no grn-invoice-state, no grn-create-invoice, no rows', async () => {
    await connection(true);
    await openGrn();
    await tab(/^Invoices/);
    expect(await screen.findByTestId('grn-details-section-needs-connection-invoices')).toHaveTextContent(NEEDS);
    expect(screen.queryByTestId('grn-invoice-state')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-create-invoice')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('GRN Items tab expanded lot offline: View dispatches disabled with ", needs a connection" + footnote, Change rack or mark stays enabled', async () => {
    await connection(true);
    await openGrn();
    await userEvent.press(await screen.findByTestId('grn-item-row-l02'));
    const viewDispatches = await screen.findByTestId('grn-item-dispatches-l02');
    expect(viewDispatches).toBeDisabled();
    expect(viewDispatches).toHaveAccessibleName('View dispatches, needs a connection');
    expect(screen.getByTestId('grn-item-dispatches-needs-connection-l02')).toHaveTextContent('Needs a connection');
    expect(screen.getByTestId('grn-lot-quick-change-l02')).toBeEnabled();
  });

  it('Gujarati GRN details offline: Dispatches tab, Invoices tab and lot View dispatches use Design 13.3 wording', async () => {
    await setLanguage('gu');
    await connection(true);
    await openGrn();
    await userEvent.press(await screen.findByTestId('grn-item-row-l02'));
    expect(await screen.findByTestId('grn-item-dispatches-l02')).toBeDisabled();
    expect(screen.getByTestId('grn-item-dispatches-l02')).toHaveAccessibleName(/, કનેક્શન જોઈએ$/);
    expect(screen.getByTestId('grn-item-dispatches-needs-connection-l02')).toHaveTextContent('કનેક્શન જોઈએ');
    await tab(/જાવક/);
    expect(await screen.findByTestId('grn-details-section-needs-connection-dispatches')).toHaveTextContent(NEEDS_GU);
    await tab(/ઇન્વૉઇસ|બિલ/);
    expect(await screen.findByTestId('grn-details-section-needs-connection-invoices')).toHaveTextContent(NEEDS_GU);
  });
});

describe('WH-381: Dispatch details offline (Design Part 13.1 A)', () => {
  it('offline: whole-screen ScreenNeedsConnection, no tabs, no kept rows, no bottom-bar line, no Retry', async () => {
    await connection(true);
    await openDispatch();
    expect(await screen.findByTestId('dispatch-details-needs-connection')).toHaveTextContent(NEEDS);
    expect(screen.queryByRole('tab', { name: /overview/i })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-details-section-needs-connection-invoice-amounts')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-details-bottom-bar-needs-connection')).not.toBeOnTheScreen();
    expect(screen.queryByText('Fictional dispatch note')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('Gujarati offline: dispatch-details-needs-connection shows Gujarati wording', async () => {
    await setLanguage('gu');
    await connection(true);
    await openDispatch();
    expect(await screen.findByTestId('dispatch-details-needs-connection')).toHaveTextContent(NEEDS_GU);
  });
});

describe('S3: actions that need the server on GRN details, offline', () => {
  it('GRN details: server-only actions are disabled and say why, with one line above the bar', async () => {
    await connection(true);
    await openGrn();
    await tab(/overview/i);
    for (const name of [/^Delete.*, needs a connection$/, /^Share PDF, needs a connection$/, /^Print.*, needs a connection$/, /^Edit.*, needs a connection$/]) {
      expect(await screen.findByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByTestId('grn-details-bottom-bar-needs-connection')).toHaveTextContent('Needs a connection');
  });

  it('GRN details, reachable: the actions are as today', async () => {
    await openGrn();
    await tab(/overview/i);
    expect(await screen.findByRole('button', { name: /^Delete/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /needs a connection/ })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-details-bottom-bar-needs-connection')).not.toBeOnTheScreen();
  });
});

describe('PR9: GRN details after a sync', () => {
  it('GRN: shows a change at once', async () => {
    await openGrn();
    await tab(/overview/i);
    expect(await screen.findByText('Fictional note')).toBeOnTheScreen();
    await sync([upsert('goodsreceived', 'g-A2', { ...grnFeedRow(grnNamed('A2')), note: 'Changed fictional note' })]);
    expect(await screen.findByText('Changed fictional note')).toBeOnTheScreen();
    expect(serverCalls.filter(name => name !== 'get_grn_item_dispatches')).toEqual([]); // online, a lot's dispatches are read from the server (WH-381)
  });

  it('GRN: deleted meanwhile, it says it is not found', async () => {
    await openGrn();
    await sync([{ e: 'goodsreceived', id: 'g-A2', op: 'delete' }]);
    expect(await screen.findByText('GRN not found')).toBeOnTheScreen();
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

// WH-381 gate (app/grn-details/[id].tsx: fetchAllDispatches and the invoice-rows effect wait for a connection, then run once).
describe('WH-381: GRN details asks the server for lot dispatches only with a connection', () => {
  const lotCalls = () => serverCalls.filter(name => name === 'get_grn_item_dispatches');
  const dispatchAnswer = {
    success: true,
    data: {
      dispatches: [{ id: 'srv-d1', disp_id: 'srv-d1', disp_no: 'D-9001', disp_date: '2026-11-26', quantity: 3, customer_name: 'asha Traders' }],
      summary: { total_dispatched: 3, dispatch_count: 1 },
    },
  };

  it.each([['Items'], ['Dispatches'], ['Invoices']])('offline, the %s tab: no read of lot dispatches or invoice rows, and no error state', async name => {
    await connection(true);
    await openGrn();
    await tab(new RegExp(`^${name}`));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(serverCalls).toEqual([]);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(screen.queryByText(/couldn.t load|failed/i)).not.toBeOnTheScreen();
  });

  it('opened offline on the Dispatches tab, then the connection returns: each lot is read once and the tab fills', async () => {
    serverAnswers.get_grn_item_dispatches = dispatchAnswer;
    await connection(true);
    await openGrn();
    await tab(/^Dispatches/);
    expect(await screen.findByTestId('grn-details-section-needs-connection-dispatches')).toBeOnTheScreen();
    expect(lotCalls()).toEqual([]);
    await connection(false);
    expect(await screen.findByText('D-9001')).toBeOnTheScreen();
    expect(screen.queryByTestId('grn-details-section-needs-connection-dispatches')).not.toBeOnTheScreen();
    // GRN A2 has two lots (the Items tab count): one read each, no repeat.
    expect(lotCalls()).toHaveLength(2);
  });
});
