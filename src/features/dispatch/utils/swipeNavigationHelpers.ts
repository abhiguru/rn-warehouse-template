/**
 * Dispatch Form Swipe Navigation Helpers
 * Provides validation functions for step navigation with swipe gestures
 */


import { validateStep1, validateStep2 } from '@/features/dispatch/schemas/dispatchValidation';
import type { DispatchHeaderData, DispatchItemData } from '@/types/dispatch.types';

import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';
/**
 * Validate Step 1 header data before allowing swipe to Step 2
 * @param header - Dispatch header data to validate
 * @returns true if valid, false otherwise (shows alert with error)
 */
export const canNavigateFromDispatchStep1 = async (header: DispatchHeaderData): Promise<boolean> => {
  try {
    await validateStep1(header);
    return true;
  } catch (error: any) {
    const errorMessage = serverText(error?.message, t('dispatch.validation.fillRequiredCorrectly'));
    showAlert(t('dispatch.validation.title'), errorMessage);
    return false;
  }
};

/**
 * Validate Step 2 items data before allowing swipe to Step 3
 * @param items - Array of dispatch items to validate
 * @returns true if valid, false otherwise (shows alert with error)
 */
export const canNavigateFromDispatchStep2 = async (items: DispatchItemData[]): Promise<boolean> => {
  try {
    // Check if at least one item exists
    if (!items || items.length === 0) {
      showAlert(t('dispatch.validation.title'), t('dispatch.validation.addOneItem'));
      return false;
    }

    // Validate the items array
    await validateStep2({ items });
    return true;
  } catch (error: any) {
    const errorMessage = serverText(error?.message, t('dispatch.validation.checkItems'));
    showAlert(t('dispatch.validation.title'), errorMessage);
    return false;
  }
};

/**
 * Check if there are unsaved items in Step 2
 * @param items - Current items from store
 * @param savedItems - Items that have been saved
 * @returns true if there are unsaved changes
 */
export const hasUnsavedItems = (items: DispatchItemData[], savedItems: DispatchItemData[]): boolean => {
  if (items.length !== savedItems.length) {
    return true;
  }

  return items.some((item, index) => {
    const savedItem = savedItems[index];
    if (!savedItem) return true;

    // Compare key fields
    return (
      item.grns_id !== savedItem.grns_id ||
      item.grnItems_item_id !== savedItem.grnItems_item_id ||
      item.disp_quantity !== savedItem.disp_quantity ||
      item.grnItems_id !== savedItem.grnItems_id ||
      item.unique_id !== savedItem.unique_id
    );
  });
};

/**
 * Show alert for unsaved item changes in Step 2
 * @param onSave - Callback when user chooses to save
 * @param onDiscard - Callback when user chooses to discard
 * @param onCancel - Callback when user chooses to cancel
 */
export const showUnsavedItemsAlert = (
  onSave: () => void,
  onDiscard: () => void,
  onCancel: () => void
) => {
  showAlert(
    t('dispatch.unsaved.title'),
    t('dispatch.unsaved.message'),
    [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: onCancel,
      },
      {
        text: t('common.discard'),
        style: 'destructive',
        onPress: onDiscard,
      },
      {
        text: t('common.save'),
        onPress: onSave,
      },
    ],
    { cancelable: true }
  );
};
