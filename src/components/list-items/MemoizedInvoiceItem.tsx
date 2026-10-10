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
import { fontWeight, iconSize, layout, radius, singleLineText, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import {
  formatInvoiceAmount,
  formatInvoiceDeduction,
  savedInvoiceAmounts,
} from '@/utils/invoiceCalculations';
import { formatDate, formatFinancialYear } from '@/utils/formatters';
import { formatIdentifier, t as translate } from '@/i18n';
import type { Invoice } from '@/services/invoice-service';
import { StatusTag } from '@/components/ui/StatusTag';
import { HighlightedText } from '@/features/filters/components/HighlightedText';

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
  /** Lower-cased search words to show in bold (see `searchWords`). */
  words?: string[];
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
    // The outline keeps each card distinct in dark mode, where the shadow does not show.
    borderWidth: 1,
    borderColor: t.border.separator,
    ...t.shadow[2],
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
  },
  iconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.subtle,
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
  metaItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    flexShrink: 0,
    maxWidth: '100%' as const,
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
});

// ============================================================================
// COMPONENT
// ============================================================================

const InvoiceItemContent: React.FC<MemoizedInvoiceItemProps> = ({
  invoice,
  onPress,
  words,
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
  const customerName = invoice.customer?.name || translate('lists.invoice.customerNotSet');
  const invoiceDate = formatDate(invoice.invoice_date, 'short');

  // One element for screen readers (style guide §11.3)
  const accessibilityDescription = [
    translate('lists.invoice.cardTitle', { number: formatIdentifier(invoice.invoice_number) }),
    customerName,
    translate('lists.invoice.totalAmount', { amount: formatInvoiceAmount(invoice.total) }),
    invoiceDate,
    invoice.grn?.gr_no ? translate('lists.card.grnRef', { number: formatIdentifier(invoice.grn.gr_no) }) : null,
    hasLabour ? translate('lists.invoice.labourAmount', { amount: formatInvoiceAmount(invoice.labour) }) : null,
    hasAdjustment ? translate('lists.invoice.adjustmentAmount', { label: saved.adjustmentLabel, amount: adjustmentText }) : null,
    invoice.is_auto_generated ? translate('lists.invoice.autoGenerated') : null,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={() => onPress(invoice)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityDescription}
      accessibilityHint={translate('lists.invoice.openHint')}
    >
      <View style={styles.cardHeader}>
        {/* Object icon (§13.6), as on GRN and dispatch rows */}
        <View style={styles.iconContainer}>
          <Icon name="file-document-outline" size={iconSize.md} color={t.brand.tint} />
        </View>
        <View style={styles.cardInfo}>
          <HighlightedText style={styles.customerName} numberOfLines={2} text={translate('lists.invoice.cardTitle', { number: formatIdentifier(invoice.invoice_number) })} words={words} />
          <HighlightedText style={styles.invoiceNumber} numberOfLines={2} text={customerName ?? ''} words={words} />
          <View style={styles.metaRow}>
            {/* Each fact keeps its icon and never shrinks: the row wraps between the date and the GRN, not inside one. */}
            <View style={styles.metaItem}>
              <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.metaText} {...singleLineText()}>{invoiceDate}</Text>
              {invoice.grn?.gr_no ? <Text style={styles.metaText}>·</Text> : null}
            </View>
            {invoice.grn?.gr_no ? (
              <View style={styles.metaItem}>
                <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
                <HighlightedText style={styles.metaText} text={translate('lists.card.grnRef', { number: formatIdentifier(invoice.grn.gr_no) })} words={words} />
              </View>
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
          <Text style={styles.metricLabel}>{translate('lists.invoice.netBeforeTax')}</Text>
          <Text style={styles.metricValue}>{formatInvoiceAmount(saved.netBeforeTax)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>{translate('lists.invoice.tax')}</Text>
          <Text style={styles.metricValue}>{formatInvoiceAmount(invoice.tax_amount)}</Text>
        </View>
        {hasLabour && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{translate('lists.invoice.labour')}</Text>
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
        <StatusTag status="neutral" icon="calendar-check" label={translate('lists.invoice.financialYear', { year: formatFinancialYear(invoice.financial_year) })} />
        {invoice.is_auto_generated && (
          <StatusTag status="informative" icon="auto-fix" label={translate('lists.invoice.autoGenerated')} />
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
    prevProps.words === nextProps.words
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
