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
  endOperatorSwitch,
  getAuthenticatedClient,
  createAuthenticatedFetch,
  createSessionReadFetch,
  storeTokens,
  verifyOTP,
} from '../supabaseConfig';

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
