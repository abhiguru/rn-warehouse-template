/**
 * WH-357 and WH-360: a read of the phone's secure store that fails and then passes never signs anyone out, closes the
 * open app or erases anything. At the return to the front (offline, within the 30 days) and at a cold start (online and
 * offline) the read is tried again; only a store that stays unreadable ends in the load-error screen, with nothing
 * signed out or erased, and "Try again" opens the app once the store answers. A store that was read and holds no sign-in
 * is still a signed-out phone.
 *
 * Real: `RootLayout` (app/_layout.tsx) with the app's store, session restore, resume lifecycle, identity gate, facility
 * check, cached profile, supabase client, role re-read and `ConfigErrorScreen`. Faked: the network (`fetch`,
 * src/tests/helpers/offlineRoleServer.ts), the clock, `AppState`, native modules (the secure store among them, which
 * fails on request) and the router: one stand-in screen takes the stack's place.
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
import { initializeAuth, logout, setUserProfile } from '@/store/slices/authSlice';
import { askAlert, resetAlertQueueForTests, showAlert } from '@/utils/alert';
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


const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CONFIRMED = new Date('2026-03-01T06:00:00.000Z').getTime();
const PROFILE_KEY = 'cached_user_profile';
const TOKEN_KEY = 'secure_auth_token';
const everything = { includeHiddenElements: true } as const;
const LOAD_ERROR = "Couldn't load app settings";
// WH-362: the words when the saved sign-in stays unreadable; "Try again" is the only action.
const shownUnreadable = () => {
  expect(screen.getByRole('header', { name: "Couldn't start the app" })).toBeOnTheScreen();
  expect(screen.getByText("This phone couldn't read the app's saved sign-in. Nothing has been deleted. Try again. If it keeps happening, restart the phone.")).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Try starting the app again' })).toHaveTextContent('Try again');
  expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
  expect(screen.queryByText(/connection/i, everything)).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Change warehouse server|My facilities/, ...everything })).not.toBeOnTheScreen();
  expect(screen.queryByText('Sign in again', everything)).not.toBeOnTheScreen();
};
const AWAY_TITLE = 'Connect to continue';

let appState: ReturnType<typeof fakeAppState>;
let user: ReturnType<typeof userEvent.setup>;
let teardowns = 0;

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

/** The next `times` reads of `key` fail as the keystore does when it is busy; then the store answers again. */
function failReads(key: string, times: number) {
  let left = times;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async k => {
    if (k === key && left > 0) {
      left -= 1;
      throw new Error('Keystore not available');
    }
    return secure.get(k) ?? null;
  });
  return { restore: () => { left = 0; } };
}

async function phoneDate(time: number) {
  jest.setSystemTime(time);
  await act(async () => {
    await storeTokens(jwt('user-asha', 'session-user-asha', -60), 'a'.repeat(64), time - 60_000, getSessionGeneration(), { refresh: true });
  });
  await wait();
  server.sent = [];
}

/** The app launched with a connection, signed in, on its screens. */
async function openApp() {
  await render(<RootLayout />);
  await wait(5_000);
  expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
  expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id, role: 'staff' });
  jest.setSystemTime(CONFIRMED);
  await act(async () => { await cacheUserProfile({ ...ASHA, role: 'staff' }); });
  server.sent = [];
}

/** A cold start: the phone holds the session, nothing is in memory (the store is fresh after each test's sign-out). */
async function coldStart({ online }: { online: boolean }) {
  invalidateStoredTokenCache(); // a new process holds no copy of the session
  server.up = online;
  await render(<RootLayout />);
}

const resumeOffline = async () => {
  server.up = false;
  await act(async () => { appState.setAppState('background'); });
  await act(async () => { appState.setAppState('active'); });
  await wait();
};

const noSignOut = (before: Map<string, string>, generation: number) => {
  expect(getSessionGeneration()).toBe(generation);
  expect(teardowns).toBe(0);
  expect(new Map(secure)).toEqual(before);
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
  teardowns = 0;
  registerSessionScoped('wh357-probe', () => { teardowns += 1; });
});
afterEach(async () => {
  server.profileWait = undefined;
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

describe('back at the front with no connection, within the limit (WH-357)', () => {
  it.each([
    ['the token', 1, TOKEN_KEY],
    ['the token', 3, TOKEN_KEY],
    ['the kept profile', 1, PROFILE_KEY],
    ['the kept profile', 3, PROFILE_KEY],
  ])('%s unread %i time(s) and then read: the screens stay and nothing is signed out or erased', async (_what, times, key) => {
    await openApp();
    await user.type(screen.getByLabelText('Remarks'), '40 bags of fictional potatoes');
    await phoneDate(CONFIRMED + DAY);
    const before = new Map(secure);
    const generation = getSessionGeneration();
    failReads(key, times);

    await resumeOffline();
    await wait(10_000);

    expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
    expect(screen.getByLabelText('Remarks')).toHaveDisplayValue('40 bags of fictional potatoes');
    expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
    expect(screen.queryByText(AWAY_TITLE, everything)).not.toBeOnTheScreen();
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
    expect(getSessionGeneration()).toBe(generation);
    expect(teardowns).toBe(0);
    // Only the time seen may have moved on the kept profile.
    const kept = new Map(secure);
    kept.set(PROFILE_KEY, before.get(PROFILE_KEY)!);
    expect(kept).toEqual(before);
  });

  it.each([
    ['the token', TOKEN_KEY],
    ['the kept profile', PROFILE_KEY],
  ])('%s that stays unreadable closes to the load-error screen, and nothing is signed out or erased', async (_what, key) => {
    await openApp();
    await phoneDate(CONFIRMED + DAY);
    const before = new Map(secure);
    const generation = getSessionGeneration();
    failReads(key, Infinity);

    await resumeOffline();
    await wait(10_000);

    shownUnreadable();
    expect(screen.queryByText('New goods receipt', everything)).not.toBeOnTheScreen();
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
    noSignOut(before, generation);
  });

  it('the retries wait 0.25, 0.75 and 2 seconds: the screens stay until the last read has failed', async () => {
    await openApp();
    await phoneDate(CONFIRMED + DAY);
    failReads(TOKEN_KEY, Infinity);

    await resumeOffline();
    await wait(2_900);
    expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
    await wait(3_000);
    expect(screen.queryByText('New goods receipt', everything)).not.toBeOnTheScreen();
  });
});

describe('a cold start (WH-360)', () => {
  describe.each([
    ['with a connection', true],
    ['with no connection', false],
  ])('%s', (_label, online) => {
    it.each([
      ['the token', 1, TOKEN_KEY],
      ['the token', 3, TOKEN_KEY],
      ['the kept profile', 1, PROFILE_KEY],
      ['the kept profile', 3, PROFILE_KEY],
    ])('%s unread %i time(s) and then read: the person is signed in', async (_what, times, key) => {
      const before = new Map(secure);
      failReads(key, times);

      await coldStart({ online });
      await waitSteps(15_000);

      expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
      expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
      expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id, role: 'staff' });
      expect(new Set(secure.keys())).toEqual(new Set(before.keys()));
    });

    it.each([
      ['the token', TOKEN_KEY],
      ['the kept profile', PROFILE_KEY],
    ])('%s that stays unreadable shows the load-error screen; nothing is signed out or erased; Try again opens the app once it answers', async (_what, key) => {
      const before = new Map(secure);
      const generation = getSessionGeneration();
      const fault = failReads(key, Infinity);

      await coldStart({ online });
      await waitSteps(15_000);

      shownUnreadable();
      expect(screen.queryByText('New goods receipt', everything)).not.toBeOnTheScreen();
      expect(store.getState().auth.userProfile).toBeNull();
      expect(store.getState().auth.session).toBeNull();
      noSignOut(before, generation);

      fault.restore();
      await user.press(screen.getByRole('button', { name: 'Try starting the app again' }));
      await waitSteps(15_000);

      expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
      expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
    });
  });

  it('a store that was read and holds no sign-in is a signed-out phone, not a load error', async () => {
    secure.delete(TOKEN_KEY);
    secure.delete('secure_refresh_token');
    secure.delete('secure_token_expires');

    await coldStart({ online: true });
    await waitSteps(15_000);

    expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
    expect(store.getState().auth.userProfile).toBeNull();
  });
});

describe('a session restore run again while the person is signed in (WH-360)', () => {
  it('a store that stays unreadable leaves the signed-in person signed in, with the copy and the session kept', async () => {
    await openApp();
    const before = new Map(secure);
    const generation = getSessionGeneration();
    failReads(TOKEN_KEY, Infinity);
    invalidateStoredTokenCache();

    let outcome: { meta: { requestStatus: string } } | undefined;
    await act(async () => { void store.dispatch(initializeAuth()).then(value => { outcome = value; }); });
    await waitSteps(10_000);

    expect(outcome?.meta.requestStatus).toBe('rejected');
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id, role: 'staff' });
    noSignOut(before, generation);
  });
});
