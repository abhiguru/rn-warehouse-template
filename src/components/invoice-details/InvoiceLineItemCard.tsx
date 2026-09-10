/**
 * InvoiceLineItemCard Component - SAP Fiori Design
 *
 * Card displaying individual invoice line items.
 * @see design/sap-fiori-specs/13-card.md
 *
 * Features:
 * - Fiori Card structure (header/body/footer layout)
 * - Clean financial summary with semantic colors
 * - Clickable GRN and Dispatch references with 44pt touch targets
 * - Platform-specific shadows
 * - listColors for consistent theming
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';
import { formatCurrency, formatNumber, formatDate } from '@/utils/formatters';

// ============================================================================
// FIORI CONSTANTS
// ============================================================================

const FIORI = {
  card: {
    cornerRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  typography: {
    title: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '600' as const,
    },
    label: {
      fontSize: 11,
      fontWeight: '500' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    body: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    value: {
      fontSize: 14,
      fontWeight: '700' as const,
    },
    badge: {
      fontSize: 18,
      fontWeight: '700' as const,
    },
    small: {
      fontSize: 10,
      fontWeight: '500' as const,
      letterSpacing: 0.5,
    },
  },
  touchTarget: 44,
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  }) as ViewStyle,
} as const;

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
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    card: {
      marginHorizontal: FIORI.card.marginHorizontal,
      marginBottom: FIORI.card.marginBottom,
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI.card.cornerRadius,
      borderWidth: FIORI.card.borderWidth,
      borderColor: colors.cellDivider,
      overflow: 'hidden',
      ...FIORI.shadow,
    },
    itemIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: FIORI.spacing.md,
    },
    itemName: {
      ...FIORI.typography.title,
      color: colors.gray900,
    },
    packagingLabel: {
      fontSize: 12,
      color: colors.gray600,
      marginTop: 2,
      fontWeight: '500',
    },
    daysBadge: {
      backgroundColor: colors.secondaryLight,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      alignItems: 'center',
      minWidth: 52,
    },
    daysNumber: {
      ...FIORI.typography.badge,
      color: colors.secondary,
      lineHeight: 22,
    },
    daysLabel: {
      ...FIORI.typography.small,
      color: colors.secondary,
      textTransform: 'uppercase',
    },
    storageSection: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: FIORI.spacing.lg,
      paddingBottom: FIORI.spacing.md,
      gap: FIORI.spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
      paddingTop: FIORI.spacing.md,
    },
    storageLabel: {
      ...FIORI.typography.label,
      color: colors.gray400,
    },
    storageValue: {
      ...FIORI.typography.body,
      color: colors.gray900,
      fontWeight: '600',
      marginLeft: 2,
    },
    quantityBadge: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.statusPositiveLight,
      paddingHorizontal: FIORI.spacing.md,
      paddingVertical: FIORI.spacing.sm,
      borderRadius: 10,
      gap: FIORI.spacing.sm,
    },
    dispatchBadge: {
      backgroundColor: colors.primaryLight,
    },
    quantityLabel: {
      ...FIORI.typography.small,
      color: colors.gray600,
      textTransform: 'uppercase',
    },
    quantityValue: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.statusPositiveDark,
    },
    dispatchValue: {
      color: colors.primary,
    },
    financialSection: {
      marginHorizontal: FIORI.spacing.lg,
      marginBottom: FIORI.spacing.md,
      borderRadius: FIORI.card.cornerRadius,
      backgroundColor: colors.gray50,
      overflow: 'hidden',
    },
    financialDivider: {
      width: 1,
      height: 32,
      backgroundColor: colors.cellDivider,
    },
    financialLabel: {
      ...FIORI.typography.small,
      color: colors.gray600,
      textTransform: 'uppercase',
      marginBottom: FIORI.spacing.xs,
    },
    chargeAmount: {
      ...FIORI.typography.value,
      color: colors.gray900,
    },
    taxAmount: {
      ...FIORI.typography.value,
      color: colors.primary,
    },
    totalAmount: {
      ...FIORI.typography.value,
      color: colors.statusPositiveDark,
    },
    referencesSection: {
      paddingHorizontal: FIORI.spacing.lg,
      paddingBottom: FIORI.spacing.lg,
      gap: FIORI.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
      paddingTop: FIORI.spacing.md,
    },
    referenceButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.gray50,
      paddingVertical: 10,
      paddingHorizontal: FIORI.spacing.md,
      borderRadius: 10,
      minHeight: FIORI.touchTarget,
    },
    referenceButtonPressed: {
      backgroundColor: colors.gray100,
    },
    grnIcon: {
      backgroundColor: colors.secondaryLight,
    },
    dispatchIcon: {
      backgroundColor: colors.primaryLight,
    },
    referenceType: {
      ...FIORI.typography.small,
      color: colors.gray600,
      textTransform: 'uppercase',
    },
    referenceNumber: {
      ...FIORI.typography.body,
      fontWeight: '600',
      color: colors.gray900,
      marginTop: 1,
    },
    dispatchReferenceButton: {
      backgroundColor: colors.gray50,
      paddingVertical: FIORI.spacing.md,
      paddingHorizontal: FIORI.spacing.md,
      borderRadius: FIORI.card.cornerRadius,
      minHeight: FIORI.touchTarget,
      borderWidth: 1,
      borderColor: colors.cellDivider,
    },
    dispatchNumber: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.primary,
      marginTop: 1,
    },
    dispatchNumberMuted: {
      ...FIORI.typography.body,
      color: colors.gray600,
      marginTop: 1,
    },
    dispatchDetailsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
      gap: FIORI.spacing.lg,
    },
    dispatchDetailText: {
      fontSize: 12,
      color: colors.gray600,
      fontWeight: '500',
    },
    dispatchDetailTextMuted: {
      fontSize: 12,
      color: colors.gray400,
      fontWeight: '500',
    },
  }), [colors]);

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

  const isGrnClickable = grNo && onViewGRN;
  const isDispatchClickable = onViewDispatch && dispatchId;

  return (
    <View style={dynamicStyles.card}>
      {/* Header Section - Item Name with Icon */}
      <View style={styles.headerSection}>
        <View style={dynamicStyles.itemIconContainer}>
          <Icon name="package-variant" size={20} color={colors.primary} />
        </View>
        <View style={styles.headerContent}>
          <Text style={dynamicStyles.itemName} numberOfLines={2}>
            {itemName}
          </Text>
          {packaging && (
            <Text style={dynamicStyles.packagingLabel}>{packaging}</Text>
          )}
        </View>
        {noOfDays !== undefined && noOfDays > 0 && (
          <View style={dynamicStyles.daysBadge}>
            <Text style={dynamicStyles.daysNumber}>{noOfDays}</Text>
            <Text style={dynamicStyles.daysLabel}>{noOfDays === 1 ? 'day' : 'days'}</Text>
          </View>
        )}
      </View>

      {/* Storage Details Row */}
      {hasStorageDetails && (
        <View style={dynamicStyles.storageSection}>
          {durationNum > 0 && (
            <View style={styles.storageItem}>
              <Icon name="clock-outline" size={14} color={colors.gray500} />
              <Text style={dynamicStyles.storageLabel}>Duration</Text>
              <Text style={dynamicStyles.storageValue}>{Number.isInteger(durationNum) ? durationNum : durationNum.toFixed(1)} {durationNum === 1 ? 'month' : 'months'}</Text>
            </View>
          )}
          {packageMark && (
            <View style={styles.storageItem}>
              <Icon name="tag-outline" size={14} color={colors.gray500} />
              <Text style={dynamicStyles.storageLabel}>Mark</Text>
              <Text style={dynamicStyles.storageValue}>{packageMark}</Text>
            </View>
          )}
          {rack && (
            <View style={styles.storageItem}>
              <Icon name="warehouse" size={14} color={colors.gray500} />
              <Text style={dynamicStyles.storageLabel}>Rack</Text>
              <Text style={dynamicStyles.storageValue}>{rack}</Text>
            </View>
          )}
          {weight !== undefined && weight > 0 && (
            <View style={styles.storageItem}>
              <Icon name="weight" size={14} color={colors.gray500} />
              <Text style={dynamicStyles.storageLabel}>Weight</Text>
              <Text style={dynamicStyles.storageValue}>{formatNumber(weight)} kg</Text>
            </View>
          )}
        </View>
      )}

      {/* Quantities Section */}
      {hasQuantities && (
        <View style={styles.quantitiesSection}>
          {grnQuantity !== undefined && grnQuantity > 0 && (
            <View style={dynamicStyles.quantityBadge}>
              <Icon name="arrow-down-bold-circle" size={16} color={colors.success} />
              <View style={styles.quantityContent}>
                <Text style={dynamicStyles.quantityLabel}>Received</Text>
                <Text style={dynamicStyles.quantityValue}>{formatNumber(grnQuantity)}</Text>
              </View>
            </View>
          )}
          {dispatchQty !== undefined && dispatchQty > 0 && (
            <View style={[dynamicStyles.quantityBadge, dynamicStyles.dispatchBadge]}>
              <Icon name="arrow-up-bold-circle" size={16} color={colors.primary} />
              <View style={styles.quantityContent}>
                <Text style={dynamicStyles.quantityLabel}>Dispatched</Text>
                <Text style={[dynamicStyles.quantityValue, dynamicStyles.dispatchValue]}>{formatNumber(dispatchQty)}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Financial Summary - Clean 3-column layout */}
      <View style={dynamicStyles.financialSection}>
        <View style={styles.financialGrid}>
          <View style={styles.financialItem}>
            <Text style={dynamicStyles.financialLabel}>Charge</Text>
            <Text style={dynamicStyles.chargeAmount}>{formatCurrency(charge)}</Text>
          </View>
          <View style={dynamicStyles.financialDivider} />
          <View style={styles.financialItem}>
            <Text style={dynamicStyles.financialLabel}>Tax</Text>
            <Text style={dynamicStyles.taxAmount}>{formatCurrency(tax)}</Text>
          </View>
          <View style={dynamicStyles.financialDivider} />
          <View style={styles.financialItem}>
            <Text style={dynamicStyles.financialLabel}>Total</Text>
            <Text style={dynamicStyles.totalAmount}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </View>

      {/* Reference Links Section */}
      {(grNo || hasDispatch) && (
        <View style={dynamicStyles.referencesSection}>
          {/* GRN Reference */}
          {grNo && (
            <Pressable
              style={({ pressed }) => [
                dynamicStyles.referenceButton,
                pressed && isGrnClickable && dynamicStyles.referenceButtonPressed,
              ]}
              onPress={handleGRNPress}
              disabled={!isGrnClickable}
              accessibilityRole="button"
              accessibilityLabel={`View GRN ${grNo}`}
              accessibilityHint="Opens the GRN details screen"
            >
              <View style={[styles.referenceIcon, dynamicStyles.grnIcon]}>
                <Icon name="file-document-outline" size={18} color={colors.secondary} />
              </View>
              <View style={styles.referenceContent}>
                <Text style={dynamicStyles.referenceType}>GRN</Text>
                <Text style={dynamicStyles.referenceNumber}>{grNo}</Text>
              </View>
              {isGrnClickable && (
                <Icon name="chevron-right" size={20} color={colors.gray400} />
              )}
            </Pressable>
          )}

          {/* Dispatch Reference - Enhanced with No, Date, Qty */}
          {hasDispatch && (
            <Pressable
              style={({ pressed }) => [
                dynamicStyles.dispatchReferenceButton,
                pressed && isDispatchClickable && dynamicStyles.referenceButtonPressed,
              ]}
              onPress={handleDispatchPress}
              disabled={!isDispatchClickable}
              accessibilityRole="button"
              accessibilityLabel={`View Dispatch ${dispatchNo || ''}`}
              accessibilityHint="Opens the dispatch details screen"
            >
              <View style={styles.dispatchHeader}>
                <View style={[styles.referenceIcon, dynamicStyles.dispatchIcon]}>
                  <Icon name="truck-fast-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.dispatchTitleSection}>
                  <Text style={dynamicStyles.referenceType}>DISPATCH</Text>
                  {dispatchNo ? (
                    <Text style={dynamicStyles.dispatchNumber}>#{dispatchNo}</Text>
                  ) : (
                    <Text style={dynamicStyles.dispatchNumberMuted}>View Details</Text>
                  )}
                </View>
                {isDispatchClickable && (
                  <Icon name="chevron-right" size={20} color={colors.gray400} />
                )}
              </View>

              {/* Dispatch Details Row */}
              {(dispatchDate || dispatchQty || (!dispatchDate && !dispatchNo && dispatchId)) && (
                <View style={dynamicStyles.dispatchDetailsRow}>
                  {dispatchDate && (
                    <View style={styles.dispatchDetail}>
                      <Icon name="calendar" size={12} color={colors.gray400} />
                      <Text style={dynamicStyles.dispatchDetailText}>{formatDate(dispatchDate)}</Text>
                    </View>
                  )}
                  {dispatchQty !== undefined && dispatchQty > 0 && (
                    <View style={styles.dispatchDetail}>
                      <Icon name="package-variant" size={12} color={colors.gray400} />
                      <Text style={dynamicStyles.dispatchDetailText}>{formatNumber(dispatchQty)} units</Text>
                    </View>
                  )}
                  {!dispatchDate && !dispatchNo && dispatchId && (
                    <View style={styles.dispatchDetail}>
                      <Icon name="identifier" size={12} color={colors.gray400} />
                      <Text style={dynamicStyles.dispatchDetailTextMuted}>ID: {dispatchId.substring(0, 8)}...</Text>
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES (Static layout only - colors are in dynamicStyles)
// ============================================================================

const styles = StyleSheet.create({
  // Header Section
  headerSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: FIORI.spacing.lg,
    paddingBottom: FIORI.spacing.md,
  },
  headerContent: {
    flex: 1,
    paddingRight: FIORI.spacing.sm,
  },

  // Storage Details Section
  storageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
  },

  // Quantities Section
  quantitiesSection: {
    flexDirection: 'row',
    paddingHorizontal: FIORI.spacing.lg,
    paddingBottom: FIORI.spacing.md,
    gap: FIORI.spacing.md,
  },
  quantityContent: {
    flex: 1,
  },

  // Financial Section
  financialGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  financialItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: FIORI.spacing.md,
    paddingHorizontal: FIORI.spacing.sm,
  },

  // References Section
  referenceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  referenceContent: {
    flex: 1,
  },

  // Dispatch Reference - Enhanced
  dispatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dispatchTitleSection: {
    flex: 1,
  },
  dispatchDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
  },
});

// Export memoized component
export const InvoiceLineItemCard = React.memo(InvoiceLineItemCardComponent);
