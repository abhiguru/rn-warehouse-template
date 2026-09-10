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
  TouchableOpacity,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatRelativeTime } from '@/utils/formatters';
import { useAppDispatch } from '@/store/hooks';
import { loadFromOrder } from '@/store/slices/dispatchFormSlice';
import { convertOrderToDispatchData, canConvertToDispatch } from '@/utils/orderToDispatchConverter';
import { OrderService } from '@/services/order-service';
import type { Order, OrderItem } from '@/types/order.types';
import type { ListColors } from '@/hooks/useListColors';
import theme from '@/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  /** Theme-aware list colors for dark mode support */
  colors: ListColors;
}

// ============================================================================
// COMPONENT
// ============================================================================

const CustomerOrderGroupCardContent: React.FC<CustomerOrderGroupCardProps> = ({
  order,
  isExpanded,
  onToggleExpand,
  colors,
}) => {
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
      Alert.alert(
        'Cannot Create Dispatch',
        'This order has no items with available stock. All items must have GRN data and stock available.',
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
        .map(s => `• ${s.item.grn_item?.name || 'Unknown'}: ${s.reason}`)
        .join('\n');

      Alert.alert(
        'Some Items Skipped',
        `The following items cannot be dispatched:\n\n${skippedNames}\n\nProceed with ${items.length} item(s)?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
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

  return (
    <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
      {/* Customer Header - Always visible */}
      <TouchableOpacity
        onPress={handleToggle}
        style={styles.header}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${order.customer?.name || 'Unknown Customer'}, ${itemCount} items, ${isExpanded ? 'collapse' : 'expand'}`}
      >
        {/* Customer Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {(order.customer?.name || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Customer Info */}
        <View style={styles.customerInfo}>
          <Text style={[styles.customerName, { color: colors.gray900 }]} numberOfLines={1}>
            {order.customer?.name || 'Unknown Customer'}
          </Text>
          <View style={styles.metaRow}>
            <Icon name="package-variant" size={14} color={colors.gray500} />
            <Text style={[styles.metaText, { color: colors.gray500 }]}>
              {itemCount} items
            </Text>
            <View style={[styles.dot, { backgroundColor: colors.gray400 }]} />
            <Icon name="counter" size={14} color={colors.gray500} />
            <Text style={[styles.metaText, { color: colors.gray500 }]}>
              {totalQty} qty
            </Text>
          </View>
        </View>

        {/* Status Badge + Chevron */}
        <View style={styles.rightSection}>
          <View style={[styles.statusBadge, { backgroundColor: colors.statusPositiveLight }]}>
            <Text style={[styles.statusText, { color: colors.statusPositive }]}>Active</Text>
          </View>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={colors.gray400}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded Content - Fiori Data Table Layout */}
      {isExpanded && (
        <View style={[styles.expandedContent, { borderTopColor: colors.cellDivider }]}>
          {/* Order Items Section */}
          {isLoadingItems ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.gray500 }]}>Loading items...</Text>
            </View>
          ) : displayItems.length > 0 ? (
            <View style={styles.itemsSection}>
              {/* Data Table Header - Fiori spec: 44pt height, 13pt semibold */}
              <View style={[styles.tableHeader, { backgroundColor: colors.gray50, borderBottomColor: colors.cellDivider }]}>
                <Text style={[styles.tableHeaderCell, styles.colItem, { color: colors.textSecondary }]}>ITEM</Text>
                <Text style={[styles.tableHeaderCell, styles.colStock, { color: colors.textSecondary }]}>STOCK</Text>
                <Text style={[styles.tableHeaderCell, styles.colQty, { color: colors.textSecondary }]}>QTY</Text>
              </View>

              {/* Data Table Rows */}
              {displayItems.slice(0, 5).map((item, index) => {
                const currentStock = item.grn_item?.current_stock || 0;
                const requestedQty = item.requested_quantity || 0;
                const hasEnoughStock = currentStock >= requestedQty;

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.tableRow,
                      { backgroundColor: index % 2 === 0 ? colors.cellBackground : colors.gray50 },
                    ]}
                  >
                    {/* Item Column - Primary info */}
                    <View style={[styles.tableCell, styles.colItem]}>
                      <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.grn_item?.name || 'Unknown Item'}
                      </Text>
                      {item.grn_item?.package_mark && (
                        <Text style={[styles.itemMark, { color: colors.textTertiary }]} numberOfLines={1}>
                          {item.grn_item.package_mark}
                        </Text>
                      )}
                    </View>

                    {/* Stock Column - With status indicator */}
                    <View style={[styles.tableCell, styles.colStock]}>
                      <Text
                        style={[
                          styles.stockValue,
                          { color: hasEnoughStock ? colors.statusPositive : colors.statusCritical },
                        ]}
                      >
                        {currentStock}
                      </Text>
                    </View>

                    {/* Quantity Column - Badge */}
                    <View style={[styles.tableCell, styles.colQty]}>
                      <View
                        style={[
                          styles.qtyBadge,
                          { backgroundColor: hasEnoughStock ? colors.statusPositiveLight : colors.statusCriticalLight },
                        ]}
                      >
                        <Text
                          style={[
                            styles.qtyText,
                            { color: hasEnoughStock ? colors.statusPositive : colors.statusCritical },
                          ]}
                        >
                          {requestedQty}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* More items indicator */}
              {displayItems.length > 5 && (
                <View style={[styles.moreItemsRow, { borderTopColor: colors.cellDivider }]}>
                  <Icon name="dots-horizontal" size={16} color={colors.textTertiary} />
                  <Text style={[styles.moreItemsText, { color: colors.textTertiary }]}>
                    {displayItems.length - 5} more items
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyItemsContainer}>
              <Icon name="package-variant-closed" size={32} color={colors.gray300} />
              <Text style={[styles.noItemsText, { color: colors.textTertiary }]}>
                No items in this order
              </Text>
            </View>
          )}

          {/* Footer Info - Fiori Key-Value style */}
          <View style={[styles.footerInfo, { borderTopColor: colors.cellDivider }]}>
            {order.updated_at && (
              <View style={styles.keyValueRow}>
                <Text style={[styles.keyLabel, { color: colors.textTertiary }]}>Last updated</Text>
                <Text style={[styles.valueText, { color: colors.textSecondary }]}>
                  {formatRelativeTime(order.updated_at)}
                  {order.updated_by_display_name ? ` by ${order.updated_by_display_name}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons - Fiori Toolbar */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.editButton, { borderColor: colors.gray300 }]}
              onPress={handleEditOrder}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit order"
            >
              <Icon name="pencil" size={18} color={colors.textSecondary} />
              <Text style={[styles.editButtonText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.dispatchButton,
                { backgroundColor: colors.primary },
                !canDispatch && { backgroundColor: colors.gray200 },
              ]}
              onPress={handleGenerateDispatch}
              disabled={!canDispatch}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Generate dispatch"
              accessibilityState={{ disabled: !canDispatch }}
            >
              <Icon
                name="truck-delivery"
                size={18}
                color={canDispatch ? '#FFFFFF' : colors.gray400}
              />
              <Text
                style={[
                  styles.dispatchButtonText,
                  { color: '#FFFFFF' },
                  !canDispatch && { color: colors.gray400 },
                ]}
              >
                Generate Dispatch
              </Text>
            </TouchableOpacity>
          </View>
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
    prevProps.onToggleExpand === nextProps.onToggleExpand &&
    prevProps.colors === nextProps.colors
  );
};

export const CustomerOrderGroupCard = React.memo(CustomerOrderGroupCardContent, areEqual);

// ============================================================================
// STYLES - SAP Fiori Object Cell & Card Compliant
// ============================================================================

const styles = StyleSheet.create({
  // Card Container - Fiori spec: 12pt corner radius
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12, // Fiori card corner radius
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  // Object Cell Header - Fiori spec: 16pt padding
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16, // Fiori card padding
    gap: 12,
    minHeight: 72, // Fiori object cell min height
  },
  // Avatar/Detail Image - Fiori spec: 44pt circular
  avatar: {
    width: 44, // Fiori detail image size
    height: 44,
    borderRadius: 22, // Circular for users
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  // Main Content - Fiori object cell main content area
  customerInfo: {
    flex: 1,
    gap: 2,
  },
  // Title - Fiori spec: 17pt semibold
  customerName: {
    fontSize: 17, // Fiori object cell title
    fontWeight: '600',
    letterSpacing: -0.41,
  },
  // Subtitle/Meta - Fiori spec: 13pt
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 13, // Fiori subtitle font size
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  // Attribute Area (Right) - Fiori spec: status + chevron
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Status Badge/Tag - Fiori spec: 20pt height, pill shape
  statusBadge: {
    height: 20, // Fiori compact tag height
    paddingHorizontal: 8,
    borderRadius: 10, // Fiori pill shape
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11, // Fiori compact tag font size
    fontWeight: '600',
  },
  // Expanded Content - Fiori card body
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
  },

  // =========================================================================
  // DATA TABLE STYLES - SAP Fiori spec: 20-data-table.md
  // =========================================================================

  itemsSection: {
    // No additional padding - table stretches full width
  },

  // Table Header - Fiori spec: 44pt min height, 13pt semibold uppercase
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeaderCell: {
    fontSize: 11, // Fiori compact header
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Table Row - Fiori spec: 44pt min height for touch
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tableCell: {
    justifyContent: 'center',
  },

  // Column widths - Item takes flex, Stock and Qty are fixed
  colItem: {
    flex: 1,
    paddingRight: 12,
  },
  colStock: {
    width: 48,
    alignItems: 'center',
  },
  colQty: {
    width: 48,
    alignItems: 'flex-end',
  },

  // Item cell - Title and subtitle
  itemName: {
    fontSize: 15, // Fiori table cell font
    fontWeight: '500',
  },
  itemMark: {
    fontSize: 12, // Fiori caption
    marginTop: 2,
  },

  // Stock value - Color-coded
  stockValue: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Quantity Badge - Fiori tag style
  qtyBadge: {
    height: 24, // Fiori default tag height
    minWidth: 32,
    paddingHorizontal: 8,
    borderRadius: 12, // Fiori pill shape
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // More items indicator
  moreItemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  moreItemsText: {
    fontSize: 13,
  },

  // Empty items state
  emptyItemsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  noItemsText: {
    fontSize: 14,
  },

  // =========================================================================
  // KEY-VALUE FOOTER - SAP Fiori spec: 21-key-value-table-view-cell.md
  // =========================================================================

  footerInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyLabel: {
    fontSize: 13, // Fiori key label
    fontWeight: '400',
  },
  valueText: {
    fontSize: 13, // Fiori value - compact for footer
    fontWeight: '400',
  },

  // =========================================================================
  // ACTION BUTTONS - SAP Fiori Toolbar spec
  // =========================================================================

  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Secondary Normal Button - Fiori spec
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // Fiori touch target
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8, // Fiori button corner radius
    borderWidth: 1,
    gap: 6,
  },
  editButtonText: {
    fontSize: 15, // Fiori button font size
    fontWeight: '600',
  },
  // Primary Button - Fiori spec
  dispatchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // Fiori touch target
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8, // Fiori button corner radius
    gap: 6,
  },
  dispatchButtonText: {
    fontSize: 15, // Fiori button font size
    fontWeight: '600',
  },
});

export default CustomerOrderGroupCard;
