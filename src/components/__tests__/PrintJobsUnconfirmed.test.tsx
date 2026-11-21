/**
 * A print job the printer accepted but did not confirm (print_jobs.status 'unknown',
 * migration 72) is listed under In progress, shown as not confirmed, and the printer is not
 * reported as ready.
 */
import React, { createRef } from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { getPrintJobs, getPrinterStatus, serverNowMs, type PrintJob } from '@/services/print-service';
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

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

async function openSheet() {
  const ref = createRef<PrintJobsBottomSheetRef>();
  await render(<PrintJobsBottomSheet ref={ref} />);
  await act(async () => { ref.current!.open(); });
  await advance(0);
}
const openFinished = async () => {
  const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  await user.press(screen.getByRole('tab', { selected: false }));
  await advance(0);
};
const latestReads = () => (getPrintJobs as jest.Mock).mock.calls.filter(c => c[1] === 1).length;

test('a job younger than 5 minutes is listed under In progress, marked "Not confirmed", with the red strip and fast polling', async () => {
  atMinutes(4);
  await openSheet();
  expect(screen.getByText('Not confirmed')).toBeOnTheScreen();
  expect(screen.queryByText(/Printer ready/)).not.toBeOnTheScreen();
  expect(screen.getByText(/was not confirmed/)).toBeOnTheScreen();
  (getPrintJobs as jest.Mock).mockClear();
  await advance(60_000);
  expect(latestReads()).toBeGreaterThanOrEqual(10);
});

test('a job older than 5 minutes is not In progress: it is in history marked "Not confirmed", with no strip and slow polling', async () => {
  atMinutes(6);
  await openSheet();
  expect(screen.queryByText('Not confirmed')).not.toBeOnTheScreen();
  expect(screen.getByText('No print jobs in progress')).toBeOnTheScreen();
  expect(screen.queryByText(/was not confirmed/)).not.toBeOnTheScreen();
  (getPrintJobs as jest.Mock).mockClear();
  await advance(60_000);
  expect(latestReads()).toBeLessThanOrEqual(3);
  await openFinished();
  expect(screen.getByText('Not confirmed')).toBeOnTheScreen();
  // the history asks for the unconfirmed jobs as its fourth read
  expect((getPrintJobs as jest.Mock).mock.calls.some(c => c[0] === undefined && c[1] === 50 && c[2] === 'unknown')).toBe(true);
});

test('the history never shows a young unconfirmed job', async () => {
  atMinutes(1);
  await openSheet();
  await openFinished();
  expect(screen.queryByText('Not confirmed')).not.toBeOnTheScreen();
});

test('a job moves from In progress to history by the clock alone, with no new read', async () => {
  atMinutes(4);
  await openSheet();
  expect(screen.getByText('Not confirmed')).toBeOnTheScreen();
  // every later read hangs: only the 15-second re-check can move the job
  (getPrintJobs as jest.Mock).mockImplementation(() => new Promise(() => undefined));
  atMinutes(5.5);
  await advance(16_000);
  expect(screen.queryByText('Not confirmed')).not.toBeOnTheScreen();
});

test('on a server that sends no time (serverNowMs is null) the strip still leaves "not confirmed" within 15 seconds of the 5 minutes', async () => {
  // A backend without migration 183 gives no server time; the timer must read the phone's clock instead.
  (serverNowMs as jest.Mock).mockReturnValue(null);
  try {
    atMinutes(4);
    await openSheet();
    expect(screen.getByText('Not confirmed')).toBeOnTheScreen();
    // every later read hangs: only the timer can move the job out of In progress
    (getPrintJobs as jest.Mock).mockImplementation(() => new Promise(() => undefined));
    atMinutes(5.5);
    await advance(16_000);
    expect(screen.queryByText('Not confirmed')).not.toBeOnTheScreen();
    expect(screen.queryByText(/was not confirmed/)).not.toBeOnTheScreen();
  } finally {
    (serverNowMs as jest.Mock).mockImplementation(() => Date.now());
  }
});
