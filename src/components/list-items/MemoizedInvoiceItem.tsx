/**
 * MemoizedInvoiceItem - invoice object cell for the invoice list.
 *
 * - React.memo with a custom areEqual comparison
 * - Stable callbacks via props (no inline functions)
 * - The old Fiori arrangement (owner decision, 2026-11-05, a named exception to
 *   style guide §13.6): the number in a solid badge, customer, date and GRN, the
 *   total at the end; a grey bar of amounts; the tags underneath.
 *
 * @module list-items/MemoizedInvoiceItem
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import {
  formatInvoiceAmount,
  formatInvoiceDeduction,
  savedInvoiceAmounts,
} from '@/utils/invoiceCalculations';
import { formatCardDate, formatFinancialYear, formatSpokenDate } from '@/utils/formatters';
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
  // Badge, customer and date, total. When they cannot share a line the total goes under, at the end.
  cardHeader: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start' as const,
    columnGap: space.md,
    rowGap: space.xs,
  },
  // Solid brand fill. A long number wraps inside its own box and is never cut.
  invoiceBadge: {
    backgroundColor: t.brand.fill,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    maxWidth: '40%' as const,
    flexShrink: 1,
  },
  invoiceBadgeText: {
    ...typography.footnote,
    fontWeight: fontWeight.bold,
    color: t.brand.onFill,
  },
  cardInfo: {
    flex: 1,
    flexBasis: 120,
    minWidth: 0,
    gap: space.xxs,
  },
  customerName: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    columnGap: space.xs,
    rowGap: space.xxs,
  },
  // One fact (icon and text): it never shrinks, so the row wraps between facts.
  metaItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    flexShrink: 0,
    maxWidth: '100%' as const,
  },
  metaText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: t.icon.secondary,
  },
  amountValue: {
    ...typography.headline,
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
    flexShrink: 0,
    marginLeft: 'auto' as const,
  },
  // The grey bar: amounts side by side, each value above its label; rows of it when they do not fit one line.
  metricsBar: {
    marginTop: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.field,
    backgroundColor: t.status.neutral.background,
    gap: space.sm,
  },
  metricsRow: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
  },
  metric: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.xs,
  },
  metricValue: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'center' as const,
  },
  discountValue: {
    color: t.status.positive.text,
  },
  metricLabel: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  metricDivider: {
    width: 1,
    backgroundColor: t.border.divider,
  },
  tagRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginTop: space.md,
  },
});

// ============================================================================
// THE AMOUNTS BAR
// ============================================================================

interface Metric {
  id: string;
  label: string;
  value: string;
  /** A discount: drawn in status.positive.text. */
  discount: boolean;
}

/** Share of the font size one figure character takes (digits, comma, point, rupee sign), with a margin. */
const FIGURE_WIDTH = 0.64;

/**
 * Splits the amounts into rows that fit the bar: as many side by side as the width allows for the widest
 * figure at the current font scale, the rest on the next row. Nothing is shrunk to fit unless one amount
 * alone is wider than the bar.
 */
const metricRows = (metrics: Metric[], barWidth: number, fontScale: number): Metric[][] => {
  const widest = Math.max(...metrics.map(metric => metric.value.length));
  const need = widest * typography.subhead.fontSize! * FIGURE_WIDTH * fontScale + 2 * space.xs + 1;
  const perRow = Math.max(1, Math.floor(barWidth / need));
  if (metrics.length <= perRow) return [metrics];
  // Even rows: five amounts on three places make 3 and 2, not 3, 2.
  const rows = Math.ceil(metrics.length / perRow);
  const size = Math.ceil(metrics.length / rows);
  const out: Metric[][] = [];
  for (let i = 0; i < metrics.length; i += size) out.push(metrics.slice(i, i + size));
  return out;
};

const MetricsBar = React.memo<{ metrics: Metric[] }>(({ metrics }) => {
  const styles = useThemedStyles(makeStyles);
  const { width, fontScale } = useWindowDimensions();
  // The window less the card's margins, outline and padding.
  const barWidth = width - 2 * layout.marginCompact - 2 - 2 * space.lg;
  const rows = metricRows(metrics, barWidth, Math.max(1, fontScale || 1));

  return (
    // The card's own label already reads every amount, so the bar adds no stops for a screen reader.
    <View style={styles.metricsBar} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {rows.map(row => (
        <View key={row[0].id} style={styles.metricsRow}>
          {row.map((metric, index) => (
            <React.Fragment key={metric.id}>
              {index > 0 ? <View style={styles.metricDivider} /> : null}
              <View style={styles.metric}>
                <Text
                  style={[styles.metricValue, metric.discount && styles.discountValue]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {metric.value}
                </Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      ))}
    </View>
  );
});

MetricsBar.displayName = 'MetricsBar';

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

  // A missing amount is 0, as on the details screen (the list service already maps them; this guards a stale row).
  const total = invoice.total || 0;
  const taxAmount = invoice.tax_amount || 0;
  const labour = invoice.labour || 0;
  const discount = invoice.discount || 0;
  const totalText = formatInvoiceAmount(total);
  // The same figures as the invoice's Breakdown tab; the card calls "Net before tax" Subtotal. Tax is always
  // shown; Labour, Discount and Surcharge only when there is one.
  const metrics = (() => {
    const amounts = savedInvoiceAmounts({ total, tax_amount: taxAmount, discount });
    return [
      { id: 'subtotal', label: translate('invoice.label.subtotal'), value: formatInvoiceAmount(amounts.netBeforeTax), discount: false },
      { id: 'tax', label: translate('invoice.label.tax'), value: formatInvoiceAmount(taxAmount), discount: false },
      ...(labour > 0
        ? [{ id: 'labour', label: translate('invoice.label.labour'), value: formatInvoiceAmount(labour), discount: false }]
        : []),
      ...(amounts.hasAdjustment
        ? [{
            id: 'adjustment',
            label: translate(amounts.isSurcharge ? 'invoice.label.surcharge' : 'invoice.label.discount'),
            value: discount > 0 ? formatInvoiceDeduction(amounts.adjustmentAmount) : `+${formatInvoiceAmount(amounts.adjustmentAmount)}`,
            discount: discount > 0,
          }]
        : []),
    ];
  })();
  const customerName = invoice.customer?.name || translate('lists.invoice.customerNotSet');
  const invoiceDate = formatCardDate(invoice.invoice_date);
  const grnText = invoice.grn?.gr_no ? translate('lists.card.grnRef', { number: formatIdentifier(invoice.grn.gr_no) }) : null;
  // Spoken: the bar's own amounts as drawn (the total is spoken before them).
  const spokenAmounts = metrics.map(metric => `${metric.label} ${metric.value}`).join(', ');

  // One element for screen readers (style guide §11.3)
  const accessibilityDescription = [
    translate('lists.invoice.cardTitle', { number: formatIdentifier(invoice.invoice_number) }),
    customerName,
    translate('lists.invoice.totalAmount', { amount: totalText }),
    // Every amount of the bar below is read here: the bar itself is hidden from screen readers.
    spokenAmounts,
    formatSpokenDate(invoice.invoice_date),
    grnText,
    invoice.is_auto_generated ? translate('lists.invoice.autoGenerated') : null,
    invoice.cancelled_at ? translate('invoice.cancel.tag') : null,
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
        <View style={styles.invoiceBadge}>
          <HighlightedText style={styles.invoiceBadgeText} text={formatIdentifier(invoice.invoice_number)} words={words} />
        </View>
        <View style={styles.cardInfo}>
          <HighlightedText style={styles.customerName} numberOfLines={2} text={customerName ?? ''} words={words} />
          <View style={styles.metaRow}>
            {/* Each fact keeps its icon and never shrinks: the row wraps between the date and the GRN, not inside one. */}
            <View style={styles.metaItem}>
              <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.metaText}>{invoiceDate}</Text>
            </View>
            {grnText ? (
              <>
                <View style={styles.metaDot} />
                <View style={styles.metaItem}>
                  <Icon name="clipboard-text-outline" size={iconSize.sm} color={t.icon.secondary} />
                  <HighlightedText style={styles.metaText} text={grnText} words={words} />
                </View>
              </>
            ) : null}
          </View>
        </View>
        <Text style={styles.amountValue}>{totalText}</Text>
      </View>

      {/* Key amounts side by side */}
      <MetricsBar metrics={metrics} />

      {/* Financial year and origin */}
      <View style={styles.tagRow}>
        <StatusTag status="neutral" icon="calendar-check" label={translate('lists.invoice.financialYear', { year: formatFinancialYear(invoice.financial_year) })} />
        {invoice.cancelled_at ? <StatusTag status="negative" icon="cancel" label={translate('invoice.cancel.tag')} /> : null}
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
    prevInvoice.cancelled_at === nextInvoice.cancelled_at &&
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
