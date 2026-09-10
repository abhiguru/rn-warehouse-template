import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { OrderService } from '@/services/order-service';
import { CustomerDispatchItem } from '@/types/order.types';
import DispatchGroupCard, { DispatchGroup } from '@/components/DispatchGroupCard';
import { GenericFilterModal, useFilterState, FilterConfig } from '@/components/filters';
import { getAutocompleteSelections, getStringValue, getNumberValue, isDateFilterValue } from '@/types/filter.types';

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
    label: 'Item Name',
    icon: '📦',
    autocompleteType: 'item',
    placeholder: 'Select item...',
    searchPlaceholder: 'Search items...',
    renderAsChips: true,
    multiSelect: false,
  },
  {
    type: 'autocomplete',
    key: 'grNo',
    label: 'GRN Number',
    icon: '📋',
    autocompleteType: 'grn',
    placeholder: 'Select GRN...',
    searchPlaceholder: 'Search GRN numbers...',
    renderAsChips: true,
    multiSelect: false,
  },
  {
    type: 'autocomplete',
    key: 'dispNo',
    label: 'Dispatch Number',
    icon: '🚚',
    autocompleteType: 'dispatch',
    placeholder: 'Select dispatch...',
    searchPlaceholder: 'Search dispatch numbers...',
    renderAsChips: true,
    multiSelect: false,
  },
  {
    type: 'date-range',
    key: ['dateFrom', 'dateTo'],
    label: 'Date Range',
    icon: '📅',
    placeholder: ['From date', 'To date'],
  },
  {
    type: 'number-range',
    key: ['dispQtyMin', 'dispQtyMax'],
    label: 'Dispatch Quantity',
    icon: '🔢',
    placeholder: ['Min qty', 'Max qty'],
    minValue: 0,
  },
];

const CustomerDispatches: React.FC = () => {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const insets = useSafeAreaInsets();

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
    title: 'Filter Dispatches',
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
      }
    } catch (error) {
      console.error('[CustomerDispatches] Exception:', error);
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
    // Helper to get immutable section key (YYYY-MM format)
    const getSectionKey = (date: Date): string => {
      const dispatchDate = new Date(date);
      const year = dispatchDate.getFullYear();
      const month = String(dispatchDate.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    };

    // Helper to convert section key to display label
    const getSectionDisplayLabel = (key: string): string => {
      const [year, month] = key.split('-').map(Number);
      const sectionDate = new Date(year, month - 1);
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const sectionStart = new Date(year, month - 1, 1);
      sectionStart.setHours(0, 0, 0, 0);

      const diffMs = today.getTime() - sectionStart.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let label = '';

      // Today (same month and year, within 1 day)
      if (sectionDate.getMonth() === today.getMonth() &&
          sectionDate.getFullYear() === today.getFullYear() &&
          diffDays <= 1) {
        label = 'Today';
      }
      // This Week (2-7 days ago, same month)
      else if (sectionDate.getMonth() === today.getMonth() &&
          sectionDate.getFullYear() === today.getFullYear() &&
          diffDays >= 2 && diffDays <= 7) {
        label = 'This Week';
      }
      // This Month (current month, older than 7 days)
      else if (sectionDate.getMonth() === today.getMonth() &&
          sectionDate.getFullYear() === today.getFullYear()) {
        label = 'This Month';
      }
      // Last Month
      else {
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        if (sectionDate.getMonth() === lastMonth.getMonth() &&
            sectionDate.getFullYear() === lastMonth.getFullYear()) {
          label = 'Last Month';
        } else {
          // Specific month and year (e.g., "March 2025")
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                             'July', 'August', 'September', 'October', 'November', 'December'];
          label = `${monthNames[month - 1]} ${year}`;
        }
      }

      return label;
    };

    // Group dispatches by immutable section key
    const sectionMap = new Map<string, DispatchWithItems[]>();

    dispatchGroups.forEach((dispatchGroup) => {
      const sectionKey = getSectionKey(new Date(dispatchGroup.dispatch.dispDate));

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, []);
      }

      sectionMap.get(sectionKey)!.push(dispatchGroup);
    });

    // Sort section keys by date (newest first)
    const sortedKeys = Array.from(sectionMap.keys()).sort().reverse();

    // Convert to sections array with display labels
    const sectionsArray: DispatchSection[] = sortedKeys.map(key => ({
      title: getSectionDisplayLabel(key),
      data: sectionMap.get(key)!,
    }));

    return sectionsArray;
  }, [dispatchGroups]);

  // Check if any filters are active (now provided by useFilterState hook)
  const hasActiveFilters = activeFilterCount > 0;

  // Get section icon and color (Material Design 3 approach)
  const getSectionStyle = (title: string) => {
    switch (title) {
      case 'Today':
        return {
          iconName: 'calendar-today',
          bgColor: '#F3E5F5',
          textColor: '#62109F',
          badgeColor: '#62109F'
        };
      case 'Yesterday':
        return {
          iconName: 'calendar-minus',
          bgColor: theme.colors.orange[50],
          textColor: theme.colors.orange[900],
          badgeColor: theme.colors.orange[700]
        };
      case 'This Week':
        return {
          iconName: 'calendar-week',
          bgColor: theme.colors.purple[50],
          textColor: theme.colors.purple[900],
          badgeColor: theme.colors.purple[700]
        };
      case 'Last Week':
        return {
          iconName: 'calendar-range',
          bgColor: theme.colors.indigo[50],
          textColor: theme.colors.indigo[900],
          badgeColor: theme.colors.indigo[700]
        };
      case 'This Month':
        return {
          iconName: 'calendar-month',
          bgColor: theme.colors.green[50],
          textColor: theme.colors.green[900],
          badgeColor: theme.colors.green[700]
        };
      case 'Last Month':
        return {
          iconName: 'calendar-arrow-left',
          bgColor: '#FFDEB9',
          textColor: '#8B4513',
          badgeColor: '#D2691E'
        };
      default:
        // For specific months like "March 2025"
        return {
          iconName: 'calendar-blank',
          bgColor: theme.colors.gray[100],
          textColor: theme.colors.gray[900],
          badgeColor: theme.colors.gray[700]
        };
    }
  };

  // Render section header with Material Design 3
  const renderSectionHeader = useCallback(({ section }: { section: DispatchSection }) => {
    const { iconName, bgColor, textColor, badgeColor } = getSectionStyle(section.title);
    const dispatchCount = section.data.length;

    return (
      <View style={[styles.sectionHeader, { backgroundColor: bgColor }]}>
        <Icon name={iconName} size={24} color={textColor} />
        <Text
          style={[styles.sectionHeaderText, { color: textColor }]}
          accessibilityRole="header"
          accessibilityLabel={`${section.title} section`}
        >
          {section.title.toUpperCase()}
        </Text>
        <View
          style={[styles.sectionCountBadge, { backgroundColor: badgeColor }]}
          accessible
          accessibilityLabel={`${dispatchCount} ${dispatchCount === 1 ? 'dispatch' : 'dispatches'}`}
        >
          <Text style={styles.sectionCountText}>
            {dispatchCount}
          </Text>
        </View>
      </View>
    );
  }, []);

  // Render dispatch group card
  const renderDispatchGroupCard = useCallback(({ item }: { item: DispatchWithItems }) => (
    <DispatchGroupCard
      dispatch={item.dispatch}
      items={item.items}
    />
  ), []);

  // Render empty state with Material Design 3
  const renderEmpty = () => {
    if (loading) return null;

    const hasFilters = hasActiveFilters;

    return (
      <View style={styles.emptyContainer} accessible accessibilityRole="text">
        <Icon
          name={hasFilters ? 'magnify' : 'package-variant'}
          size={80}
          color={theme.colors.gray[300]}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle}>
          {hasFilters ? 'No Matching Dispatches' : 'No Dispatch History'}
        </Text>
        <Text style={styles.emptySubtext}>
          {hasFilters
            ? 'Try adjusting your filters to see more results'
            : 'This customer has no dispatch history yet'}
        </Text>
        {hasFilters && (
          <TouchableOpacity
            style={styles.clearFiltersButton}
            onPress={clearFilter}
            accessibilityLabel="Clear all filters"
            accessibilityHint="Removes all active filters to show all dispatches"
            accessibilityRole="button"
          >
            <Icon name="filter-remove" size={20} color={theme.colors.white} />
            <Text style={styles.clearFiltersButtonText}>Clear All Filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render footer (loading more indicator)
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading more...</Text>
      </View>
    );
  };

  // Render applied filters with Material Design 3 Chips
  const renderAppliedFilters = () => {
    if (!hasActiveFilters) return null;

    return (
      <View style={styles.appliedFiltersContainer}>
        <View style={styles.appliedFiltersHeader}>
          <Text style={styles.appliedFiltersTitle}>
            Active Filters ({activeFilterCount})
          </Text>
          <TouchableOpacity
            onPress={clearFilter}
            accessibilityLabel="Clear all filters"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.appliedFiltersList}>
          {getAutocompleteSelections(filters.items).map((item) => (
            <View key={item.id} style={styles.filterChip}>
              <Text style={styles.filterChipText}>Item: {item.label}</Text>
              <TouchableOpacity
                onPress={() => {
                  const newItems = getAutocompleteSelections(filters.items).filter((i) => i.id !== item.id);
                  updateFilter('items', newItems);
                }}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                accessibilityLabel={`Remove ${item.label} filter`}
                accessibilityRole="button"
              >
                <Icon name="close" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          ))}
          {getAutocompleteSelections(filters.grNo).map((grn) => (
            <View key={grn.id} style={styles.filterChip}>
              <Text style={styles.filterChipText}>GRN: {grn.label}</Text>
              <TouchableOpacity
                onPress={() => {
                  const newGrns = getAutocompleteSelections(filters.grNo).filter((g) => g.id !== grn.id);
                  updateFilter('grNo', newGrns);
                }}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                accessibilityLabel={`Remove ${grn.label} filter`}
                accessibilityRole="button"
              >
                <Icon name="close" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          ))}
          {getAutocompleteSelections(filters.dispNo).map((dispatch) => (
            <View key={dispatch.id} style={styles.filterChip}>
              <Text style={styles.filterChipText}>Dispatch: {dispatch.label}</Text>
              <TouchableOpacity
                onPress={() => {
                  const newDispatches = getAutocompleteSelections(filters.dispNo).filter((d) => d.id !== dispatch.id);
                  updateFilter('dispNo', newDispatches);
                }}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                accessibilityLabel={`Remove ${dispatch.label} filter`}
                accessibilityRole="button"
              >
                <Icon name="close" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          ))}
          {(filters.dispQtyMin !== undefined || filters.dispQtyMax !== undefined) && (
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>
                Qty: {getNumberValue(filters.dispQtyMin) ?? '0'} - {getNumberValue(filters.dispQtyMax) ?? '∞'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  updateFilter('dispQtyMin', undefined);
                  updateFilter('dispQtyMax', undefined);
                }}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                accessibilityLabel="Remove quantity range filter"
                accessibilityRole="button"
              >
                <Icon name="close" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading dispatch history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Material Design 3 Header */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-left" size={24} color={theme.colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Dispatch History</Text>
          {customerName && <Text style={styles.subtitle}>{customerName}</Text>}
        </View>
        <TouchableOpacity
          onPress={() => setShowFilterModal(true)}
          style={styles.filterButton}
          accessibilityLabel="Open filters"
          accessibilityHint="Filter dispatches by item, GRN, or date"
          accessibilityRole="button"
        >
          <Icon name="filter-variant" size={24} color={theme.colors.white} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
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
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.gray[50],
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[600],
  },
  // Material Design 3 Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
    ...theme.shadows.sm,
  },
  backButton: {
    padding: theme.spacing.sm,
    marginRight: theme.spacing.xs,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
    marginTop: 2,
  },
  filterButton: {
    backgroundColor: theme.colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...theme.shadows.md,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: theme.colors.red[600],
    borderRadius: theme.borderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  appliedFiltersContainer: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[100],
  },
  appliedFiltersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  appliedFiltersTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[600],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearAllText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.primary,
  },
  appliedFiltersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Material Design 3 Chip styles
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  filterChipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
  },
  // Material Design 3 Section Header styles
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 20,
    gap: 12,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    marginHorizontal: 0,
    width: '100%',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    // Android elevation
    elevation: 10,
    // Ensure proper z-index for stacking
    zIndex: 10,
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
  },
  sectionCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    minWidth: 32,
    alignItems: 'center',
  },
  sectionCountText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  // Material Design 3 Empty State styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyIcon: {
    marginBottom: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[500],
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.lg,
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.md,
  },
  clearFiltersButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.white,
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
});

export default CustomerDispatches;
