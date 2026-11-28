/**
 * WH-348 + WH-381, Design offline-capture.md 2.5, 2.11 and Part 13.1 A & C:
 * with no connection the Customers, Items and Users lists open from the copy, show their one footnote
 * ("New <things> need a connection.") and no "+"; the Invoices tab (WH-381), Sensors and the temperature report say they
 * need a connection (`invoices-needs-connection`, `sensors-needs-connection`, `temperature-report-needs-connection`) with
 * no rows, no removed `invoices-new-needs-connection` footnote and no "Try again"; no list shows a "Last updated" line of
 * its own. Reachable, an older server or the feature off: today's screens.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - `create-invoice-fab` is the Invoices tab's "+" testID (Design 13.7 check 3); `invoice-last-updated` the removed time line.
 * ==================================
 *
 * Real: the screens, the services, the sync engine, the copy, the store. Faked at the edge: the server's answers, the phone's
 * native modules, the connection, FlashList's native drawing.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import CustomersScreen from '../../../../app/customers';
import ItemsScreen from '../../../../app/items';
import UsersScreen from '../../../../app/users';
import InvoicesTab from '../../../../app/(tabs)/invoices';
import SensorsScreen from '../../../../app/sensors';
import TemperatureReportScreen from '../../../../app/reports/temperature-report';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { guard } from '@/tests/phoneCopy/singleStatementSqlite';
import { failStatement } from '@/tests/phoneCopy/fakeExpoSqlite';
import { layout } from '@/theme/tokens';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { resetScreenFocus } from '@/tests/components/focusHarness';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import themeReducer from '@/store/slices/themeSlice';
import { setLanguage } from '@/i18n';

// The connection rejects a second statement that starts while one runs, as expo-sqlite does (off until a test turns the guard on).
jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/singleStatementSqlite').singleStatementSqliteModule(), { virtual: true });
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
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
  Stack: { Screen: require('@/tests/helpers/stackScreenMock').StackScreenMock },
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn(), useHaptics: () => ({ selection: jest.fn(), light: jest.fn(), medium: jest.fn() }) }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
// The A-Z rail's pan gesture needs a GestureHandlerRootView, which a screen test does not mount.
jest.mock('react-native-gesture-handler', () => ({ ...jest.requireActual('react-native-gesture-handler'), GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));

/** The copy format whose readers WH-348 adds (contract section 2, "Format gate"). */
const WH348_FORMAT = 3;
const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };

let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());

async function signIn(role: 'admin' | 'staff') {
  const store = configureStore({ reducer: { auth: authReducer, listFilters: listFilterReducer, reportPrefs: reportPrefsReducer, theme: themeReducer } });
  mockStore = store as unknown as typeof mockStore;
  store.dispatch(setUserProfile({ id: 'profile-1', role, name: 'Asha Fictional' } as never));
}
const consoleSpy = {} as Record<'log' | 'info' | 'warn' | 'error' | 'debug' | 'time' | 'timeEnd', jest.SpyInstance>;
beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) consoleSpy[level] = jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  seedWarehouse();
  seedDocuments();
  env.feed.format = WH348_FORMAT;
  forgetQueries();
  mockNet.offline = false;
  guard.on = false;
  guard.rejected = 0;
  resetScreenFocus();
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  await signIn('admin');
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  await setLanguage('en');
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

type ListCase = { name: string; Screen: React.ComponentType; footnoteId: string; footnote: string; gujarati: string; plus: RegExp | null; row: string; ownTimeId: string };
const LISTS: ListCase[] = [
  { name: 'Customers', Screen: CustomersScreen, footnoteId: 'customers-new-needs-connection', footnote: 'New customers need a connection.',
    gujarati: 'નવા વેપારી માટે કનેક્શન જોઈએ.', plus: /Add customer/, row: 'Bhavin Foods', ownTimeId: 'customers-last-updated' },
  { name: 'Items', Screen: ItemsScreen, footnoteId: 'items-new-needs-connection', footnote: 'New items need a connection.',
    gujarati: 'નવી આઇટમ માટે કનેક્શન જોઈએ.', plus: /Add item/, row: 'Beans', ownTimeId: 'items-last-updated' },
  // Users has no "+" today (people register themselves), so only the footnote is asserted.
  { name: 'Users', Screen: UsersScreen, footnoteId: 'users-new-needs-connection', footnote: 'New users need a connection.',
    gujarati: 'નવા યુઝર માટે કનેક્શન જોઈએ.', plus: null, row: 'Meera Fictional', ownTimeId: 'users-last-updated' },
];

describe.each(LISTS)('$name list with no connection (copy, format of WH-348)', ({ Screen, footnoteId, footnote, plus, row, ownTimeId }) => {
  it('shows its rows from the copy, the footnote, no "+" and no time line of its own', async () => {
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    expect((await screen.findAllByText(new RegExp(row))).length).toBeGreaterThan(0);
    expect(screen.getByTestId(footnoteId)).toHaveTextContent(footnote);
    if (plus) expect(screen.queryByRole('button', { name: plus })).not.toBeOnTheScreen();
    expect(screen.queryByTestId(ownTimeId)).not.toBeOnTheScreen();
  });

  it('says the same in Gujarati', async () => {
    const { gujarati } = LISTS.find(l => l.footnoteId === footnoteId) as ListCase;
    await setLanguage('gu');
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    await screen.findAllByText(new RegExp(row));
    expect(screen.getByTestId(footnoteId)).toHaveTextContent(gujarati);
  });

  it('the footnote takes the screen\'s side margin', async () => {
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    await screen.findAllByText(new RegExp(row));
    expect(screen.getByTestId(footnoteId)).toHaveStyle({ paddingHorizontal: layout.marginCompact });
  });

  it('reachable: no footnote' + (plus ? ', the "+" is there' : ''), async () => {
    await load({ expectDone: true });
    await render(<Screen />);
    await screen.findAllByText(new RegExp(row));
    expect(screen.queryByTestId(footnoteId)).not.toBeOnTheScreen();
    if (plus) expect(screen.getByRole('button', { name: plus })).toBeOnTheScreen();
  });
});

describe.each(LISTS)('$name list on an older server, offline (today\'s screen)', ({ Screen, footnoteId, plus }) => {
  it('has no footnote and keeps its "+"', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    expect(screen.queryByTestId(footnoteId)).not.toBeOnTheScreen();
    if (plus) expect(await screen.findByRole('button', { name: plus })).toBeOnTheScreen();
  });
});

describe('Users from the copy, one statement at a time (WH-348, Design finding)', () => {
  // Two more people, so the page needs several per-user statements; the connection then rejects any that overlap.
  const addPeople = () => {
    for (const [id, name, mobile] of [['p2', 'Nikhil Fictional', '9000000008'], ['p3', 'Omkar Fictional', '9000000007']]) {
      env.feed.rows.user_profiles.push({ id, row: { id, name, display_name: name, role: 'staff', mobile, active: true, is_service_account: false } });
    }
  };
  const serverUserCalls = () => env.feed.named('get_users_list');

  it('offline with a ready copy: lists every person from the copy, no overlapping statement, no server call', async () => {
    addPeople();
    await load({ expectDone: true });
    await connection(true);
    guard.on = true;
    await render(<UsersScreen />);
    expect(await screen.findByText('Meera Fictional')).toBeOnTheScreen();
    expect(screen.getByText('Nikhil Fictional')).toBeOnTheScreen();
    expect(screen.getByText('Omkar Fictional')).toBeOnTheScreen();
    expect(guard.rejected).toBe(0);
    expect(screen.queryByText("Couldn't load users")).not.toBeOnTheScreen();
    expect(serverUserCalls()).toHaveLength(0);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it('offline, a copy read that fails: the quiet "Couldn\'t load users", a warning in the log, no server call, no console.error', async () => {
    await load({ expectDone: true });
    await connection(true);
    failStatement(/users_customers_new/, new Error('disk I/O error'));
    await render(<UsersScreen />);
    expect(await screen.findByText("Couldn't load users")).toBeOnTheScreen();
    expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('A read of the copy failed'), expect.anything());
    expect(serverUserCalls()).toHaveLength(0);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it('online (reachable): the same list, no error', async () => {
    addPeople();
    await load({ expectDone: true });
    guard.on = true;
    await render(<UsersScreen />);
    expect(await screen.findByText('Nikhil Fictional')).toBeOnTheScreen();
    expect(screen.getByText('Meera Fictional')).toBeOnTheScreen();
    expect(guard.rejected).toBe(0);
    expect(screen.queryByText("Couldn't load users")).not.toBeOnTheScreen();
  });
});

describe('Invoices tab with no connection (WH-381, Design 13.1 A & C)', () => {
  const NEEDS_EN = 'This needs a connection. It will load when you reconnect.';
  const NEEDS_GU = 'આ માટે કનેક્શન જોઈએ. ફરી જોડાશો ત્યારે લોડ થશે.';

  it('offline: whole-screen ScreenNeedsConnection, no rows, no "+", no removed footnote, no "Try again"', async () => {
    await load({ expectDone: true });
    await connection(true);
    await render(<InvoicesTab />);
    expect(await screen.findByTestId('invoices-needs-connection')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByText(/7001/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Create invoice/ })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('create-invoice-fab')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('invoices-new-needs-connection')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('invoice-last-updated')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it('Gujarati offline: whole-screen ScreenNeedsConnection wording, no removed footnote', async () => {
    await setLanguage('gu');
    await load({ expectDone: true });
    await connection(true);
    await render(<InvoicesTab />);
    expect(await screen.findByTestId('invoices-needs-connection')).toHaveTextContent(NEEDS_GU);
    expect(screen.queryByTestId('invoices-new-needs-connection')).not.toBeOnTheScreen();
  });

  it('reachable: no needs-connection state and the "+" is there', async () => {
    await load({ expectDone: true });
    await render(<InvoicesTab />);
    expect(await screen.findByRole('button', { name: /Create invoice/ })).toBeOnTheScreen();
    expect(screen.queryByTestId('invoices-needs-connection')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('invoices-new-needs-connection')).not.toBeOnTheScreen();
  });
});

describe('Sensors and the temperature report with no connection', () => {
  const TEXT = 'This needs a connection. It will load when you reconnect.';
  it.each([
    ['Sensors', SensorsScreen, 'sensors-needs-connection'],
    ['the temperature report', TemperatureReportScreen, 'temperature-report-needs-connection'],
  ] as const)('%s says so, with no "Try again"', async (_name, Screen, testID) => {
    await load({ expectDone: true });
    await connection(true);
    await render(<Screen />);
    expect(await screen.findByTestId(testID)).toHaveTextContent(TEXT);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it.each([
    ['Sensors', SensorsScreen, 'sensors-needs-connection'],
    ['the temperature report', TemperatureReportScreen, 'temperature-report-needs-connection'],
  ] as const)('%s, reachable: today\'s error state, not told to reconnect', async (_name, Screen, testID) => {
    await load({ expectDone: true });
    await render(<Screen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByTestId(testID)).not.toBeOnTheScreen();
  });

  describe('the sensor request (WH-348)', () => {
    const sensorCalls = () => env.feed.named('get_sensor_report_devices');
    const quiet = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });

    it('offline: no request goes out', async () => {
      await load({ expectDone: true });
      await connection(true);
      await render(<TemperatureReportScreen />);
      expect(await screen.findByTestId('temperature-report-needs-connection')).toBeOnTheScreen();
      await quiet();
      expect(sensorCalls()).toHaveLength(0);
    });

    it('on reconnect: exactly one request', async () => {
      await load({ expectDone: true });
      await connection(true);
      await render(<TemperatureReportScreen />);
      await screen.findByTestId('temperature-report-needs-connection');
      await connection(false);
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
      await quiet();
      expect(sensorCalls()).toHaveLength(1);
    });

    it('online: one request on open, as before', async () => {
      await load({ expectDone: true });
      await render(<TemperatureReportScreen />);
      await waitFor(() => expect(sensorCalls()).toHaveLength(1));
      await quiet();
      expect(sensorCalls()).toHaveLength(1);
    });
  });

  it('Sensors on an older server, offline: today\'s error state with its retry', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await connection(true);
    await render(<SensorsScreen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByTestId('sensors-needs-connection')).not.toBeOnTheScreen();
  });
});

/** A change the server sends after the first load: one row of `entity` replaced (the feed's change answer). */
async function syncRowChange(entity: string, id: string, patch: Record<string, unknown>) {
  const old = env.feed.rows[entity].find(r => r.id === id);
  if (!old) throw new Error(`no ${entity} ${id}`);
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
    changes: [{ e: entity, id, op: 'upsert', v: 'b000000000000001', row: { ...old.row, ...patch } }] });
  await act(async () => { expect(await engine.syncNow('interval')).toBe('done'); });
}

describe('the lists read again quietly after a sync (WH-348, contract 11.1)', () => {
  // [list, its screen, the entity a change of which the rows are made of, the row's id, what to change, the row before, the row after]
  const QUIET = [
    ['Customers', CustomersScreen, 'customers', 'c2', { name: 'Bhavin Renamed Foods' }, 'Bhavin Foods', 'Bhavin Renamed Foods'],
    ['Items', ItemsScreen, 'items', 'i2', { name: 'Beans Renamed' }, 'Beans', 'Beans Renamed'],
    ['Users', UsersScreen, 'user_profiles', 'p1', { name: 'Meera Renamed' }, 'Meera Fictional', 'Meera Renamed'],
  ] as const;

  it.each(QUIET)('%s: a sync that changed a row it shows replaces the row, with no server call and no spinner', async (_name, Screen, entity, id, patch, before, after) => {
    await load({ expectDone: true });
    await render(<Screen />);
    expect((await screen.findAllByText(new RegExp(before))).length).toBeGreaterThan(0);
    await syncRowChange(entity, id, patch);
    expect((await screen.findAllByText(new RegExp(after), undefined, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(`^${before}$`))).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading')).not.toBeOnTheScreen();
  });

  it.each(QUIET)('%s: a sync that changed nothing it shows leaves the rows as they are', async (_name, Screen, _entity, _id, _patch, before) => {
    await load({ expectDone: true });
    await render(<Screen />);
    await screen.findAllByText(new RegExp(before));
    await syncRowChange('goodsreceived', 'g-A2', { note: 'Fictional note' });
    expect(screen.getAllByText(new RegExp(before)).length).toBeGreaterThan(0);
  });
});
