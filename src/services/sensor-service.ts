/**
 * Temperature and humidity sensors: what the facility holds now, for the list and for one
 * sensor. The answers are shaped for `useReportQuery` (src/features/reports/useReportQuery.ts):
 * a refusal carries a code that `isAccessRefusal` reads, so the screen drops what it showed.
 * The sensor screens re-read every minute while shown (src/hooks/useSensorLiveUpdates.ts), which
 * only marks these answers out of date; nothing here polls.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { ReportServiceResult } from '@/features/reports/useReportQuery';
import type {
  SensorDeviceResponse,
  SensorDeviceResult,
  SensorPollingResponse,
} from '@/types/sensor.types';
import { createLogger } from '@/utils/logger';
import { t } from '@/i18n';
import { rpcBody, rpcRefusal, isAccessRefusal, ACCESS_REFUSED_CODE, type RpcRefusal } from '@/utils/rpcRefusal';
import { serverText } from '@/utils/serverText';

const sensorLogger = createLogger('SensorService');

/** How long an RPC may take before the screen says it failed. */
const RPC_TIMEOUT_MS = 30_000;

/** The code of a failure: an access refusal always has one that `isAccessRefusal` reads. */
function failureCode(refusal: RpcRefusal): string | undefined {
  if (isAccessRefusal(refusal)) return refusal.code === '42501' ? refusal.code : ACCESS_REFUSED_CODE;
  return refusal.code;
}

/** A failed answer: the server's reason in the app's language, and its code. */
function failed(refusal: RpcRefusal, fallback: string): ReportServiceResult<never> {
  return { success: false, message: serverText(refusal.text, fallback), error: failureCode(refusal) };
}

/**
 * One RPC, given up after 30 s. The timer is cleared when the answer comes, so nothing is
 * left counting down behind a screen that only listens for changes.
 */
async function callRpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  const client = await getAuthenticatedClient();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(t('errors.network.rpcTimedOut30'))), RPC_TIMEOUT_MS);
  });
  try {
    const startTime = Date.now();
    const { data, error } = await Promise.race([client.rpc(name, args), timeout]);
    sensorLogger.debug(`${name} completed in ${Date.now() - startTime}ms`);
    return { data, error };
  } finally {
    clearTimeout(timer);
  }
}

/** Every sensor with its latest values and status (get_sensor_polling_data, everything). */
export async function getSnapshot(): Promise<ReportServiceResult<SensorPollingResponse>> {
  const fallback = t('errors.sensor.fetchFailed');
  try {
    const { data, error } = await callRpc('get_sensor_polling_data', { p_since_timestamp: null });
    if (error) {
      sensorLogger.error('RPC error:', error);
      return failed({ text: error.message, code: error.code }, fallback);
    }
    const refusal = rpcRefusal(data);
    if (refusal) {
      sensorLogger.warn('Sensor data refused', { code: refusal.code });
      return failed(refusal, fallback);
    }
    const body = rpcBody(data) as SensorPollingResponse | undefined;
    if (!body || !Array.isArray(body.devices)) {
      sensorLogger.warn('RPC returned no sensor data');
      return { success: false, message: t('errors.sensor.noData') };
    }
    sensorLogger.debug('Sensor data', { deviceCount: body.devices.length });
    return { success: true, data: body };
  } catch (error) {
    sensorLogger.error('Exception:', error);
    return { success: false, message: fallback, error: error instanceof Error ? error.message : undefined };
  }
}

/**
 * One sensor with its hub and first reading (get_sensor_device). A sensor the facility
 * does not have is an answer, not a failure: `device` is null.
 */
export async function getDevice(deviceId: string): Promise<ReportServiceResult<SensorDeviceResult>> {
  const fallback = t('errors.sensor.fetchFailed');
  try {
    const { data, error } = await callRpc('get_sensor_device', { p_device_id: deviceId });
    if (error) {
      sensorLogger.error('RPC error:', error);
      return failed({ text: error.message, code: error.code }, fallback);
    }
    const body = rpcBody(data) as SensorDeviceResponse | undefined;
    if (body?.success === false && body.error_code === 'DEVICE_NOT_FOUND') {
      return { success: true, data: { device: null } };
    }
    const refusal = rpcRefusal(data);
    if (refusal) {
      sensorLogger.warn('Sensor refused', { code: refusal.code });
      return failed(refusal, fallback);
    }
    if (!body?.data) {
      sensorLogger.warn('RPC returned no sensor');
      return { success: false, message: t('errors.sensor.noData') };
    }
    return { success: true, data: { device: body.data } };
  } catch (error) {
    sensorLogger.error('Exception:', error);
    return { success: false, message: fallback, error: error instanceof Error ? error.message : undefined };
  }
}
