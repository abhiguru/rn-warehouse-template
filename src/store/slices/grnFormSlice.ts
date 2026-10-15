import { createSlice, PayloadAction, createSelector, original } from '@reduxjs/toolkit';

import { toLocalISODate } from '@/utils/formatters';
import { isTemporaryGRNImageId } from '@/features/grn/services/imageId';
import type { GrnRate, RateChange } from '@/features/grn/rates/types';
// Image data structure
export interface GRNImageData {
  id: string;
  fileName: string;
  imageUrl: string;
  storagePath?: string;
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadProgress?: number;
  progress?: number;
  error?: string;
  fileSize?: number;
  mimeType?: string;
  uploadTimestamp?: string;
}

// Header data structure
export interface GRNHeaderData {
  gr_no: string;
  registration: string;
  date: string;
  sender_id: string;
  sender_name: string;
  customer_id: string;
  customer_name: string;
  supervisor_id: string;
  supervisor_name: string;
  note: string;
  leon: boolean;
  pricing_mode: 'ONE_TIME' | 'MONTHLY';
  gr_images: GRNImageData[];
}

// Item data structure
export interface GRNItemData {
  grn_trl_id: string; // ID of the GRN item record in goodsreceived_trl table
  item_table_id: string; // ID referencing the item master in items table
  item_name: string;
  packaging: string;
  qty: number;
  stock: number;
  weight: number;
  rack: string;
  package_mark: string;
  trl_images: GRNImageData[]; // Multiple images per item (changed from single trl_image)
}

/**
 * A photo of the saved GRN that was removed in the form. Nothing is deleted on
 * the server until the GRN is saved; discarding the form forgets the list.
 */
export interface RemovedGRNImage {
  id: string;
  storagePath?: string;
}

// Snapshot for rollback support
interface GRNFormSnapshot {
  grnId: string | null;
  tempGrnId: string | null;
  header: GRNHeaderData;
  items: GRNItemData[];
}

// Form state
interface GRNFormState {
  // IDs
  grnId: string | null;
  tempGrnId: string | null;

  // Form data
  header: GRNHeaderData;
  items: GRNItemData[];

  // Saved photos removed in this edit; applied when the GRN is saved
  removedImages: RemovedGRNImage[];

  // Rates saved with the GRN (backend migration 86): the complete set for this GRN only (in edit mode
  // seeded from the server), and the changes of the item's rate that wait for the save.
  grnRates: GrnRate[];
  rateChanges: RateChange[];
  // The GRN being edited is invoiced: its rates are shown and sent back unchanged, nothing can be set.
  grnInvoiced: boolean;

  // UI state
  currentStep: number;
  isLoading: boolean;
  isSaving: boolean;

  // Error state for displaying save/load failures to user
  error: string | null;

  // An update was sent and no answer came back: the server is asked what it
  // holds before the next Save (see findLinesSavedByLostUpdate).
  saveUnconfirmed: boolean;

  // Message for a typed GRN number another GRN holds. Kept here, not in a
  // screen, so step 1 still refuses the number after it was left and reopened.
  takenNumberError: string | null;

  // Validation
  validationErrors: Record<string, string>;

  // #18 Fix: Snapshot for optimistic update rollback
  snapshot: GRNFormSnapshot | null;
}

// Initial state. Built when it is needed, not once when this file is loaded:
// the default date is "today", and the app can stay open past midnight.
const createInitialState = (): GRNFormState => ({
  grnId: null,
  tempGrnId: null,
  header: {
    gr_no: '',
    registration: '',
    date: toLocalISODate(new Date()),
    sender_id: '',
    sender_name: '',
    customer_id: '',
    customer_name: '',
    supervisor_id: '',
    supervisor_name: '',
    note: '',
    leon: false,
    pricing_mode: 'MONTHLY',
    gr_images: [],
  },
  items: [],
  removedImages: [],
  grnRates: [],
  rateChanges: [],
  grnInvoiced: false,
  currentStep: 0,
  isLoading: false,
  isSaving: false,
  error: null,
  saveUnconfirmed: false,
  takenNumberError: null,
  validationErrors: {},
  snapshot: null,
});

/** A removed photo that exists on the server (not a photo picked in this form) is kept for the save. */
const rememberRemovedImage = (state: GRNFormState, image: GRNImageData | undefined) => {
  if (!image || isTemporaryGRNImageId(image.id)) return;
  if (state.removedImages.some(removed => removed.id === image.id)) return;
  state.removedImages.push({ id: image.id, storagePath: image.storagePath });
};

/** Equal as stored: the same value, or arrays whose entries are equal field by field. */
const sameStoredValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => sameFields(entry, b[index]));
  }
  return false;
};
const sameFields = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aKeys = Object.keys(a);
  const bRecord = b as Record<string, unknown>;
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && (a as Record<string, unknown>)[key] === bRecord[key])
  );
};

/**
 * The stored lines after the items step: each given line replaces the stored
 * line with its id (merged over it, as `updateItem` does), or is added at the
 * end. A stored line whose given fields are all equal stays the same object,
 * and when nothing changes the same array is returned. Stored lines that are
 * not given stay as they are.
 */
export function reconcileGrnItems(stored: readonly GRNItemData[], given: readonly GRNItemData[]): GRNItemData[] {
  const indexById = new Map<string, number>();
  stored.forEach((item, index) => {
    if (!indexById.has(item.grn_trl_id)) indexById.set(item.grn_trl_id, index);
  });

  let result: GRNItemData[] | null = null;
  const added: GRNItemData[] = [];
  given.forEach((item) => {
    const index = indexById.get(item.grn_trl_id);
    if (index === undefined) {
      added.push(item);
      return;
    }
    const current = (result ?? stored)[index];
    const unchanged = (Object.keys(item) as (keyof GRNItemData)[]).every((key) => sameStoredValue(current[key], item[key]));
    if (unchanged) return;
    result ??= [...stored];
    result[index] = { ...current, ...item };
  });

  if (added.length > 0) result = [...(result ?? stored), ...added];
  return result ?? (stored as GRNItemData[]);
}

const grnFormSlice = createSlice({
  name: 'grnForm',
  initialState: createInitialState,
  reducers: {
    // ID management
    setGrnId: (state, action: PayloadAction<string | null>) => {
      state.grnId = action.payload;
    },
    setTempGrnId: (state, action: PayloadAction<string>) => {
      state.tempGrnId = action.payload;
    },

    // Header management
    updateHeader: (state, action: PayloadAction<Partial<GRNHeaderData>>) => {
      state.header = { ...state.header, ...action.payload };
    },

    // Item management
    addItem: (state, action: PayloadAction<GRNItemData>) => {
      state.items.push(action.payload);
    },
    updateItem: (state, action: PayloadAction<{ grn_trl_id: string; item: Partial<GRNItemData> }>) => {
      const index = state.items.findIndex(item => item.grn_trl_id === action.payload.grn_trl_id);
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...action.payload.item };
      }
    },
    // The items step's Next: every line of the step in one action (see reconcileGrnItems).
    reconcileItems: (state, action: PayloadAction<GRNItemData[]>) => {
      const stored = original(state.items) ?? state.items;
      const next = reconcileGrnItems(stored, action.payload);
      if (next !== stored) state.items = next;
    },
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item.grn_trl_id !== action.payload);
    },

    // Rates saved with the GRN (Review step)
    setGrnRates: (state, action: PayloadAction<GrnRate[]>) => {
      state.grnRates = action.payload;
    },
    setRateChanges: (state, action: PayloadAction<RateChange[]>) => {
      state.rateChanges = action.payload;
    },

    // Header image management
    addHeaderImage: (state, action: PayloadAction<GRNImageData>) => {
      state.header.gr_images.push(action.payload);
    },
    updateHeaderImageProgress: (state, action: PayloadAction<{ imageId: string; progress: number }>) => {
      const image = state.header.gr_images.find(img => img.id === action.payload.imageId);
      // A late progress report never turns a prepared photo back into one in progress.
      if (image && image.uploadStatus !== 'completed') {
        image.uploadProgress = action.payload.progress;
        image.uploadStatus = 'uploading';
      }
    },
    completeHeaderImageUpload: (state, action: PayloadAction<{ imageId: string; storagePath?: string; imageUrl?: string; fileSize?: number; mimeType?: string }>) => {
      const image = state.header.gr_images.find(img => img.id === action.payload.imageId);
      if (image) {
        if (action.payload.storagePath) {
          image.storagePath = action.payload.storagePath;
        }
        if (action.payload.imageUrl) {
          image.imageUrl = action.payload.imageUrl; // Update to compressed image URL
        }
        if (action.payload.fileSize !== undefined) {
          image.fileSize = action.payload.fileSize;
        }
        if (action.payload.mimeType) {
          image.mimeType = action.payload.mimeType;
        }
        image.uploadStatus = 'completed';
        image.uploadProgress = 100;
      }
    },
    failHeaderImageUpload: (state, action: PayloadAction<{ imageId: string; error: string }>) => {
      const image = state.header.gr_images.find(img => img.id === action.payload.imageId);
      if (image) {
        image.uploadStatus = 'failed';
        image.error = action.payload.error;
      }
    },
    removeHeaderImage: (state, action: PayloadAction<string>) => {
      const imageIdToRemove = action.payload;
      const imageToRemove = state.header.gr_images.find(img => img.id === imageIdToRemove);

      state.header.gr_images = state.header.gr_images.filter(img => img.id !== imageIdToRemove);
      rememberRemovedImage(state, imageToRemove);
    },

    // Item image management (supports multiple images per item)
    addItemImage: (state, action: PayloadAction<{ itemId: string; imageData: GRNImageData }>) => {
      const item = state.items.find(item => item.grn_trl_id === action.payload.itemId);
      if (item) {
        if (!item.trl_images) {
          item.trl_images = [];
        }
        item.trl_images.push(action.payload.imageData);
      }
    },
    updateItemImageProgress: (state, action: PayloadAction<{ itemId: string; imageId: string; progress: number }>) => {
      const item = state.items.find(item => item.grn_trl_id === action.payload.itemId);
      if (item && item.trl_images) {
        const image = item.trl_images.find(img => img.id === action.payload.imageId);
        if (image && image.uploadStatus !== 'completed') {
          image.uploadProgress = action.payload.progress;
          image.uploadStatus = 'uploading';
        }
      }
    },
    completeItemImageUpload: (state, action: PayloadAction<{ itemId: string; imageId: string; persistedImageId?: string; storagePath?: string; imageUrl?: string; fileSize?: number; mimeType?: string }>) => {
      const item = state.items.find(item => item.grn_trl_id === action.payload.itemId);
      if (item && item.trl_images) {
        const image = item.trl_images.find(img => img.id === action.payload.imageId);
        if (image) {
          if (action.payload.persistedImageId) {
            image.id = action.payload.persistedImageId;
          }
          if (action.payload.storagePath) {
            image.storagePath = action.payload.storagePath;
          }
          if (action.payload.imageUrl) {
            image.imageUrl = action.payload.imageUrl; // Update to compressed image URL
          }
          if (action.payload.fileSize !== undefined) {
            image.fileSize = action.payload.fileSize;
          }
          if (action.payload.mimeType) {
            image.mimeType = action.payload.mimeType;
          }
          image.uploadStatus = 'completed';
          image.uploadProgress = 100;
        }
      }
    },
    failItemImageUpload: (state, action: PayloadAction<{ itemId: string; imageId: string; error: string }>) => {
      const item = state.items.find(item => item.grn_trl_id === action.payload.itemId);
      if (item && item.trl_images) {
        const image = item.trl_images.find(img => img.id === action.payload.imageId);
        if (image) {
          image.uploadStatus = 'failed';
          image.error = action.payload.error;
        }
      }
    },
    removeItemImage: (state, action: PayloadAction<{ itemId: string; imageId: string }>) => {
      const item = state.items.find(item => item.grn_trl_id === action.payload.itemId);
      if (item && item.trl_images) {
        rememberRemovedImage(state, item.trl_images.find(img => img.id === action.payload.imageId));
        item.trl_images = item.trl_images.filter(img => img.id !== action.payload.imageId);
      }
    },
    /**
     * "Discard changes" on a saved line: its photos are put back as they were when
     * the line was opened, and none of them is deleted by the save any more.
     */
    restoreItemImages: (state, action: PayloadAction<{ itemId: string; images: GRNImageData[] }>) => {
      const item = state.items.find(item => item.grn_trl_id === action.payload.itemId);
      if (!item) return;
      item.trl_images = action.payload.images;
      const restored = new Set(action.payload.images.map(img => img.id));
      if (state.removedImages.some(removed => restored.has(removed.id))) {
        state.removedImages = state.removedImages.filter(removed => !restored.has(removed.id));
      }
    },

    // UI state management
    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setIsSaving: (state, action: PayloadAction<boolean>) => {
      state.isSaving = action.payload;
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
    setTakenNumberError: (state, action: PayloadAction<string | null>) => {
      state.takenNumberError = action.payload;
    },
    setSaveUnconfirmed: (state, action: PayloadAction<boolean>) => {
      state.saveUnconfirmed = action.payload;
    },
    /** Lines the form held as new that the server already has: local id -> saved id. */
    adoptSavedLines: (state, action: PayloadAction<Record<string, string>>) => {
      for (const item of state.items) {
        const savedId = action.payload[item.grn_trl_id];
        if (savedId) item.grn_trl_id = savedId;
      }
    },

    // Bulk operations
    loadGRNData: (state, action: PayloadAction<{ header: GRNHeaderData; items: GRNItemData[]; grnId: string; grnRates?: GrnRate[]; grnInvoiced?: boolean }>) => {
      state.header = action.payload.header;
      state.items = action.payload.items;
      state.grnId = action.payload.grnId;
      state.grnRates = action.payload.grnRates ?? [];
      state.rateChanges = [];
      state.grnInvoiced = action.payload.grnInvoiced === true;
      state.removedImages = [];
      state.saveUnconfirmed = false;
      state.takenNumberError = null;
    },
    resetForm: () => {
      return createInitialState();
    },

    // #18 Fix: Snapshot actions for optimistic update rollback
    /**
     * Save current form state before submission.
     * Call this before starting any save/update operation.
     */
    saveSnapshot: (state) => {
      state.snapshot = {
        grnId: state.grnId,
        tempGrnId: state.tempGrnId,
        header: JSON.parse(JSON.stringify(state.header)), // Deep clone
        items: JSON.parse(JSON.stringify(state.items)),   // Deep clone
      };
    },

    /**
     * Rollback to saved snapshot if submission fails.
     * Call this when save/update operation fails.
     */
    rollbackToSnapshot: (state) => {
      if (state.snapshot) {
        state.grnId = state.snapshot.grnId;
        state.tempGrnId = state.snapshot.tempGrnId;
        state.header = state.snapshot.header;
        state.items = state.snapshot.items;
        state.snapshot = null;
        state.isSaving = false;
        if (__DEV__) {
          console.log('[GRNFormSlice] Rolled back to snapshot after failed submission');
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

// Export actions
export const {
  setGrnId,
  setTempGrnId,
  updateHeader,
  addItem,
  updateItem,
  reconcileItems,
  removeItem,
  addHeaderImage,
  updateHeaderImageProgress,
  completeHeaderImageUpload,
  failHeaderImageUpload,
  removeHeaderImage,
  addItemImage,
  updateItemImageProgress,
  completeItemImageUpload,
  failItemImageUpload,
  removeItemImage,
  restoreItemImages,
  setCurrentStep,
  setIsLoading,
  setIsSaving,
  setError,
  clearError,
  setValidationErrors,
  clearValidationError,
  setTakenNumberError,
  setSaveUnconfirmed,
  adoptSavedLines,
  setGrnRates,
  setRateChanges,
  loadGRNData,
  resetForm,
  // #18 Fix: Snapshot actions for optimistic update rollback
  saveSnapshot,
  rollbackToSnapshot,
  clearSnapshot,
} = grnFormSlice.actions;

// ============================================================================
// SELECTORS
// ============================================================================

// Base selectors
export const selectGRNFormHeader = (state: { grnForm: GRNFormState }) => state.grnForm.header;
export const selectGRNFormItems = (state: { grnForm: GRNFormState }) => state.grnForm.items;
export const selectGRNFormId = (state: { grnForm: GRNFormState }) => state.grnForm.grnId;
export const selectGRNRates = (state: { grnForm: GRNFormState }) => state.grnForm.grnRates ?? EMPTY_RATES;
export const selectGRNRateChanges = (state: { grnForm: GRNFormState }) => state.grnForm.rateChanges ?? EMPTY_CHANGES;
export const selectGRNInvoiced = (state: { grnForm: GRNFormState }) => state.grnForm.grnInvoiced === true;
const EMPTY_RATES: GrnRate[] = [];
const EMPTY_CHANGES: RateChange[] = [];
export const selectGRNRemovedImages = (state: { grnForm: GRNFormState }) => state.grnForm.removedImages;
export const selectGRNSaveUnconfirmed = (state: { grnForm: GRNFormState }) => state.grnForm.saveUnconfirmed === true;
export const selectGRNTakenNumberError = (state: { grnForm: GRNFormState }) => state.grnForm.takenNumberError ?? null;
export const selectGRNTempId = (state: { grnForm: GRNFormState }) => state.grnForm.tempGrnId;
export const selectGRNFormValidationErrors = (state: { grnForm: GRNFormState }) => state.grnForm.validationErrors;
export const selectGRNFormCurrentStep = (state: { grnForm: GRNFormState }) => state.grnForm.currentStep;
export const selectGRNFormIsLoading = (state: { grnForm: GRNFormState }) => state.grnForm.isLoading;
export const selectGRNFormIsSaving = (state: { grnForm: GRNFormState }) => state.grnForm.isSaving;
export const selectGRNFormError = (state: { grnForm: GRNFormState }) => state.grnForm.error;

// Memoized selectors (2025 React Native best practice - prevents unnecessary re-renders)
export const selectGRNFormTotals = createSelector(
  [selectGRNFormItems],
  (items) => ({
    totalQty: items.reduce((sum, item) => sum + (item.qty || 0), 0),
    itemCount: items.length,
  })
);

export const selectGRNFormHasItems = createSelector(
  [selectGRNFormItems],
  (items) => items.length > 0
);

export const selectGRNFormHeaderImages = createSelector(
  [selectGRNFormHeader],
  (header) => header.gr_images || []
);

export const selectGRNFormAllImages = createSelector(
  [selectGRNFormHeader, selectGRNFormItems],
  (header, items) => {
    const headerImages = header.gr_images || [];
    const itemImages = items.flatMap(item => item.trl_images || []);
    return [...headerImages, ...itemImages];
  }
);

export const selectGRNFormPendingUploads = createSelector(
  [selectGRNFormAllImages],
  (allImages) => allImages.filter(img => img.uploadStatus === 'uploading' || img.uploadStatus === 'pending')
);

export const selectGRNFormHasPendingUploads = createSelector(
  [selectGRNFormPendingUploads],
  (pendingUploads) => pendingUploads.length > 0
);

export const selectGRNFormIsValid = createSelector(
  [selectGRNFormHeader, selectGRNFormItems, selectGRNFormValidationErrors],
  (header, items, errors) => {
    const hasRequiredHeader = !!(header.customer_id && header.supervisor_id);
    const hasItems = items.length > 0;
    const hasNoErrors = Object.keys(errors).length === 0;
    return hasRequiredHeader && hasItems && hasNoErrors;
  }
);

export default grnFormSlice.reducer;
