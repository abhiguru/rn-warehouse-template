/**
 * Customer activity report (C6): each customer's GRNs, dispatches, stock and
 * invoices in a period.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10), like GRN activity:
 * useReportScope says whose activity, useReportFilters holds the period,
 * search and sort, useReportQuery the data, and ReportScaffold draws every
 * state. A warehouse role sees every customer and opens one by pushing this
 * route with `?customerId=`.
 *
 * One customer's level is a dashboard: the figures, the stock trend, the stock
 * age and a card for each report behind it. It has nothing to search or sort,
 * so its filter bar is the period chip alone, and its sections are the rows of
 * the scaffold (a customer with no activity in the period has none, and gets
 * the report's empty state).
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  AgingBucketBar,
  ReportCustomerCard,
  ReportCustomerPicker,
  ReportLastCustomer,
  ReportNoCustomer,
  ReportScaffold,
  agingBucketsFrom,
  type KPIItem,
  type ReportHeaderAction,
} from '@/components/reports';
import { StockTrendChart } from '@/components/reports/StockTrendChart';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusTag, type StatusKind } from '@/components/ui';
import {
  CUSTOMER_ACTIVITY_CUSTOMER,
  CUSTOMER_ACTIVITY_CUSTOMERS,
  customerActivityCustomersView,
} from '@/features/filters/configs/reports/customerActivity';
import { isLongestPeriod, type ReportPeriod } from '@/features/filters/configs/reports/shared';
import { trustCustomerName } from '@/features/reports/customerNames';
import { reportById } from '@/features/reports/reportRegistry';
import { reportPdfSort } from '@/features/reports/reportPdfSort';
import { exportHeaderActions, longestPeriodAction } from '@/features/reports/reportActions';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportPrefs } from '@/features/reports/useReportPrefs';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope, type ReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier, type TranslationKey } from '@/i18n';
import { getAllCustomerActivity, getCustomerActivityDetail } from '@/services/reporting/customer-activity-service';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { AllCustomerActivityData, CustomerActivityDetailData, CustomerActivityRow } from '@/types/report.types';
import { formatCount, formatCurrency, formatIndiaDate, formatNumber, indiaDay } from '@/utils/formatters';

const REPORT_ID = 'customer-activity';

const makeStyles = (t: ThemeTokens) => ({
  // A card per row, spaced by its own bottom margin.
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardClip: { borderRadius: radius.card, overflow: 'hidden' as const },
  cardPadded: { padding: space.lg },

  // Quick access
  quickHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  quickIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  quickContent: { flex: 1 },
  quickTitle: { ...typography.headline, color: t.text.primary },
  quickCount: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs, fontVariant: ['tabular-nums' as const] },
  quickAction: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xxs },
  quickActionText: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.brand.tint },
  previews: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.divider, paddingVertical: space.xs },
  preview: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingVertical: space.s6,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  previewContent: { flex: 1 },
  previewLabel: { ...typography.subhead, fontWeight: fontWeight.medium, color: t.text.primary },
  previewSublabel: { ...typography.caption1, color: t.text.secondary },
  previewRight: { alignItems: 'flex-end' as const, gap: space.xxs, flexShrink: 0 },
  previewValue: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
});

/**
 * "Active today" or "Last active 9 Oct" (row date, guide §12.3). The time is an instant: its day,
 * and today, are India's, as the period of the report is.
 */
function lastActivity(value: string): string {
  const day = indiaDay(value);
  if (!day) return '';
  if (day === indiaDay(new Date())) return tr('reports.customerActivity.activeToday');
  return tr('reports.customerActivity.lastActive', { date: formatIndiaDate(day, 'short') });
}

/** "No customer activity", and a longer period to try unless there is none. */
const emptyState = (period: ReportPeriod) => ({
  icon: 'account-off-outline',
  title: tr('reports.customerActivity.emptyTitle'),
  description: tr(isLongestPeriod(period) ? 'reports.customerActivity.emptyDescriptionLongest' : 'reports.customerActivity.emptyDescription'),
});

// ============================================================================
// Whose activity
// ============================================================================

export default function CustomerActivityScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.customerActivity')} />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.customerActivity')} onPick={scope.chooseCustomer} />;
    case 'customers':
      return <CustomersReport scope={scope} />;
    case 'customer':
      // Keyed by the customer, so nothing of one customer's view is carried into another's.
      return (
        <CustomerDashboard
          key={level.customerId}
          customerId={level.customerId}
          customerName={level.customerName}
          onChangeCustomer={scope.changeCustomer}
        />
      );
  }
}

// ============================================================================
// Every customer
// ============================================================================

const customerKey = (customer: CustomerActivityRow) => customer.customer_id;

function CustomersReport({ scope }: { scope: ReportScope }) {
  const filters = useReportFilters(CUSTOMER_ACTIVITY_CUSTOMERS);
  const { period, view } = filters.request;
  const query = useReportQuery<AllCustomerActivityData>({
    key: [REPORT_ID, 'customers', period.from, period.to],
    fetch: () => getAllCustomerActivity({ fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.customerActivity.listError'),
  });
  const { data } = query;
  const rows = useMemo(() => customerActivityCustomersView(data?.customers ?? [], view), [data, view]);
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'account-group-outline', value: data.summary.total_customers, label: tr('common.customers'), variant: 'primary' },
        { icon: 'warehouse', value: data.summary.total_current_stock, label: tr('common.stock'), variant: 'secondary' },
      ],
    [data]
  );

  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, from: period.from, to: period.to, sort: reportPdfSort(REPORT_ID, 'customers', view.sort) }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title }),
  });
  const actions = useMemo(() => exportHeaderActions({ exportPdf, busy, available }), [exportPdf, busy, available]);

  const { openCustomer, lastCustomer } = scope;
  const renderRow = useCallback(
    (customer: CustomerActivityRow) => <CustomerRow customer={customer} words={view.words} onOpen={openCustomer} />,
    [view.words, openCustomer]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.customerActivity')}
      subtitle={tr('reports.customerActivity.allCustomers')}
      actions={actions}
      filters={{ config: CUSTOMER_ACTIVITY_CUSTOMERS, state: filters }}
      query={query}
      kpis={kpis}
      status={{ range: period, shown: rows.length, total: data?.customers.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={view.words}
      noun="customers"
      empty={{ ...emptyState(period), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.customerActivity.loadFailedTitle')}
    >
      {lastCustomer && !filters.search ? (
        <ReportLastCustomer customer={lastCustomer} onPress={openCustomer} accessibilityHint={tr('reports.customerActivity.customerHint')} />
      ) : null}
    </ReportScaffold>
  );
}

interface CustomerRowProps {
  customer: CustomerActivityRow;
  words: string[];
  onOpen: (customer: ReportCustomerRef) => void;
}

const CustomerRow = memo(function CustomerRow({ customer, words, onOpen }: CustomerRowProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <ReportCustomerCard
          customerId={customer.customer_id}
          title={customer.customer_name}
          highlightWords={words}
          subtitle={[customer.customer_city, lastActivity(customer.last_activity_date)]}
          value={customer.current_stock}
          valueLabel={tr('reports.customerActivity.inStock')}
          onPress={() => onOpen({ id: customer.customer_id, name: customer.customer_name })}
          accessibilityHint={tr('reports.customerActivity.customerHint')}
        />
      </View>
    </View>
  );
});

// ============================================================================
// One customer's dashboard
// ============================================================================

/** The reports a quick-access card opens for the customer. */
type QuickReport = 'grn-activity' | 'dispatch-activity' | 'stock-aging' | 'invoice-history';

type DashboardRow =
  | { kind: 'heading'; id: 'charts' | 'stockAge' | 'quickAccess'; title: TranslationKey }
  | { kind: 'trend' }
  | { kind: 'aging' }
  | { kind: 'quick'; report: QuickReport };

const DASHBOARD_ROWS: readonly DashboardRow[] = [
  { kind: 'heading', id: 'charts', title: 'reports.customerActivity.charts' },
  { kind: 'trend' },
  { kind: 'heading', id: 'stockAge', title: 'reports.customerActivity.stockAge' },
  { kind: 'aging' },
  { kind: 'heading', id: 'quickAccess', title: 'reports.customerActivity.quickAccess' },
  { kind: 'quick', report: 'grn-activity' },
  { kind: 'quick', report: 'dispatch-activity' },
  { kind: 'quick', report: 'stock-aging' },
  { kind: 'quick', report: 'invoice-history' },
];
const NO_ROWS: readonly DashboardRow[] = [];

const dashboardKey = (row: DashboardRow) => (row.kind === 'heading' ? `heading-${row.id}` : row.kind === 'quick' ? row.report : row.kind);
const dashboardType = (row: DashboardRow) => row.kind;

/** Whether the customer has anything to show for the period. */
const hasActivity = (data: CustomerActivityDetailData) => {
  const s = data.summary;
  return (
    s.current_stock > 0 ||
    s.total_grns > 0 ||
    s.total_dispatches > 0 ||
    s.total_invoice_amount > 0 ||
    data.recent_grns.length > 0 ||
    data.recent_dispatches.length > 0 ||
    data.recent_invoices.length > 0
  );
};

interface CustomerDashboardProps {
  customerId: string;
  customerName: string;
  onChangeCustomer?: () => void;
}

function CustomerDashboard({ customerId, customerName, onChangeCustomer }: CustomerDashboardProps) {
  const styles = useThemedStyles(makeStyles);
  const filters = useReportFilters(CUSTOMER_ACTIVITY_CUSTOMER);
  const { period } = filters.request;
  const query = useReportQuery<CustomerActivityDetailData>({
    key: [REPORT_ID, 'customer', customerId, period.from, period.to],
    fetch: () => getCustomerActivityDetail({ customerId, fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.customerActivity.detailError'),
  });
  const { data } = query;
  // The facility's name for the customer: this answer's own when it has one, else the one the app holds.
  const name = data?.customer_name || customerName;
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'warehouse', value: data.summary.current_stock, label: tr('common.stock'), variant: 'primary' },
        { icon: 'package-down', value: data.summary.total_grns, label: tr('reports.customerActivity.grns'), variant: 'primary' },
        { icon: 'truck-delivery-outline', value: data.summary.total_dispatches, label: tr('reports.customerActivity.dispatches'), variant: 'primary' },
      ],
    [data]
  );
  const rows = data && hasActivity(data) ? DASHBOARD_ROWS : NO_ROWS;
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, customer_id: customerId, from: period.from, to: period.to }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName: name }),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline', label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      ...exportHeaderActions({ exportPdf, busy, available }),
    ],
    [onChangeCustomer, exportPdf, busy, available]
  );

  // A quick-access card opens its report for this customer, as a customers list opens one:
  // the same route with the customer, remembered as the customer last opened there. The name
  // is the facility's, so the report that opens shows it at once.
  const navigation = useRouter();
  const { setCustomer } = useReportPrefs();
  const openReport = useCallback(
    (report: QuickReport) => {
      trustCustomerName(customerId, name);
      setCustomer(report, { id: customerId, name });
      navigation.push({ pathname: `/reports/${report}`, params: { customerId, customerName: name } } as never);
    },
    [navigation, setCustomer, customerId, name]
  );

  const renderRow = useCallback(
    (row: DashboardRow) => {
      if (!data) return null;
      switch (row.kind) {
        case 'heading':
          return <SectionHeader title={tr(row.title)} />;
        case 'trend':
          return (
            <View style={styles.card}>
              <View style={styles.cardClip}>
                {/* The month in progress is drawn at the Stock tile's figure: one figure for the stock now. */}
                <StockTrendChart trends={data.monthly_trends} currentStock={data.summary.current_stock} />
              </View>
            </View>
          );
        case 'aging':
          return (
            <View style={[styles.card, styles.cardPadded]}>
              <AgingBucketBar buckets={agingBucketsFrom(data.by_bucket)} />
            </View>
          );
        case 'quick':
          return <QuickAccessCard report={row.report} data={data} onOpen={openReport} />;
      }
    },
    [data, styles, openReport]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.customerActivity')}
      subtitle={name || undefined}
      actions={actions}
      filters={{ config: CUSTOMER_ACTIVITY_CUSTOMER, state: filters }}
      query={query}
      kpis={kpis}
      kpiPlaceholders={3}
      status={{ range: period }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={dashboardKey}
      getRowType={dashboardType}
      extraData={data}
      noun="customers"
      empty={{ ...emptyState(period), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.customerActivity.loadFailedTitle')}
    />
  );
}

// ============================================================================
// Quick access
// ============================================================================

/** Invoice status: pending → critical, paid → positive (§3.5). */
function invoiceStatus(status: string): { kind: StatusKind; label: string } {
  if (status === 'paid') return { kind: 'positive', label: tr('reports.customerActivity.paid') };
  if (status === 'pending') return { kind: 'critical', label: tr('common.pending') };
  // The backend sends only paid or pending; anything else is not a label (docs/I18N.md rule 9).
  return { kind: 'neutral', label: tr('common.unknown') };
}

interface PreviewProps {
  label: string;
  sublabel: string;
  value: string;
  status?: { kind: StatusKind; label: string };
  /** Opens the document; a row without it is not a button and has no chevron. */
  onPress?: () => void;
  accessibilityHint?: string;
}

function Preview({ label, sublabel, value, status, onPress, accessibilityHint }: PreviewProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const a11yLabel = [label, sublabel, value, status?.label].filter(Boolean).join(', ');
  const content = (
    <>
      <View style={styles.previewContent}>
        {/* A document number is never cut short (§4). */}
        <Text style={styles.previewLabel}>{label}</Text>
        <Text style={styles.previewSublabel}>{sublabel}</Text>
      </View>
      <View style={styles.previewRight}>
        <Text style={styles.previewValue}>{value}</Text>
        {status ? <StatusTag status={status.kind} label={status.label} /> : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.preview} accessible accessibilityLabel={a11yLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.preview, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </Pressable>
  );
}

const PREVIEWS = 3;
const openDocument = (path: string) => router.push(path as never);

/** A card's title, icon and count. The count is the period's total, not the length of the preview. */
function quickAccessHead(report: QuickReport, data: CustomerActivityDetailData) {
  const s = data.summary;
  switch (report) {
    case 'grn-activity':
      return { icon: 'package-down', title: tr('reports.customerActivity.recentGrns'), count: formatCount(s.total_grns, 'GRN') };
    case 'dispatch-activity':
      return { icon: 'truck-delivery-outline', title: tr('reports.customerActivity.recentDispatches'), count: formatCount(s.total_dispatches, 'dispatch', 'dispatches') };
    case 'stock-aging':
      return { icon: 'cube-outline', title: tr('reports.customerActivity.topStockItems'), count: formatCount(s.current_stock, 'bag') };
    case 'invoice-history':
      return {
        icon: 'file-document-outline',
        title: tr('reports.customerActivity.recentInvoices'),
        count: tr('reports.customerActivity.invoicedAmount', { amount: formatCurrency(s.total_invoice_amount, { maximumFractionDigits: 0 }) }),
      };
  }
}

function quickAccessPreviews(report: QuickReport, data: CustomerActivityDetailData): React.ReactNode[] {
  switch (report) {
    case 'grn-activity':
      return data.recent_grns.slice(0, PREVIEWS).map(grn => (
        <Preview
          key={grn.grn_id}
          label={tr('reports.customerActivity.grnNumber', { number: formatIdentifier(grn.gr_no) })}
          sublabel={formatIndiaDate(grn.grn_date, 'short')}
          value={tr('reports.customerActivity.stockOfTotal', { stock: formatNumber(grn.current_stock), total: formatNumber(grn.total_qty) })}
          onPress={grn.grn_id ? () => openDocument(`/grn-details/${grn.grn_id}`) : undefined}
          accessibilityHint={tr('reports.shared.opensGrnHint')}
        />
      ));
    case 'dispatch-activity':
      return data.recent_dispatches.slice(0, PREVIEWS).map(dispatch => (
        <Preview
          key={dispatch.dispatch_id}
          label={tr('reports.customerActivity.dispatchNumber', { number: formatIdentifier(dispatch.dispatch_no) })}
          sublabel={formatIndiaDate(dispatch.dispatch_date, 'short')}
          value={formatCount(dispatch.total_qty, 'bag')}
          onPress={dispatch.dispatch_id ? () => openDocument(`/dispatch-details/${dispatch.dispatch_id}`) : undefined}
          accessibilityHint={tr('grn.dispatches.openHint')}
        />
      ));
    case 'stock-aging':
      // An item is not a document: these rows open nothing.
      return data.top_stock_items.slice(0, PREVIEWS).map((item, index) => (
        <Preview
          key={`${item.item_name}-${index}`}
          label={item.item_name}
          sublabel={formatCount(item.grn_count, 'GRN')}
          value={formatCount(item.total_stock, 'bag')}
        />
      ));
    case 'invoice-history':
      return data.recent_invoices.slice(0, PREVIEWS).map(invoice => (
        <Preview
          key={invoice.invoice_id}
          label={tr('reports.customerActivity.invoiceNumber', { number: formatIdentifier(invoice.invoice_number) })}
          sublabel={formatIndiaDate(invoice.invoice_date, 'short')}
          value={formatCurrency(invoice.net_total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          status={invoiceStatus(invoice.status)}
          onPress={invoice.invoice_id ? () => openDocument(`/invoice-details/${invoice.invoice_id}`) : undefined}
          accessibilityHint={tr('reports.invoiceHistory.openHint')}
        />
      ));
  }
}

interface QuickAccessCardProps {
  report: QuickReport;
  data: CustomerActivityDetailData;
  onOpen: (report: QuickReport) => void;
}

const QuickAccessCard = memo(function QuickAccessCard({ report, data, onOpen }: QuickAccessCardProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const head = quickAccessHead(report, data);
  const previews = quickAccessPreviews(report, data);
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        {/* The header and each preview are separate targets, side by side: none is inside another. */}
        <Pressable
          style={({ pressed }) => [styles.quickHeader, pressed && styles.pressed]}
          onPress={() => onOpen(report)}
          accessibilityRole="button"
          accessibilityLabel={tr('reports.customerActivity.quickAccessLabel', { title: head.title, count: head.count })}
        >
          <View style={styles.quickIcon}>
            <Icon name={head.icon} size={iconSize.md} color={t.brand.tint} />
          </View>
          <View style={styles.quickContent}>
            <Text style={styles.quickTitle}>{head.title}</Text>
            <Text style={styles.quickCount}>{head.count}</Text>
          </View>
          <View style={styles.quickAction}>
            <Text style={styles.quickActionText}>{tr('reports.customerActivity.viewAll')}</Text>
            <Icon name="chevron-right" size={iconSize.sm} color={t.brand.tint} />
          </View>
        </Pressable>
        {previews.length > 0 ? <View style={styles.previews}>{previews}</View> : null}
      </View>
    </View>
  );
});
