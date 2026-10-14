/**
 * useLoadWithRetry: the loading, failed and loaded states of one read, shared by the
 * report customer picker and the business chooser on Create order. An answer counts
 * only for the key and the attempt that asked for it.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useLoadWithRetry, type LoadWithRetry } from '../useLoadWithRetry';

type Deferred = { resolve: (value: string) => void; reject: (reason: Error) => void };
/** One entry per read that was started, in order; a test settles them when it chooses. */
let reads: (Deferred & { key: string })[] = [];
const load = (key: string) => () => new Promise<string>((resolve, reject) => reads.push({ key, resolve, reject }));

let seen: LoadWithRetry<string>;
function Probe({ name }: { name: string | null }) {
  seen = useLoadWithRetry(name, load(name ?? ''));
  return null;
}

let tree: ReactTestRenderer | undefined;
const show = (name: string | null) => act(async () => {
  if (tree) tree.update(<Probe name={name} />);
  else tree = create(<Probe name={name} />);
});
beforeEach(() => {
  reads = [];
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

it('is loading until the read answers, then holds what it answered', async () => {
  await show('first');
  expect(reads.map(read => read.key)).toEqual(['first']);
  expect(seen).toMatchObject({ state: 'loading', data: undefined });
  await act(async () => reads[0].resolve('answer for first'));
  expect(seen).toMatchObject({ state: 'loaded', data: 'answer for first' });
  // Drawing again with the same key reads nothing more.
  await show('first');
  expect(reads).toHaveLength(1);
});

it('fails when the read fails, and reads again on retry', async () => {
  await show('first');
  await act(async () => reads[0].reject(new Error('offline')));
  expect(seen).toMatchObject({ state: 'failed', data: undefined });

  await act(async () => seen.retry());
  expect(reads).toHaveLength(2);
  expect(seen.state).toBe('loading');
  await act(async () => reads[1].resolve('second try'));
  expect(seen).toMatchObject({ state: 'loaded', data: 'second try' });
});

it('reads nothing for a null or empty key and stays loading', async () => {
  await show(null);
  expect(reads).toHaveLength(0);
  expect(seen.state).toBe('loading');
  await show('');
  expect(reads).toHaveLength(0);
  expect(seen.state).toBe('loading');
});

it('reads again when the key changes, never shows the old key\'s answer, and drops one that comes late', async () => {
  await show('first');
  await act(async () => reads[0].resolve('answer for first'));
  expect(seen.state).toBe('loaded');

  await show('second');
  expect(reads.map(read => read.key)).toEqual(['first', 'second']);
  expect(seen).toMatchObject({ state: 'loading', data: undefined });

  // The key changes again before 'second' answers; its late answer is not shown.
  await show('third');
  await act(async () => reads[1].resolve('late answer for second'));
  expect(seen).toMatchObject({ state: 'loading', data: undefined });
  await act(async () => reads[2].resolve('answer for third'));
  expect(seen).toMatchObject({ state: 'loaded', data: 'answer for third' });
});

it('drops the answer of an attempt that was retried before it came', async () => {
  await show('first');
  await act(async () => seen.retry());
  expect(reads).toHaveLength(2);
  await act(async () => reads[0].reject(new Error('slow failure of the first attempt')));
  expect(seen.state).toBe('loading');
  await act(async () => reads[1].resolve('second attempt'));
  expect(seen).toMatchObject({ state: 'loaded', data: 'second attempt' });
});

it('keeps the answer in hand when an older read answers after it', async () => {
  await show('first');
  await show('second');
  await act(async () => reads[1].resolve('answer for second'));
  expect(seen).toMatchObject({ state: 'loaded', data: 'answer for second' });
  await act(async () => reads[0].resolve('late answer for first'));
  expect(seen).toMatchObject({ state: 'loaded', data: 'answer for second' });
});
