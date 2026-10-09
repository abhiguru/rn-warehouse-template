/**
 * AppliedFiltersBar Component (SAP Fiori Filter Feedback Bar)
 *
 * A horizontal bar that displays active filter chips with remove functionality.
 * Follows SAP Fiori Filter Feedback Bar specification (05-filter-feedback-bar.md).
 *
 * Features:
 * - Horizontal scrollable bar with filter chips
 * - Applied filter chips (brand.subtle pill, brand.tint label, close icon)
 * - Tertiary "Clear all" button
 * - 44pt minimum touch targets per Fiori accessibility spec
 *
 * Usage:
 * ```tsx
 * <AppliedFiltersBar
 *   filters={filters}
 *   activeFilterCount={activeFilterCount}
 *   onUpdateFilter={updateFilter}
 *   onClearAll={clearFilter}
 * />
 * ```
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Insets,
} from 'react-native';
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
import type { AutocompleteSelection } from '@/types/filter.types';

const CHIP_HEIGHT = 32;
const CHIP_HIT_SLOP: Insets = {
  top: (touchTarget - CHIP_HEIGHT) / 2,
  bottom: (touchTarget - CHIP_HEIGHT) / 2,
};

/** "9 Oct 2026" (style guide §12.3). */
const formatChipDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// ============================================================================
// TYPES
// ============================================================================

interface AppliedFiltersBarProps {
  filters: Record<string, unknown>;
  activeFilterCount: number;
  onUpdateFilter: (key: string, value: unknown) => void;
  onClearAll: () => void;
  /** Custom filter chip configurations */
  customChips?: FilterChipConfig[];
}

interface FilterChipConfig {
  /** Filter key to check */
  filterKey: string;
  /** Icon to display (MaterialCommunityIcons name) */
  icon: string;
  /** How to render the label */
  labelRenderer?: (value: unknown) => string;
  /** Value to set when removed (default: undefined) */
  clearValue?: unknown;
  /** For array filters - render each item as chip */
  isArray?: boolean;
  /** For range filters - keys to clear */
  rangeKeys?: [string, string];
}

// ============================================================================
// DEFAULT CHIP CONFIGS
// ============================================================================

const DEFAULT_CHIP_CONFIGS: FilterChipConfig[] = [
  {
    filterKey: 'itemName',
    icon: 'cube-outline',
    isArray: true,
  },
  {
    filterKey: 'customerName',
    icon: 'account-outline',
    isArray: true,
  },
  {
    filterKey: 'grNo',
    icon: 'package-down',
    isArray: true,
  },
  {
    filterKey: 'stockStatus',
    icon: 'warehouse',
    labelRenderer: (value) =>
      value === 'in_stock'
        ? 'In stock'
        : value === 'out_of_stock'
          ? 'Out of stock'
          : String(value),
    clearValue: 'all',
  },
  {
    filterKey: 'packageMark',
    icon: 'tag-outline',
    clearValue: '',
  },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ActiveFilterChipProps {
  iconName: string;
  label: string;
  onRemove: () => void;
}

/**
 * Applied filter chip, matching FilterChip: brand.subtle pill, brand.tint
 * label and icons. The whole chip removes the filter.
 */
const ActiveFilterChip = memo(function ActiveFilterChip({
  iconName,
  label,
  onRemove,
}: ActiveFilterChipProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed }) => [styles.activeChip, pressed && styles.activeChipPressed]}
      onPress={onRemove}
      hitSlop={CHIP_HIT_SLOP}
      accessibilityLabel={`Remove filter ${label}`}
      accessibilityRole="button"
    >
      <Icon name={iconName} size={iconSize.sm} color={t.brand.tint} />
      <Text style={styles.activeChipText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
      <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
    </Pressable>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function AppliedFiltersBar({
  filters,
  activeFilterCount,
  onUpdateFilter,
  onClearAll,
  customChips,
}: AppliedFiltersBarProps) {
  const styles = useThemedStyles(makeStyles);

  // Don't render if no active filters
  if (activeFilterCount === 0) return null;

  const chipConfigs = customChips || DEFAULT_CHIP_CONFIGS;

  // Build chips array
  const chips: React.ReactNode[] = [];

  // Process each chip config
  chipConfigs.forEach((config) => {
    const value = filters[config.filterKey];

    if (config.isArray && Array.isArray(value) && value.length > 0) {
      // Render each array item as a separate chip
      value.forEach((item: AutocompleteSelection, index: number) => {
        chips.push(
          <ActiveFilterChip
            key={`${config.filterKey}-${item.id || index}`}
            iconName={config.icon}
            label={item.label}
            onRemove={() => {
              const newSelections = value.filter(
                (i: AutocompleteSelection) => i.id !== item.id
              );
              onUpdateFilter(
                config.filterKey,
                newSelections.length > 0 ? newSelections : []
              );
            }}
          />
        );
      });
    } else if (config.rangeKeys) {
      // Range filter (e.g., weight min/max, date from/to)
      const [minKey, maxKey] = config.rangeKeys;
      const minVal = filters[minKey];
      const maxVal = filters[maxKey];

      if (minVal !== undefined || maxVal !== undefined) {
        const label = config.labelRenderer
          ? config.labelRenderer({ min: minVal, max: maxVal })
          : `${minVal || '0'} - ${maxVal || '∞'}`;

        chips.push(
          <ActiveFilterChip
            key={config.filterKey}
            iconName={config.icon}
            label={label}
            onRemove={() => {
              onUpdateFilter(minKey, undefined);
              onUpdateFilter(maxKey, undefined);
            }}
          />
        );
      }
    } else if (value && value !== config.clearValue && value !== 'all') {
      // Single value filter
      const label = config.labelRenderer
        ? config.labelRenderer(value)
        : String(value);

      chips.push(
        <ActiveFilterChip
          key={config.filterKey}
          iconName={config.icon}
          label={label}
          onRemove={() =>
            onUpdateFilter(config.filterKey, config.clearValue ?? undefined)
          }
        />
      );
    }
  });

  // Weight range (special case - common filter)
  const weightMin = filters.weightMin;
  const weightMax = filters.weightMax;
  if (weightMin !== undefined || weightMax !== undefined) {
    chips.push(
      <ActiveFilterChip
        key="weight-range"
        iconName="scale-balance"
        label={`${weightMin || '0'} - ${weightMax || '∞'} kg`}
        onRemove={() => {
          onUpdateFilter('weightMin', undefined);
          onUpdateFilter('weightMax', undefined);
        }}
      />
    );
  }

  // Date range (special case - common filter)
  const dateFrom = filters.dateFrom as string | undefined;
  const dateTo = filters.dateTo as string | undefined;
  if (dateFrom || dateTo) {
    const fromLabel = dateFrom ? formatChipDate(dateFrom) : '…';
    const toLabel = dateTo ? formatChipDate(dateTo) : '…';

    chips.push(
      <ActiveFilterChip
        key="date-range"
        iconName="calendar-outline"
        label={`${fromLabel} - ${toLabel}`}
        onRemove={() => {
          onUpdateFilter('dateFrom', undefined);
          onUpdateFilter('dateTo', undefined);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header row with title and Clear All */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Filters ({activeFilterCount})
        </Text>
        <Pressable
          onPress={onClearAll}
          style={({ pressed }) => [styles.clearAllButton, pressed && styles.clearAllPressed]}
          accessibilityLabel="Clear all filters"
          accessibilityRole="button"
        >
          <Text style={styles.clearAllText}>Clear all</Text>
        </Pressable>
      </View>

      {/* Horizontally scrollable filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScrollContent}
      >
        {chips}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    paddingBottom: space.sm,
  },

  // Header row
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
  },
  headerTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  clearAllButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
  },
  clearAllPressed: {
    backgroundColor: t.brand.subtle,
  },
  clearAllText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  // Chips scroll container (room for each chip's padded touch area)
  chipsScrollContent: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: (touchTarget - CHIP_HEIGHT) / 2,
    gap: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },

  // Applied filter chip
  activeChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
    minHeight: CHIP_HEIGHT,
    borderRadius: radius.pill,
    paddingVertical: space.s6,
    paddingLeft: space.md,
    paddingRight: space.sm,
    gap: space.xs,
  },
  activeChipPressed: {
    backgroundColor: t.brand.subtleStrong,
  },
  activeChipText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
    maxWidth: 150, // Prevent overly long text
  },
});

export default memo(AppliedFiltersBar);
