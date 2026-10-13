/**
 * "Needs attention" over the sensors list: one line per kind of problem (offline, no
 * recent data, battery), most serious first, each with its count as a status tag and
 * the sensors it names as links to their detail. Nothing is drawn when all is well.
 *
 * For a screen reader the heading is a header, each count is one element ("2 offline"),
 * and each sensor named is a button that says where it goes.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusTag } from '@/components/ui';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { SensorAlert } from '@/features/sensors/sensorStatus';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { fontWeight, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      marginHorizontal: layout.marginCompact,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      ...t.shadow[2],
    },
    line: {
      paddingVertical: space.sm,
      gap: space.xxs,
    },
    lineDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.divider,
    },
    names: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.md,
    },
    name: {
      minHeight: touchTarget,
      justifyContent: 'center',
    },
    namePressed: {
      backgroundColor: t.interaction.pressedOverlay,
    },
    nameText: {
      ...typography.subhead,
      fontWeight: fontWeight.semibold,
      color: t.brand.tint,
    },
  });

export function SensorAlerts({ alerts }: { alerts: readonly SensorAlert[] }) {
  const styles = useThemedStyles(makeStyles);
  if (alerts.length === 0) return null;
  return (
    <View>
      <SectionHeader title={tr('sensors.list.alertsTitle')} />
      <View style={styles.card}>
        {alerts.map((alert, index) => (
          <View key={alert.kind} style={[styles.line, index > 0 && styles.lineDivider]}>
            <StatusTag status={alert.tone} label={alert.label} />
            <View style={styles.names}>
              {alert.devices.map(device => (
                <Pressable
                  key={device.id}
                  style={({ pressed }) => [styles.name, pressed && styles.namePressed]}
                  onPress={() => router.push(`/sensor-detail/${device.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={device.name}
                  accessibilityHint={tr('sensors.list.alertOpenHint')}
                >
                  <Text style={styles.nameText} maxFontSizeMultiplier={1.6}>
                    {device.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default SensorAlerts;
