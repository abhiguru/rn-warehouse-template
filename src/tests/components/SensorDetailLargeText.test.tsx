/**
 * At large text sizes the two readings stack at full width and each summary row's stats stack;
 * at normal sizes they sit side by side.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDevice } from '@/services/sensor-service';
import { getSensorHistory } from '@/services/sensor-history-service';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import SensorDetailScreen from '../../../app/sensor-detail/[id]';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 3, fontScale: mockFontScale }),
}));
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
        last_reading_at: new Date(NOW).toISOString(), staleness_threshold_minutes: 30, consecutive_failures: 0,
        latest_temperature: -18.5, latest_humidity: 90, latest_reading_timestamp: new Date(NOW).toISOString(),
        earliest_reading_at: '2026-01-01T00:00:00Z', first_reading_at: '2026-01-01T00:00:00Z',
        measured_at: new Date(NOW).toISOString(), last_seen_at: new Date(NOW).toISOString(), hub_online: true, battery_low: false, hub: null,
      },
    },
  } as never);
  jest.mocked(getSensorHistory).mockResolvedValue({
    success: true,
    data: {
      device_id: 's7', device_name: 'Ripening room probe', location: 'Chamber 7', period_days: 7, aggregation_interval: '1 hour',
      readings: [{ timestamp: '2026-10-11T00:00:00Z', temperature: 2.5, humidity: 84 }],
      summary: { avg_temperature: 2.5, min_temperature: 2.5, max_temperature: 2.5, avg_humidity: 84, min_humidity: 84, max_humidity: 84, total_readings: 1 },
    },
  } as never);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.useRealTimers();
});

async function open(fontScale: number) {
  mockFontScale = fontScale;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SensorDetailScreen />);
  });
  mounted.push(tree);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  const direction = (testID: string) => {
    const node = tree.root.findAll(n => n.props.testID === testID && typeof n.type === 'string')[0];
    return StyleSheet.flatten(node.props.style).flexDirection;
  };
  const summaryRows = () =>
    tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('sensor-summary-row') && typeof n.type === 'string');
  return { direction, summaryDirections: () => summaryRows().map(n => StyleSheet.flatten(n.props.style).flexDirection) };
}

describe('the sensor detail at large text', () => {
  it('stacks the two readings and the summary stats at font scale 2', async () => {
    const screen = await open(2);
    expect(screen.direction('sensor-readings')).toBe('column');
    expect(screen.summaryDirections()).toEqual(['column', 'column']);
  });

  it('keeps them side by side at font scale 1', async () => {
    const screen = await open(1);
    expect(screen.direction('sensor-readings')).toBe('row');
    expect(screen.summaryDirections()).toEqual(['row', 'row']);
  });
});
