/**
 * The sensor screens' data, on the reports data layer (`useReportQuery`): shown from the
 * last answer (also the one kept on the phone) while it is asked again, never mixed between
 * sensors or periods, and asked again on a return after 30 s. A minute timer
 * (`useSensorLiveUpdates`) marks the latest values out of date (`invalidateSensorQueries`).
 */
import { useReportQuery, type ReportQuery } from '@/features/reports/useReportQuery';
import { sensorKeys } from '@/features/sensors/sensorQueries';
import { getDevice, getSnapshot } from '@/services/sensor-service';
import { getSensorHistory } from '@/services/sensor-history-service';
import type { SensorDeviceResult, SensorPollingResponse } from '@/types/sensor.types';
import type { SensorHistoryData, SensorHistoryPeriod } from '@/types/sensor-history.types';
import { t as tr } from '@/i18n';

/** Every sensor with its latest values. */
export function useSensorSnapshot(): ReportQuery<SensorPollingResponse> {
  return useReportQuery<SensorPollingResponse>({
    key: sensorKeys.snapshot,
    fetch: getSnapshot,
    fallbackError: tr('sensors.list.loadError'),
  });
}

/** One sensor; `data.device` is null when the facility has no such sensor. */
export function useSensorDevice(id: string | undefined): ReportQuery<SensorDeviceResult> {
  return useReportQuery<SensorDeviceResult>({
    key: sensorKeys.device(id ?? ''),
    fetch: () => getDevice(id ?? ''),
    fallbackError: tr('sensors.detail.deviceError'),
    enabled: Boolean(id),
  });
}

/**
 * One sensor's history over the period, asked for beside the sensor itself. The minute timer
 * does not mark it out of date (`invalidateSensorQueries`).
 */
export function useSensorHistory(id: string | undefined, days: SensorHistoryPeriod): ReportQuery<SensorHistoryData> {
  return useReportQuery<SensorHistoryData>({
    key: sensorKeys.history(id ?? '', days),
    fetch: () => getSensorHistory(id ?? '', days),
    fallbackError: tr('sensors.detail.historyError'),
    enabled: Boolean(id),
  });
}
