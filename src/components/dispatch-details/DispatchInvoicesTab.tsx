/**
 * DispatchInvoicesTab Component
 *
 * Invoices tab of the dispatch object page (style guide §14.2):
 * - KPI tiles with the invoice count and total amount (§13.11)
 * - Read-only list of invoice numbers
 */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatCurrency } from '@/utils/formatters';

// Using snake_case to match backend RPC types
export interface InvoiceSummary {
  total_invoices: number;
  total_amount: number;
  invoice_numbers?: number[];
}

interface DispatchInvoicesTabProps {
  invoiceSummary: InvoiceSummary;
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  content: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
  },
  summaryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginBottom: space.xxl,
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
  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  invoicesSection: {
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
  invoiceNumberText: {
    ...typography.body,
    color: t.text.primary,
    flex: 1,
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
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
});

export const DispatchInvoicesTab: React.FC<DispatchInvoicesTabProps> = ({
  invoiceSummary,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  if (invoiceSummary.total_invoices === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="file-document-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">No invoices yet</Text>
        <Text style={styles.emptySubtitle}>
          Invoices created for this dispatch appear here.
        </Text>
      </View>
    );
  }

  const invoiceNumbers = invoiceSummary.invoice_numbers || [];
  const countLabel = invoiceSummary.total_invoices === 1 ? 'Invoice' : 'Invoices';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary tiles */}
      <View style={styles.summaryGrid}>
        <View
          style={styles.summaryCard}
          accessible
          accessibilityLabel={formatCount(invoiceSummary.total_invoices, 'invoice')}
        >
          <View style={[styles.iconCircle, styles.iconCircleNeutral]}>
            <Icon name="file-document-multiple-outline" size={iconSize.lg} color={t.status.neutral.text} />
          </View>
          <Text style={styles.summaryValue}>{invoiceSummary.total_invoices}</Text>
          <Text style={styles.summaryLabel}>{countLabel}</Text>
        </View>

        <View
          style={styles.summaryCard}
          accessible
          accessibilityLabel={`Total amount ${formatCurrency(invoiceSummary.total_amount, { maximumFractionDigits: 0 })}`}
        >
          <View style={[styles.iconCircle, styles.iconCircleBrand]}>
            <Icon name="currency-inr" size={iconSize.lg} color={t.brand.tint} />
          </View>
          <Text style={styles.summaryValue}>{formatCurrency(invoiceSummary.total_amount, { maximumFractionDigits: 0 })}</Text>
          <Text style={styles.summaryLabel}>Total amount</Text>
        </View>
      </View>

      {/* Invoice numbers */}
      {invoiceNumbers.length > 0 && (
        <View>
          <Text style={styles.sectionTitle} accessibilityRole="header">Invoices</Text>
          <View style={styles.invoicesSection}>
            {invoiceNumbers.map((invoiceNo, index) => (
              <View
                key={`${invoiceNo}-${index}`}
                style={[
                  styles.invoiceRow,
                  index < invoiceNumbers.length - 1 && styles.invoiceRowDivider,
                ]}
                accessible
                accessibilityLabel={`Invoice ${invoiceNo}`}
              >
                <Icon name="file-document-outline" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.invoiceNumberText}>Invoice {invoiceNo}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
};
