import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

interface DispatchHistorySummaryProps {
  totalDispatches: number;
  totalQuantity: number;
  totalWeight: number;
  initialQuantity: number;
  isLoading?: boolean;
}

const formatNumber = (n: number) => new Intl.NumberFormat('en-IN').format(n);

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.card,
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.sm,
    borderRadius: radius.card,
    ...t.shadow[2],
    overflow: 'hidden' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: touchTarget,
    backgroundColor: t.surface.card,
  },
  headerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  loadingContainer: {
    paddingVertical: space.xl,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  metricsGrid: {
    gap: space.sm,
  },
  metricRow: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  metricCard: {
    flex: 1,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    alignItems: 'center' as const,
    gap: space.s6,
    backgroundColor: t.background.base,
  },
  metricValue: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  metricLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
});

const DispatchHistorySummary: React.FC<DispatchHistorySummaryProps> = ({
  totalDispatches,
  totalQuantity,
  totalWeight,
  initialQuantity,
  isLoading = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const metric = (icon: string, value: number, label: string) => (
    <View
      style={styles.metricCard}
      accessible
      accessibilityLabel={`${formatNumber(value)} ${label}`}
    >
      <Icon name={icon} size={iconSize.lg} color={t.brand.tint} />
      <Text style={styles.metricValue}>{formatNumber(value)}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={toggleExpand}
        accessibilityLabel="Summary"
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={styles.headerLeft}>
          <Icon name="chart-box-outline" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.headerTitle} accessibilityRole="header">Summary</Text>
        </View>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={iconSize.md}
          color={t.icon.secondary}
        />
      </Pressable>

      {isExpanded && (
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={t.brand.tint} />
              <Text style={styles.loadingText}>Loading summary…</Text>
            </View>
          ) : (
            <View style={styles.metricsGrid}>
              <View style={styles.metricRow}>
                {metric('truck-delivery-outline', totalDispatches, totalDispatches === 1 ? 'dispatch' : 'dispatches')}
                {metric('cube-outline', totalQuantity, 'bags dispatched')}
              </View>
              <View style={styles.metricRow}>
                {metric('scale-balance', totalWeight, 'kg')}
                {metric('package-down', initialQuantity, 'bags received')}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default DispatchHistorySummary;
