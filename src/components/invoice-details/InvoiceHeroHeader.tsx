/**
 * InvoiceHeroHeader: object page header for an invoice (style guide §13.8).
 *
 * On surface.card: the document type, the invoice number, the customer and
 * date, then the key facts (items, total, tax) as key-value pairs with
 * tabular, right-aligned money.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatCount, formatDate, formatNumber, toDate } from '@/utils/formatters';
import { t } from '@/i18n';

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
  factsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.md,
  },
  fact: { flexGrow: 1, flexBasis: 90, gap: space.xxs },
  factLabel: { ...typography.footnote, color: t.text.secondary },
  factValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  factValueTotal: { fontWeight: fontWeight.bold },
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

  return (
    <View style={styles.container}>
      <View accessible accessibilityRole="header" accessibilityLabel={`${t('invoice.details.titleNumber', { number: String(invoice_number) })}${subtitle ? `, ${subtitle}` : ''}`}>
        <Text style={styles.docType}>{t('common.invoice')}</Text>
        <Text style={styles.number}>{invoice_number}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>

      <View style={styles.factsRow}>
        {facts.map(fact => (
          <View key={fact.key} style={styles.fact} accessible accessibilityLabel={fact.a11y}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text style={[styles.factValue, fact.emphasized && styles.factValueTotal]}>{fact.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
