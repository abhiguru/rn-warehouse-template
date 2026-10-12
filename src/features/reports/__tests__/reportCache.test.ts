/**
 * The last answer of each report, kept on the phone for one session only and
 * within a size budget.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionIdentity } from '@/config/supabaseConfig';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { CACHE_DURATION_REPORT_MS, CACHE_PREFIXES } from '@/config/cacheConfig';
import { clearAllCaches } from '@/utils/cacheManager';
import {
  MAX_ENTRIES,
  MAX_ENTRY_CHARS,
  MAX_TOTAL_CHARS,
  readReportCache,
  removeReportCache,
  writeReportCache,
} from '../reportCache';

jest.mock('@/config/supabaseConfig', () => ({ getSessionIdentity: jest.fn() }));

const accountA = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
const accountB = { ...accountA, subject: 'user-b' };
const key = ['dispatch-activity', 'customer', 'customer-1', '2026-01-01', '2026-10-12'];
const answer = { summary: { total_dispatches: 2 }, dispatches: [{ disp_no: 'DD0003', customer_name: 'Fictional Traders' }] };
const signIn = (account: typeof accountA | null) => jest.mocked(getSessionIdentity).mockResolvedValue(account);
const reportKeys = async () => (await AsyncStorage.getAllKeys()).filter(stored => stored.startsWith(CACHE_PREFIXES.REPORT));
const padded = (chars: number) => ({ rows: 'x'.repeat(chars) });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  signIn(accountA);
});

it('gives back what was kept, with the time it was answered', async () => {
  const answeredAt = Date.now() - 60_000;
  await writeReportCache(key, { data: answer, updatedAt: answeredAt });
  expect(await readReportCache<typeof answer>(key)).toEqual({ data: answer, updatedAt: answeredAt });
  expect(await readReportCache(['dispatch-activity', 'customer', 'customer-2', '2026-01-01', '2026-10-12'])).toBeNull();
  // Keyed as the query client keys it: the order of an object's fields does not matter.
  await writeReportCache(['stock-aging', { from: '2026-01-01', to: '2026-10-12' }], { data: answer, updatedAt: answeredAt });
  expect(await readReportCache(['stock-aging', { to: '2026-10-12', from: '2026-01-01' }])).not.toBeNull();
});

it('reads and writes nothing without a session', async () => {
  signIn(null);
  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  signIn(accountA);
  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  signIn(null);
  expect(await readReportCache(key)).toBeNull();
  expect(AsyncStorage.getItem).not.toHaveBeenCalledWith(expect.stringContaining('customer-1'));
});

it('does not give one account what another account kept', async () => {
  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  signIn(accountB);
  expect(await readReportCache(key)).toBeNull();
  signIn({ ...accountA, instanceId: 'instance-b' });
  expect(await readReportCache(key)).toBeNull();
  signIn(accountA);
  expect(await readReportCache(key)).not.toBeNull();
});

it('does not give back an answer older than the time it is kept for', async () => {
  await writeReportCache(key, { data: answer, updatedAt: Date.now() - CACHE_DURATION_REPORT_MS - 1 });
  expect(await readReportCache(key)).toBeNull();
  await writeReportCache(key, { data: answer, updatedAt: Date.now() - CACHE_DURATION_REPORT_MS + 60_000 });
  expect(await readReportCache(key)).not.toBeNull();
});

it('does not keep an answer that is too long, and keeps the last one that fit', async () => {
  await writeReportCache(key, { data: answer, updatedAt: Date.now() - 1_000 });
  await writeReportCache(key, { data: padded(MAX_ENTRY_CHARS), updatedAt: Date.now() });
  expect((await readReportCache(key))?.data).toEqual(answer);
  await writeReportCache(['other'], { data: padded(MAX_ENTRY_CHARS), updatedAt: Date.now() });
  expect(await readReportCache(['other'])).toBeNull();
});

it('keeps only the newest answers within the budget', async () => {
  const now = Date.now();
  // Each of these is a little under a quarter of the budget: four fit, a fifth pushes out the oldest.
  const big = padded(MAX_TOTAL_CHARS / 4 - 2_000);
  expect(JSON.stringify(big).length).toBeLessThan(MAX_ENTRY_CHARS);
  for (let i = 0; i < 5; i++) await writeReportCache([`big-${i}`], { data: big, updatedAt: now - 10_000 + i });
  expect(await readReportCache(['big-0'])).toBeNull();
  for (const i of [1, 2, 3, 4]) expect(await readReportCache([`big-${i}`])).not.toBeNull();
  expect(await reportKeys()).toHaveLength(5);

  for (let i = 0; i < MAX_ENTRIES; i++) await writeReportCache([`small-${i}`], { data: answer, updatedAt: now + i });
  // The index row plus MAX_ENTRIES answers; the big ones were the oldest.
  expect(await reportKeys()).toHaveLength(MAX_ENTRIES + 1);
  expect(await readReportCache(['big-4'])).toBeNull();
  expect(await readReportCache(['small-0'])).not.toBeNull();
});

it('keeps answers written together', async () => {
  await Promise.all([1, 2, 3].map(i => writeReportCache([`report-${i}`], { data: answer, updatedAt: Date.now() })));
  for (const i of [1, 2, 3]) expect(await readReportCache([`report-${i}`])).not.toBeNull();
  const index = JSON.parse((await AsyncStorage.getItem(`${CACHE_PREFIXES.REPORT}_index`)) ?? '[]') as unknown[];
  expect(index).toHaveLength(3);
});

it('swallows a storage error on read and on write', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('fictional storage failure'));
  await expect(readReportCache(key)).resolves.toBeNull();
  jest.mocked(AsyncStorage.multiSet).mockRejectedValueOnce(new Error('fictional storage full'));
  await expect(writeReportCache(key, { data: answer, updatedAt: Date.now() })).resolves.toBeUndefined();
  expect(await readReportCache(key)).toBeNull();
  // The next write still runs.
  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  expect(await readReportCache(key)).not.toBeNull();
  // An entry that is not JSON is a miss.
  await AsyncStorage.setItem((await reportKeys()).find(stored => stored.includes('customer-1')) ?? '', '{not json');
  await expect(readReportCache(key)).resolves.toBeNull();
});

it('neither keeps nor gives back an answer across a change of session', async () => {
  // The request was sent before the sign-out; its answer arrives after.
  const before = advanceSessionGeneration();
  advanceSessionGeneration();
  await writeReportCache(key, { data: answer, updatedAt: Date.now() }, before);
  expect(await AsyncStorage.getAllKeys()).toEqual([]);

  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  let release!: () => void;
  jest.mocked(getSessionIdentity).mockImplementationOnce(
    () => new Promise(resolve => { release = () => resolve(accountA); })
  );
  const reading = readReportCache(key);
  advanceSessionGeneration();
  release();
  expect(await reading).toBeNull();
});

it('forgets one answer, and only that one, when asked to', async () => {
  const other = ['dispatch-activity', 'customer', 'customer-2', '2026-01-01', '2026-10-12'];
  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  await writeReportCache(other, { data: answer, updatedAt: Date.now() });
  expect(await reportKeys()).toHaveLength(3);
  await removeReportCache(key);
  expect(await readReportCache(key)).toBeNull();
  expect(await readReportCache(other)).not.toBeNull();
  expect(await reportKeys()).toHaveLength(2);
  const index = JSON.parse((await AsyncStorage.getItem(`${CACHE_PREFIXES.REPORT}_index`)) ?? '[]') as [string][];
  expect(index.map(([stored]) => stored)).toEqual([expect.stringContaining('customer-2')]);
  // Forgetting what is not kept changes nothing.
  await removeReportCache(key);
  expect(await reportKeys()).toHaveLength(2);
});

it('forgets after a write sent before it, and not across a change of session', async () => {
  // Sent together, the write first: the removal still wins.
  await Promise.all([writeReportCache(key, { data: answer, updatedAt: Date.now() }), removeReportCache(key)]);
  expect(await readReportCache(key)).toBeNull();

  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  const before = advanceSessionGeneration();
  advanceSessionGeneration();
  await removeReportCache(key, before);
  expect(await readReportCache(key)).not.toBeNull();
  signIn(null);
  await removeReportCache(key);
  signIn(accountA);
  expect(await readReportCache(key)).not.toBeNull();
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('fictional storage failure'));
  await expect(removeReportCache(key)).resolves.toBeUndefined();
});

it('is removed by the session teardown', async () => {
  await writeReportCache(key, { data: answer, updatedAt: Date.now() });
  await AsyncStorage.setItem('operator_server_v1', '{"origin":"https://warehouse.example.test"}');
  expect(await reportKeys()).toHaveLength(2);
  await clearAllCaches();
  expect(await AsyncStorage.getAllKeys()).toEqual(['operator_server_v1']);
  expect(await readReportCache(key)).toBeNull();
});
