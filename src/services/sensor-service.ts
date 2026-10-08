// Temperature/Humidity Sensor Service
// M3 Fix: Using executeRPC wrapper (imports added for future use; current method retains custom timeout/logging)

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  SensorPollingResponse,
  SensorServiceResponse,
} from '@/types/sensor.types';
import { createLogger } from '@/utils/logger';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

const sensorLogger = createLogger('SensorService');

export class SensorService {
  /**
   * Poll sensor data
   * @param sinceTimestamp - Optional timestamp to get only new readings since last poll
   * @returns Sensor polling response with devices, new readings, and dashboard
   */
  static async pollSensorData(
    sinceTimestamp?: string
  ): Promise<SensorServiceResponse<SensorPollingResponse>> {
    try {
      const authenticatedClient = await getAuthenticatedClient();

      sensorLogger.debug('Polling sensor data', { sinceTimestamp: sinceTimestamp || 'null' });

      const startTime = Date.now();

      // Set a timeout for RPC calls (30 seconds)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC request timed out after 30 seconds')), 30000)
      );

      const rpcPromise = authenticatedClient.rpc('get_sensor_polling_data', {
        p_since_timestamp: sinceTimestamp || null,
      });
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      sensorLogger.debug(`RPC call completed in ${duration}ms`);

      if (error) {
        sensorLogger.error('RPC error:', error);
        return {
          success: false,
          message: error.message || 'Failed to fetch sensor data',
          error: error.message,
        };
      }

      if (!data || !data.success) {
        sensorLogger.warn('RPC returned unsuccessful response');
        return {
          success: false,
          message: 'No data returned from sensor polling',
        };
      }

      sensorLogger.debug('Response data:', {
        deviceCount: data.devices?.length || 0,
        newReadingsCount: data.new_readings?.length || 0,
        pollTimestamp: data.poll_timestamp,
      });

      return {
        success: true,
        message: 'Sensor data fetched successfully',
        data: data as SensorPollingResponse,
      };
    } catch (error) {
      sensorLogger.error('Exception:', error);
      return {
        success: false,
        message: 'Failed to fetch sensor data',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
