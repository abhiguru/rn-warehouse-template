/**
 * Print Jobs sheet request cadence (performance review 2026-10-13, DATA-04): counts the
 * get_print_jobs requests the open sheet sends per minute, with no status read after each
 * job batch, no reads while closed, and a pull to refresh that joins reads in flight.
 */
import React, { createRef } from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { getPrintJobs, type PrintJob } from '@/services/print-service';
import PrintJobsBottomSheet, { type PrintJobsBottomSheetRef } from '../PrintJobsBottomSheet';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { FlatList, View } = require('react-native');
  const BottomSheet = React.forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) =>
    React.createElement(View, { testID: 'sheet' }, children));
  return { __esModule: true, default: BottomSheet, BottomSheetBackdrop: () => null, BottomSheetFlatList: FlatList };
});
jest.mock('@/services/print-service', () => ({ getPrintJobs: jest.fn(), cancelPrintJob: jest.fn() }));

const job = (id: string, status: PrintJob['status']): PrintJob => ({
  id,
  job_type: 'grn',
  status,
  printer_name: 'LQ1310_RAW',
  document_range_start: '101',
  document_range_end: '104',
  document_count: 4,
  created_at: '2026-10-09T10:00:00Z',
  completed_at: null,
  error_message: null,
} as unknown as PrintJob);

const getJobs = getPrintJobs as jest.Mock;
/** What the facility holds: the latest job decides the printer status. */
let latest: PrintJob;
let queued: PrintJob[];
let deferAll = false;
let pending: (() => void)[] = [];

const statusReads = () => getJobs.mock.calls.filter(c => c[1] === 1).length;
const jobReads = () => getJobs.mock.calls.filter(c => c[1] === 50).length;

let appStateListeners: ((s: AppStateStatus) => void)[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  appStateListeners = [];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => {
    appStateListeners.push(cb);
    return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
  }) as never);
  deferAll = false;
  pending = [];
  getJobs.mockReset();
  getJobs.mockImplementation((_type: unknown, limit: number, status?: PrintJob['status']) => {
    const answer = () => ({
      success: true,
      data: limit === 1 ? [latest] : status === 'pending' ? queued : [],
    });
    if (!deferAll) return Promise.resolve(answer());
    return new Promise(resolve => pending.push(() => resolve(answer())));
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

async function openSheet() {
  const ref = createRef<PrintJobsBottomSheetRef>();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<PrintJobsBottomSheet ref={ref} />); });
  act(() => ref.current!.open());
  await advance(0);
  return { tree, ref };
}

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));

// The in-progress tab also asks for jobs the printer did not confirm ('unknown'), so a batch is 3 reads.
test('while a job prints: 12 status reads and 6 job batches (30 requests) a minute on the in-progress tab', async () => {
  latest = job('j1', 'printing');
  queued = [job('j2', 'pending')];
  const { tree } = await openSheet();
  await advance(10_000);
  getJobs.mockClear();
  await advance(60_000);
  expect(statusReads()).toBe(12);
  expect(jobReads()).toBe(18);
  expect(getJobs).toHaveBeenCalledTimes(30);
  act(() => tree.unmount());
});

test('while a job prints: 30 requests a minute on the finished tab', async () => {
  latest = job('j1', 'printing');
  queued = [];
  const { tree } = await openSheet();
  const finished = tree.root.find(n => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function' && n.props.accessibilityState?.selected === false);
  act(() => finished.props.onPress());
  await advance(10_000);
  getJobs.mockClear();
  await advance(60_000);
  expect(statusReads()).toBe(12);
  expect(jobReads()).toBe(18);
  act(() => tree.unmount());
});

test('idle printer: 2 status reads and 1 job batch (5 requests) a minute', async () => {
  latest = job('j1', 'completed');
  queued = [];
  const { tree } = await openSheet();
  await advance(60_000);
  getJobs.mockClear();
  await advance(60_000);
  expect(statusReads()).toBe(2);
  expect(jobReads()).toBe(3);
  act(() => tree.unmount());
});

test('slow reads never overlap, and a pull to refresh joins them', async () => {
  latest = job('j1', 'printing');
  queued = [job('j2', 'pending')];
  const { tree } = await openSheet();
  // the first reads land and show the list; every later read hangs
  deferAll = true;
  getJobs.mockClear();
  await advance(60_000);
  expect(statusReads()).toBe(1);
  expect(jobReads()).toBe(3);
  const list = tree.root.findAll(n => typeof n.props.onRefresh === 'function' && 'refreshing' in n.props)[0];
  act(() => { void list.props.onRefresh(); });
  await advance(0);
  expect(statusReads()).toBe(1);
  expect(jobReads()).toBe(3);
  deferAll = false;
  await act(async () => { pending.splice(0).forEach(done => done()); });
  act(() => tree.unmount());
});

test('closing the sheet stops reads and a late answer does not change it', async () => {
  latest = job('j1', 'printing');
  queued = [job('j2', 'pending')];
  deferAll = true;
  const { tree, ref } = await openSheet();
  const before = texts(tree);
  act(() => ref.current!.close());
  await act(async () => { pending.splice(0).forEach(done => done()); });
  // the printing status never reached the closed sheet
  expect(texts(tree)).toEqual(before);
  getJobs.mockClear();
  await advance(120_000);
  expect(getJobs).toHaveBeenCalledTimes(0);
  act(() => tree.unmount());
});
