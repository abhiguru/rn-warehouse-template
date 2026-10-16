/**
 * InvoicesTable - the Invoices tab of an object page (Dispatch and GRN), docs/STYLE_GUIDE.md §13.7
 *
 * | Invoice | Date   | Invoice total |
 * | 241     | 15 Oct |    ₹12,450.00 |
 * | Total   |        |    ₹15,700.00 |
 *
 * - A count heading, then the table; rows come from common/invoiceTable (each invoice once).
 * - A row with an invoice id opens the invoice page (PDF and sharing stay there).
 * - Narrow screens put the date under the number; from 600 dp it has its own column.
 * - Amounts with two decimals; "—" where the fallback has none. The page passes its own note
 *   (what the amounts cover) and empty text; the fallback note is the same on both pages.
 */

import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, space, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCurrency, formatDate, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import type { InvoiceRow, InvoiceTable } from './invoiceTable';
import { HeaderCell, makeTableStyles, useTableLayout, ONE_LINE, numberColumnWidth } from './DetailTable';

export interface InvoicesTableProps {
  invoices: InvoiceTable;
  onViewInvoice?: (invoice_id: string) => void;
  /** Shown under a detailed table: what the amounts cover on this page. */
  note: string;
  /** The empty state's one line. */
  emptyText: string;
  /** The rows are still being read: a spinner in place of the table. */
  loading?: boolean;
  loadingText?: string;
  /** Prefix of the test ids ("dispatch" → dispatch-invoices-table). */
  testIDPrefix: string;
}

/** Date column width at font scale 1 ("15 Oct 2026"). */
const DATE_WIDTH = 96;
const AMOUNT_WIDTH = 88;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  content: {
    paddingTop: space.md,
  },
  count: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
    marginHorizontal: layout.marginCompact,
  },
  card: {
    marginTop: space.sm,
  },
  /** The note about the figures, inside the card under the totals (as on the invoice's Line items). */
  noteInCard: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xl,
    minHeight: 400,
    gap: space.md,
    backgroundColor: t.background.base,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    textAlign: 'center' as const,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
});

/** Two decimals, Indian grouping: "₹12,450.00". */
export const invoiceAmount = (amount: number) =>
  formatCurrency(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateText = (date: string | null) => (toDate(date) ? formatDate(date, 'short') : '—');

const InvoiceTableRow: React.FC<{
  row: InvoiceRow;
  wide: boolean;
  dateWidth: number;
  amountWidth: number;
  onViewInvoice?: (invoice_id: string) => void;
  testIDPrefix: string;
}> = ({ row, wide, dateWidth, amountWidth, onViewInvoice, testIDPrefix }) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const id = row.invoice_id;
  const canOpen = !!(id && onViewInvoice);
  const spokenDate = toDate(row.invoice_date) ? formatDate(row.invoice_date, 'short') : tr('components.invoiceTable.dateUnavailable');
  const label =
    row.total === null
      ? tr('components.invoiceTable.numbered', { number: formatIdentifier(row.invoice_no) })
      : tr('components.invoiceTable.rowLabel', { number: formatIdentifier(row.invoice_no), date: spokenDate, amount: invoiceAmount(row.total) });
  // A fallback row has no date at all; a row with an unknown date says so.
  const showDate = row.invoice_id !== null;

  return (
    <Pressable
      onPress={() => {
        if (id) onViewInvoice?.(id);
      }}
      disabled={!canOpen}
      style={({ pressed }) => [styles.row, pressed && canOpen && styles.rowPressed]}
      accessible
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityHint={canOpen ? tr('components.invoiceTable.opensInvoice') : undefined}
      testID={`${testIDPrefix}-invoice-row-${row.key}`}
    >
      <View style={styles.grow}>
        <Text style={canOpen ? styles.link : styles.primary}>{formatIdentifier(row.invoice_no)}</Text>
        {showDate && !wide ? <Text style={styles.secondary}>{dateText(row.invoice_date)}</Text> : null}
      </View>
      {wide ? (
        <Text style={[styles.primary, { width: dateWidth }]} {...ONE_LINE}>
          {showDate ? dateText(row.invoice_date) : '—'}
        </Text>
      ) : null}
      <Text style={[styles.number, { width: amountWidth }]} {...ONE_LINE}>
        {row.total === null ? '—' : invoiceAmount(row.total)}
      </Text>
    </Pressable>
  );
};

export const InvoicesTable: React.FC<InvoicesTableProps> = ({
  invoices,
  onViewInvoice,
  note,
  emptyText,
  loading = false,
  loadingText,
  testIDPrefix,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const table = useTableLayout();

  if (invoices.count === 0) {
    return (
      <View style={own.centered}>
        <Icon name="file-document-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={own.emptyTitle} accessibilityRole="header">{emptyText}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={own.centered} accessibilityRole="progressbar" accessibilityLabel={loadingText} testID={`${testIDPrefix}-invoices-loading`}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        {loadingText ? <Text style={own.loadingText}>{loadingText}</Text> : null}
      </View>
    );
  }

  // A date column only on a wide screen at ordinary text sizes.
  const wide = table.wide && !table.stacked;
  const dateWidth = table.numberWidth(DATE_WIDTH);
  // One amount width for the heading, every row and the total, so the Date column lines up.
  const amountWidth = numberColumnWidth(
    table,
    AMOUNT_WIDTH,
    invoices.rows.map((row) => (row.total === null ? '—' : invoiceAmount(row.total))),
    [invoiceAmount(invoices.total)]
  );
  const countText = tr('components.invoiceTable.invoiceCount', { count: invoices.count });

  return (
    <ScrollView style={own.container} contentContainerStyle={own.content} showsVerticalScrollIndicator={false}>
      <Text style={own.count} accessibilityRole="header" testID={`${testIDPrefix}-invoices-count`}>{countText}</Text>
      <View style={[styles.card, own.card]} testID={`${testIDPrefix}-invoices-table`}>
        <View style={styles.headerRow}>
          <HeaderCell style={styles.grow}>{tr('components.invoiceTable.invoice')}</HeaderCell>
          {wide ? <HeaderCell style={{ width: dateWidth }}>{tr('components.invoiceTable.date')}</HeaderCell> : null}
          <HeaderCell numeric style={{ width: amountWidth }}>{tr('components.invoiceTable.invoiceTotal')}</HeaderCell>
        </View>
        {invoices.rows.map((row) => (
          <InvoiceTableRow
            key={row.key}
            row={row}
            wide={wide}
            dateWidth={dateWidth}
            amountWidth={amountWidth}
            onViewInvoice={onViewInvoice}
            testIDPrefix={testIDPrefix}
          />
        ))}
        <View
          style={[styles.footerRow, styles.footerAfterRows]}
          accessible
          accessibilityLabel={tr('components.invoiceTable.totalLabel', { invoices: countText, amount: invoiceAmount(invoices.total) })}
          testID={`${testIDPrefix}-invoices-total`}
        >
          <View style={styles.grow}>
            <Text style={styles.primaryStrong}>{tr('components.invoiceTable.total')}</Text>
            <Text style={styles.secondary}>{countText}</Text>
          </View>
          {wide ? <View style={{ width: dateWidth }} /> : null}
          <Text style={[styles.numberStrong, { width: amountWidth }]} {...ONE_LINE}>
            {invoiceAmount(invoices.total)}
          </Text>
        </View>
        <View style={own.noteInCard}>
          <Text style={styles.secondary} testID={`${testIDPrefix}-invoices-note`}>
            {invoices.detailed ? note : tr('components.invoiceTable.fallbackNote')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};
