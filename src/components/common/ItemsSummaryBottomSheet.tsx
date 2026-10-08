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

import React, { useCallback, useMemo, ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';

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
  /** Title for the header (default: "Saved Items") */
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
    title = 'Saved Items',
    entityName = 'item',
    emptyTitle = 'No items added yet',
    emptySubtitle = 'Fill the form above and tap to save items',
    headerIcon = 'package-variant',
  } = props;

  const insets = useSafeAreaInsets();

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    sheetContainer: {
      backgroundColor: colors.cellBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
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
    totalsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.gray50,
      gap: 8,
    },
    totalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.cellBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.cellDivider,
    },
    totalLabel: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    totalValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
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
    hintSeparator: {
      fontSize: 12,
      color: colors.textTertiary,
      marginHorizontal: 4,
    },
    deleteAction: {
      backgroundColor: colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      height: '100%',
      gap: 4,
    },
    deleteActionDisabled: {
      backgroundColor: colors.gray400,
    },
    deleteText: {
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
  }), [colors]);

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
          `Cannot Delete ${entityName.charAt(0).toUpperCase() + entityName.slice(1)}`,
          `"${itemName}" has been partially dispatched and cannot be removed.`,
          [{ text: 'OK', style: 'default' }]
        );
        return;
      }

      Alert.alert(
        `Delete ${entityName.charAt(0).toUpperCase() + entityName.slice(1)}`,
        `Remove "${itemName}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
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
        <TouchableOpacity
          style={[dynamicStyles.deleteAction, isProtected && dynamicStyles.deleteActionDisabled]}
          onPress={() => handleDeleteItem(item)}
          activeOpacity={isProtected ? 1 : 0.7}
        >
          <Icon
            name={isProtected ? 'lock' : 'delete'}
            size={24}
            color={colors.white}
          />
          <Text style={dynamicStyles.deleteText}>
            {isProtected ? 'Protected' : 'Delete'}
          </Text>
        </TouchableOpacity>
      );
    },
    [handleDeleteItem, checkItemProtected, dynamicStyles, colors]
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
        <Icon name="package-variant-closed" size={48} color={colors.gray300} />
        <Text style={dynamicStyles.emptyText}>{emptyTitle}</Text>
        <Text style={dynamicStyles.emptySubtext}>{emptySubtitle}</Text>
      </View>
    );
  }, [emptyTitle, emptySubtitle, dynamicStyles, colors]);

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      {/* GestureHandlerRootView is required for Swipeable to work inside Modal */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
          {/* Backdrop - tap to close */}
          <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Bottom Sheet Content */}
        <View style={[dynamicStyles.sheetContainer, { paddingBottom: insets.bottom }]}>
          {/* Header */}
          <View style={dynamicStyles.header}>
            <Icon name={headerIcon} size={24} color={colors.primary} />
            <Text style={dynamicStyles.headerTitle}>
              {title} ({items.length})
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Totals Summary */}
          {items.length > 0 && totals.length > 0 && (
            <View style={dynamicStyles.totalsContainer}>
              {totals.map((total, index) => (
                <View key={index} style={dynamicStyles.totalBadge}>
                  <Icon name={total.icon} size={16} color={total.iconColor} />
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
                  <Icon name="hand-pointing-up" size={16} color={colors.primary} />
                  <Text style={dynamicStyles.hintText}>Tap to edit</Text>
                  <Text style={dynamicStyles.hintSeparator}>•</Text>
                </>
              )}
              <Icon name="gesture-swipe-left" size={16} color={colors.textSecondary} />
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
                    <TouchableOpacity
                      onPress={() => handleItemTap(item)}
                      activeOpacity={0.7}
                      disabled={!onEditItem}
                    >
                      {renderItem(item, index, isEditing, isProtected)}
                    </TouchableOpacity>
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

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
});

// Export as a generic component
export const ItemsSummaryBottomSheet = ItemsSummaryBottomSheetInner;

export default ItemsSummaryBottomSheet;
