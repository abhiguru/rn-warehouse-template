/**
 * A report's data by key: an answer never shows under another customer or
 * period, a known key shows its last answer at once, and a failure is told
 * apart from "nothing to show".
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries as settle } from '@/tests/helpers/reportQueries';
import { useReportQuery, type ReportQuery, type ReportServiceResult } from '../useReportQuery';

type Rows = { rows: string[] };
type Pending = { key: string; resolve: (result: ReportServiceResult<Rows>) => void; reject: (error: Error) => void };

let restore: () => void;
beforeAll(() => {
  restore = makeQueryUpdatesImmediate();
});
beforeEach(forgetQueries);
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
