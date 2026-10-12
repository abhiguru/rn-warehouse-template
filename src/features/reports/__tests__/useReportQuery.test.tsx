/**
 * A report's data by key: an answer never shows under another customer or
 * period, a known key shows its last answer at once, and a failure is told
 * apart from "nothing to show".
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionIdentity } from '@/config/supabaseConfig';
import { queryClient } from '@/lib/queryClient';
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

function setup(first: string) {
  const pending: Pending[] = [];
  const fetch = jest.fn(
    (key: string) =>
      new Promise<ReportServiceResult<Rows>>((resolve, reject) => {
        pending.push({ key, resolve, reject });
      })
  );
  let latest!: ReportQuery<Rows>;
  function Probe({ customer }: { customer: string }) {
    latest = useReportQuery<Rows>({ key: ['test', customer], fetch: () => fetch(customer), fallbackError: 'Could not load' });
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
    expect(probe.query()).toMatchObject({ phase: 'error', error: 'Network request failed' });
    await probe.run(() => probe.query().retry());
    await probe.answer(3, rows('GRN A0010'));
    expect(probe.query()).toMatchObject({ phase: 'ready', error: null });
    expect(probe.fetch).toHaveBeenCalledTimes(4);
  });

  it('keeps the rows and says so when a refresh fails', async () => {
    const probe = setup('a');
    await probe.answer(0, rows('GRN A0010'));
    await probe.run(() => probe.query().refresh());
    expect(probe.query()).toMatchObject({ isRefreshing: true, phase: 'ready' });
    await probe.answer(1, { success: false, message: 'Could not reach the facility' });
    expect(probe.query()).toMatchObject({
      phase: 'ready',
      data: { rows: ['GRN A0010'] },
      error: 'Could not reach the facility',
      isRefreshing: false,
    });
  });
});

describe('the answer kept on the phone', () => {
  const account = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
  const signIn = () => jest.mocked(getSessionIdentity).mockResolvedValue(account);
  const keptAt = Date.now() - 2 * 60 * 60 * 1000;
  const kept = { rows: ['kept GRN A0010'] };
  const keep = () => writeReportCache(['test', 'a'], { data: kept, updatedAt: keptAt });

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
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt, error: 'Network request failed', isFetching: false });
    await probe.run(() => probe.query().retry());
    await probe.answer(1, { success: false, message: 'Staff access required' });
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, error: 'Staff access required' });
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
    expect(probe.query()).toMatchObject({ phase: 'error', data: undefined, error: 'Network request failed' });
    await phone.release();
    expect(probe.query()).toMatchObject({ phase: 'ready', data: kept, updatedAt: keptAt, error: 'Network request failed' });
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
