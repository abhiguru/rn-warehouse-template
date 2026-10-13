import { useLiveUpdates } from '@/hooks/useLiveUpdates';
import { subscribeToSensorChanges } from '@/services/sensor-live-updates';
import { invalidateSensorQueries } from '@/features/sensors/sensorQueries';

/**
 * Follows `sensor_latest` while a sensor screen is shown, the app is in the foreground
 * and the device is online; a change marks the sensor queries out of date. No refresh on
 * focus: the report query decides that itself on its return (`useReportQuery`).
 */
export function useSensorLiveUpdates(enabled = true): void {
  useLiveUpdates(subscribeToSensorChanges, invalidateSensorQueries, enabled, { refreshOnFocus: false });
}
