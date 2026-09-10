import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import {
  Surface,
  ActivityIndicator,
  Button,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { OrderService } from '@/services/order-service';
import { Order, OrderItem, Customer } from '@/types/order.types';
import { useAppSelector } from '@/store/hooks';
import ItemCatalogBrowser from './ItemCatalogBrowser';
import OrderItemCard from './OrderItemCard';
import CustomerOrderSummary from './CustomerOrderSummary';
import RecentDispatchesSection from './RecentDispatchesSection';
import { searchService, SearchResult } from '@/services/search-service';

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
  // Theme colors for dark mode support
  const colors = useListColors();

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
        Alert.alert('Error', orderResult.message);
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
        Alert.alert('Error', orderDetailsResult.message || 'Failed to load order details');
      }
    } catch (error) {
      console.error('[OrderManagement] Error initializing order:', error);
      Alert.alert('Error', 'Failed to initialize order');
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
      const results = await searchService.searchCustomers(query);
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

  // Handle refresh
  const onRefresh = useCallback(async () => {
    if (!order) return;
    
    setRefreshing(true);
    try {
      const result = await OrderService.getOrderWithItems(order.id);
      if (result.success && result.data) {
        setOrder(result.data);
      }
    } catch (error) {
      console.error('[OrderManagement] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [order]);

  // Handle quantity update
  const handleQuantityUpdate = useCallback(async (item: OrderItem, newQuantity: number) => {
    if (!order) return;

    try {
      const result = await OrderService.updateOrderItemQuantity(
        item.id,
        order.id,
        newQuantity
      );

      if (result.success) {
        // Refresh order
        await onRefresh();
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      console.error('[OrderManagement] Update quantity error:', error);
      Alert.alert('Error', 'Failed to update quantity');
    }
  }, [order, onRefresh]);

  // Handle item removal
  const handleRemoveItem = useCallback(async (item: OrderItem) => {
    if (!order) return;

    Alert.alert(
      'Remove Item',
      `Remove ${item.grn_item?.name} from order?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await OrderService.removeItemFromOrder(item.id, order.id);
              if (result.success) {
                await onRefresh();
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (error) {
              console.error('[OrderManagement] Remove item error:', error);
              Alert.alert('Error', 'Failed to remove item');
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
      const itemsToRemove = order.items?.filter(orderItem => 
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
        Alert.alert(
          'Warning',
          `Some operations failed. Please check and try again.`
        );
      }
    } catch (error) {
      console.error('[OrderManagement] Update items error:', error);
      Alert.alert('Error', 'Failed to update items');
    }
  }, [order, onRefresh]);


  if (loading && !order) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.gray50 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading order...</Text>
      </View>
    );
  }

  return (
    <Surface style={[styles.container, { backgroundColor: colors.gray50 }]} elevation={0}>

      {/* Order Items */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
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
            <View style={[styles.emptyIconContainer, { backgroundColor: colors.gray100 }]}>
              <Icon name="cart-outline" size={64} color={colors.gray400} />
            </View>
            <Text style={[styles.emptyText, { color: colors.gray900 }]}>No items in order</Text>
            <Text style={[styles.emptySubtext, { color: colors.gray500 }]}>
              Tap the + button above to add items from stock
            </Text>
            <TouchableOpacity
              style={[styles.emptyStateCTA, { backgroundColor: colors.primary }]}
              onPress={() => setShowItemCatalog(true)}
              activeOpacity={0.8}
            >
              <Icon name="plus" size={20} color={colors.cellBackground} />
              <Text style={[styles.emptyStateCTAText, { color: colors.cellBackground }]}>Add Items</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>


      {/* Sticky Order Summary Card - only show if there are non-fulfilled items */}
      {order && order.items && order.items.filter(item =>
        (item.item_status || '').toLowerCase() !== 'fulfilled'
      ).length > 0 && (
        <CustomerOrderSummary order={order} />
      )}

      {/* Customer Search Modal */}
      {showCustomerSearch && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 24, backgroundColor: colors.cellBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.cellDivider }]}>
              <Text style={[styles.modalTitle, { color: colors.gray900 }]}>Select Customer</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCustomerSearch(false);
                  if (!selectedCustomer) {
                    router.back();
                  }
                }}
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={24} color={colors.gray600} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.gray100, color: colors.gray900 }]}
              placeholder="Search customers..."
              value={customerSearchQuery}
              onChangeText={setCustomerSearchQuery}
              placeholderTextColor={colors.gray400}
              autoFocus
            />

            <ScrollView style={styles.customerList}>
              {customerSearchResults.map((customer) => (
                <TouchableOpacity
                  key={customer.value}
                  style={[styles.customerItem, { borderBottomColor: colors.cellDivider }]}
                  onPress={() => handleCustomerSelect(customer)}
                >
                  <Text style={[styles.customerName, { color: colors.gray900 }]}>{customer.label}</Text>
                  {customer.detail && (
                    <Text style={[styles.customerDetail, { color: colors.gray600 }]}>{customer.detail}</Text>
                  )}
                </TouchableOpacity>
              ))}

              {customerSearchQuery.length > 2 && customerSearchResults.length === 0 && (
                <Text style={[styles.noResults, { color: colors.gray500 }]}>No customers found</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.orange[600],
  },
  headerSpacer: {
    width: 60, // Match back button width for center alignment
  },
  headerAddButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAddIcon: {
    fontSize: 28,
    fontWeight: '600',
    color: theme.colors.white,
    lineHeight: 28,
  },
  customerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.gray[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerIcon: {
    fontSize: 24,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.gray[900],
  },
  customerMobile: {
    fontSize: 13,
    color: theme.colors.gray[600],
  },
  expandIcon: {
    fontSize: 24,
    color: theme.colors.gray[400],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.gray[50],
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.gray[600],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 80, // Space for compact sticky summary bar at bottom
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.gray[600],
    marginHorizontal: 16,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.gray[900],
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: theme.colors.gray[500],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyStateCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyStateCTAText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.white,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.white,
    width: '90%',
    maxHeight: '80%',
    // paddingTop is set dynamically with insets
    borderRadius: 16,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.gray[900],
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 24,
    color: theme.colors.gray[400],
  },
  searchInput: {
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.gray[100],
    borderRadius: 8,
    fontSize: 16,
    color: theme.colors.gray[900],
  },
  customerList: {
    maxHeight: 400,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  customerItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[100],
  },
  customerDetail: {
    fontSize: 14,
    color: theme.colors.gray[600],
    marginTop: 4,
  },
  noResults: {
    fontSize: 16,
    color: theme.colors.gray[500],
    textAlign: 'center',
    marginTop: 32,
  },
});

export default OrderManagement;