/**
 * CustomerOrderGroupCard - Expandable Order Card for Supervisor Queue
 *
 * Displays a customer's order with expandable items list and Generate Dispatch button.
 * Used in the Supervisor Order Queue screen.
 *
 * @module list-items/CustomerOrderGroupCard
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatCount, formatNumber, formatRelativeTime } from '@/utils/formatters';
import { Avatar, StatusTag } from '@/components/ui';
import { useAppDispatch } from '@/store/hooks';
import { loadFromOrder } from '@/store/slices/dispatchFormSlice';
import { convertOrderToDispatchData, canConvertToDispatch } from '@/utils/orderToDispatchConverter';
import { OrderService } from '@/services/order-service';
import type { Order, OrderItem } from '@/types/order.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
// ============================================================================
// TYPES
// ============================================================================

export interface CustomerOrderGroupCardProps {
  /** Order data to render */
  order: Order;
  /** Whether the card is expanded */
  isExpanded: boolean;
  /** Callback when expand/collapse is toggled */
  onToggleExpand: (orderId: string) => void;
  /**
   * @deprecated Ignored. The card reads the semantic tokens itself; kept so
   * existing callers that still pass their list colours compile.
   */
  colors?: unknown;
}

// ============================================================================
// COMPONENT
// ============================================================================

const CustomerOrderGroupCardContent: React.FC<CustomerOrderGroupCardProps> = ({
  order,
  isExpanded,
  onToggleExpand,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const router = useRouter();
  const dispatch = useAppDispatch();

  // State for fetched items (since getOrdersList doesn't include items)
  const [fetchedItems, setFetchedItems] = useState<OrderItem[] | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [fullOrder, setFullOrder] = useState<Order | null>(null);

  // Calculate totals - handle both legacy and new field names
  const itemCount = order.item_count ?? order.total_items ?? order.items?.length ?? 0;
  const totalQty = order.quantity_sum ?? order.total_quantity ?? 0;

  // Use fetched items if available, otherwise fall back to order.items
  const displayItems = fetchedItems ?? order.items ?? [];

  // Check if order can be converted to dispatch (use fullOrder if fetched)
  const canDispatch = useMemo(() => {
    const orderToCheck = fullOrder ?? order;
    return canConvertToDispatch(orderToCheck);
  }, [order, fullOrder]);

  // Reset cached items when order changes (e.g., after editing)
  useEffect(() => {
    // Clear cached data when order is updated
    setFetchedItems(null);
    setFullOrder(null);
  }, [order.updated_at, order.item_count, order.quantity_sum]);

  // Fetch full order details when expanded (if items not already loaded)
  useEffect(() => {
    if (isExpanded && !fetchedItems && !isLoadingItems) {
      const fetchOrderDetails = async () => {
        setIsLoadingItems(true);
        try {
          if (__DEV__) console.log('[CustomerOrderGroupCard] Fetching items for order:', order.id);
          const result = await OrderService.getOrderWithItems(order.id);
          if (result.success && result.data) {
            setFetchedItems(result.data.items ?? []);
            setFullOrder(result.data);
            if (__DEV__) console.log('[CustomerOrderGroupCard] Fetched items:', result.data.items?.length ?? 0);
          }
        } catch (error) {
          console.error('[CustomerOrderGroupCard] Error fetching items:', error);
        } finally {
          setIsLoadingItems(false);
        }
      };
      fetchOrderDetails();
    }
  }, [isExpanded, fetchedItems, isLoadingItems, order.id]);

  // Toggle expand with animation
  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleExpand(order.id);
  }, [order.id, onToggleExpand]);

  // Handle Generate Dispatch button press
  const handleGenerateDispatch = useCallback(() => {
    const orderToDispatch = fullOrder ?? order;
    if (__DEV__) console.log('[CustomerOrderGroupCard] Generate Dispatch pressed for order:', orderToDispatch.id);

    if (!canDispatch) {
      showAlert(
        "Can't create a dispatch",
        'No items in this order have stock available. Each item needs a GRN with stock.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Convert order to dispatch data (use fullOrder which has items)
    const { header, items, skippedItems } = convertOrderToDispatchData(orderToDispatch);

    if (__DEV__) console.log('[CustomerOrderGroupCard] Converted dispatch data:', {
      headerCustomer: header.customer_name,
      itemsCount: items.length,
      skippedCount: skippedItems.length,
    });

    // Show warning if some items were skipped
    if (skippedItems.length > 0) {
      const skippedNames = skippedItems
        .map(s => `• ${s.item.grn_item?.name || 'Unknown item'}: ${s.reason}`)
        .join('\n');

      showAlert(
        'Some items will be skipped',
        `These items can't be dispatched:\n\n${skippedNames}\n\nCreate a dispatch with ${formatCount(items.length, 'item')}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create dispatch',
            onPress: () => {
              dispatch(loadFromOrder({
                header,
                items,
                source_order_id: order.id,
              }));
              router.push('/dispatch-form/step1');
            },
          },
        ]
      );
    } else {
      // No skipped items, proceed directly
      dispatch(loadFromOrder({
        header,
        items,
        source_order_id: order.id,
      }));
      router.push('/dispatch-form/step1');
    }
  }, [order, fullOrder, canDispatch, dispatch, router]);

  // Navigate to order details for editing
  const handleEditOrder = useCallback(() => {
    router.push(`/orders/${order.customer_id}`);
  }, [order.customer_id, router]);

  const customerName = order.customer?.name || 'Unknown customer';
  // Same wording as the order rows: "3 items · 45 units".
  const itemsLabel = formatCount(itemCount, 'item');
  const unitsLabel = formatCount(totalQty, 'unit');

  return (
    <View style={styles.card}>
      {/* Customer Header - Always visible */}
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${customerName}, ${itemsLabel}, ${unitsLabel}, open`}
        accessibilityState={{ expanded: isExpanded }}
      >
        {/* Customer Avatar */}
        <Avatar name={customerName} id={order.customer_id || order.id} />

        {/* Customer Info */}
        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={2}>
            {customerName}
          </Text>
          <View style={styles.metaRow}>
            <Icon name="package-variant" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.metaText}>{itemsLabel}</Text>
            <Text style={styles.metaText}>·</Text>
            <Text style={styles.metaText}>{unitsLabel}</Text>
          </View>
        </View>

        {/* Status Tag + Chevron */}
        <View style={styles.rightSection}>
          <StatusTag status="neutral" label="Open" />
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.lg}
            color={t.icon.secondary}
          />
        </View>
      </Pressable>

      {/* Expanded Content - Fiori Data Table Layout */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {/* Order Items Section */}
          {isLoadingItems ? (
            <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel="Loading items">
              <ActivityIndicator size="small" color={t.brand.tint} />
              <Text style={styles.loadingText}>Loading items…</Text>
            </View>
          ) : displayItems.length > 0 ? (
            <View>
              {/* Data Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.colItem]}>Item</Text>
                <Text style={[styles.tableHeaderCell, styles.colStock, styles.numeric]}>Stock</Text>
                <Text style={[styles.tableHeaderCell, styles.colQty, styles.numeric]}>Qty</Text>
              </View>

              {/* Data Table Rows */}
              {displayItems.slice(0, 5).map((item) => {
                const currentStock = item.grn_item?.current_stock || 0;
                const requestedQty = item.requested_quantity || 0;
                const hasEnoughStock = currentStock >= requestedQty;
                const itemName = item.grn_item?.name || 'Unknown item';

                return (
                  <View
                    key={item.id}
                    style={styles.tableRow}
                    accessible
                    accessibilityLabel={`${itemName}, stock ${currentStock}, quantity ${requestedQty}${hasEnoughStock ? '' : ', low stock'}`}
                  >
                    {/* Item Column - Primary info */}
                    <View style={[styles.tableCell, styles.colItem]}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {itemName}
                      </Text>
                      {item.grn_item?.package_mark && (
                        <Text style={styles.itemMark} numberOfLines={1}>
                          {item.grn_item.package_mark}
                        </Text>
                      )}
                    </View>

                    {/* Stock Column - With status icon when short */}
                    <View style={[styles.tableCell, styles.colStock, styles.stockCell]}>
                      {!hasEnoughStock && (
                        <Icon name="alert" size={iconSize.sm} color={t.status.critical.text} />
                      )}
                      <Text style={[styles.stockValue, !hasEnoughStock && styles.stockValueLow]}>
                        {formatNumber(currentStock)}
                      </Text>
                    </View>

                    {/* Quantity Column */}
                    <View style={[styles.tableCell, styles.colQty]}>
                      <Text style={styles.qtyText}>{formatNumber(requestedQty)}</Text>
                    </View>
                  </View>
                );
              })}

              {/* More items indicator */}
              {displayItems.length > 5 && (
                <View style={styles.moreItemsRow}>
                  <Text style={styles.moreItemsText}>
                    {formatCount(displayItems.length - 5, 'more item')}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyItemsContainer}>
              <Icon name="package-variant-closed" size={iconSize.xl} color={t.icon.secondary} />
              <Text style={styles.noItemsText}>No items in this order.</Text>
            </View>
          )}

          {/* Footer Info - Fiori Key-Value style */}
          {order.updated_at && (
            <View style={styles.footerInfo}>
              <View style={styles.keyValueRow}>
                <Text style={styles.keyLabel}>Last updated</Text>
                <Text style={styles.valueText}>
                  {formatRelativeTime(order.updated_at)}
                  {order.updated_by_display_name ? ` by ${order.updated_by_display_name}` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons - Fiori Toolbar */}
          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
              onPress={handleEditOrder}
              accessibilityRole="button"
              accessibilityLabel={`Edit order for ${customerName}`}
            >
              <Icon name="pencil-outline" size={iconSize.md} color={t.text.primary} />
              <Text style={styles.editButtonText}>Edit</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.dispatchButton,
                pressed && styles.dispatchButtonPressed,
                !canDispatch && styles.disabled,
              ]}
              onPress={handleGenerateDispatch}
              disabled={!canDispatch}
              accessibilityRole="button"
              accessibilityLabel="Create dispatch"
              accessibilityHint={canDispatch ? undefined : 'No items have stock available to dispatch'}
              accessibilityState={{ disabled: !canDispatch }}
            >
              <Icon name="truck-delivery-outline" size={iconSize.md} color={t.brand.onFill} />
              <Text style={styles.dispatchButtonText}>Create dispatch</Text>
            </Pressable>
          </View>
          {!canDispatch && !isLoadingItems && (
            <Text style={styles.helperText}>
              No items have stock available to dispatch.
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// MEMOIZATION
// ============================================================================

const areEqual = (
  prevProps: CustomerOrderGroupCardProps,
  nextProps: CustomerOrderGroupCardProps
): boolean => {
  return (
    prevProps.order.id === nextProps.order.id &&
    prevProps.order.item_count === nextProps.order.item_count &&
    prevProps.order.quantity_sum === nextProps.order.quantity_sum &&
    prevProps.order.updated_at === nextProps.order.updated_at &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.onToggleExpand === nextProps.onToggleExpand
  );
};

export const CustomerOrderGroupCard = React.memo(CustomerOrderGroupCardContent, areEqual);

// ============================================================================
// STYLES - SAP Fiori object cell and table (style guide §13.6, §13.7)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginVertical: space.xs,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: space.lg,
    gap: space.md,
    minHeight: layout.objectCellMinHeight,
    borderRadius: radius.card,
  },
  headerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  customerInfo: {
    flex: 1,
    gap: space.xxs,
  },
  customerName: {
    ...typography.headline,
    color: t.text.primary,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
  },
  metaText: {
    ...typography.subhead,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  rightSection: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  loadingContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.xxxl,
    gap: space.sm,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },

  // Data table
  tableHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 36,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: t.background.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  tableHeaderCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  numeric: {
    textAlign: 'right' as const,
  },
  tableRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  tableCell: {
    justifyContent: 'center' as const,
  },
  colItem: {
    flex: 1,
    paddingRight: space.md,
  },
  colStock: {
    width: 72,
    alignItems: 'flex-end' as const,
  },
  colQty: {
    width: 56,
    alignItems: 'flex-end' as const,
  },
  stockCell: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
  },
  itemName: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
  },
  itemMark: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  stockValue: {
    ...typography.subhead,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  stockValueLow: {
    color: t.status.critical.text,
    fontWeight: fontWeight.semibold,
  },
  qtyText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  moreItemsRow: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.md,
  },
  moreItemsText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  emptyItemsContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.xxxl,
    gap: space.sm,
  },
  noItemsText: {
    ...typography.subhead,
    color: t.text.secondary,
  },

  // Key-value footer
  footerInfo: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  keyValueRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  keyLabel: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  valueText: {
    ...typography.footnote,
    color: t.text.primary,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  editButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    gap: space.s6,
  },
  editButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  editButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  dispatchButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    gap: space.s6,
    backgroundColor: t.brand.fill,
  },
  dispatchButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  dispatchButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
});

export default CustomerOrderGroupCard;
