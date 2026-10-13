import { subscribeToTableChanges } from '@/services/table-live-updates';

/** One row per sensor with its latest values; the bridge's ingestion updates it. */
export const SENSOR_LATEST_TABLE = 'sensor_latest';

/** Follows `public.sensor_latest` (see table-live-updates.ts for the rules every table shares). */
export function subscribeToSensorChanges(refresh: () => void | Promise<void>): () => void {
  return subscribeToTableChanges({ table: SENSOR_LATEST_TABLE, channel: 'warehouse-sensors' }, refresh);
}
