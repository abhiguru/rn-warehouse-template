import { getSessionGeneration } from '@/config/sessionLifecycle';
import { createLogger } from '@/utils/logger';
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
import { ActivityIndicator } from 'react-native-paper';
import { LastUpdatedLine, LoadMoreErrorFooter, StaleListStrip } from './ListLoadErrors';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useFocusEffect } from 'expo-router';
import { ListSkeleton } from '@/components/skeletons';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { formatCount, formatNumber, formatTime } from '@/utils/formatters';
import { t as translate } from '@/i18n';

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

const logger = createLogger('OrderQueue');

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

  // The next page failed: the list's last row offers "Try again".
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  // When the orders shown were loaded: offline and after a failed refresh the list says so (§14.9).
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  // Refresh trigger for child sections (increment to refresh)
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  // Counts the returns to the queue: "Recently dispatched" is read again then, quietly (a dispatch made from an order
  // while the queue was behind another screen must show without a pull to refresh).
  const [returnTrigger, setReturnTrigger] = useState(0);

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
      // A retry does not make retained data current: the error clears only
      // after a successful response replaces the displayed orders.

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
        setError(null);
        setLoadMoreFailed(false);
        setLoadedAt(Date.now());
        setHasMore(result.metadata?.has_more ?? false);
      } else {
        setError(result.message || 'Failed to load orders');
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      // Development only, and through the redacting logger: the text is the server's and can name a table, a function or the facility's address.
      logger.warn('List did not load', err instanceof Error ? err.message : err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load orders';
      setError(errorMessage);
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
    setLoadMoreFailed(false);
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
        setLoadMoreFailed(true);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      // Development only, and through the redacting logger: the text is the server's and can name a table, a function or the facility's address.
      logger.warn('Next page did not load', err instanceof Error ? err.message : err);
      setLoadMoreFailed(true);
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
    if (loadMoreFailed && !isLoadingMore) {
      return (
        <LoadMoreErrorFooter
          message={translate('lists.order.loadMoreFailed')}
          retryLabel={translate('lists.order.retryMore')}
          onRetry={handleLoadMore}
          testID="queue-load-more-error"
        />
      );
    }
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>{translate('lists.order.loadingMore')}</Text>
      </View>
    );
  }, [isLoadingMore, loadMoreFailed, handleLoadMore, styles, t]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // The list owns the refresh on a return to the screen (below), so the live updates
  // hook only re-reads on a 15 s timer while the screen is shown.
  useOrderLiveUpdates(() => fetchOrders(true, true), true, { refreshOnFocus: false });

  // One owner for loading. The list is mounted by its screen, so it starts focused;
  // a blur says otherwise.
  const screenFocusedRef = useRef(true);
  const blurredRef = useRef(false);
  const changedWhileHiddenRef = useRef(false);

  // First load, and a new first page whenever the search changes. While the screen
  // is hidden the change waits for the return, which loads it.
  useEffect(() => {
    loadedCountRef.current = 0;
    if (!screenFocusedRef.current) {
      changedWhileHiddenRef.current = true;
      return;
    }
    fetchOrders();
  }, [fetchOrders]);

  // A real return to the screen (after a blur, e.g. back from editing an order)
  // folds open cards and loads once; a revisit refreshes silently: no RefreshControl
  // pushing content down by ~60px. The callback never changes identity: expo-router reruns a focus
  // effect whose callback changes while the screen is focused, which loaded every
  // search twice.
  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      if (blurredRef.current) {
        blurredRef.current = false;
        setReturnTrigger(prev => prev + 1);
        // Only collapse expanded cards if any are open — avoids a spurious re-render
        setExpandedOrders(prev => (prev.size > 0 ? new Set() : prev));
        // Filters applied while away load a new first page, like an inline change;
        // a revisit with the same request refreshes the loaded rows silently.
        if (changedWhileHiddenRef.current) {
          changedWhileHiddenRef.current = false;
          void fetchOrdersRef.current();
        } else {
          void fetchOrdersRef.current(true, true);
        }
      }
      return () => {
        screenFocusedRef.current = false;
        blurredRef.current = true;
      };
    }, [])
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

  // ============================================================================
  // FLASHLIST KEY EXTRACTOR
  // ============================================================================

  const keyExtractor = useCallback((item: Order) => item.id, []);

  // Header component with recent dispatched orders section
  // Offline with no failed refresh: the top of the list says when the queue was loaded. A failed refresh says it in
  // its strip instead.
  const isOffline = useIsOffline();
  const offlineUpdatedAt = isOffline && !error ? loadedAt : undefined;
  // An element, not a component: the line comes and goes without remounting the recent section (a remount reloads
  // it, and offline that load fails).
  const ListHeaderComponent = useMemo(() => (
    <>
      {offlineUpdatedAt !== undefined ? <LastUpdatedLine at={offlineUpdatedAt} top testID="queue-last-updated" /> : null}
      <RecentDispatchedOrdersSection refreshTrigger={refreshTrigger} quietRefreshTrigger={returnTrigger} limit={10} />
    </>
  ), [refreshTrigger, returnTrigger, offlineUpdatedAt]);

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
      title={translate('lists.queue.title')}
      config={ORDER_QUEUE_FILTERS}
      filters={filters}
      loading={isLoading}
      actions={
        <>
          <OrderRefreshAction onRefresh={handleRefresh} refreshing={isRefreshing} label={translate('lists.queue.refresh')} />
          {/* Order count badge: plain count (§13.5) */}
          <View
            style={styles.countBadge}
            accessible
            accessibilityLabel={translate('lists.queue.countLabel', { orders: formatCount(queueCount, 'order') })}
          >
            <Text style={styles.countText} maxFontSizeMultiplier={1.6}>{formatNumber(queueCount)}</Text>
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
      <>
        {/* A refresh failed: the orders loaded before stay, with Try again (§13.9) */}
        {error && (
          <StaleListStrip
            title={translate('lists.queue.staleTitle')}
            text={translate('lists.order.staleText', { time: formatTime(new Date(loadedAt)) })}
            retryLabel={translate('lists.queue.retryRefresh')}
            onRetry={handleRefresh}
            retrying={isRefreshing}
            testID="queue-stale-strip"
          />
        )}
        <View style={styles.listWrapper}>
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
        </View>
      </>
    );
  } else if (error) {
    content = (
      <ErrorStateView
        presentation="inline"
        title={translate('lists.queue.loadFailedTitle')}
        message={translate('common.checkConnection')}
        onRetry={() => fetchOrders()}
      />
    );
  } else {
    content = (
      <>
        {/* Recently dispatched orders stay in view when the queue is empty */}
        <RecentDispatchedOrdersSection refreshTrigger={refreshTrigger} quietRefreshTrigger={returnTrigger} limit={10} />
        <ListEmptyState
          {...filteredEmptyProps(filters, 'orders')}
          emptyIcon="clipboard-check-outline"
          filteredIcon="magnify"
          emptyTitle={translate('lists.queue.emptyTitle')}
          emptySubtitle={translate('lists.queue.emptySubtitle')}
        />
      </>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      {content}

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
  listWrapper: {
    flex: 1,
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
});

export default SupervisorOrderQueueList;
