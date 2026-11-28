/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md section 3 (R5): a report answered by the phone copy is
 * never kept as, or preceded by, a saved server answer, and carries the copy's time.
 *
 * The hook is real. Stand-ins: the phone's saved reports (reportCache) and the read route's decision.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { readReportCache, writeReportCache } from '@/features/reports/reportCache';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';

let mockRoute: 'copy' | 'server' = 'server';
jest.mock('@/features/phone-copy/readRoute', () => ({ copyRoute: () => mockRoute, readVia: jest.fn() }));
jest.mock('../reportCache', () => ({
  readReportCache: jest.fn(async () => ({ data: { total: 1 }, updatedAt: 1000 })),
  writeReportCache: jest.fn(async () => undefined),
  removeReportCache: jest.fn(async () => undefined),
  removeReportCachePrefix: jest.fn(async () => undefined),
}));
jest.mock('@/hooks/useRouteFocus', () => ({ useRouteFocus: () => true, useAppForeground: () => true }));

const AS_OF = '2026-11-25T05:12:00.000+00:00';
type Answer = { success: boolean; data: { total: number }; source?: { kind: 'copy'; asOf: string } };

let restore: () => void;
beforeAll(() => { restore = makeQueryUpdatesImmediate(); });
afterAll(() => restore());
beforeEach(() => {
  forgetQueries();
  jest.clearAllMocks();
});

/** The hook asked for one report, its answer held until `answer` is called. */
async function ask(reply: Answer) {
  let answer!: () => void;
  const held = new Promise<Answer>(resolve => { answer = () => resolve(reply); });
  const hook = await renderHook(() => useReportQuery({ key: ['stock-summary', 'all'], fetch: () => held, fallbackError: 'failed' }));
  return { hook, answer };
}
const fromPhoneCopy = (value: unknown) => (value as { fromPhoneCopy?: boolean }).fromPhoneCopy;

it('a copy answer: no saved report is shown first, nothing is saved, and its time is the copy\'s', async () => {
  mockRoute = 'copy';
  const { hook, answer } = await ask({ success: true, data: { total: 2 }, source: { kind: 'copy', asOf: AS_OF } });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(hook.result.current.data).toBeUndefined();
  expect(readReportCache).not.toHaveBeenCalled();
  answer();
  await waitFor(() => expect(hook.result.current.data).toEqual({ total: 2 }));
  expect(writeReportCache).not.toHaveBeenCalled();
  expect(hook.result.current.updatedAt).toBe(Date.parse(AS_OF));
  expect(hook.result.current.isKeptCopy).toBe(false);
  expect(fromPhoneCopy(hook.result.current)).toBe(true);
});

it('a server answer is saved and preceded by the saved one, as today', async () => {
  mockRoute = 'server';
  const { hook, answer } = await ask({ success: true, data: { total: 3 } });
  await waitFor(() => expect(hook.result.current.data).toEqual({ total: 1 }));
  expect(hook.result.current.isKeptCopy).toBe(true);
  answer();
  await waitFor(() => expect(hook.result.current.data).toEqual({ total: 3 }));
  expect(writeReportCache).toHaveBeenCalledTimes(1);
  expect(fromPhoneCopy(hook.result.current)).not.toBe(true);
});
