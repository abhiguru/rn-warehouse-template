/**
 * Dispatch Activity Report Screen (C3)
 *
 * Displays recent dispatch activity with item-level details.
 * 100% SAP Fiori compliant following design specs.
 *
 * @see design/sap-fiori-specs/01-object-cell.md - Object Cell pattern
 * @see design/sap-fiori-specs/13-card.md - Card structure
 * @see design/sap-fiori-specs/14-section-header.md - Section Header pattern
 * @see design/sap-fiori-specs/18-tags-badges.md - Tags/Badges
 * @see design/sap-fiori-specs/12-empty-state.md - Empty State pattern
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import type {
  DispatchActivityData,
  DispatchActivityRecord,
  DispatchItemDetail,
  ReportPeriod,
  AllDispatchActivityData,
  CustomerDispatchRow,
} from '@/types/report.types';
import { formatNumber, formatWeight, formatDate, formatSectionDate } from '@/utils/formatters';

// ============================================================================
// SAP Fiori Design Tokens - Static values (dimensions, typography)
// Colors are now dynamic via useFioriColors hook
// ============================================================================
const FIORI_STATIC = {
  // Dimensions from Fiori spec
  dimensions: {
    objectCellMinHeight: 72,
    objectCellImageSize: 44,
    objectCellImageRadius: 10,
    cardCornerRadius: 12,
    cardPadding: 16,
    cardBodyPadding: 16,
    sectionHeaderHeight: 32,
    touchTarget: 44,
    iconButtonSize: 24,
  },
  // Typography from Fiori spec
  typography: {
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    title: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 18,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 16,
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
    },
  },
};

// ============================================================================
// Fiori Section Header Component
// @see design/sap-fiori-specs/14-section-header.md
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
  const FIORI = useFioriColors();

  return (
    <View style={[styles.fioriSectionHeader, { backgroundColor: 'transparent' }]}>
      <Text style={[styles.fioriSectionHeaderText, { color: FIORI.colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      {action && (
        action.icon ? (
          <TouchableOpacity
            onPress={action.onPress}
            style={styles.fioriSectionHeaderButton}
            accessibilityRole="button"
            accessibilityLabel={action.label || title}
          >
            <Icon name={action.icon} size={20} color={FIORI.colors.tint} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={action.onPress}
            style={styles.fioriSectionHeaderButton}
            accessibilityRole="button"
          >
            <Text style={[styles.fioriSectionHeaderAction, { color: FIORI.colors.tint }]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
};

// ============================================================================
// Fiori Object Cell - Dispatch Card
// @see design/sap-fiori-specs/01-object-cell.md
// ============================================================================
interface DispatchCardProps {
  dispatch: DispatchActivityRecord;
  isExpanded: boolean;
  onToggle: () => void;
}

const DispatchCard: React.FC<DispatchCardProps> = ({ dispatch, isExpanded, onToggle }) => {
  const FIORI = useFioriColors();

  const handleNavigateToDetails = () => {
    if (dispatch.disp_id) {
      router.push(`/dispatch-details/${dispatch.disp_id}`);
    }
  };

  return (
    <View style={[styles.fioriCard, { backgroundColor: FIORI.colors.background, borderColor: FIORI.colors.divider }]}>
      {/* Object Cell Header - Main touchable area */}
      <Pressable
        style={({ pressed }) => [
          styles.fioriObjectCell,
          { backgroundColor: FIORI.colors.background },
          pressed && { backgroundColor: FIORI.colors.backgroundSecondary },
        ]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Dispatch ${dispatch.disp_no}, ${dispatch.total_qty} units`}
        accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to expand items'}
      >
        {/* A. Detail Image (44pt per Fiori spec) */}
        <View style={[styles.fioriObjectCellImage, { backgroundColor: FIORI.colors.infoLight }]}>
          <Icon name="truck-fast" size={22} color={FIORI.colors.info} />
        </View>

        {/* C. Main Content */}
        <View style={styles.fioriObjectCellContent}>
          {/* Title (mandatory) */}
          <Text style={[styles.fioriObjectCellTitle, { color: FIORI.colors.textPrimary }]} numberOfLines={1}>
            {dispatch.disp_no}
          </Text>
          {/* Subtitle */}
          <Text style={[styles.fioriObjectCellSubtitle, { color: FIORI.colors.textSecondary }]} numberOfLines={1}>
            {formatDate(dispatch.disp_date, 'short')} • {dispatch.supervisor_name}
          </Text>
        </View>

        {/* E. Attributes */}
        <View style={styles.fioriObjectCellAttributes}>
          <Text style={[styles.fioriObjectCellAttributeValue, { color: FIORI.colors.textPrimary }]}>
            {formatNumber(dispatch.total_qty)}
          </Text>
          <Text style={[styles.fioriObjectCellAttributeLabel, { color: FIORI.colors.textSecondary }]}>units</Text>
        </View>

        {/* F. Accessory View - Expand/Collapse */}
        <View style={styles.fioriObjectCellAccessory}>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={FIORI.colors.textSecondary}
          />
        </View>

        {/* F. Accessory View - Navigation (if navigable) */}
        {dispatch.disp_id && (
          <TouchableOpacity
            style={styles.fioriObjectCellNavButton}
            onPress={handleNavigateToDetails}
            accessibilityRole="button"
            accessibilityLabel="View dispatch details"
          >
            <Icon name="chevron-right" size={20} color={FIORI.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </Pressable>

      {/* Expandable Item List */}
      {isExpanded && dispatch.items.length > 0 && (
        <View style={[styles.fioriCardBody, { backgroundColor: FIORI.colors.backgroundSecondary, borderTopColor: FIORI.colors.divider }]}>
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
// Fiori Object Cell - Item Row (nested within dispatch card)
// @see design/sap-fiori-specs/01-object-cell.md
// ============================================================================
interface ItemRowProps {
  item: DispatchItemDetail;
  isLast?: boolean;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, isLast = false }) => {
  const FIORI = useFioriColors();

  const handlePress = () => {
    if (item.source_grn_id) {
      router.push(`/grn-details/${item.source_grn_id}`);
    }
  };

  const isNavigable = !!item.source_grn_id;

  const content = (
    <>
      {/* Main Content */}
      <View style={styles.fioriItemRowContent}>
        {/* Title with Tag */}
        <View style={styles.fioriItemRowTitleRow}>
          <Text style={[styles.fioriItemRowTitle, { color: FIORI.colors.textPrimary }]} numberOfLines={1}>
            {item.item_name}
          </Text>
          {/* Fiori Tag/Badge for package mark */}
          {item.package_mark && (
            <View style={[styles.fioriTag, { backgroundColor: FIORI.colors.infoLight }]}>
              <Text style={[styles.fioriTagText, { color: FIORI.colors.info }]}>{item.package_mark}</Text>
            </View>
          )}
        </View>
        {/* Footnote */}
        <Text style={[styles.fioriItemRowFootnote, { color: FIORI.colors.textSecondary }]} numberOfLines={1}>
          {[`From: ${item.source_grn}`, item.rack].filter(Boolean).join(' • ')}
        </Text>
      </View>

      {/* Attributes */}
      <View style={styles.fioriItemRowAttributes}>
        <View style={styles.fioriItemRowQtyRow}>
          <Text style={[styles.fioriItemRowQty, { color: FIORI.colors.textPrimary }]}>{formatNumber(item.qty)}</Text>
          {item.orig_qty && item.orig_qty !== item.qty && (
            <Text style={[styles.fioriItemRowOrigQty, { color: FIORI.colors.textSecondary }]}>/ {formatNumber(item.orig_qty)}</Text>
          )}
        </View>
        {item.weight && (
          <Text style={[styles.fioriItemRowWeight, { color: FIORI.colors.textSecondary }]}>{formatWeight(item.weight)}</Text>
        )}
      </View>

      {/* Accessory - Navigation Chevron */}
      {isNavigable && (
        <Icon name="chevron-right" size={16} color={FIORI.colors.textSecondary} />
      )}
    </>
  );

  if (isNavigable) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.fioriItemRow,
          { backgroundColor: FIORI.colors.backgroundSecondary },
          !isLast && [styles.fioriItemRowBorder, { borderBottomColor: FIORI.colors.divider }],
          pressed && { backgroundColor: FIORI.colors.cardBackgroundPressed },
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${item.item_name}, ${item.qty} units`}
        accessibilityHint="Tap to view source GRN"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[
      styles.fioriItemRow,
      { backgroundColor: FIORI.colors.backgroundSecondary },
      !isLast && [styles.fioriItemRowBorder, { borderBottomColor: FIORI.colors.divider }],
    ]}>
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
  const FIORI = useFioriColors();

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
  const [error, setError] = useState<string | null>(null);
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
        setError(response.error || 'Failed to load dispatch activity');
      }
    } catch (err) {
      console.error('[DispatchActivity] Error fetching all customers data:', err);
      setError('An unexpected error occurred');
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
        setError(response.error || 'Failed to load dispatch activity');
      }
    } catch (err) {
      console.error('[DispatchActivity] Error fetching single customer data:', err);
      setError('An unexpected error occurred');
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
      setError('No customer assigned to your account');
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
        icon: 'truck-fast',
        value: summary.total_dispatches,
        label: 'Dispatches',
        variant: 'primary',
      },
      {
        icon: 'package-variant',
        value: summary.total_quantity,
        label: 'Units Dispatched',
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
        icon: 'truck-fast',
        value: summary.total_dispatches,
        label: 'Dispatches',
        variant: 'secondary',
      },
      {
        icon: 'package-variant',
        value: summary.total_quantity,
        label: 'Units Dispatched',
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
    return `${formatDate(dateRange.from, 'short')} - ${formatDate(dateRange.to, 'short')}`;
  };

  // Determine which view to show
  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Subtitle for list view
  const listViewSubtitle = isStaff ? 'All Customers' : 'My Customers';

  // Loading skeleton
  if (isLoading && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader title="Dispatch Activity" />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'truck-fast', value: '-', label: 'Dispatches', variant: 'secondary' },
              { icon: 'package-variant', value: '-', label: 'Units Dispatched', variant: 'primary' },
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
    return (
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader title="Dispatch Activity" />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <ReportEmptyState
          icon="alert-circle-outline"
          message="Failed to load data"
          description={error}
        />
      </View>
    );
  }

  // List View (Staff sees all customers, regular users see their assigned customers)
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.by_customer.length > 0;

    return (
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader title="Dispatch Activity" subtitle={listViewSubtitle} />

        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[FIORI.colors.tint]}
              tintColor={FIORI.colors.tint}
            />
          }
        >
          {/* KPI Summary */}
          <KPIGrid items={allCustomersKpiItems} isLoading={isLoading} compact />

          {/* Period Info */}
          <View style={styles.periodInfo}>
            <Text style={[styles.periodText, { color: FIORI.colors.textSecondary }]}>{getDateRangeSubtitle()}</Text>
          </View>

          {/* Customer Search */}
          <View style={styles.fioriSection}>
            <ReportCustomerSearch
              searchQuery={customerSearchQuery}
              onSearchChange={setCustomerSearchQuery}
              onCustomerSelect={handleSearchSelect}
              visibleCustomerIds={allCustomersData.by_customer.map((c) => c.customer_id)}
            />
          </View>

          {/* Customers List - Fiori List Card Pattern */}
          {filteredCustomers.length > 0 ? (
            <View style={styles.fioriSection}>
              <FioriSectionHeader title="Customers with Dispatches" />
              <View style={[styles.fioriListCard, { backgroundColor: FIORI.colors.background, borderColor: FIORI.colors.divider }]}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <ReportCustomerCard
                      title={customer.customer_name}
                      subtitle={`${customer.dispatch_count} dispatch${customer.dispatch_count !== 1 ? 'es' : ''}`}
                      value={customer.total_quantity}
                      valueLabel="units"
                      onPress={() => handleCustomerSelect(customer)}
                      accessibilityHint="Tap to view customer dispatches"
                    />
                    {index < filteredCustomers.length - 1 && (
                      <View style={[styles.fioriDivider, { backgroundColor: FIORI.colors.divider }]} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : (
            <ReportEmptyState
              icon="truck-remove-outline"
              message="No Dispatches Found"
              description="No dispatch activity in the selected period."
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
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader
          title="Dispatch Activity"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
        />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <ReportEmptyState
          icon="truck-remove-outline"
          message="No Dispatches Found"
          description="No dispatch activity in the selected period for this customer."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
      <ReportHeader
        title="Dispatch Activity"
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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[FIORI.colors.tint]}
            tintColor={FIORI.colors.tint}
          />
        }
      >
        {/* KPI Summary */}
        <KPIGrid items={singleCustomerKpiItems} isLoading={isLoading} compact />

        {/* Dispatches List - Grouped by Date with Fiori Section Headers */}
        <View style={styles.fioriSection}>
          {Array.from(groupedDispatches.entries()).map(([date, dispatches]) => (
            <View key={date} style={styles.fioriDateGroup}>
              <FioriSectionHeader title={formatSectionDate(date)} />
              <View style={styles.fioriDispatchList}>
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

// ============================================================================
// SAP Fiori Compliant Styles
// ============================================================================
// Colors are applied dynamically via inline styles using useFioriColors hook
// ============================================================================
const styles = StyleSheet.create({
  // =========================================================================
  // Layout
  // =========================================================================
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // =========================================================================
  // Period Info
  // =========================================================================
  periodInfo: {
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 8,
  },
  periodText: {
    fontSize: FIORI_STATIC.typography.footnote.fontSize,
    textAlign: 'center',
  },

  // =========================================================================
  // Fiori Section Header (14-section-header.md)
  // =========================================================================
  fioriSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: FIORI_STATIC.dimensions.sectionHeaderHeight,
    backgroundColor: 'transparent',
  },
  fioriSectionHeaderText: {
    fontSize: FIORI_STATIC.typography.sectionHeader.fontSize,
    fontWeight: FIORI_STATIC.typography.sectionHeader.fontWeight,
    letterSpacing: FIORI_STATIC.typography.sectionHeader.letterSpacing,
    textTransform: FIORI_STATIC.typography.sectionHeader.textTransform,
  },
  fioriSectionHeaderButton: {
    minWidth: FIORI_STATIC.dimensions.touchTarget,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriSectionHeaderAction: {
    fontSize: 14,
    fontWeight: '500',
  },

  // =========================================================================
  // Fiori Section Container
  // =========================================================================
  fioriSection: {
    marginTop: 16,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
  },
  fioriDateGroup: {
    marginBottom: 20,
  },
  fioriDispatchList: {
    gap: 10,
  },

  // =========================================================================
  // Fiori Card Container (13-card.md)
  // =========================================================================
  fioriCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fioriCardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fioriListCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fioriDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72, // Align with content after image
  },

  // =========================================================================
  // Fiori Object Cell (01-object-cell.md)
  // =========================================================================
  fioriObjectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  fioriObjectCellCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },

  // B. Detail Image (44pt per Fiori spec)
  fioriObjectCellImage: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriObjectCellImagePrimary: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // C. Main Content
  fioriObjectCellContent: {
    flex: 1,
    justifyContent: 'center',
  },
  fioriObjectCellTitle: {
    fontSize: FIORI_STATIC.typography.title.fontSize,
    fontWeight: FIORI_STATIC.typography.title.fontWeight,
    lineHeight: FIORI_STATIC.typography.title.lineHeight,
  },
  fioriObjectCellSubtitle: {
    fontSize: FIORI_STATIC.typography.subtitle.fontSize,
    lineHeight: FIORI_STATIC.typography.subtitle.lineHeight,
    marginTop: 2,
  },

  // E. Attributes
  fioriObjectCellAttributes: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  fioriObjectCellAttributeValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  fioriObjectCellAttributeLabel: {
    fontSize: FIORI_STATIC.typography.caption.fontSize,
    lineHeight: FIORI_STATIC.typography.caption.lineHeight,
  },

  // F. Accessory View
  fioriObjectCellAccessory: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriObjectCellNavButton: {
    width: FIORI_STATIC.dimensions.touchTarget,
    height: FIORI_STATIC.dimensions.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },

  // =========================================================================
  // Fiori Item Row (nested Object Cell)
  // =========================================================================
  fioriItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  fioriItemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fioriItemRowContent: {
    flex: 1,
  },
  fioriItemRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fioriItemRowTitle: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  fioriItemRowFootnote: {
    fontSize: FIORI_STATIC.typography.footnote.fontSize,
    lineHeight: FIORI_STATIC.typography.footnote.lineHeight,
    marginTop: 3,
  },
  fioriItemRowAttributes: {
    alignItems: 'flex-end',
  },
  fioriItemRowQtyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  fioriItemRowQty: {
    fontSize: 15,
    fontWeight: '600',
  },
  fioriItemRowOrigQty: {
    fontSize: 12,
  },
  fioriItemRowWeight: {
    fontSize: FIORI_STATIC.typography.caption.fontSize,
    marginTop: 2,
  },

  // =========================================================================
  // Fiori Tags/Badges (18-tags-badges.md)
  // =========================================================================
  fioriTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10, // Pill shape per Fiori spec
    alignSelf: 'flex-start',
  },
  fioriTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
