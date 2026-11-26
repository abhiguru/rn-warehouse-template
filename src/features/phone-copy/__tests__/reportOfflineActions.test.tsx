/**
 * WH-299 (Design's check of 2026-11-26, violations 1 and 2): with no connection the stock summary's per-customer
 * "Share PDF for <customer>" button and its header PDF icon are disabled, say why to a screen reader, and are drawn
 * with the disabled look. Reachable, they stay enabled and drawn as today.
 *
 * Real: the screen, its header, the row card, the store, the sync engine and the copy. Faked at the edge: the server's
 * answers, the phone's native modules, the connection, FlashList's native drawing.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import StockSummaryScreen from '../../../../app/reports/stock-summary';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { downloadAndSharePDF } from '@/utils/shareDocument';
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
import { getTokens } from '@/theme/tokens';
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
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
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
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const draw = (part: unknown) => (typeof part === 'function' ? React.createElement(part) : part ?? null);
  return {
    FlashList: React.forwardRef((props: any, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: () => {}, scrollToIndex: () => {} }));
      return React.createElement(React.Fragment, null, draw(props.ListHeaderComponent),
        props.data.map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: props.keyExtractor(item, index) }, props.renderItem({ item, index }))),
        props.data.length ? null : draw(props.ListEmptyComponent), draw(props.ListFooterComponent));
    }),
  };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };

let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());
beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  seedWarehouse();
  seedDocuments();
  forgetQueries();
  mockNet.offline = false;
  resetScreenFocus();
  jest.mocked(downloadAndSharePDF).mockClear();
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  const store = configureStore({ reducer: { auth: authReducer, listFilters: listFilterReducer, reportPrefs: reportPrefsReducer, theme: themeReducer } });
  mockStore = store as unknown as typeof mockStore;
  store.dispatch(setUserProfile({ id: 'profile-1', role: 'staff', name: 'Asha Fictional' } as never));
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
async function open() {
  await render(<StockSummaryScreen />);
  await screen.findByText('Bhavin Foods');
}
const opacityOf = (name: string) => StyleSheet.flatten(screen.getByRole('button', { name }).props.style)?.opacity;
const DISABLED = getTokens('orange', 'light').interaction.disabledOpacity;

describe('the stock summary with no connection', () => {
  it('disables each customer\'s Share PDF button, says why in its label, and draws it disabled', async () => {
    await loadCopy();
    await connection(true);
    await open();
    const share = screen.getByRole('button', { name: 'Share PDF for Bhavin Foods, needs a connection' });
    expect(share).toBeDisabled();
    expect(opacityOf('Share PDF for Bhavin Foods, needs a connection')).toBe(DISABLED);
    expect(screen.queryByRole('button', { name: 'Share PDF for Bhavin Foods' })).not.toBeOnTheScreen();
    await userEvent.press(share);
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
  });

  it('draws the header PDF icon as disabled', async () => {
    await loadCopy();
    await connection(true);
    await open();
    expect(screen.getByRole('button', { name: 'Share PDF, needs a connection' })).toBeDisabled();
    expect(opacityOf('Share PDF, needs a connection')).toBe(DISABLED);
  });

  it('says the reason in Gujarati on the row button', async () => {
    await setLanguage('gu');
    await loadCopy();
    await connection(true);
    await render(<StockSummaryScreen />);
    await screen.findByText('Bhavin Foods');
    expect(screen.getByRole('button', { name: 'Bhavin Foodsની PDF શેર કરો, કનેક્શન જોઈએ' })).toBeDisabled();
  });
});

describe('the stock summary reachable', () => {
  it('keeps the row button and the header icon enabled and drawn as today', async () => {
    await loadCopy();
    await open();
    expect(screen.getByRole('button', { name: 'Share PDF for Bhavin Foods' })).toBeEnabled();
    expect(opacityOf('Share PDF for Bhavin Foods')).not.toBe(DISABLED);
    expect(screen.getByRole('button', { name: 'Share PDF' })).toBeEnabled();
    expect(opacityOf('Share PDF')).not.toBe(DISABLED);
  });
});
