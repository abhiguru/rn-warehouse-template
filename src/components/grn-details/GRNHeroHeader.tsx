/**
 * GRNHeroHeader Component - 100% SAP Fiori Compliant
 *
 * KPI Header for GRN details screen showing key metrics
 * Based on SAP Fiori for iOS Design Guidelines
 *
 * @see design/sap-fiori-specs/13-card.md - KPI Card patterns
 * @see design/sap-fiori-specs/19-linear-progress-indicator.md - Progress bar spec
 * @see design/sap-fiori-specs/01-object-cell.md - Status semantics
 *
 * Features:
 * - Three KPI metrics with semantic colors
 * - Segmented progress bar showing stock/dispatch breakdown
 * - Fiori semantic status colors
 * - Platform-specific shadows
 * - Accessible labels
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { FioriSegmentedProgress } from '@/components/FioriLinearProgress';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS
// Based on SAP Fiori for iOS Design Guidelines
// ============================================================================
const FIORI = {
  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  // Dimensions
  dimensions: {
    kpiCardRadius: 10,
    kpiIconSize: 20,
    containerPadding: 16,
  },
  // Typography - Fiori iOS
  typography: {
    kpiValue: {
      fontSize: 20,
      fontWeight: '700' as const,
      letterSpacing: 0.35,
    },
    kpiLabel: {
      fontSize: 11,
      fontWeight: '500' as const,
      letterSpacing: 0.07,
    },
    kpiUnit: {
      fontSize: 12,
      fontWeight: '400' as const,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
    },
    percentageLabel: {
      fontSize: 12,
      fontWeight: '600' as const,
    },
  },
  // Colors - Fiori Semantic
  colors: {
    // Backgrounds
    background: '#F7F9FA', // Fiori grouped background
    kpiCardBackground: '#FFFFFF',
    kpiCardBorder: '#E5E5E5',
    // Semantic Status Colors (Fiori Object Cell spec)
    primary: '#f69000', // Brand orange - Total quantity
    positive: '#36A41D', // Fiori Positive - Stock available (changed from teal)
    critical: '#E9730C', // Fiori Critical - Low stock warning
    negative: '#D32030', // Fiori Negative - Empty/error
    informative: '#0057D2', // Fiori Informative - Dispatched
    neutral: '#7e8e9d', // Fiori Neutral - Secondary text
    // Text
    textPrimary: '#1D2D3E',
    textSecondary: '#556B82',
    textTertiary: '#7e8e9d',
    // Progress segments
    stockSegment: '#36A41D', // Fiori Positive green
    dispatchSegment: '#0057D2', // Fiori Informative blue
    progressTrack: '#E5E5E5',
  },
  // Shadow - Fiori elevation
  shadow: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  }),
} as const;

// ============================================================================
// TYPES
// ============================================================================
interface GRNHeroHeaderProps {
  gr_no: string;
  date: string;
  total_qty: number;
  total_stock: number;
  total_dispatched: number;
  customer_name?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================
export const GRNHeroHeader: React.FC<GRNHeroHeaderProps> = ({
  total_qty,
  total_stock,
  total_dispatched,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Ensure all numeric values are valid numbers (handle null/undefined)
  const safeQty = Number(total_qty) || 0;
  const safeStock = Number(total_stock) || 0;
  const safeDispatched = Number(total_dispatched) || 0;

  // Calculate percentages for display
  const stockPercentage = safeQty > 0 ? Math.round((safeStock / safeQty) * 100) : 0;
  const dispatchPercentage = safeQty > 0 ? Math.round((safeDispatched / safeQty) * 100) : 0;

  // Determine stock status color based on level (Fiori semantic)
  const getStockStatusColor = () => {
    if (safeStock === 0) return colors.error; // Empty - Red
    if (safeQty > 0 && safeStock < safeQty * 0.2) return colors.warning; // Low - Orange
    return colors.success; // Good - Green
  };

  const stockColor = getStockStatusColor();

  // KPI Card Component - Fiori Style (Vertical Layout for better readability)
  const KPICard = ({
    icon,
    iconColor,
    value,
    label,
    valueColor,
    accessibilityLabel,
  }: {
    icon: string;
    iconColor: string;
    value: number;
    label: string;
    valueColor?: string;
    accessibilityLabel: string;
  }) => (
    <View
      style={[styles.kpiCard, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
    >
      {/* Icon - Top */}
      <Icon name={icon} size={FIORI.dimensions.kpiIconSize} color={iconColor} />

      {/* Value - Center (single line) */}
      <Text
        style={[styles.kpiValue, { color: colors.gray900 }, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>

      {/* Label - Bottom */}
      <Text style={[styles.kpiLabel, { color: colors.gray600 }]} numberOfLines={1}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* KPI Cards Row */}
      <View style={styles.kpiRow}>
        {/* Total Quantity KPI */}
        <KPICard
          icon="package-variant"
          iconColor={colors.primary}
          value={safeQty}
          label="Total Qty"
          accessibilityLabel={`Total quantity: ${safeQty} items`}
        />

        {/* In Stock KPI */}
        <KPICard
          icon="cube-outline"
          iconColor={stockColor}
          value={safeStock}
          label="In Stock"
          valueColor={stockColor}
          accessibilityLabel={`In stock: ${safeStock} items, ${stockPercentage}% of total`}
        />

        {/* Dispatched KPI */}
        <KPICard
          icon="truck-delivery-outline"
          iconColor={colors.teal}
          value={safeDispatched}
          label="Dispatched"
          valueColor={colors.teal}
          accessibilityLabel={`Dispatched: ${safeDispatched} items, ${dispatchPercentage}% of total`}
        />
      </View>

      {/* Stock Distribution Progress Bar */}
      <View style={styles.progressSection}>
        {/* Progress Labels */}
        <View style={styles.progressLabelsRow}>
          <View style={styles.progressLabelItem}>
            <View style={[styles.progressLabelDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.progressLabelText, { color: colors.gray600 }]}>
              Stock <Text style={[styles.progressPercentage, { color: colors.gray900 }]}>{stockPercentage}%</Text>
            </Text>
          </View>
          <View style={styles.progressLabelItem}>
            <View style={[styles.progressLabelDot, { backgroundColor: colors.teal }]} />
            <Text style={[styles.progressLabelText, { color: colors.gray600 }]}>
              Dispatched <Text style={[styles.progressPercentage, { color: colors.gray900 }]}>{dispatchPercentage}%</Text>
            </Text>
          </View>
        </View>

        {/* Segmented Progress Bar */}
        <View style={styles.progressBarContainer}>
          <FioriSegmentedProgress
            segments={[
              {
                value: safeStock,
                color: colors.success,
              },
              {
                value: safeDispatched,
                color: colors.teal,
              },
            ]}
            total={safeQty}
            size="prominent"
            showLabels={false}
          />
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// STYLES - 100% FIORI COMPLIANT
// ============================================================================
const styles = StyleSheet.create({
  // Container
  container: {
    paddingHorizontal: FIORI.dimensions.containerPadding,
    paddingVertical: FIORI.spacing.md,
    ...FIORI.shadow,
  },

  // KPI Row - Horizontal layout
  kpiRow: {
    flexDirection: 'row',
    gap: FIORI.spacing.sm,
  },

  // KPI Card - Fiori Card style (Vertical layout)
  kpiCard: {
    flex: 1,
    borderRadius: FIORI.dimensions.kpiCardRadius,
    borderWidth: 1,
    paddingVertical: FIORI.spacing.sm,
    paddingHorizontal: FIORI.spacing.xs,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },

  // KPI Value - Large number (single line)
  kpiValue: {
    ...FIORI.typography.kpiValue,
    textAlign: 'center',
    marginTop: FIORI.spacing.xs,
  },

  // KPI Label - Small text
  kpiLabel: {
    ...FIORI.typography.kpiLabel,
    textAlign: 'center',
    marginTop: 2,
  },

  // Progress Section
  progressSection: {
    marginTop: FIORI.spacing.md,
  },

  // Progress Labels Row
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: FIORI.spacing.lg,
    marginBottom: FIORI.spacing.sm,
  },

  // Progress Label Item
  progressLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
  },

  // Progress Label Dot
  progressLabelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Progress Label Text
  progressLabelText: {
    ...FIORI.typography.kpiLabel,
  },

  // Progress Percentage
  progressPercentage: {
    ...FIORI.typography.percentageLabel,
  },

  // Progress Bar Container
  progressBarContainer: {
    // The FioriSegmentedProgress handles its own styling
  },
});
