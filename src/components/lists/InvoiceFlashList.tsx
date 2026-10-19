/**
 * InvoiceFlashList - FlashList Implementation (2025 Best Practices)
 *
 * IMPORTANT: This component is built from scratch following FlashList best practices.
 * Do NOT copy patterns from InvoiceList.tsx.
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
 * @module lists/InvoiceFlashList
 */

import { createLogger } from '@/utils/logger';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ActivityIndicator } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
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
import { getAssignedCustomerInvoices, getInvoicesList, Invoice } from '@/services/invoice-service';

// Components
import { MemoizedInvoiceItem } from '@/components/list-items';

// State
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { resetForm as resetInvoiceForm } from '@/store/slices/invoiceFormSlice';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';

// Filters, search and sort
import { INVOICE_FILTERS } from '@/features/filters/configs';
import { readSearch } from '@/features/filters/filterModel';
import { useListFilters } from '@/features/filters/useListFilters';
import { FilteredListHeader, filteredEmptyProps } from '@/features/filters/components/FilteredListHeader';
import { searchWords } from '@/features/filters/components/HighlightedText';
import { formatCount, formatNumber, formatSectionDate, formatTime } from '@/utils/formatters';
import { t as translate } from '@/i18n';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { LastUpdatedLine, LoadMoreErrorFooter, StaleListStrip } from './ListLoadErrors';

// Theme
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { FAB_CLEARANCE } from '@/components/ui/Fab';

const logger = createLogger('InvoiceList');
// ============================================================================
// TYPES
// ============================================================================

export interface InvoiceFlashListProps {
  /** Custom press handler (overrides default navigation) */
  onItemPress?: (invoice: Invoice) => void;
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

// Section header: footnote, capitals, text.secondary (style guide §13.6)
const SectionHeader = React.memo<SectionHeaderProps>(({ title, count, updatedAt }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <View
        style={styles.sectionHeader}
        accessible
        accessibilityRole="header"
        accessibilityLabel={translate('lists.section.label', { title, countText: formatCount(count, 'invoice') })}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionCount} maxFontSizeMultiplier={1.6}>{formatNumber(count)}</Text>
        </View>
      </View>
      {updatedAt !== undefined ? <LastUpdatedLine at={updatedAt} testID="invoice-last-updated" /> : null}
    </>
  );
});

SectionHeader.displayName = 'SectionHeader';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const InvoiceFlashList: React.FC<InvoiceFlashListProps> = ({ onItemPress }) => {
  const listRef = useRef<FlashListRef<FlattenedItem<Invoice>>>(null);

  // Theme
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // User state & permissions
  const { userProfile } = useAppSelector(state => state.auth);
  const dispatch = useAppDispatch();
  const { canCreate, canUpdate } = usePermissions();
  const { canManageOrders: isWarehouseRole, assignedCustomerIds } = useRoleBasedAccess();
  const assignedCustomerNames = useMemo(
    () => Object.fromEntries((userProfile?.assignedCustomers || []).map(customer => [customer.id, customer.name])),
    [userProfile?.assignedCustomers]
  );
  const canCreateInvoice = canCreate;
  const canPrint = canCreate || canUpdate; // Staff can print (they have update permission)

  // Filters, search and sort
  const filters = useListFilters(INVOICE_FILTERS);
  const { request, sort } = filters;
  const sortedByDate = sort?.field === 'inv_date';
  const words = useMemo(() => searchWords(readSearch(INVOICE_FILTERS, filters.values).text), [filters.values]);

  // List state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
  const isOffline = useIsOffline();
  /** The request the rows on screen answer, so a failed refresh of it keeps them and a failed new filter does not. */
  const shownRequest = useRef<string | null>(null);

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
      setInvoices([]);
      setHasMore(false);
      shownRequest.current = null;
      setRefreshError(false);
      setLoadError(true);
    }
  }, []);
  // `fresh`: pull to refresh and a return to the screen read the server again;
  // a customer account's next page, sort and search use the history kept for it.
  const fetchInvoices = useCallback(async (offset: number = 0, append: boolean = false, fresh: boolean = false) => {
    const requestId = append ? latestRequest.current : ++latestRequest.current;
    const requestKey = JSON.stringify(request);
    try {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      const params = { ...request, p_limit: 20, p_offset: offset };
      // The all-customers list is for warehouse roles; customer accounts read
      // their assigned customers' invoices.
      const result = isWarehouseRole
        ? await getInvoicesList(params)
        : await getAssignedCustomerInvoices(assignedCustomerIds, { ...params, customerNames: assignedCustomerNames, p_fresh: fresh });
      if (!isMountedRef.current || requestId !== latestRequest.current) return;

      if (!result.success || !result.data) throw new Error(result.message || 'Failed to load invoices');
      const page = result.data.invoices ?? [];
      if (append) {
        setInvoices(prev => {
          const known = new Set(prev.map(invoice => invoice.invoice_id));
          return [...prev, ...page.filter(invoice => !known.has(invoice.invoice_id))];
        });
      } else {
        setInvoices(page);
        setLoadError(false);
        setRefreshError(false);
        setLoadMoreFailed(false);
        setLoadedAt(Date.now());
        shownRequest.current = requestKey;
        // A new search, filter or sort starts from its first row.
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      setHasMore(result.data.pagination.has_more);
      setCurrentOffset(offset + page.length);
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
  }, [request, isWarehouseRole, assignedCustomerIds, assignedCustomerNames, showLoadFailure]);

  // One owner for loading the first page. The newest request is kept in a ref so the
  // focus callback below never changes identity: expo-router reruns a focus effect
  // whose callback changes while the screen is focused, which would count a filter
  // change as a return to the screen and load twice.
  const fetchInvoicesRef = useRef(fetchInvoices);
  fetchInvoicesRef.current = fetchInvoices;
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
    fetchInvoices(0, false);
  }, [fetchInvoices]);

  // Set by the first tap on "Create invoice" until the list is in front again:
  // a second tap opened a second step 1 and reset the form the first one had
  // started (its suggested number was lost).
  const openingFormRef = useRef(false);

  // A real return to the screen (after a blur, e.g. back from an invoice) loads once.
  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      openingFormRef.current = false;
      if (blurredRef.current) {
        // Filters applied while away are served like an inline change (fresh=false);
        // a revisit with the same request reads the server again.
        const fresh = !changedWhileHiddenRef.current;
        blurredRef.current = false;
        changedWhileHiddenRef.current = false;
        fetchInvoicesRef.current(0, false, fresh);
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
    fetchInvoices(0, false, true);
  }, [fetchInvoices]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      setLoadMoreFailed(false);
      fetchInvoices(currentOffset, true);
    }
  }, [isLoadingMore, hasMore, isLoading, currentOffset, fetchInvoices]);

  // Reaching the end of the list asks for the next page, but not again right after one failed: the footer's
  // Try again is the way (otherwise a dead connection would be retried in a loop).
  const handleEndReached = useCallback(() => {
    if (!loadMoreFailed) handleLoadMore();
  }, [loadMoreFailed, handleLoadMore]);

  const handleInvoicePress = useCallback((invoice: Invoice) => {
    if (onItemPress) {
      onItemPress(invoice);
    } else {
      router.push(`/invoice-details/${invoice.invoice_id}`);
    }
  }, [onItemPress]);

  const handleCreateInvoice = useCallback(() => {
    if (openingFormRef.current) return;
    openingFormRef.current = true;
    dispatch(resetInvoiceForm());
    router.push('/invoice-form/step1');
  }, [dispatch]);

  // ============================================================================
  // FLATTENED DATA (for FlashList)
  // ============================================================================

  const flattenedData = useMemo((): FlattenedItem<Invoice>[] => {
    if (invoices.length === 0) return [];

    // Date headings only when sorted by date: in any other order they would
    // pull same-day invoices together and break that order.
    if (!sortedByDate) {
      return invoices.map(invoice => ({ type: 'card' as const, data: invoice, key: invoice.invoice_id }));
    }

    const groups: Record<string, Invoice[]> = {};
    invoices.forEach(invoice => {
      const formattedDate = formatSectionDate(invoice.invoice_date);
      if (!groups[formattedDate]) {
        groups[formattedDate] = [];
      }
      groups[formattedDate].push(invoice);
    });

    const sections: SectionData<Invoice>[] = Object.entries(groups).map(([title, data]) => ({
      title,
      data,
    }));

    return flattenSections(sections, (invoice) => invoice.invoice_id);
  }, [invoices, sortedByDate]);

  const keyExtractor = useCallback((item: FlattenedItem<Invoice>) => item.key, []);

  // Offline with no failed refresh: the first heading (or, with no headings, the top of the list) says when the
  // cards were loaded (§14.9). A failed refresh says it in its strip instead.
  const offlineUpdatedAt = isOffline && !refreshError ? loadedAt : undefined;

  const renderItem = useCallback(({ item, index }: { item: FlattenedItem<Invoice>; index: number }) => {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} updatedAt={index === 0 ? offlineUpdatedAt : undefined} />;
    }

    return (
      <MemoizedInvoiceItem
        invoice={item.data}
        onPress={handleInvoicePress}
        canPrint={canPrint || false}
        words={words}
      />
    );
  }, [handleInvoicePress, canPrint, words, offlineUpdatedAt]);

  const ListFooter = useMemo(() => {
    if (loadMoreFailed && !isLoadingMore) {
      return (
        <LoadMoreErrorFooter
          message={translate('lists.invoice.loadMoreFailed')}
          retryLabel={translate('lists.invoice.retryMore')}
          onRetry={handleLoadMore}
          testID="invoice-load-more-error"
        />
      );
    }
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>{translate('lists.invoice.loadingMore')}</Text>
      </View>
    );
  }, [isLoadingMore, loadMoreFailed, handleLoadMore, styles, t]);

  // Sorted by anything but date there are no headings: the offline line is then the top of the list.
  const listHeader = useMemo(
    () => (!sortedByDate && offlineUpdatedAt !== undefined ? <LastUpdatedLine at={offlineUpdatedAt} top testID="invoice-last-updated" /> : null),
    [sortedByDate, offlineUpdatedAt]
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  let content: React.ReactNode;
  if ((!hasLoaded || loadError) && isLoading && invoices.length === 0) {
    // First load: skeleton. Later loads keep the rows on screen while the new ones arrive.
    // One wide block under the header stands for the amounts table (ListSkeleton has no table option).
    content = <ListSkeleton count={5} metricsCount={1} />;
  } else if (invoices.length > 0) {
    content = (
      <>
        {/* A refresh failed: the invoices loaded before stay, with Try again (§14.9) */}
        {refreshError ? (
          <StaleListStrip
            title={translate('lists.invoice.staleTitle')}
            text={translate('lists.invoice.staleText', { time: formatTime(new Date(loadedAt)) })}
            retryLabel={translate('lists.invoice.retryRefresh')}
            onRetry={handleRefresh}
            retrying={isRefreshing}
            testID="invoice-stale-strip"
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
        extraData={{ canPrint, handleInvoicePress, words, offlineUpdatedAt }}
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
        title={translate('lists.invoice.loadFailedTitle')}
        message={translate('common.checkConnection')}
        onRetry={handleRefresh}
      />
    );
  } else {
    content = (
      <ListEmptyState
        {...filteredEmptyProps(filters, 'invoices')}
        emptyIcon="file-document-outline"
        emptyTitle={translate('lists.invoice.emptyTitle')}
        emptySubtitle={canCreateInvoice ? translate('lists.invoice.emptyCreator') : translate('lists.invoice.emptyViewer')}
        showCreateButton={canCreateInvoice}
        createButtonLabel={translate('lists.invoice.create')}
        onCreatePress={handleCreateInvoice}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* The header, search field and filter bar are shown in every state. */}
      <FilteredListHeader title={translate('lists.invoice.title')} config={INVOICE_FILTERS} filters={filters} loading={isLoading} />
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
});

export default InvoiceFlashList;
