import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { useListColors } from '@/hooks/useListColors';

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
 * SavedItemCard - Compact mobile-first item card
 * Matches the UI patterns from GRNListMobile and GRNItemCard
 */
export const SavedItemCard: React.FC<SavedItemCardProps> = ({
  index,
  item,
  isLast = false,
  isEditing = false,
  isProtected = false,
  style,
}) => {
  const colors = useListColors();
  const qty = typeof item.quantity === 'string' ? parseInt(item.quantity) || 0 : item.quantity || 0;
  const weightValue = typeof item.weight === 'string' ? parseFloat(item.weight) : item.weight;
  const hasWeight = !!weightValue && weightValue > 0;
  const rack = item.rack?.trim();
  const packageMark = item.packageMark?.trim();
  const imageCount = item.images?.length || 0;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider },
        isLast && styles.cardLast,
        isEditing && [styles.cardEditing, { backgroundColor: colors.primaryLight }],
        isProtected && [styles.cardProtected, { backgroundColor: colors.warningLight }],
        style,
      ]}
    >
      {/* Row 1: Index + Name + Qty Badge */}
      <View style={styles.header}>
        <View style={[styles.indexBadge, { backgroundColor: colors.primary }, isEditing && styles.indexBadgeEditing]}>
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>

        <View style={styles.nameContainer}>
          <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.packaging && (
            <Text style={[styles.packagingText, { color: colors.textSecondary }]}>{item.packaging}</Text>
          )}
        </View>

        <View style={[styles.qtyBadge, { backgroundColor: colors.successLight }, isProtected && { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.qtyValue, { color: colors.success }]}>{qty}</Text>
          <Text style={[styles.qtyLabel, { color: colors.textSecondary }]}>qty</Text>
          {isProtected && (
            <Icon name="lock" size={10} color={colors.warning} style={{ marginLeft: 2 }} />
          )}
        </View>
      </View>

      {/* Row 2: Metrics + Details (inline) */}
      <View style={styles.detailsRow}>
        {hasWeight && (
          <View style={[styles.chip, { backgroundColor: colors.gray100 }]}>
            <Icon name="weight-kilogram" size={12} color={colors.textSecondary} />
            <Text style={[styles.chipText, { color: colors.textSecondary }]}>{weightValue} kg</Text>
          </View>
        )}
        {rack && (
          <View style={[styles.chip, { backgroundColor: colors.gray100 }]}>
            <Icon name="view-grid" size={12} color={colors.textSecondary} />
            <Text style={[styles.chipText, { color: colors.textSecondary }]}>{rack}</Text>
          </View>
        )}
        {packageMark && (
          <View style={[styles.chip, { backgroundColor: colors.gray100 }]}>
            <Icon name="label" size={12} color={colors.textSecondary} />
            <Text style={[styles.chipText, { color: colors.textSecondary }]} numberOfLines={1}>{packageMark}</Text>
          </View>
        )}
        {imageCount > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.successLight }]}>
            <Icon name="camera" size={12} color={colors.success} />
            <Text style={[styles.chipText, { color: colors.success }]}>
              {imageCount}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    // backgroundColor and borderBottomColor applied dynamically
  },
  cardLast: {
    borderBottomWidth: 0,
  },
  cardEditing: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    // backgroundColor applied dynamically
  },
  cardProtected: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.orange[400],
    // backgroundColor applied dynamically
  },

  // Header row
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor applied dynamically
  },
  indexBadgeEditing: {
    backgroundColor: theme.colors.orange[500],
  },
  indexText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  nameContainer: {
    flex: 1,
    gap: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    // color applied dynamically
  },
  packagingText: {
    fontSize: 11,
    // color applied dynamically
  },
  qtyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 3,
    // backgroundColor applied dynamically
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '700',
    // color applied dynamically
  },
  qtyLabel: {
    fontSize: 10,
    fontWeight: '500',
    // color applied dynamically
  },

  // Details row
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginLeft: 36,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
    // backgroundColor applied dynamically
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    // color applied dynamically
  },
});
