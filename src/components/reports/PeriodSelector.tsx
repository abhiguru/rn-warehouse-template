/**
 * PeriodSelector: the period control at the top of report screens.
 *
 * A segmented control per docs/STYLE_GUIDE.md §13.4 and §13.11: container outline
 * `border.button`, the selected segment `brand.fill` with `brand.onFill` text and
 * a bold label, other segments `text.primary`. The optional "Custom" choice is a
 * separate chip after the control, so the control keeps at most four segments.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
} from '@/theme/tokens';
import type { ReportPeriod } from '@/types/report.types';

interface PeriodOption {
  id: ReportPeriod;
  label: string;
  accessibilityLabel: string;
  days?: number;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { id: 'last120days', label: '120 days', accessibilityLabel: 'Last 120 days', days: 120 },
  { id: 'last240days', label: '240 days', accessibilityLabel: 'Last 240 days', days: 240 },
  { id: 'last364days', label: '364 days', accessibilityLabel: 'Last 364 days', days: 364 },
  { id: 'last420days', label: '420 days', accessibilityLabel: 'Last 420 days', days: 420 },
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

/** Segment height; the touch area is padded to `touchTarget` with hitSlop. */
const SEGMENT_HEIGHT = 36;
const SEGMENT_SLOP = Math.max(0, Math.ceil((touchTarget - SEGMENT_HEIGHT) / 2));

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: t.surface.header,
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    segmented: {
      flex: 1,
      flexDirection: 'row',
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: t.border.button,
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
      minHeight: SEGMENT_HEIGHT,
      paddingHorizontal: space.xs,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surface.card,
    },
    segmentDivider: {
      borderLeftWidth: 1,
      borderLeftColor: t.border.button,
    },
    segmentPressed: {
      backgroundColor: t.brand.subtle,
    },
    segmentSelected: {
      backgroundColor: t.brand.fill,
    },
    segmentText: {
      ...typography.callout,
      color: t.text.primary,
      textAlign: 'center',
    },
    segmentTextSelected: {
      fontWeight: fontWeight.semibold,
      color: t.brand.onFill,
    },
    customChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      minHeight: SEGMENT_HEIGHT,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.border.button,
      backgroundColor: t.surface.card,
    },
    customChipSelected: {
      backgroundColor: t.brand.subtle,
      borderColor: t.brand.tint,
    },
    customChipText: {
      ...typography.callout,
      color: t.text.primary,
    },
    customChipTextSelected: {
      fontWeight: fontWeight.semibold,
      color: t.brand.tint,
    },
  });

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onPeriodChange,
  showCustomOption = false,
  onCustomPress,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handlePeriodSelect = (period: ReportPeriod) => {
    if (period === 'custom' && onCustomPress) {
      onCustomPress();
      return;
    }
    const dateRange = getDateRangeForPeriod(period);
    onPeriodChange(period, dateRange);
  };

  const customSelected = selectedPeriod === 'custom';

  return (
    <View style={styles.container}>
      <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Report period">
        {PERIOD_OPTIONS.map((option, index) => {
          const isSelected = selectedPeriod === option.id;
          return (
            <Pressable
              key={option.id}
              style={({ pressed }) => [
                styles.segment,
                index > 0 && styles.segmentDivider,
                pressed && !isSelected && styles.segmentPressed,
                isSelected && styles.segmentSelected,
              ]}
              hitSlop={{ top: SEGMENT_SLOP, bottom: SEGMENT_SLOP }}
              onPress={() => handlePeriodSelect(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              accessibilityLabel={option.accessibilityLabel}
            >
              <Text
                style={[styles.segmentText, isSelected && styles.segmentTextSelected]}
                maxFontSizeMultiplier={1.6}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {showCustomOption && (
        <Pressable
          style={({ pressed }) => [
            styles.customChip,
            (customSelected || pressed) && styles.customChipSelected,
          ]}
          hitSlop={{ top: SEGMENT_SLOP, bottom: SEGMENT_SLOP }}
          onPress={() => handlePeriodSelect('custom')}
          accessibilityRole="button"
          accessibilityState={{ selected: customSelected }}
          accessibilityLabel="Custom date range"
        >
          <Icon
            name={customSelected ? 'check' : 'calendar-range'}
            size={iconSize.sm}
            color={customSelected ? t.brand.tint : t.icon.secondary}
          />
          <Text
            style={[styles.customChipText, customSelected && styles.customChipTextSelected]}
            maxFontSizeMultiplier={1.6}
          >
            Custom
          </Text>
        </Pressable>
      )}
    </View>
  );
};

// Export the utility function for use in components
export { getDateRangeForPeriod };

export default PeriodSelector;
