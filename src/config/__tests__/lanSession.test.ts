// The warehouse network fallback at the level of the session code (WS-L): the gated fetch sends a read
// over the LAN address when the public one fails, never sends a write again, and never ends the
// session on the gateway's key-rejection 401 that a LAN listener with stale keys answers.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import {
  createAuthenticatedFetch,
  createSessionReadFetch,
  getStoredToken,
  initializeSupabase,
  storeTokens,
} from '../supabaseConfig';
import { discoverOperator, loadOperatorServer, saveOperatorServer } from '../operatorServer';
import { answeredPath, getConnectionPath, getLanStatus, resetLanTransport } from '../lanTransport';
import { onWarehouseWifi } from '@/tests/helpers/lanNetwork';
import { store as appStore } from '@/store';

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
const LAN = 'http://192.168.1.20:8080';
const originalFetch = global.fetch;
const secure = new Map<string, string>();
const jwt = () =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', session_id: 'test-session', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }))}.test-signature`;
const reply = (status: number, body: unknown, path?: 'lan' | 'public'): Response => {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-warehouse-path' ? (path ?? null) : null) },
    json: async () => body,
    clone: () => reply(status, body, path),
    body: null,
  };
  return response as unknown as Response;
};
const anonKey = `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '')}.signature`;
const publicConfig = {
  success: true,
  data: {
    supabaseUrl: PUBLIC, anonKey, environment: 'production', version: '1.0.0', maintenanceMode: false,
    instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator', canonicalOrigin: PUBLIC,
    supportedApiVersions: ['1'], minimumClientVersion: '0.1.0', capabilities: {},
    urls: { publicConfig: `${PUBLIC}/functions/v1/get-public-config`, fullConfig: `${PUBLIC}/functions/v1/get-config` },
  },
};

type Net = { public: 'up' | 'down' | 'key-401'; lan: 'up' | 'down' | 'stale-keys' };
const net: Net = { public: 'up', lan: 'up' };
let calls: string[];
const route = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  calls.push(`${init?.method ?? 'GET'} ${url}`);
  if (url.startsWith(PUBLIC)) {
    if (net.public === 'down') return Promise.reject(new TypeError('Network request failed'));
    if (net.public === 'key-401' && url.includes('/rest/v1/')) return Promise.resolve(reply(401, { message: 'Unauthorized' }, 'public'));
    return Promise.resolve(reply(200, url.endsWith('/hello') ? 'Hello' : url.endsWith('/get-public-config') ? publicConfig : { from: 'public' }, 'public'));
  }
  if (net.lan === 'down') return Promise.reject(new TypeError('Network request failed'));
  if (net.lan === 'stale-keys' && url.includes('/rest/v1/')) return Promise.resolve(reply(401, { message: 'Unauthorized' }, 'lan'));
  if (url.endsWith('/hello')) return Promise.resolve(reply(200, 'Hello', 'lan'));
  if (url.endsWith('/get-public-config')) return Promise.resolve(reply(200, publicConfig, 'lan'));
  return Promise.resolve(reply(200, { from: 'lan' }, 'lan'));
};
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  net.public = 'up';
  net.lan = 'up';
  calls = [];
  await AsyncStorage.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  jest.mocked(createClient).mockReturnValue({ rpc: jest.fn(), from: jest.fn() } as unknown as ReturnType<typeof createClient>);
  global.fetch = jest.fn(route) as unknown as typeof fetch;
  resetLanTransport();
  initializeSupabase(PUBLIC, 'local-test-anon');
  await saveOperatorServer(
    { origin: PUBLIC, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator', lan: LAN },
    false
  );
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  onWarehouseWifi();
});

afterEach(() => {
  resetLanTransport();
});
afterAll(() => {
  global.fetch = originalFetch;
});

test('a read fails over to the LAN address through the gated fetch, with the session untouched', async () => {
  net.public = 'down';
  const response = await createSessionReadFetch()(`${PUBLIC}/rest/v1/customers`, { headers: { Authorization: 'Bearer t', apikey: 'k' } });
  expect(answeredPath(response)).toBe('lan');
  expect(getConnectionPath()).toBe('lan');
  expect(await getStoredToken()).toMatchObject({ isValid: true });
  expect(appStore.dispatch).not.toHaveBeenCalled();
});

test('a write that fails on the public path is not sent again, and the next one goes over the LAN address', async () => {
  net.public = 'down';
  const write = createAuthenticatedFetch();
  await expect(write(`${PUBLIC}/rest/v1/rpc/save_grn`, { method: 'POST', body: '{}' })).rejects.toThrow('Network request failed');
  expect(calls.filter(call => call.includes('save_grn'))).toEqual([`POST ${PUBLIC}/rest/v1/rpc/save_grn`]);
  const again = await write(`${PUBLIC}/rest/v1/rpc/save_grn`, { method: 'POST', body: '{}' });
  expect(answeredPath(again)).toBe('lan');
  expect(calls.filter(call => call.includes('save_grn'))).toEqual([
    `POST ${PUBLIC}/rest/v1/rpc/save_grn`,
    `POST ${LAN}/rest/v1/rpc/save_grn`,
  ]);
});

test('the gateway key-rejection 401 over the LAN path does not end the session (public path down too)', async () => {
  net.public = 'down';
  await createSessionReadFetch()(`${PUBLIC}/rest/v1/customers`); // onto the LAN path
  net.lan = 'stale-keys';
  await expect(createSessionReadFetch()(`${PUBLIC}/rest/v1/customers`)).rejects.toThrow('Network request failed');
  await flush();
  expect(getLanStatus().failure).toBe('old-configuration');
  expect(await getStoredToken()).toMatchObject({ isValid: true });
  expect(secure.get('secure_refresh_token')).toBe('a'.repeat(64));
  expect(appStore.dispatch).not.toHaveBeenCalled();
});

test('the same 401 over the LAN path sends a read back to the public path when that works, session untouched', async () => {
  net.public = 'down';
  await createSessionReadFetch()(`${PUBLIC}/rest/v1/customers`); // onto the LAN path
  net.public = 'up';
  net.lan = 'stale-keys';
  const response = await createSessionReadFetch()(`${PUBLIC}/rest/v1/customers`);
  expect(response.status).toBe(200);
  expect(answeredPath(response)).toBe('public');
  await flush();
  expect(appStore.dispatch).not.toHaveBeenCalled();
  expect(await getStoredToken()).toMatchObject({ isValid: true });
});

test('a gateway key rejection over the PUBLIC path still ends the session, once', async () => {
  net.public = 'key-401';
  const response = await createSessionReadFetch()(`${PUBLIC}/rest/v1/customers`);
  expect(response.status).toBe(401);
  await flush();
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(appStore.dispatch).toHaveBeenCalledTimes(1);
});

test('a 401 that carries the LAN listener header is ignored by the session code even if it got through', async () => {
  // Defence in depth: the transport never hands such an answer over, but noteUnauthorized would not act on it either.
  global.fetch = jest.fn(async () => reply(401, { message: 'Unauthorized' }, 'lan')) as unknown as typeof fetch;
  resetLanTransport(); // no LAN address known: the response is returned as it is
  await createSessionReadFetch()(`${PUBLIC}/rest/v1/customers`);
  await flush();
  expect(appStore.dispatch).not.toHaveBeenCalled();
});

describe('discovery', () => {
  it('goes to the LAN address when the public one fails, and reads the answer as the canonical origin', async () => {
    await loadOperatorServer();
    net.public = 'down';
    const found = await discoverOperator(PUBLIC);
    expect(found.server).toEqual({ origin: PUBLIC, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator' });
    expect(calls).toContain(`GET ${LAN}/functions/v1/get-public-config`);
    expect(getConnectionPath()).toBe('lan');
  });

  it('accepts a redirect check against the LAN address the answer came from', async () => {
    await loadOperatorServer();
    net.public = 'down';
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await route(input, init);
      return Object.assign(response, { url: String(input) });
    }) as unknown as typeof fetch;
    await expect(discoverOperator(PUBLIC)).resolves.toBeDefined();
  });

  it('still names an answer from another origin', async () => {
    await loadOperatorServer();
    global.fetch = jest.fn(async () => Object.assign(reply(200, publicConfig, 'public'), { url: 'https://other.example.test/functions/v1/get-public-config' })) as unknown as typeof fetch;
    await expect(discoverOperator(PUBLIC)).rejects.toThrow('This address forwards to another server.');
  });

  it('keeps the LAN address of the same server when a discovery answer is saved (a discovery answer has none)', async () => {
    await loadOperatorServer();
    const found = await discoverOperator(PUBLIC);
    await saveOperatorServer(found.server, false);
    expect(JSON.parse((await AsyncStorage.getItem('operator_server_v1')) as string).lan).toBe(LAN);
  });
});
