/**
 * Invoice History Report Screen (C4)
 *
 * Displays invoice history with line items, payment status, and monthly breakdown.
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
  ReportEmptyState,
  ReportCustomerSearch,
  getDateRangeForPeriod,
  type KPIItem,
} from '@/components/reports';
import { getCustomerInvoiceHistory, getAllInvoiceHistory } from '@/services/reporting/invoice-history-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import type {
  InvoiceHistoryData,
  InvoiceHistoryRecord,
  InvoiceLineItem,
  InvoiceMonthlyBreakdown,
  ReportPeriod,
  AllInvoiceHistoryData,
  CustomerInvoiceSummary,
} from '@/types/report.types';
import { formatNumber, formatDate } from '@/utils/formatters';

// ============================================================================
// SAP Fiori Design Tokens - Static values (dimensions, typography)
// Colors are now dynamic via useFioriColors hook
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

// Format currency
const formatCurrency = (amount: number): string => {
  return `₹${formatNumber(Math.round(amount))}`;
};

// Format month (2025-12 -> Dec 2025)
const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

// ============================================================================
// Components
// ============================================================================

const FioriSectionHeader: React.FC<{ title: string }> = ({ title }) => {
  const FIORI = useFioriColors();

  return (
    <View style={styles.fioriSectionHeader}>
      <Text style={[styles.fioriSectionHeaderText, { color: FIORI.colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
};

// Monthly Breakdown Card
interface MonthlyBreakdownCardProps {
  months: InvoiceMonthlyBreakdown[];
  isExpanded: boolean;
  onToggle: () => void;
}

const MonthlyBreakdownCard: React.FC<MonthlyBreakdownCardProps> = ({ months, isExpanded, onToggle }) => {
  const FIORI = useFioriColors();

  if (months.length === 0) return null;

  return (
    <View style={[styles.monthlyCard, { backgroundColor: FIORI.colors.background, borderColor: FIORI.colors.divider }]}>
      <Pressable style={styles.monthlyHeader} onPress={onToggle}>
        <View style={styles.monthlyHeaderLeft}>
          <Icon name="calendar-month" size={20} color={FIORI.colors.tint} />
          <Text style={[styles.monthlyHeaderTitle, { color: FIORI.colors.textPrimary }]}>Monthly Breakdown</Text>
        </View>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={FIORI.colors.textSecondary}
        />
      </Pressable>
      {isExpanded && (
        <View style={[styles.monthlyContent, { borderTopColor: FIORI.colors.divider }]}>
          {months.map((m, index) => (
            <View key={m.month} style={[styles.monthRow, index < months.length - 1 && [styles.monthRowBorder, { borderBottomColor: FIORI.colors.divider }]]}>
              <Text style={[styles.monthLabel, { color: FIORI.colors.textPrimary }]}>{formatMonth(m.month)}</Text>
              <View style={styles.monthStats}>
                <Text style={[styles.monthCount, { color: FIORI.colors.textSecondary }]}>{m.invoice_count} inv</Text>
                <Text style={[styles.monthAmount, { color: FIORI.colors.textPrimary }]}>{formatCurrency(m.total_amount)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// Invoice Card Component - navigates to details screen
interface InvoiceCardProps {
  invoice: InvoiceHistoryRecord;
}

const InvoiceCard: React.FC<InvoiceCardProps> = ({ invoice }) => {
  const FIORI = useFioriColors();

  const handlePress = () => {
    router.push(`/invoice-details/${invoice.invoice_id}`);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.fioriCard,
        { backgroundColor: FIORI.colors.background, borderColor: FIORI.colors.divider },
        pressed && { backgroundColor: FIORI.colors.backgroundSecondary },
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.invoice_number}, ${formatCurrency(invoice.net_total)}`}
    >
      <View style={styles.fioriObjectCell}>
        {/* Icon */}
        <View style={[styles.invoiceIcon, { backgroundColor: FIORI.colors.backgroundSecondary }]}>
          <Icon
            name="receipt"
            size={20}
            color={FIORI.colors.textSecondary}
          />
        </View>

        {/* Content */}
        <View style={styles.fioriObjectCellContent}>
          <Text style={[styles.fioriObjectCellTitle, { color: FIORI.colors.textPrimary }]} numberOfLines={1}>
            {invoice.invoice_number}
          </Text>
          <Text style={[styles.fioriObjectCellSubtitle, { color: FIORI.colors.textSecondary }]} numberOfLines={1}>
            {formatDate(invoice.invoice_date, 'short')} • {invoice.grn_ref}
          </Text>
        </View>

        {/* Amount */}
        <View style={styles.amountInfo}>
          <Text style={[styles.amountValue, { color: FIORI.colors.textPrimary }]}>{formatCurrency(invoice.net_total)}</Text>
          <Text style={[styles.amountLabel, { color: FIORI.colors.textSecondary }]}>{invoice.item_count} items</Text>
        </View>

        {/* Navigate Icon */}
        <Icon
          name="chevron-right"
          size={20}
          color={FIORI.colors.textSecondary}
        />
      </View>
    </Pressable>
  );
};

// Customer Card for all-customers view
interface CustomerCardProps {
  customer: CustomerInvoiceSummary;
  onPress: () => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onPress }) => {
  const FIORI = useFioriColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.customerCard,
        { backgroundColor: FIORI.colors.background },
        pressed && { backgroundColor: FIORI.colors.backgroundSecondary },
      ]}
      onPress={onPress}
    >
      <View style={[styles.customerAvatar, { backgroundColor: FIORI.colors.tintLight }]}>
        <Icon name="account-outline" size={22} color={FIORI.colors.tint} />
      </View>
      <View style={styles.customerContent}>
        <Text style={[styles.customerName, { color: FIORI.colors.textPrimary }]} numberOfLines={1}>{customer.customer_name}</Text>
        <Text style={[styles.customerSubtitle, { color: FIORI.colors.textSecondary }]}>
          {customer.invoice_count} invoice{customer.invoice_count !== 1 ? 's' : ''} • Latest: {formatDate(customer.latest_invoice_date, 'compact')}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={FIORI.colors.textSecondary} />
    </Pressable>
  );
};

// ============================================================================
// Main Screen
// ============================================================================

export default function InvoiceHistoryScreen() {
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

  const [data, setData] = useState<InvoiceHistoryData | null>(null);
  const [allCustomersData, setAllCustomersData] = useState<AllInvoiceHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('last120days');
  const [monthlyExpanded, setMonthlyExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInvoiceSummary | null>(null);

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Fetch all customers data
  const fetchAllCustomersData = useCallback(async (period: ReportPeriod, showRefresh = false) => {
    const { from, to } = getDateRangeForPeriod(period);

    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await getAllInvoiceHistory({ fromDate: from, toDate: to });
      if (response.success && response.data) {
        // Backend now filters by user permissions via auth.uid()
        setAllCustomersData(response.data);
      } else {
        setError(response.error || 'Failed to load invoice history');
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
      const response = await getCustomerInvoiceHistory({
        customerId,
        fromDate: from,
        toDate: to,
      });
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to load invoice history');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    // If we have route params, go directly to that customer (from Quick Access)
    if (routeCustomerId) {
      setViewMode('single');
      setSelectedCustomer({
        customer_id: routeCustomerId,
        customer_name: routeCustomerName || '',
        invoice_count: 0,
        total_amount: 0,
        net_amount: 0,
        latest_invoice_date: '',
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
        invoice_count: 0,
        total_amount: 0,
        net_amount: 0,
        latest_invoice_date: '',
      } as CustomerInvoiceSummary);
      setViewMode('single');
      setData(null);
      setMonthlyExpanded(false);
      setCustomerSearchQuery('');
      fetchSingleCustomerData(customer.id, selectedPeriod);
    },
    [selectedPeriod, fetchSingleCustomerData],
  );

  const handleCustomerSelect = useCallback((customer: CustomerInvoiceSummary) => {
    setSelectedCustomer(customer);
    setViewMode('single');
    setData(null);
    setMonthlyExpanded(false);
    fetchSingleCustomerData(customer.customer_id, selectedPeriod);
  }, [selectedPeriod, fetchSingleCustomerData]);

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
    setMonthlyExpanded(false);
  }, []);

  // KPIs for all customers
  const allCustomersKpis: KPIItem[] = useMemo(() => {
    if (!allCustomersData?.summary) return [];
    const s = allCustomersData.summary;
    return [
      { icon: 'receipt', value: s.total_invoices, label: 'Invoices', variant: 'primary' },
      { icon: 'currency-inr', value: formatCurrency(s.net_amount), label: 'Net Amount', variant: 'secondary' },
    ];
  }, [allCustomersData?.summary]);

  // KPIs for single customer
  const singleCustomerKpis: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { icon: 'receipt', value: s.total_invoices, label: 'Invoices', variant: 'primary' },
      { icon: 'check-circle', value: formatCurrency(s.paid_amount), label: `Paid (${s.paid_count})`, variant: 'success' },
      { icon: 'clock-outline', value: formatCurrency(s.pending_amount), label: `Pending (${s.pending_count})`, variant: 'warning' },
    ];
  }, [data?.summary]);

  const { from, to } = getDateRangeForPeriod(selectedPeriod);
  const dateRangeText = `${formatDate(from, 'compact')} - ${formatDate(to, 'compact')}`;

  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader title="Invoice History" />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'receipt', value: '-', label: 'Invoices', variant: 'primary' },
              { icon: 'currency-inr', value: '-', label: 'Amount', variant: 'secondary' },
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
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader title="Invoice History" />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <ReportEmptyState icon="alert-circle-outline" message="Failed to load data" description={error} />
      </View>
    );
  }

  // All Customers View
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.by_customer.length > 0;

    return (
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader title="Invoice History" subtitle={isStaff ? 'All Customers' : 'My Customers'} />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={[styles.dateRangeText, { color: FIORI.colors.textSecondary }]}>{dateRangeText}</Text>

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
              <View style={[styles.customersCard, { backgroundColor: FIORI.colors.background, borderColor: FIORI.colors.divider }]}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <CustomerCard customer={customer} onPress={() => handleCustomerSelect(customer)} />
                    {index < filteredCustomers.length - 1 && <View style={[styles.divider, { backgroundColor: FIORI.colors.divider }]} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : (
            <ReportEmptyState icon="receipt" message="No Invoices Found" description="No invoices in the selected period." />
          )}
        </ScrollView>
      </View>
    );
  }

  // Single Customer View
  if (!data?.invoices || data.invoices.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <ReportHeader
          title="Invoice History"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
        />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={[styles.dateRangeText, { color: FIORI.colors.textSecondary }]}>{dateRangeText}</Text>
        <ReportEmptyState icon="receipt" message="No Invoices Found" description="No invoices in the selected period." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
      <ReportHeader
        title="Invoice History"
        subtitle={selectedCustomer?.customer_name}
        onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
      />
      <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
      <Text style={[styles.dateRangeText, { color: FIORI.colors.textSecondary }]}>{dateRangeText}</Text>

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
        {/* Monthly Breakdown */}
        {data.by_month.length > 0 && (
          <View style={styles.section}>
            <MonthlyBreakdownCard
              months={data.by_month}
              isExpanded={monthlyExpanded}
              onToggle={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setMonthlyExpanded(!monthlyExpanded);
              }}
            />
          </View>
        )}

        {/* Invoices List */}
        <View style={styles.section}>
          <FioriSectionHeader title="Invoices" />
          <View style={styles.invoicesList}>
            {data.invoices.map((invoice) => (
              <InvoiceCard key={invoice.invoice_id} invoice={invoice} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles
// Colors are applied dynamically via inline styles using useFioriColors hook
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

  // Monthly Card
  monthlyCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  monthlyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: FIORI_STATIC.dimensions.cardPadding,
  },
  monthlyHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthlyHeaderTitle: { fontSize: 15, fontWeight: '600' },
  monthlyContent: { borderTopWidth: StyleSheet.hairlineWidth },
  monthRow: { padding: FIORI_STATIC.dimensions.cardPadding },
  monthRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  monthLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  monthStats: { flexDirection: 'row', gap: 12, marginBottom: 2 },
  monthCount: { fontSize: 12 },
  monthAmount: { fontSize: 12, fontWeight: '600' },
  monthPayments: { flexDirection: 'row', gap: 12 },
  monthPaid: { fontSize: 11 },
  monthPending: { fontSize: 11 },

  // Invoices List
  invoicesList: { gap: 10 },

  // Invoice Card
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
  invoiceIcon: {
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
  paymentBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  paymentBadgeText: { fontSize: 10, fontWeight: '600' },
  amountInfo: { alignItems: 'flex-end' },
  amountValue: { fontSize: 15, fontWeight: '600' },
  amountLabel: { fontSize: 11 },

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
  customerAmount: { alignItems: 'flex-end' },
  customerAmountValue: { fontSize: 15, fontWeight: '600' },
  customerAmountLabel: { fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
});
