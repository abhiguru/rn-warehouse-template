/**
 * WH-109: the Print jobs sheet asks the print server for the printer's own status (get-printer-status) and falls back to
 * the latest job only when the server cannot answer; and a refused cancel (cancel-print-job) shows the app's own text for
 * 409 CANNOT_CANCEL, 409 INVALID_STATUS and 502 CANCEL_FAILED. The real print service runs; only the network is faked.
 */
import React, { createRef } from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
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
const mockFetch = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'fictional-anon-key' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));

const JOB = '6f1c2d3e-0000-4000-8000-000000000001';
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });
// The columns get_print_jobs returns (migration 123): cups_job_id is null until the print service gave one.
const queuedJob = {
  id: 'jq', cups_job_id: null, job_type: 'GRN', status: 'queued', printer_name: 'LQ1310_RAW', document_range_start: '101',
  document_range_end: '104', document_count: 4, user_id: 'u1', user_name: 'Fictional User', content_size: 100, submitted_at: null,
  created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z', completed_at: null, error_message: null,
};
const completedJob = { ...queuedJob, id: 'jc', cups_job_id: 5, status: 'completed', completed_at: '2026-10-09T10:01:00Z' };
const printingJob = { ...queuedJob, id: JOB, cups_job_id: 7, status: 'printing', document_range_start: '201', document_range_end: '204' };
const unknownJob = { ...queuedJob, id: 'ju', cups_job_id: null, status: 'unknown', document_range_start: '301', document_range_end: '304' };

let printingCupsId: number | null = 7;
let printerStatus: () => unknown;
let cancelAnswer: () => unknown;
const urls = () => mockFetch.mock.calls.map(c => String(c[0]));

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
  printingCupsId = 7;
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, init: { body: string }) => {
    if (url.endsWith('/functions/v1/get-printer-status')) return printerStatus();
    if (url.endsWith('/functions/v1/cancel-print-job')) return cancelAnswer();
    if (url.endsWith('/rest/v1/rpc/get_print_jobs')) {
      const { p_limit, p_status } = JSON.parse(init.body);
      return reply(200, { success: true, message: 'ok', data: p_limit === 1 ? [completedJob] : p_status === 'queued' ? [queuedJob] : p_status === 'printing' ? [{ ...printingJob, cups_job_id: printingCupsId }] : p_status === 'unknown' ? [unknownJob] : [] });
    }
    throw new Error(`unexpected request ${url}`);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

async function openSheet() {
  const ref = createRef<PrintJobsBottomSheetRef>();
  await render(<PrintJobsBottomSheet ref={ref} />);
  await act(async () => { ref.current!.open(); });
  await advance(0);
}
const cancelButtons = () => screen.queryAllByRole('button', { name: /^Cancel print job / });
const cancel = async () => {
  const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  await user.press(screen.getByRole('button', { name: 'Cancel print job 201 to 204' }));
  await advance(0);
};

describe('printer status', () => {
  it.each([
    ['online', 'Printer ready'],
    ['busy', 'Printing in progress'],
    ['offline', 'The printer is offline. Check that it is on and connected.'],
    ['error', 'The printer reports a problem. Check the printer.'],
  ])('the print server says %s: the sheet says "%s", and the latest job is not asked for', async (status, message) => {
    printerStatus = () => reply(200, { success: true, status, message: 'x', printer_name: 'P', transport: 'cups', timestamp: 't' });
    await openSheet();
    expect(screen.getByText(message)).toBeOnTheScreen();
    // get-printer-status is asked with no printer name: the server answers for the facility's own printer
    const call = mockFetch.mock.calls.find(c => String(c[0]).endsWith('/get-printer-status'))!;
    expect(JSON.parse(call[1].body)).toEqual({});
    expect(mockFetch.mock.calls.some(c => String(c[0]).endsWith('get_print_jobs') && JSON.parse(c[1].body).p_limit === 1)).toBe(false);
  });

  it('when the print server cannot answer (printing off, 503) the status is derived from the latest job', async () => {
    printerStatus = () => reply(503, { success: false, code: 'PRINTING_OFF', error: 'Printing is not set up for this facility' });
    await openSheet();
    expect(urls().some(u => u.endsWith('/get-printer-status'))).toBe(true);
    expect(screen.getByText('Printer ready')).toBeOnTheScreen(); // the latest job completed
  });
});

describe('cancelling a job', () => {
  beforeEach(() => {
    printerStatus = () => reply(200, { success: true, status: 'online', message: 'x', printer_name: 'P', transport: 'cups', timestamp: 't' });
  });

  it('calls the cancel-print-job function with the job id and says it was cancelled', async () => {
    cancelAnswer = () => reply(200, { success: true, message: 'Print job cancelled', print_job_id: JOB, cups_job_id: 7, timestamp: 't' });
    await openSheet();
    await cancel();
    const call = mockFetch.mock.calls.find(c => String(c[0]).endsWith('/functions/v1/cancel-print-job'))!;
    expect(JSON.parse(call[1].body)).toEqual({ print_job_id: JOB });
    expect(urls().some(u => u.includes('rpc/cancel_print_job'))).toBe(false);
    expect(screen.getByText('Print job cancelled.')).toBeOnTheScreen();
  });

  it.each([
    [409, 'CANNOT_CANCEL', 'The printer would not cancel this job: it may already be printing. Check the printer.', "This job can't be cancelled: it may already be printing. Check the printer."],
    [409, 'INVALID_STATUS', 'Cannot cancel a job with status: completed', 'This job has already finished or been cancelled.'],
    [502, 'CANCEL_FAILED', 'The print service did not confirm the cancel. The job may still print.', "The cancel wasn't confirmed. The job may still print. Check the printer."],
  ])('%i %s shows its own text', async (status, code, error, text) => {
    cancelAnswer = () => reply(status, { success: false, code, error, print_job_id: JOB, timestamp: 't' });
    await openSheet();
    await cancel();
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.queryByText('Print job cancelled.')).not.toBeOnTheScreen();
  });

  it('an answer that is not the function\'s (a gateway page) shows the general failure text', async () => {
    cancelAnswer = () => ({ ok: false, status: 502, headers: { get: () => 'text/html' }, json: async () => { throw new Error('not json'); } });
    await openSheet();
    await cancel();
    expect(screen.getByText("Couldn't cancel the print job. Try again.")).toBeOnTheScreen();
  });
});

describe('what the sheet shows of a real answer (WH-109 review)', () => {
  beforeEach(() => {
    printerStatus = () => reply(200, { success: true, status: 'online', message: 'x', printer_name: 'P', transport: 'cups', timestamp: 't' });
  });

  it('lists the jobs of the {success, data} answer, with Cancel for a printing job that has a CUPS job id, and not for a queued or an unconfirmed one', async () => {
    await openSheet();
    // exactly one Cancel: the printing job 201 to 204; none for the queued job (101 to 104) or the unconfirmed one (301 to 304)
    expect(cancelButtons()).toHaveLength(1);
    expect(cancelButtons()[0]).toHaveAccessibleName('Cancel print job 201 to 204');
  });

  it('a printing job that has no CUPS job id (a bridge job) is not offered Cancel', async () => {
    printingCupsId = null;
    await openSheet();
    expect(cancelButtons()).toHaveLength(0);
  });

  it('RECORD_FAILED (cancelled at the printer, not recorded) says so and reads the list again', async () => {
    cancelAnswer = () => reply(500, { success: false, code: 'RECORD_FAILED', error: 'The job was cancelled, but it could not be recorded.', print_job_id: JOB, timestamp: 't' });
    await openSheet();
    const reads = () => mockFetch.mock.calls.filter(c => String(c[0]).endsWith('get_print_jobs')).length;
    const before = reads();
    await cancel();
    expect(screen.getByText("The job was cancelled at the printer, but the record couldn't be updated. Refresh the list.")).toBeOnTheScreen();
    expect(reads()).toBeGreaterThan(before);
  });

  // get-printer-status/index.ts: the bridge cases answer a non-2xx WITH a status
  it.each([
    [503, { success: false, status: 'offline', transport: 'bridge', error: 'The print bridge did not answer', printer_name: 'P', timestamp: 't' }, 'The printer is offline. Check that it is on and connected.'],
    [503, { success: false, status: 'error', transport: 'bridge', error: 'The print bridge is not configured', printer_name: 'P', timestamp: 't' }, 'The printer reports a problem. Check the printer.'],
    [502, { success: false, status: 'error', transport: 'bridge', error: 'The print bridge refused the token', printer_name: 'P', timestamp: 't' }, 'The printer reports a problem. Check the printer.'],
  ])('a %i answer that carries status %j is shown as it is, not replaced by the latest job', async (httpStatus, body, message) => {
    printerStatus = () => reply(httpStatus, body);
    await openSheet();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.queryByText('Printer ready')).not.toBeOnTheScreen();
  });
});
