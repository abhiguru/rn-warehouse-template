/**
 * GRN Activity Report Screen (C2)
 *
 * Displays recent GRN activity with items, invoice status, and dispatch summary.
 * GRNs grouped by date with period selector.
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
  ReportEmptyState,
  ReportCustomerSearch,
  getDateRangeForPeriod,
  type KPIItem,
} from '@/components/reports';
import { getCustomerGRNActivity, getAllGRNActivity } from '@/services/reporting/grn-activity-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import type {
  GRNActivityData,
  GRNActivityRecord,
  GRNActivityItem,
  ReportPeriod,
  AllGRNActivityData,
  CustomerGRNSummary,
} from '@/types/report.types';
import { formatNumber, formatWeight, formatDate, formatSectionDate } from '@/utils/formatters';

// ============================================================================
// SAP Fiori Design Tokens (Static - dimensions and typography only)
// ============================================================================
const FIORI_STATIC = {
  dimensions: {
    objectCellMinHeight: 72,
    objectCellImageSize: 44,
    objectCellImageRadius: 10,
    cardCornerRadius: 12,
    cardPadding: 16,
    sectionHeaderHeight: 32,
    touchTarget: 44,
  },
  typography: {
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    title: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
    subtitle: { fontSize: 14, lineHeight: 18 },
    footnote: { fontSize: 13, lineHeight: 16 },
    caption: { fontSize: 12, lineHeight: 16 },
  },
};

// ============================================================================
// Components
// ============================================================================

const FioriSectionHeader: React.FC<{ title: string }> = ({ title }) => {
  const fiori = useFioriColors();
  return (
    <View style={styles.fioriSectionHeader}>
      <Text style={[styles.fioriSectionHeaderText, { color: fiori.colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
};

// Date Section Header (for grouping GRNs by date)
const DateSectionHeader: React.FC<{ date: string }> = ({ date }) => {
  const fiori = useFioriColors();
  return (
    <View style={styles.dateSectionHeader}>
      <View style={[styles.dateSectionLine, { backgroundColor: fiori.colors.divider }]} />
      <Text style={[styles.dateSectionText, { color: fiori.colors.textSecondary }]}>
        {formatSectionDate(date)}
      </Text>
      <View style={[styles.dateSectionLine, { backgroundColor: fiori.colors.divider }]} />
    </View>
  );
};

// GRN Card Component - navigates to details screen
interface GRNCardProps {
  grn: GRNActivityRecord;
}

const GRNCard: React.FC<GRNCardProps> = ({ grn }) => {
  const fiori = useFioriColors();

  const handlePress = () => {
    if (grn.grn_id) {
      router.push(`/grn-details/${grn.grn_id}`);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.fioriCard,
        {
          backgroundColor: fiori.colors.cardBackground,
          borderColor: fiori.colors.border,
        },
        pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`GRN ${grn.gr_no}, ${grn.total_qty} units`}
    >
      <View style={styles.fioriObjectCell}>
        {/* Icon */}
        <View style={[styles.fioriObjectCellImage, { backgroundColor: fiori.colors.tintLight }]}>
          <Icon name="file-document-outline" size={22} color={fiori.colors.tint} />
        </View>

        {/* Content */}
        <View style={styles.fioriObjectCellContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.fioriObjectCellTitle, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
              {grn.gr_no}
            </Text>
            {grn.image_count > 0 && (
              <View style={[styles.imageCountBadge, { backgroundColor: fiori.colors.backgroundGrouped }]}>
                <Icon name="camera" size={12} color={fiori.colors.textSecondary} />
                <Text style={[styles.imageCountText, { color: fiori.colors.textSecondary }]}>{grn.image_count}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.fioriObjectCellSubtitle, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
            {grn.sender_name || 'Unknown Sender'} {grn.supervisor_name ? `• ${grn.supervisor_name}` : ''}
          </Text>
        </View>

        {/* Stock/Dispatch Info */}
        <View style={styles.stockInfo}>
          <Text style={[styles.stockValue, { color: fiori.colors.textPrimary }]}>
            {formatNumber(grn.dispatch_summary.current_stock)}
          </Text>
          <Text style={[styles.stockLabel, { color: fiori.colors.textSecondary }]}>
            / {formatNumber(grn.total_qty)}
          </Text>
        </View>

        {/* Navigate Icon */}
        <Icon
          name="chevron-right"
          size={20}
          color={fiori.colors.textSecondary}
        />
      </View>

      {/* Invoice Status Badge */}
      <View style={styles.statusRow}>
        <View style={[
          styles.statusBadge,
          { backgroundColor: grn.invoice_status.is_invoiced ? fiori.colors.successLight : fiori.colors.warningLight },
        ]}>
          <Icon
            name={grn.invoice_status.is_invoiced ? 'check-circle' : 'clock-outline'}
            size={14}
            color={grn.invoice_status.is_invoiced ? fiori.colors.success : fiori.colors.warning}
          />
          <Text style={[
            styles.statusBadgeText,
            { color: grn.invoice_status.is_invoiced ? fiori.colors.success : fiori.colors.warning },
          ]}>
            {grn.invoice_status.is_invoiced
              ? `Invoiced: ${grn.invoice_status.invoice_number}`
              : 'Not Invoiced'}
          </Text>
        </View>
        {grn.dispatch_summary.dispatch_count > 0 && (
          <Text style={[styles.dispatchCount, { color: fiori.colors.textSecondary }]}>
            {grn.dispatch_summary.dispatch_count} dispatch{grn.dispatch_summary.dispatch_count !== 1 ? 'es' : ''}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

// Customer Card for all-customers view
interface CustomerCardProps {
  customer: CustomerGRNSummary;
  onPress: () => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onPress }) => {
  const fiori = useFioriColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.customerCard,
        pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
      ]}
      onPress={onPress}
    >
      <View style={[styles.customerAvatar, { backgroundColor: fiori.colors.tintLight }]}>
        <Icon name="account-outline" size={22} color={fiori.colors.tint} />
      </View>
      <View style={styles.customerContent}>
        <Text style={[styles.customerName, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
          {customer.customer_name}
        </Text>
        <Text style={[styles.customerSubtitle, { color: fiori.colors.textSecondary }]}>
          {customer.grn_count} GRN{customer.grn_count !== 1 ? 's' : ''} • Latest: {formatDate(customer.latest_grn_date, 'compact')}
        </Text>
      </View>
      <View style={styles.customerQty}>
        <Text style={[styles.customerQtyValue, { color: fiori.colors.textPrimary }]}>
          {formatNumber(customer.total_quantity)}
        </Text>
        <Text style={[styles.customerQtyLabel, { color: fiori.colors.textSecondary }]}>units</Text>
      </View>
      <Icon name="chevron-right" size={20} color={fiori.colors.textSecondary} />
    </Pressable>
  );
};

// ============================================================================
// Main Screen
// ============================================================================

export default function GRNActivityScreen() {
  const fiori = useFioriColors();
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();

  // Role-based access (J12 fix)
  const {
    isStaff,
    singleAssignedCustomerId,
    shouldShowListView,
  } = useRoleBasedAccess();

  const [data, setData] = useState<GRNActivityData | null>(null);
  const [allCustomersData, setAllCustomersData] = useState<AllGRNActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('last120days');
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerGRNSummary | null>(null);

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Check if navigated with a specific customer from Quick Access
  const routeCustomerId = params.customerId;
  const routeCustomerName = params.customerName;

  // Fetch all customers data
  const fetchAllCustomersData = useCallback(async (period: ReportPeriod, showRefresh = false) => {
    const { from, to } = getDateRangeForPeriod(period);

    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await getAllGRNActivity({ fromDate: from, toDate: to });
      if (response.success && response.data) {
        // Backend now filters by user permissions via auth.uid()
        setAllCustomersData(response.data);
      } else {
        setError(response.error || 'Failed to load GRN activity');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch single customer data
  const fetchSingleCustomerData = useCallback(async (customerId: string, period: ReportPeriod, showRefresh = false) => {
    const { from, to } = getDateRangeForPeriod(period);

    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await getCustomerGRNActivity({
        customerId,
        fromDate: from,
        toDate: to,
      });
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to load GRN activity');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch - check for route params first
  useEffect(() => {
    // If navigated with a specific customer from Quick Access, show that customer directly
    if (routeCustomerId) {
      setViewMode('single');
      setSelectedCustomer({
        customer_id: routeCustomerId,
        customer_name: routeCustomerName || '',
        grn_count: 0,
        total_quantity: 0,
        total_weight: 0,
        latest_grn_date: '',
      });
      fetchSingleCustomerData(routeCustomerId, selectedPeriod);
    } else if (shouldShowListView) {
      fetchAllCustomersData(selectedPeriod);
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId, selectedPeriod);
    } else {
      setError('No customer assigned to your account');
      setIsLoading(false);
    }
  }, []);

  // Handle period change
  const handlePeriodChange = useCallback((period: ReportPeriod) => {
    setSelectedPeriod(period);
    if (shouldShowListView && viewMode === 'all') {
      fetchAllCustomersData(period);
    } else if (selectedCustomer) {
      fetchSingleCustomerData(selectedCustomer.customer_id, period);
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId, period);
    }
  }, [shouldShowListView, viewMode, selectedCustomer, singleAssignedCustomerId, fetchAllCustomersData, fetchSingleCustomerData]);

  const handleRefresh = useCallback(() => {
    if (shouldShowListView && viewMode === 'all') {
      fetchAllCustomersData(selectedPeriod, true);
    } else if (selectedCustomer) {
      fetchSingleCustomerData(selectedCustomer.customer_id, selectedPeriod, true);
    } else if (singleAssignedCustomerId) {
      fetchSingleCustomerData(singleAssignedCustomerId, selectedPeriod, true);
    }
  }, [shouldShowListView, viewMode, selectedCustomer, singleAssignedCustomerId, selectedPeriod, fetchAllCustomersData, fetchSingleCustomerData]);

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
        grn_count: 0,
        total_quantity: 0,
        total_weight: 0,
        latest_grn_date: '',
      } as CustomerGRNSummary);
      setViewMode('single');
      setData(null);
      setCustomerSearchQuery('');
      fetchSingleCustomerData(customer.id, selectedPeriod);
    },
    [selectedPeriod, fetchSingleCustomerData],
  );

  const handleCustomerSelect = useCallback((customer: CustomerGRNSummary) => {
    setSelectedCustomer(customer);
    setViewMode('single');
    setData(null);
    fetchSingleCustomerData(customer.customer_id, selectedPeriod);
  }, [selectedPeriod, fetchSingleCustomerData]);

  const handleBackToAll = useCallback(() => {
    // If we came from route params (e.g., Quick Access), go back to previous screen
    if (routeCustomerId) {
      router.back();
      return;
    }
    // Otherwise, go back to the all customers list within this screen
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode('all');
    setSelectedCustomer(null);
    setData(null);
  }, [routeCustomerId]);

  // Group GRNs by date
  const grnsByDate = useMemo(() => {
    if (!data?.grns) return [];
    const grouped: Map<string, GRNActivityRecord[]> = new Map();
    data.grns.forEach((grn) => {
      const date = grn.grn_date;
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date)!.push(grn);
    });
    return Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data?.grns]);

  // KPIs for all customers
  const allCustomersKpis: KPIItem[] = useMemo(() => {
    if (!allCustomersData?.summary) return [];
    const s = allCustomersData.summary;
    return [
      { icon: 'file-document-multiple-outline', value: s.total_grns, label: 'GRNs', variant: 'primary' },
      { icon: 'package-variant', value: s.total_quantity, label: 'Units', variant: 'secondary' },
    ];
  }, [allCustomersData?.summary]);

  // KPIs for single customer
  const singleCustomerKpis: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { icon: 'file-document-multiple-outline', value: s.total_grns, label: 'GRNs', variant: 'primary' },
      { icon: 'package-variant', value: s.total_quantity, label: 'Units', variant: 'secondary' },
      { icon: 'receipt', value: `${s.total_invoiced_grns}/${s.total_grns}`, label: 'Invoiced', variant: 'accent' },
    ];
  }, [data?.summary]);

  const { from, to } = getDateRangeForPeriod(selectedPeriod);
  const dateRangeText = `${formatDate(from, 'compact')} - ${formatDate(to, 'compact')}`;

  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="GRN Activity" />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'file-document-multiple-outline', value: '-', label: 'GRNs', variant: 'primary' },
              { icon: 'package-variant', value: '-', label: 'Units', variant: 'secondary' },
            ]}
            isLoading={true}
            compact
          />
        </View>
      </View>
    );
  }

  // Error
  if (error && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="GRN Activity" />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <ReportEmptyState icon="alert-circle-outline" message="Failed to load data" description={error} />
      </View>
    );
  }

  // All Customers View
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.by_customer.length > 0;

    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="GRN Activity" subtitle={isStaff ? 'All Customers' : 'My Customers'} />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={[styles.dateRangeText, { color: fiori.colors.textSecondary }]}>{dateRangeText}</Text>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[fiori.colors.tint]} />
          }
        >
          <KPIGrid items={allCustomersKpis} isLoading={isLoading} compact />

          {/* Customer Search */}
          <View style={styles.section}>
            <ReportCustomerSearch
              searchQuery={customerSearchQuery}
              onSearchChange={setCustomerSearchQuery}
              onCustomerSelect={handleSearchSelect}
              visibleCustomerIds={allCustomersData.by_customer.map((c) => c.customer_id)}
            />
          </View>

          {filteredCustomers.length > 0 ? (
            <View style={styles.section}>
              <FioriSectionHeader title="Customers" />
              <View style={[
                styles.customersCard,
                { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border },
              ]}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <CustomerCard customer={customer} onPress={() => handleCustomerSelect(customer)} />
                    {index < filteredCustomers.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: fiori.colors.divider }]} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : (
            <ReportEmptyState icon="file-document-outline" message="No GRNs Found" description="No GRNs in the selected period." />
          )}
        </ScrollView>
      </View>
    );
  }

  // Single Customer View
  if (!data?.grns || data.grns.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader
          title="GRN Activity"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || routeCustomerId ? handleBackToAll : undefined}
        />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={[styles.dateRangeText, { color: fiori.colors.textSecondary }]}>{dateRangeText}</Text>
        <ReportEmptyState icon="file-document-outline" message="No GRNs Found" description="No GRNs in the selected period." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
      <ReportHeader
        title="GRN Activity"
        subtitle={selectedCustomer?.customer_name}
        onBack={shouldShowListView || routeCustomerId ? handleBackToAll : undefined}
      />
      <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
      <Text style={[styles.dateRangeText, { color: fiori.colors.textSecondary }]}>{dateRangeText}</Text>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[fiori.colors.tint]} />
        }
      >
        <KPIGrid items={singleCustomerKpis} isLoading={isLoading} compact />

        {/* GRNs grouped by date */}
        <View style={styles.section}>
          {grnsByDate.map(([date, grns]) => (
            <View key={date}>
              <DateSectionHeader date={date} />
              <View style={styles.grnsList}>
                {grns.map((grn) => (
                  <GRNCard key={grn.grn_id} grn={grn} />
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  dateRangeText: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 4,
  },

  section: { marginTop: 8, paddingHorizontal: FIORI_STATIC.dimensions.cardPadding },

  fioriSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: FIORI_STATIC.dimensions.sectionHeaderHeight,
  },
  fioriSectionHeaderText: {
    fontSize: FIORI_STATIC.typography.sectionHeader.fontSize,
    fontWeight: FIORI_STATIC.typography.sectionHeader.fontWeight,
    letterSpacing: FIORI_STATIC.typography.sectionHeader.letterSpacing,
    textTransform: FIORI_STATIC.typography.sectionHeader.textTransform,
  },

  // Date Section Header
  dateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  dateSectionLine: { flex: 1, height: 1 },
  dateSectionText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    textTransform: 'uppercase',
  },

  // GRNs List
  grnsList: { gap: 10 },

  // Card
  fioriCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fioriObjectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.objectCellMinHeight,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  fioriObjectCellImage: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriObjectCellContent: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fioriObjectCellTitle: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  fioriObjectCellSubtitle: { fontSize: 13, marginTop: 2 },

  imageCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  imageCountText: { fontSize: 11 },

  stockInfo: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  stockValue: { fontSize: 15, fontWeight: '600' },
  stockLabel: { fontSize: 12 },

  // Status Row
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingBottom: 12,
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  dispatchCount: { fontSize: 11 },

  // Customers Card
  customersCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  customerAvatar: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerContent: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '600' },
  customerSubtitle: { fontSize: 13, marginTop: 2 },
  customerQty: { alignItems: 'flex-end' },
  customerQtyValue: { fontSize: 15, fontWeight: '600' },
  customerQtyLabel: { fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
});
