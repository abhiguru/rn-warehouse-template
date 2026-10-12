/**
 * `central-exchange` at a facility (backend docs/CENTRAL_LOGIN.md): the request,
 * and that its answer is handled by the code that handles `operator-otp/verify`.
 */
import { operatorResumeGate } from '../operatorResume';
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
  exchangeCentralIdentity,
  getPendingEnrollmentToken,
  getStoredToken,
  initializeSupabase,
  signOut,
  storeTokens,
  verifyOTP,
} from '../supabaseConfig';
import { CENTRAL_SECURE_KEYS } from '../centralSession';

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
const IDENTITY_TOKEN = 'identity.token.for-this-facility';
const loginData = () => ({
  action: 'login',
  user: { id: 'profile-1', auth_user_id: 'profile-user-1', name: 'Asha Fictional', role: 'customer' },
  session: { access_token: jwt(), refresh_token: 'e'.repeat(64) },
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

it('posts the identity token to the facility with its anon key, like the SMS sign-in', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  await exchangeCentralIdentity(IDENTITY_TOKEN);
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:18000/functions/v1/central-exchange',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ identity_token: IDENTITY_TOKEN }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        apikey: 'local-test-anon',
        Authorization: 'Bearer local-test-anon',
      }),
    })
  );
});

it('sends the facility code only for the linking step', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  await exchangeCentralIdentity(IDENTITY_TOKEN, { otpCode: '482913' });
  expect(jest.mocked(global.fetch).mock.calls[0][1]?.body).toBe(JSON.stringify({ identity_token: IDENTITY_TOKEN, otp_code: '482913' }));
});

it('is a facility call: it waits for the identity gate and is refused during a server switch', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  expect(beginOperatorSwitch()).toBe(true);
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({ success: false, code: 'session_changed' });
  expect(global.fetch).not.toHaveBeenCalled();
  endOperatorSwitch();

  operatorResumeGate.suspend();
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toMatchObject({ success: false });
  expect(global.fetch).not.toHaveBeenCalled();
  const remove = operatorResumeGate.installVerifier(async () => true);
  expect(await operatorResumeGate.ensureVerified()).toBe(true);
  remove();
});

it('`login` stores the facility session and the profile exactly as an SMS sign-in does', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  const exchanged = await exchangeCentralIdentity(IDENTITY_TOKEN);
  expect(exchanged).toMatchObject({
    success: true,
    data: { action: 'login', customAuth: true, userProfile: { id: 'profile-1', assignedCustomerIds: ['customer-1'] } },
  });
  const afterExchange = new Map(secure);
  expect((await getStoredToken()).refreshToken).toBe('e'.repeat(64));

  await signOut({ localOnly: true });
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  const verified = await verifyOTP('9000000001', '482913');
  expect(verified).toMatchObject({ success: true, data: { action: 'login', userProfile: { id: 'profile-1' } } });
  expect([...secure.keys()].sort()).toEqual([...afterExchange.keys()].sort());
  // The facility session never lands in a central key.
  expect([...secure.keys()].filter(key => key.startsWith('secure_central_'))).toEqual([]);
});

it('`pending` keeps the enrollment token for the waiting screen and stores no session', async () => {
  jest.mocked(global.fetch).mockResolvedValue(
    answer({ success: true, data: { action: 'pending', enrollment_token: 'enrollment-secret', expires_at: '2099-01-01T00:00:00Z', user: {} } })
  );
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({
    success: true,
    data: { action: 'pending', pendingEnrollment: true, userProfile: null },
  });
  expect(await getPendingEnrollmentToken()).toBe('enrollment-secret');
  expect(await getStoredToken()).toEqual({ isValid: false });
});

it.each([
  [503, 'central_unavailable'],
  [401, 'invalid_identity_token'],
  [401, 'identity_token_used'],
  [403, 'account_unavailable'],
  [409, 'link_required'],
  [400, 'invalid_otp'],
  [409, 'identity_conflict'],
  [429, 'enrollment_limited'],
  [503, 'central_keys_unavailable'],
  [400, 'invalid_request'],
  [503, 'unavailable'],
])('a %i answer with code %s is returned as that code, and nothing is stored', async (status, code) => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: false, code, error: 'English text' }, status));
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({ success: false, code });
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(await getPendingEnrollmentToken()).toBeNull();
});

it('a rate limit carries the wait the facility named', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: false, code: 'rate_limited', error: 'x' }, 429, { 'Retry-After': '900' }));
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({ success: false, code: 'rate_limited', retryAfterSeconds: 900 });
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: false, error: 'x' }, 429));
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({ success: false, code: 'rate_limited' });
});

it('an answer without a known code, or no answer at all, is still a plain result', async () => {
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: false, code: 'something_new', error: 'x' }, 418));
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({ success: false, code: 'failed' });
  jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({ success: false, code: 'network' });
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: { action: 'login', user: {}, session: {} } }));
  expect(await exchangeCentralIdentity(IDENTITY_TOKEN)).toEqual({ success: false, code: 'failed' });
});

it('never writes the identity token or a session token to the log', async () => {
  const spies = (['log', 'warn', 'error'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => {}));
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  await exchangeCentralIdentity(IDENTITY_TOKEN, { otpCode: '482913' });
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: false, code: 'invalid_identity_token', error: 'x' }, 401));
  await exchangeCentralIdentity(IDENTITY_TOKEN);
  const logged = JSON.stringify(spies.flatMap(spy => spy.mock.calls));
  expect(logged).not.toMatch(/identity\.token|482913|test-signature|eeeeeeee/);
  spies.forEach(spy => spy.mockRestore());
});

it('ending or replacing a facility session leaves the central session keys alone', async () => {
  for (const key of Object.values(CENTRAL_SECURE_KEYS)) secure.set(key, `central-${key}`);
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  await signOut({ localOnly: true });
  jest.mocked(global.fetch).mockResolvedValue(answer({ success: true, data: loginData() }));
  await exchangeCentralIdentity(IDENTITY_TOKEN);
  await signOut({ localOnly: true });
  for (const key of Object.values(CENTRAL_SECURE_KEYS)) expect(secure.get(key)).toBe(`central-${key}`);
  expect([...secure.keys()].sort()).toEqual(Object.values(CENTRAL_SECURE_KEYS).sort());
});
