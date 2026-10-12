/**
 * A report's data by key: an answer never shows under another customer or
 * period, a known key shows its last answer at once, and a failure is told
 * apart from "nothing to show".
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionIdentity } from '@/config/supabaseConfig';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
import { queryClient } from '@/lib/queryClient';
import { ACCESS_REFUSED_CODE } from '@/utils/rpcRefusal';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries as settle } from '@/tests/helpers/reportQueries';
import { useReportQuery, type ReportQuery, type ReportServiceResult } from '../useReportQuery';
import { readReportCache, writeReportCache } from '../reportCache';

// Without a session (the default here) nothing is kept on the phone; the cases at the end sign in.
jest.mock('@/config/supabaseConfig', () => ({ getSessionIdentity: jest.fn(async () => null) }));

type Rows = { rows: string[] };
type Pending = { key: string; resolve: (result: ReportServiceResult<Rows>) => void; reject: (error: Error) => void };

let restore: () => void;
beforeAll(() => {
  restore = makeQueryUpdatesImmediate();
});
beforeEach(async () => {
  forgetQueries();
  jest.mocked(getSessionIdentity).mockResolvedValue(null);
  await AsyncStorage.clear();
});
afterAll(() => restore());

// A query that is still observed keeps its timers: every probe is taken down, also after a failed test.
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(renderer => renderer.unmount()));
});

function setup(first: string, { keyOf = (customer: string): unknown[] => ['test', customer], persist }: { keyOf?: (customer: string) => unknown[]; persist?: boolean } = {}) {
  const pending: Pending[] = [];
  const fetch = jest.fn(
    (key: string) =>
      new Promise<ReportServiceResult<Rows>>((resolve, reject) => {
        pending.push({ key, resolve, reject });
      })
  );
  let latest!: ReportQuery<Rows>;
  function Probe({ customer }: { customer: string }) {
    latest = useReportQuery<Rows>({ key: keyOf(customer), fetch: () => fetch(customer), fallbackError: 'Could not load', persist });
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe customer={first} />);
  });
  mounted.push(renderer);
  return {
    fetch,
    pending,
    query: () => latest,
    show: (customer: string) => act(() => renderer.update(<Probe customer={customer} />)),
    answer: (index: number, result: ReportServiceResult<Rows>) => act(async () => { pending[index].resolve(result); await settle(); }),
    fail: (index: number) => act(async () => { pending[index].reject(new Error('Network request failed')); await settle(); }),
    run: (callback: () => void) => act(async () => { callback(); await settle(); }),
  };
}

const rows = (...names: string[]): ReportServiceResult<Rows> => ({ success: true, data: { rows: names } });

/**
 * The phone's next read takes what is stored now but answers only on `release()`, so a test
 * decides what reaches the query first.
 */
function holdNextRead() {
  const read = jest.mocked(AsyncStorage.getItem);
  const realRead = read.getMockImplementation()!;
  let open!: () => void;
  const gate = new Promise<void>(resolve => { open = resolve; });
  read.mockClear();
  read.mockImplementationOnce(async (key: string) => {
    const stored = await realRead(key);
    await gate;
    return stored;
  });
  return {
    release: () => act(async () => { open(); await settle(); }),
    heldKey: () => read.mock.calls[0]?.[0],
  };
}

describe('report query', () => {
  it('loads, then shows the answer with the time it was given', async () => {
    const probe = setup('a');
    expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, error: null, updatedAt: undefined });
    await probe.answer(0, rows('GRN A0010'));
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0010'] }, error: null });
    expect(typeof probe.query().updatedAt).toBe('number');
  });

  it('never shows one customer\'s late answer under another customer', async () => {
    const probe = setup('a');
    probe.show('b');
    expect(probe.pending.map(request => request.key)).toEqual(['a', 'b']);
    // A's answer arrives after the screen moved on to B.
    await probe.answer(0, rows('belongs to A'));
    expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined });
    await probe.answer(1, rows('belongs to B'));
    expect(probe.query().data).toEqual({ rows: ['belongs to B'] });
  });

  it('shows a known key at once and asks again behind it', async () => {
    const probe = setup('a');
    await probe.answer(0, rows('first answer'));
    probe.show('b');
    await probe.answer(1, rows('other customer'));
    probe.show('a');
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['first answer'] }, isFetching: true });
    await probe.answer(2, rows('fresh answer'));
    expect(probe.query()).toMatchObject({ data: { rows: ['fresh answer'] }, isFetching: false });
  });

  it('tells a refusal and a failed request apart from loading, and loads again on retry', async () => {
    const probe = setup('a');
    await probe.answer(0, { success: false, message: 'Staff access required' });
    expect(probe.query()).toMatchObject({ phase: 'error', error: 'Staff access required', data: undefined });
    await probe.run(() => probe.query().retry());
    // While the retry is out the screen loads; it does not fall through to "nothing here".
    expect(probe.query()).toMatchObject({ phase: 'loading', error: null });
    await probe.answer(1, { success: false });
    expect(probe.query()).toMatchObject({ phase: 'error', error: 'Could not load' });
    await probe.run(() => probe.query().retry());
    await probe.fail(2);
    // A thrown error's own text ("Network request failed") is not for people: the caller's words are shown.
    expect(probe.query()).toMatchObject({ phase: 'error', error: 'Could not load' });
    await probe.run(() => probe.query().retry());
    await probe.answer(3, rows('GRN A0010'));
    expect(probe.query()).toMatchObject({ phase: 'ready', error: null });
    expect(probe.fetch).toHaveBeenCalledTimes(4);
  });

  it('keeps the rows and says so when a refresh fails, in the caller\'s words, and the refresh says it brought nothing new', async () => {
    const probe = setup('a');
    await probe.answer(0, rows('GRN A0010'));
    let outcome: Promise<boolean> | undefined;
    await probe.run(() => {
      outcome = probe.query().refresh();
    });
    expect(probe.query()).toMatchObject({ isRefreshing: true, phase: 'ready' });
    // A failure that is not a refusal: the service's own sentence is developer text and is not shown.
    await probe.answer(1, { success: false, message: 'Failed to fetch all-customers GRN activity' });
    expect(probe.query()).toMatchObject({
      phase: 'ready',
      data: { rows: ['GRN A0010'] },
      error: 'Could not load',
      isRefreshing: false,
    });
    await expect(outcome).resolves.toBe(false);

    await probe.run(() => {
      outcome = probe.query().refresh();
    });
    await probe.answer(2, rows('GRN A0011'));
    await expect(outcome).resolves.toBe(true);
    expect(probe.query()).toMatchObject({ data: { rows: ['GRN A0011'] }, error: null });
  });

  it('shows the service\'s message for a refusal only', async () => {
    const probe = setup('a');
    await probe.answer(0, { success: false, message: 'Failed to fetch all-customers GRN activity', error: '503' });
    expect(probe.query()).toMatchObject({ phase: 'error', error: 'Could not load' });
    await probe.run(() => probe.query().retry());
    await probe.answer(1, { success: false, message: 'તમને આ કામ કરવાની પરવાનગી નથી.', error: ACCESS_REFUSED_CODE });
    expect(probe.query()).toMatchObject({ phase: 'error', error: 'તમને આ કામ કરવાની પરવાનગી નથી.' });
  });
});

describe('the answer kept on the phone', () => {
  const account = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
  const signIn = () => jest.mocked(getSessionIdentity).mockResolvedValue(account);
  const keptAt = Date.now() - 2 * 60 * 60 * 1000;
  const kept = { rows: ['kept GRN A0010'] };
  const keep = () => writeReportCache(['test', 'a'], { data: kept, updatedAt: keptAt });

  it('shows the kept answer with its time while the request is out, then the fresh answer', async () => {
    signIn();
    await keep();
    const probe = setup('a');
    // The request went out at once; it did not wait for the phone.
    expect(probe.fetch).toHaveBeenCalledTimes(1);
    await probe.run(() => {});
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt, isFetching: true, error: null });
    await probe.answer(0, rows('fresh GRN A0011'));
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['fresh GRN A0011'] }, isFetching: false, error: null });
    expect(probe.query().updatedAt).toBeGreaterThan(keptAt);
    expect((await readReportCache(['test', 'a']))?.data).toEqual({ rows: ['fresh GRN A0011'] });
  });

  it('keeps the kept answer on screen and says it is not updated when the request fails, and keeps the copy', async () => {
    signIn();
    await keep();
    const probe = setup('a');
    await probe.run(() => {});
    await probe.fail(0);
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt, error: 'Could not load', isFetching: false });
    // A failure the service answered that is not a refusal (here a 503) is a failure too.
    await probe.run(() => probe.query().retry());
    await probe.answer(1, { success: false, message: 'Could not reach the facility', error: '503 Service Unavailable' });
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt, error: 'Could not load' });
    expect(await readReportCache(['test', 'a'])).toEqual({ data: kept, updatedAt: keptAt });
  });

  it('shows the kept answer as not updated when the request failed before the phone answered', async () => {
    signIn();
    await keep();
    const phone = holdNextRead();
    const probe = setup('a');
    await probe.run(() => {});
    expect(phone.heldKey()).toContain('["test","a"]');
    await probe.fail(0);
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Could not load' });
    await phone.release();
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt, error: 'Could not load', isKeptCopy: true });
  });

  it('never replaces an answer from the facility with the older kept one', async () => {
    signIn();
    await keep();
    const phone = holdNextRead();
    const probe = setup('a');
    await probe.run(() => {});
    expect(phone.heldKey()).toContain('["test","a"]');
    expect(probe.query()).toMatchObject({ phase: 'loading', isFetching: true });
    await probe.answer(0, rows('fresh GRN A0011'));
    const answeredAt = probe.query().updatedAt;
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['fresh GRN A0011'] } });
    await phone.release();
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['fresh GRN A0011'] }, updatedAt: answeredAt, error: null });
    expect(answeredAt).toBeGreaterThan(keptAt);
  });

  it('does not put a kept answer back after the session teardown emptied the queries', async () => {
    signIn();
    await keep();
    const phone = holdNextRead();
    const probe = setup('a');
    await probe.run(() => {});
    expect(phone.heldKey()).toContain('["test","a"]');
    // Offline: the request failed, so nothing is out when the session ends. (A request still out
    // when the query is emptied leaves the library a 30-minute timer, which would hold Jest open.)
    await probe.fail(0);
    // Sign-out leaves the screen and empties the query client while the phone is still reading.
    act(() => mounted.splice(0).forEach(renderer => renderer.unmount()));
    queryClient.clear();
    await phone.release();
    expect(queryClient.getQueryCache().find({ queryKey: ['report', 'test', 'a'] })).toBeUndefined();
  });

  it('without a session, shows nothing kept and keeps nothing', async () => {
    signIn();
    await keep();
    const before = [...(await AsyncStorage.getAllKeys())].sort();
    jest.mocked(getSessionIdentity).mockResolvedValue(null);
    const probe = setup('a');
    await probe.run(() => {});
    expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, updatedAt: undefined });
    await probe.answer(0, rows('fresh GRN A0011'));
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['fresh GRN A0011'] } });
    expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(before);
    signIn();
    expect(await readReportCache(['test', 'a'])).toEqual({ data: kept, updatedAt: keptAt });
  });
});

describe('a refusal', () => {
  const account = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
  const signIn = () => jest.mocked(getSessionIdentity).mockResolvedValue(account);
  const keptAt = Date.now() - 2 * 60 * 60 * 1000;
  const kept = { rows: ['kept GRN A0010'] };
  const keep = (customer = 'a', data: Rows = kept) => writeReportCache(['test', customer], { data, updatedAt: keptAt });
  // As refusedReport (src/services/reporting/reportEnvelope.ts) answers: the server's sentence, and its code or none.
  const refusedBySentence: ReportServiceResult<Rows> = { success: false, message: 'Access denied: customer not assigned', error: 'REPORT_REFUSED' };
  // In Gujarati the sentence is the app's own and does not name the reason; the code still does.
  const refusedByCode: ReportServiceResult<Rows> = { success: false, message: 'Could not load the report', error: '42501' };
  const storedKeys = async () => [...(await AsyncStorage.getAllKeys())].filter(stored => stored.includes('["test",'));
  const indexed = async () => JSON.parse((await AsyncStorage.getItem(`${CACHE_PREFIXES.REPORT}_index`)) ?? '[]') as unknown[];

  it('takes the kept answer off the screen and off the phone', async () => {
    signIn();
    await keep();
    expect(await storedKeys()).toHaveLength(1);
    const probe = setup('a');
    await probe.run(() => {});
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt });
    await probe.answer(0, refusedBySentence);
    expect(probe.query()).toMatchObject({
      phase: 'error',
      data: undefined,
      updatedAt: undefined,
      error: 'Access denied: customer not assigned',
      isFetching: false,
    });
    expect(await readReportCache(['test', 'a'])).toBeNull();
    expect(await storedKeys()).toEqual([]);
    expect(await indexed()).toEqual([]);
  });

  it('is not covered by a kept answer that the phone gives after it', async () => {
    signIn();
    await keep();
    const phone = holdNextRead();
    const probe = setup('a');
    await probe.run(() => {});
    expect(phone.heldKey()).toContain('["test","a"]');
    await probe.answer(0, refusedByCode);
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Could not load the report' });
    // The phone read the entry before it was removed, and answers only now.
    await phone.release();
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, updatedAt: undefined, error: 'Could not load the report' });
    expect(await storedKeys()).toEqual([]);
  });

  it('drops the answer given earlier in the session, and a later answer shows again', async () => {
    signIn();
    const probe = setup('a');
    await probe.answer(0, rows('GRN A0010'));
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0010'] } });
    expect(await storedKeys()).toHaveLength(1);
    await probe.run(() => probe.query().refresh());
    await probe.answer(1, { success: false, message: 'Staff access required' });
    expect(probe.query()).toMatchObject({
      phase: 'error',
      data: undefined,
      updatedAt: undefined,
      error: 'Staff access required',
      isRefreshing: false,
    });
    expect(queryClient.getQueryData(['report', 'test', 'a'])).toBeUndefined();
    expect(await storedKeys()).toEqual([]);
    // Access given back: the next answer shows as usual.
    await probe.run(() => probe.query().retry());
    expect(probe.query()).toMatchObject({ phase: 'loading', error: null });
    await probe.answer(2, rows('GRN A0011'));
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0011'] }, error: null });
  });

  it('leaves another key\'s kept answer, on the phone and on screen', async () => {
    signIn();
    const other = { rows: ['kept GRN B0020'] };
    await keep('a');
    await keep('b', other);
    const probe = setup('a');
    await probe.run(() => {});
    await probe.answer(0, refusedBySentence);
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined });
    expect(await readReportCache(['test', 'b'])).toEqual({ data: other, updatedAt: keptAt });
    expect(await storedKeys()).toHaveLength(1);
    expect(await indexed()).toHaveLength(1);
    probe.show('b');
    await probe.run(() => {});
    expect(probe.query()).toMatchObject({ phase: 'ready', data: other, updatedAt: keptAt, isFetching: true });
    await probe.answer(1, rows('fresh GRN B0021'));
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['fresh GRN B0021'] } });
  });

  it('is recognised by its code when the message is in Gujarati and the server sent no code', async () => {
    signIn();
    await keep();
    const probe = setup('a');
    await probe.run(() => {});
    // As refusedReport answers in Gujarati: the app's own sentence, and the code it gives an access refusal.
    const message = 'તમને આ કામ કરવાની પરવાનગી નથી.';
    await probe.answer(0, { success: false, message, error: ACCESS_REFUSED_CODE });
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, updatedAt: undefined, error: message });
    expect(await readReportCache(['test', 'a'])).toBeNull();
    expect(await storedKeys()).toEqual([]);
  });

  it('is told apart from a plain failure, which keeps the kept answer beside the error', async () => {
    signIn();
    await keep();
    const probe = setup('a');
    await probe.run(() => {});
    await probe.answer(0, { success: false, message: 'Could not load the report', error: 'Request failed with status 503' });
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt, error: 'Could not load' });
    expect(await readReportCache(['test', 'a'])).toEqual({ data: kept, updatedAt: keptAt });
    expect(await storedKeys()).toHaveLength(1);
  });

  describe('of one customer', () => {
    // As the reports key one customer's report: [report, 'customer', customerId, ...period].
    const period = (customer: string, days: string) => ['grn-activity', 'customer', customer, days];
    const keepPeriod = (customer: string, days: string, data: Rows = kept) => writeReportCache(period(customer, days), { data, updatedAt: keptAt });
    const keptKeys = async () => [...(await AsyncStorage.getAllKeys())].filter(stored => stored.includes('["grn-activity",'));

    it('also forgets that customer\'s other periods, on the phone and in memory, and leaves another customer\'s', async () => {
      signIn();
      const other = { rows: ['kept GRN B0020'] };
      await keepPeriod('c1', 'month');
      await keepPeriod('c2', '120', other);
      await keepPeriod('c2', 'month', other);
      // "This month" for c1 is held in memory, answered earlier in the session; the screen then moves to 120 days.
      const probe = setup('c1|month', { keyOf: picked => period(...(picked.split('|') as [string, string])) });
      await probe.answer(0, rows('GRN A0010 this month'));
      probe.show('c1|120');
      await probe.run(() => {});
      expect(queryClient.getQueryData(['report', ...period('c1', 'month')])).toEqual({ rows: ['GRN A0010 this month'] });
      expect(await keptKeys()).toHaveLength(3);

      await probe.answer(1, refusedBySentence);
      expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Access denied: customer not assigned' });
      // c1: nothing kept for any period, nothing held in memory.
      expect(await readReportCache(period('c1', '120'))).toBeNull();
      expect(await readReportCache(period('c1', 'month'))).toBeNull();
      expect(queryClient.getQueryData(['report', ...period('c1', 'month')])).toBeUndefined();
      // c2: both periods kept.
      expect(await readReportCache(period('c2', '120'))).toEqual({ data: other, updatedAt: keptAt });
      expect(await readReportCache(period('c2', 'month'))).toEqual({ data: other, updatedAt: keptAt });
      expect(await keptKeys()).toHaveLength(2);
      expect(await indexed()).toHaveLength(2);

      // Back on "This month": loading, not the figures shown before the refusal.
      probe.show('c1|month');
      await probe.run(() => {});
      expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isFetching: true });
      await probe.answer(2, refusedBySentence);
    });

    it('a key that names no customer forgets only itself', async () => {
      signIn();
      await keep('a');
      await keep('b');
      const probe = setup('a');
      await probe.run(() => {});
      await probe.answer(0, refusedBySentence);
      expect(await readReportCache(['test', 'b'])).toEqual({ data: kept, updatedAt: keptAt });
    });
  });
});

describe('a key that is not kept on the phone (persist: false)', () => {
  const account = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
  const signIn = () => jest.mocked(getSessionIdentity).mockResolvedValue(account);
  const keptAt = Date.now() - 2 * 60 * 60 * 1000;

  it('writes nothing for its answers, and shows nothing kept for it', async () => {
    signIn();
    await writeReportCache(['test', 'a'], { data: { rows: ['kept GRN A0010'] }, updatedAt: keptAt });
    const before = [...(await AsyncStorage.getAllKeys())].sort();
    const index = await AsyncStorage.getItem(`${CACHE_PREFIXES.REPORT}_index`);
    jest.mocked(AsyncStorage.getItem).mockClear();
    const probe = setup('a', { persist: false });
    await probe.run(() => {});
    // The kept answer for the key is not read, so not shown.
    expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isKeptCopy: false });
    expect(AsyncStorage.getItem).not.toHaveBeenCalledWith(expect.stringContaining('["test","a"]'));
    await probe.answer(0, rows('fresh GRN A0011'));
    probe.show('b');
    await probe.answer(1, rows('fresh GRN B0021'));
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['fresh GRN B0021'] } });
    // Nothing written: the stored keys, the index and the old entry are as they were.
    expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(before);
    expect(await AsyncStorage.getItem(`${CACHE_PREFIXES.REPORT}_index`)).toBe(index);
    expect((await readReportCache(['test', 'a']))?.data).toEqual({ rows: ['kept GRN A0010'] });
    expect(await readReportCache(['test', 'b'])).toBeNull();
  });
});

describe('isKeptCopy', () => {
  const account = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
  const signIn = () => jest.mocked(getSessionIdentity).mockResolvedValue(account);
  const keptAt = Date.now() - 2 * 60 * 60 * 1000;
  const kept = { rows: ['kept GRN A0010'] };

  it('is true while the phone\'s copy is shown, and false once the facility answers, also with the same rows', async () => {
    signIn();
    await writeReportCache(['test', 'a'], { data: kept, updatedAt: keptAt });
    const probe = setup('a');
    await probe.run(() => {});
    expect(probe.query()).toMatchObject({ data: kept, isKeptCopy: true, isFetching: true });
    // The facility answers with the same rows: the library may keep the same object, it is no longer the phone's.
    await probe.answer(0, rows('kept GRN A0010'));
    expect(probe.query()).toMatchObject({ data: kept, isKeptCopy: false, isFetching: false });
  });

  it('stays true when the request fails', async () => {
    signIn();
    await writeReportCache(['test', 'a'], { data: kept, updatedAt: keptAt });
    const probe = setup('a');
    await probe.run(() => {});
    await probe.fail(0);
    expect(probe.query()).toMatchObject({ data: kept, isKeptCopy: true, error: 'Could not load' });
  });
});
