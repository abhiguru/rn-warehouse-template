/**
 * AppliedFiltersBar Component (SAP Fiori Filter Feedback Bar)
 *
 * A horizontal bar that displays active filter chips with remove functionality.
 * Follows SAP Fiori Filter Feedback Bar specification (05-filter-feedback-bar.md).
 *
 * Features:
 * - Horizontal scrollable bar with filter chips
 * - Active filter chips (filled primary style with remove button)
 * - Clear All button for removing all filters
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
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { listColors } from '@/theme/listColors';
import type { AutocompleteSelection } from '@/types/filter.types';

// ============================================================================
// FIORI DIMENSIONS (from 05-filter-feedback-bar.md)
// ============================================================================

const FIORI = {
  // Filter Bar
  barMinHeight: 44,
  barPaddingHorizontal: 16,
  barPaddingVertical: 6,
  chipGap: 8,

  // Filter Button/Chip
  chipHeight: 32,
  chipPaddingHorizontal: 12,
  chipPaddingVertical: 6,
  chipBorderRadius: 16, // Pill shape
  chipIconSize: 16,
  chipFontSize: 14,

  // Remove button
  removeButtonSize: 18,
  removeIconSize: 12,

  // Clear All
  clearAllFontSize: 14,
} as const;

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
    icon: 'package-variant',
    isArray: true,
  },
  {
    filterKey: 'customerName',
    icon: 'account',
    isArray: true,
  },
  {
    filterKey: 'grNo',
    icon: 'clipboard-list',
    isArray: true,
  },
  {
    filterKey: 'stockStatus',
    icon: 'chart-bar',
    labelRenderer: (value) =>
      value === 'in_stock'
        ? 'In Stock'
        : value === 'out_of_stock'
          ? 'Out of Stock'
          : String(value),
    clearValue: 'all',
  },
  {
    filterKey: 'packageMark',
    icon: 'tag',
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
 * Active Filter Chip (Fiori style)
 *
 * Per Fiori spec:
 * - Active: Primary background (#f69000), white text/icon
 * - 32pt height, 16pt corner radius (pill shape)
 * - Remove button: Circular with × icon
 */
const ActiveFilterChip = memo(function ActiveFilterChip({
  iconName,
  label,
  onRemove,
}: ActiveFilterChipProps) {
  return (
    <View style={styles.activeChip}>
      <Icon
        name={iconName}
        size={FIORI.chipIconSize}
        color={listColors.white}
        style={styles.chipIcon}
      />
      <Text style={styles.activeChipText} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.removeButton}
        accessibilityLabel={`${label} applied, tap to remove`}
        accessibilityRole="button"
      >
        <Icon name="close" size={FIORI.removeIconSize} color={listColors.white} />
      </TouchableOpacity>
    </View>
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
    const fromLabel = dateFrom
      ? new Date(dateFrom).toLocaleDateString()
      : '...';
    const toLabel = dateTo ? new Date(dateTo).toLocaleDateString() : '...';

    chips.push(
      <ActiveFilterChip
        key="date-range"
        iconName="calendar"
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
        <Text style={styles.headerTitle}>
          Filters ({activeFilterCount})
        </Text>
        <TouchableOpacity
          onPress={onClearAll}
          style={styles.clearAllButton}
          accessibilityLabel="Clear all filters"
          accessibilityRole="button"
        >
          <Text style={styles.clearAllText}>Clear All</Text>
        </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: listColors.white,
    borderBottomWidth: 1,
    borderBottomColor: listColors.gray200,
    paddingTop: FIORI.barPaddingVertical,
    paddingBottom: FIORI.barPaddingVertical,
  },

  // Header row
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: FIORI.barPaddingHorizontal,
    marginBottom: FIORI.barPaddingVertical,
    minHeight: 28,
  },
  headerTitle: {
    fontSize: FIORI.chipFontSize,
    fontWeight: '600',
    color: listColors.textSecondary,
  },
  clearAllButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  clearAllText: {
    fontSize: FIORI.clearAllFontSize,
    fontWeight: '600',
    color: listColors.primary,
  },

  // Chips scroll container
  chipsScrollContent: {
    paddingHorizontal: FIORI.barPaddingHorizontal,
    gap: FIORI.chipGap,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Active filter chip (Fiori spec: filled primary)
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: listColors.primary,
    height: FIORI.chipHeight,
    borderRadius: FIORI.chipBorderRadius,
    paddingLeft: FIORI.chipPaddingHorizontal,
    paddingRight: 6, // Smaller right padding for remove button
    gap: 6,
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: listColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  chipIcon: {
    // Icon styling handled by Icon component
  },
  activeChipText: {
    fontSize: FIORI.chipFontSize,
    fontWeight: '500',
    color: listColors.white,
    maxWidth: 150, // Prevent overly long text
  },

  // Remove button (circular with × icon)
  removeButton: {
    width: FIORI.removeButtonSize,
    height: FIORI.removeButtonSize,
    borderRadius: FIORI.removeButtonSize / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default memo(AppliedFiltersBar);
