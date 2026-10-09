/**
 * Generic Items Summary Bottom Sheet
 *
 * A reusable bottom sheet for displaying saved items with:
 * - Item count in header
 * - Totals summary section
 * - Swipe-to-delete functionality
 * - Tap-to-edit functionality
 * - Empty state
 *
 * Used by GRN and Dispatch item summary sheets.
 */

import React, { useCallback, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

/** Total badge configuration */
export interface TotalBadge {
  icon: string;
  iconColor: string;
  label: string;
  value: string | number;
}

/** Props for ItemsSummaryBottomSheet */
export interface ItemsSummaryBottomSheetProps<T> {
  /** Whether the bottom sheet is visible */
  isVisible: boolean;
  /** Called when the bottom sheet closes */
  onClose: () => void;
  /** Array of items to display */
  items: T[];
  /** Get unique key for an item */
  getItemKey: (item: T) => string;
  /** Get display name for an item (used in delete confirmation) */
  getItemName: (item: T) => string;
  /** Render the item content */
  renderItem: (
    item: T,
    index: number,
    isEditing: boolean,
    isProtected: boolean
  ) => ReactNode;
  /** Calculate totals to display */
  getTotals: (items: T[]) => TotalBadge[];
  /** Called when an item is deleted */
  onDeleteItem: (itemKey: string) => void;
  /** Called when an item is tapped for editing */
  onEditItem?: (item: T) => void;
  /** Currently editing item key */
  editingItemKey?: string;
  /** Check if an item is protected from deletion */
  isItemProtected?: (item: T) => boolean;
  /** Title for the header (default: "Saved items") */
  title?: string;
  /** Entity name for dialogs (default: "item") */
  entityName?: string;
  /** Empty state title */
  emptyTitle?: string;
  /** Empty state subtitle */
  emptySubtitle?: string;
  /** Header icon name */
  headerIcon?: string;
}

function ItemsSummaryBottomSheetInner<T>(
  props: ItemsSummaryBottomSheetProps<T>
): React.ReactElement {
  const {
    isVisible,
    onClose,
    items,
    getItemKey,
    getItemName,
    renderItem,
    getTotals,
    onDeleteItem,
    onEditItem,
    editingItemKey,
    isItemProtected,
    title = 'Saved items',
    entityName = 'item',
    emptyTitle = 'No items yet',
    emptySubtitle = 'Items you save with the form above appear here.',
    headerIcon = 'package-variant',
  } = props;

  const insets = useSafeAreaInsets();

  const t = useTokens();
  const dynamicStyles = useThemedStyles(makeStyles);

  // Check if an item is protected
  const checkItemProtected = useCallback(
    (item: T) => isItemProtected?.(item) ?? false,
    [isItemProtected]
  );

  // Handle delete item with confirmation
  const handleDeleteItem = useCallback(
    (item: T) => {
      const itemKey = getItemKey(item);
      const itemName = getItemName(item);

      // Check if item is protected
      if (checkItemProtected(item)) {
        Alert.alert(
          `Can't delete this ${entityName}`,
          `"${itemName}" is partly dispatched, so it can't be removed.`,
          [{ text: 'OK', style: 'default' }]
        );
        return;
      }

      Alert.alert(
        `Delete ${entityName}?`,
        `"${itemName}" will be removed from this list.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Delete ${entityName}`,
            style: 'destructive',
            onPress: () => {
              if (__DEV__) console.log('[ItemsSummaryBottomSheet] Deleting:', itemKey);
              onDeleteItem(itemKey);
            },
          },
        ]
      );
    },
    [getItemKey, getItemName, checkItemProtected, entityName, onDeleteItem]
  );

  // Render swipe delete action
  const renderRightActions = useCallback(
    (item: T) => {
      const isProtected = checkItemProtected(item);

      return (
        <Pressable
          style={({ pressed }) => [
            dynamicStyles.deleteAction,
            isProtected && dynamicStyles.deleteActionDisabled,
            pressed && !isProtected && dynamicStyles.deleteActionPressed,
          ]}
          onPress={() => handleDeleteItem(item)}
          accessibilityRole="button"
          accessibilityLabel={isProtected ? `${getItemName(item)} is protected` : `Delete ${getItemName(item)}`}
        >
          <Icon
            name={isProtected ? 'lock-outline' : 'trash-can-outline'}
            size={iconSize.lg}
            color={isProtected ? t.icon.secondary : t.destructive.onFill}
          />
          <Text style={[dynamicStyles.deleteText, isProtected && dynamicStyles.deleteTextDisabled]}>
            {isProtected ? 'Protected' : 'Delete'}
          </Text>
        </Pressable>
      );
    },
    [handleDeleteItem, checkItemProtected, getItemName, dynamicStyles, t]
  );

  // Handle item tap for editing
  const handleItemTap = useCallback(
    (item: T) => {
      if (onEditItem) {
        onEditItem(item);
        onClose();
      }
    },
    [onEditItem, onClose]
  );

  // Get totals
  const totals = getTotals(items);

  // Empty state
  const renderEmptyState = useCallback(() => {
    return (
      <View style={dynamicStyles.emptyContainer}>
        <Icon name="package-variant-closed" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={dynamicStyles.emptyText}>{emptyTitle}</Text>
        <Text style={dynamicStyles.emptySubtext}>{emptySubtitle}</Text>
      </View>
    );
  }, [emptyTitle, emptySubtitle, dynamicStyles, t]);

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
      accessibilityViewIsModal
    >
      {/* GestureHandlerRootView is required for Swipeable to work inside Modal */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
          {/* Backdrop - tap to close */}
          <Pressable
            style={dynamicStyles.backdrop}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={`Close ${title.toLowerCase()}`}
          />

        {/* Bottom Sheet Content */}
        <View style={[dynamicStyles.sheetContainer, { paddingBottom: insets.bottom }]}>
          <View style={dynamicStyles.handle} importantForAccessibility="no" />
          {/* Header */}
          <View style={dynamicStyles.header}>
            <Icon name={headerIcon} size={iconSize.lg} color={t.brand.tint} />
            <Text style={dynamicStyles.headerTitle} accessibilityRole="header">
              {title} ({items.length})
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
            </Pressable>
          </View>

          {/* Totals Summary */}
          {items.length > 0 && totals.length > 0 && (
            <View style={dynamicStyles.totalsContainer}>
              {totals.map((total, index) => (
                <View key={index} style={dynamicStyles.totalBadge}>
                  <Icon name={total.icon} size={iconSize.sm} color={total.iconColor} />
                  <Text style={dynamicStyles.totalLabel}>{total.label}</Text>
                  <Text style={dynamicStyles.totalValue}>{total.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Hints */}
          {items.length > 0 && (
            <View style={dynamicStyles.hintContainer}>
              {onEditItem && (
                <>
                  <Icon name="gesture-tap" size={iconSize.sm} color={t.status.informative.text} />
                  <Text style={dynamicStyles.hintText}>Tap to edit</Text>
                  <Text style={dynamicStyles.hintSeparator}>•</Text>
                </>
              )}
              <Icon name="gesture-swipe-left" size={iconSize.sm} color={t.status.informative.text} />
              <Text style={dynamicStyles.hintText}>Swipe left to delete</Text>
            </View>
          )}

          {/* Items List */}
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
            style={styles.scrollView}
          >
            {items.length === 0 ? (
              renderEmptyState()
            ) : (
              items.map((item, index) => {
                const itemKey = getItemKey(item);
                const isEditing = editingItemKey === itemKey;
                const isProtected = checkItemProtected(item);

                return (
                  <Swipeable
                    key={itemKey}
                    renderRightActions={() => renderRightActions(item)}
                    overshootRight={false}
                    friction={2}
                    rightThreshold={40}
                  >
                    <Pressable
                      onPress={() => handleItemTap(item)}
                      disabled={!onEditItem}
                      style={({ pressed }) => [dynamicStyles.itemRow, pressed && dynamicStyles.itemRowPressed]}
                      accessibilityRole={onEditItem ? 'button' : undefined}
                      accessibilityHint={onEditItem ? `Opens this ${entityName} for editing` : undefined}
                    >
                      {renderItem(item, index, isEditing, isProtected)}
                    </Pressable>
                  </Swipeable>
                );
              })
            )}
          </ScrollView>
        </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.overlay.scrim,
  },
  sheetContainer: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    flex: 1,
    ...t.shadow[4],
  },
  handle: {
    alignSelf: 'center' as const,
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.border.separator,
    marginTop: space.sm,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: space.xl,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    gap: space.md,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  totalsContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    backgroundColor: t.background.base,
    gap: space.sm,
  },
  totalBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    backgroundColor: t.surface.card,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.divider,
  },
  totalLabel: {
    ...typography.caption1,
    fontWeight: fontWeight.medium,
    color: t.text.secondary,
  },
  totalValue: {
    ...typography.caption1,
    fontWeight: fontWeight.bold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  hintContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    backgroundColor: t.status.informative.background,
  },
  hintText: {
    ...typography.caption1,
    color: t.status.informative.text,
  },
  hintSeparator: {
    ...typography.caption1,
    color: t.status.informative.text,
    marginHorizontal: space.xs,
  },
  itemRow: {
    backgroundColor: t.surface.sheet,
  },
  itemRowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  deleteAction: {
    backgroundColor: t.destructive.fill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 80,
    height: '100%' as const,
    gap: space.xs,
  },
  deleteActionPressed: {
    backgroundColor: t.destructive.fillPressed,
  },
  deleteActionDisabled: {
    backgroundColor: t.surface.fieldReadOnly,
  },
  deleteText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.destructive.onFill,
  },
  deleteTextDisabled: {
    color: t.text.secondary,
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

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: space.xl,
  },
});

// Export as a generic component
export const ItemsSummaryBottomSheet = ItemsSummaryBottomSheetInner;

export default ItemsSummaryBottomSheet;
