/**
 * DispatchItemsTab Component - SAP Fiori list of dispatch items
 *
 * Features:
 * - FlatList for performance with large datasets
 * - Fiori empty state pattern (docs/STYLE_GUIDE.md §13.6)
 * - Loading state
 * - Uses DispatchItemCard components
 */

import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { DispatchItemCard } from './DispatchItemCard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

// Using snake_case to match backend RPC types
export interface DispatchItem {
  id: string;
  item_name: string;
  dispatch_quantity: number;
  grn_no: string;
  grn_date: string;
  grn_id?: string;
  original_quantity?: number;
  weight?: number;
  package_mark?: string;
}

interface DispatchItemsTabProps {
  items: DispatchItem[];
  loading?: boolean;
  onViewGRN?: (grn_id: string) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: space.md,
    paddingBottom: space.xxl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxxl,
    minHeight: 400,
  },
  emptyIcon: {
    marginBottom: space.md,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxxl,
    gap: space.md,
    backgroundColor: t.background.base,
  },
  loadingFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    padding: space.xl,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
});

export const DispatchItemsTab: React.FC<DispatchItemsTabProps> = ({
  items,
  loading = false,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const renderItem = ({ item }: { item: DispatchItem }) => (
    <DispatchItemCard
      item_name={item.item_name}
      dispatch_quantity={item.dispatch_quantity}
      grn_no={item.grn_no}
      grn_date={item.grn_date}
      grn_id={item.grn_id}
      original_quantity={item.original_quantity}
      weight={item.weight}
      package_mark={item.package_mark}
      onViewGRN={onViewGRN}
    />
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Icon
          name="cube-outline"
          size={iconSize.hero}
          color={t.icon.secondary}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle}>{tr('dispatch.details.itemsEmptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>
          {tr('dispatch.details.itemsEmptyMessage')}
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loading) return null;

    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('dispatch.details.loadingItems')}</Text>
      </View>
    );
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel={tr('dispatch.details.loadingItemsLabel')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('dispatch.details.loadingItems')}</Text>
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

