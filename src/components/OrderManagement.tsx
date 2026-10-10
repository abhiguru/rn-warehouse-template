import { getSessionGeneration } from '@/config/sessionLifecycle';
import { useOrderLiveUpdates } from '@/hooks/useOrderLiveUpdates';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
  Modal,
} from 'react-native';
import {
  Surface,
  ActivityIndicator,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { OrderService } from '@/services/order-service';
import { Order, OrderItem, Customer } from '@/types/order.types';
import { useAppSelector } from '@/store/hooks';
import ItemCatalogBrowser from './ItemCatalogBrowser';
import OrderItemCard from './OrderItemCard';
import CustomerOrderSummary from './CustomerOrderSummary';
import RecentDispatchesSection from './RecentDispatchesSection';
import { searchService, SearchResult } from '@/services/search-service';

import { showAlert } from '@/utils/alert';
import { normalizeDigits, t as tr } from '@/i18n';
import { serverText } from '@/utils/serverText';
interface OrderManagementProps {
  customerId?: string;
  onOpenItemCatalog?: () => void;
  itemCatalogOpen?: boolean;
  onCloseItemCatalog?: () => void;
}

const OrderManagement: React.FC<OrderManagementProps> = ({
  customerId,
  onOpenItemCatalog,
  itemCatalogOpen,
  onCloseItemCatalog,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const { userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showItemCatalogInternal, setShowItemCatalogInternal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<SearchResult[]>([]);

  // Use external control if provided, otherwise internal state
  const showItemCatalog = itemCatalogOpen !== undefined ? itemCatalogOpen : showItemCatalogInternal;
  const setShowItemCatalog = (onOpenItemCatalog || onCloseItemCatalog)
    ? (show: boolean) => {
        if (show && onOpenItemCatalog) onOpenItemCatalog();
        if (!show && onCloseItemCatalog) onCloseItemCatalog();
      }
    : setShowItemCatalogInternal;

  // Initialize order for customer
  const initializeOrder = useCallback(async (custId: string) => {
    try {
      setLoading(true);
      if (__DEV__) console.log('[OrderManagement] Initializing order for customer:', custId);

      // Get or create order
      const orderResult = await OrderService.getOrCreateOrder(custId);
      
      if (!orderResult.success) {
        showAlert(tr('orders.manage.couldNotOpenTitle'), serverText(orderResult.message, tr('common.checkConnection')));
        return;
      }

      if (__DEV__) console.log('[OrderManagement] About to fetch order details with cart_id:', orderResult.data!.cart_id);

      // Fetch order with items
      const orderDetailsResult = await OrderService.getOrderWithItems(orderResult.data!.cart_id);
      
      if (__DEV__) console.log('[OrderManagement] Order details result:', {
        success: orderDetailsResult.success,
        hasData: !!orderDetailsResult.data,
        error: orderDetailsResult.error,
        message: orderDetailsResult.message
      });

      if (orderDetailsResult.success && orderDetailsResult.data) {
        if (__DEV__) console.log('[OrderManagement] Setting order data:', {
          orderId: orderDetailsResult.data.id,
          customer: orderDetailsResult.data.customer?.name,
          itemCount: orderDetailsResult.data.total_items,
          totalQuantity: orderDetailsResult.data.total_quantity,
          hasItems: !!orderDetailsResult.data.items,
          itemsLength: orderDetailsResult.data.items?.length || 0,
          updated_at: orderDetailsResult.data.updated_at,
          created_at: orderDetailsResult.data.created_at,
          updated_by: orderDetailsResult.data.updated_by_display_name,
        });

        setOrder(orderDetailsResult.data);
        setSelectedCustomer(orderDetailsResult.data.customer || null);
      } else {
        console.error('[OrderManagement] Failed to load order details:', {
          success: orderDetailsResult.success,
          error: orderDetailsResult.error,
          message: orderDetailsResult.message
        });
        showAlert(tr('orders.manage.couldNotLoadTitle'), tr('common.checkConnection'));
      }
    } catch (error) {
      console.error('[OrderManagement] Error initializing order:', error);
      showAlert(tr('orders.manage.couldNotOpenTitle'), tr('common.checkConnection'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    if (customerId) {
      initializeOrder(customerId);
    } else {
      // Show customer search if no customerId provided
      setShowCustomerSearch(true);
    }
  }, [customerId]);

  // Search customers
  const searchCustomers = useCallback(async (query: string) => {
    try {
      const results = await searchService.searchCustomers(normalizeDigits(query));
      setCustomerSearchResults(results);
    } catch (error) {
      console.error('[OrderManagement] Customer search error:', error);
    }
  }, []);

  // Handle customer search
  useEffect(() => {
    if (customerSearchQuery.length > 2) {
      searchCustomers(customerSearchQuery);
    } else {
      setCustomerSearchResults([]);
    }
  }, [customerSearchQuery]);

  // Handle customer selection
  const handleCustomerSelect = useCallback(async (customer: SearchResult) => {
    if (__DEV__) console.log('[OrderManagement] Customer selected:', customer);

    setShowCustomerSearch(false);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    await initializeOrder(customer.value);
  }, [initializeOrder]);

  const activeOrderId = useRef(order?.id);
  activeOrderId.current = order?.id;
  useEffect(() => () => { activeOrderId.current = undefined; }, []);

  // Handle refresh
  const onRefresh = useCallback(async () => {
    if (!order) return;
    
    const sessionGeneration = getSessionGeneration();
    setRefreshing(true);
    try {
      const result = await OrderService.getOrderWithItems(order.id);
      if (sessionGeneration !== getSessionGeneration() || activeOrderId.current !== order.id) return;
      if (result.success && result.data) {
        setOrder(result.data);
      }
    } catch (error) {
      console.error('[OrderManagement] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [order]);

  useOrderLiveUpdates(onRefresh, !!order);

  // Handle quantity update
  // Resolves true only when the server stored the quantity.
  const handleQuantityUpdate = useCallback(async (item: OrderItem, newQuantity: number): Promise<boolean> => {
    if (!order) return false;

    try {
      const result = await OrderService.updateOrderItemQuantity(
        item.id,
        order.id,
        newQuantity
      );

      if (result.success) {
        // Refresh order
        await onRefresh();
        return true;
      }
      showAlert(tr('orders.manage.couldNotChangeQuantityTitle'), serverText(result.message, tr('common.checkConnection')));
      return false;
    } catch (error) {
      console.error('[OrderManagement] Update quantity error:', error);
      showAlert(tr('orders.manage.couldNotChangeQuantityTitle'), tr('common.checkConnection'));
      return false;
    }
  }, [order, onRefresh]);

  // Handle item removal
  const handleRemoveItem = useCallback(async (item: OrderItem) => {
    if (!order) return;

    const itemName = item.grn_item?.name;
    showAlert(
      itemName ? tr('orders.manage.removeTitle', { name: itemName }) : tr('orders.manage.removeTitleNoName'),
      itemName ? tr('orders.manage.removeMessage', { name: itemName }) : tr('orders.manage.removeMessageNoName'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('orders.manage.removeItem'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await OrderService.removeItemFromOrder(item.id, order.id);
              if (result.success) {
                await onRefresh();
              } else {
                showAlert(tr('orders.manage.couldNotRemoveTitle'), serverText(result.message, tr('common.checkConnection')));
              }
            } catch (error) {
              console.error('[OrderManagement] Remove item error:', error);
              showAlert(tr('orders.manage.couldNotRemoveTitle'), tr('common.checkConnection'));
            }
          }
        }
      ]
    );
  }, [order, onRefresh]);

  // Handle items updated from catalog (sync quantities, don't add)
  const handleItemsAdded = useCallback(async (items: Array<{grnItemId: string, quantity: number}>) => {
    if (!order) return;

    try {
      let successCount = 0;
      let failureCount = 0;

      // Create a map of current order items for easy lookup
      const currentOrderItemsMap = new Map();
      order.items?.forEach(orderItem => {
        currentOrderItemsMap.set(orderItem.grn_item_id, orderItem);
      });

      for (const item of items) {
        const existingOrderItem = currentOrderItemsMap.get(item.grnItemId);
        
        if (existingOrderItem) {
          // Update existing item quantity
          if (existingOrderItem.requested_quantity !== item.quantity) {
            const result = await OrderService.updateOrderItemQuantity(
              existingOrderItem.id,
              order.id,
              item.quantity
            );
            
            if (result.success) {
              successCount++;
            } else {
              failureCount++;
              console.error('[OrderManagement] Failed to update item:', result.message);
            }
          }
        } else {
          // Add new item to order
          const result = await OrderService.addItemToOrder(
            order.id,
            item.grnItemId,
            item.quantity
          );

          if (result.success) {
            successCount++;
          } else {
            failureCount++;
            console.error('[OrderManagement] Failed to add item:', result.message);
          }
        }
      }

      // Handle items that were removed (exist in order but not in selected items)
      const selectedItemIds = new Set(items.map(item => item.grnItemId));
      // The catalog only sees open lines, so only open lines can be deselected.
      const itemsToRemove = order.items?.filter(orderItem =>
        (orderItem.item_status || '').toLowerCase() !== 'fulfilled' &&
        !selectedItemIds.has(orderItem.grn_item_id)
      ) || [];

      for (const orderItem of itemsToRemove) {
        const result = await OrderService.removeItemFromOrder(orderItem.id, order.id);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          console.error('[OrderManagement] Failed to remove item:', result.message);
        }
      }

      if (successCount > 0) {
        await onRefresh();
      }

      if (failureCount > 0) {
        showAlert(
          tr('orders.manage.someNotUpdatedTitle'),
          tr('orders.manage.someNotUpdatedMessage')
        );
      }
    } catch (error) {
      console.error('[OrderManagement] Update items error:', error);
      showAlert(tr('orders.manage.couldNotUpdateTitle'), tr('common.checkConnection'));
    }
  }, [order, onRefresh]);


  if (loading && !order) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel={tr('orders.manage.loadingLabel')} />
        <Text style={styles.loadingText}>{tr('orders.manage.loading')}</Text>
      </View>
    );
  }

  const closeCustomerSearch = () => {
    setShowCustomerSearch(false);
    if (!selectedCustomer) {
      router.back();
    }
  };

  return (
    <Surface style={styles.container} elevation={0}>

      {/* Order Items */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Recent Dispatches Section - Show customer's recent dispatch history */}
        {customerId && (
          <RecentDispatchesSection customerId={customerId} />
        )}

        {order && order.items && order.items.filter(item =>
          (item.item_status || '').toLowerCase() !== 'fulfilled'
        ).length > 0 ? (
          <>
            {order.items
              .filter(item => (item.item_status || '').toLowerCase() !== 'fulfilled')
              .map((item) => (
                <OrderItemCard
                  key={item.id}
                  item={item}
                  onQuantityChange={(newQty) => handleQuantityUpdate(item, newQty)}
                  onRemove={() => handleRemoveItem(item)}
                />
              ))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Icon name="clipboard-list-outline" size={iconSize.hero} color={t.icon.secondary} />
            <Text style={styles.emptyText} accessibilityRole="header">{tr('orders.manage.emptyTitle')}</Text>
            <Text style={styles.emptySubtext}>
              {tr('orders.manage.emptyMessage')}
            </Text>
            <Button
              type="primary"
              size="standalone"
              leftIcon="plus"
              onPress={() => setShowItemCatalog(true)}
              accessibilityLabel={tr('orders.screen.addItemsToOrder')}
            >
              {tr('orders.catalog.addItems')}
            </Button>
          </View>
        )}
      </ScrollView>


      {/* Sticky Order Summary Card - only show if there are non-fulfilled items */}
      {order && order.items && order.items.filter(item =>
        (item.item_status || '').toLowerCase() !== 'fulfilled'
      ).length > 0 && (
        <CustomerOrderSummary order={order} />
      )}

      {/* Customer search dialog (style guide §13.9); Android back closes it */}
      <Modal
        visible={showCustomerSearch}
        transparent
        animationType="fade"
        onRequestClose={closeCustomerSearch}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeCustomerSearch}
            accessibilityRole="button"
            accessibilityLabel={tr('customers.search.close')}
          />
          <View style={[styles.modalContent, { marginTop: insets.top + space.xxl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} accessibilityRole="header">{tr('customers.search.title')}</Text>
              <Pressable
                onPress={closeCustomerSearch}
                style={({ pressed }) => [styles.modalCloseButton, pressed && styles.modalCloseButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel={tr('customers.search.close')}
              >
                <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
              </Pressable>
            </View>

            <View style={styles.searchField}>
              <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
              <TextInput
                style={styles.searchInput}
                placeholder={tr('customers.search.placeholder')}
                value={customerSearchQuery}
                onChangeText={setCustomerSearchQuery}
                placeholderTextColor={t.text.placeholder}
                accessibilityLabel={tr('customers.search.placeholder')}
                autoCorrect={false}
                returnKeyType="search"
                autoFocus
              />
            </View>

            <ScrollView style={styles.customerList} keyboardShouldPersistTaps="handled">
              {customerSearchResults.map((customer) => (
                <Pressable
                  key={customer.value}
                  style={({ pressed }) => [styles.customerItem, pressed && styles.customerItemPressed]}
                  onPress={() => handleCustomerSelect(customer)}
                  accessibilityRole="button"
                  accessibilityLabel={customer.detail ? tr('orders.manage.labelDetail', { label: customer.label, detail: customer.detail }) : customer.label}
                >
                  <Text style={styles.customerName}>{customer.label}</Text>
                  {customer.detail && (
                    <Text style={styles.customerDetail}>{customer.detail}</Text>
                  )}
                </Pressable>
              ))}

              {customerSearchQuery.length > 2 && customerSearchResults.length === 0 && (
                <Text style={styles.noResults}>
                  {tr('customers.search.noMatchTryFewer', { search: customerSearchQuery })}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Item Catalog Modal */}
      {showItemCatalog && order && selectedCustomer && (
        <ItemCatalogBrowser
          isVisible={showItemCatalog}
          onClose={() => setShowItemCatalog(false)}
          onAddItems={handleItemsAdded}
          currentOrderId={order.id}
          customerId={selectedCustomer.id}
          currentOrderItems={order.items
            ?.filter(item => (item.item_status || '').toLowerCase() !== 'fulfilled')
            .map(item => ({
              grnItemId: item.grn_item_id,
              quantity: item.requested_quantity,
              item: item.grn_item!
            })) || []}
        />
      )}
    </Surface>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: space.xl,
    paddingBottom: space.max + space.lg, // Space for the sticky summary bar
  },
  // Empty state (style guide §13.6)
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.giant,
    paddingHorizontal: space.xxxl,
    gap: space.sm,
  },
  emptyText: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.md,
  },
  emptySubtext: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.lg,
  },
  // Dialog over the scrim
  modalOverlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'flex-start' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
  },
  modalContent: {
    backgroundColor: t.surface.sheet,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '80%' as const,
    borderRadius: radius.card,
    ...t.shadow[4],
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  modalTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  modalCloseButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modalCloseButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  searchField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    margin: space.lg,
    paddingHorizontal: space.md,
    minHeight: layout.rowMinHeight,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    paddingVertical: space.sm,
  },
  customerList: {
    maxHeight: 400,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  customerItem: {
    minHeight: layout.rowMinHeight,
    justifyContent: 'center' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  customerItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  customerName: {
    ...typography.headline,
    color: t.text.primary,
  },
  customerDetail: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  noResults: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginTop: space.xxxl,
  },
});

export default OrderManagement;