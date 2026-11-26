/**
 * WH-346 items 2 and 3.
 *  - Only a request that got no answer is "no connection": an answer whose body cannot be read opens no offline start.
 *  - The offline-start settings (`offline_start_v1`) are erased at sign-out, forced sign-out and leaving the facility,
 *    and kept again by a sign-in on the same facility.
 *
 * Real: `verifySelectedOperator`, `discoverOperator`, the sign-in (`verifyOTP`), `logout`, `forceLogoutOnInvalidToken`,
 * `leaveFacility` with the app's store and session teardown. Faked: the network and native modules.
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
import { isOfflineStarted } from '@/config/offlineStart';
import { storeTokens, verifyOTP } from '@/config/supabaseConfig';
import { store } from '@/store';
import { leaveFacility } from '@/store/operatorSwitch';
import { forceLogoutOnInvalidToken, initializeAuth, logout } from '@/store/slices/authSlice';
import {
  ASHA, checkFacilityAgain, discoveryBody, json, jwt, leavePhone, server, signedInPhone, startWithNoConnection,
} from '@/tests/helpers/offlineRoleServer';

const flush = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
};
const kept = () => AsyncStorage.getItem('offline_start_v1');

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await signedInPhone();
});
afterEach(async () => {
  server.discovery = undefined;
  await store.dispatch(logout({ localOnly: true }));
  await flush();
  leavePhone();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const lostBody = () => new Error('fetch failed: java.net.SocketException: Connection reset');
/** An answer that began (status and headers) and whose body then cannot be read. */
const brokenBody = (status: number, read: () => Promise<never>) => {
  const response = { ...json({}, status), json: read, text: read } as unknown as Response;
  return Object.assign(response, { clone: () => response });
};
const never = () => new Promise<never>(() => {});

describe('an answer from the server is never "no connection"', () => {
  it.each([
    ['200', 200, lostBody()],
    ['426 ("update the app")', 426, lostBody()],
    ['503 (being updated)', 503, lostBody()],
    ['500', 500, lostBody()],
    ['200, with React Native\'s network TypeError', 200, new TypeError('Network request failed')],
    ['200, with an abort', 200, Object.assign(new Error('Aborted'), { name: 'AbortError' })],
  ])('status %s whose body fails opens no offline start', async (_name, status, failure) => {
    server.discovery = async () => brokenBody(status, async () => {
      throw failure;
    });
    const result = checkFacilityAgain().then(value => value.kind, () => 'failed');
    await flush();

    await expect(result).resolves.toBe('failed');
    expect(isOfflineStarted()).toBe(false);
  });

  it('a body that never arrives opens no offline start', async () => {
    server.discovery = async () => brokenBody(200, never);
    const result = checkFacilityAgain().then(value => value.kind, () => 'failed');
    await jest.advanceTimersByTimeAsync(15_000);

    await expect(result).resolves.toBe('failed');
    expect(isOfflineStarted()).toBe(false);
  });

  it('no answer at all still opens offline', async () => {
    server.discovery = async () => {
      throw lostBody();
    };

    await expect(checkFacilityAgain()).resolves.toMatchObject({ kind: 'offline' });
    expect(isOfflineStarted()).toBe(true);
  });

  it('no answer within 15 seconds still opens offline', async () => {
    server.discovery = () => never();
    const result = checkFacilityAgain().then(value => value.kind, () => 'failed');
    await jest.advanceTimersByTimeAsync(15_000);

    await expect(result).resolves.toBe('offline');
  });

  it('a readable answer is a verified start (control for the stand-in)', async () => {
    server.discovery = async () => json(discoveryBody());

    await expect(checkFacilityAgain()).resolves.toMatchObject({ kind: 'verified' });
  });
});

describe('the offline-start settings and the end of a session', () => {
  const endings: [string, () => Promise<unknown>][] = [
    ['sign-out', () => Promise.resolve(store.dispatch(logout()))],
    ['forced sign-out', () => Promise.resolve(store.dispatch(forceLogoutOnInvalidToken('Session ended')))],
    ['leaving the facility', () => leaveFacility(store.dispatch)],
  ];

  it.each(endings)('%s erases them', async (_name, end) => {
    expect(await kept()).toContain('instance-a');

    await end();
    await flush();

    expect(await kept()).toBeNull();
  });

  it.each(endings.slice(0, 2))('a sign-in on the same facility after %s keeps them again, and an offline start opens', async (_name, end) => {
    await end();
    await flush();
    expect(await kept()).toBeNull();

    await expect(verifyOTP('9000000001', '000000')).resolves.toMatchObject({ success: true });
    await flush();

    const record = JSON.parse((await kept())!) as { instanceId: string; config: Record<string, unknown> };
    expect(record.instanceId).toBe('instance-a');
    // The server's public settings only.
    expect((await kept())!).not.toMatch(/test-signature|user-asha|Asha|c{64}/);
    await startWithNoConnection();
    await store.dispatch(initializeAuth());
    await flush();
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
  });

  it('after leaving the facility, new credentials do not write them again', async () => {
    await expect(leaveFacility(store.dispatch)).resolves.toBe('left');
    await flush();

    await storeTokens(jwt('user-asha', 'session-later'), 'd'.repeat(64), Date.now() + 3600_000);
    await flush();

    expect(await kept()).toBeNull();
  });
});
