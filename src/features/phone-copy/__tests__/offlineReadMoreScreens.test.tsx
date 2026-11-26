/**
 * WH-348, Design offline-capture.md 2.5 and 2.11, contract product/tech/app-offline-read-more.md section 8 and S1, S4, S5:
 * with no connection the Invoices, Customers, Items and Users lists open from the copy, show their one footnote
 * ("New <things> need a connection.") and no "+"; Sensors and the temperature report say they need a connection, with no
 * "Try again"; no list shows a "Last updated" line of its own. Reachable, an older server or the feature off: today's screens.
 *
 * Real: the screens, the services, the sync engine, the copy, the store. Faked at the edge: the server's answers, the phone's
 * native modules, the connection, FlashList's native drawing.
 *
 * The feed format the WH-348 readers need is in one place, WH348_FORMAT (Product: format 3 comes with WH-328). Until the
 * build reads it, the copy does not load and the offline cases fail at that step.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
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
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
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
beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  seedWarehouse();
  seedDocuments();
  env.feed.format = WH348_FORMAT;
  forgetQueries();
  mockNet.offline = false;
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
  { name: 'Invoices', Screen: InvoicesTab, footnoteId: 'invoices-new-needs-connection', footnote: 'New invoices need a connection.',
    gujarati: 'નવા ઇન્વૉઇસ માટે કનેક્શન જોઈએ.', plus: /Create invoice/, row: '7001', ownTimeId: 'invoices-last-updated' },
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

  it('Sensors on an older server, offline: today\'s error state with its retry', async () => {
    env.feed.format = 2;
    await load({ expectDone: true });
    await connection(true);
    await render(<SensorsScreen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByTestId('sensors-needs-connection')).not.toBeOnTheScreen();
  });
});
