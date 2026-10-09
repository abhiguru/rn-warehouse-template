import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { OrderService } from '@/services/order-service';
import { CustomerDispatchItem } from '@/types/order.types';
import DispatchGroupCard, { DispatchGroup } from '@/components/DispatchGroupCard';
import { GenericFilterModal, useFilterState, FilterConfig } from '@/components/filters';
import { getAutocompleteSelections, getStringValue, getNumberValue, isDateFilterValue } from '@/types/filter.types';
import { formatCount, formatSectionDate, toLocalISODate, toDate } from '@/utils/formatters';

interface DispatchWithItems {
  dispatch: DispatchGroup;
  items: CustomerDispatchItem[];
}

interface DispatchSection {
  title: string;
  data: DispatchWithItems[];
}

// Filter fields configuration (shared, persistKey is added dynamically)
const filterFields: FilterConfig['fields'] = [
  {
    type: 'autocomplete',
    key: 'items',
    label: 'Item name',
    icon: '📦',
    autocompleteType: 'item',
    placeholder: 'Choose item',
    searchPlaceholder: 'Search items',
    renderAsChips: true,
    multiSelect: false,
  },
  {
    type: 'autocomplete',
    key: 'grNo',
    label: 'GRN number',
    icon: '📋',
    autocompleteType: 'grn',
    placeholder: 'Choose GRN',
    searchPlaceholder: 'Search GRN numbers',
    renderAsChips: true,
    multiSelect: false,
  },
  {
    type: 'autocomplete',
    key: 'dispNo',
    label: 'Dispatch number',
    icon: '🚚',
    autocompleteType: 'dispatch',
    placeholder: 'Choose dispatch',
    searchPlaceholder: 'Search dispatch numbers',
    renderAsChips: true,
    multiSelect: false,
  },
  {
    type: 'date-range',
    key: ['dateFrom', 'dateTo'],
    label: 'Date range',
    icon: '📅',
    placeholder: ['From date', 'To date'],
  },
  {
    type: 'number-range',
    key: ['dispQtyMin', 'dispQtyMax'],
    label: 'Bags dispatched',
    icon: '🔢',
    placeholder: ['Min qty', 'Max qty'],
    minValue: 0,
  },
];

const CustomerDispatches: React.FC = () => {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [loadError, setLoadError] = useState(false);

  const [dispatches, setDispatches] = useState<CustomerDispatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const offsetRef = useRef(0);
  const isFetchingRef = useRef(false);
  const loadMoreTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Filter states - using new generic filter system
  // Include customerId in persistKey so filters are customer-specific
  const [showFilterModal, setShowFilterModal] = useState(false);
  const { debouncedValues: filters, activeFilterCount, updateFilter, clearFilter } = useFilterState({
    persistKey: `dispatch-history-${customerId}`,
    debounceMs: 500,
  });

  // Dynamic filter config with customer-specific persistKey
  const filterConfig = useMemo((): FilterConfig => ({
    persistKey: `dispatch-history-${customerId}`,
    debounceMs: 500,
    title: 'Filter dispatches',
    fields: filterFields,
  }), [customerId]);

  // Aggregations
  const [aggregations, setAggregations] = useState({
    total_initial_qty: 0,
    total_dispatch_qty: 0,
    total_weight: 0,
    total_count: 0,
  });

  // Fetch dispatches
  const fetchDispatches = useCallback(async (reset = false) => {
    if (!customerId || isFetchingRef.current) return;

    isFetchingRef.current = true;
    try {
      if (reset) {
        setLoading(true);
        offsetRef.current = 0;
        setOffset(0);
        setDispatches([]); // Clear existing data when resetting
        setHasMore(true); // Reset hasMore flag
      } else {
        setLoadingMore(true);
      }

      const offsetToUse = reset ? 0 : offsetRef.current;

      // Build filters object - handle autocomplete selections
      const apiFilters: Record<string, any> = {};

      // Handle item autocomplete (extract item name from selections)
      if (filters.items && Array.isArray(filters.items) && filters.items.length > 0) {
        // Use the label (item name) from the first selected item for filtering
        apiFilters.itemName = filters.items[0].label;
      }

      // Handle GRN autocomplete (extract GRN number from selections)
      if (filters.grNo && Array.isArray(filters.grNo) && filters.grNo.length > 0) {
        // Use the label (GRN number) from the first selected item for filtering
        apiFilters.grNo = filters.grNo[0].label;
      }

      // Handle dispatch autocomplete (extract dispatch number from selections)
      if (filters.dispNo && Array.isArray(filters.dispNo) && filters.dispNo.length > 0) {
        // Use the label (dispatch number) from the first selected item for filtering
        apiFilters.dispNo = filters.dispNo[0].label;
      }

      // Handle dispatch quantity range filter
      if (filters.dispQtyMin !== undefined && filters.dispQtyMin !== null) {
        apiFilters.dispQtyMin = filters.dispQtyMin;
      }
      if (filters.dispQtyMax !== undefined && filters.dispQtyMax !== null) {
        apiFilters.dispQtyMax = filters.dispQtyMax;
      }

      const result = await OrderService.getCustomerDispatches(customerId, {
        dateFrom: isDateFilterValue(filters.dateFrom) ? filters.dateFrom.toISOString() : undefined,
        dateTo: isDateFilterValue(filters.dateTo) ? filters.dateTo.toISOString() : undefined,
        filters: Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
        sortBy: 'dispDate',
        sortOrder: 'desc',
        limit: 40,
        offset: offsetToUse,
      });

      if (result.success && result.data) {
        const responseData = result.data;

        if (reset) {
          setDispatches(responseData.items);
          if (responseData.items.length > 0) {
            setCustomerName(responseData.items[0].grns_customer_name);
          }
        } else {
          setDispatches((prev) => [...prev, ...responseData.items]);
        }

        setHasMore(responseData.pagination.has_more);
        const newOffset = offsetToUse + responseData.items.length;
        offsetRef.current = newOffset;
        setOffset(newOffset);
        setAggregations(responseData.aggregations);
        setLoadError(false);
      } else if (reset) {
        setLoadError(true);
      }
    } catch (error) {
      console.error('[CustomerDispatches] Exception:', error);
      if (reset) setLoadError(true);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [customerId, filters]);

  // Fetch on mount and when filters change (debounced by useFilterState)
  useEffect(() => {
    if (customerId) {
      // Reset loading states when filters change
      setLoadingMore(false);
      fetchDispatches(true);
    }
    // fetchDispatches is intentionally excluded to prevent circular dependency
    // It's stable enough via useCallback with its own dependencies
  }, [customerId, filters]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current) {
        clearTimeout(loadMoreTimerRef.current);
      }
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDispatches(true);
  }, [fetchDispatches]);

  const loadMore = useCallback(() => {
    // Clear any existing timer
    if (loadMoreTimerRef.current) {
      clearTimeout(loadMoreTimerRef.current);
    }

    // Set a new timer to prevent rapid calls
    loadMoreTimerRef.current = setTimeout(() => {
      if (!loadingMore && hasMore && !isFetchingRef.current) {
        fetchDispatches(false);
      }
    }, 300);
  }, [loadingMore, hasMore, fetchDispatches]);

  // First: Group items by dispatch ID
  const dispatchGroups = useMemo((): DispatchWithItems[] => {
    const groups = new Map<string, DispatchWithItems>();

    dispatches.forEach((item) => {
      const key = item.dispatch_id;

      if (!groups.has(key)) {
        groups.set(key, {
          dispatch: {
            dispatchId: item.dispatch_id,
            dispNo: item.disp_no,
            dispDate: item.disp_date,
            registration: item.registration,
            note: item.note,
            customerName: item.grns_customer_name,
          },
          items: [],
        });
      }

      groups.get(key)!.items.push(item);
    });

    return Array.from(groups.values());
  }, [dispatches]);

  // Second: Group dispatch groups by date sections with immutable keys
  const sections = useMemo((): DispatchSection[] => {
    // Day sections keyed by the local date (YYYY-MM-DD), titled
    // "Today", "Yesterday" or "Tue, 6 Oct" (style guide §12.3)
    const getSectionKey = (date: Date): string => toLocalISODate(date);

    // Group dispatches by immutable section key
    const sectionMap = new Map<string, DispatchWithItems[]>();

    dispatchGroups.forEach((dispatchGroup) => {
      const sectionKey = getSectionKey(toDate(dispatchGroup.dispatch.dispDate) ?? new Date(NaN));

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, []);
      }

      sectionMap.get(sectionKey)!.push(dispatchGroup);
    });

    // Sort section keys by date (newest first)
    const sortedKeys = Array.from(sectionMap.keys()).sort().reverse();

    // Convert to sections array with display labels
    const sectionsArray: DispatchSection[] = sortedKeys.map(key => ({
      title: formatSectionDate(key),
      data: sectionMap.get(key)!,
    }));

    return sectionsArray;
  }, [dispatchGroups]);

  // Check if any filters are active (now provided by useFilterState hook)
  const hasActiveFilters = activeFilterCount > 0;

  // Section header icon (neutral; dates carry no status meaning)
  const getSectionIcon = (title: string) => {
    switch (title) {
      case 'Today':
        return 'calendar-today';
      case 'Yesterday':
        return 'calendar-minus';
      default:
        return 'calendar-blank-outline';
    }
  };

  // Render section header (guide §13.6 SectionHeader: footnote, capitals, text.secondary)
  const renderSectionHeader = useCallback(({ section }: { section: DispatchSection }) => {
    const dispatchCount = section.data.length;

    return (
      <View
        style={styles.sectionHeader}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${section.title}, ${formatCount(dispatchCount, 'dispatch', 'dispatches')}`}
      >
        <Icon name={getSectionIcon(section.title)} size={iconSize.sm} color={t.icon.secondary} />
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
        <Text style={styles.sectionCountText}>{dispatchCount}</Text>
      </View>
    );
  }, [styles, t]);

  // Render dispatch group card
  const renderDispatchGroupCard = useCallback(({ item }: { item: DispatchWithItems }) => (
    <DispatchGroupCard
      dispatch={item.dispatch}
      items={item.items}
    />
  ), []);

  // Render empty / error state (guide §13.6 ListEmptyState)
  const renderEmpty = () => {
    if (loading) return null;

    if (loadError) {
      return (
        <View style={styles.emptyContainer}>
          <Icon
            name="alert-circle-outline"
            size={iconSize.hero}
            color={t.status.negative.text}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            Couldn't load dispatches
          </Text>
          <Text style={styles.emptySubtext}>
            Check your connection and try again.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={onRefresh}
            accessibilityLabel="Try loading dispatches again"
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    const hasFilters = hasActiveFilters;

    return (
      <View style={styles.emptyContainer}>
        <Icon
          name={hasFilters ? 'magnify' : 'truck-delivery-outline'}
          size={iconSize.hero}
          color={t.icon.secondary}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          {hasFilters ? 'No dispatches match your filters' : 'No dispatches yet'}
        </Text>
        <Text style={styles.emptySubtext}>
          {hasFilters
            ? 'Try fewer filters to see more dispatches.'
            : "This customer's dispatches appear here."}
        </Text>
        {hasFilters && (
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={clearFilter}
            accessibilityLabel="Clear filters"
            accessibilityHint="Removes all filters to show every dispatch"
            accessibilityRole="button"
          >
            <Icon name="filter-remove-outline" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>Clear filters</Text>
          </Pressable>
        )}
      </View>
    );
  };

  // Render footer (loading more indicator)
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading more…</Text>
      </View>
    );
  };

  // One applied-filter chip (guide §13.5 FilterChip)
  const renderChip = (key: string, label: string, onRemove: () => void, removeLabel: string) => (
    <View key={key} style={styles.filterChip}>
      <Text style={styles.filterChipText} maxFontSizeMultiplier={1.6}>{label}</Text>
      <Pressable
        onPress={onRemove}
        style={styles.chipRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={removeLabel}
        accessibilityRole="button"
      >
        <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
      </Pressable>
    </View>
  );

  // Render applied filters bar
  const renderAppliedFilters = () => {
    if (!hasActiveFilters) return null;

    return (
      <View style={styles.appliedFiltersContainer}>
        <View style={styles.appliedFiltersHeader}>
          <Text style={styles.appliedFiltersTitle} accessibilityRole="header">
            Filters ({activeFilterCount})
          </Text>
          <Pressable
            onPress={clearFilter}
            style={styles.clearAllButton}
            accessibilityLabel="Clear all filters"
            accessibilityRole="button"
          >
            <Text style={styles.clearAllText}>Clear all</Text>
          </Pressable>
        </View>
        <View style={styles.appliedFiltersList}>
          {getAutocompleteSelections(filters.items).map((item) =>
            renderChip(
              `item-${item.id}`,
              `Item: ${item.label}`,
              () => {
                const newItems = getAutocompleteSelections(filters.items).filter((i) => i.id !== item.id);
                updateFilter('items', newItems);
              },
              `Remove filter item ${item.label}`
            )
          )}
          {getAutocompleteSelections(filters.grNo).map((grn) =>
            renderChip(
              `grn-${grn.id}`,
              `GRN ${grn.label}`,
              () => {
                const newGrns = getAutocompleteSelections(filters.grNo).filter((g) => g.id !== grn.id);
                updateFilter('grNo', newGrns);
              },
              `Remove filter GRN ${grn.label}`
            )
          )}
          {getAutocompleteSelections(filters.dispNo).map((dispatch) =>
            renderChip(
              `disp-${dispatch.id}`,
              `Dispatch ${dispatch.label}`,
              () => {
                const newDispatches = getAutocompleteSelections(filters.dispNo).filter((d) => d.id !== dispatch.id);
                updateFilter('dispNo', newDispatches);
              },
              `Remove filter dispatch ${dispatch.label}`
            )
          )}
          {(filters.dispQtyMin !== undefined || filters.dispQtyMax !== undefined) &&
            renderChip(
              'qty',
              `Bags: ${getNumberValue(filters.dispQtyMin) ?? 0} to ${getNumberValue(filters.dispQtyMax) ?? 'any'}`,
              () => {
                updateFilter('dispQtyMin', undefined);
                updateFilter('dispQtyMax', undefined);
              },
              'Remove filter quantity range'
            )}
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel="Loading dispatches">
        <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading dispatches…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Icon name="arrow-left" size={iconSize.lg} color={t.brand.tint} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            Dispatch history
          </Text>
          {!!customerName && <Text style={styles.subtitle}>{customerName}</Text>}
        </View>
        <Pressable
          onPress={() => setShowFilterModal(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          accessibilityLabel={
            activeFilterCount > 0
              ? `Filter dispatches, ${formatCount(activeFilterCount, 'filter')} set`
              : 'Filter dispatches'
          }
          accessibilityHint="Filter dispatches by item, GRN or date"
          accessibilityRole="button"
        >
          <Icon name="filter-variant" size={iconSize.lg} color={t.brand.tint} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText} maxFontSizeMultiplier={1.6}>
                {activeFilterCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Applied Filters */}
      {renderAppliedFilters()}

      {/* Dispatch List */}
      <SectionList
        sections={sections}
        renderItem={renderDispatchGroupCard}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => `dispatch-${item.dispatch.dispatchId}`}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={[styles.listContent, { paddingBottom: space.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        // Performance optimizations
        windowSize={10}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
        getItemLayout={undefined} // Let SectionList calculate dynamically
      />

      {/* Filter Modal */}
      <GenericFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        config={filterConfig}
      />
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    marginTop: space.md,
    color: t.text.secondary,
  },
  // Stack-style header (guide §13.8)
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: t.surface.header,
    paddingHorizontal: space.xs,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    gap: space.xs,
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
  },
  subtitle: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  filterBadge: {
    position: 'absolute' as const,
    top: space.xs,
    right: space.xxs,
    backgroundColor: t.brand.fill,
    borderRadius: radius.pill,
    minWidth: 18,
    minHeight: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.xs,
  },
  filterBadgeText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  appliedFiltersContainer: {
    backgroundColor: t.surface.card,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  appliedFiltersHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  appliedFiltersTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  clearAllButton: {
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    paddingHorizontal: space.sm,
  },
  clearAllText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  appliedFiltersList: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
    borderRadius: radius.pill,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: space.xxs,
    gap: space.xs,
  },
  filterChipText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  chipRemove: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.xxl,
    paddingBottom: space.sm,
    gap: space.sm,
    backgroundColor: t.background.base,
  },
  sectionHeaderText: {
    ...typography.footnote,
    flex: 1,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  sectionCountText: {
    ...typography.footnote,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  listContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.max,
    paddingHorizontal: space.xl,
  },
  emptyIcon: {
    marginBottom: space.lg,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },
  emptySubtext: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.xl,
    paddingHorizontal: space.xl,
    minHeight: touchTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  loadingFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.xl,
    gap: space.sm,
  },
});

export default CustomerDispatches;
