/**
 * Quick period filter chips (docs/STYLE_GUIDE.md §13.5).
 *
 * Unselected: surface.card, 1 px border.button, text.primary.
 * Selected: brand.subtle, brand.tint and a check icon.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Insets } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export type QuickFilterPeriod = 'last7days' | 'last30days' | 'last3months' | 'alltime';

interface QuickFilterChipsProps {
  selectedPeriod: QuickFilterPeriod | null;
  onSelectPeriod: (period: QuickFilterPeriod) => void;
}

const CHIP_HEIGHT = 32;
const CHIP_MIN_WIDTH = 64;
const CHIP_HIT_SLOP: Insets = {
  top: (touchTarget - CHIP_HEIGHT) / 2,
  bottom: (touchTarget - CHIP_HEIGHT) / 2,
};

const FILTERS: Array<{ id: QuickFilterPeriod; label: string; iconName: string }> = [
  { id: 'last7days', label: 'Last 7 days', iconName: 'calendar-week' },
  { id: 'last30days', label: 'Last 30 days', iconName: 'calendar-month' },
  { id: 'last3months', label: 'Last 3 months', iconName: 'calendar-range' },
  { id: 'alltime', label: 'All time', iconName: 'calendar-star' },
];

const QuickFilterChips: React.FC<QuickFilterChipsProps> = ({
  selectedPeriod,
  onSelectPeriod,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel="Time period"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {FILTERS.map((filter) => {
          const isSelected = selectedPeriod === filter.id;
          return (
            <Pressable
              key={filter.id}
              style={({ pressed }) => [
                styles.chip,
                isSelected && styles.chipSelected,
                pressed && (isSelected ? styles.chipSelectedPressed : styles.chipPressed),
              ]}
              onPress={() => onSelectPeriod(filter.id)}
              hitSlop={CHIP_HIT_SLOP}
              accessibilityRole="radio"
              accessibilityLabel={filter.label}
              accessibilityState={{ checked: isSelected, selected: isSelected }}
            >
              <Icon
                name={isSelected ? 'check' : filter.iconName}
                size={iconSize.sm}
                color={isSelected ? t.brand.tint : t.icon.secondary}
              />
              <Text
                style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}
                maxFontSizeMultiplier={1.6}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.header,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  scrollContent: {
    paddingHorizontal: layout.marginCompact,
    gap: space.sm,
    // Room for the padded touch area above and below each chip
    paddingVertical: (touchTarget - CHIP_HEIGHT) / 2,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: CHIP_HEIGHT,
    minWidth: CHIP_MIN_WIDTH,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    backgroundColor: t.surface.card,
    borderWidth: 1,
    borderColor: t.border.button,
    borderRadius: radius.pill,
    gap: space.xs,
  },
  chipPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  chipSelected: {
    backgroundColor: t.brand.subtle,
    borderColor: t.brand.subtle,
  },
  chipSelectedPressed: {
    backgroundColor: t.brand.subtleStrong,
    borderColor: t.brand.subtleStrong,
  },
  chipLabel: {
    ...typography.caption1,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
  },
  chipLabelSelected: {
    color: t.brand.tint,
    fontWeight: fontWeight.semibold,
  },
});

export default QuickFilterChips;
