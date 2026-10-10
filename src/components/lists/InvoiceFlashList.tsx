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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
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
import { usePermissions } from '@/hooks/usePermissions';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';

// Filters, search and sort
import { INVOICE_FILTERS } from '@/features/filters/configs';
import { readSearch } from '@/features/filters/filterModel';
import { useListFilters } from '@/features/filters/useListFilters';
import { FilteredListHeader, filteredEmptyProps } from '@/features/filters/components/FilteredListHeader';
import { searchWords } from '@/features/filters/components/HighlightedText';
import { formatCount, formatSectionDate } from '@/utils/formatters';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';

// Theme
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { FAB_CLEARANCE } from '@/components/ui/Fab';
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
}

// Section header: footnote, capitals, text.secondary (style guide §13.6)
const SectionHeader = React.memo<SectionHeaderProps>(({ title, count }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={styles.sectionHeader}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}, ${formatCount(count, 'invoice')}`}
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
  const [error, setError] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

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
  const fetchInvoices = useCallback(async (offset: number = 0, append: boolean = false) => {
    const requestId = append ? latestRequest.current : ++latestRequest.current;
    try {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      const params = { ...request, p_limit: 20, p_offset: offset };
      // The all-customers list is for warehouse roles; customer accounts read
      // their assigned customers' invoices.
      const result = isWarehouseRole
        ? await getInvoicesList(params)
        : await getAssignedCustomerInvoices(assignedCustomerIds, { ...params, customerNames: assignedCustomerNames });
      if (!isMountedRef.current || requestId !== latestRequest.current) return;

      if (!result.success || !result.data) throw new Error(result.message || 'Failed to load invoices');
      setError(null);
      const page = result.data.invoices ?? [];
      if (append) {
        setInvoices(prev => {
          const known = new Set(prev.map(invoice => invoice.invoice_id));
          return [...prev, ...page.filter(invoice => !known.has(invoice.invoice_id))];
        });
      } else {
        setInvoices(page);
        // A new search, filter or sort starts from its first row.
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      setHasMore(result.data.pagination.has_more);
      setCurrentOffset(offset + page.length);
    } catch (err: unknown) {
      if (!isMountedRef.current || requestId !== latestRequest.current) return;
      console.error('[InvoiceFlashList] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invoices');
      setSnackbarMessage(append
        ? "Couldn't load more invoices. Scroll down to try again."
        : "Couldn't load invoices. Check your connection and try again.");
      setSnackbarVisible(true);
    } finally {
      if (isMountedRef.current && requestId === latestRequest.current) {
        setIsLoading(false);
        setHasLoaded(true);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [request, isWarehouseRole, assignedCustomerIds, assignedCustomerNames]);

  // Any change of filter, search or sort is a new first page.
  useEffect(() => {
    setCurrentOffset(0);
    fetchInvoices(0, false);
  }, [fetchInvoices]);

  // Refetch on focus (returning from an invoice); the first focus is the initial load.
  const focusCountRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;
      if (focusCountRef.current > 1) {
        setCurrentOffset(0);
        fetchInvoices(0, false);
      }
    }, [fetchInvoices])
  );

  // ============================================================================
  // STABLE CALLBACKS (defined outside renderItem)
  // ============================================================================

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setCurrentOffset(0);
    fetchInvoices(0, false);
  }, [fetchInvoices]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      fetchInvoices(currentOffset, true);
    }
  }, [isLoadingMore, hasMore, isLoading, currentOffset, fetchInvoices]);

  const handleInvoicePress = useCallback((invoice: Invoice) => {
    if (onItemPress) {
      onItemPress(invoice);
    } else {
      router.push(`/invoice-details/${invoice.invoice_id}`);
    }
  }, [onItemPress]);

  const handleCreateInvoice = useCallback(() => {
    dispatch(resetInvoiceForm());
    router.push('/invoice-form/step1');
  }, [dispatch]);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

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

  const renderItem = useCallback(({ item }: { item: FlattenedItem<Invoice> }) => {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} />;
    }

    return (
      <MemoizedInvoiceItem
        invoice={item.data}
        onPress={handleInvoicePress}
        canPrint={canPrint || false}
        words={words}
      />
    );
  }, [handleInvoicePress, canPrint, words]);

  const ListFooter = useMemo(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>Loading more invoices…</Text>
      </View>
    );
  }, [isLoadingMore, styles, t]);

  // ============================================================================
  // RENDER
  // ============================================================================

  let content: React.ReactNode;
  if (!hasLoaded && isLoading) {
    // First load: skeleton. Later loads keep the rows on screen while the new ones arrive.
    content = <ListSkeleton count={5} metricsCount={3} />;
  } else if (invoices.length > 0) {
    content = (
      <FlashList
        ref={listRef}
        data={flattenedData}
        // Re-sorted lists must not stay anchored on the row that was on top before.
        maintainVisibleContentPosition={{ disabled: true }}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={{ canPrint, handleInvoicePress, words }}
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
        title="Couldn't load invoices"
        message="Check your connection and try again."
        onRetry={handleRefresh}
      />
    );
  } else {
    content = (
      <ListEmptyState
        {...filteredEmptyProps(filters, 'invoices')}
        emptyIcon="file-document-outline"
        emptyTitle="No invoices yet"
        emptySubtitle={canCreateInvoice ? 'Invoices you create appear here.' : 'Invoices appear here once they are created.'}
        showCreateButton={canCreateInvoice}
        createButtonLabel="Create invoice"
        onCreatePress={handleCreateInvoice}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* The header, search field and filter bar are shown in every state. */}
      <FilteredListHeader title="Invoices" config={INVOICE_FILTERS} filters={filters} loading={isLoading} />
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

export default InvoiceFlashList;
