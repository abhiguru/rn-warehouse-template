/**
 * GRN Item Bottom Sheet
 * Shows unique items from a selected GRN for dispatch selection
 * Used in dispatch form Step 2 after GRN is selected
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import type { GRNDetailItem } from '@/types/dispatch.types';

interface GRNItemBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (item: { item_id: string; item_name: string }) => void;
  items: GRNDetailItem[]; // All items from the selected GRN
  currentValue?: {
    item_id: string;
    item_name: string;
  };
}

export const GRNItemBottomSheet: React.FC<GRNItemBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  items,
  currentValue,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.cellBackground,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
      gap: 12,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    countContainer: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.gray50,
    },
    countText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    itemCard: {
      marginHorizontal: 20,
      marginVertical: 6,
      padding: 16,
      backgroundColor: colors.cellBackground,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.gray200,
    },
    itemCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primaryLight,
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
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 16,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textTertiary,
      marginTop: 8,
      textAlign: 'center',
    },
  }), [colors]);

  // Snap points for the bottom sheet - full screen
  const snapPoints = useMemo(() => ['100%'], []);

  // Group items by unique item_id and calculate total stock
  const uniqueItems = useMemo(() => {
    const itemMap = new Map<string, { item_id: string; item_name: string; totalStock: number; lotCount: number }>();

    items.forEach((item) => {
      if (itemMap.has(item.item_id)) {
        const existing = itemMap.get(item.item_id)!;
        existing.totalStock += item.stock;
        existing.lotCount += 1;
      } else {
        itemMap.set(item.item_id, {
          item_id: item.item_id,
          item_name: item.item_name,
          totalStock: item.stock,
          lotCount: 1,
        });
      }
    });

    return Array.from(itemMap.values());
  }, [items]);

  // Handle sheet changes
  const handleSheetChanges = useCallback(
    (index: number) => {
      console.log('[GRNItemBottomSheet] Sheet index changed to:', index);
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  // Render backdrop
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Handle item selection
  const handleItemSelect = useCallback(
    (item: { item_id: string; item_name: string }) => {
      console.log('[GRNItemBottomSheet] Item selected:', item.item_name);
      onSelect(item);
      bottomSheetRef.current?.dismiss();
    },
    [onSelect]
  );

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: { item_id: string; item_name: string; totalStock: number; lotCount: number } }) => {
      const isSelected = currentValue?.item_id === item.item_id;

      return (
        <TouchableOpacity
          style={[dynamicStyles.itemCard, isSelected && dynamicStyles.itemCardSelected]}
          onPress={() => handleItemSelect({ item_id: item.item_id, item_name: item.item_name })}
          activeOpacity={0.7}
        >
          <View style={styles.itemContent}>
            <View style={styles.itemHeader}>
              <View style={styles.itemIcon}>
                <Icon name="package-variant" size={24} color={colors.primary} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={dynamicStyles.itemName}>{item.item_name}</Text>
                <View style={styles.itemMeta}>
                  <View style={dynamicStyles.metaBadge}>
                    <Icon name="layers" size={12} color={colors.blue} />
                    <Text style={dynamicStyles.metaText}>{item.lotCount} {item.lotCount === 1 ? 'lot' : 'lots'}</Text>
                  </View>
                  <View style={dynamicStyles.metaBadge}>
                    <Icon name="package" size={12} color={colors.success} />
                    <Text style={dynamicStyles.metaText}>{item.totalStock} available</Text>
                  </View>
                </View>
              </View>
              {isSelected && (
                <Icon name="check-circle" size={24} color={colors.primary} />
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [currentValue, handleItemSelect, dynamicStyles, colors]
  );

  // Empty state
  const renderEmptyState = useCallback(() => {
    return (
      <View style={dynamicStyles.emptyContainer}>
        <Icon name="package-variant-closed" size={48} color={colors.gray300} />
        <Text style={dynamicStyles.emptyText}>No items available</Text>
        <Text style={dynamicStyles.emptySubtext}>
          This GRN has no items with available stock
        </Text>
      </View>
    );
  }, [dynamicStyles, colors]);

  // Handle visibility changes
  useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isVisible]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.cellBackground }}
      handleIndicatorStyle={{ backgroundColor: colors.gray300 }}
    >
      <View style={dynamicStyles.container}>
        {/* Header */}
        <View style={dynamicStyles.header}>
          <Icon name="package-variant" size={24} color={colors.primary} />
          <Text style={dynamicStyles.headerTitle}>Select Item</Text>
          <TouchableOpacity
            onPress={() => bottomSheetRef.current?.dismiss()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Item count */}
        {uniqueItems.length > 0 && (
          <View style={dynamicStyles.countContainer}>
            <Text style={dynamicStyles.countText}>
              {uniqueItems.length} {uniqueItems.length === 1 ? 'item' : 'items'} available
            </Text>
          </View>
        )}

        {/* Items List */}
        <BottomSheetFlatList
          data={uniqueItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.item_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </BottomSheetModal>
  );
};

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 20,
  },
  itemContent: {
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
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
});
