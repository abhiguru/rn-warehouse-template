/**
 * InvoiceHeroHeader Component - 100% SAP Fiori Compliant
 *
 * KPI Header for Invoice details screen showing key metrics
 * Based on SAP Fiori for iOS Design Guidelines
 *
 * @see design/sap-fiori-specs/13-card.md - KPI Card patterns
 * @see design/sap-fiori-specs/01-object-cell.md - Status semantics
 *
 * Features:
 * - Three KPI metrics with semantic colors
 * - Fiori semantic status colors
 * - Platform-specific shadows
 * - Accessible labels
 * - Dynamic colors for dark mode support
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatCurrency } from '@/utils/formatters';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
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
  }) as ViewStyle,
} as const;

// ============================================================================
// TYPES
// ============================================================================
interface InvoiceHeroHeaderProps {
  invoice_number: number;
  date: string;
  total_items: number;
  total_amount: number;
  tax_amount: number;
  customer_name?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================
export const InvoiceHeroHeader: React.FC<InvoiceHeroHeaderProps> = ({
  total_items,
  total_amount,
  tax_amount,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Ensure all numeric values are valid numbers (handle null/undefined)
  const safeItems = Number(total_items) || 0;
  const safeAmount = Number(total_amount) || 0;
  const safeTax = Number(tax_amount) || 0;

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: colors.gray50,
      paddingHorizontal: FIORI_STATIC.dimensions.containerPadding,
      paddingVertical: FIORI_STATIC.spacing.md,
      ...FIORI_STATIC.shadow,
    },
    kpiCard: {
      flex: 1,
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI_STATIC.dimensions.kpiCardRadius,
      borderWidth: 1,
      borderColor: colors.cellDivider,
      paddingVertical: FIORI_STATIC.spacing.sm,
      paddingHorizontal: FIORI_STATIC.spacing.xs,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 72,
    },
    kpiValue: {
      ...FIORI_STATIC.typography.kpiValue,
      color: colors.gray900,
      textAlign: 'center',
      marginTop: FIORI_STATIC.spacing.xs,
    },
    kpiLabel: {
      ...FIORI_STATIC.typography.kpiLabel,
      color: colors.gray600,
      textAlign: 'center',
      marginTop: 2,
    },
  }), [colors]);

  // KPI Card Component - Fiori Style (Vertical Layout for better readability)
  const KPICard = ({
    icon,
    iconColor,
    value,
    label,
    valueColor,
    accessibilityLabel,
    isAmount = false,
  }: {
    icon: string;
    iconColor: string;
    value: number;
    label: string;
    valueColor?: string;
    accessibilityLabel: string;
    isAmount?: boolean;
  }) => (
    <View
      style={dynamicStyles.kpiCard}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
    >
      {/* Icon - Top */}
      <Icon name={icon} size={FIORI_STATIC.dimensions.kpiIconSize} color={iconColor} />

      {/* Value - Center (single line) */}
      <Text
        style={[dynamicStyles.kpiValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {isAmount ? formatCurrency(value) : value}
      </Text>

      {/* Label - Bottom */}
      <Text style={dynamicStyles.kpiLabel} numberOfLines={1}>{label}</Text>
    </View>
  );

  return (
    <View style={dynamicStyles.container}>
      {/* KPI Cards Row */}
      <View style={styles.kpiRow}>
        {/* Items KPI */}
        <KPICard
          icon="package-variant"
          iconColor={colors.primary}
          value={safeItems}
          label="Items"
          accessibilityLabel={`Total items: ${safeItems}`}
        />

        {/* Total Amount KPI */}
        <KPICard
          icon="currency-inr"
          iconColor={colors.success}
          value={safeAmount}
          label="Total"
          valueColor={colors.success}
          accessibilityLabel={`Total amount: ${formatCurrency(safeAmount)}`}
          isAmount
        />

        {/* Tax Amount KPI */}
        <KPICard
          icon="percent"
          iconColor={colors.primary}
          value={safeTax}
          label="Tax"
          valueColor={colors.primary}
          accessibilityLabel={`Tax amount: ${formatCurrency(safeTax)}`}
          isAmount
        />
      </View>
    </View>
  );
};

// ============================================================================
// STYLES (Static layout only - colors are in dynamicStyles)
// ============================================================================
const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    gap: FIORI_STATIC.spacing.sm,
  },
});
