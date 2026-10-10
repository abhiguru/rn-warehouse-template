/**
 * GRN Items Summary Bottom Sheet
 *
 * Displays a scrollable list of all items added to a GRN in a bottom sheet.
 * Allows users to review, edit, and remove items before final submission.
 *
 * Uses the generic ItemsSummaryBottomSheet component.
 */

import React, { useCallback } from 'react';
import {
  ItemsSummaryBottomSheet as GenericItemsSummaryBottomSheet,
  TotalBadge,
} from '@/components/common/ItemsSummaryBottomSheet';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { SavedItemCard } from '@/features/grn/components/SavedItemCard';
import { parseReceiptQuantity, parseReceiptWeight } from '@/features/grn/schemas/grnValidation';
import { useTokens } from '@/hooks/useTheme';
import { formatNumber, formatWeight } from '@/utils/formatters';
import { t as tr } from '@/i18n';


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
  const t = useTokens();

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
    // Entries that do not parse as whole numbers contribute nothing instead of
    // a truncated prefix ('12bags' is not 12).
    const totalQuantity = itemsList.reduce(
      (sum, item) => sum + (parseReceiptQuantity(item.qty) ?? 0),
      0
    );
    const totalWeight = itemsList.reduce((sum, item) => {
      const qty = parseReceiptQuantity(item.qty) ?? 0;
      const weight = parseReceiptWeight(item.weight) ?? 0;
      return sum + weight * qty;
    }, 0);

    return [
      {
        icon: 'counter',
        iconColor: t.icon.secondary,
        label: tr('grn.item.totalQuantityLabel'),
        value: formatNumber(totalQuantity),
      },
      {
        icon: 'weight',
        iconColor: t.icon.secondary,
        label: tr('grn.item.totalWeightLabel'),
        value: formatWeight(totalWeight),
      },
    ];
  }, [t]);

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
      emptyTitle={tr('grn.item.summaryEmptyTitle')}
      emptySubtitle={tr('grn.item.summaryEmptySubtitle')}
    />
  );
};

export default ItemsSummaryBottomSheet;
