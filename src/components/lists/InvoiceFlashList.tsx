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
 * @module lists/InvoiceFlashList
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Badge, IconButton, Portal, Snackbar, Surface, Chip } from 'react-native-paper';
import { router } from 'expo-router';
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
import { getInvoicesList, Invoice } from '@/services/invoice-service';

// Components
import { MemoizedInvoiceItem } from '@/components/list-items';
import { GenericFilterModal } from '@/components/filters';

// State
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { resetForm as resetInvoiceForm } from '@/store/slices/invoiceFormSlice';
import { usePermissions } from '@/hooks/usePermissions';
import { useFilterState } from '@/hooks/useFilterState';
import type { AutocompleteSelection, FilterValues, FilterValueType } from '@/types/filter.types';

// Config
import { INVOICE_FILTER_CONFIG } from '@/config/filterConfigs';
import { useListColors, ListColors } from '@/hooks/useListColors';
import { formatSectionDate } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface InvoiceFlashListProps {
  /** Custom press handler (overrides default navigation) */
  onItemPress?: (invoice: Invoice) => void;
  /** Initial filter values */
  initialFilters?: Record<string, any>;
}

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
      <Text style={[styles.sectionBadgeText, { color: colors.textSecondary }]}>{count}</Text>
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
  onCreateInvoice: () => void;
  colors: ListColors;
}

const EmptyState = React.memo<EmptyStateProps>(({
  hasFilters,
  onClearFilters,
  canCreate,
  onCreateInvoice,
  colors,
}) => (
  <View style={styles.emptyContainer}>
    <View style={[styles.emptyIconSurface, { backgroundColor: colors.gray100 }]}>
      <Icon name="file-document-remove-outline" size={48} color={colors.textTertiary} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
      {hasFilters ? 'No invoices match filters' : 'No invoices yet'}
    </Text>
    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
      {hasFilters
        ? 'Try adjusting your filters to see all invoices'
        : 'Create your first invoice to get started'}
    </Text>
    {hasFilters && (
      <Pressable style={[styles.emptyButton, { borderColor: colors.gray300 }]} onPress={onClearFilters}>
        <Text style={[styles.emptyButtonText, { color: colors.textPrimary }]}>Clear Filters</Text>
      </Pressable>
    )}
    {canCreate && !hasFilters && (
      <Pressable style={[styles.emptyButton, styles.emptyButtonPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={onCreateInvoice}>
        <Text style={[styles.emptyButtonTextPrimary, { color: colors.white }]}>Create Invoice</Text>
      </Pressable>
    )}
  </View>
));

EmptyState.displayName = 'EmptyState';

// ============================================================================
// FILTER CHIPS COMPONENT
// ============================================================================
interface FilterChipsProps {
  filters: FilterValues;
  activeFilterCount: number;
  updateFilter: (key: string, value: FilterValueType) => void;
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

  // Customer chips
  if (filters.customerName?.length > 0) {
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

  // Invoice number range chips
  if (filters.invoiceNoFrom?.length > 0) {
    chips.push({
      key: 'inv-from',
      label: `From: ${filters.invoiceNoFrom[0].label}`,
      icon: 'file-document',
      onRemove: () => updateFilter('invoiceNoFrom', []),
    });
  }
  if (filters.invoiceNoTo?.length > 0) {
    chips.push({
      key: 'inv-to',
      label: `To: ${filters.invoiceNoTo[0].label}`,
      icon: 'file-document',
      onRemove: () => updateFilter('invoiceNoTo', []),
    });
  }

  // Payment status chip
  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    const statusLabels: Record<string, string> = {
      paid: 'Paid',
      unpaid: 'Unpaid',
      partial: 'Partial',
    };
    chips.push({
      key: 'payment-status',
      label: statusLabels[filters.paymentStatus as string] || filters.paymentStatus,
      icon: 'cash-multiple',
      onRemove: () => updateFilter('paymentStatus', 'all'),
    });
  }

  // Amount range chip
  if (filters.amountMin || filters.amountMax) {
    chips.push({
      key: 'amount-range',
      label: `₹${filters.amountMin || 0} - ₹${filters.amountMax || '∞'}`,
      icon: 'currency-inr',
      onRemove: () => {
        updateFilter('amountMin', undefined);
        updateFilter('amountMax', undefined);
      },
    });
  }

  // Date range chip
  if (filters.dateFrom || filters.dateTo) {
    const fromDate = filters.dateFrom ? new Date(filters.dateFrom as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '...';
    const toDate = filters.dateTo ? new Date(filters.dateTo as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '...';
    chips.push({
      key: 'date-range',
      label: `${fromDate} - ${toDate}`,
      icon: 'calendar-range',
      onRemove: () => {
        updateFilter('dateFrom', undefined);
        updateFilter('dateTo', undefined);
      },
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
          <Text style={[styles.clearAllText, { color: colors.statusNegative }]}>Clear all</Text>
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

const InvoiceFlashList: React.FC<InvoiceFlashListProps> = ({
  onItemPress,
  initialFilters,
}) => {
  const fetchInProgressRef = useRef(false);

  // Theme colors
  const colors = useListColors();

  // User state & permissions
  const { userProfile } = useAppSelector(state => state.auth);
  const dispatch = useAppDispatch();
  const { canCreate, canUpdate } = usePermissions();
  const canCreateInvoice = canCreate;
  const canPrint = canCreate || canUpdate; // Staff can print (they have update permission)

  // List state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  // E1 Fix: Add error state for proper error display
  const [error, setError] = useState<string | null>(null);

  // E3 Fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // E7 Fix: Track request ID to discard stale pagination responses
  const requestIdRef = useRef(0);

  // Filter state
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const {
    debouncedValues: filters,
    activeFilterCount,
    updateFilter,
    clearAllFilters,
  } = useFilterState({
    persistKey: INVOICE_FILTER_CONFIG.persistKey,
    debounceMs: 500,
  });

  // Apply initial filters
  useEffect(() => {
    if (initialFilters && Object.keys(initialFilters).length > 0) {
      Object.entries(initialFilters).forEach(([key, value]) => {
        updateFilter(key, value);
      });
    }
  }, []);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchInvoices = useCallback(async (isRefresh = false, isLoadMore = false) => {
    if (fetchInProgressRef.current) {
      return;
    }
    fetchInProgressRef.current = true;

    // E7 Fix: Increment request ID to track this request
    const currentRequestId = ++requestIdRef.current;

    try {
      if (isRefresh) {
        setIsRefreshing(true);
        setCurrentOffset(0);
      } else if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const offset = isLoadMore ? currentOffset : 0;

      // Build API params
      interface InvoiceListParams {
        p_limit: number;
        p_offset: number;
        p_sort_field: string;
        p_sort_direction: 'asc' | 'desc';
        p_customer_id?: string;
        p_inv_no_from?: number;
        p_inv_no_to?: number;
        p_date_from?: string;
        p_date_to?: string;
        p_search_grn_no?: string;
      }
      const params: InvoiceListParams = {
        p_limit: 20,
        p_offset: offset,
        p_sort_field: 'created_at',
        p_sort_direction: 'desc',
      };

      // Debug: Log raw filter values
      console.log('[InvoiceFlashList] Raw filters:', JSON.stringify(filters, null, 2));

      // Map filters to API format
      if (filters.customerName?.length > 0) {
        params.p_customer_id = filters.customerName[0].id;
        console.log('[InvoiceFlashList] Applied customer filter:', filters.customerName[0]);
      }
      if (filters.invoiceNoFrom?.length > 0) {
        // Extract number from label like "INV-2572" → 2572
        const label = filters.invoiceNoFrom[0].label;
        const match = label.match(/\d+/);
        if (match) {
          params.p_inv_no_from = parseInt(match[0], 10);
          console.log('[InvoiceFlashList] Applied invoiceNoFrom:', params.p_inv_no_from);
        }
      }
      if (filters.invoiceNoTo?.length > 0) {
        // Extract number from label like "INV-2574" → 2574
        const label = filters.invoiceNoTo[0].label;
        const match = label.match(/\d+/);
        if (match) {
          params.p_inv_no_to = parseInt(match[0], 10);
          console.log('[InvoiceFlashList] Applied invoiceNoTo:', params.p_inv_no_to);
        }
      }
      if (filters.grnNo?.length > 0) {
        params.p_search_grn_no = filters.grnNo[0].label;
        console.log('[InvoiceFlashList] Applied grnNo:', params.p_search_grn_no);
      }
      // Date range filters
      if (filters.dateFrom) {
        const dateFrom = filters.dateFrom instanceof Date
          ? filters.dateFrom.toISOString().split('T')[0]
          : filters.dateFrom;
        params.p_date_from = dateFrom;
        console.log('[InvoiceFlashList] Applied dateFrom:', params.p_date_from);
      }
      if (filters.dateTo) {
        const dateTo = filters.dateTo instanceof Date
          ? filters.dateTo.toISOString().split('T')[0]
          : filters.dateTo;
        params.p_date_to = dateTo;
        console.log('[InvoiceFlashList] Applied dateTo:', params.p_date_to);
      }

      console.log('[InvoiceFlashList] Final params:', JSON.stringify(params, null, 2));

      const result = await getInvoicesList(params);

      // E3 Fix: Skip state updates if component unmounted during fetch
      if (!isMountedRef.current) {
        return;
      }

      // E7 Fix: Discard stale response if a newer request was made
      if (currentRequestId !== requestIdRef.current) {
        if (__DEV__) console.log('[InvoiceFlashList] Discarding stale response');
        return;
      }

      if (result.success && result.data) {
        setError(null); // Clear any previous error
        if (isLoadMore) {
          setInvoices(prev => [...prev, ...result.data.invoices]);
        } else {
          setInvoices(result.data.invoices);
        }
        setHasMore(result.data.pagination.has_more);
        setCurrentOffset(offset + (result.data.invoices?.length || 0));
      } else {
        // E1 Fix: Set error state instead of just showing Alert
        setError(result.message || 'Failed to load invoices');
      }
    } catch (err: unknown) {
      // E3 Fix: Skip state updates if component unmounted
      if (!isMountedRef.current) {
        return;
      }
      console.error('[InvoiceFlashList] Error:', err);
      // E1 Fix: Set error state instead of just showing Alert
      const errorMessage = err instanceof Error ? err.message : 'Failed to load invoices';
      setError(errorMessage);
    } finally {
      fetchInProgressRef.current = false;
      // E3 Fix: Only update state if still mounted
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [filters, currentOffset]);

  // E3 Fix: Cleanup on unmount to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initial load and filter changes
  // Note: We depend on filters directly (not fetchInvoices) to avoid
  // re-fetching on offset changes. The callback will have current filters
  // because it's recreated when filters change.
  useEffect(() => {
    // fetchInvoices(false, false) resets to offset 0 and does initial load
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ============================================================================
  // STABLE CALLBACKS (defined outside renderItem)
  // ============================================================================

  const handleRefresh = useCallback(() => {
    fetchInvoices(true);
  }, [fetchInvoices]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      fetchInvoices(false, true);
    }
  }, [isLoadingMore, hasMore, isLoading, fetchInvoices]);

  const handleInvoicePress = useCallback((invoice: Invoice) => {
    if (onItemPress) {
      onItemPress(invoice);
    } else {
      router.push(`/invoice-details/${invoice.invoice_id}`);
    }
  }, [onItemPress]);

  const handleCreateInvoice = useCallback(() => {
    // Reset form state before creating a new invoice
    dispatch(resetInvoiceForm());
    router.push('/invoice-form/step1');
  }, [dispatch]);

  const handleClearFilters = useCallback(() => {
    clearAllFilters();
  }, [clearAllFilters]);

  const openFilterModal = useCallback(() => {
    const logger = createLogger('InvoiceFlashList');
    logger.info(`[FILTER_BUTTON_CLICKED] Opening filter modal`);
    setIsFilterModalVisible(true);
  }, []);

  const closeFilterModal = useCallback(() => {
    const logger = createLogger('InvoiceFlashList');
    logger.info(`[CLOSE_FILTER_MODAL] Closing filter modal`);
    setIsFilterModalVisible(false);
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  const navigateToSettings = useCallback(() => {
    router.push('/settings');
  }, []);

  // ============================================================================
  // FLATTENED DATA (for FlashList)
  // ============================================================================

  const flattenedData = useMemo((): FlattenedItem<Invoice>[] => {
    if (invoices.length === 0) return [];

    // Group by date for section headers
    const groups: Record<string, Invoice[]> = {};
    invoices.forEach(invoice => {
      const dateKey = invoice.invoice_date?.split('T')[0] || 'unknown';
      const formattedDate = formatSectionDate(dateKey);
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
  }, [invoices]);

  // ============================================================================
  // FLASHLIST KEY EXTRACTOR (stable, not inline)
  // ============================================================================

  const keyExtractor = useCallback((item: FlattenedItem<Invoice>) => item.key, []);

  // ============================================================================
  // FLASHLIST RENDER ITEM (memoized, no inline functions)
  // ============================================================================

  const renderItem = useCallback(({ item }: { item: FlattenedItem<Invoice> }) => {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} colors={colors} />;
    }

    return (
      <MemoizedInvoiceItem
        invoice={item.data}
        onPress={handleInvoicePress}
        canPrint={canPrint || false}
        colors={colors}
      />
    );
  }, [handleInvoicePress, canPrint, colors]);

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
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Invoices</Text>
        </View>
        <ListSkeleton count={5} metricsCount={3} />
      </View>
    );
  }

  // E1 Fix: Error state with retry button
  if (error && invoices.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Invoices</Text>
        </View>
        <View style={styles.errorState}>
          <Icon name="alert-circle-outline" size={48} color={colors.gray400} />
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Unable to load invoices</Text>
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
  if (!isLoading && invoices.length === 0 && !error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Invoices</Text>
          <View style={styles.headerActions}>
            <View style={styles.filterBtnContainer}>
              <IconButton
                icon="filter-variant"
                size={22}
                iconColor={colors.gray700}
                onPress={openFilterModal}
              />
              {activeFilterCount > 0 && (
                <Badge size={16} style={[styles.filterBadge, { backgroundColor: colors.primary }]}>{activeFilterCount}</Badge>
              )}
            </View>
          </View>
        </View>
        <EmptyState
          hasFilters={activeFilterCount > 0}
          onClearFilters={handleClearFilters}
          canCreate={canCreateInvoice}
          onCreateInvoice={handleCreateInvoice}
          colors={colors}
        />
        {isFilterModalVisible && (
          <Portal>
            <GenericFilterModal
              visible={isFilterModalVisible}
              onClose={closeFilterModal}
              config={INVOICE_FILTER_CONFIG}
              values={filters}
              onUpdateFilter={updateFilter}
              onClearAll={clearAllFilters}
              activeFilterCount={activeFilterCount}
            />
          </Portal>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Invoices</Text>
        <View style={styles.headerActions}>
          {canCreateInvoice && (
            <IconButton
              icon="plus"
              size={22}
              iconColor={colors.white}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreateInvoice}
            />
          )}
          <View style={styles.filterBtnContainer}>
            <IconButton
              icon="filter-variant"
              size={22}
              iconColor={colors.gray700}
              onPress={openFilterModal}
            />
            {activeFilterCount > 0 && (
              <Badge size={16} style={[styles.filterBadge, { backgroundColor: colors.primary }]}>{activeFilterCount}</Badge>
            )}
          </View>
          <Pressable onPress={navigateToSettings}>
            <Surface style={[styles.avatarSurface, { backgroundColor: colors.gray100 }]} elevation={1}>
              <Text style={[styles.avatarText, { color: colors.textPrimary }]}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </Surface>
          </Pressable>
        </View>
      </View>

      {/* Filter Chips */}
      <FilterChips
        filters={filters}
        activeFilterCount={activeFilterCount}
        updateFilter={updateFilter}
        clearAllFilters={clearAllFilters}
        colors={colors}
      />

      {/* FlashList - The key to performance */}
      <FlashList
        data={flattenedData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={{ canPrint, handleInvoicePress }}
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
            config={INVOICE_FILTER_CONFIG}
            values={filters}
            onUpdateFilter={updateFilter}
            onClearAll={clearAllFilters}
            activeFilterCount={activeFilterCount}
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
  avatarSurface: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    // backgroundColor applied inline for dark mode
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    // color applied inline for dark mode
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
  sectionBadgeText: {
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
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    // backgroundColor applied inline for dark mode
  },
  skeletonBadge: {
    width: 50,
    height: 30,
    borderRadius: 8,
    marginRight: 12,
    // backgroundColor applied inline for dark mode
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonTitle: {
    width: '60%',
    height: 16,
    borderRadius: 4,
    marginBottom: 8,
    // backgroundColor applied inline for dark mode
  },
  skeletonSubtitle: {
    width: '40%',
    height: 12,
    borderRadius: 4,
    // backgroundColor applied inline for dark mode
  },
  skeletonAmount: {
    width: 70,
    height: 24,
    borderRadius: 4,
    // backgroundColor applied inline for dark mode
  },
  snackbar: {
    marginBottom: 80,
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
    gap: 4,
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    height: 32,
    paddingVertical: 0,
  },
  filterChipText: {
    fontSize: 12,
    lineHeight: 16,
  },
});

export default InvoiceFlashList;
