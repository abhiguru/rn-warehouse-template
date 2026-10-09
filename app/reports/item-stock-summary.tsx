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
  LayoutAnimation,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportHeader, KPIGrid, ReportEmptyState, type KPIItem } from '@/components/reports';
import { StockService } from '@/services/stock-service';
import { getAllGRNItems, type GRNItem } from '@/services/grn-service';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { formatNumber, parseLocalISODate } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import type { ItemWiseStockItem } from '@/types/stock.types';

const logger = createLogger('ItemStockSummary');

const LOAD_ERROR = "Couldn't load items. Check your connection and try again.";

/** Below this share of the received quantity still in stock, an item is low on stock. */
const LOW_STOCK_PERCENT = 20;

/** "9 Oct 2026" (guide §12.3) */
function formatDay(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalISODate(value) : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const weightFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

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

    // Item card
    itemCard: {
      marginHorizontal: layout.marginCompact,
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      ...t.shadow[2],
    },
    itemCardClip: { borderRadius: radius.card, overflow: 'hidden' },
    objectCell: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    objectCellPressed: { backgroundColor: t.surface.cardPressed },
    objectCellImage: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.button,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.brand.subtle,
    },
    objectCellContent: { flex: 1, gap: space.xxs },
    objectCellTitle: { ...typography.headline, color: t.text.primary },
    objectCellSubtitle: { ...typography.subhead, color: t.text.secondary },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s6, marginTop: space.xxs },
    stockInfo: { alignItems: 'flex-end' },
    stockValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums'] },
    stockLabel: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums'] },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
      paddingHorizontal: space.s6,
      paddingVertical: space.xxs,
      borderRadius: radius.field,
    },
    tagText: { ...typography.caption1, fontWeight: fontWeight.semibold },
    neutralTag: { backgroundColor: t.status.neutral.background },
    neutralTagText: { color: t.status.neutral.text },
    criticalTag: { backgroundColor: t.status.critical.background },
    criticalTagText: { color: t.status.critical.text },

    // Expanded body
    cardBody: {
      backgroundColor: t.background.base,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.divider,
    },
    grnLoadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.xl,
      gap: space.sm,
    },
    grnLoadingText: { ...typography.footnote, color: t.text.secondary },
    grnEmptyText: {
      ...typography.footnote,
      color: t.text.secondary,
      textAlign: 'center',
      paddingVertical: space.xl,
      paddingHorizontal: space.lg,
    },

    // GRN row
    grnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      minHeight: layout.rowMinHeight + space.md,
      gap: space.md,
    },
    grnRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
    grnRowPressed: { backgroundColor: t.surface.cardPressed },
    grnRowContent: { flex: 1, gap: space.xxs },
    grnRowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
    grnRowTitle: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, flexShrink: 1 },
    grnRowLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
    grnRowFootnote: { ...typography.footnote, color: t.text.secondary, flexShrink: 1 },
    grnRowDetail: { ...typography.caption1, color: t.text.secondary },
    grnRowAttributes: { alignItems: 'flex-end' },
    grnRowStock: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums'] },
    grnRowOrigQty: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums'] },

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
// GRN Row Component (nested row within expanded Item Card)
// ============================================================================
interface GRNRowProps {
  grn: GRNItem;
  isLast?: boolean;
  styles: Styles;
  t: ThemeTokens;
}

const GRNRow: React.FC<GRNRowProps> = ({ grn, isLast = false, styles, t }) => {
  const handlePress = () => {
    const grnId = grn.grn_id || grn.id;
    if (grnId) {
      router.push(`/grn-details/${grnId}`);
    }
  };

  const isNavigable = !!(grn.grn_id || grn.id);
  const details = [
    grn.date ? { icon: 'calendar-outline', text: formatDay(grn.date) } : null,
    grn.rack ? { icon: 'view-grid-outline', text: `Rack ${grn.rack}` } : null,
    grn.weight && grn.weight > 0 ? { icon: 'weight-kilogram', text: `${weightFormat.format(grn.weight)} kg` } : null,
  ].filter((d): d is { icon: string; text: string } => d !== null);

  const a11yLabel = [
    `GRN ${grn.gr_no}`,
    grn.package_mark ? `mark ${grn.package_mark}` : null,
    grn.customer_name,
    ...details.map(d => d.text),
    `${formatNumber(grn.stock)} of ${formatNumber(grn.qty)} in stock`,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View style={styles.grnRowContent}>
        {/* Line 1: GRN number + package mark */}
        <View style={styles.grnRowTitleRow}>
          <Text style={styles.grnRowTitle} numberOfLines={1}>
            {`GRN ${grn.gr_no}`}
          </Text>
          {grn.package_mark && (
            <View style={[styles.tag, styles.neutralTag]}>
              <Text style={[styles.tagText, styles.neutralTagText]} maxFontSizeMultiplier={1.6}>
                {grn.package_mark}
              </Text>
            </View>
          )}
        </View>

        {/* Line 2: Customer */}
        <View style={styles.grnRowLine}>
          <Icon name="account-outline" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.grnRowFootnote} numberOfLines={1}>
            {grn.customer_name}
          </Text>
        </View>

        {/* Line 3: Date, rack, weight */}
        {details.length > 0 && (
          <View style={styles.grnRowLine}>
            {details.map((d, i) => (
              <React.Fragment key={d.icon}>
                {i > 0 && <Text style={styles.grnRowDetail}>·</Text>}
                <Icon name={d.icon} size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.grnRowDetail}>{d.text}</Text>
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      {/* Stock of received quantity */}
      <View style={styles.grnRowAttributes}>
        <Text style={styles.grnRowStock}>{formatNumber(grn.stock)}</Text>
        <Text style={styles.grnRowOrigQty}>{`of ${formatNumber(grn.qty)}`}</Text>
      </View>

      {isNavigable && <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />}
    </>
  );

  if (isNavigable) {
    return (
      <Pressable
        style={({ pressed }) => [styles.grnRow, !isLast && styles.grnRowDivider, pressed && styles.grnRowPressed]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens the GRN"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.grnRow, !isLast && styles.grnRowDivider]} accessible accessibilityLabel={a11yLabel}>
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
  styles: Styles;
  t: ThemeTokens;
}

const ItemCard: React.FC<ItemCardProps> = ({
  item,
  isExpanded,
  onToggle,
  grnDetails,
  isLoadingGRNs,
  styles,
  t,
}) => {
  const stockPercentage = item.total_qty > 0
    ? Math.round((item.total_stock / item.total_qty) * 100)
    : 0;
  const isLowStock = stockPercentage < LOW_STOCK_PERCENT;
  const grnCount = `${formatNumber(item.grn_count)} ${item.grn_count === 1 ? 'GRN' : 'GRNs'}`;

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemCardClip}>
        {/* Main Object Cell - Tappable Header */}
        <Pressable
          style={({ pressed }) => [styles.objectCell, pressed && styles.objectCellPressed]}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={[
            item.item_name,
            item.packaging,
            `${formatNumber(item.total_stock)} of ${formatNumber(item.total_qty)} in stock`,
            grnCount,
            isLowStock ? 'Low stock' : null,
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityState={{ expanded: isExpanded }}
          accessibilityHint={isExpanded ? 'Hides the GRNs' : 'Shows the GRNs holding this item'}
        >
          <View style={styles.objectCellImage}>
            <Icon name="cube-outline" size={iconSize.lg} color={t.brand.tint} />
          </View>

          <View style={styles.objectCellContent}>
            <Text style={styles.objectCellTitle} numberOfLines={2}>
              {item.item_name}
            </Text>
            {item.packaging ? (
              <Text style={styles.objectCellSubtitle} numberOfLines={1}>
                {item.packaging}
              </Text>
            ) : null}
            <View style={styles.tagRow}>
              <View style={[styles.tag, styles.neutralTag]}>
                <Text style={[styles.tagText, styles.neutralTagText]} maxFontSizeMultiplier={1.6}>
                  {grnCount}
                </Text>
              </View>
              {isLowStock && (
                <View style={[styles.tag, styles.criticalTag]}>
                  <Icon name="alert" size={iconSize.sm} color={t.status.critical.text} />
                  <Text style={[styles.tagText, styles.criticalTagText]} maxFontSizeMultiplier={1.6}>
                    Low stock
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.stockInfo}>
            <Text style={styles.stockValue}>{formatNumber(item.total_stock)}</Text>
            <Text style={styles.stockLabel}>{`of ${formatNumber(item.total_qty)}`}</Text>
          </View>

          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>

        {/* Expandable GRN List */}
        {isExpanded && (
          <View style={styles.cardBody}>
            {isLoadingGRNs ? (
              <View style={styles.grnLoadingContainer} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={t.brand.tint} />
                <Text style={styles.grnLoadingText}>Loading GRNs</Text>
              </View>
            ) : grnDetails && grnDetails.length > 0 ? (
              grnDetails.map((grn, index) => (
                <GRNRow
                  key={`${grn.grn_id || grn.id}-${index}`}
                  grn={grn}
                  isLast={index === grnDetails.length - 1}
                  styles={styles}
                  t={t}
                />
              ))
            ) : (
              <Text style={styles.grnEmptyText}>No GRNs with this item in stock.</Text>
            )}
          </View>
        )}
      </View>
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
  styles: Styles;
  t: ThemeTokens;
}

const SearchInput: React.FC<SearchInputProps> = ({ value, onChangeText, onClear, styles, t }) => (
  <View style={styles.searchContainer}>
    <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} style={styles.searchIcon} />
    <TextInput
      style={styles.searchInput}
      placeholder="Search items"
      placeholderTextColor={t.text.placeholder}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel="Search items"
    />
    {value.length > 0 && (
      <Pressable onPress={onClear} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Clear search">
        <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    )}
  </View>
);

const PLACEHOLDER_KPIS: KPIItem[] = [
  { icon: 'cube-outline', value: '-', label: 'Items', variant: 'primary' },
  { icon: 'warehouse', value: '-', label: 'Stock', variant: 'primary' },
];

// ============================================================================
// Main Screen
// ============================================================================
export default function ItemStockSummaryScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

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

      logger.debug('Fetching items', { query, offset, isLoadMore });

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

        logger.debug('Fetch success', {
          itemsCount: newItems.length,
          totalCount: response.data.pagination.totalCount,
          hasMore: response.data.pagination.hasMore,
        });
      } else {
        logger.warn('Fetch error', { message: response.message });
        setError(LOAD_ERROR);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      logger.error('Exception', err);
      setError(LOAD_ERROR);
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
      logger.debug('Fetching GRN details for item', { itemId });

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
        logger.debug('GRN details loaded', { count: response.data.items.length });
      } else {
        logger.warn('Failed to load GRN details', { message: response.message });
        // Cache empty array to prevent re-fetching
        setGrnDetailsCache(prev => ({
          ...prev,
          [itemId]: [],
        }));
      }
    } catch (err) {
      logger.error('Exception fetching GRN details', err);
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
        label: 'Items',
        variant: 'primary',
      },
      {
        icon: 'warehouse',
        value: totalStock,
        label: 'Stock',
        variant: 'primary',
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
      styles={styles}
      t={t}
    />
  ), [expandedItems, toggleItem, grnDetailsCache, loadingGRNs, styles, t]);

  // Key extractor
  const keyExtractor = useCallback((item: ItemWiseStockItem) => item.item_id, []);

  // Footer component
  const ListFooterComponent = useMemo(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.loadingMoreText}>Loading more items</Text>
        </View>
      );
    }
    return null;
  }, [isLoadingMore, styles, t]);

  // Loading state
  if (isLoading && items.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Item stock summary" />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={PLACEHOLDER_KPIS}
            isLoading={true}
            compact
          />
          <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} styles={styles} t={t} />
          <ActivityIndicator size="large" color={t.brand.tint} style={styles.spinner} accessibilityLabel="Loading items" />
        </View>
      </View>
    );
  }

  // Error state
  if (error && items.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Item stock summary" />
        <KPIGrid
          items={PLACEHOLDER_KPIS}
          isLoading={false}
          compact
        />
        <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} styles={styles} t={t} />
        <ReportEmptyState
          icon="alert-circle-outline"
          tone="error"
          message="Something went wrong"
          description={error}
          actionLabel="Try again"
          onAction={() => fetchItems(debouncedQuery, 0)}
        />
      </View>
    );
  }

  // Empty state
  if (items.length === 0 && !isLoading) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Item stock summary" />
        <KPIGrid
          items={PLACEHOLDER_KPIS}
          isLoading={false}
          compact
        />
        <SearchInput value={searchQuery} onChangeText={setSearchQuery} onClear={handleClearSearch} styles={styles} t={t} />
        <ReportEmptyState
          icon={debouncedQuery ? 'magnify-close' : 'cube-outline'}
          message={debouncedQuery ? 'No matching items' : 'No stock yet'}
          description={
            debouncedQuery
              ? `No items match "${debouncedQuery}". Try fewer letters.`
              : 'Items appear here once goods are received.'
          }
          actionLabel={debouncedQuery ? 'Clear search' : undefined}
          onAction={debouncedQuery ? handleClearSearch : undefined}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReportHeader title="Item stock summary" />

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
