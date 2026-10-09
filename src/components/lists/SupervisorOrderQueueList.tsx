import { getSessionGeneration } from '@/config/sessionLifecycle';
import { useOrderLiveUpdates } from '@/hooks/useOrderLiveUpdates';
import { OrderRefreshAction } from '@/components/OrderRefreshAction';
/**
 * SupervisorOrderQueueList - Order Queue for Supervisors/Staff
 *
 * Displays all customer orders with items, allowing supervisors to:
 * - View orders grouped by customer (expandable cards)
 * - Edit orders
 * - Generate dispatches
 *
 * Styling follows docs/STYLE_GUIDE.md (list report, §13.6 and §14.1).
 *
 * @module lists/SupervisorOrderQueueList
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, TextInput, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Portal, Snackbar } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ListSkeleton } from '@/components/skeletons';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { Avatar } from '@/components/ui/Avatar';
import { formatCount } from '@/utils/formatters';

// Services
import { OrderService } from '@/services/order-service';
import { PAGINATION } from '@/config/cacheConfig';
import { DEFAULT_LIST_CONFIG } from './types';
import type { Order, OrderFilters } from '@/types/order.types';

// Components
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';
import RecentDispatchedOrdersSection from '@/components/RecentDispatchedOrdersSection';

// State
import { useAppSelector } from '@/store/hooks';

// Theme
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

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
  /** The search text that matched nothing. */
  query?: string;
}

// Empty state: the shared ListEmptyState with the queue wording (style guide §13.6, §12.2)
const EmptyState = React.memo<EmptyStateProps>(({
  isFiltered,
  onClearFilters,
  query,
}) => (
  <ListEmptyState
    activeFilterCount={isFiltered ? 1 : 0}
    emptyIcon="clipboard-check-outline"
    filteredIcon="magnify"
    emptyTitle="No orders in the queue"
    emptySubtitle="Customer orders with items appear here."
    filteredTitle="No orders match your search"
    filteredSubtitle={`No customers match "${query ?? ''}". Try fewer letters.`}
    onClearFilters={onClearFilters}
    clearFiltersLabel="Clear search"
  />
));

EmptyState.displayName = 'EmptyState';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const SupervisorOrderQueueList: React.FC<SupervisorOrderQueueListProps> = ({
  customerFilter: externalFilter,
}) => {
  const fetchInProgressRef = useRef(false);
  const liveRefreshPendingRef = useRef(false);

  // Theme
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // User state
  const { userProfile } = useAppSelector(state => state.auth);

  // List state
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // Rows received from the server so far; the next page starts here.
  const loadedCountRef = useRef(0);

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
      if (isSilent) liveRefreshPendingRef.current = true;
      return;
    }
    fetchInProgressRef.current = true;
    const sessionGeneration = getSessionGeneration();

    const currentRequestId = ++requestIdRef.current;

    try {
      if (isRefresh && !isSilent) {
        setIsRefreshing(true);
      } else if (!isRefresh) {
        setIsLoading(true);
      }
      setError(null);

      // Fetch only orders with items. A refresh reloads every row already shown.
      const filters: OrderFilters = {
        has_items: true,
        offset: 0,
        limit: Math.max(PAGINATION.DEFAULT_LIMIT, loadedCountRef.current),
      };

      if (__DEV__) console.log('[SupervisorOrderQueueList] Fetching orders with filters:', filters);

      const result = await OrderService.getOrdersList(filters);
      if (sessionGeneration !== getSessionGeneration()) return;

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
        loadedCountRef.current = result.data.length;
        setOrders(ordersWithItems);
        setHasMore(result.metadata?.has_more ?? false);
      } else {
        setError(result.message || 'Failed to load orders');
        setSnackbarMessage("Couldn't load the order queue. Check your connection and try again.");
        setSnackbarVisible(true);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      console.error('[SupervisorOrderQueueList] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load orders';
      setError(errorMessage);
      setSnackbarMessage("Couldn't load the order queue. Check your connection and try again.");
      setSnackbarVisible(true);
    } finally {
      fetchInProgressRef.current = false;
      if (liveRefreshPendingRef.current && isMountedRef.current && sessionGeneration === getSessionGeneration()) {
        liveRefreshPendingRef.current = false;
        void fetchOrders(true, true);
      }
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Next page, appended; shares the in-flight guard and request id with refreshes.
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoading || isLoadingMore || fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;
    const sessionGeneration = getSessionGeneration();
    const currentRequestId = ++requestIdRef.current;
    const offset = loadedCountRef.current;
    setIsLoadingMore(true);
    try {
      const result = await OrderService.getOrdersList({
        has_items: true,
        offset,
        limit: PAGINATION.DEFAULT_LIMIT,
      });
      if (sessionGeneration !== getSessionGeneration()) return;
      if (!isMountedRef.current || currentRequestId !== requestIdRef.current) return;
      if (result.success && result.data) {
        const page = result.data;
        loadedCountRef.current = offset + page.length;
        setOrders(prev => {
          const seen = new Set(prev.map(order => order.id));
          const fresh = page.filter((order: Order) =>
            !seen.has(order.id) && (order.item_count ?? order.total_items ?? order.items?.length ?? 0) > 0
          );
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
        setHasMore(result.metadata?.has_more ?? false);
      } else {
        setSnackbarMessage("Couldn't load more orders. Scroll down to try again.");
        setSnackbarVisible(true);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error('[SupervisorOrderQueueList] Load more error:', err);
      setSnackbarMessage("Couldn't load more orders. Scroll down to try again.");
      setSnackbarVisible(true);
    } finally {
      fetchInProgressRef.current = false;
      if (isMountedRef.current) setIsLoadingMore(false);
      if (liveRefreshPendingRef.current && isMountedRef.current && sessionGeneration === getSessionGeneration()) {
        liveRefreshPendingRef.current = false;
        void fetchOrders(true, true);
      }
    }
  }, [hasMore, isLoading, isLoadingMore, fetchOrders]);

  const ListFooter = useMemo(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>Loading more orders…</Text>
      </View>
    );
  }, [isLoadingMore, styles, t]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useOrderLiveUpdates(() => fetchOrders(true, true));

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
      />
    );
  }, [expandedOrders, handleToggleExpand]);


  // ============================================================================
  // RENDER STATES
  // ============================================================================

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Order queue</Text>
        </View>
        <ListSkeleton count={5} />
      </View>
    );
  }

  // Error state with empty list
  if (error && orders.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Order queue</Text>
        </View>
        <ErrorStateView
          presentation="inline"
          title="Couldn't load the order queue"
          message="Check your connection and try again."
          onRetry={() => fetchOrders()}
        />
      </View>
    );
  }

  const userName = userProfile?.name || 'U';
  const queueCount = filteredOrders.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">Order queue</Text>
        <View style={styles.headerActions}>
          <OrderRefreshAction onRefresh={handleRefresh} refreshing={isRefreshing} label="Refresh order queue" />
          {/* Order count badge: plain count (§13.5) */}
          <View
            style={styles.countBadge}
            accessible
            accessibilityLabel={`${formatCount(queueCount, 'order')} in the queue`}
          >
            <Text style={styles.countText} maxFontSizeMultiplier={1.6}>{queueCount}</Text>
          </View>
          {/* Profile avatar - navigates to settings */}
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.avatarButton}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Avatar name={userName} id={userProfile?.id} size="sm" />
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by customer name"
            placeholderTextColor={t.text.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search by customer name"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={handleClearSearch}
              style={styles.clearButton}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
            </Pressable>
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
          query={searchQuery.trim()}
        />
      ) : (
        <FlashList
          data={filteredOrders}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          extraData={expandedOrders}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={DEFAULT_LIST_CONFIG.onEndReachedThreshold}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[t.brand.tint]}
              tintColor={t.brand.tint}
              progressBackgroundColor={t.surface.card}
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
          duration={4000}
          style={styles.snackbar}
          action={{ label: 'Dismiss', onPress: dismissSnackbar, textColor: t.text.inverse }}
        >
          {snackbarMessage}
        </Snackbar>
      </Portal>
    </View>
  );
};

// ============================================================================
// STYLES - tokens only (docs/STYLE_GUIDE.md)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  // App bar on surface.header with a hairline divider (§13.8)
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: layout.marginCompact,
    minHeight: layout.rowMinHeight,
    paddingVertical: space.md,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  // Large title for a top-level tab screen
  headerTitle: {
    ...typography.largeTitle,
    color: t.text.primary,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  // Plain count badge: brand.fill with brand.onFill. "Needs action" counts use
  // destructive.fill with destructive.onFill instead (§13.5).
  countBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    minWidth: 24,
    alignItems: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  countText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
    color: t.brand.onFill,
  },
  avatarButton: {
    width: touchTarget,
    height: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  // Search bar under the header (§14.6)
  searchContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  searchInputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
    gap: space.sm,
    backgroundColor: t.background.base,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: t.text.primary,
    paddingVertical: space.xs,
  },
  clearButton: {
    minWidth: space.xxxl,
    minHeight: space.xxxl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  listContent: {
    paddingBottom: space.xxl,
  },
  footerLoader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  footerLoaderText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  // Snackbar: inverse surface (§13.9)
  snackbar: {
    backgroundColor: t.surface.inverse,
    borderRadius: radius.button,
    ...t.shadow[3],
  },
});

export default SupervisorOrderQueueList;
