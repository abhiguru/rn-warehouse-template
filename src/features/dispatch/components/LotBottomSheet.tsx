/**
 * Lot Bottom Sheet
 * Shows lots (GRN line items) for a selected item from a GRN
 * Used in dispatch form Step 2 after item is selected
 *
 * Features:
 * - Tap to select lot
 * - Swipe left to view GRN details
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, Href } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import type { GRNDetailItem } from '@/types/dispatch.types';

interface LotBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (lot: GRNDetailItem) => void;
  lots: GRNDetailItem[]; // Lots for the selected item (filtered by itemId)
  currentValue?: {
    id: string; // gr_trl_id
  };
  // GRN info for navigation to GRN details
  grnInfo?: {
    id: string;
    gr_no: string;
  };
  // Lot IDs already added to the order (to show "Already in order" indicator)
  addedLotIds?: string[];
}

export const LotBottomSheet: React.FC<LotBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  lots,
  currentValue,
  grnInfo,
  addedLotIds = [],
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const router = useRouter();

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
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
      gap: 4,
    },
    countText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    countSubtext: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    lotCard: {
      marginHorizontal: 20,
      marginVertical: 6,
      padding: 16,
      backgroundColor: colors.cellBackground,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.gray200,
    },
    lotCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primaryLight,
    },
    lotCardDisabled: {
      opacity: 0.5,
      borderColor: colors.gray300,
      borderStyle: 'dashed' as const,
    },
    alreadyAddedBadge: {
      backgroundColor: colors.warning,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      marginLeft: 8,
    },
    alreadyAddedText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.white,
    },
    lotTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    lotTitleSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    stockValueBadge: {
      backgroundColor: colors.success,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    stockValueText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },
    outOfStockBadge: {
      backgroundColor: colors.gray400,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    outOfStockText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.white,
    },
    detailLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      minWidth: 100,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    hintContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colors.blueLight,
    },
    hintText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    viewAction: {
      backgroundColor: colors.blue,
      justifyContent: 'center',
      alignItems: 'center',
      width: 90,
      marginVertical: 6,
      marginRight: 20,
      borderRadius: 12,
      gap: 4,
    },
    viewActionText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.white,
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
    allAddedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 20,
      marginVertical: 12,
      padding: 12,
      backgroundColor: colors.warningLight,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    allAddedBannerText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '500',
      color: colors.textPrimary,
    },
  }), [colors]);

  // Snap points for the bottom sheet - full screen
  const snapPoints = useMemo(() => ['100%'], []);

  // Count lots with stock available
  const availableLotsCount = useMemo(() => {
    return lots.filter((lot) => lot.stock > 0).length;
  }, [lots]);

  // Count lots that are out of stock
  const outOfStockLotsCount = useMemo(() => {
    return lots.filter((lot) => lot.stock <= 0).length;
  }, [lots]);

  // Check if all available lots (with stock) are already in the order
  const allLotsAlreadyAdded = useMemo(() => {
    const lotsWithStock = lots.filter((lot) => lot.stock > 0);
    if (lotsWithStock.length === 0) return false;
    return lotsWithStock.every((lot) => addedLotIds.includes(lot.id));
  }, [lots, addedLotIds]);

  // Handle sheet changes
  const handleSheetChanges = useCallback(
    (index: number) => {
      console.log('[LotBottomSheet] Sheet index changed to:', index);
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

  // Handle lot selection
  const handleLotSelect = useCallback(
    (lot: GRNDetailItem) => {
      console.log('[LotBottomSheet] Lot selected:', lot.id);
      onSelect(lot);
      bottomSheetRef.current?.dismiss();
    },
    [onSelect]
  );

  // Handle view GRN details (swipe action)
  const handleViewGRNDetails = useCallback(() => {
    if (!grnInfo?.id) {
      console.warn('[LotBottomSheet] No GRN info available for navigation');
      return;
    }
    console.log('[LotBottomSheet] Viewing GRN details:', grnInfo.gr_no);
    onClose();
    // Navigate to GRN details screen
    router.push(`/grn-details/${grnInfo.id}` as Href);
  }, [grnInfo, router, onClose]);

  // Render swipe actions (view GRN details)
  const renderRightActions = useCallback(() => {
    if (!grnInfo) return null;

    return (
      <TouchableOpacity
        style={dynamicStyles.viewAction}
        onPress={handleViewGRNDetails}
        activeOpacity={0.7}
      >
        <Icon name="eye" size={24} color={colors.white} />
        <Text style={dynamicStyles.viewActionText}>View GRN</Text>
      </TouchableOpacity>
    );
  }, [grnInfo, handleViewGRNDetails, dynamicStyles, colors]);

  // Render lot item
  const renderLotItem = useCallback(
    ({ item }: { item: GRNDetailItem }) => {
      const isSelected = currentValue?.id === item.id;
      // Check if lot is already added to the order
      // Note: We show "Already in order" even if it's currently selected (except in edit mode)
      // This prevents the misleading checkmark on auto-selected lots that are already added
      const isAlreadyAdded = addedLotIds.includes(item.id);
      // Check if lot is out of stock
      const isOutOfStock = item.stock <= 0;
      // Lot is disabled if already added OR out of stock
      const isDisabled = isAlreadyAdded || isOutOfStock;

      // Primary display: "GRN Qty: [Qty] - [Package Mark]" or just "GRN Qty: [Qty]" if no package mark
      const lotDisplayText = item.package_mark
        ? `GRN Qty: ${item.quantity} - ${item.package_mark}`
        : `GRN Qty: ${item.quantity}`;

      const lotContent = (
        <TouchableOpacity
          style={[
            dynamicStyles.lotCard,
            isSelected && !isDisabled && dynamicStyles.lotCardSelected,
            isDisabled && dynamicStyles.lotCardDisabled,
          ]}
          onPress={() => !isDisabled && handleLotSelect(item)}
          activeOpacity={isDisabled ? 1 : 0.7}
          disabled={isDisabled}
        >
          <View style={styles.lotContent}>
            {/* Lot Header - Primary identifier */}
            <View style={styles.lotHeader}>
              <Text style={[dynamicStyles.lotTitle, isSelected && !isDisabled && dynamicStyles.lotTitleSelected]}>
                {lotDisplayText}
              </Text>
              <View style={styles.headerBadges}>
                {isOutOfStock && (
                  <View style={dynamicStyles.outOfStockBadge}>
                    <Text style={dynamicStyles.outOfStockText}>Out of Stock</Text>
                  </View>
                )}
                {isAlreadyAdded && !isOutOfStock && (
                  <View style={dynamicStyles.alreadyAddedBadge}>
                    <Text style={dynamicStyles.alreadyAddedText}>Already in order</Text>
                  </View>
                )}
                {isSelected && !isDisabled && (
                  <Icon name="check-circle" size={24} color={colors.primary} />
                )}
              </View>
            </View>

            {/* Lot Details */}
            <View style={styles.lotDetails}>
              <View style={styles.detailRow}>
                <Icon name="package" size={16} color={colors.textSecondary} />
                <Text style={dynamicStyles.detailLabel}>In Stock:</Text>
                {isOutOfStock ? (
                  <Text style={[dynamicStyles.detailValue, { color: colors.gray400 }]}>0</Text>
                ) : (
                  <View style={dynamicStyles.stockValueBadge}>
                    <Text style={dynamicStyles.stockValueText}>{item.stock}</Text>
                  </View>
                )}
              </View>

              {item.rack && (
                <View style={styles.detailRow}>
                  <Icon name="warehouse" size={16} color={colors.textSecondary} />
                  <Text style={dynamicStyles.detailLabel}>Rack:</Text>
                  <Text style={dynamicStyles.detailValue}>{item.rack}</Text>
                </View>
              )}

              {item.weight > 0 && (
                <View style={styles.detailRow}>
                  <Icon name="weight" size={16} color={colors.textSecondary} />
                  <Text style={dynamicStyles.detailLabel}>Weight:</Text>
                  <Text style={dynamicStyles.detailValue}>{item.weight} kg</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );

      // Wrap with Swipeable if GRN info is available AND lot is not disabled
      if (grnInfo && !isDisabled) {
        return (
          <Swipeable
            renderRightActions={renderRightActions}
            overshootRight={false}
            friction={2}
            rightThreshold={40}
          >
            {lotContent}
          </Swipeable>
        );
      }

      return lotContent;
    },
    [currentValue, handleLotSelect, grnInfo, renderRightActions, dynamicStyles, colors, addedLotIds]
  );

  // Empty state - only shown when there are no lots at all for this item
  const renderEmptyState = useCallback(() => {
    return (
      <View style={dynamicStyles.emptyContainer}>
        <Icon name="package-variant-closed" size={48} color={colors.gray300} />
        <Text style={dynamicStyles.emptyText}>No lots found</Text>
        <Text style={dynamicStyles.emptySubtext}>
          This item has no lots in this GRN
        </Text>
      </View>
    );
  }, [dynamicStyles, colors]);

  // Handle visibility changes
  useEffect(() => {
    if (isVisible) {
      // Dismiss keyboard before showing bottom sheet
      Keyboard.dismiss();
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
      enableContentPanningGesture={false}
      backgroundStyle={{ backgroundColor: colors.cellBackground }}
      handleIndicatorStyle={{ backgroundColor: colors.gray300 }}
    >
      {/* Header */}
      <View style={dynamicStyles.header}>
        <Icon name="layers" size={24} color={colors.primary} />
        <Text style={dynamicStyles.headerTitle}>Select Lot</Text>
        <TouchableOpacity
          onPress={() => bottomSheetRef.current?.dismiss()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Lot count */}
      {lots.length > 0 && (
        <View style={dynamicStyles.countContainer}>
          <Text style={dynamicStyles.countText}>
            {availableLotsCount > 0
              ? `${availableLotsCount} ${availableLotsCount === 1 ? 'lot' : 'lots'} available`
              : 'No lots available'}
            {outOfStockLotsCount > 0 && ` (${outOfStockLotsCount} out of stock)`}
          </Text>
          <Text style={dynamicStyles.countSubtext}>
            {availableLotsCount > 0
              ? 'Select a lot to dispatch from'
              : 'All lots have been fully dispatched'}
          </Text>
        </View>
      )}

      {/* Hints */}
      {availableLotsCount > 0 && grnInfo && !allLotsAlreadyAdded && (
        <View style={dynamicStyles.hintContainer}>
          <Icon name="hand-pointing-up" size={16} color={colors.primary} />
          <Text style={dynamicStyles.hintText}>Tap to select • </Text>
          <Icon name="gesture-swipe-left" size={16} color={colors.textSecondary} />
          <Text style={dynamicStyles.hintText}>Swipe left for GRN details</Text>
        </View>
      )}

      {/* All lots already added banner */}
      {allLotsAlreadyAdded && (
        <View style={dynamicStyles.allAddedBanner}>
          <Icon name="alert-circle" size={20} color={colors.warning} />
          <Text style={dynamicStyles.allAddedBannerText}>
            All lots from this item have already been added to the order
          </Text>
        </View>
      )}

      {/* Lots List - using BottomSheetFlatList */}
      <BottomSheetFlatList
        data={lots}
        renderItem={renderLotItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={true}
      />
    </BottomSheetModal>
  );
};

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  lotContent: {
    gap: 12,
  },
  lotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lotDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
