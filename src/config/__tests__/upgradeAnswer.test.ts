import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import {
  createAuthenticatedFetch,
  createSessionReadFetch,
  getEnrollmentStatus,
  getStoredToken,
  initializeSupabase,
  signOut,
  storeTokens,
} from '../supabaseConfig';
import { saveOperatorServer } from '../operatorServer';
import { resetLanTransport } from '../lanTransport';
import { isUpgrading, noteDiscoveryUpgrading, noteServerAnswered, resetUpgradeNotice } from '../upgradeNotice';
import { operatorResumeGate } from '../operatorResume';
import { store as appStore } from '@/store';
import { getAppErrorCode } from '@/utils/appError';
import { setLanguage, t } from '@/i18n';

jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) },
}));
jest.mock('@/services/session-recent-items-service', () => ({
  SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) },
}));
jest.mock('@/services/recent-items-service', () => ({ RecentItemsService: { clearCache: jest.fn(async () => {}) } }));
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
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

const PUBLIC = 'https://warehouse.example.test';
const originalFetch = global.fetch;
const secure = new Map<string, string>();
const jwt = () =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', session_id: 'test-session', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }))}.test-signature`;
const UPGRADING = { code: 'upgrading', message: "The facility's server is being updated. Try again in a few minutes." };
const reply = (status: number, body: unknown, headers: Record<string, string> = {}): Response => {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
    clone: () => reply(status, body, headers),
    body: null,
  };
  return response as unknown as Response;
};
// The answers the fake gateway gives, in order; after them the server's own answer (200).
let answers: Response[];
let calls: string[];
let verifier: jest.Mock<Promise<boolean>, []>;
let removeVerifier: () => void;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  secure.clear();
  calls = [];
  answers = [];
  await AsyncStorage.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  jest.mocked(createClient).mockReturnValue({ rpc: jest.fn(), from: jest.fn() } as unknown as ReturnType<typeof createClient>);
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return Promise.resolve(answers.shift() ?? reply(200, { from: 'server' }));
  }) as unknown as typeof fetch;
  resetLanTransport();
  resetUpgradeNotice();
  // The identity check that follows the end of an upgrade (see the tests at the end) is a discovery that answers.
  verifier = jest.fn(async () => true);
  removeVerifier = operatorResumeGate.installVerifier(verifier);
  initializeSupabase(PUBLIC, 'local-test-anon');
  await saveOperatorServer({ origin: PUBLIC, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator' }, false);
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
});

afterEach(() => {
  removeVerifier();
  jest.useRealTimers();
  resetLanTransport();
  resetUpgradeNotice();
});
afterAll(() => {
  global.fetch = originalFetch;
});

const READ = `${PUBLIC}/rest/v1/customers`;
const WRITE = `${PUBLIC}/rest/v1/rpc/save_grn`;

describe('the gateway answers "upgrading"', () => {
  test('a read raises the notice, waits Retry-After, is sent once more, and the notice goes down with the server\'s answer', async () => {
    answers = [reply(503, UPGRADING, { 'Retry-After': '20' })];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(19_000);
    expect(calls).toHaveLength(1);
    expect(isUpgrading()).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    const response = await pending;
    expect(calls).toEqual([`GET ${READ}`, `GET ${READ}`]);
    expect(response.status).toBe(200);
    expect(isUpgrading()).toBe(false);
  });

  test('a read is repeated once only: a second upgrading answer is handed to the caller', async () => {
    answers = [reply(503, UPGRADING, { 'Retry-After': '5' }), reply(503, UPGRADING, { 'Retry-After': '5' })];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    expect(calls).toHaveLength(2);
    expect(response.status).toBe(503);
    expect(isUpgrading()).toBe(true);
  });

  test('a read that starts while the notice is already up does not wait: one request, the 503 is handed back at once', async () => {
    noteDiscoveryUpgrading();
    answers = [reply(503, UPGRADING, { 'Retry-After': '120' })];
    const response = await createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    expect(calls).toEqual([`GET ${READ}`]);
    expect(response.status).toBe(503);
    expect(isUpgrading()).toBe(true);
  });

  test('a read that starts while the notice is up and finds the server back gets the server\'s answer', async () => {
    noteDiscoveryUpgrading();
    const response = await createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    expect(response.status).toBe(200);
    expect(isUpgrading()).toBe(false);
  });

  test('a write is never sent again silently: one request, the answer is handed back, the notice is up', async () => {
    answers = [reply(503, UPGRADING, { 'Retry-After': '120' })];
    const response = await createAuthenticatedFetch()(WRITE, { method: 'POST', body: '{}' });
    await jest.advanceTimersByTimeAsync(300_000);
    expect(calls).toEqual([`POST ${WRITE}`]);
    expect(response.status).toBe(503);
    expect(isUpgrading()).toBe(true);
  });

  test('the session is untouched', async () => {
    answers = [reply(503, UPGRADING)];
    await createAuthenticatedFetch()(WRITE, { method: 'POST', body: '{}' });
    expect(await getStoredToken()).toMatchObject({ isValid: true });
    expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
    expect(appStore.dispatch).not.toHaveBeenCalled();
  });

  test('another 503 is an ordinary failure: no notice, no wait, no repeat', async () => {
    answers = [reply(503, { message: 'The upstream server is unavailable' })];
    const response = await createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(isUpgrading()).toBe(false);
  });

  test('a missing or odd Retry-After falls back to the gateway\'s 120 seconds, of which a read waits 30 at most', async () => {
    answers = [reply(503, UPGRADING, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' })];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(29_000);
    expect(calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(calls).toHaveLength(2);
  });

  test('the wait never exceeds a read\'s own time limit, whatever Retry-After says (a caller\'s 15 or 30 s limit is not left waiting for 120)', async () => {
    answers = [reply(503, UPGRADING, { 'Retry-After': '120' })];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(29_000);
    expect(calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect((await pending).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  test('the caller\'s abort ends the wait: the read is not sent again', async () => {
    answers = [reply(503, UPGRADING, { 'Retry-After': '20' })];
    const controller = new AbortController();
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' }, signal: controller.signal });
    let settled: string | undefined;
    pending.then(() => { settled = 'sent'; }, (error: Error) => { settled = error.name; });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(settled).toBeUndefined();
    controller.abort();
    // At once, not when Retry-After would have run out (15 s later).
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toBe('AbortError');
    await jest.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(1);
  });

  test('a 503 whose body never arrives ends with the read limit, as every other body does', async () => {
    const stalled = { ...reply(503, UPGRADING), clone: () => ({ json: () => new Promise(() => {}) }) } as unknown as Response;
    answers = [stalled];
    const outcome = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } }).then(
      () => 'answered',
      (error: unknown) => getAppErrorCode(error)
    );
    await jest.advanceTimersByTimeAsync(31_000);
    expect(await outcome).toBe('TIMEOUT');
  });

  test.each(['en', 'gu'] as const)('an edge function of the sign-in (enrollment check) says the server is being updated, in %s, not the HTTP status', async language => {
    setLanguage(language);
    try {
      secure.set('secure_enrollment_token', 'enrollment-token');
      answers = [reply(503, UPGRADING, { 'Retry-After': '1' }), reply(503, UPGRADING, { 'Retry-After': '1' })];
      const pending = getEnrollmentStatus();
      await jest.advanceTimersByTimeAsync(1_000);
      expect(await pending).toEqual({ success: false, error: t('components.upgrading.message') });
      expect(calls).toHaveLength(2);
    } finally {
      setLanguage('en');
    }
  });

  test('an edge function whose own 15 s limit ends the 30 s wait still says the server is being updated', async () => {
    secure.set('secure_enrollment_token', 'enrollment-token');
    answers = [reply(503, UPGRADING, { 'Retry-After': '120' })];
    const pending = getEnrollmentStatus();
    await jest.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ success: false, error: t('components.upgrading.message') });
    expect(calls).toHaveLength(1);
  });

  describe('what the end of an upgrade does', () => {
    test('the next request after the notice went down checks the facility once (new minimum, new release), and no more', async () => {
      answers = [reply(503, UPGRADING, { 'Retry-After': '1' })];
      const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
      await jest.advanceTimersByTimeAsync(1_000);
      await pending;
      expect(isUpgrading()).toBe(false);
      expect(operatorResumeGate.isVerified()).toBe(false);
      expect(verifier).not.toHaveBeenCalled();
      await createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
      await createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
      expect(verifier).toHaveBeenCalledTimes(1);
      expect(operatorResumeGate.isVerified()).toBe(true);
    });

    test('an answer while no upgrade is going on asks for no check', async () => {
      await createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
      expect(operatorResumeGate.isVerified()).toBe(true);
      expect(verifier).not.toHaveBeenCalled();
    });

    test('an answer while a check is already running does not void it', async () => {
      answers = [reply(503, UPGRADING, { 'Retry-After': '1' })];
      const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
      await jest.advanceTimersByTimeAsync(1_000);
      await pending;
      expect(operatorResumeGate.isVerified()).toBe(false);
      // The facility is being read again; meanwhile the notice is up and a request sent earlier is answered.
      let finish: (verified: boolean) => void = () => {};
      verifier.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
      const verifying = operatorResumeGate.ensureVerified();
      noteDiscoveryUpgrading();
      expect(isUpgrading()).toBe(true);
      await jest.advanceTimersByTimeAsync(0);
      expect(verifier).toHaveBeenCalledTimes(1);
      noteServerAnswered();
      finish(true);
      expect(await verifying).toBe(true);
      expect(operatorResumeGate.isVerified()).toBe(true);
    });

    test('a failing check (the facility still upgrading) hands the request an error and the notice stays', async () => {
      answers = [reply(503, UPGRADING, { 'Retry-After': '1' })];
      const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
      await jest.advanceTimersByTimeAsync(1_000);
      await pending;
      verifier.mockRejectedValueOnce(Object.assign(new Error('being updated'), { code: 'upgrading' }));
      await expect(
        createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } })
      ).rejects.toMatchObject({ code: 'upgrading' });
    });
  });

  describe('a notice about a facility the phone has left', () => {
    test('signing out ends it', async () => {
      answers = [reply(503, UPGRADING)];
      await createAuthenticatedFetch()(WRITE, { method: 'POST', body: '{}' });
      expect(isUpgrading()).toBe(true);
      await signOut({ localOnly: true });
      expect(isUpgrading()).toBe(false);
    });

    test('a change of server ends it', async () => {
      answers = [reply(503, UPGRADING)];
      await createAuthenticatedFetch()(WRITE, { method: 'POST', body: '{}' });
      expect(isUpgrading()).toBe(true);
      await saveOperatorServer({ origin: 'https://other.example.test', instanceId: 'instance-0002', displayName: 'Warehouse Two', companyName: 'Other Operator' });
      expect(isUpgrading()).toBe(false);
    });
  });
});

describe('the server answers 429 (too many requests)', () => {
  const TOO_MANY = { message: 'Too many requests' };

  test('a read waits Retry-After and is sent once more; the repeat\'s answer is the answer', async () => {
    answers = [reply(429, TOO_MANY, { 'Retry-After': '7' })];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(6_000);
    expect(calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1_000);
    const response = await pending;
    expect(calls).toEqual([`GET ${READ}`, `GET ${READ}`]);
    expect(response.status).toBe(200);
  });

  test('the wait is capped like a read\'s own limit', async () => {
    answers = [reply(429, TOO_MANY, { 'Retry-After': '3600' })];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(30_000);
    expect((await pending).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  test('a read is repeated once only: a second 429 is handed to the caller', async () => {
    answers = [reply(429, TOO_MANY, { 'Retry-After': '2' }), reply(429, TOO_MANY, { 'Retry-After': '2' })];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(2_000);
    expect((await pending).status).toBe(429);
    expect(calls).toHaveLength(2);
  });

  test('without Retry-After the wait is one second', async () => {
    answers = [reply(429, TOO_MANY)];
    const pending = createSessionReadFetch()(READ, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
    await jest.advanceTimersByTimeAsync(1_000);
    expect((await pending).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  test('a write is never sent again: one request, the 429 is handed back', async () => {
    answers = [reply(429, TOO_MANY, { 'Retry-After': '2' })];
    const response = await createAuthenticatedFetch()(WRITE, { method: 'POST', body: '{}' });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual([`POST ${WRITE}`]);
    expect(response.status).toBe(429);
  });
});
