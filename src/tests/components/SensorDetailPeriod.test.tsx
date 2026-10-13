/**
 * Sensor detail period change (performance review 2026-10-13, DATA-03).
 *
 * A period chip asks for that period's history once, does not reload every device, keeps
 * the screen (only the history area shows loading), and a late answer for a period the
 * user has left does not replace the current one.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { SensorDevice } from '@/types/sensor.types';
import { SensorService } from '@/services/sensor-service';
import { getSensorHistory } from '@/services/sensor-history-service';
import SensorDetailScreen from '../../../app/sensor-detail/[id]';

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
  useLocalSearchParams: () => ({ id: 's7' }),
}));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('@/services/sensor-service', () => ({ SensorService: { pollSensorData: jest.fn() } }));
jest.mock('@/services/sensor-history-service', () => ({ getSensorHistory: jest.fn() }));

const DEVICE: SensorDevice = {
  id: 's7',
  device_name: 'Ripening room probe',
  mac_address: '00:00:07',
  location: 'Chamber 7',
  active: true,
  health_status: 'healthy',
  battery_status: 'GOOD',
  connectivity_status: 'ONLINE',
  is_stale: false,
  last_reading_at: '2026-10-09T10:00:00Z',
  staleness_threshold_minutes: 30,
  consecutive_failures: 0,
  latest_temperature: 2,
  latest_humidity: 90,
  latest_reading_timestamp: '2026-10-09T10:00:00Z',
  earliest_reading_at: '2024-01-01T00:00:00Z',
};

const deviceResult = () => ({
  success: true,
  message: '',
  data: {
    success: true,
    poll_timestamp: '2026-10-09T10:00:00Z',
    devices: [DEVICE],
    new_readings: [],
    dashboard: {
      total_active_sensors: 1, online_sensors: 1, offline_sensors: 0, stale_sensors: 0,
      low_battery_count: 0, critical_battery_count: 0, sensors_with_failures: 0,
      most_recent_sync: '2026-10-09T10:00:00Z',
    },
  },
});

/** A period's history; its reading count (days × 10) tells which period is on screen. */
const historyResult = (days: number) => ({
  success: true,
  data: {
    device_id: 's7',
    device_name: 'Ripening room probe',
    location: 'Chamber 7',
    period_days: days,
    aggregation_interval: '1 day',
    readings: [{ timestamp: '2026-10-08T00:00:00Z', temperature: 2, humidity: 90 }],
    summary: {
      avg_temperature: 2, min_temperature: 1, max_temperature: 3,
      avg_humidity: 90, min_humidity: 88, max_humidity: 92,
      total_readings: days * 10,
    },
  },
});

const poll = SensorService.pollSensorData as jest.Mock;
const history = getSensorHistory as jest.Mock;
/** Answers waiting to be released, in the order they were asked. */
let pendingHistory: { days: number; release: () => void }[] = [];
let pendingDevice: (() => void)[] = [];

beforeEach(() => {
  pendingHistory = [];
  pendingDevice = [];
  poll.mockReset();
  history.mockReset();
  poll.mockImplementation(() => new Promise(resolve => pendingDevice.push(() => resolve(deviceResult()))));
  history.mockImplementation((_id: string, days: number) =>
    new Promise(resolve => pendingHistory.push({ days, release: () => resolve(historyResult(days)) }))
  );
});

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const releaseAll = async () => {
  await act(async () => {
    pendingDevice.splice(0).forEach(r => r());
    pendingHistory.splice(0).forEach(h => h.release());
  });
  await flush();
};

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
const chip = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

async function mountSettled() {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<SensorDetailScreen />); });
  await flush();
  for (let i = 0; i < 3; i += 1) await releaseAll();
  expect(texts(tree)).toContain('Based on 70 readings');
  poll.mockClear();
  history.mockClear();
  return tree;
}

test('the first load asks for the device and the 7-day history side by side', async () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<SensorDetailScreen />); });
  await flush();
  expect(poll).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledWith('s7', 7);
  await releaseAll();
  expect(texts(tree)).toContain('Based on 70 readings');
  expect(poll).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('a period chip asks for that history once and does not reload the devices', async () => {
  const tree = await mountSettled();

  act(() => chip(tree, 'Last 30 days').props.onPress());
  await flush();

  expect(history).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledWith('s7', 30);
  expect(poll).toHaveBeenCalledTimes(0);
  // the screen stays: device name and period chips remain while only the history loads
  const shown = texts(tree);
  expect(shown).toContain('Ripening room probe');
  expect(shown).toContain('Loading 30 days of history');
  expect(shown).not.toContain('Loading sensor');

  await releaseAll();
  expect(texts(tree)).toContain('Based on 300 readings');
  expect(history).toHaveBeenCalledTimes(1);
  expect(poll).toHaveBeenCalledTimes(0);
  act(() => tree.unmount());
});

test('a late answer for a period the user left does not replace the current one', async () => {
  const tree = await mountSettled();

  act(() => chip(tree, 'Last 30 days').props.onPress());
  await flush();
  act(() => chip(tree, 'Last 14 days').props.onPress());
  await flush();
  expect(pendingHistory.map(h => h.days)).toEqual([30, 14]);

  // 14 days answers first, then the old 30-day request
  await act(async () => { pendingHistory[1].release(); });
  await flush();
  expect(texts(tree)).toContain('Based on 140 readings');
  await act(async () => { pendingHistory[0].release(); });
  await flush();
  expect(texts(tree)).toContain('Based on 140 readings');
  expect(texts(tree)).not.toContain('Based on 300 readings');
  act(() => tree.unmount());
});
