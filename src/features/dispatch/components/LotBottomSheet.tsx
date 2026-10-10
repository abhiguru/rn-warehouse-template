/**
 * Lot Bottom Sheet
 * Shows lots (GRN line items) for a selected item from a GRN
 * Used in dispatch form Step 2 after item is selected
 *
 * Bottom sheet per docs/STYLE_GUIDE.md §13.9; lot availability is shown as a
 * status tag with an icon and a word (§3.5).
 *
 * Features:
 * - Tap to select lot
 * - Swipe left to view GRN details
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Keyboard,
  BackHandler,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import type { GRNDetailItem } from '@/types/dispatch.types';
import { formatCount, formatWeight } from '@/utils/formatters';
import { t as tr } from '@/i18n';
import { StatusTag } from '@/components/ui/StatusTag';

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

const makeStyles = (t: ThemeTokens) => ({
  sheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...t.shadow[4],
  },
  handleIndicator: {
    backgroundColor: t.border.separator,
    width: 36,
    height: 4,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    minHeight: touchTarget + space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    gap: space.sm,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  countContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    gap: space.xs,
  },
  countText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  countSubtext: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  lotCard: {
    marginHorizontal: layout.marginCompact,
    marginVertical: space.xs,
    padding: space.lg,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
  },
  lotCardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  lotCardSelected: {
    borderColor: t.brand.tint,
    borderWidth: 2,
    backgroundColor: t.surface.selected,
  },
  lotCardDisabled: {
    opacity: t.interaction.disabledOpacity,
    borderStyle: 'dashed' as const,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  lotContent: {
    gap: space.md,
  },
  lotHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  headerBadges: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  lotTitle: {
    ...typography.headline,
    color: t.text.primary,
    flex: 1,
  },
  lotDetails: {
    gap: space.sm,
  },
  detailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  detailLabel: {
    ...typography.subhead,
    color: t.text.secondary,
    minWidth: 100,
  },
  detailValue: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    flex: 1,
    fontVariant: ['tabular-nums' as const],
  },
  hintContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.s6,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.informative.border,
    backgroundColor: t.status.informative.background,
  },
  hintText: {
    ...typography.footnote,
    color: t.status.informative.text,
  },
  viewAction: {
    backgroundColor: t.brand.fill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 90,
    marginVertical: space.xs,
    marginRight: layout.marginCompact,
    borderRadius: radius.card,
    gap: space.xs,
  },
  viewActionPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  viewActionText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.max,
    paddingHorizontal: space.huge,
  },
  emptyText: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    textAlign: 'center' as const,
  },
  emptySubtext: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.sm,
    textAlign: 'center' as const,
  },
  allAddedBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.md,
    padding: space.md,
    backgroundColor: t.status.critical.background,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.critical.border,
  },
  allAddedBannerText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.critical.text,
  },
});

/** "3 lots in stock (2 out of stock)" and its shorter forms, as one sentence per case. */
const lotCountText = (inStock: number, outOfStock: number): string => {
  if (inStock > 0) {
    const lots = tr('dispatch.count.lots', { count: inStock });
    return outOfStock > 0
      ? tr('dispatch.lotSheet.countInStockWithOut', { lots, out: outOfStock })
      : tr('dispatch.lotSheet.countInStock', { lots });
  }
  return outOfStock > 0
    ? tr('dispatch.lotSheet.noneInStockWithOut', { out: outOfStock })
    : tr('dispatch.lotSheet.noneInStock');
};

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
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

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
        opacity={1}
        style={[props.style, { backgroundColor: t.overlay.scrim }]}
      />
    ),
    [t]
  );

  // Handle lot selection
  const handleLotSelect = useCallback(
    (lot: GRNDetailItem) => {
      onSelect(lot);
      bottomSheetRef.current?.dismiss();
    },
    [onSelect]
  );

  // Handle view GRN details (swipe action)
  const handleViewGRNDetails = useCallback(() => {
    if (!grnInfo?.id) {
      return;
    }
    onClose();
    // Navigate to GRN details screen
    router.push(`/grn-details/${grnInfo.id}` as Href);
  }, [grnInfo, router, onClose]);

  // Render swipe actions (view GRN details)
  const renderRightActions = useCallback(() => {
    if (!grnInfo) return null;

    return (
      <Pressable
        style={({ pressed }) => [styles.viewAction, pressed && styles.viewActionPressed]}
        onPress={handleViewGRNDetails}
        accessibilityRole="button"
        accessibilityLabel={tr('dispatch.grnSheet.viewGrnNumbered', { number: grnInfo.gr_no })}
      >
        <Icon name="eye-outline" size={iconSize.lg} color={t.brand.onFill} />
        <Text style={styles.viewActionText}>{tr('dispatch.grnSheet.viewGrn')}</Text>
      </Pressable>
    );
  }, [grnInfo, handleViewGRNDetails, styles, t]);

  const renderStatusTag = useCallback(
    (kind: 'negative' | 'informative', icon: string, label: string) => (
      <StatusTag status={kind} icon={icon} label={label} />
    ),
    []
  );

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

      // Primary display: "GRN qty [Qty] · [Package Mark]" or just "GRN qty [Qty]"
      const lotDisplayText = item.package_mark
        ? tr('dispatch.lotSheet.lotTitleWithMark', { quantity: item.quantity, mark: item.package_mark })
        : tr('dispatch.lotSheet.lotTitle', { quantity: item.quantity });
      const stateLabel = isOutOfStock
        ? tr('dispatch.lotSheet.stateOutOfStock')
        : isAlreadyAdded
          ? tr('dispatch.lotSheet.stateAlreadyAdded')
          : tr('dispatch.lotSheet.stateInStock', { count: item.stock });

      const canViewGRN = !!grnInfo && !isDisabled;

      const lotContent = (
        <Pressable
          style={({ pressed }) => [
            styles.lotCard,
            pressed && !isDisabled && styles.lotCardPressed,
            isSelected && !isDisabled && styles.lotCardSelected,
            isDisabled && styles.lotCardDisabled,
          ]}
          onPress={() => !isDisabled && handleLotSelect(item)}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            item.rack
              ? tr('dispatch.lotSheet.rowLabelWithRack', { lot: lotDisplayText, rack: item.rack, state: stateLabel })
              : tr('dispatch.lotSheet.rowLabel', { lot: lotDisplayText, state: stateLabel })
          }
          accessibilityState={{ selected: isSelected && !isDisabled, disabled: isDisabled }}
          accessibilityActions={canViewGRN ? [{ name: 'viewGRN', label: tr('dispatch.grnSheet.viewGrn') }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'viewGRN') handleViewGRNDetails();
          }}
        >
          <View style={styles.lotContent}>
            {/* Lot Header - Primary identifier */}
            <View style={styles.lotHeader}>
              <Text style={styles.lotTitle}>{lotDisplayText}</Text>
              <View style={styles.headerBadges}>
                {isOutOfStock && renderStatusTag('negative', 'alert-circle', tr('common.outOfStock'))}
                {isAlreadyAdded && !isOutOfStock &&
                  renderStatusTag('informative', 'information', tr('dispatch.lotSheet.alreadyAdded'))}
                {isSelected && !isDisabled && (
                  <Icon name="check-circle" size={iconSize.lg} color={t.brand.tint} />
                )}
              </View>
            </View>

            {/* Lot Details */}
            <View style={styles.lotDetails}>
              <View style={styles.detailRow}>
                <Icon name="warehouse" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.detailLabel}>{tr('common.inStock')}</Text>
                <Text style={styles.detailValue}>
                  {formatCount(isOutOfStock ? 0 : item.stock, 'bag')}
                </Text>
              </View>

              {item.rack && (
                <View style={styles.detailRow}>
                  <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.detailLabel}>{tr('common.rack')}</Text>
                  <Text style={styles.detailValue}>{item.rack}</Text>
                </View>
              )}

              {item.weight > 0 && (
                <View style={styles.detailRow}>
                  <Icon name="weight" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.detailLabel}>{tr('common.weight')}</Text>
                  <Text style={styles.detailValue}>{formatWeight(item.weight)}</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      );

      // Wrap with Swipeable if GRN info is available AND lot is not disabled
      if (canViewGRN) {
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
    [currentValue, handleLotSelect, handleViewGRNDetails, grnInfo, renderRightActions, renderStatusTag, styles, t, addedLotIds]
  );

  // Empty state - only shown when there are no lots at all for this item
  const renderEmptyState = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="package-variant-closed" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyText}>{tr('dispatch.lotSheet.emptyTitle')}</Text>
        <Text style={styles.emptySubtext}>
          {tr('dispatch.lotSheet.emptyMessage')}
        </Text>
      </View>
    );
  }, [styles, t]);

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

  // Android back closes the sheet first
  useEffect(() => {
    if (!isVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      bottomSheetRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
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
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">{tr('dispatch.items.chooseLot')}</Text>
        <Pressable
          onPress={() => bottomSheetRef.current?.dismiss()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('dispatch.lotSheet.close')}
        >
          <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
        </Pressable>
      </View>

      {/* Lot count */}
      {lots.length > 0 && (
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {lotCountText(availableLotsCount, outOfStockLotsCount)}
          </Text>
          <Text style={styles.countSubtext}>
            {availableLotsCount > 0
              ? tr('dispatch.lotSheet.chooseHint')
              : tr('dispatch.lotSheet.allDispatched')}
          </Text>
        </View>
      )}

      {/* Hints */}
      {availableLotsCount > 0 && grnInfo && !allLotsAlreadyAdded && (
        <View style={styles.hintContainer}>
          <Icon name="information" size={iconSize.sm} color={t.status.informative.text} />
          <Text style={styles.hintText}>{tr('dispatch.lotSheet.hint')}</Text>
        </View>
      )}

      {/* All lots already added banner */}
      {allLotsAlreadyAdded && (
        <View style={styles.allAddedBanner} accessibilityRole="alert">
          <Icon name="alert" size={iconSize.md} color={t.status.critical.text} />
          <Text style={styles.allAddedBannerText}>
            {tr('dispatch.lotSheet.allAdded')}
          </Text>
        </View>
      )}

      {/* Lots List - using BottomSheetFlatList */}
      <BottomSheetFlatList
        data={lots}
        renderItem={renderLotItem}
        keyExtractor={(item: GRNDetailItem) => item.id}
        contentContainerStyle={{ paddingBottom: space.xl + insets.bottom }}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={true}
      />
    </BottomSheetModal>
  );
};
