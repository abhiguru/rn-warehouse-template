import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { parseReceiptQuantity, parseReceiptWeight } from '@/features/grn/schemas/grnValidation';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

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

const quantityFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const weightFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

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
  const t = useTokens();
  const qty = typeof item.quantity === 'string' ? parseReceiptQuantity(item.quantity) ?? 0 : item.quantity || 0;
  const weightValue = typeof item.weight === 'string' ? parseReceiptWeight(item.weight) : item.weight;
  const hasWeight = !!weightValue && weightValue > 0;
  const rack = item.rack?.trim();
  const packageMark = item.packageMark?.trim();
  const imageCount = item.images?.length || 0;
  const qtyText = quantityFormat.format(qty);
  const weightText = hasWeight ? `${weightFormat.format(weightValue as number)} kg` : '';
  const photosText = `${imageCount} ${imageCount === 1 ? 'photo' : 'photos'}`;

  const a11yLabel = [
    `Item ${index + 1}, ${item.name}`,
    item.packaging,
    `quantity ${qtyText}`,
    weightText,
    rack ? `rack ${rack}` : '',
    packageMark ? `mark ${packageMark}` : '',
    imageCount > 0 ? photosText : '',
    isEditing ? 'editing' : '',
    isProtected ? 'quantity locked' : '',
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
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>

        <View style={styles.nameContainer}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          {!!item.packaging && <Text style={styles.packagingText}>{item.packaging}</Text>}
        </View>

        <View style={styles.qtyColumn}>
          <Text style={styles.qtyValue}>{qtyText}</Text>
          <Text style={styles.qtyLabel}>Qty</Text>
        </View>
      </View>

      {/* State tags */}
      {(isEditing || isProtected) && (
        <View style={styles.tagRow}>
          {isEditing && (
            <View style={[styles.statusTag, styles.tagInformative]}>
              <Icon name="pencil-outline" size={iconSize.sm} color={t.status.informative.text} />
              <Text style={[styles.statusTagText, styles.tagInformativeText]} maxFontSizeMultiplier={1.6}>
                Editing
              </Text>
            </View>
          )}
          {isProtected && (
            <View style={[styles.statusTag, styles.tagCritical]}>
              <Icon name="lock-outline" size={iconSize.sm} color={t.status.critical.text} />
              <Text style={[styles.statusTagText, styles.tagCriticalText]} maxFontSizeMultiplier={1.6}>
                Quantity locked
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Row 2: details */}
      {(hasWeight || !!rack || !!packageMark || imageCount > 0) && (
        <View style={styles.detailsRow}>
          {hasWeight && (
            <View style={styles.chip}>
              <Icon name="weight-kilogram" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={[styles.chipText, styles.tabular]} maxFontSizeMultiplier={1.6}>{weightText}</Text>
            </View>
          )}
          {!!rack && (
            <View style={styles.chip}>
              <Icon name="view-grid-outline" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.chipText} maxFontSizeMultiplier={1.6}>{rack}</Text>
            </View>
          )}
          {!!packageMark && (
            <View style={styles.chip}>
              <Icon name="tag-outline" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={1.6}>{packageMark}</Text>
            </View>
          )}
          {imageCount > 0 && (
            <View style={styles.chip}>
              <Icon name="camera-outline" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.chipText} maxFontSizeMultiplier={1.6}>{photosText}</Text>
            </View>
          )}
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
  statusTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },
  statusTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
  },
  tagInformative: {
    backgroundColor: t.status.informative.background,
  },
  tagInformativeText: {
    color: t.status.informative.text,
  },
  tagCritical: {
    backgroundColor: t.status.critical.background,
  },
  tagCriticalText: {
    color: t.status.critical.text,
  },
  detailsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.s6,
    marginTop: space.sm,
    marginLeft: BADGE + space.md,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    gap: space.xs,
    backgroundColor: t.status.neutral.background,
    maxWidth: '100%' as const,
  },
  chipText: {
    ...typography.caption1,
    color: t.status.neutral.text,
    flexShrink: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums' as const],
  },
});
