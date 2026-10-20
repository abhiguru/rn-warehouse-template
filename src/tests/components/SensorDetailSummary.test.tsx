/**
 * The summary card counts the raw readings the server averaged, titles itself "All readings"
 * and shows humidity in whole percent.
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
const mounted: TestRenderer.ReactTestRenderer[] = [];
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  forgetQueries();
  jest.clearAllMocks();
  jest.mocked(getDevice).mockResolvedValue({
    success: true,
    data: {
      device: {
        id: 's7', device_name: 'Ripening room probe', mac_address: '', location: 'Chamber 7', active: true,
        health_status: 'healthy', battery_status: 'OK', connectivity_status: 'ONLINE', is_stale: false,
        last_reading_at: new Date(NOW - 300_000).toISOString(), staleness_threshold_minutes: 30, consecutive_failures: 0,
        latest_temperature: 2, latest_humidity: 90, latest_reading_timestamp: new Date(NOW - 300_000).toISOString(),
        earliest_reading_at: '2026-01-01T00:00:00Z', first_reading_at: '2026-01-01T00:00:00Z',
        measured_at: new Date(NOW - 300_000).toISOString(), last_seen_at: new Date(NOW - 300_000).toISOString(),
        hub_online: true, battery_low: false, hub: null,
      },
    },
  } as never);
  jest.mocked(getSensorHistory).mockResolvedValue({
    success: true,
    data: {
      device_id: 's7', device_name: 'Ripening room probe', location: 'Chamber 7', period_days: 7, aggregation_interval: '1 hour',
      raw_reading_count: 170,
      readings: [
        { timestamp: '2026-10-11T00:00:00Z', temperature: 2.5, humidity: 84 },
        { timestamp: '2026-10-11T01:00:00Z', temperature: 4.2, humidity: 88 },
      ],
      summary: { avg_temperature: 3.5, min_temperature: 2.4, max_temperature: 4.3, avg_humidity: 86, min_humidity: 83, max_humidity: 89, total_readings: 14 },
    },
  } as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

async function open() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SensorDetailScreen />);
  });
  mounted.push(tree);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  return tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
}

describe('the summary card of a sensor', () => {
  it('counts the raw readings, titles itself "All readings" and shows whole-percent humidity', async () => {
    const all = await open();
    expect(all).toContain('All readings, last 7 days');
    expect(all).toContain('Based on 170 readings');
    expect(all).not.toContain('Based on 14 readings');
    expect(all).toContain('86%');
    expect(all).not.toContain('86.0%');
    expect(all).toContain('83%');
  });
});
