/**
 * WH-353: after the open app comes back to the front with no connection, no change or new record is sent on reconnect
 * until the person's role and customer assignments have been read again, with the retries of WH-346. Reading is not
 * affected.
 *
 * Real: `RootLayout` (app/_layout.tsx), which installs the hold, with the app's store, session restore, resume
 * lifecycle, identity gate, facility check, cached profile, supabase client and role re-read. Faked: the network
 * (`fetch`, src/tests/helpers/offlineRoleServer.ts), the clock, `AppState`, native modules (secure store among them),
 * the phone copy (SQLite) and the router: one stand-in screen takes the stack's place.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import '@/tests/helpers/fakeTimersFirst';
import RootLayout from '../../../app/_layout';
import { clearOfflineStarted } from '@/config/offlineStart';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { getAuthenticatedClient, storeTokens, verifyOTP } from '@/config/supabaseConfig';
import { store } from '@/store';
import { leaveFacility } from '@/store/operatorSwitch';
import { logout, setUserProfile } from '@/store/slices/authSlice';
import { resetAlertQueueForTests } from '@/utils/alert';
import { fakeAppState } from '@/tests/helpers/fakeRoute';
import {
  ASHA, CUSTOMERS_PATH, PROFILE_PATH, REFRESH_PATH, count, deferred, jwt, leavePhone, paths, server, signedInPhone,
} from '@/tests/helpers/offlineRoleServer';

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
  const { Text } = require('react-native');
  const Stack = () => React.createElement(Text, null, 'New goods receipt');
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

const REFUSED = /identity verification required/i;

let appState: ReturnType<typeof fakeAppState>;

const wait = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
  });
};

/** The app launched with a connection, signed in, on its screens. */
async function openApp() {
  await render(<RootLayout />);
  await wait(5_000); // the development build's splash wait
  expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
  expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id, role: 'staff' });
  server.sent = [];
}

/** The app goes to the background and is brought to the front again. */
async function resume() {
  await act(async () => { appState.setAppState('background'); });
  await act(async () => { appState.setAppState('active'); });
  await wait();
}

/** Back at the front with no connection (the app stays open), then the connection returns. Nothing has asked yet. */
async function returnedOfflineThenReconnected() {
  server.up = false;
  await resume();
  expect(screen.getByText('New goods receipt')).toBeOnTheScreen();
  server.up = true;
  server.sent = [];
}

type Failure = { message?: string; context?: { message?: string }; originalError?: { message?: string } };
const failureText = (error: unknown): string | null => {
  if (!error) return null;
  const failure = error as Failure;
  return [failure.message, failure.context?.message, failure.originalError?.message].filter(Boolean).join(' | ');
};
type Client = Awaited<ReturnType<typeof getAuthenticatedClient>>;

/** Starts a request and records how it ended, without waiting for it. */
async function start(call: (client: Client) => PromiseLike<{ error: unknown }>) {
  const seen: { done: boolean; error?: string | null } = { done: false };
  await act(async () => {
    void (async () => {
      try {
        seen.error = failureText((await call(await getAuthenticatedClient())).error);
      } catch (error) {
        seen.error = failureText(error);
      }
      seen.done = true;
    })();
  });
  await wait();
  return seen;
}

const SAVE_PATH = '/rest/v1/rpc/update_order_status';
const save = () => start(client => client.rpc('update_order_status', { p_order_id: 'order-1' }));
const readList = () => start(client => client.from('items').select('id'));

const WRITES: [string, string, string, (client: Client) => PromiseLike<{ error: unknown }>][] = [
  ['an RPC that saves', 'POST', SAVE_PATH, client => client.rpc('update_order_status', { p_order_id: 'order-1' })],
  ['a new record', 'POST', '/rest/v1/customers', client => client.from('customers').insert({ name: 'Fictional Traders' })],
  ['a change', 'PATCH', '/rest/v1/items', client => client.from('items').update({ name: 'Fictional Item' }).eq('id', 'item-1')],
  ['a delete', 'DELETE', '/rest/v1/orders', client => client.from('orders').delete().eq('id', 'order-1')],
  ['a photo upload', 'POST', '/storage/v1/object/grn-images/grn-1/photo.webp',
    client => client.storage.from('grn-images').upload('grn-1/photo.webp', new ArrayBuffer(4), { contentType: 'image/webp' })],
  ['an edge function call', 'POST', '/functions/v1/send-order-notification',
    client => client.functions.invoke('send-order-notification', { body: {} })],
];

const sentTo = (path: string, method = 'POST') => server.sent.filter(sent => sent.path === path && sent.method === method);

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  appState = fakeAppState();
  // The phone is in front when the app starts.
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  resetAlertQueueForTests();
  await signedInPhone();
});
afterEach(async () => {
  server.profileWait = undefined;
  await act(async () => {
    await store.dispatch(logout({ localOnly: true }));
    store.dispatch(setUserProfile(null));
  });
  clearOfflineStarted();
  await wait(2 * 60_000);
  resetAlertQueueForTests();
  leavePhone();
  appState.restore();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('back at the front with no connection, then reconnected', () => {
  it.each(WRITES)('%s waits for the role and assignments to be read again, then goes out once', async (_name, method, path, call) => {
    await openApp();
    await returnedOfflineThenReconnected();
    const answer = deferred();
    server.profileWait = answer.promise;

    const result = await start(call);
    expect(count(PROFILE_PATH)).toBe(1); // the re-read is on the wire, unanswered
    expect(sentTo(path, method)).toHaveLength(0);
    expect(result.done).toBe(false);

    server.profileWait = undefined;
    answer.open();
    await wait();

    expect(result).toEqual({ done: true, error: null });
    expect(sentTo(path, method)).toHaveLength(1);
    const order = paths();
    expect(order.indexOf(`GET ${PROFILE_PATH}`)).toBeLessThan(order.indexOf(`${method} ${path}`));
    expect(order.indexOf(`POST ${CUSTOMERS_PATH}`)).toBeGreaterThan(-1);
    expect(order.indexOf(`POST ${CUSTOMERS_PATH}`)).toBeLessThan(order.indexOf(`${method} ${path}`));
  });

  it('a lowered role and new assignments are applied before the change reaches the server', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    server.role = 'customer';
    server.customers = ['customer-9'];
    const seen: unknown[] = [];
    server.onSend = sent => {
      if (sent.path === SAVE_PATH) seen.push(store.getState().auth.userProfile);
    };

    await save();

    expect(seen).toEqual([expect.objectContaining({ role: 'customer', assignedCustomerIds: ['customer-9'] })]);
  });

  it('the first server answer to a list re-reads the role with nothing waiting to be saved', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    server.role = 'supervisor';

    const list = await readList();

    expect(list).toEqual({ done: true, error: null });
    expect(count(CUSTOMERS_PATH)).toBe(1);
    expect(store.getState().auth.userProfile?.role).toBe('supervisor');
  });

  it('assignments that cannot be read refuse the change unsent', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    server.customersFail = true;

    const result = await save();

    expect(result.error).toMatch(REFUSED);
    expect(sentTo(SAVE_PATH)).toHaveLength(0);
  });

  it('a failed re-read is repeated after 5, 15, 30 and then 60 seconds, and nothing is sent until it succeeds', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    server.profileFails = true;
    await readList(); // the server's first answer: the re-read is asked at once and the waits start over
    expect(count(PROFILE_PATH)).toBe(1);

    let reads = 1;
    for (const seconds of [5, 15, 30, 60, 60]) {
      await wait(seconds * 1000 - 100);
      expect(count(PROFILE_PATH)).toBe(reads);
      await wait(100);
      reads += 1;
      expect(count(PROFILE_PATH)).toBe(reads);
    }
    const refused = await save();
    expect(refused.error).toMatch(REFUSED);
    expect(sentTo(SAVE_PATH)).toHaveLength(0);

    server.profileFails = false;
    server.role = 'supervisor';
    await wait(60_000);
    expect(store.getState().auth.userProfile?.role).toBe('supervisor'); // with nothing the person did
    expect(sentTo(SAVE_PATH)).toHaveLength(0); // the refused change is not sent afterwards
    const after = count(PROFILE_PATH);
    await wait(10 * 60_000);
    expect(count(PROFILE_PATH)).toBe(after);
    await expect(save()).resolves.toEqual({ done: true, error: null });
    expect(sentTo(SAVE_PATH)).toHaveLength(1);
  });

  it('lists load while changes are held, and sign-out reaches the server', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    server.profileFails = true;
    expect((await save()).error).toMatch(REFUSED);

    await expect(readList()).resolves.toEqual({ done: true, error: null });
    expect(sentTo('/rest/v1/items', 'GET')).toHaveLength(1);

    await act(async () => { await store.dispatch(logout()); });
    await wait();
    expect(paths()).toContain('POST /rest/v1/rpc/logout_session');
  });

  it('with the access token expired while away: it is renewed, the role read, then the change sent', async () => {
    await openApp();
    await act(async () => {
      await storeTokens(jwt('user-asha', 'session-user-asha', -60), 'a'.repeat(64), Date.now() - 60_000, getSessionGeneration(), { refresh: true });
    });
    await returnedOfflineThenReconnected();

    const result = await save();

    expect(result).toEqual({ done: true, error: null });
    const order = paths();
    expect(order.indexOf(`POST ${REFRESH_PATH}`)).toBeGreaterThan(-1);
    expect(order.indexOf(`POST ${REFRESH_PATH}`)).toBeLessThan(order.indexOf(`GET ${PROFILE_PATH}`));
    expect(order.indexOf(`POST ${CUSTOMERS_PATH}`)).toBeLessThan(order.indexOf(`POST ${SAVE_PATH}`));
  });

  it('a second offline return, after the role was confirmed once, holds changes again', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    await expect(save()).resolves.toEqual({ done: true, error: null });

    await returnedOfflineThenReconnected();
    server.profileFails = true;

    expect((await save()).error).toMatch(REFUSED);
    expect(sentTo(SAVE_PATH)).toHaveLength(0);
  });

  it('a second offline return while changes are still held keeps them held', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    server.profileFails = true;
    expect((await save()).error).toMatch(REFUSED);

    await returnedOfflineThenReconnected();

    expect((await save()).error).toMatch(REFUSED);
    expect(sentTo(SAVE_PATH)).toHaveLength(0);
    server.profileFails = false;
    await expect(save()).resolves.toEqual({ done: true, error: null });
    expect(sentTo(SAVE_PATH)).toHaveLength(1);
  });
});

describe('a return to the front with a connection', () => {
  it('holds nothing: a change goes out without the role being read', async () => {
    await openApp();
    server.profileFails = true;
    await resume();
    server.sent = [];

    await expect(save()).resolves.toEqual({ done: true, error: null });

    expect(sentTo(SAVE_PATH)).toHaveLength(1);
    expect(count(PROFILE_PATH)).toBe(0);
  });
});

describe('the session changes while a change is held after an offline return', () => {
  const changes: [string, () => Promise<void>][] = [
    ['sign-out', async () => {
      await store.dispatch(logout());
    }],
    ['a sign-in by another person', async () => {
      server.subject = 'user-ravi';
      const held = server.profileWait;
      server.profileWait = undefined;
      await expect(verifyOTP('9000000002', '000000')).resolves.toMatchObject({ success: true });
      server.profileWait = held;
    }],
    ['leaving the facility', async () => {
      await expect(leaveFacility(store.dispatch)).resolves.toBe('left');
    }],
  ];

  it.each(changes)('%s: the held change is never sent and the old re-read stops', async (_name, change) => {
    await openApp();
    await returnedOfflineThenReconnected();
    const answer = deferred();
    server.profileWait = answer.promise;
    const generation = getSessionGeneration();
    const result = await save();
    expect(count(PROFILE_PATH)).toBe(1);
    expect(sentTo(SAVE_PATH)).toHaveLength(0);

    await act(async () => { await change(); });
    expect(getSessionGeneration()).not.toBe(generation);
    server.profileWait = undefined;
    answer.open();
    await wait();
    server.sent = server.sent.filter(sent => sent.path !== PROFILE_PATH);
    await wait(10 * 60_000);

    expect(result.done).toBe(true);
    expect(result.error).toMatch(/session changed/i);
    expect(sentTo(SAVE_PATH)).toHaveLength(0);
    expect(count(PROFILE_PATH)).toBe(0);
  });

  it('after another person signs in, their change goes out at once under their own token', async () => {
    await openApp();
    await returnedOfflineThenReconnected();
    server.profileFails = true;
    expect((await save()).error).toMatch(REFUSED);
    server.subject = 'user-ravi';
    await act(async () => {
      await expect(verifyOTP('9000000002', '000000')).resolves.toMatchObject({ success: true });
    });
    await wait();
    server.sent = [];

    await expect(save()).resolves.toEqual({ done: true, error: null });

    const claims = JSON.parse(atob(sentTo(SAVE_PATH)[0]!.bearer.split('.')[1]!)) as { sub: string };
    expect(claims.sub).toBe('user-ravi');
  });
});
