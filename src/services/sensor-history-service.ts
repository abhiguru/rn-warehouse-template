// Sensor Historical Data Service

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  SensorHistoryPeriod,
  SensorHistoryResponse,
} from '@/types/sensor-history.types';
import { createLogger } from '@/utils/logger';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { ACCESS_REFUSED_CODE, isAccessRefusal, rpcRefusal, type RpcRefusal } from '@/utils/rpcRefusal';

const sensorHistoryLogger = createLogger('SensorHistoryService');

/** The code of a failure: an access refusal always has one that `isAccessRefusal` reads. */
function failureCode(refusal: RpcRefusal): string | undefined {
  if (isAccessRefusal(refusal)) return refusal.code === '42501' ? refusal.code : ACCESS_REFUSED_CODE;
  return refusal.code;
}

/**
 * Fetch historical sensor data for a specific device. The answer is shaped for
 * `useReportQuery` (`ReportServiceResult`): a refusal carries a code `isAccessRefusal` reads.
 * @param deviceId - The sensor device UUID
 * @param daysBack - Number of days to look back (7, 14, 30, 90, or 365)
 * @returns Historical readings with aggregated data and summary statistics
 */
export async function getSensorHistory(
  deviceId: string,
  daysBack: SensorHistoryPeriod = 7
): Promise<SensorHistoryResponse> {
  const fallback = t('errors.sensor.historyFetchFailed');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const authenticatedClient = await getAuthenticatedClient();

    sensorHistoryLogger.debug('Fetching sensor history', { deviceId, daysBack });

    const startTime = Date.now();

    // Given up after 30 seconds; the timer is cleared when the answer comes.
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(t('errors.network.rpcTimedOut30'))), 30000);
    });

    const rpcPromise = authenticatedClient.rpc('get_sensor_history', {
      p_device_id: deviceId,
      p_days_back: daysBack,
    });

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    sensorHistoryLogger.debug(`RPC call completed in ${duration}ms`);

    if (error) {
      sensorHistoryLogger.error('RPC error:', error);
      const refusal = { text: error.message, code: error.code };
      return { success: false, message: serverText(error.message, fallback), error: failureCode(refusal) };
    }

    const refusal = rpcRefusal(data);
    if (refusal || !data?.data) {
      const errorMsg = serverText(refusal?.text, t('errors.sensor.historyNoData'));
      sensorHistoryLogger.warn('RPC returned unsuccessful response', { error: errorMsg });
      return { success: false, message: errorMsg, error: refusal ? failureCode(refusal) : undefined };
    }

    sensorHistoryLogger.debug('History data received:', {
      deviceName: data.data?.device_name,
      readingsCount: data.data?.readings?.length || 0,
      aggregationInterval: data.data?.aggregation_interval,
      periodDays: data.data?.period_days,
    });

    return {
      success: true,
      data: data.data,
      metadata: data.metadata,
      message: t('errors.sensor.historyFetched'),
    };
  } catch (error) {
    sensorHistoryLogger.error('Exception:', error);
    return {
      success: false,
      message: fallback,
      error: error instanceof Error ? error.message : t('errors.general.unknown'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get human-readable label for aggregation interval
 */
export function getAggregationLabel(interval: string): string {
  const labels: Record<string, string> = {
    '1 hour': t('errors.sensor.aggregation.hourly'),
    '2 hours': t('errors.sensor.aggregation.twoHours'),
    '4 hours': t('errors.sensor.aggregation.fourHours'),
    '1 day': t('errors.sensor.aggregation.daily'),
    '1 week': t('errors.sensor.aggregation.weekly'),
  };
  return labels[interval] || interval;
}

/**
 * Get period label for display (sentence case, guide §12.1)
 */
export function getPeriodLabel(days: SensorHistoryPeriod): string {
  const labels: Record<SensorHistoryPeriod, string> = {
    7: t('errors.sensor.period.days7'),
    14: t('errors.sensor.period.days14'),
    30: t('errors.sensor.period.days30'),
    90: t('errors.sensor.period.days90'),
    365: t('errors.sensor.period.year1'),
  };
  return labels[days];
}
