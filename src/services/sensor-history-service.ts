// Sensor Historical Data Service

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  SensorHistoryPeriod,
  SensorHistoryResponse,
} from '@/types/sensor-history.types';
import { createLogger } from '@/utils/logger';

const sensorHistoryLogger = createLogger('SensorHistoryService');

/**
 * Fetch historical sensor data for a specific device
 * @param deviceId - The sensor device UUID
 * @param daysBack - Number of days to look back (7, 14, 30, 90, or 365)
 * @returns Historical readings with aggregated data and summary statistics
 */
export async function getSensorHistory(
  deviceId: string,
  daysBack: SensorHistoryPeriod = 7
): Promise<SensorHistoryResponse> {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    sensorHistoryLogger.debug('Fetching sensor history', { deviceId, daysBack });

    const startTime = Date.now();

    // Set a timeout for RPC calls (30 seconds)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RPC request timed out after 30 seconds')), 30000)
    );

    const rpcPromise = authenticatedClient.rpc('get_sensor_history', {
      p_device_id: deviceId,
      p_days_back: daysBack,
    });

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    sensorHistoryLogger.debug(`RPC call completed in ${duration}ms`);

    if (error) {
      sensorHistoryLogger.error('RPC error:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch sensor history',
        error: error.message,
      };
    }

    if (!data || !data.success) {
      const errorMsg = data?.error || 'No data returned from sensor history';
      sensorHistoryLogger.warn('RPC returned unsuccessful response', { error: errorMsg });
      return {
        success: false,
        message: errorMsg,
        error: data?.error,
      };
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
      message: 'Sensor history fetched successfully',
    };
  } catch (error) {
    sensorHistoryLogger.error('Exception:', error);
    return {
      success: false,
      message: 'Failed to fetch sensor history',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get human-readable label for aggregation interval
 */
export function getAggregationLabel(interval: string): string {
  const labels: Record<string, string> = {
    '1 hour': 'Hourly averages',
    '2 hours': '2-hour averages',
    '4 hours': '4-hour averages',
    '1 day': 'Daily averages',
    '1 week': 'Weekly averages',
  };
  return labels[interval] || interval;
}

/**
 * Get period label for display
 */
export function getPeriodLabel(days: SensorHistoryPeriod): string {
  const labels: Record<SensorHistoryPeriod, string> = {
    7: '7 Days',
    14: '14 Days',
    30: '30 Days',
    90: '90 Days',
    365: '1 Year',
  };
  return labels[days];
}
