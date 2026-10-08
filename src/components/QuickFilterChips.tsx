import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { listColors } from '@/theme/listColors';

export type QuickFilterPeriod = 'last7days' | 'last30days' | 'last3months' | 'alltime';

interface QuickFilterChipsProps {
  selectedPeriod: QuickFilterPeriod | null;
  onSelectPeriod: (period: QuickFilterPeriod) => void;
}

// ============================================================================
// SAP Fiori Chip Spec Constants (from 09-chip.md)
// ============================================================================
const FIORI = {
  // Dimensions
  chipHeight: 32,
  chipMinWidth: 64,
  chipPaddingHorizontal: 12,
  chipPaddingHorizontalSelected: 16,
  chipPaddingVertical: 6,
  chipBorderRadius: 16, // Pill shape
  chipSpacing: 8,
  touchTarget: 44,

  // Typography
  fontSize: 14,
  fontWeight: '500' as const,

  // Icons
  iconSize: 16,
  iconTextGap: 4,

  // Colors - Chips with Leading Icon (no checkmark)
  colors: {
    unselected: {
      background: '#F2F2F7',
      border: 'transparent',
      text: listColors.textPrimary,
      icon: listColors.gray600,
    },
    selected: {
      background: listColors.primary,
      border: 'transparent',
      text: listColors.white,
      icon: listColors.white,
    },
    pressed: {
      unselected: '#E5E5E5',
      selected: listColors.primaryDark,
    },
  },
};

const QuickFilterChips: React.FC<QuickFilterChipsProps> = ({
  selectedPeriod,
  onSelectPeriod,
}) => {
  const filters: Array<{ id: QuickFilterPeriod; label: string; iconName: string }> = [
    { id: 'last7days', label: 'Last 7 Days', iconName: 'calendar-week' },
    { id: 'last30days', label: 'Last 30 Days', iconName: 'calendar-month' },
    { id: 'last3months', label: 'Last 3 Months', iconName: 'calendar-range' },
    { id: 'alltime', label: 'All Time', iconName: 'calendar-star' },
  ];

  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel="Quick filter by time period"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {filters.map((filter) => {
          const isSelected = selectedPeriod === filter.id;
          return (
            <TouchableOpacity
              key={filter.id}
              style={[
                styles.chip,
                isSelected && styles.chipSelected,
                // Ensure 44pt touch target with wrapper padding
                styles.touchWrapper,
              ]}
              onPress={() => onSelectPeriod(filter.id)}
              activeOpacity={0.7}
              accessible
              accessibilityRole="radio"
              accessibilityLabel={filter.label}
              accessibilityState={{ checked: isSelected }}
              accessibilityHint={`Filter to show ${filter.label.toLowerCase()}`}
            >
              <Icon
                name={filter.iconName}
                size={FIORI.iconSize}
                color={
                  isSelected
                    ? FIORI.colors.selected.icon
                    : FIORI.colors.unselected.icon
                }
              />
              <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  // SAP Fiori Container
  container: {
    backgroundColor: listColors.white,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: listColors.gray100,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: FIORI.chipSpacing,
    // Add vertical padding to allow touch target expansion
    paddingVertical: (FIORI.touchTarget - FIORI.chipHeight) / 2,
  },
  // SAP Fiori Chip styles (with leading icon - no checkmark)
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: FIORI.chipHeight,
    minWidth: FIORI.chipMinWidth,
    paddingHorizontal: FIORI.chipPaddingHorizontal,
    backgroundColor: FIORI.colors.unselected.background,
    borderRadius: FIORI.chipBorderRadius,
    gap: FIORI.iconTextGap,
  },
  chipSelected: {
    backgroundColor: FIORI.colors.selected.background,
    paddingHorizontal: FIORI.chipPaddingHorizontalSelected,
    // Platform-specific shadow for selected chip
    ...Platform.select({
      ios: {
        shadowColor: listColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  touchWrapper: {
    // Ensure minimum 44pt touch target
    minHeight: FIORI.touchTarget,
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: FIORI.fontSize,
    fontWeight: FIORI.fontWeight,
    color: FIORI.colors.unselected.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  chipLabelSelected: {
    color: FIORI.colors.selected.text,
    fontWeight: '600',
  },
});

export default QuickFilterChips;
