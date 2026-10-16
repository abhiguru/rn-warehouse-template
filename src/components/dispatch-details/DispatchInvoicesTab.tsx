/**
 * DispatchInvoicesTab - the invoices that bill this dispatch, as a table (docs/STYLE_GUIDE.md §13.7)
 *
 * | Invoice | Date   | Invoice total |
 * | 241     | 15 Oct |    ₹12,450.00 |
 * | Total   |        |    ₹15,700.00 |
 *
 * - Rows come from dispatchDetailsModel.buildInvoiceTable: each invoice once, with its id,
 *   date and whole total. A row opens the invoice page (PDF and sharing stay there).
 * - Narrow screens put the date under the number; from 600 dp it has its own column.
 * - The amounts are whole invoice totals: an invoice bills one GRN and may hold other
 *   dispatches' lines, so the note under the table says so.
 * - Fallback (the rows cannot be built): the summary's invoice numbers with no date,
 *   amount or link, and the summary total.
 */

import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, space, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCurrency, formatDate, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import type { InvoiceRow, InvoiceTable } from './dispatchDetailsModel';
import { HeaderCell, makeTableStyles, useTableLayout } from './DispatchTable';

export type { InvoiceTable } from './dispatchDetailsModel';

interface DispatchInvoicesTabProps {
  invoices: InvoiceTable;
  onViewInvoice?: (invoice_id: string) => void;
}

/** Date column width at font scale 1 ("15 Oct 2026"). */
const DATE_WIDTH = 96;

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
  amount: {
    flexShrink: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xl,
    minHeight: 400,
    backgroundColor: t.background.base,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    textAlign: 'center' as const,
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
  onViewInvoice?: (invoice_id: string) => void;
}> = ({ row, wide, dateWidth, onViewInvoice }) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const id = row.invoice_id;
  const canOpen = !!(id && onViewInvoice);
  const number = formatIdentifier(row.invoice_no);
  const spokenDate = toDate(row.invoice_date) ? formatDate(row.invoice_date, 'short') : tr('dispatch.details.table.dateUnavailable');
  const label =
    row.total === null
      ? tr('dispatch.details.invoiceNumbered', { number: formatIdentifier(row.invoice_no) })
      : tr('dispatch.details.table.invoiceRowLabel', { number: formatIdentifier(row.invoice_no), date: spokenDate, amount: invoiceAmount(row.total) });
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
      accessibilityHint={canOpen ? tr('dispatch.details.table.opensInvoice') : undefined}
      testID={`dispatch-invoice-row-${row.key}`}
    >
      <View style={styles.grow}>
        <Text style={canOpen ? styles.link : styles.primary}>{number}</Text>
        {showDate && !wide ? <Text style={styles.secondary}>{dateText(row.invoice_date)}</Text> : null}
      </View>
      {wide ? <Text style={[styles.primary, { width: dateWidth }]}>{showDate ? dateText(row.invoice_date) : '—'}</Text> : null}
      <Text style={[styles.number, own.amount]}>{row.total === null ? '—' : invoiceAmount(row.total)}</Text>
    </Pressable>
  );
};

export const DispatchInvoicesTab: React.FC<DispatchInvoicesTabProps> = ({
  invoices,
  onViewInvoice,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const table = useTableLayout();

  if (invoices.count === 0) {
    return (
      <View style={own.emptyContainer}>
        <Icon name="file-document-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={own.emptyTitle} accessibilityRole="header">{tr('dispatch.details.table.invoicesEmpty')}</Text>
      </View>
    );
  }

  // A date column only on a wide screen at ordinary text sizes.
  const wide = table.wide && !table.stacked;
  const dateWidth = table.numberWidth(DATE_WIDTH);
  const countText = tr('dispatch.details.table.invoiceCount', { count: invoices.count });

  return (
    <ScrollView style={own.container} contentContainerStyle={own.content} showsVerticalScrollIndicator={false}>
      <Text style={own.count} accessibilityRole="header" testID="dispatch-invoices-count">{countText}</Text>
      <View style={[styles.card, own.card, styles.cardAboveNote]} testID="dispatch-invoices-table">
        <View style={styles.headerRow}>
          <HeaderCell style={styles.grow}>{tr('dispatch.details.table.invoice')}</HeaderCell>
          {wide ? <HeaderCell style={{ width: dateWidth }}>{tr('dispatch.details.table.date')}</HeaderCell> : null}
          <HeaderCell numeric>{tr('dispatch.details.table.invoiceTotal')}</HeaderCell>
        </View>
        {invoices.rows.map((row) => (
          <InvoiceTableRow key={row.key} row={row} wide={wide} dateWidth={dateWidth} onViewInvoice={onViewInvoice} />
        ))}
        <View
          style={styles.footerRow}
          accessible
          accessibilityLabel={tr('dispatch.details.table.invoicesTotalLabel', { invoices: countText, amount: invoiceAmount(invoices.total) })}
          testID="dispatch-invoices-total"
        >
          <View style={styles.grow}>
            <Text style={styles.primaryStrong}>{tr('dispatch.details.table.total')}</Text>
            <Text style={styles.secondary}>{countText}</Text>
          </View>
          {wide ? <View style={{ width: dateWidth }} /> : null}
          <Text style={[styles.numberStrong, own.amount]}>{invoiceAmount(invoices.total)}</Text>
        </View>
      </View>
      <Text style={styles.note} testID="dispatch-invoices-note">
        {tr(invoices.detailed ? 'dispatch.details.table.invoiceTotalsNote' : 'dispatch.details.table.invoiceFallbackNote')}
      </Text>
    </ScrollView>
  );
};
