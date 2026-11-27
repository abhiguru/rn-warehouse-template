/**
 * WH-306 (written before the build), contract product/tech/app-offline-customer-accounts.md section 8 and PQ5, Product's
 * 2026-11-26 note: the 30-day offline limit (WH-349, WH-351) covers customer accounts, and a customer account at a server too
 * old for the customer copy gets no offline start at all.
 *
 * Real: the same pieces as OfflineStartProfileLimit.test.ts (launch, session restore, token store, cached profile).
 * Faked: the network (`fetch`, src/tests/helpers/offlineRoleServer.ts), the phone's clock and secure store.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - Customer accounts open from the kept profile within 30 days, as staff do, and are refused at exactly 30 days, with no
 *    stored time, or with the clock set back more than 5 minutes (the staff rules, unchanged).
 *  - Too old a server (contract 15, item 4): the kept public config's `schemaHead` below `INTRODUCED_BY_MIGRATION.customerCopy`
 *    (exported by `@/config/backendFeatures`), or with none, gives a customer account no offline start. A warehouse role is not
 *    affected. `customerCopy`'s number is provisional until assembly; the test reads it from the table.
 *  - Too old: the start is refused as for a role with no copy (`'not opened'`), and it is NOT the 30-day screen: no
 *    past-limit mark is raised, even when the kept profile is past 30 days (PQ5: "no offline start and no 30-day screen").
 * ==================================
 */
jest.mock('react-redux', () => ({ useDispatch: jest.fn(), useSelector: jest.fn(), useStore: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('@/config/sentryConfig', () => ({
  setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), addBreadcrumb: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(async () => ({ type: 'wifi', isConnected: true, isInternetReachable: true, details: null })),
    refresh: jest.fn(async () => ({})),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import '@/tests/helpers/fakeTimersFirst';
import { clearOfflineStarted, markOfflineStarted } from '@/config/offlineStart';
import { operatorResumeGate } from '@/config/operatorResume';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { invalidateStoredTokenCache, storeTokens } from '@/config/supabaseConfig';
import { store } from '@/store';
import { initializeAuth, logout, setUserProfile } from '@/store/slices/authSlice';
import { ASHA, checkFacilityAgain, jwt, leavePhone, secure, server, signedInPhone } from '@/tests/helpers/offlineRoleServer';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LIMIT = 30 * DAY;
const CONFIRMED = new Date('2026-03-01T06:00:00.000Z').getTime();
const START_KEY = 'offline_start_v1';

const flush = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
};
const shownProfile = () => store.getState().auth.userProfile;
const clockAt = (time: number) => jest.setSystemTime(time);
const tokenExpired = () => storeTokens(jwt('user-asha', 'session-user-asha', -60), 'a'.repeat(64), Date.now() - MINUTE, getSessionGeneration(), { refresh: true });

/** The release the facility told at the last online check, kept with its public config: at, or one below, the customer copy's migration. */
async function serverRelease(which: 'current' | 'older') {
  const { INTRODUCED_BY_MIGRATION } = require('@/config/backendFeatures') as { INTRODUCED_BY_MIGRATION?: { customerCopy?: number } };
  const number = INTRODUCED_BY_MIGRATION?.customerCopy;
  expect(number).toEqual(expect.any(Number));
  const head = `${String((which === 'current' ? number : (number as number) - 1)).padStart(14, '0')}_customer_account_copy`;
  const kept = JSON.parse((await AsyncStorage.getItem(START_KEY)) as string);
  kept.config.schemaHead = head;
  await AsyncStorage.setItem(START_KEY, JSON.stringify(kept));
}

const killApp = () => {
  store.dispatch(setUserProfile(null));
  clearOfflineStarted();
  invalidateStoredTokenCache();
};
async function launchOffline(): Promise<'opened as the customer' | 'opened signed out' | 'not opened'> {
  killApp();
  server.up = false;
  let kind: string;
  try {
    kind = (await checkFacilityAgain()).kind;
  } catch (error) {
    expect((error as Error).message).toContain('fetch failed');
    return 'not opened';
  }
  expect(kind).toBe('offline');
  operatorResumeGate.suspend();
  await store.dispatch(initializeAuth());
  await flush();
  return shownProfile()?.id === ASHA.id ? 'opened as the customer' : 'opened signed out';
}

/** A launch with a connection: the server's profile for this person (its role) is read and kept; then the token expires. */
async function openOnlineAs(role: 'customer' | 'staff') {
  server.role = role;
  killApp();
  server.up = true;
  expect((await checkFacilityAgain()).kind).toBe('verified');
  await store.dispatch(initializeAuth());
  await flush();
  expect(shownProfile()).toMatchObject({ role });
  await tokenExpired();
}

beforeEach(async () => {
  jest.useFakeTimers({ now: CONFIRMED });
  for (const level of ['log', 'info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => {});
  await signedInPhone();
  server.role = 'customer';
  server.customers = ['customer-1'];
  await openOnlineAs('customer');
  await serverRelease('current');
});
afterEach(async () => {
  await store.dispatch(logout({ localOnly: true }));
  await flush();
  leavePhone();
  jest.useRealTimers();
  jest.restoreAllMocks();
  secure.clear();
});

describe('a customer account, launched with no connection (the staff limit of WH-349)', () => {
  it.each([
    ['25 hours', 25 * HOUR],
    ['29 days', 29 * DAY],
    ['one millisecond short of 30 days', LIMIT - 1],
  ])('%s later it opens from the kept profile, as the customer', async (_label, away) => {
    clockAt(CONFIRMED + away);
    await expect(launchOffline()).resolves.toBe('opened as the customer');
    expect(shownProfile()).toMatchObject({ role: 'customer' });
  });

  it.each([
    ['exactly 30 days', LIMIT],
    ['31 days', 31 * DAY],
  ])('%s later it does not open, and the kept profile is not erased', async (_label, away) => {
    clockAt(CONFIRMED + away);
    await expect(launchOffline()).resolves.toBe('not opened');
    expect(shownProfile()).toBeNull();
    expect(secure.has('cached_user_profile')).toBe(true);
  });

  it('past 30 days it is the 30-day screen that is raised (the limit is marked), not a plain refusal', async () => {
    const offlineStart = require('@/config/offlineStart') as { markPastOfflineLimit: (e: unknown) => void };
    const marked = jest.spyOn(offlineStart, 'markPastOfflineLimit');
    clockAt(CONFIRMED + 31 * DAY);
    await expect(launchOffline()).resolves.toBe('not opened');
    expect(marked).toHaveBeenCalledTimes(1);
  });

  it('the clock set back by more than 5 minutes does not open it', async () => {
    clockAt(CONFIRMED - 5 * MINUTE - 1);
    await expect(launchOffline()).resolves.toBe('not opened');
  });

  it('past 30 days the session restore gives no profile either', async () => {
    clockAt(CONFIRMED + 31 * DAY);
    await expect(launchOffline()).resolves.toBe('not opened');
    markOfflineStarted();
    await store.dispatch(initializeAuth());
    await flush();
    expect(shownProfile()).toBeNull();
  });
});

describe('PQ5: a server too old for the customer copy', () => {
  it('within 30 days: no offline start for a customer account', async () => {
    await serverRelease('older');
    clockAt(CONFIRMED + DAY);
    await expect(launchOffline()).resolves.toBe('not opened');
  });

  it('past 30 days: still no offline start, and no 30-day screen (nothing is marked past the limit)', async () => {
    await serverRelease('older');
    clockAt(CONFIRMED + 40 * DAY);
    const limit = require('@/config/offlineStart') as { markPastOfflineLimit: (e: unknown) => void };
    const marked = jest.spyOn(limit, 'markPastOfflineLimit');
    await expect(launchOffline()).resolves.toBe('not opened');
    expect(marked).not.toHaveBeenCalled();
  });

  it('a customer account at a server with the customer copy opens as above', async () => {
    await serverRelease('current');
    clockAt(CONFIRMED + DAY);
    await expect(launchOffline()).resolves.toBe('opened as the customer');
  });

  it('staff at the same older server open as today (the rule is for customer accounts)', async () => {
    await openOnlineAs('staff');
    await serverRelease('older');
    clockAt(CONFIRMED + DAY);
    await expect(launchOffline()).resolves.toBe('opened as the customer');
    expect(shownProfile()).toMatchObject({ role: 'staff' });
  });
});
