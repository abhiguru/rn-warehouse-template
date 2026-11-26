/**
 * WH-363: "Sign in again" on the "Couldn't start the app" screen (product/design/offline-capture.md 12.3). It is offered
 * only after 3 failed tries in a row, at least one on a fresh start (the count survives a restart; a good read resets
 * it; one start where both stores fail counts once). After the person confirms, it removes the saved central sign-in
 * even when that store cannot be read, erases the phone copy's file and key without reading the key, leaves the facility
 * selected, and ends in a signed-out phone that the sign-in screens take over. When the removal fails, Design's alert
 * says so and the same screen stays with the count kept.
 *
 * Real: `RootLayout` (app/_layout.tsx) with the app's store, session restore, the central session
 * (src/config/centralSession.ts), the try count (src/config/storeUnreadableTries.ts), `endSessionKeepingFacility`, the
 * dialogs and `ConfigErrorScreen`. Faked: the network (`fetch`), the clock, `AppState`, native modules (the secure store
 * fails on request), the central build setting, the router (one stand-in screen), and the phone copy's file deletion
 * (`deleteCopyFile`), which is recorded.
 *
 * Not covered: unsent work is not stored by the app yet (WH-301), so "never unsent work" is not asserted.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import '@/tests/helpers/fakeTimersFirst';
import RootLayout from '../../../app/_layout';
import { clearOfflineStarted } from '@/config/offlineStart';
import { operatorResumeGate } from '@/config/operatorResume';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { cacheUserProfile, invalidateStoredTokenCache, storeTokens } from '@/config/supabaseConfig';
import { store } from '@/store';
import { logout, setUserProfile } from '@/store/slices/authSlice';
import { resetAlertQueueForTests } from '@/utils/alert';
import { fakeAppState } from '@/tests/helpers/fakeRoute';
import {
  ASHA, PROFILE_PATH, REFRESH_PATH, count, deferred, json, jwt, leavePhone, noAnswer, paths, secure, server,
  signedInPhone,
} from '@/tests/helpers/offlineRoleServer';
import * as SecureStore from 'expo-secure-store';

// The real React bindings: the package's React Native entry is ESM, which Jest cannot load, so its CommonJS build.
jest.mock('react-redux', () => jest.requireActual('../../../node_modules/react-redux/dist/cjs/index.js'));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('@/config/sentryConfig', () => ({
  initializeSentry: jest.fn(), setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(),
  captureMessage: jest.fn(), addBreadcrumb: jest.fn(), Sentry: { wrap: (c: unknown) => c },
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(async () => ({ type: 'wifi', isConnected: true, isInternetReachable: true, details: null })),
    refresh: jest.fn(async () => ({})),
  },
  useNetInfo: () => ({ type: 'wifi', isConnected: true, isInternetReachable: true, details: null }),
}));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: View,
    SafeAreaInsetsContext: React.createContext(insets),
    useSafeAreaInsets: () => insets,
  };
});
jest.mock('react-native-paper', () => ({
  PaperProvider: ({ children }: { children: React.ReactNode }) => children,
  MD3LightTheme: { colors: {} },
  MD3DarkTheme: { colors: {} },
}));
jest.mock('react-native-paper-dates', () => ({ en: {}, registerTranslation: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-navigation-bar', () => ({ setStyle: jest.fn() }));
jest.mock('expo-router', () => {
  const React = require('react');
  const { Modal, Pressable, Text, TextInput, View } = require('react-native');
  /** What stands where the app's screens are: a half-filled form, and a sheet over it. */
  const OpenScreen = () => {
    const [remarks, setRemarks] = React.useState('');
    const [sheet, setSheet] = React.useState(false);
    return React.createElement(View, null,
      React.createElement(Text, null, 'New goods receipt'),
      React.createElement(TextInput, { accessibilityLabel: 'Remarks', value: remarks, onChangeText: setRemarks }),
      React.createElement(Pressable, { accessibilityRole: 'button', onPress: () => setSheet(true) },
        React.createElement(Text, null, 'Choose item')),
      React.createElement(Modal, { visible: sheet }, React.createElement(Text, null, 'Item sheet')));
  };
  const Stack = () => React.createElement(OpenScreen);
  Stack.Screen = () => null;
  return {
    Stack,
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('@/navigation/RouteGuard', () => ({
  GuardedScreen: ({ children }: { children: React.ReactNode }) => children,
  useRootRouteGuard: jest.fn(),
}));
jest.mock('@/hooks/useColdStartDeepLink', () => ({ useColdStartDeepLink: jest.fn() }));
jest.mock('@/hooks/useUnfinishedSaveCheck', () => ({ useUnfinishedSaveCheck: jest.fn() }));
jest.mock('@/i18n/useProfileLanguage', () => ({ useProfileLanguage: jest.fn() }));
jest.mock('@/hooks/usePhoneCopyStatus', () => ({
  useCopySession: () => false, useCopyFeatureOn: () => false, useEraseCopyForRole: jest.fn(),
}));
jest.mock('@/components/OfflineStatusBar', () => ({ OfflineStatusBar: () => null }));
jest.mock('@/features/phone-copy/components/PhoneCopyLifecycle', () => ({ PhoneCopyLifecycle: () => null }));
jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/UpgradingBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ForceUpdateModal', () => ({ ForceUpdateModal: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/config/lanCheck', () => ({ startDailyLanCheck: jest.fn(() => jest.fn()) }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/utils/localPhotoFiles', () => ({
  ...jest.requireActual('@/utils/localPhotoFiles'),
  sweepLocalPhotoFiles: jest.fn(async () => 0),
}));


jest.mock('@/config/envConfig', () => ({
  ...jest.requireActual('@/config/envConfig'),
  isCentralLoginConfigured: () => true,
  getCentralLoginConfig: () => ({ origin: 'https://central.example.test', issuer: 'https://central.example.test' }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CENTRAL_SECURE_KEYS } from '@/config/centralSession';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { deleteCopyFile } from '@/features/phone-copy/copyDriver';
import { FACILITY } from '@/tests/helpers/offlineRoleServer';
import { getCentralState, setCentralState } from '@/config/centralState';
import * as TriesModule from '@/config/storeUnreadableTries';

/** A restart of the app, as far as the try count is concerned (see the mock below). */
const restartRun = () => (TriesModule as unknown as { restartRun: () => void }).restartRun();

// The try count is the real module (src/config/storeUnreadableTries.ts), loaded again by `restartRun()`: that is all a
// restart of the app changes in it (its "first failure of this run" flag lives in memory); the count itself is in the
// phone's AsyncStorage, which stays.
jest.mock('@/config/storeUnreadableTries', () => {
  const storage = require('@react-native-async-storage/async-storage');
  const load = () => {
    let loaded: typeof import('@/config/storeUnreadableTries') | undefined;
    jest.isolateModules(() => {
      jest.doMock('@react-native-async-storage/async-storage', () => storage);
      loaded = jest.requireActual('@/config/storeUnreadableTries');
    });
    return loaded!;
  };
  let current = load();
  return {
    __esModule: true,
    TRIES_BEFORE_SIGN_IN_AGAIN: 3,
    recordStoreUnreadableTry: () => current.recordStoreUnreadableTry(),
    resetStoreUnreadableTries: () => current.resetStoreUnreadableTries(),
    restartRun: () => { current = load(); },
  };
});

jest.mock('@/features/phone-copy/copyDriver', () => ({
  ...jest.requireActual('@/features/phone-copy/copyDriver'),
  deleteCopyFile: jest.fn(async () => {}),
}));

const CONFIRMED = new Date('2026-03-01T06:00:00.000Z').getTime();
const TRIES_KEY = 'store_unreadable_tries_v1';
const COPY_KEY = 'secure_phone_copy_key';
const TOKEN_KEY = 'secure_auth_token';
const FACILITY_SESSION_KEYS = ['secure_auth_token', 'secure_refresh_token', 'secure_token_expires', 'cached_user_profile'];
const everything = { includeHiddenElements: true } as const;
const HINT = "If restarting the phone didn't help, you can sign in again.";
const TITLE = "Couldn't start the app";

let appState: ReturnType<typeof fakeAppState>;
let user: ReturnType<typeof userEvent.setup>;
let secureReads: string[] = [];
let failed: { central: boolean; facility: boolean } = { central: false, facility: false };
let undeletable: (key: string) => boolean = () => false;

const wait = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
  });
};
/** Time passes in small steps: work that starts after a timer fires is then waited for too. */
const waitSteps = async (ms: number) => {
  for (let spent = 0; spent < ms; spent += 500) await wait(500);
};

/** The secure store as the phone has it: the chosen reads fail (the keystore is busy), deletes work unless told not to. */
function installStore() {
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
    secureReads.push(key);
    if (failed.central && key.startsWith('secure_central_') && secure.has(key)) {
      throw new Error('Keystore not available');
    }
    if (failed.facility && key === TOKEN_KEY && secure.has(key)) throw new Error('Keystore not available');
    return secure.get(key) ?? null;
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
    if (undeletable(key)) throw new Error('Keystore not available');
    secure.delete(key);
  });
}

/** The phone holds a central sign-in and a copy key; with `noFacility`, no facility session (only central could say who this is). */
function savedSignIns({ noFacility }: { noFacility: boolean }) {
  secure.set(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, 'fictional-central-access');
  secure.set(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, 'fictional-central-refresh');
  secure.set(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(CONFIRMED + 3_600_000));
  secure.set(CENTRAL_SECURE_KEYS.USER, JSON.stringify({ id: 'central-asha', phoneNumber: '+919000000001' }));
  secure.set(COPY_KEY, 'a'.repeat(64));
  if (noFacility) for (const key of FACILITY_SESSION_KEYS) secure.delete(key);
  invalidateStoredTokenCache();
}

/** Earlier starts left `count` failed tries; `fresh` is whether one of them was the first of a restarted run. */
const seedTries = (count: number, fresh = false) => AsyncStorage.setItem(TRIES_KEY, JSON.stringify({ count, fresh }));
const triesLeft = async () => {
  const raw = await AsyncStorage.getItem(TRIES_KEY);
  return raw ? (JSON.parse(raw) as { count: number }).count : 0;
};

async function coldStart() {
  invalidateStoredTokenCache(); // a new process holds no copy of the session
  await render(<RootLayout />);
  await waitSteps(15_000);
}

const offered = () => screen.queryByRole('button', { name: 'Sign in again', ...everything });
const tryAgain = async () => {
  await user.press(screen.getByRole('button', { name: 'Try starting the app again' }));
  await waitSteps(15_000);
};

beforeEach(async () => {
  jest.useFakeTimers({ now: CONFIRMED });
  user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  appState = fakeAppState();
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  resetAlertQueueForTests();
  await signedInPhone();
  secureReads = [];
  failed = { central: false, facility: false };
  undeletable = () => false;
  jest.mocked(deleteCopyFile).mockClear();
  installStore();
  setCentralState({ status: 'unknown', user: null, autoOpenSpent: false, pendingLink: null, reopenOrigin: null }); // nothing in memory: a new process
  restartRun(); // each test starts as a newly started app
});
afterEach(async () => {
  server.profileWait = undefined;
  await AsyncStorage.removeItem(TRIES_KEY);
  await act(async () => {
    await store.dispatch(logout({ localOnly: true }));
    store.dispatch(setUserProfile(null));
  });
  clearOfflineStarted();
  await wait();
  resetAlertQueueForTests();
  leavePhone();
  appState.restore();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('when "Sign in again" is offered (WH-363)', () => {
  it('not after the first failed try, and not after 3 taps of Try again in one run of the app', async () => {
    savedSignIns({ noFacility: true });
    failed.central = true;

    await coldStart();
    expect(screen.getByRole('header', { name: TITLE })).toBeOnTheScreen();
    expect(offered()).not.toBeOnTheScreen();
    await tryAgain();
    expect(offered()).not.toBeOnTheScreen();
    await tryAgain(); // the third failed try, all in this run: no fresh start
    expect(screen.getByRole('header', { name: TITLE })).toBeOnTheScreen();
    expect(offered()).not.toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(HINT), everything)).not.toBeOnTheScreen();
  });

  it('on the third failed try when the earlier two were counted before this start; the hint sentence comes with it', async () => {
    savedSignIns({ noFacility: true });
    failed.central = true;
    await seedTries(2);

    await coldStart();

    expect(screen.getByRole('header', { name: TITLE })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();
    expect(screen.getByText(/saved sign-in\. Nothing has been deleted\./)).toHaveTextContent(new RegExp(HINT.replace('.', '\\.')));
    expect(screen.getByRole('button', { name: 'Try starting the app again' })).toBeOnTheScreen();
  });

  it('one start where both stores fail counts once: the second try does not offer it', async () => {
    savedSignIns({ noFacility: false });
    failed.central = true;
    failed.facility = true;
    await seedTries(1);

    await coldStart();

    expect(screen.getByRole('header', { name: TITLE })).toBeOnTheScreen();
    expect(offered()).not.toBeOnTheScreen();
    expect(await triesLeft()).toBe(2);
  });

  it('one start where both stores fail is still the third try when two were counted before: it is offered', async () => {
    savedSignIns({ noFacility: false });
    failed.central = true;
    failed.facility = true;
    await seedTries(2);

    await coldStart();

    expect(screen.getByRole('header', { name: TITLE })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();
    expect(await triesLeft()).toBe(3);
  });

  it('a good read resets the count: the button goes, and a failure at the next start is the first again', async () => {
    savedSignIns({ noFacility: true });
    failed.central = true;
    await seedTries(2);
    await coldStart();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();

    failed.central = false;
    await tryAgain();
    expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
    expect(offered()).not.toBeOnTheScreen();

    // The phone is restarted and the store fails again: that is the first failed try, not the third.
    await act(async () => { screen.unmount(); });
    await wait(1_000);
    restartRun();
    setCentralState({ status: 'unknown', user: null, autoOpenSpent: false, pendingLink: null });
    failed.central = true;
    await coldStart();
    expect(screen.getByRole('header', { name: TITLE })).toBeOnTheScreen();
    expect(offered()).not.toBeOnTheScreen();
  });
});

describe('"Sign in again" (WH-363)', () => {
  async function offeredScreen() {
    savedSignIns({ noFacility: true });
    failed.central = true;
    await seedTries(2);
    await coldStart();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();
  }

  it('asks first; Cancel changes nothing', async () => {
    await offeredScreen();

    await user.press(screen.getByRole('button', { name: 'Sign in again' }));
    await wait(1_000); // the dialog takes presses a moment after it appears

    expect(screen.getByText('Sign in again?')).toBeOnTheScreen();
    expect(screen.getByText(/saved sign-in and the data on this phone will be removed/)).toBeOnTheScreen();
    expect(screen.queryByText(/Entries not sent yet/)).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await wait();

    expect(screen.queryByText(/The saved sign-in and the data on this phone/, everything)).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();
    expect(secure.has(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(true);
    expect(secure.has(COPY_KEY)).toBe(true);
    expect(deleteCopyFile).not.toHaveBeenCalled();
  });

  it('removes the saved central sign-in although it cannot be read, erases the copy file and key without reading the key, and keeps the facility', async () => {
    await offeredScreen();
    secureReads = [];

    await user.press(screen.getByRole('button', { name: 'Sign in again' }));
    await wait(1_000); // the dialog takes presses a moment after it appears
    await user.press(screen.getAllByRole('button', { name: 'Sign in again' }).at(-1)!);
    await waitSteps(15_000);

    for (const key of Object.values(CENTRAL_SECURE_KEYS)) expect(secure.has(key)).toBe(false);
    expect(secure.has('secure_central_signed_out')).toBe(false);
    expect(secure.has(COPY_KEY)).toBe(false);
    expect(deleteCopyFile).toHaveBeenCalled();
    expect(secureReads).not.toContain(COPY_KEY);
    expect(getActiveOperatorServer()?.origin).toBe(FACILITY.origin);
    // The start goes on to the sign-in screens, with no load error and no way back to the old sign-in.
    expect(screen.queryByRole('header', { name: TITLE, ...everything })).not.toBeOnTheScreen();
    expect(await triesLeft()).toBe(0);
    expect(store.getState().auth.userProfile).toBeNull();
    // WH-366: the person signs in centrally again, and this facility is the one that opens.
    expect(getCentralState().reopenOrigin).toBe(FACILITY.origin);
  });

  it('with only the facility sign-in unreadable, the central sign-in is kept and no facility is marked to open again (WH-366)', async () => {
    savedSignIns({ noFacility: false });
    failed.facility = true;
    await seedTries(2);
    await coldStart();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Sign in again' }));
    await wait(1_000); // the dialog takes presses a moment after it appears
    await user.press(screen.getAllByRole('button', { name: 'Sign in again' }).at(-1)!);
    await waitSteps(15_000);

    for (const key of FACILITY_SESSION_KEYS) expect(secure.has(key)).toBe(false);
    expect(secure.has(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(true);
    expect(getCentralState().reopenOrigin).toBeNull();
  });

  it('the same removal with a facility sign-in that cannot be read: the facility session goes too', async () => {
    savedSignIns({ noFacility: false });
    failed.facility = true;
    failed.central = true;
    await seedTries(2);
    await coldStart();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Sign in again' }));
    await wait(1_000); // the dialog takes presses a moment after it appears
    await user.press(screen.getAllByRole('button', { name: 'Sign in again' }).at(-1)!);
    await waitSteps(15_000);

    for (const key of FACILITY_SESSION_KEYS) expect(secure.has(key)).toBe(false);
    for (const key of Object.values(CENTRAL_SECURE_KEYS)) expect(secure.has(key)).toBe(false);
    expect(getActiveOperatorServer()?.origin).toBe(FACILITY.origin);
    expect(screen.queryByRole('header', { name: TITLE, ...everything })).not.toBeOnTheScreen();
  });

  it('when the saved sign-in cannot be removed: an alert with OK, then the same screen with the button and the count kept', async () => {
    await offeredScreen();
    undeletable = key => key.startsWith('secure_central_');

    await user.press(screen.getByRole('button', { name: 'Sign in again' }));
    await wait(1_000); // the dialog takes presses a moment after it appears
    await user.press(screen.getAllByRole('button', { name: 'Sign in again' }).at(-1)!);
    await waitSteps(2_000);
    await wait(1_000);

    expect(screen.getByText("Couldn't start signing in again")).toBeOnTheScreen();
    expect(screen.getByText('Restart the phone, then tap Sign in again.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await wait();

    expect(screen.queryByText(/The saved sign-in and the data on this phone/, everything)).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: TITLE })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();
    expect(await triesLeft()).toBe(3);
    expect(getActiveOperatorServer()?.origin).toBe(FACILITY.origin);
  });
});
