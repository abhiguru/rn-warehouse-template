/**
 * The one set of status rules of the sensor screens: staleness from the time alone, the
 * server's verdict kept, the alerts and figures over the list, and the chart's limits.
 */
import type { SensorDevice } from '@/types/sensor.types';
import {
  batteryFact,
  batteryTag,
  chartThresholds,
  connectionStatus,
  isOffline,
  isQuiet,
  isStale,
  lastKnownText,
  rowStatus,
  sensorAlerts,
  sensorKpis,
  temperatureState,
  valuesNotChanging,
} from '../sensorStatus';

const NOW = Date.parse('2026-10-13T10:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const sensor = (over: Partial<SensorDevice> = {}): SensorDevice => ({
  id: 's1',
  device_name: 'North chamber probe',
  mac_address: '',
  location: 'Chamber 1',
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
  hub_online: true,
  battery_low: false,
  ...over,
});

describe('isStale', () => {
  it('turns true once the latest values are older than the threshold, from the time alone', () => {
    expect(isStale(sensor({ measured_at: minutesAgo(29) }), NOW)).toBe(false);
    expect(isStale(sensor({ measured_at: minutesAgo(30) }), NOW)).toBe(false);
    expect(isStale(sensor({ measured_at: minutesAgo(31) }), NOW)).toBe(true);
    // The same sensor a minute tick later.
    expect(isStale(sensor({ measured_at: minutesAgo(30) }), NOW + 60_000)).toBe(true);
  });

  it("uses the sensor's own threshold, and 30 minutes when it has none", () => {
    expect(isStale(sensor({ measured_at: minutesAgo(45), staleness_threshold_minutes: 60 }), NOW)).toBe(false);
    expect(isStale(sensor({ measured_at: minutesAgo(45), staleness_threshold_minutes: 0 }), NOW)).toBe(true);
  });

  it('measures from measured_at, and from the latest reading when the server sends no measured_at', () => {
    expect(isStale(sensor({ measured_at: minutesAgo(5), latest_reading_timestamp: minutesAgo(90) }), NOW)).toBe(false);
    expect(isStale(sensor({ measured_at: undefined, latest_reading_timestamp: minutesAgo(90) }), NOW)).toBe(true);
    expect(isStale(sensor({ measured_at: null, latest_reading_timestamp: minutesAgo(10) }), NOW)).toBe(false);
  });

  it('measures from last_seen_at when the server sends it: a heartbeat without new values keeps the sensor fresh', () => {
    expect(isStale(sensor({ last_seen_at: minutesAgo(5), measured_at: minutesAgo(90) }), NOW)).toBe(false);
    expect(isStale(sensor({ last_seen_at: minutesAgo(31), measured_at: minutesAgo(5) }), NOW)).toBe(true);
  });

  it("keeps the server's verdict, and calls a sensor that never reported stale", () => {
    expect(isStale(sensor({ is_stale: true }), NOW)).toBe(true);
    expect(isStale(sensor({ connectivity_status: 'STALE' }), NOW)).toBe(true);
    expect(isStale(sensor({ measured_at: null, latest_reading_timestamp: null }), NOW)).toBe(true);
  });
});

describe('isOffline', () => {
  it('is the server saying so, or the hub out of reach', () => {
    expect(isOffline(sensor())).toBe(false);
    expect(isOffline(sensor({ connectivity_status: 'OFFLINE' }))).toBe(true);
    expect(isOffline(sensor({ hub_online: false }))).toBe(true);
    expect(isOffline(sensor({ hub_online: undefined }))).toBe(false);
  });
});

describe('statuses', () => {
  it('a row shows the most severe of health, connection and battery', () => {
    expect(rowStatus(sensor(), NOW)).toEqual({ kind: 'positive', label: 'Sensor OK' });
    expect(rowStatus(sensor({ health_status: 'warning' }), NOW)).toEqual({ kind: 'critical', label: 'Warning' });
    expect(rowStatus(sensor({ measured_at: minutesAgo(45) }), NOW)).toEqual({ kind: 'critical', label: 'No recent data' });
    expect(rowStatus(sensor({ measured_at: minutesAgo(45), hub_online: false }), NOW)).toEqual({ kind: 'negative', label: 'Offline' });
    expect(rowStatus(sensor({ battery_low: true }), NOW)).toEqual({ kind: 'critical', label: 'Battery low' });
    expect(rowStatus(sensor({ battery_status: 'CRITICAL' }), NOW)).toEqual({ kind: 'negative', label: 'Battery critical' });
  });

  it('the connection is offline, then no recent data, then online', () => {
    expect(connectionStatus(sensor(), NOW)).toEqual({ kind: 'positive', label: 'Online' });
    expect(connectionStatus(sensor({ measured_at: minutesAgo(31) }), NOW)).toEqual({ kind: 'critical', label: 'No recent data' });
    expect(connectionStatus(sensor({ measured_at: minutesAgo(31), connectivity_status: 'OFFLINE' }), NOW)).toEqual({ kind: 'negative', label: 'Offline' });
    expect(connectionStatus(sensor({ connectivity_status: 'UNKNOWN' }), NOW)).toEqual({ kind: 'neutral', label: 'Unknown' });
  });

  it('the battery: a tag only when it needs attention, a fact always', () => {
    expect(batteryTag(sensor())).toBeNull();
    expect(batteryTag(sensor({ battery_status: 'UNKNOWN', battery_low: null }))).toBeNull();
    expect(batteryTag(sensor({ battery_status: 'LOW' }))?.label).toBe('Battery low');
    expect(batteryFact(sensor())).toEqual({ kind: 'positive', label: 'Good' });
    expect(batteryFact(sensor({ battery_low: true }))).toEqual({ kind: 'critical', label: 'Low' });
    expect(batteryFact(sensor({ battery_status: 'CRITICAL' }))).toEqual({ kind: 'negative', label: 'Critical' });
    expect(batteryFact(sensor({ battery_status: 'UNKNOWN', battery_low: null }))).toEqual({ kind: 'neutral', label: 'Unknown' });
  });
});

describe('alerts and figures over the list', () => {
  const fleet = [
    sensor({ id: 'a', device_name: 'Alpha probe' }),
    sensor({ id: 'b', device_name: 'Bravo probe', hub_online: false, measured_at: minutesAgo(90) }),
    sensor({ id: 'c', device_name: 'Charlie probe', measured_at: minutesAgo(40) }),
    sensor({ id: 'd', device_name: 'Delta probe', battery_status: 'CRITICAL', battery_low: true }),
    sensor({ id: 'e', device_name: 'Echo probe', battery_status: 'LOW' }),
  ];

  it('one line per kind, most serious first, each sensor in one connection line and one battery line', () => {
    expect(sensorAlerts(fleet, NOW)).toEqual([
      { kind: 'offline', tone: 'negative', label: '1 offline', devices: [{ id: 'b', name: 'Bravo probe' }] },
      { kind: 'stale', tone: 'critical', label: '1 with no recent data', devices: [{ id: 'c', name: 'Charlie probe' }] },
      { kind: 'batteryCritical', tone: 'negative', label: '1 battery critical', devices: [{ id: 'd', name: 'Delta probe' }] },
      { kind: 'batteryLow', tone: 'critical', label: '1 low battery', devices: [{ id: 'e', name: 'Echo probe' }] },
    ]);
  });

  it('nothing when all is well, and a quiet sensor appears once its threshold has passed', () => {
    const quiet = [sensor({ id: 'a', measured_at: minutesAgo(29) })];
    expect(sensorAlerts(quiet, NOW)).toEqual([]);
    expect(sensorAlerts(quiet, NOW + 2 * 60_000).map(alert => alert.label)).toEqual(['1 with no recent data']);
  });

  it('counts the sensors, those online, those not, and the batteries that need attention', () => {
    expect(sensorKpis(fleet, NOW)).toEqual({ total: 5, online: 3, noRecentData: 2, batteryLow: 2 });
    expect(sensorKpis([], NOW)).toEqual({ total: 0, online: 0, noRecentData: 0, batteryLow: 0 });
  });
});

describe('chart thresholds', () => {
  it("draws the sensor's temperature limits as dashed lines, and none without them", () => {
    expect(chartThresholds(sensor({ alert_config: { temperature_max: 8, temperature_min: -2.5 } }))).toEqual([
      { value: 8, level: 'negative', label: 'Max 8.0°C' },
      { value: -2.5, level: 'negative', label: 'Min −2.5°C' },
    ]);
    expect(chartThresholds(sensor())).toEqual([]);
    expect(chartThresholds(sensor({ alert_config: { alert_battery_low: true } }))).toEqual([]);
    expect(chartThresholds(sensor({ alert_config: { temperature_max: null, temperature_min: Number.NaN } }))).toEqual([]);
  });
});

describe('offline, values not changing and temperature limits', () => {
  // Heard from 2 minutes ago, but the values are 45 minutes old against a 30-minute threshold.
  const frozen = (over: Partial<SensorDevice> = {}) =>
    sensor({ last_seen_at: minutesAgo(2), measured_at: minutesAgo(45), health_status: 'warning', values_stale: true, ...over });

  it('an offline sensor says Offline, not Unknown, although the server calls its health offline', () => {
    const offline = sensor({ hub_online: false, connectivity_status: 'OFFLINE', health_status: 'offline', last_seen_at: minutesAgo(90), measured_at: minutesAgo(90) });
    expect(rowStatus(offline, NOW)).toEqual({ kind: 'negative', label: 'Offline' });
    const quiet = sensor({ is_stale: true, connectivity_status: 'STALE', health_status: 'offline', last_seen_at: minutesAgo(90), measured_at: minutesAgo(90) });
    expect(rowStatus(quiet, NOW)).toEqual({ kind: 'critical', label: 'No recent data' });
  });

  it('values that stopped changing say so, from the server flag or from the time, and are not a quiet connection', () => {
    expect(rowStatus(frozen(), NOW)).toEqual({ kind: 'critical', label: 'Values not changing' });
    expect(valuesNotChanging(frozen({ values_stale: undefined }), NOW)).toBe(true);
    expect(valuesNotChanging(sensor(), NOW)).toBe(false);
    expect(valuesNotChanging(frozen({ hub_online: false }), NOW)).toBe(false);
    expect(valuesNotChanging(frozen({ last_seen_at: minutesAgo(90) }), NOW)).toBe(false);
  });

  it('a low battery beside values not changing keeps the more specific tag first', () => {
    expect(rowStatus(frozen({ battery_low: true }), NOW)).toEqual({ kind: 'critical', label: 'Values not changing' });
    expect(rowStatus(sensor({ health_status: 'warning', battery_low: true }), NOW)).toEqual({ kind: 'critical', label: 'Battery low' });
  });

  it('too warm or too cold from the flag, and nothing from an older server or a quiet sensor', () => {
    expect(rowStatus(sensor({ temperature_alert: 'HIGH' }), NOW)).toEqual({ kind: 'negative', label: 'Too warm' });
    expect(rowStatus(sensor({ temperature_alert: 'LOW' }), NOW)).toEqual({ kind: 'negative', label: 'Too cold' });
    expect(temperatureState(sensor(), NOW)).toBeNull();
    expect(temperatureState(sensor({ temperature_alert: null }), NOW)).toBeNull();
    expect(temperatureState(sensor({ temperature_alert: 'HIGH', hub_online: false }), NOW)).toBeNull();
    expect(temperatureState(frozen({ temperature_alert: 'HIGH' }), NOW)).toBeNull();
    expect(rowStatus(sensor({ temperature_alert: 'HIGH', battery_status: 'CRITICAL' }), NOW)).toEqual({ kind: 'negative', label: 'Too warm' });
  });

  it('Needs attention lists too warm and too cold after the connection lines, each sensor once per kind', () => {
    const devices = [
      sensor({ id: 'a', device_name: 'Alpha probe', temperature_alert: 'HIGH' }),
      sensor({ id: 'b', device_name: 'Bravo probe', temperature_alert: 'LOW' }),
      sensor({ id: 'c', device_name: 'Charlie probe', temperature_alert: 'HIGH', hub_online: false }),
    ];
    expect(sensorAlerts(devices, NOW).map(alert => [alert.kind, alert.label, alert.devices.map(d => d.id)])).toEqual([
      ['offline', '1 offline', ['c']],
      ['tooWarm', '1 too warm', ['a']],
      ['tooCold', '1 too cold', ['b']],
    ]);
  });

  it('a quiet sensor is last known, in days once a day has passed', () => {
    expect(isQuiet(sensor(), NOW)).toBe(false);
    expect(isQuiet(frozen(), NOW)).toBe(true);
    expect(lastKnownText(sensor({ measured_at: minutesAgo(45) }), NOW)).toBe('Last known, 45 min ago');
    expect(lastKnownText(sensor({ measured_at: minutesAgo(3 * 60) }), NOW)).toBe('Last known, 3 h ago');
    expect(lastKnownText(sensor({ measured_at: minutesAgo(2 * 24 * 60 + 30) }), NOW)).toBe('Last known, 2 days ago');
    expect(lastKnownText(sensor({ measured_at: null, latest_reading_timestamp: null }), NOW)).toBeNull();
  });
});
