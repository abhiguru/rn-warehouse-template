/**
 * SupervisorOrderQueueList - Order Queue for Supervisors/Staff
 *
 * Displays all customer orders with items, allowing supervisors to:
 * - View orders grouped by customer (expandable cards)
 * - Edit orders
 * - Generate dispatches
 *
 * @module lists/SupervisorOrderQueueList
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, TextInput, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, IconButton, Portal, Snackbar, Surface } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ListSkeleton } from '@/components/skeletons';

// Services
import { OrderService } from '@/services/order-service';
import type { Order, OrderFilters } from '@/types/order.types';

// Components
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';
import RecentDispatchedOrdersSection from '@/components/RecentDispatchedOrdersSection';

// State
import { useAppSelector } from '@/store/hooks';

// Config - Dynamic colors for dark mode support
import { useListColors, ListColors } from '@/hooks/useListColors';
import theme from '@/theme';

// ============================================================================
// TYPES
// ============================================================================

export interface SupervisorOrderQueueListProps {
  /** Optional customer name filter */
  customerFilter?: string;
}

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  isFiltered: boolean;
  onClearFilters: () => void;
  colors: ListColors;
}

const EmptyState = React.memo<EmptyStateProps>(({
  isFiltered,
  onClearFilters,
  colors,
}) => (
  <View style={styles.emptyContainer} accessible accessibilityRole="text">
    <View
      style={[styles.emptyIconSurface, { backgroundColor: colors.gray100 }]}
      accessible={false} // Decorative, skip for screen readers
    >
      <Icon name="clipboard-check-outline" size={56} color={colors.textTertiary} />
    </View>
    <Text
      style={[styles.emptyTitle, { color: colors.textPrimary }]}
      accessibilityRole="header"
    >
      {isFiltered ? 'No Orders Match Your Search' : 'No Orders in Queue'}
    </Text>
    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
      {isFiltered
        ? 'Try a different customer name'
        : 'Customer orders with items will appear here'}
    </Text>
    {isFiltered && (
      <Pressable
        style={[styles.emptyButton, { borderColor: colors.gray300 }]}
        onPress={onClearFilters}
        accessibilityRole="button"
        accessibilityLabel="Clear Search"
        accessibilityHint="Tap to clear search and show all orders"
      >
        <Text style={[styles.emptyButtonText, { color: colors.textPrimary }]}>Clear Search</Text>
      </Pressable>
    )}
  </View>
));

EmptyState.displayName = 'EmptyState';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const SupervisorOrderQueueList: React.FC<SupervisorOrderQueueListProps> = ({
  customerFilter: externalFilter,
}) => {
  const fetchInProgressRef = useRef(false);

  // Dynamic colors for dark mode support
  const colors = useListColors();

  // User state
  const { userProfile } = useAppSelector(state => state.auth);

  // List state
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded state - track which orders are expanded
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Snackbar state
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // Refresh trigger for child sections (increment to refresh)
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Track request ID to discard stale responses
  const requestIdRef = useRef(0);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // isSilent = true → fetch without showing RefreshControl spinner (avoids -60px offset gap)
  const fetchOrders = useCallback(async (isRefresh = false, isSilent = false) => {
    if (fetchInProgressRef.current) {
      return;
    }
    fetchInProgressRef.current = true;

    const currentRequestId = ++requestIdRef.current;

    try {
      if (isRefresh && !isSilent) {
        setIsRefreshing(true);
      } else if (!isRefresh) {
        setIsLoading(true);
      }
      setError(null);

      // Fetch only orders with items
      const filters: OrderFilters = {
        has_items: true,
      };

      if (__DEV__) console.log('[SupervisorOrderQueueList] Fetching orders with filters:', filters);

      const result = await OrderService.getOrdersList(filters);

      // Skip state updates if component unmounted during fetch
      if (!isMountedRef.current) {
        return;
      }

      // Discard stale response if a newer request was made
      if (currentRequestId !== requestIdRef.current) {
        if (__DEV__) console.log('[SupervisorOrderQueueList] Discarding stale response');
        return;
      }

      if (result.success && result.data) {
        // Double-check filter for orders with items
        const ordersWithItems = result.data.filter((order: Order) => {
          const itemCount = order.item_count ?? order.total_items ?? order.items?.length ?? 0;
          return itemCount > 0;
        });

        if (__DEV__) console.log('[SupervisorOrderQueueList] Loaded orders:', ordersWithItems.length);
        setOrders(ordersWithItems);
      } else {
        setError(result.message || 'Failed to load orders');
        setSnackbarMessage(result.message || 'Failed to load orders');
        setSnackbarVisible(true);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      console.error('[SupervisorOrderQueueList] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load orders';
      setError(errorMessage);
      setSnackbarMessage('Failed to load orders');
      setSnackbarVisible(true);
    } finally {
      fetchInProgressRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Refresh when screen comes into focus (after editing an order)
  useFocusEffect(
    useCallback(() => {
      // Only collapse expanded cards if any are open — avoids spurious re-render on every focus
      setExpandedOrders(prev => (prev.size > 0 ? new Set() : prev));
      // Silent refresh — avoids RefreshControl pushing content down by ~60px
      fetchOrders(true, true);
    }, [fetchOrders])
  );

  // ============================================================================
  // FILTERED DATA
  // ============================================================================

  const filteredOrders = useMemo(() => {
    const query = (searchQuery || externalFilter || '').toLowerCase().trim();
    if (!query) return orders;

    return orders.filter(order => {
      const customerName = (order.customer?.name || '').toLowerCase();
      return customerName.includes(query);
    });
  }, [orders, searchQuery, externalFilter]);

  // ============================================================================
  // STABLE CALLBACKS
  // ============================================================================

  const handleRefresh = useCallback(() => {
    fetchOrders(true);
    // Also refresh the recent dispatched orders section
    setRefreshTrigger(prev => prev + 1);
  }, [fetchOrders]);

  const handleToggleExpand = useCallback((orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  // ============================================================================
  // FLASHLIST KEY EXTRACTOR
  // ============================================================================

  const keyExtractor = useCallback((item: Order) => item.id, []);

  // Header component with recent dispatched orders section
  const ListHeaderComponent = useCallback(() => (
    <RecentDispatchedOrdersSection refreshTrigger={refreshTrigger} limit={10} />
  ), [refreshTrigger]);

  // ============================================================================
  // FLASHLIST RENDER ITEM
  // ============================================================================

  const renderItem = useCallback(({ item }: { item: Order }) => {
    return (
      <CustomerOrderGroupCard
        order={item}
        isExpanded={expandedOrders.has(item.id)}
        onToggleExpand={handleToggleExpand}
        colors={colors}
      />
    );
  }, [expandedOrders, handleToggleExpand, colors]);

  // ============================================================================
  // RENDER STATES
  // ============================================================================

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order Queue</Text>
        </View>
        <ListSkeleton count={5} />
      </View>
    );
  }

  // Error state with empty list
  if (error && orders.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order Queue</Text>
        </View>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => fetchOrders()}
          >
            <Text style={[styles.retryButtonText, { color: colors.cellBackground }]}>Retry</Text>
          </Pressable>
        </View>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order Queue</Text>
        <View style={styles.headerActions}>
          {/* Order Count Badge */}
          <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.countText, { color: colors.primary }]}>{filteredOrders.length}</Text>
          </View>
          {/* Profile Avatar - navigates to settings */}
          <Pressable onPress={() => router.push('/settings')}>
            <Surface style={[styles.avatarSurface, { backgroundColor: colors.gray100 }]} elevation={0}>
              <Text style={[styles.avatarText, { color: colors.textSecondary }]}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </Surface>
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      <View
        style={[styles.searchContainer, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}
      >
        <View style={[styles.searchInputContainer, { backgroundColor: colors.gray100 }]}>
          <Icon name="magnify" size={20} color={colors.gray500} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search by customer name..."
            placeholderTextColor={colors.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <IconButton
              icon="close-circle"
              size={18}
              iconColor={colors.gray400}
              onPress={handleClearSearch}
              style={styles.clearButton}
            />
          )}
        </View>
      </View>

      {/* Recent Dispatched Orders Section (shown when list is empty too) */}
      {filteredOrders.length === 0 && (
        <RecentDispatchedOrdersSection refreshTrigger={refreshTrigger} limit={10} />
      )}

      {/* Order List */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          isFiltered={searchQuery.length > 0}
          onClearFilters={handleClearSearch}
          colors={colors}
        />
      ) : (
        <FlashList
          data={filteredOrders}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          extraData={expandedOrders}
          ListHeaderComponent={ListHeaderComponent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Snackbar for errors */}
      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={dismissSnackbar}
          duration={3000}
          action={{ label: 'Dismiss', onPress: dismissSnackbar }}
        >
          {snackbarMessage}
        </Snackbar>
      </Portal>
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
  // Navigation Bar - Fiori spec: 44pt standard height
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 44, // Fiori navigation bar height
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Large Title - Fiori spec: 34pt bold for primary screens
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.37,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Badge - Fiori spec: pill shape with 12pt corner radius
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Avatar - Fiori spec: 36pt diameter for compact
  avatarSurface: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Search Bar - Fiori spec: 36pt default height, 10pt corner radius
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36, // Fiori search bar height
    paddingHorizontal: 12,
    borderRadius: 10, // Fiori search bar corner radius
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 17, // Fiori search input font size
    paddingVertical: 0,
  },
  clearButton: {
    margin: -8,
  },
  listContent: {
    paddingBottom: 24,
  },
  // Empty State - Fiori spec: 120pt illustration, 24pt gaps
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24, // Fiori empty state padding
    paddingVertical: 48,
  },
  emptyIconSurface: {
    width: 120, // Fiori illustration size
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
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
    maxWidth: 320, // Constrain width for readability
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
});

export default SupervisorOrderQueueList;
