import { operatorResumeGate } from '../operatorResume';
import { advanceSessionGeneration } from '../sessionLifecycle';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { logout, setUserProfile } from '@/store/slices/authSlice';
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
// A rejected refresh ends the Redux session through the lazily required store.
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({
  clearSessionScopedState: jest.fn(async () => {}),
}));
import { store as appStore } from '@/store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { checkOTPRateLimit } from '@/utils/otpRateLimiter';
import {
  ensureValidTokens,
  getCachedUserProfile,
  getStoredToken,
  initializeSupabase,
  refreshCustomJWT,
  signOut,
  signInWithPhone,
  getEnrollmentStatus,
  getPendingEnrollmentToken,
  signOutPendingEnrollment,
  beginOperatorSwitch,
  beginOperatorMutation,
  endOperatorSwitch,
  getAuthenticatedClient,
  createAuthenticatedFetch,
  createSessionReadFetch,
  getSessionIdentity,
  storeTokens,
  verifyOTP,
} from '../supabaseConfig';
import { loadOperatorServer, saveOperatorServer } from '../operatorServer';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({
  clearSecureSessionMarker: jest.fn(),
}));
jest.mock('@/utils/otpRateLimiter', () => ({
  checkOTPRateLimit: jest.fn(),
  recordOTPRequest: jest.fn(),
  clearAllRateLimits: jest.fn(async () => {}),
}));

const secure = new Map<string, string>();
const rpc = jest.fn();
const from = jest.fn();
const originalFetch = global.fetch;
const operatorResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
const jwt = (expires = Math.floor(Date.now() / 1000) + 3600) =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', session_id: 'test-session', exp: expires, role: 'authenticated' }))}.test-signature`;

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  rpc.mockReset();
  from.mockReset();
  await AsyncStorage.clear();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async key => secure.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      secure.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
    secure.delete(key);
  });
  jest
    .mocked(createClient)
    .mockReturnValue({ rpc, from } as unknown as ReturnType<
      typeof createClient
    >);
  initializeSupabase('http://localhost:18000', 'local-test-anon');
  global.fetch = jest.fn() as typeof fetch;
});

afterAll(() => { global.fetch = originalFetch; });

it.each(['secure_auth_token', 'secure_refresh_token', 'secure_token_expires'])(
  'fails closed and removes partial credentials when writing %s fails',
  async failingKey => {
    await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
    jest
      .mocked(SecureStore.setItemAsync)
      .mockImplementation(async (key, value) => {
        if (key === failingKey)
          throw new Error('Native storage rejected a value');
        secure.set(key, value);
      });
    const legacyWrite = jest.mocked(AsyncStorage.multiSet);
    legacyWrite.mockClear();
    await expect(
      storeTokens(jwt(), 'b'.repeat(64), Date.now() + 3600000)
    ).rejects.toThrow('Unable to save session securely');
    expect(secure.size).toBe(0);
    expect(legacyWrite).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('auth_token')).toBeNull();
    expect(await AsyncStorage.getItem('refresh_token')).toBeNull();
    expect(await getStoredToken()).toEqual({ isValid: false });
  }
);

it('rejects a partial secure session without its expiry completion marker', async () => {
  secure.set('secure_auth_token', jwt());
  secure.set('secure_refresh_token', 'a'.repeat(64));
  expect(await getStoredToken()).toEqual({ isValid: false });
});

it('clears a replaced instance locally without sending its old refresh credential', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  await signOut({ localOnly: true });
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(secure.size).toBe(0);
  expect(rpc).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

it('does not use legacy credentials if secure migration fails', async () => {
  await AsyncStorage.multiSet([
    ['auth_token', btoa(jwt())],
    ['refresh_token', 'd'.repeat(64)],
    ['token_expires_at', String(Date.now() + 3600000)],
  ]);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValue(new Error('Unavailable'));
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(secure.size).toBe(0);
  expect(await AsyncStorage.getItem('refresh_token')).toBeNull();
});

it('does not return success from OTP login when secure persistence fails', async () => {
  const secret = 'native-error-must-not-leak-token';
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({
      success: true,
      data: {
        action: 'login',
        user: { role: 'customer' },
        session: { access_token: jwt(), refresh_token: 'e'.repeat(64) },
      },
  }) as Response);
  jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error(secret));
  expect((await verifyOTP('0000000002', '123456')).success).toBe(false);
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(errors.mock.calls.flat().map(String).join(' ')).not.toContain(secret);
  errors.mockRestore();
});

it('rejects refreshed credentials if their secure persistence fails', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({
    data: { success: true, access_token: jwt(), refresh_token: 'b'.repeat(64) },
    error: null,
  });
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValue(new Error('Unavailable'));
  expect(await refreshCustomJWT()).toBeNull();
  expect(await getStoredToken()).toEqual({ isValid: false });
});

it('reloads an expired profile cache without destroying the session', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  secure.set(
    'cached_user_profile',
    JSON.stringify({ profile: { id: 'old' }, cachedAt: 1 })
  );
  const query = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.single.mockResolvedValue({
    data: { id: 'current', active: true },
    error: null,
  });
  from.mockReturnValue(query);
  rpc.mockResolvedValue({ data: ['assigned-customer'], error: null });
  const profile = await getCachedUserProfile();
  expect(profile.id).toBe('current');
  expect(profile.assignedCustomerIds).toEqual(['assigned-customer']);
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
});

it('retains expired credentials so refresh can restore the session', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  expect((await getStoredToken()).isValid).toBe(false);
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
  const next = jwt();
  rpc.mockResolvedValue({
    data: { success: true, access_token: next, refresh_token: 'b'.repeat(64) },
    error: null,
  });
  expect(await ensureValidTokens()).toBe(true);
  expect((await getStoredToken()).authToken).toBe(next);
  expect(secure.get('secure_refresh_token')).toBe('b'.repeat(64));
});

it('serializes concurrent refresh calls to prevent single-use token races', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({
    data: { success: true, access_token: jwt(), refresh_token: 'c'.repeat(64) },
    error: null,
  });
  const results = await Promise.all([
    refreshCustomJWT(),
    refreshCustomJWT(),
    refreshCustomJWT(),
  ]);
  expect(results.every(Boolean)).toBe(true);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('preserves the refresh token after a temporary network failure', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({
    data: null,
    error: { message: 'Network unavailable' },
  });
  expect(await ensureValidTokens()).toBe(false);
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
});

it('clears credentials after a definitive refresh rejection', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({
    data: { success: false, message: 'Invalid refresh token' },
    error: null,
  });
  expect(await ensureValidTokens()).toBe(false);
  expect(secure.has('secure_refresh_token')).toBe(false);
});

it('migrates base64 legacy access tokens and preserves a plain opaque refresh token', async () => {
  const token = jwt();
  await AsyncStorage.multiSet([
    ['auth_token', btoa(token)],
    ['refresh_token', 'd'.repeat(64)],
    ['token_expires_at', String(Date.now() + 3600000)],
  ]);
  const stored = await getStoredToken();
  expect(stored.authToken).toBe(token);
  expect(stored.refreshToken).toBe('d'.repeat(64));
  expect(await AsyncStorage.getItem('auth_token')).toBeNull();
});

it('logs out through the custom RPC and always clears local credentials', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  secure.set('cached_user_profile', 'old-profile');
  rpc.mockRejectedValue(new Error('Offline'));
  await signOut();
  expect(rpc).toHaveBeenCalledWith('logout_session', {
    p_refresh_token: 'a'.repeat(64),
  });
  expect(secure.size).toBe(0);
});

it('signs in without contacting GoTrue or logging OTP/access/refresh tokens', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const access = jwt();
  const refresh = 'e'.repeat(64);
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({
    success: true,
    data: { action: 'login', user: { role: 'customer' }, session: { access_token: access, refresh_token: refresh } },
  }) as Response);
  rpc.mockResolvedValue({ data: [], error: null });
  const result = await verifyOTP('0000000002', '123456');
  expect(result.success).toBe(true);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /123456|test-signature|eeeeeeee/
  );
  log.mockRestore();
});

it('requests an operator OTP through the public edge endpoint', async () => {
  jest.mocked(checkOTPRateLimit).mockResolvedValue({ allowed: true });
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({
    success: true, data: { request_id: 'request-1', expires_at: '2099-01-01T00:00:00Z' },
  }) as Response);
  expect((await signInWithPhone('+910000000001')).success).toBe(true);
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:18000/functions/v1/operator-otp/request',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ phone_number: '910000000001' }),
      headers: expect.objectContaining({ apikey: 'local-test-anon', Authorization: 'Bearer local-test-anon' }),
    })
  );
});

it('keeps pending enrollment separate from warehouse credentials', async () => {
  jest.mocked(global.fetch)
    .mockResolvedValueOnce(operatorResponse({
      success: true,
      data: { action: 'pending', enrollment_token: 'enrollment-secret', user: { enrollment_status: 'pending' } },
    }) as Response)
    .mockResolvedValueOnce(operatorResponse({ success: true, data: { status: 'approved' } }) as Response)
    .mockResolvedValueOnce(operatorResponse({ success: true }) as Response);
  const result = await verifyOTP('0000000002', '654321');
  expect(result.success && result.data.action).toBe('pending');
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(await getPendingEnrollmentToken()).toBe('enrollment-secret');
  expect(await getEnrollmentStatus()).toEqual({ success: true, status: 'approved' });
  expect(jest.mocked(global.fetch).mock.calls[1][1]?.body).toBe(JSON.stringify({ enrollment_token: 'enrollment-secret' }));
  await signOutPendingEnrollment();
  expect(await getPendingEnrollmentToken()).toBeNull();
});

it('waits for authenticated requests before allowing a server switch and blocks stale clients', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  const client = await getAuthenticatedClient();
  const options = jest.mocked(createClient).mock.calls.at(-1)?.[2];
  const guardedFetch = options?.global?.fetch;
  expect(guardedFetch).toBeDefined();
  const slow = deferred<Response>();
  jest.mocked(global.fetch).mockImplementation(() => slow.promise);
  const request = guardedFetch!('http://localhost:18000/rest/v1/items');
  expect(beginOperatorSwitch()).toBe(false);
  slow.resolve(operatorResponse({ data: [] }) as Response);
  await request;
  expect(beginOperatorSwitch()).toBe(true);
  await expect(guardedFetch!('http://localhost:18000/rest/v1/items')).rejects.toThrow('Session changed');
  endOperatorSwitch();
  expect(client).toBeDefined();
});

it('blocks direct authenticated writes and cancels pending document downloads on switch', async () => {
  const writeFetch = createAuthenticatedFetch();
  const readFetch = createSessionReadFetch();
  const slowWrite = deferred<Response>();
  jest.mocked(global.fetch).mockImplementationOnce(() => slowWrite.promise);
  const write = writeFetch('https://warehouse.example.test/functions/v1/print-grn-preprinted', { method: 'POST' });
  expect(beginOperatorSwitch()).toBe(false);
  slowWrite.resolve(operatorResponse({ success: true }) as Response);
  await write;

  let readSignal: AbortSignal | undefined;
  jest.mocked(global.fetch).mockImplementationOnce((_, init) => {
    readSignal = init?.signal || undefined;
    return new Promise<Response>((_, reject) => readSignal?.addEventListener('abort', () => reject(new Error('Aborted'))));
  });
  const read = readFetch('https://warehouse.example.test/signed.pdf');
  expect(beginOperatorSwitch()).toBe(true);
  expect(readSignal?.aborted).toBe(true);
  await expect(read).rejects.toThrow('Aborted');
  await expect(writeFetch('https://warehouse.example.test/functions/v1/print-grn-preprinted', { method: 'POST' })).rejects.toThrow('Session changed');
  endOperatorSwitch();
});

it('holds the switch gate across a multi-request image operation', () => {
  const finish = beginOperatorMutation();
  expect(beginOperatorSwitch()).toBe(false);
  finish();
  finish(); // Releasing twice must not unlock another active operation.
  const second = beginOperatorMutation();
  expect(beginOperatorSwitch()).toBe(false);
  second();
  expect(beginOperatorSwitch()).toBe(true);
  expect(() => beginOperatorMutation()).toThrow('Server switch in progress');
  endOperatorSwitch();
});

it('denies rejected verification without storing any session', async () => {
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({ success: false, error: 'Account unavailable' }, 403) as Response);
  expect(await verifyOTP('0000000002', '654321')).toEqual({ success: false, error: 'Account unavailable' });
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(await getPendingEnrollmentToken()).toBeNull();
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
it('revokes and discards refresh credentials arriving after logout', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  const slow = deferred<any>();
  rpc.mockImplementation(name =>
    name === 'refresh_jwt_token'
      ? slow.promise
      : Promise.resolve({ data: { success: true }, error: null })
  );
  const pending = refreshCustomJWT();
  await flush();
  await signOut();
  slow.resolve({
    data: { success: true, access_token: jwt(), refresh_token: 'b'.repeat(64) },
    error: null,
  });
  expect(await pending).toBeNull();
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(rpc).toHaveBeenCalledWith('logout_session', {
    p_refresh_token: 'b'.repeat(64),
  });
});
it('does not let failed old refresh erase a newer account', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  const slow = deferred<any>();
  rpc.mockReturnValue(slow.promise);
  const pending = refreshCustomJWT();
  await flush();
  await storeTokens(jwt(), 'c'.repeat(64), Date.now() + 3600000);
  slow.resolve({ data: { success: false }, error: null });
  expect(await pending).toBeNull();
  expect((await getStoredToken()).refreshToken).toBe('c'.repeat(64));
});
it('serializes overlapping secure writes and keeps only the latest session', async () => {
  const slow = deferred<void>();
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      if (key === 'secure_auth_token' && value === 'first') await slow.promise;
      secure.set(key, value);
    });
  const first = storeTokens('first', 'a'.repeat(64), Date.now() + 3600000);
  const rejected = expect(first).rejects.toThrow('Session changed');
  await flush();
  const second = storeTokens('second', 'b'.repeat(64), Date.now() + 3600000);
  slow.resolve();
  await rejected;
  await second;
  expect((await getStoredToken()).authToken).toBe('second');
  expect((await getStoredToken()).refreshToken).toBe('b'.repeat(64));
});
it('a late OTP response cannot restore a logged-out session', async () => {
  const slow = deferred<any>();
  jest.mocked(global.fetch).mockImplementation(() => slow.promise);
  rpc.mockResolvedValue({ data: null, error: null });
  const pending = verifyOTP('0000000002', '123456');
  await flush();
  await signOut();
  slow.resolve(operatorResponse({
      success: true,
      data: {
        action: 'login',
        user: { role: 'customer' },
        session: { access_token: jwt(), refresh_token: 'b'.repeat(64) },
      },
  }));
  expect((await pending).success).toBe(false);
  expect(await getStoredToken()).toEqual({ isValid: false });
});

it('Redux logout revokes its captured credential without clearing an account signed in during revocation', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  const slow = deferred<any>();
  rpc.mockImplementation(name =>
    name === 'logout_session'
      ? slow.promise
      : Promise.resolve({ data: [], error: null })
  );
  const store = configureStore({ reducer: { auth: authReducer } });
  const pending = store.dispatch(logout());
  await flush();
  expect(rpc).toHaveBeenCalledWith('logout_session', {
    p_refresh_token: 'a'.repeat(64),
  });
  await storeTokens(jwt(), 'b'.repeat(64), Date.now() + 3600000);
  store.dispatch(
    setUserProfile({ id: 'new-account', role: 'customer' } as any)
  );
  slow.resolve({ data: { success: true }, error: null });
  await pending.unwrap();
  expect((await getStoredToken()).refreshToken).toBe('b'.repeat(64));
  expect(store.getState().auth.userProfile?.id).toBe('new-account');
});

test('authenticated HTTP waits for foreground identity discovery before forwarding', async () => {
  let release!: (value: boolean) => void;
  const verification = new Promise<boolean>(resolve => { release = resolve; });
  const remove = operatorResumeGate.installVerifier(() => verification);
  operatorResumeGate.suspend();
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({ success: true }));
  const request = createSessionReadFetch()('https://warehouse.example.test/rest/v1/rpc/get_orders_list');
  expect(global.fetch).not.toHaveBeenCalled();
  release(true); await request;
  expect(global.fetch).toHaveBeenCalledTimes(1); remove();
});
test('replacement cleanup invalidates a queued authenticated HTTP request before fetch', async () => {
  let release!: (value: boolean) => void;
  const verification = new Promise<boolean>(resolve => { release = resolve; });
  const remove = operatorResumeGate.installVerifier(() => verification);
  operatorResumeGate.suspend();
  const request = createSessionReadFetch()('https://warehouse.example.test/rest/v1/rpc/get_orders_list');
  const rejection = expect(request).rejects.toThrow('Session changed');
  advanceSessionGeneration(); release(true); await rejection;
  expect(global.fetch).not.toHaveBeenCalled(); remove();
});

// ---------------------------------------------------------------------------
// 2.1 One identity gate for every credentialed call
// ---------------------------------------------------------------------------
const suspendGate = () => {
  let release!: (value: boolean) => void;
  const remove = operatorResumeGate.installVerifier(
    () => new Promise<boolean>(resolve => { release = resolve; })
  );
  operatorResumeGate.suspend();
  return { release: (value: boolean) => release(value), remove };
};

test('token refresh waits for foreground identity verification before sending the refresh credential', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  const gate = suspendGate();
  rpc.mockResolvedValue({
    data: { success: true, access_token: jwt(), refresh_token: 'b'.repeat(64) },
    error: null,
  });
  const pending = refreshCustomJWT();
  await flush();
  expect(rpc).not.toHaveBeenCalled();
  gate.release(true);
  expect(await pending).not.toBeNull();
  expect(rpc).toHaveBeenCalledWith('refresh_jwt_token', { p_refresh_token: 'a'.repeat(64) });
  expect(secure.get('secure_refresh_token')).toBe('b'.repeat(64));
  gate.remove();
});

test('a replacement discovered on resume never receives the old refresh token', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  const remove = operatorResumeGate.installVerifier(async () => {
    // Foreground discovery found another instance at this URL: local cleanup
    // replaces the session generation before the gate opens.
    await signOut({ localOnly: true });
    initializeSupabase('http://localhost:18000', 'replacement-anon');
    return true;
  });
  operatorResumeGate.suspend();
  rpc.mockResolvedValue({
    data: { success: true, access_token: jwt(), refresh_token: 'b'.repeat(64) },
    error: null,
  });
  expect(await refreshCustomJWT()).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(operatorResumeGate.isVerified()).toBe(true);
  remove();
});

test('the anonymous client fetch waits for identity verification and is permitted during a server switch', async () => {
  initializeSupabase('http://localhost:18000', 'gated-anon');
  const anonFetch = jest.mocked(createClient).mock.calls.at(-1)?.[2]?.global?.fetch;
  expect(anonFetch).toBeDefined();
  const gate = suspendGate();
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({ success: true }) as Response);
  const gated = anonFetch!('http://localhost:18000/rest/v1/rpc/refresh_jwt_token', { method: 'POST' });
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();
  gate.release(true);
  await gated;
  expect(global.fetch).toHaveBeenCalledTimes(1);
  gate.remove();

  expect(beginOperatorSwitch()).toBe(true);
  await anonFetch!('http://localhost:18000/rest/v1/rpc/logout_session', { method: 'POST' });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  endOperatorSwitch();
});

test('enrollment signout waits for identity verification but is allowed during a server switch', async () => {
  secure.set('secure_enrollment_token', 'enrollment-secret');
  const gate = suspendGate();
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({ success: true }) as Response);
  const pending = signOutPendingEnrollment();
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();
  gate.release(true);
  await pending;
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:18000/functions/v1/operator-otp/signout',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ enrollment_token: 'enrollment-secret' }) })
  );
  expect(await getPendingEnrollmentToken()).toBeNull();
  gate.remove();

  secure.set('secure_enrollment_token', 'enrollment-secret');
  expect(beginOperatorSwitch()).toBe(true);
  await signOutPendingEnrollment();
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(await getPendingEnrollmentToken()).toBeNull();
  endOperatorSwitch();
});

test('logout revocation through logout_session is allowed during a server switch', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  rpc.mockResolvedValue({ data: { success: true }, error: null });
  expect(beginOperatorSwitch()).toBe(true);
  await signOut();
  expect(rpc).toHaveBeenCalledWith('logout_session', { p_refresh_token: 'a'.repeat(64) });
  expect(secure.size).toBe(0);
  endOperatorSwitch();
});

// ---------------------------------------------------------------------------
// 2.2 Definitive refresh rejection forces one Redux logout
// ---------------------------------------------------------------------------
test('a definitive refresh rejection clears credentials and ends the Redux session once', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({
    data: { success: false, message: 'Invalid refresh token' },
    error: null,
  });
  expect(await refreshCustomJWT()).toBeNull();
  expect(secure.has('secure_refresh_token')).toBe(false);
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
  expect(typeof jest.mocked(appStore.dispatch).mock.calls[0][0]).toBe('function');
});

test('the P0001 "Session expired" exception is a definitive rejection', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Session expired' } });
  expect(await ensureValidTokens()).toBe(false);
  expect(secure.has('secure_refresh_token')).toBe(false);
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
});

it.each([
  ['a serialization failure', { data: null, error: { code: '22P02', message: 'invalid input syntax for type json' } }],
  ['a transport failure', { data: null, error: { code: '', message: 'TypeError: Network request failed' } }],
  ['an expired bearer on the gateway', { data: null, error: { code: 'PGRST301', message: 'JWT expired' } }],
  ['a session check from another RPC', { data: null, error: { code: '42501', message: 'Session expired or revoked' } }],
  ['a malformed success payload', { data: { success: true }, error: null }],
])('%s during refresh keeps the refresh credential and the Redux session', async (_, response) => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue(response);
  expect(await ensureValidTokens()).toBe(false);
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
  expect(appStore.dispatch).not.toHaveBeenCalled();
});

test('three concurrent refreshes rejected together force a single logout', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({
    data: { success: false, message: 'Invalid refresh token' },
    error: null,
  });
  const results = await Promise.all([refreshCustomJWT(), refreshCustomJWT(), refreshCustomJWT()]);
  expect(results).toEqual([null, null, null]);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
  // The rejected generation is gone; a later refresh finds no credential and
  // must not end the (next) session again.
  expect(await refreshCustomJWT()).toBeNull();
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// 2.3 Session identity for scoped caches
// ---------------------------------------------------------------------------
test('session identity combines the selected server with the access-token subject', async () => {
  expect(await getSessionIdentity()).toBeNull();
  await saveOperatorServer({ origin: 'http://localhost:18000', instanceId: 'instance-test', displayName: 'Test', companyName: 'Test' }, false);
  expect(await getSessionIdentity()).toBeNull();
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  // An expired access token still names the subject whose cache may be served offline.
  expect(await getSessionIdentity()).toEqual({ origin: 'http://localhost:18000', instanceId: 'instance-test', subject: 'test-user' });
  await signOut({ localOnly: true });
  expect(await getSessionIdentity()).toBeNull();
  await AsyncStorage.removeItem('operator_server_v1');
  await loadOperatorServer();
});

test('an authenticated client reports a transient refresh failure as connectivity, not sign-in', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
  await expect(getAuthenticatedClient()).rejects.toThrow('Network request failed');
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
  rpc.mockResolvedValue({ data: { success: false, message: 'Invalid refresh token' }, error: null });
  await expect(getAuthenticatedClient()).rejects.toThrow('Sign in required');
  expect(secure.get('secure_refresh_token')).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Rotated server keys (testvm2 finding 9): Kong 3 answers every request made
// with the old apikey with 401 {"message":"Unauthorized"}.
// ---------------------------------------------------------------------------
const unauthorized = (body: unknown) => {
  const response = { ok: false, status: 401, json: async () => body } as unknown as Response;
  (response as { clone: () => Response }).clone = () => unauthorized(body);
  return response;
};

test('a gateway key rejection ends the session once and does not wait for a refresh', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  jest.mocked(global.fetch).mockResolvedValue(unauthorized({ message: 'Unauthorized' }));
  const request = createSessionReadFetch();
  const [first, second] = await Promise.all([
    request('https://warehouse.example.test/rest/v1/customers'),
    request('https://warehouse.example.test/rest/v1/rpc/get_orders_list'),
  ]);
  expect([first.status, second.status]).toEqual([401, 401]);
  await flush();
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
  // Requests still queued for the ended session are refused, not sent.
  await expect(request('https://warehouse.example.test/rest/v1/customers')).rejects.toThrow('Session changed');
});

test('the Kong 2 key rejection message is recognized too', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  jest.mocked(global.fetch).mockResolvedValue(unauthorized({ message: 'Invalid authentication credentials' }));
  await createSessionReadFetch()('https://warehouse.example.test/rest/v1/customers');
  await flush();
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
});

test('an expired access token is left to the refresh path, not treated as rotated keys', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  jest.mocked(global.fetch).mockResolvedValue(unauthorized({ code: 'PGRST301', message: 'JWT expired' }));
  await createSessionReadFetch()('https://warehouse.example.test/rest/v1/customers');
  await flush();
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
  expect(appStore.dispatch).not.toHaveBeenCalled();
});

test('a refresh refused by the gateway is definitive, not a network failure', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({ data: null, error: { message: 'Unauthorized' } });
  await expect(getAuthenticatedClient()).rejects.toThrow('Sign in required');
  expect(secure.get('secure_refresh_token')).toBeUndefined();
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
});
