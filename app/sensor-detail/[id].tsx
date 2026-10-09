/**
 * Sensor Detail Screen
 * Shows historical temperature/humidity charts for a specific sensor.
 *
 * Object page per docs/STYLE_GUIDE.md §14.2: hero card with the sensor name,
 * status tags and key facts, then the period chips, the history chart (§13.11)
 * and the summary statistics.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
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
} from '@/theme/tokens';
import { SensorService } from '@/services/sensor-service';
import { getSensorHistory, getPeriodLabel } from '@/services/sensor-history-service';
import type { SensorDevice } from '@/types/sensor.types';
import type {
  SensorHistoryPeriod,
  SensorHistoryData,
  SensorHistorySummary,
} from '@/types/sensor-history.types';
import { createLogger } from '@/utils/logger';
import { formatCount, formatDateTime } from '@/utils/formatters';
import { StatusTag, type StatusKind } from '@/components/ui';

const logger = createLogger('SensorDetail');

// All period options
const ALL_PERIOD_OPTIONS: { value: SensorHistoryPeriod; label: string; days: number }[] = [
  { value: 7, label: '7 days', days: 7 },
  { value: 14, label: '14 days', days: 14 },
  { value: 30, label: '30 days', days: 30 },
  { value: 90, label: '90 days', days: 90 },
  { value: 365, label: '1 year', days: 365 },
];

const DEVICE_ERROR = "Couldn't load this sensor. Check your connection and try again.";
const HISTORY_ERROR = "Couldn't load the sensor history. Check your connection and try again.";
const NOT_FOUND = 'This sensor was not found. It may have been removed.';

/**
 * Calculate how many days of historical data are available
 */
const getDaysOfDataAvailable = (earliestReadingAt: string | null): number => {
  if (!earliestReadingAt) return 0;
  const earliest = new Date(earliestReadingAt);
  const now = new Date();
  const diffMs = now.getTime() - earliest.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// ============================================================================
// Status (guide §3.5)
// ============================================================================

interface SensorStatus {
  kind: StatusKind;
  label: string;
}

function healthStatus(health: SensorDevice['health_status']): SensorStatus {
  switch (health) {
    case 'healthy':
      return { kind: 'positive', label: 'Healthy' };
    case 'warning':
      return { kind: 'critical', label: 'Warning' };
    case 'critical':
      return { kind: 'negative', label: 'Critical' };
    default:
      return { kind: 'neutral', label: 'Unknown' };
  }
}

function connectionStatus(device: SensorDevice): SensorStatus {
  if (device.connectivity_status === 'OFFLINE') return { kind: 'negative', label: 'Offline' };
  if (device.is_stale) return { kind: 'critical', label: 'No recent data' };
  if (device.connectivity_status === 'ONLINE') return { kind: 'positive', label: 'Online' };
  return { kind: 'neutral', label: 'Unknown' };
}

function batteryStatus(device: SensorDevice): SensorStatus {
  switch (device.battery_status) {
    case 'GOOD':
      return { kind: 'positive', label: 'Good' };
    case 'LOW':
      return { kind: 'critical', label: 'Low' };
    case 'CRITICAL':
      return { kind: 'negative', label: 'Critical' };
    default:
      return { kind: 'neutral', label: 'Unknown' };
  }
}

/** Humidity statistics keep one decimal in the report summary (guide §12.3). */
function formatHumidityStat(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

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
    heroType: {
      ...typography.footnote,
      color: t.text.secondary,
    },
    heroTitle: {
      ...typography.title2,
      color: t.text.primary,
    },
    heroLocation: {
      ...typography.subhead,
      color: t.text.secondary,
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
      letterSpacing: 0.5,
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
    noPeriodsText: {
      ...typography.subhead,
      color: t.text.secondary,
      paddingHorizontal: layout.marginCompact,
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
    <View style={styles.keyValueRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.keyLabel}>{label}</Text>
      {accessory ?? <Text style={styles.keyValue}>{value}</Text>}
    </View>
  );
}

const SensorDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // State
  const [device, setDevice] = useState<SensorDevice | null>(null);
  const [historyData, setHistoryData] = useState<SensorHistoryData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<SensorHistoryPeriod>(7);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate available periods based on earliest_reading_at
  const availablePeriods = useMemo(() => {
    const daysAvailable = getDaysOfDataAvailable(device?.earliest_reading_at ?? null);
    // Only show periods where we have at least some data (period <= days available)
    // Always show 7 days as minimum if any data exists
    if (daysAvailable < 1) return [];
    return ALL_PERIOD_OPTIONS.filter((opt) => opt.days <= daysAvailable || opt.days === 7);
  }, [device?.earliest_reading_at]);

  // Fetch device info from current polling data
  const fetchDeviceInfo = useCallback(async () => {
    try {
      const result = await SensorService.pollSensorData();
      if (result.success && result.data) {
        const foundDevice = result.data.devices.find((d) => d.id === id);
        if (foundDevice) {
          setDevice(foundDevice);
        } else {
          setError(NOT_FOUND);
        }
      } else {
        logger.warn('Device load failed', { message: result.message });
        setError(DEVICE_ERROR);
      }
    } catch (err) {
      logger.error('Device load exception', err);
      setError(DEVICE_ERROR);
    }
  }, [id]);

  // Fetch historical data
  const fetchHistory = useCallback(async (period: SensorHistoryPeriod) => {
    if (!id) return;

    setHistoryLoading(true);
    setError(null);

    try {
      const result = await getSensorHistory(id, period);
      if (result.success && result.data) {
        setHistoryData(result.data);
      } else {
        logger.warn('History load failed', { message: result.message });
        setError(HISTORY_ERROR);
      }
    } catch (err) {
      logger.error('History load exception', err);
      setError(HISTORY_ERROR);
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchDeviceInfo();
      await fetchHistory(selectedPeriod);
      setLoading(false);
    };
    loadData();
  }, [fetchDeviceInfo, fetchHistory, selectedPeriod]);

  // Handle period change
  const handlePeriodChange = useCallback((period: SensorHistoryPeriod) => {
    setSelectedPeriod(period);
    fetchHistory(period);
  }, [fetchHistory]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDeviceInfo();
    await fetchHistory(selectedPeriod);
    setRefreshing(false);
  }, [fetchDeviceInfo, fetchHistory, selectedPeriod]);

  // Period chips (only periods with available data)
  const renderPeriodSelector = () => {
    if (availablePeriods.length === 0) {
      return <Text style={styles.noPeriodsText}>No history yet. Readings appear here once the sensor reports them.</Text>;
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.periodContainer}
        accessibilityRole="radiogroup"
        accessibilityLabel="History period"
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
              accessibilityLabel={`Last ${option.label}`}
            >
              {isSelected && <Icon name="check" size={iconSize.sm} color={t.brand.tint} />}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]} maxFontSizeMultiplier={1.6}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  const renderStat = (label: string, value: string) => (
    <View style={styles.summaryItem} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.summaryItemLabel}>{label}</Text>
      <Text style={styles.summaryItemValue}>{value}</Text>
    </View>
  );

  // Render summary stats
  const renderSummary = (summary: SensorHistorySummary) => (
    <View style={styles.card}>
      <Text style={styles.summaryTitle} accessibilityRole="header">
        {`Summary, last ${getPeriodLabel(selectedPeriod)}`}
      </Text>

      <View style={styles.summarySection}>
        <View style={styles.summaryHeader}>
          <Icon name="thermometer" size={iconSize.md} color={t.icon.secondary} />
          <Text style={styles.summaryLabel}>Temperature</Text>
        </View>
        <View style={styles.summaryRow}>
          {renderStat('Average', formatTemperature(summary.avg_temperature))}
          {renderStat('Lowest', formatTemperature(summary.min_temperature))}
          {renderStat('Highest', formatTemperature(summary.max_temperature))}
        </View>
      </View>

      <View style={styles.summarySection}>
        <View style={styles.summaryHeader}>
          <Icon name="water-percent" size={iconSize.md} color={t.icon.secondary} />
          <Text style={styles.summaryLabel}>Humidity</Text>
        </View>
        <View style={styles.summaryRow}>
          {renderStat('Average', formatHumidityStat(summary.avg_humidity))}
          {renderStat('Lowest', formatHumidityStat(summary.min_humidity))}
          {renderStat('Highest', formatHumidityStat(summary.max_humidity))}
        </View>
      </View>

      <Text style={styles.readingsCount}>
        {`Based on ${formatCount(summary.total_readings, 'reading')}`}
      </Text>
    </View>
  );

  const header = (
    <ReportHeader
      title={device?.device_name || 'Sensor'}
      subtitle={device?.location}
      actionIcon={device ? 'refresh' : undefined}
      actionLabel="Refresh sensor data"
      onAction={device ? onRefresh : undefined}
    />
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>Loading sensor</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error && !device) {
    const notFound = error === NOT_FOUND;
    return (
      <View style={styles.container}>
        {header}
        <ReportEmptyState
          icon={notFound ? 'thermometer-off' : 'alert-circle-outline'}
          tone={notFound ? 'default' : 'error'}
          message={notFound ? 'Sensor not found' : 'Something went wrong'}
          description={error}
          actionLabel="Try again"
          onAction={onRefresh}
        />
      </View>
    );
  }

  const health = device ? healthStatus(device.health_status) : null;
  const connection = device ? connectionStatus(device) : null;
  const battery = device ? batteryStatus(device) : null;

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
        {device && health && connection && battery && (
          <View style={styles.card}>
            <View>
              <Text style={styles.heroType}>Sensor</Text>
              <Text style={styles.heroTitle} accessibilityRole="header">
                {device.device_name}
              </Text>
              <Text style={styles.heroLocation}>{device.location}</Text>
            </View>

            <View style={styles.tagRow}>
              <StatusTag status={health.kind} label={health.label} />
            </View>

            {/* Current Readings */}
            <View style={styles.readingsRow}>
              <View
                style={styles.readingBox}
                accessible
                accessibilityLabel={`Temperature ${formatTemperature(device.latest_temperature)}`}
              >
                <Icon name="thermometer" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.readingLabel}>Temperature</Text>
                <Text style={styles.readingValue}>{formatTemperature(device.latest_temperature)}</Text>
              </View>
              <View
                style={styles.readingBox}
                accessible
                accessibilityLabel={`Humidity ${formatHumidity(device.latest_humidity)}`}
              >
                <Icon name="water-percent" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.readingLabel}>Humidity</Text>
                <Text style={styles.readingValue}>{formatHumidity(device.latest_humidity)}</Text>
              </View>
            </View>

            <View>
              <KeyValue
                label="Connection"
                value={connection.label}
                styles={styles}
                accessory={<StatusTag status={connection.kind} label={connection.label} />}
              />
              <KeyValue
                label="Battery"
                value={battery.label}
                styles={styles}
                accessory={<StatusTag status={battery.kind} label={battery.label} />}
              />
              {device.latest_reading_timestamp && (
                <KeyValue
                  label="Last reading"
                  value={formatDateTime(device.latest_reading_timestamp)}
                  styles={styles}
                />
              )}
            </View>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            History
          </Text>
          {renderPeriodSelector()}
        </View>

        {error && device && (
          <View style={styles.messageStrip} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
            <Text style={styles.messageText}>{error}</Text>
            <Pressable
              style={styles.stripAction}
              onPress={() => fetchHistory(selectedPeriod)}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.stripActionText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {/* Chart */}
        {historyLoading ? (
          <View style={styles.chartLoading} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.loadingText}>{`Loading ${getPeriodLabel(selectedPeriod)} of history`}</Text>
          </View>
        ) : historyData ? (
          <>
            <SensorHistoryChart
              readings={historyData.readings}
              aggregationInterval={historyData.aggregation_interval}
              periodDays={historyData.period_days}
            />

            {/* Summary */}
            {renderSummary(historyData.summary)}
          </>
        ) : !error ? (
          <SensorHistoryChart readings={[]} aggregationInterval="" periodDays={selectedPeriod} />
        ) : null}
      </ScrollView>
    </View>
  );
};

export default SensorDetailScreen;
