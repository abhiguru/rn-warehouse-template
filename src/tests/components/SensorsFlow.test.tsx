/**
 * The sensors list on the reports data layer: the facility is asked once, the minute
 * timer asks again behind the rows, and a sensor turns "No recent data" from the minute
 * tick alone. The service and the router are stand-ins; the query layer, the live
 * updates timer, the status rules and the screen are the real ones.
 *
 * Every timer is fake (`flush` moves the clock), so an extra poll would show as a request.
 */
import React from 'react';
import { AppState } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { getSessionIdentity } from '@/config/supabaseConfig';
import { writeReportCache } from '@/features/reports/reportCache';
import { getSnapshot } from '@/services/sensor-service';
import type { SensorDevice, SensorPollingResponse } from '@/types/sensor.types';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import SensorsScreen from '../../../app/sensors';

const mockState = {
  auth: { userProfile: { id: 'user-a', name: 'Asha Example', role: 'admin' } },
  theme: { preference: 'light', brand: 'orange' },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Riverside', companyName: 'Riverside Cold Storage' }),
}));
// Without a session nothing is kept on the phone; the test of the kept copy signs in.
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } }, forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }) }));
jest.mock('@/services/sensor-service', () => {
  const snapshot = jest.fn();
  // SensorService.pollSensorData is the screen before this change; it answers the same.
  return { getSnapshot: snapshot, getDevice: jest.fn(), SensorService: { pollSensorData: snapshot } };
});
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const snapshot = jest.mocked(getSnapshot);
const push = jest.mocked(router.push);

/** Monday 12 October 2026, 10:00 local time. */
const NOW = new Date(2026, 9, 12, 10, 0).getTime();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const sensor = (id: string, name: string, over: Partial<SensorDevice> = {}): SensorDevice => ({
  id,
  device_name: name,
  mac_address: '',
  location: 'Chamber 4',
  active: true,
  health_status: 'healthy',
  battery_status: 'OK',
  connectivity_status: 'ONLINE',
  is_stale: false,
  last_reading_at: minutesAgo(5),
  staleness_threshold_minutes: 30,
  consecutive_failures: 0,
  latest_temperature: -18,
  latest_humidity: 80,
  latest_reading_timestamp: minutesAgo(5),
  earliest_reading_at: '2026-01-01T00:00:00Z',
  measured_at: minutesAgo(5),
  last_seen_at: minutesAgo(5),
  hub_online: true,
  battery_low: false,
  ...over,
});

const NORTH = sensor('s1', 'North chamber probe');
// Last heard from 29 minutes ago against a 30-minute threshold: fresh now, quiet two minutes later.
const SOUTH = sensor('s2', 'South chamber probe', { latest_temperature: -17, measured_at: minutesAgo(29), last_seen_at: minutesAgo(29) });
const DOCK = sensor('s3', 'Dock probe', { latest_temperature: 4, battery_status: 'LOW', battery_low: true });
const GATE = sensor('s4', 'Gate probe', { hub_online: false, connectivity_status: 'OFFLINE', measured_at: minutesAgo(90), last_seen_at: minutesAgo(90) });

const answer = (devices: SensorDevice[]) => ({
  success: true,
  data: {
    success: true,
    poll_timestamp: new Date(NOW).toISOString(),
    devices,
    new_readings: [],
    dashboard: {
      total_active_sensors: devices.length, online_sensors: devices.length, offline_sensors: 0, stale_sensors: 0,
      low_battery_count: 0, critical_battery_count: 0, sensors_with_failures: 0, most_recent_sync: null,
    },
  } as SensorPollingResponse,
});

/** A request that stays unanswered until the test answers it. */
function held() {
  let release!: (value: unknown) => void;
  const promise = new Promise(resolve => {
    release = resolve;
  });
  return { promise, release };
}

jest.setTimeout(30_000);
const mounted: TestRenderer.ReactTestRenderer[] = [];
let restoreQueries: () => void;
let originalAppState: typeof AppState.currentState;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  forgetQueries();
  jest.clearAllMocks();
  originalAppState = AppState.currentState;
  AppState.currentState = 'active';
  snapshot.mockResolvedValue(answer([NORTH, SOUTH, DOCK]) as never);
  jest.mocked(getSessionIdentity).mockResolvedValue(null);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  AppState.currentState = originalAppState;
  jest.useRealTimers();
});

/** Moves the clock and lets every answer that is due arrive. */
const flush = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function open() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SensorsScreen />);
  });
  mounted.push(tree);
  await flush();
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const labels = () =>
    tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);
  const list = () => tree.root.findByType('FlashList' as never);
  return {
    tree,
    texts,
    // The figures as they are read out: "Online: 2".
    kpis: () => labels().filter(label => /^(Sensors|Online|Offline or no recent data|Battery low): /.test(label)),
    // The status tag of each sensor row, in order.
    rowTags: () =>
      tree.root
        .findAll(node => typeof node.type === 'string' && node.props.accessibilityHint === 'Opens sensor history')
        .map(row => (row.props.accessibilityLabel as string).split(', ')[2]),
    alerts: () => labels().filter(label => /offline$|no recent data$|battery( critical)?$/.test(label)),
    status: () => texts().find(text => text.includes('Last updated')),
    refreshing: () => Boolean(list().props.refreshControl.props.refreshing),
    pull: () => list().props.refreshControl.props.onRefresh() as Promise<unknown>,
  };
}

describe('the sensors list', () => {
  it('shows every sensor with its values, the figures and when they were read, from one request', async () => {
    const screen = await open();
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(screen.texts()).toEqual(expect.arrayContaining(['Temperature and humidity', 'North chamber probe', 'South chamber probe', 'Dock probe', '−18.0°C', '4.0°C', '80%']));
    expect(screen.kpis()).toEqual(['Sensors: 3', 'Online: 3', 'Offline or no recent data: 0', 'Battery low: 1']);
    expect(screen.rowTags()).toEqual(['Sensor OK', 'Sensor OK', 'Battery low']);
    expect(screen.status()).toBe('Last updated 10:00 am');
    expect(screen.texts()).toContain('Updated 5 min ago');
  });

  it('with no sensors says so, under the figures', async () => {
    snapshot.mockResolvedValue(answer([]) as never);
    const screen = await open();
    expect(screen.texts()).toEqual(expect.arrayContaining(['No sensors yet', 'Sensors set up for this facility appear here.']));
    expect(screen.kpis()).toEqual(['Sensors: 0', 'Online: 0', 'Offline or no recent data: 0', 'Battery low: 0']);
  });
});

describe('kept current by the minute timer', () => {
  it('a minute on, the screen asks again behind the rows, with no spinner, and shows the new value', async () => {
    const screen = await open();
    expect(snapshot).toHaveBeenCalledTimes(1);
    const next = held();
    snapshot.mockImplementationOnce(() => next.promise as never);

    // Not before the minute is up.
    await flush(59_000);
    expect(snapshot).toHaveBeenCalledTimes(1);
    await flush(1_000);
    expect(snapshot).toHaveBeenCalledTimes(2);
    // Asked behind the rows: no pull spinner, no busy header button, no skeleton.
    expect(screen.refreshing()).toBe(false);
    expect(screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Refresh sensor data' && node.props.accessibilityState?.busy)).toEqual([]);
    expect(screen.texts()).toContain('North chamber probe');

    await act(async () => {
      next.release(answer([{ ...NORTH, latest_temperature: -12.5, measured_at: minutesAgo(0) }, SOUTH, DOCK]));
    });
    await flush();
    expect(screen.texts()).toContain('−12.5°C');
    expect(screen.texts()).not.toContain('−18.0°C');
  });

  it('asks once a minute while shown and nothing in between: 11 requests in ten minutes', async () => {
    await open();
    await flush(10 * 60_000);
    expect(snapshot).toHaveBeenCalledTimes(11);
  });

  it('a sensor turns "No recent data" from the time alone, whatever the minute timer reads', async () => {
    const screen = await open();
    expect(screen.rowTags()).toEqual(['Sensor OK', 'Sensor OK', 'Battery low']);
    expect(screen.texts()).not.toContain('1 with no recent data');

    // South was read 29 minutes ago against 30: two minutes on, it has had nothing for 31.
    // The server's answer is unchanged (is_stale false): only the time has moved.
    await flush(2 * 60_000);
    expect(screen.rowTags()).toEqual(['Sensor OK', 'No recent data', 'Battery low']);
    expect(screen.alerts()).toEqual(['1 with no recent data', '1 low battery']);
    expect(screen.kpis()).toEqual(['Sensors: 3', 'Online: 2', 'Offline or no recent data: 1', 'Battery low: 1']);
    expect(screen.texts()).toContain('Updated 7 min ago');
    // The minute timer asked twice more (60 s and 120 s); its answers did not change.
    expect(snapshot).toHaveBeenCalledTimes(3);
  });

  it('stops asking once the screen is gone', async () => {
    const screen = await open();
    act(() => screen.tree.unmount());
    await flush(5 * 60_000);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});

describe('needs attention', () => {
  it('names each kind under one heading, with its count read as one element and each sensor a button to its detail', async () => {
    snapshot.mockResolvedValue(answer([NORTH, GATE, DOCK]) as never);
    const screen = await open();
    const header = screen.tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.accessibilityLabel === 'Needs attention');
    expect(header).toHaveLength(1);
    expect(screen.texts()).toContain('NEEDS ATTENTION');
    expect(screen.alerts()).toEqual(['1 offline', '1 low battery']);

    const links = screen.tree.root.findAll(
      node => typeof node.type !== 'string' && node.props.accessibilityHint === 'Opens this sensor' && typeof node.props.onPress === 'function'
    );
    expect(links.map(link => [link.props.accessibilityLabel, link.props.accessibilityRole])).toEqual([
      ['Gate probe', 'button'],
      ['Dock probe', 'button'],
    ]);
    await act(async () => links[0].props.onPress());
    expect(push).toHaveBeenCalledWith('/sensor-detail/s4');
    // The offline sensor's row says why it shows no values.
    expect(screen.rowTags()).toEqual(['Sensor OK', 'Offline', 'Battery low']);
    expect(screen.texts()).toContain('Last seen 1 h ago');
  });

  it('is not drawn when all is well', async () => {
    snapshot.mockResolvedValue(answer([NORTH]) as never);
    const screen = await open();
    expect(screen.texts()).not.toContain('NEEDS ATTENTION');
    expect(screen.alerts()).toEqual([]);
  });
});

describe('failures', () => {
  const account = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', subject: 'user-a' };
  const keep = () => writeReportCache(['sensors', 'latest'], { data: answer([NORTH, DOCK]).data, updatedAt: new Date(2026, 9, 12, 8, 0).getTime() });

  it('offline, the copy kept on the phone stays on screen and says it is not current', async () => {
    jest.mocked(getSessionIdentity).mockResolvedValue(account as never);
    await keep();
    snapshot.mockResolvedValue({ success: false, message: 'Network request failed', error: 'Network request failed' } as never);
    const screen = await open();
    expect(screen.texts()).toEqual(
      expect.arrayContaining([
        "Couldn't update. These figures were loaded earlier.",
        "Couldn't load sensor data. Check your connection and try again.",
        'North chamber probe',
        'Dock probe',
      ])
    );
    expect(screen.status()).toBe('Last updated 8:00 am');
    expect(screen.texts()).not.toContain('Network request failed');
  });

  it('a refusal shows the reason alone: no kept copy, and "Try again" asks once more', async () => {
    jest.mocked(getSessionIdentity).mockResolvedValue(account as never);
    await keep();
    snapshot.mockResolvedValue({ success: false, message: 'Access denied. Staff access required.', error: '42501' } as never);
    const screen = await open();
    expect(screen.texts()).toEqual(expect.arrayContaining(['Something went wrong', 'Access denied. Staff access required.']));
    expect(screen.texts()).not.toContain('North chamber probe');

    snapshot.mockResolvedValue(answer([NORTH]) as never);
    const retry = screen.tree.root.findAll(node => node.props.accessibilityLabel === 'Try again' && typeof node.props.onPress === 'function')[0];
    await act(async () => retry.props.onPress());
    await flush();
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(screen.texts()).toContain('North chamber probe');
  });

  it('a list that could not be read is not asked again by the minute timer', async () => {
    snapshot.mockResolvedValue({ success: false, message: 'Access denied. Staff access required.', error: '42501' } as never);
    await open();
    expect(snapshot).toHaveBeenCalledTimes(1);
    await flush(5 * 60_000);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('pull to refresh asks again and shows the spinner until the answer', async () => {
    const screen = await open();
    const next = held();
    snapshot.mockImplementationOnce(() => next.promise as never);
    let pulled!: Promise<unknown>;
    await act(async () => {
      pulled = screen.pull();
    });
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(screen.refreshing()).toBe(true);
    await act(async () => {
      next.release(answer([NORTH]));
      await pulled;
    });
    expect(screen.refreshing()).toBe(false);
    expect(screen.texts()).not.toContain('Dock probe');
  });
});
