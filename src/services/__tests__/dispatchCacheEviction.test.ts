/**
 * DATA-05: the dispatch list's offline copies are kept in a bounded index. Browsing many pages,
 * searches and sorts must not grow AsyncStorage without end, other caches and drafts must not be
 * touched, and a recent answer must still be served when the network fails.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthenticatedClient, getSessionIdentity } from '@/config/supabaseConfig';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { CACHE_DURATION_DEFAULT_MS, CACHE_PREFIXES } from '@/config/cacheConfig';
import { clearAllCaches } from '@/utils/cacheManager';
import { getDispatchListWithItems, invalidateDispatchCache } from '../dispatch-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSessionIdentity: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

// The limits the dispatch cache promises (DISPATCH_CACHE_* in dispatch-service.ts).
const MAX_ENTRIES = 24;
const MAX_TOTAL_CHARS = 1024 * 1024;
const MAX_ENTRY_CHARS = 256 * 1024;
const INDEX_KEY = `${CACHE_PREFIXES.DISPATCH_LIST}_index`;

const identity = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
const rpc = jest.fn();
const networkError = { message: 'TypeError: Network request failed', details: '', hint: '', code: '', status: 0 };

/** A page of dispatches whose items carry `itemChars` characters of item names in all. */
const listResponse = (id: string, itemChars = 2000) => ({
  data: {
    success: true,
    message: 'ok',
    data: {
      dispatches: [
        {
          id,
          dispNo: `D-${id}`,
          customerName: 'Fictional Customer',
          items: Array.from({ length: 10 }, (_, i) => ({
            itemId: `item-${i}`,
            itemName: `Fictional Potatoes ${i} `.padEnd(Math.floor(itemChars / 10), 'x'),
            dispQty: 5,
          })),
        },
      ],
      pagination: { total_count: 1000, current_page: 1, total_pages: 50 },
    },
  },
  error: null,
});

/** Lets every queued storage operation land (the cache is written after the list is returned). */
const settle = () => new Promise(resolve => setImmediate(resolve));

const entryKeys = async () =>
  (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(CACHE_PREFIXES.DISPATCH_LIST) && key !== INDEX_KEY);

const entryChars = async () => {
  const pairs = await AsyncStorage.multiGet(await entryKeys());
  return pairs.reduce((sum, [, value]) => sum + (value?.length ?? 0), 0);
};

/** Request number `n` of a browsing session: pages through results and searches. The first is never asked again. */
const request = (n: number) => ({
  p_limit: 20,
  offset: (n % 15) * 20,
  p_filters: n % 2 === 0 && n > 0 ? {} : { search: `fictional term ${n}` },
  p_sort_order: (n % 3 === 0 ? 'asc' : 'desc') as 'asc' | 'desc',
});

let logs: jest.SpyInstance[];

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-13T09:00:00Z'));
  jest.clearAllMocks();
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

it('keeps at most 24 entries and 1 MiB after 300 distinct pages and searches, oldest first out', async () => {
  const draftKey = 'grn_form_draft_fictional';
  const otherCacheKey = `${CACHE_PREFIXES.GRN_LIST}_fictional_scope_1`;
  await AsyncStorage.multiSet([
    [draftKey, '{"customer":"Fictional Customer"}'],
    [otherCacheKey, '{"data":[],"timestamp":0}'],
  ]);

  let firstKey: string | undefined;
  let mostEntries = 0;
  let mostChars = 0;
  for (let n = 0; n < 300; n++) {
    // Item lists of 2 to 90 KB, so that both the count and the total size limit bind.
    rpc.mockResolvedValueOnce(listResponse(`d${n}`, 2000 + (n % 5) * 22000));
    expect((await getDispatchListWithItems(request(n))).success).toBe(true);
    await settle();
    const keys = await entryKeys();
    if (n === 0) firstKey = keys[0];
    mostEntries = Math.max(mostEntries, keys.length);
    mostChars = Math.max(mostChars, await entryChars());
    jest.advanceTimersByTime(500);
  }

  expect(mostEntries).toBeLessThanOrEqual(MAX_ENTRIES);
  expect(mostChars).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
  // The oldest answers were removed by later writes, without any offline read of them.
  expect(firstKey).toBeDefined();
  expect(await entryKeys()).not.toContain(firstKey);
  // The index lists exactly the entries kept.
  const index = JSON.parse((await AsyncStorage.getItem(INDEX_KEY)) ?? '[]') as [string, number, number][];
  expect(index.map(row => row[0]).sort()).toEqual((await entryKeys()).sort());
  // Nothing outside the dispatch prefix was touched.
  expect(await AsyncStorage.getItem(draftKey)).toBe('{"customer":"Fictional Customer"}');
  expect(await AsyncStorage.getItem(otherCacheKey)).not.toBeNull();

  // The most recent answer is still served when the network fails.
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  const offline = await getDispatchListWithItems(request(299));
  expect(offline.success).toBe(true);
  expect(offline.data.dispatches.map(d => d.id)).toEqual(['d299']);
});

it('does not keep an answer longer than 256 KiB', async () => {
  rpc.mockResolvedValueOnce(listResponse('huge', MAX_ENTRY_CHARS + 1000));
  expect((await getDispatchListWithItems({ p_limit: 20 })).success).toBe(true);
  await settle();
  expect(await entryKeys()).toEqual([]);

  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  expect((await getDispatchListWithItems({ p_limit: 20 })).success).toBe(false);
});

it('does not serve an answer older than its five minutes, and removes it at the next write', async () => {
  rpc.mockResolvedValueOnce(listResponse('old'));
  await getDispatchListWithItems({ p_limit: 20, offset: 0 });
  await settle();
  const [oldKey] = await entryKeys();
  expect(oldKey).toBeDefined();

  jest.advanceTimersByTime(CACHE_DURATION_DEFAULT_MS + 1000);
  // Another page is fetched; the expired answer is never read, yet it goes.
  rpc.mockResolvedValueOnce(listResponse('new'));
  await getDispatchListWithItems({ p_limit: 20, offset: 20 });
  await settle();
  const keys = await entryKeys();
  expect(keys).toHaveLength(1);
  expect(keys).not.toContain(oldKey);

  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  expect((await getDispatchListWithItems({ p_limit: 20, offset: 0 })).success).toBe(false);
  rpc.mockResolvedValueOnce({ data: null, error: networkError });
  const recent = await getDispatchListWithItems({ p_limit: 20, offset: 20 });
  expect(recent.success).toBe(true);
  expect(recent.data.dispatches.map(d => d.id)).toEqual(['new']);
});

it('discards an answer to a request sent before a sign-out, sign-in or server switch', async () => {
  let answer: (value: unknown) => void = () => {};
  rpc.mockReturnValueOnce(new Promise(resolve => (answer = resolve)));
  const pending = getDispatchListWithItems({ p_limit: 20 });
  // Let the request reach the server, then change the session before it answers.
  await settle();
  expect(rpc).toHaveBeenCalledTimes(1);
  advanceSessionGeneration();
  answer(listResponse('earlier-session'));
  await pending;
  await settle();
  expect(await entryKeys()).toEqual([]);
});

it('removes the index with the entries on a dispatch deletion and at session teardown', async () => {
  rpc.mockResolvedValueOnce(listResponse('d1'));
  await getDispatchListWithItems({ p_limit: 20 });
  await settle();
  expect(await AsyncStorage.getItem(INDEX_KEY)).not.toBeNull();
  await invalidateDispatchCache();
  expect(await entryKeys()).toEqual([]);
  expect(await AsyncStorage.getItem(INDEX_KEY)).toBeNull();

  rpc.mockResolvedValueOnce(listResponse('d2'));
  await getDispatchListWithItems({ p_limit: 20 });
  await settle();
  expect(await AsyncStorage.getItem(INDEX_KEY)).not.toBeNull();
  await clearAllCaches();
  expect(await entryKeys()).toEqual([]);
  expect(await AsyncStorage.getItem(INDEX_KEY)).toBeNull();
});
