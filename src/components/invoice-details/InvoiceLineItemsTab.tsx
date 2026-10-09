/**
 * InvoiceLineItemsTab Component
 *
 * Line items of an invoice grouped by GRN item (style guide §13.6), with
 * empty and loading states and a summary card whose amounts are right-aligned
 * tabular figures (§13.11).
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { InvoiceLineItemGroup, InvoiceLineItemGroupData, DispatchLineItem } from './InvoiceLineItemGroup';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { calculateItemAmounts, roundMoney, formatInvoiceAmount } from '@/utils/invoiceCalculations';

// Legacy interface for backward compatibility
export interface InvoiceLineItem {
  id: string;
  item_name: string;
  duration?: string;
  no_of_days?: number;
  charge: number;
  tax: number;
  grn_id?: string;
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
export const groupItemsByGrnItem = (
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
        tax_rate: item.tax || 0,
        labour_rate: labour_rate,
        total_base_amount: 0,
        total_tax_amount: 0,
        total_amount: 0,
        package_mark: item.package_mark,
        rack: item.rack,
        grn_id: item.grn_id,
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

    const taxRate = item.tax || 0;
    const amounts = calculateItemAmounts(
      dispatch_qty,
      charge_per_unit,
      labour_rate,
      taxRate,
      duration
    );
    const baseAmount = amounts.taxable_amount;
    const taxAmount = amounts.tax_amount;
    const lineItemAmount = baseAmount;

    // A group-level rate is only meaningful when every dispatch uses the same rate.
    if (group.tax_rate !== undefined && group.tax_rate !== taxRate) {
      group.tax_rate = undefined;
    }

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
    group.total_base_amount = roundMoney(group.total_base_amount + baseAmount);
    group.total_tax_amount = roundMoney(group.total_tax_amount + taxAmount);
    group.total_amount = roundMoney(group.total_amount + amounts.item_total);
  });

  return Array.from(groupMap.values());
};

const formatCount = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  listContent: { flexGrow: 1, paddingVertical: space.sm },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    minHeight: 400,
    gap: space.sm,
  },
  emptyTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const, marginTop: space.sm },
  emptySubtitle: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    backgroundColor: t.background.base,
    gap: space.md,
  },
  loadingFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xl,
    gap: space.md,
  },
  loadingText: { ...typography.body, color: t.text.secondary },
  summaryCard: {
    marginHorizontal: layout.marginCompact,
    marginTop: space.sm,
    marginBottom: space.xl,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  summaryHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  summaryAvatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
    backgroundColor: t.brand.subtle,
  },
  summaryTitle: { ...typography.headline, color: t.text.primary },
  summaryContent: { padding: space.lg },
  summaryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
  },
  summaryLabel: { ...typography.body, color: t.text.secondary, flexShrink: 1 },
  summaryValue: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  summaryRowTotal: {
    paddingTop: space.md,
    marginTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  summaryLabelTotal: { ...typography.headline, color: t.text.primary },
  summaryValueTotal: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
});

export const InvoiceLineItemsTab: React.FC<InvoiceLineItemsTabProps> = ({
  items,
  loading = false,
  total_items,
  total_dispatch_qty,
  total_amount,
  on_view_grn,
  on_view_dispatch,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Group items by GRN item
  const groupedItems = React.useMemo(
    () => groupItemsByGrnItem(items, on_view_grn, on_view_dispatch),
    [items, on_view_grn, on_view_dispatch]
  );

  const renderGroupItem = ({ item }: { item: InvoiceLineItemGroupData }) => (
    <InvoiceLineItemGroup
      group={item}
      default_expanded={groupedItems.length === 1} // Auto-expand if only one group
    />
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Icon name="file-document-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">No line items</Text>
        <Text style={styles.emptySubtitle}>
          This invoice has no line items. Items billed on it appear here.
        </Text>
      </View>
    );
  };

  const renderSummaryRow = (label: string, value: string) => (
    <View style={styles.summaryRow} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );

  const renderFooter = () => {
    if (loading) {
      return (
        <View style={styles.loadingFooter} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.loadingText}>Loading items…</Text>
        </View>
      );
    }

    // Summary footer
    if (groupedItems.length > 0 && (total_items !== undefined || total_dispatch_qty !== undefined || total_amount !== undefined)) {
      return (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryAvatar}>
              <Icon name="sigma" size={iconSize.md} color={t.brand.tint} />
            </View>
            <Text style={styles.summaryTitle} accessibilityRole="header">Invoice summary</Text>
          </View>

          <View style={styles.summaryContent}>
            {renderSummaryRow('Total items', formatCount(total_items ?? groupedItems.length))}
            {renderSummaryRow('GRN items', formatCount(groupedItems.length))}
            {renderSummaryRow('Dispatch entries', formatCount(items.length))}
            {total_dispatch_qty !== undefined &&
              renderSummaryRow('Total dispatch qty', formatCount(total_dispatch_qty))}
            {total_amount !== undefined && (
              <View
                style={[styles.summaryRow, styles.summaryRowTotal]}
                accessible
                accessibilityLabel={`Total amount, ${formatInvoiceAmount(total_amount)}`}
              >
                <Text style={styles.summaryLabelTotal}>Total amount</Text>
                <Text style={styles.summaryValueTotal}>{formatInvoiceAmount(total_amount)}</Text>
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
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading items…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
