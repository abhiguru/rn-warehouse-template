import { getSessionGeneration } from '@/config/sessionLifecycle';
import { useOrderLiveUpdates } from '@/hooks/useOrderLiveUpdates';
import { OrderRefreshAction } from '@/components/OrderRefreshAction';
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
 * Styling follows docs/STYLE_GUIDE.md (list report, §13.6 and §14.1).
 *
 * @module lists/OrderFlashList
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ListSkeleton } from '@/components/skeletons';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { formatCount } from '@/utils/formatters';
import { CustomerSearchBottomSheet, CustomerSearchBottomSheetRef } from '@/components/CustomerSearchBottomSheet';

// Types and utilities
import {
  FlattenedItem,
  flattenSections,
  getItemType,
  DEFAULT_LIST_CONFIG,
  SectionData,
} from './types';
import { resolveCustomerOrderTarget } from './orderCustomerTarget';

// Services
import { OrderService } from '@/services/order-service';
import { PAGINATION } from '@/config/cacheConfig';
import type { Order, OrderFilters } from '@/types/order.types';

// Search and filters
import { ORDER_FILTERS } from '@/features/filters/configs';
import { useListFilters } from '@/features/filters/useListFilters';
import { FilteredListHeader, filteredEmptyProps } from '@/features/filters/components/FilteredListHeader';
import { searchWords } from '@/features/filters/components/HighlightedText';

// Components
import { MemoizedOrderItem } from '@/components/list-items';

// State
import { useAppSelector } from '@/store/hooks';

// Theme
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { Fab, FAB_CLEARANCE } from '@/components/ui/Fab';
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
  /** Rendered directly under the header in every state, e.g. a view switch. */
  subHeader?: React.ReactNode;
}

// ============================================================================
// SECTION HEADER COMPONENT (Memoized)
// ============================================================================

interface SectionHeaderProps {
  title: string;
  count: number;
}

// Section header: footnote, capitals, text.secondary (style guide §13.6)
const SectionHeader = React.memo<SectionHeaderProps>(({ title, count }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={styles.sectionHeader}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}, ${formatCount(count, 'order')}`}
    >
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText} maxFontSizeMultiplier={1.6}>{count}</Text>
      </View>
    </View>
  );
});

SectionHeader.displayName = 'SectionHeader';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const OrderFlashList: React.FC<OrderFlashListProps> = ({
  customerId,
  onItemPress,
  subHeader,
}) => {
  const fetchInProgressRef = useRef(false);
  const liveRefreshPendingRef = useRef(false);

  // Customer search bottom sheet ref
  const customerSearchRef = useRef<CustomerSearchBottomSheetRef>(null);

  // Theme
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

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

  // Rows received from the server so far; the next page starts here.
  const loadedCountRef = useRef(0);

  // Search and the "With items" filter
  const filters = useListFilters(ORDER_FILTERS);
  const showWithItemsOnly = filters.request.has_items === true;
  const searchText = filters.request.search;
  const words = useMemo(() => searchWords(searchText), [searchText]);
  // The first answer has arrived: later loads keep the rows on screen.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const buildFilters = useCallback((): OrderFilters => {
    const params: OrderFilters = {};
    if (customerId) params.customer_id = customerId;
    if (showWithItemsOnly) params.has_items = true;
    if (searchText) params.search = searchText;
    return params;
  }, [customerId, showWithItemsOnly, searchText]);

  // isSilent = true → fetch data without showing RefreshControl spinner.
  // Used by useFocusEffect to avoid contentOffset.y = -60 gap from RefreshControl.
  const fetchOrders = useCallback(async (isRefresh = false, isSilent = false) => {
    if (fetchInProgressRef.current) {
      // Run again when the request in flight ends, with the filters in effect then:
      // a live update, or a search or filter the user changed meanwhile.
      liveRefreshPendingRef.current = true;
      return;
    }
    fetchInProgressRef.current = true;
    const sessionGeneration = getSessionGeneration();

    // E7 Fix: Increment request ID to track this request
    const currentRequestId = ++requestIdRef.current;

    try {
      if (isRefresh && !isSilent) {
        setIsRefreshing(true);
      } else if (!isRefresh) {
        setIsLoading(true);
      }
      // isSilent: no loading indicator — data refreshes quietly in background
      // A retry does not make retained data current. Clear the warning only
      // after a successful response replaces the displayed orders.

      // Reload every row already shown so live updates keep the whole window current.
      const result = await OrderService.getOrdersList({
        ...buildFilters(),
        offset: 0,
        limit: Math.max(PAGINATION.DEFAULT_LIMIT, loadedCountRef.current),
      });
      if (sessionGeneration !== getSessionGeneration()) return;

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
        loadedCountRef.current = result.data.length;
        setOrders(filteredOrders);
        setError(null);
        setRefreshTimestamp(Date.now());
        setHasMore(result.metadata?.has_more ?? false);
      } else {
        setError(result.message || 'Failed to load orders');
        setSnackbarMessage("Couldn't load orders. Check your connection and try again.");
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
      setSnackbarMessage("Couldn't load orders. Check your connection and try again.");
      setSnackbarVisible(true);
    } finally {
      fetchInProgressRef.current = false;
      if (liveRefreshPendingRef.current && isMountedRef.current && sessionGeneration === getSessionGeneration()) {
        liveRefreshPendingRef.current = false;
        void fetchOrdersRef.current(true, true);
      }
      // E3 Fix: Only update state if still mounted
      if (isMountedRef.current) {
        setHasLoaded(true);
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [buildFilters, showWithItemsOnly]);
  // The newest fetch, for a rerun queued while an older one was in flight.
  const fetchOrdersRef = useRef(fetchOrders);
  fetchOrdersRef.current = fetchOrders;

  // Next page, appended. Shares the in-flight guard and request id with refreshes,
  // so a refresh that starts later wins and a stale page is discarded.
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoading || isLoadingMore || fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;
    const sessionGeneration = getSessionGeneration();
    const currentRequestId = ++requestIdRef.current;
    const offset = loadedCountRef.current;
    setIsLoadingMore(true);
    try {
      const result = await OrderService.getOrdersList({
        ...buildFilters(),
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
          const fresh = page.filter((order: Order) => {
            if (seen.has(order.id)) return false;
            return !showWithItemsOnly || (order.item_count ?? order.total_items ?? 0) > 0;
          });
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
        setHasMore(result.metadata?.has_more ?? false);
      } else {
        setSnackbarMessage("Couldn't load more orders. Scroll down to try again.");
        setSnackbarVisible(true);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error('[OrderFlashList] Load more error:', err);
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
  }, [hasMore, isLoading, isLoadingMore, buildFilters, showWithItemsOnly]);

  // E3 Fix: Cleanup on unmount to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useOrderLiveUpdates(() => fetchOrders(true, true));

  // First load, and a new first page whenever the search or filter changes.
  useEffect(() => {
    loadedCountRef.current = 0;
    fetchOrders();
     
  }, [showWithItemsOnly, searchText]);

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

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  // Handle add order button press
  const handleAddOrder = useCallback(() => {
    if (userProfile?.role === 'customer') {
      const targetCustomerId = resolveCustomerOrderTarget({
        explicitCustomerId: customerId,
        assignedCustomerIds: userProfile.assignedCustomerIds,
        orderCustomerIds: orders.map((order) => order.customer_id),
      });
      if (targetCustomerId) {
        router.push(`/orders/${targetCustomerId}`);
        return;
      }
      setSnackbarMessage(
        userProfile.assignedCustomerIds?.length
          ? 'Select an existing assigned-customer order.'
          : 'No assigned customer is available for this account.'
      );
      setSnackbarVisible(true);
      return;
    }
    customerSearchRef.current?.open();
  }, [customerId, orders, userProfile]);

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
        title: 'Active orders',
        data: activeOrders,
      });
    }

    if (emptyOrders.length > 0 && !showWithItemsOnly) {
      sections.push({
        title: 'Empty orders',
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
      return <SectionHeader title={item.title} count={item.count} />;
    }

    return (
      <MemoizedOrderItem
        order={item.data}
        onPress={handleOrderPress}
        words={words}
      />
    );
  }, [handleOrderPress, words]);

  // ============================================================================
  // LIST FOOTER
  // ============================================================================
  // ============================================================================
  // LIST FOOTER
  // ============================================================================

  const ListFooter = useMemo(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>Loading more orders…</Text>
      </View>
    );
  }, [isLoadingMore, styles, t]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // The header, search field and filter chip are shown in every state, so the
  // search or filter can always be changed or cleared.
  const header = (
    <FilteredListHeader
      title="Orders"
      config={ORDER_FILTERS}
      filters={filters}
      loading={isLoading}
      actions={<OrderRefreshAction onRefresh={handleRefresh} refreshing={isRefreshing} label="Refresh orders" />}
    >
      {subHeader}
    </FilteredListHeader>
  );

  let content: React.ReactNode;
  if (!hasLoaded && isLoading) {
    // First load: skeleton. Later loads keep the rows on screen while the new ones arrive.
    content = <ListSkeleton count={5} metricsCount={3} />;
  } else if (orders.length > 0) {
    content = (
      <>
        {/* Stale data warning: critical message strip */}
        {error && (
          <View accessibilityRole="alert" style={styles.messageStrip}>
            <Icon name="alert" size={iconSize.md} color={t.status.critical.text} style={styles.messageStripIcon} />
            <View style={styles.messageStripBody}>
              <Text style={styles.messageStripTitle}>Couldn't refresh orders.</Text>
              <Text style={styles.messageStripText}>
                Showing previously loaded orders. Refresh to get current data.
              </Text>
            </View>
          </View>
        )}

        {/* FlashList - The key to performance */}
        <View style={styles.listWrapper}>
          <FlashList
            data={flattenedData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            extraData={{ handleOrderPress, words }}
            contentContainerStyle={styles.listContent}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[t.brand.tint]}
                tintColor={t.brand.tint}
                progressBackgroundColor={t.surface.card}
              />
            }
            ListFooterComponent={ListFooter}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={DEFAULT_LIST_CONFIG.onEndReachedThreshold}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </>
    );
  } else if (error) {
    content = (
      <ErrorStateView
        presentation="inline"
        title="Couldn't load orders"
        message="Check your connection and try again."
        onRetry={handleRefresh}
      />
    );
  } else {
    content = (
      <ListEmptyState
        {...filteredEmptyProps(filters, 'orders')}
        emptyIcon="clipboard-list-outline"
        emptyTitle="No orders yet"
        emptySubtitle="Orders appear here when customers add items."
      />
    );
  }

  return (
    <View style={styles.container}>
      {header}
      {content}

      <Fab label="Create order" onPress={handleAddOrder} />

      {/* Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={dismissSnackbar}
        duration={4000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>

      {/* Customer Search Bottom Sheet */}
      <CustomerSearchBottomSheet
        ref={customerSearchRef}
        onSelect={handleCustomerSelect}
        title="Select customer"
      />
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
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    margin: 0,
  },
  avatarButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Critical message strip (§13.9)
  messageStrip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginHorizontal: layout.marginCompact,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.critical.border,
    backgroundColor: t.status.critical.background,
  },
  messageStripIcon: {
    marginRight: space.sm,
  },
  messageStripBody: {
    flex: 1,
  },
  messageStripTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.status.critical.text,
  },
  messageStripText: {
    ...typography.footnote,
    color: t.status.critical.text,
  },
  // Applied filter chip (§13.5 FilterChip)
  filterChipContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    minHeight: space.xxxl,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    gap: space.s6,
    backgroundColor: t.brand.subtle,
  },
  filterChipPressed: {
    backgroundColor: t.brand.subtleStrong,
  },
  filterChipText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    // Room for the floating create button
    paddingBottom: FAB_CLEARANCE,
  },
  // Section header: footnote, capitals, text.secondary, letter spacing 0.5 (§4, §13.6)
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    minHeight: space.xxxl,
    backgroundColor: t.background.base,
  },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    color: t.text.secondary,
  },
  // Plain count badge: brand.fill with brand.onFill. "Needs action" counts use
  // destructive.fill with destructive.onFill instead (§13.5).
  sectionBadge: {
    minWidth: 20,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  sectionBadgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
    color: t.brand.onFill,
  },
  footerLoader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.lg,
    gap: space.sm,
  },
  footerLoaderText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  // Snackbar: inverse surface (§13.9)
  snackbar: {
    marginBottom: 80,
    backgroundColor: t.surface.inverse,
    borderRadius: radius.button,
    ...t.shadow[3],
  },
});

export default OrderFlashList;
