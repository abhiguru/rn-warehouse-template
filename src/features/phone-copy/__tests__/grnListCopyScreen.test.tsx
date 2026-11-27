/**
 * WH-299, the GRN list screen over the phone copy:
 *  - R4 (contract product/tech/app-offline-read-from-copy.md 2.2): a restart drops the pages and asks page 0 again;
 *  - PR9 (contract 11.1, Q1 to Q4, Q6, Q7): the quiet re-read after a sync that changed something;
 *  - PR12 (WH-299 card; Design product/design/offline-capture.md 2.10a): the Invoicing filter offline while older
 *    records load.
 *
 * Real: the list, its header, filter bar and filter store, the GRN service, the sync engine, the copy. Faked at the
 * edge: the server's answers, the phone's native modules, the connection as NetInfo and `useIsOffline` tell it, the
 * navigator's focus, and FlashList's native drawing (every row is drawn; its props are kept so a test can scroll).
 *
 * Not here: Q5 and whether the position is really kept (device), a press holding a re-read.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The scroll is told to the list by the FlashList's `onScrollBeginDrag` and `onMomentumScrollEnd` (contract 11.1).
 *  - testIDs of Design 2.10a: `grn-invoicing-filter-off`, `grn-invoicing-wait`, `grn-invoicing-wait-clear`.
 * ==================================
 */
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import GRNListFiori from '@/components/GRNListFiori';
import * as grnService from '@/services/grn-service';
import * as engine from '@/features/phone-copy/syncEngine';
import * as syncStore from '@/features/phone-copy/syncStore';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { serveKeptEntitiesOnly } from '@/tests/phoneCopy/wh299Phone';
import { GRNS, grnNamed, lockRow, lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { noteGrnPagingUnit, resetFacilityGrnPaging } from '@/config/facilityGrnPaging';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import listFilterReducer, { applyListFilters, selectListFilters } from '@/store/slices/listFilterSlice';
import themeReducer from '@/store/slices/themeSlice';
import { SEARCH_KEY, type FilterValues } from '@/features/filters/types';
import { setLanguage, t } from '@/i18n';
import { resetScreenFocus, setScreenFocused } from '@/tests/components/focusHarness';

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
// react-redux is not transformed by this repo's Jest config: the screens' hooks read a real store (real reducers) directly.
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
const mockList = {
  props: null as any,
  scrollToOffset: jest.fn(),
  renders: [] as { grns: string[]; anchored: boolean }[],
};
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const draw = (part: unknown) => (typeof part === 'function' ? React.createElement(part) : part ?? null);
  return {
    FlashList: React.forwardRef((props: any, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: mockList.scrollToOffset, scrollToIndex: () => {} }));
      mockList.props = props;
      mockList.renders.push({
        grns: props.data.filter((d: any) => d.type !== 'header').map((d: any) => d.data.grnId),
        anchored: props.maintainVisibleContentPosition?.disabled !== true,
      });
      return React.createElement(React.Fragment, null, draw(props.ListHeaderComponent),
        props.data.map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: props.keyExtractor(item, index) }, props.renderItem({ item, index }))),
        draw(props.ListFooterComponent));
    }),
  };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const serverCalls: { name: string; args: Record<string, unknown> }[] = [];
let serverRows: Record<string, unknown>[] | null = null;
const serverGrn = {
  id: 'server-grn', grn_item_id: 'server-lot', gr_no: 'S1', date: '2026-11-25T05:00:00+00:00', customer_name: 'Server Fictional Traders',
  item_name: 'Peas', packaging: 'Bag', qty: 10, stock: 10, weight: 10, registration: null, rack: 'A', package_mark: 'M',
};

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  serveKeptEntitiesOnly();
  seedWarehouse();
  serverCalls.length = 0;
  serverRows = null;
  mockList.props = null;
  mockList.renders = [];
  mockList.scrollToOffset.mockClear();
  mockNet.offline = false;
  resetScreenFocus();
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    serverCalls.push({ name, args });
    if (name === 'get_all_grn_items' && serverRows) {
      return { data: { success: true, data: serverRows, pagination: { total_count: serverRows.length, limit: 20, offset: 0, unit: 'receipt' } }, error: null };
    }
    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  setFacilityRelease(SERVER, { schemaHead: '00000000000207_grn_invoice_state_once' }); // the Invoicing filter is offered
  noteGrnPagingUnit('receipt');
  const store = configureStore({ reducer: { auth: authReducer, listFilters: listFilterReducer, theme: themeReducer } });
  mockStore = store as unknown as typeof mockStore;
  store.dispatch(setUserProfile({ id: 'profile-1', role: 'staff', name: 'Asha Fictional' } as never));
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
const setFilters = (values: FilterValues) => mockStore.dispatch(applyListFilters({ key: 'grn-list', values }) as never);
const storedFilters = () => selectListFilters(mockStore.getState() as never, 'grn-list').values;
const cards = () => screen.queryAllByTestId(/^grn-card-g-[^-]+(-1)?$/).map(card => String(card.props.testID).replace('grn-card-', ''));

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
const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row });
const gone = (id: string) => ({ e: 'goodsreceived', id, op: 'delete' });
async function sync(changes: unknown[]) {
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: changes as never });
  await act(async () => { expect(await engine.syncNow('interval')).toBe('done'); });
}
/**
 * More receipts than a page: 25 in all. A "Y" number sorts after the A and B ones in the list's order (GRN number,
 * highest first), so the first page still holds B1.
 */
function addReceipts(count = 18) {
  for (let n = 1; n <= count; n += 1) {
    const g = { ...grnNamed('B1'), id: `g-Y${n}`, gr_no: `Y${n}`, date: `2026-10-${String(n).padStart(2, '0')}T05:00:00+00:00` };
    const { invoice_state: _lockOnly, ...row } = g;
    env.feed.rows.goodsreceived.push({ id: g.id, row });
    env.feed.rows.grn_lock.push({ id: g.id, row: lockRow(g) });
    env.feed.rows.goodsreceived_trl.push({ id: `y${n}`, row: { ...lotNamed('l06'), id: `y${n}`, gr_id: g.id } });
  }
}
/** The list open over a ready copy, with the reads that follow counted. */
async function openList() {
  const read = jest.spyOn(grnService, 'getGRNListPage');
  await render(<GRNListFiori />);
  await screen.findByTestId('grn-card-g-B1');
  await wait(50);
  read.mockClear();
  mockList.scrollToOffset.mockClear();
  return read;
}

describe('R4 on the list', () => {
  it('on a restart drops its pages and asks the first page again, showing no error', async () => {
    addReceipts();
    await loadCopy();
    const read = await openList();
    await act(async () => { await copyDb.eraseCopy(); });
    serverRows = [serverGrn];
    await act(async () => { mockList.props.onEndReached(); });
    expect(await screen.findByTestId('grn-card-server-grn')).toBeOnTheScreen();
    expect(read.mock.calls.map(call => call[0].p_offset)).toEqual([20, 0]);
    expect(serverCalls.map(call => call.args.p_offset)).toEqual([0]);
    expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-load-more-error')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-stale-strip')).not.toBeOnTheScreen();
  });
});

describe('PR9: the quiet re-read', () => {
  it('Q1: a sync that brought nothing reads nothing', async () => {
    await loadCopy();
    const read = await openList();
    await sync([]);
    await wait(300);
    expect(read).not.toHaveBeenCalled();
  });

  it('Q3: a change of people only (WH-381: dispatches are no longer in the copy) does not read the GRN list again', async () => {
    await loadCopy();
    const read = await openList();
    await sync([upsert('people', 'p9', { id: 'p9', name: 'Fictional Person' })]);
    await wait(300);
    expect(read).not.toHaveBeenCalled();
  });

  it('Q2: a changed lot reads the list once, the same search from the top, with nothing moving or spinning', async () => {
    setFilters({ [SEARCH_KEY]: 'peas' });
    await loadCopy();
    // Taken before openList spies on it: the module is not mocked, so any later read of it is the spy itself.
    const real = grnService.getGRNListPage;
    const read = await openList();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    read.mockImplementation(async (...args) => { await held; return real(...args); });
    await sync([upsert('goodsreceived_trl', 'l06', { ...lotNamed('l06'), item_name: 'Beans' })]);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    // While it is being read: the rows stay, and nothing says it is loading.
    expect(screen.getByTestId('grn-card-g-B1')).toBeOnTheScreen();
    expect(screen.queryByTestId('list-header-busy')).not.toBeOnTheScreen();
    expect(mockList.props.refreshControl.props.refreshing).toBe(false);
    mockList.renders = [];
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen());
    await wait(200);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toMatchObject({ p_offset: 0, p_filters: { search: 'peas', page_by: 'receipt' } });
    expect(mockList.scrollToOffset).not.toHaveBeenCalled();
    // The replacement is drawn with the position kept.
    expect(mockList.renders.find(r => !r.grns.includes('g-B1'))?.anchored).toBe(true);
    expect(serverCalls).toEqual([]);
  });

  it('keeps the position only for that replacement: a new search starts at the top as before', async () => {
    await loadCopy();
    await openList();
    await sync([gone('g-B1')]);
    await waitFor(() => expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen());
    mockList.renders = [];
    await act(async () => { setFilters({ [SEARCH_KEY]: 'rice' }); });
    await waitFor(() => expect(cards().sort()).toEqual(['g-5', 'g-a3']));
    expect(mockList.renders[mockList.renders.length - 1].anchored).toBe(false);
  });

  it('asks for as many receipts as are loaded, in one read', async () => {
    addReceipts();
    await loadCopy();
    const read = await openList();
    await act(async () => { mockList.props.onEndReached(); });
    await waitFor(() => expect(cards()).toHaveLength(25));
    read.mockClear();
    await sync([upsert('goodsreceived_trl', 'l06', { ...lotNamed('l06'), rack: 'Z-9' })]);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(read.mock.calls[0][0]).toMatchObject({ p_offset: 0, p_limit: 25 });
    await wait(200);
    expect(cards()).toHaveLength(25);
  });

  it('Q6: a deleted row goes and no other row changes order', async () => {
    await loadCopy();
    await openList();
    const before = cards();
    expect(before).toHaveLength(GRNS.length);
    await sync([gone('g-B1')]);
    await waitFor(() => expect(cards()).toEqual(before.filter(id => id !== 'g-B1')));
  });

  it('Q4: waits while the list is scrolled and for a second after it comes to rest', async () => {
    await loadCopy();
    const read = await openList();
    expect(mockList.props.onScrollBeginDrag).toEqual(expect.any(Function));
    await act(async () => { mockList.props.onScrollBeginDrag({ nativeEvent: {} }); });
    await sync([gone('g-B1')]);
    await wait(1300);
    expect(screen.getByTestId('grn-card-g-B1')).toBeOnTheScreen();
    await act(async () => { mockList.props.onMomentumScrollEnd({ nativeEvent: {} }); });
    await wait(500);
    expect(screen.getByTestId('grn-card-g-B1')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen(), { timeout: 3000 });
    expect(read).toHaveBeenCalled();
  }, 15000);

  it('Q7: a list that is not in view reads again when it comes back', async () => {
    await loadCopy();
    const read = await openList();
    await act(async () => { setScreenFocused(false); });
    await sync([gone('g-B1')]);
    await wait(300);
    expect(read).not.toHaveBeenCalled();
    await act(async () => { setScreenFocused(true); });
    await waitFor(() => expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen());
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('PR12: the Invoicing filter offline over a ready copy (Design 2.10a, Part 13.3, WH-381)', () => {
  const FOOTNOTE = 'The Invoicing filter works when you reconnect.';
  const OFF_LABEL = 'Invoicing, works when you reconnect';
  const NOT_INVOICED = ['g-5', 'g-A10', 'g-B1', 'g-GR-1', 'g-a3'];

  it('not set: the chip stays, disabled, says why, and cannot be opened; the footnote shows under the chips', async () => {
    await loadCopy();
    await connection(true);
    await render(<GRNListFiori />);
    await screen.findByTestId('grn-card-g-B1');
    const chip = screen.getByRole('button', { name: OFF_LABEL });
    expect(chip).toBeDisabled();
    expect(screen.getByTestId('grn-invoicing-filter-off')).toHaveTextContent(FOOTNOTE);
    const tagsBefore = screen.queryAllByText('Partly invoiced').length;
    await userEvent.press(chip);
    expect(screen.queryAllByText('Partly invoiced')).toHaveLength(tagsBefore);
    expect(screen.queryByTestId('grn-invoicing-wait')).not.toBeOnTheScreen();
  });

  it('already set when the connection drops: no rows, the reason and its button, never "No match"', async () => {
    await loadCopy();
    setFilters({ invoicing: 'not_invoiced' });
    await render(<GRNListFiori />);
    await screen.findByTestId('grn-card-g-B1'); // reachable over a ready copy: the filter reads grn_lock from the copy
    serverCalls.length = 0;
    serverRows = null;
    await connection(true);
    const empty = await screen.findByTestId('grn-invoicing-wait');
    expect(empty).toHaveTextContent(/Filtering by invoicing needs a connection/);
    expect(empty).toHaveTextContent(/Clear the filter to see GRNs offline\./);
    expect(screen.getByRole('button', { name: 'Clear Invoicing filter' })).toBeOnTheScreen();
    expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen();
    expect(cards()).toEqual([]);
    expect(screen.queryByText('No GRNs match your filters')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-invoicing-filter-off')).not.toBeOnTheScreen();
    // The chip still shows its value and cannot be opened.
    const tagsBefore = screen.queryAllByText('Partly invoiced').length;
    await userEvent.press(screen.getByText('Not invoiced'));
    expect(screen.queryAllByText('Partly invoiced')).toHaveLength(tagsBefore);
    expect(serverCalls).toEqual([]);
  });

  it('the button clears only the Invoicing filter, and the rows of the other choices show from the copy', async () => {
    await loadCopy();
    await connection(true);
    setFilters({ invoicing: 'not_invoiced', [SEARCH_KEY]: 'peas' });
    await render(<GRNListFiori />);
    await screen.findByTestId('grn-invoicing-wait');
    await userEvent.press(screen.getByTestId('grn-invoicing-wait-clear'));
    await screen.findByTestId('grn-card-g-B1');
    expect(cards().sort()).toEqual(['g-A2', 'g-B1', 'g-GR-1', 'g-X1']);
    expect(storedFilters()).toEqual({ [SEARCH_KEY]: 'peas' });
    expect(screen.queryByTestId('grn-invoicing-wait')).not.toBeOnTheScreen();
    expect(screen.getByTestId('grn-invoicing-filter-off')).toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  // WH-381 (criterion 14a) replaces "once the older records have loaded ...": there is no second stage to wait for, so over a
  // ready copy the chip stays off and the wait state stays for as long as the phone is offline, and no "older records" line shows.
  it('once the older records have loaded, the list fills by itself and the chip works', async () => {
    await loadCopy();
    await connection(true);
    setFilters({ invoicing: 'not_invoiced' });
    await render(<GRNListFiori />);
    await screen.findByTestId('grn-invoicing-wait');
    await wait(500);
    expect(screen.getByTestId('grn-invoicing-wait')).toBeOnTheScreen();
    expect(cards()).toEqual([]);
    expect(screen.queryByText(/Older records/)).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('on reconnecting the footnote goes and the chip works', async () => {
    await loadCopy();
    await connection(true);
    await render(<GRNListFiori />);
    await screen.findByTestId('grn-invoicing-filter-off');
    serverRows = [serverGrn];
    await connection(false);
    await waitFor(() => expect(screen.queryByTestId('grn-invoicing-filter-off')).not.toBeOnTheScreen());
    const chip = screen.getByRole('button', { name: 'Filter by invoicing' });
    expect(chip).toBeEnabled();
    const tagsBefore = screen.queryAllByText('Partly invoiced').length;
    await userEvent.press(chip);
    await waitFor(() => expect(screen.queryAllByText('Partly invoiced').length).toBeGreaterThan(tagsBefore));
  });

  it.each([
    ['en', 'invoicingFilterOff', 'The Invoicing filter works when you reconnect.'],
    ['en', 'invoicingFilterOffLabel', 'Invoicing, works when you reconnect'],
    ['en', 'invoicingWaitTitle', "Filtering by invoicing needs a connection"],
    ['en', 'invoicingWaitMessage', 'Clear the filter to see GRNs offline.'],
    ['en', 'clearInvoicingFilter', 'Clear Invoicing filter'],
    ['gu', 'invoicingFilterOff', 'ઇન્વૉઇસ ફિલ્ટર ફરી જોડાશો ત્યારે ચાલશે.'],
    ['gu', 'invoicingFilterOffLabel', 'ઇન્વૉઇસ, ફરી જોડાશો ત્યારે ચાલશે'],
    ['gu', 'invoicingWaitTitle', 'ઇન્વૉઇસ પ્રમાણે ફિલ્ટર કરવા કનેક્શન જોઈએ'],
    ['gu', 'invoicingWaitMessage', 'ઑફલાઇન આવક પાવતી જોવા ફિલ્ટર સાફ કરો.'],
    ['gu', 'clearInvoicingFilter', 'ઇન્વૉઇસ ફિલ્ટર સાફ કરો'],
  ] as const)('%s grn.offline.%s is Design\'s text', async (language, key, text) => {
    await setLanguage(language);
    expect(t(`grn.offline.${key}` as never)).toBe(text);
  });
});
