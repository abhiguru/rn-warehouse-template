/**
 * Sensor Detail Screen
 * Shows historical temperature/humidity charts for a specific sensor.
 *
 * Object page per docs/STYLE_GUIDE.md §14.2: hero card with the sensor name,
 * status tags and key facts, then the period chips, the history chart (§13.11)
 * and the summary statistics.
 *
 * The sensor and its history are two report queries asked side by side
 * (useSensorDevice, useSensorHistory): each period has its own key, so a late
 * answer for a period left behind never shows under the one chosen. A Realtime
 * change marks the sensor out of date and it is asked again behind the screen
 * (useSensorLiveUpdates); the history of a period is not asked again for it.
 * The minute tick moves "No recent data" without a request.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, ReportEmptyState } from '@/components/reports';
import { SensorHistoryChart, formatHumidity, formatTemperature } from '@/components/sensors/SensorHistoryChart';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
  trackedText,
} from '@/theme/tokens';
import type { SensorHistoryPeriod, SensorHistorySummary } from '@/types/sensor-history.types';
import { formatDateTime } from '@/utils/formatters';
import { t as tr } from '@/i18n';
import { StatusTag } from '@/components/ui';
import { batteryFact, chartThresholds, connectionStatus, healthStatus, readingTime } from '@/features/sensors/sensorStatus';
import { useMinuteTick } from '@/features/sensors/useMinuteTick';
import { useSensorDevice, useSensorHistory } from '@/features/sensors/useSensorQueries';
import { useSensorLiveUpdates } from '@/hooks/useSensorLiveUpdates';

const DAY_MS = 24 * 60 * 60 * 1000;

// All period options
const ALL_PERIOD_OPTIONS: { value: SensorHistoryPeriod; days: number }[] = [
  { value: 7, days: 7 },
  { value: 14, days: 14 },
  { value: 30, days: 30 },
  { value: 90, days: 90 },
  { value: 365, days: 365 },
];

/** "7 days", "1 year": the chip of a period. */
const periodLabel = (days: SensorHistoryPeriod): string =>
  days === 365 ? tr('sensors.period.year') : tr('sensors.period.days', { days });
/** "Last 7 days": the spoken name of a period chip. */
const lastPeriodLabel = (days: SensorHistoryPeriod): string =>
  days === 365 ? tr('sensors.period.lastYear') : tr('sensors.period.lastDays', { days });
/** "Summary, last 7 days". */
const summaryTitle = (days: SensorHistoryPeriod): string =>
  days === 365 ? tr('sensors.period.summaryYear') : tr('sensors.period.summaryDays', { days });
/** "Loading 7 days of history". */
const loadingHistoryLabel = (days: SensorHistoryPeriod): string =>
  days === 365 ? tr('sensors.period.loadingYear') : tr('sensors.period.loadingDays', { days });

/** Whole days of history the sensor has at `now`, from its first reading. */
const daysOfData = (firstReadingAt: string | null | undefined, now: number): number => {
  const first = firstReadingAt ? Date.parse(firstReadingAt) : NaN;
  return Number.isNaN(first) ? 0 : Math.floor((now - first) / DAY_MS);
};

/** From this font scale the readings and the summary figures stack instead of sitting side by side. */
const STACK_FROM_FONT_SCALE = 1.5;

// ============================================================================
// Styles
// ============================================================================

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background.base,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: space.lg,
    },
    loadingText: {
      ...typography.subhead,
      color: t.text.secondary,
    },
    scrollContent: {
      paddingBottom: space.xxxl,
    },
    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      padding: space.lg,
      marginHorizontal: layout.marginCompact,
      marginTop: space.lg,
      gap: space.md,
      ...t.shadow[2],
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    keyValueRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space.md,
      minHeight: layout.rowMinHeight,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.divider,
    },
    keyLabel: {
      ...typography.subhead,
      color: t.text.secondary,
    },
    keyValue: {
      ...typography.body,
      color: t.text.primary,
      textAlign: 'right',
      flexShrink: 1,
    },
    readingsRow: {
      flexDirection: 'row',
      gap: space.sm,
    },
    readingsRowStacked: {
      flexDirection: 'column',
    },
    readingBox: {
      flex: 1,
      borderRadius: radius.button,
      padding: space.md,
      gap: space.xxs,
      alignItems: 'center',
      backgroundColor: t.background.base,
    },
    readingLabel: {
      ...typography.footnote,
      color: t.text.secondary,
    },
    readingValue: {
      ...typography.title2,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    periodSection: {
      paddingTop: space.xxl,
      paddingBottom: space.sm,
      gap: space.sm,
    },
    sectionTitle: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: trackedText(0.5),
      color: t.text.secondary,
      paddingHorizontal: layout.marginCompact,
    },
    periodContainer: {
      paddingHorizontal: layout.marginCompact,
      gap: space.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      minHeight: 36,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.border.button,
      backgroundColor: t.surface.card,
    },
    chipSelected: {
      backgroundColor: t.brand.subtle,
      borderColor: t.brand.tint,
    },
    chipPressed: {
      backgroundColor: t.surface.cardPressed,
    },
    chipText: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      color: t.text.primary,
    },
    chipTextSelected: {
      color: t.brand.tint,
    },
    noHistoryText: {
      ...typography.subhead,
      color: t.text.secondary,
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.sm,
    },
    summaryTitle: {
      ...typography.headline,
      color: t.text.primary,
    },
    summarySection: {
      gap: space.sm,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    summaryLabel: {
      ...typography.subhead,
      fontWeight: fontWeight.semibold,
      color: t.text.primary,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
    },
    summaryRowStacked: {
      flexDirection: 'column',
      gap: space.xs,
    },
    summaryItemStacked: {
      flex: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space.md,
    },
    summaryItemLabel: {
      ...typography.footnote,
      color: t.text.secondary,
    },
    summaryItemValue: {
      ...typography.headline,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    readingsCount: {
      ...typography.footnote,
      color: t.text.secondary,
      textAlign: 'center',
    },
    chartLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.md,
      padding: space.huge,
      marginHorizontal: layout.marginCompact,
      marginVertical: space.sm,
      borderRadius: radius.card,
      backgroundColor: t.surface.card,
      ...t.shadow[2],
    },
    messageStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginHorizontal: layout.marginCompact,
      marginVertical: space.sm,
      paddingLeft: space.md,
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: t.status.negative.border,
      backgroundColor: t.status.negative.background,
    },
    messageText: {
      ...typography.subhead,
      color: t.status.negative.text,
      flex: 1,
      paddingVertical: space.sm,
    },
    stripAction: {
      minHeight: touchTarget,
      paddingHorizontal: space.md,
      justifyContent: 'center',
    },
    stripActionText: {
      ...typography.subhead,
      fontWeight: fontWeight.semibold,
      color: t.brand.tint,
    },
  });

type Styles = ReturnType<typeof makeStyles>;

function KeyValue({ label, value, styles, accessory }: {
  label: string; value: string; styles: Styles; accessory?: React.ReactNode;
}) {
  return (
    <View style={styles.keyValueRow} accessible accessibilityLabel={tr('sensors.labelValue', { label, value })}>
      <Text style={styles.keyLabel}>{label}</Text>
      {accessory ?? <Text style={styles.keyValue}>{value}</Text>}
    </View>
  );
}

const SensorDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const stacked = useWindowDimensions().fontScale >= STACK_FROM_FONT_SCALE;
  const [selectedPeriod, setSelectedPeriod] = useState<SensorHistoryPeriod>(7);

  // Both asked at once on opening; a period chip asks for that period's history only.
  const deviceQuery = useSensorDevice(id);
  const historyQuery = useSensorHistory(id, selectedPeriod);
  // A sensor that cannot be read has nothing for a change to refresh; "Try again" asks.
  useSensorLiveUpdates(deviceQuery.phase !== 'error');
  const now = useMinuteTick();

  const device = deviceQuery.data?.device ?? null;
  const notFound = deviceQuery.data !== undefined && device === null;
  const historyData = historyQuery.data;
  const thresholds = useMemo(() => (device ? chartThresholds(device) : []), [device]);

  // 7 days always (the period asked on opening, even before a whole day of data);
  // the longer periods once the data since the first reading covers them.
  const firstReadingAt = device ? device.first_reading_at ?? device.earliest_reading_at : null;
  const availablePeriods = useMemo(() => {
    const daysAvailable = daysOfData(firstReadingAt, now);
    return ALL_PERIOD_OPTIONS.filter((opt) => opt.days <= daysAvailable || opt.days === 7);
  }, [firstReadingAt, now]);

  // A period chip only selects the period; its own query asks for it.
  const handlePeriodChange = useCallback((period: SensorHistoryPeriod) => {
    setSelectedPeriod(period);
  }, []);

  const { refresh: refreshDevice, retry: retryDevice } = deviceQuery;
  const { refresh: refreshHistory, retry: retryHistory } = historyQuery;
  // Pull to refresh: the sensor and the history side by side.
  const onRefresh = useCallback(async () => {
    await Promise.all([refreshDevice(), refreshHistory()]);
  }, [refreshDevice, refreshHistory]);
  const retryAll = useCallback(() => {
    retryDevice();
    retryHistory();
  }, [retryDevice, retryHistory]);
  const refreshing = deviceQuery.isRefreshing || historyQuery.isRefreshing;

  // Period chips: 7 days, and the longer periods the data covers.
  const renderPeriodSelector = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.periodContainer}
        accessibilityRole="radiogroup"
        accessibilityLabel={tr('sensors.detail.periodLabel')}
      >
        {availablePeriods.map((option) => {
          const isSelected = selectedPeriod === option.value;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.chip,
                pressed && !isSelected && styles.chipPressed,
                isSelected && styles.chipSelected,
              ]}
              hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => handlePeriodChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              accessibilityLabel={lastPeriodLabel(option.value)}
            >
              {isSelected && <Icon name="check" size={iconSize.sm} color={t.brand.tint} />}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]} maxFontSizeMultiplier={1.6}>
                {periodLabel(option.value)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  const renderStat = (label: string, value: string) => (
    <View style={[styles.summaryItem, stacked && styles.summaryItemStacked]} accessible accessibilityLabel={tr('sensors.statValue', { label, value })}>
      <Text style={styles.summaryItemLabel}>{label}</Text>
      <Text style={styles.summaryItemValue}>{value}</Text>
    </View>
  );

  // Render summary stats
  const renderSummary = (summary: SensorHistorySummary, rawReadingCount: number | undefined) => (
    <View style={styles.card}>
      <Text style={styles.summaryTitle} accessibilityRole="header">
        {summaryTitle(selectedPeriod)}
      </Text>

      <View style={styles.summarySection}>
        <View style={styles.summaryHeader}>
          <Icon name="thermometer" size={iconSize.md} color={t.icon.secondary} />
          <Text style={styles.summaryLabel}>{tr('sensors.temperature')}</Text>
        </View>
        <View testID="sensor-summary-row-temperature" style={[styles.summaryRow, stacked && styles.summaryRowStacked]}>
          {renderStat(tr('sensors.detail.average'), formatTemperature(summary.avg_temperature))}
          {renderStat(tr('sensors.detail.lowest'), formatTemperature(summary.min_temperature))}
          {renderStat(tr('sensors.detail.highest'), formatTemperature(summary.max_temperature))}
        </View>
      </View>

      <View style={styles.summarySection}>
        <View style={styles.summaryHeader}>
          <Icon name="water-percent" size={iconSize.md} color={t.icon.secondary} />
          <Text style={styles.summaryLabel}>{tr('sensors.humidity')}</Text>
        </View>
        <View testID="sensor-summary-row-humidity" style={[styles.summaryRow, stacked && styles.summaryRowStacked]}>
          {renderStat(tr('sensors.detail.average'), formatHumidity(summary.avg_humidity))}
          {renderStat(tr('sensors.detail.lowest'), formatHumidity(summary.min_humidity))}
          {renderStat(tr('sensors.detail.highest'), formatHumidity(summary.max_humidity))}
        </View>
      </View>

      <Text style={styles.readingsCount}>
        {tr('sensors.detail.basedOn', { count: rawReadingCount ?? summary.total_readings })}
      </Text>
    </View>
  );

  const header = (
    <ReportHeader
      title={device?.device_name || tr('sensors.sensor')}
      subtitle={device?.location}
      actionIcon={device ? 'refresh' : undefined}
      actionLabel={tr('sensors.refresh')}
      onAction={device ? () => void onRefresh() : undefined}
    />
  );

  // Loading state: the sensor itself; the history shows its own loading under the hero.
  if (deviceQuery.phase === 'loading') {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('sensors.detail.loading')}</Text>
        </View>
      </View>
    );
  }

  // Nothing to show: the sensor could not be read, or the facility has no such sensor.
  if (!device) {
    return (
      <View style={styles.container}>
        {header}
        <ReportEmptyState
          icon={notFound ? 'thermometer-off' : 'alert-circle-outline'}
          tone={notFound ? 'default' : 'error'}
          message={notFound ? tr('sensors.detail.notFoundTitle') : tr('sensors.somethingWentWrong')}
          description={notFound ? tr('sensors.detail.notFound') : deviceQuery.error ?? tr('sensors.detail.deviceError')}
          actionLabel={tr('common.retry')}
          onAction={retryAll}
        />
      </View>
    );
  }

  const health = healthStatus(device.health_status);
  const connection = connectionStatus(device, now);
  const battery = batteryFact(device);
  const lastReading = readingTime(device);
  // The sensor on screen is an earlier answer, or the history could not be read.
  const failure = deviceQuery.error
    ? { text: deviceQuery.error, retry: retryAll }
    : historyQuery.phase === 'error' || historyQuery.error
      ? { text: historyQuery.error ?? tr('sensors.detail.historyError'), retry: retryHistory }
      : null;

  return (
    <View style={styles.container}>
      {header}

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero card */}
        <View style={styles.card}>
          <View style={styles.tagRow}>
            <StatusTag status={health.kind} label={health.label} />
          </View>

          {/* Current Readings */}
          <View testID="sensor-readings" style={[styles.readingsRow, stacked && styles.readingsRowStacked]}>
            <View
              style={styles.readingBox}
              accessible
              accessibilityLabel={tr('sensors.detail.temperatureValue', { value: formatTemperature(device.latest_temperature) })}
            >
              <Icon name="thermometer" size={iconSize.md} color={t.icon.secondary} />
              <Text style={styles.readingLabel}>{tr('sensors.temperature')}</Text>
              <Text style={styles.readingValue}>{formatTemperature(device.latest_temperature)}</Text>
            </View>
            <View
              style={styles.readingBox}
              accessible
              accessibilityLabel={tr('sensors.detail.humidityValue', { value: formatHumidity(device.latest_humidity) })}
            >
              <Icon name="water-percent" size={iconSize.md} color={t.icon.secondary} />
              <Text style={styles.readingLabel}>{tr('sensors.humidity')}</Text>
              <Text style={styles.readingValue}>{formatHumidity(device.latest_humidity)}</Text>
            </View>
          </View>

          <View>
            <KeyValue
              label={tr('sensors.detail.connection')}
              value={connection.label}
              styles={styles}
              accessory={<StatusTag status={connection.kind} label={connection.label} />}
            />
            <KeyValue
              label={tr('sensors.detail.battery')}
              value={battery.label}
              styles={styles}
              accessory={<StatusTag status={battery.kind} label={battery.label} />}
            />
            {lastReading ? (
              <KeyValue
                label={tr('sensors.detail.lastReading')}
                value={formatDateTime(lastReading)}
                styles={styles}
              />
            ) : null}
          </View>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {availablePeriods.length === 1 ? tr('sensors.detail.historyFor', { days: availablePeriods[0].days }) : tr('sensors.detail.history')}
          </Text>
          {availablePeriods.length > 1 ? renderPeriodSelector() : null}
        </View>

        {failure && (
          <View style={styles.messageStrip} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
            <Text style={styles.messageText}>{failure.text}</Text>
            <Pressable
              style={styles.stripAction}
              onPress={failure.retry}
              accessibilityRole="button"
              accessibilityLabel={tr('common.retry')}
            >
              <Text style={styles.stripActionText}>{tr('common.retry')}</Text>
            </Pressable>
          </View>
        )}

        {/* Chart */}
        {historyQuery.phase === 'loading' ? (
          <View style={styles.chartLoading} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.loadingText}>{loadingHistoryLabel(selectedPeriod)}</Text>
          </View>
        ) : historyData && historyData.readings.length === 0 ? (
          // No readings in the period: the empty text alone, no chart or summary.
          <Text style={styles.noHistoryText}>{tr('sensors.detail.noHistory')}</Text>
        ) : historyData ? (
          <>
            <SensorHistoryChart
              readings={historyData.readings}
              aggregationInterval={historyData.aggregation_interval}
              periodDays={historyData.period_days}
              thresholds={thresholds}
            />

            {/* Summary */}
            {renderSummary(historyData.summary, historyData.raw_reading_count)}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default SensorDetailScreen;
