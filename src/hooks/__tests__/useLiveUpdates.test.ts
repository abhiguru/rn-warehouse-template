/**
 * The table-agnostic live-updates hook: the gating of useOrderLiveUpdates.test.ts and
 * useOrderLiveUpdates.focus.test.tsx run through useLiveUpdates with a fake subscribe, and
 * the sensors wiring (useSensorLiveUpdates) marks only the sensor queries out of date.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create } from 'react-test-renderer';
import { queryClient } from '@/lib/queryClient';
import { subscribeToSensorChanges } from '@/services/sensor-live-updates';
import { invalidateSensorQueries, sensorKeys } from '@/features/sensors/sensorQueries';
import { useLiveUpdates, type LiveUpdatesOptions } from '../useLiveUpdates';
import { useSensorLiveUpdates } from '../useSensorLiveUpdates';

let mockFocused = true;
let mockProfile: { id: string } | null = { id: 'profile-fictional-1' };
let mockConnected = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfile } }),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockConnected }) }));
jest.mock('@/services/sensor-live-updates', () => ({ subscribeToSensorChanges: jest.fn() }));

// Each subscription listens until it is stopped; emit() is a change on the table.
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const stop = jest.fn();
const fakeSubscribe = jest.fn((refresh: () => void | Promise<void>) => {
  const listener = () => { void refresh(); };
  listeners.add(listener);
  return () => { stop(); listeners.delete(listener); };
});
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const appState = (state: AppStateStatus) => act(() => { appStateListeners.forEach(listener => listener(state)); });
let originalState: typeof AppState.currentState;

beforeEach(() => {
  mockFocused = true;
  mockConnected = true;
  mockProfile = { id: 'profile-fictional-1' };
  listeners.clear();
  appStateListeners.clear();
  stop.mockReset();
  fakeSubscribe.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => { appStateListeners.delete(listener); } };
  });
  jest.mocked(subscribeToSensorChanges).mockReset().mockImplementation(fakeSubscribe);
  originalState = AppState.currentState;
  AppState.currentState = 'active';
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.restoreAllMocks();
  queryClient.clear();
});

function render(refresh: () => void, enabled = true, options?: LiveUpdatesOptions) {
  const Harness = () => { useLiveUpdates(fakeSubscribe, refresh, enabled, options); return null; };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(React.createElement(Harness)); });
  return {
    rerender: () => act(() => { tree.update(React.createElement(Harness)); }),
    unmount: () => act(() => { tree.unmount(); }),
  };
}

test('background/offline stop the subscription; foreground/reconnect and account changes create new ones', () => {
  const refresh = jest.fn();
  const screen = render(refresh);
  expect(fakeSubscribe).toHaveBeenCalledTimes(1);
  appState('background');
  expect(stop).toHaveBeenCalledTimes(1);
  appState('active');
  expect(fakeSubscribe).toHaveBeenCalledTimes(2);
  // Back in the foreground while shown: one catch-up.
  expect(refresh).toHaveBeenCalledTimes(1);
  mockConnected = false;
  screen.rerender();
  expect(stop).toHaveBeenCalledTimes(2);
  mockConnected = true;
  screen.rerender();
  expect(fakeSubscribe).toHaveBeenCalledTimes(3);
  expect(refresh).toHaveBeenCalledTimes(2);
  mockProfile = null;
  screen.rerender();
  expect(stop).toHaveBeenCalledTimes(3);
  mockProfile = { id: 'profile-fictional-2' };
  screen.rerender();
  expect(fakeSubscribe).toHaveBeenCalledTimes(4);
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(4);
  expect(appStateListeners.size).toBe(0);
});

test('a replaced profile object for the same account keeps the subscription', () => {
  const screen = render(jest.fn());
  mockProfile = { id: 'profile-fictional-1' };
  screen.rerender();
  expect(fakeSubscribe).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  screen.unmount();
});

test('a covered screen gives the subscription up and catches up once on its return', () => {
  const refresh = jest.fn();
  const screen = render(refresh);
  emit();
  expect(refresh).toHaveBeenCalledTimes(1);
  mockFocused = false;
  screen.rerender();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(0);
  mockFocused = true;
  screen.rerender();
  expect(fakeSubscribe).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(2);
  screen.unmount();
});

test('refreshOnFocus false: the return subscribes again but refreshes nothing', () => {
  const refresh = jest.fn();
  const screen = render(refresh, true, { refreshOnFocus: false });
  mockFocused = false;
  screen.rerender();
  mockFocused = true;
  screen.rerender();
  expect(fakeSubscribe).toHaveBeenCalledTimes(2);
  expect(refresh).not.toHaveBeenCalled();
  screen.unmount();
});

test('disabled, signed out, not shown or offline: no subscription', () => {
  render(jest.fn(), false).unmount();
  mockProfile = null;
  render(jest.fn()).unmount();
  mockProfile = { id: 'profile-fictional-1' };
  mockFocused = false;
  render(jest.fn()).unmount();
  mockFocused = true;
  mockConnected = false;
  render(jest.fn()).unmount();
  expect(fakeSubscribe).not.toHaveBeenCalled();
});

test('the foreground while not shown refreshes nothing', () => {
  const refresh = jest.fn();
  mockFocused = false;
  const screen = render(refresh);
  appState('background');
  appState('active');
  expect(refresh).not.toHaveBeenCalled();
  expect(fakeSubscribe).not.toHaveBeenCalled();
  screen.unmount();
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

  test('useSensorLiveUpdates: a change invalidates the sensor queries; a return refreshes nothing', () => {
    let tree!: ReturnType<typeof create>;
    const Harness = () => { useSensorLiveUpdates(); return null; };
    act(() => { tree = create(React.createElement(Harness)); });
    expect(subscribeToSensorChanges).toHaveBeenCalledTimes(1);
    mockFocused = false;
    act(() => { tree.update(React.createElement(Harness)); });
    mockFocused = true;
    act(() => { tree.update(React.createElement(Harness)); });
    expect(subscribeToSensorChanges).toHaveBeenCalledTimes(2);
    expect(invalidated(sensorsLatest)).toBe(false);
    act(() => { emit(); });
    expect(invalidated(sensorsLatest)).toBe(true);
    expect(invalidated(grnActivity)).toBe(false);
    act(() => { tree.unmount(); });
  });
});
