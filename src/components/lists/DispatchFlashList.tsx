/**
 * DispatchFlashList - FlashList Implementation (2025 Best Practices)
 *
 * IMPORTANT: This component is built from scratch following FlashList best practices.
 * Do NOT copy patterns from DispatchListFiori.tsx.
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
 * @module lists/DispatchFlashList
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, LayoutAnimation } from 'react-native';

import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ActivityIndicator, Badge, IconButton, Portal, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ListSkeleton } from '@/components/skeletons';

// Types and utilities
import {
  FlattenedItem,
  flattenSections,
  getItemType,
  DEFAULT_LIST_CONFIG,
  SectionData,
} from './types';

// Services
import {
  getDispatchListWithItems,
  getAssignedCustomerDispatchList,
  Dispatch,
} from '@/services/dispatch-service';

import { getAutocompleteSelections, getStringValue, AutocompleteSelection } from '@/types/filter.types';

// Local type for Redux filter state (camelCase as defined in DISPATCH_FILTER_CONFIG)
interface ReduxDispatchFilters {
  customerName?: AutocompleteSelection[];
  dispNoFrom?: AutocompleteSelection[];
  dispNoTo?: AutocompleteSelection[];
  itemName?: AutocompleteSelection[];
  weightMin?: number;
  weightMax?: number;
  packageMark?: string;
}

// Components
import { MemoizedDispatchItem } from '@/components/list-items';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { Avatar } from '@/components/ui/Avatar';
import { formatCount, formatNumber, formatWeight } from '@/utils/formatters';
import { GenericFilterModal } from '@/components/filters';

// State
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { selectFilterValues, clearFilter, setFilterValues } from '@/store/slices/filterSlice';

// Config
import { DISPATCH_FILTER_CONFIG } from '@/config/filterConfigs';
import { formatSectionDate } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';

// Theme
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { FAB_CLEARANCE } from '@/components/ui/Fab';
import { SortBar, type SortOption } from '@/components/list/SortBar';
// ============================================================================
// TYPES
// ============================================================================

export interface DispatchFlashListProps {
  /** Optional customer ID to filter dispatches */
  customerId?: string;
}

type SortField = 'dispNo' | 'dispDate';
type SortOrder = 'asc' | 'desc';

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
      accessibilityLabel={`${title}, ${formatCount(count, 'dispatch', 'dispatches')}`}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionCount} maxFontSizeMultiplier={1.6}>{count}</Text>
      </View>
    </View>
  );
});

SectionHeader.displayName = 'SectionHeader';

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  canCreate: boolean;
  onCreateDispatch: () => void;
}

// Empty state: the shared ListEmptyState with the dispatch wording (style guide §13.6)
const EmptyState = React.memo<EmptyStateProps>(({
  hasFilters,
  onClearFilters,
  canCreate,
  onCreateDispatch,
}) => (
  <ListEmptyState
    activeFilterCount={hasFilters ? 1 : 0}
    emptyIcon="truck-delivery-outline"
    emptyTitle="No dispatches yet"
    emptySubtitle={canCreate ? 'Dispatches you create appear here.' : 'Dispatches appear here once they are created.'}
    filteredTitle="No dispatches match these filters"
    filteredSubtitle="Try fewer filters, or clear them to see all dispatches."
    onClearFilters={onClearFilters}
    showCreateButton={canCreate}
    createButtonLabel="Create dispatch"
    onCreatePress={onCreateDispatch}
  />
));

EmptyState.displayName = 'EmptyState';

// ============================================================================
// FILTER CHIPS COMPONENT
// ============================================================================

interface FilterChipsProps {
  filters: ReduxDispatchFilters;
  activeFilterCount: number;
  updateFilter: (key: string, value: AutocompleteSelection[] | string | number | undefined) => void;
  clearAllFilters: () => void;
}

const FilterChips: React.FC<FilterChipsProps> = memo(({
  filters,
  activeFilterCount,
  updateFilter,
  clearAllFilters,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  if (activeFilterCount === 0) return null;

  const chips: { key: string; label: string; icon: string; onRemove: () => void }[] = [];

  // Item chips
  if (filters.itemName && filters.itemName.length > 0) {
    filters.itemName.forEach((item: AutocompleteSelection) => {
      chips.push({
        key: `item-${item.id}`,
        label: item.label,
        icon: 'cube-outline',
        onRemove: () => {
          const remaining = (filters.itemName ?? []).filter((i: AutocompleteSelection) => i.id !== item.id);
          updateFilter('itemName', remaining.length > 0 ? remaining : []);
        },
      });
    });
  }

  // Customer chips
  if (filters.customerName && filters.customerName.length > 0) {
    filters.customerName.forEach((item: AutocompleteSelection) => {
      chips.push({
        key: `customer-${item.id}`,
        label: item.label,
        icon: 'account-outline',
        onRemove: () => {
          const remaining = (filters.customerName ?? []).filter((i: AutocompleteSelection) => i.id !== item.id);
          updateFilter('customerName', remaining.length > 0 ? remaining : []);
        },
      });
    });
  }

  // Dispatch number range chips
  if (filters.dispNoFrom && filters.dispNoFrom.length > 0) {
    chips.push({
      key: 'disp-from',
      label: `From ${filters.dispNoFrom[0].label}`,
      icon: 'file-document-outline',
      onRemove: () => updateFilter('dispNoFrom', []),
    });
  }
  if (filters.dispNoTo && filters.dispNoTo.length > 0) {
    chips.push({
      key: 'disp-to',
      label: `To ${filters.dispNoTo[0].label}`,
      icon: 'file-document-outline',
      onRemove: () => updateFilter('dispNoTo', []),
    });
  }

  // Weight range chip
  if (filters.weightMin || filters.weightMax) {
    const min = formatNumber(Number(filters.weightMin || 0));
    chips.push({
      key: 'weight-range',
      label: filters.weightMax
        ? `${min} – ${formatWeight(Number(filters.weightMax))}`
        : `${min} kg or more`,
      icon: 'weight-kilogram',
      onRemove: () => {
        updateFilter('weightMin', undefined);
        updateFilter('weightMax', undefined);
      },
    });
  }

  // Package mark chip
  if (filters.packageMark) {
    chips.push({
      key: 'package-mark',
      label: filters.packageMark,
      icon: 'tag-outline',
      onRemove: () => updateFilter('packageMark', ''),
    });
  }

  return (
    <Animated.View entering={FadeIn} style={styles.filterChipsContainer}>
      <View style={styles.filterChipsHeader}>
        <View style={styles.filterCountBadge}>
          <Icon name="filter-variant" size={iconSize.sm} color={t.brand.tint} />
          <Text style={styles.filterCountText}>
            {formatCount(activeFilterCount, 'filter')}
          </Text>
        </View>
        <Pressable
          onPress={clearAllFilters}
          style={styles.clearAllButton}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
        >
          <Text style={styles.clearAllText}>Clear all</Text>
        </Pressable>
      </View>
      <View style={styles.filterChipsList}>
        {chips.map((chip) => (
          <Pressable
            key={chip.key}
            onPress={chip.onRemove}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Remove filter ${chip.label}`}
          >
            <Icon name={chip.icon} size={iconSize.sm} color={t.brand.tint} />
            <Text style={styles.filterChipText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {chip.label}
            </Text>
            <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
});

FilterChips.displayName = 'FilterChips';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DispatchFlashList: React.FC<DispatchFlashListProps> = ({ customerId }) => {
  const reduxDispatch = useAppDispatch();
  const fetchInProgressRef = useRef(false);
  const listRef = useRef<FlashListRef<FlattenedItem<Dispatch>>>(null);

  // Theme
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // User state & permissions
  const { userProfile } = useAppSelector(state => state.auth);
  const { canCreate, canUpdate } = usePermissions();
  const { canManageOrders: isWarehouseRole, assignedCustomerIds } = useRoleBasedAccess();
  const canPrint = canCreate || canUpdate; // Staff can print (they have update permission)
  const canCreateDispatch = canCreate;

  // List state
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // E3 Fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // E7 Fix: Track request ID to discard stale pagination responses
  const requestIdRef = useRef(0);

  // Sort & Filter state
  const [sortField, setSortField] = useState<SortField>('dispDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // Expand all state
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandKey, setExpandKey] = useState(0);

  // Get filters from Redux (camelCase as defined in DISPATCH_FILTER_CONFIG)
  const filters = useAppSelector(state =>
    selectFilterValues(state, DISPATCH_FILTER_CONFIG.persistKey)
  ) as ReduxDispatchFilters;

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    return Object.values(filters || {}).filter(val => {
      if (Array.isArray(val)) return val.length > 0;
      if (typeof val === 'string') return val.length > 0;
      return false;
    }).length;
  }, [filters]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchDispatches = useCallback(async (offset: number = 0, append: boolean = false) => {
    if (fetchInProgressRef.current && offset === 0 && !append) {
      return;
    }

    // E7 Fix: Increment request ID to track this request
    const currentRequestId = ++requestIdRef.current;

    try {
      if (offset === 0 && !append) {
        fetchInProgressRef.current = true;
        setIsLoading(true);
        setError(null);
      } else if (append) {
        setIsLoadingMore(true);
      }

      // Debug: Log raw filter values from Redux
      if (__DEV__) {
        console.log('[DispatchFlashList] 🔍 Raw filters from Redux:', JSON.stringify(filters, null, 2));
        console.log('[DispatchFlashList] 🔍 dispNoFrom raw:', filters?.dispNoFrom);
        console.log('[DispatchFlashList] 🔍 dispNoTo raw:', filters?.dispNoTo);
      }

      // Extract dispatch number range from autocomplete selections
      // dispNoFrom/dispNoTo are autocomplete fields storing AutocompleteSelection[]
      const dispNoFromSelections = getAutocompleteSelections(filters?.dispNoFrom);
      const dispNoToSelections = getAutocompleteSelections(filters?.dispNoTo);
      const dispNoFromValue = dispNoFromSelections.length > 0 ? dispNoFromSelections[0].label : undefined;
      const dispNoToValue = dispNoToSelections.length > 0 ? dispNoToSelections[0].label : undefined;

      // Extract customer and item IDs from autocomplete selections (multi-select)
      const customerSelections = getAutocompleteSelections(filters?.customerName);
      const itemSelections = getAutocompleteSelections(filters?.itemName);

      // Build API filters - pass IDs for customer/item filters (similar to GRN pattern)
      const apiFilters: Record<string, unknown> = {};

      // Customer filter: pass customer IDs for filtering
      if (customerSelections.length > 0) {
        apiFilters.customer_ids = customerSelections.map(c => c.id);
      }

      // Item filter: pass item IDs for filtering dispatches containing these items
      if (itemSelections.length > 0) {
        apiFilters.item_ids = itemSelections.map(i => i.id);
      }

      // Dispatch number range
      if (dispNoFromValue) {
        apiFilters.disp_no_from = dispNoFromValue;
      }
      if (dispNoToValue) {
        apiFilters.disp_no_to = dispNoToValue;
      }

      if (__DEV__) {
        console.log('[DispatchFlashList] 🔍 Extracted dispNoFrom:', dispNoFromValue);
        console.log('[DispatchFlashList] 🔍 Extracted dispNoTo:', dispNoToValue);
        console.log('[DispatchFlashList] 🔍 Customer IDs:', customerSelections.map(c => c.id));
        console.log('[DispatchFlashList] 🔍 Item IDs:', itemSelections.map(i => i.id));
        console.log('[DispatchFlashList] 🔍 API filters being sent:', JSON.stringify(apiFilters, null, 2));
      }

      const request = {
        p_sort_by: sortField === 'dispNo' ? ('disp_no' as const) : ('dispatch_date' as const),
        p_sort_order: sortOrder,
        p_limit: 20,
        offset: offset,
        p_filters: apiFilters,
      };
      // The all-customers list is for warehouse roles; customer accounts read
      // their assigned customers' dispatches.
      const response = isWarehouseRole
        ? await getDispatchListWithItems({ ...request, p_customer_id: customerId })
        : await getAssignedCustomerDispatchList(
            customerId ? [customerId] : assignedCustomerIds,
            request
          );

      // E3 Fix: Skip state updates if component unmounted during fetch
      if (!isMountedRef.current) {
        return;
      }

      // E7 Fix: Discard stale response if a newer request was made
      if (currentRequestId !== requestIdRef.current) {
        if (__DEV__) console.log('[DispatchFlashList] Discarding stale response', { currentRequestId, latestRequestId: requestIdRef.current });
        return;
      }

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dispatches');
      }

      const { dispatches: newDispatches, pagination } = response.data;

      if (__DEV__) console.log('[DispatchFlashList] Pagination response:', {
        newDispatchesCount: newDispatches.length,
        pagination,
        currentOffset: offset,
        nextOffset: offset + newDispatches.length,
      });

      if (append) {
        setDispatches(prev => {
          const existingIds = new Set(prev.map(d => d.dispatch_id || d.id));
          const uniqueNew = newDispatches.filter(
            (d: Dispatch) => !existingIds.has(d.dispatch_id || d.id)
          );
          return [...prev, ...uniqueNew];
        });
      } else {
        setDispatches(newDispatches);
      }

      setHasMore(pagination.has_more);
      setCurrentOffset(offset + newDispatches.length);
    } catch (err: unknown) {
      // E3 Fix: Skip state updates if component unmounted
      if (!isMountedRef.current) {
        return;
      }
      console.error('[DispatchFlashList] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dispatches';
      setError(errorMessage);
      setSnackbarMessage(append
        ? "Couldn't load more dispatches. Scroll down to try again."
        : "Couldn't load dispatches. Check your connection and try again.");
      setSnackbarVisible(true);
    } finally {
      fetchInProgressRef.current = false;
      // E3 Fix: Only update state if still mounted
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [customerId, sortField, sortOrder, filters, isWarehouseRole, assignedCustomerIds]);

  // E3 Fix: Cleanup on unmount to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Track focus count to skip refetch on initial mount
  const focusCountRef = useRef(0);

  // Initial load
  useEffect(() => {
    setCurrentOffset(0);
    fetchDispatches(0, false);
  }, [sortField, sortOrder, filters]);

  // Refetch on focus (e.g., returning from edit screen)
  // Skip the first focus (initial mount) to avoid double-fetch
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;
      // Only refetch on subsequent focuses (not initial mount)
      if (focusCountRef.current > 1) {
        fetchInProgressRef.current = false;
        setCurrentOffset(0);
        fetchDispatches(0, false);
      }
    }, [fetchDispatches])
  );

  // ============================================================================
  // STABLE CALLBACKS (defined outside renderItem)
  // ============================================================================

  const handleRefresh = useCallback(() => {
    fetchInProgressRef.current = false;
    setIsRefreshing(true);
    setCurrentOffset(0);
    fetchDispatches(0, false);
  }, [fetchDispatches]);

  const handleLoadMore = useCallback(() => {
    if (__DEV__) console.log('[DispatchFlashList] handleLoadMore called:', {
      isLoadingMore,
      hasMore,
      isLoading,
      currentOffset,
      willFetch: !isLoadingMore && hasMore && !isLoading,
    });
    if (!isLoadingMore && hasMore && !isLoading) {
      fetchDispatches(currentOffset, true);
    }
  }, [isLoadingMore, hasMore, isLoading, currentOffset, fetchDispatches]);

  const handleDispatchPress = useCallback((dispatch: Dispatch) => {
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  }, []);

  const handleCreateDispatch = useCallback(() => {
    router.push('/dispatch-form/step1');
  }, []);

  const handleClearFilters = useCallback(() => {
    reduxDispatch(clearFilter({ key: DISPATCH_FILTER_CONFIG.persistKey }));
  }, [reduxDispatch]);

  // Update a single filter value in Redux
  const updateFilter = useCallback((key: string, value: AutocompleteSelection[] | string | number | undefined) => {
    const currentFilters = filters || {};
    const updatedFilters = { ...currentFilters, [key]: value };
    reduxDispatch(setFilterValues({
      key: DISPATCH_FILTER_CONFIG.persistKey,
      values: updatedFilters,
    }));
  }, [reduxDispatch, filters]);

  const openFilterModal = useCallback(() => {
    const logger = createLogger('DispatchFlashList');
    logger.info(`[FILTER_BUTTON_CLICKED] Opening filter modal`);
    setIsFilterModalVisible(true);
  }, []);

  const closeFilterModal = useCallback(() => {
    const logger = createLogger('DispatchFlashList');
    logger.info(`[CLOSE_FILTER_MODAL] Closing filter modal`);
    setIsFilterModalVisible(false);
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  // A new sort starts from its first row, wherever the list was scrolled to.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sortField, sortOrder]);

  const toggleSortField = useCallback(() => {
    setSortField(prev => prev === 'dispDate' ? 'dispNo' : 'dispDate');
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  }, []);

  // Toggle expand/collapse all cards
  const handleToggleAllExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAllExpanded(prev => !prev);
    setExpandKey(prev => prev + 1);
  }, []);

  // ============================================================================
  // FLATTENED DATA (for FlashList)
  // ============================================================================

  const flattenedData = useMemo((): FlattenedItem<Dispatch>[] => {
    if (dispatches.length === 0) return [];

    // Sorted by number: a flat list in the order the rows arrived. Date sections
    // would pull same-day dispatches together and break the number order.
    if (sortField === 'dispNo') {
      return dispatches.map(dispatch => ({
        type: 'card' as const,
        data: dispatch,
        key: dispatch.dispatch_id || dispatch.id,
      }));
    }

    // Group by date for section headers
    const groups: Record<string, Dispatch[]> = {};
    dispatches.forEach(dispatch => {
      const dateKey = formatSectionDate(dispatch.disp_date);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(dispatch);
    });

    const sections: SectionData<Dispatch>[] = Object.entries(groups).map(([title, data]) => ({
      title,
      data,
    }));

    return flattenSections(sections, (dispatch) => dispatch.dispatch_id || dispatch.id);
  }, [dispatches, sortField]);

  // ============================================================================
  // FLASHLIST KEY EXTRACTOR (stable, not inline)
  // ============================================================================

  const keyExtractor = useCallback((item: FlattenedItem<Dispatch>) => item.key, []);

  // ============================================================================
  // FLASHLIST RENDER ITEM (memoized, no inline functions)
  // ============================================================================

  const renderItem = useCallback(({ item }: { item: FlattenedItem<Dispatch> }) => {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} />;
    }

    return (
      <MemoizedDispatchItem
        dispatch={item.data}
        onPress={handleDispatchPress}
        canPrint={canPrint || false}
        globalExpanded={allExpanded}
        globalExpandedKey={expandKey}
      />
    );
  }, [handleDispatchPress, canPrint, allExpanded, expandKey]);

  // ============================================================================
  // LIST FOOTER
  // ============================================================================

  const ListFooter = useMemo(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>Loading more dispatches…</Text>
      </View>
    );
  }, [isLoadingMore, styles, t]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const userName = userProfile?.name || 'U';

  const filterButton = (
    <View style={styles.filterBtnContainer}>
      <IconButton
        icon="filter-variant"
        size={iconSize.lg}
        iconColor={activeFilterCount > 0 ? t.brand.tint : t.icon.primary}
        style={styles.iconButton}
        onPress={openFilterModal}
        accessibilityLabel={activeFilterCount > 0 ? `Filter dispatches, ${activeFilterCount} active` : 'Filter dispatches'}
      />
      {activeFilterCount > 0 && (
        <Badge size={18} style={styles.filterBadge} accessible={false}>{activeFilterCount}</Badge>
      )}
    </View>
  );

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Dispatches</Text>
        </View>
        <ListSkeleton count={5} metricsCount={3} />
      </View>
    );
  }

  // E1 Fix: Error state with retry button
  if (error && dispatches.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Dispatches</Text>
        </View>
        <ErrorStateView
          presentation="inline"
          title="Couldn't load dispatches"
          message="Check your connection and try again."
          onRetry={handleRefresh}
        />
      </View>
    );
  }

  // Empty state
  if (!isLoading && dispatches.length === 0 && !error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Dispatches</Text>
          <View style={styles.headerActions}>{filterButton}</View>
        </View>
        <EmptyState
          hasFilters={activeFilterCount > 0}
          onClearFilters={handleClearFilters}
          canCreate={canCreateDispatch}
          onCreateDispatch={handleCreateDispatch}
        />
        <Portal>
          <GenericFilterModal
            visible={isFilterModalVisible}
            onClose={closeFilterModal}
            config={DISPATCH_FILTER_CONFIG}
          />
        </Portal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">Dispatches</Text>
        <View style={styles.headerActions}>
          {filterButton}
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

      {/* Sort bar (guide §14.5) */}
      <SortBar
        options={DISPATCH_SORT_OPTIONS}
        field={sortField}
        order={sortOrder}
        onFieldChange={field => { if (field !== sortField) toggleSortField(); }}
        onOrderToggle={toggleSortOrder}
        expanded={allExpanded}
        onExpandToggle={handleToggleAllExpanded}
        itemsLabel="dispatches"
      />

      {/* Filter Chips */}
      <FilterChips
        filters={filters}
        activeFilterCount={activeFilterCount}
        updateFilter={updateFilter}
        clearAllFilters={handleClearFilters}
      />

      {/* FlashList - The key to performance */}
      <FlashList
        ref={listRef}
        data={flattenedData}
        // Re-sorted lists must not stay anchored on the row that was on top before.
        maintainVisibleContentPosition={{ disabled: true }}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={{ canPrint, handleDispatchPress, allExpanded, expandKey }}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={DEFAULT_LIST_CONFIG.onEndReachedThreshold}
        ListFooterComponent={ListFooter}
        showsVerticalScrollIndicator={false}
      />

      {/* Filter Modal - Only render Portal when visible to prevent Android gesture handler issues */}
      {isFilterModalVisible && (
        <Portal>
          <GenericFilterModal
            visible={isFilterModalVisible}
            onClose={closeFilterModal}
            config={DISPATCH_FILTER_CONFIG}
          />
        </Portal>
      )}

      {/* Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={dismissSnackbar}
        duration={4000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

// ============================================================================
// STYLES - tokens only (docs/STYLE_GUIDE.md)
// ============================================================================

const DISPATCH_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: 'dispDate', label: 'Date', a11y: 'date', icon: 'calendar-outline', kind: 'date' },
  { field: 'dispNo', label: 'Number', a11y: 'number', icon: 'pound', kind: 'number' },
];

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
    paddingVertical: space.sm,
    minHeight: layout.rowMinHeight,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerTitle: {
    // Top-level tab title (guide §13.8): large title on every tab.
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
  // Create action: brand.fill circle, kept at the minimum touch size
  addBtn: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    margin: 0,
    marginRight: space.xs,
  },
  filterBtnContainer: {
    position: 'relative' as const,
  },
  // Plain count badge (active filters): brand.fill with brand.onFill. "Needs action"
  // counts use destructive.fill with destructive.onFill instead (§13.5).
  filterBadge: {
    position: 'absolute' as const,
    top: space.xxs,
    right: space.xxs,
    backgroundColor: t.brand.fill,
    color: t.brand.onFill,
  },
  avatarButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Sort toolbar with a hairline separator
  // Applied filters bar (§13.5)
  filterChipsContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  filterChipsHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: space.sm,
  },
  filterCountBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
  },
  filterCountText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  clearAllButton: {
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    paddingHorizontal: space.sm,
  },
  clearAllText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  filterChipsList: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    maxWidth: '100%' as const,
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
    flexShrink: 1,
  },
  listContent: {
    paddingTop: space.sm,
    // Room for the floating create button on the tab screen
    paddingBottom: FAB_CLEARANCE,
  },
  // Section header: footnote, capitals, text.secondary, letter spacing 0.5 (§4, §13.6)
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.background.base,
  },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
  },
  // Plain count badge: brand.fill with brand.onFill (§13.5)
  sectionBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    backgroundColor: t.brand.fill,
  },
  sectionCount: {
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

export default DispatchFlashList;
