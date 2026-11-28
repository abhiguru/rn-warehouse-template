/**
 * WH-161 S9 (UI): Stock Summary & Customer Stock Summary show `IncludesUnsentLine` (`ReportScaffold.kpiNote`) and the
 * matching `KPICard.spokenNote` in English and Gujarati, including for a customer whose only stock is an unsent GRN, and
 * show neither when nothing is unsent or when the total came from the server (PQ7).
 *
 * Real: StockSummaryScreen, ReportScaffold, KPIGrid, KPICard, IncludesUnsentLine, stock-summary-service, copy SQL readers,
 * unsent store/queue/overlay, sync engine. Faked only at the edge: SQLite, files, NetInfo, server RPCs, router, FlashList.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import StockSummaryScreen from '../../../../app/reports/stock-summary';
import { setFacilityRelease } from '@/config/backendFeatures';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { saveOperatorServer } from '@/config/operatorServer';
import * as copyDb from '@/features/phone-copy/copyDb';
import * as engine from '@/features/phone-copy/syncEngine';
import '@/features/unsent/newGrnKind';
import { getUnsentDb } from '@/features/unsent/unsentDb';
import { enqueue } from '@/features/unsent/unsentQueue';
import { initUnsent, refreshUnsent } from '@/features/unsent/unsentStore';
import { setLanguage } from '@/i18n';
import authReducer from '@/store/slices/authSlice';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import themeReducer from '@/store/slices/themeSlice';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { createFakeFeed } from '@/tests/phoneCopy/fakeFeed';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const mockServerRpc = jest.fn();

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('expo-file-system/legacy', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule(), { virtual: true });
jest.mock('@/config/supabaseConfig', () => {
  const phone = require('@/tests/phoneCopy/phoneEnv');
  const supabase = phone.mockFactories.supabase();
  const client = async () => ({
    rpc: (name: string, args: Record<string, unknown> = {}) =>
      name.startsWith('get_sync_') ? phone.env.feed.rpc(name, args) : mockServerRpc(name, args),
  });
  return {
    ...supabase,
    getAuthenticatedClient: client,
    getSupabaseClient: client,
    RequestTimeoutError: class RequestTimeoutError extends Error {},
  };
});
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
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const LOCAL_GRN_1 = '5f1c0000-0000-4000-8000-0000000001a1';
const LOCAL_LOT_1 = '5f1c0000-0000-4000-8000-0000000001b1';

async function enqueueUnsentGrn(customerId: string, customerName: string, qty: number, localId = LOCAL_GRN_1, lotId = LOCAL_LOT_1) {
  await enqueue({
    kind: 'newGrn',
    body: {
      v: 1,
      localId,
      lotLocalIds: [lotId],
      args: {
        p_gr_no: '',
        p_issue_number: true,
        p_date: '2026-11-27',
        p_customer_id: customerId,
        p_customer_name: customerName,
        p_items: [{ item_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty, weight: 25, rack: 'A-1', package_mark: 'M1' }],
        p_warn_duplicate: true,
      },
      show: { customerName, lines: [{ itemName: 'Peas', packaging: 'Bag' }] },
    },
    what: 'New GRN',
    customer: customerName,
    targetRef: { grnId: localId, lotIds: [lotId] },
  });
}

let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
  // One phone for the file: resetEnv closes every fake database, and the unsent store keeps its handle across tests.
  resetEnv();
});
afterAll(() => restoreQueries());

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    jest.spyOn(console, level).mockImplementation(() => undefined);
  }
  setLanguage('en');
  forgetQueries();
  mockServerRpc.mockReset();
  mockParams = {};
  env.feed = createFakeFeed();
  await setReachable(true);
  files.reset();
  seedWarehouse();
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  setFacilityRelease(SERVER as never, { schemaHead: '00000000009999_wh161_topics' });
  const auth = {
    ...authReducer(undefined, { type: 'test/init' }),
    user: { id: 'profile-1' },
    session: {},
    userProfile: { id: 'profile-1', role: 'admin', name: 'Asha Fictional' },
  };
  mockStore = configureStore({
    reducer: { auth: authReducer, theme: themeReducer, listFilters: listFilterReducer, reportPrefs: reportPrefsReducer },
    preloadedState: { auth: auth as never },
  }) as unknown as typeof mockStore;
  await initUnsent();
});

afterEach(async () => {
  setLanguage('en');
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  const db = await getUnsentDb();
  await db.run('DELETE FROM item_photos');
  await db.run('DELETE FROM items');
  await db.run('DELETE FROM forms');
  await refreshUnsent();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  jest.restoreAllMocks();
});

async function startCopyAndSync() {
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
  await setReachable(false);
  engine.setCopyOffline(true);
}

describe('WH-161 S9: IncludesUnsentLine and KPI spokenNote on Stock Summary', () => {
  it('all customers (EN): shows IncludesUnsentLine under KPIs and appends spokenNote to Stock KPI only', async () => {
    await startCopyAndSync();
    await enqueueUnsentGrn('c1', 'asha Traders', 40);

    await render(<StockSummaryScreen />);

    const note = await screen.findByTestId('stock-summary-total-includes-unsent');
    expect(note).toHaveTextContent('Includes 40 in GRNs not sent yet');
    // Copy has 69 bags + 40 unsent = 109.
    expect(screen.getByLabelText('Stock: 109, Includes 40 in GRNs not sent yet')).toBeOnTheScreen();
    expect(screen.getByLabelText('Items: 3')).toBeOnTheScreen();
    expect(mockServerRpc).not.toHaveBeenCalled();
  });

  it('all customers (GU): renders Gujarati IncludesUnsentLine with Gujarati digits and matching KPI spokenNote', async () => {
    await startCopyAndSync();
    await enqueueUnsentGrn('c1', 'asha Traders', 40);
    setLanguage('gu');

    await render(<StockSummaryScreen />);

    const note = await screen.findByTestId('stock-summary-total-includes-unsent');
    expect(note).toHaveTextContent('મોકલવાની બાકી આવક પાવતીના ૪૦ નંગ સહિત');
    expect(screen.getByLabelText('સ્ટોક: ૧૦૯, મોકલવાની બાકી આવક પાવતીના ૪૦ નંગ સહિત')).toBeOnTheScreen();
  });

  it('customer stock summary (EN & GU): shows IncludesUnsentLine and spokenNote for a customer with copy stock + unsent GRN', async () => {
    await startCopyAndSync();
    await enqueueUnsentGrn('c1', 'asha Traders', 40);
    mockParams = { customerId: 'c1', customerName: 'asha Traders' };

    await render(<StockSummaryScreen />);

    // c1 has 30 in copy + 40 unsent = 70.
    const enNote = await screen.findByTestId('stock-summary-customer-total-includes-unsent');
    expect(enNote).toHaveTextContent('Includes 40 in GRNs not sent yet');
    expect(screen.getByLabelText('Stock: 70, Includes 40 in GRNs not sent yet')).toBeOnTheScreen();

    await screen.unmount();
    forgetQueries();
    setLanguage('gu');
    await render(<StockSummaryScreen />);

    const guNote = await screen.findByTestId('stock-summary-customer-total-includes-unsent');
    expect(guNote).toHaveTextContent('મોકલવાની બાકી આવક પાવતીના ૪૦ નંગ સહિત');
    expect(screen.getByLabelText('સ્ટોક: ૭૦, મોકલવાની બાકી આવક પાવતીના ૪૦ નંગ સહિત')).toBeOnTheScreen();
  });

  it('customer with ONLY an unsent GRN still shows Stock KPI, spokenNote, and IncludesUnsentLine', async () => {
    await startCopyAndSync();
    await enqueueUnsentGrn('c-only-unsent', 'New Farm Traders', 25, '5f1c0000-0000-4000-8000-0000000002a1', '5f1c0000-0000-4000-8000-0000000002b1');
    mockParams = { customerId: 'c-only-unsent', customerName: 'New Farm Traders' };

    await render(<StockSummaryScreen />);

    const note = await screen.findByTestId('stock-summary-customer-total-includes-unsent');
    expect(note).toHaveTextContent('Includes 25 in GRNs not sent yet');
    expect(screen.getByLabelText('Stock: 25, Includes 25 in GRNs not sent yet')).toBeOnTheScreen();
    expect(screen.getByLabelText('GRNs with stock: 1')).toBeOnTheScreen();

    // Contrast: a customer with neither copy stock nor unsent GRN shows no KPIs and no IncludesUnsentLine.
    await screen.unmount();
    forgetQueries();
    mockParams = { customerId: 'c-empty', customerName: 'Empty Traders' };
    await render(<StockSummaryScreen />);
    await screen.findByText('No stock for this customer');
    expect(screen.queryByTestId('stock-summary-customer-total-includes-unsent')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Stock:/)).not.toBeOnTheScreen();
  });

  it('omits IncludesUnsentLine and spokenNote when nothing is unsent on the copy', async () => {
    await startCopyAndSync();

    await render(<StockSummaryScreen />);

    await screen.findByLabelText('Stock: 69');
    expect(screen.queryByTestId('stock-summary-total-includes-unsent')).not.toBeOnTheScreen();
    expect(screen.queryByText(/not sent yet/i)).not.toBeOnTheScreen();
  });

  it('PQ7: server-read totals add no unsent bags and show no IncludesUnsentLine even when an unsent GRN is queued', async () => {
    // Copy is not started/ready so stock-summary-service falls back to the server RPC.
    await setReachable(true);
    engine.setCopyOffline(false);
    await enqueueUnsentGrn('c1', 'asha Traders', 40);
    mockServerRpc.mockImplementation(async (name: string) => {
      if (name === 'get_all_stock_summary') {
        return {
          data: {
            success: true,
            summary: { total_customers_with_stock: 1, total_items: 2, total_quantity: 69 },
            customers: [{ customer_id: 'c1', customer_name: 'asha Traders', total_stock: 30, item_count: 2, grn_count: 2 }],
          },
          error: null,
        };
      }
      if (name === 'get_customer_stock_summary') {
        return {
          data: {
            success: true,
            summary: { total_items: 1, total_quantity: 30, oldest_stock_date: '2026-11-20', grn_count: 2, grn_count_empty: 0 },
            items: [{ item_id: 'i1', item_name: 'Peas', total_stock: 30, grn_count: 2, grns: [] }],
            out_of_stock_items: [],
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'unexpected rpc' } };
    });

    await render(<StockSummaryScreen />);
    expect(await screen.findByLabelText('Stock: 69')).toBeOnTheScreen();
    expect(screen.queryByTestId('stock-summary-total-includes-unsent')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Includes .* not sent yet/)).not.toBeOnTheScreen();

    await screen.unmount();
    forgetQueries();
    mockParams = { customerId: 'c1', customerName: 'asha Traders' };
    await render(<StockSummaryScreen />);
    expect(await screen.findByLabelText('Stock: 30')).toBeOnTheScreen();
    expect(screen.queryByTestId('stock-summary-customer-total-includes-unsent')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Includes .* not sent yet/)).not.toBeOnTheScreen();
  });
});
