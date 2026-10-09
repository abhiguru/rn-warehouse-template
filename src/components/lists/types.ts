/**
 * Shared TypeScript interfaces for FlashList components
 * Used across GRN, Dispatch, and Invoice lists
 */

import { useMemo } from 'react';
import type { ListRenderItem } from '@shopify/flash-list';
import { useTokens } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';

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

// ============================================================================
// THEME HELPERS
// ============================================================================

/**
 * Legacy row palette: the semantic tokens mapped onto the flat colour keys the
 * row components in list-items/* still take as their `colors` prop.
 */
export function buildListRowPalette(t: ThemeTokens) {
  const { positive, critical, negative, informative, neutral } = t.status;
  return {
    // Brand
    primary: t.brand.fill,
    primaryLight: t.brand.subtle,
    primaryDark: t.brand.tint,

    // Former indigo accent: informative status
    secondary: informative.text,
    secondaryLight: informative.background,

    // Semantic colours
    success: positive.text,
    successLight: positive.background,
    warning: critical.text,
    warningLight: critical.background,
    error: negative.text,
    errorLight: negative.background,
    info: informative.text,
    infoLight: informative.background,

    // Grey scale mapped to neutral roles
    gray50: t.background.base,
    gray100: t.background.base,
    gray200: t.border.divider,
    gray300: t.border.separator,
    gray400: t.icon.secondary,
    gray500: t.text.secondary,
    gray600: t.text.secondary,
    gray700: t.text.secondary,
    gray800: t.text.primary,
    gray900: t.text.primary,

    // Surfaces
    white: t.surface.card,
    black: t.text.primary,

    // Decorative accents mapped to status roles
    teal: informative.text,
    tealLight: informative.background,
    blue: informative.text,
    blueLight: informative.background,
    purple: neutral.text,
    purpleLight: neutral.background,
    orange: critical.text,
    orangeLight: critical.background,

    // Fiori status colours
    statusPositive: positive.text,
    statusPositiveLight: positive.background,
    statusPositiveDark: positive.text,
    statusPositiveBorder: positive.border,

    statusCritical: critical.text,
    statusCriticalLight: critical.background,
    statusCriticalDark: critical.text,
    statusCriticalBorder: critical.border,

    statusNegative: negative.text,
    statusNegativeLight: negative.background,
    statusNegativeDark: negative.text,
    statusNegativeBorder: negative.border,

    statusNeutral: informative.text,
    statusNeutralLight: informative.background,
    statusNeutralDark: informative.text,
    statusNeutralBorder: informative.border,

    statusNone: neutral.text,
    statusNoneLight: neutral.background,

    statusWarning: critical.text,
    statusWarningLight: critical.background,
    statusWarningDark: critical.text,
    statusWarningBorder: critical.border,

    // Object cells
    cellBackground: t.surface.card,
    cellBackgroundPressed: t.surface.cardPressed,
    cellBackgroundSelected: t.surface.selected,
    cellSelectedBorder: t.brand.tint,
    cellDivider: t.border.divider,

    // Text
    textPrimary: t.text.primary,
    textSecondary: t.text.secondary,
    textTertiary: t.text.secondary,
    textInverse: t.brand.onFill,
  };
}

/**
 * Legacy palette for the row components in list-items/*, which still take a
 * `colors` prop. The lists themselves use semantic tokens; drop this bridge
 * once the row components read tokens (migration phase 6 at the latest).
 */
export function useLegacyRowPalette() {
  const tokens = useTokens();
  return useMemo(() => buildListRowPalette(tokens), [tokens]);
}

/**
 * Stable index into `tokens.avatar` for a person's name or id, so the same
 * person always gets the same avatar colour (style guide §3.2).
 */
export function listAvatarIndex(key: string, paletteSize: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return paletteSize > 0 ? Math.abs(hash) % paletteSize : 0;
}
