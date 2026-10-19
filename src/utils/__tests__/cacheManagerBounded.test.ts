/**
 * DATA-05: createBoundedCache keeps one prefix's entries in a bounded index (count, total size,
 * entry size, age), touches no other key, and does nothing across a change of session.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { advanceSessionGeneration, getSessionGeneration } from '@/config/sessionLifecycle';
import * as cacheManager from '@/utils/cacheManager';
import type { BoundedCache, BoundedCacheLimits } from '@/utils/cacheManager';

jest.mock('@/config/supabaseConfig', () => ({ getSessionIdentity: jest.fn() }));

const PREFIX = 'fictional_list_cache';
const LIMITS: BoundedCacheLimits = { maxEntries: 24, maxTotalChars: 1024 * 1024, maxEntryChars: 256 * 1024, expiryMs: 5 * 60 * 1000 };
const INDEX_KEY = `${PREFIX}_index`;

const create = (prefix = PREFIX, limits = LIMITS): BoundedCache => {
  // Read through the namespace: the unfixed module has no such export.
  const factory = (cacheManager as { createBoundedCache?: typeof cacheManager.createBoundedCache }).createBoundedCache;
  if (!factory) throw new Error('cacheManager does not export createBoundedCache');
  return factory(prefix, limits);
};
const key = (n: number | string) => `${PREFIX}_scope_page_${n}`;
const payload = (chars: number) => ({ rows: ['x'.repeat(chars)] });

const entryKeys = async (prefix = PREFIX) =>
  (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`${prefix}_`) && k !== `${prefix}_index`);
const entryChars = async () =>
  (await AsyncStorage.multiGet(await entryKeys())).reduce((sum, [, value]) => sum + (value?.length ?? 0), 0);
const indexRows = async () => JSON.parse((await AsyncStorage.getItem(INDEX_KEY)) ?? '[]') as [string, number, number][];

let log: jest.SpyInstance;

beforeEach(async () => {
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-13T09:00:00Z'));
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
afterEach(() => {
  log.mockRestore();
  jest.useRealTimers();
});

it('stays within its count and size after 300 writes, keeping the newest, and touches no other key', async () => {
  const cache = create();
  await AsyncStorage.multiSet([
    ['grn_form_draft_fictional', '{"customer":"Fictional Customer"}'],
    ['report_cache_fictional', '{"v":"1","data":{}}'],
    ['fictional_list_cacheless', 'not under the prefix'],
  ]);
  for (let n = 0; n < 300; n++) {
    await cache.set(key(n), payload(1000 + (n % 7) * 15000));
    expect((await entryKeys()).length).toBeLessThanOrEqual(LIMITS.maxEntries);
    expect(await entryChars()).toBeLessThanOrEqual(LIMITS.maxTotalChars);
    jest.advanceTimersByTime(100);
  }
  const kept = await entryKeys();
  expect(kept).toContain(key(299));
  expect(kept).not.toContain(key(0));
  // Newest first: every kept entry is newer than every removed one.
  const keptNumbers = kept.map(k => Number(k.split('_').pop()));
  expect(Math.min(...keptNumbers)).toBe(300 - kept.length);
  expect((await indexRows()).map(row => row[0]).sort()).toEqual([...kept].sort());
  expect(await AsyncStorage.getItem('grn_form_draft_fictional')).not.toBeNull();
  expect(await AsyncStorage.getItem('report_cache_fictional')).not.toBeNull();
  expect(await AsyncStorage.getItem('fictional_list_cacheless')).not.toBeNull();
  expect(await cache.get(key(299))).toEqual(payload(1000 + (299 % 7) * 15000));
});

it('reads its entries with getCachedData, and serves a recent one but not an expired one', async () => {
  const cache = create();
  await cache.set(key('a'), payload(10));
  expect(await cacheManager.getCachedData(key('a'), { expiryMs: LIMITS.expiryMs })).toEqual(payload(10));
  jest.advanceTimersByTime(LIMITS.expiryMs - 1000);
  expect(await cache.get(key('a'))).toEqual(payload(10));
  jest.advanceTimersByTime(2000);
  expect(await cache.get(key('a'))).toBeNull();
});

it('removes an expired entry at the next write, without reading it', async () => {
  const cache = create();
  await cache.set(key('old'), payload(10));
  jest.advanceTimersByTime(LIMITS.expiryMs + 1);
  await cache.set(key('new'), payload(10));
  expect(await entryKeys()).toEqual([key('new')]);
  expect((await indexRows()).map(row => row[0])).toEqual([key('new')]);
});

it('does not store an entry longer than its limit, and drops the older answer to the same key', async () => {
  const cache = create();
  await cache.set(key('a'), payload(10));
  expect(await cache.set(key('a'), payload(LIMITS.maxEntryChars))).toBe(false);
  expect(await entryKeys()).toEqual([]);
  expect(await indexRows()).toEqual([]);
});

it('does not write for an earlier session, nor when the session changes during the write', async () => {
  const cache = create();
  const earlier = getSessionGeneration();
  advanceSessionGeneration();
  expect(await cache.set(key('a'), payload(10), earlier)).toBe(false);

  // The session changes while the write waits for the index.
  jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async () => {
    advanceSessionGeneration();
    return null;
  });
  expect(await cache.set(key('b'), payload(10))).toBe(false);

  // The session changes right after the write was asked for.
  const pending = cache.set(key('c'), payload(10));
  advanceSessionGeneration();
  expect(await pending).toBe(false);
  expect(await entryKeys()).toEqual([]);
});

it('does not serve a read that crosses a change of session', async () => {
  const cache = create();
  await cache.set(key('a'), payload(10));
  const generation = getSessionGeneration();
  jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async () => {
    advanceSessionGeneration();
    return JSON.stringify({ data: payload(10), timestamp: Date.now(), cacheKey: key('a'), version: '1.0' });
  });
  expect(await cache.get(key('a'), generation)).toBeNull();
  expect(await cache.get(key('a'), generation)).toBeNull();
});

it('keeps every one of many writes sent together in the index', async () => {
  const cache = create();
  await Promise.all(Array.from({ length: 10 }, (_, n) => cache.set(key(n), payload(10))));
  expect((await indexRows()).length).toBe(10);
  expect((await entryKeys()).sort()).toEqual(Array.from({ length: 10 }, (_, n) => key(n)).sort());
});

it('removes entries no index lists (written before the index existed) at the first write', async () => {
  await AsyncStorage.multiSet([
    [key('legacy-1'), JSON.stringify({ data: 1, timestamp: Date.now(), cacheKey: key('legacy-1') })],
    [key('legacy-2'), JSON.stringify({ data: 2, timestamp: Date.now(), cacheKey: key('legacy-2') })],
    ['grn_form_draft_fictional', '{}'],
  ]);
  const cache = create();
  await cache.set(key('a'), payload(10));
  expect(await entryKeys()).toEqual([key('a')]);
  expect(await AsyncStorage.getItem('grn_form_draft_fictional')).toBe('{}');
});

it('clear() and clearAllCaches remove the entries and the index after the queued writes', async () => {
  const cache = create('dispatch_list_cache');
  const dispatchKey = (n: number) => `dispatch_list_cache_scope_${n}`;
  void cache.set(dispatchKey(1), payload(10));
  await cache.clear();
  expect(await entryKeys('dispatch_list_cache')).toEqual([]);
  expect(await AsyncStorage.getItem('dispatch_list_cache_index')).toBeNull();

  void cache.set(dispatchKey(2), payload(10));
  await AsyncStorage.setItem('grn_form_draft_fictional', '{}');
  await cacheManager.clearAllCaches();
  expect(await entryKeys('dispatch_list_cache')).toEqual([]);
  expect(await AsyncStorage.getItem('dispatch_list_cache_index')).toBeNull();
  expect(await AsyncStorage.getItem('grn_form_draft_fictional')).toBe('{}');
});

it('refuses a key outside its prefix', async () => {
  const cache = create();
  expect(await cache.set('grn_form_draft_fictional', payload(10))).toBe(false);
  expect(await cache.set(INDEX_KEY, payload(10))).toBe(false);
  expect(await AsyncStorage.getItem('grn_form_draft_fictional')).toBeNull();
});

it('getEntry returns the data with the time it was stored, and nothing once expired (R6-6)', async () => {
  const cache = create();
  await cache.set(key('a'), payload(10));
  jest.advanceTimersByTime(60 * 1000);
  const entry = await cache.getEntry<ReturnType<typeof payload>>(key('a'));
  expect(entry).toEqual({ data: payload(10), storedAt: new Date('2026-10-13T09:00:00Z').getTime() });
  expect(await cache.get(key('a'))).toEqual(payload(10));
  jest.advanceTimersByTime(LIMITS.expiryMs);
  expect(await cache.getEntry(key('a'))).toBeNull();
});
