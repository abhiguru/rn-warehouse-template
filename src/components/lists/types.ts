/**
 * Shared TypeScript interfaces for FlashList components
 * Used across GRN, Dispatch, and Invoice lists
 */

import type { ListRenderItem } from '@shopify/flash-list';

// ============================================================================
// FLATTENED SECTION DATA TYPES
// ============================================================================

/**
 * Base type for flattened section items (for FlashList which doesn't support sections natively)
 * FlashList requires a flat data array with type discrimination
 */
export type FlattenedItemType = 'header' | 'card';

export interface FlattenedSectionHeader {
  type: 'header';
  title: string;
  count: number;
  key: string; // Stable key for React
}

export interface FlattenedCardItem<T> {
  type: 'card';
  data: T;
  key: string; // Stable key for React
}

export type FlattenedItem<T> = FlattenedSectionHeader | FlattenedCardItem<T>;

// ============================================================================
// LIST CONFIGURATION
// ============================================================================

/**
 * Common configuration for FlashList v2 components
 * Note: FlashList v2 automatically handles item sizing, no estimates needed
 */
export interface FlashListConfig {
  /** Threshold for triggering onEndReached (0-1) */
  onEndReachedThreshold: number;
}

/**
 * Default configuration values for FlashList v2
 */
export const DEFAULT_LIST_CONFIG: FlashListConfig = {
  onEndReachedThreshold: 0.3,
};

// ============================================================================
// PAGINATION TYPES
// ============================================================================

export interface PaginationState {
  offset: number;
  limit: number;
  hasMore: boolean;
  total: number;
}

export interface ListDataState<T> {
  items: T[];
  pagination: PaginationState;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

// ============================================================================
// SORT/FILTER TYPES
// ============================================================================

export type SortOrder = 'asc' | 'desc';

export interface SortConfig<TField extends string = string> {
  field: TField;
  order: SortOrder;
}

// ============================================================================
// SECTION GROUPING TYPES
// ============================================================================

export interface SectionData<T> {
  title: string;
  data: T[];
}

/**
 * Utility type for items that can be grouped by date
 */
export interface DateGroupable {
  date: string;
}

// ============================================================================
// CARD PROPS TYPES
// ============================================================================

/**
 * Base props for expandable card components
 * Cards manage their own expanded state internally (best practice)
 */
export interface ExpandableCardProps {
  defaultExpanded?: boolean;
}

/**
 * Base callback props for list card actions
 */
export interface CardActionCallbacks<T> {
  onPress?: (item: T) => void;
  onViewDetails?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onPrint?: (item: T) => void;
}

// ============================================================================
// LIST COMPONENT PROPS
// ============================================================================

export interface BaseListProps<T> {
  /** Whether the list is in loading state */
  isLoading?: boolean;
  /** Whether the list is being refreshed */
  refreshing?: boolean;
  /** Callback for pull-to-refresh */
  onRefresh?: () => void;
  /** Callback when list reaches end (pagination) */
  onEndReached?: () => void;
  /** Whether there's more data to load */
  hasMore?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert sectioned data to flattened array for FlashList
 * @param sections Array of section data
 * @param getItemKey Function to extract unique key from item
 * @returns Flattened array with type discrimination
 */
export function flattenSections<T>(
  sections: SectionData<T>[],
  getItemKey: (item: T) => string
): FlattenedItem<T>[] {
  const result: FlattenedItem<T>[] = [];

  sections.forEach((section, sectionIndex) => {
    // Add section header
    result.push({
      type: 'header',
      title: section.title,
      count: section.data.length,
      key: `header-${sectionIndex}-${section.title}`,
    });

    // Add section items
    section.data.forEach((item) => {
      result.push({
        type: 'card',
        data: item,
        key: getItemKey(item),
      });
    });
  });

  return result;
}

/**
 * Get item type for FlashList's getItemType prop
 */
export function getItemType<T>(item: FlattenedItem<T>): string {
  return item.type;
}

/**
 * Extract key from flattened item
 */
export function getItemKey<T>(item: FlattenedItem<T>): string {
  return item.key;
}

// Note: getItemSize removed - FlashList v2 automatically handles item sizing
