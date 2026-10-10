/**
 * GRN Activity Report Screen (C2)
 *
 * Displays recent GRN activity with items, invoice status, and dispatch summary.
 * GRNs grouped by date with period selector (style guide 14.10).
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
import { getCustomerGRNActivity, getAllGRNActivity } from '@/services/reporting/grn-activity-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import type {
  GRNActivityData,
  GRNActivityRecord,
  ReportPeriod,
  AllGRNActivityData,
  CustomerGRNSummary,
} from '@/types/report.types';
import { formatCount, formatDate, formatNumber, formatSectionDate } from '@/utils/formatters';
import { StatusTag, Avatar } from '@/components/ui';
import { t as tr } from '@/i18n';

const NO_CUSTOMER_ERROR = 'No customer assigned to your account';


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
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
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

  // Date section header
  dateSectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  dateSectionText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
  },

  grnsList: { gap: space.sm },

  // Object cell card
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardPressed: { backgroundColor: t.surface.cardPressed },
  objectCell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingTop: space.md,
    paddingBottom: space.sm,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  objectIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.button,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  objectContent: { flex: 1, gap: space.xxs },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  title: { ...typography.headline, color: t.text.primary, flexShrink: 1 },
  subtitle: { ...typography.subhead, color: t.text.secondary },

  stockInfo: { alignItems: 'flex-end' as const },
  stockValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  stockLabel: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },

  statusRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    paddingLeft: space.lg + layout.avatar.md + space.md,
  },
  dispatchCount: { ...typography.footnote, color: t.text.secondary },

  // Customers list
  customersCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  customerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
    backgroundColor: t.surface.card,
  },
  customerContent: { flex: 1, gap: space.xxs },
  customerQty: { alignItems: 'flex-end' as const },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
    marginLeft: space.lg + layout.avatar.md + space.md,
  },
  retry: { alignItems: 'center' as const, paddingBottom: space.xxl },
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

// Date section header (groups GRNs by date)
const DateSectionHeader: React.FC<{ date: string; styles: Styles }> = ({ date, styles }) => (
  <View style={styles.dateSectionHeader}>
    <Text style={styles.dateSectionText} accessibilityRole="header">
      {formatSectionDate(date)}
    </Text>
  </View>
);

// GRN card - navigates to the details screen
interface GRNCardProps {
  grn: GRNActivityRecord;
  styles: Styles;
}

const GRNCard: React.FC<GRNCardProps> = ({ grn, styles }) => {
  const t = useTokens();
  const invoiced = grn.invoice_status.is_invoiced;
  const invoiceLabel = invoiced
    ? grn.invoice_status.invoice_number
      ? tr('reports.customerActivity.invoiceNumber', { number: grn.invoice_status.invoice_number })
      : tr('reports.grnActivity.invoiced')
    : tr('reports.grnActivity.notInvoiced');
  const dispatchCount = grn.dispatch_summary.dispatch_count;
  const dispatchLabel = dispatchCount > 0 ? formatCount(dispatchCount, 'dispatch', 'dispatches') : null;
  const people = [grn.sender_name || tr('reports.grnActivity.senderNotRecorded'), grn.supervisor_name].filter(Boolean).join(' · ');
  const stockLabel = tr('reports.grnActivity.stockLabel', {
    stock: formatNumber(grn.dispatch_summary.current_stock),
    bags: formatCount(grn.total_qty, 'bag'),
  });

  const handlePress = () => {
    if (grn.grn_id) {
      router.push(`/grn-details/${grn.grn_id}`);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={[
        tr('reports.customerActivity.grnNumber', { number: grn.gr_no }),
        people,
        stockLabel,
        invoiceLabel,
        dispatchLabel,
        grn.image_count > 0 ? formatCount(grn.image_count, 'photo') : null,
      ].filter(Boolean).join(', ')}
      accessibilityHint={tr('reports.grnActivity.openHint')}
    >
      <View style={styles.objectCell}>
        <View style={styles.objectIcon}>
          <Icon name="package-down" size={iconSize.lg} color={t.brand.tint} />
        </View>

        <View style={styles.objectContent}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {tr('reports.customerActivity.grnNumber', { number: grn.gr_no })}
            </Text>
            {grn.image_count > 0 && (
              <StatusTag status="neutral" label={formatNumber(grn.image_count)} icon="camera-outline" />
            )}
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>
            {people}
          </Text>
        </View>

        <View style={styles.stockInfo}>
          <Text style={styles.stockValue}>{formatNumber(grn.dispatch_summary.current_stock)}</Text>
          <Text style={styles.stockLabel}>{tr('reports.grnActivity.ofTotal', { total: formatNumber(grn.total_qty) })}</Text>
        </View>

        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </View>

      <View style={styles.statusRow}>
        <StatusTag status={invoiced ? 'positive' : 'critical'} label={invoiceLabel} />
        {dispatchLabel && <Text style={styles.dispatchCount}>{dispatchLabel}</Text>}
      </View>
    </Pressable>
  );
};

// Customer row for the all-customers view
interface CustomerCardProps {
  customer: CustomerGRNSummary;
  onPress: () => void;
  styles: Styles;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onPress, styles }) => {
  const t = useTokens();
  const latest = customer.latest_grn_date ? formatDate(customer.latest_grn_date, 'short') : '';
  const grnCount = formatCount(customer.grn_count, 'GRN');
  const subtitle = latest && latest !== '—' ? tr('reports.grnActivity.customerSubtitle', { grns: grnCount, date: latest }) : grnCount;
  const bags = formatCount(customer.total_quantity, 'bag');
  return (
    <Pressable
      style={({ pressed }) => [styles.customerRow, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${customer.customer_name}, ${subtitle}, ${bags}`}
      accessibilityHint={tr('reports.grnActivity.customerHint')}
    >
      <Avatar name={customer.customer_name} id={customer.customer_id} />
      <View style={styles.customerContent}>
        <Text style={styles.title} numberOfLines={2}>
          {customer.customer_name}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View style={styles.customerQty}>
        <Text style={styles.stockValue}>{formatNumber(customer.total_quantity)}</Text>
        <Text style={styles.stockLabel}>{tr('reports.dispatchActivity.bagUnit', { count: customer.total_quantity })}</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
    </Pressable>
  );
};

// ============================================================================
// Main Screen
// ============================================================================

export default function GRNActivityScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();

  // Role-based access (J12 fix)
  const access = useRoleBasedAccess();
  // Staff have warehouse-wide GRN access; other reports keep their own policy.
  const isStaff = access.isStaff || access.role === 'staff';
  const singleAssignedCustomerId = isStaff ? null : access.singleAssignedCustomerId;
  const shouldShowListView = isStaff || access.shouldShowListView;

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
      setError(NO_CUSTOMER_ERROR);
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
      { icon: 'package-down', value: s.total_grns, label: tr('reports.customerActivity.grns'), variant: 'primary' },
      { icon: 'package-variant', value: s.total_quantity, label: tr('common.bags'), variant: 'secondary' },
    ];
  }, [allCustomersData?.summary]);

  // KPIs for single customer
  const singleCustomerKpis: KPIItem[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { icon: 'package-down', value: s.total_grns, label: tr('reports.customerActivity.grns'), variant: 'primary' },
      { icon: 'package-variant', value: s.total_quantity, label: tr('common.bags'), variant: 'secondary' },
      { icon: 'file-document-outline', value: tr('reports.grnActivity.invoicedOfTotal', { invoiced: formatNumber(s.total_invoiced_grns), total: formatNumber(s.total_grns) }), label: tr('reports.grnActivity.invoiced'), variant: 'accent' },
    ];
  }, [data?.summary]);


  const { from, to } = getDateRangeForPeriod(selectedPeriod);
  const dateRangeText = tr('reports.grnActivity.dateRange', { from: formatDate(from), to: formatDate(to) });

  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allCustomersData : data;

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[t.brand.tint]}
      tintColor={t.brand.tint}
      progressBackgroundColor={t.surface.card}
    />
  );

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.grnActivity')} />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <View style={styles.loadingContainer} accessibilityLabel={tr('reports.grnActivity.loading')} accessibilityState={{ busy: true }}>
          <KPIGrid
            items={[
              { icon: 'package-down', value: '-', label: tr('reports.customerActivity.grns'), variant: 'primary' },
              { icon: 'package-variant', value: '-', label: tr('common.bags'), variant: 'secondary' },
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
    const noCustomer = error === NO_CUSTOMER_ERROR;
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.grnActivity')} />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <ReportEmptyState
          icon="alert-circle-outline"
          message={tr(noCustomer ? 'reports.grnActivity.noCustomerTitle' : 'reports.grnActivity.errorTitle')}
          description={
            noCustomer
              ? tr('reports.grnActivity.noCustomerDescription')
              : tr('common.checkConnection')
          }
        />
        {!noCustomer && (
          <View style={styles.retry}>
            <Button type="secondary" variant="tint" onPress={handleRefresh}>
              {tr('common.retry')}
            </Button>
          </View>
        )}
      </View>
    );
  }

  // All customers view
  if (isListView && allCustomersData) {
    return (
      <View style={styles.container}>
        <ReportHeader
          title={tr('reports.titles.grnActivity')}
          subtitle={tr(isStaff ? 'reports.customerActivity.allCustomers' : 'reports.customerActivity.myCustomers')}
        />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={styles.dateRangeText}>{dateRangeText}</Text>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          <KPIGrid items={allCustomersKpis} isLoading={isLoading} compact />

          {/* Customer search */}
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
              <SectionHeader title={tr('common.customers')} styles={styles} />
              <View style={styles.customersCard}>
                {filteredCustomers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <CustomerCard customer={customer} onPress={() => handleCustomerSelect(customer)} styles={styles} />
                    {index < filteredCustomers.length - 1 && <View style={styles.divider} />}
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
              icon="package-down"
              message={tr('reports.grnActivity.emptyTitle')}
              description={tr('reports.grnActivity.emptyDescription')}
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // Single customer view
  if (!data?.grns || data.grns.length === 0) {
    return (
      <View style={styles.container}>
        <ReportHeader
          title={tr('reports.titles.grnActivity')}
          subtitle={selectedCustomer?.customer_name}
          onBack={shouldShowListView || routeCustomerId ? handleBackToAll : undefined}
        />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <Text style={styles.dateRangeText}>{dateRangeText}</Text>
        <ReportEmptyState
          icon="package-down"
          message={tr('reports.grnActivity.emptyTitle')}
          description={tr('reports.grnActivity.emptyDescription')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReportHeader
        title={tr('reports.titles.grnActivity')}
        subtitle={selectedCustomer?.customer_name}
        onBack={shouldShowListView || routeCustomerId ? handleBackToAll : undefined}
      />
      <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
      <Text style={styles.dateRangeText}>{dateRangeText}</Text>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <KPIGrid items={singleCustomerKpis} isLoading={isLoading} compact />

        {/* GRNs grouped by date */}
        <View style={styles.section}>
          {grnsByDate.map(([date, grns]) => (
            <View key={date}>
              <DateSectionHeader date={date} styles={styles} />
              <View style={styles.grnsList}>
                {grns.map((grn) => (
                  <GRNCard key={grn.grn_id} grn={grn} styles={styles} />
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
