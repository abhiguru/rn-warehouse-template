import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import {
  ensureValidTokens,
  getCachedUserProfile,
  getStoredToken,
  initializeSupabase,
  refreshCustomJWT,
  signOut,
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
}));

const secure = new Map<string, string>();
const rpc = jest.fn();
const from = jest.fn();
const jwt = (expires = Math.floor(Date.now() / 1000) + 3600) =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', exp: expires, role: 'authenticated' }))}.test-signature`;

beforeEach(async () => {
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
  rpc.mockImplementation(async name =>
    name === 'verify_otp_or_register'
      ? {
          data: {
            success: true,
            data: {
              user: { role: 'customer' },
              session: { access_token: access, refresh_token: refresh },
            },
          },
          error: null,
        }
      : { data: [], error: null }
  );
  const result = await verifyOTP('0000000002', '123456');
  expect(result.success).toBe(true);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /123456|test-signature|eeeeeeee/
  );
  log.mockRestore();
});
