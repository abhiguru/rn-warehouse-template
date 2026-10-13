/**
 * usePrintJobPolling (performance review 2026-10-13, DATA-04): the status read and the
 * job batch are each single flight and completion driven, the cadence is faster only
 * while a job is queued or printing, nothing runs while the sheet is closed or the app
 * is in the background, and a read that ends after the sheet closed changes nothing.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { usePrintJobPolling } from '../usePrintJobPolling';

type IsCurrent = (() => boolean) | undefined;

/** A read the test settles by hand, recording whether its result would reach the screen. */
function deferred(name: string) {
  const pending: (() => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let applied = 0;
  const fn = jest.fn((isCurrent?: IsCurrent) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise<void>(resolve => {
      pending.push(() => {
        inFlight -= 1;
        // the sheet applies a result only while it is current
        if (typeof isCurrent !== 'function' || isCurrent()) applied += 1;
        resolve();
      });
    });
  });
  return {
    name,
    fn,
    get maxInFlight() { return maxInFlight; },
    get applied() { return applied; },
    get pendingCount() { return pending.length; },
    finishAll: () => act(async () => { pending.splice(0).forEach(done => done()); }),
  };
}

/** A read that settles at once. */
const immediate = () => jest.fn((_isCurrent?: IsCurrent) => Promise.resolve());

let appStateListeners: ((s: AppStateStatus) => void)[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  appStateListeners = [];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => {
    appStateListeners.push(cb);
    return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
  }) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

let api: ReturnType<typeof usePrintJobPolling>;
type HostProps = {
  isActive: boolean;
  onFetchJobs: (isCurrent?: IsCurrent) => Promise<void>;
  onUpdateStatus: (isCurrent?: IsCurrent) => Promise<void>;
  hasActiveJob?: boolean;
};
function Host(props: HostProps) {
  api = usePrintJobPolling(props as never);
  return null;
}
function mount(props: HostProps) {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<Host {...props} />); });
  return tree;
}

test('slow reads never overlap across many intervals', async () => {
  const jobs = deferred('jobs');
  const status = deferred('status');
  const tree = mount({ isActive: true, onFetchJobs: jobs.fn, onUpdateStatus: status.fn, hasActiveJob: true });
  await advance(60_000);
  expect(status.fn).toHaveBeenCalledTimes(1);
  expect(jobs.fn).toHaveBeenCalledTimes(1);
  expect(status.maxInFlight).toBe(1);
  expect(jobs.maxInFlight).toBe(1);
  await status.finishAll();
  await jobs.finishAll();
  act(() => tree.unmount());
});

test('steady cadence: 5 s status and 10 s jobs while a job is active, 30 s and 60 s when idle', async () => {
  const jobs = immediate();
  const status = immediate();
  const tree = mount({ isActive: true, onFetchJobs: jobs, onUpdateStatus: status, hasActiveJob: true });
  await advance(0);
  jobs.mockClear();
  status.mockClear();
  await advance(60_000);
  expect(status).toHaveBeenCalledTimes(12);
  expect(jobs).toHaveBeenCalledTimes(6);

  act(() => tree.update(<Host isActive onFetchJobs={jobs} onUpdateStatus={status} hasActiveJob={false} />));
  await advance(10_000); // let the timers already waiting run out at the old cadence
  jobs.mockClear();
  status.mockClear();
  await advance(60_000);
  expect(status).toHaveBeenCalledTimes(2);
  expect(jobs).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('closing the sheet stops polling and drops the reads still in flight', async () => {
  const jobs = deferred('jobs');
  const status = deferred('status');
  const tree = mount({ isActive: true, onFetchJobs: jobs.fn, onUpdateStatus: status.fn, hasActiveJob: true });
  act(() => tree.update(<Host isActive={false} onFetchJobs={jobs.fn} onUpdateStatus={status.fn} hasActiveJob />));
  await status.finishAll();
  await jobs.finishAll();
  expect(status.applied).toBe(0);
  expect(jobs.applied).toBe(0);
  await advance(120_000);
  expect(status.fn).toHaveBeenCalledTimes(1);
  expect(jobs.fn).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('no reads in the background; one of each on return', async () => {
  const jobs = immediate();
  const status = immediate();
  const tree = mount({ isActive: true, onFetchJobs: jobs, onUpdateStatus: status, hasActiveJob: true });
  await advance(0);
  act(() => appStateListeners.forEach(l => l('background')));
  jobs.mockClear();
  status.mockClear();
  await advance(120_000);
  expect(status).toHaveBeenCalledTimes(0);
  expect(jobs).toHaveBeenCalledTimes(0);
  act(() => appStateListeners.forEach(l => l('active')));
  await advance(0);
  expect(status).toHaveBeenCalledTimes(1);
  expect(jobs).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('a manual refresh during a read joins it instead of sending another', async () => {
  const jobs = deferred('jobs');
  const status = deferred('status');
  const tree = mount({ isActive: true, onFetchJobs: jobs.fn, onUpdateStatus: status.fn, hasActiveJob: true });
  act(() => { api.fetchNow(); api.updateStatusNow(); });
  expect(jobs.fn).toHaveBeenCalledTimes(1);
  expect(status.fn).toHaveBeenCalledTimes(1);
  await status.finishAll();
  await jobs.finishAll();
  act(() => tree.unmount());
});
