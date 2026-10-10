/**
 * Dispatch Items Summary Bottom Sheet
 *
 * Shows list of saved dispatch items in Step 2.
 * Allows viewing and deleting saved items.
 *
 * Uses the generic ItemsSummaryBottomSheet component.
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import type { DispatchItemData } from '@/types/dispatch.types';
import {
  ItemsSummaryBottomSheet as GenericItemsSummaryBottomSheet,
  TotalBadge,
} from '@/components/common/ItemsSummaryBottomSheet';
import { formatCount, formatNumber, formatWeight } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';

interface DispatchItemsSummaryBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  items: DispatchItemData[];
  onDeleteItem: (unique_id: string) => void;
  onEditItem?: (item: DispatchItemData) => void;
  editingItemId?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  itemCard: {
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    backgroundColor: t.surface.sheet,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  itemCardEditing: {
    backgroundColor: t.brand.subtle,
    borderLeftWidth: 4,
    borderLeftColor: t.brand.tint,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  itemHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    marginBottom: space.sm,
  },
  itemNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: t.status.neutral.background,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  itemNumberBadgeEditing: {
    backgroundColor: t.brand.fill,
  },
  itemNumber: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
    fontVariant: ['tabular-nums' as const],
  },
  itemNumberEditing: {
    color: t.brand.onFill,
  },
  itemInfo: {
    flex: 1,
    gap: space.xs,
  },
  itemNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  itemName: {
    ...typography.headline,
    color: t.text.primary,
    flexShrink: 1,
  },
  editingText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  itemMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  metaBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    backgroundColor: t.status.neutral.background,
    borderRadius: radius.field,
  },
  metaText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
    fontVariant: ['tabular-nums' as const],
  },
  itemDetails: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.md,
    marginLeft: 44, // Align with item name
  },
  detailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  detailText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
});

/** Dispatch item card renderer */
const DispatchItemCard: React.FC<{
  item: DispatchItemData;
  index: number;
  isLast: boolean;
  isEditing: boolean;
}> = ({ item, index, isLast, isEditing }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const bags = formatCount(item.disp_quantity, 'bag');

  return (
    <View
      style={[styles.itemCard, isLast && styles.lastItem, isEditing && styles.itemCardEditing]}
      accessible
      accessibilityLabel={tr(isEditing ? 'dispatch.summarySheet.rowLabelEditing' : 'dispatch.summarySheet.rowLabel', {
        index: index + 1,
        item: item.grnItems_item_name,
        grn: formatIdentifier(item.grns_gr_no),
        bags,
      })}
    >
      <View style={styles.itemHeader}>
        <View style={[styles.itemNumberBadge, isEditing && styles.itemNumberBadgeEditing]}>
          <Text style={[styles.itemNumber, isEditing && styles.itemNumberEditing]}>
            {formatNumber(index + 1)}
          </Text>
        </View>
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.grnItems_item_name}
            </Text>
            {isEditing && <Text style={styles.editingText}>{tr('dispatch.summarySheet.editing')}</Text>}
          </View>
          <View style={styles.itemMeta}>
            <View style={styles.metaBadge}>
              <Icon name="package-down" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.metaText} maxFontSizeMultiplier={1.6}>
                {item.grns_gr_no}/{formatNumber(item.grnItems_quantity)}
              </Text>
            </View>
            <View style={styles.metaBadge}>
              <Icon name="cube-outline" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.metaText} maxFontSizeMultiplier={1.6}>
                {bags}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Additional Details */}
      <View style={styles.itemDetails}>
        {item.grnItems_package_mark && (
          <View style={styles.detailRow}>
            <Icon name="label-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.grnItems_package_mark}
            </Text>
          </View>
        )}
        {item.grnItems_rack && (
          <View style={styles.detailRow}>
            <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.detailText}>{item.grnItems_rack}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Icon name="scale" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.detailText}>{formatWeight(item.grnItems_weight)}</Text>
        </View>
      </View>
    </View>
  );
};

export const ItemsSummaryBottomSheet: React.FC<DispatchItemsSummaryBottomSheetProps> = ({
  isVisible,
  onClose,
  items,
  onDeleteItem,
  onEditItem,
  editingItemId,
}) => {
  const t = useTokens();

  // Get unique key for item
  const getItemKey = useCallback((item: DispatchItemData) => item.unique_id, []);

  // Get item name for delete dialog
  const getItemName = useCallback(
    (item: DispatchItemData) => item.grnItems_item_name,
    []
  );

  // Calculate totals
  const getTotals = useCallback((itemsList: DispatchItemData[]): TotalBadge[] => {
    const totalQuantity = itemsList.reduce((sum, item) => sum + item.disp_quantity, 0);
    const totalWeight = itemsList.reduce(
      (sum, item) => sum + item.grnItems_weight * item.disp_quantity,
      0
    );
    const uniqueGRNs = new Set(itemsList.map((item) => item.grns_gr_no)).size;

    return [
      {
        icon: 'cube-outline',
        iconColor: t.icon.secondary,
        label: tr('common.bags'),
        value: formatNumber(totalQuantity),
      },
      {
        icon: 'weight',
        iconColor: t.icon.secondary,
        label: tr('common.weight'),
        value: formatWeight(totalWeight, 0),
      },
      {
        icon: 'package-down',
        iconColor: t.icon.secondary,
        label: tr('dispatch.summarySheet.grns'),
        value: formatNumber(uniqueGRNs),
      },
    ];
  }, [t]);

  // Render item
  const renderItem = useCallback(
    (item: DispatchItemData, index: number, isEditing: boolean) => (
      <DispatchItemCard
        item={item}
        index={index}
        isLast={index === items.length - 1}
        isEditing={isEditing}
      />
    ),
    [items.length]
  );

  return (
    <GenericItemsSummaryBottomSheet
      isVisible={isVisible}
      onClose={onClose}
      items={items}
      getItemKey={getItemKey}
      getItemName={getItemName}
      renderItem={renderItem}
      getTotals={getTotals}
      onDeleteItem={onDeleteItem}
      onEditItem={onEditItem}
      editingItemKey={editingItemId}
      entity="item"
      emptyTitle={tr('dispatch.summarySheet.emptyTitle')}
      emptySubtitle={tr('dispatch.summarySheet.emptySubtitle')}
    />
  );
};
