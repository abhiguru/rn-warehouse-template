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
import { View, Text } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { iconSize, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export interface ListEmptyStateProps {
  /** Number of active filters (affects messaging) */
  activeFilterCount: number;
  /** Icon to show when no filters applied (MaterialCommunityIcons name) */
  emptyIcon?: IconName;
  /** Icon to show when filters are active but no results */
  filteredIcon?: IconName;
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
  /** Create button icon (MaterialCommunityIcons name) */
  createButtonIcon?: IconName;
  /** Called when create button pressed */
  onCreatePress?: () => void;
  /** Called by the "Clear filters" button shown when filters hide every item */
  onClearFilters?: () => void;
  /** Label of the clear-filters button */
  clearFiltersLabel?: string;
  /** A lasting fact about the list, in a footnote line under the message. */
  footnote?: { text: string; testID?: string };
  testID?: string;
  /** testID of the clear-filters button */
  clearTestID?: string;
}

function Glyph({ name, size, color }: { name: IconName; size: number; color: string }) {
  return <Icon name={name} size={size} color={color} />;
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
  footnote: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.lg,
    maxWidth: layout.maxFormWidth,
  },
  description: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.xxl,
    maxWidth: layout.maxFormWidth,
  },
});

export const ListEmptyState = memo<ListEmptyStateProps>(({
  activeFilterCount,
  emptyIcon = 'package-variant-closed',
  filteredIcon = 'filter-remove-outline',
  emptyTitle = translate('lists.empty.title'),
  filteredTitle = translate('lists.empty.filteredTitle'),
  emptySubtitle = translate('lists.empty.subtitle'),
  filteredSubtitle = translate('lists.empty.filteredSubtitle'),
  showCreateButton = false,
  createButtonLabel = translate('common.create'),
  createButtonIcon = 'plus',
  onCreatePress,
  onClearFilters,
  clearFiltersLabel = translate('filters.empty.clearFilters'),
  footnote,
  testID,
  clearTestID,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const hasFilters = activeFilterCount > 0;

  const title = hasFilters ? filteredTitle : emptyTitle;
  const subtitle = hasFilters ? filteredSubtitle : emptySubtitle;

  return (
    <View style={styles.container} testID={testID}>
      {/* Illustration - decorative, hidden from screen readers */}
      <View style={styles.icon} accessible={false} importantForAccessibility="no-hide-descendants">
        <Glyph name={hasFilters ? filteredIcon : emptyIcon} size={iconSize.hero} color={t.icon.secondary} />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      <Text style={styles.description}>{subtitle}</Text>

      {footnote ? <Text style={styles.footnote} testID={footnote.testID}>{footnote.text}</Text> : null}

      {/* No data yet: optional create action */}
      {showCreateButton && !hasFilters && onCreatePress && (
        <Button type="tertiary" leftIcon={createButtonIcon} onPress={onCreatePress} accessibilityLabel={createButtonLabel}>
          {createButtonLabel}
        </Button>
      )}

      {/* Filtered to nothing: clear the filters */}
      {hasFilters && onClearFilters && (
        <Button type="tertiary" onPress={onClearFilters} accessibilityLabel={clearFiltersLabel} testID={clearTestID}>
          {clearFiltersLabel}
        </Button>
      )}
    </View>
  );
});

ListEmptyState.displayName = 'ListEmptyState';

export default ListEmptyState;
