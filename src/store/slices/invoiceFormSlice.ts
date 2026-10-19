import { createSlice, PayloadAction, createSelector, original, isDraft } from '@reduxjs/toolkit';
import {
  InvoiceFormState,
  InvoiceHeaderData,
  InvoiceItemData,
  EditedItemValues,
  GroupRates,
} from '@/types/invoice.types';
import {
  roundMoney,
  calculateFinancialYear,
  calculateHeaderTotals,
  calculateItemAmounts,
  recalculateItemWithEdits,
  applyBulkGroupPricing,
} from '@/utils/invoiceCalculations';

import { toLocalISODate } from '@/utils/formatters';
// Initial header state. Built when it is needed, not once when this file is
// loaded: the default date and financial year are "today", and the app can stay
// open past midnight and past 1 April.
const createInitialHeader = (): InvoiceHeaderData => {
  const today = toLocalISODate(new Date());
  return {
    inv_date: today,
    inv_fin_year: calculateFinancialYear(today),
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
};

/**
 * The lines as a plain array. Reading them through the draft makes a proxy of every line visited, which for a few
 * thousand lines costs far more than the edit. Call it before the reducer changes `state.items`.
 */
const plainLines = (items: InvoiceItemData[]): InvoiceItemData[] =>
  isDraft(items) ? original(items)! : items;

/**
 * What the saved invoice looked like when it was opened for editing: the
 * fingerprint of the fields the person can change, and the number and year it
 * was saved with (a date moved back into that year gets the number back).
 */
export interface InvoiceBaseline {
  fingerprint: string;
  inv_no: number;
  inv_fin_year: string;
  gr_id: string;
  /** The header and lines as loaded: choosing the invoice's own GRN again after a change brings them back. */
  header: InvoiceHeaderData;
  items: InvoiceItemData[];
}

/**
 * The fields of an invoice that the person can change, as one string. The
 * form is "changed" when this differs from the one taken when it was loaded.
 */
export const invoiceFingerprint = (header: InvoiceHeaderData, items: InvoiceItemData[]): string =>
  JSON.stringify([
    header.inv_no,
    header.inv_date,
    header.gr_id,
    header.discount || 0,
    (header.discount_reason || '').trim(),
    (header.zero_charge_reason || '').trim(),
    items.map((item) => [item.temp_id, item.charge, item.labour_rate, item.tax, item.duration, item.no_of_days]),
  ]);

/** The state of the invoice form's request for the next invoice number. */
export type NumberStatus = 'idle' | 'loading' | 'failed';

export type InvoiceFormSliceState = InvoiceFormState & {
  /** Raised by every reset: a screen that sees it change knows a new form was opened. */
  formSession: number;
  numberStatus: NumberStatus;
  /** The request whose answer is wanted; any other answer is stale. 0: none. */
  numberRequestId: number;
  /** Set when an invoice is loaded for editing; null in a new invoice. */
  baseline: InvoiceBaseline | null;
};

// Initial state. The steps are 1-based: a new form is on step 1.
const createInitialState = (formSession = 0): InvoiceFormSliceState => ({
  invoice_id: null,
  selected_gr_id: null,
  header: createInitialHeader(),
  items: [],
  editedItems: {},
  itemOverrides: {},
  bulkPricing: {},
  currentStep: 1,
  is_loading: false,
  is_saving: false,
  is_loading_items: false,
  error: null,
  validationErrors: {},
  formSession,
  numberStatus: 'idle',
  numberRequestId: 0,
  baseline: null,
});

const invoiceFormSlice = createSlice({
  name: 'invoiceForm',
  initialState: () => createInitialState(),
  reducers: {
    // ID management
    setInvoiceId: (state, action: PayloadAction<string | null>) => {
      state.invoice_id = action.payload;
    },

    // Header management
    updateHeader: (state, action: PayloadAction<Partial<InvoiceHeaderData>>) => {
      state.header = { ...state.header, ...action.payload };
      // From here on the reason field holds what the person wrote, not what was stored.
      if ('discount_reason' in action.payload) state.header.discount_reason_edited = true;

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

      // Update the item with the edited values and recalculate. The lines are read from the plain
      // array, not through the draft: reading a draft makes a proxy of every line it visits, which
      // for a few thousand lines costs more than the edit itself.
      const lines = plainLines(state.items);
      const itemIndex = lines.findIndex((item) => item.temp_id === temp_id);
      let totalsOf: InvoiceItemData[] = lines;
      if (itemIndex !== -1) {
        // Recalculate item using extracted function
        const recalculated = recalculateItemWithEdits(lines[itemIndex], state.editedItems[temp_id]);
        state.items[itemIndex] = recalculated;
        totalsOf = lines.map((item, index) => (index === itemIndex ? recalculated : item));
      }

      // Recalculate header totals using extracted function
      const headerTotals = calculateHeaderTotals(totalsOf, state.header.discount);
      state.header.labour = headerTotals.labour;
      state.header.tax_amount = headerTotals.tax_amount;
      state.header.total = headerTotals.total;
    },

    // Update discount and recalculate total
    updateDiscount: (state, action: PayloadAction<number>) => {
      const discount = roundMoney(action.payload);
      // The reason recorded with a saved invoice belongs to the discount it
      // was saved with. While the field still shows that stored text, it is
      // shown with the stored amount only: once the amount differs it is
      // taken out, so a new reason has to be written, and typing the stored
      // amount again puts it back.
      // A reason the person wrote during this edit is never touched here. The
      // amount field reports every keystroke, and clearing it reports 0, so an
      // amount on its way to another one passes through the stored amount.
      const savedReason = state.header.saved_discount_reason;
      if (savedReason !== undefined && !state.header.discount_reason_edited) {
        state.header.discount_reason =
          discount === roundMoney(state.header.saved_discount || 0) ? savedReason : '';
      }
      state.header.discount = discount;
      const headerTotals = calculateHeaderTotals(plainLines(state.items), state.header.discount);
      Object.assign(state.header, headerTotals);
    },

    // Set the rates a saved rate form gives to the lines it concerns. This is not a typed edit:
    // a rate typed on the line itself (marked in itemOverrides) is kept, and no mark is added, so
    // a later group rate still applies. A group rate shown for a field that changed is dropped.
    applySavedRates: (
      state,
      action: PayloadAction<Array<{ temp_id: string; charge: number; labour_rate: number; tax: number }>>
    ) => {
      const changedGroups: Array<{ key: string; fields: Array<'charge' | 'labour_rate' | 'tax'> }> = [];
      // Plain lines and one index of them, built once: a lookup through the draft for each rate was O(k*n) proxied reads.
      // `current` holds the lines this reducer has already changed (a temp_id given twice sees its own first result).
      const lines = plainLines(state.items);
      const indexOf = new Map<string, number>();
      lines.forEach((line, index) => {
        if (!indexOf.has(line.temp_id)) indexOf.set(line.temp_id, index);
      });
      const current = new Map<number, InvoiceItemData>();
      action.payload.forEach(rates => {
        const index = indexOf.get(rates.temp_id);
        if (index === undefined) return;
        const item = current.get(index) ?? lines[index];
        const overrides = state.itemOverrides[rates.temp_id] || [];
        const values: Partial<EditedItemValues> = {};
        (['charge', 'labour_rate', 'tax'] as const).forEach(field => {
          if (!overrides.includes(field) && item[field] !== rates[field]) values[field] = rates[field];
        });
        const fields = Object.keys(values) as Array<'charge' | 'labour_rate' | 'tax'>;
        if (fields.length === 0) return;
        const recalculated = recalculateItemWithEdits(item, values);
        current.set(index, recalculated);
        state.items[index] = recalculated;
        state.editedItems[rates.temp_id] = { ...state.editedItems[rates.temp_id], ...values };
        changedGroups.push({ key: `${item.item_id}:::${item.package_mark}`, fields });
      });
      changedGroups.forEach(({ key, fields }) => {
        const applied = state.bulkPricing[key];
        if (!applied) return;
        fields.forEach(field => { delete applied[field]; });
      });

      const headerTotals = calculateHeaderTotals(
        current.size === 0 ? lines : lines.map((line, index) => current.get(index) ?? line),
        state.header.discount
      );
      state.header.labour = headerTotals.labour;
      state.header.tax_amount = headerTotals.tax_amount;
      state.header.total = headerTotals.total;
    },

    // Set rates for all dispatches of an item group (item_id + package_mark).
    // Only the rates in `pricing` are set: a group field that was not typed
    // leaves that rate on every line as it is. So changing the group tax of a
    // stored invoice does not touch a free line's charge of 0.
    bulkUpdateItemGroupPricing: (
      state,
      action: PayloadAction<{
        group_key: string; // Format: "item_id:::package_mark" (using ::: as delimiter to avoid UUID underscore issues)
        pricing: GroupRates;
      }>
    ) => {
      const { group_key } = action.payload;
      // A rate given as undefined is a rate that was not given.
      const pricing: GroupRates = {};
      (['charge', 'labour_rate', 'tax'] as const).forEach((field) => {
        const value = action.payload.pricing[field];
        if (value !== undefined) pricing[field] = value;
      });

      // Remember the rates applied to this item group, next to those applied before
      state.bulkPricing[group_key] = { ...state.bulkPricing[group_key], ...pricing };

      // Apply bulk group pricing using extracted function
      const lines = plainLines(state.items);
      const { updatedItems } = applyBulkGroupPricing(
        lines,
        group_key,
        pricing,
        state.itemOverrides
      );

      // Track edited items for non-overridden fields
      updatedItems.forEach((updatedItem, index) => {
        const originalItem = lines[index];
        // Only track if item was actually updated (compare by reference)
        if (updatedItem !== originalItem) {
          const overrides = state.itemOverrides[updatedItem.temp_id] || [];
          if (!state.editedItems[updatedItem.temp_id]) {
            state.editedItems[updatedItem.temp_id] = {};
          }
          (['charge', 'labour_rate', 'tax'] as const).forEach((field) => {
            if (pricing[field] !== undefined && !overrides.includes(field)) {
              state.editedItems[updatedItem.temp_id][field] = updatedItem[field];
            }
          });
        }
      });

      state.items = updatedItems;

      // Recalculate header totals using extracted function
      const headerTotals = calculateHeaderTotals(updatedItems, state.header.discount);
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

    // Validation
    setValidationErrors: (state, action: PayloadAction<Record<string, string>>) => {
      state.validationErrors = action.payload;
    },
    setValidationError: (state, action: PayloadAction<{ field: string; message: string | null }>) => {
      if (action.payload.message) state.validationErrors[action.payload.field] = action.payload.message;
      else delete state.validationErrors[action.payload.field];
    },
    clearValidationError: (state, action: PayloadAction<string>) => {
      delete state.validationErrors[action.payload];
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
      const preservedInvNoTyped = state.header.inv_no_typed;
      const preservedInvDate = state.header.inv_date;
      const preservedInvFinYear = state.header.inv_fin_year;
      // An invoice (new, or an edit) moving to another GRN starts that GRN's invoice clean: the discount and the
      // reasons were about the goods of the GRN before. (The first load of a new invoice has no GRN before.)
      const anotherGrn = !!state.selected_gr_id && state.selected_gr_id !== action.payload.grId;
      const preservedDiscount = anotherGrn ? 0 : state.header.discount;
      // What goes with the discount stays with it (the same GRN loaded again): an invoice being edited
      // would otherwise forget the discount it was saved with, ask for a reason although nothing
      // changed, and show an empty reason field.
      const preservedDiscountRecord = anotherGrn
        ? {}
        : {
            discount_reason: state.header.discount_reason,
            saved_discount: state.header.saved_discount,
            saved_discount_reason: state.header.saved_discount_reason,
            discount_reason_edited: state.header.discount_reason_edited,
          };
      // The reason for a zero charge is about the goods of one GRN. It stays
      // with an invoice that is being edited (the stored reason, or the text
      // written in this edit) and when the same GRN is loaded again. In a new
      // invoice it goes with the GRN it was written for: carried over, it would
      // meet the staff rule for the next GRN's free lines with text about
      // other goods.
      const keepsZeroChargeReason = state.invoice_id !== null || state.selected_gr_id === action.payload.grId;
      const preservedZeroChargeReason = keepsZeroChargeReason ? state.header.zero_charge_reason : undefined;

      // The lines carry the GRN's pricing mode (`one_time`) and their amounts
      // are worked out here as the server works them out. The header flag only
      // reports that mode; it is not a switch and never changes a duration.
      // Each line is frozen here, as Immer would freeze it when the reducer ends. Immer skips a frozen
      // object at once; an unfrozen one it walks and freezes field by field (thousands of lines: ~100 ms+).
      const items = action.payload.items.map((item) => Object.freeze({
        ...item,
        ...calculateItemAmounts(item.qty, item.charge, item.labour_rate, item.tax, item.duration, item.one_time),
      }));
      const oneTimeCharge = items.length > 0 && items.every((item) => item.one_time === true);

      // Reset header completely to avoid stale data from previous GRN selection
      state.header = {
        ...createInitialHeader(),
        ...action.payload.header,
        // Preserve these fields that were already set by the user
        inv_no: preservedInvNo,
        inv_no_typed: preservedInvNoTyped,
        inv_date: preservedInvDate,
        inv_fin_year: preservedInvFinYear,
        one_time_charge: oneTimeCharge,
        discount: preservedDiscount,
        ...preservedDiscountRecord,
        zero_charge_reason: preservedZeroChargeReason,
      };
      state.items = items;
      state.selected_gr_id = action.payload.grId;
      state.editedItems = {};
      state.itemOverrides = {};
      state.bulkPricing = {};

      // Calculate initial totals with proper rounding
      Object.assign(state.header, calculateHeaderTotals(state.items, state.header.discount));
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

      // Replace entire header with loaded data (no preservation needed in edit mode).
      // Remember the stored discount: only a changed discount needs a new reason.
      state.header = {
        ...action.payload.header,
        discount_reason: action.payload.header.discount_reason || '',
        saved_discount: action.payload.header.discount || 0,
        saved_discount_reason: action.payload.header.discount_reason || '',
        discount_reason_edited: false,
        // The stored reason for a zero charge. It stays in the form, and is sent
        // back with the update, until the person changes it (see zeroChargeNeedsReason).
        zero_charge_reason: action.payload.header.zero_charge_reason || '',
        // As in loadInvoiceFormData: the flag reports how the lines are priced.
        one_time_charge:
          action.payload.items.length > 0 && action.payload.items.every((item) => item.one_time === true),
      };

      // Replace all items
      state.items = action.payload.items;

      // Set selected GR ID
      state.selected_gr_id = action.payload.grId;

      // Reset editing state (fresh start for edit mode)
      state.editedItems = {};
      state.itemOverrides = {};

      // No group rate has been applied yet. The group fields of the items step
      // show the rate the lines of a group share, or "Mixed" when they differ.
      // (An average of the stored rates used to be kept here, and the first
      // group edit gave it to every line: a free line beside a paid one became
      // paid, and its stored reason was dropped with the save.)
      state.bulkPricing = {};

      // Clear validation errors
      state.validationErrors = {};

      state.baseline = {
        fingerprint: invoiceFingerprint(state.header, state.items),
        inv_no: state.header.inv_no,
        inv_fin_year: state.header.inv_fin_year,
        gr_id: state.header.gr_id,
        header: { ...state.header },
        // Frozen copies: see loadInvoiceFormData.
        items: state.items.map((item) => Object.freeze({ ...item })),
      };
    },

    // An edit that moved to another GRN goes back to the GRN it was saved with: the saved lines, discount and
    // reasons return. The number, date and financial year the person set meanwhile are kept.
    restoreSavedGrn: (state) => {
      const saved = state.baseline;
      if (!saved) return;
      state.header = {
        ...saved.header,
        inv_no: state.header.inv_no,
        inv_no_typed: state.header.inv_no_typed,
        inv_date: state.header.inv_date,
        inv_fin_year: state.header.inv_fin_year,
      };
      state.items = saved.items.map((item) => ({ ...item }));
      state.selected_gr_id = saved.gr_id;
      state.editedItems = {};
      state.itemOverrides = {};
      state.bulkPricing = {};
      Object.assign(state.header, calculateHeaderTotals(state.items, state.header.discount));
    },

    // A new form. The session number goes up, so a screen that is already open
    // (step 1 under "Create another") sees that a new form was started.
    resetForm: (state) => {
      return createInitialState(state.formSession + 1);
    },

    // The invoice number requests. An answer counts only while its request is the
    // latest: typing a number, a reset or a newer request takes the place of it.
    numberRequested: (state, action: PayloadAction<number>) => {
      state.numberRequestId = action.payload;
      state.numberStatus = 'loading';
    },
    numberAnswered: (state, action: PayloadAction<{ id: number; number: number | null }>) => {
      if (action.payload.id !== state.numberRequestId) return;
      state.numberRequestId = 0;
      const { number } = action.payload;
      if (number !== null && number > 0) {
        state.header.inv_no = number;
        state.header.inv_no_typed = false;
        state.numberStatus = 'idle';
        // A message about a missing number no longer applies.
        delete state.validationErrors.inv_no;
      } else {
        // No number came: the field is emptied so that a number suggested for
        // another year does not stay, and the form asks for one to be typed.
        state.header.inv_no = 0;
        state.header.inv_no_typed = false;
        state.numberStatus = 'failed';
      }
    },
    // The wait is over without an answer (a number was typed).
    numberCancelled: (state) => {
      state.numberRequestId = 0;
      state.numberStatus = 'idle';
    },
  },
});

// Export actions
export const {
  setInvoiceId,
  updateHeader,
  setItems,
  updateEditedItem,
  bulkUpdateItemGroupPricing,
  applySavedRates,
  updateDiscount,
  setCurrentStep,
  setIsLoading,
  setIsSaving,
  setIsLoadingItems,
  setValidationErrors,
  setValidationError,
  clearValidationError,
  loadInvoiceFormData,
  loadInvoiceEditData,
  restoreSavedGrn,
  resetForm,
  numberRequested,
  numberAnswered,
  numberCancelled,
} = invoiceFormSlice.actions;

// ============================================================================
// SELECTORS
// ============================================================================

type SliceRoot = { invoiceForm: InvoiceFormSliceState };

export const selectInvoiceFormHeader = (state: SliceRoot) => state.invoiceForm.header;
export const selectInvoiceFormItems = (state: SliceRoot) => state.invoiceForm.items;
export const selectInvoiceFormEditedItems = (state: SliceRoot) => state.invoiceForm.editedItems;
export const selectInvoiceFormItemOverrides = (state: SliceRoot) => state.invoiceForm.itemOverrides;
export const selectInvoiceFormBulkPricing = (state: SliceRoot) => state.invoiceForm.bulkPricing;
export const selectInvoiceFormId = (state: SliceRoot) => state.invoiceForm.invoice_id;
export const selectInvoiceFormSession = (state: SliceRoot) => state.invoiceForm.formSession;
export const selectInvoiceNumberStatus = (state: SliceRoot) => state.invoiceForm.numberStatus;
export const selectInvoiceFormBaseline = (state: SliceRoot) => state.invoiceForm.baseline;

/**
 * Whether the invoice being edited differs from the saved one. False in a new
 * invoice (it has no saved copy; the screens ask what was entered instead).
 */
export const selectInvoiceFormChanged = createSelector(
  [selectInvoiceFormHeader, selectInvoiceFormItems, selectInvoiceFormBaseline],
  (header, items, baseline) => baseline !== null && invoiceFingerprint(header, items) !== baseline.fingerprint
);

export default invoiceFormSlice.reducer;
