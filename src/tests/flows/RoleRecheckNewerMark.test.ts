/**
 * WH-358: writes held after an offline start are released only by a role re-read that began after the app last marked
 * the role as unconfirmed. The answer of an earlier re-read releases nothing and is not applied; the role is read again.
 *
 * Real: `verifySelectedOperator`, `initializeAuth` / `logout` with the app's store and session teardown, the token
 * store, the real supabase client with its gated fetch, `roleRecheck`, `offlineStart`. Faked: the network (`fetch`,
 * src/tests/helpers/offlineRoleServer.ts) and native modules. The mark is made through `markRoleUnconfirmed`, which
 * app/_layout.tsx calls when the app returns to the front offline.
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

import '@/tests/helpers/fakeTimersFirst';
import { isRoleUnconfirmed, markRoleUnconfirmed } from '@/config/offlineStart';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { store } from '@/store';
import { initializeAuth, logout } from '@/store/slices/authSlice';
import {
  ASHA, PROFILE_PATH, count, deferred, leavePhone, server, signedInPhone, startWithNoConnection,
} from '@/tests/helpers/offlineRoleServer';

const REFUSED = /identity verification required/i;
const WRITE_PATH = '/rest/v1/rpc/update_order_status';

const flush = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
};
const wait = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
  await flush();
};
const profileNow = () => store.getState().auth.userProfile;
const sentWrites = () => server.sent.filter(sent => sent.path === WRITE_PATH);

/** A save as a screen makes it; resolves with the client's error text, or null when it went out. */
const save = async () => {
  try {
    const client = await getAuthenticatedClient();
    const { error } = await client.rpc('update_order_status', { p_order_id: 'order-1' });
    return error ? String((error as { message?: string }).message) : null;
  } catch (error) {
    return String((error as Error).message);
  }
};

/** The app launched with no connection and restored Asha's session; the role has not been confirmed. */
async function openedOffline() {
  await startWithNoConnection();
  await store.dispatch(initializeAuth());
  await flush();
  expect(profileNow()).toMatchObject({ id: ASHA.id, role: 'staff' });
  expect(isRoleUnconfirmed()).toBe(true);
  server.sent = [];
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await signedInPhone();
});
afterEach(async () => {
  server.profileWait = undefined;
  await store.dispatch(logout({ localOnly: true }));
  await flush();
  leavePhone();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a role re-read that began before the latest unconfirmed mark', () => {
  it('releases no write and applies nothing; the role is read again, and that read releases it', async () => {
    await openedOffline();
    const first = deferred();
    const second = deferred();
    server.profileWait = first.promise;
    server.role = 'supervisor';
    server.up = true;

    let result: string | null | undefined;
    void save().then(value => { result = value; });
    await flush();
    const readsBefore = count(PROFILE_PATH);
    expect(readsBefore).toBeGreaterThan(0); // the first re-read is on the wire, unanswered

    // The app goes to the back and returns offline again: the role is marked once more while that read is out.
    server.profileWait = second.promise;
    markRoleUnconfirmed();
    first.open();
    await flush();

    expect(result).toBeUndefined();
    expect(sentWrites()).toHaveLength(0);
    expect(isRoleUnconfirmed()).toBe(true);
    expect(profileNow()?.role).toBe('staff'); // the earlier answer is not applied
    expect(count(PROFILE_PATH)).toBe(readsBefore + 1); // read again at once, after the mark

    second.open();
    await flush();

    expect(result).toBeNull();
    expect(sentWrites()).toHaveLength(1);
    expect(isRoleUnconfirmed()).toBe(false);
    expect(profileNow()?.role).toBe('supervisor');
  });

  it('with no newer mark, the first answer releases the write as before', async () => {
    await openedOffline();
    const first = deferred();
    server.profileWait = first.promise;
    server.up = true;

    let result: string | null | undefined;
    void save().then(value => { result = value; });
    await flush();
    first.open();
    await flush();

    expect(result).toBeNull();
    expect(sentWrites()).toHaveLength(1);
    expect(isRoleUnconfirmed()).toBe(false);
  });

  it('a second mark during the newer read outdates that one too', async () => {
    await openedOffline();
    const [first, second, third] = [deferred(), deferred(), deferred()];
    server.profileWait = first.promise;
    server.up = true;

    let result: string | null | undefined;
    void save().then(value => { result = value; });
    await flush();

    server.profileWait = second.promise;
    markRoleUnconfirmed();
    first.open();
    await flush();
    server.profileWait = third.promise;
    markRoleUnconfirmed();
    second.open();
    await flush();
    expect(result).toBeUndefined();
    expect(sentWrites()).toHaveLength(0);

    third.open();
    await flush();
    expect(result).toBeNull();
    expect(sentWrites()).toHaveLength(1);
  });

  it('when the read made again fails, the write is refused unsent and the read waits as any failed one does', async () => {
    await openedOffline();
    const first = deferred();
    server.profileWait = first.promise;
    server.up = true;

    let result: string | null | undefined;
    void save().then(value => { result = value; });
    await flush();
    const readsBefore = count(PROFILE_PATH);

    const second = deferred();
    server.profileWait = second.promise;
    markRoleUnconfirmed();
    first.open();
    await flush();
    expect(count(PROFILE_PATH)).toBe(readsBefore + 1); // read again at once
    server.profileFails = true;
    second.open();
    await flush();

    expect(result).toMatch(REFUSED);
    expect(sentWrites()).toHaveLength(0);
    expect(count(PROFILE_PATH)).toBe(readsBefore + 1); // no tight loop of reads
    expect(isRoleUnconfirmed()).toBe(true);

    server.profileWait = undefined;
    server.profileFails = false;
    await wait(5_000);
    expect(count(PROFILE_PATH)).toBe(readsBefore + 2); // the back-off read
    expect(isRoleUnconfirmed()).toBe(false);
    await expect(save()).resolves.toBeNull();
  });
});
