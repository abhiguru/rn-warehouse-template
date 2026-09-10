/**
 * PeriodSelector Component - SAP Fiori Compliant
 *
 * A reusable component for selecting date ranges with preset options.
 * Follows SAP Fiori Chip/Segmented Control spec.
 *
 * @see design/sap-fiori-specs/09-chip.md
 * @see design/sap-fiori-specs/15-segmented-control.md
 * @see src/theme/index.ts - FioriColors interface
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import type { ReportPeriod } from '@/types/report.types';

// ============================================================================
// SAP Fiori Design Tokens (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
  dimensions: {
    chipHeight: 36,
    chipPaddingH: 14,
    chipRadius: 18,   // Pill shape per Fiori spec
  },
  typography: {
    chip: {
      fontSize: 14,
      fontWeight: '500' as const,
    },
  },
};

interface PeriodOption {
  id: ReportPeriod;
  label: string;
  days?: number;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { id: 'last120days', label: '120d', days: 120 },
  { id: 'last240days', label: '240d', days: 240 },
  { id: 'last364days', label: '364d', days: 364 },
  { id: 'last420days', label: '420d', days: 420 },
];

interface PeriodSelectorProps {
  /** Currently selected period */
  selectedPeriod: ReportPeriod;
  /** Callback when period changes */
  onPeriodChange: (period: ReportPeriod, dateRange: { from: string; to: string }) => void;
  /** Whether to show the custom date option */
  showCustomOption?: boolean;
  /** Callback for custom date selection */
  onCustomPress?: () => void;
}

/**
 * Calculate date range for a given period
 * Standardized periods: 120d, 240d, 364d, 420d
 */
function getDateRangeForPeriod(period: ReportPeriod): { from: string; to: string } {
  const today = new Date();
  const toDate = today.toISOString().split('T')[0];

  // Map period to days
  const periodDays: Record<ReportPeriod, number> = {
    last120days: 120,
    last240days: 240,
    last364days: 364,
    last420days: 420,
    custom: 0,
  };

  const days = periodDays[period] || 120; // Default to 120 days
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1)); // -1 because we include today

  return { from: from.toISOString().split('T')[0], to: toDate };
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onPeriodChange,
  showCustomOption = false,
  onCustomPress,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: colors.cellBackground,
      paddingVertical: 10,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      height: FIORI_STATIC.dimensions.chipHeight,
      paddingHorizontal: FIORI_STATIC.dimensions.chipPaddingH,
      borderRadius: FIORI_STATIC.dimensions.chipRadius,
      backgroundColor: colors.gray100,
      borderWidth: 1,
      borderColor: colors.gray200,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipPressed: {
      backgroundColor: colors.cellBackgroundPressed,
    },
    chipText: {
      fontSize: FIORI_STATIC.typography.chip.fontSize,
      fontWeight: FIORI_STATIC.typography.chip.fontWeight,
      color: colors.textPrimary,
    },
    chipTextSelected: {
      color: colors.textInverse,
    },
  }), [colors]);

  const handlePeriodSelect = (period: ReportPeriod) => {
    if (period === 'custom' && onCustomPress) {
      onCustomPress();
      return;
    }
    const dateRange = getDateRangeForPeriod(period);
    onPeriodChange(period, dateRange);
  };

  return (
    <View style={dynamicStyles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {PERIOD_OPTIONS.map((option) => {
          const isSelected = selectedPeriod === option.id;
          return (
            <Pressable
              key={option.id}
              style={({ pressed }) => [
                dynamicStyles.chip,
                isSelected && dynamicStyles.chipSelected,
                pressed && !isSelected && dynamicStyles.chipPressed,
              ]}
              onPress={() => handlePeriodSelect(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${option.label} period`}
            >
              <Text style={[dynamicStyles.chipText, isSelected && dynamicStyles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        {showCustomOption && (
          <Pressable
            style={({ pressed }) => [
              dynamicStyles.chip,
              selectedPeriod === 'custom' && dynamicStyles.chipSelected,
              pressed && selectedPeriod !== 'custom' && dynamicStyles.chipPressed,
            ]}
            onPress={() => handlePeriodSelect('custom')}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedPeriod === 'custom' }}
            accessibilityLabel="Custom date range"
          >
            <Icon
              name="calendar-range"
              size={14}
              color={selectedPeriod === 'custom' ? colors.textInverse : colors.textSecondary}
            />
            <Text
              style={[dynamicStyles.chipText, selectedPeriod === 'custom' && dynamicStyles.chipTextSelected]}
            >
              Custom
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
};

// ============================================================================
// SAP Fiori Compliant Styles (Static layout only - colors are in dynamicStyles)
// @see design/sap-fiori-specs/09-chip.md
// ============================================================================
const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
});

// Export the utility function for use in components
export { getDateRangeForPeriod };

export default PeriodSelector;
