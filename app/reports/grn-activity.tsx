/**
 * GRN activity report (C2): the GRNs received in a period, with their invoice
 * status and what has been dispatched from them.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10): useReportScope says
 * whose GRNs, useReportFilters holds the period, search and sort,
 * useReportQuery the data, and ReportScaffold draws every state. A warehouse
 * role sees every customer and opens one by pushing this route with
 * `?customerId=`, so the phone's back button and the header's agree.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  ReportCustomerCard,
  ReportCustomerPicker,
  ReportDateHeading,
  ReportLastCustomer,
  ReportNoCustomer,
  ReportScaffold,
  type KPIItem,
  type ReportHeaderAction,
} from '@/components/reports';
import { StatusTag } from '@/components/ui';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import {
  GRN_ACTIVITY_CUSTOMER,
  GRN_ACTIVITY_CUSTOMERS,
  grnCustomersView,
  grnRecordsView,
  isLongestPeriod,
  type ReportPeriod,
} from '@/features/filters/configs/reports';
import { reportPdfSort } from '@/features/reports/reportPdfSort';
import { reportById } from '@/features/reports/reportRegistry';
import { exportHeaderActions, longestPeriodAction } from '@/features/reports/reportActions';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope, type ReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier } from '@/i18n';
import { getAllGRNActivity, getCustomerGRNActivity } from '@/services/reporting/grn-activity-service';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { AllGRNActivityData, CustomerGRNSummary, GRNActivityData, GRNActivityRecord } from '@/types/report.types';
import { formatCount, formatDate, formatNumber, indiaDay } from '@/utils/formatters';

const REPORT_ID = 'grn-activity';

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
  footnote: { ...typography.footnote, color: t.text.secondary },
  stockInfo: { alignItems: 'flex-end' as const },
  stockValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  stockLabel: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
  statusRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    paddingBottom: space.md,
    paddingLeft: space.lg + layout.avatar.md + space.md,
    paddingRight: space.lg,
  },
});

// ============================================================================
// Whose GRNs
// ============================================================================

export default function GRNActivityScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.grnActivity')} />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.grnActivity')} onPick={scope.chooseCustomer} />;
    case 'customers':
      return <CustomersReport scope={scope} />;
    case 'customer':
      // Keyed by the customer, so nothing of one customer's view is carried into another's.
      return (
        <CustomerReport
          key={level.customerId}
          customerId={level.customerId}
          customerName={level.customerName}
          onChangeCustomer={scope.changeCustomer}
        />
      );
  }
}

/** "No GRNs in this period", and a longer period to try unless there is none. */
const emptyState = (period: ReportPeriod) => ({
  icon: 'package-down',
  title: tr('reports.grnActivity.emptyTitle'),
  description: isLongestPeriod(period) ? undefined : tr('reports.grnActivity.emptyDescription'),
});

// ============================================================================
// Every customer
// ============================================================================

const customerKey = (customer: CustomerGRNSummary) => customer.customer_id;

function CustomersReport({ scope }: { scope: ReportScope }) {
  const filters = useReportFilters(GRN_ACTIVITY_CUSTOMERS);
  const { period, view } = filters.request;
  const query = useReportQuery<AllGRNActivityData>({
    key: [REPORT_ID, 'customers', period.from, period.to],
    fetch: () => getAllGRNActivity({ fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.grnActivity.loadError'),
  });
  const { data } = query;
  const rows = useMemo(() => grnCustomersView(data?.by_customer ?? [], view), [data, view]);
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'package-down', value: data.summary.total_grns, label: tr('reports.customerActivity.grns'), variant: 'primary' },
        { icon: 'package-variant', value: data.summary.total_quantity, label: tr('common.bags'), variant: 'secondary' },
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
    (customer: CustomerGRNSummary) => <CustomerRow customer={customer} words={view.words} onOpen={openCustomer} />,
    [view.words, openCustomer]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.grnActivity')}
      subtitle={tr('reports.shared.allCustomers')}
      actions={actions}
      filters={{ config: GRN_ACTIVITY_CUSTOMERS, state: filters }}
      query={query}
      kpis={kpis}
      status={{ range: period, shown: rows.length, total: data?.by_customer.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={view.words}
      noun="customers"
      empty={{ ...emptyState(period), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.grnActivity.errorTitle')}
    >
      {lastCustomer && !filters.search ? (
        <ReportLastCustomer customer={lastCustomer} onPress={openCustomer} accessibilityHint={tr('reports.grnActivity.customerHint')} />
      ) : null}
    </ReportScaffold>
  );
}

interface CustomerRowProps {
  customer: CustomerGRNSummary;
  words: string[];
  onOpen: (customer: ReportCustomerRef) => void;
}

const CustomerRow = memo(function CustomerRow({ customer, words, onOpen }: CustomerRowProps) {
  const styles = useThemedStyles(makeStyles);
  const latest = customer.latest_grn_date ? formatDate(customer.latest_grn_date, 'short') : '';
  const facts = [formatCount(customer.grn_count, 'GRN')];
  if (latest && latest !== '—') facts.push(tr('reports.grnActivity.latestGrn', { date: latest }));
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <ReportCustomerCard
          customerId={customer.customer_id}
          title={customer.customer_name}
          highlightWords={words}
          subtitle={facts}
          value={customer.total_quantity}
          valueLabel={tr('reports.dispatchActivity.bagUnit', { count: customer.total_quantity })}
          onPress={() => onOpen({ id: customer.customer_id, name: customer.customer_name })}
          accessibilityHint={tr('reports.grnActivity.customerHint')}
        />
      </View>
    </View>
  );
});

// ============================================================================
// One customer's GRNs
// ============================================================================

/** A GRN card, or the date over the GRNs of that day (only while sorted by date). */
type GRNRow = { kind: 'date'; date: string } | { kind: 'grn'; grn: GRNActivityRecord };

function withDateHeadings(grns: GRNActivityRecord[]): GRNRow[] {
  const rows: GRNRow[] = [];
  grns.forEach((grn, index) => {
    // grn_date is an instant (timestamptz): a heading is the day it fell on in India, one per day, not per moment.
    const day = indiaDay(grn.grn_date);
    if (index === 0 || indiaDay(grns[index - 1].grn_date) !== day) rows.push({ kind: 'date', date: day });
    rows.push({ kind: 'grn', grn });
  });
  return rows;
}

const grnRowKey = (row: GRNRow) => (row.kind === 'date' ? `date-${row.date}` : row.grn.grn_id);
const grnRowType = (row: GRNRow) => row.kind;
const openGrn = (grnId: string) => {
  if (grnId) router.push(`/grn-details/${grnId}`);
};

interface CustomerReportProps {
  customerId: string;
  customerName: string;
  onChangeCustomer?: () => void;
}

function CustomerReport({ customerId, customerName, onChangeCustomer }: CustomerReportProps) {
  const filters = useReportFilters(GRN_ACTIVITY_CUSTOMER);
  const { period, view } = filters.request;
  const query = useReportQuery<GRNActivityData>({
    key: [REPORT_ID, 'customer', customerId, period.from, period.to],
    fetch: () => getCustomerGRNActivity({ customerId, fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.grnActivity.loadError'),
  });
  const { data } = query;
  const grns = useMemo(() => grnRecordsView(data?.grns ?? [], view), [data, view]);
  // Headings by day only make sense while the GRNs are in date order (§14.5).
  const byDate = view.sort?.field === 'date';
  const rows = useMemo<GRNRow[]>(
    () => (byDate ? withDateHeadings(grns) : grns.map(grn => ({ kind: 'grn', grn }))),
    [grns, byDate]
  );
  // The figures are the whole period's, not what the search leaves.
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'package-down', value: data.summary.total_grns, label: tr('reports.customerActivity.grns'), variant: 'primary' },
        { icon: 'package-variant', value: data.summary.total_quantity, label: tr('common.bags'), variant: 'secondary' },
        {
          icon: 'file-document-outline',
          value: tr('reports.grnActivity.invoicedOfTotal', {
            invoiced: formatNumber(data.summary.total_invoiced_grns),
            total: formatNumber(data.summary.total_grns),
          }),
          label: tr('reports.grnActivity.invoiced'),
          variant: 'accent',
        },
      ],
    [data]
  );
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({
      report: REPORT_ID,
      customer_id: customerId,
      from: period.from,
      to: period.to,
      sort: reportPdfSort(REPORT_ID, 'customer', view.sort),
    }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline', label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      ...exportHeaderActions({ exportPdf, busy, available }),
    ],
    [onChangeCustomer, exportPdf, busy, available]
  );

  const renderRow = useCallback(
    (row: GRNRow) =>
      row.kind === 'date' ? (
        <ReportDateHeading date={row.date} />
      ) : (
        <GRNCard grn={row.grn} words={view.words} showDate={!byDate} onOpen={openGrn} />
      ),
    [view.words, byDate]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.grnActivity')}
      subtitle={customerName || undefined}
      actions={actions}
      filters={{ config: GRN_ACTIVITY_CUSTOMER, state: filters }}
      query={query}
      kpis={kpis}
      kpiPlaceholders={3}
      status={{ range: period, shown: grns.length, total: data?.grns.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={grnRowKey}
      getRowType={grnRowType}
      extraData={view.words}
      noun="GRNs"
      empty={{ ...emptyState(period), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.grnActivity.errorTitle')}
    />
  );
}

/**
 * What a search found on the GRN that the card does not show: items, their
 * packaging and marks, the vehicle. Only for words the card's own text does
 * not already show (§14.6).
 */
function hiddenMatches(grn: GRNActivityRecord, words: string[], shown: string[]): string[] {
  const unseen = words.filter(word => !shown.some(text => text.toLowerCase().includes(word)));
  if (unseen.length === 0) return [];
  const found = new Set<string>();
  const hidden = [grn.registration, ...(grn.items ?? []).flatMap(item => [item.item_name, item.packaging, item.package_mark])];
  for (const text of hidden) {
    if (text && matchesAnyWord(text, unseen)) found.add(text);
  }
  return [...found].slice(0, 3);
}

interface GRNCardProps {
  grn: GRNActivityRecord;
  /** Lower-cased search words, shown in bold. */
  words: string[];
  /** The date is on the card when no heading above it gives it. */
  showDate: boolean;
  onOpen: (grnId: string) => void;
}

const GRNCard = memo(function GRNCard({ grn, words, showDate, onOpen }: GRNCardProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const number = tr('reports.customerActivity.grnNumber', { number: formatIdentifier(grn.gr_no) });
  const invoiced = grn.invoice_status.is_invoiced;
  const invoiceLabel = invoiced
    ? grn.invoice_status.invoice_number
      ? tr('reports.customerActivity.invoiceNumber', { number: formatIdentifier(grn.invoice_status.invoice_number) })
      : tr('reports.grnActivity.invoiced')
    : tr('reports.grnActivity.notInvoiced');
  const dispatchCount = grn.dispatch_summary.dispatch_count;
  const dispatchLabel = dispatchCount > 0 ? formatCount(dispatchCount, 'dispatch', 'dispatches') : null;
  const people = [grn.sender_name || tr('reports.grnActivity.senderNotRecorded'), grn.supervisor_name].filter(Boolean).join(' · ');
  const stockLabel = tr('reports.grnActivity.stockLabel', {
    stock: formatNumber(grn.dispatch_summary.current_stock),
    bags: formatCount(grn.total_qty, 'bag'),
  });
  const photos = grn.image_count > 0 ? formatCount(grn.image_count, 'photo') : null;
  const matched = hiddenMatches(grn, words, [number, people, invoiceLabel]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onOpen(grn.grn_id)}
      accessibilityRole="button"
      // One element for a screen reader, the date included: a heading above the card is not read with it.
      accessibilityLabel={[number, formatDate(grn.grn_date), people, stockLabel, invoiceLabel, dispatchLabel, photos, ...matched]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={tr('reports.grnActivity.openHint')}
    >
      <View style={styles.objectCell}>
        <View style={styles.objectIcon}>
          <Icon name="package-down" size={iconSize.lg} color={t.brand.tint} />
        </View>

        <View style={styles.objectContent}>
          <View style={styles.titleRow}>
            {/* A document number is never cut short (§4). */}
            <HighlightedText style={styles.title} text={number} words={words} />
            {grn.image_count > 0 && <StatusTag status="neutral" label={formatNumber(grn.image_count)} icon="camera-outline" />}
          </View>
          <HighlightedText style={styles.subtitle} numberOfLines={2} text={people} words={words} />
          {showDate ? <Text style={styles.footnote}>{formatDate(grn.grn_date, 'short')}</Text> : null}
          {matched.length > 0 ? <HighlightedText style={styles.footnote} numberOfLines={2} text={matched.join(' · ')} words={words} /> : null}
        </View>

        <View style={styles.stockInfo}>
          <Text style={styles.stockValue}>{formatNumber(grn.dispatch_summary.current_stock)}</Text>
          <Text style={styles.stockLabel}>{tr('reports.grnActivity.ofTotal', { total: formatNumber(grn.total_qty) })}</Text>
        </View>

        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </View>

      <View style={styles.statusRow}>
        <StatusTag status={invoiced ? 'positive' : 'critical'} label={invoiceLabel} />
        {dispatchLabel && <Text style={styles.footnote}>{dispatchLabel}</Text>}
      </View>
    </Pressable>
  );
});
