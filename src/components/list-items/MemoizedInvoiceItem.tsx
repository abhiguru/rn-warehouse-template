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

import { getLanguage } from '@/i18n/language';
import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, singleLineText, space, typography } from '@/theme/tokens';
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
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { lastColumnAlone, makeTableStyles, numberColumnWidth, TABLE_OUTLINE, useTableLayout } from '@/components/common/DetailTable';

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
    flexDirection: 'column' as const,
  },
  titleRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    columnGap: space.md,
    rowGap: space.xxs,
  },
  // Grows to push the total to the end; never cut: a number too long for the line wraps inside its own box.
  invoiceTitle: {
    ...typography.headline,
    color: t.text.primary,
    flexGrow: 1,
    flexShrink: 1,
  },
  customerName: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    columnGap: space.sm,
    rowGap: space.xxs,
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
    flexShrink: 0,
    marginLeft: 'auto' as const,
  },
  amountValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  breakdown: {
    marginTop: space.md,
  },
  breakdownRow: {
    minHeight: 36,
    paddingVertical: space.sm,
  },
  // The nested table lies on the card: it takes the card's colour in the pressed state too.
  breakdownTable: {
    backgroundColor: 'transparent' as const,
  },
  breakdownTotal: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: 36,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.table.separator,
  },
  // At large text: the label, then the amount on its own line under it, at the end.
  breakdownStacked: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
    justifyContent: 'center' as const,
    gap: space.xxs,
  },
  stackedAmount: {
    textAlign: 'right' as const,
  },
  discountValue: {
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
// THE AMOUNTS (nested table, style guide 13.7)
// ============================================================================

interface AmountLine {
  id: string;
  label: string;
  value: string;
  /** A discount: drawn in status.positive.text (13.11). */
  discount: boolean;
}

const amountHelper = createAppColumnHelper<AmountLine>();
/** The amount column at font scale 1: fits "₹99,999.00" in weight 600 (13.7). */
const AMOUNT_WIDTH = 84;

/**
 * The saved amounts in the order and wording of the invoice's Breakdown tab: Net before tax, the discount or
 * surcharge and the labour (both already inside the net, so "(included)"), Tax, and the Total. Net before tax
 * is the total less the tax, so Net + Tax = Total; the two "included" rows explain the net and are not added.
 */
const AmountsTable = React.memo<{ lines: AmountLine[]; totalText: string }>(({ lines, totalText }) => {
  const table = useThemedStyles(makeTableStyles);
  const styles = useThemedStyles(makeStyles);
  const screen = useTableLayout();
  const amountWidth = numberColumnWidth(screen, AMOUNT_WIDTH, lines.map(line => line.value), [totalText]) + space.xs;
  // The row's content width: the window less the card's margins, outline and padding, and the table's outline and row padding.
  const row = screen.width - 2 * layout.marginCompact - 2 * 1 - 2 * space.lg - 2 * TABLE_OUTLINE - 2 * space.sm;
  // At large text the amount column would leave the label too narrow: one column, the amount under its label.
  const under = lastColumnAlone(row, amountWidth, screen.scale);

  const columns = useMemo(
    () =>
      under
        ? amountHelper.columns([
            amountHelper.display({
              id: 'label',
              header: '',
              meta: { width: 'grow' },
              cell: ({ row: r }) => (
                <View style={styles.breakdownStacked}>
                  <Text style={table.primary}>{r.original.label}</Text>
                  <Text style={[table.number, styles.stackedAmount, r.original.discount && styles.discountValue]} numberOfLines={1}>
                    {r.original.value}
                  </Text>
                </View>
              ),
            }),
          ])
        : amountHelper.columns([
            amountHelper.display({
              id: 'label',
              header: '',
              meta: { width: 'grow' },
              cell: ({ row: r }) => <Text style={table.primary}>{r.original.label}</Text>,
            }),
            amountHelper.display({
              id: 'amount',
              header: '',
              meta: { width: amountWidth, numeric: true },
              cell: ({ row: r }) => (
                <Text style={[table.number, r.original.discount && styles.discountValue]} numberOfLines={1}>
                  {r.original.value}
                </Text>
              ),
            }),
          ]),
    [under, amountWidth, table, styles]
  );
  // Ids without the invoice: a recycled card updates its rows instead of mounting new ones.
  const grid = useAppTable({ data: lines, columns, getRowId: line => line.id });

  return (
    // The card's own label already reads every amount, so the table adds no stops for a screen reader.
    <View
      style={styles.breakdown}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <DataTable
        table={grid}
        variant="nested"
        hideHeader
        style={styles.breakdownTable}
        rowStyle={styles.breakdownRow}
        footer={
          <View style={[styles.breakdownTotal, under && styles.breakdownStacked]}>
            <Text style={under ? table.primaryStrong : [table.primaryStrong, table.grow]}>{translate('common.total')}</Text>
            <Text style={[table.numberStrong, under ? styles.stackedAmount : { width: amountWidth }]} numberOfLines={1}>{totalText}</Text>
          </View>
        }
      />
    </View>
  );
});

AmountsTable.displayName = 'AmountsTable';

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
  const language = getLanguage();
  const totalText = formatInvoiceAmount(total);
  // The same rows and wording as the invoice's Breakdown tab, so the card and the details tell one story.
  // A row with nothing in it is left out: no tax, no Tax row (the net then equals the total).
  const lines = useMemo<AmountLine[]>(() => {
    const amounts = savedInvoiceAmounts({ total, tax_amount: taxAmount, discount });
    return [
      { id: 'net', label: translate('invoice.label.netBeforeTax'), value: formatInvoiceAmount(amounts.netBeforeTax), discount: false },
      ...(amounts.hasAdjustment
        ? [{
            id: 'adjustment',
            label: translate(amounts.isSurcharge ? 'invoice.label.surchargeIncluded' : 'invoice.label.discountIncluded'),
            value: discount > 0 ? formatInvoiceDeduction(amounts.adjustmentAmount) : `+${formatInvoiceAmount(amounts.adjustmentAmount)}`,
            discount: discount > 0,
          }]
        : []),
      ...(labour > 0
        ? [{ id: 'labour', label: translate('invoice.label.labourIncluded'), value: formatInvoiceAmount(labour), discount: false }]
        : []),
      ...(taxAmount !== 0
        ? [{ id: 'tax', label: translate('invoice.label.tax'), value: formatInvoiceAmount(taxAmount), discount: false }]
        : []),
    ];
    // The language changes the words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, taxAmount, labour, discount, language]);
  const customerName = invoice.customer?.name || translate('lists.invoice.customerNotSet');
  const invoiceDate = formatDate(invoice.invoice_date, 'short');
  // Spoken: the table's own rows in its order, "(included)" as drawn, (the Total is spoken before them).
  const spokenAmounts = lines.map(line => `${line.label} ${line.value}`).join(', ');

  // One element for screen readers (style guide §11.3)
  const accessibilityDescription = [
    translate('lists.invoice.cardTitle', { number: formatIdentifier(invoice.invoice_number) }),
    customerName,
    translate('lists.invoice.totalAmount', { amount: totalText }),
    // Every amount of the table below is read here: the table itself is hidden from screen readers.
    spokenAmounts,
    invoiceDate,
    invoice.grn?.gr_no ? translate('lists.card.grnRef', { number: formatIdentifier(invoice.grn.gr_no) }) : null,
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
        {/* The number and the total share the first line; if they cannot, the total goes under the number at the end. */}
        <View style={styles.titleRow}>
          <HighlightedText style={styles.invoiceTitle} text={formatIdentifier(invoice.invoice_number)} words={words} />
          <View style={styles.amountContainer}>
            <Text style={styles.amountValue}>{totalText}</Text>
            <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
          </View>
        </View>
        <HighlightedText style={styles.customerName} numberOfLines={2} text={customerName ?? ''} words={words} />
        <View style={styles.metaRow}>
          {/* Each fact keeps its icon and never shrinks: the row wraps between the date and the GRN, not inside one. */}
          <View style={styles.metaItem}>
            <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.metaText} {...singleLineText()}>{invoiceDate}</Text>
          </View>
          {invoice.grn?.gr_no ? (
            <View style={styles.metaItem}>
              <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
              <HighlightedText style={styles.metaText} text={translate('lists.card.grnRef', { number: formatIdentifier(invoice.grn.gr_no) })} words={words} />
            </View>
          ) : null}
        </View>
      </View>

      {/* Key amounts: one row each, ending with the total */}
      <AmountsTable lines={lines} totalText={totalText} />

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
