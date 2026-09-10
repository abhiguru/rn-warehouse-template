/**
 * InvoiceLineItemsTab Component - 100% SAP Fiori Compliant
 *
 * Line items tab showing invoice items grouped by GRN item
 * Based on SAP Fiori for iOS Design Guidelines
 *
 * @see design/sap-fiori-specs/13-card.md
 *
 * Features:
 * - FlatList for performance with large datasets
 * - Grouped accordion view with expandable dispatch items
 * - Empty state and loading state
 * - Summary footer with totals
 * - Dynamic colors for dark mode support
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, ViewStyle } from 'react-native';
import { InvoiceLineItemGroup, InvoiceLineItemGroupData, DispatchLineItem } from './InvoiceLineItemGroup';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatCurrency } from '@/utils/formatters';
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
    bodyMedium: {
      fontSize: 15,
      fontWeight: '500' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
  },
  dimensions: {
    cardRadius: 12,
    cardPadding: 16,
    avatarSize: 44,
  },
  shadows: {
    card: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }) as ViewStyle,
  },
} as const;

// Legacy interface for backward compatibility
export interface InvoiceLineItem {
  id: string;
  item_name: string;
  duration?: string;
  no_of_days?: number;
  charge: number;
  tax: number;
  gr_no?: string;
  // GRN Item reference for grouping
  grn_item_id?: string;
  // Dispatch details
  dispatch_id?: string;
  dispatch_no?: string;  // e.g., "I2660"
  dispatch_date?: string;
  dispatch_qty?: number;
  // Storage details
  package_mark?: string;
  rack?: string;
  grn_quantity?: number;
  grn_date?: string;
  weight?: number;
  packaging?: string;
  // Rates
  labour_rate?: number;
  charge_per_unit?: number;
}

interface InvoiceLineItemsTabProps {
  items: InvoiceLineItem[];
  loading?: boolean;
  total_items?: number;
  total_dispatch_qty?: number;
  total_amount?: number;
  on_view_grn?: (gr_no: string) => void;
  on_view_dispatch?: (disp_no: string) => void;
}

// Helper function to group items by GRN item
const groupItemsByGrnItem = (
  items: InvoiceLineItem[],
  on_view_grn?: (gr_no: string) => void,
  on_view_dispatch?: (disp_no: string) => void
): InvoiceLineItemGroupData[] => {
  const groupMap = new Map<string, InvoiceLineItemGroupData>();

  items.forEach((item) => {
    // Use grn_item_id if available, otherwise use item_name + grn_quantity as grouping key
    const groupKey = item.grn_item_id || `${item.item_name}_${item.grn_quantity || 0}`;

    if (!groupMap.has(groupKey)) {
      // Initialize new group
      const charge_per_unit = item.charge_per_unit || item.charge || 0;
      const labour_rate = item.labour_rate || 0;

      groupMap.set(groupKey, {
        grn_item_id: item.grn_item_id || groupKey,
        item_name: item.item_name,
        packaging: item.packaging,
        weight: item.weight || 0,
        grn_quantity: item.grn_quantity || 0,
        total_dispatch_qty: 0,
        charge_per_unit: charge_per_unit,
        labour_rate: labour_rate,
        total_base_amount: 0,
        total_tax_amount: 0,
        total_amount: 0,
        package_mark: item.package_mark,
        rack: item.rack,
        gr_no: item.gr_no,
        dispatch_items: [],
        on_view_grn,
      });
    }

    const group = groupMap.get(groupKey)!;

    // Calculate line item amount: (duration * charge_per_unit * dispatch_qty) + (dispatch_qty * labour_rate)
    if (__DEV__) console.log('[InvoiceLineItemsTab] Raw item.duration:', item.duration, 'type:', typeof item.duration);
    const duration = item.duration ? parseFloat(item.duration) || 1 : 1;
    if (__DEV__) console.log('[InvoiceLineItemsTab] Parsed duration:', duration);
    const dispatch_qty = item.dispatch_qty || 0;
    const charge_per_unit = item.charge_per_unit || item.charge || group.charge_per_unit || 0;
    const labour_rate = item.labour_rate || group.labour_rate || 0;

    const baseAmount = (duration * charge_per_unit * dispatch_qty) + (dispatch_qty * labour_rate);
    const taxAmount = item.tax || 0;
    const lineItemAmount = baseAmount;

    // Create dispatch line item
    const dispatchItem: DispatchLineItem = {
      id: item.id,
      dispatch_no: item.dispatch_no,
      dispatch_id: item.dispatch_id,
      dispatch_date: item.dispatch_date,
      dispatch_qty: dispatch_qty,
      grn_date: item.grn_date,
      no_of_days: item.no_of_days || 0,
      duration: duration,
      charge_per_unit: charge_per_unit,
      labour_rate: labour_rate,
      line_item_amount: lineItemAmount,
      tax: taxAmount,
      on_view_dispatch,
    };

    // Add to group
    group.dispatch_items.push(dispatchItem);
    group.total_dispatch_qty += dispatch_qty;
    group.total_base_amount += baseAmount;
    group.total_tax_amount += taxAmount;
    group.total_amount += (baseAmount + taxAmount);
  });

  return Array.from(groupMap.values());
};

export const InvoiceLineItemsTab: React.FC<InvoiceLineItemsTabProps> = ({
  items,
  loading = false,
  total_items,
  total_dispatch_qty,
  total_amount,
  on_view_grn,
  on_view_dispatch,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Group items by GRN item
  const groupedItems = React.useMemo(
    () => groupItemsByGrnItem(items, on_view_grn, on_view_dispatch),
    [items, on_view_grn, on_view_dispatch]
  );

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
      padding: FIORI_STATIC.spacing.xxl,
      minHeight: 400,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.cellBackground,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: FIORI_STATIC.spacing.lg,
      ...FIORI_STATIC.shadows.card,
    },
    emptyTitle: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
      marginBottom: FIORI_STATIC.spacing.sm,
      textAlign: 'center',
    },
    emptySubtitle: {
      ...FIORI_STATIC.typography.body,
      color: colors.gray600,
      textAlign: 'center',
      lineHeight: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: FIORI_STATIC.spacing.xxl,
      backgroundColor: colors.gray50,
    },
    loadingText: {
      ...FIORI_STATIC.typography.body,
      color: colors.gray600,
      marginLeft: FIORI_STATIC.spacing.md,
    },
    summaryCard: {
      marginHorizontal: FIORI_STATIC.spacing.lg,
      marginTop: FIORI_STATIC.spacing.sm,
      marginBottom: FIORI_STATIC.spacing.xl,
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI_STATIC.dimensions.cardRadius,
      borderWidth: 1,
      borderColor: colors.cellDivider,
      overflow: 'hidden',
      ...FIORI_STATIC.shadows.card,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: FIORI_STATIC.dimensions.cardPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    summaryAvatar: {
      width: FIORI_STATIC.dimensions.avatarSize,
      height: FIORI_STATIC.dimensions.avatarSize,
      borderRadius: FIORI_STATIC.dimensions.avatarSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: FIORI_STATIC.spacing.md,
      backgroundColor: colors.primaryLight,
    },
    summaryTitle: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
    },
    summaryLabel: {
      ...FIORI_STATIC.typography.body,
      color: colors.gray600,
    },
    summaryValue: {
      ...FIORI_STATIC.typography.bodyMedium,
      color: colors.gray900,
    },
    summaryRowTotal: {
      paddingTop: FIORI_STATIC.spacing.md,
      marginTop: FIORI_STATIC.spacing.sm,
      borderTopWidth: 2,
      borderTopColor: colors.cellDivider,
    },
    summaryLabelTotal: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
    },
    summaryValueTotal: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.success,
    },
  }), [colors]);

  const renderGroupItem = ({ item }: { item: InvoiceLineItemGroupData }) => (
    <InvoiceLineItemGroup
      group={item}
      default_expanded={groupedItems.length === 1} // Auto-expand if only one group
    />
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={dynamicStyles.emptyContainer}>
        <View style={dynamicStyles.emptyIconContainer}>
          <Icon name="receipt-text-outline" size={48} color={colors.gray500} />
        </View>
        <Text style={dynamicStyles.emptyTitle}>No line items</Text>
        <Text style={dynamicStyles.emptySubtitle}>
          This invoice does not contain any line items
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (loading) {
      return (
        <View style={styles.loadingFooter}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={dynamicStyles.loadingText}>Loading items...</Text>
        </View>
      );
    }

    // Summary footer
    if (groupedItems.length > 0 && (total_items !== undefined || total_dispatch_qty !== undefined || total_amount !== undefined)) {
      return (
        <View style={dynamicStyles.summaryCard}>
          {/* Card Header */}
          <View style={dynamicStyles.summaryHeader}>
            <View style={dynamicStyles.summaryAvatar}>
              <Icon name="sigma" size={20} color={colors.primary} />
            </View>
            <Text style={dynamicStyles.summaryTitle}>Invoice Summary</Text>
          </View>

          {/* Summary Content */}
          <View style={styles.summaryContent}>
            <View style={styles.summaryRow}>
              <Text style={dynamicStyles.summaryLabel}>Total Items</Text>
              <Text style={dynamicStyles.summaryValue}>{total_items ?? groupedItems.length}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={dynamicStyles.summaryLabel}>GRN Items</Text>
              <Text style={dynamicStyles.summaryValue}>{groupedItems.length}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={dynamicStyles.summaryLabel}>Dispatch Entries</Text>
              <Text style={dynamicStyles.summaryValue}>{items.length}</Text>
            </View>
            {total_dispatch_qty !== undefined && (
              <View style={styles.summaryRow}>
                <Text style={dynamicStyles.summaryLabel}>Total Dispatch Qty</Text>
                <Text style={dynamicStyles.summaryValue}>{total_dispatch_qty}</Text>
              </View>
            )}
            {total_amount !== undefined && (
              <View style={[styles.summaryRow, dynamicStyles.summaryRowTotal]}>
                <Text style={dynamicStyles.summaryLabelTotal}>Total Amount</Text>
                <Text style={dynamicStyles.summaryValueTotal}>
                  {formatCurrency(total_amount)}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    return null;
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
        data={groupedItems}
        renderItem={renderGroupItem}
        keyExtractor={(item) => item.grn_item_id}
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
    paddingVertical: FIORI_STATIC.spacing.sm,
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI_STATIC.spacing.xl,
  },
  summaryContent: {
    padding: FIORI_STATIC.dimensions.cardPadding,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: FIORI_STATIC.spacing.sm,
  },
});
