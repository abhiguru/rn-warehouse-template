/**
 * One sensor in the list (docs/STYLE_GUIDE.md §3.5): name, place, one status tag, and its
 * latest temperature and humidity, or why there are none. Opens the sensor's detail.
 *
 * `now` is the screen's minute tick: the status and "Updated 5 min ago" are drawn from it,
 * so they move without a request. Memoized: a row redraws when its sensor or the minute
 * changes, not when another sensor does.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { StatusTag } from '@/components/ui';
import { formatHumidity, formatTemperature } from '@/components/sensors/SensorHistoryChart';
import { isOffline, isStale, lastSeenTime, readingTime, rowStatus } from '@/features/sensors/sensorStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { SensorDevice } from '@/types/sensor.types';
import { formatRelativeTime } from '@/utils/formatters';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    deviceCard: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      padding: space.lg,
      marginHorizontal: layout.marginCompact,
      marginTop: space.sm,
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

export interface SensorRowProps {
  device: SensorDevice;
  /** The minute tick (ms since the epoch). */
  now: number;
}

export const SensorRow = React.memo(function SensorRow({ device, now }: SensorRowProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const offline = isOffline(device);
  const quiet = offline || isStale(device, now);
  const status = rowStatus(device, now);
  const hasReading = !quiet && (device.latest_temperature !== null || device.latest_humidity !== null);
  const measuredAt = readingTime(device);
  const seenAt = lastSeenTime(device);
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
      <View style={styles.deviceHeader}>
        <Icon name={quiet ? 'thermometer-off' : 'thermometer'} size={iconSize.lg} color={quiet ? t.icon.secondary : t.icon.primary} />
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
          {measuredAt ? <Text style={styles.timestampText}>{tr('sensors.list.updated', { time: formatRelativeTime(measuredAt) })}</Text> : null}
        </>
      ) : (
        <View style={styles.offlineContainer}>
          <Icon name="cloud-off-outline" size={iconSize.xl} color={t.icon.secondary} />
          <Text style={styles.offlineText}>{offline ? tr('sensors.status.offline') : tr('sensors.status.noRecentData')}</Text>
          {seenAt ? <Text style={styles.timestampText}>{tr('sensors.list.lastSeen', { time: formatRelativeTime(seenAt) })}</Text> : null}
        </View>
      )}
    </Pressable>
  );
});

export default SensorRow;
