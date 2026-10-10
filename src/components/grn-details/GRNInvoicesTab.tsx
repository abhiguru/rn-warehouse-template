/**
 * GRNInvoicesTab Component
 *
 * Invoice summary and list for a GRN (object page tab, style guide §14.2):
 * - KPI tiles with the invoice count and amounts (§13.11)
 * - Read-only list of invoice numbers
 */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatCurrency, formatNumber } from '@/utils/formatters';
import { t as tr } from '@/i18n';

// Using snake_case to match backend RPC types
interface InvoiceSummary {
  total_invoices: number;
  total_amount: number;
  total_with_tax?: number;
  invoice_numbers: string[];
}

interface GRNInvoicesTabProps {
  invoiceSummary: InvoiceSummary;
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  contentContainer: {
    padding: layout.marginCompact,
    paddingBottom: space.xxxl,
  },
  section: {
    marginBottom: space.xxl,
  },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  summaryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: '45%' as const,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    alignItems: 'center' as const,
    ...t.shadow[2],
  },
  summaryCardFull: {
    flexBasis: '100%' as const,
  },
  iconCircle: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.sm,
  },
  iconCircleBrand: {
    backgroundColor: t.brand.subtle,
  },
  iconCircleNeutral: {
    backgroundColor: t.status.neutral.background,
  },
  summaryValue: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'center' as const,
  },
  summaryLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginTop: space.xxs,
  },
  listCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  invoiceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  invoiceRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  invoiceNumber: {
    ...typography.body,
    color: t.text.primary,
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.giant,
    backgroundColor: t.background.base,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
});

export const GRNInvoicesTab: React.FC<GRNInvoicesTabProps> = ({
  invoiceSummary,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const { total_invoices, total_amount, total_with_tax, invoice_numbers } = invoiceSummary;

  if (total_invoices === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="file-document-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">{tr('grn.invoices.emptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>
          {tr('grn.invoices.emptySubtitle')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Summary tiles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{tr('grn.invoices.summaryTitle')}</Text>

        <View style={styles.summaryGrid}>
          <View
            style={styles.summaryCard}
            accessible
            accessibilityLabel={formatCount(total_invoices, 'invoice')}
          >
            <View style={[styles.iconCircle, styles.iconCircleNeutral]}>
              <Icon name="file-document-multiple-outline" size={iconSize.lg} color={t.status.neutral.text} />
            </View>
            <Text style={styles.summaryValue}>{formatNumber(total_invoices)}</Text>
            <Text style={styles.summaryLabel}>{tr('grn.invoices.invoiceUnit', { count: total_invoices })}</Text>
          </View>

          <View
            style={styles.summaryCard}
            accessible
            accessibilityLabel={tr('grn.invoices.amountBeforeTaxLabel', { amount: formatCurrency(total_amount, { maximumFractionDigits: 0 }) })}
          >
            <View style={[styles.iconCircle, styles.iconCircleBrand]}>
              <Icon name="currency-inr" size={iconSize.lg} color={t.brand.tint} />
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(total_amount, { maximumFractionDigits: 0 })}</Text>
            <Text style={styles.summaryLabel}>{tr('grn.invoices.amountBeforeTax')}</Text>
          </View>

          <View
            style={[styles.summaryCard, styles.summaryCardFull]}
            accessible
            accessibilityLabel={tr('grn.invoices.totalWithTaxLabel', { amount: formatCurrency(total_with_tax || 0, { maximumFractionDigits: 0 }) })}
          >
            <View style={[styles.iconCircle, styles.iconCircleBrand]}>
              <Icon name="cash-multiple" size={iconSize.lg} color={t.brand.tint} />
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(total_with_tax || 0, { maximumFractionDigits: 0 })}</Text>
            <Text style={styles.summaryLabel}>{tr('grn.invoices.totalWithTax')}</Text>
          </View>
        </View>
      </View>

      {/* Invoice numbers */}
      {invoice_numbers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{tr('grn.tabs.invoices')}</Text>
          <View style={styles.listCard}>
            {invoice_numbers.map((invoiceNo, index) => (
              <View
                key={invoiceNo}
                style={[
                  styles.invoiceRow,
                  index < invoice_numbers.length - 1 && styles.invoiceRowDivider,
                ]}
                accessible
                accessibilityLabel={tr('grn.invoices.invoiceWithNumber', { number: String(invoiceNo) })}
              >
                <Icon name="file-document-outline" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.invoiceNumber}>{tr('grn.invoices.invoiceWithNumber', { number: String(invoiceNo) })}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
};
