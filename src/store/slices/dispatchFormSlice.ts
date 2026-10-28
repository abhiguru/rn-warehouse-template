/**
 * Dispatch Form Redux Slice
 * Manages state for the 3-step dispatch form wizard
 * Similar to grnFormSlice but adapted for dispatch-specific requirements
 */

import { createLogger } from '@/utils/logger';
import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import type {
  DispatchFormState,
  DispatchHeaderData,
  DispatchItemData,
  DispatchImageData,
  ItemFormData,
  OrderLotAsk,
} from '@/types/dispatch.types';
import { createEmptyDispatchHeader } from '@/types/dispatch.types';
import { mergeOrderIntoDispatchItems, orderLotsOfItems } from '@/utils/orderToDispatchConverter';

const dispatchFormLogger = createLogger('DispatchFormSlice');

// ============================================================================
// SNAPSHOT TYPE FOR ROLLBACK
// ============================================================================

interface DispatchFormSnapshot {
  dispatch_id: string | null;
  header: DispatchHeaderData;
  items: DispatchItemData[];
  images: DispatchImageData[];
}

// ============================================================================
// INITIAL STATE
// ============================================================================

// Built when it is needed: the default dispatch date is "now", and the app can
// stay open past midnight.
const createInitialState = (): DispatchFormState & { snapshot: DispatchFormSnapshot | null } => ({
  // IDs
  dispatch_id: null,

  // Form data
  header: createEmptyDispatchHeader(),
  items: [],
  images: [],

  // UI state
  current_step: 0,
  is_saving: false,

  // Error state
  error: null,

  // Validation
  validationErrors: {},
  takenNumberError: null,

  // What a form is, apart from its data (see DispatchFormState)
  submissionNonce: null,
  dateChosenByUser: false,
  dispNoTyped: false,
  savedDispatchId: null,
  checkingAnswer: false,
  heldBags: {},
  loadedUpdatedAt: null,
  invoicedNumber: null,
  loadedDateNumber: null,
  dateRefusal: null,
  orderLots: null,

  // #18 Fix: Snapshot for optimistic update rollback
  snapshot: null,
});

/**
 * What a dispatch that was read gives to the form besides its header and its lines (shared by `loadDispatchData` and
 * `reloadDispatchData`): the bags each lot held when it was read (the server gives them back on a save, so a lot's
 * stock limit is its stock plus these; not changed while the dispatch is edited, so an item changed to another lot and
 * back still finds them), the version token (D1), the invoice lock (D2), and the date and number as read (put back when
 * the server says they are locked; the date rules (D25) compare the day with this one).
 */
function holdWhatWasRead(
  state: DispatchFormState,
  header: DispatchHeaderData,
  items: DispatchItemData[],
  updatedAt: string | null | undefined,
  invoicedNumber: string | null | undefined
): void {
  const held: Record<string, number> = {};
  for (const item of items) {
    if (!item.grnItems_id) continue;
    held[item.grnItems_id] = (held[item.grnItems_id] ?? 0) + (item.original_disp_quantity ?? item.disp_quantity ?? 0);
  }
  state.heldBags = held;
  state.loadedUpdatedAt = updatedAt ?? null;
  state.invoicedNumber = invoicedNumber ?? null;
  state.loadedDateNumber = { disp_no: header.disp_no, disp_date: header.disp_date };
  state.dateRefusal = null;
  state.orderLots = null;
}

// ============================================================================
// SLICE
// ============================================================================

const dispatchFormSlice = createSlice({
  name: 'dispatchForm',
  initialState: createInitialState,
  reducers: {
    // ========================================================================
    // HEADER ACTIONS
    // ========================================================================

    /**
     * Update header data (partial update supported)
     */
    updateHeader: (state, action: PayloadAction<Partial<DispatchHeaderData>>) => {
      state.header = {
        ...state.header,
        ...action.payload,
      };
      // A date that was set is the person's choice: the form no longer follows the clock.
      if (action.payload.disp_date !== undefined) {
        state.dateChosenByUser = true;
        // A date the server refused is not the date any more.
        state.dateRefusal = null;
      }
    },

    /**
     * A new form opens on the day it opens, unless the person already picked a date. The
     * form can outlive the day it was made on (the app stays open overnight).
     */
    refreshDefaultDate: (state, action: PayloadAction<string>) => {
      if (!state.dateChosenByUser) state.header.disp_date = action.payload;
    },

    /** The person typed the dispatch number (a number the form fetched itself is not typed). */
    markDispNoTyped: (state) => {
      state.dispNoTyped = true;
    },

    /** The id that tells this form's create from another form's with the same fields (see DispatchFormState). */
    setSubmissionNonce: (state, action: PayloadAction<string | null>) => {
      state.submissionNonce = action.payload;
    },

    /** This form created a dispatch: it is finished, and the next create gets a new nonce. */
    formCreated: (state, action: PayloadAction<string>) => {
      state.savedDispatchId = action.payload;
      state.submissionNonce = null;
    },

    /**
     * Set dispatch ID after creation
     */
    setDispatchId: (state, action: PayloadAction<string>) => {
      state.dispatch_id = action.payload;
    },

    // ========================================================================
    // ITEM ACTIONS
    // ========================================================================

    /**
     * Add a new dispatch item
     * Generates unique_id if not provided
     * Validates disp_quantity to prevent negative values
     * Prevents duplicate items (same grnItems_id) - replaces quantity if exists
     */
    addItem: (state, action: PayloadAction<DispatchItemData>) => {
      // Check for duplicate - same lot (grnItems_id) already exists
      const existingItem = state.items.find(
        existing => existing.grnItems_id === action.payload.grnItems_id
      );
      if (existingItem) {
        // Replace existing item's quantity (not add) to prevent double-dispatch
        existingItem.disp_quantity = Math.max(0, action.payload.disp_quantity || 0);
        return;
      }

      const item = {
        ...action.payload,
        unique_id: action.payload.unique_id || `item_${Date.now()}_${Math.random()}`,
        disp_quantity: Math.max(0, action.payload.disp_quantity || 0),
      };
      state.items.push(item);
    },

    /**
     * Add multiple items at once
     * Validates disp_quantity to prevent negative values
     * Prevents duplicate items (same grnItems_id) - replaces quantity if exists
     */
    addItems: (state, action: PayloadAction<DispatchItemData[]>) => {
      action.payload.forEach(newItem => {
        const existingItem = state.items.find(
          existing => existing.grnItems_id === newItem.grnItems_id
        );
        if (existingItem) {
          // Replace existing item's quantity (not add) to prevent double-dispatch
          existingItem.disp_quantity = Math.max(0, newItem.disp_quantity || 0);
        } else {
          state.items.push({
            ...newItem,
            unique_id: newItem.unique_id || `item_${Date.now()}_${Math.random()}`,
            disp_quantity: Math.max(0, newItem.disp_quantity || 0),
          });
        }
      });
    },

    /**
     * Update an existing item by unique_id
     * Validates disp_quantity to prevent negative values
     */
    updateItem: (
      state,
      action: PayloadAction<{ uniqueId: string; updates: Partial<DispatchItemData> }>
    ) => {
      const { uniqueId, updates } = action.payload;
      const index = state.items.findIndex(item => item.unique_id === uniqueId);
      if (index !== -1) {
        // Validate disp_quantity - ensure it's not negative
        const validatedUpdates = { ...updates };
        if (validatedUpdates.disp_quantity !== undefined) {
          validatedUpdates.disp_quantity = Math.max(0, validatedUpdates.disp_quantity);
        }
        state.items[index] = {
          ...state.items[index],
          ...validatedUpdates,
        };
      }
    },

    /**
     * Remove an item by unique_id
     */
    removeItem: (state, action: PayloadAction<string>) => {
      const uniqueId = action.payload;
      state.items = state.items.filter(item => item.unique_id !== uniqueId);
    },

    /**
     * Replace all items (used when loading saved items in Step 2)
     */
    replaceItems: (state, action: PayloadAction<DispatchItemData[]>) => {
      state.items = action.payload.map(item => ({
        ...item,
        unique_id: item.unique_id || `item_${Date.now()}_${Math.random()}`,
      }));
    },

    /**
     * Clear all items
     */
    clearItems: (state) => {
      state.items = [];
    },

    // ========================================================================
    // IMAGE ACTIONS
    // ========================================================================

    /**
     * Add a new image (when upload starts)
     */
    addImage: (state, action: PayloadAction<DispatchImageData>) => {
      state.images.push(action.payload);
    },

    /**
     * Update image upload progress
     */
    updateImageProgress: (
      state,
      action: PayloadAction<{ id: string; progress: number }>
    ) => {
      const { id, progress } = action.payload;
      const image = state.images.find(img => img.id === id);
      if (image) {
        image.upload_progress = progress;
      }
    },

    /**
     * Update image status after upload completes
     */
    updateImageStatus: (
      state,
      action: PayloadAction<{
        id: string;
        status: 'uploading' | 'completed' | 'failed' | 'pending';
        imageUrl?: string;
        storagePath?: string;
        newId?: string;
      }>
    ) => {
      const { id, status, imageUrl, storagePath, newId } = action.payload;
      const image = state.images.find(img => img.id === id);
      if (image) {
        image.upload_status = status;
        if (imageUrl) image.image_url = imageUrl;
        if (storagePath) image.storage_path = storagePath;
        if (newId) image.id = newId;
      }
    },

    /**
     * Remove an image by ID
     */
    removeImage: (state, action: PayloadAction<string>) => {
      state.images = state.images.filter(img => img.id !== action.payload);
    },

    /**
     * Clear all images
     */
    clearImages: (state) => {
      state.images = [];
    },

    // ========================================================================
    // UI STATE ACTIONS
    // ========================================================================

    /**
     * Set current step (0-based)
     */
    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.current_step = action.payload;
    },

    /**
     * Set saving state
     */
    setIsSaving: (state, action: PayloadAction<boolean>) => {
      state.is_saving = action.payload;
    },

    /**
     * A save or create got no answer and the app is asking the server what became of it: the form is locked (no
     * edits, no way out but the X with its warning) until the server's answer is known.
     */
    setCheckingAnswer: (state, action: PayloadAction<boolean>) => {
      state.checkingAnswer = action.payload;
    },

    /**
     * Set error message for display to user
     */
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },

    /**
     * Clear error message
     */
    clearError: (state) => {
      state.error = null;
    },

    // ========================================================================
    // VALIDATION ACTIONS
    // ========================================================================

    /**
     * Set validation errors
     */
    setValidationErrors: (state, action: PayloadAction<Record<string, string>>) => {
      state.validationErrors = action.payload;
    },

    /** The message for a typed number another dispatch holds; null when the number changes. */
    setTakenNumberError: (state, action: PayloadAction<string | null>) => {
      state.takenNumberError = action.payload;
    },

    /**
     * Clear validation errors
     */
    clearValidationErrors: (state) => {
      state.validationErrors = {};
    },

    /**
     * Clear specific field error
     */
    clearFieldError: (state, action: PayloadAction<string>) => {
      const field = action.payload;
      if (state.validationErrors[field]) {
        delete state.validationErrors[field];
      }
    },

    // ========================================================================
    // BULK ACTIONS
    // ========================================================================

    /**
     * Load dispatch data (for editing mode - future)
     */
    loadDispatchData: (
      state,
      action: PayloadAction<{
        dispatchId: string;
        header: DispatchHeaderData;
        items: DispatchItemData[];
        images?: DispatchImageData[];
        /** The dispatch's `updated_at` as read (wave B, D1); absent on a server that does not send it. */
        updatedAt?: string | null;
        /** The number of the live invoice a line is on (wave B, D2); null or absent when there is none. */
        invoicedNumber?: string | null;
      }>
    ) => {
      const { dispatchId, header, items, images, updatedAt, invoicedNumber } = action.payload;
      state.dispatch_id = dispatchId;
      state.header = header;
      state.items = items.map(item => ({
        ...item,
        unique_id: item.unique_id || `item_${Date.now()}_${Math.random()}`,
      }));
      state.images = images || [];
      state.current_step = 0;
      state.validationErrors = {};
      state.submissionNonce = null;
      state.savedDispatchId = null;
      state.checkingAnswer = false;
      holdWhatWasRead(state, header, items, updatedAt, invoicedNumber);
    },

    /**
     * The dispatch was read again after the server said someone else changed it (wave B, D1: "Open it again"). The
     * header, the lines, the bags the dispatch holds, the version token and the invoice lock are the server's now;
     * what was typed is replaced. The step the person is on and the photos are not touched.
     */
    reloadDispatchData: (
      state,
      action: PayloadAction<{
        dispatchId: string;
        header: DispatchHeaderData;
        items: DispatchItemData[];
        updatedAt?: string | null;
        invoicedNumber?: string | null;
      }>
    ) => {
      const { dispatchId, header, items, updatedAt, invoicedNumber } = action.payload;
      state.dispatch_id = dispatchId;
      state.header = header;
      state.items = items.map(item => ({
        ...item,
        unique_id: item.unique_id || `item_${Date.now()}_${Math.random()}`,
      }));
      state.validationErrors = {};
      state.takenNumberError = null;
      state.snapshot = null;
      holdWhatWasRead(state, header, items, updatedAt, invoicedNumber);
    },

    /** A save was accepted: the dispatch's new `updated_at` is the token of the next save of this form (wave B, D1). */
    setLoadedUpdatedAt: (state, action: PayloadAction<string | null>) => {
      state.loadedUpdatedAt = action.payload;
    },

    /**
     * The server says the dispatch is on an invoice (wave B, D2), which happened after the form read it: its date and
     * number are locked from now on, and the ones the person typed are put back to the ones that were read (a locked
     * field must not keep a value the server will never accept).
     */
    lockForInvoice: (state, action: PayloadAction<string>) => {
      state.invoicedNumber = action.payload;
      state.takenNumberError = null;
      if (state.loadedDateNumber) {
        state.header.disp_no = state.loadedDateNumber.disp_no;
        state.header.disp_date = state.loadedDateNumber.disp_date;
      }
    },

    /** The message of the server's refusal of the dispatch date, for step 1 to show; null to clear it. */
    setDateRefusal: (state, action: PayloadAction<string | null>) => {
      state.dateRefusal = action.payload;
    },

    /**
     * Reset form to initial state
     * Called on mount, unmount, and after successful submission
     */
    // A full reset also drops rollback data and errors from the old warehouse.
    resetForm: () => createInitialState(),

    /**
     * Reset only form data, keep UI state
     */
    resetFormData: (state) => {
      state.dispatch_id = null;
      state.header = createEmptyDispatchHeader();
      state.items = [];
      state.images = [];
      state.validationErrors = {};
      state.submissionNonce = null;
      state.dateChosenByUser = false;
      state.dispNoTyped = false;
      state.savedDispatchId = null;
      state.checkingAnswer = false;
      state.heldBags = {};
      state.loadedUpdatedAt = null;
      state.invoicedNumber = null;
      state.loadedDateNumber = null;
      state.dateRefusal = null;
      state.orderLots = null;
    },

    /**
     * Load dispatch form data from an order (pre-populate for order-to-dispatch flow)
     * Does NOT set dispatch_id since this is a new dispatch being created
     */
    loadFromOrder: (
      state,
      action: PayloadAction<{
        header: Partial<DispatchHeaderData>;
        items: DispatchItemData[];
        source_order_id: string;
        /** What the order asked of each lot (D5); worked out from the lines when the caller has none. */
        orderLots?: Record<string, OrderLotAsk>;
      }>
    ) => {
      const { header, items, source_order_id, orderLots } = action.payload;
      state.dispatch_id = null; // New dispatch, not editing
      state.header = {
        ...createEmptyDispatchHeader(),
        ...header,
        source_order_id,
      };
      state.items = items.map(item => ({
        ...item,
        unique_id: item.unique_id || `item_${Date.now()}_${Math.random()}`,
      }));
      state.images = [];
      state.current_step = 0;
      state.validationErrors = {};
      state.submissionNonce = null;
      state.dateChosenByUser = false;
      state.dispNoTyped = false;
      state.savedDispatchId = null;
      state.checkingAnswer = false;
      state.heldBags = {};
      state.loadedUpdatedAt = null;
      state.invoicedNumber = null;
      state.loadedDateNumber = null;
      state.dateRefusal = null;
      state.orderLots = orderLots ?? orderLotsOfItems(items);
    },

    /**
     * The order the form was made from changed after it was opened (wave B, D5): its lines were read again and are
     * merged into the form (`mergeOrderIntoDispatchItems`). A lot that is still on the order keeps the quantity the
     * person changed, at most its stock, and takes the order's new default when the quantity is still the one the form
     * was given; a lot that was taken from the order and is no longer on it is dropped; a lot new on the order comes in
     * with its default quantity; a lot the person removed does not come back. Lots the person added by hand are not the
     * order's and stay. What the order asks now replaces what it asked, and the order's new `updated_at` replaces the
     * old one, so the next create is checked against what the form now shows.
     */
    reloadFromOrder: (
      state,
      action: PayloadAction<{
        items: DispatchItemData[];
        source_order_updated_at?: string;
        /** What the order asks of each lot now (D5); worked out from the lines when the caller has none. */
        orderLots?: Record<string, OrderLotAsk>;
      }>
    ) => {
      const { items, source_order_updated_at, orderLots } = action.payload;
      state.items = mergeOrderIntoDispatchItems(state.items, items, state.orderLots);
      state.orderLots = orderLots ?? orderLotsOfItems(items);
      state.header.source_order_updated_at = source_order_updated_at;
      state.validationErrors = {};
    },

    // #18 Fix: Snapshot actions for optimistic update rollback
    /**
     * Save current form state before submission.
     * Call this before starting any save/update operation.
     */
    saveSnapshot: (state) => {
      state.snapshot = {
        dispatch_id: state.dispatch_id,
        header: JSON.parse(JSON.stringify(state.header)),
        items: JSON.parse(JSON.stringify(state.items)),
        images: JSON.parse(JSON.stringify(state.images)),
      };
    },

    /**
     * Rollback to saved snapshot if submission fails.
     * Call this when save/update operation fails.
     */
    rollbackToSnapshot: (state) => {
      if (state.snapshot) {
        state.dispatch_id = state.snapshot.dispatch_id;
        state.header = state.snapshot.header;
        state.items = state.snapshot.items;
        state.images = state.snapshot.images;
        state.snapshot = null;
        state.is_saving = false;
        if (__DEV__) {
          dispatchFormLogger.info('Rolled back to snapshot after failed submission');
        }
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

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  // Header actions
  updateHeader,
  refreshDefaultDate,
  markDispNoTyped,
  setDispatchId,
  setSubmissionNonce,
  formCreated,

  // Item actions
  addItem,
  addItems,
  updateItem,
  removeItem,
  replaceItems,
  clearItems,

  // Image actions
  addImage,
  updateImageProgress,
  updateImageStatus,
  removeImage,
  clearImages,

  // UI state actions
  setCurrentStep,
  setIsSaving,
  setCheckingAnswer,
  setError,
  clearError,

  // Validation actions
  setValidationErrors,
  clearValidationErrors,
  clearFieldError,

  // Bulk actions
  loadDispatchData,
  reloadDispatchData,
  setLoadedUpdatedAt,
  lockForInvoice,
  setDateRefusal,
  reloadFromOrder,
  resetForm,
  resetFormData,
  setTakenNumberError,
  loadFromOrder,

  // #18 Fix: Snapshot actions for optimistic update rollback
  saveSnapshot,
  rollbackToSnapshot,
  clearSnapshot,
} = dispatchFormSlice.actions;

export default dispatchFormSlice.reducer;

// ============================================================================
// SELECTORS (optional, for convenience)
// ============================================================================

/**
 * Selector to check if form has any data entered
 */
export const selectHasFormData = (state: { dispatchForm: DispatchFormState }): boolean => {
  const { header, items } = state.dispatchForm;
  return (
    header.disp_no !== '' ||
    header.registration !== '' ||
    header.customer_id !== '' ||
    header.note !== '' ||
    items.length > 0
  );
};

/**
 * Selector to get item count
 */
export const selectItemCount = (state: { dispatchForm: DispatchFormState }): number => {
  return state.dispatchForm.items.length;
};

/**
 * Selector to check for validation errors
 */
export const selectHasValidationErrors = (state: { dispatchForm: DispatchFormState }): boolean => {
  return Object.keys(state.dispatchForm.validationErrors).length > 0;
};

/**
 * Selector to check if form is ready to submit
 */
export const selectIsReadyToSubmit = (state: { dispatchForm: DispatchFormState }): boolean => {
  const { header, items, validationErrors } = state.dispatchForm;

  const hasRequiredHeader =
    header.disp_no &&
    header.disp_date &&
    header.registration &&
    header.customer_id &&
    header.supervisor_id;

  const hasItems = items.length > 0;
  const hasNoErrors = Object.keys(validationErrors).length === 0;

  return Boolean(hasRequiredHeader && hasItems && hasNoErrors);
};

// ============================================================================
// MEMOIZED SELECTORS (2025 React Native best practice)
// ============================================================================

// Base selectors for memoization
const selectDispatchFormState = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm;
export const selectDispatchFormHeader = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.header;
export const selectDispatchFormItems = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.items;
export const selectDispatchFormImages = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.images;
export const selectDispatchDispNoTyped = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.dispNoTyped === true;
export const selectDispatchTakenNumberError = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.takenNumberError ?? null;
export const selectDispatchFormValidationErrors = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.validationErrors;
export const selectDispatchFormCurrentStep = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.current_step;
export const selectDispatchFormId = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.dispatch_id;
export const selectDispatchFormIsSaving = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.is_saving;
/** The form is locked while the app asks the server what became of a save that got no answer. */
export const selectDispatchCheckingAnswer = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.checkingAnswer === true;
export const selectDispatchFormError = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.error;

/**
 * Memoized selector for dispatch totals - prevents re-renders when unrelated state changes
 */
export const selectDispatchFormTotals = createSelector(
  [selectDispatchFormItems],
  (items) => ({
    totalQty: items.reduce((sum, item) => sum + (item.disp_quantity || 0), 0),
    itemCount: items.length,
  })
);

/**
 * Memoized selector for unique GRNs in dispatch items
 */
export const selectDispatchUniqueGRNs = createSelector(
  [selectDispatchFormItems],
  (items) => {
    const grnIds = new Set(items.map(item => item.grns_id).filter(Boolean));
    return Array.from(grnIds);
  }
);

/**
 * Memoized selector for items grouped by GRN
 */
export const selectDispatchItemsByGRN = createSelector(
  [selectDispatchFormItems],
  (items) => {
    const grouped = new Map<string, DispatchItemData[]>();
    items.forEach(item => {
      const grnId = item.grns_id || 'unknown';
      const existing = grouped.get(grnId);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(grnId, [item]);
      }
    });
    return grouped;
  }
);

/**
 * Memoized selector for pending image uploads
 */
export const selectDispatchPendingUploads = createSelector(
  [selectDispatchFormImages],
  (images) => images.filter(img => img.upload_status === 'uploading' || img.upload_status === 'pending')
);

/**
 * Memoized selector to check if there are pending uploads
 */
export const selectDispatchHasPendingUploads = createSelector(
  [selectDispatchPendingUploads],
  (pendingUploads) => pendingUploads.length > 0
);
