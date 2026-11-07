/**
 * WH-124: the last loaded first page of the GRN list is kept without an age limit and read back, with the time it
 * was stored, when a load fails for want of a connection (also after a restart). A successful load replaces it, a
 * refusal never reads it, it belongs to the signed-in person, and it goes with the other caches at sign-out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthenticatedClient, getSessionIdentity } from '@/config/supabaseConfig';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
import { clearAllCaches } from '@/utils/cacheManager';
import { getGRNListPage } from '../grn-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSessionIdentity: jest.fn(),
  getStoredToken: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/config/facilityGrnPaging', () => ({ noteGrnPagingUnit: jest.fn() }));

const identity = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
const rpc = jest.fn();
const networkError = { message: 'TypeError: Network request failed', details: '', hint: '', code: '', status: 0 };
const refusal = { message: 'permission denied for function get_all_grn_items', details: '', hint: '', code: '42501', status: 403 };
const DAY = 24 * 60 * 60 * 1000;

const listResponse = (grnNo: string) => ({
  data: {
    success: true,
    data: [
      {
        id: `item-${grnNo}`,
        grn_id: `grn-${grnNo}`,
        gr_no: grnNo,
        date: '2026-01-01',
        customer_id: 'customer-1',
        customer_name: 'Fictional Customer',
        item_name: 'Fictional Potatoes',
        qty: 1,
        stock: 1,
      },
    ],
    pagination: { limit: 20, offset: 0, total_count: 1 },
    aggregates: { total_qty: 1, total_stock: 1 },
  },
  error: null,
});

const settle = () => new Promise(resolve => setImmediate(resolve));
const grnNos = (r: Awaited<ReturnType<typeof getGRNListPage>>) => r.data.items.map(i => i.gr_no);
const params = { p_limit: 20, p_offset: 0 };

let logs: jest.SpyInstance[];

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-13T09:00:00Z'));
  jest.clearAllMocks();
  rpc.mockReset();
  await AsyncStorage.clear();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.mocked(getSessionIdentity).mockResolvedValue(identity);
  logs = ['log', 'warn', 'error', 'time', 'timeEnd'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});
afterEach(() => {
  logs.forEach(log => log.mockRestore());
  jest.useRealTimers();
});

const loadOnce = async (grnNo: string) => {
  rpc.mockResolvedValueOnce(listResponse(grnNo));
  const result = await getGRNListPage(params, null);
  await settle();
  return result;
};

it('serves the stored page, with the time it was stored, when the network fails days later', async () => {
  const loaded = await loadOnce('100001');
  expect(loaded.success).toBe(true);
  expect(loaded.fromCache).toBeUndefined();
  const storedAt = Date.now();

  jest.advanceTimersByTime(30 * DAY);
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  const offline = await getGRNListPage(params, null);
  expect(offline.success).toBe(true);
  expect(offline.fromCache).toBe(true);
  expect(offline.cachedAt).toBe(storedAt);
  expect(grnNos(offline)).toEqual(['100001']);
});

it('still serves it after a restart (the page is read from storage, not memory)', async () => {
  await loadOnce('100002');
  jest.advanceTimersByTime(7 * DAY);
  let offline!: Awaited<ReturnType<typeof getGRNListPage>>;
  await jest.isolateModulesAsync(async () => {
    const { getAuthenticatedClient: freshClient, getSessionIdentity: freshIdentity } = require('@/config/supabaseConfig');
    jest.mocked(freshClient).mockResolvedValue({ rpc });
    jest.mocked(freshIdentity).mockResolvedValue(identity);
    const fresh = require('../grn-service') as typeof import('../grn-service');
    rpc.mockResolvedValueOnce({ data: null, error: networkError });
    offline = await fresh.getGRNListPage(params, null);
  });
  expect(offline.fromCache).toBe(true);
  expect(grnNos(offline)).toEqual(['100002']);
});

it('replaces the stored page when a load succeeds', async () => {
  await loadOnce('100003');
  await loadOnce('100004');
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  const offline = await getGRNListPage(params, null);
  expect(grnNos(offline)).toEqual(['100004']);
});

it('does not serve the stored page when the load is refused for a reason other than the connection', async () => {
  await loadOnce('100005');
  jest.advanceTimersByTime(30 * DAY);
  rpc.mockResolvedValueOnce({ data: null, error: refusal });
  const refused = await getGRNListPage(params, null);
  expect(refused.success).toBe(false);
  expect(refused.fromCache).toBeUndefined();
  expect(refused.data.items).toEqual([]);
});

it('does not serve another person\'s page on the same phone', async () => {
  await loadOnce('100006');
  jest.mocked(getSessionIdentity).mockResolvedValue({ ...identity, subject: 'user-b' });
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  const other = await getGRNListPage(params, null);
  expect(other.success).toBe(false);
  expect(other.fromCache).toBeUndefined();
});

it('does not serve a stored page of another facility', async () => {
  await loadOnce('100007');
  jest.mocked(getSessionIdentity).mockResolvedValue({ ...identity, origin: 'https://other.example.test', instanceId: 'instance-b' });
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  expect((await getGRNListPage(params, null)).success).toBe(false);
});

it('removes the stored page when the caches are cleared at sign-out or a facility switch', async () => {
  await loadOnce('100008');
  expect((await AsyncStorage.getAllKeys()).some(k => k.startsWith(CACHE_PREFIXES.GRN_LIST))).toBe(true);
  await clearAllCaches();
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  expect((await getGRNListPage(params, null)).success).toBe(false);
});
