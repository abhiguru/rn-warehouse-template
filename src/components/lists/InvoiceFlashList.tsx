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

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Badge, IconButton, Portal, Snackbar } from 'react-native-paper';
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
import { getAssignedCustomerInvoices, getInvoicesList, Invoice } from '@/services/invoice-service';

// Components
import { MemoizedInvoiceItem } from '@/components/list-items';
import { GenericFilterModal } from '@/components/filters';

// State
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { resetForm as resetInvoiceForm } from '@/store/slices/invoiceFormSlice';
import { usePermissions } from '@/hooks/usePermissions';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useFilterState } from '@/hooks/useFilterState';
import type { AutocompleteSelection, FilterValues, FilterValueType } from '@/types/filter.types';

// Config
import { INVOICE_FILTER_CONFIG } from '@/config/filterConfigs';
import { formatCount, formatCurrency, formatDate, formatSectionDate, toLocalISODate } from '@/utils/formatters';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { Avatar } from '@/components/ui/Avatar';
import { createLogger } from '@/utils/logger';

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
  /** Initial filter values */
  initialFilters?: Record<string, any>;
}

/** Amounts in filter chips: summary money, no decimals (§12.3). */
const inr = (amount: number) => formatCurrency(amount, { maximumFractionDigits: 0 });

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
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  canCreate: boolean;
  onCreateInvoice: () => void;
}

// Empty state: the shared ListEmptyState with the invoice wording (style guide §13.6)
const EmptyState = React.memo<EmptyStateProps>(({
  hasFilters,
  onClearFilters,
  canCreate,
  onCreateInvoice,
}) => (
  <ListEmptyState
    activeFilterCount={hasFilters ? 1 : 0}
    emptyIcon="file-document-outline"
    emptyTitle="No invoices yet"
    emptySubtitle={canCreate ? 'Invoices you create appear here.' : 'Invoices appear here once they are created.'}
    filteredTitle="No invoices match these filters"
    filteredSubtitle="Try fewer filters, or clear them to see all invoices."
    onClearFilters={onClearFilters}
    showCreateButton={canCreate}
    createButtonLabel="Create invoice"
    onCreatePress={onCreateInvoice}
  />
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

  // Customer chips
  if (filters.customerName?.length > 0) {
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

  // Invoice number range chips
  if (filters.invoiceNoFrom?.length > 0) {
    chips.push({
      key: 'inv-from',
      label: `From ${filters.invoiceNoFrom[0].label}`,
      icon: 'file-document-outline',
      onRemove: () => updateFilter('invoiceNoFrom', []),
    });
  }
  if (filters.invoiceNoTo?.length > 0) {
    chips.push({
      key: 'inv-to',
      label: `To ${filters.invoiceNoTo[0].label}`,
      icon: 'file-document-outline',
      onRemove: () => updateFilter('invoiceNoTo', []),
    });
  }

  // Payment status chip
  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    const statusLabels: Record<string, string> = {
      paid: 'Paid',
      unpaid: 'Unpaid',
      partial: 'Partly paid',
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
    const min = inr(Number(filters.amountMin || 0));
    chips.push({
      key: 'amount-range',
      label: filters.amountMax ? `${min} – ${inr(Number(filters.amountMax))}` : `${min} or more`,
      icon: 'currency-inr',
      onRemove: () => {
        updateFilter('amountMin', undefined);
        updateFilter('amountMax', undefined);
      },
    });
  }

  // Date range chip
  if (filters.dateFrom || filters.dateTo) {
    const fromDate = filters.dateFrom ? formatDate(filters.dateFrom as string) : '';
    const toDate = filters.dateTo ? formatDate(filters.dateTo as string) : '';
    chips.push({
      key: 'date-range',
      label: fromDate && toDate ? `${fromDate} – ${toDate}` : fromDate ? `From ${fromDate}` : `Until ${toDate}`,
      icon: 'calendar-range',
      onRemove: () => {
        updateFilter('dateFrom', undefined);
        updateFilter('dateTo', undefined);
      },
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

const InvoiceFlashList: React.FC<InvoiceFlashListProps> = ({
  onItemPress,
  initialFilters,
}) => {
  const fetchInProgressRef = useRef(false);

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
          ? toLocalISODate(filters.dateFrom)
          : filters.dateFrom;
        params.p_date_from = dateFrom;
        console.log('[InvoiceFlashList] Applied dateFrom:', params.p_date_from);
      }
      if (filters.dateTo) {
        const dateTo = filters.dateTo instanceof Date
          ? toLocalISODate(filters.dateTo)
          : filters.dateTo;
        params.p_date_to = dateTo;
        console.log('[InvoiceFlashList] Applied dateTo:', params.p_date_to);
      }

      console.log('[InvoiceFlashList] Final params:', JSON.stringify(params, null, 2));

      // The all-customers list is for warehouse roles; customer accounts read
      // their assigned customers' invoices.
      const result = isWarehouseRole
        ? await getInvoicesList(params)
        : await getAssignedCustomerInvoices(assignedCustomerIds, { ...params, customerNames: assignedCustomerNames });

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
  }, [filters, currentOffset, isWarehouseRole, assignedCustomerIds, assignedCustomerNames]);

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
      return <SectionHeader title={item.title} count={item.count} />;
    }

    return (
      <MemoizedInvoiceItem
        invoice={item.data}
        onPress={handleInvoicePress}
        canPrint={canPrint || false}
      />
    );
  }, [handleInvoicePress, canPrint]);

  // ============================================================================
  // LIST FOOTER
  // ============================================================================

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

  const userName = userProfile?.name || 'U';

  const filterButton = (
    <View style={styles.filterBtnContainer}>
      <IconButton
        icon="filter-variant"
        size={iconSize.lg}
        iconColor={activeFilterCount > 0 ? t.brand.tint : t.icon.primary}
        style={styles.iconButton}
        onPress={openFilterModal}
        accessibilityLabel={activeFilterCount > 0 ? `Filter invoices, ${activeFilterCount} active` : 'Filter invoices'}
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
          <Text style={styles.headerTitle} accessibilityRole="header">Invoices</Text>
        </View>
        <ListSkeleton count={5} metricsCount={3} />
      </View>
    );
  }

  // E1 Fix: Error state with retry button
  if (error && invoices.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Invoices</Text>
        </View>
        <ErrorStateView
          presentation="inline"
          title="Couldn't load invoices"
          message="Check your connection and try again."
          onRetry={handleRefresh}
        />
      </View>
    );
  }

  // Empty state
  if (!isLoading && invoices.length === 0 && !error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Invoices</Text>
          <View style={styles.headerActions}>{filterButton}</View>
        </View>
        <EmptyState
          hasFilters={activeFilterCount > 0}
          onClearFilters={handleClearFilters}
          canCreate={canCreateInvoice}
          onCreateInvoice={handleCreateInvoice}
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">Invoices</Text>
        <View style={styles.headerActions}>
          {filterButton}
          <Pressable
            onPress={navigateToSettings}
            style={styles.avatarButton}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Avatar name={userName} id={userProfile?.id} size="sm" />
          </Pressable>
        </View>
      </View>

      {/* Filter Chips */}
      <FilterChips
        filters={filters}
        activeFilterCount={activeFilterCount}
        updateFilter={updateFilter}
        clearAllFilters={clearAllFilters}
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

export default InvoiceFlashList;
