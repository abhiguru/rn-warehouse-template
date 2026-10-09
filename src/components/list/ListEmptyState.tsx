/**
 * ListEmptyState - Reusable empty state component for list views
 *
 * Centred: icon (iconSize.hero, icon.secondary), title in title3, subtitle in
 * subhead text.secondary, and an optional action (docs/STYLE_GUIDE.md §13.6).
 * "No data yet" and "no match for the filters" have separate wording; the
 * filtered state can offer "Clear filters".
 *
 * Used by GRNListFiori, DispatchListFiori, OrderListFiori, InvoiceListFiori
 */

import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export interface ListEmptyStateProps {
  /** Number of active filters (affects messaging) */
  activeFilterCount: number;
  /** Icon to show when no filters applied (MaterialCommunityIcons name; Ionicons names still work) */
  emptyIcon?: string;
  /** Icon to show when filters are active but no results */
  filteredIcon?: string;
  /** Title when no items and no filters */
  emptyTitle?: string;
  /** Title when filters active but no results */
  filteredTitle?: string;
  /** Subtitle when no items and no filters */
  emptySubtitle?: string;
  /** Subtitle when filters active but no results */
  filteredSubtitle?: string;
  /** Whether to show create button */
  showCreateButton?: boolean;
  /** Create button label */
  createButtonLabel?: string;
  /** Create button icon (MaterialCommunityIcons name; Ionicons names still work) */
  createButtonIcon?: string;
  /** Called when create button pressed */
  onCreatePress?: () => void;
  /** Called by the "Clear filters" button shown when filters hide every item */
  onClearFilters?: () => void;
  /** Label of the clear-filters button */
  clearFiltersLabel?: string;
}

type GlyphMap = Record<string, unknown> | undefined;

/** Render a glyph from MaterialCommunityIcons, falling back to Ionicons for older names. */
function Glyph({ name, size, color }: { name: string; size: number; color: string }) {
  const mci = (MaterialCommunityIcons as unknown as { glyphMap?: GlyphMap }).glyphMap;
  const ion = (Ionicons as unknown as { glyphMap?: GlyphMap }).glyphMap;
  if (mci && !(name in mci) && ion && name in ion) {
    return <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
  }
  return (
    <MaterialCommunityIcons
      name={name as keyof typeof MaterialCommunityIcons.glyphMap}
      size={size}
      color={color}
    />
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.xxl,
  },
  icon: {
    marginBottom: space.lg,
  },
  title: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },
  description: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.xxl,
    maxWidth: layout.maxFormWidth,
  },
  button: {
    minHeight: touchTarget,
    minWidth: 160,
    borderRadius: radius.button,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.xxl,
  },
  primaryButton: {
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});

export const ListEmptyState = memo<ListEmptyStateProps>(({
  activeFilterCount,
  emptyIcon = 'package-variant-closed',
  filteredIcon = 'filter-remove-outline',
  emptyTitle = 'No items yet',
  filteredTitle = 'No matching items',
  emptySubtitle = 'Items you create appear here.',
  filteredSubtitle = 'Nothing matches the filters. Try removing some filters.',
  showCreateButton = false,
  createButtonLabel = 'Create',
  createButtonIcon = 'plus',
  onCreatePress,
  onClearFilters,
  clearFiltersLabel = 'Clear filters',
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const hasFilters = activeFilterCount > 0;

  const title = hasFilters ? filteredTitle : emptyTitle;
  const subtitle = hasFilters ? filteredSubtitle : emptySubtitle;

  return (
    <View style={styles.container}>
      {/* Illustration - decorative, hidden from screen readers */}
      <View style={styles.icon} accessible={false} importantForAccessibility="no-hide-descendants">
        <Glyph name={hasFilters ? filteredIcon : emptyIcon} size={iconSize.hero} color={t.icon.secondary} />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      <Text style={styles.description}>{subtitle}</Text>

      {/* No data yet: optional primary create action */}
      {showCreateButton && !hasFilters && onCreatePress && (
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={onCreatePress}
          accessibilityRole="button"
          accessibilityLabel={createButtonLabel}
        >
          <Glyph name={createButtonIcon} size={iconSize.md} color={t.brand.onFill} />
          <Text style={styles.primaryButtonText}>{createButtonLabel}</Text>
        </Pressable>
      )}

      {/* Filtered to nothing: clear the filters */}
      {hasFilters && onClearFilters && (
        <Pressable
          style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={onClearFilters}
          accessibilityRole="button"
          accessibilityLabel={clearFiltersLabel}
        >
          <Text style={styles.secondaryButtonText}>{clearFiltersLabel}</Text>
        </Pressable>
      )}
    </View>
  );
});

ListEmptyState.displayName = 'ListEmptyState';

export default ListEmptyState;
