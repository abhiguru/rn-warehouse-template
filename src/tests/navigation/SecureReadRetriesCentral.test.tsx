/**
 * WH-361 item 2: at the start of the app with central login on, a secure store that does not answer for the central
 * session is read again (250 / 750 / 2000 ms) before anything is decided. Still unread with no facility session, the
 * load-error screen takes the place of central sign-in, and nothing is erased; with a facility session the app opens as
 * before. A store that was read and holds no central session still means signed out.
 *
 * Real: `RootLayout` (app/_layout.tsx) with the app's store, session restore, the central session restore
 * (src/config/centralSession.ts), facility check, supabase client and `ConfigErrorScreen`. Faked: the network (`fetch`,
 * src/tests/helpers/offlineRoleServer.ts), the clock, `AppState`, native modules (the secure store fails on request),
 * the central build setting, and the router: one stand-in screen takes the stack's place.
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

const CONFIRMED = new Date('2026-03-01T06:00:00.000Z').getTime();
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
const FACILITY_SESSION_KEYS = ['secure_auth_token', 'secure_refresh_token', 'secure_token_expires', 'cached_user_profile'];
const everything = { includeHiddenElements: true } as const;

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

/** The next `times` reads of a key the app keeps for central sign-in fail; then the store answers again. */
function failCentralReads(times: number) {
  let left = times;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
    if (key.startsWith('secure_central_') && left > 0) {
      left -= 1;
      throw new Error('Keystore not available');
    }
    return secure.get(key) ?? null;
  });
  return { restore: () => { left = 0; } };
}

/** The phone holds no facility session: only central sign-in could say who this is. */
function noFacilitySession() {
  for (const key of FACILITY_SESSION_KEYS) secure.delete(key);
  invalidateStoredTokenCache();
}

async function coldStart() {
  invalidateStoredTokenCache(); // a new process holds no copy of the session
  await render(<RootLayout />);
}

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
  registerSessionScoped('wh361-probe', () => { teardowns += 1; });
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

describe('the central session at the start of the app (WH-361)', () => {
  it('with a facility session, a central store that stays unreadable changes nothing: the app opens as before', async () => {
    const before = new Map(secure);
    failCentralReads(Infinity);

    await coldStart();
    await waitSteps(15_000);

    expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
    expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
    expect(new Set(secure.keys())).toEqual(new Set(before.keys()));
  });

  it('with no facility session, a central store that stays unreadable shows the load-error screen, not the app; nothing is erased', async () => {
    noFacilitySession();
    const before = new Map(secure);
    const generation = getSessionGeneration();
    const fault = failCentralReads(Infinity);

    await coldStart();
    await waitSteps(15_000);

    shownUnreadable();
    expect(screen.queryByText('New goods receipt', everything)).not.toBeOnTheScreen();
    expect(getSessionGeneration()).toBe(generation);
    expect(teardowns).toBe(0);
    expect(new Map(secure)).toEqual(before);

    fault.restore();
    await user.press(screen.getByRole('button', { name: 'Try starting the app again' }));
    await waitSteps(15_000);
    expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
    expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
  });

  it.each([1, 3])('with no facility session, a central store unread %i time(s) and then read opens the app with no load error', async times => {
    noFacilitySession();
    failCentralReads(times);

    await coldStart();
    await waitSteps(15_000);

    expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
    expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
  });

  it('the start waits for the retries: the screens are not opened until the last read has failed', async () => {
    noFacilitySession();
    failCentralReads(Infinity);

    await coldStart();
    await waitSteps(5_000); // the development build's splash wait; the reads began with it
    expect(screen.queryByText(LOAD_ERROR, everything)).not.toBeOnTheScreen();
    expect(screen.queryByText('New goods receipt', everything)).not.toBeOnTheScreen();
    await waitSteps(10_000);
    shownUnreadable();
  });
});
