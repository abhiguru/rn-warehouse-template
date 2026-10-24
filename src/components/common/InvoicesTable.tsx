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
 * - Invoice, Date and Invoice total sort from their headings (not sorted, ascending, descending); the total row is the
 *   summary's, never the sum of the rows shown. A fallback table (numbers only) sorts by Invoice alone.
 * - Built on the app's table setup (components/table): useAppTable, drawn by DataTable in one card (list="map").
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, space, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCurrency, formatDate, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import type { InvoiceRow, InvoiceTable } from './invoiceTable';
import { makeTableStyles, useTableLayout, ONE_LINE, numberColumnWidth } from './DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';

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
/** Fits the design edge, "₹99,999.00" in weight 600 (81 dp at font scale 1; owner, 2026-10-16); larger amounts widen it. */
const AMOUNT_WIDTH = 84;

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

const helper = createAppColumnHelper<InvoiceRow>();

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
  const detailed = invoices.detailed;

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('invoice_no', {
          id: 'invoice',
          header: tr('components.invoiceTable.invoice'),
          enableSorting: true,
          sortFn: 'alphanumeric',
          meta: { width: 'grow' },
          cell: (info) => {
            const row = info.row.original;
            const canOpen = !!(row.invoice_id && onViewInvoice);
            // A fallback row has no date at all; a row with an unknown date says so.
            const showDate = row.invoice_id !== null;
            return (
              <>
                <Text style={canOpen ? styles.link : styles.primary}>{formatIdentifier(row.invoice_no)}</Text>
                {showDate && !wide ? <Text style={styles.secondary}>{dateText(row.invoice_date)}</Text> : null}
              </>
            );
          },
        }),
        ...(wide
          ? [
              helper.accessor((row) => toDate(row.invoice_date) ?? undefined, {
                id: 'date',
                header: tr('components.invoiceTable.date'),
                // Nothing to order in a table of numbers only.
                enableSorting: detailed,
                sortFn: 'datetime',
                sortUndefined: 'last',
                meta: { width: dateWidth },
                cell: (info) => (
                  <Text style={styles.primary} {...ONE_LINE}>
                    {info.row.original.invoice_id !== null ? dateText(info.row.original.invoice_date) : '—'}
                  </Text>
                ),
              }),
            ]
          : []),
        helper.accessor((row) => row.total ?? undefined, {
          id: 'total',
          header: tr('components.invoiceTable.invoiceTotal'),
          enableSorting: detailed,
          sortFn: 'basic',
          sortUndefined: 'last',
          meta: { width: amountWidth, numeric: true },
          cell: (info) => (
            <Text style={styles.number} {...ONE_LINE}>
              {info.row.original.total === null ? '—' : invoiceAmount(info.row.original.total)}
            </Text>
          ),
        }),
      ]),
    [wide, detailed, dateWidth, amountWidth, onViewInvoice, styles]
  );
  const grid = useAppTable({ data: invoices.rows, columns, getRowId: (row) => row.key });

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

  const countText = tr('components.invoiceTable.invoiceCount', { count: invoices.count });

  return (
    <ScrollView style={own.container} contentContainerStyle={own.content} showsVerticalScrollIndicator={false}>
      <Text style={own.count} accessibilityRole="header" testID={`${testIDPrefix}-invoices-count`}>{countText}</Text>
      <DataTable
        table={grid}
        list="map"
        style={own.card}
        onRowPress={(row) => {
          if (row.original.invoice_id) onViewInvoice?.(row.original.invoice_id);
        }}
        rowPressable={(row) => !!(row.original.invoice_id && onViewInvoice)}
        rowLabel={(row) => {
          const r = row.original;
          const spokenDate = toDate(r.invoice_date) ? formatDate(r.invoice_date, 'short') : tr('components.invoiceTable.dateUnavailable');
          return r.total === null
            ? tr('components.invoiceTable.numbered', { number: formatIdentifier(r.invoice_no) })
            : tr('components.invoiceTable.rowLabel', { number: formatIdentifier(r.invoice_no), date: spokenDate, amount: invoiceAmount(r.total) });
        }}
        rowHint={() => tr('components.invoiceTable.opensInvoice')}
        rowTestID={(row) => `${testIDPrefix}-invoice-row-${row.original.key}`}
        footer={
          <>
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
          </>
        }
        testID={`${testIDPrefix}-invoices-table`}
      />
    </ScrollView>
  );
};
