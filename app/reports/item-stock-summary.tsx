/**
 * Item Stock Summary Report Screen
 *
 * Displays all items aggregated across customers (or user's accessible customers).
 * Expandable cards show GRN details when tapped.
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
  LayoutAnimation,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, KPIGrid, ReportEmptyState, type KPIItem } from '@/components/reports';
import { StockService } from '@/services/stock-service';
import { getAllGRNItems, type GRNItem } from '@/services/grn-service';
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import { formatNumber, formatDate } from '@/utils/formatters';
import type { ItemWiseStockItem } from '@/types/stock.types';

// ============================================================================
// SAP Fiori Design Tokens (Static - dimensions and typography only)
// ============================================================================
const FIORI_STATIC = {
  dimensions: {
    objectCellMinHeight: 72,
    objectCellImageSize: 44,
    objectCellImageRadius: 10,
    cardCornerRadius: 12,
    cardPadding: 16,
  },
  typography: {
    title: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
    subtitle: { fontSize: 14, lineHeight: 18 },
    footnote: { fontSize: 13, lineHeight: 16 },
  },
};

// ============================================================================
// Fiori GRN Row Component (nested Object Cell within expanded Item Card)
// @see design/sap-fiori-specs/01-object-cell.md
// ============================================================================
interface GRNRowProps {
  grn: GRNItem;
  isLast?: boolean;
}

const GRNRow: React.FC<GRNRowProps> = ({ grn, isLast = false }) => {
  const fiori = useFioriColors();

  const handlePress = () => {
    const grnId = grn.grn_id || grn.id;
    if (grnId) {
      router.push(`/grn-details/${grnId}`);
    }
  };

  const isNavigable = !!(grn.grn_id || grn.id);

  const content = (
    <>
      {/* Main Content - 3 lines */}
      <View style={styles.fioriGrnRowContent}>
        {/* Line 1: GRN Number + Package Mark Tag */}
        <View style={styles.fioriGrnRowTitleRow}>
          <Text style={[styles.fioriGrnRowTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
            {grn.gr_no}
          </Text>
          {grn.package_mark && (
            <View style={[styles.fioriTag, { backgroundColor: fiori.colors.backgroundSecondary }]}>
              <Text style={[styles.fioriTagText, { color: fiori.colors.textSecondary }]}>{grn.package_mark}</Text>
            </View>
          )}
        </View>

        {/* Line 2: Customer Name */}
        <View style={styles.fioriGrnRowCustomerRow}>
          <Icon name="account-outline" size={14} color={fiori.colors.textSecondary} />
          <Text style={[styles.fioriGrnRowFootnote, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
            {grn.customer_name}
          </Text>
        </View>

        {/* Line 3: Date, Rack, Weight */}
        <View style={styles.fioriGrnRowDetailsRow}>
          {grn.date && (
            <>
              <Icon name="calendar-outline" size={12} color={fiori.colors.textTertiary} />
              <Text style={[styles.fioriGrnRowDetail, { color: fiori.colors.textTertiary }]}>
                {formatDate(grn.date, 'compact')}
              </Text>
            </>
          )}
          {grn.rack && (
            <>
              <Text style={[styles.fioriGrnRowDetailSeparator, { color: fiori.colors.textTertiary }]}>•</Text>
              <Icon name="map-marker-outline" size={12} color={fiori.colors.textTertiary} />
              <Text style={[styles.fioriGrnRowDetail, { color: fiori.colors.textTertiary }]}>{grn.rack}</Text>
            </>
          )}
          {grn.weight && grn.weight > 0 && (
            <>
              <Text style={[styles.fioriGrnRowDetailSeparator, { color: fiori.colors.textTertiary }]}>•</Text>
              <Icon name="weight" size={12} color={fiori.colors.textTertiary} />
              <Text style={[styles.fioriGrnRowDetail, { color: fiori.colors.textTertiary }]}>{grn.weight} kg</Text>
            </>
          )}
        </View>
      </View>

      {/* Attributes - Stock/Qty */}
      <View style={styles.fioriGrnRowAttributes}>
        <View style={styles.fioriGrnRowQtyRow}>
          <Text style={[styles.fioriGrnRowStock, { color: fiori.colors.textPrimary }]}>{formatNumber(grn.stock)}</Text>
          <Text style={[styles.fioriGrnRowOrigQty, { color: fiori.colors.textSecondary }]}>/ {formatNumber(grn.qty)}</Text>
        </View>
      </View>

      {/* Accessory - Navigation Chevron */}
      {isNavigable && (
        <Icon name="chevron-right" size={16} color={fiori.colors.textSecondary} />
      )}
    </>
  );

  if (isNavigable) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.fioriGrnRow,
          { backgroundColor: fiori.colors.backgroundGrouped },
          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: fiori.colors.divider },
          pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`GRN ${grn.gr_no}, ${grn.stock} units at ${grn.customer_name}`}
        accessibilityHint="Tap to view GRN details"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[
      styles.fioriGrnRow,
      { backgroundColor: fiori.colors.backgroundGrouped },
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: fiori.colors.divider },
    ]}>
      {content}
    </View>
  );
};

// ============================================================================
// Item Card Component (Expandable)
// ============================================================================
interface ItemCardProps {
  item: ItemWiseStockItem;
  isExpanded: boolean;
  onToggle: () => void;
  grnDetails: GRNItem[] | null;
  isLoadingGRNs: boolean;
}

const ItemCard: React.FC<ItemCardProps> = ({
  item,
  isExpanded,
  onToggle,
  grnDetails,
  isLoadingGRNs,
}) => {
  const fiori = useFioriColors();

  const stockPercentage = item.total_qty > 0
    ? Math.round((item.total_stock / item.total_qty) * 100)
    : 0;
  const isLowStock = stockPercentage < 20;

  return (
    <View style={[styles.itemCard, {
      backgroundColor: fiori.colors.cardBackground,
      borderColor: fiori.colors.divider,
    }]}>
      {/* Main Object Cell - Tappable Header */}
      <Pressable
        style={({ pressed }) => [
          styles.fioriObjectCell,
          pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
        ]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.item_name}, ${item.total_stock} units in ${item.grn_count} GRNs`}
        accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to expand GRN details'}
      >
        {/* Icon */}
        <View style={[
          styles.fioriObjectCellImage,
          { backgroundColor: isLowStock ? fiori.colors.backgroundSecondary : fiori.colors.tintLight },
        ]}>
          <Icon
            name="cube-outline"
            size={22}
            color={isLowStock ? fiori.colors.textSecondary : fiori.colors.tint}
          />
        </View>

        {/* Content */}
        <View style={styles.fioriObjectCellContent}>
          <Text style={[styles.fioriObjectCellTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
            {item.item_name}
          </Text>
          <Text style={[styles.fioriObjectCellSubtitle, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
            {item.packaging || 'No packaging info'}
          </Text>
        </View>

        {/* Stock Info */}
        <View style={styles.stockInfo}>
          <Text style={[styles.stockValue, { color: isLowStock ? fiori.colors.destructive : fiori.colors.textPrimary }]}>
            {formatNumber(item.total_stock)}
          </Text>
          <Text style={[styles.stockLabel, { color: fiori.colors.textSecondary }]}>/ {formatNumber(item.total_qty)}</Text>
        </View>

        {/* Expand/Collapse Icon */}
        <View style={styles.expandIcon}>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={fiori.colors.textSecondary}
          />
        </View>
      </Pressable>

      {/* GRN Count Badge */}
      <View style={styles.badgeRow}>
        <View style={[styles.grnBadge, { backgroundColor: fiori.colors.successLight }]}>
          <Text style={[styles.grnBadgeText, { color: fiori.colors.success }]}>
            {item.grn_count} GRN{item.grn_count !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Expandable GRN List */}
      {isExpanded && (
        <View style={[styles.fioriCardBody, {
          backgroundColor: fiori.colors.backgroundGrouped,
          borderTopColor: fiori.colors.divider,
        }]}>
          {isLoadingGRNs ? (
            <View style={styles.grnLoadingContainer}>
              <ActivityIndicator size="small" color={fiori.colors.tint} />
              <Text style={[styles.grnLoadingText, { color: fiori.colors.textSecondary }]}>Loading GRNs...</Text>
            </View>
          ) : grnDetails && grnDetails.length > 0 ? (
            grnDetails.map((grn, index) => (
              <GRNRow
                key={`${grn.grn_id || grn.id}-${index}`}
                grn={grn}
                isLast={index === grnDetails.length - 1}
              />
            ))
          ) : (
            <View style={styles.grnEmptyContainer}>
              <Text style={[styles.grnEmptyText, { color: fiori.colors.textTertiary }]}>No GRN details available</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// Search Input Component
// ============================================================================
interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

const SearchInput: React.FC<SearchInputProps> = ({ value, onChangeText, onClear }) => {
  const fiori = useFioriColors();

  return (
    <View style={[styles.searchContainer, {
      backgroundColor: fiori.colors.cardBackground,
      borderColor: fiori.colors.divider,
    }]}>
      <Icon name="magnify" size={20} color={fiori.colors.textSecondary} style={styles.searchIcon} />
      <TextInput
        style={[styles.searchInput, { color: fiori.colors.textPrimary }]}
        placeholder="Search items..."
        placeholderTextColor={fiori.colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={onClear} style={styles.clearButton}>
          <Icon name="close-circle" size={18} color={fiori.colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
};

// ============================================================================
// Main Screen
// ============================================================================
export default function ItemStockSummaryScreen() {
  const fiori = useFioriColors();

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

  // Refs for preventing duplicate fetches
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
    if (fetchInProgressRef.current && !isRefresh) return;
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

      console.log('[ItemStockSummary] Fetching items:', { query, offset, isLoadMore });

      const response = await StockService.getItemWiseStockList({
        searchQuery: query || undefined,
        limit: 50,
        offset,
      });

      if (!isMountedRef.current) return;

      if (response.success && response.data) {
        const newItems = response.data.items;

        if (isLoadMore) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setItems(newItems);
          // Clear expanded state and cache on new search/refresh
          setExpandedItems(new Set());
          setGrnDetailsCache({});
        }

        setPagination({
          totalCount: response.data.pagination.totalCount,
          hasMore: response.data.pagination.hasMore,
          offset: offset + newItems.length,
        });

        console.log('[ItemStockSummary] Fetch success:', {
          itemsCount: newItems.length,
          totalCount: response.data.pagination.totalCount,
          hasMore: response.data.pagination.hasMore,
        });
      } else {
        console.error('[ItemStockSummary] Fetch error:', response.message);
        setError(response.message || 'Failed to load items');
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('[ItemStockSummary] Exception:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      fetchInProgressRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  // Fetch GRN details for an item
  const fetchGRNDetails = useCallback(async (itemId: string) => {
    // Already cached
    if (grnDetailsCache[itemId]) return;

    // Already loading
    if (loadingGRNs.has(itemId)) return;

    setLoadingGRNs(prev => new Set(prev).add(itemId));

    try {
      console.log('[ItemStockSummary] Fetching GRN details for item:', itemId);

      const response = await getAllGRNItems({
        p_filters: { item_ids: [itemId], stock_status: 'in_stock' },
        p_limit: 100,
      });

      if (!isMountedRef.current) return;

      if (response.success && response.data?.items) {
        setGrnDetailsCache(prev => ({
          ...prev,
          [itemId]: response.data.items,
        }));
        console.log('[ItemStockSummary] GRN details loaded:', response.data.items.length);
      } else {
        console.error('[ItemStockSummary] Failed to load GRN details:', response.message);
        // Cache empty array to prevent re-fetching
        setGrnDetailsCache(prev => ({
          ...prev,
          [itemId]: [],
        }));
      }
    } catch (err) {
      console.error('[ItemStockSummary] Exception fetching GRN details:', err);
      setGrnDetailsCache(prev => ({
        ...prev,
        [itemId]: [],
      }));
    } finally {
      if (isMountedRef.current) {
        setLoadingGRNs(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    }
  }, [grnDetailsCache, loadingGRNs]);

  // Toggle item expansion
  const toggleItem = useCallback((itemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

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
        label: 'Total Items',
        variant: 'primary',
      },
      {
        icon: 'package-variant',
        value: totalStock,
        label: 'Total Stock',
        variant: 'secondary',
      },
    ];
  }, [items, pagination.totalCount]);

  // Render item
  const renderItem = useCallback(({ item }: { item: ItemWiseStockItem }) => (
    <ItemCard
      item={item}
      isExpanded={expandedItems.has(item.item_id)}
      onToggle={() => toggleItem(item.item_id)}
      grnDetails={grnDetailsCache[item.item_id] || null}
      isLoadingGRNs={loadingGRNs.has(item.item_id)}
    />
  ), [expandedItems, toggleItem, grnDetailsCache, loadingGRNs]);

  // Key extractor
  const keyExtractor = useCallback((item: ItemWiseStockItem) => item.item_id, []);

  // Footer component
  const ListFooterComponent = useMemo(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={fiori.colors.tint} />
          <Text style={[styles.loadingMoreText, { color: fiori.colors.textSecondary }]}>Loading more...</Text>
        </View>
      );
    }
    return null;
  }, [isLoadingMore, fiori.colors]);

  // Loading state
  if (isLoading && items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Item Stock Summary" />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'cube-outline', value: '-', label: 'Total Items', variant: 'primary' },
              { icon: 'package-variant', value: '-', label: 'Total Stock', variant: 'secondary' },
            ]}
            isLoading={true}
            compact
          />
          <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} />
          <ActivityIndicator size="large" color={fiori.colors.tint} style={styles.spinner} />
        </View>
      </View>
    );
  }

  // Error state
  if (error && items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Item Stock Summary" />
        <KPIGrid
          items={[
            { icon: 'cube-outline', value: '-', label: 'Total Items', variant: 'primary' },
            { icon: 'package-variant', value: '-', label: 'Total Stock', variant: 'secondary' },
          ]}
          isLoading={false}
          compact
        />
        <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} />
        <ReportEmptyState
          icon="alert-circle-outline"
          message="Failed to Load"
          description={error}
        />
      </View>
    );
  }

  // Empty state
  if (items.length === 0 && !isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Item Stock Summary" />
        <KPIGrid
          items={[
            { icon: 'cube-outline', value: '-', label: 'Total Items', variant: 'primary' },
            { icon: 'package-variant', value: '-', label: 'Total Stock', variant: 'secondary' },
          ]}
          isLoading={false}
          compact
        />
        <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} />
        <ReportEmptyState
          icon={debouncedQuery ? 'magnify-close' : 'cube-outline'}
          message={debouncedQuery ? 'No Items Found' : 'No Stock Data'}
          description={
            debouncedQuery
              ? `No items matching "${debouncedQuery}"`
              : 'There is no inventory currently in storage.'
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
      <ReportHeader title="Item Stock Summary" />

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
            colors={[fiori.colors.tint]}
            tintColor={fiori.colors.tint}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <>
            <KPIGrid items={kpiItems} isLoading={isLoading} compact />
            <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} />
          </>
        }
        ListFooterComponent={ListFooterComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  spinner: {
    marginTop: 40,
  },
  listContent: {
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingBottom: 32,
  },
  separator: {
    height: 10,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: FIORI_STATIC.dimensions.cardPadding,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
  },
  clearButton: {
    padding: 4,
  },

  // Item Card
  itemCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fioriObjectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  fioriObjectCellImage: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriObjectCellContent: {
    flex: 1,
  },
  fioriObjectCellTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  fioriObjectCellSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },

  // Stock Info
  stockInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  stockValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  stockLabel: {
    fontSize: 12,
  },

  // Expand Icon
  expandIcon: {
    width: 24,
    alignItems: 'center',
  },

  // Badge Row
  badgeRow: {
    flexDirection: 'row',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingBottom: 12,
  },
  grnBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  grnBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // =========================================================================
  // Fiori Card Body (expanded content area)
  // =========================================================================
  fioriCardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grnLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  grnLoadingText: {
    fontSize: 13,
  },
  grnEmptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  grnEmptyText: {
    fontSize: 13,
  },

  // =========================================================================
  // Fiori GRN Row (nested Object Cell)
  // @see design/sap-fiori-specs/01-object-cell.md
  // =========================================================================
  fioriGrnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  fioriGrnRowContent: {
    flex: 1,
  },
  fioriGrnRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fioriGrnRowTitle: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  fioriGrnRowCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  fioriGrnRowFootnote: {
    fontSize: 13,
    flex: 1,
  },
  fioriGrnRowDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  fioriGrnRowDetail: {
    fontSize: 12,
  },
  fioriGrnRowDetailSeparator: {
    fontSize: 12,
    marginHorizontal: 2,
  },
  fioriGrnRowAttributes: {
    alignItems: 'flex-end',
  },
  fioriGrnRowQtyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  fioriGrnRowStock: {
    fontSize: 15,
    fontWeight: '600',
  },
  fioriGrnRowOrigQty: {
    fontSize: 12,
  },
  fioriGrnRowWeight: {
    fontSize: 12,
    marginTop: 2,
  },

  // =========================================================================
  // Fiori Tags/Badges
  // =========================================================================
  fioriTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fioriTagText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Loading More
  loadingMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
  },
});
