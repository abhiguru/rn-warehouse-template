/**
 * Sign-in with a code from the facility (`operator-otp/break-glass`, backend migration 132) and the end of its session.
 */
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ clearSecureSessionMarker: jest.fn() }));
jest.mock('@/utils/otpRateLimiter', () => ({
  checkOTPRateLimit: jest.fn(),
  recordOTPRequest: jest.fn(),
  clearAllRateLimits: jest.fn(async () => {}),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import {
  beginOperatorSwitch,
  endOperatorSwitch,
  breakGlassSignIn,
  clearStoredTokens,
  getPendingEnrollmentToken,
  getStoredToken,
  initializeSupabase,
  signOut,
  storeTokens,
  verifyOTP,
} from '../supabaseConfig';
import { SESSION_ENDS_AT_KEY, explainEndedSession, readSessionEnd, scheduleSessionEnd } from '../sessionEnd';

const CENTRAL = 'https://identity.example.test';
jest.mock('../envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));

const secure = new Map<string, string>();
const rpc = jest.fn();
const originalFetch = global.fetch;
const answer = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => data,
  }) as unknown as Response;
const jwt = (subject = 'profile-user-1') =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: subject, session_id: 'session-1', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }))}.test-signature`;
const ENDS = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const loginData = () => ({
  action: 'login',
  user: { id: 'profile-1', auth_user_id: 'profile-user-1', name: 'Asha Fictional', role: 'customer' },
  session: { access_token: jwt(), refresh_token: 'e'.repeat(64), session_ends_at: ENDS },
});

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: ['customer-1'], error: null });
  await AsyncStorage.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  jest.mocked(createClient).mockReturnValue({ rpc, from: jest.fn() } as unknown as ReturnType<typeof createClient>);
  initializeSupabase('http://localhost:18000', 'local-test-anon');
  global.fetch = jest.fn() as typeof fetch;
  endOperatorSwitch();
});
afterAll(() => { global.fetch = originalFetch; });


const fail = (status: number, code?: string) => answer({ success: false, error: 'x', ...(code ? { code } : {}) }, status);

it('posts the phone and the code with the anon key and stores the session with its end', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  const result = await breakGlassSignIn('+919000000002', '482913');
  expect(result).toMatchObject({ success: true });
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:18000/functions/v1/operator-otp/break-glass',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ phone_number: '919000000002', code: '482913' }),
      headers: expect.objectContaining({ apikey: 'local-test-anon', Authorization: 'Bearer local-test-anon' }),
    })
  );
  expect((await getStoredToken()).isValid).toBe(true);
  expect(await readSessionEnd()).toBe(Date.parse(ENDS));
});

it.each([
  ['invalid_code', 400, 'refused'],
  ['code_used', 400, 'refused'],
  ['code_expired', 400, 'refused'],
  ['code_locked', 400, 'refused'],
  ['customer_not_allowed', 403, 'customer'],
  [undefined, 429, 'rate_limited'],
  [undefined, 503, 'unavailable'],
  ['invalid_request', 400, 'failed'],
] as const)('maps %s (%s) to %s and stores no session', async (code, status, reason) => {
  jest.mocked(global.fetch).mockResolvedValue(fail(status, code));
  expect(await breakGlassSignIn('+919000000002', '482913')).toEqual({ success: false, reason });
  expect((await getStoredToken()).isValid).toBe(false);
  expect(await readSessionEnd()).toBeNull();
});

it.each([
  [429, 'rate_limited'],
  [503, 'unavailable'],
  [404, 'unavailable'],
  [502, 'failed'],
] as const)('maps a %s whose body is not JSON to %s, not to a lost connection', async (status, reason) => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
  } as unknown as Response);
  expect(await breakGlassSignIn('+919000000002', '482913')).toEqual({ success: false, reason });
  expect((await getStoredToken()).isValid).toBe(false);
});

it('reports a lost connection as network', async () => {
  jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));
  expect(await breakGlassSignIn('+919000000002', '482913')).toEqual({ success: false, reason: 'network' });
});

it('does not keep a session that has no end', async () => {
  const data = loginData();
  delete (data.session as { session_ends_at?: string }).session_ends_at;
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data }));
  expect(await breakGlassSignIn('+919000000002', '482913')).toEqual({ success: false, reason: 'failed' });
  expect((await getStoredToken()).isValid).toBe(false);
});

it('removes the end together with the tokens', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  await breakGlassSignIn('+919000000002', '482913');
  await clearStoredTokens();
  expect(secure.has(SESSION_ENDS_AT_KEY)).toBe(false);
});

it('writes the end before the tokens, and when it cannot be written revokes the session on the server and keeps no tokens', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  const writes: string[] = [];
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    writes.push(key);
    if (key === SESSION_ENDS_AT_KEY) throw new Error('secure store full');
    secure.set(key, value);
  });
  expect(await breakGlassSignIn('+919000000002', '482913')).toEqual({ success: false, reason: 'failed' });
  expect(writes).toEqual([SESSION_ENDS_AT_KEY]);
  expect(rpc).toHaveBeenCalledWith('logout_session', expect.objectContaining({ p_refresh_token: 'e'.repeat(64) }));
  expect((await getStoredToken()).isValid).toBe(false);
});

describe('the end of the session', () => {
  afterEach(() => jest.useRealTimers());

  it('signs out at the stored time', () => {
    jest.useFakeTimers();
    const onEnd = jest.fn();
    scheduleSessionEnd(Date.now() + 60_000, onEnd);
    jest.advanceTimersByTime(59_000);
    expect(onEnd).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('signs out at once when the time has passed, and can be cancelled before it', () => {
    jest.useFakeTimers();
    const late = jest.fn();
    scheduleSessionEnd(Date.now() - 1, late);
    expect(late).toHaveBeenCalledTimes(1);
    const cancelled = jest.fn();
    scheduleSessionEnd(Date.now() + 1000, cancelled)();
    jest.advanceTimersByTime(5000);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('explains a refusal at the end, and leaves other reasons alone', async () => {
    secure.set(SESSION_ENDS_AT_KEY, String(Date.now() - 1000));
    expect(await explainEndedSession('Session rejected')).toBe('Your facility code session has ended. Sign in again.');
    secure.set(SESSION_ENDS_AT_KEY, String(Date.now() + 3600_000));
    expect(await explainEndedSession('Session rejected')).toBe('Session rejected');
    secure.delete(SESSION_ENDS_AT_KEY);
    expect(await explainEndedSession('Session rejected')).toBe('Session rejected');
  });
});
