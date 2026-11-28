/**
 * WH-299 (contract §10.5): `sessionFetch` tells the phone copy about a write only when the server ACCEPTED a request that
 * `isReadRequest` does not class as a read and that is under /rest/v1/. Real: the request layer in supabaseConfig.ts
 * (the fetch it gives the Supabase client) and facilityWrite.ts. Faked at the edge: the network (global.fetch) and the client
 * library (createClient, only to hand us the fetch the app gives it).
 */
import { resetSessionRenewalForTests } from '../sessionRenewal';
import { subscribeFacilityWrite } from '../facilityWrite';
import { beginOperatorSwitch, createAuthenticatedFetch, endOperatorSwitch, getAuthenticatedClient, initializeSupabase, storeTokens } from '../supabaseConfig';
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
const rpc = jest.fn();
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
  rpc.mockReset();
  jest.mocked(createClient).mockReturnValue({ rpc, from: jest.fn() } as unknown as ReturnType<typeof createClient>);
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

// WH-393: the send pass asks for a client whose accepted writes are not noted; every other request still is, even while
// the pass runs, because the mark belongs to the request and not to the app.
describe('the quiet client of a send pass', () => {
  const fetchOf = () => jest.mocked(createClient).mock.calls.at(-1)?.[2]?.global?.fetch as typeof guardedFetch;
  const through = async (fetcher: typeof guardedFetch, path = '/rpc/save_grn') => {
    jest.mocked(global.fetch).mockResolvedValueOnce(reply(200));
    await (await fetcher(`${BASE}${path}`, { method: 'POST' })).json();
  };
  const quietFetch = async () => {
    jest.mocked(createClient).mockImplementationOnce(() => ({ rpc, from: jest.fn() }) as unknown as ReturnType<typeof createClient>);
    await getAuthenticatedClient({ quietWrite: true });
    return fetchOf();
  };

  it('notes none of its accepted writes, while the ordinary client, made before, still notes its own', async () => {
    const quiet = await quietFetch();
    await through(quiet);
    await through(quiet, '/rpc/hold_items');
    expect(heard).toBe(0);
    await through(guardedFetch);
    expect(heard).toBe(1);
    await through(quiet);
    expect(heard).toBe(1);
  });

  it('is its own cached client: asking quietly does not change what the ordinary client does, in either order', async () => {
    jest.mocked(createClient).mockImplementationOnce(() => ({ rpc, from: jest.fn() }) as unknown as ReturnType<typeof createClient>);
    const first = await getAuthenticatedClient({ quietWrite: true });
    const ordinary = await getAuthenticatedClient();
    expect(ordinary).not.toBe(first);
    expect(jest.mocked(createClient).mock.calls.length).toBe(2); // one ordinary (beforeEach) and one quiet
    expect(await getAuthenticatedClient({ quietWrite: true })).toBe(first);
    expect(await getAuthenticatedClient()).toBe(ordinary);
    expect(jest.mocked(createClient).mock.calls.length).toBe(2);
  });

  it('is made again after the token changes, so the old token is never sent by it', async () => {
    await quietFetch();
    const made = jest.mocked(createClient).mock.calls.length;
    const renewed = `${jwt()}-renewed`;
    await storeTokens(renewed, 'c'.repeat(64), Date.now() + 3600000);
    await getAuthenticatedClient({ quietWrite: true });
    expect(jest.mocked(createClient).mock.calls.length).toBe(made + 1);
    const headers = jest.mocked(createClient).mock.calls.at(-1)?.[2]?.global?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${renewed}`);
    // And the new one is still quiet.
    await through(fetchOf());
    expect(heard).toBe(0);
  });
});

// WH-299 review Medium: createAuthenticatedFetch (the print and document services) classes each request with the same rule.
describe('createAuthenticatedFetch', () => {
  const FACILITY = 'http://localhost:18000';
  const edge = createAuthenticatedFetch;
  const through = async (fetcher: ReturnType<typeof createAuthenticatedFetch>, path: string, status = 200) => {
    jest.mocked(global.fetch).mockResolvedValueOnce(reply(status));
    await (await fetcher(`${FACILITY}${path}`, { method: 'POST' })).json();
  };

  it('polling get_print_jobs (a read RPC) is never noted as a write, however often it runs', async () => {
    const fetcher = edge();
    for (let i = 0; i < 6; i += 1) await through(fetcher, '/rest/v1/rpc/get_print_jobs');
    expect(heard).toBe(0);
  });

  it('a real write through the same fetch is noted once', async () => {
    await through(edge(), '/rest/v1/rpc/save_grn');
    expect(heard).toBe(1);
  });

  it.each([
    'cancel-print-job', 'generate-accountant-pack', 'generate-customer-stock-pdf', 'generate-dispatch-pdf', 'generate-grn-pdf',
    'generate-invoice-pdf', 'generate-report-pdf', 'generate-statement-pdf', 'generate-temperature-report-pdf', 'get-printer-status',
    'print-grn-preprinted',
  ])('the edge function %s is not the facility\'s data: no note, and it is still a write for a server switch', async name => {
    const slow = new Promise<Response>(resolve => setTimeout(() => resolve(reply(200)), 20));
    jest.mocked(global.fetch).mockImplementationOnce(() => slow);
    const request = edge()(`${FACILITY}/functions/v1/${name}`, { method: 'POST' });
    expect(beginOperatorSwitch()).toBe(false);     // a write holds a server switch back, as before
    await (await request).json();
    expect(heard).toBe(0);
    expect(beginOperatorSwitch()).toBe(true);
    endOperatorSwitch();
  });

  it('a read through it is aborted by a server switch (it no longer holds the switch back)', async () => {
    let signal: AbortSignal | undefined;
    jest.mocked(global.fetch).mockImplementationOnce((_, init) => {
      signal = init?.signal || undefined;
      return new Promise<Response>((_, reject) => signal?.addEventListener('abort', () => reject(new Error('Aborted'))));
    });
    const read = edge()(`${FACILITY}/rest/v1/rpc/get_print_jobs`, { method: 'POST' });
    expect(beginOperatorSwitch()).toBe(true);
    expect(signal?.aborted).toBe(true);
    await expect(read).rejects.toThrow('Aborted');
    expect(heard).toBe(0);
    endOperatorSwitch();
  });

  it('a read refused as expired is sent again once with the renewed token; a write is not', async () => {
    const expired = () => { const r = { ...reply(401, { message: 'jwt expired' }) } as unknown as Response & { clone: () => Response }; r.clone = () => r; return r; };
    rpc.mockResolvedValue({ data: { success: true, access_token: jwt(), refresh_token: 'b'.repeat(64) }, error: null });
    jest.mocked(global.fetch).mockResolvedValueOnce(expired()).mockResolvedValueOnce(reply(200));
    const read = await edge()(`${FACILITY}/rest/v1/rpc/get_print_jobs`, { method: 'POST', headers: { Authorization: `Bearer ${jwt()}` } });
    await read.json();
    expect(jest.mocked(global.fetch)).toHaveBeenCalledTimes(2);
    expect(heard).toBe(0);                          // the replayed read is still not a write

    jest.mocked(global.fetch).mockClear();
    jest.mocked(global.fetch).mockResolvedValueOnce(expired()).mockResolvedValueOnce(reply(200));
    await edge()(`${FACILITY}/functions/v1/generate-grn-pdf`, { method: 'POST', headers: { Authorization: `Bearer ${jwt()}` } });
    expect(jest.mocked(global.fetch)).toHaveBeenCalledTimes(1);   // a change is never sent again
  });
});
