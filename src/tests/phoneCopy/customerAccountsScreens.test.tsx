/**
 * WH-306 (written before the build), on the GRN tab as a customer account: the "last updated" strip (Design 9.2, 9.3 and
 * 9.7 DQ1, DQ8, DQ9; contract product/tech/app-offline-customer-accounts.md 6.1, 7.2, 11 A2 to A5).
 *
 * Real: the GRN tab, its list, Find goods, the services, the sync engine, the copy. Faked at the edge: the server's answers,
 * the phone's native modules, the connection, the navigator, FlashList's native drawing.
 *
 * ===== AGREE WITH DEVELOPMENT (testIDs and words of contract 7.2, accepted by Design DQ7) =====
 *  - `customer-age-strip` with ONE child of `customer-age-current`, `customer-age-today` or `customer-age-earlier`, and the
 *    time in `customer-age-time`. The icon is a child element whose `name` prop is the icon (the Icon is mocked as 'Icon').
 *  - Texts of Design 9.3 (English, Gujarati). The time is `formatLoadedAt`; here it is only checked to be present.
 *  - The bar is `offline-status-bar`; the list's own time line on the GRN tab is `grn-last-updated`.
 *  - First load online (DQ8): the GRN list answers from the server, with no `grn-last-updated` line and no strip.
 *  - Find goods rows: the customer line is the row's second text line (the customer name).
 * NOT COVERED here (screens whose harness is not in this tree yet): the strip on Dispatch, Orders, Invoices, the details
 *    pages, the reports and the Statement (`money-age-strip`, `money.asOf*`), Customer activity.
 * ===============================================================================================
 */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import * as engine from '@/features/phone-copy/syncEngine';
import * as syncStore from '@/features/phone-copy/syncStore';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { seedCustomerAccount } from '@/tests/phoneCopy/customerAccountFeed';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { noteGrnPagingUnit, resetFacilityGrnPaging } from '@/config/facilityGrnPaging';
import { runSessionScopedClears } from '@/config/sessionScopedRegistry';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import listFilterReducer from '@/store/slices/listFilterSlice';
import themeReducer from '@/store/slices/themeSlice';
import { setLanguage } from '@/i18n';
import { resetScreenFocus } from '@/tests/components/focusHarness';

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
  const { useSyncExternalStore } = require('react');
  return {
    useAppSelector: (select: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => select(mockStore.getState())),
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
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
  useLocalSearchParams: () => ({}),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockPermissions = { canCreate: false, canUpdate: false, canDelete: false, isCustomer: false };
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => mockPermissions }));
const mockAccess = { assignedCustomerIds: [] as string[], isCustomerAccount: false };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => false }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn(), printFailureMessage: jest.fn() }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const draw = (part: unknown) => (typeof part === 'function' ? React.createElement(part) : part ?? null);
  return {
    FlashList: React.forwardRef((props: any, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: () => {}, scrollToIndex: () => {} }));
      const { View } = require('react-native');
      return React.createElement(View, { testID: props.testID }, draw(props.ListHeaderComponent),
        props.data.length === 0 ? draw(props.ListEmptyComponent) : null,
        props.data.map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: props.keyExtractor ? props.keyExtractor(item, index) : index }, props.renderItem({ item, index }))),
        draw(props.ListFooterComponent));
    }),
  };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const serverGrn = {
  id: 'server-grn', grn_item_id: 'server-lot', gr_no: 'S1', date: '2026-11-25T05:00:00+00:00', customer_id: 'c1', customer_name: 'asha Traders',
  item_name: 'Peas', packaging: 'Bag', qty: 10, stock: 10, weight: 10, registration: null, rack: 'A', package_mark: 'M',
};
const Tab = () => {
  const GRNTab = (require('../../../app/(tabs)/grn') as { default: React.ComponentType }).default;
  return <GRNTab />;
};

function signIn(role: 'customer' | 'staff', customers: string[]) {
  mockAccess.isCustomerAccount = role === 'customer';
  mockAccess.assignedCustomerIds = customers;
  mockStore.dispatch(setUserProfile({ id: 'profile-2', role, name: 'Fictional Person', assignedCustomerIds: customers } as never) as never);
}
beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  syncStore.resetSyncSnapshot();
  await runSessionScopedClears({ dispatch: () => undefined } as never);
  mockNet.offline = false;
  resetScreenFocus();
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    if (name === 'get_customer_grn_items') {
      return { data: { success: true, data: { items: [serverGrn], pagination: { total_count: 1, limit: 20, offset: 0, has_more: false } } }, error: null };
    }
    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  setFacilityRelease(SERVER, { schemaHead: '00000000000207_grn_invoice_state_once' });
  noteGrnPagingUnit('receipt');
  mockStore = configureStore({ reducer: { auth: authReducer, listFilters: listFilterReducer, theme: themeReducer } }) as unknown as typeof mockStore;
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  resetFacilityRelease();
  resetFacilityGrnPaging();
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
type Node = { props: Record<string, unknown> };
const iconsOf = (testID: string) =>
  (screen.getByTestId(testID) as unknown as { findAll(test: (node: Node) => boolean): Node[] })
    .findAll(node => typeof node.props?.name === 'string')
    .map(node => node.props.name as string);

describe('the strip: three states (Design 9.2 with 9.7 DQ1, 9.3)', () => {
  it('current: "Up to date, <time>" with the check icon; no status bar; no list time line', async () => {
    seedCustomerAccount(['c1']);
    signIn('customer', ['c1']);
    await loadCopy();
    await render(<Tab />);
    expect(await screen.findByTestId('grn-card-g-B1')).toBeOnTheScreen();
    const strip = await screen.findByTestId('customer-age-strip');
    expect(within(strip).getByTestId('customer-age-current')).toBeOnTheScreen();
    expect(within(strip).getByTestId('customer-age-time')).toBeOnTheScreen();
    expect(strip).toHaveTextContent(/^Up to date, \S+/);
    expect(iconsOf('customer-age-strip')).toContain('check-circle-outline');
    expect(screen.queryByTestId('offline-status-bar')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-last-updated')).not.toBeOnTheScreen();
  });

  it('offline the same day: "Last updated today at <time>. Connect to see changes since." with the clock icon', async () => {
    seedCustomerAccount(['c1']);
    env.feed.asOf = new Date().toISOString();
    signIn('customer', ['c1']);
    await loadCopy();
    await render(<Tab />);
    await screen.findByTestId('grn-card-g-B1');
    await connection(true);
    const strip = await screen.findByTestId('customer-age-today');
    expect(screen.getByTestId('customer-age-strip')).toHaveTextContent(/Last updated today at \S+.*Connect to see changes since\./);
    expect(strip).toBeOnTheScreen();
    expect(screen.queryByTestId('customer-age-current')).not.toBeOnTheScreen();
    expect(iconsOf('customer-age-strip')).toContain('clock-outline');
    expect(iconsOf('customer-age-strip')).not.toContain('clock-alert-outline');
    expect(screen.queryByTestId('offline-status-bar')).not.toBeOnTheScreen();
  });

  it('offline from an earlier day: the warning strip with the date, "Your stock may have changed since", and the alert icon', async () => {
    seedCustomerAccount(['c1']);
    env.feed.asOf = '2026-11-20T05:12:00.000+00:00';
    signIn('customer', ['c1']);
    await loadCopy();
    await render(<Tab />);
    await screen.findByTestId('grn-card-g-B1');
    await connection(true);
    await screen.findByTestId('customer-age-earlier');
    const strip = screen.getByTestId('customer-age-strip');
    expect(strip).toHaveTextContent(/^Last updated .*20.*\. Your stock may have changed since\. Connect to see today's\.$/);
    expect(iconsOf('customer-age-strip')).toContain('clock-alert-outline');
    expect(screen.queryByTestId('customer-age-today')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('offline-status-bar')).not.toBeOnTheScreen();
  });

  it('an empty list still shows the strip (it sits outside the list)', async () => {
    seedCustomerAccount(['c1']);
    env.feed.rows.goodsreceived = [];
    env.feed.rows.goodsreceived_trl = [];
    signIn('customer', ['c1']);
    await loadCopy();
    await render(<Tab />);
    expect(await screen.findByTestId('customer-age-strip')).toBeOnTheScreen();
    expect(screen.queryByTestId(/^grn-card-/)).not.toBeOnTheScreen();
  });

  it('Gujarati: the words of 9.3, with no Latin digit in the time', async () => {
    await setLanguage('gu');
    seedCustomerAccount(['c1']);
    signIn('customer', ['c1']);
    await loadCopy();
    await render(<Tab />);
    const strip = await screen.findByTestId('customer-age-strip');
    expect(strip).toHaveTextContent(/^અપડેટ છે, /);
    expect(within(strip).getByTestId('customer-age-time')).not.toHaveTextContent(/[0-9]/);
  });

  it('staff: no strip anywhere on the tab', async () => {
    seedWarehouse();
    signIn('staff', []);
    await loadCopy();
    await render(<Tab />);
    await wait(150);
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
  });
});

describe('the first load (Design 9.1 rows 5 and 7, DQ8)', () => {
  it('the bar shows, there is no strip, and the list shows no time line of its own', async () => {
    seedCustomerAccount(['c1']);
    signIn('customer', ['c1']);
    const gate = env.feed.hold(call => call.name === 'get_sync_page' && call.args.p_entity === 'goodsreceived');
    await engine.startPhoneCopy();
    const run = engine.syncNow('open');
    await Promise.race([gate.opened, run]);
    expect(syncStore.getSyncSnapshot().phase).toBe('stage1');
    await render(<Tab />);
    expect(await screen.findByTestId('grn-card-server-grn')).toBeOnTheScreen(); // today's server answer
    expect(screen.getByTestId('offline-status-bar')).toBeOnTheScreen();
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-last-updated')).not.toBeOnTheScreen();
    await act(async () => { gate.release(); await run; });
    expect(await screen.findByTestId('customer-age-strip')).toBeOnTheScreen();
    expect(screen.queryByTestId('offline-status-bar')).not.toBeOnTheScreen();
  });
});

describe('Find goods for a customer account (DQ9)', () => {
  async function findPeas() {
    await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    const field = await screen.findByTestId('find-goods-search');
    await userEvent.type(field, 'peas');
    return screen.findByTestId('find-goods-row-l06');
  }

  it('one customer: the switch is there and a row has no customer line', async () => {
    seedCustomerAccount(['c1']);
    signIn('customer', ['c1']);
    await loadCopy();
    const row = await findPeas();
    expect(within(row).getByText(/Peas/)).toBeOnTheScreen();
    expect(within(row).queryByText(/asha Traders/)).not.toBeOnTheScreen();
    expect(row).not.toHaveAccessibleName(/asha Traders/);
  });

  it('two customers: the customer line stays', async () => {
    seedCustomerAccount(['c1', 'c2']);
    signIn('customer', ['c1', 'c2']);
    await loadCopy();
    const row = await findPeas();
    expect(within(row).getByText(/asha Traders/)).toBeOnTheScreen();
  });

  it('staff: the customer line stays', async () => {
    seedWarehouse();
    signIn('staff', []);
    await loadCopy();
    const row = await findPeas();
    expect(within(row).getByText(/asha Traders/)).toBeOnTheScreen();
  });
});
