/**
 * Temperature and humidity sensors: every sensor with its latest values, on the shared
 * report layout (docs/STYLE_GUIDE.md §14.10) so loading, failure, a kept copy and pull to
 * refresh look as they do in every report.
 *
 * Kept current by a timer: every minute while shown the list is marked out of date and
 * asked again behind the rows (useSensorLiveUpdates). Staleness is the absence
 * of changes, so the minute tick (useMinuteTick) redraws the figures, the alerts and the
 * rows from the time alone: a sensor turns "No recent data" without a request.
 */
import React, { useCallback, useMemo } from 'react';
import { ReportScaffold } from '@/components/reports';
import type { KPIItem } from '@/components/reports/KPIGrid';
import { SensorAlerts } from '@/components/sensors/SensorAlerts';
import { SensorRow } from '@/components/sensors/SensorRow';
import { STATUS_ICONS } from '@/components/ui';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { sensorAlerts, sensorKpis } from '@/features/sensors/sensorStatus';
import { useMinuteTick } from '@/features/sensors/useMinuteTick';
import { useSensorSnapshot } from '@/features/sensors/useSensorQueries';
import { useSensorLiveUpdates } from '@/hooks/useSensorLiveUpdates';
import { t as tr } from '@/i18n';
import type { SensorDevice } from '@/types/sensor.types';

const keyExtractor = (device: SensorDevice) => device.id;

export default function SensorsScreen() {
  const query = useSensorSnapshot();
  // A list that cannot be read has nothing for a change to refresh; "Try again" asks.
  useSensorLiveUpdates(query.phase !== 'error');
  const now = useMinuteTick();
  const devices = query.data?.devices;

  const kpis = useMemo<KPIItem[] | undefined>(() => {
    if (!devices) return undefined;
    const figures = sensorKpis(devices, now);
    return [
      { icon: 'thermometer', value: figures.total, label: tr('sensors.sensors'), variant: 'primary' },
      { icon: STATUS_ICONS.positive, value: figures.online, label: tr('sensors.status.online'), variant: 'success' },
      { icon: 'thermometer-off', value: figures.noRecentData, label: tr('sensors.status.noRecentData'), variant: figures.noRecentData > 0 ? 'warning' : 'neutral' },
      { icon: 'battery-alert-variant-outline', value: figures.batteryLow, label: tr('sensors.status.batteryLow'), variant: figures.batteryLow > 0 ? 'warning' : 'neutral' },
    ];
  }, [devices, now]);

  const alerts = useMemo(() => (devices ? sensorAlerts(devices, now) : []), [devices, now]);

  const renderRow = useCallback((device: SensorDevice) => <SensorRow device={device} now={now} />, [now]);

  return (
    <ReportScaffold<SensorDevice>
      title={tr('sensors.title')}
      // Pull to refresh is not offered to a screen reader: the header button is.
      actions={[{ icon: 'refresh', label: tr('sensors.refresh'), onPress: () => void query.refresh(), busy: query.isRefreshing }]}
      query={query}
      kpis={kpis}
      kpiPlaceholders={4}
      rows={devices ?? []}
      renderRow={renderRow}
      keyExtractor={keyExtractor}
      extraData={now}
      empty={{ icon: 'thermometer-off', title: tr('sensors.list.emptyTitle'), description: tr('sensors.list.emptyDescription') }}
      errorTitle={tr('sensors.somethingWentWrong')}
    >
      <SensorAlerts alerts={alerts} />
      {devices && devices.length > 0 ? <SectionHeader title={tr('sensors.sensors')} /> : null}
    </ReportScaffold>
  );
}
