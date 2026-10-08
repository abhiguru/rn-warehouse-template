import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthenticatedClient, getSessionIdentity } from '@/config/supabaseConfig';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
import { clearAllCaches } from '@/utils/cacheManager';
import { getDispatchListWithItems, invalidateDispatchCache } from '../dispatch-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSessionIdentity: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const identityA = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
const identityB = { ...identityA, subject: 'user-b' };
const identityC = { ...identityA, instanceId: 'instance-c' };
const rpc = jest.fn();
const networkError = { message: 'TypeError: Network request failed', details: '', hint: '', code: '', status: 0 };
const listResponse = (id: string) => ({
  data: {
    success: true,
    message: 'ok',
    data: {
      dispatches: [{ id, dispNo: `D-${id}`, customerName: 'Fictional Customer', items: [] }],
      pagination: { total_count: 1, current_page: 1, total_pages: 1 },
    },
  },
  error: null,
});
const dispatchCacheKeys = async () =>
  (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(CACHE_PREFIXES.DISPATCH_LIST));
let logs: jest.SpyInstance[];

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.mocked(getSessionIdentity).mockResolvedValue(identityA);
  logs = ['log', 'warn', 'error', 'time', 'timeEnd'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => logs.forEach(log => log.mockRestore()));

it('caches a list under the session identity and serves it only to that identity when offline', async () => {
  rpc.mockResolvedValueOnce(listResponse('d1'));
  expect((await getDispatchListWithItems({ p_limit: 20 })).success).toBe(true);
  const keys = await dispatchCacheKeys();
  expect(keys).toHaveLength(1);
  expect(keys[0]).toContain('instance-a');
  expect(keys[0]).toContain('user-a');

  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  const offline = await getDispatchListWithItems({ p_limit: 20 });
  expect(offline.success).toBe(true);
  expect(offline.message).toMatch(/cache/);
  expect(offline.data.dispatches.map(d => d.id)).toEqual(['d1']);

  for (const other of [identityB, identityC]) {
    jest.mocked(getSessionIdentity).mockResolvedValue(other);
    rpc.mockResolvedValueOnce({ data: null, error: networkError });
    const result = await getDispatchListWithItems({ p_limit: 20 });
    expect(result.success).toBe(false);
    expect(result.data.dispatches).toEqual([]);
  }
  expect(await dispatchCacheKeys()).toHaveLength(1);
});

it.each([
  ['a session change reported by the client', { message: 'Error: Session changed', code: '' }],
  ['a pending identity verification', { message: 'Error: Warehouse identity verification required', code: '' }],
  ['an expired gateway bearer', { message: 'JWT expired', code: 'PGRST301' }],
  ['a revoked session', { message: 'Session expired or revoked', code: '42501' }],
  ['a forbidden response', { message: 'Forbidden', status: 403 }],
])('never serves the cache for %s', async (_, error) => {
  rpc.mockResolvedValueOnce(listResponse('d1'));
  await getDispatchListWithItems({ p_limit: 20 });
  rpc.mockResolvedValueOnce({ data: null, error });
  const result = await getDispatchListWithItems({ p_limit: 20 });
  expect(result.success).toBe(false);
  expect(result.data.dispatches).toEqual([]);
});

it.each([
  ['a missing session', new Error('Sign in required')],
  ['a session change', new Error('Session changed')],
  ['a server switch', new Error('Server switch in progress')],
])('never serves the cache when the client is unavailable because of %s', async (_, failure) => {
  rpc.mockResolvedValueOnce(listResponse('d1'));
  await getDispatchListWithItems({ p_limit: 20 });
  jest.mocked(getAuthenticatedClient).mockRejectedValueOnce(failure);
  const result = await getDispatchListWithItems({ p_limit: 20 });
  expect(result.success).toBe(false);
  expect(result.data.dispatches).toEqual([]);
});

it('neither reads nor writes the cache without a session identity', async () => {
  rpc.mockResolvedValueOnce(listResponse('d1'));
  await getDispatchListWithItems({ p_limit: 20 });
  jest.mocked(getSessionIdentity).mockResolvedValue(null);
  rpc.mockResolvedValueOnce(listResponse('d2'));
  expect((await getDispatchListWithItems({ p_limit: 20 })).success).toBe(true);
  expect(await dispatchCacheKeys()).toHaveLength(1);
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  expect((await getDispatchListWithItems({ p_limit: 20 })).success).toBe(false);
});

it('keeps scoped keys under the dispatch prefix so prefix invalidation and clearAllCaches remove them', async () => {
  rpc.mockResolvedValueOnce(listResponse('d1'));
  await getDispatchListWithItems({ p_limit: 20 });
  await invalidateDispatchCache();
  expect(await dispatchCacheKeys()).toEqual([]);
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  expect((await getDispatchListWithItems({ p_limit: 20 })).success).toBe(false);

  rpc.mockResolvedValueOnce(listResponse('d1'));
  await getDispatchListWithItems({ p_limit: 20 });
  await AsyncStorage.setItem('operator_server_v1', '{"origin":"https://warehouse.example.test"}');
  await clearAllCaches();
  expect(await dispatchCacheKeys()).toEqual([]);
  expect(await AsyncStorage.getItem('operator_server_v1')).not.toBeNull();
});

it('does not dump tokens, sessions or request parameters to the console', async () => {
  rpc.mockResolvedValueOnce(listResponse('d1'));
  await getDispatchListWithItems({ p_customer_id: 'customer-secret', p_limit: 20 });
  const output = JSON.stringify(logs.flatMap(log => log.mock.calls));
  expect(output).not.toMatch(/Token check|Session check|RPC params being sent/);
});
