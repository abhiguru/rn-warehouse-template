import { useLiveUpdates } from '@/hooks/useLiveUpdates';
import { invalidateSensorQueries } from '@/features/sensors/sensorQueries';

/** Sensor values are re-read every 60 s: the bridge posts a reading at most once a minute. */
export const SENSOR_REFRESH_INTERVAL_MS = 60_000;

/**
 * Marks the sensor queries out of date every 60 s while a sensor screen is shown, the
 * app is in the foreground and the device is online, so the screen asks again. No
 * refresh on focus: the report query decides that itself on its return (`useReportQuery`).
 */
export function useSensorLiveUpdates(enabled = true): void {
  useLiveUpdates(invalidateSensorQueries, enabled, {
    refreshOnFocus: false,
    intervalMs: SENSOR_REFRESH_INTERVAL_MS,
  });
}
