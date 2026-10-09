/**
 * GRNItemsTab: the Items tab of the GRN object page.
 *
 * A FlatList of GRNItemCard object cells on background.base, with the
 * empty and loading states from style guide §13.6.
 */

import React, { useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { GRNItemCard } from './GRNItemCard';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: space.sm,
  },
  // Empty state (style guide §13.6)
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xxxl,
    paddingVertical: space.giant,
    gap: space.sm,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.giant,
    gap: space.sm,
    backgroundColor: t.background.base,
  },
  loadingFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    gap: space.sm,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
});

// ============================================================================
// TYPES - Using snake_case to match backend RPC types
// ============================================================================
export interface GRNItem {
  id: string;
  item_name: string;
  qty: number;
  stock: number;
  dispatch_summary?: {
    total_dispatched: number;
    dispatch_count?: number;
  };
  weight?: number | null;
  packaging?: string | null;
  rack?: string | null;
  package_mark?: string | null;
  processed_images?: Array<{
    id: string;
    image_url: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    uploaded_at?: string;
  }>;
}

interface GRNItemsTabProps {
  items: GRNItem[];
  loading?: boolean;
  onViewItemImages?: (item: GRNItem) => void;
  onViewItemDispatches?: (item: GRNItem) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================
export const GRNItemsTab: React.FC<GRNItemsTabProps> = ({
  items,
  loading = false,
  onViewItemImages,
  onViewItemDispatches,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  // Performance optimization: wrap renderItem in useCallback
  const renderItem = useCallback(
    ({ item }: { item: GRNItem }) => (
      <GRNItemCard
        item_name={item.item_name}
        qty={item.qty}
        stock={item.stock}
        total_dispatched={
          item.dispatch_summary?.total_dispatched ??
          Math.max(0, Number(item.qty || 0) - Number(item.stock || 0))
        }
        weight={item.weight}
        packaging={item.packaging}
        rack={item.rack}
        package_mark={item.package_mark}
        processed_images={item.processed_images}
        onViewImages={() => onViewItemImages?.(item)}
        onViewDispatches={() => onViewItemDispatches?.(item)}
      />
    ),
    [onViewItemImages, onViewItemDispatches]
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Icon name="cube-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          No items
        </Text>
        <Text style={styles.emptySubtitle}>This GRN has no items. Edit the GRN to add them.</Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loading) return null;

    return (
      <View style={styles.loadingFooter} accessibilityRole="progressbar" accessibilityLabel="Loading items">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading items…</Text>
      </View>
    );
  };

  // Initial loading state
  if (loading && items.length === 0) {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel="Loading items">
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading items…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
      />
    </View>
  );
};
