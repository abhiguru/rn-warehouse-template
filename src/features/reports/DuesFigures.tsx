/**
 * The three figures of the customer statement and the dues list (WH-155), never added into one total.
 *
 * Each figure is one line of its own with its label, so a long label or large text wraps and nothing is cut or shown without
 * its label (spec edge case "Long names, large text, 360 dp"); a screen reader reads each label with its amount, the estimate
 * with the word "estimate" that its label carries. The amounts are the server's, shown with 2 decimals.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import type { DuesFigures as Figures, InvoicesBasis } from '@/services/reporting/statement-service';
import { fontWeight, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatCurrency, formatDateTime, formatNumber, formatSpokenDateTime } from '@/utils/formatters';

/** An amount of the server's, in rupees with 2 decimals (Gujarati digits in Gujarati). */
export const rupees = (amount: number | null | undefined): string =>
  formatCurrency(amount ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The label of the first figure: what is due, or with Record payments off what was invoiced this financial year. */
export const invoicesLabel = (basis: InvoicesBasis): string =>
  basis === 'due' ? tr('reports.statement.dueOnInvoices') : tr('reports.grnActivity.invoiced');

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginTop: space.sm,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    gap: space.md,
    ...t.shadow[2],
  },
  asOf: { ...typography.footnote, color: t.text.secondary },
  figure: { gap: space.xxs },
  label: { ...typography.subhead, color: t.text.secondary },
  amount: { ...typography.title3, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  note: { ...typography.footnote, color: t.text.secondary },
  warn: { ...typography.footnote, color: t.status.critical.text },
});

interface DuesFiguresProps {
  figures: Figures;
  basis: InvoicesBasis;
  /** The server's moment of the read. */
  asOf: string;
  lotsWithoutRate: number;
}

export function DuesFigures({ figures, basis, asOf, lotsWithoutRate }: DuesFiguresProps) {
  const styles = useThemedStyles(makeStyles);
  const lines: [string, number][] = [
    [invoicesLabel(basis), figures.invoices_amount],
    [tr('reports.statement.notInvoicedLeft'), figures.not_invoiced_left],
    [tr('reports.statement.notInvoicedInStore'), figures.not_invoiced_in_store],
  ];
  return (
    <View style={styles.card}>
      <Text
        style={styles.asOf}
        accessibilityLabel={tr('reports.statement.asOf', { dateTime: formatSpokenDateTime(asOf) })}
      >
        {tr('reports.statement.asOf', { dateTime: formatDateTime(asOf) })}
      </Text>
      {lines.map(([label, amount]) => (
        <View key={label} style={styles.figure} accessible accessibilityLabel={tr('reports.shared.labelValue', { label, value: rupees(amount) })}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.amount}>{rupees(amount)}</Text>
        </View>
      ))}
      <Text style={styles.note}>{tr('reports.statement.estimateNote')}</Text>
      {lotsWithoutRate > 0 ? (
        <Text style={styles.warn}>{tr('reports.statement.lotsNoRate', { count: lotsWithoutRate, value: formatNumber(lotsWithoutRate) })}</Text>
      ) : null}
    </View>
  );
}
