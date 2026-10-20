import { createLogger } from '@/utils/logger';
import { createSlice, PayloadAction, createSelector, original } from '@reduxjs/toolkit';

import { toLocalISODate } from '@/utils/formatters';
import { isTemporaryGRNImageId } from '@/features/grn/services/imageId';
import type { GrnRate, RateChange } from '@/features/grn/rates/types';

const grnFormLogger = createLogger('GRNFormSlice');
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

/**
 * What locks a saved line, as `get_grn_edit_state` says it when the GRN is opened for editing (backend migration 121).
 * A line has none on a server that does not have that function (the app then falls back on its older rules).
 */
export interface GRNLineLocks {
  /** Dispatch lines point at this lot: its item and packing are locked. */
  dispatched: boolean;
  /** The bags dispatched from the lot. */
  dispatchedQty: number;
  /** A dispatch line or a stock movement exists for the lot: the line can't be removed. */
  hasHistory: boolean;
  /** The lot is on a live invoice: item, packing and weight are locked. */
  invoiced: boolean;
  /** The number of that invoice, as the app writes invoice numbers. */
  invoiceNo?: string;
  /** The lot is on a customer's order: the line can't be removed. */
  onOrder: boolean;
  /** The customer whose order it is (the GRN's customer). */
  customerName?: string;
}

/** The live invoice of the GRN being edited (`get_grn_edit_state`). */
export interface GRNInvoiceRef {
  id: string;
  /** The invoice number, as the app writes invoice numbers. */
  invNo: string;
  finYear?: string;
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
  /** Edit only: what locks this saved line (see GRNLineLocks). Never sent to the server. */
  locks?: GRNLineLocks;
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

  // Form-session nonce: null until the first Create of this form makes one (a random id), then kept for every
  // retry of the same form. A reset (also the one after a successful save) clears it, so the next form makes its
  // own. It goes into what the create's idempotency key hashes and never into the RPC body, so the same GRN
  // entered again after a delete does not meet the key of the deleted one (contract item 11). It is null in the
  // initial state so that a reset form equals a fresh one.
  submissionNonce: string | null;

  // The GRN number was typed by the person (not offered by the form): when another GRN holds it at Create, the
  // form does not replace it with the next free number.
  grNoTyped: boolean;

  // The edit form as it was loaded (a signature of what a save would change): Back on the first step asks before
  // it throws away edits only when the form differs from this. Null for a new GRN.
  loadedSignature: string | null;

  // Edit only, from get_grn_edit_state (backend migration 121), read before the rows so that a change made in between
  // makes the token older, never newer. All null on a server that does not have it (the app then sends no token).
  // `loadedUpdatedAt` is the GRN's version token: Save sends it back as `p_expected_updated_at`.
  loadedUpdatedAt: string | null;
  // The GRN's live invoice: its date and a new line are locked while it exists.
  invoice: GRNInvoiceRef | null;
  // The day (YYYY-MM-DD) of the earliest dispatch from any lot: the GRN may not be dated after it.
  firstDispatchDate: string | null;
  // The GRN's date as it was loaded: a date that was already after the first dispatch is refused only when it is changed.
  loadedDate: string | null;

  // Form data
  header: GRNHeaderData;
  items: GRNItemData[];

  // Saved photos removed in this edit; applied when the GRN is saved
  removedImages: RemovedGRNImage[];

  // Rates saved with the GRN (backend migration 86): the complete set for this GRN only (in edit mode
  // seeded from the server), and the changes of the item's rate that wait for the save.
  grnRates: GrnRate[];
  rateChanges: RateChange[];
  // Saved rates for this GRN only that Remove took out of grnRates, kept so Undo remove can put them back before
  // the save (owner, 2026-10-17).
  removedGrnRates: GrnRate[];
  // The GRN being edited is invoiced: its rates are shown and sent back unchanged, nothing can be set.
  grnInvoiced: boolean;

  // UI state
  currentStep: number;
  isLoading: boolean;
  isSaving: boolean;

  // Error state for displaying save/load failures to user
  error: string | null;

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
  submissionNonce: null,
  grNoTyped: false,
  loadedSignature: null,
  loadedUpdatedAt: null,
  invoice: null,
  firstDispatchDate: null,
  loadedDate: null,
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
  removedGrnRates: [],
  grnInvoiced: false,
  currentStep: 0,
  isLoading: false,
  isSaving: false,
  error: null,
  takenNumberError: null,
  validationErrors: {},
  snapshot: null,
});

/**
 * What a save of the form would send, as one string: the header, the lines, the photos by id, the photos and rates
 * taken out, and the rates set. The edit form is "changed" when this differs from the one made when it was loaded.
 * Photo upload progress and errors are not part of it.
 */
const formSignature = (
  state: Pick<GRNFormState, 'header' | 'items' | 'removedImages' | 'grnRates' | 'rateChanges' | 'removedGrnRates'>
): string => {
  const { gr_images: headerImages, ...header } = state.header;
  return JSON.stringify([
    header,
    (headerImages ?? []).map(image => image.id),
    state.items.map(item => [
      item.grn_trl_id,
      item.item_table_id,
      item.packaging,
      item.qty,
      item.weight,
      item.rack,
      item.package_mark,
      (item.trl_images ?? []).map(image => image.id),
    ]),
    state.removedImages.map(image => image.id),
    state.grnRates,
    state.rateChanges,
    state.removedGrnRates,
  ]);
};

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
      // A saved line goes with its photos (the server deletes their rows with the line): their files are
      // removed after the save, so each saved photo of the line is kept in removedImages. Photos picked in
      // this form have no saved file and are skipped by rememberRemovedImage.
      const removed = state.items.find(item => item.grn_trl_id === action.payload);
      (removed?.trl_images ?? []).forEach(image => rememberRemovedImage(state, image));
      state.items = state.items.filter(item => item.grn_trl_id !== action.payload);
    },

    // Rates saved with the GRN (Review step)
    setGrnRates: (state, action: PayloadAction<GrnRate[]>) => {
      state.grnRates = action.payload;
    },
    setRateChanges: (state, action: PayloadAction<RateChange[]>) => {
      state.rateChanges = action.payload;
    },
    setRemovedGrnRates: (state, action: PayloadAction<GrnRate[]>) => {
      state.removedGrnRates = action.payload;
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
    /** The form's session id, made by the first Create of the form and kept for its retries (see `submissionNonce`). */
    setSubmissionNonce: (state, action: PayloadAction<string | null>) => {
      state.submissionNonce = action.payload;
    },
    /** The number in the form was typed by the person (true) or offered by the form (false). */
    setGrNoTyped: (state, action: PayloadAction<boolean>) => {
      state.grNoTyped = action.payload;
    },

    /** A refusal said the first dispatch is on another day than the form knew: the picker and the check follow it. */
    setFirstDispatchDate: (state, action: PayloadAction<string | null>) => {
      state.firstDispatchDate = action.payload;
    },

    // Bulk operations
    loadGRNData: (
      state,
      action: PayloadAction<{
        header: GRNHeaderData;
        items: GRNItemData[];
        grnId: string;
        grnRates?: GrnRate[];
        grnInvoiced?: boolean;
        // From get_grn_edit_state; absent on an older server.
        updatedAt?: string | null;
        invoice?: GRNInvoiceRef | null;
        firstDispatchDate?: string | null;
      }>
    ) => {
      state.header = action.payload.header;
      state.items = action.payload.items;
      state.grnId = action.payload.grnId;
      state.loadedUpdatedAt = action.payload.updatedAt ?? null;
      state.invoice = action.payload.invoice ?? null;
      state.firstDispatchDate = action.payload.firstDispatchDate ?? null;
      state.loadedDate = action.payload.header.date ?? null;
      state.grnRates = action.payload.grnRates ?? [];
      state.rateChanges = [];
      state.removedGrnRates = [];
      state.grnInvoiced = action.payload.grnInvoiced === true;
      state.removedImages = [];
      state.takenNumberError = null;
      state.loadedSignature = formSignature(state);
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
          grnFormLogger.info('Rolled back to snapshot after failed submission');
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
  setSubmissionNonce,
  setGrNoTyped,
  setFirstDispatchDate,
  setGrnRates,
  setRateChanges,
  setRemovedGrnRates,
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
export const selectGRNRemovedRates = (state: { grnForm: GRNFormState }) => state.grnForm.removedGrnRates ?? EMPTY_RATES;
export const selectGRNInvoiced = (state: { grnForm: GRNFormState }) => state.grnForm.grnInvoiced === true;
export const selectGRNLoadedUpdatedAt = (state: { grnForm: GRNFormState }) => state.grnForm.loadedUpdatedAt ?? null;
export const selectGRNInvoice = (state: { grnForm: GRNFormState }) => state.grnForm.invoice ?? null;
export const selectGRNFirstDispatchDate = (state: { grnForm: GRNFormState }) => state.grnForm.firstDispatchDate ?? null;
export const selectGRNLoadedDate = (state: { grnForm: GRNFormState }) => state.grnForm.loadedDate ?? null;
const EMPTY_RATES: GrnRate[] = [];
const EMPTY_CHANGES: RateChange[] = [];
export const selectGRNRemovedImages = (state: { grnForm: GRNFormState }) => state.grnForm.removedImages;
export const selectGRNSubmissionNonce = (state: { grnForm: GRNFormState }) => state.grnForm.submissionNonce;
export const selectGRNGrNoTyped = (state: { grnForm: GRNFormState }) => state.grnForm.grNoTyped === true;
export const selectGRNTakenNumberError = (state: { grnForm: GRNFormState }) => state.grnForm.takenNumberError ?? null;
export const selectGRNTempId = (state: { grnForm: GRNFormState }) => state.grnForm.tempGrnId;
export const selectGRNFormValidationErrors = (state: { grnForm: GRNFormState }) => state.grnForm.validationErrors;
export const selectGRNFormCurrentStep = (state: { grnForm: GRNFormState }) => state.grnForm.currentStep;
export const selectGRNFormIsLoading = (state: { grnForm: GRNFormState }) => state.grnForm.isLoading;
export const selectGRNFormIsSaving = (state: { grnForm: GRNFormState }) => state.grnForm.isSaving;
export const selectGRNFormError = (state: { grnForm: GRNFormState }) => state.grnForm.error;

const selectFormSignature = createSelector(
  [selectGRNFormHeader, selectGRNFormItems, selectGRNRemovedImages, selectGRNRates, selectGRNRateChanges, selectGRNRemovedRates],
  (header, items, removedImages, grnRates, rateChanges, removedGrnRates) =>
    formSignature({ header, items, removedImages, grnRates, rateChanges, removedGrnRates })
);
/** The edit form differs from the GRN as it was loaded (always false for a new GRN). */
export const selectGRNFormChanged = (state: { grnForm: GRNFormState }): boolean =>
  state.grnForm.loadedSignature != null && selectFormSignature(state) !== state.grnForm.loadedSignature;

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
