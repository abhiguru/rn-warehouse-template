/**
 * WH-348 (contract product/tech/app-offline-read-more.md sections 8, 11 S2, S3, S6 and 14; Design offline-capture.md 2.5, 2.11 and
 * the DQ answers): with no connection, over a copy of the format that carries these records,
 *  - Invoice details: Edit, Cancel, Delete, Share PDF and Print are disabled and say ", needs a connection" in their label, one
 *    line above them; the Payments tab has no "+" and says new payments need a connection;
 *  - Customer details and Item details: Edit is disabled and says so;
 *  - GRN details shows its rates from the copy, in place of WH-299's line, and its rate actions are disabled with one line;
 *  - the editors (Standard rate, GST details, Document numbering, Charging) show the copy's values with their controls disabled,
 *    Save disabled with ", needs a connection" on Save only, and one "Needs a connection" line.
 * Reachable, or on an older server: today's screens (the actions are live, no line, no WH-348 testID).
 *
 * Real: the screens, the services, the sync engine, the copy, the store. Faked at the edge: the server's answers, the phone's
 * native modules, the connection, the navigator.
 *
 * The feed format the WH-348 readers need is one constant, WH348_FORMAT. Row shapes follow contract 14.1; where it is silent (the
 * `numbering` and `charging_rule` settings rows) the rows below are the server's answers' own fields, an ASSUMPTION for the
 * build to confirm. Design accepted the 14.3 testIDs.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import InvoiceDetailsScreen from '../../../../app/invoice-details/[id]';
import CustomerDetailsScreen from '../../../../app/customer/[id]';
import ItemDetailsScreen from '../../../../app/item/[id]';
import GrnDetailsScreen from '../../../../app/grn-details/[id]';
import StandardRateScreen from '../../../../app/standard-rate';
import GstDetailsScreen from '../../../../app/gst-details';
import DocumentNumberingScreen from '../../../../app/document-numbering';
import ChargingScreen from '../../../../app/charging';
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
// A screen test does not mount a GestureHandlerRootView, which every GestureDetector needs.
jest.mock('react-native-gesture-handler', () => ({ ...jest.requireActual('react-native-gesture-handler'), GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false, isAdmin: true, isSupervisor: false, isStaffRole: false }) }));
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

jest.mock('@/config/backendFeatures', () => ({ backendHasFeature: () => true }));
jest.mock('@/features/payments/usePaymentsVisible', () => ({ usePaymentsVisible: () => true }));

/** The copy format whose readers WH-348 adds (contract section 2, "Format gate"). */
const WH348_FORMAT = 3;
const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const NEEDS = 'This needs a connection. It will load when you reconnect.';

/** The `numbering` feed body for admin and supervisor (contract 14.4): an object keyed by document type, no `document_type` inside. */
const NUMBERING_BODY = Object.fromEntries((['grn', 'dispatch', 'invoice'] as const).map(type => [type, {
  scheme: 'sequence', prefix: `${type.slice(0, 1).toUpperCase()}-`, width: 4, start: 1, first_letter: null, per_letter: null,
  check: true, fy_reset: false, server_issues: false, updated_at: '2026-11-01T05:00:00+00:00', updated_by: 'Asha Fictional',
}]));
/** What a format-3 copy holds for these screens (contract 14.1). */
function seedFormat3() {
  const feed = env.feed;
  const invoice = feed.rows.invoice.find(r => r.id === 'inv1');
  if (invoice) {
    Object.assign(invoice.row, {
      customer_name: 'Bhavin Foods', inv_prefix: 'INV-', inv_fin_year: 2026, cancelled_at: null, doc_type: 'invoice',
      payment_state: { paid_amount: 1000, due_amount: 3321, payment_status: 'part_paid' },
    });
  }
  // The server's worked-out figures travel with the rows (contract 15.2); without them invoice details read from the server.
  if (invoice) Object.assign(invoice.row, { items_total_amount: 4321, discount_set_by_name: null, zero_charge_set_by_name: null });
  const line = feed.rows.invoice_trl.find(r => r.id === 'invl1');
  if (line) Object.assign(line.row, { storage_amount: 777.5, line_amounts: { tax_amount: 150, total_amount: 4321 } });
  // Each lot's rate as the server worked it out (contract 16.2).
  const rateOf = (unit: number) => ({ source: 'grn', unit_price: unit, labour_rate: 2, tax_percent: 5, weight_min: 0, weight_max: 50, varies: false });
  for (const [id, unit] of [['l02', 12.5], ['l03', 14]] as const) {
    const lot = feed.rows.goodsreceived_trl.find(r => r.id === id);
    if (lot) lot.row.item_rate = rateOf(unit);
  }
  const put = (entity: string, id: string, row: Record<string, unknown>) => feed.rows[entity].push({ id, row: { id, ...row } });
  put('grn_rates', 'gr1', { gr_id: 'g-A2', item_id: 'i1', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 12.5, labour_rate: 2, tax_percent: 5 });
  put('grn_rates', 'gr2', { gr_id: 'g-A2', item_id: 'i2', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 14, labour_rate: 2, tax_percent: 5 });
  put('standard_rate_tiers', 'st1', { weight_min: 0, weight_max: 10, unit_price: 6, labour_rate: 1, tax_percent: 5, updated_at: '2026-11-01T05:00:00+00:00', updated_by: 'p1' });
  put('standard_rate_tiers', 'st2', { weight_min: 11, weight_max: 20, unit_price: 5.5, labour_rate: 1, tax_percent: 5, updated_at: '2026-11-01T05:00:00+00:00', updated_by: 'p1' });
  put('settings', 'gst_details', {
    saved: true, registered: true, gstin: '24AAAAA0000A1Z5', state_name: 'Gujarat', legal_name: 'Fictional Cold Store Pvt', address: '1 Test Road, Rajkot',
    sac_storage: '996711', sac_labour: '996719', saved_by_name: 'Asha Fictional',
  });
  put('settings', 'bills_allowed', { allowed: true });
  // The settings bodies are stored as sent (contract 14.4): flat, with no `id` inside.
  feed.rows.settings.push({ id: 'charging_rule', row: { step_days: 15, minimum_days: 30, days_counted: 'legacy', rounding: 'up',
    invoice_as_goods_leave: false, updated_at: '2026-11-01T05:00:00+00:00', updated_by: 'p1' } });
  feed.rows.settings.push({ id: 'numbering', row: NUMBERING_BODY });
}

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
  seedFormat3();
  forgetQueries();
  mockNet.offline = false;
  mockParams = {};
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true, payments: true, printing: true });
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


const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

/** [what is opened, its route params, the testID of each control that needs the server, the testID of the one line, the line's text] */
type Actions = { name: string; Screen: React.ComponentType; params: Record<string, string>; ready: string; controls: string[]; line: string; lineText: string; tab?: RegExp };
const NEEDS_LINE = 'Needs a connection';
const ACTION_SCREENS: Actions[] = [
  { name: 'Invoice details', Screen: InvoiceDetailsScreen, params: { id: 'inv1' }, ready: 'invoice-details-cancel', tab: /overview/i,
    controls: ['invoice-details-edit', 'invoice-details-cancel', 'invoice-details-delete', 'invoice-details-share-pdf', 'invoice-details-print'],
    line: 'invoice-details-actions-needs-connection', lineText: NEEDS_LINE },
  { name: 'Customer details', Screen: CustomerDetailsScreen, params: { id: 'c2' }, ready: 'customer-details-edit',
    controls: ['customer-details-edit'], line: 'customer-details-actions-needs-connection', lineText: NEEDS_LINE },
  { name: 'Item details', Screen: ItemDetailsScreen, params: { id: 'i2' }, ready: 'item-details-edit',
    controls: ['item-details-edit'], line: 'item-details-actions-needs-connection', lineText: NEEDS_LINE },
];

describe.each(ACTION_SCREENS)('$name', ({ Screen, params, ready, controls, line, lineText, tab }) => {
  it('with no connection: each action is disabled, says why in its label, and one line says it', async () => {
    mockParams = params;
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    if (tab) await userEvent.press(await screen.findByRole('tab', { name: tab }));
    await screen.findByTestId(ready);
    for (const id of controls) {
      expect(screen.getByTestId(id)).toBeDisabled();
      expect(screen.getByTestId(id)).toHaveAccessibleName(/, needs a connection$/);
    }
    expect(screen.getByTestId(line)).toHaveTextContent(lineText);
  });

  it('reachable: the actions are live and there is no line', async () => {
    mockParams = params;
    await load({ expectDone: true });
    await render(<Screen />);
    if (tab) await userEvent.press(await screen.findByRole('tab', { name: tab }));
    await screen.findByTestId(ready);
    for (const id of controls) {
      expect(screen.getByTestId(id)).toBeEnabled();
      expect(screen.getByTestId(id)).not.toHaveAccessibleName(/needs a connection/);
    }
    expect(screen.queryByTestId(line)).not.toBeOnTheScreen();
  });

  it('on an older server, offline: today\'s screen, no WH-348 line', async () => {
    env.feed.format = 2;
    mockParams = params;
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    await settle();
    expect(screen.queryByTestId(line)).not.toBeOnTheScreen();
  });
});

describe('Invoice details, Payments tab', () => {
  const openPayments = async () => {
    mockParams = { id: 'inv1' };
    await render(<InvoiceDetailsScreen />);
    await userEvent.press(await screen.findByRole('tab', { name: /payments/i }));
  };

  it('with no connection: no "+" to record a payment, and the footnote says new payments need a connection', async () => {
    await load({ expectDone: true });
    await connection(true);
    await openPayments();
    expect(await screen.findByTestId('payments-new-needs-connection')).toHaveTextContent('New payments need a connection.');
    expect(screen.queryByTestId('payment-record')).not.toBeOnTheScreen();
  });

  it('reachable: the "+" is there and there is no footnote', async () => {
    await load({ expectDone: true });
    await openPayments();
    expect(await screen.findByTestId('payment-record')).toBeEnabled();
    expect(screen.queryByTestId('payments-new-needs-connection')).not.toBeOnTheScreen();
  });
});

describe('GRN details, rates from the copy', () => {
  const open = async () => {
    mockParams = { id: 'g-A2' };
    await render(<GrnDetailsScreen />);
    await userEvent.press(await screen.findByRole('tab', { name: /overview/i }));
  };

  /** WH-348 contract 16.1: GRN details has no rate action (those are WH-303's), so no line and no error shows. */
  const noRatesLine = () => {
    for (const id of ['grn-rates-needs-connection', 'grn-item-rates-error', 'grn-item-rates-loading', 'grn-details-section-needs-connection-rates']) {
      expect(screen.queryByTestId(id)).not.toBeOnTheScreen();
    }
  };

  it.each([[false], [true]])('(offline: %s) shows the stored rates as online, not WH-299\'s line', async offline => {
    await load({ expectDone: true });
    await connection(offline);
    await open();
    expect(await screen.findByTestId('grn-item-rates')).toBeOnTheScreen();
    expect(screen.getAllByTestId('grn-item-rates-header').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('grn-item-rate-row').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12\.5/).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('grn-item-rates-note').length).toBeGreaterThan(0);
    noRatesLine();
  });

  it('with no connection: the rate rows are the copy\'s and no line says the rates need a connection', async () => {
    await load({ expectDone: true });
    await connection(true);
    await open();
    await screen.findByTestId('grn-item-rates');
    expect(screen.getAllByText(/14/).length).toBeGreaterThan(0);
    noRatesLine();
  });

  it('reachable: the rate rows show and no rates line shows', async () => {
    await load({ expectDone: true });
    await open();
    await screen.findByTestId('grn-item-rates');
    expect(screen.getAllByTestId('grn-item-rate-row').length).toBeGreaterThan(0);
    noRatesLine();
  });

  it('a format-2 copy keeps WH-299\'s line', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await open();
    expect(await screen.findByTestId('grn-details-section-needs-connection-rates')).toHaveTextContent(NEEDS);
  });
});

type Editor = { name: string; Screen: React.ComponentType; ready: string; shows: RegExp; disabled: string[]; line: string; save: RegExp | null };
const EDITORS: Editor[] = [
  { name: 'Standard rate', Screen: StandardRateScreen, ready: 'band-0', shows: /6/, line: 'standard-rate-bottom-bar-needs-connection',
    disabled: ['band-0-upTo', 'band-0-rent', 'band-0-labour', 'band-0-tax', 'add-band', 'band-0-remove'], save: /^Save.*, needs a connection$/ },
  { name: 'GST details', Screen: GstDetailsScreen, ready: 'gst-details-gstin', shows: /24AAAAA0000A1Z5/, line: 'gst-details-bottom-bar-needs-connection',
    disabled: ['gst-details-gstin', 'gst-details-address', 'gst-details-legal-name', 'gst-details-sac-storage', 'gst-details-sac-labour'], save: /^Save.*, needs a connection$/ },
  { name: 'Document numbering', Screen: DocumentNumberingScreen, ready: 'numbering-row-grn', shows: /G-/, line: 'numbering-needs-connection',
    disabled: ['numbering-row-grn', 'numbering-row-dispatch', 'numbering-row-invoice'], save: null },
  { name: 'Charging', Screen: ChargingScreen, ready: 'charging-row-step', shows: /15/, line: 'charging-needs-connection',
    disabled: ['charging-row-step', 'charging-row-minimum', 'charging-row-days', 'charging-row-round'], save: null },
];

describe.each(EDITORS)('$name editor', ({ Screen, ready, shows, disabled, line, save }) => {
  it('with no connection: shows the copy\'s values, controls disabled, one line, Save carries the reason', async () => {
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    await screen.findByTestId(ready);
    expect(screen.queryAllByText(shows).length + screen.queryAllByDisplayValue(shows).length).toBeGreaterThan(0);
    for (const id of disabled) expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.getByTestId(line)).toHaveTextContent(NEEDS_LINE);
    if (save) expect(screen.getByRole('button', { name: save })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it('on an older server, offline: no WH-348 line', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    await settle();
    expect(screen.queryByTestId(line)).not.toBeOnTheScreen();
  });
});
