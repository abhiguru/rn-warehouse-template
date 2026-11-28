/**
 * WH-299 (contract §10.5): `sessionFetch` tells the phone copy about a write only when the server ACCEPTED a request that
 * `isReadRequest` does not class as a read and that is under /rest/v1/. Real: the request layer in supabaseConfig.ts
 * (the fetch it gives the Supabase client) and facilityWrite.ts. Faked at the edge: the network (global.fetch) and the client
 * library (createClient, only to hand us the fetch the app gives it).
 */
import { resetSessionRenewalForTests } from '../sessionRenewal';
import { subscribeFacilityWrite } from '../facilityWrite';
import { getAuthenticatedClient, initializeSupabase, storeTokens } from '../supabaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) } }));
jest.mock('@/services/recent-items-service', () => ({ RecentItemsService: { clearCache: jest.fn(async () => {}) } }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ clearSecureSessionMarker: jest.fn() }));

const secure = new Map<string, string>();
const originalFetch = global.fetch;
const BASE = 'http://localhost:18000/rest/v1';
const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: new Headers() }) as unknown as Response;
const jwt = () =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', session_id: 'test-session', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }))}.test-signature`;

let heard = 0;
let unsubscribe: () => void = () => undefined;
let guardedFetch: (input: string, init?: RequestInit) => Promise<Response>;

beforeEach(async () => {
  resetSessionRenewalForTests();
  jest.clearAllMocks();
  secure.clear();
  await AsyncStorage.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  jest.mocked(createClient).mockReturnValue({ rpc: jest.fn(), from: jest.fn() } as unknown as ReturnType<typeof createClient>);
  initializeSupabase('http://localhost:18000', 'local-test-anon');
  global.fetch = jest.fn() as typeof fetch;
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  await getAuthenticatedClient();
  guardedFetch = jest.mocked(createClient).mock.calls.at(-1)?.[2]?.global?.fetch as typeof guardedFetch;
  heard = 0;
  unsubscribe = subscribeFacilityWrite(() => { heard += 1; });
});
afterEach(() => unsubscribe());
afterAll(() => { global.fetch = originalFetch; });

const send = async (path: string, method = 'POST', status = 200) => {
  jest.mocked(global.fetch).mockResolvedValueOnce(reply(status));
  const response = await guardedFetch(`${BASE}${path}`, { method });
  await response.json();
};

describe('sessionFetch tells the copy about an accepted write', () => {
  it.each([
    ['save_grn', 'POST', '/rpc/save_grn'],
    ['a dispatch', 'POST', '/rpc/create_dispatch'],
    ['an invoice', 'POST', '/rpc/create_invoice'],
    ['a payment (table insert)', 'POST', '/payments'],
    ['a new customer (table insert)', 'POST', '/customers'],
    ['a table update', 'PATCH', '/customers?id=eq.c1'],
    ['a table delete', 'DELETE', '/goodsreceived?id=eq.g1'],
  ])('%s: once', async (_what, method, path) => {
    await send(path, method);
    expect(heard).toBe(1);
  });

  it.each([
    ['a GET', 'GET', '/goodsreceived?select=id'],
    ['a HEAD', 'HEAD', '/customers'],
    ['the feed: get_sync_start', 'POST', '/rpc/get_sync_start'],
    ['the feed: get_sync_page', 'POST', '/rpc/get_sync_page'],
    ['the feed: get_sync_changes', 'POST', '/rpc/get_sync_changes'],
    ['the feed: get_sync_checksums', 'POST', '/rpc/get_sync_checksums'],
    ['a read RPC: get_grn_details', 'POST', '/rpc/get_grn_details'],
    ['a read RPC: search_customers', 'POST', '/rpc/search_customers'],
    ['a read RPC: check_x', 'POST', '/rpc/check_submission'],
    ['a read RPC: list_x', 'POST', '/rpc/list_things'],
    ['a read RPC: count_x', 'POST', '/rpc/count_things'],
    ['a read RPC: user_accessible_customers', 'POST', '/rpc/user_accessible_customers'],
  ])('%s: never', async (_what, method, path) => {
    await send(path, method);
    expect(heard).toBe(0);
  });

  it.each(['can_make_bills', 'suggest_document_number', 'mark_held_item_seen', 'set_my_language', 'submit_connection_notes'])(
    'a write RPC that changes nothing the copy holds (%s): never', async rpc => {
      await send(`/rpc/${rpc}`);
      expect(heard).toBe(0);
    });

  it('a Storage object upload or an edge function: never', async () => {
    jest.mocked(global.fetch).mockResolvedValue(reply(200));
    await (await guardedFetch('http://localhost:18000/storage/v1/object/grn-images/a.jpg', { method: 'POST' })).json();
    await (await guardedFetch('http://localhost:18000/functions/v1/print-grn-preprinted', { method: 'POST' })).json();
    expect(heard).toBe(0);
  });

  it.each([400, 401, 409, 500, 503])('a write the server refused (%i): never', async status => {
    await send('/rpc/save_grn', 'POST', status);
    expect(heard).toBe(0);
  });

  it('a write that failed on the network: never, and the failure still reaches the caller', async () => {
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error('Network request failed'));
    await expect(guardedFetch(`${BASE}/rpc/save_grn`, { method: 'POST' })).rejects.toBeDefined();
    expect(heard).toBe(0);
  });

  it('a listener that throws does not fail the write that already succeeded', async () => {
    const stop = subscribeFacilityWrite(() => { throw new Error('listener failed'); });
    try {
      await send('/rpc/save_grn');
      expect(heard).toBe(1);
    } finally {
      stop();
    }
  });
});
