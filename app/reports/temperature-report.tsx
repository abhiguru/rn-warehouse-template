/**
 * Temperature report (WH-157): one sensor's readings for a period, as an English PDF made on the server.
 *
 * Who: administrators, supervisors, staff and customer accounts, for every sensor of the facility, where the facility has
 * sensors on (route guard, `temperatureReport`). A customer account reaches only this screen: the sensor list gives it each
 * sensor's name and location and nothing else (get_sensor_report_devices).
 *
 * Two shapes by the `deviceId` param. Without it, "Choose a sensor": the sensors that have readings, a deactivated one tagged.
 * With it (from the chooser, or from a sensor's screen): the sensor's name and location, From and To, and Share PDF. It opens
 * with the last 30 days. The server is the authority on the period (12 months at most, 2 years back, today or earlier); the
 * screen checks the same rule first so a wrong period is told at once. The phone works out nothing of the report.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { ReportHeader, ReportScaffold } from '@/components/reports';
import { Button } from '@/components/ui/Button';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { StatusTag } from '@/components/ui/StatusTag';
import { useLiveReport } from '@/features/reports/useLiveReport';
import { NeedsConnectionLine } from '@/features/phone-copy/components/NeedsConnectionLine';
import { needsConnectionLabel, useNeedsConnectionV3 } from '@/features/phone-copy/useNeedsConnection';
import {
  PERIOD_TEXT,
  getReportSensors,
  type ReportSensorsResult,
  periodProblem,
  periodTextForCode,
  type ReportSensor,
} from '@/features/sensors/temperatureReportService';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, type TranslationKey } from '@/i18n';
import { generateTemperatureReportPDF, pdfRefusalText } from '@/services/pdf-service';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';
import { indiaDay, todayInIST, toLocalISODate } from '@/utils/formatters';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { nameFileNamePart } from '@/utils/invoiceLabel';

const DEFAULT_DAYS = 30;

/** The server's reason, or null when it sent none or an empty text (then the default message is shown). */
const reasonOf = (text: string | undefined): string | null => (text === undefined || text === '' ? null : text);

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardClip: { borderRadius: radius.card, overflow: 'hidden' as const },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  content: { flex: 1, gap: space.xxs, alignItems: 'flex-start' as const },
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  form: { paddingHorizontal: layout.marginCompact, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.md },
  problem: { ...typography.subhead, color: t.status.negative.text },
});

export default function TemperatureReportScreen() {
  const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();
  // The scaffold's own signal: while it shows "needs a connection" no request goes out and a sensor already open keeps its
  // screen; the read runs once when the connection is back.
  const needsConnection = useNeedsConnectionV3();
  const fetch = useCallback(
    (): Promise<ReportSensorsResult> => (needsConnection ? Promise.resolve({ success: false, data: null, message: '' }) : getReportSensors()),
    [needsConnection]
  );
  // The key never changes with the connection, so going offline leaves the open sensor's screen as it is.
  const query = useLiveReport(
    'temperature-report-sensors',
    fetch,
    tr('reports.temperatureReport.loadError'),
    needsConnection
  );
  const { data, phase, refresh, retry } = query;
  // Offline no load runs at all (a failed load would clear the open sensor): pull-to-refresh and Retry return at once.
  const { isRefreshing, isFetching, updatedAt, error } = query;
  const scaffoldQuery = useMemo(
    () => ({
      data,
      phase,
      isRefreshing,
      isFetching,
      updatedAt,
      error,
      refresh: (): Promise<boolean> => (needsConnection ? Promise.resolve(false) : refresh()),
      retry: () => {
        if (!needsConnection) retry();
      },
    }),
    [data, phase, isRefreshing, isFetching, updatedAt, error, needsConnection, refresh, retry]
  );
  // On reconnect a screen that is not showing figures (opened offline) reloads from the loading skeleton, never from the
  // load-error state; one already showing a sensor refreshes in place.
  const wasOffline = useRef(needsConnection);
  useEffect(() => {
    if (wasOffline.current && !needsConnection) {
      if (phase === 'ready') void refresh();
      else retry();
    }
    wasOffline.current = needsConnection;
  }, [needsConnection, phase, refresh, retry]);
  const sensors = useMemo(() => data ?? [], [data]);
  const styles = useThemedStyles(makeStyles);

  const renderRow = useCallback((sensor: ReportSensor) => <SensorRow sensor={sensor} />, []);

  if (deviceId && query.phase === 'ready') {
    const sensor = sensors.find(candidate => candidate.id === deviceId);
    return <ReportForm key={deviceId} deviceId={deviceId} sensor={sensor} />;
  }

  return (
    <View style={styles.container}>
      <ReportScaffold
        title={tr('reports.titles.temperatureReport')}
        subtitle={deviceId ? undefined : tr('reports.temperatureReport.chooseSensor')}
        query={scaffoldQuery}
        kpiPlaceholders={0}
        rows={deviceId ? [] : sensors}
        renderRow={renderRow}
        keyExtractor={(sensor: ReportSensor) => sensor.id}
        empty={{ icon: 'thermometer', title: tr('reports.temperatureReport.noSensors') }}
        errorTitle={tr('reports.temperatureReport.errorTitle')}
        needsConnectionId="temperature-report-needs-connection"
      />
    </View>
  );
}

const SensorRow = memo(function SensorRow({ sensor }: { sensor: ReportSensor }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const label = sensor.location
    ? tr('reports.temperatureReport.sensorRow', { name: sensor.name, location: sensor.location })
    : sensor.name;
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => router.push(`/reports/temperature-report?deviceId=${encodeURIComponent(sensor.id)}` as never)}
          accessibilityRole="button"
          accessibilityLabel={sensor.active ? label : `${label}, ${tr('common.deactivated')}`}
          accessibilityHint={tr('reports.temperatureReport.sensorRowHint')}
        >
          <View style={styles.content}>
            <Text style={styles.title}>{sensor.name}</Text>
            {sensor.location ? <Text style={styles.subtitle}>{sensor.location}</Text> : null}
            {sensor.active ? null : <StatusTag status="neutral" label={tr('common.deactivated')} />}
          </View>
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        </Pressable>
      </View>
    </View>
  );
});

function ReportForm({ deviceId, sensor }: { deviceId: string; sensor: ReportSensor | undefined }) {
  const styles = useThemedStyles(makeStyles);
  const needsConnection = useNeedsConnectionV3();
  const today = useMemo(() => todayInIST(), []);
  const [to, setTo] = useState<Date>(today);
  const [from, setFrom] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DEFAULT_DAYS - 1)));

  const fromDay = toLocalISODate(from);
  const toDay = toLocalISODate(to);
  const problem: TranslationKey | null = useMemo(() => {
    const limit = periodProblem(fromDay, toDay, toLocalISODate(today));
    if (limit) return PERIOD_TEXT[limit];
    // The sensor's first and last reading, as the list gave them: a period wholly outside them has nothing to report.
    const first = sensor?.first_reading_at ? indiaDay(sensor.first_reading_at) : '';
    const last = sensor?.last_reading_at ? indiaDay(sensor.last_reading_at) : '';
    if ((first && toDay < first) || (last && fromDay > last)) return PERIOD_TEXT.noReadingsInPeriod;
    return null;
  }, [fromDay, toDay, today, sensor]);

  // Share PDF: the server makes it; a second tap while it is being made is ignored.
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const sharePdf = useCallback(async () => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    try {
      const made = await generateTemperatureReportPDF(deviceId, fromDay, toDay);
      if (!made.success || !made.pdfUrl) {
        const period = periodTextForCode(made.code);
        if (period) {
          showAlert(tr('reports.export.failedTitle'), tr(period));
        } else if (made.refusal) {
          const { title, message } = pdfRefusalText(made.refusal);
          showAlert(title, message);
        } else {
          showAlert(tr('reports.export.failedTitle'), reasonOf(made.error) ?? tr('errors.pdf.generateFailed'));
        }
        return;
      }
      const filename = `Temperature report ${nameFileNamePart(sensor?.name)} ${fromDay} to ${toDay}`.replace(/\s+/g, ' ').trim() + '.pdf';
      const shared = await downloadAndSharePDF(made.pdfUrl, filename);
      if (!shared.success) showAlert(tr('reports.export.shareFailedTitle'), reasonOf(shared.error) ?? tr('errors.pdf.shareFailed'));
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  }, [deviceId, fromDay, toDay, sensor?.name]);

  return (
    <View style={styles.container}>
      <ReportHeader title={tr('reports.titles.temperatureReport')} subtitle={sensor?.name} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {sensor?.location ? <Text style={styles.subtitle}>{sensor.location}</Text> : null}
        {sensor && !sensor.active ? <StatusTag status="neutral" label={tr('common.deactivated')} /> : null}
        <DatePickerInput label={tr('filters.date.from')} value={from} onChange={setFrom} maximumDate={to} />
        <DatePickerInput label={tr('filters.date.to')} value={to} onChange={setTo} minimumDate={from} maximumDate={today} />
        {problem ? (
          <Text style={styles.problem} accessibilityLiveRegion="polite" accessibilityRole="alert">
            {tr(problem)}
          </Text>
        ) : null}
        {needsConnection ? (
          <NeedsConnectionLine testID="temperature-report-share-pdf-needs-connection" text={tr('components.offlineRead.needsConnection')} />
        ) : null}
        <Button
          type="primary"
          size="fullWidth"
          leftIcon="share-variant"
          loading={sharing}
          disabled={sharing || problem !== null || needsConnection}
          testID="temperature-report-share-pdf"
          accessibilityLabel={needsConnection ? needsConnectionLabel(tr('components.sharePdf')) : undefined}
          onPress={() => { void sharePdf(); }}
        >
          {tr('components.sharePdf')}
        </Button>
      </ScrollView>
    </View>
  );
}
