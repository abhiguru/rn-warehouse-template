/**
 * WH-109: the Print jobs sheet asks the print server for the printer's own status (get-printer-status) and falls back to
 * the latest job only when the server cannot answer; and a refused cancel (cancel-print-job) shows the app's own text for
 * 409 CANNOT_CANCEL, 409 INVALID_STATUS and 502 CANCEL_FAILED. The real print service runs; only the network is faked.
 */
import React, { createRef } from 'react';
import renderer, { act } from 'react-test-renderer';
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
const pendingJob = {
  id: JOB, job_type: 'GRN', status: 'queued', printer_name: 'LQ1310_RAW', document_range_start: '101',
  document_range_end: '104', document_count: 4, created_at: '2026-10-09T10:00:00Z', completed_at: null, error_message: null,
};
const completedJob = { ...pendingJob, id: 'jc', status: 'completed', completed_at: '2026-10-09T10:01:00Z' };
const printingJob = { ...pendingJob, id: 'jp', status: 'printing', document_range_start: '201', document_range_end: '204' };
const unknownJob = { ...pendingJob, id: 'ju', status: 'unknown', document_range_start: '301', document_range_end: '304' };

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
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, init: { body: string }) => {
    if (url.endsWith('/functions/v1/get-printer-status')) return printerStatus();
    if (url.endsWith('/functions/v1/cancel-print-job')) return cancelAnswer();
    if (url.endsWith('/rest/v1/rpc/get_print_jobs')) {
      const { p_limit, p_status } = JSON.parse(init.body);
      return reply(200, { success: true, message: 'ok', data: p_limit === 1 ? [completedJob] : p_status === 'queued' ? [pendingJob] : p_status === 'printing' ? [printingJob] : p_status === 'unknown' ? [unknownJob] : [] });
    }
    throw new Error(`unexpected request ${url}`);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function openSheet() {
  const ref = createRef<PrintJobsBottomSheetRef>();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<PrintJobsBottomSheet ref={ref} />); });
  act(() => ref.current!.open());
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });
  return tree;
}
const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));

describe('printer status', () => {
  it.each([
    ['online', 'Printer ready'],
    ['busy', 'Printing in progress'],
    ['offline', 'The printer is offline. Check that it is on and connected.'],
    ['error', 'The printer reports a problem. Check the printer.'],
  ])('the print server says %s: the sheet says "%s", and the latest job is not asked for', async (status, message) => {
    printerStatus = () => reply(200, { success: true, status, message: 'x', printer_name: 'P', transport: 'cups', timestamp: 't' });
    const tree = await openSheet();
    expect(texts(tree)).toContain(message);
    // get-printer-status is asked with no printer name: the server answers for the facility's own printer
    const call = mockFetch.mock.calls.find(c => String(c[0]).endsWith('/get-printer-status'))!;
    expect(JSON.parse(call[1].body)).toEqual({});
    expect(mockFetch.mock.calls.some(c => String(c[0]).endsWith('get_print_jobs') && JSON.parse(c[1].body).p_limit === 1)).toBe(false);
    act(() => tree.unmount());
  });

  it('when the print server cannot answer (printing off, 503) the status is derived from the latest job', async () => {
    printerStatus = () => reply(503, { success: false, code: 'PRINTING_OFF', error: 'Printing is not set up for this facility' });
    const tree = await openSheet();
    expect(urls().some(u => u.endsWith('/get-printer-status'))).toBe(true);
    expect(texts(tree)).toContain('Printer ready'); // the latest job completed
    act(() => tree.unmount());
  });
});

describe('cancelling a job', () => {
  const cancel = async (tree: renderer.ReactTestRenderer) => {
    const button = tree.root.find(n => n.props.accessibilityLabel === 'Cancel print job 101 to 104' && typeof n.props.onPress === 'function');
    await act(async () => { await button.props.onPress(); });
  };
  beforeEach(() => {
    printerStatus = () => reply(200, { success: true, status: 'online', message: 'x', printer_name: 'P', transport: 'cups', timestamp: 't' });
  });

  it('calls the cancel-print-job function with the job id and says it was cancelled', async () => {
    cancelAnswer = () => reply(200, { success: true, message: 'Print job cancelled', print_job_id: JOB, cups_job_id: 7, timestamp: 't' });
    const tree = await openSheet();
    await cancel(tree);
    const call = mockFetch.mock.calls.find(c => String(c[0]).endsWith('/functions/v1/cancel-print-job'))!;
    expect(JSON.parse(call[1].body)).toEqual({ print_job_id: JOB });
    expect(urls().some(u => u.includes('rpc/cancel_print_job'))).toBe(false);
    expect(texts(tree)).toContain('Print job cancelled.');
    act(() => tree.unmount());
  });

  it.each([
    [409, 'CANNOT_CANCEL', 'The printer would not cancel this job: it may already be printing. Check the printer.', "This job can't be cancelled: it may already be printing. Check the printer."],
    [409, 'INVALID_STATUS', 'Cannot cancel a job with status: completed', 'This job has already finished or been cancelled.'],
    [502, 'CANCEL_FAILED', 'The print service did not confirm the cancel. The job may still print.', "The cancel wasn't confirmed. The job may still print. Check the printer."],
  ])('%i %s shows its own text', async (status, code, error, text) => {
    cancelAnswer = () => reply(status, { success: false, code, error, print_job_id: JOB, timestamp: 't' });
    const tree = await openSheet();
    await cancel(tree);
    expect(texts(tree)).toContain(text);
    expect(texts(tree)).not.toContain('Print job cancelled.');
    act(() => tree.unmount());
  });

  it('an answer that is not the function\'s (a gateway page) shows the general failure text', async () => {
    cancelAnswer = () => ({ ok: false, status: 502, headers: { get: () => 'text/html' }, json: async () => { throw new Error('not json'); } });
    const tree = await openSheet();
    await cancel(tree);
    expect(texts(tree)).toContain("Couldn't cancel the print job. Try again.");
    act(() => tree.unmount());
  });
});

describe('what the sheet shows of a real answer (WH-109 review)', () => {
  beforeEach(() => {
    printerStatus = () => reply(200, { success: true, status: 'online', message: 'x', printer_name: 'P', transport: 'cups', timestamp: 't' });
  });
  const cancelButtons = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAll(n => /^Cancel print job /.test(String(n.props.accessibilityLabel)) && typeof n.props.onPress === 'function').map(n => n.props.accessibilityLabel);

  it('lists the jobs of the {success, data} answer, with Cancel for a queued and a printing job and not for a job the printer did not confirm', async () => {
    const tree = await openSheet();
    expect(cancelButtons(tree)).toEqual(expect.arrayContaining(['Cancel print job 101 to 104', 'Cancel print job 201 to 204']));
    expect(cancelButtons(tree)).not.toContain('Cancel print job 301 to 304');
    act(() => tree.unmount());
  });

  it('RECORD_FAILED (cancelled at the printer, not recorded) says so and reads the list again', async () => {
    cancelAnswer = () => reply(500, { success: false, code: 'RECORD_FAILED', error: 'The job was cancelled, but it could not be recorded.', print_job_id: JOB, timestamp: 't' });
    const tree = await openSheet();
    const reads = () => mockFetch.mock.calls.filter(c => String(c[0]).endsWith('get_print_jobs')).length;
    const before = reads();
    const button = tree.root.find(n => n.props.accessibilityLabel === 'Cancel print job 101 to 104' && typeof n.props.onPress === 'function');
    await act(async () => { await button.props.onPress(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    expect(texts(tree)).toContain("The job was cancelled at the printer, but the record couldn't be updated. Refresh the list.");
    expect(reads()).toBeGreaterThan(before);
    act(() => tree.unmount());
  });

  // get-printer-status/index.ts: the bridge cases answer a non-2xx WITH a status
  it.each([
    [503, { success: false, status: 'offline', transport: 'bridge', error: 'The print bridge did not answer', printer_name: 'P', timestamp: 't' }, 'The printer is offline. Check that it is on and connected.'],
    [503, { success: false, status: 'error', transport: 'bridge', error: 'The print bridge is not configured', printer_name: 'P', timestamp: 't' }, 'The printer reports a problem. Check the printer.'],
    [502, { success: false, status: 'error', transport: 'bridge', error: 'The print bridge refused the token', printer_name: 'P', timestamp: 't' }, 'The printer reports a problem. Check the printer.'],
  ])('a %i answer that carries status %j is shown as it is, not replaced by the latest job', async (httpStatus, body, message) => {
    printerStatus = () => reply(httpStatus, body);
    const tree = await openSheet();
    expect(texts(tree)).toContain(message);
    expect(texts(tree)).not.toContain('Printer ready');
    act(() => tree.unmount());
  });
});
