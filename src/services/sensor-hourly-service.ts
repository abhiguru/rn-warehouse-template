/**
 * Sensor history from the hourly summary (backend migration 136, `get_sensor_hourly`): the long ranges of the sensor
 * screen and the CSV export. A call answers at most 400 days, so a range is asked for in chunks, oldest first.
 *
 * A backend older than 136 has no such function: PostgREST answers PGRST202, which is recorded
 * (`facilityRpcSupport`) so the screen hides the long ranges and the export, and the result says `unsupported`.
 * The server's own refusals (a 200 with `success:false`) are told by their `error_code`:
 * INVALID_RANGE, RANGE_TOO_LARGE and DEVICE_NOT_FOUND; a person without the role gets PostgREST's 42501.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { isMissingFunction, noteRpcSupport, rpcSupport } from '@/config/facilityRpcSupport';
import { chunkRange, hourlyHistoryData, mergeHourlyRows, rangeOfLastDays, type HourlyRow, type TimeRange } from '@/features/sensors/sensorHourly';
import { getSensorHistory } from '@/services/sensor-history-service';
import type { SensorHistoryResponse } from '@/types/sensor-history.types';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { ACCESS_REFUSED_CODE, isAccessRefusal, rpcRefusal } from '@/utils/rpcRefusal';
import { serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';

const log = createLogger('SensorHourlyService');

export interface HourlyDevice {
  id: string;
  name: string;
  location: string;
}

export type HourlyResult =
  | { success: true; device: HourlyDevice; rows: HourlyRow[] }
  | {
      success: false;
      /** The backend has no `get_sensor_hourly` (older than migration 136). */
      unsupported?: boolean;
      /** The server's `error_code`, or the access refusal's code. */
      code?: string;
      /** The reason, in the app's language. */
      message: string;
    };

const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function readRow(raw: unknown): HourlyRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const hour = text(r.hour);
  if (!Number.isFinite(Date.parse(hour))) return null;
  return {
    hour,
    sample_count: num(r.sample_count) ?? 0,
    temperature_min: num(r.temperature_min),
    temperature_max: num(r.temperature_max),
    temperature_avg: num(r.temperature_avg),
    humidity_min: num(r.humidity_min),
    humidity_max: num(r.humidity_max),
    humidity_avg: num(r.humidity_avg),
  };
}

/** The reason of one of the server's refusals, in the app's words; the server's sentence is never shown. */
function refusalMessage(code: string | undefined, serverSentence: string | undefined): string {
  switch (code) {
    case 'INVALID_RANGE':
      return t('sensors.hourly.invalidRange');
    case 'RANGE_TOO_LARGE':
      return t('sensors.hourly.rangeTooLarge');
    case 'DEVICE_NOT_FOUND':
      return t('sensors.hourly.deviceNotFound');
    default:
      return serverText(serverSentence, t('sensors.hourly.failed'));
  }
}

async function readChunk(
  deviceId: string,
  range: TimeRange
): Promise<{ ok: true; device: Partial<HourlyDevice>; rows: HourlyRow[] } | Extract<HourlyResult, { success: false }>> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_sensor_hourly', {
    p_device_id: deviceId,
    p_from: new Date(range.fromMs).toISOString(),
    p_to: new Date(range.toMs).toISOString(),
  });
  if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));

  if (error) {
    if (isMissingFunction(error)) {
      noteRpcSupport('sensorHourly', false);
      return { success: false, unsupported: true, message: t('sensors.hourly.unsupported') };
    }
    const code = error.code === '42501' ? '42501' : isAccessRefusal({ text: error.message, code: error.code }) ? ACCESS_REFUSED_CODE : error.code;
    return { success: false, code, message: serverText(error.message, t('sensors.hourly.failed')) };
  }
  const refusal = rpcRefusal(data);
  if (refusal) {
    const code = isAccessRefusal(refusal) ? (refusal.code === '42501' ? '42501' : ACCESS_REFUSED_CODE) : refusal.code;
    return { success: false, code, message: refusalMessage(refusal.code, refusal.text) };
  }
  const body = data?.data;
  if (!body || !Array.isArray(body.hours)) return { success: false, message: t('sensors.hourly.failed') };
  noteRpcSupport('sensorHourly', true);
  const rows = (body.hours as unknown[]).map(readRow).filter((row): row is HourlyRow => row !== null);
  return { ok: true, device: { id: text(body.device_id) || deviceId, name: text(body.device_name), location: text(body.location) }, rows };
}

/**
 * The hourly rows of a device over `range`, in calls of at most 400 days, oldest first. The first chunk that fails ends
 * the read: a half range is never returned as if it were all.
 */
export async function getSensorHourlyRows(deviceId: string, range: TimeRange): Promise<HourlyResult> {
  try {
    const lists: HourlyRow[][] = [];
    let device: HourlyDevice = { id: deviceId, name: '', location: '' };
    for (const chunk of chunkRange(range)) {
      const answer = await readChunk(deviceId, chunk);
      if (!('ok' in answer)) return answer;
      lists.push(answer.rows);
      device = { id: device.id, name: answer.device.name || device.name, location: answer.device.location || device.location };
    }
    // A range the server would call invalid (not after its start) is not sent at all.
    if (lists.length === 0) return { success: false, code: 'INVALID_RANGE', message: t('sensors.hourly.invalidRange') };
    return { success: true, device, rows: mergeHourlyRows(lists) };
  } catch (error) {
    log.error('Hourly history failed');
    // A change of session or server ends the read; nothing of it is shown.
    return { success: false, message: error instanceof AppError ? error.message : t('sensors.hourly.failed') };
  }
}

/**
 * The history screen's data for a long period (6 months, 1 year, 2 years), shaped for `useReportQuery`. On a backend
 * without `get_sensor_hourly` the year falls back to the older `get_sensor_history`; the other periods have no older
 * source and are refused (the screen does not offer them once the backend is known to be older).
 */
export async function getSensorHistoryLong(deviceId: string, days: 183 | 365 | 730, nowMs: number = Date.now()): Promise<SensorHistoryResponse> {
  // A backend already seen not to have the hourly summary: the year is read the older way at once.
  if (days === 365 && rpcSupport('sensorHourly') === false) return getSensorHistory(deviceId, 365);
  const result = await getSensorHourlyRows(deviceId, rangeOfLastDays(days, nowMs));
  if (result.success) {
    return { success: true, data: hourlyHistoryData(result.device, days, result.rows), message: t('errors.sensor.historyFetched') };
  }
  if (result.unsupported && days === 365) return getSensorHistory(deviceId, 365);
  return { success: false, message: result.message, error: result.code };
}
