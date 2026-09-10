/**
 * GRNItemCard Component - SAP Fiori Design
 *
 * Item card for GRN details following SAP Fiori Card spec.
 * @see design/sap-fiori-specs/13-card.md
 *
 * Features:
 * - Fiori Card structure (header/body layout)
 * - Stock/Dispatch metrics with semantic colors
 * - Platform-specific shadows
 * - 44pt minimum touch targets
 * - listColors for consistent theming
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI CONSTANTS
// ============================================================================

const FIORI = {
  card: {
    cornerRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  typography: {
    title: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    value: {
      fontSize: 18,
      fontWeight: '700' as const,
    },
    label: {
      fontSize: 11,
      fontWeight: '500' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    chip: {
      fontSize: 12,
      fontWeight: '500' as const,
    },
  },
  touchTarget: 44,
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  }) as ViewStyle,
} as const;

// ============================================================================
// TYPES - Using snake_case to match backend RPC types
// ============================================================================

interface GRNItemCardProps {
  item_name: string;
  qty: number;
  stock: number;
  total_dispatched: number;
  weight?: number | null;
  packaging?: string | null;
  rack?: string | null;
  package_mark?: string | null;
  processed_images?: Array<{ id: string; image_url: string }>;
  onViewImages?: () => void;
  onViewDispatches?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

const GRNItemCardComponent: React.FC<GRNItemCardProps> = ({
  item_name,
  qty,
  stock,
  total_dispatched,
  weight,
  packaging,
  rack,
  package_mark,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Determine stock status using Fiori semantic colors
  const stockStatus = useMemo(() => {
    if (stock === 0) return 'negative';
    if (stock === qty) return 'positive';
    return 'critical';
  }, [stock, qty]);

  const stockColors = useMemo(() => {
    switch (stockStatus) {
      case 'negative':
        return {
          icon: colors.error,
          text: colors.error,
          bg: colors.errorLight,
        };
      case 'positive':
        return {
          icon: colors.success,
          text: colors.success,
          bg: colors.successLight,
        };
      default:
        return {
          icon: colors.warning,
          text: colors.warning,
          bg: colors.warningLight,
        };
    }
  }, [stockStatus, colors]);

  const hasDetails = package_mark || packaging || rack;

  return (
    <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
      {/* Header - Item name with quantity badge */}
      <View style={styles.header}>
        <Text style={[styles.itemName, { color: colors.gray900 }]} numberOfLines={2}>
          {item_name}
        </Text>
        <View style={[styles.quantityBadge, { backgroundColor: colors.primaryLight }]}>
          <Icon name="package-variant" size={16} color={colors.primary} />
          <Text style={[styles.quantityText, { color: colors.primary }]}>{qty}</Text>
        </View>
      </View>

      {/* Metrics Section */}
      <View style={[styles.metricsSection, { backgroundColor: colors.gray50, borderTopColor: colors.cellDivider }]}>
        {/* Stock */}
        <View style={styles.metricItem}>
          <View style={[styles.metricIconBg, { backgroundColor: stockColors.bg }]}>
            <Icon name="cube-outline" size={18} color={stockColors.icon} />
          </View>
          <Text style={[styles.metricValue, { color: stockColors.text }]}>{stock}</Text>
          <Text style={[styles.metricLabel, { color: colors.gray600 }]}>Stock</Text>
        </View>

        <View style={[styles.metricDivider, { backgroundColor: colors.cellDivider }]} />

        {/* Dispatched */}
        <View style={styles.metricItem}>
          <View style={[styles.metricIconBg, { backgroundColor: colors.tealLight }]}>
            <Icon name="truck-delivery" size={18} color={colors.teal} />
          </View>
          <Text style={[styles.metricValue, { color: colors.teal }]}>{total_dispatched}</Text>
          <Text style={[styles.metricLabel, { color: colors.gray600 }]}>Dispatched</Text>
        </View>

        {weight !== undefined && (
          <>
            <View style={[styles.metricDivider, { backgroundColor: colors.cellDivider }]} />
            <View style={styles.metricItem}>
              <View style={[styles.metricIconBg, { backgroundColor: colors.primaryLight }]}>
                <Icon name="weight-kilogram" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.metricValue, { color: colors.primary }]}>{weight}</Text>
              <Text style={[styles.metricLabel, { color: colors.gray600 }]}>kg</Text>
            </View>
          </>
        )}
      </View>

      {/* Details Chips */}
      {hasDetails && (
        <View style={[styles.detailsRow, { borderTopColor: colors.cellDivider }]}>
          {package_mark && (
            <View style={[styles.detailChip, { backgroundColor: colors.gray100 }]}>
              <Icon name="label-outline" size={14} color={colors.gray500} />
              <Text style={[styles.detailChipText, { color: colors.gray600 }]}>{package_mark}</Text>
            </View>
          )}
          {packaging && (
            <View style={[styles.detailChip, { backgroundColor: colors.gray100 }]}>
              <Icon name="package-variant-closed" size={14} color={colors.gray500} />
              <Text style={[styles.detailChipText, { color: colors.gray600 }]}>{packaging}</Text>
            </View>
          )}
          {rack && (
            <View style={[styles.detailChip, { backgroundColor: colors.gray100 }]}>
              <Icon name="view-grid-outline" size={14} color={colors.gray500} />
              <Text style={[styles.detailChipText, { color: colors.gray600 }]}>Rack: {rack}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  card: {
    marginHorizontal: FIORI.card.marginHorizontal,
    marginBottom: FIORI.card.marginBottom,
    borderRadius: FIORI.card.cornerRadius,
    borderWidth: FIORI.card.borderWidth,
    overflow: 'hidden',
    ...FIORI.shadow,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: FIORI.spacing.lg,
    paddingBottom: FIORI.spacing.md,
  },
  itemName: {
    flex: 1,
    ...FIORI.typography.title,
    marginRight: FIORI.spacing.sm,
  },
  quantityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: FIORI.spacing.xs,
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Metrics Section
  metricsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI.spacing.lg,
    paddingVertical: FIORI.spacing.md,
    borderTopWidth: 1,
  },
  metricItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: FIORI.spacing.xs,
  },
  metricIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    ...FIORI.typography.value,
    marginTop: FIORI.spacing.xs,
  },
  metricLabel: {
    ...FIORI.typography.label,
  },
  metricDivider: {
    width: 1,
    height: 48,
    marginHorizontal: FIORI.spacing.sm,
  },

  // Details Row
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: FIORI.spacing.lg,
    paddingTop: FIORI.spacing.md,
    paddingBottom: FIORI.spacing.lg,
    gap: FIORI.spacing.sm,
    borderTopWidth: 1,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: FIORI.spacing.md,
    borderRadius: 16,
    gap: FIORI.spacing.xs,
  },
  detailChipText: {
    ...FIORI.typography.chip,
  },
});

// Export memoized component for performance
export const GRNItemCard = React.memo(GRNItemCardComponent);
