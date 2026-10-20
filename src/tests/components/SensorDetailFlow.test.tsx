/**
 * One sensor's detail on the reports data layer: the sensor and its history asked side by
 * side, a period chip asking for that period's history only, a late answer for a period
 * left behind never shown, a sensor the facility does not have, the minute timer asking
 * for the sensor again (not its history), the sensor's temperature limits on the chart, and a
 * sensor with less than a day of data (the 7-day period offered; the empty text only without readings).
 * The services and the router are stand-ins; the live updates timer is the real one.
 */
import React from 'react';
import { AppState } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SensorHistoryChart } from '@/components/sensors/SensorHistoryChart';
import { getDevice } from '@/services/sensor-service';
import { getSensorHistory } from '@/services/sensor-history-service';
import type { SensorDeviceDetail } from '@/types/sensor.types';
import type { SensorHistoryData } from '@/types/sensor-history.types';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import SensorDetailScreen from '../../../app/sensor-detail/[id]';

const mockState = {
  auth: { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } },
  theme: { preference: 'light', brand: 'orange' },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 's7' }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Riverside', companyName: 'Riverside Cold Storage' }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } }, forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }) }));
jest.mock('@/services/sensor-service', () => ({ getSnapshot: jest.fn(), getDevice: jest.fn() }));
jest.mock('@/services/sensor-history-service', () => ({ getSensorHistory: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const device = jest.mocked(getDevice);
const history = jest.mocked(getSensorHistory);

/** Monday 12 October 2026, 10:00 local time. */
const NOW = new Date(2026, 9, 12, 10, 0).getTime();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const SENSOR: SensorDeviceDetail = {
  id: 's7',
  device_name: 'Ripening room probe',
  mac_address: '',
  location: 'Chamber 7',
  active: true,
  health_status: 'healthy',
  battery_status: 'OK',
  connectivity_status: 'ONLINE',
  is_stale: false,
  last_reading_at: minutesAgo(5),
  staleness_threshold_minutes: 30,
  consecutive_failures: 0,
  latest_temperature: 2,
  latest_humidity: 90,
  latest_reading_timestamp: minutesAgo(5),
  earliest_reading_at: '2026-01-01T00:00:00Z',
  measured_at: minutesAgo(5),
  last_seen_at: minutesAgo(5),
  hub_online: true,
  battery_low: false,
  first_reading_at: '2026-01-01T00:00:00Z',
  hub: { id: 'hub-1', host: '192.0.2.10', firmware: '1.0.0', online: true, last_seen_at: minutesAgo(1) },
};

const found = (over: Partial<SensorDeviceDetail> = {}) => ({ success: true, data: { device: { ...SENSOR, ...over } } });

/** A period's history whose reading count is the number of days, so each period reads differently. */
const historyOf = (days: number): { success: true; data: SensorHistoryData } => ({
  success: true,
  data: {
    device_id: 's7',
    device_name: 'Ripening room probe',
    location: 'Chamber 7',
    period_days: days,
    aggregation_interval: '1 day',
    readings: [
      { timestamp: '2026-10-10T00:00:00Z', temperature: 2, humidity: 88 },
      { timestamp: '2026-10-11T00:00:00Z', temperature: 3, humidity: 90 },
    ],
    summary: { avg_temperature: 2.5, min_temperature: 2, max_temperature: 3, avg_humidity: 89, min_humidity: 88, max_humidity: 90, total_readings: days },
  },
});

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
  device.mockResolvedValue(found() as never);
  history.mockImplementation(async (_id, days = 7) => historyOf(days) as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  AppState.currentState = originalAppState;
  jest.useRealTimers();
});

const flush = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function open() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SensorDetailScreen />);
  });
  mounted.push(tree);
  await flush();
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  const press = async (label: string) => {
    const control = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
    if (!control) throw new Error(`No control labelled "${label}"`);
    await act(async () => control.props.onPress());
    await flush();
  };
  // The fact rows of the hero, as they are read out: "Connection: Online".
  const facts = () =>
    tree.root
      .findAll(node => typeof node.type === 'string' && node.props.accessible && /^(Connection|Battery|Last reading): /.test(node.props.accessibilityLabel ?? ''))
      .map(node => node.props.accessibilityLabel as string);
  // The period chips, as they are read out, and whether each is selected.
  const chips = () =>
    tree.root
      .findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function')
      .map(node => ({ label: node.props.accessibilityLabel as string, selected: Boolean(node.props.accessibilityState?.selected) }));
  return { tree, texts, press, facts, chips, chart: () => tree.root.findAllByType(SensorHistoryChart) };
}

const NO_HISTORY = 'No history yet. Readings appear here once the sensor reports them.';

/** A 7-day history answer holding these readings, like the phone's sensor TH5 with one. */
const historyWith = (readings: SensorHistoryData['readings']): { success: true; data: SensorHistoryData } => ({
  success: true,
  data: {
    ...historyOf(7).data,
    aggregation_interval: '5 minutes',
    readings,
    summary: { avg_temperature: 4, min_temperature: 4, max_temperature: 4, avg_humidity: 80, min_humidity: 80, max_humidity: 80, total_readings: readings.length },
  },
});

describe('the sensor and its history', () => {
  it('are asked for side by side on opening, and shown together', async () => {
    const sensor = held();
    const days = held();
    device.mockImplementationOnce(() => sensor.promise as never);
    history.mockImplementationOnce(() => days.promise as never);
    const screen = await open();
    // Both requests are out before either answers.
    expect(device.mock.calls).toEqual([['s7']]);
    expect(history.mock.calls).toEqual([['s7', 7]]);
    expect(screen.texts()).toContain('Loading sensor');

    await act(async () => {
      sensor.release(found());
      days.release(historyOf(7));
    });
    await flush();
    expect(screen.texts()).toEqual(expect.arrayContaining(['Ripening room probe', 'Chamber 7', 'Sensor OK', 'All readings, last 7 days', 'Based on 7 readings']));
    expect(screen.facts()).toEqual(['Connection: Online', 'Battery: Good', 'Last reading: 12 Oct 2026, 9:55 am']);
  });

  it('a period chip asks for that period\'s history only, and keeps the sensor on screen', async () => {
    const screen = await open();
    await screen.press('Last 14 days');
    expect(history.mock.calls).toEqual([['s7', 7], ['s7', 14]]);
    expect(device).toHaveBeenCalledTimes(1);
    expect(screen.texts()).toEqual(expect.arrayContaining(['Ripening room probe', 'All readings, last 14 days', 'Based on 14 readings']));
  });

  it('a late answer for a period left behind is not shown under the period chosen', async () => {
    const screen = await open();
    const fourteen = held();
    const thirty = held();
    history.mockImplementationOnce(() => fourteen.promise as never).mockImplementationOnce(() => thirty.promise as never);
    await screen.press('Last 14 days');
    await screen.press('Last 30 days');
    expect(screen.texts()).toContain('Loading 30 days of history');

    await act(async () => thirty.release(historyOf(30)));
    await flush();
    expect(screen.texts()).toEqual(expect.arrayContaining(['All readings, last 30 days', 'Based on 30 readings']));
    // The 14-day answer arrives last: a broken screen would now say 14.
    await act(async () => fourteen.release(historyOf(14)));
    await flush();
    expect(screen.texts()).toEqual(expect.arrayContaining(['All readings, last 30 days', 'Based on 30 readings']));
    expect(screen.texts()).not.toContain('Based on 14 readings');
  });

  it('a sensor the facility does not have says so, with no history', async () => {
    device.mockResolvedValue({ success: true, data: { device: null } } as never);
    const screen = await open();
    expect(screen.texts()).toEqual(expect.arrayContaining(['Sensor not found', 'This sensor was not found. It may have been removed.']));
    expect(screen.chart()).toEqual([]);
  });

  it('a sensor that could not be read says so and tries both again', async () => {
    device.mockResolvedValueOnce({ success: false, message: 'Failed to fetch sensor data' } as never);
    const screen = await open();
    expect(screen.texts()).toEqual(expect.arrayContaining(['Something went wrong', "Couldn't load this sensor. Check your connection and try again."]));
    await screen.press('Try again');
    expect(device).toHaveBeenCalledTimes(2);
    expect(screen.texts()).toContain('Ripening room probe');
  });
});

describe('live', () => {
  it('a minute on, the sensor is asked for again, not its history, and shows the new value', async () => {
    const screen = await open();
    expect(screen.texts()).toContain('2.0°C');
    device.mockResolvedValueOnce(found({ latest_temperature: 3.5, measured_at: minutesAgo(0) }) as never);
    await flush(59_000);
    expect(device).toHaveBeenCalledTimes(1);
    await flush(1_000);
    expect(device).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenCalledTimes(1);
    expect(screen.texts()).toContain('3.5°C');
  });

  it('a sensor that could not be read is not asked again by the minute timer', async () => {
    device.mockResolvedValue({ success: false, message: 'Failed to fetch sensor data' } as never);
    await open();
    expect(device).toHaveBeenCalledTimes(1);
    await flush(5 * 60_000);
    expect(device).toHaveBeenCalledTimes(1);
  });

  it('the connection turns "No recent data" as the time moves on', async () => {
    device.mockResolvedValue(found({ measured_at: minutesAgo(29), last_seen_at: minutesAgo(29) }) as never);
    const screen = await open();
    expect(screen.facts()[0]).toBe('Connection: Online');
    await flush(2 * 60_000);
    expect(screen.facts()[0]).toBe('Connection: No recent data');
    // Two minutes: the minute timer asked for the sensor twice more (the answer is unchanged); history never.
    expect(device).toHaveBeenCalledTimes(3);
    expect(history).toHaveBeenCalledTimes(1);
  });
});

describe('the chart', () => {
  it("draws the sensor's temperature limits from its alert settings, and none without them", async () => {
    device.mockResolvedValue(found({ alert_config: { temperature_max: 8, temperature_min: 0 } }) as never);
    const screen = await open();
    expect(screen.chart()[0].props.thresholds).toEqual([
      { value: 8, level: 'negative', label: 'Max 8.0°C' },
      { value: 0, level: 'negative', label: 'Min 0.0°C' },
    ]);
  });

  it('draws no limits for a sensor with none', async () => {
    const screen = await open();
    expect(screen.chart()[0].props.thresholds).toEqual([]);
  });
});

describe('a sensor with less than a day of data', () => {
  const NEW_SENSOR = { first_reading_at: minutesAgo(10), earliest_reading_at: minutesAgo(10) };

  it('names the 7-day period in the section title and offers no chip', async () => {
    device.mockResolvedValue(found(NEW_SENSOR) as never);
    const screen = await open();
    expect(screen.chips()).toEqual([]);
    expect(screen.texts()).toContain('History, last 7 days');
    expect(history.mock.calls).toEqual([['s7', 7]]);
  });

  it('a history answer with readings shows the chart and its summary, not the empty text', async () => {
    device.mockResolvedValue(found(NEW_SENSOR) as never);
    history.mockResolvedValue(historyWith([{ timestamp: minutesAgo(3), temperature: 4, humidity: 80 }]) as never);
    const screen = await open();
    expect(screen.chart().length).toBe(1);
    expect(screen.chart()[0].props.readings.length).toBe(1);
    expect(screen.texts()).toEqual(expect.arrayContaining(['All readings, last 7 days', 'Based on 1 reading']));
    expect(screen.texts()).not.toContain(NO_HISTORY);
  });

  it('a history answer with no readings shows the empty text, not the chart or a summary', async () => {
    device.mockResolvedValue(found(NEW_SENSOR) as never);
    history.mockResolvedValue(historyWith([]) as never);
    const screen = await open();
    expect(screen.texts()).toContain(NO_HISTORY);
    // A count, not the instances: a failing match would print the whole rendered tree.
    expect(screen.chart().length).toBe(0);
    expect(screen.texts()).not.toContain('All readings, last 7 days');
    // Only the 7-day period exists yet: named in the section title, no chip.
    expect(screen.chips()).toEqual([]);
  });
});
