import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { parseReceiptQuantity, parseReceiptWeight } from '@/features/grn/schemas/grnValidation';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { StatusTag } from '@/components/ui';
import { formatCount, formatNumber, formatWeight } from '@/utils/formatters';
import { t as tr } from '@/i18n';

export interface SavedItemCardData {
  name: string;
  packaging?: string;
  quantity: string | number;
  weight?: string | number;
  rack?: string;
  packageMark?: string;
  images?: GRNImageData[];
}

interface SavedItemCardProps {
  index: number;
  item: SavedItemCardData;
  isLast?: boolean;
  isEditing?: boolean;
  /** Whether this item has dispatches and is protected from quantity changes */
  isProtected?: boolean;
  style?: ViewStyle;
}

/**
 * SavedItemCard - object cell for an item already added to the GRN
 * (docs/STYLE_GUIDE.md 13.6): number badge, title, packaging, quantity on the
 * right with its state tag, and neutral tags for weight, rack, mark and photos.
 */
export const SavedItemCard: React.FC<SavedItemCardProps> = ({
  index,
  item,
  isLast = false,
  isEditing = false,
  isProtected = false,
  style,
}) => {
  const styles = useThemedStyles(makeStyles);
  const qty = typeof item.quantity === 'string' ? parseReceiptQuantity(item.quantity) ?? 0 : item.quantity || 0;
  const weightValue = typeof item.weight === 'string' ? parseReceiptWeight(item.weight) : item.weight;
  const hasWeight = !!weightValue && weightValue > 0;
  const rack = item.rack?.trim();
  const packageMark = item.packageMark?.trim();
  const imageCount = item.images?.length || 0;
  const qtyText = formatNumber(qty);
  const weightText = hasWeight ? formatWeight(weightValue as number) : '';
  const photosText = formatCount(imageCount, 'photo');

  const a11yLabel = [
    tr('grn.item.a11yPosition', { position: index + 1, name: item.name }),
    item.packaging,
    tr('grn.item.a11yQuantity', { quantity: qtyText }),
    weightText,
    rack ? tr('grn.item.a11yRack', { rack }) : '',
    packageMark ? tr('grn.item.a11yMark', { mark: packageMark }) : '',
    imageCount > 0 ? photosText : '',
    isEditing ? tr('grn.item.a11yEditing') : '',
    isProtected ? tr('grn.item.a11yQuantityLocked') : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[styles.card, isLast && styles.cardLast, isEditing && styles.cardEditing, style]}
      accessible
      accessibilityLabel={a11yLabel}
    >
      {/* Row 1: Index + Name + Qty */}
      <View style={styles.header}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>{formatNumber(index + 1)}</Text>
        </View>

        <View style={styles.nameContainer}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          {!!item.packaging && <Text style={styles.packagingText}>{item.packaging}</Text>}
        </View>

        <View style={styles.qtyColumn}>
          <Text style={styles.qtyValue}>{qtyText}</Text>
          <Text style={styles.qtyLabel}>{tr('grn.item.qtyShort')}</Text>
        </View>
      </View>

      {/* State tags */}
      {(isEditing || isProtected) && (
        <View style={styles.tagRow}>
          {isEditing && <StatusTag status="informative" label={tr('grn.item.editing')} icon="pencil-outline" />}
          {isProtected && <StatusTag status="critical" label={tr('grn.item.quantityLocked')} icon="lock-outline" />}
        </View>
      )}

      {/* Row 2: details */}
      {(hasWeight || !!rack || !!packageMark || imageCount > 0) && (
        <View style={styles.detailsRow}>
          {hasWeight && <StatusTag status="neutral" label={weightText} icon="weight-kilogram" />}
          {!!rack && <StatusTag status="neutral" label={tr('grn.item.rackWithValue', { rack })} icon="view-grid-outline" />}
          {!!packageMark && <StatusTag status="neutral" label={tr('grn.item.markWithValue', { mark: packageMark })} icon="label-outline" />}
          {imageCount > 0 && <StatusTag status="neutral" label={photosText} icon="camera-outline" />}
        </View>
      )}
    </View>
  );
};

const BADGE = 28;

const makeStyles = (t: ThemeTokens) => ({
  card: {
    minHeight: layout.objectCellMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  cardLast: {
    borderBottomWidth: 0,
  },
  cardEditing: {
    backgroundColor: t.surface.selected,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  indexBadge: {
    width: BADGE,
    height: BADGE,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  indexText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
    color: t.brand.tint,
  },
  nameContainer: {
    flex: 1,
  },
  itemName: {
    ...typography.headline,
    color: t.text.primary,
  },
  packagingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  qtyColumn: {
    alignItems: 'flex-end' as const,
  },
  qtyValue: {
    ...typography.headline,
    fontVariant: ['tabular-nums' as const],
    color: t.text.primary,
  },
  qtyLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  tagRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.s6,
    marginTop: space.sm,
    marginLeft: BADGE + space.md,
  },
  detailsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.s6,
    marginTop: space.sm,
    marginLeft: BADGE + space.md,
  },
});
