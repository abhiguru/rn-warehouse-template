/**
 * GRN Item Bottom Sheet
 * Shows unique items from a selected GRN for dispatch selection
 * Used in dispatch form Step 2 after GRN is selected
 *
 * Bottom sheet per docs/STYLE_GUIDE.md §13.9.
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  BackHandler,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
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
  container: {
    flex: 1,
    backgroundColor: t.surface.sheet,
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
  },
  countText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
  },
  itemCard: {
    marginHorizontal: layout.marginCompact,
    marginVertical: space.xs,
    padding: space.lg,
    minHeight: layout.objectCellMinHeight,
    justifyContent: 'center' as const,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
  },
  itemCardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  itemCardSelected: {
    borderColor: t.brand.tint,
    borderWidth: 2,
    backgroundColor: t.surface.selected,
  },
  itemHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  itemIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  itemInfo: {
    flex: 1,
    gap: space.xs,
  },
  itemName: {
    ...typography.headline,
    color: t.text.primary,
  },
  itemMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
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
});

type UniqueItem = { item_id: string; item_name: string; totalStock: number; lotCount: number };

export const GRNItemBottomSheet: React.FC<GRNItemBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  items,
  currentValue,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Snap points for the bottom sheet - full screen
  const snapPoints = useMemo(() => ['100%'], []);

  // Group items by unique item_id and calculate total stock
  const uniqueItems = useMemo(() => {
    const itemMap = new Map<string, UniqueItem>();

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

  // Handle item selection
  const handleItemSelect = useCallback(
    (item: { item_id: string; item_name: string }) => {
      onSelect(item);
      bottomSheetRef.current?.dismiss();
    },
    [onSelect]
  );

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: UniqueItem }) => {
      const isSelected = currentValue?.item_id === item.item_id;
      const lots = `${item.lotCount} ${item.lotCount === 1 ? 'lot' : 'lots'}`;
      const available = `${item.totalStock} ${item.totalStock === 1 ? 'bag' : 'bags'} available`;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.itemCard,
            pressed && styles.itemCardPressed,
            isSelected && styles.itemCardSelected,
          ]}
          onPress={() => handleItemSelect({ item_id: item.item_id, item_name: item.item_name })}
          accessibilityRole="button"
          accessibilityLabel={`${item.item_name}, ${lots}, ${available}`}
          accessibilityState={{ selected: isSelected }}
        >
          <View style={styles.itemHeader}>
            <View style={styles.itemIcon}>
              <Icon name="cube-outline" size={iconSize.lg} color={t.brand.tint} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
              <View style={styles.itemMeta}>
                <View style={styles.metaBadge}>
                  <Icon name="layers-outline" size={iconSize.sm} color={t.status.neutral.text} />
                  <Text style={styles.metaText} maxFontSizeMultiplier={1.6}>{lots}</Text>
                </View>
                <View style={styles.metaBadge}>
                  <Icon name="warehouse" size={iconSize.sm} color={t.status.neutral.text} />
                  <Text style={styles.metaText} maxFontSizeMultiplier={1.6}>{available}</Text>
                </View>
              </View>
            </View>
            {isSelected && (
              <Icon name="check-circle" size={iconSize.lg} color={t.brand.tint} />
            )}
          </View>
        </Pressable>
      );
    },
    [currentValue, handleItemSelect, styles, t]
  );

  // Empty state
  const renderEmptyState = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="package-variant-closed" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyText}>No items in stock</Text>
        <Text style={styles.emptySubtext}>
          This GRN has no items with stock left to dispatch. Choose another GRN.
        </Text>
      </View>
    );
  }, [styles, t]);

  // Handle visibility changes
  useEffect(() => {
    if (isVisible) {
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
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">Choose item</Text>
          <Pressable
            onPress={() => bottomSheetRef.current?.dismiss()}
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Close item list"
          >
            <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
        </View>

        {/* Item count */}
        {uniqueItems.length > 0 && (
          <View style={styles.countContainer}>
            <Text style={styles.countText} accessibilityRole="header">
              {uniqueItems.length} {uniqueItems.length === 1 ? 'item' : 'items'} in stock
            </Text>
          </View>
        )}

        {/* Items List */}
        <BottomSheetFlatList
          data={uniqueItems}
          renderItem={renderItem}
          keyExtractor={(item: UniqueItem) => item.item_id}
          contentContainerStyle={{ paddingBottom: space.xl + insets.bottom }}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </BottomSheetModal>
  );
};
