import { Alert } from 'react-native';
import { validateStep1, validateStep2 } from '../schemas/invoiceValidation';
import type { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';

/**
 * Check if navigation from Step 1 is allowed
 * Validates all Step 1 fields and checks for items
 */
export const canNavigateFromStep1 = async (
  header: InvoiceHeaderData,
  items: InvoiceItemData[]
): Promise<boolean> => {
  const validation = await validateStep1(header);

  if (!validation.isValid) {
    const errorFields = Object.keys(validation.errors);
    const errorMessage = errorFields.length > 0
      ? `Please fix: ${errorFields.join(', ')}`
      : 'Please fill all required fields correctly';

    Alert.alert('Validation Error', errorMessage);
    return false;
  }

  // Check if items are loaded from GRN selection
  if (!items || items.length === 0) {
    Alert.alert('No Items', 'Please select a GRN with dispatch items');
    return false;
  }

  return true;
};

/**
 * Check if navigation from Step 2 is allowed
 * Validates all item pricing
 */
export const canNavigateFromStep2 = async (
  items: InvoiceItemData[]
): Promise<boolean> => {
  const validation = await validateStep2(items);

  if (!validation.isValid) {
    const errorCount = Object.keys(validation.errors).length;
    const errorMessage = `${errorCount} validation error(s) found. Please check all item fields.`;

    Alert.alert('Validation Error', errorMessage);
    return false;
  }

  return true;
};

/**
 * Check if Step 2 has valid items
 * Required before navigating to Step 3
 */
export const hasValidItems = (items: InvoiceItemData[]): boolean => {
  return items.length > 0;
};
