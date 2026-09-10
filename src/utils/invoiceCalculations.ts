/**
 * Invoice Calculation Utilities
 *
 * Pure functions for invoice pricing, duration, and total calculations.
 * Extracted from Redux reducers for better testability and reusability.
 */

import type { InvoiceItemData } from '@/types/invoice.types';

/**
 * Round money values to 2 decimal places
 * Prevents floating-point precision errors in currency calculations
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate financial year from date (April-March cycle)
 * @example
 * calculateFinancialYear('2024-03-15') // Returns "2023-24"
 * calculateFinancialYear('2024-04-01') // Returns "2024-25"
 */
export function calculateFinancialYear(dateString: string): string {
  const date = new Date(dateString);
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();

  // April (3) to March (2)
  // If month is Jan (0), Feb (1), Mar (2), FY is (year-1)-year
  // If month is Apr (3) onwards, FY is year-(year+1)
  if (month >= 3) {
    // Apr onwards
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    // Jan-Mar
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

/**
 * Calculate amounts for a single invoice item
 */
export interface ItemAmounts {
  amount: number;
  labour_amount: number;
  taxable_amount: number;
  tax_amount: number;
  item_total: number;
}

export function calculateItemAmounts(
  qty: number,
  charge: number,
  labour_rate: number,
  tax: number,
  duration: number
): ItemAmounts {
  // Guard against NaN - use 0 as safe default for invalid values
  const safeQty = isNaN(qty) || qty < 0 ? 0 : qty;
  const safeCharge = isNaN(charge) || charge < 0 ? 0 : charge;
  const safeLabourRate = isNaN(labour_rate) || labour_rate < 0 ? 0 : labour_rate;
  const safeTax = isNaN(tax) || tax < 0 ? 0 : tax;
  const safeDuration = isNaN(duration) || duration <= 0 ? 1 : duration;

  const amount = roundMoney(safeQty * safeCharge * safeDuration);
  const labour_amount = roundMoney(safeQty * safeLabourRate);
  const taxable_amount = roundMoney(amount + labour_amount);
  const tax_amount = roundMoney(taxable_amount * (safeTax / 100));
  const item_total = roundMoney(taxable_amount + tax_amount);

  return {
    amount,
    labour_amount,
    taxable_amount,
    tax_amount,
    item_total,
  };
}

/**
 * Apply pricing to an invoice item
 */
export function applyPricingToItem(
  item: InvoiceItemData,
  pricing: {
    charge?: number;
    labour_rate?: number;
    tax?: number;
    duration?: number;
  }
): InvoiceItemData {
  const charge = pricing.charge ?? item.charge;
  const labour_rate = pricing.labour_rate ?? item.labour_rate;
  const tax = pricing.tax ?? item.tax;
  const duration = pricing.duration ?? item.duration;

  const amounts = calculateItemAmounts(
    item.qty,
    charge,
    labour_rate,
    tax,
    duration
  );

  return {
    ...item,
    charge,
    labour_rate,
    tax,
    duration,
    ...amounts,
  };
}

/**
 * Calculate header totals from items
 */
export interface HeaderTotals {
  labour: number;
  tax_amount: number;
  total: number;
}

export function calculateHeaderTotals(
  items: InvoiceItemData[],
  discount: number = 0
): HeaderTotals {
  // Guard against NaN values (allow negative discounts as they act as surcharges)
  const safeDiscount = isNaN(discount) ? 0 : discount;

  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + (isNaN(item.amount) ? 0 : item.amount), 0)
  );
  const labour = roundMoney(
    items.reduce((sum, item) => sum + (isNaN(item.labour_amount) ? 0 : item.labour_amount), 0)
  );
  const tax_amount = roundMoney(
    items.reduce((sum, item) => sum + (isNaN(item.tax_amount) ? 0 : item.tax_amount), 0)
  );
  const total = roundMoney(subtotal + labour + tax_amount - safeDiscount);

  return {
    labour,
    tax_amount,
    total,
  };
}

/**
 * Update all items with new duration and recalculate totals
 */
export function updateAllItemDurations(
  items: InvoiceItemData[],
  newDuration: number
): InvoiceItemData[] {
  // Duration can be fractional (e.g., 7.5 months), don't round it
  const duration = newDuration;

  return items.map((item) => {
    const amounts = calculateItemAmounts(
      item.qty,
      item.charge,
      item.labour_rate,
      item.tax,
      duration
    );

    return {
      ...item,
      duration,
      ...amounts,
    };
  });
}

/**
 * Apply bulk pricing to items matching a group key (item_id + package_mark)
 */
export interface BulkPricingUpdate {
  updatedItems: InvoiceItemData[];
  updatedCount: number;
}

export function applyBulkItemGroupPricing(
  items: InvoiceItemData[],
  itemId: string,
  packageMark: string,
  pricing: {
    charge: number;
    labour_rate: number;
    tax: number;
  },
  itemOverrides: Record<string, string[]>
): BulkPricingUpdate {
  let updatedCount = 0;

  const updatedItems = items.map((item) => {
    // Check if item matches the group
    if (item.item_id !== itemId || item.package_mark !== packageMark) {
      return item;
    }

    updatedCount++;

    // Get override list for this item (if any)
    const overrides = itemOverrides[item.temp_id] || [];

    // Apply bulk values only to non-overridden fields
    const charge = overrides.includes('charge') ? item.charge : pricing.charge;
    const labour_rate = overrides.includes('labour_rate') ? item.labour_rate : pricing.labour_rate;
    const tax = overrides.includes('tax') ? item.tax : pricing.tax;

    // Recalculate amounts
    const amounts = calculateItemAmounts(
      item.qty,
      charge,
      labour_rate,
      tax,
      item.duration
    );

    return {
      ...item,
      charge,
      labour_rate,
      tax,
      ...amounts,
    };
  });

  return {
    updatedItems,
    updatedCount,
  };
}

/**
 * Restore original durations to items
 */
export function restoreItemDurations(
  items: InvoiceItemData[],
  originalDurations: Record<string, number>
): InvoiceItemData[] {
  return items.map((item) => {
    const originalDuration = Math.round(originalDurations[item.temp_id] || 1);

    const amounts = calculateItemAmounts(
      item.qty,
      item.charge,
      item.labour_rate,
      item.tax,
      originalDuration
    );

    return {
      ...item,
      duration: originalDuration,
      ...amounts,
    };
  });
}

/**
 * Update item pricing with override tracking
 */
export interface ItemPricingUpdate {
  updatedItem: InvoiceItemData;
  updatedEditedFields: Record<string, unknown>;
}

export function updateItemPricing(
  item: InvoiceItemData,
  pricing: {
    charge?: number;
    labour_rate?: number;
    tax?: number;
  },
  currentEditedFields: Record<string, unknown> = {}
): ItemPricingUpdate {
  const updatedItem = applyPricingToItem(item, pricing);

  // Track edited fields
  const updatedEditedFields = { ...currentEditedFields };
  if (pricing.charge !== undefined) {
    updatedEditedFields.charge = pricing.charge;
  }
  if (pricing.labour_rate !== undefined) {
    updatedEditedFields.labour_rate = pricing.labour_rate;
  }
  if (pricing.tax !== undefined) {
    updatedEditedFields.tax = pricing.tax;
  }

  return {
    updatedItem,
    updatedEditedFields,
  };
}

/**
 * Parse group key into item_id and package_mark
 * Supports both ::: delimiter (preferred) and _ delimiter (legacy)
 */
export function parseGroupKey(groupKey: string): {
  item_id: string;
  package_mark: string;
} {
  // Prefer ::: delimiter to avoid issues with underscores in UUIDs
  if (groupKey.includes(':::')) {
    const parts = groupKey.split(':::');
    return {
      item_id: parts[0],
      package_mark: parts[1] || '',
    };
  }

  // Legacy underscore format - use first underscore
  const firstUnderscoreIndex = groupKey.indexOf('_');
  if (firstUnderscoreIndex === -1) {
    return { item_id: groupKey, package_mark: '' };
  }

  return {
    item_id: groupKey.substring(0, firstUnderscoreIndex),
    package_mark: groupKey.substring(firstUnderscoreIndex + 1),
  };
}

/**
 * Generate group key from item_id and package_mark
 * Uses ::: delimiter to avoid issues with underscores in UUIDs
 */
export function generateGroupKey(itemId: string, packageMark: string): string {
  return `${itemId}:::${packageMark}`;
}

/**
 * Recalculate a single item with edited values
 * Used by updateEditedItem reducer
 */
export function recalculateItemWithEdits(
  item: InvoiceItemData,
  editedValues: Partial<{
    duration: number;
    charge: number;
    labour_rate: number;
    tax: number;
    no_of_days: number;
  }>
): InvoiceItemData {
  const duration = editedValues.duration ?? item.duration;
  const charge = editedValues.charge ?? item.charge;
  const labour_rate = editedValues.labour_rate ?? item.labour_rate;
  const tax = editedValues.tax ?? item.tax;
  const no_of_days = Math.round(editedValues.no_of_days ?? item.no_of_days);

  const amounts = calculateItemAmounts(item.qty, charge, labour_rate, tax, duration);

  return {
    ...item,
    duration,
    charge,
    labour_rate,
    tax,
    no_of_days,
    ...amounts,
  };
}

/**
 * Apply bulk pricing update to all items
 * Used by bulkUpdateItemPricing reducer
 */
export function applyBulkPricingToAllItems(
  items: InvoiceItemData[],
  defaultValues: Partial<{
    duration: number;
    charge: number;
    labour_rate: number;
    tax: number;
    no_of_days: number;
  }>
): InvoiceItemData[] {
  return items.map((item) => recalculateItemWithEdits(item, defaultValues));
}

/**
 * Apply bulk pricing to items in a specific group with override support
 * Used by bulkUpdateItemGroupPricing reducer
 */
export interface BulkGroupPricingResult {
  updatedItems: InvoiceItemData[];
  updatedCount: number;
}

export function applyBulkGroupPricing(
  items: InvoiceItemData[],
  groupKey: string,
  pricing: {
    charge: number;
    labour_rate: number;
    tax: number;
  },
  itemOverrides: Record<string, string[]>
): BulkGroupPricingResult {
  const { item_id, package_mark } = parseGroupKey(groupKey);
  let updatedCount = 0;

  const updatedItems = items.map((item) => {
    // Check if item matches the group
    if (item.item_id !== item_id || item.package_mark !== package_mark) {
      return item;
    }

    updatedCount++;

    // Get override list for this item (if any)
    const overrides = itemOverrides[item.temp_id] || [];

    // Apply bulk values only to non-overridden fields
    const charge = overrides.includes('charge') ? item.charge : pricing.charge;
    const labour_rate = overrides.includes('labour_rate') ? item.labour_rate : pricing.labour_rate;
    const tax = overrides.includes('tax') ? item.tax : pricing.tax;

    // Recalculate amounts
    const amounts = calculateItemAmounts(item.qty, charge, labour_rate, tax, item.duration);

    return {
      ...item,
      charge,
      labour_rate,
      tax,
      ...amounts,
    };
  });

  return { updatedItems, updatedCount };
}
