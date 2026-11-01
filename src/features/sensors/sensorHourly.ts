/**
 * Long sensor history from the hourly summary (backend migration 136, `get_sensor_hourly`): the ranges of 6 months,
 * 1 year and 2 years, and the CSV of a range. Pure functions: the calls are in src/services/sensor-hourly-service.ts.
 *
 * The server holds 24 months of hours (raw readings 90 days) and answers at most 400 days per call, so a range is cut
 * into calls of `HOURLY_CHUNK_DAYS`. The chart cannot draw 17,000 hourly points: they are cut into days (up to 6
 * months) or weeks, keeping each bucket's average (weighted by the readings behind it), lowest and highest.
 */
import type { SensorHistoryData, SensorHistoryPeriod, SensorHistoryReading, SensorHistorySummary } from '@/types/sensor-history.types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The server refuses a range of more than 400 days (RANGE_TOO_LARGE); a call asks for a little less. */
export const HOURLY_CHUNK_DAYS = 399;

/** The periods drawn from the hourly summary (6 months, and 1 year and 2 years once the server has it). */
export const LONG_PERIODS: readonly SensorHistoryPeriod[] = [183, 365, 730];

/** The periods the chips offer, shortest first. */
export const ALL_PERIODS: readonly SensorHistoryPeriod[] = [7, 14, 30, 90, 183, 365, 730];

/**
 * The period chips for a sensor with `daysOfData` days of history: 7 days always, the longer ones once the data covers
 * them. A backend seen not to have the hourly summary (`hourlyMissing`, migration 136) offers neither 6 months nor 2 years
 * (the year is still read the older way).
 */
export function selectablePeriods(daysOfData: number, hourlyMissing: boolean): SensorHistoryPeriod[] {
  return ALL_PERIODS.filter(days => (days <= daysOfData || days === 7) && !(hourlyMissing && (days === 183 || days === 730)));
}

/** Whether a period is read from the hourly summary: 6 months or more. */
export const isLongPeriod = (days: number): boolean => days >= 183;

/** One row of `get_sensor_hourly`: the figures of one UTC hour. A figure no reading of the hour carried is null. */
export interface HourlyRow {
  hour: string;
  sample_count: number;
  temperature_min: number | null;
  temperature_max: number | null;
  temperature_avg: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_avg: number | null;
}

export interface TimeRange {
  fromMs: number;
  toMs: number;
}

/** The range of the last `days` days, ending at `nowMs`. */
export const rangeOfLastDays = (days: number, nowMs: number): TimeRange => ({ fromMs: nowMs - days * DAY_MS, toMs: nowMs });

/**
 * The range cut into consecutive calls of at most `chunkDays` days, oldest first: each begins where the one before
 * ended (the server includes `p_from` and leaves out `p_to`, so no hour is read twice or missed).
 */
export function chunkRange(range: TimeRange, chunkDays: number = HOURLY_CHUNK_DAYS): TimeRange[] {
  const chunks: TimeRange[] = [];
  if (!(range.toMs > range.fromMs) || !(chunkDays > 0)) return chunks;
  const size = chunkDays * DAY_MS;
  for (let fromMs = range.fromMs; fromMs < range.toMs; fromMs += size) {
    chunks.push({ fromMs, toMs: Math.min(fromMs + size, range.toMs) });
  }
  return chunks;
}

/** The rows of several calls as one list, oldest hour first, an hour that came twice kept once. */
export function mergeHourlyRows(lists: readonly HourlyRow[][]): HourlyRow[] {
  const byHour = new Map<string, HourlyRow>();
  for (const list of lists) for (const row of list) byHour.set(row.hour, row);
  return [...byHour.values()].sort((a, b) => Date.parse(a.hour) - Date.parse(b.hour));
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

interface Accumulator {
  weight: number;
  sum: number;
  min: number | null;
  max: number | null;
}
const emptyAccumulator = (): Accumulator => ({ weight: 0, sum: 0, min: null, max: null });
function add(acc: Accumulator, weight: number, avg: number | null, min: number | null, max: number | null): void {
  if (avg !== null && Number.isFinite(avg) && weight > 0) {
    acc.weight += weight;
    acc.sum += avg * weight;
  }
  if (min !== null && Number.isFinite(min)) acc.min = acc.min === null ? min : Math.min(acc.min, min);
  if (max !== null && Number.isFinite(max)) acc.max = acc.max === null ? max : Math.max(acc.max, max);
}
const averageOf = (acc: Accumulator): number | null => (acc.weight > 0 ? round2(acc.sum / acc.weight) : null);

/** The days a bucket of the chart spans: a day up to 6 months, a week beyond. */
export const bucketDaysFor = (periodDays: number): number => (periodDays <= 183 ? 1 : 7);

/** The server's aggregation words for those buckets (`getAggregationLabel`). */
export const intervalFor = (bucketDays: number): string => (bucketDays === 1 ? '1 day' : '1 week');

/**
 * The hourly rows as chart points of `bucketDays` days (UTC days counted from 1 Jan 1970, so a week is the same week
 * on every phone): the average is weighted by the readings of each hour, the lowest and highest are the extremes.
 */
export function bucketHourlyRows(rows: readonly HourlyRow[], bucketDays: number): SensorHistoryReading[] {
  const size = Math.max(1, bucketDays) * DAY_MS;
  const buckets = new Map<number, { temperature: Accumulator; humidity: Accumulator }>();
  for (const row of rows) {
    const at = Date.parse(row.hour);
    if (!Number.isFinite(at)) continue;
    const start = Math.floor(at / size) * size;
    const bucket = buckets.get(start) ?? { temperature: emptyAccumulator(), humidity: emptyAccumulator() };
    const weight = Number(row.sample_count) || 0;
    add(bucket.temperature, weight, row.temperature_avg, row.temperature_min, row.temperature_max);
    add(bucket.humidity, weight, row.humidity_avg, row.humidity_min, row.humidity_max);
    buckets.set(start, bucket);
  }
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map(start => {
      const { temperature, humidity } = buckets.get(start)!;
      return {
        timestamp: new Date(start).toISOString(),
        temperature: averageOf(temperature),
        humidity: averageOf(humidity),
        temperature_min: temperature.min,
        temperature_max: temperature.max,
        humidity_min: humidity.min,
        humidity_max: humidity.max,
      };
    });
}

/** The summary of the whole range: averages weighted by readings, the lowest and highest of all hours. */
export function summariseHourlyRows(rows: readonly HourlyRow[]): SensorHistorySummary & { raw_reading_count: number } {
  const temperature = emptyAccumulator();
  const humidity = emptyAccumulator();
  let total = 0;
  for (const row of rows) {
    const weight = Number(row.sample_count) || 0;
    total += weight;
    add(temperature, weight, row.temperature_avg, row.temperature_min, row.temperature_max);
    add(humidity, weight, row.humidity_avg, row.humidity_min, row.humidity_max);
  }
  return {
    avg_temperature: averageOf(temperature),
    min_temperature: temperature.min,
    max_temperature: temperature.max,
    avg_humidity: averageOf(humidity),
    min_humidity: humidity.min,
    max_humidity: humidity.max,
    total_readings: total,
    raw_reading_count: total,
  };
}

/** The history screen's data for a long period, from the hourly rows. */
export function hourlyHistoryData(
  device: { id: string; name: string; location: string },
  periodDays: number,
  rows: readonly HourlyRow[]
): SensorHistoryData {
  const bucketDays = bucketDaysFor(periodDays);
  const { raw_reading_count, ...summary } = summariseHourlyRows(rows);
  return {
    device_id: device.id,
    device_name: device.name,
    location: device.location,
    period_days: periodDays,
    aggregation_interval: intervalFor(bucketDays),
    readings: bucketHourlyRows(rows, bucketDays),
    summary,
    raw_reading_count,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** The header of the export, in English whatever the app's language (it is read by other programs). */
export const SENSOR_CSV_HEADER = 'device,hour_utc,count,temp_min,temp_max,temp_avg,humidity_min,humidity_max,humidity_avg';

/**
 * One CSV field (RFC 4180): quoted when it holds a comma, a quote, a line break or a space at either end, with quotes
 * doubled. A text that a spreadsheet would read as a formula (it begins with =, +, - or @, or a tab or return) gets a
 * leading apostrophe, so a device name typed as `=HYPERLINK(...)` is shown, not run. Numbers are not texts.
 */
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || /^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const csvNumber = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

/** The hour as an ISO instant in UTC, as the server gave it when it cannot be read. */
const hourUtc = (hour: string): string => {
  const at = Date.parse(hour);
  return Number.isFinite(at) ? new Date(at).toISOString() : hour;
};

/** The export of a range: the header and one line per hour with readings, lines ended by CRLF. */
export function buildSensorCsv(deviceName: string, rows: readonly HourlyRow[]): string {
  const device = csvText(deviceName);
  const lines = rows.map(row =>
    [
      device,
      csvText(hourUtc(row.hour)),
      csvNumber(row.sample_count),
      csvNumber(row.temperature_min),
      csvNumber(row.temperature_max),
      csvNumber(row.temperature_avg),
      csvNumber(row.humidity_min),
      csvNumber(row.humidity_max),
      csvNumber(row.humidity_avg),
    ].join(',')
  );
  return [SENSOR_CSV_HEADER, ...lines].join('\r\n') + '\r\n';
}
