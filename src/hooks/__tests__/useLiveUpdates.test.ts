/**
 * The live-updates hook as a timer: `refresh` is called every `intervalMs` (measured from
 * the end of the previous call, never overlapping) while a profile is signed in, the
 * screen is shown, the app is in the foreground, the device is online and the hook is
 * enabled; the catch-up rules for a return; and the sensors wiring (useSensorLiveUpdates)
 * that marks only the sensor queries out of date every 60 s.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { queryClient } from '@/lib/queryClient';
import { invalidateSensorQueries, sensorKeys } from '@/features/sensors/sensorQueries';
import { useLiveUpdates, type UseLiveUpdatesOptions } from '../useLiveUpdates';
import { useSensorLiveUpdates, SENSOR_REFRESH_INTERVAL_MS } from '../useSensorLiveUpdates';

let mockFocused = true;
let mockProfile: { id: string } | null = { id: 'profile-fictional-1' };
let mockConnected = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfile } }),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockConnected }) }));

const INTERVAL = 1_000;
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const appState = (state: AppStateStatus) => act(async () => { appStateListeners.forEach(listener => listener(state)); });
const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
let originalState: typeof AppState.currentState;

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  mockConnected = true;
  mockProfile = { id: 'profile-fictional-1' };
  appStateListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => { appStateListeners.delete(listener); } };
  });
  originalState = AppState.currentState;
  AppState.currentState = 'active';
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.restoreAllMocks();
  jest.useRealTimers();
  queryClient.clear();
});

async function mountLive(refresh: () => void | Promise<void>, enabled = true, options: Partial<UseLiveUpdatesOptions> = {}) {
  const view = await renderHook(() => useLiveUpdates(refresh, enabled, { intervalMs: INTERVAL, ...options }));
  return {
    rerender: () => view.rerender({}),
    unmount: () => view.unmount(),
  };
}

test('no call at mount; a call after each interval', async () => {
  const refresh = jest.fn();
  const screen = await mountLive(refresh);
  expect(refresh).not.toHaveBeenCalled();
  await advance(INTERVAL - 1);
  expect(refresh).not.toHaveBeenCalled();
  await advance(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(2);
  await advance(3 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(5);
  await screen.unmount();
  await advance(5 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(5);
});

test('the interval is measured from the end of the call, and calls never overlap', async () => {
  let release!: () => void;
  const refresh = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const screen = await mountLive(refresh);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  // Three intervals pass with the call in flight: no second call.
  await advance(3 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  // It settles; the next call comes one interval after that, not at once.
  await act(async () => { release(); });
  await advance(INTERVAL - 1);
  expect(refresh).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(refresh).toHaveBeenCalledTimes(2);
  await screen.unmount();
});

test('a refresh that rejects or throws does not stop the timer', async () => {
  const refresh = jest.fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockImplementationOnce(() => { throw new Error('sync'); })
    .mockResolvedValue(undefined);
  const screen = await mountLive(refresh);
  await advance(3 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(3);
  await screen.unmount();
});

test('under StrictMode (cleanups then setups again) the timer still runs', async () => {
  const refresh = jest.fn();
  const { unmount } = await renderHook(() => useLiveUpdates(refresh, true, { intervalMs: INTERVAL }), { wrapper: React.StrictMode });
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await unmount();
});

test('a gate turned off while a call is in flight: nothing is scheduled when it settles', async () => {
  let release!: () => void;
  const refresh = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const screen = await mountLive(refresh);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await appState('background');
  await act(async () => { release(); });
  await advance(5 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

test('unmount while a call is in flight: releasing it makes no further call and no error', async () => {
  let release!: () => void;
  const refresh = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const screen = await mountLive(refresh);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await screen.unmount();
  await act(async () => { release(); });
  await advance(5 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('a new refresh identity on every render does not restart the timer', async () => {
  const calls = jest.fn();
  const { rerender, unmount } = await renderHook(() => useLiveUpdates(() => { calls(); }, true, { intervalMs: INTERVAL }));
  await advance(INTERVAL / 2);
  await rerender({});
  await advance(INTERVAL / 2);
  expect(calls).toHaveBeenCalledTimes(1);
  await unmount();
});

test('the latest refresh is the one called', async () => {
  const first = jest.fn();
  const second = jest.fn();
  // A different function on the second draw (not one closure that reads a variable): only the hook can pick it.
  const { rerender, unmount } = await renderHook(
    ({ refresh }: { refresh: () => void }) => useLiveUpdates(refresh, true, { intervalMs: INTERVAL }),
    { initialProps: { refresh: first } },
  );
  await rerender({ refresh: second });
  await advance(INTERVAL);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  await unmount();
});

test('a replaced profile object for the same account keeps the timer running', async () => {
  const refresh = jest.fn();
  const screen = await mountLive(refresh);
  await advance(INTERVAL / 2);
  mockProfile = { id: 'profile-fictional-1' };
  await screen.rerender();
  await advance(INTERVAL / 2);
  expect(refresh).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

test('background, offline, covered and signed out stop the timer; going back restarts it', async () => {
  const refresh = jest.fn();
  const screen = await mountLive(refresh);
  await appState('background');
  await advance(5 * INTERVAL);
  expect(refresh).not.toHaveBeenCalled();
  await appState('active');
  // Back in the foreground while shown: one catch-up, then the timer.
  expect(refresh).toHaveBeenCalledTimes(1);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(2);

  mockConnected = false;
  await screen.rerender();
  await advance(5 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(2);
  mockConnected = true;
  await screen.rerender();
  expect(refresh).toHaveBeenCalledTimes(3);

  mockFocused = false;
  await screen.rerender();
  await advance(5 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(3);
  mockFocused = true;
  await screen.rerender();
  expect(refresh).toHaveBeenCalledTimes(4);

  mockProfile = null;
  await screen.rerender();
  await advance(5 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(4);
  mockProfile = { id: 'profile-fictional-2' };
  await screen.rerender();
  // Signing in again is no return to the screen: no catch-up, the timer starts afresh.
  expect(refresh).toHaveBeenCalledTimes(4);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(5);
  await screen.unmount();
  expect(appStateListeners.size).toBe(0);
});

test('disabled: no timer and no catch-up; enabling starts the timer', async () => {
  const refresh = jest.fn();
  const { rerender, unmount } = await renderHook(
    ({ enabled }: { enabled: boolean }) => useLiveUpdates(refresh, enabled, { intervalMs: INTERVAL }),
    { initialProps: { enabled: false } },
  );
  await advance(5 * INTERVAL);
  await appState('background');
  await appState('active');
  mockFocused = false;
  await rerender({ enabled: false });
  mockFocused = true;
  await rerender({ enabled: false });
  await advance(5 * INTERVAL);
  expect(refresh).not.toHaveBeenCalled();
  await rerender({ enabled: true });
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await unmount();
});

test('a covered screen catches up once on its return, then goes on with the timer', async () => {
  const refresh = jest.fn();
  const screen = await mountLive(refresh);
  mockFocused = false;
  await screen.rerender();
  mockFocused = true;
  await screen.rerender();
  expect(refresh).toHaveBeenCalledTimes(1);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(2);
  await screen.unmount();
});

test('refreshOnFocus false: the return catches up with nothing, the timer still restarts', async () => {
  const refresh = jest.fn();
  const screen = await mountLive(refresh, true, { refreshOnFocus: false });
  mockFocused = false;
  await screen.rerender();
  mockFocused = true;
  await screen.rerender();
  expect(refresh).not.toHaveBeenCalled();
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

test('the foreground or a connection while not shown refreshes nothing', async () => {
  const refresh = jest.fn();
  mockFocused = false;
  const screen = await mountLive(refresh);
  await appState('background');
  await appState('active');
  await advance(5 * INTERVAL);
  expect(refresh).not.toHaveBeenCalled();
  await screen.unmount();
});

test('the first move to live of an app started in the background refreshes nothing', async () => {
  AppState.currentState = 'background';
  const refresh = jest.fn();
  const screen = await mountLive(refresh);
  await advance(5 * INTERVAL);
  expect(refresh).not.toHaveBeenCalled();
  await appState('active');
  expect(refresh).not.toHaveBeenCalled();
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

describe('sensors', () => {
  const sensorsLatest = ['report', ...sensorKeys.snapshot];
  const grnActivity = ['report', 'grn-activity', 'customer-fictional', '2026-10-01', '2026-10-13'];
  const invalidated = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated;

  beforeEach(() => {
    queryClient.setQueryData(sensorsLatest, { devices: [] });
    queryClient.setQueryData(['report', ...sensorKeys.device('device-fictional')], { device: null });
    queryClient.setQueryData(['report', ...sensorKeys.history('device-fictional', 7)], { readings: [] });
    queryClient.setQueryData(grnActivity, { rows: [] });
  });

  test('invalidateSensorQueries marks the latest values and the sensor out of date, not its history nor any other report', async () => {
    await invalidateSensorQueries();
    expect(invalidated(sensorsLatest)).toBe(true);
    expect(invalidated(['report', 'sensors', 'device', 'device-fictional'])).toBe(true);
    expect(invalidated(['report', 'sensors', 'history', 'device-fictional', 7])).toBe(false);
    expect(invalidated(grnActivity)).toBe(false);
  });

  test('useSensorLiveUpdates: every 60 s the sensor queries go out of date; a return refreshes nothing', async () => {
    expect(SENSOR_REFRESH_INTERVAL_MS).toBe(60_000);
    const { rerender, unmount } = await renderHook(() => useSensorLiveUpdates());
    mockFocused = false;
    await rerender({});
    mockFocused = true;
    await rerender({});
    await advance(0);
    expect(invalidated(sensorsLatest)).toBe(false);
    await advance(59_999);
    expect(invalidated(sensorsLatest)).toBe(false);
    await advance(1);
    expect(invalidated(sensorsLatest)).toBe(true);
    expect(invalidated(grnActivity)).toBe(false);
    await unmount();
  });
});
