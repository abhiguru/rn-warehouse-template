/**
 * MemoizedInvoiceItem - invoice object cell for the invoice list.
 *
 * - React.memo with a custom areEqual comparison
 * - Stable callbacks via props (no inline functions)
 * - Style guide §13.6 object cell: title, subtitle, footnote, main value on the
 *   right, chevron because it drills down, pressed `surface.cardPressed`.
 *
 * @module list-items/MemoizedInvoiceItem
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import {
  formatInvoiceAmount,
  formatInvoiceDeduction,
  savedInvoiceAmounts,
} from '@/utils/invoiceCalculations';
import { formatDate } from '@/utils/formatters';
import type { Invoice } from '@/services/invoice-service';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoizedInvoiceItemProps {
  /** Invoice data to render */
  invoice: Invoice;
  /** Callback when item is pressed */
  onPress: (invoice: Invoice) => void;
  /** Callback for view details action */
  onViewDetails?: (invoice: Invoice) => void;
  /** Callback for edit action */
  onEdit?: (invoice: Invoice) => void;
  /** Callback for print action */
  onPrint?: (invoice: Invoice) => void;
  /** Whether print action is available */
  canPrint?: boolean;
  /**
   * Deprecated: the cell reads theme tokens itself. Still accepted (and
   * compared) so existing list callers keep working.
   */
  colors?: unknown;
}

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.xs,
    padding: space.lg,
    minHeight: layout.objectCellMinHeight,
    ...t.shadow[1],
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
  },
  cardInfo: {
    flex: 1,
  },
  customerName: {
    ...typography.headline,
    color: t.text.primary,
  },
  invoiceNumber: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  metaText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  amountContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  amountValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  metricsBar: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
    rowGap: space.sm,
  },
  metric: {
    flexGrow: 1,
    flexBasis: '45%' as const,
  },
  metricLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  metricValue: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  metricValueDiscount: {
    color: t.status.positive.text,
  },
  tagRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.md,
  },
  neutralTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.neutral.background,
    borderRadius: radius.field,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    gap: space.xs,
  },
  neutralTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
  },
  infoTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.informative.background,
    borderRadius: radius.field,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    gap: space.xs,
  },
  infoTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.informative.text,
  },
});

// ============================================================================
// COMPONENT
// ============================================================================

const InvoiceItemContent: React.FC<MemoizedInvoiceItemProps> = ({
  invoice,
  onPress,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Calculate values
  const saved = savedInvoiceAmounts(invoice);
  const hasLabour = invoice.labour > 0;
  const hasAdjustment = saved.hasAdjustment;
  const isDiscount = invoice.discount > 0;
  const adjustmentText = isDiscount
    ? formatInvoiceDeduction(saved.adjustmentAmount)
    : `+${formatInvoiceAmount(saved.adjustmentAmount)}`;
  const customerName = invoice.customer?.name || 'Customer not set';
  const invoiceDate = formatDate(invoice.invoice_date, 'medium');

  // One element for screen readers (style guide §11.3)
  const accessibilityDescription = [
    `Invoice ${invoice.invoice_number}`,
    customerName,
    `Total ${formatInvoiceAmount(invoice.total)}`,
    invoiceDate,
    invoice.grn?.gr_no ? `GRN ${invoice.grn.gr_no}` : null,
    hasLabour ? `Labour ${formatInvoiceAmount(invoice.labour)}` : null,
    hasAdjustment ? `${saved.adjustmentLabel} ${adjustmentText}` : null,
    invoice.is_auto_generated ? 'Auto-generated' : null,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={() => onPress(invoice)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityDescription}
      accessibilityHint="Opens the invoice"
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.customerName} numberOfLines={2}>
            {customerName}
          </Text>
          <Text style={styles.invoiceNumber}>Invoice {invoice.invoice_number}</Text>
          <View style={styles.metaRow}>
            <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.metaText}>{invoiceDate}</Text>
            {invoice.grn?.gr_no ? (
              <>
                <Text style={styles.metaText}>·</Text>
                <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.metaText}>GRN {invoice.grn.gr_no}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountValue}>{formatInvoiceAmount(invoice.total)}</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        </View>
      </View>

      {/* Key amounts */}
      <View style={styles.metricsBar}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Net before tax</Text>
          <Text style={styles.metricValue}>{formatInvoiceAmount(saved.netBeforeTax)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Tax</Text>
          <Text style={styles.metricValue}>{formatInvoiceAmount(invoice.tax_amount)}</Text>
        </View>
        {hasLabour && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Labour</Text>
            <Text style={styles.metricValue}>{formatInvoiceAmount(invoice.labour)}</Text>
          </View>
        )}
        {hasAdjustment && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{saved.adjustmentLabel}</Text>
            <Text style={[styles.metricValue, isDiscount && styles.metricValueDiscount]}>
              {adjustmentText}
            </Text>
          </View>
        )}
      </View>

      {/* Financial year and origin */}
      <View style={styles.tagRow}>
        <View style={styles.neutralTag}>
          <Icon name="calendar-check" size={iconSize.sm} color={t.status.neutral.text} />
          <Text style={styles.neutralTagText} maxFontSizeMultiplier={1.6}>
            FY {invoice.financial_year}
          </Text>
        </View>
        {invoice.is_auto_generated && (
          <View style={styles.infoTag}>
            <Icon name="auto-fix" size={iconSize.sm} color={t.status.informative.text} />
            <Text style={styles.infoTagText} maxFontSizeMultiplier={1.6}>Auto-generated</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

/**
 * Custom comparison function for React.memo. Every rendered invoice field is
 * compared, so an edit that only moves the invoice date re-renders the card.
 * Theme changes re-render through the cell's own theme hooks.
 */
export const invoiceItemPropsAreEqual = (
  prevProps: MemoizedInvoiceItemProps,
  nextProps: MemoizedInvoiceItemProps
): boolean => {
  const prevInvoice = prevProps.invoice;
  const nextInvoice = nextProps.invoice;

  return (
    prevInvoice.invoice_id === nextInvoice.invoice_id &&
    prevInvoice.invoice_number === nextInvoice.invoice_number &&
    prevInvoice.invoice_date === nextInvoice.invoice_date &&
    prevInvoice.total === nextInvoice.total &&
    prevInvoice.tax_amount === nextInvoice.tax_amount &&
    prevInvoice.labour === nextInvoice.labour &&
    prevInvoice.discount === nextInvoice.discount &&
    prevInvoice.financial_year === nextInvoice.financial_year &&
    prevInvoice.is_auto_generated === nextInvoice.is_auto_generated &&
    prevInvoice.customer?.name === nextInvoice.customer?.name &&
    prevInvoice.grn?.gr_no === nextInvoice.grn?.gr_no &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.canPrint === nextProps.canPrint &&
    prevProps.colors === nextProps.colors
  );
};

/**
 * Memoized Invoice Item Component
 *
 * Uses React.memo with custom comparison to prevent unnecessary re-renders.
 * Only re-renders when invoice data or callbacks actually change.
 */
export const MemoizedInvoiceItem = React.memo(InvoiceItemContent, invoiceItemPropsAreEqual);

MemoizedInvoiceItem.displayName = 'MemoizedInvoiceItem';

export default MemoizedInvoiceItem;
