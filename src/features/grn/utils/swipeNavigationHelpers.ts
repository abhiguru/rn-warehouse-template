
import { validateStep1 } from '../schemas/grnValidation';

import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
/**
 * Check if navigation from Step 1 is allowed
 * Validates all Step 1 fields
 */
export const canNavigateFromStep1 = async (header: any): Promise<boolean> => {
  const validation = await validateStep1(header);

  if (!validation.isValid) {
    // Show the plain-language messages, never the raw field keys.
    const messages = Array.from(new Set(Object.values(validation.errors).filter(Boolean)));
    const errorMessage = messages.length > 0
      ? messages.map(message => `• ${message}`).join('\n')
      : t('grn.form.fillRequiredFields');

    showAlert(t('grn.form.checkDetailsTitle'), errorMessage);
    return false;
  }

  return true;
};

/**
 * Check Step 2 for unsaved item data
 * Returns object indicating if navigation is safe and why
 */
export interface Step2NavigationCheck {
  canNavigate: boolean;
  reason?: 'unsaved_item' | 'no_items' | 'ok';
  hasUnsavedData: boolean;
}

export const checkStep2UnsavedData = (
  formItems: any[],
  savedItems: any[]
): Step2NavigationCheck => {
  // Check if current form has any data
  if (formItems.length === 0) {
    return {
      canNavigate: true,
      reason: 'ok',
      hasUnsavedData: false,
    };
  }

  const currentItem = formItems[0];

  // Bug #6 fix: First check if this item is already saved using grn_trl_id
  const alreadySaved = savedItems.some(saved => saved.grn_trl_id === currentItem.grn_trl_id);
  if (alreadySaved) {
    return {
      canNavigate: true,
      reason: 'ok',
      hasUnsavedData: false,
    };
  }

  // Check if form has meaningful data
  const hasData =
    currentItem.item_table_id ||
    currentItem.item_name ||
    currentItem.qty ||
    currentItem.weight ||
    currentItem.rack ||
    currentItem.package_mark ||
    currentItem.trl_img_url;

  if (hasData) {
    return {
      canNavigate: false,
      reason: 'unsaved_item',
      hasUnsavedData: true,
    };
  }

  return {
    canNavigate: true,
    reason: 'ok',
    hasUnsavedData: false,
  };
};

/**
 * Show "Save or Discard" alert for Step 2 unsaved data
 * Calls appropriate callback based on user choice
 */
export const showUnsavedDataAlert = (
  onSave: () => void,
  onDiscard: () => void,
  onCancel: () => void
): void => {
  showAlert(
    t('grn.itemsStep.saveItemTitle'),
    t('grn.itemsStep.saveItemMessage'),
    [
      {
        text: t('common.keepEditing'),
        style: 'cancel',
        onPress: onCancel,
      },
      {
        text: t('grn.itemsStep.discardItem'),
        style: 'destructive',
        onPress: onDiscard,
      },
      {
        text: t('grn.itemsStep.saveItem'),
        onPress: onSave,
      },
    ],
    { cancelable: true }
  );
};

/**
 * Check if Step 2 has at least one saved item
 * Required before navigating to Step 3
 */
export const hasMinimumItems = (savedItems: any[]): boolean => {
  return savedItems.length > 0;
};
