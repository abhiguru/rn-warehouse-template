/**
 * The status of a sensor, for the list and the detail screen alike (docs/STYLE_GUIDE.md §3.5).
 *
 * Staleness is the absence of events: nothing arrives to say a sensor went quiet. So every
 * rule that depends on time takes `now`, and the screens pass the minute tick
 * (src/features/sensors/useMinuteTick.ts): a sensor turns "No recent data" on screen once its
 * threshold has passed, without a request. The server's own verdict (`is_stale`,
 * `connectivity_status`) still counts: the phone only adds what time has done since.
 *
 * One sensor is described by one status at a time: the most severe of its health, its
 * connection, its values not changing, its temperature against its limits and its battery.
 * *
 * Pure functions apart from the words, which are looked up when called.
 */
import type { StatusKind } from '@/components/ui/StatusTag';
import type { SensorChartThreshold } from '@/components/sensors/SensorHistoryChart';
import type { SensorDevice } from '@/types/sensor.types';
import { formatRelativeTime, formatTemperature } from '@/utils/formatters';
import { t as tr } from '@/i18n';

export interface SensorStatus {
  kind: StatusKind;
  label: string;
}

/** The threshold when a sensor has none set. */
export const DEFAULT_STALENESS_MINUTES = 30;

const SEVERITY: Record<StatusKind, number> = {
  negative: 4,
  critical: 3,
  informative: 2,
  neutral: 1,
  positive: 0,
};

const mostSevere = (statuses: SensorStatus[]): SensorStatus =>
  statuses.reduce((worst, status) => (SEVERITY[status.kind] > SEVERITY[worst.kind] ? status : worst));

const toTime = (value: string | null | undefined): number | undefined => {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
};

/** When the latest values were observed: `measured_at`, or the older servers' latest reading. */
export const readingTime = (device: SensorDevice): string | null =>
  device.measured_at ?? device.latest_reading_timestamp ?? null;

/** The last time anything was heard from the sensor, for "Last seen". */
export const lastSeenTime = (device: SensorDevice): string | null =>
  device.last_seen_at ?? device.last_reading_at ?? readingTime(device);

/** The sensor's hub cannot be reached, or the server says the sensor is offline. */
export function isOffline(device: SensorDevice): boolean {
  return device.connectivity_status === 'OFFLINE' || device.hub_online === false;
}

/**
 * When the sensor was last heard from, for staleness: `last_seen_at` (the server's own
 * rule; a heartbeat without new values refreshes it), else when the latest values were
 * observed (`measured_at`, or the older servers' latest reading).
 */
const staleTime = (device: SensorDevice): string | null => device.last_seen_at ?? readingTime(device);

/**
 * Nothing heard within the sensor's threshold: the server says so, or the sensor was last
 * heard from (`last_seen_at`, else `measured_at`) longer than `staleness_threshold_minutes`
 * before `now`. A sensor that never reported has no recent data either.
 */
export function isStale(device: SensorDevice, now: number): boolean {
  if (device.is_stale || device.connectivity_status === 'STALE') return true;
  const at = toTime(staleTime(device));
  if (at === undefined) return true;
  const minutes = device.staleness_threshold_minutes > 0 ? device.staleness_threshold_minutes : DEFAULT_STALENESS_MINUTES;
  return now - at > minutes * 60_000;
}

const DAY_MS = 86_400_000;

/**
 * The latest values have stopped changing while the sensor is still heard from: the server
 * says so (`values_stale`), or the values were observed longer than the threshold before
 * `now`. A sensor that is offline or has no recent data is not this: that is its connection.
 */
export function valuesNotChanging(device: SensorDevice, now: number): boolean {
  if (isOffline(device) || isStale(device, now)) return false;
  if (device.values_stale === true) return true;
  const at = toTime(readingTime(device));
  if (at === undefined) return false;
  const minutes = device.staleness_threshold_minutes > 0 ? device.staleness_threshold_minutes : DEFAULT_STALENESS_MINUTES;
  return now - at > minutes * 60_000;
}

/** The latest values cannot be taken as current: offline, no recent data, or not changing. */
export const isQuiet = (device: SensorDevice, now: number): boolean =>
  isOffline(device) || isStale(device, now) || valuesNotChanging(device, now);

/**
 * "Last known, 2 days ago": when the figures on screen were observed, for a quiet sensor.
 * A day or more is counted in days (the app's relative time stops at hours); null when the
 * sensor never reported.
 */
export function lastKnownText(device: SensorDevice, now: number): string | null {
  const at = readingTime(device);
  if (!at || toTime(at) === undefined) return null;
  const time = formatRelativeTime(
    at,
    date => tr('sensors.detail.daysAgo', { count: Math.max(1, Math.floor((now - date.getTime()) / DAY_MS)) }),
    new Date(now),
  );
  return tr('sensors.detail.lastKnown', { time });
}

/**
 * Whether the latest temperature is outside the sensor's limits: HIGH (too warm), LOW (too
 * cold), or null when it is within them, the sensor is quiet (its temperature is not current)
 * or the server sends no flag (an older server: not out of range).
 */
export function temperatureState(device: SensorDevice, now: number): 'HIGH' | 'LOW' | null {
  if (isQuiet(device, now)) return null;
  return device.temperature_alert === 'HIGH' || device.temperature_alert === 'LOW' ? device.temperature_alert : null;
}

/** "Too warm" or "Too cold" as a tag, or null. */
export function temperatureTag(device: SensorDevice, now: number): SensorStatus | null {
  const state = temperatureState(device, now);
  if (state === 'HIGH') return { kind: 'negative', label: tr('sensors.status.tooWarm') };
  if (state === 'LOW') return { kind: 'negative', label: tr('sensors.status.tooCold') };
  return null;
}

/** Health: healthy / warning / critical as positive / critical / negative. */
export function healthStatus(health: SensorDevice['health_status']): SensorStatus {
  switch (health) {
    case 'healthy':
      return { kind: 'positive', label: tr('sensors.status.sensorOk') };
    case 'warning':
      return { kind: 'critical', label: tr('sensors.status.warning') };
    case 'critical':
      return { kind: 'negative', label: tr('sensors.status.critical') };
    default:
      return { kind: 'neutral', label: tr('common.unknown') };
  }
}

const batteryCritical = (device: SensorDevice): boolean => device.battery_status === 'CRITICAL';
const batteryLow = (device: SensorDevice): boolean =>
  !batteryCritical(device) && (device.battery_status === 'LOW' || device.battery_low === true);

/** The battery as a tag beside a sensor, or null when it is fine or not known. */
export function batteryTag(device: SensorDevice): SensorStatus | null {
  if (batteryCritical(device)) return { kind: 'negative', label: tr('sensors.status.batteryCritical') };
  if (batteryLow(device)) return { kind: 'critical', label: tr('sensors.status.batteryLow') };
  return null;
}

/** The battery as a fact on the detail screen: always a value. */
export function batteryFact(device: SensorDevice): SensorStatus {
  if (batteryCritical(device)) return { kind: 'negative', label: tr('sensors.battery.critical') };
  if (batteryLow(device)) return { kind: 'critical', label: tr('sensors.battery.low') };
  if (device.battery_status === 'OK' || device.battery_low === false) return { kind: 'positive', label: tr('sensors.battery.good') };
  return { kind: 'neutral', label: tr('common.unknown') };
}

/** The connection: offline, no recent data, online or unknown, in that order. */
export function connectionStatus(device: SensorDevice, now: number): SensorStatus {
  if (isOffline(device)) return { kind: 'negative', label: tr('sensors.status.offline') };
  if (isStale(device, now)) return { kind: 'critical', label: tr('sensors.status.noRecentData') };
  if (device.connectivity_status === 'ONLINE') return { kind: 'positive', label: tr('sensors.status.online') };
  return { kind: 'neutral', label: tr('common.unknown') };
}

/**
 * The one status a sensor shows, on its row and at the top of its page: the most severe of
 * health, connection, values not changing, temperature and battery; of two equally severe,
 * the first of those. The server's health says "offline" for a sensor that is offline or
 * quiet (the connection names which) and "warning" for a low battery or values not changing
 * (those name themselves), so those two add a tag of their own only when nothing else says why.
 */
export function rowStatus(device: SensorDevice, now: number): SensorStatus {
  const offline = isOffline(device);
  const stale = !offline && isStale(device, now);
  const notChanging = valuesNotChanging(device, now);
  const battery = batteryTag(device);
  const temperature = temperatureTag(device, now);
  const candidates: SensorStatus[] = [];
  if (device.health_status === 'offline') {
    if (!offline && !stale) candidates.push(healthStatus('unknown'));
  } else if (device.health_status !== 'warning' || (!notChanging && !battery)) {
    candidates.push(healthStatus(device.health_status));
  }
  if (offline) candidates.push({ kind: 'negative', label: tr('sensors.status.offline') });
  else if (stale) candidates.push({ kind: 'critical', label: tr('sensors.status.noRecentData') });
  if (notChanging) candidates.push({ kind: 'critical', label: tr('sensors.status.valuesNotChanging') });
  if (temperature) candidates.push(temperature);
  if (battery) candidates.push(battery);
  return mostSevere(candidates);
}

export type SensorAlertKind = 'offline' | 'stale' | 'tooWarm' | 'tooCold' | 'batteryCritical' | 'batteryLow';

/** One line of "Needs attention": what is wrong, how many sensors, and which. */
export interface SensorAlert {
  kind: SensorAlertKind;
  tone: StatusKind;
  /** "2 offline", "1 with no recent data". */
  label: string;
  devices: { id: string; name: string }[];
}

/**
 * What needs attention, most serious first; a kind with no sensor is left out. A sensor
 * whose hub is offline is counted as offline, not also as having no recent data; a
 * critical battery is not also counted as low. A quiet sensor is not too warm or too cold:
 * its temperature is not current.
 */
export function sensorAlerts(devices: readonly SensorDevice[], now: number): SensorAlert[] {
  const pick = (test: (device: SensorDevice) => boolean) =>
    devices.filter(test).map(device => ({ id: device.id, name: device.device_name }));
  const lines: [SensorAlertKind, StatusKind, ReturnType<typeof pick>, (count: number) => string][] = [
    ['offline', 'negative', pick(isOffline), count => tr('sensors.list.offlineCount', { count })],
    ['stale', 'critical', pick(device => !isOffline(device) && isStale(device, now)), count => tr('sensors.list.staleCount', { count })],
    ['tooWarm', 'negative', pick(device => temperatureState(device, now) === 'HIGH'), count => tr('sensors.list.tooWarmCount', { count })],
    ['tooCold', 'negative', pick(device => temperatureState(device, now) === 'LOW'), count => tr('sensors.list.tooColdCount', { count })],
    ['batteryCritical', 'negative', pick(batteryCritical), count => tr('sensors.list.criticalBatteryCount', { count })],
    ['batteryLow', 'critical', pick(batteryLow), count => tr('sensors.list.lowBatteryCount', { count })],
  ];
  return lines
    .filter(([, , found]) => found.length > 0)
    .map(([kind, tone, found, label]) => ({ kind, tone, label: label(found.length), devices: found }));
}

export interface SensorKpis {
  total: number;
  /** Reachable and reporting within the threshold. */
  online: number;
  /** Offline or quiet: every sensor that is not online. */
  noRecentData: number;
  /** Battery low or critical. */
  batteryLow: number;
}

/** The figures over the list, counted from the sensors at `now`. */
export function sensorKpis(devices: readonly SensorDevice[], now: number): SensorKpis {
  const online = devices.filter(device => !isOffline(device) && !isStale(device, now)).length;
  return {
    total: devices.length,
    online,
    noRecentData: devices.length - online,
    batteryLow: devices.filter(device => batteryTag(device) !== null).length,
  };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The sensor's temperature limits (`alert_config`), as the chart's dashed lines; none when it has none. */
export function chartThresholds(device: SensorDevice): SensorChartThreshold[] {
  const config = device.alert_config;
  if (!config) return [];
  const lines: SensorChartThreshold[] = [];
  if (finite(config.temperature_max)) {
    lines.push({ value: config.temperature_max, level: 'negative', label: tr('sensors.detail.thresholdMax', { value: formatTemperature(config.temperature_max) }) });
  }
  if (finite(config.temperature_min)) {
    lines.push({ value: config.temperature_min, level: 'negative', label: tr('sensors.detail.thresholdMin', { value: formatTemperature(config.temperature_min) }) });
  }
  return lines;
}
