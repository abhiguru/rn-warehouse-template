import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';

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

  // UI state
  currentStep: number;
  isLoading: boolean;
  isSaving: boolean;

  // Error state for displaying save/load failures to user
  error: string | null;

  // Validation
  validationErrors: Record<string, string>;

  // #18 Fix: Snapshot for optimistic update rollback
  snapshot: GRNFormSnapshot | null;
}

// Initial state
const initialState: GRNFormState = {
  grnId: null,
  tempGrnId: null,
  header: {
    gr_no: '',
    registration: '',
    date: new Date().toISOString().split('T')[0],
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
  currentStep: 0,
  isLoading: false,
  isSaving: false,
  error: null,
  validationErrors: {},
  snapshot: null,
};

const grnFormSlice = createSlice({
  name: 'grnForm',
  initialState,
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
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item.grn_trl_id !== action.payload);
    },

    // Header image management
    addHeaderImage: (state, action: PayloadAction<GRNImageData>) => {
      state.header.gr_images.push(action.payload);
    },
    updateHeaderImageProgress: (state, action: PayloadAction<{ imageId: string; progress: number }>) => {
      const image = state.header.gr_images.find(img => img.id === action.payload.imageId);
      if (image) {
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
      const beforeCount = state.header.gr_images.length;
      const imageToRemove = state.header.gr_images.find(img => img.id === imageIdToRemove);

      console.log('[GRNFormSlice] 🗑️ removeHeaderImage called:', {
        imageIdToRemove,
        beforeCount,
        imageFound: !!imageToRemove,
        imageDetails: imageToRemove ? {
          id: imageToRemove.id,
          storagePath: imageToRemove.storagePath?.substring(0, 50),
          uploadStatus: imageToRemove.uploadStatus,
        } : null,
      });

      state.header.gr_images = state.header.gr_images.filter(img => img.id !== imageIdToRemove);

      console.log('[GRNFormSlice] 🗑️ After removal:', {
        afterCount: state.header.gr_images.length,
        removed: beforeCount - state.header.gr_images.length,
        remainingIds: state.header.gr_images.map(img => img.id),
      });
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
        if (image) {
          image.uploadProgress = action.payload.progress;
          image.uploadStatus = 'uploading';
        }
      }
    },
    completeItemImageUpload: (state, action: PayloadAction<{ itemId: string; imageId: string; storagePath?: string; imageUrl?: string; fileSize?: number; mimeType?: string }>) => {
      const item = state.items.find(item => item.grn_trl_id === action.payload.itemId);
      if (item && item.trl_images) {
        const image = item.trl_images.find(img => img.id === action.payload.imageId);
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
        item.trl_images = item.trl_images.filter(img => img.id !== action.payload.imageId);
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

    // Bulk operations
    loadGRNData: (state, action: PayloadAction<{ header: GRNHeaderData; items: GRNItemData[]; grnId: string }>) => {
      state.header = action.payload.header;
      state.items = action.payload.items;
      state.grnId = action.payload.grnId;
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
  setCurrentStep,
  setIsLoading,
  setIsSaving,
  setError,
  clearError,
  setValidationErrors,
  clearValidationError,
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
    totalWeight: items.reduce((sum, item) => sum + ((item.qty || 0) * (item.weight || 0)), 0),
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