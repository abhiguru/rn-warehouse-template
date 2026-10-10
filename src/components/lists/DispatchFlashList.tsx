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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, LayoutAnimation } from 'react-native';

import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
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

// Components
import { MemoizedDispatchItem } from '@/components/list-items';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { formatCount } from '@/utils/formatters';

// State
import { usePermissions } from '@/hooks/usePermissions';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';

// Filters, search and sort
import { DISPATCH_FILTERS } from '@/features/filters/configs';
import { readSearch } from '@/features/filters/filterModel';
import { useListFilters } from '@/features/filters/useListFilters';
import { FilteredListHeader, filteredEmptyProps } from '@/features/filters/components/FilteredListHeader';
import { searchWords } from '@/features/filters/components/HighlightedText';
import { formatSectionDate } from '@/utils/formatters';

// Theme
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { FAB_CLEARANCE } from '@/components/ui/Fab';
// ============================================================================
// TYPES
// ============================================================================

export interface DispatchFlashListProps {
  /** Optional customer ID to filter dispatches */
  customerId?: string;
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
// MAIN COMPONENT
// ============================================================================

const DispatchFlashList: React.FC<DispatchFlashListProps> = ({ customerId }) => {
  const listRef = useRef<FlashListRef<FlattenedItem<Dispatch>>>(null);

  // Theme
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // User state & permissions
  const { canCreate, canUpdate } = usePermissions();
  const { canManageOrders: isWarehouseRole, assignedCustomerIds } = useRoleBasedAccess();
  const canPrint = canCreate || canUpdate; // Staff can print (they have update permission)
  const canCreateDispatch = canCreate;

  // Filters, search and sort
  const filters = useListFilters(DISPATCH_FILTERS);
  const { request, sort } = filters;
  const sortedByNumber = sort?.field === 'disp_no';
  const words = useMemo(() => searchWords(readSearch(DISPATCH_FILTERS, filters.values).text), [filters.values]);

  // List state
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // Expand all state
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandKey, setExpandKey] = useState(0);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // A newer request (the user kept typing, or changed a filter) replaces an
  // older one: late answers to old questions are dropped.
  const latestRequest = useRef(0);
  const fetchDispatches = useCallback(async (offset: number = 0, append: boolean = false) => {
    const requestId = append ? latestRequest.current : ++latestRequest.current;
    try {
      if (append) setIsLoadingMore(true);
      else {
        setIsLoading(true);
        setError(null);
      }

      const params = { ...request, p_limit: 20, offset };
      // The all-customers list is for warehouse roles; customer accounts read
      // their assigned customers' dispatches.
      const response = isWarehouseRole
        ? await getDispatchListWithItems({ ...params, p_customer_id: customerId })
        : await getAssignedCustomerDispatchList(customerId ? [customerId] : assignedCustomerIds, params);
      if (!isMountedRef.current || requestId !== latestRequest.current) return;

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dispatches');
      }

      const { dispatches: newDispatches, pagination } = response.data;
      if (append) {
        setDispatches(prev => {
          const existingIds = new Set(prev.map(d => d.dispatch_id || d.id));
          return [...prev, ...newDispatches.filter((d: Dispatch) => !existingIds.has(d.dispatch_id || d.id))];
        });
      } else {
        setDispatches(newDispatches);
        // A new search, filter or sort starts from its first row.
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      setHasMore(pagination.has_more);
      setCurrentOffset(offset + newDispatches.length);
    } catch (err: unknown) {
      if (!isMountedRef.current || requestId !== latestRequest.current) return;
      console.error('[DispatchFlashList] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dispatches');
      setSnackbarMessage(append
        ? "Couldn't load more dispatches. Scroll down to try again."
        : "Couldn't load dispatches. Check your connection and try again.");
      setSnackbarVisible(true);
    } finally {
      if (isMountedRef.current && requestId === latestRequest.current) {
        setIsLoading(false);
        setHasLoaded(true);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [customerId, request, isWarehouseRole, assignedCustomerIds]);

  // Any change of filter, search or sort is a new first page.
  useEffect(() => {
    setCurrentOffset(0);
    fetchDispatches(0, false);
  }, [fetchDispatches]);

  // Refetch on focus (e.g., returning from edit screen); the first focus is the initial load.
  const focusCountRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;
      if (focusCountRef.current > 1) {
        setCurrentOffset(0);
        fetchDispatches(0, false);
      }
    }, [fetchDispatches])
  );

  // ============================================================================
  // STABLE CALLBACKS (defined outside renderItem)
  // ============================================================================

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setCurrentOffset(0);
    fetchDispatches(0, false);
  }, [fetchDispatches]);

  const handleLoadMore = useCallback(() => {
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

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
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
    if (sortedByNumber) {
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
  }, [dispatches, sortedByNumber]);

  const keyExtractor = useCallback((item: FlattenedItem<Dispatch>) => item.key, []);

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
        words={words}
      />
    );
  }, [handleDispatchPress, canPrint, allExpanded, expandKey, words]);

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

  // The header, search field and filter bar are shown in every state, so a
  // search or filter can always be changed or cleared.
  const header = (
    <FilteredListHeader
      title="Dispatches"
      config={DISPATCH_FILTERS}
      filters={filters}
      loading={isLoading}
      expand={{
        expanded: allExpanded,
        onToggle: handleToggleAllExpanded,
        nounPlural: 'dispatches',
        disabled: dispatches.length === 0,
      }}
    />
  );

  let content: React.ReactNode;
  if (!hasLoaded && isLoading) {
    // First load: skeleton. Later loads keep the rows on screen while the new ones arrive.
    content = <ListSkeleton count={5} metricsCount={3} />;
  } else if (dispatches.length > 0) {
    content = (
      <FlashList
        ref={listRef}
        data={flattenedData}
        // Re-sorted lists must not stay anchored on the row that was on top before.
        maintainVisibleContentPosition={{ disabled: true }}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={{ canPrint, handleDispatchPress, allExpanded, expandKey, words }}
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
    );
  } else if (error) {
    content = (
      <ErrorStateView
        presentation="inline"
        title="Couldn't load dispatches"
        message="Check your connection and try again."
        onRetry={handleRefresh}
      />
    );
  } else {
    content = (
      <ListEmptyState
        {...filteredEmptyProps(filters, 'dispatches')}
        emptyIcon="truck-delivery-outline"
        emptyTitle="No dispatches yet"
        emptySubtitle={canCreateDispatch ? 'Dispatches you create appear here.' : 'Dispatches appear here once they are created.'}
        showCreateButton={canCreateDispatch}
        createButtonLabel="Create dispatch"
        onCreatePress={handleCreateDispatch}
      />
    );
  }

  return (
    <View style={styles.container}>
      {header}
      {content}
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

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
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
