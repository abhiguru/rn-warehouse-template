import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import {
  InvoiceFormState,
  InvoiceHeaderData,
  InvoiceItemData,
  EditedItemValues,
  SavedInvoiceData,
} from '@/types/invoice.types';
import {
  roundMoney,
  calculateFinancialYear,
  calculateHeaderTotals,
  recalculateItemWithEdits,
  applyBulkPricingToAllItems,
  applyBulkGroupPricing,
} from '@/utils/invoiceCalculations';

// Initial header state
const initialHeader: InvoiceHeaderData = {
  inv_date: new Date().toISOString().split('T')[0],
  inv_fin_year: calculateFinancialYear(new Date().toISOString()),
  inv_no: 0,
  customer_id: '',
  customer_name: '',
  gr_id: '',
  gr_no: '',
  one_time_charge: false,
  discount: 0,
  labour: 0,
  tax_amount: 0,
  total: 0,
};

// #18 Fix: Snapshot type for rollback
interface InvoiceFormSnapshot {
  invoiceId: string | null;
  selectedGrId: string | null;
  header: InvoiceHeaderData;
  items: InvoiceItemData[];
  editedItems: Record<string, Partial<EditedItemValues>>;
  itemOverrides: Record<string, Array<'charge' | 'labour_rate' | 'tax'>>;
  bulkPricing: Record<string, { charge: number; labour_rate: number; tax: number }>;
}

// Initial state
const initialState: InvoiceFormState & { snapshot: InvoiceFormSnapshot | null } = {
  invoice_id: null,
  selected_gr_id: null,
  header: initialHeader,
  items: [],
  editedItems: {},
  itemOverrides: {},
  bulkPricing: {},
  originalDurations: {},
  currentStep: 0,
  is_loading: false,
  is_saving: false,
  is_loading_items: false,
  error: null,
  validationErrors: {},
  // #18 Fix: Snapshot for optimistic update rollback
  snapshot: null,
};

const invoiceFormSlice = createSlice({
  name: 'invoiceForm',
  initialState,
  reducers: {
    // ID management
    setInvoiceId: (state, action: PayloadAction<string | null>) => {
      state.invoice_id = action.payload;
    },
    setSelectedGrId: (state, action: PayloadAction<string | null>) => {
      state.selected_gr_id = action.payload;
    },

    // Header management
    updateHeader: (state, action: PayloadAction<Partial<InvoiceHeaderData>>) => {
      state.header = { ...state.header, ...action.payload };

      // Auto-update financial year if date changes
      if (action.payload.inv_date) {
        state.header.inv_fin_year = calculateFinancialYear(action.payload.inv_date);
      }
    },

    // Items management
    setItems: (state, action: PayloadAction<InvoiceItemData[]>) => {
      state.items = action.payload;
      // Reset edited items when items are loaded
      state.editedItems = {};
    },

    updateItem: (
      state,
      action: PayloadAction<{ temp_id: string; item: Partial<InvoiceItemData> }>
    ) => {
      const index = state.items.findIndex((item) => item.temp_id === action.payload.temp_id);
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...action.payload.item };
      }
    },

    // Edited items tracking (for user edits)
    updateEditedItem: (
      state,
      action: PayloadAction<{ temp_id: string; values: Partial<EditedItemValues> }>
    ) => {
      const { temp_id, values } = action.payload;
      if (!state.editedItems[temp_id]) {
        state.editedItems[temp_id] = {};
      }
      state.editedItems[temp_id] = { ...state.editedItems[temp_id], ...values };

      // Track overrides for charge, labour_rate, and tax
      // When user manually edits these fields, mark them as overridden
      const overrideFields: Array<'charge' | 'labour_rate' | 'tax'> = ['charge', 'labour_rate', 'tax'];
      if (!state.itemOverrides[temp_id]) {
        state.itemOverrides[temp_id] = [];
      }

      overrideFields.forEach((field) => {
        if (values[field] !== undefined && !state.itemOverrides[temp_id].includes(field)) {
          state.itemOverrides[temp_id].push(field);
        }
      });

      // Update the item with the edited values and recalculate
      const itemIndex = state.items.findIndex((item) => item.temp_id === temp_id);
      if (itemIndex !== -1) {
        const item = state.items[itemIndex];
        const editedItem = state.editedItems[temp_id];

        // Recalculate item using extracted function
        state.items[itemIndex] = recalculateItemWithEdits(item, editedItem);
      }

      // Recalculate header totals using extracted function
      const headerTotals = calculateHeaderTotals(state.items, state.header.discount);
      state.header.labour = headerTotals.labour;
      state.header.tax_amount = headerTotals.tax_amount;
      state.header.total = headerTotals.total;
    },

    // Bulk update all item pricing (useful for applying defaults)
    bulkUpdateItemPricing: (
      state,
      action: PayloadAction<Partial<EditedItemValues>>
    ) => {
      const defaultValues = action.payload;

      // Apply bulk pricing using extracted function
      state.items = applyBulkPricingToAllItems(state.items, defaultValues);

      // Track as edited for each item
      state.items.forEach((item) => {
        if (!state.editedItems[item.temp_id]) {
          state.editedItems[item.temp_id] = {};
        }
        state.editedItems[item.temp_id] = {
          ...state.editedItems[item.temp_id],
          ...defaultValues,
        };
      });

      // Recalculate header totals using extracted function
      const headerTotals = calculateHeaderTotals(state.items, state.header.discount);
      state.header.labour = headerTotals.labour;
      state.header.tax_amount = headerTotals.tax_amount;
      state.header.total = headerTotals.total;
    },

    // Update discount and recalculate total
    updateDiscount: (state, action: PayloadAction<number>) => {
      state.header.discount = roundMoney(action.payload);
      const headerTotals = calculateHeaderTotals(state.items, state.header.discount);
      state.header.total = headerTotals.total;
    },

    // Recalculate all totals (called after any item changes)
    recalculateTotals: (state) => {
      const headerTotals = calculateHeaderTotals(state.items, state.header.discount);
      state.header.labour = headerTotals.labour;
      state.header.tax_amount = headerTotals.tax_amount;
      state.header.total = headerTotals.total;
    },

    // Bulk update pricing for all dispatches of an item group (item_id + package_mark)
    bulkUpdateItemGroupPricing: (
      state,
      action: PayloadAction<{
        group_key: string; // Format: "item_id:::package_mark" (using ::: as delimiter to avoid UUID underscore issues)
        pricing: {
          charge: number;
          labour_rate: number;
          tax: number;
        };
      }>
    ) => {
      const { group_key, pricing } = action.payload;

      // Store bulk pricing values for this item group
      state.bulkPricing[group_key] = pricing;

      // Apply bulk group pricing using extracted function
      const { updatedItems } = applyBulkGroupPricing(
        state.items,
        group_key,
        pricing,
        state.itemOverrides
      );

      // Track edited items for non-overridden fields
      updatedItems.forEach((updatedItem, index) => {
        const originalItem = state.items[index];
        // Only track if item was actually updated (compare by reference)
        if (updatedItem !== originalItem) {
          const overrides = state.itemOverrides[updatedItem.temp_id] || [];
          if (!state.editedItems[updatedItem.temp_id]) {
            state.editedItems[updatedItem.temp_id] = {};
          }
          if (!overrides.includes('charge')) {
            state.editedItems[updatedItem.temp_id].charge = updatedItem.charge;
          }
          if (!overrides.includes('labour_rate')) {
            state.editedItems[updatedItem.temp_id].labour_rate = updatedItem.labour_rate;
          }
          if (!overrides.includes('tax')) {
            state.editedItems[updatedItem.temp_id].tax = updatedItem.tax;
          }
        }
      });

      state.items = updatedItems;

      // Recalculate header totals using extracted function
      const headerTotals = calculateHeaderTotals(state.items, state.header.discount);
      state.header.labour = headerTotals.labour;
      state.header.tax_amount = headerTotals.tax_amount;
      state.header.total = headerTotals.total;
    },

    // UI state management
    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.is_loading = action.payload;
    },
    setIsSaving: (state, action: PayloadAction<boolean>) => {
      state.is_saving = action.payload;
    },
    setIsLoadingItems: (state, action: PayloadAction<boolean>) => {
      state.is_loading_items = action.payload;
    },

    // Error handling
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },

    // Validation
    setValidationErrors: (state, action: PayloadAction<Record<string, string>>) => {
      state.validationErrors = action.payload;
    },
    clearValidationError: (state, action: PayloadAction<string>) => {
      delete state.validationErrors[action.payload];
    },
    clearAllValidationErrors: (state) => {
      state.validationErrors = {};
    },

    // Bulk operations
    loadInvoiceFormData: (
      state,
      action: PayloadAction<{
        header: Partial<InvoiceHeaderData>;
        items: InvoiceItemData[];
        grId: string;
      }>
    ) => {
      // Preserve invoice number and financial year when loading GRN data
      const preservedInvNo = state.header.inv_no;
      const preservedInvDate = state.header.inv_date;
      const preservedInvFinYear = state.header.inv_fin_year;
      const preservedDiscount = state.header.discount;

      // For one_time_charge: use the value from GRN's pricing_mode if provided,
      // otherwise preserve the current value (for backward compatibility)
      const oneTimeCharge = action.payload.header.one_time_charge !== undefined
        ? action.payload.header.one_time_charge
        : state.header.one_time_charge;

      // Reset header completely to avoid stale data from previous GRN selection
      state.header = {
        ...initialHeader,
        ...action.payload.header,
        // Preserve these fields that were already set by the user
        inv_no: preservedInvNo,
        inv_date: preservedInvDate,
        inv_fin_year: preservedInvFinYear,
        one_time_charge: oneTimeCharge,
        discount: preservedDiscount,
      };
      state.items = action.payload.items;
      state.selected_gr_id = action.payload.grId;
      state.editedItems = {};
      state.itemOverrides = {};
      state.bulkPricing = {};

      // Cache original durations for one_time_charge toggle restoration
      // These are the calculated durations from the RPC (based on dispatch dates)
      state.originalDurations = {};
      action.payload.items.forEach((item) => {
        state.originalDurations[item.temp_id] = item.duration;
      });

      // If one_time_charge is enabled, override all durations to 1 and recalculate amounts
      // This handles GRNs with pricing_mode = ONE_TIME
      if (oneTimeCharge) {
        state.items.forEach((item, index) => {
          const newDuration = 1;
          const amount = roundMoney(item.qty * item.charge * newDuration);
          const labour_amount = roundMoney(item.qty * item.labour_rate);
          const taxable_amount = roundMoney(amount + labour_amount);
          const tax_amount = roundMoney(taxable_amount * (item.tax / 100));
          const item_total = roundMoney(taxable_amount + tax_amount);

          state.items[index] = {
            ...item,
            duration: newDuration,
            amount,
            labour_amount,
            tax_amount,
            item_total,
          };
        });
      }

      // Calculate initial totals with proper rounding
      const subtotal = roundMoney(state.items.reduce((sum, item) => sum + item.amount, 0));
      const totalLabour = roundMoney(state.items.reduce((sum, item) => sum + item.labour_amount, 0));
      const totalTax = roundMoney(state.items.reduce((sum, item) => sum + item.tax_amount, 0));
      const grandTotal = roundMoney(subtotal + totalLabour + totalTax - state.header.discount);

      state.header.labour = totalLabour;
      state.header.tax_amount = totalTax;
      state.header.total = grandTotal;
    },

    // Load invoice data for edit mode
    loadInvoiceEditData: (
      state,
      action: PayloadAction<{
        invoiceId: string;
        header: InvoiceHeaderData;
        items: InvoiceItemData[];
        grId: string;
      }>
    ) => {
      // Set invoice ID to enable edit mode
      state.invoice_id = action.payload.invoiceId;

      // Replace entire header with loaded data (no preservation needed in edit mode)
      state.header = action.payload.header;

      // Replace all items
      state.items = action.payload.items;

      // Set selected GR ID
      state.selected_gr_id = action.payload.grId;

      // Reset editing state (fresh start for edit mode)
      state.editedItems = {};
      state.itemOverrides = {};

      // Initialize bulkPricing from loaded items by calculating average pricing per group (item_id + package_mark)
      state.bulkPricing = {};
      const itemGroups = new Map<string, { charge: number[]; labour_rate: number[]; tax: number[] }>();

      action.payload.items.forEach((item) => {
        // Group by item_id + package_mark
        // Use ::: as delimiter to avoid issues with underscores in UUIDs or package marks
        const groupKey = `${item.item_id}:::${item.package_mark}`;
        const existing = itemGroups.get(groupKey);
        if (existing) {
          existing.charge.push(item.charge);
          existing.labour_rate.push(item.labour_rate);
          existing.tax.push(item.tax);
        } else {
          itemGroups.set(groupKey, {
            charge: [item.charge],
            labour_rate: [item.labour_rate],
            tax: [item.tax],
          });
        }
      });

      // Calculate average for each group
      itemGroups.forEach((values, groupKey) => {
        const avgCharge = values.charge.reduce((sum, val) => sum + val, 0) / values.charge.length;
        const avgLabourRate = values.labour_rate.reduce((sum, val) => sum + val, 0) / values.labour_rate.length;
        const avgTax = values.tax.reduce((sum, val) => sum + val, 0) / values.tax.length;

        state.bulkPricing[groupKey] = {
          charge: Math.round(avgCharge * 100) / 100,
          labour_rate: Math.round(avgLabourRate * 100) / 100,
          tax: Math.round(avgTax * 100) / 100,
        };
      });

      // Cache original durations for one_time_charge toggle restoration
      state.originalDurations = {};
      action.payload.items.forEach((item) => {
        state.originalDurations[item.temp_id] = item.duration;
      });

      // Clear validation errors
      state.validationErrors = {};
    },

    // Update all item durations (for one_time_charge toggle)
    updateAllDurations: (state, action: PayloadAction<number>) => {
      const newDuration = Math.round(action.payload);

      // Update all items with new duration and recalculate
      state.items.forEach((item, index) => {
        const { charge, labour_rate, tax } = item;

        // Recalculate amounts with new duration
        const amount = roundMoney(item.qty * charge * newDuration);
        const labour_amount = roundMoney(item.qty * labour_rate);
        const taxable_amount = roundMoney(amount + labour_amount);
        const tax_amount = roundMoney(taxable_amount * (tax / 100));
        const item_total = roundMoney(taxable_amount + tax_amount);

        state.items[index] = {
          ...item,
          duration: newDuration,
          amount,
          labour_amount,
          tax_amount,
          item_total,
        };
      });

      // Recalculate header totals
      const subtotal = roundMoney(state.items.reduce((sum, item) => sum + item.amount, 0));
      const totalLabour = roundMoney(state.items.reduce((sum, item) => sum + item.labour_amount, 0));
      const totalTax = roundMoney(state.items.reduce((sum, item) => sum + item.tax_amount, 0));
      const grandTotal = roundMoney(subtotal + totalLabour + totalTax - state.header.discount);

      state.header.labour = totalLabour;
      state.header.tax_amount = totalTax;
      state.header.total = grandTotal;
    },

    // Restore original durations from cache (for one_time_charge toggle off)
    restoreOriginalDurations: (state) => {
      // Restore each item's duration from cache (can be fractional, e.g., 7.5 months)
      state.items.forEach((item, index) => {
        const originalDuration = state.originalDurations[item.temp_id] || 1;
        const { charge, labour_rate, tax } = item;

        // Recalculate amounts with original duration
        const amount = roundMoney(item.qty * charge * originalDuration);
        const labour_amount = roundMoney(item.qty * labour_rate);
        const taxable_amount = roundMoney(amount + labour_amount);
        const tax_amount = roundMoney(taxable_amount * (tax / 100));
        const item_total = roundMoney(taxable_amount + tax_amount);

        state.items[index] = {
          ...item,
          duration: originalDuration,
          amount,
          labour_amount,
          tax_amount,
          item_total,
        };
      });

      // Recalculate header totals
      const subtotal = roundMoney(state.items.reduce((sum, item) => sum + item.amount, 0));
      const totalLabour = roundMoney(state.items.reduce((sum, item) => sum + item.labour_amount, 0));
      const totalTax = roundMoney(state.items.reduce((sum, item) => sum + item.tax_amount, 0));
      const grandTotal = roundMoney(subtotal + totalLabour + totalTax - state.header.discount);

      state.header.labour = totalLabour;
      state.header.tax_amount = totalTax;
      state.header.total = grandTotal;
    },

    resetForm: () => {
      return initialState;
    },

    // #18 Fix: Snapshot actions for optimistic update rollback
    /**
     * Save current form state before submission.
     * Call this before starting any save/update operation.
     */
    saveSnapshot: (state) => {
      state.snapshot = {
        invoiceId: state.invoice_id,
        selectedGrId: state.selected_gr_id,
        header: JSON.parse(JSON.stringify(state.header)),
        items: JSON.parse(JSON.stringify(state.items)),
        editedItems: JSON.parse(JSON.stringify(state.editedItems)),
        itemOverrides: JSON.parse(JSON.stringify(state.itemOverrides)),
        bulkPricing: JSON.parse(JSON.stringify(state.bulkPricing)),
      };
    },

    /**
     * Rollback to saved snapshot if submission fails.
     * Call this when save/update operation fails.
     */
    rollbackToSnapshot: (state) => {
      if (state.snapshot) {
        state.invoice_id = state.snapshot.invoiceId;
        state.selected_gr_id = state.snapshot.selectedGrId;
        state.header = state.snapshot.header;
        state.items = state.snapshot.items;
        state.editedItems = state.snapshot.editedItems;
        state.itemOverrides = state.snapshot.itemOverrides;
        state.bulkPricing = state.snapshot.bulkPricing;
        state.snapshot = null;
        state.is_saving = false;
      }
    },

    /**
     * Clear snapshot after successful submission.
     * Call this when save/update operation succeeds.
     */
    clearSnapshot: (state) => {
      state.snapshot = null;
    },
  },
});

// Export actions
export const {
  setInvoiceId,
  setSelectedGrId,
  updateHeader,
  setItems,
  updateItem,
  updateEditedItem,
  bulkUpdateItemPricing,
  bulkUpdateItemGroupPricing,
  updateDiscount,
  recalculateTotals,
  updateAllDurations,
  restoreOriginalDurations,
  setCurrentStep,
  setIsLoading,
  setIsSaving,
  setIsLoadingItems,
  setError,
  clearError,
  setValidationErrors,
  clearValidationError,
  clearAllValidationErrors,
  loadInvoiceFormData,
  loadInvoiceEditData,
  resetForm,
  // #18 Fix: Snapshot actions for optimistic update rollback
  saveSnapshot,
  rollbackToSnapshot,
  clearSnapshot,
} = invoiceFormSlice.actions;

// ============================================================================
// BASE SELECTORS
// ============================================================================

export const selectInvoiceFormHeader = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.header;
export const selectInvoiceFormItems = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.items;
export const selectInvoiceFormEditedItems = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.editedItems;
export const selectInvoiceFormItemOverrides = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.itemOverrides;
export const selectInvoiceFormBulkPricing = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.bulkPricing;
export const selectInvoiceFormStep = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.currentStep;
export const selectInvoiceFormId = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.invoice_id;
export const selectSelectedGrId = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.selected_gr_id;
export const selectInvoiceFormValidationErrors = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.validationErrors;
export const selectInvoiceFormIsLoading = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.is_loading;
export const selectInvoiceFormIsSaving = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.is_saving;
export const selectInvoiceFormIsLoadingItems = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.is_loading_items;
export const selectInvoiceFormError = (state: { invoiceForm: InvoiceFormState }) =>
  state.invoiceForm.error;

// ============================================================================
// MEMOIZED SELECTORS (2025 React Native best practice)
// ============================================================================

/**
 * Memoized selector for invoice totals - prevents re-renders when unrelated state changes
 */
export const selectInvoiceFormTotals = createSelector(
  [selectInvoiceFormItems, selectInvoiceFormHeader],
  (items, header) => ({
    subtotal: items.reduce((sum, item) => sum + (item.amount || 0), 0),
    taxTotal: items.reduce((sum, item) => sum + (item.tax_amount || 0), 0),
    labourTotal: items.reduce((sum, item) => sum + (item.labour_amount || 0), 0),
    grandTotal: header.total || 0,
    discount: header.discount || 0,
    itemCount: items.length,
  })
);

/**
 * Memoized selector for items grouped by GRN item
 */
export const selectInvoiceItemsByGRNItem = createSelector(
  [selectInvoiceFormItems],
  (items) => {
    const grouped = new Map<string, InvoiceItemData[]>();
    items.forEach(item => {
      const grnItemId = item.grn_item_id || 'unknown';
      const existing = grouped.get(grnItemId);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(grnItemId, [item]);
      }
    });
    return grouped;
  }
);

/**
 * Memoized selector for unique GRN item names
 */
export const selectInvoiceUniqueItemNames = createSelector(
  [selectInvoiceFormItems],
  (items) => {
    const names = new Set(items.map(item => item.item_name).filter(Boolean));
    return Array.from(names);
  }
);

/**
 * Memoized selector for checking if form has items
 */
export const selectInvoiceFormHasItems = createSelector(
  [selectInvoiceFormItems],
  (items) => items.length > 0
);

/**
 * Memoized selector for checking form validity
 */
export const selectInvoiceFormIsValid = createSelector(
  [selectInvoiceFormHeader, selectInvoiceFormItems, selectInvoiceFormValidationErrors],
  (header, items, errors) => {
    const hasRequiredHeader = !!(header.customer_id && header.gr_id && header.inv_no);
    const hasItems = items.length > 0;
    const hasNoErrors = Object.keys(errors).length === 0;
    return hasRequiredHeader && hasItems && hasNoErrors;
  }
);

/**
 * Memoized selector for bulk pricing overrides count
 */
export const selectInvoiceOverrideCount = createSelector(
  [selectInvoiceFormItemOverrides],
  (overrides) => {
    let count = 0;
    Object.values(overrides).forEach(fields => {
      count += fields.length;
    });
    return count;
  }
);

/**
 * Memoized selector for items with edited values applied
 */
export const selectInvoiceItemsWithEdits = createSelector(
  [selectInvoiceFormItems, selectInvoiceFormEditedItems],
  (items, editedItems) => {
    return items.map(item => {
      const edits = editedItems[item.temp_id];
      if (!edits) return item;
      return {
        ...item,
        charge: edits.charge ?? item.charge,
        labour_rate: edits.labour_rate ?? item.labour_rate,
        tax: edits.tax ?? item.tax,
        duration: edits.duration ?? item.duration,
      };
    });
  }
);

export default invoiceFormSlice.reducer;
