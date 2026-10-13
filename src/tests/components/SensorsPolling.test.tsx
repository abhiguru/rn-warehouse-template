/**
 * Sensors list polling (performance review 2026-10-13, R3 and R5).
 *
 * R3: one poll in flight however slow the network is; no polls while the route is covered
 * by a sensor detail (blurred); exactly one poll when the route is focused again.
 * R5: the "next update" countdown ticks every second without re-rendering the sensor rows.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SensorDevice } from '@/types/sensor.types';
import { SensorService } from '@/services/sensor-service';
import { formatTemperature } from '@/components/sensors/SensorHistoryChart';
import { SensorsScreen } from '../../../app/sensors';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
// formatTemperature is called only while a sensor row renders: its call count is the row render count.
jest.mock('@/components/sensors/SensorHistoryChart', () => {
  const actual = jest.requireActual('@/components/sensors/SensorHistoryChart');
  return { ...actual, formatTemperature: jest.fn(actual.formatTemperature) };
});
jest.mock('@/services/sensor-service', () => ({ SensorService: { pollSensorData: jest.fn() } }));

const device = (id: string, name: string, temperature: number): SensorDevice => ({
  id,
  device_name: name,
  mac_address: `00:00:${id}`,
  location: 'Chamber 4',
  active: true,
  health_status: 'healthy',
  battery_status: 'GOOD',
  connectivity_status: 'ONLINE',
  is_stale: false,
  last_reading_at: '2026-10-09T10:00:00Z',
  staleness_threshold_minutes: 30,
  consecutive_failures: 0,
  latest_temperature: temperature,
  latest_humidity: 80,
  latest_reading_timestamp: '2026-10-09T10:00:00Z',
  earliest_reading_at: '2026-01-01T00:00:00Z',
});

const DEVICES = [device('s1', 'North chamber probe', -18), device('s2', 'South chamber probe', -17), device('s3', 'Dock probe', 4)];

const pollResult = (stamp: string) => ({
  success: true,
  message: '',
  data: {
    success: true,
    poll_timestamp: stamp,
    devices: DEVICES.map(d => ({ ...d })),
    new_readings: [],
    dashboard: {
      total_active_sensors: 3, online_sensors: 3, offline_sensors: 0, stale_sensors: 0,
      low_battery_count: 0, critical_battery_count: 0, sensors_with_failures: 0,
      most_recent_sync: stamp,
    },
  },
});

const poll = SensorService.pollSensorData as jest.Mock;
let pending: (() => void)[] = [];
let inFlight = 0;
let maxInFlight = 0;
let stampNo = 0;

function makeRoute() {
  let focused = true;
  const listeners: Record<string, Set<() => void>> = { focus: new Set(), blur: new Set() };
  return {
    navigation: {
      isFocused: () => focused,
      addListener: (event: 'focus' | 'blur', cb: () => void) => {
        listeners[event].add(cb);
        return () => listeners[event].delete(cb);
      },
    },
    blur: () => { focused = false; listeners.blur.forEach(cb => cb()); },
    focus: () => { focused = true; listeners.focus.forEach(cb => cb()); },
  };
}

const flush = () => act(async () => { await jest.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const finishAll = async () => {
  await act(async () => { pending.splice(0).forEach(done => done()); });
  await flush();
};

let appStateListeners: ((s: AppStateStatus) => void)[] = [];

beforeEach(async () => {
  jest.useFakeTimers();
  pending = [];
  inFlight = 0;
  maxInFlight = 0;
  stampNo = 0;
  await AsyncStorage.clear();
  appStateListeners = [];
  // The Jest stand-in for AppState has no state string; the app reads one on a phone.
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => {
    appStateListeners.push(cb);
    return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
  }) as never);
  poll.mockReset();
  poll.mockImplementation(() => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    stampNo += 1;
    const stamp = `2026-10-09T10:00:${String(stampNo).padStart(2, '0')}Z`;
    return new Promise(resolve => {
      pending.push(() => { inFlight -= 1; resolve(pollResult(stamp)); });
    });
  });
  (formatTemperature as jest.Mock).mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function mount(route = makeRoute()) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NavigationContext.Provider value={route.navigation as never}>
        <SensorsScreen />
      </NavigationContext.Provider>
    );
  });
  await flush();
  return { tree, route };
}

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));

describe('R3: sensors polling', () => {
  it('keeps one poll in flight across several intervals of a slow request', async () => {
    const { tree } = await mount();
    expect(poll).toHaveBeenCalledTimes(1);
    await advance(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);

    await finishAll();
    await advance(10_000);
    expect(poll).toHaveBeenCalledTimes(2);
    // the second poll asks only for what changed since the first
    expect(poll.mock.calls[0][0]).toBeUndefined();
    expect(poll.mock.calls[1][0]).toBe('2026-10-09T10:00:01Z');
    await finishAll();
    act(() => tree.unmount());
  });

  it('stops while a sensor detail covers the list and polls once on return', async () => {
    const { tree, route } = await mount();
    await finishAll();
    expect(poll).toHaveBeenCalledTimes(1);

    act(() => route.blur());
    await advance(60_000);
    expect(poll).toHaveBeenCalledTimes(1);

    act(() => route.focus());
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);
    await finishAll();
    await advance(9_000);
    expect(poll).toHaveBeenCalledTimes(2);
    act(() => tree.unmount());
  });

  it('stops in the background and polls once on return to the foreground', async () => {
    const { tree } = await mount();
    await finishAll();
    act(() => appStateListeners.forEach(l => l('background')));
    await advance(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
    act(() => appStateListeners.forEach(l => l('active')));
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);
    act(() => tree.unmount());
  });

  it('pull to refresh during a poll joins it', async () => {
    const { tree } = await mount();
    await finishAll();
    await advance(10_000);
    expect(poll).toHaveBeenCalledTimes(2);
    const refresh = tree.root.findAll(n => typeof n.props.onRefresh === 'function' && 'refreshing' in n.props)[0];
    act(() => { void refresh.props.onRefresh(); });
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    await finishAll();
    act(() => tree.unmount());
  });
});

describe('R5: countdown does not re-render rows', () => {
  it('nine countdown ticks between polls render no sensor row', async () => {
    const { tree } = await mount();
    await finishAll();
    expect(texts(tree)).toEqual(expect.arrayContaining(['North chamber probe', 'Dock probe']));
    const before = texts(tree).find(s => s.startsWith('Next update'));

    (formatTemperature as jest.Mock).mockClear();
    const rowRendersPerTick: number[] = [];
    for (let tick = 0; tick < 9; tick += 1) {
      const callsBefore = (formatTemperature as jest.Mock).mock.calls.length;
      await advance(1_000);
      // two temperature texts per row render (spoken label and shown value)
      rowRendersPerTick.push(((formatTemperature as jest.Mock).mock.calls.length - callsBefore) / 2);
    }
    const after = texts(tree).find(s => s.startsWith('Next update'));
    // the countdown itself still moves
    expect(after).not.toEqual(before);
    expect(rowRendersPerTick).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    act(() => tree.unmount());
  });
});
