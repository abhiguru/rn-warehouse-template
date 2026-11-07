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
import { formatCardDate, formatCurrency, formatFinancialYear, formatSpokenDate } from '@/utils/formatters';
import { getLanguage } from '@/i18n/language';
import { formatIdentifier, t as translate } from '@/i18n';
import type { Invoice } from '@/services/invoice-service';
import { StatusTag } from '@/components/ui/StatusTag';
import { asDocType, docTypeKey } from '@/features/gst/docType';
import { PaymentStatusTag } from '@/features/payments/PaymentStatusTag';
import { PrintSwipe } from './PrintSwipe';
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
  /** WH-143: payments are on, so the Due / Part paid / Paid tag shows (the status is the server's). */
  showPayment?: boolean;
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
  // Badge, customer and date, and the total at the end. Where the total sits depends on the screen only (see totalBeside).
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    columnGap: space.md,
  },
  // Solid brand fill. A long number wraps inside its own box and is never cut.
  invoiceBadge: {
    backgroundColor: t.brand.fill,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    maxWidth: '30%' as const,
    flexShrink: 1,
  },
  invoiceBadgeText: {
    ...typography.footnote,
    fontWeight: fontWeight.bold,
    color: t.brand.onFill,
  },
  cardInfo: {
    flex: 1,
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
    fontWeight: fontWeight.bold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  // The total under the customer, at the end, on a screen too narrow to hold it beside.
  amountUnder: {
    alignSelf: 'flex-end' as const,
    marginTop: space.xs,
  },
  // The grey bar: four fixed places, equal columns, each value above a small label.
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
    flexBasis: 0,
    alignItems: 'center' as const,
    justifyContent: 'flex-start' as const,
    paddingHorizontal: space.xxs,
  },
  metricValue: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'center' as const,
  },
  discountValue: {
    color: t.status.positive.text,
  },
  emptyValue: {
    color: t.text.secondary,
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

/** A place with nothing in it. */
const EMPTY_PLACE = '–';

interface Metric {
  id: string;
  label: string;
  /** Whole rupees, or the dash for a place with nothing. */
  value: string;
  /** A discount: drawn in status.positive.text. */
  discount: boolean;
  empty: boolean;
}

/** The widest figure the bar is sized for: ₹9,99,999 in whole rupees. */
const SIZING_AMOUNT = 999999;

/** Width of a figure in ems (weight 600, tabular): digits and the rupee sign 0.56 (Gujarati digits 0.62), separators 0.26. */
const figureEms = (text: string): number => {
  const digit = getLanguage() === 'gu' ? 0.62 : 0.56;
  return [...text].reduce((sum, ch) => sum + (/[\p{Nd}₹]/u.test(ch) ? digit : 0.26), 0);
};

/** The window less the card's margins, outline and padding. */
const cardInnerWidth = (width: number): number => width - 2 * layout.marginCompact - 2 - 2 * space.lg;

/** Four across when the sizing figure fits a quarter of the bar at this width and font scale; else a 2 x 2 grid. Never reads the invoice. */
const barFitsOneRow = (width: number, fontScale: number): boolean => {
  const column = (cardInnerWidth(width) - 3) / 4 - 2 * space.xxs;
  const figure = figureEms(formatCurrency(SIZING_AMOUNT, { maximumFractionDigits: 0 })) * typography.footnote.fontSize! * fontScale;
  return figure <= column;
};

/** The total sits beside the number and customer when at least this much is left for them (badge and customer). */
const HEADER_REST_MIN = 150;

/** The total's width in ems for ₹99,99,999.00, in bold 18. */
const totalBeside = (width: number, fontScale: number): boolean => {
  const total = figureEms(formatInvoiceAmount(9999999)) * 18 * fontScale;
  return cardInnerWidth(width) - total - 2 * space.md >= HEADER_REST_MIN;
};

const MetricsBar = React.memo<{ metrics: Metric[] }>(({ metrics }) => {
  const styles = useThemedStyles(makeStyles);
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.max(1, fontScale || 1);
  const rows = barFitsOneRow(width, scale) ? [metrics] : [metrics.slice(0, 2), metrics.slice(2)];
  // Gujarati labels such as "વધારાનો ચાર્જ" may take two lines: every label reserves them, so every card's bar is as tall.
  const labelLines = getLanguage() === 'gu' ? 2 : 1;
  const labelHeight = labelLines * (typography.caption1.lineHeight ?? 16) * scale;

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
                  style={[styles.metricValue, metric.empty && styles.emptyValue, metric.discount && styles.discountValue]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {metric.value}
                </Text>
                <Text style={[styles.metricLabel, { minHeight: labelHeight }]}>{metric.label}</Text>
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
  onPrint,
  canPrint = false,
  words,
  showPayment = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { width, fontScale } = useWindowDimensions();
  // Decided from the screen only, so every card of the list has its total in the same place.
  const beside = totalBeside(width, Math.max(1, fontScale || 1));

  // A missing amount is 0, as on the details screen (the list service already maps them; this guards a stale row).
  const total = invoice.total || 0;
  const taxAmount = invoice.tax_amount || 0;
  const labour = invoice.labour || 0;
  const discount = invoice.discount || 0;
  const totalText = formatInvoiceAmount(total);
  // Four fixed places in a fixed order, so the bars line up down the list: Subtotal (the Breakdown tab's Net before
  // tax), Tax, Labour, then Discount, which says Surcharge on a surcharge invoice (discount and surcharge are one
  // signed field, so they never occur together). A place with nothing shows a dash. Whole rupees; the label reads exact.
  const amounts = savedInvoiceAmounts({ total, tax_amount: taxAmount, discount });
  const whole = (n: number) => (n < 0 ? `−${formatCurrency(-n, { maximumFractionDigits: 0 })}` : formatCurrency(n, { maximumFractionDigits: 0 }));
  const place = (id: string, label: string, amount: number, shown: string, spoken: string, isDiscount = false) => ({
    id,
    label,
    value: amount === 0 ? EMPTY_PLACE : shown,
    discount: isDiscount && amount !== 0,
    empty: amount === 0,
    spoken: amount === 0 ? null : `${label} ${spoken}`,
  });
  const adjustment = amounts.adjustmentAmount;
  const places = [
    place('subtotal', translate('invoice.label.subtotal'), amounts.netBeforeTax, whole(amounts.netBeforeTax), formatInvoiceAmount(amounts.netBeforeTax)),
    place('tax', translate('invoice.label.tax'), taxAmount, whole(taxAmount), formatInvoiceAmount(taxAmount)),
    place('labour', translate('invoice.label.labour'), labour, whole(labour), formatInvoiceAmount(labour)),
    amounts.isSurcharge
      ? place('adjustment', translate('invoice.label.surcharge'), adjustment, `+${whole(adjustment)}`, `+${formatInvoiceAmount(adjustment)}`)
      : place('adjustment', translate('invoice.label.discount'), adjustment, `−${whole(adjustment)}`, formatInvoiceDeduction(adjustment), true),
  ];
  const metrics: Metric[] = places;
  const customerName = invoice.customer?.name || translate('lists.invoice.customerNotSet');
  const invoiceDate = formatCardDate(invoice.invoice_date);
  const grnText = invoice.grn?.gr_no ? translate('lists.card.grnRef', { number: formatIdentifier(invoice.grn.gr_no) }) : null;
  // Spoken: the exact amounts of the places that have one; an empty place says nothing.
  const spokenAmounts = places.map(place => place.spoken).filter(Boolean).join(', ');

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
    // WH-151: the document type, for every type but a plain Invoice (saved before GST details, or made without them).
    asDocType(invoice.doc_type) !== 'invoice' ? translate(docTypeKey(invoice.doc_type)) : null,
    showPayment && !invoice.cancelled_at && invoice.payment_status
      ? translate(invoice.payment_status === 'paid' ? 'payments.status.paid' : invoice.payment_status === 'part_paid' ? 'payments.status.partPaid' : 'payments.status.due')
      : null,
  ].filter(Boolean).join(', ');

  // A cancelled invoice is not printed (as on its details screen).
  const printable = canPrint && !!onPrint && !invoice.cancelled_at;
  const printLabel = translate('lists.invoice.printLabel', { title: translate('lists.invoice.cardTitle', { number: formatIdentifier(invoice.invoice_number) }) });

  const card = (
    <Pressable
      onPress={() => onPress(invoice)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityDescription}
      accessibilityHint={translate(printable ? 'lists.invoice.openHintActions' : 'lists.invoice.openHint')}
      accessibilityActions={printable ? [{ name: 'print', label: translate('common.print') }] : undefined}
      onAccessibilityAction={printable ? () => onPrint?.(invoice) : undefined}
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
        {beside ? <Text style={styles.amountValue}>{totalText}</Text> : null}
      </View>
      {beside ? null : <Text style={[styles.amountValue, styles.amountUnder]}>{totalText}</Text>}

      {/* Key amounts side by side */}
      <MetricsBar metrics={metrics} />

      {/* Financial year and origin */}
      <View style={styles.tagRow}>
        <StatusTag status="neutral" icon="calendar-check" label={translate('lists.invoice.financialYear', { year: formatFinancialYear(invoice.financial_year) })} />
        {invoice.cancelled_at ? <StatusTag status="negative" icon="cancel" label={translate('invoice.cancel.tag')} /> : null}
        {asDocType(invoice.doc_type) !== 'invoice' ? <StatusTag status="informative" icon="file-document-outline" label={translate(docTypeKey(invoice.doc_type))} /> : null}
        {showPayment && !invoice.cancelled_at ? <PaymentStatusTag status={invoice.payment_status} /> : null}
        {invoice.is_auto_generated && (
          <StatusTag status="informative" icon="auto-fix" label={translate('lists.invoice.autoGenerated')} />
        )}
      </View>
    </Pressable>
  );

  if (!printable) return card;
  return (
    // One swipe state per invoice: FlashList reuses this cell for another invoice, which must not appear already swiped open.
    <PrintSwipe key={String(invoice.invoice_id)} onPrint={() => onPrint?.(invoice)} label={printLabel} cardMargin={space.xs}>
      {card}
    </PrintSwipe>
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
    prevProps.onPrint === nextProps.onPrint &&
    prevInvoice.payment_status === nextInvoice.payment_status &&
    prevInvoice.doc_type === nextInvoice.doc_type &&
    prevProps.showPayment === nextProps.showPayment &&
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
