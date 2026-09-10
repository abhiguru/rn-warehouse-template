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
 * @module lists/DispatchFlashList
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, LayoutAnimation, Vibration, Platform, UIManager } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Badge, IconButton, Portal, Snackbar, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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
import { GenericFilterModal } from '@/components/filters';

// State
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { selectFilterValues, clearFilter, setFilterValues } from '@/store/slices/filterSlice';

// Config
import { DISPATCH_FILTER_CONFIG } from '@/config/filterConfigs';
import { useListColors, ListColors } from '@/hooks/useListColors';
import { formatSectionDate } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';

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
  colors: ListColors;
}

const SectionHeader = React.memo<SectionHeaderProps>(({ title, count, colors }) => (
  <View style={[styles.sectionHeader, { backgroundColor: colors.gray50 }]}>
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
    <View style={[styles.sectionBadge, { backgroundColor: colors.gray200 }]}>
      <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  </View>
));

SectionHeader.displayName = 'SectionHeader';

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  canCreate: boolean;
  onCreateDispatch: () => void;
  colors: ListColors;
}

const EmptyState = React.memo<EmptyStateProps>(({
  hasFilters,
  onClearFilters,
  canCreate,
  onCreateDispatch,
  colors,
}) => (
  <View style={styles.emptyContainer}>
    <View style={[styles.emptyIconSurface, { backgroundColor: colors.gray100 }]}>
      <Icon name="truck-delivery" size={48} color={colors.textTertiary} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Dispatches Found</Text>
    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
      {hasFilters
        ? 'Try adjusting your filters to see more results.'
        : 'Start by creating your first dispatch.'}
    </Text>
    {hasFilters && (
      <Pressable style={[styles.emptyButton, { borderColor: colors.gray300 }]} onPress={onClearFilters}>
        <Text style={[styles.emptyButtonText, { color: colors.textPrimary }]}>Clear Filters</Text>
      </Pressable>
    )}
    {canCreate && !hasFilters && (
      <Pressable style={[styles.emptyButton, styles.emptyButtonPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={onCreateDispatch}>
        <Text style={[styles.emptyButtonTextPrimary, { color: colors.white }]}>Create Dispatch</Text>
      </Pressable>
    )}
  </View>
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
  colors: ListColors;
}

const FilterChips: React.FC<FilterChipsProps> = memo(({
  filters,
  activeFilterCount,
  updateFilter,
  clearAllFilters,
  colors,
}) => {
  if (activeFilterCount === 0) return null;

  const chips: { key: string; label: string; icon: string; onRemove: () => void }[] = [];

  // Item chips
  if (filters.itemName && filters.itemName.length > 0) {
    filters.itemName.forEach((item: AutocompleteSelection) => {
      chips.push({
        key: `item-${item.id}`,
        label: item.label,
        icon: 'package-variant',
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
        icon: 'account',
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
      label: `From: ${filters.dispNoFrom[0].label}`,
      icon: 'file-document',
      onRemove: () => updateFilter('dispNoFrom', []),
    });
  }
  if (filters.dispNoTo && filters.dispNoTo.length > 0) {
    chips.push({
      key: 'disp-to',
      label: `To: ${filters.dispNoTo[0].label}`,
      icon: 'file-document',
      onRemove: () => updateFilter('dispNoTo', []),
    });
  }

  // Weight range chip
  if (filters.weightMin || filters.weightMax) {
    chips.push({
      key: 'weight-range',
      label: `${filters.weightMin || 0} - ${filters.weightMax || '∞'} kg`,
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
      icon: 'tag',
      onRemove: () => updateFilter('packageMark', ''),
    });
  }

  return (
    <Animated.View entering={FadeIn} style={[styles.filterChipsContainer, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
      <View style={styles.filterChipsHeader}>
        <View style={styles.filterCountBadge}>
          <Icon name="filter-variant" size={14} color={colors.primary} />
          <Text style={[styles.filterCountText, { color: colors.primary }]}>{activeFilterCount} active</Text>
        </View>
        <Pressable onPress={clearAllFilters} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.clearAllText, { color: colors.error }]}>Clear all</Text>
        </Pressable>
      </View>
      <View style={styles.filterChipsList}>
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            icon={chip.icon}
            onClose={chip.onRemove}
            style={[styles.filterChip, { backgroundColor: colors.primaryLight }]}
            textStyle={[styles.filterChipText, { color: colors.textSecondary }]}
            closeIcon="close-circle"
            compact
          >
            {chip.label}
          </Chip>
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

  // Dynamic colors for dark mode support
  const colors = useListColors();

  // User state & permissions
  const { userProfile } = useAppSelector(state => state.auth);
  const { canCreate, canUpdate } = usePermissions();
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

      const response = await getDispatchListWithItems({
        p_customer_id: customerId,
        p_sort_by: sortField === 'dispNo' ? 'disp_no' : 'dispatch_date',
        p_sort_order: sortOrder,
        p_limit: 20,
        offset: offset,
        p_filters: apiFilters,
      });

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
      setSnackbarMessage(errorMessage);
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
  }, [customerId, sortField, sortOrder, filters]);

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

  const toggleSortField = useCallback(() => {
    setSortField(prev => prev === 'dispDate' ? 'dispNo' : 'dispDate');
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  }, []);

  // Toggle expand/collapse all cards
  const handleToggleAllExpanded = useCallback(() => {
    Vibration.vibrate(5);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAllExpanded(prev => !prev);
    setExpandKey(prev => prev + 1);
  }, []);

  // ============================================================================
  // FLATTENED DATA (for FlashList)
  // ============================================================================

  const flattenedData = useMemo((): FlattenedItem<Dispatch>[] => {
    if (dispatches.length === 0) return [];

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
  }, [dispatches]);

  // ============================================================================
  // FLASHLIST KEY EXTRACTOR (stable, not inline)
  // ============================================================================

  const keyExtractor = useCallback((item: FlattenedItem<Dispatch>) => item.key, []);

  // ============================================================================
  // FLASHLIST RENDER ITEM (memoized, no inline functions)
  // ============================================================================

  const renderItem = useCallback(({ item }: { item: FlattenedItem<Dispatch> }) => {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} colors={colors} />;
    }

    return (
      <MemoizedDispatchItem
        dispatch={item.data}
        onPress={handleDispatchPress}
        canPrint={canPrint || false}
        colors={colors}
        globalExpanded={allExpanded}
        globalExpandedKey={expandKey}
      />
    );
  }, [handleDispatchPress, canPrint, colors, allExpanded, expandKey]);

  // ============================================================================
  // LIST FOOTER
  // ============================================================================

  const ListFooter = useMemo(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerLoaderText, { color: colors.textSecondary }]}>Loading more...</Text>
      </View>
    );
  }, [isLoadingMore, colors]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dispatches</Text>
        </View>
        <ListSkeleton count={5} metricsCount={3} />
      </View>
    );
  }

  // E1 Fix: Error state with retry button
  if (error && dispatches.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dispatches</Text>
        </View>
        <View style={styles.errorState}>
          <Icon name="alert-circle-outline" size={48} color={colors.gray400} />
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Unable to load dispatches</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{error}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
            <Icon name="refresh" size={18} color={colors.white} />
            <Text style={[styles.retryButtonText, { color: colors.white }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Empty state
  if (!isLoading && dispatches.length === 0 && !error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dispatches</Text>
          <View style={styles.headerActions}>
            <View style={styles.filterBtnContainer}>
              <IconButton
                icon="filter-variant"
                size={24}
                onPress={openFilterModal}
              />
              {activeFilterCount > 0 && (
                <Badge size={18} style={[styles.filterBadge, { backgroundColor: colors.primary }]}>{activeFilterCount}</Badge>
              )}
            </View>
          </View>
        </View>
        <EmptyState
          hasFilters={activeFilterCount > 0}
          onClearFilters={handleClearFilters}
          canCreate={canCreateDispatch}
          onCreateDispatch={handleCreateDispatch}
          colors={colors}
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
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dispatches</Text>
        <View style={styles.headerActions}>
          {canCreateDispatch && (
            <IconButton
              icon="plus"
              size={22}
              iconColor={colors.textInverse}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreateDispatch}
            />
          )}
          <View style={styles.filterBtnContainer}>
            <IconButton
              icon="filter-variant"
              size={24}
              onPress={openFilterModal}
            />
            {activeFilterCount > 0 && (
              <Badge size={18} style={[styles.filterBadge, { backgroundColor: colors.primary }]}>{activeFilterCount}</Badge>
            )}
          </View>
          <Pressable onPress={() => router.push('/settings')} style={styles.profileButton}>
            <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
              <Text style={[styles.profileAvatarText, { color: colors.white }]}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Sort Toggle Bar */}
      <View style={[styles.sortBar, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
        <Text style={[styles.sortLabel, { color: colors.textTertiary }]}>Sort by:</Text>
        <Pressable
          style={[
            styles.sortChip,
            { backgroundColor: colors.gray100 },
            sortField === 'dispDate' && { backgroundColor: colors.primary },
          ]}
          onPress={toggleSortField}
        >
          <Icon
            name="calendar"
            size={14}
            color={sortField === 'dispDate' ? colors.white : colors.textSecondary}
          />
          <Text
            style={[
              styles.sortChipText,
              { color: colors.textSecondary },
              sortField === 'dispDate' && { color: colors.white },
            ]}
          >
            Date
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.sortChip,
            { backgroundColor: colors.gray100 },
            sortField === 'dispNo' && { backgroundColor: colors.primary },
          ]}
          onPress={toggleSortField}
        >
          <Icon
            name="pound"
            size={14}
            color={sortField === 'dispNo' ? colors.white : colors.textSecondary}
          />
          <Text
            style={[
              styles.sortChipText,
              { color: colors.textSecondary },
              sortField === 'dispNo' && { color: colors.white },
            ]}
          >
            Number
          </Text>
        </Pressable>
        <Pressable style={styles.sortOrderBtn} onPress={toggleSortOrder}>
          <Icon
            name={sortOrder === 'desc' ? 'sort-descending' : 'sort-ascending'}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
        {/* Expand All / Collapse All Toggle */}
        <Pressable
          style={[styles.expandAllBtn, { backgroundColor: colors.gray100 }]}
          onPress={handleToggleAllExpanded}
        >
          <Icon
            name={allExpanded ? 'unfold-less-horizontal' : 'unfold-more-horizontal'}
            size={18}
            color={colors.textSecondary}
          />
          <Text style={[styles.expandAllText, { color: colors.textSecondary }]}>
            {allExpanded ? 'Collapse' : 'Expand'}
          </Text>
        </Pressable>
      </View>

      {/* Filter Chips */}
      <FilterChips
        filters={filters}
        activeFilterCount={activeFilterCount}
        updateFilter={updateFilter}
        clearAllFilters={handleClearFilters}
        colors={colors}
      />

      {/* FlashList - The key to performance */}
      <FlashList
        data={flattenedData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={{ canPrint, handleDispatchPress, allExpanded, expandKey }}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
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
        duration={3000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor applied inline for dark mode
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    // backgroundColor, borderBottomColor applied inline for dark mode
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    // color applied inline for dark mode
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addBtn: {
    borderRadius: 20,
    marginRight: 8,
    // backgroundColor applied inline for dark mode
  },
  filterBtnContainer: {
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    // backgroundColor applied inline for dark mode
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
    // backgroundColor, borderBottomColor applied inline for dark mode
  },
  sortLabel: {
    fontSize: 13,
    marginRight: 4,
    // color applied inline for dark mode
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
    // backgroundColor applied inline for dark mode
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: '500',
    // color applied inline for dark mode
  },
  sortOrderBtn: {
    padding: 4,
  },
  // Expand All Toggle Button
  expandAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    marginLeft: 'auto',
    // backgroundColor: applied inline
  },
  expandAllText: {
    fontSize: 13,
    fontWeight: '500',
    // color: applied inline
  },
  // Filter chips styles
  filterChipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  filterChipsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterCountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 13,
  },
  listContent: {
    paddingVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    // backgroundColor applied inline for dark mode
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    // color applied inline for dark mode
  },
  sectionBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    // backgroundColor applied inline for dark mode
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    // color applied inline for dark mode
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 14,
    // color applied inline for dark mode
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconSurface: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    // backgroundColor applied inline for dark mode
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    // color applied inline for dark mode
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    // color applied inline for dark mode
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    // borderColor applied inline for dark mode
  },
  emptyButtonPrimary: {
    // backgroundColor, borderColor applied inline for dark mode
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    // color applied inline for dark mode
  },
  emptyButtonTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    // color applied inline for dark mode
  },
  // E1 Fix: Error state styles
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    // color applied inline for dark mode
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    // color applied inline for dark mode
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    // backgroundColor applied inline for dark mode
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    // color applied inline for dark mode
  },
  snackbar: {
    marginBottom: 80,
  },
  profileButton: {
    marginLeft: 4,
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor applied inline for dark mode
  },
  profileAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    // color applied inline for dark mode
  },
});

export default DispatchFlashList;
