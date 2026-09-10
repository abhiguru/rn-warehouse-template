/**
 * OrderFlashList - FlashList Implementation (2025 Best Practices)
 *
 * IMPORTANT: This component is built from scratch following FlashList best practices.
 * Do NOT copy patterns from OrderListFiori.tsx or OrderListMobile.tsx.
 *
 * Key optimizations:
 * - Stable keyExtractor (not inline)
 * - getItemType for section discrimination
 * - Memoized renderItem callback
 * - extraData for external state dependencies
 * - No inline functions in renderItem
 * - FlashList v2 handles item sizing automatically
 *
 * @module lists/OrderFlashList
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Badge, IconButton, Portal, Snackbar, Surface } from 'react-native-paper';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ListSkeleton } from '@/components/skeletons';
import { CustomerSearchBottomSheet, CustomerSearchBottomSheetRef } from '@/components/CustomerSearchBottomSheet';

// Types and utilities
import {
  FlattenedItem,
  flattenSections,
  getItemType,
  DEFAULT_LIST_CONFIG,
  SectionData,
} from './types';

// Services
import { OrderService } from '@/services/order-service';
import type { Order, OrderFilters } from '@/types/order.types';

// Components
import { MemoizedOrderItem } from '@/components/list-items';

// State
import { useAppSelector } from '@/store/hooks';

// Config - Dynamic colors for dark mode support
import { useListColors, ListColors } from '@/hooks/useListColors';

// ============================================================================
// TYPES
// ============================================================================

export interface OrderFlashListProps {
  /** Optional customer ID to filter orders */
  customerId?: string;
  /** Custom press handler (overrides default navigation) */
  onItemPress?: (order: Order) => void;
  /** Show only orders with items */
  hasItemsOnly?: boolean;
}

// ============================================================================
// SECTION HEADER COMPONENT (Memoized)
// ============================================================================

interface SectionHeaderProps {
  title: string;
  count: number;
  colors: ListColors;
}

// Section Header - Fiori spec: 13pt uppercase, letter spacing 0.5pt
const SectionHeader = React.memo<SectionHeaderProps>(({ title, count, colors }) => (
  <View
    style={[styles.sectionHeader, { backgroundColor: colors.gray50 }]}
    accessibilityRole="header"
  >
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
      {title.toUpperCase()}
    </Text>
    <View style={[styles.sectionBadge, { backgroundColor: colors.gray200 }]}>
      <Text style={[styles.sectionBadgeText, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  </View>
));

SectionHeader.displayName = 'SectionHeader';

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  isFiltered: boolean;
  onClearFilters: () => void;
  colors: ListColors;
}

// Empty State - Fiori spec: 120pt illustration, 24pt gaps, proper typography
const EmptyState = React.memo<EmptyStateProps>(({
  isFiltered,
  onClearFilters,
  colors,
}) => (
  <View
    style={styles.emptyContainer}
    accessible
    accessibilityRole="text"
  >
    <View
      style={[styles.emptyIconSurface, { backgroundColor: colors.gray100 }]}
      accessible={false} // Decorative
    >
      <Icon name="cart-off" size={56} color={colors.textTertiary} />
    </View>
    <Text
      style={[styles.emptyTitle, { color: colors.textPrimary }]}
      accessibilityRole="header"
    >
      {isFiltered ? 'No Orders Match Filters' : 'No Orders Yet'}
    </Text>
    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
      {isFiltered
        ? 'Try adjusting your filters to see all orders'
        : 'Orders will appear here when customers add items'}
    </Text>
    {isFiltered && (
      <Pressable
        style={[styles.emptyButton, { borderColor: colors.gray300 }]}
        onPress={onClearFilters}
        accessibilityRole="button"
        accessibilityLabel="Clear Filters"
        accessibilityHint="Tap to clear filters and show all orders"
      >
        <Text style={[styles.emptyButtonText, { color: colors.textPrimary }]}>Clear Filters</Text>
      </Pressable>
    )}
  </View>
));

EmptyState.displayName = 'EmptyState';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const OrderFlashList: React.FC<OrderFlashListProps> = ({
  customerId,
  onItemPress,
  hasItemsOnly = false,
}) => {
  const fetchInProgressRef = useRef(false);

  // Customer search bottom sheet ref
  const customerSearchRef = useRef<CustomerSearchBottomSheetRef>(null);

  // Dynamic colors for dark mode support
  const colors = useListColors();

  // User state
  const { userProfile } = useAppSelector(state => state.auth);

  // List state
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now());
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // E3 Fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // E7 Fix: Track request ID to discard stale pagination responses
  const requestIdRef = useRef(0);

  // Filter state
  const [showWithItemsOnly, setShowWithItemsOnly] = useState(hasItemsOnly);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // isSilent = true → fetch data without showing RefreshControl spinner.
  // Used by useFocusEffect to avoid contentOffset.y = -60 gap from RefreshControl.
  const fetchOrders = useCallback(async (isRefresh = false, isSilent = false) => {
    if (fetchInProgressRef.current) {
      return;
    }
    fetchInProgressRef.current = true;

    // E7 Fix: Increment request ID to track this request
    const currentRequestId = ++requestIdRef.current;

    try {
      if (isRefresh && !isSilent) {
        setIsRefreshing(true);
      } else if (!isRefresh) {
        setIsLoading(true);
      }
      // isSilent: no loading indicator — data refreshes quietly in background
      setError(null);

      // Build filters
      const filters: OrderFilters = {};
      if (customerId) {
        filters.customer_id = customerId;
      }
      if (showWithItemsOnly) {
        filters.has_items = true;
      }

      const result = await OrderService.getOrdersList(filters);

      // E3 Fix: Skip state updates if component unmounted during fetch
      if (!isMountedRef.current) {
        return;
      }

      // E7 Fix: Discard stale response if a newer request was made
      if (currentRequestId !== requestIdRef.current) {
        if (__DEV__) console.log('[OrderFlashList] Discarding stale response');
        return;
      }

      if (result.success && result.data) {
        // Filter for orders with items if needed (in case backend doesn't support it)
        let filteredOrders = result.data;
        if (showWithItemsOnly) {
          filteredOrders = result.data.filter((order: Order) => {
            const itemCount = order.item_count ?? order.total_items ?? 0;
            return itemCount > 0;
          });
        }
        setOrders(filteredOrders);
        setRefreshTimestamp(Date.now());
        setHasMore(false);
      } else {
        setError(result.message || 'Failed to load orders');
        setSnackbarMessage(result.message || 'Failed to load orders');
        setSnackbarVisible(true);
      }
    } catch (err: unknown) {
      // E3 Fix: Skip state updates if component unmounted
      if (!isMountedRef.current) {
        return;
      }
      console.error('[OrderFlashList] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load orders';
      setError(errorMessage);
      setSnackbarMessage('Failed to load orders');
      setSnackbarVisible(true);
    } finally {
      fetchInProgressRef.current = false;
      // E3 Fix: Only update state if still mounted
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [customerId, showWithItemsOnly]);

  // E3 Fix: Cleanup on unmount to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, [showWithItemsOnly]);

  // Refresh when screen comes into focus (after editing an order)
  // Silent refresh (isSilent=true) — avoids RefreshControl pushing content down by ~60px
  useFocusEffect(
    useCallback(() => {
      fetchOrders(true, true);
    }, [fetchOrders])
  );

  // ============================================================================
  // STABLE CALLBACKS (defined outside renderItem)
  // ============================================================================

  const handleRefresh = useCallback(() => {
    fetchOrders(true);
  }, [fetchOrders]);

  const handleOrderPress = useCallback((order: Order) => {
    if (onItemPress) {
      onItemPress(order);
    } else {
      // Navigate to customer order screen using customer_id, not order.id
      // The route /orders/[customerId] expects a customer ID to get/create their order
      router.push(`/orders/${order.customer_id}`);
    }
  }, [onItemPress]);

  const handleClearFilters = useCallback(() => {
    setShowWithItemsOnly(false);
  }, []);

  const toggleItemsFilter = useCallback(() => {
    setShowWithItemsOnly(prev => !prev);
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  const navigateToSettings = useCallback(() => {
    router.push('/settings');
  }, []);

  // Handle add order button press
  const handleAddOrder = useCallback(() => {
    customerSearchRef.current?.open();
  }, []);

  // Handle customer selection - navigate to order screen
  const handleCustomerSelect = useCallback((customer: { id: string; name: string }) => {
    customerSearchRef.current?.close();
    router.push(`/orders/${customer.id}`);
  }, []);

  // ============================================================================
  // FLATTENED DATA (for FlashList)
  // ============================================================================

  const flattenedData = useMemo((): FlattenedItem<Order>[] => {
    if (orders.length === 0) return [];

    // Filter out dispatched orders - they remain in DB for audit trail but shouldn't show in active list
    const nonDispatchedOrders = orders.filter(order => {
      const orderStatus = (order.status || '').toUpperCase();
      return orderStatus !== 'DISPATCHED';
    });

    // Group orders by status: Active (with items) vs Empty
    const activeOrders = nonDispatchedOrders.filter(order => {
      const itemCount = order.item_count ?? order.total_items ?? 0;
      return itemCount > 0;
    });
    const emptyOrders = nonDispatchedOrders.filter(order => {
      const itemCount = order.item_count ?? order.total_items ?? 0;
      return itemCount === 0;
    });

    const sections: SectionData<Order>[] = [];

    if (activeOrders.length > 0) {
      sections.push({
        title: 'Active Orders',
        data: activeOrders,
      });
    }

    if (emptyOrders.length > 0 && !showWithItemsOnly) {
      sections.push({
        title: 'Empty Orders',
        data: emptyOrders,
      });
    }

    return flattenSections(sections, (order) => order.id);
  }, [orders, showWithItemsOnly]);

  // ============================================================================
  // FLASHLIST KEY EXTRACTOR (stable, not inline)
  // ============================================================================

  // Stable key — refreshTimestamp is in extraData, not here, so FlashList re-renders
  // items without treating them as brand-new (which caused full remount → layout gap)
  const keyExtractor = useCallback((item: FlattenedItem<Order>) => item.key, []);

  // ============================================================================
  // FLASHLIST RENDER ITEM (memoized, no inline functions)
  // ============================================================================

  const renderItem = useCallback(({ item }: { item: FlattenedItem<Order> }) => {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} colors={colors} />;
    }

    return (
      <MemoizedOrderItem
        order={item.data}
        onPress={handleOrderPress}
        colors={colors}
      />
    );
  }, [handleOrderPress, colors]);

  // ============================================================================
  // LIST FOOTER
  // ============================================================================

  const ListFooter = useMemo(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerLoaderText, { color: colors.textSecondary }]}>Loading more...</Text>
      </View>
    );
  }, [isLoadingMore, colors]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Orders</Text>
        </View>
        <ListSkeleton count={5} metricsCount={3} />
      </View>
    );
  }

  // E1 Fix: Error state with retry button
  if (error && orders.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Orders</Text>
        </View>
        <View style={styles.errorState}>
          <Icon name="alert-circle-outline" size={48} color={colors.gray400} />
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Unable to load orders</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{error}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
            <Icon name="refresh" size={18} color={colors.white} />
            <Text style={[styles.retryButtonText, { color: colors.white }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Empty state
  if (!isLoading && orders.length === 0 && !error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Orders</Text>
          <View style={styles.headerActions}>
            <IconButton
              icon="plus"
              size={22}
              iconColor={colors.primary}
              onPress={handleAddOrder}
              accessibilityLabel="Add new order"
            />
            <IconButton
              icon={showWithItemsOnly ? 'filter-check' : 'filter-variant'}
              size={22}
              iconColor={showWithItemsOnly ? colors.primary : colors.gray700}
              onPress={toggleItemsFilter}
            />
          </View>
        </View>
        <EmptyState
          isFiltered={showWithItemsOnly}
          onClearFilters={handleClearFilters}
          colors={colors}
        />

        {/* Customer Search Bottom Sheet */}
        <CustomerSearchBottomSheet
          ref={customerSearchRef}
          onSelect={handleCustomerSelect}
          title="Select Customer"
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.gray50 }]}
    >
      {/* Header */}
      <View
        style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Orders</Text>
        <View style={styles.headerActions}>
          <IconButton
            icon="plus"
            size={22}
            iconColor={colors.primary}
            onPress={handleAddOrder}
            accessibilityLabel="Add new order"
          />
          <IconButton
            icon={showWithItemsOnly ? 'filter-check' : 'filter-variant'}
            size={22}
            iconColor={showWithItemsOnly ? colors.primary : colors.gray700}
            onPress={toggleItemsFilter}
          />
          <Pressable onPress={navigateToSettings}>
            <Surface style={[styles.avatarSurface, { backgroundColor: colors.gray100 }]} elevation={1}>
              <Text style={[styles.avatarText, { color: colors.textPrimary }]}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </Surface>
          </Pressable>
        </View>
      </View>

      {/* Filter Badge */}
      {showWithItemsOnly && (
        <View
          style={[styles.filterChipContainer, { backgroundColor: colors.cellBackground }]}
        >
          <Pressable style={[styles.filterChip, { backgroundColor: colors.primaryLight }]} onPress={toggleItemsFilter}>
            <Icon name="cart-check" size={14} color={colors.primary} />
            <Text style={[styles.filterChipText, { color: colors.primary }]}>With items only</Text>
            <Icon name="close" size={14} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {/* FlashList - The key to performance */}
      <View style={{ flex: 1 }}>
        <FlashList
          data={flattenedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          extraData={{ handleOrderPress, colors }}
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={ListFooter}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={dismissSnackbar}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>

      {/* Customer Search Bottom Sheet */}
      <CustomerSearchBottomSheet
        ref={customerSearchRef}
        onSelect={handleCustomerSelect}
        title="Select Customer"
      />
    </View>
  );
};

// ============================================================================
// STYLES - SAP Fiori Compliant
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Navigation Bar - Fiori spec: 44pt min height
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 44, // Fiori navigation bar height
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Large Title - Fiori spec: 34pt for primary screens
  headerTitle: {
    fontSize: 34, // Fiori large title
    fontWeight: '700',
    letterSpacing: 0.37,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Avatar - Fiori spec: 36pt for compact
  avatarSurface: {
    width: 36, // Fiori compact avatar
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Filter Chip - Fiori tag style
  filterChipContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 24, // Fiori default tag height
    borderRadius: 12, // Fiori pill shape
    paddingHorizontal: 12,
    gap: 6,
  },
  filterChipText: {
    fontSize: 12, // Fiori tag font size
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 8,
  },
  // Section Header - Fiori spec: 13pt uppercase, 0.5pt letter spacing
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16, // Fiori grouped style
    paddingBottom: 8,
    minHeight: 32, // Fiori section header min height
  },
  sectionTitle: {
    fontSize: 13, // Fiori section header font size
    fontWeight: '600',
    letterSpacing: 0.5, // Fiori letter spacing
  },
  // Section Count Badge - Fiori tag style
  sectionBadge: {
    height: 20, // Fiori compact tag height
    minWidth: 20,
    borderRadius: 10, // Fiori pill shape
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionBadgeText: {
    fontSize: 11, // Fiori compact tag font size
    fontWeight: '600',
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 14,
  },
  // Empty State - Fiori spec: 120pt illustration, 24pt gaps
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24, // Fiori empty state padding
  },
  emptyIconSurface: {
    width: 120, // Fiori illustration size
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24, // Fiori illustration to title gap
  },
  emptyTitle: {
    fontSize: 20, // Fiori empty state title
    fontWeight: '600',
    lineHeight: 28,
    marginBottom: 8, // Fiori title to description gap
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14, // Fiori empty state description
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24, // Fiori description to action gap
    maxWidth: 320,
  },
  emptyButton: {
    minHeight: 44, // Fiori button height
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 8, // Fiori button corner radius
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyButtonText: {
    fontSize: 17, // Fiori button font size
    fontWeight: '600',
  },
  // Error State - Fiori empty state pattern
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20, // Fiori empty state title
    fontWeight: '600',
    lineHeight: 28,
    marginTop: 24,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14, // Fiori description
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 320,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44, // Fiori button height
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 8, // Fiori button corner radius
    gap: 8,
  },
  retryButtonText: {
    fontSize: 17, // Fiori button font size
    fontWeight: '600',
  },
  // Skeleton Loading - Fiori skeleton style
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
  },
  skeletonIcon: {
    width: 44, // Fiori detail image size
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonTitle: {
    width: '60%',
    height: 17, // Fiori title height approximation
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonSubtitle: {
    width: '40%',
    height: 13, // Fiori subtitle height approximation
    borderRadius: 4,
  },
  skeletonValue: {
    width: 50,
    height: 44,
    borderRadius: 8,
  },
  snackbar: {
    marginBottom: 80,
  },
});

export default OrderFlashList;
