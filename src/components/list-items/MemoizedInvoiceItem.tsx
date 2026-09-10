/**
 * MemoizedInvoiceItem - Optimized Invoice Card Component
 *
 * 2025 Best Practices Implementation:
 * - React.memo with custom areEqual comparison
 * - Stable callbacks via props (no inline functions)
 * - Minimal re-renders through prop comparison
 * - SAP Fiori design compliance
 *
 * @module list-items/MemoizedInvoiceItem
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { Invoice } from '@/services/invoice-service';
import type { ListColors } from '@/hooks/useListColors';

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
  /** Theme-aware list colors for dark mode support */
  colors: ListColors;
}

// ============================================================================
// COMPONENT
// ============================================================================

const InvoiceItemContent: React.FC<MemoizedInvoiceItemProps> = ({
  invoice,
  onPress,
  colors,
}) => {
  // Calculate values
  const subtotal = invoice.total - invoice.tax_amount;
  const hasLabour = invoice.labour > 0;
  const hasDiscount = invoice.discount > 0;

  // Build comprehensive accessibility label
  const accessibilityDescription = [
    `Invoice ${invoice.invoice_number}`,
    `for ${invoice.customer?.name || 'Unknown Customer'}`,
    `Total: ${formatCurrency(invoice.total)}`,
    `Date: ${formatDate(invoice.invoice_date, 'medium')}`,
    invoice.grn?.gr_no ? `GRN: ${invoice.grn.gr_no}` : null,
    hasLabour ? `Labour: ${formatCurrency(invoice.labour)}` : null,
    hasDiscount ? `Discount: ${formatCurrency(invoice.discount)}` : null,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={() => onPress(invoice)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.cellBackground, borderWidth: 1, borderColor: colors.cellDivider },
        pressed && { backgroundColor: colors.cellBackgroundPressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityDescription}
      accessibilityHint="Double tap to view invoice details"
    >
      {/* Card Header */}
      <View style={styles.cardHeader}>
        {/* Invoice Badge */}
        <View style={[styles.invoiceBadge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.invoiceBadgeText, { color: colors.white }]}>{invoice.invoice_number}</Text>
        </View>

        {/* Customer & Date Info */}
        <View style={styles.cardInfo}>
          <Text style={[styles.customerName, { color: colors.textPrimary }]} numberOfLines={1}>
            {invoice.customer?.name || 'Unknown Customer'}
          </Text>
          <View style={styles.metaRow}>
            <Icon name="calendar-outline" size={12} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>
              {formatDate(invoice.invoice_date, 'medium')}
            </Text>
            {invoice.grn?.gr_no && (
              <>
                <View style={[styles.metaDot, { backgroundColor: colors.gray400 }]} />
                <Icon name="clipboard-text-outline" size={12} color={colors.textTertiary} />
                <Text style={[styles.metaText, { color: colors.textTertiary }]}>{invoice.grn.gr_no}</Text>
              </>
            )}
          </View>
        </View>

        {/* Total Amount */}
        <View style={styles.amountContainer}>
          <Text style={[styles.amountValue, { color: colors.textPrimary }]}>{formatCurrency(invoice.total)}</Text>
        </View>
      </View>

      {/* Metrics Row */}
      <View style={[styles.metricsBar, { backgroundColor: colors.gray50 }]}>
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatCurrency(subtotal)}
          </Text>
          <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Subtotal</Text>
        </View>
        <View style={[styles.metricDivider, { backgroundColor: colors.gray200 }]} />
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatCurrency(invoice.tax_amount)}
          </Text>
          <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Tax</Text>
        </View>
        {hasLabour && (
          <>
            <View style={[styles.metricDivider, { backgroundColor: colors.gray200 }]} />
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {formatCurrency(invoice.labour)}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Labour</Text>
            </View>
          </>
        )}
        {hasDiscount && (
          <>
            <View style={[styles.metricDivider, { backgroundColor: colors.gray200 }]} />
            <View style={styles.metric}>
              <Text
                style={[styles.metricValue, { color: colors.statusPositive }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                -{formatCurrency(invoice.discount)}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Discount</Text>
            </View>
          </>
        )}
      </View>

      {/* Footer - FY Badge */}
      <View style={styles.fyContainer}>
        <View style={[styles.fyBadge, { backgroundColor: colors.gray100 }]}>
          <Icon name="calendar-check" size={10} color={colors.textTertiary} />
          <Text style={[styles.fyText, { color: colors.textTertiary }]}>FY {invoice.financial_year}</Text>
        </View>
        {invoice.is_auto_generated && (
          <View style={[styles.autoBadge, { backgroundColor: colors.blueLight }]}>
            <Icon name="auto-fix" size={10} color={colors.blue} />
            <Text style={[styles.autoText, { color: colors.blue }]}>Auto</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

// Custom comparison function for React.memo
const areEqual = (
  prevProps: MemoizedInvoiceItemProps,
  nextProps: MemoizedInvoiceItemProps
): boolean => {
  const prevInvoice = prevProps.invoice;
  const nextInvoice = nextProps.invoice;

  return (
    prevInvoice.invoice_id === nextInvoice.invoice_id &&
    prevInvoice.invoice_number === nextInvoice.invoice_number &&
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
    // Compare colors (same reference means same theme)
    prevProps.colors === nextProps.colors
  );
};

/**
 * Memoized Invoice Item Component
 *
 * Uses React.memo with custom comparison to prevent unnecessary re-renders.
 * Only re-renders when invoice data or callbacks actually change.
 */
export const MemoizedInvoiceItem = React.memo(InvoiceItemContent, areEqual);

MemoizedInvoiceItem.displayName = 'MemoizedInvoiceItem';

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  card: {
    // backgroundColor: applied inline for dark mode
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceBadge: {
    // backgroundColor: applied inline for dark mode
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 12,
  },
  invoiceBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    // color: applied inline for dark mode
  },
  cardInfo: {
    flex: 1,
    marginRight: 12,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    // color: applied inline for dark mode
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    // color: applied inline for dark mode
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    // backgroundColor: applied inline for dark mode
    marginHorizontal: 6,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '700',
    // color: applied inline for dark mode
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: applied inline for dark mode
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    // color: applied inline for dark mode
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    // color: applied inline for dark mode
  },
  metricDivider: {
    width: 1,
    height: 24,
    // backgroundColor: applied inline for dark mode
    marginHorizontal: 8,
  },
  fyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: applied inline for dark mode
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  fyText: {
    fontSize: 10,
    // color: applied inline for dark mode
    fontWeight: '500',
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: applied inline for dark mode
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  autoText: {
    fontSize: 10,
    // color: applied inline for dark mode
    fontWeight: '500',
  },
});

export default MemoizedInvoiceItem;
