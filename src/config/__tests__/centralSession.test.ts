/**
 * The central session against the contract in the central service's docs/API.md:
 * the shape of every request, where the tokens are kept, one refresh at a time,
 * and what each error answer says on screen.
 */
import fs from 'fs';
import path from 'path';
import * as SecureStore from 'expo-secure-store';
import {
  CENTRAL_REQUEST_TIMEOUT_MS,
  CENTRAL_SECURE_KEYS,
  RESTORE_RETRY_MS,
  retryCentralRestoreIfNeeded,
  deleteCentralAccount,
  fetchCentralProfile,
  fetchFacilityCatalogue,
  readCatalogueToken,
  refreshCentralSession,
  requestCentralCode,
  requestFacilityToken,
  resetCentralSessionForTests,
  restoreCentralSession,
  signOutCentral,
  updateCentralName,
  verifyCentralCode,
} from '../centralSession';
import { getCentralState, resetCentralStateForTests, setCentralState } from '../centralState';
import { setLanguage } from '@/i18n';

const ORIGIN = 'https://identity.example.test';
let mockConfig: { origin: string; issuer: string } | null = { origin: ORIGIN, issuer: ORIGIN };
jest.mock('../envConfig', () => ({
  getCentralLoginConfig: () => mockConfig,
  isCentralLoginConfigured: () => mockConfig !== null,
  TERMS_VERSION: '2025-12',
}));

const secure = new Map<string, string>();
const originalFetch = global.fetch;
const fetchMock = jest.fn();

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);
/**
 * When every access token of this file was issued, read from the clock once. Tokens are
 * compared as strings: the one the service stand-in mints against the one a later call must
 * send, which the assertion builds again. A clock read at each of those two moments gives
 * different strings when a second boundary falls between them. (centralSession.ts takes only
 * `exp - iat` from a token, the same for any issue time.)
 */
const ISSUED_AT = nowSeconds();
/** An access token as the service issues it: 15 minutes from `issuedAt`. */
const accessToken = (label: string, issuedAt = ISSUED_AT) =>
  `${b64url({ alg: 'ES256', typ: 'central-access+jwt', kid: 'k1' })}.${b64url({ iss: ORIGIN, aud: ORIGIN, sub: 'user-1', sid: 'family-1', iat: issuedAt, exp: issuedAt + 900, label })}.signature`;
const refreshToken = (digit: string) => digit.repeat(64);
const user = { id: 'user-1', phone_number: '919000000001', name: null, created_at: '2026-10-12T06:00:12.000Z' };
const session = (label: string, refresh: string, issuedAt = ISSUED_AT) => ({
  access_token: accessToken(label, issuedAt),
  access_expires_at: new Date((issuedAt + 900) * 1000).toISOString(),
  refresh_token: refreshToken(refresh),
  refresh_expires_at: '2026-12-11T06:00:12.000Z',
});

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
const reply = ({ status = 200, body = {}, headers = {} }: Reply = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  url: '',
  headers: { get: (name: string) => headers[name] ?? null },
  json: async () => body,
});
const refused = (status: number, code: string, headers?: Record<string, string>) =>
  reply({ status, body: { error: { code, message: 'English text for a developer' } }, headers });

/** Answers by path; a path with several answers gives them in order. */
function serve(routes: Record<string, Reply | Reply[] | (() => Promise<unknown>)>) {
  const counters = new Map<string, number>();
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const key = `${init.method} ${url.replace(ORIGIN, '')}`;
    const route = routes[key];
    if (route === undefined) throw new Error(`unexpected request ${key}`);
    if (typeof route === 'function') return route();
    if (!Array.isArray(route)) return reply(route);
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    return reply(route[Math.min(index, route.length - 1)]);
  });
}
const calls = (pathAndMethod: string) =>
  fetchMock.mock.calls.filter(([url, init]) => `${init.method} ${String(url).replace(ORIGIN, '')}` === pathAndMethod);
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
const headersOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

/** A stored session whose access token expires `secondsLeft` from now on the device clock. */
function storeSession(label: string, refresh: string, secondsLeft: number) {
  secure.set(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken(label));
  secure.set(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, refreshToken(refresh));
  secure.set(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(Date.now() + secondsLeft * 1000));
  secure.set(CENTRAL_SECURE_KEYS.USER, JSON.stringify({ id: 'user-1', phoneNumber: '919000000001', name: null, createdAt: '' }));
}

beforeEach(async () => {
  secure.clear();
  mockConfig = { origin: ORIGIN, issuer: ORIGIN };
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  resetCentralSessionForTests();
  resetCentralStateForTests();
});
afterEach(() => setLanguage('en'));
afterAll(() => { global.fetch = originalFetch; });

async function signedIn(secondsLeft = 600) {
  storeSession('first', '1', secondsLeft);
  await restoreCentralSession();
  expect(getCentralState().status).toBe('signedIn');
}

describe('sign-in', () => {
  it('asks for a code with the number only, without sign-in and without following a redirect', async () => {
    serve({ 'POST /v1/otp/request': { body: { request_id: 'r1', expires_at: '2026-10-12T06:05:00.000Z', resend_after_seconds: 60 } } });
    const result = await requestCentralCode('+919000000001');
    expect(result).toEqual({ ok: true, resendAfterSeconds: 60, expiresAt: '2026-10-12T06:05:00.000Z' });
    const [call] = calls('POST /v1/otp/request');
    expect(bodyOf(call)).toEqual({ phone_number: '919000000001' });
    expect(headersOf(call)['Content-Type']).toBe('application/json');
    expect(headersOf(call).Authorization).toBeUndefined();
    expect((call[1] as RequestInit).redirect).toBe('error');
    expect((call[1] as RequestInit).signal).toBeDefined();
  });

  it('verifies the code with the terms version and stores the session under its own keys only', async () => {
    serve({ 'POST /v1/otp/verify': { body: { user, session: session('first', '1') } } });
    const result = await verifyCentralCode('+919000000001', '482913', '2025-12');
    expect(result).toEqual({ ok: true, user: { id: 'user-1', phoneNumber: '919000000001', name: null, createdAt: user.created_at } });
    expect(bodyOf(calls('POST /v1/otp/verify')[0])).toEqual({ phone_number: '919000000001', otp_code: '482913', terms_version: '2025-12' });
    expect([...secure.keys()].sort()).toEqual(Object.values(CENTRAL_SECURE_KEYS).sort());
    // Never in a facility session key (src/config/supabaseConfig.ts).
    for (const key of secure.keys()) expect(key.startsWith('secure_central_')).toBe(true);
    expect(secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(refreshToken('1'));
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-1' } });
  });

  it('a wrong code leaves the person signed out and nothing stored', async () => {
    serve({ 'POST /v1/otp/verify': { status: 400, body: { error: { code: 'invalid_code', message: 'x' } } } });
    const result = await verifyCentralCode('9000000001', '000000', '2025-12');
    expect(result).toMatchObject({ ok: false, code: 'invalid_code', message: 'That code is wrong or has expired. Check it, or ask for a new code.' });
    expect(secure.size).toBe(0);
    expect(getCentralState().status).not.toBe('signedIn');
  });

  it('reads a stored session at start without calling the service', async () => {
    await restoreCentralSession();
    expect(getCentralState().status).toBe('signedOut');
    await signedIn();
    expect(getCentralState().user).toMatchObject({ id: 'user-1', phoneNumber: '919000000001' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('error answers in the app\'s words', () => {
  const sending = (answer: ReturnType<typeof refused>) => {
    fetchMock.mockResolvedValue(answer);
    return requestCentralCode('9000000001');
  };

  it.each([
    ['resend_wait', 429, { 'Retry-After': '42' }, 'Please wait 42 seconds before requesting another code.', 42],
    ['resend_wait', 429, undefined, 'Please wait before requesting another code.', undefined],
    ['rate_limited', 429, { 'Retry-After': '900' }, 'Too many attempts. Try again in 15 minutes.', 900],
    ['rate_limited', 429, { 'Retry-After': '30' }, 'Too many attempts. Try again in 30 seconds.', 30],
    ['rate_limited', 429, undefined, 'Too many attempts. Try again later.', undefined],
    ['too_many_attempts', 429, undefined, 'Too many wrong codes. Ask for a new code.', undefined],
    ['invalid_code', 400, undefined, 'That code is wrong or has expired. Check it, or ask for a new code.', undefined],
    ['sms_unavailable', 503, undefined, "The code couldn't be sent just now. Try again in a few minutes.", undefined],
    ['unknown_facility', 400, undefined, "This cold storage is not on the association's list, so association sign-in can't be used there.", undefined],
    ['invalid_request', 400, undefined, "The sign-in service didn't accept the request. Check what you entered and try again.", undefined],
    ['internal_error', 500, undefined, "The association's sign-in service is not available right now. Try again later.", undefined],
  ])('%s (%i)', async (code, status, headers, message, wait) => {
    const result = await sending(refused(status as number, code as string, headers as Record<string, string> | undefined));
    expect(result).toMatchObject({ ok: false, code: code === 'internal_error' ? 'unavailable' : code, message });
    expect((result as { retryAfterSeconds?: number }).retryAfterSeconds).toBe(wait);
  });

  it('no connection is a network failure, never a raw error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await requestCentralCode('9000000001')).toMatchObject({
      ok: false,
      code: 'network',
      message: "Couldn't reach the association's sign-in service. Check your connection and try again.",
    });
  });

  it('an answer from another address is not taken for the service\'s', async () => {
    fetchMock.mockResolvedValue({ ...reply({ body: { request_id: 'r1' } }), url: 'https://elsewhere.example.test/v1/otp/request' });
    expect(await requestCentralCode('9000000001')).toMatchObject({ ok: false, code: 'network' });
  });

  it('gives the wait in Gujarati digits', async () => {
    setLanguage('gu');
    const result = await sending(refused(429, 'rate_limited', { 'Retry-After': '30' }));
    expect((result as { message: string }).message).toBe('ઘણા વધારે પ્રયાસ થયા છે. ૩૦ સેકન્ડ પછી ફરી પ્રયાસ કરો.');
  });

  it('is off without a configured origin', async () => {
    mockConfig = null;
    expect(await requestCentralCode('9000000001')).toMatchObject({ ok: false, code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('signed-in calls', () => {
  it('GET /v1/me sends the access token and keeps the answer', async () => {
    await signedIn();
    serve({ 'GET /v1/me': { body: { user: { ...user, name: 'Asha Fictional' } } } });
    const result = await fetchCentralProfile();
    expect(result).toMatchObject({ ok: true, user: { name: 'Asha Fictional' } });
    const [call] = calls('GET /v1/me');
    expect(headersOf(call).Authorization).toBe(`Bearer ${accessToken('first')}`);
    expect((call[1] as RequestInit).body).toBeUndefined();
    expect(getCentralState().user?.name).toBe('Asha Fictional');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('PATCH /v1/me sends the trimmed name', async () => {
    await signedIn();
    serve({ 'PATCH /v1/me': { body: { user: { ...user, name: 'Asha Fictional' } } } });
    expect(await updateCentralName('  Asha Fictional ')).toMatchObject({ ok: true });
    expect(bodyOf(calls('PATCH /v1/me')[0])).toEqual({ name: 'Asha Fictional' });
  });

  it('POST /v1/facility-token names the one facility as the audience', async () => {
    await signedIn();
    serve({ 'POST /v1/facility-token': { body: { identity_token: 'facility-token-1', expires_at: '2026-10-12T06:07:30.000Z' } } });
    expect(await requestFacilityToken('https://north-cold.example.test', 'user-1')).toEqual({ ok: true, identityToken: 'facility-token-1' });
    const [call] = calls('POST /v1/facility-token');
    expect(bodyOf(call)).toEqual({ audience: 'https://north-cold.example.test' });
    expect(headersOf(call).Authorization).toBe(`Bearer ${accessToken('first')}`);
  });

  it('a facility token is asked only for the person whose session is stored: for anybody else nothing is sent', async () => {
    await signedIn();
    serve({ 'POST /v1/facility-token': { body: { identity_token: 'facility-token-1' } } });
    expect(await requestFacilityToken('https://north-cold.example.test', 'user-2')).toMatchObject({ ok: false, code: 'failed' });
    expect(calls('POST /v1/facility-token')).toHaveLength(0);
    expect(getCentralState().status).toBe('signedIn');
  });

  it('a facility that is not in the catalogue is named as such', async () => {
    await signedIn();
    serve({ 'POST /v1/facility-token': { status: 400, body: { error: { code: 'unknown_facility', message: 'x' } } } });
    expect(await requestFacilityToken('https://unlisted.example.test', 'user-1')).toMatchObject({ ok: false, code: 'unknown_facility' });
    // Not a reason to end the session.
    expect(getCentralState().status).toBe('signedIn');
  });

  it('DELETE /v1/me forgets the session on this device and returns whose list to remove', async () => {
    await signedIn();
    serve({ 'DELETE /v1/me': { body: { ok: true } } });
    expect(await deleteCentralAccount()).toEqual({ ok: true, userId: 'user-1' });
    expect(headersOf(calls('DELETE /v1/me')[0]).Authorization).toBe(`Bearer ${accessToken('first')}`);
    expect(secure.size).toBe(0);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('a failed deletion keeps the person signed in', async () => {
    await signedIn();
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await deleteCentralAccount()).toMatchObject({ ok: false, code: 'network' });
    expect(getCentralState().status).toBe('signedIn');
    expect(secure.has(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(true);
  });

  it.each([
    ['memory names another person than the stored session', 'memory'],
    ['the stored user is another person than the one in memory', 'store'],
  ])('a deletion is refused when %s: nothing is deleted at the service, and the failure result is returned', async (_name, side) => {
    await signedIn();
    const other = { id: 'user-2', phoneNumber: '919000000002', name: null, createdAt: '' };
    if (side === 'memory') setCentralState({ user: other });
    else secure.set(CENTRAL_SECURE_KEYS.USER, JSON.stringify(other));
    serve({ 'DELETE /v1/me': { body: { ok: true } } });
    expect(await deleteCentralAccount()).toMatchObject({ ok: false, code: 'failed' });
    expect(calls('DELETE /v1/me')).toHaveLength(0);
    // Nothing else happened either: the person stays signed in and the session stays stored.
    expect(getCentralState().status).toBe('signedIn');
    expect(secure.has(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(true);
  });

  it('sign-out revokes the session at the service and clears the device even without a connection', async () => {
    await signedIn();
    serve({ 'POST /v1/session/signout': { body: { ok: true } } });
    await signOutCentral();
    const [call] = calls('POST /v1/session/signout');
    expect(headersOf(call).Authorization).toBe(`Bearer ${accessToken('first')}`);
    expect((call[1] as RequestInit).body).toBeUndefined();
    expect(secure.size).toBe(0);
    expect(getCentralState().status).toBe('signedOut');

    await signedIn();
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await signOutCentral();
    expect(secure.size).toBe(0);
    expect(getCentralState().status).toBe('signedOut');
  });
});

describe('refresh', () => {
  it('replaces a token that is about to expire before the call, and stores the new pair', async () => {
    await signedIn(30);
    serve({
      'POST /v1/session/refresh': { body: { session: session('second', '2') } },
      'GET /v1/me': { body: { user } },
    });
    expect(await fetchCentralProfile()).toMatchObject({ ok: true });
    const [refresh] = calls('POST /v1/session/refresh');
    expect(bodyOf(refresh)).toEqual({ refresh_token: refreshToken('1') });
    expect(headersOf(refresh).Authorization).toBeUndefined();
    expect(headersOf(calls('GET /v1/me')[0]).Authorization).toBe(`Bearer ${accessToken('second')}`);
    expect(secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(refreshToken('2'));
    expect(secure.get(CENTRAL_SECURE_KEYS.ACCESS_TOKEN)).toBe(accessToken('second'));
  });

  it('two callers share one refresh: the refresh token is never sent twice', async () => {
    await signedIn(-5);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    serve({
      'POST /v1/session/refresh': async () => {
        await held;
        return reply({ body: { session: session('second', '2') } });
      },
      'GET /v1/me': { body: { user } },
      'POST /v1/facility-token': { body: { identity_token: 'facility-token-1' } },
    });
    const first = fetchCentralProfile();
    const second = requestFacilityToken('https://north-cold.example.test', 'user-1');
    const third = refreshCentralSession();
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toMatchObject({ ok: true });
    expect(await third).toMatchObject({ kind: 'ok' });
    expect(calls('POST /v1/session/refresh')).toHaveLength(1);
    expect(headersOf(calls('POST /v1/facility-token')[0]).Authorization).toBe(`Bearer ${accessToken('second')}`);
  });

  it('refreshes once when the service answers 401, then sends the call again', async () => {
    await signedIn();
    serve({
      'GET /v1/me': [{ status: 401, body: { error: { code: 'invalid_token', message: 'x' } } }, { body: { user } }],
      'POST /v1/session/refresh': { body: { session: session('second', '2') } },
    });
    expect(await fetchCentralProfile()).toMatchObject({ ok: true });
    expect(calls('POST /v1/session/refresh')).toHaveLength(1);
    const me = calls('GET /v1/me');
    expect(me).toHaveLength(2);
    expect(headersOf(me[0]).Authorization).toBe(`Bearer ${accessToken('first')}`);
    expect(headersOf(me[1]).Authorization).toBe(`Bearer ${accessToken('second')}`);
    expect(getCentralState().status).toBe('signedIn');
  });

  it('a refusal of the refresh token signs the person out centrally and says why', async () => {
    await signedIn(-5);
    serve({ 'POST /v1/session/refresh': { status: 401, body: { error: { code: 'invalid_refresh_token', message: 'x' } } } });
    expect(await fetchCentralProfile()).toMatchObject({ ok: false, code: 'session_ended' });
    expect(secure.size).toBe(0);
    expect(getCentralState()).toMatchObject({
      status: 'signedOut',
      user: null,
      endedMessage: 'Your association sign-in has ended. Sign in again.',
    });
    // The refused token is not sent again.
    expect(calls('POST /v1/session/refresh')).toHaveLength(1);
    expect(calls('GET /v1/me')).toHaveLength(0);
  });

  it('a 401 on a freshly refreshed token ends the session too', async () => {
    await signedIn();
    serve({
      'GET /v1/me': { status: 401, body: { error: { code: 'invalid_token', message: 'x' } } },
      'POST /v1/session/refresh': { body: { session: session('second', '2') } },
    });
    expect(await fetchCentralProfile()).toMatchObject({ ok: false, code: 'session_ended' });
    expect(getCentralState().status).toBe('signedOut');
    expect(secure.size).toBe(0);
  });

  it.each([
    ['the service is down', { status: 503, body: { error: { code: 'unavailable', message: 'x' } } }, 'unavailable'],
    ['a limit was reached', { status: 429, body: { error: { code: 'rate_limited', message: 'x' } } }, 'rate_limited'],
  ])('keeps the session when %s', async (_name, answer, code) => {
    await signedIn(-5);
    serve({ 'POST /v1/session/refresh': answer });
    expect(await fetchCentralProfile()).toMatchObject({ ok: false, code });
    expect(getCentralState().status).toBe('signedIn');
    expect(secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(refreshToken('1'));
  });

  it('keeps the session when there is no connection, and sends the token once only', async () => {
    await signedIn(-5);
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await fetchCentralProfile()).toMatchObject({ ok: false, code: 'network' });
    expect(getCentralState().status).toBe('signedIn');
    expect(secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(refreshToken('1'));
    expect(calls('POST /v1/session/refresh').map(bodyOf)).toEqual([{ refresh_token: refreshToken('1') }]);
  });

  it('a refresh the app gave up waiting for is not repeated either, and the session is kept', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      await signedIn(-5);
      let attempts = 0;
      fetchMock.mockImplementation(() => { attempts += 1; return new Promise(() => undefined); });
      const result = fetchCentralProfile();
      await jest.advanceTimersByTimeAsync(CENTRAL_REQUEST_TIMEOUT_MS + 1);
      expect(await result).toMatchObject({ ok: false, code: 'timeout' });
      expect(attempts).toBe(1);
      expect(getCentralState().status).toBe('signedIn');
      expect(secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(refreshToken('1'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('the next need refreshes again with the same stored token; a reuse refusal then signs out', async () => {
    await signedIn(-5);
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await fetchCentralProfile();
    serve({ 'POST /v1/session/refresh': { status: 401, body: { error: { code: 'invalid_refresh_token', message: 'x' } } } });
    expect(await fetchCentralProfile()).toMatchObject({ ok: false, code: 'session_ended' });
    expect(getCentralState()).toMatchObject({ status: 'signedOut', endedMessage: 'Your association sign-in has ended. Sign in again.' });
    expect(secure.size).toBe(0);
  });

  it('an answer of the service is never repeated', async () => {
    await signedIn(-5);
    serve({ 'POST /v1/session/refresh': { status: 503, body: { error: { code: 'unavailable', message: 'x' } } } });
    await fetchCentralProfile();
    expect(calls('POST /v1/session/refresh')).toHaveLength(1);
  });

  it('does not store half an answer', async () => {
    await signedIn(-5);
    serve({ 'POST /v1/session/refresh': { body: { session: { access_token: accessToken('second') } } } });
    expect(await fetchCentralProfile()).toMatchObject({ ok: false });
    expect(secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(refreshToken('1'));
    expect(secure.get(CENTRAL_SECURE_KEYS.ACCESS_TOKEN)).toBe(accessToken('first'));
  });
});

describe('catalogue', () => {
  const facilities = [
    { id: 'north-cold', name: 'North Cold Store', city: 'Rajkot', origin: 'https://north-cold.example.test', operator: 'North Cold Store Private Limited' },
    { id: 'gondal', name: 'ગોંડલ કોલ્ડ સ્ટોરેજ', city: 'ગોંડલ', origin: 'https://gondal.example.test', operator: 'Fictional Operator' },
  ];
  const catalogue = (claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) =>
    `${b64url({ alg: 'ES256', typ: 'facility-catalogue+jwt', kid: 'k1', ...header })}.${b64url({ iss: ORIGIN, iat: nowSeconds(), exp: nowSeconds() + 86400, facilities, ...claims })}.signature`;

  it('reads the entries, in any script, without sign-in', async () => {
    serve({ 'GET /v1/facilities': { body: { catalogue: catalogue() } } });
    const result = await fetchFacilityCatalogue();
    expect(result).toEqual({ ok: true, facilities });
    expect(headersOf(calls('GET /v1/facilities')[0]).Authorization).toBeUndefined();
  });

  it('is asked once in ten minutes unless a retry forces it', async () => {
    serve({ 'GET /v1/facilities': { body: { catalogue: catalogue() } } });
    await fetchFacilityCatalogue();
    await fetchFacilityCatalogue();
    expect(calls('GET /v1/facilities')).toHaveLength(1);
    await fetchFacilityCatalogue({ force: true });
    expect(calls('GET /v1/facilities')).toHaveLength(2);
  });

  it.each([
    ['another type of token', catalogue({}, { typ: 'facility-identity+jwt' })],
    ['another algorithm', catalogue({}, { alg: 'none' })],
    ['another issuer', catalogue({ iss: 'https://other.example.test' })],
    ['an expiry that has passed', catalogue({ exp: nowSeconds() - 1 })],
    ['no list', catalogue({ facilities: 'none' })],
    ['not a token', 'not-a-token'],
  ])('refuses %s', async (_name, token) => {
    expect(readCatalogueToken(token, ORIGIN)).toBeNull();
    serve({ 'GET /v1/facilities': { body: { catalogue: token } } });
    expect(await fetchFacilityCatalogue({ force: true })).toMatchObject({
      ok: false,
      code: 'catalogue_invalid',
      message: "The list of facilities couldn't be read. Try again later.",
    });
  });

  it('accepts an address with a port', () => {
    const withPort = { id: 'port', name: 'Port', city: 'Morbi', origin: 'https://port.example.test:8443', operator: '' };
    expect(readCatalogueToken(catalogue({ facilities: [withPort] }), ORIGIN)).toEqual([withPort]);
  });

  it('checks the issuer against the configured issuer name, which may differ from the address called', () => {
    expect(readCatalogueToken(catalogue({ iss: 'https://issuer.example.test' }), 'https://issuer.example.test')).toHaveLength(2);
  });

  it('drops an entry whose address is not a bare lower-case https origin, and a repeated address', () => {
    const token = catalogue({
      facilities: [
        facilities[0],
        { ...facilities[0], id: 'again' },
        { id: 'plain', name: 'Plain', city: 'Morbi', origin: 'http://plain.example.test', operator: '' },
        { id: 'path', name: 'Path', city: 'Morbi', origin: 'https://path.example.test/app', operator: '' },
        { id: 'upper', name: 'Upper', city: 'Morbi', origin: 'https://UPPER.example.test', operator: '' },
        { id: 'query', name: 'Query', city: 'Morbi', origin: 'https://query.example.test?x=1', operator: '' },
        { id: 'user', name: 'User', city: 'Morbi', origin: 'https://someone@user.example.test', operator: '' },
        { id: 'slash', name: 'Slash', city: 'Morbi', origin: 'https://slash.example.test/', operator: '' },
        { id: 'nameless', name: ' ', city: 'Morbi', origin: 'https://nameless.example.test', operator: '' },
      ],
    });
    expect(readCatalogueToken(token, ORIGIN)).toEqual([facilities[0]]);
  });
});

describe('a secure store that does not answer', () => {
  const failReads = () => jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Keystore unavailable'));
  const restoreReads = () => jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);

  it('at start: nothing stored is cleared, and the next start finds the session', async () => {
    storeSession('first', '1', 600);
    failReads();
    await restoreCentralSession();
    expect(getCentralState().status).toBe('signedOut');
    expect(secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)).toBe(refreshToken('1'));
    expect(secure.size).toBe(4);
    restoreReads();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-1' } });
  });

  it('at start: the store is read again 2 seconds later, and once more on the next foreground, before a sign-in is asked for', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      storeSession('first', '1', 600);
      failReads();
      await restoreCentralSession();
      expect(getCentralState().status).toBe('signedOut');
      // Still failing at the timed retry: nothing is cleared, still signed out.
      const readsBefore = jest.mocked(SecureStore.getItemAsync).mock.calls.length;
      await jest.advanceTimersByTimeAsync(RESTORE_RETRY_MS + 1);
      expect(getCentralState().status).toBe('signedOut');
      expect(secure.size).toBe(4);
      const readsAfterRetry = jest.mocked(SecureStore.getItemAsync).mock.calls.length;
      expect(readsAfterRetry).toBeGreaterThan(readsBefore);
      // Exactly one timed retry: more time brings no further reads.
      await jest.advanceTimersByTimeAsync(RESTORE_RETRY_MS * 3);
      expect(jest.mocked(SecureStore.getItemAsync).mock.calls.length).toBe(readsAfterRetry);
      // The app comes to the foreground and the store answers now.
      restoreReads();
      await retryCentralRestoreIfNeeded();
      expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-1' } });
      // Once a read has settled the foreground retry reads nothing.
      jest.mocked(SecureStore.getItemAsync).mockClear();
      await retryCentralRestoreIfNeeded();
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('at start: the timed retry alone finds the session when the store answers again', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      storeSession('first', '1', 600);
      failReads();
      await restoreCentralSession();
      expect(getCentralState().status).toBe('signedOut');
      restoreReads();
      await jest.advanceTimersByTimeAsync(RESTORE_RETRY_MS + 1);
      expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-1' } });
    } finally {
      jest.useRealTimers();
    }
  });

  it('while signed in: the session in memory is kept and no call signs the person out', async () => {
    await signedIn(600);
    failReads();
    await restoreCentralSession();
    expect(getCentralState().status).toBe('signedIn');
    expect(await fetchCentralProfile()).toMatchObject({ ok: false, code: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCentralState().status).toBe('signedIn');
    expect(secure.size).toBe(4);
    restoreReads();
    serve({ 'GET /v1/me': { body: { user } } });
    expect(await fetchCentralProfile()).toMatchObject({ ok: true });
  });
});

describe('separation from the facility session', () => {
  const source = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

  it('never uses a facility session key, and the facility session never uses a central one', () => {
    for (const key of Object.values(CENTRAL_SECURE_KEYS)) expect(key.startsWith('secure_central_')).toBe(true);
    expect(source('supabaseConfig.ts')).not.toMatch(/secure_central_/);
    const central = source('centralSession.ts');
    for (const facilityKey of ['secure_auth_token', 'secure_refresh_token', 'secure_token_expires', 'secure_enrollment_token', 'secure_operator_identity'])
      expect(central).not.toContain(facilityKey);
  });

  it('calls the association with plain fetch, not through the facility gate', () => {
    const central = source('centralSession.ts');
    expect(central).not.toMatch(/from ['"]\.\/supabaseConfig['"]/);
    expect(central).not.toMatch(/gatedFetch\(/);
  });

  it('logs nothing', () => {
    expect(source('centralSession.ts')).not.toMatch(/console\./);
  });

  it('a whole sign-in, refresh and sign-out writes no token, code or number to the log', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => {}));
    serve({
      'POST /v1/otp/request': { body: { request_id: 'r1', resend_after_seconds: 60 } },
      'POST /v1/otp/verify': { body: { user, session: session('first', '1', nowSeconds() - 1000) } },
      'POST /v1/session/refresh': [{ status: 429, body: { error: { code: 'rate_limited', message: 'x' } } }, { body: { session: session('second', '2') } }],
      'POST /v1/facility-token': { body: { identity_token: 'facility-token-1' } },
      'POST /v1/session/signout': { body: { ok: true } },
    });
    await requestCentralCode('+919000000001');
    await verifyCentralCode('+919000000001', '482913', '2025-12');
    await requestFacilityToken('https://north-cold.example.test', 'user-1');
    await requestFacilityToken('https://north-cold.example.test', 'user-1');
    await signOutCentral();
    const logged = loggedText(spies);
    expect(logged).not.toMatch(new RegExp(`9000000001|482913|facility-token|${refreshToken('1')}|${refreshToken('2')}|signature`));
    spies.forEach(spy => spy.mockRestore());
  });

  it('the log check sees a token inside an Error, which JSON.stringify would hide', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Written through a variable: the lint rule against console output is for the app, not for this probe.
    const output = console;
    output.error(new Error('refresh failed for facility-token-1'));
    output.error('[Auth]', { cause: new Error('refresh token ' + 'z'.repeat(64)) });
    expect(JSON.stringify(spy.mock.calls)).not.toContain('facility-token-1');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('z'.repeat(64));
    expect(loggedText([spy])).toContain('facility-token-1');
    expect(loggedText([spy])).toContain('z'.repeat(64));
    spy.mockRestore();
  });
});
/** Everything the spies were given: an Error by its message and stack, one level into objects as well. */
const loggedText = (spies: jest.SpyInstance[]): string => {
  const text = (value: unknown): string =>
    value instanceof Error ? `${String(value)} ${value.stack ?? ''}` : typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return spies
    .flatMap(spy => spy.mock.calls.flat())
    .map(arg =>
      arg && typeof arg === 'object' && !(arg instanceof Error)
        ? Object.values(arg as Record<string, unknown>).map(text).join(' ')
        : text(arg)
    )
    .join(' ');
};

