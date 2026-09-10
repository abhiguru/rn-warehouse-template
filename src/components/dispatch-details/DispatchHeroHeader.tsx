/**
 * DispatchHeroHeader Component (SAP Fiori Style)
 *
 * Mobile-first sticky header for Dispatch details screen
 * Features:
 * - Quick stats bar (items/quantity) with Fiori styling
 * - Platform-specific shadows
 * - Dynamic colors for dark mode support
 *
 * @see design/sap-fiori-specs/13-card.md - Header pattern reference
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI CONSTANTS (Static values only - colors are dynamic)
// ============================================================================

const FIORI_STATIC = {
  // Container
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Stat chips
  statChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  // Typography
  typography: {
    statValue: {
      fontSize: 18,
      fontWeight: '700' as const,
      lineHeight: 22,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '500' as const,
    },
  },
  // Shadow
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  }) as ViewStyle,
} as const;

// ============================================================================
// TYPES - Using snake_case to match backend
// ============================================================================

interface DispatchHeroHeaderProps {
  disp_no: string;
  date: string;
  total_items: number;
  total_quantity: number;
  customer_name?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DispatchHeroHeader: React.FC<DispatchHeroHeaderProps> = ({
  total_items,
  total_quantity,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Ensure all numeric values are valid numbers (handle null/undefined)
  const safeItems = Number(total_items) || 0;
  const safeQuantity = Number(total_quantity) || 0;

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    surface: {
      backgroundColor: colors.gray50,
      paddingHorizontal: FIORI_STATIC.container.paddingHorizontal,
      paddingVertical: FIORI_STATIC.container.paddingVertical,
      overflow: 'visible',
      ...FIORI_STATIC.shadow,
    },
    statChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cellBackground,
      paddingHorizontal: FIORI_STATIC.statChip.paddingHorizontal,
      paddingVertical: FIORI_STATIC.statChip.paddingVertical,
      borderRadius: FIORI_STATIC.statChip.borderRadius,
      borderWidth: FIORI_STATIC.statChip.borderWidth,
      borderColor: colors.gray100,
    },
    statValue: {
      ...FIORI_STATIC.typography.statValue,
      color: colors.gray900,
    },
    statLabel: {
      ...FIORI_STATIC.typography.statLabel,
      color: colors.gray600,
      marginTop: 1,
    },
  }), [colors]);

  return (
    <View style={dynamicStyles.surface}>
      {/* Quick Stats Chips */}
      <View style={styles.statsContainer}>
        {/* Items Chip */}
        <View style={dynamicStyles.statChip}>
          <Icon name="package-variant" size={18} color={colors.primary} />
          <View style={styles.statContent}>
            <Text style={dynamicStyles.statValue}>{safeItems}</Text>
            <Text style={dynamicStyles.statLabel}>Items</Text>
          </View>
        </View>

        {/* Quantity Chip */}
        <View style={[dynamicStyles.statChip, styles.statChipRight]}>
          <Icon name="weight-kilogram" size={18} color={colors.teal} />
          <View style={styles.statContent}>
            <Text style={[dynamicStyles.statValue, { color: colors.teal }]}>
              {safeQuantity}
            </Text>
            <Text style={dynamicStyles.statLabel}>Total Qty</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// STYLES (Static layout only - colors are in dynamicStyles)
// ============================================================================

const styles = StyleSheet.create({
  statsContainer: {
    flexDirection: 'row',
  },
  statChipRight: {
    marginLeft: 8,
  },
  statContent: {
    marginLeft: FIORI_STATIC.statChip.gap,
    flex: 1,
  },
});
