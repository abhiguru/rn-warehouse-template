/**
 * InvoiceHeroHeader: object page header for an invoice (style guide §13.8).
 *
 * On surface.card: the document type, the invoice number, the customer and
 * date, then the key facts (items, total, tax) as key-value pairs with
 * tabular, right-aligned money.
 */
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatCount, formatDate, formatNumber, toDate } from '@/utils/formatters';
import { t, formatIdentifier, getLanguage } from '@/i18n';

// ============================================================================
// TYPES
// ============================================================================
interface InvoiceHeroHeaderProps {
  invoice_number: number;
  date: string;
  total_items: number;
  total_amount: number;
  tax_amount: number;
  customer_name?: string;
}

const formatHeaderDate = (value: string) => (toDate(value) ? formatDate(value) : '');

/** From this system font scale the header tightens its spacing to leave the table room. */
export const COMPACT_FONT_SCALE = 1.5;
/** The header's texts stop growing past this system font scale (the tables keep full size). */
export const HEADER_TEXT_CAP = 1.5;

const charEm = (char: string): number => (/[\d૦-૯]/.test(char) ? 0.6 : /[,.\s]/.test(char) ? 0.28 : 0.62);
/** Estimated width in dp of a figure in the bold headline: 0.6 em per digit, 0.28 em per separator. */
export const estimateFigureWidth = (text: string, fontScale: number): number => {
  const size = (typography.headline.fontSize ?? 17) * Math.min(Math.max(1, fontScale), HEADER_TEXT_CAP);
  const em = Array.from(text).reduce((sum, c) => sum + charEm(c), 0);
  return Math.ceil(em * size * (getLanguage() === 'gu' ? 1.15 : 1));
};
/** Whether the figures fit side by side, each on one line, in `available` dp. */
export const figuresFitOneRow = (values: readonly string[], fontScale: number, available: number): boolean =>
  values.reduce((sum, v) => sum + estimateFigureWidth(v, fontScale), 0) + (values.length - 1) * space.md <= available;

// ============================================================================
// STYLES
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.card,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  docType: { ...typography.footnote, color: t.text.secondary },
  number: {
    ...typography.title2,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  subtitle: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  // One key-value row per fact: a long money figure gets the whole row width and stays on
  // one line, instead of sharing a third of the width and breaking mid-number.
  factsRow: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.xs,
  },
  fact: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
  },
  factLabel: { ...typography.footnote, color: t.text.secondary, flexShrink: 0 },
  factValue: {
    ...typography.headline,
    flexShrink: 1,
    textAlign: 'right' as const,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  factValueTotal: { fontWeight: fontWeight.bold },
  containerCompact: { paddingTop: space.sm, paddingBottom: space.sm },
  factsRowCompact: { marginTop: space.sm, paddingTop: space.sm, gap: space.xxs },
  factsRowCompactNoTop: { marginTop: 0, borderTopWidth: 0, paddingTop: 0 },
  factsRowOne: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: space.md },
  factOne: { flexDirection: 'column' as const, alignItems: 'flex-start' as const, justifyContent: 'flex-start' as const, gap: 0, flexShrink: 1 },
  subtitleCompact: { marginTop: 0 },
});

// ============================================================================
// COMPONENT
// ============================================================================
export const InvoiceHeroHeader: React.FC<InvoiceHeroHeaderProps> = ({
  invoice_number,
  date,
  total_items,
  total_amount,
  tax_amount,
  customer_name,
}) => {
  const styles = useThemedStyles(makeStyles);
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const compact = fontScale >= COMPACT_FONT_SCALE;

  // Ensure all numeric values are valid numbers (handle null/undefined)
  const safeItems = Number(total_items) || 0;
  const safeAmount = Number(total_amount) || 0;
  const safeTax = Number(tax_amount) || 0;
  const formattedDate = formatHeaderDate(date);
  const subtitle = [customer_name, formattedDate].filter(Boolean).join(' · ');

  const facts = [
    {
      key: 'items',
      label: t('common.items'),
      value: formatNumber(safeItems),
      a11y: formatCount(safeItems, 'item'),
    },
    {
      key: 'total',
      label: t('common.total'),
      value: formatInvoiceAmount(safeAmount),
      a11y: t('invoice.details.totalA11y', { amount: formatInvoiceAmount(safeAmount) }),
      emphasized: true,
    },
    {
      key: 'tax',
      label: t('invoice.label.tax'),
      value: formatInvoiceAmount(safeTax),
      a11y: t('invoice.details.taxA11y', { amount: formatInvoiceAmount(safeTax) }),
    },
  ];

  // From the compact scale the title bar already shows "Invoice <number>": the hero keeps only
  // the customer and date, and puts the three figures in one row when they fit.
  const oneRow = compact && figuresFitOneRow(facts.map(f => f.value), fontScale, windowWidth - 2 * space.lg);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {(!compact || !!subtitle) && (
      <View accessible accessibilityRole="header" accessibilityLabel={`${t('invoice.details.titleNumber', { number: formatIdentifier(invoice_number) })}${subtitle ? `, ${subtitle}` : ''}`}>
        {!compact && <Text style={styles.docType} maxFontSizeMultiplier={HEADER_TEXT_CAP}>{t('common.invoice')}</Text>}
        {!compact && <Text style={styles.number} maxFontSizeMultiplier={HEADER_TEXT_CAP}>{invoice_number}</Text>}
        {subtitle ? <Text style={[styles.subtitle, compact && styles.subtitleCompact]} maxFontSizeMultiplier={HEADER_TEXT_CAP}>{subtitle}</Text> : null}
      </View>
      )}

      <View style={[styles.factsRow, compact && styles.factsRowCompact, compact && !subtitle && styles.factsRowCompactNoTop, oneRow && styles.factsRowOne]}>
        {facts.map(fact => (
          <View key={fact.key} style={[styles.fact, oneRow && styles.factOne]} accessible accessibilityLabel={fact.a11y}>
            <Text style={styles.factLabel} maxFontSizeMultiplier={HEADER_TEXT_CAP}>{fact.label}</Text>
            <Text
              style={[styles.factValue, fact.emphasized && styles.factValueTotal]}
              maxFontSizeMultiplier={HEADER_TEXT_CAP}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >{fact.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
