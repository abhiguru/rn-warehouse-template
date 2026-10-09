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
import { Button } from '@/components/ui/Button';
import { getCustomerInvoiceHistory, getAllInvoiceHistory } from '@/services/reporting/invoice-history-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import type {
  InvoiceHistoryData,
  InvoiceHistoryRecord,
  InvoiceMonthlyBreakdown,
  ReportPeriod,
  AllInvoiceHistoryData,
  CustomerInvoiceSummary,
} from '@/types/report.types';
import { formatDate, formatCount, formatCurrency } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { StatusTag } from '@/components/ui/StatusTag';

// ============================================================================
// Formatting
// ============================================================================

/** Totals in summaries: Indian grouping, rupee sign, no decimals (style guide §12.3). */
const formatSummaryAmount = (amount: number): string =>
  formatCurrency(Math.round(amount || 0), { maximumFractionDigits: 0 });

/** Month row title (2025-12 -> "Dec 2025"): the medium date without the day. */
const formatMonth = (monthStr: string): string =>
  formatDate(`${monthStr.slice(0, 7)}-01`).replace(/^\d+ /, '');

const LOAD_ERROR = "Couldn't load the invoice history. Check your connection and try again.";

// ============================================================================
// Styles
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  loadingContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: space.xxxl },

  dateRangeText: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
    paddingVertical: space.xs,
  },

  section: { marginTop: space.sm, paddingHorizontal: layout.marginCompact },

  sectionHeader: {
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
  },

  // Monthly card
  monthlyCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  monthlyHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    padding: space.lg,
  },
  monthlyHeaderPressed: { backgroundColor: t.surface.cardPressed },
  monthlyHeaderLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  monthlyHeaderTitle: { ...typography.headline, color: t.text.primary },
  monthlyContent: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.divider },
  monthRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },
  monthRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
  monthLabel: { ...typography.body, color: t.text.primary },
  monthCount: { ...typography.footnote, color: t.text.secondary },
  monthAmount: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  monthStats: { alignItems: 'flex-end' as const },

  // Invoices list
  invoicesList: { gap: space.sm },

  // Invoice object cell
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[1],
  },
  cardPressed: { backgroundColor: t.surface.cardPressed },
  objectCell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  cellIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.card,
    backgroundColor: t.background.base,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cellIconBrand: { backgroundColor: t.brand.subtle },
  cellContent: { flex: 1 },
  cellTitle: { ...typography.headline, color: t.text.primary },
  cellSubtitle: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  amountInfo: { alignItems: 'flex-end' as const, gap: space.xs },
  amountValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  amountLabel: { ...typography.footnote, color: t.text.secondary },

  // Customers card
  customersCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space.lg + layout.avatar.md + space.md,
    backgroundColor: t.border.divider,
  },
  retry: { alignItems: 'center' as const, paddingHorizontal: layout.marginCompact },
});

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// Components
// ============================================================================

const SectionHeader: React.FC<{ title: string; styles: Styles }> = ({ title, styles }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText} accessibilityRole="header">
      {title}
    </Text>
  </View>
);

// Monthly Breakdown Card
interface MonthlyBreakdownCardProps {
  months: InvoiceMonthlyBreakdown[];
  isExpanded: boolean;
  onToggle: () => void;
}

const MonthlyBreakdownCard: React.FC<MonthlyBreakdownCardProps> = ({ months, isExpanded, onToggle }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  if (months.length === 0) return null;

  return (
    <View style={styles.monthlyCard}>
      <Pressable
        style={({ pressed }) => [styles.monthlyHeader, pressed && styles.monthlyHeaderPressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel="Monthly breakdown"
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={styles.monthlyHeaderLeft}>
          <Icon name="calendar-month-outline" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.monthlyHeaderTitle}>Monthly breakdown</Text>
        </View>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={iconSize.md}
          color={t.icon.secondary}
        />
      </Pressable>
      {isExpanded && (
        <View style={styles.monthlyContent}>
          {months.map((m, index) => {
            const countLabel = formatCount(m.invoice_count, 'invoice');
            return (
              <View
                key={m.month}
                style={[styles.monthRow, index < months.length - 1 && styles.monthRowBorder]}
                accessible
                accessibilityLabel={`${formatMonth(m.month)}, ${countLabel}, ${formatSummaryAmount(m.total_amount)}`}
              >
                <Text style={styles.monthLabel}>{formatMonth(m.month)}</Text>
                <View style={styles.monthStats}>
                  <Text style={styles.monthAmount}>{formatSummaryAmount(m.total_amount)}</Text>
                  <Text style={styles.monthCount}>{countLabel}</Text>
                </View>
              </View>
            );
          })}
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
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const isPaid = invoice.payment_status?.status === 'paid';
  const statusLabel = isPaid ? 'Paid' : 'Pending';
  const itemsLabel = formatCount(invoice.item_count, 'item');
  const subtitle = [formatDate(invoice.invoice_date, 'short'), invoice.grn_ref ? `GRN ${invoice.grn_ref}` : null]
    .filter(Boolean)
    .join(' · ');

  const handlePress = () => {
    router.push(`/invoice-details/${invoice.invoice_id}`);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.invoice_number}, ${subtitle}, ${formatInvoiceAmount(invoice.net_total)}, ${itemsLabel}, ${statusLabel}`}
      accessibilityHint="Opens the invoice"
    >
      <View style={styles.objectCell}>
        <View style={styles.cellIcon}>
          <Icon name="file-document-outline" size={iconSize.md} color={t.icon.secondary} />
        </View>

        <View style={styles.cellContent}>
          <Text style={styles.cellTitle} numberOfLines={2}>
            Invoice {invoice.invoice_number}
          </Text>
          <Text style={styles.cellSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.amountInfo}>
          <Text style={styles.amountValue}>{formatInvoiceAmount(invoice.net_total)}</Text>
          <Text style={styles.amountLabel}>{itemsLabel}</Text>
          <StatusTag status={isPaid ? 'positive' : 'critical'} label={statusLabel} />
        </View>

        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
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
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const countLabel = formatCount(customer.invoice_count, 'invoice');
  const latest = customer.latest_invoice_date ? formatDate(customer.latest_invoice_date, 'short') : null;

  return (
    <Pressable
      style={({ pressed }) => [pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[customer.customer_name, countLabel, latest ? `latest ${latest}` : null].filter(Boolean).join(', ')}
      accessibilityHint="Shows this customer's invoices"
    >
      <View style={styles.objectCell}>
        <View style={[styles.cellIcon, styles.cellIconBrand]}>
          <Icon name="account-outline" size={iconSize.md} color={t.brand.tint} />
        </View>
        <View style={styles.cellContent}>
          <Text style={styles.cellTitle} numberOfLines={2}>{customer.customer_name}</Text>
          <Text style={styles.cellSubtitle}>
            {countLabel}{latest ? ` · Latest ${latest}` : ''}
          </Text>
        </View>
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </View>
    </Pressable>
  );
};

// ============================================================================
// Main Screen
// ============================================================================

export default function InvoiceHistoryScreen() {
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
        setError(LOAD_ERROR);
      }
    } catch (err) {
      setError(LOAD_ERROR);
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
        setError(LOAD_ERROR);
      }
    } catch (err) {
      setError(LOAD_ERROR);
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
      setError('Your account has no customer assigned yet. Ask your facility to assign one.');
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
      { icon: 'file-document-outline', value: s.total_invoices, label: 'Invoices', variant: 'primary' },
      { icon: 'currency-inr', value: formatSummaryAmount(s.net_amount), label: 'Net amount', variant: 'secondary' },
    ];
  }, [allCustomersData?.summary]);

  // KPIs for single customer
  const singleCustomerKpis: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { icon: 'file-document-outline', value: s.total_invoices, label: 'Invoices', variant: 'primary' },
      { icon: 'check-circle', value: formatSummaryAmount(s.paid_amount), label: `Paid (${s.paid_count})`, variant: 'success' },
      { icon: 'alert', value: formatSummaryAmount(s.pending_amount), label: `Pending (${s.pending_count})`, variant: 'warning' },
    ];
  }, [data?.summary]);

  const { from, to } = getDateRangeForPeriod(selectedPeriod);
  const dateRangeText = `${formatDate(from, 'medium')} – ${formatDate(to, 'medium')}`;

  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Invoice history" />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'file-document-outline', value: '-', label: 'Invoices', variant: 'primary' },
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
      <View style={styles.container}>
        <ReportHeader title="Invoice history" />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <ReportEmptyState icon="alert-circle-outline" message="Something went wrong" description={error} />
        {(shouldShowListView || singleAssignedCustomerId || selectedCustomer) && (
          <View style={styles.retry}>
            <Button type="secondary" onPress={() => handlePeriodChange(selectedPeriod)}>Try again</Button>
          </View>
        )}
      </View>
    );
  }

  // All Customers View
  if (isListView && allCustomersData) {
    const hasCustomers = allCustomersData.by_customer.length > 0;

    return (
      <View style={styles.container}>
        <ReportHeader title="Invoice history" subtitle={isStaff ? 'All customers' : 'My customers'} />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={styles.dateRangeText}>{dateRangeText}</Text>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[t.brand.tint]}
              tintColor={t.brand.tint}
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
              <SectionHeader title="Customers" styles={styles} />
              <View style={styles.customersCard}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <CustomerCard customer={customer} onPress={() => handleCustomerSelect(customer)} />
                    {index < filteredCustomers.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : (
            <ReportEmptyState
              icon="file-document-outline"
              message={customerSearchQuery.trim() ? 'No customers match' : 'No invoices in this period'}
              description={customerSearchQuery.trim() ? 'Try fewer letters or another name.' : 'Choose a longer period to see older invoices.'}
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // Single Customer View
  if (!data?.invoices || data.invoices.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader
          title="Invoice history"
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
        />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={styles.dateRangeText}>{dateRangeText}</Text>
        <ReportEmptyState
          icon="file-document-outline"
          message="No invoices in this period"
          description="Choose a longer period to see older invoices."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReportHeader
        title="Invoice history"
        subtitle={selectedCustomer?.customer_name}
        onBack={shouldShowListView || cameFromRouteParams.current ? handleBackToAll : undefined}
      />
      <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
      <Text style={styles.dateRangeText}>{dateRangeText}</Text>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
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
          <SectionHeader title="Invoices" styles={styles} />
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
