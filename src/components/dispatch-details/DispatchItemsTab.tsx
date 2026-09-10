/**
 * DispatchItemsTab Component - 100% SAP Fiori Compliant
 *
 * Items tab showing all dispatch items in a scrollable list
 * Based on SAP Fiori for iOS Design Guidelines
 *
 * @see design/sap-fiori-specs/01-object-cell.md
 *
 * Features:
 * - FlatList for performance with large datasets
 * - Fiori empty state pattern
 * - Fiori loading state
 * - Uses DispatchItemCard components
 * - Dynamic colors for dark mode support
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform } from 'react-native';
import { DispatchItemCard } from './DispatchItemCard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    '3xl': 32,
  },
  typography: {
    headline: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
  },
} as const;

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

export const DispatchItemsTab: React.FC<DispatchItemsTabProps> = ({
  items,
  loading = false,
  onViewGRN,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.gray50,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: FIORI_STATIC.spacing['3xl'],
      minHeight: 400,
    },
    emptyTitle: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
      marginBottom: FIORI_STATIC.spacing.sm,
      textAlign: 'center',
    },
    emptySubtitle: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray600,
      textAlign: 'center',
      lineHeight: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: FIORI_STATIC.spacing['3xl'],
      backgroundColor: colors.gray50,
    },
    loadingText: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray600,
      marginLeft: FIORI_STATIC.spacing.sm,
    },
  }), [colors]);

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
      <View style={dynamicStyles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Icon name="package-variant-closed" size={56} color={colors.gray500} />
        </View>
        <Text style={dynamicStyles.emptyTitle}>No items in this dispatch</Text>
        <Text style={dynamicStyles.emptySubtitle}>
          This dispatch does not contain any items
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loading) return null;

    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={dynamicStyles.loadingText}>Loading items...</Text>
      </View>
    );
  };

  if (loading && items.length === 0) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={dynamicStyles.loadingText}>Loading items...</Text>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
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

// ============================================================================
// STYLES (Static layout only - colors are in dynamicStyles)
// ============================================================================
const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingVertical: FIORI_STATIC.spacing.xs,
  },
  emptyIconContainer: {
    marginBottom: FIORI_STATIC.spacing.md,
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI_STATIC.spacing.xl,
  },
});
