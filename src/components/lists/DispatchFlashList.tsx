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

import { createLogger } from '@/utils/logger';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';

import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
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
  CUSTOMER_DISPATCH_MAX,
  Dispatch,
} from '@/services/dispatch-service';

// Components
import { MemoizedDispatchItem } from '@/components/list-items';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { LastUpdatedLine, LoadMoreErrorFooter, StaleListStrip } from './ListLoadErrors';
import { formatCount, formatNumber, formatTime } from '@/utils/formatters';
import { localizeDigits, t as translate } from '@/i18n';

// State
import { useIsOffline } from '@/hooks/useNetworkStatus';
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
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { FAB_CLEARANCE } from '@/components/ui/Fab';
import { animateExpand } from '@/utils/layoutMotion';

const logger = createLogger('DispatchList');
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
  /** Offline: when the rows were loaded, shown under the heading (§14.9). */
  updatedAt?: number;
}

/** Which cards show their items: all of them, except those flipped (so a page loaded later follows "Expand all"). */
interface OpenState {
  all: boolean;
  flipped: ReadonlySet<string>;
}
const isOpen = (open: OpenState, dispatchId: string) => open.all !== open.flipped.has(dispatchId);

// Section header: footnote, capitals, text.secondary (style guide §13.6)
const SectionHeader = React.memo<SectionHeaderProps>(({ title, count, updatedAt }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <View
        style={styles.sectionHeader}
        accessible
        accessibilityRole="header"
        accessibilityLabel={translate('lists.section.label', { title, countText: formatCount(count, 'dispatch', 'dispatches') })}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionCount} maxFontSizeMultiplier={1.6}>{formatNumber(count)}</Text>
        </View>
      </View>
      {updatedAt !== undefined ? <LastUpdatedLine at={updatedAt} testID="dispatch-last-updated" /> : null}
    </>
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
  /** The first page failed with no rows to show. */
  const [loadError, setLoadError] = useState(false);
  /** A refresh failed: the rows loaded before stay, with a strip that says when (§14.9). */
  const [refreshError, setRefreshError] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  /** A customer account's history is capped: a lasting fact about the list, not an event. */
  const [historyLimited, setHistoryLimited] = useState(false);
  const isOffline = useIsOffline();
  const reduceMotion = useReducedMotion();
  /** The request the rows on screen answer, so a failed refresh of it keeps them and a failed new filter does not. */
  const shownRequest = useRef<string | null>(null);

  // Open cards are kept here, not in the cards: FlashList reuses a cell for another dispatch.
  const [open, setOpen] = useState<OpenState>({ all: false, flipped: new Set() });

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
  /**
   * A failed next page is the list's last row with Try again. A failed refresh of the rows on screen keeps them
   * under a strip that says when they were loaded. A failed new search, filter or sort has no rows that answer
   * it, so the list shows the error state (§14.9).
   */
  const showLoadFailure = useCallback((append: boolean, requestKey: string) => {
    if (append) {
      setLoadMoreFailed(true);
    } else if (shownRequest.current === requestKey) {
      setRefreshError(true);
    } else {
      setDispatches([]);
      setHasMore(false);
      shownRequest.current = null;
      setRefreshError(false);
      setLoadError(true);
    }
  }, []);
  // `fresh`: pull to refresh and a return to the screen read the server again;
  // a customer account's next page, sort and search use the history kept for it.
  const fetchDispatches = useCallback(async (offset: number = 0, append: boolean = false, fresh: boolean = false) => {
    const requestId = append ? latestRequest.current : ++latestRequest.current;
    const requestKey = JSON.stringify([request, customerId ?? null]);
    try {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      const params = { ...request, p_limit: 20, offset };
      // The all-customers list is for warehouse roles; customer accounts read
      // their assigned customers' dispatches.
      const response = isWarehouseRole
        ? await getDispatchListWithItems({ ...params, p_customer_id: customerId })
        : await getAssignedCustomerDispatchList(customerId ? [customerId] : assignedCustomerIds, { ...params, p_fresh: fresh });
      if (!isMountedRef.current || requestId !== latestRequest.current) return;

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dispatches');
      }

      // The service answers a network failure with the list kept on the phone. A refresh of the rows on screen
      // that got only that did not refresh: it is a failure (strip, loadedAt kept), not a new load (§14.9).
      if (response.fromCache && !append && shownRequest.current === requestKey) {
        throw new Error('Refresh answered from the saved list');
      }

      const { dispatches: newDispatches, pagination } = response.data;
      if (append) {
        setDispatches(prev => {
          const existingIds = new Set(prev.map(d => d.dispatch_id || d.id));
          return [...prev, ...newDispatches.filter((d: Dispatch) => !existingIds.has(d.dispatch_id || d.id))];
        });
      } else {
        setDispatches(newDispatches);
        setLoadError(false);
        setRefreshError(false);
        setLoadMoreFailed(false);
        // A list answered from the phone's saved copy was loaded when that copy was stored, not now.
        setLoadedAt(response.fromCache && response.cachedAt ? response.cachedAt : Date.now());
        setHistoryLimited(Boolean(pagination.history_limit_reached));
        shownRequest.current = requestKey;
        // A new search, filter or sort starts from its first row.
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      setHasMore(pagination.has_more);
      setCurrentOffset(offset + newDispatches.length);
    } catch (err: unknown) {
      if (!isMountedRef.current || requestId !== latestRequest.current) return;
      // Development only, and through the redacting logger: the text is the server's and can name a table, a function or the facility's address.
      logger.warn('List did not load', err instanceof Error ? err.message : err);
      showLoadFailure(append, requestKey);
    } finally {
      if (isMountedRef.current && requestId === latestRequest.current) {
        setIsLoading(false);
        setHasLoaded(true);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [customerId, request, isWarehouseRole, assignedCustomerIds, showLoadFailure]);

  // One owner for loading the first page. The newest request is kept in a ref so the
  // focus callback below never changes identity: expo-router reruns a focus effect
  // whose callback changes while the screen is focused, which would count a filter
  // change as a return to the screen and load twice.
  const fetchDispatchesRef = useRef(fetchDispatches);
  fetchDispatchesRef.current = fetchDispatches;
  // The list is mounted by its screen, so it starts focused; a blur says otherwise.
  const screenFocusedRef = useRef(true);
  const blurredRef = useRef(false);
  const changedWhileHiddenRef = useRef(false);

  // First load, and any change of filter, search or sort: a new first page from the
  // history kept for the account (fresh=false). While the screen is hidden (e.g. on
  // the Sort and filter page) the change waits for the return, which loads it.
  useEffect(() => {
    if (!screenFocusedRef.current) {
      changedWhileHiddenRef.current = true;
      return;
    }
    setCurrentOffset(0);
    fetchDispatches(0, false);
  }, [fetchDispatches]);

  // A real return to the screen (after a blur, e.g. back from an edit) loads once.
  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      if (blurredRef.current) {
        // Filters applied while away are served like an inline change (fresh=false);
        // a revisit with the same request reads the server again.
        const fresh = !changedWhileHiddenRef.current;
        blurredRef.current = false;
        changedWhileHiddenRef.current = false;
        fetchDispatchesRef.current(0, false, fresh);
      }
      return () => {
        screenFocusedRef.current = false;
        blurredRef.current = true;
      };
    }, [])
  );

  // ============================================================================
  // STABLE CALLBACKS (defined outside renderItem)
  // ============================================================================

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    // The offset stays until the answer sets it: a failed refresh keeps the rows, and the offset after them.
    fetchDispatches(0, false, true);
  }, [fetchDispatches]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      setLoadMoreFailed(false);
      fetchDispatches(currentOffset, true);
    }
  }, [isLoadingMore, hasMore, isLoading, currentOffset, fetchDispatches]);

  // Reaching the end of the list asks for the next page, but not again right after one failed: the footer's
  // Try again is the way (otherwise a dead connection would be retried in a loop).
  const handleEndReached = useCallback(() => {
    if (!loadMoreFailed) handleLoadMore();
  }, [loadMoreFailed, handleLoadMore]);

  const handleDispatchPress = useCallback((dispatch: Dispatch) => {
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  }, []);

  const handleCreateDispatch = useCallback(() => {
    router.push('/dispatch-form/step1');
  }, []);

  // One card. The animation is for one row at a time and is skipped under Reduce Motion (§9).
  const handleToggle = useCallback((dispatchId: string) => {
    setOpen(previous => {
      const flipped = new Set(previous.flipped);
      if (flipped.has(dispatchId)) flipped.delete(dispatchId);
      else flipped.add(dispatchId);
      return { all: previous.all, flipped };
    });
  }, []);
  const handleCardToggle = useCallback((dispatchId: string) => {
    animateExpand(reduceMotion);
    handleToggle(dispatchId);
  }, [reduceMotion, handleToggle]);

  // Open or close every card, also those loaded later. Not animated: it changes the whole list (§9).
  const handleToggleAllExpanded = useCallback(() => {
    setOpen(previous => ({ all: !previous.all, flipped: new Set() }));
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

  // Offline with no failed refresh: the first heading (or, with no headings, the top of the list) says when the
  // cards were loaded (§14.9). A failed refresh says it in its strip instead.
  const offlineUpdatedAt = isOffline && !refreshError ? loadedAt : undefined;

  const renderItem = useCallback(({ item, index }: { item: FlattenedItem<Dispatch>; index: number }) => {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} updatedAt={index === 0 ? offlineUpdatedAt : undefined} />;
    }

    return (
      <MemoizedDispatchItem
        dispatch={item.data}
        onPress={handleDispatchPress}
        canPrint={canPrint || false}
        expanded={isOpen(open, item.key)}
        onToggle={handleCardToggle}
        words={words}
      />
    );
  }, [handleDispatchPress, canPrint, open, handleCardToggle, words, offlineUpdatedAt]);

  const ListFooter = useMemo(() => {
    if (loadMoreFailed && !isLoadingMore) {
      return (
        <LoadMoreErrorFooter
          message={translate('lists.dispatch.loadMoreFailed')}
          retryLabel={translate('lists.dispatch.retryMore')}
          onRetry={handleLoadMore}
          testID="dispatch-load-more-error"
        />
      );
    }
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>{translate('lists.dispatch.loadingMore')}</Text>
      </View>
    );
  }, [isLoadingMore, loadMoreFailed, handleLoadMore, styles, t]);

  // The top of the list: in a flat list (sorted by number, so no headings), the offline line.
  const flat = flattenedData.length > 0 && flattenedData[0].type === 'card';
  const listHeader = useMemo(() => {
    const updated = flat ? offlineUpdatedAt : undefined;
    if (updated === undefined) return null;
    return <LastUpdatedLine at={updated} top testID="dispatch-last-updated" />;
  }, [flat, offlineUpdatedAt]);

  // The capped-history footnote while it applies, above the list or the empty state, so it also shows with no rows:
  // "no match" would otherwise read as covering the whole history (§14.9).
  const historyNote = historyLimited ? (
    <Text style={styles.historyNote} testID="dispatch-history-limited">
      {translate('lists.dispatch.historyLimited', { count: localizeDigits(String(CUSTOMER_DISPATCH_MAX)) })}
    </Text>
  ) : null;

  // ============================================================================
  // RENDER
  // ============================================================================

  // The header, search field and filter bar are shown in every state, so a
  // search or filter can always be changed or cleared.
  const header = (
    <FilteredListHeader
      title={translate('lists.dispatch.title')}
      config={DISPATCH_FILTERS}
      filters={filters}
      loading={isLoading}
      expand={{
        expanded: open.all,
        onToggle: handleToggleAllExpanded,
        nounPlural: 'dispatches',
        disabled: dispatches.length === 0,
      }}
    />
  );

  let content: React.ReactNode;
  if ((!hasLoaded || loadError) && isLoading && dispatches.length === 0) {
    // First load: skeleton. Later loads keep the rows on screen while the new ones arrive.
    content = <ListSkeleton count={5} metricsCount={3} />;
  } else if (dispatches.length > 0) {
    content = (
      <>
        {historyNote}
        {/* A refresh failed: the dispatches loaded before stay, with Try again (§14.9) */}
        {refreshError ? (
          <StaleListStrip
            title={translate('lists.dispatch.staleTitle')}
            text={translate('lists.dispatch.staleText', { time: formatTime(new Date(loadedAt)) })}
            retryLabel={translate('lists.dispatch.retryRefresh')}
            onRetry={handleRefresh}
            retrying={isRefreshing}
            testID="dispatch-stale-strip"
          />
        ) : null}
      <FlashList
        ref={listRef}
        data={flattenedData}
        // Re-sorted lists must not stay anchored on the row that was on top before.
        maintainVisibleContentPosition={{ disabled: true }}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={{ canPrint, handleDispatchPress, open, words, offlineUpdatedAt }}
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
        onEndReached={handleEndReached}
        onEndReachedThreshold={DEFAULT_LIST_CONFIG.onEndReachedThreshold}
        ListHeaderComponent={listHeader}
        ListFooterComponent={ListFooter}
        showsVerticalScrollIndicator={false}
      />
      </>
    );
  } else if (loadError) {
    content = (
      <ErrorStateView
        presentation="inline"
        title={translate('lists.dispatch.loadFailedTitle')}
        message={translate('common.checkConnection')}
        onRetry={handleRefresh}
      />
    );
  } else {
    content = (
      <>
        {historyNote}
        <ListEmptyState
          {...filteredEmptyProps(filters, 'dispatches')}
          emptyIcon="truck-delivery-outline"
          emptyTitle={translate('lists.dispatch.emptyTitle')}
          emptySubtitle={canCreateDispatch ? translate('lists.dispatch.emptyCreator') : translate('lists.dispatch.emptyViewer')}
          showCreateButton={canCreateDispatch}
          createButtonLabel={translate('lists.dispatch.create')}
          onCreatePress={handleCreateDispatch}
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
    letterSpacing: trackedText(0.5),
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
  // A lasting fact about the list (§14.9): footnote, text.secondary, inside the list's padding
  historyNote: {
    ...typography.footnote,
    color: t.text.secondary,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
});

export default DispatchFlashList;
