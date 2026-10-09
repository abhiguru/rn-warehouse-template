/**
 * InvoiceLineItemCard Component
 *
 * Object cell for one invoice line item (style guide §13.6): item name and
 * packaging, storage facts, quantities, charge / tax / total with tabular
 * figures, and tappable GRN and dispatch references (44 pt targets).
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatNumber, formatDate, formatCount, formatWeight } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';

// ============================================================================
// TYPES
// ============================================================================

export interface InvoiceLineItemCardProps {
  itemName: string;
  duration?: string;
  noOfDays?: number;
  charge: number;
  tax: number;
  grNo?: string;
  // Dispatch details
  dispatchId?: string;
  dispatchNo?: string;  // e.g., "I2660"
  dispatchDate?: string;
  dispatchQty?: number;
  // Storage details
  packageMark?: string;
  rack?: string;
  grnQuantity?: number;
  weight?: number;
  packaging?: string;
  onViewGRN?: (grNo: string) => void;
  onViewDispatch?: (dispatchId: string) => void;
}

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.md,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  headerSection: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    padding: space.lg,
    paddingBottom: space.md,
    gap: space.md,
  },
  itemIconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  headerContent: { flex: 1 },
  itemName: { ...typography.headline, color: t.text.primary },
  packagingLabel: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  daysValue: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  section: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  storageSection: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.lg },
  storageItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  storageLabel: { ...typography.footnote, color: t.text.secondary },
  storageValue: {
    ...typography.footnote,
    color: t.text.primary,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
  },
  quantitiesSection: { flexDirection: 'row' as const, gap: space.lg },
  quantityItem: { flex: 1, gap: space.xxs },
  quantityLabel: { ...typography.footnote, color: t.text.secondary },
  quantityValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  financialGrid: { flexDirection: 'row' as const, gap: space.md },
  financialItem: { flex: 1, alignItems: 'flex-end' as const, gap: space.xxs },
  financialLabel: { ...typography.footnote, color: t.text.secondary },
  amount: {
    ...typography.subhead,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  totalAmount: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  referencesSection: { gap: space.xs, paddingVertical: space.xs, paddingHorizontal: 0 },
  referenceButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    minHeight: touchTarget,
    gap: space.md,
  },
  referenceButtonPressed: { backgroundColor: t.surface.cardPressed },
  referenceContent: { flex: 1 },
  referenceType: { ...typography.footnote, color: t.text.secondary },
  referenceNumber: { ...typography.body, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  dispatchDetailsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.lg, marginTop: space.xxs },
  dispatchDetail: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  dispatchDetailText: { ...typography.footnote, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
});

// ============================================================================
// COMPONENT
// ============================================================================

const InvoiceLineItemCardComponent: React.FC<InvoiceLineItemCardProps> = ({
  itemName,
  duration,
  noOfDays,
  charge,
  tax,
  grNo,
  dispatchId,
  dispatchNo,
  dispatchDate,
  dispatchQty,
  packageMark,
  rack,
  grnQuantity,
  weight,
  packaging,
  onViewGRN,
  onViewDispatch,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleGRNPress = useCallback(() => {
    if (grNo && onViewGRN) {
      onViewGRN(grNo);
    }
  }, [grNo, onViewGRN]);

  const handleDispatchPress = useCallback(() => {
    if (dispatchId && onViewDispatch) {
      onViewDispatch(dispatchId);
    }
  }, [dispatchId, onViewDispatch]);

  // Memoize computed values
  const { total, durationNum, hasStorageDetails, hasQuantities, hasDispatch } = useMemo(() => {
    const totalValue = charge + tax;
    const durationValue = duration ? parseFloat(duration) : 0;
    return {
      total: totalValue,
      durationNum: durationValue,
      hasStorageDetails: packageMark || rack || (weight !== undefined && weight > 0) || (durationValue > 0),
      hasQuantities: (grnQuantity !== undefined && grnQuantity > 0) || (dispatchQty !== undefined && dispatchQty > 0),
      hasDispatch: dispatchId || dispatchNo || dispatchDate || (dispatchQty !== undefined && dispatchQty > 0),
    };
  }, [charge, tax, duration, packageMark, rack, weight, grnQuantity, dispatchQty, dispatchId, dispatchNo, dispatchDate]);

  const isGrnClickable = !!(grNo && onViewGRN);
  const isDispatchClickable = !!(onViewDispatch && dispatchId);
  const durationText = formatCount(Math.round(durationNum * 10) / 10, 'month');

  return (
    <View style={styles.card}>
      {/* Header - item name */}
      <View style={styles.headerSection}>
        <View style={styles.itemIconContainer}>
          <Icon name="cube-outline" size={iconSize.md} color={t.brand.tint} />
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.itemName} numberOfLines={2}>
            {itemName}
          </Text>
          {packaging && (
            <Text style={styles.packagingLabel}>{packaging}</Text>
          )}
        </View>
        {noOfDays !== undefined && noOfDays > 0 && (
          <Text style={styles.daysValue}>{formatCount(noOfDays, 'day')}</Text>
        )}
      </View>

      {/* Storage details */}
      {hasStorageDetails && (
        <View style={[styles.section, styles.storageSection]}>
          {durationNum > 0 && (
            <View style={styles.storageItem}>
              <Icon name="clock-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.storageLabel}>Duration</Text>
              <Text style={styles.storageValue}>{durationText}</Text>
            </View>
          )}
          {packageMark && (
            <View style={styles.storageItem}>
              <Icon name="tag-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.storageLabel}>Mark</Text>
              <Text style={styles.storageValue}>{packageMark}</Text>
            </View>
          )}
          {rack && (
            <View style={styles.storageItem}>
              <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.storageLabel}>Rack</Text>
              <Text style={styles.storageValue}>{rack}</Text>
            </View>
          )}
          {weight !== undefined && weight > 0 && (
            <View style={styles.storageItem}>
              <Icon name="weight" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.storageLabel}>Weight</Text>
              <Text style={styles.storageValue}>{formatWeight(weight)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Quantities */}
      {hasQuantities && (
        <View style={[styles.section, styles.quantitiesSection]}>
          {grnQuantity !== undefined && grnQuantity > 0 && (
            <View style={styles.quantityItem} accessible accessibilityLabel={`Received ${formatNumber(grnQuantity)}`}>
              <Text style={styles.quantityLabel}>Received</Text>
              <Text style={styles.quantityValue}>{formatNumber(grnQuantity)}</Text>
            </View>
          )}
          {dispatchQty !== undefined && dispatchQty > 0 && (
            <View style={styles.quantityItem} accessible accessibilityLabel={`Dispatched ${formatNumber(dispatchQty)}`}>
              <Text style={styles.quantityLabel}>Dispatched</Text>
              <Text style={styles.quantityValue}>{formatNumber(dispatchQty)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Amounts */}
      <View
        style={[styles.section, styles.financialGrid]}
        accessible
        accessibilityLabel={`Charge ${formatInvoiceAmount(charge)}, tax ${formatInvoiceAmount(tax)}, total ${formatInvoiceAmount(total)}`}
      >
        <View style={styles.financialItem}>
          <Text style={styles.financialLabel}>Charge</Text>
          <Text style={styles.amount}>{formatInvoiceAmount(charge)}</Text>
        </View>
        <View style={styles.financialItem}>
          <Text style={styles.financialLabel}>Tax</Text>
          <Text style={styles.amount}>{formatInvoiceAmount(tax)}</Text>
        </View>
        <View style={styles.financialItem}>
          <Text style={styles.financialLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatInvoiceAmount(total)}</Text>
        </View>
      </View>

      {/* References */}
      {(grNo || hasDispatch) && (
        <View style={[styles.section, styles.referencesSection]}>
          {grNo && (
            <Pressable
              style={({ pressed }) => [
                styles.referenceButton,
                pressed && isGrnClickable && styles.referenceButtonPressed,
              ]}
              onPress={handleGRNPress}
              disabled={!isGrnClickable}
              accessibilityRole="button"
              accessibilityLabel={`View GRN ${grNo}`}
              accessibilityHint="Opens the GRN"
              accessibilityState={{ disabled: !isGrnClickable }}
            >
              <Icon name="package-down" size={iconSize.md} color={t.icon.secondary} />
              <View style={styles.referenceContent}>
                <Text style={styles.referenceType}>GRN</Text>
                <Text style={styles.referenceNumber}>{grNo}</Text>
              </View>
              {isGrnClickable && (
                <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
              )}
            </Pressable>
          )}

          {hasDispatch && (
            <Pressable
              style={({ pressed }) => [
                styles.referenceButton,
                pressed && isDispatchClickable && styles.referenceButtonPressed,
              ]}
              onPress={handleDispatchPress}
              disabled={!isDispatchClickable}
              accessibilityRole="button"
              accessibilityLabel={dispatchNo ? `View dispatch ${dispatchNo}` : 'View dispatch'}
              accessibilityHint="Opens the dispatch"
              accessibilityState={{ disabled: !isDispatchClickable }}
            >
              <Icon name="truck-delivery-outline" size={iconSize.md} color={t.icon.secondary} />
              <View style={styles.referenceContent}>
                <Text style={styles.referenceType}>Dispatch</Text>
                <Text style={styles.referenceNumber}>{dispatchNo || 'View dispatch'}</Text>
                {(dispatchDate || (dispatchQty !== undefined && dispatchQty > 0)) && (
                  <View style={styles.dispatchDetailsRow}>
                    {dispatchDate && (
                      <View style={styles.dispatchDetail}>
                        <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
                        <Text style={styles.dispatchDetailText}>{formatDate(dispatchDate, 'short')}</Text>
                      </View>
                    )}
                    {dispatchQty !== undefined && dispatchQty > 0 && (
                      <View style={styles.dispatchDetail}>
                        <Icon name="cube-outline" size={iconSize.sm} color={t.icon.secondary} />
                        <Text style={styles.dispatchDetailText}>{`Qty ${formatNumber(dispatchQty)}`}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
              {isDispatchClickable && (
                <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

// Export memoized component
export const InvoiceLineItemCard = React.memo(InvoiceLineItemCardComponent);
