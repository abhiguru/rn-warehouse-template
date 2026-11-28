/**
 * WH-350: the 30-day offline limit of WH-349 also applies when the open app comes back to the front with no answer from
 * the server. Past it, the open screens, sheets and dialogs give way to the screen a start shows then; nothing is signed
 * out or erased.
 *
 * Real: `RootLayout` (app/_layout.tsx) with the app's store, session restore, resume lifecycle, identity gate, facility
 * check, cached profile, supabase client, role re-read, `ConfigErrorScreen` and `AlertHost`. Faked: the network
 * (`fetch`, src/tests/helpers/offlineRoleServer.ts), the clock, `AppState`, native modules (secure store among them), the
 * phone copy (SQLite) and the router: one stand-in screen with a form, a sheet and a dialog takes the stack's place.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import '@/tests/helpers/fakeTimersFirst';
import RootLayout from '../../../app/_layout';
import { beginNativeHandoff } from '@/config/nativeHandoff';
import { clearOfflineStarted, onRoleUnconfirmed } from '@/config/offlineStart';
import { operatorResumeGate } from '@/config/operatorResume';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { setFacilityCapabilities } from '@/config/facilityCapabilities';
import { cacheUserProfile, getAuthenticatedClient, storeTokens } from '@/config/supabaseConfig';
import { store } from '@/store';
import { logout, setUserProfile } from '@/store/slices/authSlice';
import { askAlert, resetAlertQueueForTests, showAlert } from '@/utils/alert';
import { fakeAppState } from '@/tests/helpers/fakeRoute';
import {
  ASHA, FACILITY, PROFILE_PATH, REFRESH_PATH, count, deferred, json, jwt, leavePhone, noAnswer, paths, secure, server,
  signedInPhone,
} from '@/tests/helpers/offlineRoleServer';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import * as SecureStore from 'expo-secure-store';

// The real React bindings: the package's React Native entry is ESM, which Jest cannot load, so its CommonJS build.
jest.mock('react-redux', () => jest.requireActual('../../../node_modules/react-redux/dist/cjs/index.js'));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('@/config/sentryConfig', () => ({
  initializeSentry: jest.fn(), setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(),
  captureMessage: jest.fn(), addBreadcrumb: jest.fn(), Sentry: { wrap: (c: unknown) => c },
}));
// NetInfo's change events, which a test sends with `netChange` (WH-354).
let mockNetListeners: ((state: unknown) => void)[] = [];
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addEventListener: jest.fn((listener: (state: unknown) => void) => {
      mockNetListeners.push(listener);
      return () => { mockNetListeners = mockNetListeners.filter(item => item !== listener); };
    }),
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
const LIMIT = 30 * DAY;
const SKEW = 5 * 60_000;
const CONFIRMED = new Date('2026-03-01T06:00:00.000Z').getTime();
const PROFILE_KEY = 'cached_user_profile';
const WRITE_PATH = '/rest/v1/rpc/update_order_status';
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
const entry = () => JSON.parse(secure.get(PROFILE_KEY)!) as Record<string, unknown>;

/** The phone's date is set. The stored access token is past its expiry by then (same person, same session). */
async function phoneDate(time: number) {
  jest.setSystemTime(time);
  await act(async () => {
    await storeTokens(jwt('user-asha', 'session-user-asha', -60), 'a'.repeat(64), time - 60_000, getSessionGeneration(), { refresh: true });
  });
  await wait();
  server.sent = [];
}

/** The app launched with a connection, signed in, on its screens. */
async function openApp(role = 'staff') {
  if (role !== 'staff') {
    server.role = role;
    await cacheUserProfile({ ...ASHA, role });
  }
  await render(<RootLayout />);
  await wait(5_000); // the development build's splash wait
  expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
  expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id, role });
  // The splash took a few seconds: the server's answer for the person is put at CONFIRMED, for exact boundaries.
  jest.setSystemTime(CONFIRMED);
  await act(async () => { await cacheUserProfile({ ...ASHA, role }); });
  expect(entry()).toMatchObject({ confirmedAt: CONFIRMED, seenAt: CONFIRMED });
  server.sent = [];
}

const goBack = async () => {
  await act(async () => { appState.setAppState('background'); });
};
const goFront = async () => {
  await act(async () => { appState.setAppState('active'); });
  await wait();
};
/** The app goes to the background and is brought to the front again. */
const resume = async () => {
  await goBack();
  await goFront();
};
const resumeOffline = async () => {
  server.up = false;
  await resume();
};

// The words past the offline limit (WH-351, design/offline-capture.md Part 11). Today's title stays for other causes.
const AWAY_TITLE = 'Connect to continue';
const AWAY_MESSAGE =
  'This phone hasn\'t connected to your cold storage for over 30 days. Connect to the internet to sign in again.';
const shownOnScreen = () => {
  expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
  expect(screen.queryByText(AWAY_TITLE, everything)).not.toBeOnTheScreen();
  expect(screen.queryByText('Couldn\'t load app settings', everything)).not.toBeOnTheScreen();
};
const shownClosed = () => {
  expect(screen.getByRole('header', { name: AWAY_TITLE })).toBeOnTheScreen();
  // The whole text: nothing on the phone counts as unsent yet, so no sentence about kept entries follows.
  expect(screen.getByText(AWAY_MESSAGE)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Try connecting again' })).toHaveTextContent('Try again');
  expect(screen.getByText('Try again')).toBeOnTheScreen();
  expect(screen.queryByText('Couldn\'t load app settings', everything)).not.toBeOnTheScreen();
  expect(screen.queryByText('New goods receipt', everything)).not.toBeOnTheScreen();
};
const tryAgain = async () => {
  await user.press(screen.getByText('Try again'));
  await wait(5_000);
};

/** A read as a list makes it: it waits for the facility check when that is still owed. */
async function readList() {
  const client = await getAuthenticatedClient();
  return client.from('items').select('*');
}
async function save() {
  const client = await getAuthenticatedClient();
  return client.rpc('update_order_status', { p_order_id: 'order-1' });
}

beforeEach(async () => {
  jest.useFakeTimers({ now: CONFIRMED });
  user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  appState = fakeAppState();
  // The phone is in front when the app starts.
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  resetAlertQueueForTests();
  await signedInPhone();
  teardowns = 0;
  registerSessionScoped('wh350-probe', () => { teardowns += 1; });
});
afterEach(async () => {
  server.profileWait = undefined;
  server.discovery = undefined;
  resetFacilityRelease();
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

describe('back at the front past the limit, with no connection', () => {
  it.each(['admin', 'supervisor', 'staff'])('a %s account: the form, the sheet and the dialogs close to the start screen', async role => {
    await openApp(role);
    await user.type(screen.getByLabelText('Remarks'), '40 bags of fictional potatoes');
    await user.press(screen.getByRole('button', { name: 'Choose item' }));
    const discard = jest.fn();
    let answer: string | undefined;
    await act(async () => {
      showAlert('Receipt 17', 'For Fictional Traders', [{ text: 'Keep' }, { text: 'Discard', onPress: discard }]);
      showAlert('Saved earlier', 'Receipt 16 for Fictional Traders');
      void askAlert('Replace the item?', undefined, [{ text: 'Replace', value: 'replace' }], 'dismissed').then(value => {
        answer = value;
      });
    });
    expect(screen.getByText('Item sheet')).toBeOnTheScreen();
    expect(screen.getByText('For Fictional Traders')).toBeOnTheScreen();

    await phoneDate(CONFIRMED + 31 * DAY);
    await resumeOffline();

    shownClosed();
    expect(screen.queryByText('Item sheet', everything)).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Remarks', everything)).not.toBeOnTheScreen();
    expect(screen.queryByText(/Fictional Traders/, everything)).not.toBeOnTheScreen();
    expect(screen.queryByText('Replace the item?', everything)).not.toBeOnTheScreen();
    expect(discard).not.toHaveBeenCalled();
    expect(answer).toBe('dismissed');
  });

  it('nothing is signed out or erased, and nothing but the facility check is sent', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    const secureBefore = new Map(secure);
    const generation = getSessionGeneration();

    await resumeOffline();
    await wait(60_000);

    shownClosed();
    expect(getSessionGeneration()).toBe(generation);
    expect(teardowns).toBe(0);
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
    expect(new Set(paths())).toEqual(new Set(['GET /functions/v1/get-public-config']));
    // The copy, the sign-in and the offline settings are as they were; only the time seen moved.
    expect(entry()).toEqual({ ...JSON.parse(secureBefore.get(PROFILE_KEY)!), seenAt: expect.any(Number) });
    expect(new Map(secure).set(PROFILE_KEY, secureBefore.get(PROFILE_KEY)!)).toEqual(secureBefore);
  });

  it.each([
    ['exactly 30 days after the confirmation', CONFIRMED + LIMIT],
    ['with the date 5 minutes and a millisecond behind the confirmation', CONFIRMED - SKEW - 1],
    ['with the date set back a day', CONFIRMED - DAY],
  ])('it closes %s', async (_label, date) => {
    await openApp();
    await phoneDate(date);

    await resumeOffline();

    shownClosed();
  });

  it('it closes when the kept profile has no stored time', async () => {
    await openApp();
    const { profile, scope } = entry();
    secure.set(PROFILE_KEY, JSON.stringify({ profile, scope }));

    await resumeOffline();

    shownClosed();
  });

  it('it closes when the date was set back behind a time an earlier return saw', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 10 * DAY);
    await resumeOffline();
    shownOnScreen();

    await phoneDate(CONFIRMED + 2 * DAY);
    await resume();

    shownClosed();
  });

  it('screens stay while the check waits, and close when it has had no answer for 15 seconds', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    server.discovery = () => new Promise<Response>(() => {});
    await resume();

    await wait(14_000);
    shownOnScreen();
    await wait(1_000);
    shownClosed();
  });

  it('a request that runs the owed facility check closes it too, with no second return to the front', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 29 * DAY);
    await resumeOffline();
    shownOnScreen();
    jest.setSystemTime(CONFIRMED + 31 * DAY);
    server.sent = [];

    let outcome: unknown;
    await act(async () => {
      void readList().then(value => { outcome = value.error; }, error => { outcome = error; });
    });
    await wait(60_000);

    shownClosed();
    expect(outcome).toBeTruthy();
    expect(count('/rest/v1/items')).toBe(0);
  });

  it('going to the back and front again leaves the one closed screen', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    await resumeOffline();

    await resume();
    await resume();

    shownClosed();
    expect(screen.getAllByText('Try again', everything)).toHaveLength(1);
    expect(teardowns).toBe(0);
  });
});

describe('back at the front where nothing is to change', () => {
  const halfDone = async () => {
    await user.type(screen.getByLabelText('Remarks'), '40 bags');
    await user.press(screen.getByRole('button', { name: 'Choose item' }));
    await act(async () => { showAlert('Receipt 17', 'Not saved yet'); });
  };
  const stillThere = () => {
    shownOnScreen();
    expect(screen.getByLabelText('Remarks', everything)).toHaveDisplayValue('40 bags');
    expect(screen.getByText('Item sheet')).toBeOnTheScreen();
    expect(screen.getByText('Not saved yet')).toBeOnTheScreen();
  };

  it.each([
    ['10 days', CONFIRMED + 10 * DAY],
    ['one millisecond short of 30 days', CONFIRMED + LIMIT - 1],
    ['the date exactly 5 minutes behind', CONFIRMED - SKEW],
  ])('with no connection, within the limit (%s): the form, sheet and dialog stay', async (_label, date) => {
    await openApp();
    await halfDone();
    await phoneDate(date);

    await resumeOffline();

    stillThere();
  });

  it('with a connection, 31 days on: the screens stay, as today', async () => {
    await openApp();
    await halfDone();
    await phoneDate(CONFIRMED + 31 * DAY);

    await resume();
    await wait(5_000);

    expect(operatorResumeGate.isVerified()).toBe(true);
    stillThere();
  });

  it.each([
    ['503, being updated', 503],
    ['500', 500],
  ])('the server answering %s is a connection: past the limit the screens stay', async (_label, status) => {
    await openApp();
    await halfDone();
    await phoneDate(CONFIRMED + 31 * DAY);
    server.discovery = async () => json({ success: false }, status);

    await resume();
    await wait(5_000);

    stillThere();
  });

  /** The release the facility last told: the customer copy's migration (from the table), or the one before it, or none. */
  const releaseOf = (which: 'current' | 'older' | 'none') => {
    const { INTRODUCED_BY_MIGRATION } = require('@/config/backendFeatures') as { INTRODUCED_BY_MIGRATION?: { customerCopy?: number } };
    const number = INTRODUCED_BY_MIGRATION?.customerCopy;
    expect(number).toEqual(expect.any(Number));
    const schemaHead = which === 'none' ? null : `${String(which === 'current' ? number : (number as number) - 1).padStart(14, '0')}_customer_account_copy`;
    setFacilityRelease(FACILITY, { schemaHead });
  };

  it('a customer account at a server with the customer copy, past the limit, is closed onto the start screen (Product 2026-11-26)', async () => {
    await openApp('customer');
    releaseOf('current');
    await halfDone();
    await phoneDate(CONFIRMED + 31 * DAY);

    await resumeOffline();

    shownClosed();
  });

  it.each(['older', 'none'] as const)('a customer account at a server with %s release (no customer copy, PQ5), past the limit, keeps its screens', async which => {
    await openApp('customer');
    releaseOf(which);
    await halfDone();
    await phoneDate(CONFIRMED + 31 * DAY);

    await resumeOffline();

    stillThere();
  });

  it('a facility without the offline feature keeps its screens past the limit', async () => {
    server.sync = false;
    await openApp();
    await halfDone();
    await phoneDate(CONFIRMED + 31 * DAY);

    await resumeOffline();

    stillThere();
  });
});

describe('a late or superseded check does nothing', () => {
  it('a lost answer that arrives after a newer return was verified closes nothing', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    const late = deferred();
    server.discovery = async () => {
      await late.promise;
      throw noAnswer();
    };
    await resume();
    server.discovery = undefined;
    await resume();
    expect(operatorResumeGate.isVerified()).toBe(true);

    await act(async () => { late.open(); });
    await wait();

    shownOnScreen();
  });

  it('a check overtaken by going to the back again closes nothing; the next one does', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    const late = deferred();
    server.discovery = async () => {
      await late.promise;
      throw noAnswer();
    };
    await resume();
    await goBack();

    await act(async () => { late.open(); });
    await wait();
    shownOnScreen();

    server.discovery = undefined;
    server.up = false;
    await goFront();
    shownClosed();
  });

  /** The first read of the kept profile from now on is answered only when the test says so. */
  const slowProfileRead = () => {
    const slow = deferred();
    const state = { reading: false, open: slow.open };
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
      if (key === PROFILE_KEY && !state.reading) {
        state.reading = true;
        await slow.promise;
      }
      return secure.get(key) ?? null;
    });
    return state;
  };

  it('going to the back again while the kept profile is read closes nothing', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    const slow = slowProfileRead();
    await resumeOffline();
    expect(slow.reading).toBe(true);

    await goBack();
    await act(async () => { slow.open(); });
    await wait();

    shownOnScreen();
  });

  it('a sign-in that replaces the session while the kept profile is read closes nothing', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    const slow = slowProfileRead();
    await resumeOffline();
    expect(slow.reading).toBe(true);

    await act(async () => {
      await storeTokens(jwt('user-asha', 'session-new'), 'e'.repeat(64), Date.now() + HOUR);
    });
    await act(async () => { slow.open(); });
    await wait();

    shownOnScreen();
  });
});

describe('"Try again" on the closed screen', () => {
  const closed = async (date = CONFIRMED + 31 * DAY) => {
    await openApp();
    await user.type(screen.getByLabelText('Remarks'), '40 bags');
    await phoneDate(date);
    await resumeOffline();
    shownClosed();
  };

  it('with no connection, past the limit: the screen stays', async () => {
    await closed();

    await tryAgain();

    shownClosed();
    expect(teardowns).toBe(0);
  });

  it('with no connection, after the date was only set back: putting it right opens the app again', async () => {
    await closed(CONFIRMED - DAY);
    await phoneDate(CONFIRMED + HOUR);

    await tryAgain();

    shownOnScreen();
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
  });

  it('with no connection, a date once set 31 days ahead and then put right stays closed', async () => {
    await closed();
    await phoneDate(CONFIRMED + HOUR);

    await tryAgain();

    shownClosed();
  });

  it('with a connection, 31 days on: the session is renewed, the app opens and the 30 days start again', async () => {
    await closed();
    server.up = true;

    await tryAgain();

    shownOnScreen();
    expect(count(REFRESH_PATH)).toBeGreaterThan(0);
    expect(entry().confirmedAt).toBeGreaterThanOrEqual(CONFIRMED + 31 * DAY);
    expect(teardowns).toBe(0);
  });

  it('with a connection and the session refused: the person is signed out and the copy erased', async () => {
    await closed();
    server.up = true;
    server.refreshRefused = true;

    await tryAgain();

    expect(store.getState().auth.userProfile).toBeNull();
    expect(secure.has(PROFILE_KEY)).toBe(false);
  });

  it('after reopening, nothing is written until the role has been read again, and a changed role applies', async () => {
    // The date was set ahead by mistake and put right: the copy is under a day old, so the app opens from it.
    await closed();
    jest.setSystemTime(CONFIRMED + HOUR);
    await act(async () => {
      await storeTokens(jwt('user-asha', 'session-user-asha'), 'a'.repeat(64), Date.now() + HOUR, getSessionGeneration(), { refresh: true });
    });
    const answer = deferred();
    server.profileWait = answer.promise;
    server.role = 'supervisor';
    server.up = true;
    server.sent = [];
    await tryAgain();
    shownOnScreen();

    let result: { error: unknown } | undefined;
    await act(async () => { void save().then(value => { result = value; }); });
    await wait();
    expect(count(PROFILE_PATH)).toBeGreaterThan(0); // the re-read is on the wire, unanswered
    expect(count(WRITE_PATH)).toBe(0);

    await act(async () => { answer.open(); });
    await wait();

    expect(result).toMatchObject({ error: null });
    expect(count(WRITE_PATH)).toBe(1);
    expect(store.getState().auth.userProfile).toMatchObject({ role: 'supervisor' });
  });
});

// WH-354: the same limit, with the app kept in front or away only inside the grace window (10 minutes).
describe('with no connection while the app stays in front', () => {
  /** The phone's connection changes: NetInfo tells the app, and the server answers (or not). */
  const netChange = async (connected: boolean) => {
    server.up = connected;
    await act(async () => {
      mockNetListeners.forEach(listener =>
        listener({ type: connected ? 'wifi' : 'none', isConnected: connected, isInternetReachable: connected, details: null }));
    });
    await wait();
  };
  const MINUTE = 60_000;

  it('going offline past the limit closes to the start screen with no return to the front, and reads the phone only', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    shownOnScreen();
    server.sent = [];

    await netChange(false);

    shownClosed();
    // The expired access token's own renewal may be tried; the check itself reads the phone only: no profile read, no facility check.
    expect(paths().filter(path => !path.endsWith(REFRESH_PATH))).toEqual([]);
  });

  it('going offline within the limit changes nothing, now or at the next check', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 10 * DAY);

    await netChange(false);
    await wait(16 * MINUTE);

    shownOnScreen();
  });

  it('crossing the limit while offline closes at the next 15-minute check, not before', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 10 * DAY);
    await netChange(false);
    shownOnScreen();

    jest.setSystemTime(CONFIRMED + 31 * DAY);
    await wait(14 * MINUTE);
    shownOnScreen();
    await wait(MINUTE);

    shownClosed();
  });

  it('a brief stay (a camera or picker round trip), offline, past the limit: closes on return', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 10 * DAY);
    await netChange(false);
    shownOnScreen();

    expect(operatorResumeGate.isVerified()).toBe(true);
    const endHandoff = beginNativeHandoff();
    jest.setSystemTime(CONFIRMED + 31 * DAY); // while in front: the date moves, no check is due yet
    await goBack();
    await wait(MINUTE);
    await goFront();
    endHandoff();

    shownClosed();
  });

  it('a brief stay (a camera or picker round trip), offline, within the limit: the screens stay', async () => {
    await openApp();
    await user.type(screen.getByLabelText('Remarks'), '40 bags');
    await phoneDate(CONFIRMED + 10 * DAY);
    await netChange(false);

    const endHandoff = beginNativeHandoff();
    await goBack();
    await wait(MINUTE);
    await goFront();
    endHandoff();

    shownOnScreen();
    expect(screen.getByLabelText('Remarks', everything)).toHaveDisplayValue('40 bags');
  });

  it('online, past the limit: the screens stay and nothing is closed by the check', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);

    await wait(16 * MINUTE);
    await goBack();
    await wait(MINUTE);
    await goFront();

    shownOnScreen();
  });

  it('coming back online stops the check: the screens stay as the date passes the limit', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 10 * DAY);
    await netChange(false);
    await netChange(true);

    jest.setSystemTime(CONFIRMED + 31 * DAY);
    await wait(16 * MINUTE);

    shownOnScreen();
  });
});

// WH-389: with the offline feature off the app behaves as before it: the limit and the clock check close nothing and hold no write.
describe('a facility without the offline feature (WH-389)', () => {
  const netGone = async () => {
    server.up = false;
    await act(async () => {
      mockNetListeners.forEach(listener => listener({ type: 'none', isConnected: false, isInternetReachable: false, details: null }));
    });
    await wait();
  };
  let marked: jest.Mock;
  let stop: () => void;
  beforeEach(() => {
    server.sync = false;
    marked = jest.fn();
    stop = onRoleUnconfirmed(marked);
  });
  afterEach(() => { stop(); });

  it.each([
    ['31 days on', CONFIRMED + 31 * DAY],
    ['with the date set back a day', CONFIRMED - DAY],
  ])('in front and offline, %s: the screens stay through the 15-minute check and a brief stay away, and writes are not held', async (_label, date) => {
    await openApp();
    await phoneDate(date);

    await netGone();
    await wait(16 * 60_000);
    const endHandoff = beginNativeHandoff();
    await goBack();
    await wait(60_000);
    await goFront();
    endHandoff();

    shownOnScreen();
    expect(marked).not.toHaveBeenCalled();
  });

  it('back at the front past the limit: the screens stay and writes are not held', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);

    await resumeOffline();

    shownOnScreen();
    expect(marked).not.toHaveBeenCalled();
  });

  it('the feature turned on while offline past the limit starts the check, which closes', async () => {
    await openApp();
    await phoneDate(CONFIRMED + 31 * DAY);
    await netGone();
    shownOnScreen();

    await act(async () => { setFacilityCapabilities(FACILITY, { sync: true }); });
    await wait();

    shownClosed();
    expect(marked).toHaveBeenCalled();
  });
});
