/**
 * Temperature & Humidity Sensors Screen
 *
 * Displays real-time sensor data with auto-polling. Styling follows
 * docs/STYLE_GUIDE.md: list report on `background.base`, sensor object cards on
 * `surface.card`, one status tag per sensor (§3.5: healthy / warning / critical
 * map to positive / critical / negative, each with its icon and word).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  AppState,
  AppStateStatus,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReportHeader, ReportEmptyState } from '@/components/reports';
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
import { SensorService } from '@/services/sensor-service';
import { SensorDevice, SensorDashboard } from '@/types/sensor.types';
import { createLogger } from '@/utils/logger';
import { formatNumber, formatRelativeTime, formatTime } from '@/utils/formatters';
import { StatusTag, STATUS_ICONS, type StatusKind } from '@/components/ui';
import { formatHumidity, formatTemperature } from '@/components/sensors/SensorHistoryChart';
import { t as tr } from '@/i18n';

const logger = createLogger('SensorsScreen');

const POLL_INTERVAL = 10 * 1000; // 10 seconds
const LAST_POLL_KEY = 'sensor_last_poll_timestamp';

// ============================================================================
// Status and formatting helpers (guide §3.5, §12.3)
// ============================================================================

const SEVERITY: Record<StatusKind, number> = {
  negative: 4,
  critical: 3,
  informative: 2,
  neutral: 1,
  positive: 0,
};

interface SensorStatus {
  kind: StatusKind;
  label: string;
}

/** Health status of a sensor: healthy / warning / critical → positive / critical / negative. */
export function healthStatus(health: SensorDevice['health_status']): SensorStatus {
  switch (health) {
    case 'healthy':
      return { kind: 'positive', label: tr('sensors.status.healthy') };
    case 'warning':
      return { kind: 'critical', label: tr('sensors.status.warning') };
    case 'critical':
      return { kind: 'negative', label: tr('sensors.status.critical') };
    default:
      return { kind: 'neutral', label: tr('common.unknown') };
  }
}

/** Battery status, or null when the battery is fine. */
export function batteryStatus(battery: SensorDevice['battery_status']): SensorStatus | null {
  switch (battery) {
    case 'LOW':
      return { kind: 'critical', label: tr('sensors.status.batteryLow') };
    case 'CRITICAL':
      return { kind: 'negative', label: tr('sensors.status.batteryCritical') };
    default:
      return null;
  }
}

/** The one status shown in the list: the most severe of connectivity, health and battery. */
export function rowStatus(device: SensorDevice): SensorStatus {
  const candidates: SensorStatus[] = [healthStatus(device.health_status)];
  if (device.connectivity_status === 'OFFLINE') candidates.push({ kind: 'negative', label: tr('sensors.status.offline') });
  else if (device.is_stale) candidates.push({ kind: 'critical', label: tr('sensors.status.noRecentData') });
  const battery = batteryStatus(device.battery_status);
  if (battery) candidates.push(battery);
  return candidates.reduce((worst, s) => (SEVERITY[s.kind] > SEVERITY[worst.kind] ? s : worst));
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
    listContent: {
      flexGrow: 1,
      paddingHorizontal: layout.marginCompact,
      paddingBottom: space.xxxl,
      gap: space.sm,
    },
    dashboardSection: {
      paddingTop: space.lg,
      paddingBottom: space.sm,
      gap: space.md,
    },
    tileRow: {
      flexDirection: 'row',
      gap: space.sm,
    },
    tile: {
      flex: 1,
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      padding: space.md,
      gap: space.xs,
      alignItems: 'flex-start',
      ...t.shadow[2],
    },
    tileIcon: {
      width: layout.avatar.sm,
      height: layout.avatar.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLabel: {
      ...typography.footnote,
      color: t.text.secondary,
    },
    tileValue: {
      ...typography.title3,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    alertsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    pollingInfo: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: space.md,
      rowGap: space.xxs,
    },
    pollingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    pollingText: {
      ...typography.footnote,
      color: t.text.secondary,
      fontVariant: ['tabular-nums'],
    },
    sectionHeader: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: trackedText(0.5),
      color: t.text.secondary,
      marginTop: space.md,
    },
    messageStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
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
    deviceCard: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      padding: space.lg,
      gap: space.md,
      ...t.shadow[2],
    },
    deviceCardPressed: {
      backgroundColor: t.surface.cardPressed,
    },
    deviceHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
    },
    deviceInfo: {
      flex: 1,
      gap: space.xxs,
    },
    deviceName: {
      ...typography.headline,
      color: t.text.primary,
    },
    deviceLocation: {
      ...typography.subhead,
      color: t.text.secondary,
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
      textAlign: 'center',
    },
    readingValue: {
      ...typography.title2,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    timestampText: {
      ...typography.caption1,
      color: t.text.secondary,
    },
    offlineContainer: {
      alignItems: 'center',
      paddingVertical: space.lg,
      gap: space.xs,
      borderRadius: radius.button,
      backgroundColor: t.background.base,
    },
    offlineText: {
      ...typography.headline,
      color: t.text.primary,
    },
  });

const SensorsScreen: React.FC = () => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [dashboard, setDashboard] = useState<SensorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [nextPollIn, setNextPollIn] = useState<number>(POLL_INTERVAL);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);

  // Fetch sensor data
  const fetchSensorData = useCallback(
    async (isRefresh = false, sinceTimestamp?: string) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        }

        const result = await SensorService.pollSensorData(sinceTimestamp);

        if (result.success && result.data) {
          setDevices(result.data.devices);
          setDashboard(result.data.dashboard);
          setErrorVisible(false);

          // Store the poll timestamp
          await AsyncStorage.setItem(LAST_POLL_KEY, result.data.poll_timestamp);

          // Reset countdown
          setNextPollIn(POLL_INTERVAL);

          logger.debug('Poll successful', {
            devices: result.data.devices.length,
            newReadings: result.data.new_readings.length,
            timestamp: result.data.poll_timestamp,
          });
        } else {
          logger.warn('Poll failed', { message: result.message });
          setErrorVisible(true);
        }
      } catch (error) {
        logger.error('Exception', error);
        setErrorVisible(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      // First poll - no timestamp (get all data)
      await fetchSensorData(false);
    };

    loadInitialData();
  }, [fetchSensorData]);

  // Setup polling interval
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      const lastPoll = await AsyncStorage.getItem(LAST_POLL_KEY);
      logger.debug('Auto-polling (10 second interval)');
      await fetchSensorData(false, lastPoll || undefined);
    }, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchSensorData]);

  // Countdown timer for next poll
  useEffect(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setNextPollIn(prev => {
        const next = prev - 1000;
        return next < 0 ? POLL_INTERVAL : next;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Handle app state changes (pause polling when app is in background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground - trigger a poll
        logger.debug('App foregrounded - polling');
        AsyncStorage.getItem(LAST_POLL_KEY).then(lastPoll => {
          fetchSensorData(false, lastPoll || undefined);
        });
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchSensorData]);

  const onRefresh = useCallback(async () => {
    const lastPoll = await AsyncStorage.getItem(LAST_POLL_KEY);
    await fetchSensorData(true, lastPoll || undefined);
  }, [fetchSensorData]);

  const renderTile = (
    label: string,
    value: number,
    icon: string,
    iconColour: string,
    iconBackground: string
  ) => (
    <View style={styles.tile} accessible accessibilityLabel={tr('sensors.labelValue', { label, value })}>
      <View style={[styles.tileIcon, { backgroundColor: iconBackground }]}>
        <Icon name={icon} size={iconSize.md} color={iconColour} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{formatNumber(value)}</Text>
    </View>
  );

  const renderDashboard = () => {
    if (!dashboard) return null;

    const alerts: SensorStatus[] = [];
    if (dashboard.stale_sensors > 0) {
      alerts.push({ kind: 'critical', label: tr('sensors.list.staleCount', { count: dashboard.stale_sensors }) });
    }
    if (dashboard.low_battery_count > 0) {
      alerts.push({ kind: 'critical', label: tr('sensors.list.lowBatteryCount', { count: dashboard.low_battery_count }) });
    }
    if (dashboard.critical_battery_count > 0) {
      alerts.push({ kind: 'negative', label: tr('sensors.list.criticalBatteryCount', { count: dashboard.critical_battery_count }) });
    }

    const seconds = Math.max(0, Math.floor(nextPollIn / 1000));

    return (
      <View style={styles.dashboardSection}>
        <View style={styles.tileRow}>
          {renderTile(tr('sensors.sensors'), dashboard.total_active_sensors, 'thermometer', t.brand.tint, t.brand.subtle)}
          {renderTile(
            tr('sensors.status.online'),
            dashboard.online_sensors,
            STATUS_ICONS.positive,
            t.status.positive.text,
            t.status.positive.background
          )}
          {renderTile(
            tr('sensors.status.offline'),
            dashboard.offline_sensors,
            STATUS_ICONS.negative,
            t.status.negative.text,
            t.status.negative.background
          )}
        </View>

        {alerts.length > 0 && (
          <View style={styles.alertsRow}>
            {alerts.map(alert => (
              <StatusTag key={alert.label} status={alert.kind} label={alert.label} />
            ))}
          </View>
        )}

        <View style={styles.pollingInfo}>
          <View style={styles.pollingRow}>
            <Icon name="timer-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.pollingText}>{tr('sensors.list.nextUpdate', { seconds })}</Text>
          </View>
          {dashboard.most_recent_sync && (
            <Text style={styles.pollingText}>{tr('sensors.list.lastSync', { time: formatTime(dashboard.most_recent_sync) })}</Text>
          )}
        </View>

        {errorVisible && (
          <View style={styles.messageStrip} accessibilityLiveRegion="polite">
            <Icon name={STATUS_ICONS.negative} size={iconSize.md} color={t.status.negative.text} />
            <Text style={styles.messageText}>{tr('sensors.list.loadError')}</Text>
            <Pressable
              style={styles.stripAction}
              onPress={() => {
                setErrorVisible(false);
                onRefresh();
              }}
              accessibilityRole="button"
              accessibilityLabel={tr('common.retry')}
            >
              <Text style={styles.stripActionText}>{tr('common.retry')}</Text>
            </Pressable>
          </View>
        )}

        {devices.length > 0 && (
          <Text style={styles.sectionHeader} accessibilityRole="header">
            {tr('sensors.sensors')}
          </Text>
        )}
      </View>
    );
  };

  const renderDevice = ({ item: device }: { item: SensorDevice }) => {
    const isOffline = device.connectivity_status === 'OFFLINE' || device.is_stale;
    const status = rowStatus(device);
    const hasReading = !isOffline && device.latest_temperature !== null;
    const a11yLabel = [
      device.device_name,
      device.location,
      status.label,
      hasReading ? tr('sensors.list.spokenTemperature', { value: formatTemperature(device.latest_temperature) }) : null,
      hasReading ? tr('sensors.list.spokenHumidity', { value: formatHumidity(device.latest_humidity) }) : null,
    ]
      .filter(Boolean)
      .join(', ');

    return (
      <Pressable
        style={({ pressed }) => [styles.deviceCard, pressed && styles.deviceCardPressed]}
        onPress={() => router.push(`/sensor-detail/${device.id}`)}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={tr('sensors.list.openHint')}
      >
        {/* Device Header */}
        <View style={styles.deviceHeader}>
          <Icon
            name={isOffline ? 'thermometer-off' : 'thermometer'}
            size={iconSize.lg}
            color={isOffline ? t.icon.secondary : t.icon.primary}
          />
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName} numberOfLines={2}>
              {device.device_name}
            </Text>
            <Text style={styles.deviceLocation} numberOfLines={1}>
              {device.location}
            </Text>
            <StatusTag status={status.kind} label={status.label} />
          </View>
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        </View>

        {/* Temperature & Humidity */}
        {hasReading ? (
          <>
            <View style={styles.readingsRow}>
              <View style={styles.readingBox}>
                <Icon name="thermometer" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.readingLabel}>{tr('sensors.temperature')}</Text>
                <Text style={styles.readingValue}>{formatTemperature(device.latest_temperature)}</Text>
              </View>

              <View style={styles.readingBox}>
                <Icon name="water-percent" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.readingLabel}>{tr('sensors.humidity')}</Text>
                <Text style={styles.readingValue}>{formatHumidity(device.latest_humidity)}</Text>
              </View>
            </View>

            {device.latest_reading_timestamp && (
              <Text style={styles.timestampText}>{tr('sensors.list.updated', { time: formatRelativeTime(device.latest_reading_timestamp) })}</Text>
            )}
          </>
        ) : (
          <View style={styles.offlineContainer}>
            <Icon name="cloud-off-outline" size={iconSize.xl} color={t.icon.secondary} />
            <Text style={styles.offlineText}>{device.is_stale ? tr('sensors.status.noRecentData') : tr('sensors.status.offline')}</Text>
            {device.last_reading_at && (
              <Text style={styles.timestampText}>{tr('sensors.list.lastSeen', { time: formatRelativeTime(device.last_reading_at) })}</Text>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <ReportEmptyState
      icon="thermometer-off"
      message={tr('sensors.list.emptyTitle')}
      description={tr('sensors.list.emptyDescription')}
    />
  );

  const header = (
    <ReportHeader
      title={tr('sensors.title')}
      actionIcon="refresh"
      actionLabel={tr('sensors.refresh')}
      onAction={onRefresh}
    />
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('sensors.list.loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={device => device.id}
        ListHeaderComponent={renderDashboard()}
        ListEmptyComponent={
          errorVisible && !dashboard ? (
            <ReportEmptyState
              icon="alert-circle-outline"
              tone="error"
              message={tr('sensors.somethingWentWrong')}
              description={tr('sensors.list.loadError')}
              actionLabel={tr('common.retry')}
              onAction={onRefresh}
            />
          ) : (
            renderEmpty
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const makeEntryStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background.base,
    },
  });

/**
 * Sensor monitoring is not part of the local demo (see src/config/demoCapabilities.ts),
 * so the route shows an explanation instead of SensorsScreen.
 */
function SensorsEntry() {
  const styles = useThemedStyles(makeEntryStyles);
  return (
    <View style={styles.container}>
      <ReportHeader title={tr('sensors.title')} />
      <ReportEmptyState
        icon="thermometer-off"
        message={tr('sensors.list.demoTitle')}
        description={tr('sensors.list.demoDescription')}
        actionLabel={tr('common.goBack')}
        onAction={() => router.back()}
      />
    </View>
  );
}

export { SensorsScreen };
export default SensorsEntry;
