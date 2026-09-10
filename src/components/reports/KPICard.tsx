/**
 * KPICard Component - SAP Fiori Compliant
 *
 * A reusable card for displaying a single KPI metric.
 * Follows SAP Fiori Card spec with proper dimensions and typography.
 * Uses theme.colors.fiori for consistency with GRN/Dispatch/Invoice lists.
 *
 * @see design/sap-fiori-specs/13-card.md
 * @see src/theme/index.ts - FioriColors interface
 * @see src/theme/listColors.ts - List component color mapping
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors, ListColors } from '@/hooks/useListColors';

// ============================================================================
// SAP Fiori Design Tokens (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
  dimensions: {
    cardCornerRadius: 12,
    iconSize: 36,
    iconRadius: 18,
  },
  typography: {
    value: {
      fontSize: 20,
      fontWeight: '700' as const,
    },
    unit: {
      fontSize: 13,
      fontWeight: '500' as const,
    },
    label: {
      fontSize: 12,
      fontWeight: '500' as const,
    },
    trend: {
      fontSize: 11,
      fontWeight: '600' as const,
    },
  },
};

export type KPIVariant = 'primary' | 'secondary' | 'accent' | 'neutral' | 'success' | 'warning';

interface KPICardProps {
  /** Icon name from MaterialCommunityIcons */
  icon: string;
  /** The KPI value to display */
  value: string | number;
  /** Label describing the KPI */
  label: string;
  /** Color variant */
  variant?: KPIVariant;
  /** Optional unit suffix (e.g., "kg", "%") */
  unit?: string;
  /** Optional trend indicator (-1 = down, 0 = neutral, 1 = up) */
  trend?: -1 | 0 | 1;
  /** Optional trend percentage */
  trendValue?: string;
  /** Whether the card is in loading state */
  isLoading?: boolean;
  /** Compact mode for smaller cards */
  compact?: boolean;
}

// Get variant colors based on theme colors
const getVariantStyles = (colors: ListColors): Record<KPIVariant, { bg: string; iconBg: string; iconColor: string }> => ({
  primary: {
    bg: colors.primaryLight,
    iconBg: colors.orangeLight,
    iconColor: colors.primary,
  },
  secondary: {
    bg: colors.statusNeutralLight,
    iconBg: colors.blueLight,
    iconColor: colors.statusNeutral,
  },
  accent: {
    bg: colors.statusPositiveLight,
    iconBg: colors.successLight,
    iconColor: colors.statusPositive,
  },
  neutral: {
    bg: colors.gray50,
    iconBg: colors.gray200,
    iconColor: colors.textSecondary,
  },
  success: {
    bg: colors.statusPositiveLight,
    iconBg: colors.successLight,
    iconColor: colors.statusPositive,
  },
  warning: {
    bg: colors.statusCriticalLight,
    iconBg: colors.warningLight,
    iconColor: colors.statusCritical,
  },
});

export const KPICard: React.FC<KPICardProps> = ({
  icon,
  value,
  label,
  variant = 'primary',
  unit,
  trend,
  trendValue,
  isLoading = false,
  compact = false,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Get variant styles based on theme colors
  const variantStyles = useMemo(() => getVariantStyles(colors), [colors]);
  const variantStyle = variantStyles[variant];

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    value: {
      fontSize: FIORI_STATIC.typography.value.fontSize,
      fontWeight: FIORI_STATIC.typography.value.fontWeight,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    valueCompact: {
      fontSize: 16,
    },
    unit: {
      fontSize: FIORI_STATIC.typography.unit.fontSize,
      fontWeight: FIORI_STATIC.typography.unit.fontWeight,
      color: colors.textSecondary,
      marginLeft: 3,
      flexShrink: 0,
    },
    unitCompact: {
      fontSize: 11,
    },
    label: {
      fontSize: FIORI_STATIC.typography.label.fontSize,
      fontWeight: FIORI_STATIC.typography.label.fontWeight,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    labelCompact: {
      fontSize: 11,
    },
    loadingIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.gray300,
    },
    loadingValue: {
      width: 50,
      height: 20,
      borderRadius: 4,
      backgroundColor: colors.gray200,
    },
    loadingLabel: {
      width: 60,
      height: 12,
      borderRadius: 4,
      backgroundColor: colors.gray200,
    },
  }), [colors]);

  const formatValue = (val: string | number): string => {
    if (typeof val === 'number') {
      return val.toLocaleString('en-IN');
    }
    return val;
  };

  const getTrendIcon = (): string => {
    if (trend === 1) return 'trending-up';
    if (trend === -1) return 'trending-down';
    return 'trending-neutral';
  };

  const getTrendColor = (): string => {
    if (trend === 1) return colors.statusPositive;
    if (trend === -1) return colors.statusNegative;
    return colors.textSecondary;
  };

  if (isLoading) {
    return (
      <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: variantStyle.bg }]}>
        <View style={[styles.iconContainer, compact && styles.iconContainerCompact, { backgroundColor: variantStyle.iconBg }]}>
          <View style={dynamicStyles.loadingIcon} />
        </View>
        <View style={dynamicStyles.loadingValue} />
        <View style={dynamicStyles.loadingLabel} />
      </View>
    );
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: variantStyle.bg }]}>
      {/* Icon in circular container */}
      <View style={[styles.iconContainer, compact && styles.iconContainerCompact, { backgroundColor: variantStyle.iconBg }]}>
        <Icon name={icon} size={compact ? 16 : 20} color={variantStyle.iconColor} />
      </View>

      {/* Value + Unit on same line */}
      <View style={styles.valueContainer}>
        <Text
          style={[dynamicStyles.value, compact && dynamicStyles.valueCompact]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {formatValue(value)}
        </Text>
        {unit && <Text style={[dynamicStyles.unit, compact && dynamicStyles.unitCompact]}>{unit}</Text>}
      </View>

      {/* Label */}
      <Text style={[dynamicStyles.label, compact && dynamicStyles.labelCompact]} numberOfLines={1}>
        {label}
      </Text>

      {/* Optional trend indicator */}
      {trend !== undefined && trendValue && (
        <View style={styles.trendContainer}>
          <Icon name={getTrendIcon()} size={12} color={getTrendColor()} />
          <Text style={[styles.trendValue, { color: getTrendColor() }]}>{trendValue}</Text>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// SAP Fiori Compliant Styles (Static layout only - colors are in dynamicStyles)
// ============================================================================
const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 110,
  },
  cardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 4,
    minHeight: 72,
  },
  iconContainer: {
    width: FIORI_STATIC.dimensions.iconSize,
    height: FIORI_STATIC.dimensions.iconSize,
    borderRadius: FIORI_STATIC.dimensions.iconRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trendValue: {
    fontSize: FIORI_STATIC.typography.trend.fontSize,
    fontWeight: FIORI_STATIC.typography.trend.fontWeight,
  },
});

export default KPICard;
