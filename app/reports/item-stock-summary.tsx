/**
 * Item Stock Summary Report Screen
 *
 * Displays all items aggregated across customers (or user's accessible customers).
 * Expandable cards show GRN details when tapped. Styling follows
 * docs/STYLE_GUIDE.md: object cells (§13.6), status tags (§3.5) and the search
 * field (§13.2, §14.6).
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, KPIGrid, ReportEmptyState, ReportCustomerScope, type KPIItem, type ReportScope } from '@/components/reports';
import { StockItemCard, isLowStock, type StockGRNRowData, type StockGRNState } from '@/components/reports/StockItemCard';
import { StockService } from '@/services/stock-service';
import { getAllGRNItems, getCustomerGRNItems, type GRNItem } from '@/services/grn-service';
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
import { createLogger } from '@/utils/logger';
import { t as tr } from '@/i18n';
import type { ItemWiseStockItem } from '@/types/stock.types';

const logger = createLogger('ItemStockSummary');

// A function, not a constant: the text follows the app language (docs/I18N.md rule 2).
const loadError = () => tr('reports.itemStockSummary.loadError');

// ============================================================================
// Styles
// ============================================================================
const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background.base },
    loadingContainer: { flex: 1 },
    spinner: { marginTop: space.huge },
    listContent: { paddingBottom: space.xxxl },
    separator: { height: space.sm },

    // Search
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: layout.marginCompact,
      marginVertical: space.md,
      paddingLeft: space.md,
      minHeight: layout.rowMinHeight,
      borderRadius: radius.field,
      borderWidth: 1,
      borderColor: t.border.field,
      backgroundColor: t.surface.field,
    },
    searchIcon: { marginRight: space.sm },
    searchInput: {
      ...typography.body,
      flex: 1,
      color: t.text.primary,
      paddingVertical: 0,
      ...Platform.select({ android: { paddingVertical: space.sm } }),
    },
    clearButton: {
      width: touchTarget,
      height: layout.rowMinHeight,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Item card: the list has no side padding of its own
    itemCard: { marginHorizontal: layout.marginCompact },

    // Loading more
    loadingMore: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.lg,
      gap: space.sm,
    },
    loadingMoreText: { ...typography.footnote, color: t.text.secondary },
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// Item cards (src/components/reports/StockItemCard.tsx)
// ============================================================================
/** The GRNs of an item as the shared card draws them. */
const grnRows = (grns: GRNItem[]): StockGRNRowData[] =>
  grns.map((grn, index) => ({
    key: `${grn.grn_id || grn.id}-${index}`,
    grnId: grn.grn_id || grn.id || null,
    grNo: grn.gr_no,
    packageMark: grn.package_mark,
    customerName: grn.customer_name,
    receivedDate: grn.date,
    rack: grn.rack,
    weight: grn.weight,
    stock: grn.stock,
    total: grn.qty,
  }));

const openGRN = (grnId: string) => router.push(`/grn-details/${grnId}`);

/** Loading, failed (with "Try again") or loaded: a failure is never shown as "no GRNs". */
const grnState = (
  grns: GRNItem[] | null,
  isLoading: boolean,
  failed: boolean,
  onRetry: () => void,
): StockGRNState =>
  isLoading
    ? { status: 'loading' }
    : failed
      ? { status: 'failed', onRetry }
      : { status: 'loaded', rows: grnRows(grns ?? []) };

// ============================================================================
// Search Input Component
// ============================================================================
interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  styles: Styles;
  t: ThemeTokens;
}

const SearchInput: React.FC<SearchInputProps> = ({ value, onChangeText, onClear, styles, t }) => (
  <View style={styles.searchContainer}>
    <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} style={styles.searchIcon} />
    <TextInput
      style={styles.searchInput}
      placeholder={tr('reports.itemStockSummary.searchItems')}
      placeholderTextColor={t.text.placeholder}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel={tr('reports.itemStockSummary.searchItems')}
    />
    {value.length > 0 && (
      <Pressable onPress={onClear} style={styles.clearButton} accessibilityRole="button" accessibilityLabel={tr('common.clearSearch')}>
        <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    )}
  </View>
);

// Built when drawn, so the labels follow the app language (docs/I18N.md rule 2).
const placeholderKpis = (): KPIItem[] => [
  { icon: 'cube-outline', value: '-', label: tr('common.items'), variant: 'primary' },
  { icon: 'warehouse', value: '-', label: tr('common.stock'), variant: 'primary' },
];

// ============================================================================
// Main Screen
// ============================================================================
export default function ItemStockSummaryScreen() {
  return (
    <ReportCustomerScope title={tr('reports.titles.itemStockSummary')}>
      {(scope) => <ItemStockSummaryReport scope={scope} />}
    </ReportCustomerScope>
  );
}

function ItemStockSummaryReport({ scope }: { scope: ReportScope }) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  // Warehouse users see every customer's stock. A customer account names one of its
  // customers on every request: the server refuses it the all-customers form.
  const customerId = scope.shouldShowListView ? undefined : scope.singleAssignedCustomerId ?? undefined;
  const noCustomer = !scope.shouldShowListView && !customerId;

  const [items, setItems] = useState<ItemWiseStockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pagination, setPagination] = useState({
    totalCount: 0,
    hasMore: false,
    offset: 0,
  });

  // Expanded items state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [grnDetailsCache, setGrnDetailsCache] = useState<Record<string, GRNItem[]>>({});
  const [loadingGRNs, setLoadingGRNs] = useState<Set<string>>(new Set());
  // Items whose GRNs could not be loaded. Kept apart from the cache: a failure is not "no GRNs".
  const [failedGRNs, setFailedGRNs] = useState<Set<string>>(new Set());

  // A newer request (the user kept typing, or pulled to refresh) replaces an
  // older one: late answers to old questions are dropped.
  const latestRequest = useRef(0);
  const fetchInProgressRef = useRef(false);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch items
  const fetchItems = useCallback(async (
    query: string,
    offset: number,
    isLoadMore = false,
    isRefresh = false
  ) => {
    if (noCustomer) {
      setError(tr('reports.shared.noCustomer'));
      setIsLoading(false);
      return;
    }
    // The next page waits for the request before it, so one offset is asked for once.
    if (isLoadMore && fetchInProgressRef.current) return;
    const requestId = ++latestRequest.current;
    fetchInProgressRef.current = true;

    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      logger.debug('Fetching items', { query, offset, isLoadMore });

      const response = await StockService.getItemWiseStockList({
        customerId,
        searchQuery: query || undefined,
        limit: 50,
        offset,
      });

      if (!isMountedRef.current || requestId !== latestRequest.current) return;

      if (response.success && response.data) {
        const newItems = response.data.items;

        if (isLoadMore) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setItems(newItems);
          // Clear expanded state and cache on new search/refresh
          setExpandedItems(new Set());
          setGrnDetailsCache({});
          setFailedGRNs(new Set());
        }

        setPagination({
          totalCount: response.data.pagination.totalCount,
          hasMore: response.data.pagination.hasMore,
          offset: offset + newItems.length,
        });

        logger.debug('Fetch success', {
          itemsCount: newItems.length,
          totalCount: response.data.pagination.totalCount,
          hasMore: response.data.pagination.hasMore,
        });
      } else {
        logger.warn('Fetch error', { message: response.message });
        setError(loadError());
      }
    } catch (err) {
      if (!isMountedRef.current || requestId !== latestRequest.current) return;
      logger.error('Exception', err);
      setError(loadError());
    } finally {
      // Only the newest request ends the loading state: an older one finishing must not hide it.
      if (requestId === latestRequest.current) {
        fetchInProgressRef.current = false;
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
        }
      }
    }
  }, [customerId, noCustomer]);

  // Fetch GRN details for an item
  const fetchGRNDetails = useCallback(async (itemId: string) => {
    // Already cached
    if (grnDetailsCache[itemId]) return;

    // Already loading
    if (loadingGRNs.has(itemId)) return;

    setLoadingGRNs(prev => new Set(prev).add(itemId));
    setFailedGRNs(prev => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });

    try {
      logger.debug('Fetching GRN details for item', { itemId });

      const drillDown = { p_filters: { item_ids: [itemId], stock_status: 'in_stock' as const }, p_limit: 100 };
      const response = customerId
        ? await getCustomerGRNItems(customerId, drillDown)
        : await getAllGRNItems(drillDown);

      if (!isMountedRef.current) return;

      if (response.success && response.data?.items) {
        setGrnDetailsCache(prev => ({
          ...prev,
          [itemId]: response.data.items,
        }));
        logger.debug('GRN details loaded', { count: response.data.items.length });
      } else {
        logger.warn('Failed to load GRN details', { message: response.message });
        // Not cached: the card shows the error, and "Try again" or opening it again reads once more
        setFailedGRNs(prev => new Set(prev).add(itemId));
      }
    } catch (err) {
      logger.error('Exception fetching GRN details', err);
      if (isMountedRef.current) setFailedGRNs(prev => new Set(prev).add(itemId));
    } finally {
      if (isMountedRef.current) {
        setLoadingGRNs(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    }
  }, [grnDetailsCache, loadingGRNs, customerId]);

  // Toggle item expansion. The card animates its own opening (motion token, Reduce Motion respected).
  const toggleItem = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        // Fetch GRN details when expanding
        fetchGRNDetails(itemId);
      }
      return next;
    });
  }, [fetchGRNDetails]);

  // Initial fetch and refetch when search changes
  useEffect(() => {
    fetchItems(debouncedQuery, 0);
  }, [debouncedQuery, fetchItems]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchItems(debouncedQuery, 0, false, true);
  }, [debouncedQuery, fetchItems]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (pagination.hasMore && !isLoadingMore && !isLoading) {
      fetchItems(debouncedQuery, pagination.offset, true);
    }
  }, [pagination, isLoadingMore, isLoading, debouncedQuery, fetchItems]);

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Build KPI items
  const kpiItems: KPIItem[] = useMemo(() => {
    const totalStock = items.reduce((sum, item) => sum + item.total_stock, 0);
    return [
      {
        icon: 'cube-outline',
        value: pagination.totalCount,
        label: tr('common.items'),
        variant: 'primary',
      },
      {
        icon: 'warehouse',
        value: totalStock,
        label: tr('common.stock'),
        variant: 'primary',
      },
    ];
  }, [items, pagination.totalCount]);

  // Render item
  const renderItem = useCallback(({ item }: { item: ItemWiseStockItem }) => (
    <StockItemCard
      name={item.item_name}
      packaging={item.packaging}
      grnCount={item.grn_count}
      stock={item.total_stock}
      total={item.total_qty}
      lowStock={isLowStock(item.total_stock, item.total_qty)}
      isExpanded={expandedItems.has(item.item_id)}
      onToggle={() => toggleItem(item.item_id)}
      grns={grnState(
        grnDetailsCache[item.item_id] || null,
        loadingGRNs.has(item.item_id),
        failedGRNs.has(item.item_id),
        () => fetchGRNDetails(item.item_id),
      )}
      emptyGRNsText={tr('reports.itemStockSummary.noGrnsInStock')}
      onOpenGRN={openGRN}
      style={styles.itemCard}
    />
  ), [expandedItems, toggleItem, grnDetailsCache, loadingGRNs, failedGRNs, fetchGRNDetails, styles]);

  // Key extractor
  const keyExtractor = useCallback((item: ItemWiseStockItem) => item.item_id, []);

  // Footer component
  const ListFooterComponent = useMemo(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.loadingMoreText}>{tr('reports.itemStockSummary.loadingMore')}</Text>
        </View>
      );
    }
    return null;
  }, [isLoadingMore, styles, t]);

  // Loading state
  if (isLoading && items.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.itemStockSummary')} subtitle={scope.customerName} onBack={scope.onChangeCustomer} />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={placeholderKpis()}
            isLoading={true}
            compact
          />
          <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} styles={styles} t={t} />
          <ActivityIndicator size="large" color={t.brand.tint} style={styles.spinner} accessibilityLabel={tr('reports.itemStockSummary.loadingItems')} />
        </View>
      </View>
    );
  }

  // Error state
  if (error && items.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.itemStockSummary')} subtitle={scope.customerName} onBack={scope.onChangeCustomer} />
        <KPIGrid
          items={placeholderKpis()}
          isLoading={false}
          compact
        />
        <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} styles={styles} t={t} />
        {noCustomer ? (
          <ReportEmptyState icon="account-off-outline" message={tr('reports.shared.noCustomerLinked')} description={error} />
        ) : (
          <ReportEmptyState
            icon="alert-circle-outline"
            tone="error"
            message={tr('reports.shared.errorTitle')}
            description={error}
            actionLabel={tr('common.retry')}
            onAction={() => fetchItems(debouncedQuery, 0)}
          />
        )}
      </View>
    );
  }

  // Empty state
  if (items.length === 0 && !isLoading) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.itemStockSummary')} subtitle={scope.customerName} onBack={scope.onChangeCustomer} />
        <KPIGrid
          items={placeholderKpis()}
          isLoading={false}
          compact
        />
        <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} styles={styles} t={t} />
        <ReportEmptyState
          icon={debouncedQuery ? 'magnify-close' : 'cube-outline'}
          message={debouncedQuery ? tr('reports.itemStockSummary.noMatchingItems') : tr('reports.shared.noStockYet')}
          description={
            debouncedQuery
              ? tr('reports.itemStockSummary.noItemsMatch', { search: debouncedQuery })
              : tr('reports.itemStockSummary.itemsAppear')
          }
          actionLabel={debouncedQuery ? tr('common.clearSearch') : undefined}
          onAction={debouncedQuery ? handleClearSearch : undefined}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReportHeader title={tr('reports.titles.itemStockSummary')} subtitle={scope.customerName} onBack={scope.onChangeCustomer} />

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={expandedItems}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <>
            <KPIGrid items={kpiItems} isLoading={isLoading} compact />
            <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} styles={styles} t={t} />
          </>
        }
        ListFooterComponent={ListFooterComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}
