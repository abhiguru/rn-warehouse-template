/**
 * One available period shows no chip row and names the period in the section title; the
 * sensor's name is in the header only. Two or more periods keep the radio chips.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDevice } from '@/services/sensor-service';
import { getSensorHistory } from '@/services/sensor-history-service';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import SensorDetailScreen from '../../../app/sensor-detail/[id]';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: { id: 'u', name: 'Asha Example', role: 'staff' } }, theme: { preference: 'light', brand: 'orange' } }),
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
  onOperatorServerChange: () => () => undefined,
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } }, forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }), useIsOffline: () => false }));
jest.mock('@/services/sensor-service', () => ({ getSnapshot: jest.fn(), getDevice: jest.fn() }));
jest.mock('@/services/sensor-history-service', () => ({ getSensorHistory: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const NOW = new Date(2026, 9, 12, 10, 0).getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const mounted: TestRenderer.ReactTestRenderer[] = [];
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());

const sensor = (firstReadingAt: string) => ({
  success: true,
  data: {
    device: {
      id: 's7', device_name: 'Temperature Humidity Sensor', mac_address: '', location: 'Chamber 7', active: true,
      health_status: 'healthy', battery_status: 'OK', connectivity_status: 'ONLINE', is_stale: false,
      last_reading_at: daysAgo(0), staleness_threshold_minutes: 30, consecutive_failures: 0,
      latest_temperature: 2, latest_humidity: 90, latest_reading_timestamp: daysAgo(0),
      earliest_reading_at: firstReadingAt, first_reading_at: firstReadingAt,
      measured_at: daysAgo(0), last_seen_at: daysAgo(0), hub_online: true, battery_low: false, hub: null,
    },
  },
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  forgetQueries();
  jest.clearAllMocks();
  jest.mocked(getSensorHistory).mockResolvedValue({
    success: true,
    data: {
      device_id: 's7', device_name: 'Temperature Humidity Sensor', location: 'Chamber 7', period_days: 7, aggregation_interval: '1 hour',
      readings: [{ timestamp: '2026-10-11T00:00:00Z', temperature: 2.5, humidity: 84 }],
      summary: { avg_temperature: 2.5, min_temperature: 2.5, max_temperature: 2.5, avg_humidity: 84, min_humidity: 84, max_humidity: 84, total_readings: 1 },
    },
  } as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

async function open(firstReadingAt: string) {
  jest.mocked(getDevice).mockResolvedValue(sensor(firstReadingAt) as never);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SensorDetailScreen />);
  });
  mounted.push(tree);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  return {
    texts: () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')),
    radios: () =>
      tree.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function').map(n => n.props.accessibilityLabel as string),
  };
}

describe('the history period of a sensor', () => {
  it('with one period offers no chip and names the period in the section title', async () => {
    const screen = await open(daysAgo(1));
    expect(screen.radios()).toEqual([]);
    expect(screen.texts()).toContain('History, last 7 days');
    expect(screen.texts()).not.toContain('History');
  });

  it('shows the sensor name once, and no "Sensor" label', async () => {
    const screen = await open(daysAgo(1));
    expect(screen.texts().filter(s => s === 'Temperature Humidity Sensor')).toHaveLength(1);
    expect(screen.texts()).not.toContain('Sensor');
  });

  it('with several periods keeps the chips', async () => {
    const screen = await open(daysAgo(40));
    expect(screen.radios()).toEqual(['Last 7 days', 'Last 14 days', 'Last 30 days']);
    expect(screen.texts()).toContain('History');
  });
});
