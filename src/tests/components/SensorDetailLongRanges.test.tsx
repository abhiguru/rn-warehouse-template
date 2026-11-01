/**
 * The sensor detail's long ranges and CSV export (backend migration 136): 6 months, 1 year and 2 years are read from the
 * hourly summary and offered once the sensor's data covers them; a backend without it hides 6 months and 2 years and the
 * export; "Export CSV" builds the CSV of the chosen period on the phone and hands it to the share sheet.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDevice } from '@/services/sensor-service';
import { getSensorHistory } from '@/services/sensor-history-service';
import { getSensorHourlyRows } from '@/services/sensor-hourly-service';
import { noteRpcSupport, resetRpcSupport } from '@/config/facilityRpcSupport';
import { shareCsvFile } from '@/utils/shareDocument';
import { showAlert } from '@/utils/alert';
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
jest.mock('@/services/sensor-hourly-service', () => ({ getSensorHourlyRows: jest.fn(), getSensorHistoryLong: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ shareCsvFile: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
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
      id: 's7', device_name: 'Chamber, 7', mac_address: '', location: 'North', active: true,
      health_status: 'healthy', battery_status: 'OK', connectivity_status: 'ONLINE', is_stale: false,
      last_reading_at: daysAgo(0), staleness_threshold_minutes: 30, consecutive_failures: 0,
      latest_temperature: 2, latest_humidity: 90, latest_reading_timestamp: daysAgo(0),
      earliest_reading_at: firstReadingAt, first_reading_at: firstReadingAt,
      measured_at: daysAgo(0), last_seen_at: daysAgo(0), hub_online: true, battery_low: false, hub: null,
    },
  },
});
const history = {
  success: true,
  data: {
    device_id: 's7', device_name: 'Chamber, 7', location: 'North', period_days: 7, aggregation_interval: '1 hour',
    readings: [{ timestamp: '2026-10-11T00:00:00Z', temperature: 2.5, humidity: 84 }],
    summary: { avg_temperature: 2.5, min_temperature: 2.5, max_temperature: 2.5, avg_humidity: 84, min_humidity: 84, max_humidity: 84, total_readings: 1 },
  },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  forgetQueries();
  resetRpcSupport();
  jest.clearAllMocks();
  jest.mocked(getSensorHistory).mockResolvedValue(history as never);
  const { getSensorHistoryLong } = jest.requireMock('@/services/sensor-hourly-service');
  getSensorHistoryLong.mockResolvedValue(history);
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
  const exportButton = () => tree.root.findAll(n => n.props.testID === 'sensor-export-csv' && typeof n.props.onPress === 'function')[0];
  return {
    radios: () => tree.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function').map(n => n.props.accessibilityLabel as string),
    pick: (label: string) => act(async () => { tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress(); }),
    exportButton,
    hasExport: () => exportButton() !== undefined,
    exportNow: () => act(async () => { await exportButton().props.onPress(); }),
    setSupport: (supported: boolean) => act(async () => { noteRpcSupport('sensorHourly', supported); }),
  };
}

describe('the long ranges', () => {
  it('are offered once the sensor has the data: 6 months at 200 days, 1 year at 400, 2 years at 800', async () => {
    expect((await open(daysAgo(200))).radios()).toEqual(['Last 7 days', 'Last 14 days', 'Last 30 days', 'Last 90 days', 'Last 6 months']);
  });

  it('all three with two years of data', async () => {
    const screen = await open(daysAgo(800));
    expect(screen.radios()).toEqual(['Last 7 days', 'Last 14 days', 'Last 30 days', 'Last 90 days', 'Last 6 months', 'Last 1 year', 'Last 2 years']);
  });

  it('are left out, apart from the year, once the backend is known not to have the hourly summary, and the export goes', async () => {
    const screen = await open(daysAgo(800));
    expect(screen.hasExport()).toBe(true);
    await screen.setSupport(false);
    expect(screen.radios()).toEqual(['Last 7 days', 'Last 14 days', 'Last 30 days', 'Last 90 days', 'Last 1 year']);
    expect(screen.hasExport()).toBe(false);
  });

  it('go back to 7 days when the chosen one disappears', async () => {
    const screen = await open(daysAgo(800));
    await screen.pick('Last 2 years');
    const { getSensorHistoryLong } = jest.requireMock('@/services/sensor-hourly-service');
    expect(getSensorHistoryLong).toHaveBeenCalledWith('s7', 730);
    await screen.setSupport(false);
    expect(screen.radios()).not.toContain('Last 2 years');
    // 7 days is read the ordinary way again.
    expect(getSensorHistory).toHaveBeenLastCalledWith('s7', 7);
  });
});

describe('Export CSV', () => {
  const hours = [
    { hour: '2026-10-01T01:00:00Z', sample_count: 12, temperature_min: 1, temperature_max: 3, temperature_avg: 2, humidity_min: 80, humidity_max: 90, humidity_avg: 85 },
  ];

  it('builds the CSV of the chosen period on the phone and shares it as a .csv file', async () => {
    jest.mocked(getSensorHourlyRows).mockResolvedValue({ success: true, device: { id: 's7', name: 'Chamber, 7', location: 'North' }, rows: hours } as never);
    jest.mocked(shareCsvFile).mockResolvedValue({ success: true });
    const screen = await open(daysAgo(800));
    await screen.pick('Last 6 months');
    await screen.exportNow();

    const [, range] = jest.mocked(getSensorHourlyRows).mock.calls[0];
    expect(jest.mocked(getSensorHourlyRows).mock.calls[0][0]).toBe('s7');
    expect(range.toMs - range.fromMs).toBe(183 * 86_400_000);
    const [csv, filename] = jest.mocked(shareCsvFile).mock.calls[0];
    expect(csv).toBe(
      'device,hour_utc,count,temp_min,temp_max,temp_avg,humidity_min,humidity_max,humidity_avg\r\n"Chamber, 7",2026-10-01T01:00:00.000Z,12,1,3,2,80,90,85\r\n'
    );
    expect(filename).toMatch(/^Chamber, 7_2026-\d\d-\d\d_2026-10-12\.csv$/);
  });

  it('tells why when the server refuses, and shares nothing', async () => {
    jest.mocked(getSensorHourlyRows).mockResolvedValue({ success: false, code: 'DEVICE_NOT_FOUND', message: 'This sensor is not on this facility any more.' });
    const screen = await open(daysAgo(40));
    await screen.exportNow();
    expect(shareCsvFile).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith("Couldn't export", 'This sensor is not on this facility any more.');
  });

  it('says there is nothing to export for a period with no hourly readings', async () => {
    jest.mocked(getSensorHourlyRows).mockResolvedValue({ success: true, device: { id: 's7', name: 'x', location: '' }, rows: [] } as never);
    const screen = await open(daysAgo(40));
    await screen.exportNow();
    expect(shareCsvFile).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Nothing to export', 'There are no hourly readings in this period.');
  });

  it('says so when the share sheet cannot open', async () => {
    jest.mocked(getSensorHourlyRows).mockResolvedValue({ success: true, device: { id: 's7', name: 'x', location: '' }, rows: hours } as never);
    jest.mocked(shareCsvFile).mockResolvedValue({ success: false, error: 'boom' });
    const screen = await open(daysAgo(40));
    await screen.exportNow();
    expect(showAlert).toHaveBeenCalledWith("Couldn't export", "Couldn't open the share sheet for the CSV file. Try again.");
  });
});
