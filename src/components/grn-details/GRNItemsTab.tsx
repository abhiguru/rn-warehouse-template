/**
 * GRNItemsTab Component - 100% SAP Fiori Compliant
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * @see design/sap-fiori-specs/01-object-cell.md
 * @see design/sap-fiori-specs/12-empty-state.md
 *
 * Features:
 * - FlatList for performance with large datasets
 * - Fiori Empty State pattern
 * - Fiori Loading State
 * - Uses GRNItemCard components
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { GRNItemCard } from './GRNItemCard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS
// ============================================================================
const FIORI = {
  colors: {
    pageBackground: '#F7F9FA',
    cardBackground: '#FFFFFF',
    textPrimary: '#1D2D3E',
    textSecondary: '#556B82',
    textTertiary: '#7e8e9d',
    primary: '#f69000',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
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
  },
} as const;

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
  // Theme colors for dark mode support
  const colors = useListColors();
  // Performance optimization: wrap renderItem in useCallback
  const renderItem = useCallback(
    ({ item }: { item: GRNItem }) => (
      <GRNItemCard
        item_name={item.item_name}
        qty={item.qty}
        stock={item.stock}
        total_dispatched={item.dispatch_summary?.total_dispatched || 0}
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

  // Fiori Empty State
  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: colors.cellBackground }]}>
          <Icon
            name="package-variant-closed"
            size={48}
            color={colors.gray500}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.gray900 }]}>No Items</Text>
        <Text style={[styles.emptySubtitle, { color: colors.gray600 }]}>
          This GRN does not contain any items
        </Text>
      </View>
    );
  };

  // Fiori Loading Footer
  const renderFooter = () => {
    if (!loading) return null;

    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading items...</Text>
      </View>
    );
  };

  // Initial Loading State
  if (loading && items.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.gray50 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading items...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
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
// STYLES - 100% FIORI COMPLIANT
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.colors.pageBackground,
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: FIORI.spacing.sm,
  },

  // Empty State - Fiori Spec
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI.spacing.xxl * 2,
    minHeight: 400,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: FIORI.colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: FIORI.spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  emptyTitle: {
    ...FIORI.typography.headline,
    color: FIORI.colors.textPrimary,
    marginBottom: FIORI.spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...FIORI.typography.body,
    color: FIORI.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Loading State - Fiori Spec
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI.spacing.xxl * 2,
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI.spacing.xxl,
    gap: FIORI.spacing.sm,
  },
  loadingText: {
    ...FIORI.typography.body,
    color: FIORI.colors.textSecondary,
    marginLeft: FIORI.spacing.sm,
  },
});
