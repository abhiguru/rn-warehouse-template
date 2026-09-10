/**
 * Dispatch Items Summary Bottom Sheet
 *
 * Shows list of saved dispatch items in Step 2.
 * Allows viewing and deleting saved items.
 *
 * Uses the generic ItemsSummaryBottomSheet component.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import type { DispatchItemData } from '@/types/dispatch.types';
import {
  ItemsSummaryBottomSheet as GenericItemsSummaryBottomSheet,
  TotalBadge,
} from '@/components/common/ItemsSummaryBottomSheet';

interface DispatchItemsSummaryBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  items: DispatchItemData[];
  onDeleteItem: (unique_id: string) => void;
  onEditItem?: (item: DispatchItemData) => void;
  editingItemId?: string;
}

/** Dispatch item card renderer - receives colors via props */
const DispatchItemCard: React.FC<{
  item: DispatchItemData;
  index: number;
  isLast: boolean;
  isEditing: boolean;
  colors: ReturnType<typeof useListColors>;
}> = ({ item, index, isLast, isEditing, colors }) => {
  // Dynamic styles based on theme
  const cardStyles = useMemo(() => StyleSheet.create({
    itemCard: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.cellBackground,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    itemCardEditing: {
      backgroundColor: colors.orangeLight,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    itemNumberBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    itemNumberBadgeEditing: {
      backgroundColor: colors.warning,
    },
    itemNumber: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },
    itemName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    metaBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.gray100,
      borderRadius: 6,
    },
    metaText: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    detailText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  }), [colors]);

  return (
    <View
      style={[
        cardStyles.itemCard,
        isLast && styles.lastItem,
        isEditing && cardStyles.itemCardEditing,
      ]}
    >
      <View style={styles.itemHeader}>
        <View
          style={[cardStyles.itemNumberBadge, isEditing && cardStyles.itemNumberBadgeEditing]}
        >
          <Text style={cardStyles.itemNumber}>{index + 1}</Text>
        </View>
        <View style={styles.itemInfo}>
          <Text style={cardStyles.itemName} numberOfLines={1}>
            {item.grnItems_item_name}
          </Text>
          <View style={styles.itemMeta}>
            <View style={cardStyles.metaBadge}>
              <Icon name="clipboard-text" size={12} color={colors.blue} />
              <Text style={cardStyles.metaText}>{item.grns_gr_no}/{item.grnItems_quantity}</Text>
            </View>
            <View style={cardStyles.metaBadge}>
              <Icon name="package" size={12} color={colors.success} />
              <Text style={cardStyles.metaText}>{item.disp_quantity} qty</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Additional Details */}
      <View style={styles.itemDetails}>
        {item.grnItems_package_mark && (
          <View style={styles.detailRow}>
            <Icon name="label" size={14} color={colors.textSecondary} />
            <Text style={cardStyles.detailText} numberOfLines={1}>
              {item.grnItems_package_mark}
            </Text>
          </View>
        )}
        {item.grnItems_rack && (
          <View style={styles.detailRow}>
            <Icon name="warehouse" size={14} color={colors.textSecondary} />
            <Text style={cardStyles.detailText}>{item.grnItems_rack}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Icon name="scale" size={14} color={colors.textSecondary} />
          <Text style={cardStyles.detailText}>{item.grnItems_weight} kg</Text>
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
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    itemCard: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.cellBackground,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    itemCardEditing: {
      backgroundColor: colors.orangeLight,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    itemNumberBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    itemNumberBadgeEditing: {
      backgroundColor: colors.warning,
    },
    itemNumber: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },
    itemName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    metaBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.gray100,
      borderRadius: 6,
    },
    metaText: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    detailText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  }), [colors]);

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
        icon: 'package',
        iconColor: colors.blue,
        label: 'Total Qty:',
        value: totalQuantity,
      },
      {
        icon: 'weight',
        iconColor: colors.success,
        label: 'Total Weight:',
        value: `${Math.round(totalWeight)} kg`,
      },
      {
        icon: 'clipboard-text',
        iconColor: colors.purple,
        label: 'GRNs:',
        value: uniqueGRNs,
      },
    ];
  }, [colors]);

  // Render item
  const renderItem = useCallback(
    (item: DispatchItemData, index: number, isEditing: boolean) => (
      <DispatchItemCard
        item={item}
        index={index}
        isLast={index === items.length - 1}
        isEditing={isEditing}
        colors={colors}
      />
    ),
    [items.length, colors]
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
      entityName="item"
      emptyTitle="No items added yet"
      emptySubtitle="Fill the form above and tap the + button to add items"
    />
  );
};

// Static styles (layout only - colors are in DispatchItemCard cardStyles)
const styles = StyleSheet.create({
  lastItem: {
    borderBottomWidth: 0,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginLeft: 44, // Align with item name
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
