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
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Portal, Snackbar } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { ListSkeleton } from '@/components/skeletons';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { formatCount } from '@/utils/formatters';

// Services
import { OrderService } from '@/services/order-service';
import { PAGINATION } from '@/config/cacheConfig';
import { DEFAULT_LIST_CONFIG } from './types';
import type { Order, OrderFilters } from '@/types/order.types';

// Search
import { ORDER_QUEUE_FILTERS } from '@/features/filters/configs';
import { useListFilters } from '@/features/filters/useListFilters';
import { FilteredListHeader, filteredEmptyProps } from '@/features/filters/components/FilteredListHeader';

// Components
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';
import RecentDispatchedOrdersSection from '@/components/RecentDispatchedOrdersSection';

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
  /** Rendered directly under the header in every state, e.g. a view switch. */
  subHeader?: React.ReactNode;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const SupervisorOrderQueueList: React.FC<SupervisorOrderQueueListProps> = ({
  customerFilter: externalFilter,
  subHeader,
}) => {
  const fetchInProgressRef = useRef(false);
  const liveRefreshPendingRef = useRef(false);

  // Theme
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();


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

  // Search: the server looks through the whole queue, not only the rows loaded so far.
  const filters = useListFilters(ORDER_QUEUE_FILTERS);
  const searchText = filters.request.search || externalFilter?.trim() || undefined;
  // The first answer has arrived: later loads keep the rows on screen.
  const [hasLoaded, setHasLoaded] = useState(false);

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
      // Run again when the request in flight ends, with the search in effect then.
      liveRefreshPendingRef.current = true;
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
        search: searchText,
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
        void fetchOrdersRef.current(true, true);
      }
      if (isMountedRef.current) {
        setHasLoaded(true);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [searchText]);
  // The newest fetch, for a rerun queued while an older one was in flight.
  const fetchOrdersRef = useRef(fetchOrders);
  fetchOrdersRef.current = fetchOrders;

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
        search: searchText,
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
        void fetchOrdersRef.current(true, true);
      }
    }
  }, [hasMore, isLoading, isLoadingMore, searchText]);

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

  // First load, and a new first page whenever the search changes.
  useEffect(() => {
    loadedCountRef.current = 0;
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

  const filteredOrders = orders;

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

  const queueCount = orders.length;

  // The header and search field are shown in every state, so the search can
  // always be changed or cleared.
  const header = (
    <FilteredListHeader
      title="Order queue"
      config={ORDER_QUEUE_FILTERS}
      filters={filters}
      loading={isLoading}
      actions={
        <>
          <OrderRefreshAction onRefresh={handleRefresh} refreshing={isRefreshing} label="Refresh order queue" />
          {/* Order count badge: plain count (§13.5) */}
          <View
            style={styles.countBadge}
            accessible
            accessibilityLabel={`${formatCount(queueCount, 'order')} in the queue`}
          >
            <Text style={styles.countText} maxFontSizeMultiplier={1.6}>{queueCount}</Text>
          </View>
        </>
      }
    >
      {subHeader}
    </FilteredListHeader>
  );

  let content: React.ReactNode;
  if (!hasLoaded && isLoading) {
    // First load: skeleton. Later loads keep the rows on screen while the new ones arrive.
    content = <ListSkeleton count={5} />;
  } else if (orders.length > 0) {
    content = (
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
    );
  } else if (error) {
    content = (
      <ErrorStateView
        presentation="inline"
        title="Couldn't load the order queue"
        message="Check your connection and try again."
        onRetry={() => fetchOrders()}
      />
    );
  } else {
    content = (
      <>
        {/* Recently dispatched orders stay in view when the queue is empty */}
        <RecentDispatchedOrdersSection refreshTrigger={refreshTrigger} limit={10} />
        <ListEmptyState
          {...filteredEmptyProps(filters, 'orders')}
          emptyIcon="clipboard-check-outline"
          filteredIcon="magnify"
          emptyTitle="No orders in the queue"
          emptySubtitle="Customer orders with items appear here."
        />
      </>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      {content}

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
