/**
 * Dispatch Form Swipe Navigation Helpers
 * Provides validation functions for step navigation with swipe gestures
 */

import { Alert } from 'react-native';
import { validateStep1, validateStep2 } from '@/features/dispatch/schemas/dispatchValidation';
import type { DispatchHeaderData, DispatchItemData } from '@/types/dispatch.types';

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
    const errorMessage = error?.message || 'Please fill all required fields correctly';
    Alert.alert('Validation Error', errorMessage);
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
      Alert.alert('Validation Error', 'Please add at least one item to the dispatch');
      return false;
    }

    // Validate the items array
    await validateStep2({ items });
    return true;
  } catch (error: any) {
    const errorMessage = error?.message || 'Please check the items and try again';
    Alert.alert('Validation Error', errorMessage);
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
  Alert.alert(
    'Unsaved Changes',
    'You have unsaved item changes. What would you like to do?',
    [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: onCancel,
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: onDiscard,
      },
      {
        text: 'Save',
        onPress: onSave,
      },
    ],
    { cancelable: true }
  );
};
