/**
 * Dispatch Activity Report Screen (C3)
 *
 * Displays recent dispatch activity with item-level details.
 * Reports pattern (docs/STYLE_GUIDE.md §14.10): period selector, KPI grid,
 * then object cells grouped by date.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  LayoutAnimation,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  ReportHeader,
  KPIGrid,
  PeriodSelector,
  ReportCustomerCard,
  ReportCustomerSearch,
  ReportEmptyState,
  getDateRangeForPeriod,
  type KPIItem,
} from '@/components/reports';
import { getCustomerDispatchActivity, getAllDispatchActivity } from '@/services/reporting';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
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
import type {
  DispatchActivityData,
  DispatchActivityRecord,
  DispatchItemDetail,
  ReportPeriod,
  AllDispatchActivityData,
  CustomerDispatchRow,
} from '@/types/report.types';
import { formatNumber, formatWeight, formatDate, formatSectionDate, formatCount } from '@/utils/formatters';
import { t as tr, type TranslationKey } from '@/i18n';

// Keys, not text: the text is looked up when it is drawn (docs/I18N.md rule 2).
const LOAD_ERROR: TranslationKey = 'reports.dispatchActivity.loadError';
const NO_CUSTOMER_ERROR: TranslationKey = 'reports.dispatchActivity.noCustomer';

const bagsLabel = (qty: number) => formatCount(qty, 'bag');

// ============================================================================
// Styles (tokens only)
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  loadingContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: space.xxxl,
  },
  periodInfo: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
  },
  periodText: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  retryRow: {
    alignItems: 'center' as const,
    paddingBottom: space.xxl,
  },
  retryButton: {
    minHeight: touchTarget,
    minWidth: 120,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  retryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  retryText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  // Section header (guide §13.6)
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    minHeight: 32,
  },
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
  },
  sectionHeaderButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  sectionHeaderAction: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.brand.tint,
  },
  section: {
    marginTop: space.lg,
    paddingHorizontal: layout.marginCompact,
  },
  dateGroup: {
    marginBottom: space.xl,
  },
  dispatchList: {
    gap: space.sm,
  },
  // Cards (guide §13.6)
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  cardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  listCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72, // Inset past the 44 icon + padding
    backgroundColor: t.border.divider,
  },
  objectCell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    gap: space.md,
    backgroundColor: t.surface.card,
  },
  objectCellPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  objectCellImage: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  objectCellContent: {
    flex: 1,
    justifyContent: 'center' as const,
  },
  objectCellTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  objectCellSubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  objectCellAttributes: {
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
  },
  objectCellAttributeValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  objectCellAttributeLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  objectCellAccessory: {
    width: iconSize.lg,
    height: iconSize.lg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  navButton: {
    width: touchTarget,
    height: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: radius.pill,
  },
  navButtonPressed: {
    backgroundColor: t.surface.cardActive,
  },
  // Item rows inside a dispatch card (no shadow: card on card)
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
    gap: space.md,
    backgroundColor: t.background.base,
  },
  itemRowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  itemRowContent: {
    flex: 1,
  },
  itemRowTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexWrap: 'wrap' as const,
  },
  itemRowTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    flexShrink: 1,
  },
  itemRowFootnote: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  itemRowAttributes: {
    alignItems: 'flex-end' as const,
  },
  itemRowQtyRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: space.xxs,
  },
  itemRowQty: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  itemRowOrigQty: {
    ...typography.caption1,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  itemRowWeight: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xxs,
    fontVariant: ['tabular-nums' as const],
  },
  // Neutral tag for the package mark (guide §13.5 InfoChip)
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    alignSelf: 'flex-start' as const,
    backgroundColor: t.status.neutral.background,
  },
  tagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
  },
});

// ============================================================================
// Section Header Component
// ============================================================================
interface FioriSectionHeaderProps {
  title: string;
  action?: {
    label?: string;
    icon?: string;
    onPress: () => void;
  };
}

const FioriSectionHeader: React.FC<FioriSectionHeaderProps> = ({ title, action }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText} accessibilityRole="header">
        {title}
      </Text>
      {action && (
        action.icon ? (
          <Pressable
            onPress={action.onPress}
            style={styles.sectionHeaderButton}
            accessibilityRole="button"
            accessibilityLabel={action.label || title}
          >
            <Icon name={action.icon} size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        ) : (
          <Pressable
            onPress={action.onPress}
            style={styles.sectionHeaderButton}
            accessibilityRole="button"
          >
            <Text style={styles.sectionHeaderAction}>{action.label}</Text>
          </Pressable>
        )
      )}
    </View>
  );
};

// ============================================================================
// Object Cell - Dispatch Card
// ============================================================================
interface DispatchCardProps {
  dispatch: DispatchActivityRecord;
  isExpanded: boolean;
  onToggle: () => void;
}

const DispatchCard: React.FC<DispatchCardProps> = ({ dispatch, isExpanded, onToggle }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleNavigateToDetails = () => {
    if (dispatch.disp_id) {
      router.push(`/dispatch-details/${dispatch.disp_id}`);
    }
  };

  const dateLabel = formatDate(dispatch.disp_date, 'short');

  return (
    <View style={styles.card}>
      {/* Object cell header - toggles the item list */}
      <Pressable
        style={({ pressed }) => [styles.objectCell, pressed && styles.objectCellPressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={tr('reports.dispatchActivity.cardLabel', {
          number: dispatch.disp_no,
          date: dateLabel,
          supervisor: dispatch.supervisor_name,
          bags: bagsLabel(dispatch.total_qty),
        })}
        accessibilityHint={tr(isExpanded ? 'reports.dispatchActivity.hideItemsHint' : 'reports.dispatchActivity.showItemsHint')}
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={styles.objectCellImage}>
          <Icon name="truck-delivery-outline" size={iconSize.md} color={t.brand.tint} />
        </View>

        <View style={styles.objectCellContent}>
          <Text style={styles.objectCellTitle} numberOfLines={2}>
            {tr('reports.customerActivity.dispatchNumber', { number: dispatch.disp_no })}
          </Text>
          <Text style={styles.objectCellSubtitle} numberOfLines={1}>
            {dateLabel} · {dispatch.supervisor_name}
          </Text>
        </View>

        <View style={styles.objectCellAttributes}>
          <Text style={styles.objectCellAttributeValue}>
            {formatNumber(dispatch.total_qty)}
          </Text>
          <Text style={styles.objectCellAttributeLabel}>
            {tr('reports.dispatchActivity.bagUnit', { count: dispatch.total_qty })}
          </Text>
        </View>

        <View style={styles.objectCellAccessory}>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={t.icon.secondary}
          />
        </View>

        {dispatch.disp_id && (
          <Pressable
            style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
            onPress={handleNavigateToDetails}
            accessibilityRole="button"
            accessibilityLabel={tr('reports.dispatchActivity.openDispatch', { number: dispatch.disp_no })}
          >
            <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}
      </Pressable>

      {/* Expandable item list */}
      {isExpanded && dispatch.items.length > 0 && (
        <View style={styles.cardBody}>
          {dispatch.items.map((item, index) => (
            <ItemRow
              key={`${dispatch.disp_id || 'item'}-${index}`}
              item={item}
              isLast={index === dispatch.items.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// Item Row (nested within dispatch card)
// ============================================================================
interface ItemRowProps {
  item: DispatchItemDetail;
  isLast?: boolean;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, isLast = false }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handlePress = () => {
    if (item.source_grn_id) {
      router.push(`/grn-details/${item.source_grn_id}`);
    }
  };

  const isNavigable = !!item.source_grn_id;

  const content = (
    <>
      <View style={styles.itemRowContent}>
        <View style={styles.itemRowTitleRow}>
          <Text style={styles.itemRowTitle} numberOfLines={2}>
            {item.item_name}
          </Text>
          {item.package_mark && (
            <View style={styles.tag}>
              <Text style={styles.tagText} maxFontSizeMultiplier={1.6}>{item.package_mark}</Text>
            </View>
          )}
        </View>
        <Text style={styles.itemRowFootnote} numberOfLines={1}>
          {[tr('reports.customerActivity.grnNumber', { number: item.source_grn }), item.rack].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={styles.itemRowAttributes}>
        <View style={styles.itemRowQtyRow}>
          <Text style={styles.itemRowQty}>{formatNumber(item.qty)}</Text>
          {item.orig_qty && item.orig_qty !== item.qty && (
            <Text style={styles.itemRowOrigQty}>{tr('reports.dispatchActivity.ofQuantity', { quantity: formatNumber(item.orig_qty) })}</Text>
          )}
        </View>
        {item.weight && (
          <Text style={styles.itemRowWeight}>{formatWeight(item.weight)}</Text>
        )}
      </View>

      {isNavigable && (
        <Icon name="chevron-right" size={iconSize.sm} color={t.icon.secondary} />
      )}
    </>
  );

  if (isNavigable) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.itemRow,
          !isLast && styles.itemRowBorder,
          pressed && styles.itemRowPressed,
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={tr('reports.dispatchActivity.itemLabel', { item: item.item_name, bags: bagsLabel(item.qty), grn: item.source_grn })}
        accessibilityHint={tr('reports.dispatchActivity.sourceGrnHint')}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.itemRow, !isLast && styles.itemRowBorder]}
      accessible
      accessibilityLabel={tr('reports.dispatchActivity.itemLabel', { item: item.item_name, bags: bagsLabel(item.qty), grn: item.source_grn })}
    >
      {content}
    </View>
  );
};

// Group dispatches by date for sectioned display
function groupDispatchesByDate(dispatches: DispatchActivityRecord[]): Map<string, DispatchActivityRecord[]> {
  const groups = new Map<string, DispatchActivityRecord[]>();

  dispatches.forEach((dispatch) => {
    const dateKey = dispatch.disp_date.split('T')[0]; // Get just the date part
    const existing = groups.get(dateKey) || [];
    existing.push(dispatch);
    groups.set(dateKey, existing);
  });

  return groups;
}

// CustomerCard moved to @/components/reports/ReportCustomerCard (J14 fix)

export default function DispatchActivityScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Role-based access (J12 fix)
  const {
    isStaff,
    singleAssignedCustomerId,
    shouldShowListView,
  } = useRoleBasedAccess();

  // Route params for direct navigation from customer activity
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();
  const routeCustomerId = params.customerId;
  const routeCustomerName = params.customerName;

  // Track if we came from route params (for back button behavior)
  const cameFromRouteParams = React.useRef(!!routeCustomerId);

  // Single customer data (used for regular users OR drill-down)
  const [data, setData] = useState<DispatchActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [expandedDispatches, setExpandedDispatches] = useState<Set<string>>(new Set());
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('last120days');
  const [dateRange, setDateRange] = useState(() => getDateRangeForPeriod('last120days'));

  // For hierarchical view state
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [allCustomersData, setAllCustomersData] = useState<AllDispatchActivityData | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDispatchRow | null>(null);

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Fetch all customers dispatch activity (staff sees all, regular users see filtered)
  const fetchAllCustomersData = useCallback(async (showRefreshIndicator = false) => {

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await getAllDispatchActivity({
        fromDate: dateRange.from,
        toDate: dateRange.to,
      });

      if (response.success && response.data) {
        // Backend now filters by user permissions via auth.uid()
        setAllCustomersData(response.data);
      } else {
        setError(LOAD_ERROR);
      }
    } catch (err) {
      console.error('[DispatchActivity] Error fetching all customers data:', err);
      setError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dateRange]);

  // Fetch single customer dispatch activity (for drill-down or regular users)
  const fetchSingleCustomerData = useCallback(async (customerId: string, showRefreshIndicator = false) => {
    console.log('[DispatchActivity] fetchSingleCustomerData called, customerId:', customerId);

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await getCustomerDispatchActivity({
        customerId,
        fromDate: dateRange.from,
        toDate: dateRange.to,
      });

      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(LOAD_ERROR);
      }
    } catch (err) {
      console.error('[DispatchActivity] Error fetching single customer data:', err);
      setError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dateRange]);

  // Initial data fetch
  useEffect(() => {
    // If we have route params, go directly to that customer (from Quick Access)
    if (routeCustomerId) {
      setViewMode('single');
      setSelectedCustomer({
        customer_id: routeCustomerId,
        customer_name: routeCustomerName || '',
        dispatch_count: 0,
        total_quantity: 0,
        total_weight: 0,
      });
      fetchSingleCustomerData(routeCustomerId);
    } else if (shouldShowListView) {
      // Staff users or regular users with multiple assigned customers start with list view
      fetchAllCustomersData();
    } else if (singleAssignedCustomerId) {
      // Regular users with only one assigned customer go directly to that customer
      fetchSingleCustomerData(singleAssignedCustomerId);
    } else {
      setError(NO_CUSTOMER_ERROR);
      setIsLoading(false);
    }
  }, []);

  // Handle refresh based on current view
  const handleRefresh = useCallback(() => {
    if (shouldShowListView && viewMode === 'all') {
      fetchAllCustomersData(true);
    } else if (selectedCustomer) {
      fetchSingleCustomerData(selectedCustomer.customer_id, true);
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId, true);
    }
  }, [shouldShowListView, viewMode, selectedCustomer, singleAssignedCustomerId, fetchAllCustomersData, fetchSingleCustomerData]);

  // Filtered customers based on search query
  const filteredCustomers = useMemo(() => {
    if (!allCustomersData?.by_customer) return [];
    if (!customerSearchQuery.trim()) return allCustomersData.by_customer;
    const q = customerSearchQuery.toLowerCase();
    return allCustomersData.by_customer.filter((c) =>
      c.customer_name.toLowerCase().includes(q),
    );
  }, [allCustomersData?.by_customer, customerSearchQuery]);

  // Handle search autocomplete selection
  const handleSearchSelect = useCallback(
    (customer: { id: string; name: string }) => {
      setSelectedCustomer({
        customer_id: customer.id,
        customer_name: customer.name,
        dispatch_count: 0,
        total_quantity: 0,
        total_weight: 0,
      } as CustomerDispatchRow);
      setViewMode('single');
      setData(null);
      setCustomerSearchQuery('');
      fetchSingleCustomerData(customer.id);
    },
    [fetchSingleCustomerData],
  );

  // Handle customer selection (drill-down)
  const handleCustomerSelect = useCallback((customer: CustomerDispatchRow) => {
    setSelectedCustomer(customer);
    setViewMode('single');
    setData(null); // Clear previous single-customer data
    fetchSingleCustomerData(customer.customer_id);
  }, [fetchSingleCustomerData]);

  // Handle back to all-customers view
  const handleBackToAll = useCallback(() => {
    // If we came from route params (Quick Access), go back to previous screen
    if (cameFromRouteParams.current) {
      router.back();
      return;
    }
    // Otherwise, go back to all-customers list view
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode('all');
    setSelectedCustomer(null);
    setData(null);
    setExpandedDispatches(new Set());
  }, []);

  // Handle period change - refetch data with new date range
  const handlePeriodChange = useCallback((period: ReportPeriod, range: { from: string; to: string }) => {
    setSelectedPeriod(period);
    setDateRange(range);
  }, []);

  // Refetch when date range changes
  useEffect(() => {
    if (shouldShowListView && viewMode === 'all') {
      fetchAllCustomersData();
    } else if (selectedCustomer) {
      fetchSingleCustomerData(selectedCustomer.customer_id);
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId);
    }
    // Only trigger on dateRange change, not on initial mount (handled by separate effect)
  }, [dateRange]);

  // Generate unique key for dispatch (disp_id may be undefined)
  const getDispatchKey = useCallback((dispatch: DispatchActivityRecord, dateKey: string, index: number): string => {
    return dispatch.disp_id || `${dispatch.disp_no}_${dateKey}_${index}`;
  }, []);

  const toggleDispatch = useCallback((dispatchKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDispatches((prev) => {
      const next = new Set(prev);
      if (next.has(dispatchKey)) {
        next.delete(dispatchKey);
      } else {
        next.add(dispatchKey);
      }
      return next;
    });
  }, []);

  // Build KPI items for all-customers view
  const allCustomersKpiItems: KPIItem[] = useMemo(() => {
    if (!allCustomersData?.summary) return [];

    const summary = allCustomersData.summary;
    return [
      {
        icon: 'truck-delivery-outline',
        value: summary.total_dispatches,
        label: tr('reports.customerActivity.dispatches'),
        variant: 'primary',
      },
      {
        icon: 'package-variant',
        value: summary.total_quantity,
        label: tr('reports.dispatchActivity.bagsDispatched'),
        variant: 'secondary',
      },
    ];
  }, [allCustomersData?.summary]);

  // Build KPI items for single-customer view
  const singleCustomerKpiItems: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];

    const summary = data.summary;
    return [
      {
        icon: 'truck-delivery-outline',
        value: summary.total_dispatches,
        label: tr('reports.customerActivity.dispatches'),
        variant: 'secondary',
      },
      {
        icon: 'package-variant',
        value: summary.total_quantity,
        label: tr('reports.dispatchActivity.bagsDispatched'),
        variant: 'primary',
      },
    ];
  }, [data?.summary]);

  // Group dispatches by date
  const groupedDispatches = useMemo(() => {
    if (!data?.dispatches) return new Map();
    return groupDispatchesByDate(data.dispatches);
  }, [data?.dispatches]);

  const getDateRangeSubtitle = (): string => {
    return tr('reports.dispatchActivity.dateRange', {
      from: formatDate(dateRange.from, 'medium'),
      to: formatDate(dateRange.to, 'medium'),
    });
  };

  // Retry after a failed load (same fetch as the current view, with the full loading state)
  const handleRetry = useCallback(() => {
    if (shouldShowListView && viewMode === 'all') {
      fetchAllCustomersData();
    } else if (selectedCustomer) {
      fetchSingleCustomerData(selectedCustomer.customer_id);
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId);
    }
  }, [shouldShowListView, viewMode, selectedCustomer, singleAssignedCustomerId, fetchAllCustomersData, fetchSingleCustomerData]);

  // Determine which view to show
  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Subtitle for list view
  const listViewSubtitle = tr(isStaff ? 'reports.customerActivity.allCustomers' : 'reports.customerActivity.myCustomers');

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[t.brand.tint]}
      tintColor={t.brand.tint}
      progressBackgroundColor={t.surface.card}
    />
  );

  // Loading skeleton
  if (isLoading && !hasData) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.dispatchActivity')} />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'truck-delivery-outline', value: '-', label: tr('reports.customerActivity.dispatches'), variant: 'secondary' },
              { icon: 'package-variant', value: '-', label: tr('reports.dispatchActivity.bagsDispatched'), variant: 'primary' },
            ]}
            isLoading={true}
            compact
          />
        </View>
      </View>
    );
  }

  // Error state
  if (error && !hasData) {
    const canRetry = Boolean(
      (shouldShowListView && viewMode === 'all') || selectedCustomer || singleAssignedCustomerId
    );
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.dispatchActivity')} />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <ReportEmptyState
          icon="alert-circle-outline"
          message={tr('reports.dispatchActivity.errorTitle')}
          description={tr(error)}
        />
        {canRetry && (
          <View style={styles.retryRow}>
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={tr('reports.dispatchActivity.retryLabel')}
            >
              <Text style={styles.retryText}>{tr('common.retry')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // List View (Staff sees all customers, regular users see their assigned customers)
  if (isListView && allCustomersData) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.dispatchActivity')} subtitle={listViewSubtitle} />

        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {/* KPI Summary */}
          <KPIGrid items={allCustomersKpiItems} isLoading={isLoading} compact />

          {/* Period Info */}
          <View style={styles.periodInfo}>
            <Text style={styles.periodText}>{getDateRangeSubtitle()}</Text>
          </View>

          {/* Customer Search */}
          <View style={styles.section}>
            <ReportCustomerSearch
              searchQuery={customerSearchQuery}
              onSearchChange={setCustomerSearchQuery}
              onCustomerSelect={handleSearchSelect}
              visibleCustomerIds={allCustomersData.by_customer.map((c) => c.customer_id)}
            />
          </View>

          {/* Customers List */}
          {filteredCustomers.length > 0 ? (
            <View style={styles.section}>
              <FioriSectionHeader title={tr('reports.dispatchActivity.customersWithDispatches')} />
              <View style={styles.listCard}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <ReportCustomerCard
                      customerId={customer.customer_id}
                      title={customer.customer_name}
                      subtitle={formatCount(customer.dispatch_count, 'dispatch', 'dispatches')}
                      value={customer.total_quantity}
                      valueLabel={tr('reports.dispatchActivity.bagUnit', { count: customer.total_quantity })}
                      onPress={() => handleCustomerSelect(customer)}
                      accessibilityHint={tr('reports.dispatchActivity.customerHint')}
                    />
                    {index < filteredCustomers.length - 1 && (
                      <View style={styles.divider} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : customerSearchQuery.trim() && allCustomersData.by_customer.length > 0 ? (
            <ReportEmptyState
              icon="magnify"
              message={tr('reports.dispatchActivity.noMatch', { search: customerSearchQuery.trim() })}
              description={tr('reports.dispatchActivity.tryFewerLetters')}
            />
          ) : (
            <ReportEmptyState
              icon="truck-delivery-outline"
              message={tr('reports.dispatchActivity.emptyTitle')}
              description={tr('reports.dispatchActivity.emptyDescription')}
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // Single Customer View (for single-assigned users or drill-down from list view)
  // Empty state
  if (!data?.dispatches || data.dispatches.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader
          title={tr('reports.titles.dispatchActivity')}
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
        />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <ReportEmptyState
          icon="truck-delivery-outline"
          message={tr('reports.dispatchActivity.emptyTitle')}
          description={tr('reports.dispatchActivity.emptyCustomerDescription')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReportHeader
        title={tr('reports.titles.dispatchActivity')}
        subtitle={selectedCustomer?.customer_name || getDateRangeSubtitle()}
        onBack={shouldShowListView ? handleBackToAll : undefined}
      />

      <PeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodChange={handlePeriodChange}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* KPI Summary */}
        <KPIGrid items={singleCustomerKpiItems} isLoading={isLoading} compact />

        {/* Dispatches list, grouped by date */}
        <View style={styles.section}>
          {Array.from(groupedDispatches.entries()).map(([date, dispatches]) => (
            <View key={date} style={styles.dateGroup}>
              <FioriSectionHeader title={formatSectionDate(date)} />
              <View style={styles.dispatchList}>
                {dispatches.map((dispatch: DispatchActivityRecord, index: number) => {
                  const dispatchKey = getDispatchKey(dispatch, date, index);
                  return (
                    <DispatchCard
                      key={dispatchKey}
                      dispatch={dispatch}
                      isExpanded={expandedDispatches.has(dispatchKey)}
                      onToggle={() => toggleDispatch(dispatchKey)}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
