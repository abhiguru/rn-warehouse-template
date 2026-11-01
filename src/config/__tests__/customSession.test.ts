import { sessionWasJustRenewed, resetSessionRenewalForTests } from '../sessionRenewal';
import { operatorResumeGate } from '../operatorResume';
import { advanceSessionGeneration, getSessionGeneration, renewAheadMs } from '../sessionLifecycle';
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
  isReadRequest,
  deviceExpiry,
  REQUEST_TIME_LIMIT_MS,
  RequestTimeoutError,
  clearAuthenticatedClientCache,
} from '../supabaseConfig';
import { getAppErrorCode } from '@/utils/appError';
import { isOfflineFailure, categorizeError } from '@/utils/serviceErrorHandler';
import { loadOperatorServer, saveOperatorServer } from '../operatorServer';
import { setLanguage, t } from '@/i18n';

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
  resetSessionRenewalForTests();
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
  const request = guardedFetch!('http://localhost:18000/rest/v1/rpc/save_grn', { method: 'POST' });
  expect(beginOperatorSwitch()).toBe(false);
  slow.resolve(operatorResponse({ data: [] }) as Response);
  // A request is in flight until its answer has been read, as the supabase-js clients do.
  await (await request).json();
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
  await (await write).json();

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
  // The sign-out marker adds a few storage round trips before the revocation starts.
  await flush();
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
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({ success: true }) as unknown as Response);
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
  await (await gated).json();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  gate.remove();

  expect(beginOperatorSwitch()).toBe(true);
  await (await anonFetch!('http://localhost:18000/rest/v1/rpc/logout_session', { method: 'POST' })).json();
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

test('a definitive refresh rejection signs the person out WITH the reason (shown on My facilities)', async () => {
  const slice = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
  const forceLogout = jest.spyOn(slice, 'forceLogoutOnInvalidToken').mockReturnValue({ type: 'test/forceLogout' } as never);
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({ data: { success: false, message: 'Invalid refresh token' }, error: null });
  expect(await refreshCustomJWT()).toBeNull();
  expect(forceLogout).toHaveBeenCalledTimes(1);
  expect(forceLogout.mock.calls[0][0]).toEqual(expect.any(String));
  expect(forceLogout.mock.calls[0][0].length).toBeGreaterThan(0);
  forceLogout.mockRestore();
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
  expect(rpc.mock.calls.filter(([name]) => name === 'refresh_jwt_token')).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// Review 2026-10-10, M1-1: a refresh whose answer is lost
// ---------------------------------------------------------------------------
const refreshCalls = () => rpc.mock.calls.filter(([name]) => name === 'refresh_jwt_token');
const serverJwt = (issuedAt: number, lifetime = 3600) =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', session_id: 'test-session', iat: issuedAt, exp: issuedAt + lifetime, role: 'authenticated' }))}.test-signature`;

describe('a refresh the app stops waiting for', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('is sent once more with the same token, and the successor is stored', async () => {
    await storeTokens(jwt(1), 'a'.repeat(64), 1000);
    const next = jwt();
    rpc
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ data: { success: true, access_token: next, refresh_token: 'b'.repeat(64) }, error: null });
    const pending = refreshCustomJWT();
    await jest.advanceTimersByTimeAsync(15000);
    expect((await pending)?.refreshToken).toBe('b'.repeat(64));
    expect(jest.getTimerCount()).toBe(0);
    expect(refreshCalls()).toEqual([
      ['refresh_jwt_token', { p_refresh_token: 'a'.repeat(64) }],
      ['refresh_jwt_token', { p_refresh_token: 'a'.repeat(64) }],
    ]);
    expect(secure.get('secure_refresh_token')).toBe('b'.repeat(64));
    expect(secure.get('secure_auth_token')).toBe(next);
    expect(appStore.dispatch).not.toHaveBeenCalled();
  });

  test('keeps the stored session when the second attempt times out as well', async () => {
    const old = jwt(1);
    await storeTokens(old, 'a'.repeat(64), 1000);
    rpc.mockImplementation(() => new Promise(() => {}));
    const pending = refreshCustomJWT();
    await jest.advanceTimersByTimeAsync(15000);
    // RM-7: the repeat has a 5 second limit, so a start of the app waits 20 seconds, not 30.
    await jest.advanceTimersByTimeAsync(4999);
    expect(refreshCalls()).toHaveLength(2);
    let settled = false;
    void pending.then(() => { settled = true; });
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(refreshCalls()).toHaveLength(2);
    expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
    expect(secure.get('secure_auth_token')).toBe(old);
    expect(appStore.dispatch).not.toHaveBeenCalled();
  });
});

// RM-3: a refresh whose answer is lost to the network (supabase-js returns the
// failed fetch as {error}, it does not throw) may have rotated the token on
// the server, which answers a repeat only inside its 60 second grace period.
describe('a refresh lost to a network error', () => {
  const lost = { data: null, error: { code: '', message: 'TypeError: Network request failed' } };
  const successor = () => ({ data: { success: true, access_token: jwt(), refresh_token: 'b'.repeat(64) }, error: null });
  const sameTokenEachTime = () =>
    expect(refreshCalls().every(([, args]) => args.p_refresh_token === 'a'.repeat(64))).toBe(true);
  let old: string;
  beforeEach(async () => {
    old = jwt(1);
    await storeTokens(old, 'a'.repeat(64), 1000);
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test('is sent again at once with the same token, and the successor is stored', async () => {
    rpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(successor());
    expect((await refreshCustomJWT())?.refreshToken).toBe('b'.repeat(64));
    expect(refreshCalls()).toHaveLength(2);
    sameTokenEachTime();
    expect(secure.get('secure_refresh_token')).toBe('b'.repeat(64));
    expect(jest.getTimerCount()).toBe(0);
  });

  test('that fails twice keeps the stored session and is tried again in the background', async () => {
    rpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(lost).mockResolvedValueOnce(successor());
    // The caller is answered at once: it does not wait for the background attempts.
    expect(await refreshCustomJWT()).toBeNull();
    expect(refreshCalls()).toHaveLength(2);
    expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
    expect(secure.get('secure_auth_token')).toBe(old);
    expect(appStore.dispatch).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1999);
    expect(refreshCalls()).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(refreshCalls()).toHaveLength(3);
    sameTokenEachTime();
    expect(secure.get('secure_refresh_token')).toBe('b'.repeat(64));
    expect(jest.getTimerCount()).toBe(0);
  });

  test('stops after the grace window and never ends the session', async () => {
    rpc.mockResolvedValue(lost);
    expect(await refreshCustomJWT()).toBeNull();
    // Two at once, then one each 2, 5, 10 and 20 seconds after the failure before: the last at 37 s.
    const seen: number[] = [];
    for (const elapsed of [2000, 7000, 17000, 37000, 120000]) {
      await jest.advanceTimersByTimeAsync(elapsed - (seen.length ? [2000, 7000, 17000, 37000][seen.length - 1] : 0));
      seen.push(refreshCalls().length);
    }
    expect(seen).toEqual([3, 4, 5, 6, 6]);
    sameTokenEachTime();
    expect(jest.getTimerCount()).toBe(0);
    expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
    expect(secure.get('secure_auth_token')).toBe(old);
    expect(appStore.dispatch).not.toHaveBeenCalled();
  });

  test('a background attempt the server refuses ends the session (its decision, not the network\'s)', async () => {
    rpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(lost)
      .mockResolvedValue({ data: { success: false, message: 'Invalid refresh token' }, error: null });
    expect(await refreshCustomJWT()).toBeNull();
    expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
    await jest.advanceTimersByTimeAsync(2000);
    expect(secure.has('secure_refresh_token')).toBe(false);
    expect(appStore.dispatch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a background attempt is dropped when the session was renewed or replaced meanwhile', async () => {
    rpc.mockResolvedValue(lost);
    expect(await refreshCustomJWT()).toBeNull();
    await storeTokens(jwt(), 'c'.repeat(64), Date.now() + 3600000);
    await jest.advanceTimersByTimeAsync(60000);
    expect(refreshCalls()).toHaveLength(2);
    expect(secure.get('secure_refresh_token')).toBe('c'.repeat(64));
  });

  test('a request stopped by the identity check is not connectivity and is not repeated', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '', message: 'Error: Warehouse identity verification required' } });
    expect(await refreshCustomJWT()).toBeNull();
    expect(refreshCalls()).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
  });
});

// RM-8: the renew-ahead margin follows the token's lifetime.
describe('a facility with a short access-token lifetime', () => {
  const now = () => Math.floor(Date.now() / 1000);
  test.each([
    [3600, 5 * 60 * 1000],
    [900, 90 * 1000],
    [300, 30 * 1000],
    [60, 6 * 1000],
  ])('a %d second token is renewed %d ms ahead', (lifetime, margin) => {
    expect(renewAheadMs(serverJwt(now(), lifetime))).toBe(margin);
  });
  test('a token that does not state its lifetime keeps the five minutes', () => {
    expect(renewAheadMs(jwt())).toBe(5 * 60 * 1000);
    expect(renewAheadMs('not-a-token')).toBe(5 * 60 * 1000);
    expect(renewAheadMs(undefined)).toBe(5 * 60 * 1000);
  });

  test('a 300 second token is used, not renewed, until its last 30 seconds', async () => {
    const issued = now();
    await storeTokens(serverJwt(issued, 300), 'a'.repeat(64), Date.now() + 290 * 1000);
    expect(await ensureValidTokens()).toBe(true);
    await getAuthenticatedClient();
    expect(refreshCalls()).toHaveLength(0);

    await storeTokens(serverJwt(issued - 275, 300), 'a'.repeat(64), Date.now() + 25 * 1000);
    rpc.mockResolvedValue({ data: { success: true, access_token: serverJwt(now(), 300), refresh_token: 'b'.repeat(64) }, error: null });
    expect(await ensureValidTokens()).toBe(true);
    expect(refreshCalls()).toHaveLength(1);
    // The token just issued is used: the next check does not rotate the session again.
    expect(await ensureValidTokens()).toBe(true);
    expect(refreshCalls()).toHaveLength(1);
  });

  test('a token without a stated lifetime that was just issued is not renewed on every request', async () => {
    await storeTokens(jwt(1), 'a'.repeat(64), 1000);
    // No iat and a server lifetime of 120 seconds: inside the default margin from the start.
    rpc.mockResolvedValue({ data: { success: true, access_token: jwt(now() + 120), refresh_token: 'b'.repeat(64) }, error: null });
    expect(await ensureValidTokens()).toBe(true);
    expect(await ensureValidTokens()).toBe(true);
    await getAuthenticatedClient();
    expect(refreshCalls()).toHaveLength(1);
  });
});

test('a refused refresh does not end the session when storage already holds the successor', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  const successor = jwt();
  const expires = Date.now() + 3600000;
  rpc.mockImplementationOnce(async () => {
    await storeTokens(successor, 'b'.repeat(64), expires, getSessionGeneration());
    return { data: { success: false, message: 'Invalid refresh token' }, error: null };
  });
  expect(await refreshCustomJWT()).toEqual({ accessToken: successor, refreshToken: 'b'.repeat(64), expiresAt: expires });
  expect(secure.get('secure_refresh_token')).toBe('b'.repeat(64));
  expect(appStore.dispatch).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalledWith('logout_session', expect.anything());
});

test('a refused refresh is tried once with a successor whose access token has expired too', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  const next = jwt();
  rpc
    .mockImplementationOnce(async () => {
      await storeTokens(jwt(1), 'b'.repeat(64), 1000, getSessionGeneration());
      return { data: { success: false, message: 'Invalid refresh token' }, error: null };
    })
    .mockResolvedValueOnce({ data: { success: true, access_token: next, refresh_token: 'c'.repeat(64) }, error: null });
  expect((await refreshCustomJWT())?.accessToken).toBe(next);
  expect(refreshCalls()[1]).toEqual(['refresh_jwt_token', { p_refresh_token: 'b'.repeat(64) }]);
  expect(secure.get('secure_refresh_token')).toBe('c'.repeat(64));
  expect(appStore.dispatch).not.toHaveBeenCalled();
});

test('a session that really ends is also ended on the server with the refused token', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockImplementation(async name =>
    name === 'refresh_jwt_token'
      ? { data: { success: false, message: 'Invalid refresh token' }, error: null }
      : { data: true, error: null }
  );
  expect(await refreshCustomJWT()).toBeNull();
  expect(secure.size).toBe(0);
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('logout_session', { p_refresh_token: 'a'.repeat(64) });
});

test('rotated keys end the session without sending the refresh token to logout_session', async () => {
  await storeTokens(jwt(1), 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({ data: null, error: { message: 'Unauthorized' } });
  expect(await refreshCustomJWT()).toBeNull();
  expect(rpc).not.toHaveBeenCalledWith('logout_session', expect.anything());
});

test('a refresh answer without a new refresh token replaces nothing', async () => {
  const old = jwt(1);
  await storeTokens(old, 'a'.repeat(64), 1000);
  rpc.mockResolvedValue({ data: { success: true, access_token: jwt() }, error: null });
  expect(await refreshCustomJWT()).toBeNull();
  expect(secure.get('secure_auth_token')).toBe(old);
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
  expect(secure.get('secure_token_expires')).toBe('1000');
  expect(appStore.dispatch).not.toHaveBeenCalled();
});

test('signing in over a stored session ends that session on the server', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  jest.mocked(global.fetch).mockResolvedValue(operatorResponse({ success: false, error: 'Invalid OTP' }, 400) as Response);
  rpc.mockResolvedValue({ data: true, error: null });
  expect((await verifyOTP('0000000002', '123456')).success).toBe(false);
  expect(rpc).toHaveBeenCalledWith('logout_session', { p_refresh_token: 'a'.repeat(64) });
  expect(await getStoredToken()).toEqual({ isValid: false });
});

// ---------------------------------------------------------------------------
// M1-2 / M1-3: the server's clock decides, not the device's
// ---------------------------------------------------------------------------
describe('a device clock that differs from the server clock', () => {
  const HOUR = 3600;
  test.each([
    ['two hours fast', -2 * HOUR],
    ['thirty minutes slow', HOUR / 2],
    ['exact', 0],
  ])('%s: the expiry is one token lifetime from now on the device clock', (_, serverAhead) => {
    const now = 1_800_000_000_000;
    const iat = now / 1000 + serverAhead;
    expect(deviceExpiry({ iat, exp: iat + HOUR }, {}, now)).toBe(now + HOUR * 1000);
  });

  test('without iat the lifetime the server states is used, then exp, then a short default', () => {
    const now = 1_800_000_000_000;
    expect(deviceExpiry({ exp: 5 }, { expires_in: 900 }, now)).toBe(now + 900000);
    expect(deviceExpiry({ exp: now / 1000 + 60 }, {}, now)).toBe(now + 60000);
    expect(deviceExpiry({ exp: 5 }, {}, now)).toBe(now + 600000);
  });

  test('sign-in stores a token the device clock calls expired (clock two hours fast)', async () => {
    const access = serverJwt(Math.floor(Date.now() / 1000) - 2 * HOUR);
    jest.mocked(global.fetch).mockResolvedValue(operatorResponse({
      success: true,
      data: { action: 'login', user: { role: 'customer' }, session: { access_token: access, refresh_token: 'e'.repeat(64) } },
    }) as Response);
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await verifyOTP('0000000002', '123456')).success).toBe(true);
    const stored = await getStoredToken();
    expect(stored.authToken).toBe(access);
    expect(stored.isValid).toBe(true);
    expect(Math.abs(stored.expiresAt! - (Date.now() + HOUR * 1000))).toBeLessThan(5000);
  });

  test('refresh stores the rotated pair when the device clock is two hours fast', async () => {
    await storeTokens(jwt(1), 'a'.repeat(64), 1000);
    const access = serverJwt(Math.floor(Date.now() / 1000) - 2 * HOUR);
    rpc.mockResolvedValue({ data: { success: true, access_token: access, refresh_token: 'b'.repeat(64) }, error: null });
    expect(await ensureValidTokens()).toBe(true);
    expect(secure.get('secure_refresh_token')).toBe('b'.repeat(64));
    expect((await getStoredToken()).isValid).toBe(true);
  });

  test('a slow device renews in time: the stored expiry is not the raw exp claim', async () => {
    await storeTokens(jwt(1), 'a'.repeat(64), 1000);
    const serverNow = Math.floor(Date.now() / 1000) + HOUR / 2;
    rpc.mockResolvedValue({ data: { success: true, access_token: serverJwt(serverNow), refresh_token: 'b'.repeat(64) }, error: null });
    const refreshed = await refreshCustomJWT();
    expect(Math.abs(refreshed!.expiresAt - (Date.now() + HOUR * 1000))).toBeLessThan(5000);
    expect(refreshed!.expiresAt).toBeLessThan((serverNow + HOUR) * 1000 - 20 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// M1-2: the server says the access token has expired
// ---------------------------------------------------------------------------
const refusedAs = (status: number, body: unknown) => {
  const response = { ok: false, status, json: async () => body } as unknown as Response;
  (response as { clone: () => Response }).clone = () => refusedAs(status, body);
  return response;
};
const authenticatedClientFetch = async () => {
  await getAuthenticatedClient();
  return jest.mocked(createClient).mock.calls.at(-1)![2]!.global!.fetch!;
};
const sentBearer = (call: number) =>
  (jest.mocked(global.fetch).mock.calls[call][1]!.headers as Record<string, string>).Authorization;

describe('an access token the server refuses as expired', () => {
  const old = jwt(Math.floor(Date.now() / 1000) + 7200);
  const renewed = jwt(Math.floor(Date.now() / 1000) + 9000);
  beforeEach(async () => {
    await storeTokens(old, 'a'.repeat(64), Date.now() + 7200000);
    rpc.mockResolvedValue({ data: { success: true, access_token: renewed, refresh_token: 'b'.repeat(64) }, error: null });
  });

  test.each([
    ['PostgREST', 401, { code: 'PGRST301', message: 'JWT expired' }],
    ['an edge function', 401, { success: false, error: 'Invalid or expired access token' }],
    ['Storage', 400, { statusCode: '403', error: 'Unauthorized', message: 'jwt expired' }],
  ])('a read refused by %s is sent again once with the renewed token', async (_, status, body) => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch)
      .mockResolvedValueOnce(refusedAs(status, body))
      .mockResolvedValueOnce(operatorResponse({ success: true, data: [] }) as Response);
    const response = await clientFetch('http://localhost:18000/rest/v1/rpc/get_orders_list', {
      method: 'POST', headers: { apikey: 'local-test-anon', Authorization: `Bearer ${old}` }, body: '{}',
    });
    expect(response.status).toBe(200);
    expect(refreshCalls()).toEqual([['refresh_jwt_token', { p_refresh_token: 'a'.repeat(64) }]]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sentBearer(1)).toBe(`Bearer ${renewed}`);
    expect((jest.mocked(global.fetch).mock.calls[1][1]!.headers as Record<string, string>).apikey).toBe('local-test-anon');
    expect(jest.mocked(global.fetch).mock.calls[1][1]!.body).toBe('{}');
    expect(secure.get('secure_auth_token')).toBe(renewed);
  });

  test('the refused answer of a read that is sent again is ended at once, not left in flight until its limit', async () => {
    const clientFetch = await authenticatedClientFetch();
    const signals: AbortSignal[] = [];
    jest.mocked(global.fetch).mockImplementation(async (_, init) => {
      signals.push(init!.signal!);
      return signals.length === 1
        ? refusedAs(401, { code: 'PGRST301', message: 'JWT expired' })
        : (operatorResponse({ success: true, data: [] }) as Response);
    });
    const response = await clientFetch('http://localhost:18000/rest/v1/customers', { headers: { Authorization: `Bearer ${old}` } });
    expect(response.status).toBe(200);
    expect(signals).toHaveLength(2);
    // discardBody: the refused request is over; the one sent again is not touched.
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    await response.json();
  });

  test('a write is not sent again: the session is renewed and the refusal is returned', async () => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch).mockResolvedValue(refusedAs(401, { code: 'PGRST301', message: 'JWT expired' }));
    const response = await clientFetch('http://localhost:18000/rest/v1/rpc/save_invoice', {
      method: 'POST', headers: { Authorization: `Bearer ${old}` }, body: '{}',
    });
    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(refreshCalls()).toHaveLength(1);
    expect(secure.get('secure_auth_token')).toBe(renewed);
    expect(sessionWasJustRenewed()).toBe(true);
    // Read, as the PostgREST client does: until then the write holds a server switch back.
    await response.json();
  });

  test('a write refused again with the token just issued is not a renewed session', async () => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch).mockResolvedValue(refusedAs(401, { code: 'PGRST303', message: 'JWT expired' }));
    const write = (token: string) => clientFetch('http://localhost:18000/rest/v1/rpc/save_invoice', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}',
    });
    await (await write(old)).json();
    expect(sessionWasJustRenewed()).toBe(true);
    await (await write(renewed)).json();
    expect(refreshCalls()).toHaveLength(1);
    expect(sessionWasJustRenewed()).toBe(false);
  });

  test('a read that is refused again after the renewal is not repeated further', async () => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch).mockResolvedValue(refusedAs(401, { code: 'PGRST301', message: 'JWT expired' }));
    const response = await clientFetch('http://localhost:18000/rest/v1/customers', { headers: { Authorization: `Bearer ${old}` } });
    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // The renewed token is refused as well: it is not renewed a second time.
    const again = await clientFetch('http://localhost:18000/rest/v1/customers', { headers: { Authorization: `Bearer ${renewed}` } });
    expect(again.status).toBe(401);
    expect(refreshCalls()).toHaveLength(1);
  });

  test('two reads refused together renew the session once', async () => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch).mockImplementation(async (_, init) =>
      (init!.headers as Record<string, string> | Headers as any).Authorization === `Bearer ${renewed}`
        ? (operatorResponse([]) as Response)
        : refusedAs(401, { message: 'JWT expired' })
    );
    const read = () => clientFetch('http://localhost:18000/rest/v1/items', { headers: { Authorization: `Bearer ${old}` } });
    const [first, second] = await Promise.all([read(), read()]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(refreshCalls()).toHaveLength(1);
  });

  test('another 401 is left alone', async () => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch).mockResolvedValue(refusedAs(401, { code: 'PGRST302', message: 'Anonymous access is disabled' }));
    const response = await clientFetch('http://localhost:18000/rest/v1/items', { headers: { Authorization: `Bearer ${old}` } });
    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('a document request made with the session fetch is renewed the same way', async () => {
    jest.mocked(global.fetch)
      .mockResolvedValueOnce(refusedAs(401, { success: false, error: 'Invalid or expired access token' }))
      .mockResolvedValueOnce(operatorResponse({ success: true }) as Response);
    const response = await createSessionReadFetch()('http://localhost:18000/functions/v1/get-config', {
      headers: new Headers({ Authorization: `Bearer ${old}`, 'Content-Type': 'application/json' }),
    });
    expect(response.status).toBe(200);
    expect(sentBearer(1)).toBe(`Bearer ${renewed}`);
  });
});

// ---------------------------------------------------------------------------
// M1-4: only a write holds a server switch back
// ---------------------------------------------------------------------------
test.each([
  [true, 'GET', '/rest/v1/customers?select=*'],
  [true, 'HEAD', '/rest/v1/customers'],
  [true, 'POST', '/rest/v1/rpc/get_dispatch_list_with_items'],
  [true, 'POST', '/rest/v1/rpc/search_customers'],
  [true, 'POST', '/rest/v1/rpc/check_grn_exists'],
  [true, 'POST', '/rest/v1/rpc/user_accessible_customers'],
  [true, 'POST', '/rest/v1/rpc/generate_invoice_data_for_grn_with_pricing'],
  [true, 'POST', '/storage/v1/object/sign/grn-images/a/b.jpg'],
  [false, 'POST', '/rest/v1/rpc/get_or_create_cart'],
  [false, 'POST', '/rest/v1/rpc/save_grn'],
  [false, 'POST', '/rest/v1/rpc/update_invoice'],
  [false, 'POST', '/rest/v1/rpc/set_my_language'],
  [false, 'POST', '/rest/v1/rpc/user_accessible_customers_admin'],
  [false, 'POST', '/storage/v1/object/grn-images/a/b.jpg'],
  [false, 'POST', '/functions/v1/print-grn-preprinted'],
  [false, 'PATCH', '/rest/v1/user_profiles?id=eq.1'],
  [false, 'DELETE', '/storage/v1/object/grn-images'],
])('isReadRequest is %s for %s %s', (expected, method, path) => {
  expect(isReadRequest(`http://localhost:18000${path}`, { method })).toBe(expected);
});

test('a hung list request does not hold a server switch back and is aborted by it', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  const clientFetch = await authenticatedClientFetch();
  const signals: AbortSignal[] = [];
  jest.mocked(global.fetch).mockImplementation((_, init) => {
    signals.push(init!.signal!);
    return new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('Aborted'))));
  });
  const list = clientFetch('http://localhost:18000/rest/v1/rpc/get_dispatch_list_with_items', { method: 'POST' });
  const select = clientFetch('http://localhost:18000/rest/v1/customers?select=*');
  expect(beginOperatorSwitch()).toBe(true);
  expect(signals.map(signal => signal.aborted)).toEqual([true, true]);
  await expect(list).rejects.toThrow('Aborted');
  await expect(select).rejects.toThrow('Aborted');
  endOperatorSwitch();
});

test('a save in flight still holds a server switch back', async () => {
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  const clientFetch = await authenticatedClientFetch();
  const slow = deferred<Response>();
  jest.mocked(global.fetch).mockImplementation(() => slow.promise);
  const save = clientFetch('http://localhost:18000/rest/v1/rpc/save_grn', { method: 'POST' });
  expect(beginOperatorSwitch()).toBe(false);
  slow.resolve(operatorResponse({ success: true }) as Response);
  await (await save).json();
  expect(beginOperatorSwitch()).toBe(true);
  endOperatorSwitch();
});

// RM-2: the time limit lives where every request flows, not in a helper no
// screen calls. A request the server never answers is aborted and reported.
describe('a request the server never answers', () => {
  const hang = () => {
    const signals: AbortSignal[] = [];
    jest.mocked(global.fetch).mockImplementation((_, init) => {
      signals.push(init!.signal!);
      return new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('Aborted'))));
    });
    return signals;
  };
  const outcome = (request: Promise<unknown>) => {
    const result: { error?: unknown; settled: boolean } = { settled: false };
    request.then(() => { result.settled = true; }, error => { result.error = error; result.settled = true; });
    return result;
  };
  beforeEach(async () => {
    await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test('a list request is aborted after the read limit and reported as a timeout', async () => {
    const clientFetch = await authenticatedClientFetch();
    const signals = hang();
    const list = outcome(clientFetch('http://localhost:18000/rest/v1/rpc/get_dispatch_list_with_items', { method: 'POST' }));
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.read - 1);
    expect(list.settled).toBe(false);
    expect(signals[0].aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(signals[0].aborted).toBe(true);
    expect(getAppErrorCode(list.error)).toBe('TIMEOUT');
    // postgrest-js sends a GET again unless the error says it was aborted.
    expect((list.error as { code?: string }).code).toBe('ABORT_ERR');
    // What the PostgREST client makes of it is still a timeout to the error tables.
    const wrapped = { message: `${(list.error as Error).name}: ${(list.error as Error).message}`, code: '' };
    expect(categorizeError(new Error(wrapped.message)).category).toBe('timeout');
    expect(isOfflineFailure(wrapped)).toBe(true);
  });

  test('a save stops holding a server switch back once its limit has passed', async () => {
    const clientFetch = await authenticatedClientFetch();
    hang();
    const save = outcome(clientFetch('http://localhost:18000/rest/v1/rpc/save_grn', { method: 'POST' }));
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.write - 1);
    expect(save.settled).toBe(false);
    expect(beginOperatorSwitch()).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(getAppErrorCode(save.error)).toBe('TIMEOUT');
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  test('a print or document request gets the longer limit and then fails in the app\'s words', async () => {
    const writeFetch = createAuthenticatedFetch();
    const signals = hang();
    const print = outcome(writeFetch('https://warehouse.example.test/functions/v1/print-grn-preprinted', { method: 'POST' }));
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.write);
    expect(print.settled).toBe(false);
    expect(beginOperatorSwitch()).toBe(false);
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.transfer - REQUEST_TIME_LIMIT_MS.write);
    expect(signals[0].aborted).toBe(true);
    expect(getAppErrorCode(print.error)).toBe('TIMEOUT');
    expect((print.error as Error).message).toBe(t('errors.network.requestTimedOut'));
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  test('the wait ends even when the platform fetch ignores the abort', async () => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch).mockImplementation(() => new Promise<Response>(() => {}));
    const read = outcome(clientFetch('http://localhost:18000/rest/v1/customers?select=*'));
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.read);
    expect(getAppErrorCode(read.error)).toBe('TIMEOUT');
  });

  test('a request that is answered in time leaves no timer behind', async () => {
    const clientFetch = await authenticatedClientFetch();
    jest.mocked(global.fetch).mockResolvedValue(operatorResponse({ success: true }) as Response);
    await (await clientFetch('http://localhost:18000/rest/v1/rpc/save_grn', { method: 'POST' })).json();
    expect(jest.getTimerCount()).toBe(0);
  });
});

// M02: the time limit and the request's tracked life run until the answer is complete, body
// included. expo/fetch, the global fetch since Expo SDK 57, resolves at the headers; a body that never completes must still
// time out, and a save whose body is still arriving must still hold a server switch back.
describe('an answer whose body never completes (M02)', () => {
  /** The headers arrive at once; the body only when `finish` is called. Its read ignores the abort. */
  const answerWithHeldBody = (status = 200) => {
    const signals: AbortSignal[] = [];
    let finish: (body: unknown) => void = () => {};
    jest.mocked(global.fetch).mockImplementation(async (_, init) => {
      signals.push(init!.signal!);
      const body = new Promise<unknown>(resolve => { finish = resolve; });
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => body,
        text: async () => JSON.stringify(await body),
      } as unknown as Response;
    });
    return { signals, finish: (body: unknown) => finish(body) };
  };
  const outcome = (read: Promise<unknown>) => {
    const result: { value?: unknown; error?: unknown; settled: boolean } = { settled: false };
    read.then(value => { result.value = value; result.settled = true; }, error => { result.error = error; result.settled = true; });
    return result;
  };
  beforeEach(async () => {
    await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test('a read: the body read fails as a timeout once the read limit has passed, and the request is aborted', async () => {
    const clientFetch = await authenticatedClientFetch();
    const { signals } = answerWithHeldBody();
    const response = await clientFetch('http://localhost:18000/rest/v1/rpc/get_dispatch_list_with_items', { method: 'POST' });
    const body = outcome(response.json());
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.read - 1);
    expect(body.settled).toBe(false);
    expect(signals[0].aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(2);
    expect(signals[0].aborted).toBe(true);
    expect(body.error).toBeInstanceOf(RequestTimeoutError);
    // postgrest-js leaves an aborted request alone instead of sending it again.
    expect((body.error as { code?: string }).code).toBe('ABORT_ERR');
  });

  test('a save: holds a server switch back while its body is arriving, until the write limit', async () => {
    const clientFetch = await authenticatedClientFetch();
    const { signals } = answerWithHeldBody();
    const response = await clientFetch('http://localhost:18000/rest/v1/rpc/save_grn', { method: 'POST' });
    const body = outcome(response.json());
    expect(beginOperatorSwitch()).toBe(false);
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.write - 1);
    expect(body.settled).toBe(false);
    expect(signals[0].aborted).toBe(false);
    expect(beginOperatorSwitch()).toBe(false);
    await jest.advanceTimersByTimeAsync(2);
    expect(signals[0].aborted).toBe(true);
    expect(body.error).toBeInstanceOf(RequestTimeoutError);
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  test('a read whose body is arriving does not hold a server switch back: the switch aborts it and the read fails', async () => {
    const clientFetch = await authenticatedClientFetch();
    const { signals } = answerWithHeldBody();
    const response = await clientFetch('http://localhost:18000/rest/v1/customers?select=*');
    const body = outcome(response.json());
    expect(beginOperatorSwitch()).toBe(true);
    expect(signals[0].aborted).toBe(true);
    await flush();
    // The platform's read ignored the abort; the read fails all the same.
    expect(body.error).toMatchObject({ name: 'AbortError', message: 'Aborted' });
    endOperatorSwitch();
  });

  test('a save whose session ends while its body is arriving (a forced sign-out) holds the switch back until the body is in, then its answer is dropped', async () => {
    const clientFetch = await authenticatedClientFetch();
    const held = answerWithHeldBody();
    const response = await clientFetch('http://localhost:18000/rest/v1/rpc/save_grn', { method: 'POST' });
    const body = outcome(response.json());
    // forceLeaveFacility (src/store/operatorSwitch.ts) signs out without the switch gate:
    // the session generation moves while the save is still in flight.
    advanceSessionGeneration();
    expect(beginOperatorSwitch()).toBe(false);
    held.finish({ success: true });
    await flush();
    expect((body.error as Error).message).toBe('Session changed');
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
    clearAuthenticatedClientCache();
  });

  test('a 401 whose copy for the key check never finishes stops holding a switch once its own body is read', async () => {
    const clientFetch = await authenticatedClientFetch();
    let copies = 0;
    jest.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ code: 'PGRST301', message: 'JWT invalid' }),
      clone: () => {
        copies += 1;
        return { json: () => new Promise(() => undefined) };
      },
    } as unknown as Response);
    const response = await clientFetch('http://localhost:18000/rest/v1/rpc/save_grn', { method: 'POST' });
    // noteUnauthorized reads a copy, outside the request's tracked life.
    expect(copies).toBe(1);
    expect(beginOperatorSwitch()).toBe(false);
    await response.json();
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  test.each([
    ['a save answered 204 No Content', 'http://localhost:18000/rest/v1/rpc/save_grn', 'POST', 204],
    ['a HEAD count', 'http://localhost:18000/rest/v1/customers?select=*', 'HEAD', 200],
  ])('%s has no body: the request ends with its headers', async (_, url, method, status) => {
    const clientFetch = await authenticatedClientFetch();
    answerWithHeldBody(status);
    const response = await clientFetch(url, { method });
    expect(response.status).toBe(status);
    expect(jest.getTimerCount()).toBe(0);
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  test('a print or document answer whose body never completes fails in the app\'s words at the longer limit', async () => {
    const writeFetch = createAuthenticatedFetch();
    const { signals } = answerWithHeldBody();
    const response = await writeFetch('https://warehouse.example.test/functions/v1/print-grn-preprinted', { method: 'POST' });
    const body = outcome(response.json());
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.write + 1);
    expect(body.settled).toBe(false);
    expect(beginOperatorSwitch()).toBe(false);
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.transfer - REQUEST_TIME_LIMIT_MS.write);
    expect(signals[0].aborted).toBe(true);
    expect(getAppErrorCode(body.error)).toBe('TIMEOUT');
    expect((body.error as Error).message).toBe(t('errors.network.requestTimedOut'));
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  test('session lifecycle traffic (a refresh) is held and limited the same way while its body is arriving', async () => {
    initializeSupabase('http://localhost:18000', 'held-body-anon');
    const anonFetch = jest.mocked(createClient).mock.calls.at(-1)![2]!.global!.fetch!;
    const { signals } = answerWithHeldBody();
    const response = await anonFetch('http://localhost:18000/rest/v1/rpc/refresh_jwt_token', { method: 'POST' });
    const body = outcome(response.json());
    expect(beginOperatorSwitch()).toBe(false);
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS.write + 1);
    expect(signals[0].aborted).toBe(true);
    expect(body.error).toBeInstanceOf(RequestTimeoutError);
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  test('a refresh answer that arrives after the session changed still reaches its caller, which reconciles it', async () => {
    initializeSupabase('http://localhost:18000', 'held-body-anon');
    const anonFetch = jest.mocked(createClient).mock.calls.at(-1)![2]!.global!.fetch!;
    const held = answerWithHeldBody();
    const response = await anonFetch('http://localhost:18000/rest/v1/rpc/refresh_jwt_token', { method: 'POST' });
    const body = outcome(response.json());
    advanceSessionGeneration();
    held.finish({ success: true });
    await flush();
    expect(body).toEqual({ settled: true, value: { success: true } });
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
    clearAuthenticatedClientCache();
  });
});

// Backend migration 44: the limits the server applies to sign-in codes.
describe('sign-in code limits from the server (migration 44)', () => {
  const refused = (body: Record<string, unknown>, status = 429, headers: Record<string, string> = {}) =>
    ({ ...operatorResponse(body, status), headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null } }) as unknown as Response;

  beforeEach(() => {
    jest.mocked(checkOTPRateLimit).mockResolvedValue({ allowed: true });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => setLanguage('en'));

  it('a request refused with retry_after_seconds returns the wait as a number', async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      refused({ success: false, error: 'Please wait before requesting another OTP.', retry_after_seconds: 900 }, 429, { 'Retry-After': '900' })
    );
    const result = await signInWithPhone('+910000000001');
    expect(result).toMatchObject({ success: false, rateLimited: true, retryAfterSeconds: 900, errorCode: 'otp_wait' });
    // 15 minutes is said in minutes, not as "900 seconds".
    expect(result.error).toBe(t('errors.auth.otpWaitMinutes', { minutes: '15' }));
  });

  it('a short wait is said in seconds', async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      refused({ success: false, error: 'Please wait before requesting another OTP.', retry_after_seconds: 42 })
    );
    const result = await signInWithPhone('+910000000001');
    expect(result).toMatchObject({ success: false, rateLimited: true, retryAfterSeconds: 42 });
    expect(result.error).toBe(t('errors.auth.otpWaitSeconds', { seconds: '42' }));
  });

  it('reads the Retry-After header when the body has no number', async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      refused({ success: false, error: 'Please wait before requesting another OTP.' }, 429, { 'Retry-After': '60' })
    );
    expect(await signInWithPhone('+910000000001')).toMatchObject({ success: false, rateLimited: true, retryAfterSeconds: 60 });
  });

  it('a request refused without a wait ("try again later") has no countdown', async () => {
    jest.mocked(global.fetch).mockResolvedValue(refused({ success: false, error: 'Too many OTP requests. Try again later.' }));
    const result = await signInWithPhone('+910000000001') as { error: string; retryAfterSeconds?: number; errorCode?: string };
    expect(result.error).toBe(t('errors.auth.otpTooMany'));
    expect(result.errorCode).toBe('otp_rate_limited');
    expect(result.retryAfterSeconds).toBeUndefined();
  });

  it('a verification refused for too many requests says so, in the app language', async () => {
    jest.mocked(global.fetch).mockResolvedValue(refused({ success: false, error: 'Too many OTP requests. Try again later.' }));
    setLanguage('gu');
    const result = await verifyOTP('0000000002', '123456');
    expect(result).toMatchObject({ success: false, errorCode: 'otp_rate_limited', error: t('errors.auth.otpTooMany', undefined, 'gu') });
    expect((result as { error: string }).error).toMatch(/[઀-૿]/);
  });

  it('a verification refused for too many new access requests says "tomorrow"', async () => {
    jest.mocked(global.fetch).mockResolvedValue(refused({ success: false, error: 'Too many new access requests. Try again tomorrow.' }));
    const result = await verifyOTP('0000000002', '123456');
    expect(result).toMatchObject({ success: false, errorCode: 'enrollment_limited', error: t('errors.auth.enrollmentLimited') });
    setLanguage('gu');
    expect(await verifyOTP('0000000002', '123456')).toMatchObject({ error: t('errors.auth.enrollmentLimited', undefined, 'gu') });
  });

  it('a wrong code is still an ordinary failure', async () => {
    jest.mocked(global.fetch).mockResolvedValue(refused({ success: false, error: 'Invalid or expired OTP' }, 400));
    const result = await verifyOTP('0000000002', '123456') as { error: string; errorCode?: string };
    expect(result.error).toBe('Invalid or expired OTP');
    expect(result.errorCode).toBeUndefined();
  });
});

describe('P2-AUTH-002: an enrollment token written late is refused after a switch', () => {
  const pendingAnswer = () =>
    operatorResponse({
      success: true,
      data: { action: 'pending', enrollment_token: 'old-facility-enrollment', user: { enrollment_status: 'pending' } },
    }) as Response;

  it('a write that lands after the session changed is deleted and the sign-in is refused', async () => {
    jest.mocked(global.fetch).mockResolvedValue(pendingAnswer());
    const release = deferred<void>();
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      if (key === 'secure_enrollment_token') await release.promise;
      secure.set(key, value);
    });
    const verifying = verifyOTP('0000000002', '654321');
    await flush();
    await flush();
    // What a server switch does: the logout advances the session generation.
    // (Its cleanup queues behind the held write, so it is awaited after the release.)
    const switching = signOut({ localOnly: true });
    release.resolve();
    const result = await verifying;
    await switching;
    expect(result).toMatchObject({ success: false, error: t('errors.auth.sessionChanged') });
    expect(secure.has('secure_enrollment_token')).toBe(false);
    expect(await getPendingEnrollmentToken()).toBeNull();
  });

  it('a normal pending sign-in still stores the token and says pendingEnrollment', async () => {
    jest.mocked(global.fetch).mockResolvedValue(pendingAnswer());
    const result = await verifyOTP('0000000002', '654321');
    expect(result).toMatchObject({ success: true, data: { action: 'pending', pendingEnrollment: true } });
    expect(await getPendingEnrollmentToken()).toBe('old-facility-enrollment');
  });
});

describe('P2-AUTH-001: a failed local facility sign-out cannot sign the person back in', () => {
  const failSessionDeletes = () =>
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
      if (key === 'secure_signed_out') {
        secure.delete(key);
        return;
      }
      throw new Error('Native storage refused the delete');
    });

  it('reports failure, leaves a marker, and the next read finds no session', async () => {
    await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
    rpc.mockRejectedValue(new Error('Offline'));
    failSessionDeletes();
    expect(await signOut()).toEqual({ success: false });
    expect(secure.has('secure_signed_out')).toBe(true);
    expect(secure.has('secure_refresh_token')).toBe(true);
    rpc.mockClear();
    // Next app start, storage works again.
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
      secure.delete(key);
    });
    expect(await getStoredToken()).toEqual({ isValid: false });
    expect(await ensureValidTokens()).toBe(false);
    expect(rpc).not.toHaveBeenCalledWith('refresh_session', expect.anything());
    expect(secure.has('secure_refresh_token')).toBe(false);
    expect(secure.has('secure_auth_token')).toBe(false);
    expect(secure.has('secure_signed_out')).toBe(false);
  });

  it('a failing read at start still sends no bearer: the marker is kept while the keys remain', async () => {
    await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
    rpc.mockRejectedValue(new Error('Offline'));
    failSessionDeletes();
    await signOut();
    expect(await getStoredToken()).toEqual({ isValid: false });
    expect(await ensureValidTokens()).toBe(false);
    expect(secure.has('secure_signed_out')).toBe(true);
  });

  it('a clean sign-out succeeds and leaves no marker; a new sign-in then works', async () => {
    await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
    rpc.mockRejectedValue(new Error('Offline'));
    expect(await signOut()).toEqual({ success: true });
    expect(secure.size).toBe(0);
    const fresh = jwt();
    await storeTokens(fresh, 'b'.repeat(64), Date.now() + 3600000);
    const stored = await getStoredToken();
    expect(stored).toMatchObject({ isValid: true, authToken: fresh, refreshToken: 'b'.repeat(64) });
  });

  it('an old marker never blocks a new sign-in', async () => {
    secure.set('secure_signed_out', '*');
    await storeTokens(jwt(), 'c'.repeat(64), Date.now() + 3600000);
    expect(secure.has('secure_signed_out')).toBe(false);
    expect(await getStoredToken()).toMatchObject({ isValid: true, refreshToken: 'c'.repeat(64) });
  });
});
