/**
 * Dispatch Form Redux Slice
 * Manages state for the 3-step dispatch form wizard
 * Similar to grnFormSlice but adapted for dispatch-specific requirements
 */

import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import type {
  DispatchFormState,
  DispatchHeaderData,
  DispatchItemData,
  DispatchImageData,
  ItemFormData,
} from '@/types/dispatch.types';
import { EMPTY_DISPATCH_HEADER } from '@/types/dispatch.types';

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

const initialState: DispatchFormState & { snapshot: DispatchFormSnapshot | null } = {
  // IDs
  dispatch_id: null,

  // Form data
  header: EMPTY_DISPATCH_HEADER,
  items: [],
  images: [],

  // UI state
  current_step: 0,
  is_loading: false,
  is_saving: false,

  // Error state
  error: null,

  // Validation
  validationErrors: {},

  // #18 Fix: Snapshot for optimistic update rollback
  snapshot: null,
};

// ============================================================================
// SLICE
// ============================================================================

const dispatchFormSlice = createSlice({
  name: 'dispatchForm',
  initialState,
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
     * Set loading state
     */
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.is_loading = action.payload;
    },

    /**
     * Set saving state
     */
    setIsSaving: (state, action: PayloadAction<boolean>) => {
      state.is_saving = action.payload;
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
      }>
    ) => {
      const { dispatchId, header, items, images } = action.payload;
      state.dispatch_id = dispatchId;
      state.header = header;
      state.items = items.map(item => ({
        ...item,
        unique_id: item.unique_id || `item_${Date.now()}_${Math.random()}`,
      }));
      state.images = images || [];
      state.current_step = 0;
      state.validationErrors = {};
    },

    /**
     * Reset form to initial state
     * Called on mount, unmount, and after successful submission
     */
    resetForm: (state) => {
      state.dispatch_id = null;
      state.header = EMPTY_DISPATCH_HEADER;
      state.items = [];
      state.images = [];
      state.current_step = 0;
      state.is_loading = false;
      state.is_saving = false;
      state.validationErrors = {};
    },

    /**
     * Reset only form data, keep UI state
     */
    resetFormData: (state) => {
      state.dispatch_id = null;
      state.header = EMPTY_DISPATCH_HEADER;
      state.items = [];
      state.images = [];
      state.validationErrors = {};
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
      }>
    ) => {
      const { header, items, source_order_id } = action.payload;
      state.dispatch_id = null; // New dispatch, not editing
      state.header = {
        ...EMPTY_DISPATCH_HEADER,
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
          console.log('[DispatchFormSlice] Rolled back to snapshot after failed submission');
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
  setDispatchId,

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
  setIsLoading,
  setIsSaving,
  setError,
  clearError,

  // Validation actions
  setValidationErrors,
  clearValidationErrors,
  clearFieldError,

  // Bulk actions
  loadDispatchData,
  resetForm,
  resetFormData,
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
export const selectDispatchFormValidationErrors = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.validationErrors;
export const selectDispatchFormCurrentStep = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.current_step;
export const selectDispatchFormId = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.dispatch_id;
export const selectDispatchFormIsLoading = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.is_loading;
export const selectDispatchFormIsSaving = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.is_saving;
export const selectDispatchFormError = (state: { dispatchForm: DispatchFormState }) => state.dispatchForm.error;

/**
 * Memoized selector for dispatch totals - prevents re-renders when unrelated state changes
 */
export const selectDispatchFormTotals = createSelector(
  [selectDispatchFormItems],
  (items) => ({
    totalQty: items.reduce((sum, item) => sum + (item.disp_quantity || 0), 0),
    totalWeight: items.reduce((sum, item) => sum + (item.grnItems_weight || 0), 0),
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
