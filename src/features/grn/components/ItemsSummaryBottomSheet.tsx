/**
 * GRN Items Summary Bottom Sheet
 *
 * Displays a scrollable list of all items added to a GRN in a bottom sheet.
 * Allows users to review, edit, and remove items before final submission.
 *
 * Uses the generic ItemsSummaryBottomSheet component.
 */

import React, { useCallback, useMemo } from 'react';
import {
  ItemsSummaryBottomSheet as GenericItemsSummaryBottomSheet,
  TotalBadge,
} from '@/components/common/ItemsSummaryBottomSheet';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { SavedItemCard } from '@/features/grn/components/SavedItemCard';
import { useListColors } from '@/hooks/useListColors';

/** Form data for a GRN item */
export interface ItemFormData {
  id?: string;
  grn_trl_id: string;
  item_table_id: string;
  item_name: string;
  packaging: string;
  qty: string;
  weight: string;
  rack: string;
  package_mark: string;
  trl_images: GRNImageData[];
  errors: Record<string, string>;
}

/** Props for ItemsSummaryBottomSheet */
export interface ItemsSummaryBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  items: ItemFormData[];
  onRemoveItem: (itemId: string) => void;
  onEditItem?: (item: ItemFormData) => void;
  editingItemId?: string;
  /** Item IDs that have dispatches and cannot be deleted */
  dispatchedItemIds?: Set<string>;
}

const ItemsSummaryBottomSheet: React.FC<ItemsSummaryBottomSheetProps> = ({
  isVisible,
  onClose,
  items,
  onRemoveItem,
  onEditItem,
  editingItemId,
  dispatchedItemIds,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Get unique key for item
  const getItemKey = useCallback((item: ItemFormData) => item.grn_trl_id, []);

  // Get item name for delete dialog
  const getItemName = useCallback((item: ItemFormData) => item.item_name, []);

  // Check if item is protected (has dispatches)
  const isItemProtected = useCallback(
    (item: ItemFormData) => dispatchedItemIds?.has(item.grn_trl_id) ?? false,
    [dispatchedItemIds]
  );

  // Calculate totals
  const getTotals = useCallback((itemsList: ItemFormData[]): TotalBadge[] => {
    const totalQuantity = itemsList.reduce(
      (sum, item) => sum + (parseInt(item.qty) || 0),
      0
    );
    const totalWeight = itemsList.reduce((sum, item) => {
      const qty = parseInt(item.qty) || 0;
      const weight = parseInt(item.weight) || 0;
      return sum + weight * qty;
    }, 0);

    return [
      {
        icon: 'counter',
        iconColor: colors.blue,
        label: 'Total Qty:',
        value: totalQuantity,
      },
      {
        icon: 'weight',
        iconColor: colors.success,
        label: 'Total Weight:',
        value: `${totalWeight} kg`,
      },
    ];
  }, [colors]);

  // Render item using SavedItemCard
  const renderItem = useCallback(
    (
      item: ItemFormData,
      index: number,
      isEditing: boolean,
      isProtected: boolean
    ) => (
      <SavedItemCard
        index={index}
        item={{
          name: item.item_name,
          packaging: item.packaging,
          quantity: item.qty,
          weight: item.weight,
          rack: item.rack,
          packageMark: item.package_mark,
          images: item.trl_images,
        }}
        isLast={index === items.length - 1}
        isEditing={isEditing}
        isProtected={isProtected}
      />
    ),
    [items.length]
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
      onDeleteItem={onRemoveItem}
      onEditItem={onEditItem}
      editingItemKey={editingItemId}
      isItemProtected={isItemProtected}
      entityName="item"
      emptyTitle="No items added yet"
      emptySubtitle="Fill the form above and tap the checkmark to save items"
    />
  );
};

export default ItemsSummaryBottomSheet;
