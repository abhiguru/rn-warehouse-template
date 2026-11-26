/**
 * WH-349: a phone that was signed in opens with no connection for up to 30 days since the server last confirmed that
 * person. Past that, or when the time away cannot be told, it does not open, and nothing kept on the phone is erased.
 *
 * Real: `verifySelectedOperator` (the launch), `initializeAuth` / `logout` with the app's store and session teardown, the
 * token store, the cached profile, the supabase client with its gated fetch, `roleRecheck`. Faked: the network (`fetch`,
 * src/tests/helpers/offlineRoleServer.ts), the phone's clock and native modules (secure store among them).
 */
// React bindings of the store: nothing here renders, and the package ships as ESM.
jest.mock('react-redux', () => ({ useDispatch: jest.fn(), useSelector: jest.fn(), useStore: jest.fn() }));
jest.mock('expo-constants',() => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
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
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import {
  getAuthenticatedClient,
  getCachedUserProfile,
  invalidateStoredTokenCache,
  refreshCustomJWT,
  storeTokens,
} from '@/config/supabaseConfig';
import { store } from '@/store';
import { initializeAuth, logout, setUserProfile } from '@/store/slices/authSlice';
import {
  ASHA, PROFILE_PATH, REFRESH_PATH, checkFacilityAgain, count, deferred, jwt, leavePhone, paths, secure, server,
  signedInPhone,
} from '@/tests/helpers/offlineRoleServer';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LIMIT = 30 * DAY;
const SKEW = 5 * MINUTE;
/** When the server confirmed Asha: the moment of every `beforeEach`. */
const CONFIRMED = new Date('2026-03-01T06:00:00.000Z').getTime();
const PROFILE_KEY = 'cached_user_profile';

type Entry = { profile: { id: string; role: string }; cachedAt?: unknown; confirmedAt?: unknown; seenAt?: unknown; scope: string };

const flush = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
};
const entry = () => JSON.parse(secure.get(PROFILE_KEY)!) as Entry;
const changeEntry = (change: Partial<Entry> | ((kept: Entry) => unknown)) => {
  const kept = entry();
  secure.set(PROFILE_KEY, JSON.stringify(typeof change === 'function' ? change(kept) : { ...kept, ...change }));
};
const shownProfile = () => store.getState().auth.userProfile;

/** The phone's clock reads this. */
const clockAt = (time: number) => jest.setSystemTime(time);

type TokenState = 'live' | 'expired';
/** The stored access token as it stands at the phone's present time. The server is not asked. */
const tokenIs = (state: TokenState) =>
  storeTokens(
    jwt('user-asha', 'session-user-asha', state === 'live' ? 3600 : -60),
    'a'.repeat(64),
    Date.now() + (state === 'live' ? HOUR : -MINUTE),
    getSessionGeneration(),
    { refresh: true }
  );

/** The app was closed: what only lives in memory is gone, the phone's storage stays. */
const killApp = () => {
  store.dispatch(setUserProfile(null));
  clearOfflineStarted();
  invalidateStoredTokenCache();
};

/**
 * Force-stop and launch with the network off, as app/_layout.tsx does it: the facility check, then, only when that
 * opens the app, the session restore. Answers who the app opened as, or why it did not open.
 */
async function launchOffline(): Promise<'opened as Asha' | 'opened signed out' | 'not opened'> {
  killApp();
  server.up = false;
  let kind: string;
  try {
    kind = (await checkFacilityAgain()).kind;
  } catch (error) {
    // Only the lost connection itself may be why: anything else is a broken test.
    expect((error as Error).message).toContain('fetch failed');
    return 'not opened';
  }
  expect(kind).toBe('offline');
  operatorResumeGate.suspend();
  await store.dispatch(initializeAuth());
  await flush();
  return shownProfile()?.id === ASHA.id ? 'opened as Asha' : 'opened signed out';
}

/** Launch with a connection, as app/_layout.tsx does it. */
async function launchOnline() {
  killApp();
  server.up = true;
  expect((await checkFacilityAgain()).kind).toBe('verified');
  await store.dispatch(initializeAuth());
  await flush();
}

let teardowns = 0;

beforeEach(async () => {
  jest.useFakeTimers({ now: CONFIRMED });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await signedInPhone();
  // Counts the session teardowns: what erases the phone copy and the unsent work.
  teardowns = 0;
  registerSessionScoped('wh349-probe', () => {
    teardowns += 1;
  });
});
afterEach(async () => {
  server.profileWait = undefined;
  await store.dispatch(logout({ localOnly: true }));
  await flush();
  leavePhone();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a launch with no connection, by the time since the server confirmed the person', () => {
  it('the profile kept at sign-in carries the time of that confirmation', () => {
    expect(entry()).toMatchObject({ cachedAt: CONFIRMED, confirmedAt: CONFIRMED, seenAt: CONFIRMED });
  });

  describe.each<TokenState>(['live', 'expired'])('with a %s access token', token => {
    it.each([
      ['25 hours', 25 * HOUR],
      ['29 days', 29 * DAY],
      ['one millisecond short of 30 days', LIMIT - 1],
    ])('%s later it opens signed in, from the kept profile', async (_label, away) => {
      clockAt(CONFIRMED + away);
      await tokenIs(token);

      await expect(launchOffline()).resolves.toBe('opened as Asha');
      expect(shownProfile()).toMatchObject({ id: ASHA.id, role: 'staff', assignedCustomerIds: ['customer-1'] });
    });

    it.each([
      ['exactly 30 days', LIMIT],
      ['31 days', 31 * DAY],
      ['89 days', 89 * DAY],
    ])('%s later it does not open', async (_label, away) => {
      clockAt(CONFIRMED + away);
      await tokenIs(token);

      await expect(launchOffline()).resolves.toBe('not opened');
      expect(shownProfile()).toBeNull();
    });

    it('past 30 days the session restore itself gives no profile', async () => {
      clockAt(CONFIRMED + 31 * DAY);
      await tokenIs(token);
      // The launch had no answer; the restore is asked directly, as a screen that restores again would.
      await expect(launchOffline()).resolves.toBe('not opened');
      markOfflineStarted();
      await store.dispatch(initializeAuth());
      await flush();

      expect(shownProfile()).toBeNull();
      expect(secure.has(PROFILE_KEY)).toBe(true);
    });
  });

  it('opening offline day after day does not move the limit: only the server confirms', async () => {
    for (const day of [10, 20, 29]) {
      clockAt(CONFIRMED + day * DAY);
      await tokenIs('expired');
      await expect(launchOffline()).resolves.toBe('opened as Asha');
      expect(entry()).toMatchObject({ confirmedAt: CONFIRMED, cachedAt: CONFIRMED, seenAt: Date.now() });
    }

    clockAt(CONFIRMED + LIMIT);
    await expect(launchOffline()).resolves.toBe('not opened');
  });

  it('a profile kept for another session of this person opens nothing', async () => {
    changeEntry(kept => ({ ...kept, scope: kept.scope.replace('session-user-asha', 'session-earlier') }));
    clockAt(CONFIRMED + 2 * DAY);

    await expect(launchOffline()).resolves.toBe('not opened');
  });
});

describe('the phone clock set back', () => {
  it.each([
    ['exactly 5 minutes behind the confirmation', -SKEW, 'opened as Asha'],
    ['5 minutes and one millisecond behind it', -SKEW - 1, 'not opened'],
    ['a day behind it', -DAY, 'not opened'],
  ] as const)('%s: %s', async (_label, offset, expected) => {
    clockAt(CONFIRMED + offset);
    await tokenIs('expired');

    await expect(launchOffline()).resolves.toBe(expected);
  });

  it.each([
    ['exactly 5 minutes behind the last time the app saw', -SKEW, 'opened as Asha'],
    ['5 minutes and one millisecond behind it', -SKEW - 1, 'not opened'],
    ['back to the second day', -8 * DAY, 'not opened'],
  ] as const)('after an offline start on day 10, %s: %s', async (_label, offset, expected) => {
    clockAt(CONFIRMED + 10 * DAY);
    await tokenIs('expired');
    await expect(launchOffline()).resolves.toBe('opened as Asha');

    clockAt(CONFIRMED + 10 * DAY + offset);
    await expect(launchOffline()).resolves.toBe(expected);
  });

  it('small steps back never add up: the latest time seen is kept, not the last one', async () => {
    clockAt(CONFIRMED + DAY);
    await expect(launchOffline()).resolves.toBe('opened as Asha');
    clockAt(CONFIRMED + DAY - 4 * MINUTE);
    await expect(launchOffline()).resolves.toBe('opened as Asha');
    expect(entry().seenAt).toBe(CONFIRMED + DAY);

    clockAt(CONFIRMED + DAY - 8 * MINUTE);
    await expect(launchOffline()).resolves.toBe('not opened');
  });

  it('after a start refused at 31 days, setting the clock back to day 10 does not open the app', async () => {
    clockAt(CONFIRMED + 31 * DAY);
    await tokenIs('expired');
    await expect(launchOffline()).resolves.toBe('not opened');
    expect(entry()).toMatchObject({ confirmedAt: CONFIRMED, seenAt: CONFIRMED + 31 * DAY });

    clockAt(CONFIRMED + 10 * DAY);
    await expect(launchOffline()).resolves.toBe('not opened');
  });

  it('after a start refused for a clock set back, putting the clock right opens the app again', async () => {
    clockAt(CONFIRMED - DAY);
    await expect(launchOffline()).resolves.toBe('not opened');
    expect(entry()).toMatchObject({ confirmedAt: CONFIRMED, seenAt: CONFIRMED });

    clockAt(CONFIRMED + HOUR);
    await expect(launchOffline()).resolves.toBe('opened as Asha');
  });
});

describe('a copy kept before the confirmation time was', () => {
  const oldEntry = () => changeEntry(({ profile, cachedAt, scope }) => ({ profile, cachedAt, scope }));

  it.each([
    [29 * DAY, 'opened as Asha'],
    [31 * DAY, 'not opened'],
  ] as const)('is aged from when it was written (%d ms later: %s)', async (away, expected) => {
    oldEntry();
    clockAt(CONFIRMED + away);
    await tokenIs('expired');

    await expect(launchOffline()).resolves.toBe(expected);
    expect(entry().confirmedAt).toBeUndefined();
    expect(entry().seenAt).toBe(CONFIRMED + away);
  });

  it('notices a clock set back behind it', async () => {
    oldEntry();
    clockAt(CONFIRMED - DAY);

    await expect(launchOffline()).resolves.toBe('not opened');
  });
});

describe('when the time away cannot be told, the limit counts as passed', () => {
  it.each<[string, (kept: Entry) => unknown]>([
    ['no stored time at all', ({ profile, scope }) => ({ profile, scope })],
    ['a confirmation time that is text', kept => ({ ...kept, confirmedAt: '2026-03-01' })],
    ['a confirmation time of zero', kept => ({ ...kept, confirmedAt: 0 })],
    ['a negative confirmation time', kept => ({ ...kept, confirmedAt: -1 })],
    ['an old copy whose written time is text', ({ profile, scope }) => ({ profile, scope, cachedAt: 'yesterday' })],
    ['a last-seen time that is text', kept => ({ ...kept, seenAt: 'later' })],
  ])('%s: a launch an hour later does not open, and the copy is kept', async (_label, damage) => {
    changeEntry(damage);
    clockAt(CONFIRMED + HOUR);

    await expect(launchOffline()).resolves.toBe('not opened');
    // Refused again: the first read did not repair what it could not tell.
    await expect(launchOffline()).resolves.toBe('not opened');
    expect(entry().profile).toMatchObject({ id: ASHA.id });
  });
});

describe('what a refused start leaves on the phone', () => {
  it('signs nothing out and erases nothing, and sends nothing but the facility check', async () => {
    await AsyncStorage.setItem('unsent_entry_probe', 'a saved entry not sent yet');
    clockAt(CONFIRMED + 31 * DAY);
    await tokenIs('expired');
    await flush();
    const secureBefore = new Map(secure);
    const storedBefore = await AsyncStorage.multiGet([...(await AsyncStorage.getAllKeys())].sort());
    const generation = getSessionGeneration();
    server.sent = [];

    await expect(launchOffline()).resolves.toBe('not opened');
    await flush();

    expect(getSessionGeneration()).toBe(generation);
    expect(teardowns).toBe(0);
    expect(paths()).toEqual(['GET /functions/v1/get-public-config']);
    // Only the time seen moved.
    expect(entry()).toEqual({ ...JSON.parse(secureBefore.get(PROFILE_KEY)!), seenAt: CONFIRMED + 31 * DAY });
    expect(new Map(secure).set(PROFILE_KEY, secureBefore.get(PROFILE_KEY)!)).toEqual(secureBefore);
    await expect(AsyncStorage.multiGet([...(await AsyncStorage.getAllKeys())].sort())).resolves.toEqual(storedBefore);
  });

  it('with the connection back and the session accepted, it opens and the 30 days start again', async () => {
    clockAt(CONFIRMED + 31 * DAY);
    await tokenIs('expired');
    await expect(launchOffline()).resolves.toBe('not opened');

    await launchOnline();

    expect(shownProfile()).toMatchObject({ id: ASHA.id });
    expect(entry().confirmedAt).toBe(CONFIRMED + 31 * DAY);
    clockAt(CONFIRMED + 31 * DAY + LIMIT - 1);
    await expect(launchOffline()).resolves.toBe('opened as Asha');
  });

  it('with the connection back and the session refused, the person is signed out and the copy erased', async () => {
    clockAt(CONFIRMED + 31 * DAY);
    await tokenIs('expired');
    await expect(launchOffline()).resolves.toBe('not opened');

    server.refreshRefused = true;
    await launchOnline();

    expect(shownProfile()).toBeNull();
    expect(secure.has(PROFILE_KEY)).toBe(false);
    expect(teardowns).toBeGreaterThan(0);
  });
});

describe('what confirms the person', () => {
  it('a renewed session moves the confirmation and the time seen, not the age of the profile', async () => {
    clockAt(CONFIRMED + 20 * DAY);
    await tokenIs('expired');
    const profileBefore = entry().profile;

    await expect(refreshCustomJWT()).resolves.not.toBeNull();
    await flush();

    expect(entry()).toMatchObject({ cachedAt: CONFIRMED, confirmedAt: CONFIRMED + 20 * DAY, seenAt: CONFIRMED + 20 * DAY });
    expect(entry().profile).toEqual(profileBefore);
    expect(count(PROFILE_PATH)).toBe(0);

    // 49 days after the profile was read, 29 after the renewal.
    clockAt(CONFIRMED + 49 * DAY);
    await tokenIs('expired');
    await expect(launchOffline()).resolves.toBe('opened as Asha');
    clockAt(CONFIRMED + 50 * DAY);
    await expect(launchOffline()).resolves.toBe('not opened');
  });

  it('a renewal with no answer confirms nothing', async () => {
    clockAt(CONFIRMED + 20 * DAY);
    await tokenIs('expired');
    server.up = false;

    const renewal = refreshCustomJWT();
    await jest.advanceTimersByTimeAsync(60_000);
    await expect(renewal).resolves.toBeNull();

    expect(entry().confirmedAt).toBe(CONFIRMED);
  });

  it('a renewal does not confirm a copy that belongs to another session', async () => {
    changeEntry(kept => ({ ...kept, scope: kept.scope.replace('session-user-asha', 'session-earlier') }));
    clockAt(CONFIRMED + 20 * DAY);
    await tokenIs('expired');

    await expect(refreshCustomJWT()).resolves.not.toBeNull();
    await flush();

    expect(entry().confirmedAt).toBe(CONFIRMED);
  });

  it('a profile read from the server after 24 hours confirms the person again', async () => {
    clockAt(CONFIRMED + 25 * HOUR);
    await tokenIs('live');
    server.sent = [];

    await launchOnline();

    expect(count(PROFILE_PATH)).toBeGreaterThan(0);
    expect(count(REFRESH_PATH)).toBe(0);
    expect(entry()).toMatchObject({ cachedAt: Date.now(), confirmedAt: Date.now(), seenAt: Date.now() });
  });

  it('online, over 24 hours old, a reload that fails keeps the copy, and the next offline launch opens from it', async () => {
    clockAt(CONFIRMED + 25 * HOUR);
    await tokenIs('live');
    server.profileFails = true;

    await launchOnline();

    expect(shownProfile()).toBeNull();
    expect(count(PROFILE_PATH)).toBeGreaterThan(0);
    expect(entry()).toMatchObject({ cachedAt: CONFIRMED, confirmedAt: CONFIRMED });
    await expect(launchOffline()).resolves.toBe('opened as Asha');
  });

  it('online, a reload that gets no answer keeps the copy', async () => {
    clockAt(CONFIRMED + 25 * HOUR);
    await tokenIs('live');
    server.up = false;

    const read = getCachedUserProfile();
    await jest.advanceTimersByTimeAsync(60_000);

    await expect(read).resolves.toBeNull();
    expect(entry()).toMatchObject({ confirmedAt: CONFIRMED });
  });

  it('the answer "no active profile" removes the copy: nothing opens offline afterwards', async () => {
    clockAt(CONFIRMED + 25 * HOUR);
    await tokenIs('live');
    server.profileMissing = true;

    await launchOnline();

    expect(shownProfile()).toBeNull();
    expect(secure.has(PROFILE_KEY)).toBe(false);
    await expect(launchOffline()).resolves.toBe('not opened');
  });

  it('"no active profile" on the re-read after an offline start removes the copy too', async () => {
    await expect(launchOffline()).resolves.toBe('opened as Asha');
    server.profileMissing = true;
    server.up = true;

    await operatorResumeGate.ensureVerified();
    await flush();

    expect(secure.has(PROFILE_KEY)).toBe(false);
    await expect(launchOffline()).resolves.toBe('not opened');
  });
});

describe('an offline start from an older copy holds writes until the role is read again', () => {
  const save = async () => {
    const client = await getAuthenticatedClient();
    return client.rpc('update_order_status', { p_order_id: 'order-1' });
  };
  const WRITE_PATH = '/rest/v1/rpc/update_order_status';

  it.each<[TokenState, string, number]>([
    ['live', '25 hours', 25 * HOUR],
    ['expired', '25 hours', 25 * HOUR],
    ['live', '29 days', 29 * DAY],
    ['expired', '29 days', 29 * DAY],
  ])('with a %s token %s later', async (token, _label, away) => {
    clockAt(CONFIRMED + away);
    await tokenIs(token);
    await expect(launchOffline()).resolves.toBe('opened as Asha');
    const answer = deferred();
    server.profileWait = answer.promise;
    server.up = true;
    server.sent = [];

    const result = save().then(value => value.error);
    await flush();
    expect(count(PROFILE_PATH)).toBeGreaterThan(0); // the re-read is on the wire, unanswered
    expect(count(WRITE_PATH)).toBe(0);

    answer.open();
    await flush();
    await expect(result).resolves.toBeNull();
    expect(count(WRITE_PATH)).toBe(1);
    expect(entry().confirmedAt).toBe(Date.now());
  });
});
