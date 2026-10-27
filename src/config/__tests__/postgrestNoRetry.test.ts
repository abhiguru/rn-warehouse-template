import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  getAuthenticatedClient,
  initializeSupabase,
  storeTokens,
} from '../supabaseConfig';
import { saveOperatorServer } from '../operatorServer';
import { resetLanTransport } from '../lanTransport';
import { resetUpgradeNotice } from '../upgradeNotice';

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
const reply = (status: number, body: unknown, headers: Record<string, string> = {}): Response => {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => reply(status, body, headers),
    body: null,
  };
  return response as unknown as Response;
};
// The answers the fake gateway gives, in order; after them the server's own answer (200).
let answers: Response[];
let calls: string[];

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
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return Promise.resolve(answers.shift() ?? reply(200, { from: 'server' }));
  }) as unknown as typeof fetch;
  resetLanTransport();
  resetUpgradeNotice();
  initializeSupabase(PUBLIC, 'local-test-anon');
  await saveOperatorServer({ origin: PUBLIC, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator' }, false);
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
});

afterEach(() => {
  jest.useRealTimers();
  resetLanTransport();
  resetUpgradeNotice();
});
afterAll(() => {
  global.fetch = originalFetch;
});


// postgrest-js repeats a failed read (503 among them) and waits the gateway's Retry-After; with `db: { retry: false }` on both
// clients a read is one request, and the request layer alone decides about a repeat.
describe('a table read answered 503 with Retry-After: 120', () => {
  const ordinary503 = () => reply(503, { message: 'The upstream server is unavailable' }, { 'Retry-After': '120' });

  it('on the authenticated client is ONE request, not three', async () => {
    answers = [ordinary503(), ordinary503(), ordinary503(), ordinary503()];
    const client = await getAuthenticatedClient();
    const pending = client.from('customers').select('id');
    await jest.advanceTimersByTimeAsync(130_000);
    const result = await pending;
    expect(calls.filter(call => call.includes('/rest/v1/customers'))).toHaveLength(1);
    expect(result.error).toBeTruthy();
  });

  it('on the anonymous client is ONE request, not three', async () => {
    answers = [ordinary503(), ordinary503(), ordinary503(), ordinary503()];
    const pending = initializeSupabase(PUBLIC, 'local-test-anon').from('customers').select('id');
    await jest.advanceTimersByTimeAsync(130_000);
    await pending;
    expect(calls.filter(call => call.includes('/rest/v1/customers'))).toHaveLength(1);
  });
});
