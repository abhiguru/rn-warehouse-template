// Review 2026-10-13 DATA-01: an authenticated client lookup reads the secure
// session once, and lookups that start together share one queued read. A
// write, a sign-out, a session change or a server change in between is never
// answered from the shared read.
import { advanceSessionGeneration, getSessionGeneration } from '../sessionLifecycle';
jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) },
}));
jest.mock('@/services/session-recent-items-service', () => ({
  SessionRecentItemsService: {
    clearAllSessionRecentItems: jest.fn(async () => {}),
  },
}));
jest.mock('@/services/recent-items-service', () => ({
  RecentItemsService: { clearCache: jest.fn(async () => {}) },
}));
jest.mock('@/config/sentryConfig', () => ({
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({
  clearSessionScopedState: jest.fn(async () => {}),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import {
  clearStoredTokens,
  getAuthenticatedClient,
  getStoredToken,
  initializeSupabase,
  storeTokens,
} from '../supabaseConfig';
import { getAppErrorCode } from '@/utils/appError';
import { clearOperatorServer, saveOperatorServer } from '../operatorServer';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({
  clearSecureSessionMarker: jest.fn(),
}));
jest.mock('@/utils/otpRateLimiter', () => ({
  checkOTPRateLimit: jest.fn(),
  recordOTPRequest: jest.fn(),
  clearAllRateLimits: jest.fn(async () => {}),
}));

const SESSION_KEYS = new Set([
  'secure_auth_token',
  'secure_refresh_token',
  'secure_token_expires',
  'secure_operator_identity',
]);
const secure = new Map<string, string>();
const rpc = jest.fn();
const from = jest.fn();
let hold: Promise<void> | undefined;
const jwt = (expires = Math.floor(Date.now() / 1000) + 3600, session = 'test-session') =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', session_id: session, exp: expires, role: 'authenticated' }))}.test-signature`;
const serverA = { origin: 'https://facility-a.example.test', instanceId: 'instance-aaaa', displayName: 'Sample Facility A', companyName: 'Sample Cold Store A' };
const serverB = { origin: 'https://facility-b.example.test', instanceId: 'instance-bbbb', displayName: 'Sample Facility B', companyName: 'Sample Cold Store B' };

const sessionReads = () =>
  jest.mocked(SecureStore.getItemAsync).mock.calls.filter(([key]) => SESSION_KEYS.has(key)).length;
const clientsCreated = () => jest.mocked(createClient).mock.calls.slice(clientsBefore);
const bearers = () =>
  clientsCreated().map(call => (call[2] as { global?: { headers?: { Authorization?: string } } } | undefined)?.global?.headers?.Authorization);
let clientsBefore = 0;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};

/** Stores a session, then starts counting from zero. */
async function signedIn(token: string, expiresAt = Date.now() + 3600 * 1000) {
  await storeTokens(token, 'r'.repeat(64), expiresAt);
  jest.mocked(SecureStore.getItemAsync).mockClear();
  clientsBefore = jest.mocked(createClient).mock.calls.length;
}

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  rpc.mockReset();
  from.mockReset();
  hold = undefined;
  await AsyncStorage.clear();
  await clearOperatorServer();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
    if (hold) await hold;
    return secure.get(key) ?? null;
  });
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    secure.set(key, value);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
    secure.delete(key);
  });
  jest.mocked(createClient).mockReturnValue({ rpc, from } as unknown as ReturnType<typeof createClient>);
  initializeSupabase('http://localhost:18000', 'local-test-anon');
});

test('one healthy client lookup reads the session once (four reads with a server selected)', async () => {
  await saveOperatorServer(serverA, false);
  const token = jwt();
  await signedIn(token);
  await getAuthenticatedClient();
  expect(sessionReads()).toBe(4);
  expect(bearers()).toEqual([`Bearer ${token}`]);
});

test('one healthy client lookup without a selected server reads three values', async () => {
  await signedIn(jwt());
  await getAuthenticatedClient();
  expect(sessionReads()).toBe(3);
});

test('twenty lookups that start together share one read and one client', async () => {
  await saveOperatorServer(serverA, false);
  const token = jwt();
  await signedIn(token);
  const clients = await Promise.all(Array.from({ length: 20 }, () => getAuthenticatedClient()));
  expect(sessionReads()).toBe(4);
  expect(bearers()).toEqual([`Bearer ${token}`]);
  expect(new Set(clients).size).toBe(1);
  // Nothing is kept once the shared read has settled: the next lookup reads again.
  await getAuthenticatedClient();
  expect(sessionReads()).toBe(8);
});

test('callers sharing a read each get their own copy', async () => {
  await signedIn(jwt());
  const [a, b] = await Promise.all([getStoredToken(), getStoredToken()]);
  expect(sessionReads()).toBe(3);
  expect(a).toEqual(b);
  expect(a).not.toBe(b);
  a.authToken = 'changed-by-a-caller';
  expect(b.authToken).not.toBe('changed-by-a-caller');
});

test('a token inside the renewal margin is renewed and its successor used, with six reads', async () => {
  await signedIn(jwt(), Date.now() + 60 * 1000);
  const next = jwt(undefined, 'renewed-session');
  rpc.mockResolvedValue({ data: { success: true, access_token: next, refresh_token: 's'.repeat(64), expires_in: 3600 }, error: null });
  await getAuthenticatedClient();
  expect(rpc).toHaveBeenCalledWith('refresh_jwt_token', { p_refresh_token: 'r'.repeat(64) });
  expect(bearers()).toEqual([`Bearer ${next}`]);
  expect(sessionReads()).toBe(6);
});

test('a read queued after a token write does not share the read before it', async () => {
  const old = jwt();
  await signedIn(old);
  const p1 = getStoredToken();
  const fresh = jwt(undefined, 'rotated-session');
  const written = storeTokens(fresh, 's'.repeat(64), Date.now() + 3600 * 1000, getSessionGeneration());
  const p2 = getStoredToken();
  await written;
  expect((await p1).authToken).toBe(old);
  expect((await p2).authToken).toBe(fresh);
  expect(sessionReads()).toBe(6);
});

test('lookups in flight when the session is cleared all fail and no client gets the old bearer', async () => {
  await signedIn(jwt());
  const lookups = Array.from({ length: 20 }, () => getAuthenticatedClient());
  const cleared = clearStoredTokens();
  const results = await Promise.allSettled(lookups);
  await cleared;
  expect(results.map(r => r.status)).toEqual(Array(20).fill('rejected'));
  expect(results.map(r => getAppErrorCode((r as PromiseRejectedResult).reason))).toEqual(Array(20).fill('SIGN_IN_REQUIRED'));
  expect(bearers()).toEqual([]);
});

test('a server change between two reads: neither returns a token and the second reads again', async () => {
  await saveOperatorServer(serverA, false);
  await signedIn(jwt());
  const gate = deferred();
  hold = gate.promise;
  const p1 = getStoredToken();
  await flush();
  await saveOperatorServer(serverB, false);
  const p2 = getStoredToken();
  hold = undefined;
  gate.resolve();
  const [first, second] = await Promise.all([p1, p2]);
  expect(first.authToken).toBeUndefined();
  expect(first.isValid).toBe(false);
  expect(second.authToken).toBeUndefined();
  expect(second.isValid).toBe(false);
  expect(secure.has('secure_auth_token')).toBe(false);
  // p1: token, refresh, expiry, identity (mismatch, cleared); p2: its own three reads.
  expect(sessionReads()).toBe(7);
});

test('a session change between two reads: the first is refused, the second reads again', async () => {
  const token = jwt();
  await signedIn(token);
  const p1 = getStoredToken();
  advanceSessionGeneration();
  const p2 = getStoredToken();
  expect(await p1).toEqual({ isValid: false });
  expect((await p2).authToken).toBe(token);
  expect(sessionReads()).toBe(6);
});
