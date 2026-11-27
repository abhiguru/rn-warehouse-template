/**
 * WH-300, the GRN tab's "GRN | Find goods" switch and the Find goods screen over the phone copy. Contract
 * product/tech/app-offline-find-goods.md (G3, G4, S1 to S9, sections 5, 6 and 9), Design product/design/offline-capture.md
 * Part 3 and "Answers to the WH-300 and WH-348 contracts" (DQ1, DQ2), Product's answers PQ1 and PQ2 on the card.
 *
 * Real: the GRN tab (app/(tabs)/grn.tsx), its list, the switch, the screen, the Find goods service, the sync engine, the
 * copy. Faked at the edge: the server's answers, the phone's native modules, the connection, the navigator, FlashList's
 * native drawing, and the phone's unsent work (a fake overlay: no card fills it yet).
 *
 * Written before the build: the modules and testIDs do not exist yet, so each case fails until Development builds them.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - testIDs of contract 6.1 (accepted by Design, DQ2): grn-view-switch(-grn|-find-goods), find-goods-search, -intro,
 *    -count, -list, -row-<lot>, -row-stock-<lot>, -row-empty-<lot>, lot-less-unsent-<lot>, lot-less-held-<lot>,
 *    -no-match, -clear-search, -loading, -failed, -retry. `find-goods-search` is the text input itself.
 *  - The tap on a row opens `/grn-details/<GRN id>` (the row's `id`, not the lot id; the contract says "+ id" of the GRNItem).
 *  - `app/(tabs)/grn.tsx` keeps the GRN list's testIDs (`grn-card-<grn id>`).
 *  - The quiet re-read after a sync asks `findGoods` again from offset 0 (contract 6).
 * NOT NAMED BY THE CONTRACT, so not tested: the row's spoken label for a lot with no rack or no mark; whether the field
 * has focus on arrival (S1: device, Design check 2); the exact text of the date in a row; scroll position.
 * ==================================
 */
import React from 'react';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import * as engine from '@/features/phone-copy/syncEngine';
import * as syncStore from '@/features/phone-copy/syncStore';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
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
import { router } from 'expo-router';

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
      React.useImperativeHandle(ref, () => ({ scrollToOffset: mockScroll, scrollToIndex: () => {} }));
      const { View } = require('react-native');
      return React.createElement(View, { testID: props.testID, onEndReached: props.onEndReached }, draw(props.ListHeaderComponent),
        props.data.length === 0 ? draw(props.ListEmptyComponent) : null,
        props.data.map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: props.keyExtractor ? props.keyExtractor(item, index) : index }, props.renderItem({ item, index }))),
        draw(props.ListFooterComponent));
    }),
  };
});
const mockScroll = jest.fn();
const mockOverlay = { lessUnsent: new Map<string, number>(), lessHeld: new Map<string, number>() };
jest.mock('@/features/phone-copy/unsentOverlay', () => {
  const actual = jest.requireActual('@/features/phone-copy/unsentOverlay');
  return {
    ...actual,
    getUnsentOverlay: () => ({
      grn: () => null, lot: () => null, dispatch: () => null,
      lessUnsent: (id: string) => mockOverlay.lessUnsent.get(id) ?? 0,
      lessHeld: (id: string) => mockOverlay.lessHeld.get(id) ?? 0,
      deductions: () => {
        const sum = new Map<string, number>();
        for (const map of [mockOverlay.lessUnsent, mockOverlay.lessHeld]) for (const [id, n] of map) sum.set(id, (sum.get(id) ?? 0) + n);
        for (const [id, n] of [...sum]) if (n <= 0) sum.delete(id);
        return sum;
      },
    }),
  };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const serverCalls: { name: string; args: Record<string, unknown> }[] = [];
const GRN_CARDS = /^grn-card-g-/;

// WH-375: the GRN tab is loaded on first use, which put its whole module tree inside the first case's 5 s;
// on a loaded machine that failed "ready: GRN | Find goods". Load it once here, with its own time limit.
beforeAll(() => { require('../../../../app/(tabs)/grn'); }, 120000);

const Tab = () => {
  const GRNTab = (require('../../../../app/(tabs)/grn') as { default: React.ComponentType }).default;
  return <GRNTab />;
};
type Answer = { kind: string };
type FindGoodsModule = { findGoods(query: string, offset: number): Promise<Answer> };
const findGoodsModule = () => require('@/features/find-goods/findGoodsService') as FindGoodsModule;

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  syncStore.resetSyncSnapshot();
  await runSessionScopedClears({ dispatch: () => undefined } as never);
  seedWarehouse();
  serverCalls.length = 0;
  mockNet.offline = false;
  mockOverlay.lessUnsent.clear();
  mockOverlay.lessHeld.clear();
  mockAccess.isCustomerAccount = false;
  resetScreenFocus();
  (router.push as jest.Mock).mockClear();
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    serverCalls.push({ name, args });
    return { data: null, error: { message: 'Network request failed' } };
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  setFacilityRelease(SERVER, { schemaHead: '00000000000207_grn_invoice_state_once' });
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
async function loadCopy() {
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
}
async function loadTo(entity: 'goodsreceived') {
  const gate = env.feed.hold(call => call.name === 'get_sync_page' && call.args.p_entity === entity);
  await engine.startPhoneCopy();
  const run = engine.syncNow('open');
  await Promise.race([gate.opened, run]);
  expect(syncStore.getSyncSnapshot().phase).toBe('stage1');
  return { finish: () => act(async () => { gate.release(); await run; }) };
}
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
const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row });

/** The tab open on Find goods, over a loaded copy. */
async function openFindGoods() {
  await render(<Tab />);
  await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
  return screen.findByTestId('find-goods-search');
}
async function search(text: string) {
  const field = await screen.findByTestId('find-goods-search');
  await userEvent.clear(field);
  await userEvent.type(field, text);
}
const rowsOnScreen = () => screen.queryAllByTestId(/^find-goods-row-l\d+$/).map(r => String(r.props.testID).replace('find-goods-row-', ''));

describe('G3 and G4: the switch, and when it is not there', () => {
  it('ready: "GRN | Find goods" above the GRN list, GRN chosen first, as tabs with the chosen one selected', async () => {
    await loadCopy();
    await render(<Tab />);
    expect(await screen.findByTestId('grn-view-switch')).toBeOnTheScreen();
    expect(await screen.findByTestId('grn-card-g-B1')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'GRN', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Find goods', selected: false })).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId('grn-view-switch-find-goods'));
    expect(screen.getByRole('tab', { name: 'Find goods', selected: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen();
    await userEvent.press(screen.getByTestId('grn-view-switch-grn'));
    expect(await screen.findByTestId('grn-card-g-B1')).toBeOnTheScreen();
  });

  it('G3: the feature off: no switch, the GRN list as today, and Find goods never asked', async () => {
    setFacilityCapabilities(SERVER, { sync: false });
    const read = jest.spyOn(findGoodsModule(), 'findGoods');
    await render(<Tab />);
    await waitFor(() => expect(serverCalls.length).toBeGreaterThan(0)); // today's list asks the server
    expect(screen.queryByTestId('grn-view-switch')).not.toBeOnTheScreen();
    expect(read).not.toHaveBeenCalled();
  });

  it('G3: a role change onto a staff copy: no switch for the customer account, and Find goods never asked', async () => {
    await loadCopy();
    mockAccess.isCustomerAccount = true;
    mockStore.dispatch(setUserProfile({ id: 'profile-2', role: 'customer', name: 'Customer Fictional' } as never) as never);
    const read = jest.spyOn(findGoodsModule(), 'findGoods');
    await render(<Tab />);
    await wait(100);
    expect(screen.queryByTestId('grn-view-switch')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('find-goods-search')).not.toBeOnTheScreen();
    expect(read).not.toHaveBeenCalled();
  });

  it('G3: the server sends format 1: no switch', async () => {
    env.feed.format = 1;
    await engine.startPhoneCopy();
    await engine.syncNow('open');
    await render(<Tab />);
    await wait(100);
    expect(screen.queryByTestId('grn-view-switch')).not.toBeOnTheScreen();
  });

  it('G4: hidden while Find goods is shown: the tab shows the GRN view', async () => {
    await loadCopy();
    await openFindGoods();
    expect(screen.getByTestId('find-goods-intro')).toBeOnTheScreen();
    await act(async () => { setFacilityCapabilities(SERVER, { sync: false }); });
    await waitFor(() => expect(screen.queryByTestId('find-goods-search')).not.toBeOnTheScreen());
    expect(screen.queryByTestId('grn-view-switch')).not.toBeOnTheScreen();
  });
});

describe('S1: arriving', () => {
  it('the field with its placeholder, and the intro; no rows, no count', async () => {
    await loadCopy();
    const field = await openFindGoods();
    expect(field).toHaveProp('placeholder', 'Mark, rack, item, customer or GRN');
    const intro = screen.getByTestId('find-goods-intro');
    expect(intro).toHaveTextContent('Find goods', { exact: false });
    expect(intro).toHaveTextContent('Type any part of a mark, rack, item, customer or GRN number.', { exact: false });
    expect(rowsOnScreen()).toEqual([]);
    expect(screen.queryByTestId('find-goods-count')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-card-g-B1')).not.toBeOnTheScreen();
  });

  it('Gujarati: the switch, placeholder and intro word for word', async () => {
    await setLanguage('gu');
    await loadCopy();
    await render(<Tab />);
    expect(await screen.findByRole('tab', { name: 'આવક' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('tab', { name: 'માલ શોધો' }));
    const field = await screen.findByTestId('find-goods-search');
    expect(field).toHaveProp('placeholder', 'માર્કો, રેક, આઇટમ, વેપારી કે આવક પાવતી');
    const intro = screen.getByTestId('find-goods-intro');
    expect(intro).toHaveTextContent('માલ શોધો', { exact: false });
    expect(intro).toHaveTextContent('માર્કો, રેક, આઇટમ, વેપારી કે આવક પાવતી નંબરનો કોઈ પણ ભાગ લખો.', { exact: false });
  });
});

describe('S2: typing', () => {
  it('searches from the first character, after 300 ms, not before', async () => {
    await loadCopy();
    await openFindGoods();
    const read = jest.spyOn(findGoodsModule(), 'findGoods');
    await userEvent.type(screen.getByTestId('find-goods-search'), 'a');
    expect(read).not.toHaveBeenCalled();
    await waitFor(() => expect(read).toHaveBeenCalledWith('a', 0), { timeout: 1500 });
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l07', 'l05', 'l06', 'l04', 'l03', 'l01', 'l02']));
    expect(screen.queryByTestId('find-goods-intro')).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('a slow answer for "a" that arrives after the answer for "as" is dropped', async () => {
    await loadCopy();
    await openFindGoods();
    const module = findGoodsModule();
    const real = module.findGoods;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    jest.spyOn(module, 'findGoods').mockImplementation(async (query, offset) => {
      if (query === 'a') await held;
      return real(query, offset);
    });
    await userEvent.type(screen.getByTestId('find-goods-search'), 'a');
    await wait(450);
    await userEvent.type(screen.getByTestId('find-goods-search'), 's');
    await waitFor(() => expect(screen.queryByTestId('find-goods-row-l02')).toBeOnTheScreen(), { timeout: 1500 });
    expect(screen.queryByTestId('find-goods-row-l07')).not.toBeOnTheScreen();   // "a" alone would have shown it
    await act(async () => { release(); });
    await wait(200);
    expect(screen.queryByTestId('find-goods-row-l07')).not.toBeOnTheScreen();
    expect(screen.getByTestId('find-goods-search')).toHaveProp('value', 'as');
  });
});

describe('S3: the count line', () => {
  it('"4 lots", read out politely', async () => {
    await loadCopy();
    await openFindGoods();
    await search('peas');
    const count = await screen.findByTestId('find-goods-count');
    expect(count).toHaveTextContent('4 lots');
    expect(count).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('Gujarati: Gujarati digits, and the number left too', async () => {
    await setLanguage('gu');
    await loadCopy();
    await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    await search('peas');
    expect(await screen.findByTestId('find-goods-count')).toHaveTextContent('૪ જથ્થા');
    expect(screen.getByTestId('find-goods-row-stock-l06')).toHaveTextContent('૯');
  });
});

describe('S4: no match', () => {
  it('names the text, says why nothing exists, and Clear search empties the field and brings back the intro', async () => {
    await loadCopy();
    await openFindGoods();
    await search('zzzz');
    const none = await screen.findByTestId('find-goods-no-match');
    expect(none).toHaveTextContent('No lot matches "zzzz"', { exact: false });
    expect(none).toHaveTextContent('Lots with no stock left are included, so nothing in the store has this text.', { exact: false });
    expect(none).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(rowsOnScreen()).toEqual([]);
    await userEvent.press(within(none).getByRole('button', { name: 'Clear search' }));   // the field has its own clear X with the same name
    expect(screen.getByTestId('find-goods-search')).toHaveProp('value', '');
    expect(await screen.findByTestId('find-goods-intro')).toBeOnTheScreen();
    expect(screen.queryByTestId('find-goods-no-match')).not.toBeOnTheScreen();
  });

  it('Gujarati wording', async () => {
    await setLanguage('gu');
    await loadCopy();
    await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    await search('zzzz');
    const none = await screen.findByTestId('find-goods-no-match');
    expect(none).toHaveTextContent('"zzzz" સાથે કોઈ જથ્થો મળતો નથી', { exact: false });
    expect(none).toHaveTextContent('જેનો સ્ટોક પૂરો થયો છે તે જથ્થા પણ શોધમાં છે, એટલે કોલ્ડ સ્ટોરેજમાં આ લખાણ ક્યાંય નથી.', { exact: false });
  });
});

describe('PQ2 and the connection: no stage-two line, and the same screen offline', () => {
  it('flight mode: the same rows as online, no error, no "Try again", nothing asked of the server', async () => {
    await loadCopy();
    await openFindGoods();
    await search('peas');
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l06', 'l01', 'l02']));
    expect(screen.queryByTestId('find-goods-older-loading')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Older records are still loading/)).not.toBeOnTheScreen();
    await connection(true);
    await search('asha');
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l06', 'l03', 'l02']));
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('find-goods-failed')).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });
});

describe('the first load: stage one', () => {
  it('a skeleton under the field, no intro, no rows; the rows come when the copy is ready', async () => {
    const load = await loadTo('goodsreceived');
    await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    expect(await screen.findByTestId('find-goods-loading')).toBeOnTheScreen();
    expect(screen.getByTestId('find-goods-search')).toBeOnTheScreen();
    expect(screen.queryByTestId('find-goods-intro')).not.toBeOnTheScreen();
    await load.finish();
    await waitFor(() => expect(screen.queryByTestId('find-goods-loading')).not.toBeOnTheScreen());
    expect(await screen.findByTestId('find-goods-intro')).toBeOnTheScreen();
  });
});

describe('S6: a row', () => {
  it('shows item, customer, rack, mark, GRN, the number left with STOCK; the typed text is found in it', async () => {
    await loadCopy();
    await openFindGoods();
    await search('b-3');
    const row = await screen.findByTestId('find-goods-row-l03');
    expect(row).toHaveTextContent('Beans', { exact: false });
    expect(row).toHaveTextContent('asha Traders', { exact: false });
    expect(row).toHaveTextContent(/Rack B-3/);
    expect(row).toHaveTextContent(/Mark 50%_OFF/);
    expect(row).toHaveTextContent(/GRN A2/);
    expect(screen.getByTestId('find-goods-row-stock-l03')).toHaveTextContent('19');
    expect(within(row).getByText('STOCK')).toBeOnTheScreen();
    expect(screen.queryByTestId('find-goods-row-empty-l03')).not.toBeOnTheScreen();
  });

  it('one spoken label in Design 3.4\'s order, with the hint', async () => {
    await loadCopy();
    await openFindGoods();
    await search('b-3');
    const row = await screen.findByTestId('find-goods-row-l03');
    expect(row).toHaveProp('accessibilityLabel', 'Beans, asha Traders, rack B-3, mark 50%_OFF, GRN A2, 19 of 100 in stock');
    expect(row).toHaveProp('accessibilityHint', 'Opens the GRN');
  });

  it('a lot with no stock: found, last, with the Empty badge and 0', async () => {
    await loadCopy();
    await openFindGoods();
    await search('peas');
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l06', 'l01', 'l02']));
    expect(screen.getByTestId('find-goods-row-empty-l02')).toHaveTextContent('Empty', { exact: false });
    expect(screen.getByTestId('find-goods-row-stock-l02')).toHaveTextContent('0');
    expect(screen.queryByTestId('find-goods-row-empty-l06')).not.toBeOnTheScreen();
  });

  it('a lot with no rack says "No rack"; a lot with no mark has no mark part', async () => {
    await loadCopy();
    await openFindGoods();
    await search('a');
    await screen.findByTestId('find-goods-row-l05');
    expect(screen.getByTestId('find-goods-row-l05')).toHaveTextContent('No rack', { exact: false });
    expect(screen.getByTestId('find-goods-row-l05')).not.toHaveTextContent(/Rack /);
    expect(screen.getByTestId('find-goods-row-l04')).not.toHaveTextContent(/Mark/);
    expect(screen.getByTestId('find-goods-row-l04')).toHaveTextContent(/Rack C-1/);
    // Contract 14, T6a: the spoken label says it as the row does; a missing mark leaves out its part and comma.
    expect(screen.getByTestId('find-goods-row-l05')).toHaveProp('accessibilityLabel', 'Rice, Bhavin Foods, No rack, mark back\\slash, GRN a3, 1 of 5 in stock');
    expect(screen.getByTestId('find-goods-row-l04')).toHaveProp('accessibilityLabel', 'Beans, Bhavin Foods, rack C-1, GRN A10, 20 of 100 in stock');
  });

  it('Gujarati: "રેક નથી" for no rack', async () => {
    await setLanguage('gu');
    await loadCopy();
    await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    await search('a');
    expect(await screen.findByTestId('find-goods-row-l05')).toHaveTextContent('રેક નથી', { exact: false });
  });

  it('WH-381: FindGoodsRow renders no lessNotSent / lessHeld / lessOtherPerson deduction lines', async () => {
    mockOverlay.lessUnsent.set('l06', 4);
    mockOverlay.lessHeld.set('l06', 2);
    await loadCopy();
    await openFindGoods();
    await search('d-4');
    await screen.findByTestId('find-goods-row-l06');
    expect(screen.queryByTestId('lot-less-unsent-l06')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('lot-less-held-l06')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('lot-less-others-l06')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Less \d+ in/)).not.toBeOnTheScreen();
  });
});

describe('S7: opening a GRN, and coming back', () => {
  it('a tap opens that GRN\'s details; coming back keeps the text and the rows', async () => {
    await loadCopy();
    const view = await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    await search('peas');
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l06', 'l01', 'l02']));
    await userEvent.press(screen.getByTestId('find-goods-row-l06'));
    expect(router.push).toHaveBeenCalledWith(`/grn-details/${lotNamed('l06').gr_id}`);
    // Back: the tab is drawn again over the same session.
    await view.unmount();
    await render(<Tab />);
    expect(await screen.findByTestId('find-goods-search')).toHaveProp('value', 'peas');
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l06', 'l01', 'l02']));
  });
});

describe('S8: sign-out and facility switch', () => {
  it('empty the view and the text: the GRN view, and an empty field when Find goods is chosen again', async () => {
    await loadCopy();
    const view = await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    await search('peas');
    await waitFor(() => expect(rowsOnScreen()).toHaveLength(4));
    await view.unmount();
    await runSessionScopedClears({ dispatch: mockStore.dispatch as never });
    // The clear erased the copy with the session; the next session loads its own before the tab is drawn again.
    await engine.stopPhoneCopy();
    await loadCopy();
    await render(<Tab />);
    expect(await screen.findByTestId('grn-card-g-B1')).toBeOnTheScreen();
    expect(screen.queryByTestId('find-goods-search')).not.toBeOnTheScreen();
    await userEvent.press(screen.getByTestId('grn-view-switch-find-goods'));
    expect(await screen.findByTestId('find-goods-search')).toHaveProp('value', '');
    expect(screen.getByTestId('find-goods-intro')).toBeOnTheScreen();
  });
});

describe('S9: after a sync', () => {
  it('a changed lot re-reads the loaded rows once from the top: the rack changes, with no skeleton and no scroll', async () => {
    await loadCopy();
    await openFindGoods();
    await search('peas');
    await waitFor(() => expect(rowsOnScreen()).toHaveLength(4));
    const read = jest.spyOn(findGoodsModule(), 'findGoods');
    mockScroll.mockClear();
    await sync([upsert('goodsreceived_trl', 'l06', { ...lotNamed('l06'), rack: 'Z-9' })]);
    await waitFor(() => expect(screen.getByTestId('find-goods-row-l06')).toHaveTextContent(/Rack Z-9/), { timeout: 4000 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('peas', 0);
    expect(screen.queryByTestId('find-goods-loading')).not.toBeOnTheScreen();
    expect(mockScroll).not.toHaveBeenCalled();
    expect(serverCalls).toEqual([]);
  }, 15000);

  it('a change of settings only reads nothing', async () => {
    await loadCopy();
    await openFindGoods();
    await search('peas');
    await waitFor(() => expect(rowsOnScreen()).toHaveLength(4));
    const read = jest.spyOn(findGoodsModule(), 'findGoods');
    await sync([upsert('settings', 'numbering', { id: 'numbering' })]);
    await wait(1500);
    expect(read).not.toHaveBeenCalled();
  });

  it('a change of GRNs (goodsreceived) re-reads too', async () => {
    await loadCopy();
    await openFindGoods();
    await search('peas');
    await waitFor(() => expect(rowsOnScreen()).toHaveLength(4));
    const read = jest.spyOn(findGoodsModule(), 'findGoods');
    await sync([{ e: 'goodsreceived', id: 'g-B1', op: 'delete' }]);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await waitFor(() => expect(screen.queryByTestId('find-goods-row-l06')).not.toBeOnTheScreen());
  }, 15000);
});

describe('DQ1: the copy cannot be read', () => {
  it('shows the empty state with its hint and "Try again", which runs the same search again; never "No lot matches"', async () => {
    await loadCopy();
    await openFindGoods();
    const module = findGoodsModule();
    const real = module.findGoods;
    const read = jest.spyOn(module, 'findGoods').mockImplementationOnce(async () => ({ kind: 'failed' }));
    await search('peas');
    const failed = await screen.findByTestId('find-goods-failed');
    expect(failed).toHaveTextContent("Couldn't read the records on this phone", { exact: false });
    expect(failed).toHaveTextContent('Try again. If it keeps happening, close the app and open it again.', { exact: false });
    expect(screen.queryByTestId('find-goods-no-match')).not.toBeOnTheScreen();
    expect(rowsOnScreen()).toEqual([]);
    read.mockImplementation(real);
    await userEvent.press(screen.getByTestId('find-goods-retry'));
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l06', 'l01', 'l02']));
    expect(read).toHaveBeenLastCalledWith('peas', 0);
    expect(screen.queryByTestId('find-goods-failed')).not.toBeOnTheScreen();
  });

  it('Gujarati wording', async () => {
    await setLanguage('gu');
    await loadCopy();
    await render(<Tab />);
    await userEvent.press(await screen.findByTestId('grn-view-switch-find-goods'));
    jest.spyOn(findGoodsModule(), 'findGoods').mockImplementation(async () => ({ kind: 'failed' }));
    await search('peas');
    const failed = await screen.findByTestId('find-goods-failed');
    expect(failed).toHaveTextContent('આ ફોનની માહિતી વાંચી શકાઈ નથી', { exact: false });
    expect(failed).toHaveTextContent('ફરી પ્રયાસ કરો. વારંવાર થાય તો ઍપ બંધ કરીને ફરી ખોલો.', { exact: false });
  });
});

describe('F9 (screen half): the copy changes between page 0 and page 1', () => {
  it('restarts at offset 0 and never shows a mixed list', async () => {
    // Page 0 from one copy id, page 1 from another: the screen drops page 1 and asks again from the top.
    await loadCopy();
    await openFindGoods();
    const module = findGoodsModule();
    const real = module.findGoods;
    const calls: number[] = [];
    let copy = 'copy-A';
    jest.spyOn(module, 'findGoods').mockImplementation(async (query, offset) => {
      calls.push(offset);
      const answer = (await real(query, offset)) as { kind: string; page?: { data: unknown[]; total_count: number; limit: number; offset: number }; copyId?: string };
      if (answer.kind !== 'page' || !answer.page) return answer;
      const data = answer.page.data.slice(0, 3);   // pretend a page holds 3 rows
      return { ...answer, copyId: copy, page: { ...answer.page, data, limit: 3 } } as Answer;
    });
    await search('a');
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l07', 'l05']));
    copy = 'copy-B';
    await act(async () => { (screen.getByTestId('find-goods-list') as unknown as { props: { onEndReached?: () => void } }).props.onEndReached?.(); });
    await waitFor(() => expect(calls).toEqual([0, 3, 0]));
    await waitFor(() => expect(rowsOnScreen()).toEqual(['l08', 'l07', 'l05']));
  });
});
