/**
 * Invoice history report (C4): the invoices of a period, what was paid and
 * what is pending, and the period month by month.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10): useReportScope says
 * whose invoices, useReportFilters holds the period, search, sort and the
 * payment choice, useReportQuery the data, and ReportScaffold draws every
 * state. A warehouse role sees every customer and opens one by pushing this
 * route with `?customerId=`, so the phone's back button and the header's agree.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  FactLines,
  FioriDataTable,
  ReportCustomerCard,
  ReportCustomerPicker,
  ReportDateHeading,
  ReportLastCustomer,
  ReportNoCustomer,
  ReportScaffold,
  type DataTableColumn,
  type KPIItem,
  type ReportHeaderAction,
} from '@/components/reports';
import { invoicePaymentStatus } from '@/components/reports/invoicePaymentStatus';
import { StatusTag } from '@/components/ui';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import { isLongestPeriod, type ReportPeriod } from '@/features/filters/configs/reports';
import {
  INVOICE_HISTORY_CUSTOMER,
  INVOICE_HISTORY_CUSTOMERS,
  invoiceCustomersView,
  invoiceRecordsView,
} from '@/features/filters/configs/reports/invoiceHistory';
import { invoiceMonths, invoiceMonthsHavePaise, invoiceMonthTotals, type InvoiceMonth, type InvoiceMonthTotals } from '@/features/filters/configs/reports/invoiceMonths';
import { invoicePayment } from '@/features/filters/configs/reports/invoicePayment';
import { reportPdfSort } from '@/features/reports/reportPdfSort';
import { reportById } from '@/features/reports/reportRegistry';
import { exportHeaderActions, longestPeriodAction } from '@/features/reports/reportActions';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope, type ReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t as tr, formatIdentifier } from '@/i18n';
import { getAllInvoiceHistory, getCustomerInvoiceHistory } from '@/services/reporting/invoice-history-service';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type {
  AllInvoiceHistoryData,
  CustomerInvoiceSummary,
  InvoiceHistoryData,
  InvoiceHistoryRecord,
} from '@/types/report.types';
import { formatCount, formatCurrency, formatIndiaDate, formatMonth, formatNumber, indiaDay } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';

const REPORT_ID = 'invoice-history';

/** Totals in summaries: Indian grouping, rupee sign, no decimals (style guide §12.3). */
const formatSummaryAmount = (amount: number | null | undefined): string =>
  formatCurrency(Math.round(Number(amount) || 0), { maximumFractionDigits: 0 });

/** An invoice amount with the language's digits ("₹1,250.00"). */
const formatAmount = (amount: number | null | undefined): string => localizeDigits(formatInvoiceAmount(amount));

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

  // Monthly breakdown, between the status line and the invoices
  monthly: { marginHorizontal: layout.marginCompact, marginBottom: space.md },
  monthlyHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  monthlyHeaderOpen: { marginBottom: space.sm },
  monthlyTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexShrink: 1 },
  monthlyTitle: { ...typography.headline, color: t.text.primary, flexShrink: 1 },

  objectCell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
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
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  footnote: { ...typography.footnote, color: t.text.secondary },
  figures: { alignItems: 'flex-end' as const, gap: space.xs },
  amount: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
  amountLabel: { ...typography.footnote, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },

  // What is paid and what is pending of a part-paid invoice: a line under the cell, in line with its
  // text (as the foot row of a GRN activity card), where two amounts have the card's width. Its text is
  // the figures' footnote (`amountLabel`).
  objectCellOverFacts: { paddingBottom: space.sm },
  paymentFacts: {
    gap: space.xxs,
    paddingBottom: space.md,
    paddingLeft: space.lg + layout.avatar.md + space.md,
    paddingRight: space.lg,
  },
});

// ============================================================================
// Whose invoices
// ============================================================================

export default function InvoiceHistoryScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.invoiceHistory')} />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.invoiceHistory')} onPick={scope.chooseCustomer} />;
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

/** "No invoices in this period", and a longer period to try unless there is none. */
const emptyState = (period: ReportPeriod) => ({
  icon: 'file-document-outline',
  title: tr('reports.invoiceHistory.emptyTitle'),
  description: isLongestPeriod(period) ? undefined : tr('reports.invoiceHistory.emptyDescription'),
});

// ============================================================================
// Every customer
// ============================================================================

const customerKey = (customer: CustomerInvoiceSummary) => customer.customer_id;

function CustomersReport({ scope }: { scope: ReportScope }) {
  const filters = useReportFilters(INVOICE_HISTORY_CUSTOMERS);
  const { period, view } = filters.request;
  const query = useReportQuery<AllInvoiceHistoryData>({
    key: [REPORT_ID, 'customers', period.from, period.to],
    fetch: () => getAllInvoiceHistory({ fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.invoiceHistory.loadError'),
  });
  const { data } = query;
  const rows = useMemo(() => invoiceCustomersView(data?.by_customer ?? [], view), [data, view]);
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'file-document-outline', value: data.summary.total_invoices, label: tr('reports.invoiceHistory.invoices'), variant: 'primary' },
        // `total_amount` is the sum of the invoices' totals, right on every server: `net_amount` counts
        // labour and tax twice before backend migration 61.
        { icon: 'currency-inr', value: formatSummaryAmount(data.summary.total_amount), label: tr('common.amount'), variant: 'secondary' },
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
    (customer: CustomerInvoiceSummary) => <CustomerRow customer={customer} words={view.words} onOpen={openCustomer} />,
    [view.words, openCustomer]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.invoiceHistory')}
      subtitle={tr('reports.shared.allCustomers')}
      actions={actions}
      filters={{ config: INVOICE_HISTORY_CUSTOMERS, state: filters }}
      query={query}
      kpis={kpis}
      status={{ range: period, shown: rows.length, total: data?.by_customer.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={view.words}
      noun="customers"
      empty={{ ...emptyState(period), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.invoiceHistory.errorTitle')}
    >
      {lastCustomer && !filters.search ? (
        <ReportLastCustomer customer={lastCustomer} onPress={openCustomer} accessibilityHint={tr('reports.invoiceHistory.customerHint')} />
      ) : null}
    </ReportScaffold>
  );
}

interface CustomerRowProps {
  customer: CustomerInvoiceSummary;
  words: string[];
  onOpen: (customer: ReportCustomerRef) => void;
}

const CustomerRow = memo(function CustomerRow({ customer, words, onOpen }: CustomerRowProps) {
  const styles = useThemedStyles(makeStyles);
  const latest = customer.latest_invoice_date ? formatIndiaDate(customer.latest_invoice_date, 'short') : '';
  const facts = [formatCount(customer.invoice_count, 'invoice')];
  if (latest && latest !== '—') facts.push(tr('reports.invoiceHistory.latestInvoice', { date: latest }));
  const amount = formatSummaryAmount(customer.total_amount);
  const amountLabel = tr('common.amount');
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <ReportCustomerCard
          customerId={customer.customer_id}
          title={customer.customer_name}
          highlightWords={words}
          subtitle={facts}
          value={amount}
          valueLabel={amountLabel}
          onPress={() => onOpen({ id: customer.customer_id, name: customer.customer_name })}
          accessibilityLabel={[customer.customer_name, ...facts, tr('reports.shared.labelValue', { label: amountLabel, value: amount })].join(', ')}
          accessibilityHint={tr('reports.invoiceHistory.customerHint')}
        />
      </View>
    </View>
  );
});

// ============================================================================
// One customer's invoices
// ============================================================================

/** An invoice card, or the date over the invoices of that day (only while sorted by date). */
type InvoiceRow = { kind: 'date'; date: string } | { kind: 'invoice'; invoice: InvoiceHistoryRecord };

/** The invoice date is an instant: its heading is the day it fell on in India, as the monthly table counts it. */
const dayOf = (invoice: InvoiceHistoryRecord) => indiaDay(invoice.invoice_date);

function withDateHeadings(invoices: InvoiceHistoryRecord[]): InvoiceRow[] {
  const rows: InvoiceRow[] = [];
  invoices.forEach((invoice, index) => {
    if (index === 0 || dayOf(invoices[index - 1]) !== dayOf(invoice)) rows.push({ kind: 'date', date: dayOf(invoice) });
    rows.push({ kind: 'invoice', invoice });
  });
  return rows;
}

const invoiceRowKey = (row: InvoiceRow) => (row.kind === 'date' ? `date-${row.date}` : `invoice-${row.invoice.invoice_id}`);
const invoiceRowType = (row: InvoiceRow) => row.kind;
const openInvoice = (invoiceId: string) => {
  if (invoiceId) router.push(`/invoice-details/${invoiceId}`);
};

interface CustomerReportProps {
  customerId: string;
  customerName: string;
  onChangeCustomer?: () => void;
}

function CustomerReport({ customerId, customerName, onChangeCustomer }: CustomerReportProps) {
  const filters = useReportFilters(INVOICE_HISTORY_CUSTOMER);
  const { period, view } = filters.request;
  const query = useReportQuery<InvoiceHistoryData>({
    key: [REPORT_ID, 'customer', customerId, period.from, period.to],
    fetch: () => getCustomerInvoiceHistory({ customerId, fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.invoiceHistory.loadError'),
  });
  const { data } = query;
  const invoices = useMemo(() => invoiceRecordsView(data?.invoices ?? [], view), [data, view]);
  // Headings by day only make sense while the invoices are in date order (§14.5).
  const byDate = view.sort?.field === 'date';
  const rows = useMemo<InvoiceRow[]>(
    () => (byDate ? withDateHeadings(invoices) : invoices.map(invoice => ({ kind: 'invoice', invoice }))),
    [invoices, byDate]
  );
  // The table is built from every invoice of the period, not the ones the search or the choice leaves.
  const months = useMemo(() => invoiceMonths(data?.invoices ?? []), [data]);
  // The Paid and Pending tiles are the table's Total row: one calculation over the period's invoices (what
  // was received on each and what is still owed of its `total`), never the server's paid_amount /
  // pending_amount, which are overstated before backend migration 61 and count a part-paid invoice as paid
  // in full before migration 62. Not what the search or the choice leaves.
  const totals = useMemo(() => invoiceMonthTotals(months), [months]);
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'file-document-outline', value: data.summary.total_invoices, label: tr('reports.invoiceHistory.invoices'), variant: 'primary' },
        {
          icon: 'check-circle',
          value: formatSummaryAmount(totals.paidAmount),
          label: tr('reports.invoiceHistory.paidCount', { count: totals.paidCount }),
          variant: 'success',
        },
        {
          icon: 'alert',
          value: formatSummaryAmount(totals.pendingAmount),
          label: tr('reports.invoiceHistory.pendingCount', { count: totals.pendingCount }),
          variant: 'warning',
        },
      ],
    [data, totals]
  );
  // The PDF follows the Payment choice (only the paid, or only the pending, invoices of the period, which
  // the server tells apart by the same rule) but not the search, which is the screen's own. "All" sends no
  // status. A server that predates the field makes the PDF of all the period's invoices (generateReportPDF
  // asks again without it).
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({
      report: REPORT_ID,
      customer_id: customerId,
      from: period.from,
      to: period.to,
      sort: reportPdfSort(REPORT_ID, 'customer', view.sort),
      ...(view.payment !== 'all' && { status: view.payment }),
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
    (row: InvoiceRow) =>
      row.kind === 'date' ? (
        <ReportDateHeading date={row.date} />
      ) : (
        <InvoiceCard invoice={row.invoice} words={view.words} showDate={!byDate} onOpen={openInvoice} />
      ),
    [view.words, byDate]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.invoiceHistory')}
      subtitle={customerName || undefined}
      actions={actions}
      filters={{ config: INVOICE_HISTORY_CUSTOMER, state: filters }}
      query={query}
      kpis={kpis}
      // As many tiles as the loaded figures: one customer has three.
      kpiPlaceholders={3}
      status={{ range: period, shown: invoices.length, total: data?.invoices.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={invoiceRowKey}
      getRowType={invoiceRowType}
      extraData={view.words}
      noun="invoices"
      empty={{ ...emptyState(period), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.invoiceHistory.errorTitle')}
    >
      {months.length > 0 ? <MonthlyBreakdown months={months} totals={totals} /> : null}
    </ReportScaffold>
  );
}

// ============================================================================
// Month by month
// ============================================================================

/** The table's cells, already in the language's words and digits. */
type MonthRow = {
  id: string;
  month: string;
  invoices: string;
  amount: string;
  paid: string;
  pending: string;
};

/** Wide enough for "₹12,34,567" on one line: a cell is one line, and an amount is never cut short (§4). */
const AMOUNT_COLUMN_WIDTH = 120;

/**
 * With paise every amount has two more digits and a point: wide enough for
 * "₹1,23,45,678.90" (about 105 at the default text size, 24 of padding).
 */
const AMOUNT_COLUMN_WIDTH_WITH_PAISE = 144;

/**
 * Wide enough for the header "Invoices" on one line at 1.3 times text size (about
 * 65 for the word, 24 of padding; the default 80 broke it as "Invoice" / "s") and
 * for a little more: a header shrinks before it is cut, and never breaks a word.
 */
const COUNT_COLUMN_WIDTH = 104;

/** Five columns: the month is pinned while the figures scroll (§13.7). */
const monthColumns = (withPaise: boolean): DataTableColumn[] => {
  const width = withPaise ? AMOUNT_COLUMN_WIDTH_WITH_PAISE : AMOUNT_COLUMN_WIDTH;
  return [
    { key: 'month', label: tr('reports.customerActivity.trend.month') },
    { key: 'invoices', label: tr('reports.invoiceHistory.invoices'), dataType: 'number', width: COUNT_COLUMN_WIDTH },
    { key: 'amount', label: tr('common.amount'), dataType: 'number', width },
    { key: 'paid', label: tr('reports.customerActivity.paid'), dataType: 'number', width },
    { key: 'pending', label: tr('common.pending'), dataType: 'number', width },
  ];
};

const monthKey = (row: Record<string, unknown>) => String(row.id);

/**
 * The period month by month, with a totals row: shut until asked for, as it always was.
 * The Amount is the invoices' `total`, the amount the customer pays (it already includes
 * labour and tax), like the cards and the tiles above it; Paid is what was received of it
 * and Pending what is still owed. The server's `net_total` is not used: before backend
 * migration 61 it counts labour and tax twice. `totals` is the Total row and also what the
 * Paid and Pending tiles show.
 *
 * Amounts are in whole rupees like the tiles above, unless some amount of the table
 * has paise: then every amount cell, rows and totals, has two decimals (as the invoice
 * cards show them). Cells rounded one by one would not add up: Paid ₹101 and Pending
 * ₹101 beside an Amount of ₹201 for 100.50 and 2 times 50.25.
 */
function MonthlyBreakdown({ months, totals }: { months: InvoiceMonth[]; totals: InvoiceMonthTotals }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const withPaise = useMemo(() => invoiceMonthsHavePaise(months), [months]);
  const rows = useMemo<MonthRow[]>(() => {
    const money = withPaise ? formatAmount : formatSummaryAmount;
    return months.map(month => ({
      id: month.month || 'undated',
      // An invoice with no readable date shows "—" for its month.
      month: formatMonth(month.month ? `${month.month}-01` : null, 'short'),
      invoices: formatNumber(month.invoiceCount),
      amount: money(month.amount),
      paid: money(month.paidAmount),
      pending: money(month.pendingAmount),
    }));
  }, [months, withPaise]);
  const totalsRow = useMemo(() => {
    const money = withPaise ? formatAmount : formatSummaryAmount;
    return {
      month: tr('common.total'),
      invoices: formatNumber(totals.invoiceCount),
      amount: money(totals.amount),
      paid: money(totals.paidAmount),
      pending: money(totals.pendingAmount),
    };
  }, [totals, withPaise]);
  const title = tr('reports.invoiceHistory.monthlyBreakdown');

  return (
    <View style={styles.monthly}>
      <Pressable
        style={({ pressed }) => [styles.monthlyHeader, open && styles.monthlyHeaderOpen, pressed && styles.cardPressed]}
        onPress={() => setOpen(current => !current)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.monthlyTitleRow}>
          <Icon name="calendar-month-outline" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.monthlyTitle}>{title}</Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
      {open ? (
        <FioriDataTable
          columns={monthColumns(withPaise)}
          data={rows}
          keyExtractor={monthKey}
          totals={totalsRow}
          compact
          accessibilityLabel={title}
        />
      ) : null}
    </View>
  );
}

// ============================================================================
// An invoice
// ============================================================================

/**
 * The items a search found on an invoice that the card does not show: only for
 * words the card's own text does not already show (§14.6).
 */
function hiddenMatches(invoice: InvoiceHistoryRecord, words: string[], shown: string[]): string[] {
  const unseen = words.filter(word => !shown.some(text => text.toLowerCase().includes(word)));
  if (unseen.length === 0) return [];
  const found = new Set<string>();
  for (const line of invoice.line_items ?? []) {
    if (line.item_name && matchesAnyWord(line.item_name, unseen)) found.add(line.item_name);
  }
  return [...found].slice(0, 3);
}

interface InvoiceCardProps {
  invoice: InvoiceHistoryRecord;
  /** Lower-cased search words, shown in bold. */
  words: string[];
  /** The date is on the card when no heading above it gives it. */
  showDate: boolean;
  onOpen: (invoiceId: string) => void;
}

const InvoiceCard = memo(function InvoiceCard({ invoice, words, showDate, onOpen }: InvoiceCardProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const number = tr('reports.customerActivity.invoiceNumber', { number: formatIdentifier(invoice.invoice_number) });
  const grn = invoice.grn_ref ? tr('reports.customerActivity.grnNumber', { number: formatIdentifier(invoice.grn_ref) }) : '';
  // Paid only when nothing is owed, whatever the server's word is; a part-paid invoice is Pending.
  const payment = invoicePayment(invoice);
  const status = invoicePaymentStatus(payment.status);
  const items = formatCount(invoice.item_count, 'item');
  const amount = formatAmount(invoice.total);
  // A part-paid invoice says what was received and what is still owed, in the words of the tiles and the
  // table, of which these two amounts are its share. The amount above stays the invoice's.
  const paymentFacts = payment.partPaid
    ? [
        tr('reports.shared.labelValue', { label: tr('reports.customerActivity.paid'), value: formatAmount(payment.received) }),
        tr('reports.shared.labelValue', { label: tr('common.pending'), value: formatAmount(payment.balance) }),
      ]
    : [];
  const matched = hiddenMatches(invoice, words, [number, grn]);
  const label = [
    tr('reports.invoiceHistory.cardLabel', {
      number: formatIdentifier(invoice.invoice_number),
      // The date is read with the card: a heading above it is not.
      subtitle: [formatIndiaDate(invoice.invoice_date), grn].filter(Boolean).join(' · '),
      amount,
      items,
      status: status.label,
    }),
    ...paymentFacts,
    ...matched,
  ].join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onOpen(invoice.invoice_id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={tr('reports.invoiceHistory.openHint')}
    >
      <View style={paymentFacts.length > 0 ? [styles.objectCell, styles.objectCellOverFacts] : styles.objectCell}>
        <View style={styles.objectIcon}>
          <Icon name="file-document-outline" size={iconSize.md} color={t.brand.tint} />
        </View>

        <View style={styles.objectContent}>
          {/* A document number is never cut short (§4). */}
          <HighlightedText style={styles.title} text={number} words={words} />
          {grn ? <HighlightedText style={styles.subtitle} text={grn} words={words} /> : null}
          {showDate ? <Text style={styles.footnote}>{formatIndiaDate(invoice.invoice_date, 'short')}</Text> : null}
          {matched.length > 0 ? <HighlightedText style={styles.footnote} numberOfLines={2} text={matched.join(' · ')} words={words} /> : null}
        </View>

        <View style={styles.figures}>
          <Text style={styles.amount}>{amount}</Text>
          <Text style={styles.amountLabel}>{items}</Text>
          <StatusTag status={status.kind} label={status.label} />
        </View>

        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </View>

      {paymentFacts.length > 0 ? (
        <View style={styles.paymentFacts}>
          <FactLines facts={paymentFacts} style={styles.amountLabel} />
        </View>
      ) : null}
    </Pressable>
  );
});
