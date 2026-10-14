/**
 * A print job the printer accepted but did not confirm (print_jobs.status 'unknown',
 * migration 72) is listed under In progress, shown as not confirmed, and the printer is not
 * reported as ready.
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

const unknownJob = {
  id: 'ju', job_type: 'Invoice', status: 'unknown', printer_name: 'LQ1310_RAW', document_range_start: '412',
  document_range_end: '412', document_count: 1, created_at: '2026-10-09T10:00:00Z', completed_at: null,
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
  (getPrintJobs as jest.Mock).mockReset();
  (getPrintJobs as jest.Mock).mockImplementation((_t: unknown, limit: number, status?: string) =>
    Promise.resolve({ success: true, data: limit === 1 || status === 'unknown' ? [unknownJob] : [] }));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('an unconfirmed job is listed under In progress and the printer is not "ready"', async () => {
  const ref = createRef<PrintJobsBottomSheetRef>();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<PrintJobsBottomSheet ref={ref} />); });
  act(() => ref.current!.open());
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });

  const texts = tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
  expect(texts).toContain('Not confirmed');
  expect(texts.some(x => x.includes('Printer ready'))).toBe(false);
  expect(texts.some(x => x.includes('was not confirmed'))).toBe(true);
  act(() => tree.unmount());
});
