/**
 * DATA-06: a collected customer history is held in memory only while it is useful. A change of
 * session empties the cache at once, expired histories go at the next call for any key, and at
 * most MAX_HISTORY_ENTRIES settled histories are kept, least recently used first out.
 */
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import * as historyCache from '../customerHistoryCache';
import { CUSTOMER_HISTORY_TTL_MS, clearCustomerHistoryCache, customerHistory } from '../customerHistoryCache';

// Read through the module namespace: the unfixed module has no such export.
const size = (): number => {
  const sizeForTests = (historyCache as { __sizeForTests?: () => number }).__sizeForTests;
  if (!sizeForTests) throw new Error('customerHistoryCache does not expose __sizeForTests');
  return sizeForTests();
};
const MAX = (historyCache as { MAX_HISTORY_ENTRIES?: number }).MAX_HISTORY_ENTRIES ?? Infinity;

const settle = () => new Promise(resolve => setImmediate(resolve));
const rows = (customer: string) => ({ rows: [{ id: `${customer}-invoice-1`, customer: 'Fictional Customer' }] });

let loads: jest.Mock;
const loader = (key: string) => {
  loads(key);
  return Promise.resolve(rows(key));
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-13T09:00:00Z'));
  clearCustomerHistoryCache();
  loads = jest.fn();
});
afterEach(() => jest.useRealTimers());

it('empties the cache on a change of session without another call', async () => {
  await customerHistory('dispatches:fictional-a', () => loader('a'));
  await customerHistory('invoices:fictional-b', () => loader('b'));
  expect(size()).toBe(2);

  advanceSessionGeneration();
  expect(size()).toBe(0);

  // The next call for an old key loads again.
  await customerHistory('dispatches:fictional-a', () => loader('a'));
  expect(loads).toHaveBeenCalledTimes(3);
});

it('removes an expired history at the next call for any key', async () => {
  await customerHistory('dispatches:fictional-a', () => loader('a'));
  jest.advanceTimersByTime(CUSTOMER_HISTORY_TTL_MS + 1);
  await customerHistory('invoices:fictional-b', () => loader('b'));
  expect(size()).toBe(1);

  // A history still within its time is kept and served.
  await customerHistory('invoices:fictional-b', () => loader('b'));
  expect(loads).toHaveBeenCalledTimes(2);
});

it('keeps at most eight settled histories, evicting the least recently used but never a pending load', async () => {
  expect(MAX).toBe(8);
  // A load that has not answered yet, started first.
  let answer: (value: unknown) => void = () => {};
  const pending = customerHistory('invoices:pending', () => {
    loads('pending');
    return new Promise(resolve => (answer = resolve));
  });

  for (let i = 1; i <= 8; i++) await customerHistory(`dispatches:c${i}`, () => loader(`c${i}`));
  // Use the first one again: it becomes the most recently used.
  await customerHistory('dispatches:c1', () => loader('c1'));
  expect(loads).toHaveBeenCalledTimes(9);

  // A ninth settled history evicts c2, the least recently used settled one.
  await customerHistory('dispatches:c9', () => loader('c9'));
  await settle();
  expect(size()).toBe(9); // eight settled and the pending one

  await customerHistory('dispatches:c1', () => loader('c1'));
  expect(loads).toHaveBeenCalledTimes(10);
  await customerHistory('dispatches:c2', () => loader('c2'));
  expect(loads).toHaveBeenCalledTimes(11);

  // The pending load was never evicted: a second caller still shares it.
  const joined = customerHistory('invoices:pending', () => loader('pending-again'));
  expect(joined).toBe(pending);
  answer(rows('pending'));
  await expect(joined).resolves.toEqual(rows('pending'));
  expect(loads).not.toHaveBeenCalledWith('pending-again');
});

it('still shares one load between two calls made at the same moment', async () => {
  const first = customerHistory('dispatches:fictional-a', () => loader('a'));
  const second = customerHistory('dispatches:fictional-a', () => loader('a'));
  expect(second).toBe(first);
  await Promise.all([first, second]);
  expect(loads).toHaveBeenCalledTimes(1);
});
