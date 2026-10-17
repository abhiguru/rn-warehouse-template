/**
 * The last resort for a facility session that an exchange left on the phone for the previous
 * central person (`forceLeaveFacility` in src/store/operatorSwitch.ts; ops review 2026-10-17,
 * M08), with the real session store, gated fetch and logout thunk.
 *
 * A write in flight keeps the switch gate busy, which is why the normal leave refused. The
 * forced leave does not wait for it and does not cancel it, but it moves the session
 * generation, so the write's late answer is dropped, and the stored session is gone.
 */
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import authReducer from '@/store/slices/authSlice';
import { forceLeaveFacility, leaveFacility } from '@/store/operatorSwitch';
import { advanceSessionGeneration, getSessionGeneration } from '../sessionLifecycle';
import ConfigService from '@/services/configService';
import { clearSessionScopedState } from '@/store/sessionScopedState';
import { getActiveOperatorServer, saveOperatorServer } from '../operatorServer';
import {
  createAuthenticatedFetch,
  getStoredToken,
  initializeSupabase,
  isOperatorSwitchFree,
  storeTokens,
} from '../supabaseConfig';

jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) } }));
jest.mock('@/services/session-recent-items-service', () => ({
  SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) },
}));
jest.mock('@/services/recent-items-service', () => ({ RecentItemsService: { clearCache: jest.fn(async () => {}) } }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ clearSecureSessionMarker: jest.fn() }));
jest.mock('@/utils/otpRateLimiter', () => ({ checkOTPRateLimit: jest.fn(), recordOTPRequest: jest.fn(), clearAllRateLimits: jest.fn(async () => {}) }));

const NORTH = { origin: 'http://localhost:18000', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const secure = new Map<string, string>();
const rpc = jest.fn();
const originalFetch = global.fetch;
const jwt = () =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(
    JSON.stringify({ sub: 'previous-person', session_id: 'stale-session', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })
  )}.test-signature`;
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  await AsyncStorage.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  jest.mocked(createClient).mockReturnValue({ rpc, from: jest.fn() } as unknown as ReturnType<typeof createClient>);
  rpc.mockResolvedValue({ data: { success: true }, error: null });
  initializeSupabase(NORTH.origin, 'local-test-anon');
  global.fetch = jest.fn() as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  await saveOperatorServer(NORTH, false);
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { global.fetch = originalFetch; });

it('ends the stored session while a write holds the switch gate; the write is not cancelled, but its late answer is dropped', async () => {
  let answer!: (response: Response) => void;
  let writeSignal: AbortSignal | undefined;
  jest.mocked(global.fetch).mockImplementationOnce((_input, init) => {
    writeSignal = init?.signal ?? undefined;
    return new Promise<Response>(resolve => { answer = resolve; });
  });
  const write = createAuthenticatedFetch()(`${NORTH.origin}/rest/v1/rpc/save_grn`, { method: 'POST' });
  const settled = write.then(() => 'answered', (error: Error) => error.message);
  await flush();

  const store = configureStore({ reducer: { auth: authReducer } });
  // What the normal leave meets: the write holds the gate.
  expect(isOperatorSwitchFree()).toBe(false);
  expect(await leaveFacility(store.dispatch)).toBe('busy');
  expect((await getStoredToken()).refreshToken).toBe('a'.repeat(64));

  const generation = getSessionGeneration();
  expect(await forceLeaveFacility(store.dispatch, NORTH)).toBe(true);
  expect(getSessionGeneration()).not.toBe(generation);
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(getActiveOperatorServer()).toBeNull();
  // Revocation was tried with the stale credential.
  expect(rpc).toHaveBeenCalledWith('logout_session', { p_refresh_token: 'a'.repeat(64) });
  // The write itself was left to finish...
  expect(writeSignal?.aborted).toBe(false);
  answer({ ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response);
  // ...but its answer belongs to the ended session and is not handed back.
  expect(await settled).toBe('Session changed');
});

it('a facility no longer selected is not touched: the session stored now is kept', async () => {
  const SOUTH = { ...NORTH, origin: 'https://south-cold.example.test', instanceId: 'instance-south' };
  // Another switch selected South and South's own session was stored.
  await saveOperatorServer(SOUTH, false);
  await storeTokens(jwt(), 'b'.repeat(64), Date.now() + 3600000);
  const store = configureStore({ reducer: { auth: authReducer } });
  expect(await forceLeaveFacility(store.dispatch, NORTH)).toBe(true);
  expect((await getStoredToken()).refreshToken).toBe('b'.repeat(64));
  expect(getActiveOperatorServer()).toEqual(SOUTH);
  expect(rpc).not.toHaveBeenCalledWith('logout_session', expect.anything());
});

it('offline: the revocation fails, the phone still forgets the session', async () => {
  rpc.mockRejectedValue(new TypeError('Network request failed'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const store = configureStore({ reducer: { auth: authReducer } });
  expect(await forceLeaveFacility(store.dispatch, NORTH)).toBe(true);
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(getActiveOperatorServer()).toBeNull();
});

// Review 2026-10-18, finding 3: the forced logout waits up to 15 s for the revocation without
// holding the gate. Whatever begins meanwhile is the new person's and must be left alone.
describe('a session begun during the forced logout (review 3)', () => {
  let releaseRevocation!: () => void;
  beforeEach(() => {
    rpc.mockImplementation((name: string) =>
      name === 'logout_session'
        ? new Promise(resolve => { releaseRevocation = () => resolve({ data: { success: true }, error: null }); })
        : Promise.resolve({ data: [], error: null })
    );
  });

  it('a session stored at the same facility survives, with that facility still selected and its drafts and caches kept', async () => {
    const clearCache = jest.spyOn(ConfigService, 'clearCache');
    const store = configureStore({ reducer: { auth: authReducer } });
    const leaving = forceLeaveFacility(store.dispatch, NORTH);
    await flush();
    await flush();
    expect(rpc).toHaveBeenCalledWith('logout_session', { p_refresh_token: 'a'.repeat(64) });
    // Bhavin opens North again and his own session is stored while the revocation waits.
    await storeTokens(jwt(), 'b'.repeat(64), Date.now() + 3600000);
    const scopedClears = jest.mocked(clearSessionScopedState).mock.calls.length;
    releaseRevocation();
    expect(await leaving).toBe(true);
    expect((await getStoredToken()).refreshToken).toBe('b'.repeat(64));
    expect(getActiveOperatorServer()).toEqual(NORTH);
    expect(jest.mocked(clearSessionScopedState).mock.calls.length).toBe(scopedClears);
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('a waiting request begun at another facility is not withdrawn', async () => {
    const SOUTH = { ...NORTH, origin: 'https://south-cold.example.test', instanceId: 'instance-south' };
    const store = configureStore({ reducer: { auth: authReducer } });
    const leaving = forceLeaveFacility(store.dispatch, NORTH);
    await flush();
    await flush();
    // Bhavin asks South for access meanwhile: a new sign-in (the generation moves) that waits.
    await saveOperatorServer(SOUTH, false);
    advanceSessionGeneration();
    secure.set('secure_enrollment_token', 'south-enrollment');
    releaseRevocation();
    expect(await leaving).toBe(true);
    expect(secure.get('secure_enrollment_token')).toBe('south-enrollment');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(getActiveOperatorServer()).toEqual(SOUTH);
  });
});
