/**
 * A print job the printer accepted but did not confirm (print_jobs.status 'unknown',
 * migration 72) is listed under In progress, shown as not confirmed, and the printer is not
 * reported as ready.
 */
import React, { createRef } from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { getPrintJobs, getPrinterStatus, type PrintJob } from '@/services/print-service';
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
jest.mock('@/services/print-service', () => ({ getPrintJobs: jest.fn(), cancelPrintJob: jest.fn(), getPrinterStatus: jest.fn(), serverNowMs: jest.fn(() => Date.now()) }));

const unknownJob = {
  id: 'ju', cups_job_id: null, job_type: 'Invoice', status: 'unknown', printer_name: 'LQ1310_RAW', document_range_start: '412',
  document_range_end: '412', document_count: 1, created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z', completed_at: null,
  error_message: 'The printer did not confirm the job',
} as unknown as PrintJob;

let appStateListeners: ((s: AppStateStatus) => void)[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  appStateListeners = [];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => {
    appStateListeners.push(cb);
    return { remove: () => undefined };
  }) as never);
  // The print server cannot answer for the printer (an older server): the status comes from the latest job.
  (getPrinterStatus as jest.Mock).mockReset().mockResolvedValue({ success: false, error: 'unavailable' });
  (getPrintJobs as jest.Mock).mockReset();
  (getPrintJobs as jest.Mock).mockImplementation((_t: unknown, limit: number, status?: string) =>
    Promise.resolve({ success: true, data: limit === 1 || status === 'unknown' ? [unknownJob] : [] }));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// Product's rule (WH-109): an unconfirmed job stays In progress for 5 minutes from its last change (updated_at), then it
// is history, still marked "Not confirmed".
const CHANGED = Date.parse('2026-10-09T10:00:00Z');
const atMinutes = (m: number) => jest.setSystemTime(new Date(CHANGED + m * 60_000));

async function openSheet() {
  const ref = createRef<PrintJobsBottomSheetRef>();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<PrintJobsBottomSheet ref={ref} />); });
  act(() => ref.current!.open());
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });
  return tree;
}
const textsOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
const openFinished = async (tree: renderer.ReactTestRenderer) => {
  const finished = tree.root.find(n => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function' && n.props.accessibilityState?.selected === false);
  act(() => finished.props.onPress());
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });
};
const latestReads = () => (getPrintJobs as jest.Mock).mock.calls.filter(c => c[1] === 1).length;

test('a job younger than 5 minutes is listed under In progress, marked "Not confirmed", with the red strip and fast polling', async () => {
  atMinutes(4);
  const tree = await openSheet();
  expect(textsOf(tree)).toContain('Not confirmed');
  expect(textsOf(tree).some(x => x.includes('Printer ready'))).toBe(false);
  expect(textsOf(tree).some(x => x.includes('was not confirmed'))).toBe(true);
  (getPrintJobs as jest.Mock).mockClear();
  await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
  expect(latestReads()).toBeGreaterThanOrEqual(10);
  act(() => tree.unmount());
});

test('a job older than 5 minutes is not In progress: it is in history marked "Not confirmed", with no strip and slow polling', async () => {
  atMinutes(6);
  const tree = await openSheet();
  expect(textsOf(tree)).not.toContain('Not confirmed');
  expect(textsOf(tree)).toContain('No print jobs in progress');
  expect(textsOf(tree).some(x => x.includes('was not confirmed'))).toBe(false);
  (getPrintJobs as jest.Mock).mockClear();
  await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
  expect(latestReads()).toBeLessThanOrEqual(3);
  await openFinished(tree);
  expect(textsOf(tree)).toContain('Not confirmed');
  // the history asks for the unconfirmed jobs as its fourth read
  expect((getPrintJobs as jest.Mock).mock.calls.some(c => c[0] === undefined && c[1] === 50 && c[2] === 'unknown')).toBe(true);
  act(() => tree.unmount());
});

test('the history never shows a young unconfirmed job', async () => {
  atMinutes(1);
  const tree = await openSheet();
  await openFinished(tree);
  expect(textsOf(tree)).not.toContain('Not confirmed');
  act(() => tree.unmount());
});

test('a job moves from In progress to history by the clock alone, with no new read', async () => {
  atMinutes(4);
  const tree = await openSheet();
  expect(textsOf(tree)).toContain('Not confirmed');
  // every later read hangs: only the 15-second re-check can move the job
  (getPrintJobs as jest.Mock).mockImplementation(() => new Promise(() => undefined));
  atMinutes(5.5);
  await act(async () => { await jest.advanceTimersByTimeAsync(16_000); });
  expect(textsOf(tree)).not.toContain('Not confirmed');
  act(() => tree.unmount());
});
