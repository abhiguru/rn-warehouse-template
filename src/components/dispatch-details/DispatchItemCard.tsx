/**
 * DispatchItemCard Component - SAP Fiori object cell (docs/STYLE_GUIDE.md §13.6)
 *
 * Card displaying individual dispatch item with GRN reference.
 *
 * Features:
 * - Title, dispatched bags on the right
 * - Pressable GRN reference with a 44/48 touch target and chevron
 * - Neutral tags for original quantity, weight and package mark
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, toDate, formatWeight } from '@/utils/formatters';
import { t as tr } from '@/i18n';

// ============================================================================
// UTILITIES
// ============================================================================

const bags = (qty: number) => formatCount(qty, 'bag');

// ============================================================================
// TYPES - Using snake_case to match backend
// ============================================================================

export interface DispatchItemCardProps {
  item_name: string;
  dispatch_quantity: number;
  grn_no: string;
  grn_date: string;
  grn_id?: string;
  original_quantity?: number;
  weight?: number;
  package_mark?: string;
  onViewGRN?: (grn_id: string) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    padding: space.lg,
    paddingBottom: space.md,
  },
  itemName: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  quantity: {
    alignItems: 'flex-end' as const,
  },
  quantityValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  quantityLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  grnSection: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  grnLabel: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  grnButton: {
    backgroundColor: t.background.base,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.sm,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
  },
  grnButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  grnContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  grnInfo: {
    flex: 1,
  },
  grnNo: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  grnDate: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  detailsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  detailChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.xxs,
    paddingHorizontal: space.sm,
    backgroundColor: t.status.neutral.background,
    borderRadius: radius.field,
    gap: space.xs,
  },
  detailChipText: {
    ...typography.caption1,
    color: t.status.neutral.text,
    fontVariant: ['tabular-nums' as const],
  },
});

// ============================================================================
// COMPONENT
// ============================================================================

const DispatchItemCardComponent: React.FC<DispatchItemCardProps> = ({
  item_name,
  dispatch_quantity,
  grn_no,
  grn_date,
  grn_id,
  original_quantity,
  weight,
  package_mark,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleGRNPress = useCallback(() => {
    if (grn_id && onViewGRN) {
      onViewGRN(grn_id);
    }
  }, [grn_id, onViewGRN]);

  const formattedGrnDate = useMemo(() => (toDate(grn_date) ? formatDate(grn_date, 'short') : ''), [grn_date]);
  const hasDetails = original_quantity !== undefined || weight !== undefined || package_mark;
  const isGrnClickable = !!(grn_id && onViewGRN);

  return (
    <View style={styles.card}>
      {/* Header - Item name with dispatched bags */}
      <View
        style={styles.header}
        accessible
        accessibilityLabel={tr('dispatch.details.itemBagsDispatched', { item: item_name, bags: bags(dispatch_quantity) })}
      >
        <Text style={styles.itemName} numberOfLines={2}>
          {item_name}
        </Text>
        <View style={styles.quantity}>
          <Text style={styles.quantityValue}>{formatNumber(dispatch_quantity)}</Text>
          <Text style={styles.quantityLabel}>{tr('dispatch.count.bagsUnit', { count: dispatch_quantity })}</Text>
        </View>
      </View>

      {/* GRN Reference Section */}
      <View style={styles.grnSection}>
        <Text style={styles.grnLabel} accessibilityRole="header">{tr('dispatch.details.fromGrn')}</Text>

        <Pressable
          style={({ pressed }) => [
            styles.grnButton,
            pressed && isGrnClickable && styles.grnButtonPressed,
          ]}
          onPress={handleGRNPress}
          disabled={!isGrnClickable}
          accessibilityRole={isGrnClickable ? 'button' : undefined}
          accessibilityLabel={
            formattedGrnDate
              ? tr('dispatch.details.grnLabelWithDate', { number: grn_no, date: formattedGrnDate })
              : tr('dispatch.details.grnLabel', { number: grn_no })
          }
          accessibilityHint={isGrnClickable ? tr('dispatch.details.opensGrn') : undefined}
        >
          <View style={styles.grnContent}>
            <Icon name="package-down" size={iconSize.md} color={t.icon.secondary} />
            <View style={styles.grnInfo}>
              <Text style={styles.grnNo}>{tr('dispatch.details.grnLabel', { number: grn_no })}</Text>
              {!!formattedGrnDate && <Text style={styles.grnDate}>{formattedGrnDate}</Text>}
            </View>
            {isGrnClickable && (
              <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
            )}
          </View>
        </Pressable>

        {/* GRN Details Tags */}
        {hasDetails && (
          <View style={styles.detailsRow}>
            {original_quantity !== undefined && (
              <View style={styles.detailChip}>
                <Icon name="package-variant-closed" size={iconSize.sm} color={t.status.neutral.text} />
                <Text style={styles.detailChipText} maxFontSizeMultiplier={1.6}>
                  {tr('dispatch.details.received', { bags: bags(original_quantity) })}
                </Text>
              </View>
            )}
            {weight !== undefined && (
              <View style={styles.detailChip}>
                <Icon name="weight-kilogram" size={iconSize.sm} color={t.status.neutral.text} />
                <Text style={styles.detailChipText} maxFontSizeMultiplier={1.6}>
                  {formatWeight(weight)}
                </Text>
              </View>
            )}
            {package_mark && (
              <View style={styles.detailChip}>
                <Icon name="label-outline" size={iconSize.sm} color={t.status.neutral.text} />
                <Text style={styles.detailChipText} maxFontSizeMultiplier={1.6}>
                  {package_mark}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

// Export memoized component for performance
export const DispatchItemCard = React.memo(DispatchItemCardComponent);
