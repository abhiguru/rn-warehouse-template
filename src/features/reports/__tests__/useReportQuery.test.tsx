/**
 * A report's data by key: an answer never shows under another customer or
 * period, a known key shows its last answer at once, and a failure is told
 * apart from "nothing to show".
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionIdentity } from '@/config/supabaseConfig';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
import { queryClient } from '@/lib/queryClient';
import { ACCESS_REFUSED_CODE } from '@/utils/rpcRefusal';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries as settle } from '@/tests/helpers/reportQueries';
import { fakeAppState, makeRoute } from '@/tests/helpers/fakeRoute';
import { NavigationContext } from 'expo-router/react-navigation';
import { RETURN_REFRESH_AFTER_MS, notedRefusals, useReportQuery, type ReportQuery, type ReportServiceResult } from '../useReportQuery';
import { readReportCache, removeReportCache, writeReportCache } from '../reportCache';

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
    /** As `release`, without the `act`: for a test that lets something else arrive in the same one. */
    open,
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

  it('keeps the newer answer on the phone when a superseded request answers last', async () => {
    signIn();
    const probe = setup('a');
    await probe.answer(0, rows('first'));
    // Two refreshes: the second cancels the first, which runs on and answers after it.
    await probe.run(() => void probe.query().refresh());
    await probe.run(() => void probe.query().refresh());
    expect(probe.pending).toHaveLength(3);
    await probe.answer(2, rows('newer answer'));
    await probe.answer(1, rows('older answer'));
    expect(probe.query().data).toEqual({ rows: ['newer answer'] });
    await settle();
    expect((await readReportCache(['test', 'a']))?.data).toEqual({ rows: ['newer answer'] });
  });

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
  // The phone's writes and removals run one at a time: whatever was sent before this one has landed when it has.
  const phoneSettled = () => removeReportCache(['nothing is kept under this']);

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

  it('is not covered by a kept answer that the phone gives in the same moment', async () => {
    signIn();
    await keep();
    const phone = holdNextRead();
    const probe = setup('a');
    await probe.run(() => {});
    expect(phone.heldKey()).toContain('["test","a"]');
    // Both arrive together. The refusal is recorded on the query a few steps after the kept answer
    // is dropped; in between the query is asking again, with no error to tell the phone's answer by.
    await act(async () => {
      phone.open();
      probe.pending[0].resolve(refusedByCode);
      await settle();
    });
    expect(probe.query()).toMatchObject({
      phase: 'error',
      data: undefined,
      updatedAt: undefined,
      error: 'Could not load the report',
      isKeptCopy: false,
    });
    expect(await storedKeys()).toEqual([]);
  });

  // Two arrivals in one moment, in every order near "at once". How many steps of the promise queue
  // lie between an arrival and what it does to the query is the query library's business, and the
  // phone's: each order is tried, so that an upgrade cannot move a gap out from under its test.
  const count = (steps: number) => `${steps} ${steps === 1 ? 'step' : 'steps'}`;
  const orders = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(
    steps => [steps < 0 ? `${count(-steps)} before` : steps > 0 ? `${count(steps)} after` : 'in the same step as', steps] as const
  );
  /** The refusal and `other` in one `act`: `other` comes `steps` steps after the refusal, before it when negative. */
  const together = (refuse: () => void, other: () => void, steps: number) =>
    act(async () => {
      (steps < 0 ? other : refuse)();
      for (let step = 0; step < Math.abs(steps); step++) await Promise.resolve();
      (steps < 0 ? refuse : other)();
      await settle();
    });

  it.each(orders)('is not covered by a kept answer that the phone gives %s the refusal', async (_when, steps) => {
    signIn();
    await keep();
    const phone = holdNextRead();
    const probe = setup('a');
    await probe.run(() => {});
    expect(phone.heldKey()).toContain('["test","a"]');
    await together(() => probe.pending[0].resolve(refusedByCode), phone.open, steps);
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, updatedAt: undefined, error: 'Could not load the report' });
    expect(await storedKeys()).toEqual([]);
  });

  // The person pulled to refresh while the first request was out: two requests for one key, and the
  // facility refuses the first. Whichever arrives first, the second was asked before the refusal:
  // its answer is not shown and not kept, and the screen is not left loading with nothing out.
  it.each(orders)('stops the answer to a pull to refresh that arrives %s the refusal of the request before it', async (_when, steps) => {
    signIn();
    await keep();
    const probe = setup('a');
    await probe.run(() => {});
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, isKeptCopy: true, isFetching: true });
    await probe.run(() => {
      void probe.query().refresh();
    });
    expect(probe.pending).toHaveLength(2);
    await together(
      () => probe.pending[0].resolve(refusedByCode),
      () => probe.pending[1].resolve(rows('GRN A0010 asked before the refusal')),
      steps
    );
    expect(probe.query()).toMatchObject({
      phase: 'error',
      data: undefined,
      updatedAt: undefined,
      error: 'Could not load the report',
      isFetching: false,
      isRefreshing: false,
    });
    await phoneSettled();
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
    // A probe is shown "customer|period".
    const shown = (picked: string) => period(...(picked.split('|') as [string, string]));

    it('also forgets that customer\'s other periods, on the phone and in memory, and leaves another customer\'s', async () => {
      signIn();
      const other = { rows: ['kept GRN B0020'] };
      await keepPeriod('c1', 'month');
      await keepPeriod('c2', '120', other);
      await keepPeriod('c2', 'month', other);
      // "This month" for c1 is held in memory, answered earlier in the session; the screen then moves to 120 days.
      const probe = setup('c1|month', { keyOf: shown });
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

    it('stops the kept answer that the phone gives afterwards for another period still being asked', async () => {
      signIn();
      await keepPeriod('c1', '120');
      const probe = setup('c1|month', { keyOf: shown });
      await probe.run(() => {});
      // 120 days: the facility and the phone are both asked, and the phone is slow.
      const phone = holdNextRead();
      probe.show('c1|120');
      await probe.run(() => {});
      expect(phone.heldKey()).toContain('"c1","120"]');
      expect(probe.pending.map(request => request.key)).toEqual(['c1|month', 'c1|120']);
      // "This month", asked first, is refused meanwhile.
      await probe.answer(0, refusedBySentence);
      expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isFetching: true });
      // The phone read the 120 days entry before it was removed, and answers only now.
      await phone.release();
      expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, updatedAt: undefined, isFetching: true });
      expect(await keptKeys()).toEqual([]);
      await probe.answer(1, refusedByCode);
      expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Could not load the report' });
    });

    it('stops that kept answer also when the other period\'s own request has failed meanwhile', async () => {
      signIn();
      await keepPeriod('c1', '120');
      const probe = setup('c1|month', { keyOf: shown });
      await probe.run(() => {});
      const phone = holdNextRead();
      probe.show('c1|120');
      await probe.run(() => {});
      expect(phone.heldKey()).toContain('"c1","120"]');
      await probe.answer(0, refusedBySentence);
      // The phone went offline: a failure, which by itself would let the kept figures show as not updated.
      await probe.fail(1);
      expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Could not load' });
      await phone.release();
      expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, updatedAt: undefined, error: 'Could not load', isKeptCopy: false });
    });

    it('stops the answer to another period that was asked before it: the refusal shows, and nothing is kept', async () => {
      signIn();
      const probe = setup('c1|month', { keyOf: shown });
      probe.show('c1|120');
      expect(probe.pending.map(request => request.key)).toEqual(['c1|month', 'c1|120']);
      await probe.answer(0, refusedBySentence);
      expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isFetching: true });
      // 120 days was asked before the customer was refused; its answer arrives after.
      await probe.answer(1, rows('GRN A0010 asked before the refusal'));
      expect(probe.query()).toMatchObject({
        phase: 'error',
        data: undefined,
        updatedAt: undefined,
        error: 'Access denied: customer not assigned',
        isFetching: false,
      });
      expect(queryClient.getQueryData(['report', ...period('c1', '120')])).toBeUndefined();
      await phoneSettled();
      expect(await keptKeys()).toEqual([]);
      expect(await indexed()).toEqual([]);
    });

    it('stops the answer to a period that no screen shows any more from being kept', async () => {
      signIn();
      const probe = setup('c1|month', { keyOf: shown });
      probe.show('c1|120');
      const unshown = queryClient.getQueryCache().find({ queryKey: ['report', ...period('c1', 'month')] });
      // 120 days, on screen, is refused while "This month" is still out.
      await probe.answer(1, refusedBySentence);
      expect(probe.query()).toMatchObject({ phase: 'error', data: undefined });
      await probe.answer(0, rows('GRN A0010 asked before the refusal'));
      await phoneSettled();
      expect(await keptKeys()).toEqual([]);
      expect(queryClient.getQueryData(['report', ...period('c1', 'month')])).toBeUndefined();
      // Back on "This month": asked again, with nothing to show meanwhile.
      probe.show('c1|month');
      await probe.run(() => {});
      expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isFetching: true });
      await probe.answer(2, refusedBySentence);
      // The library gives a query that was removed while asking a 30-minute timer, which would hold Jest open.
      unshown?.destroy();
    });

    it('is over once access is given back: a request sent after it is shown and kept again', async () => {
      signIn();
      await keepPeriod('c1', 'month');
      const probe = setup('c1|month', { keyOf: shown });
      await probe.run(() => {});
      await probe.answer(0, refusedBySentence);
      expect(probe.query()).toMatchObject({ phase: 'error', data: undefined });
      expect(await keptKeys()).toEqual([]);
      // The facility gives the customer back, and the person tries again.
      await probe.run(() => probe.query().retry());
      expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, error: null });
      await probe.answer(1, rows('GRN A0011 this month'));
      expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0011 this month'] }, error: null, isKeptCopy: false });
      expect((await readReportCache(period('c1', 'month')))?.data).toEqual({ rows: ['GRN A0011 this month'] });
      // Another period of the same report, asked for the first time after the refusal, as well.
      probe.show('c1|120');
      await probe.answer(2, rows('GRN A0011 in 120 days'));
      expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0011 in 120 days'] }, error: null });
      expect((await readReportCache(period('c1', '120')))?.data).toEqual({ rows: ['GRN A0011 in 120 days'] });
      // And the next time the app starts, the kept answer shows while the facility is asked.
      act(() => mounted.splice(0).forEach(renderer => renderer.unmount()));
      forgetQueries();
      const reopened = setup('c1|month', { keyOf: shown });
      await reopened.run(() => {});
      expect(reopened.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0011 this month'] }, isKeptCopy: true, isFetching: true });
      await reopened.answer(0, rows('GRN A0012 this month'));
      expect(reopened.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0012 this month'] }, isKeptCopy: false });
    });

    it('leaves alone another customer\'s report, and another report of the same customer, that were being asked', async () => {
      signIn();
      const other = { rows: ['kept GRN B0020'] };
      await keepPeriod('c2', 'month', other);
      // c2's GRNs are asking the facility and the phone, and c1's dispatches the facility, when c1's GRNs are refused.
      const phone = holdNextRead();
      const theirs = setup('c2|month', { keyOf: shown });
      await theirs.run(() => {});
      expect(phone.heldKey()).toContain('"c2","month"]');
      const dispatches = (days: string) => ['dispatch-activity', 'customer', 'c1', days];
      const otherReport = setup('month', { keyOf: dispatches });
      const refusedOne = setup('c1|month', { keyOf: shown });
      await refusedOne.answer(0, refusedBySentence);
      expect(refusedOne.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Access denied: customer not assigned' });

      await phone.release();
      expect(theirs.query()).toMatchObject({ phase: 'ready', data: other, updatedAt: keptAt, isKeptCopy: true, isFetching: true, error: null });
      await theirs.answer(0, rows('fresh GRN B0021'));
      expect(theirs.query()).toMatchObject({ phase: 'ready', data: { rows: ['fresh GRN B0021'] }, isKeptCopy: false, error: null });
      expect((await readReportCache(period('c2', 'month')))?.data).toEqual({ rows: ['fresh GRN B0021'] });

      await otherReport.answer(0, rows('DD0003'));
      expect(otherReport.query()).toMatchObject({ phase: 'ready', data: { rows: ['DD0003'] }, error: null });
      expect((await readReportCache(dispatches('month')))?.data).toEqual({ rows: ['DD0003'] });
    });

    // The answer to another period and the refusal in one moment. An answer a step ahead of the
    // refusal has been accepted, and is recorded on its query only after the refusal cleared it.
    it.each(orders)('stops the answer to another period that arrives %s the refusal', async (_when, steps) => {
      signIn();
      const probe = setup('c1|month', { keyOf: shown });
      probe.show('c1|120');
      expect(probe.pending.map(request => request.key)).toEqual(['c1|month', 'c1|120']);
      await together(
        () => probe.pending[0].resolve(refusedBySentence),
        () => probe.pending[1].resolve(rows('GRN A0010 asked before the refusal')),
        steps
      );
      expect(probe.query()).toMatchObject({
        phase: 'error',
        data: undefined,
        updatedAt: undefined,
        error: 'Access denied: customer not assigned',
        isFetching: false,
      });
      expect(queryClient.getQueryData(['report', ...period('c1', '120')])).toBeUndefined();
      await phoneSettled();
      expect(await keptKeys()).toEqual([]);
    });

    it('does not ask the phone again before it has forgotten: requests sent straight after it show nothing kept', async () => {
      signIn();
      await keepPeriod('c1', 'month');
      await keepPeriod('c1', '120');
      const probe = setup('c1|month', { keyOf: shown });
      await probe.run(() => {});
      expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, isKeptCopy: true });
      // The phone is slow to remove: it has not listed its entries yet when the next requests go out.
      const list = jest.mocked(AsyncStorage.getAllKeys);
      const realList = list.getMockImplementation()!;
      let letGo!: () => void;
      const gate = new Promise<void>(resolve => { letGo = resolve; });
      list.mockImplementationOnce(async () => {
        await gate;
        return realList();
      });
      try {
        await probe.answer(0, refusedBySentence);
        expect(probe.query()).toMatchObject({ phase: 'error', data: undefined });
        // Tried again at once, and then another period opened: both entries are still on the phone.
        await probe.run(() => probe.query().retry());
        expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isFetching: true });
        probe.show('c1|120');
        await probe.run(() => {});
        expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isFetching: true });
        expect(probe.pending.map(request => request.key)).toEqual(['c1|month', 'c1|month', 'c1|120']);
      } finally {
        // Also after a failed expectation: a removal left waiting would hold up every later write in this file.
        await act(async () => {
          letGo();
          await settle();
        });
      }
      expect(probe.query()).toMatchObject({ phase: 'loading', data: undefined, isFetching: true });
      expect(await keptKeys()).toEqual([]);
      // Access was given back meanwhile: the answers show and are kept, as after any refusal.
      await probe.answer(2, rows('GRN A0011 in 120 days'));
      expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0011 in 120 days'] }, isKeptCopy: false, error: null });
      await probe.answer(1, rows('GRN A0011 this month'));
      await phoneSettled();
      expect(await keptKeys()).toHaveLength(2);
    });

    it('is noted for one session only', async () => {
      signIn();
      const probe = setup('c1|month', { keyOf: shown });
      probe.show('c1|120');
      await probe.answer(0, refusedBySentence);
      expect(notedRefusals()).toBeGreaterThan(0);
      // Sign-out, sign-in or another server: what the last account was refused is not this one's.
      advanceSessionGeneration();
      expect(notedRefusals()).toBe(0);
      // Nor is a refusal that answers a request of the session before.
      await probe.answer(1, refusedBySentence);
      expect(probe.query()).toMatchObject({ phase: 'error', data: undefined });
      expect(notedRefusals()).toBe(0);
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

// SR-10: a report left underneath another screen asks again when the person comes back to it.
describe('coming back to a report', () => {
  let now = 1_800_000_000_000;
  let app: ReturnType<typeof fakeAppState>;
  beforeEach(() => {
    now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    app = fakeAppState();
  });
  afterEach(() => {
    app.restore();
    jest.restoreAllMocks();
  });

  function setupOnRoute({ enabled = true, revalidateOnReturn }: { enabled?: boolean; revalidateOnReturn?: boolean } = {}) {
    const route = makeRoute();
    const pending: Pending[] = [];
    const fetch = jest.fn(
      () =>
        new Promise<ReportServiceResult<Rows>>((resolve, reject) => {
          pending.push({ key: 'a', resolve, reject });
        })
    );
    let latest!: ReportQuery<Rows>;
    let renders = 0;
    function Probe({ on }: { on: boolean }) {
      renders += 1;
      latest = useReportQuery<Rows>({ key: ['test', 'a'], fetch, fallbackError: 'Could not load', enabled: on, revalidateOnReturn });
      return null;
    }
    const tree = (on: boolean) => (
      <NavigationContext.Provider value={route.navigation as never}>
        <Probe on={on} />
      </NavigationContext.Provider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree(enabled));
    });
    mounted.push(renderer);
    return {
      fetch,
      pending,
      route,
      query: () => latest,
      renders: () => renders,
      rerender: (on = enabled) => act(() => renderer.update(tree(on))),
      answer: (index: number, result: ReportServiceResult<Rows>) => act(async () => { pending[index].resolve(result); await settle(); }),
      run: (callback: () => void) => act(async () => { callback(); await settle(); }),
    };
  }
  const later = (ms: number) => { now += ms; };
  const away = RETURN_REFRESH_AFTER_MS + 1_000;

  it('asks once on mount and not again on a re-render', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    later(away);
    probe.rerender();
    probe.rerender();
    await probe.run(() => {});
    expect(probe.renders()).toBeGreaterThan(2);
    expect(probe.fetch).toHaveBeenCalledTimes(1);
  });

  it('asks once when its route is focused again after more than 30 seconds, keeping the rows meanwhile', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    await probe.run(() => probe.route.blur());
    later(away);
    await probe.run(() => probe.route.focus());
    expect(probe.fetch).toHaveBeenCalledTimes(2);
    expect(probe.query()).toMatchObject({ phase: 'ready', data: { rows: ['GRN A0010'] }, isFetching: true, isRefreshing: false });
    await probe.answer(1, rows('GRN A0010', 'GRN A0011'));
    expect(probe.query()).toMatchObject({ data: { rows: ['GRN A0010', 'GRN A0011'] }, isFetching: false });
    // Drawn again with nothing changed: nothing more.
    probe.rerender();
    await probe.run(() => {});
    expect(probe.fetch).toHaveBeenCalledTimes(2);
  });

  it('asks nothing for a focus without a blur before it', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    later(away);
    await probe.run(() => probe.route.focus());
    expect(probe.fetch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when it comes back within 30 seconds', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    await probe.run(() => probe.route.blur());
    later(RETURN_REFRESH_AFTER_MS - 1_000);
    await probe.run(() => probe.route.focus());
    expect(probe.fetch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing while disabled', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    probe.rerender(false);
    await probe.run(() => probe.route.blur());
    later(away);
    await probe.run(() => probe.route.focus());
    expect(probe.fetch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when asked not to (a later page)', async () => {
    const probe = setupOnRoute({ revalidateOnReturn: false });
    await probe.answer(0, rows('GRN A0010'));
    await probe.run(() => probe.route.blur());
    later(away);
    await probe.run(() => probe.route.focus());
    await probe.run(() => app.setAppState('background'));
    later(away);
    await probe.run(() => app.setAppState('active'));
    expect(probe.fetch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when nothing is on screen (the failure keeps its Retry)', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, { success: false });
    expect(probe.query().phase).toBe('error');
    await probe.run(() => probe.route.blur());
    later(away);
    await probe.run(() => probe.route.focus());
    expect(probe.fetch).toHaveBeenCalledTimes(1);
  });

  it('joins a request already out instead of sending another', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    let outcome: Promise<boolean> | undefined;
    await probe.run(() => {
      outcome = probe.query().refresh();
    });
    expect(probe.fetch).toHaveBeenCalledTimes(2);
    await probe.run(() => probe.route.blur());
    later(away);
    await probe.run(() => probe.route.focus());
    expect(probe.fetch).toHaveBeenCalledTimes(2);
    await probe.answer(1, rows('GRN A0011'));
    await expect(outcome).resolves.toBe(true);
    expect(probe.query().data).toEqual({ rows: ['GRN A0011'] });
  });

  it('asks once when the app comes back to the foreground after more than 30 seconds', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    await probe.run(() => app.setAppState('background'));
    later(away);
    await probe.run(() => app.setAppState('active'));
    expect(probe.fetch).toHaveBeenCalledTimes(2);
    await probe.answer(1, rows('GRN A0011'));
    expect(probe.query().data).toEqual({ rows: ['GRN A0011'] });
  });

  it('a refusal on the return still clears the figures it had', async () => {
    const probe = setupOnRoute();
    await probe.answer(0, rows('GRN A0010'));
    await probe.run(() => probe.route.blur());
    later(away);
    await probe.run(() => probe.route.focus());
    await probe.answer(1, { success: false, message: 'Access denied', error: ACCESS_REFUSED_CODE });
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Access denied' });
  });
});
