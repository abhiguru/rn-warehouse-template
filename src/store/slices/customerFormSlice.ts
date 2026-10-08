/**
 * Customer Form Redux Slice
 *
 * Manages state for the customer create/edit multi-step form.
 * Form data is NOT persisted - it resets on app restart.
 */

import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import {
  CustomerFormData,
  CustomerFormState,
  CustomerFormMode,
  CustomerFormStep,
  CustomerValidationErrors,
  CustomerDocumentImage,
  INITIAL_CUSTOMER_FORM_DATA,
  INITIAL_CUSTOMER_FORM_STATE,
} from '@/types/customer.types';

// =============================================================================
// SLICE DEFINITION
// =============================================================================

const customerFormSlice = createSlice({
  name: 'customerForm',
  initialState: INITIAL_CUSTOMER_FORM_STATE,
  reducers: {
    // =========================================================================
    // MODE & ID MANAGEMENT
    // =========================================================================

    /**
     * Set the form mode (create or edit)
     */
    setMode: (state, action: PayloadAction<CustomerFormMode>) => {
      state.mode = action.payload;
    },

    /**
     * Set the customer ID (for edit mode)
     */
    setCustomerId: (state, action: PayloadAction<string | null>) => {
      state.customer_id = action.payload;
    },

    // =========================================================================
    // STEP NAVIGATION
    // =========================================================================

    /**
     * Set the current step
     */
    setCurrentStep: (state, action: PayloadAction<CustomerFormStep>) => {
      state.current_step = action.payload;
    },

    /**
     * Move to next step
     */
    nextStep: (state) => {
      if (state.current_step < 3) {
        state.current_step = (state.current_step + 1) as CustomerFormStep;
      }
    },

    /**
     * Move to previous step
     */
    previousStep: (state) => {
      if (state.current_step > 1) {
        state.current_step = (state.current_step - 1) as CustomerFormStep;
      }
    },

    // =========================================================================
    // FORM DATA UPDATES
    // =========================================================================

    /**
     * Update form data (partial update)
     */
    updateFormData: (state, action: PayloadAction<Partial<CustomerFormData>>) => {
      state.formData = { ...state.formData, ...action.payload };
      state.isDirty = true;
    },

    /**
     * Update basic info (step 1)
     */
    updateBasicInfo: (
      state,
      action: PayloadAction<{
        name?: string;
        mobile?: string;
        email?: string;
      }>
    ) => {
      const { name, mobile, email } = action.payload;
      if (name !== undefined) state.formData.name = name;
      if (mobile !== undefined) state.formData.mobile = mobile;
      if (email !== undefined) state.formData.email = email;
      state.isDirty = true;
    },

    /**
     * Update details (step 2)
     */
    updateDetails: (
      state,
      action: PayloadAction<{
        city?: string;
        state?: string;
        pincode?: string;
        address?: string;
        gst?: string;
        pan?: string;
        contact_name?: string;
        contact_mobile?: string;
        contact_email?: string;
      }>
    ) => {
      const updates = action.payload;
      if (updates.city !== undefined) state.formData.city = updates.city;
      if (updates.state !== undefined) state.formData.state = updates.state;
      if (updates.pincode !== undefined) state.formData.pincode = updates.pincode;
      if (updates.address !== undefined) state.formData.address = updates.address;
      if (updates.gst !== undefined) state.formData.gst = updates.gst;
      if (updates.pan !== undefined) state.formData.pan = updates.pan;
      if (updates.contact_name !== undefined) state.formData.contact_name = updates.contact_name;
      if (updates.contact_mobile !== undefined) state.formData.contact_mobile = updates.contact_mobile;
      if (updates.contact_email !== undefined) state.formData.contact_email = updates.contact_email;
      state.isDirty = true;
    },

    // =========================================================================
    // DOCUMENT IMAGE MANAGEMENT
    // =========================================================================

    /**
     * Add a document image
     */
    addDocumentImage: (state, action: PayloadAction<CustomerDocumentImage>) => {
      state.formData.document_images.push(action.payload);
      state.isDirty = true;
    },

    /**
     * Update a document image (e.g., mark as uploaded)
     */
    updateDocumentImage: (
      state,
      action: PayloadAction<{ uri: string; updates: Partial<CustomerDocumentImage> }>
    ) => {
      const index = state.formData.document_images.findIndex(
        (img) => img.uri === action.payload.uri
      );
      if (index !== -1) {
        state.formData.document_images[index] = {
          ...state.formData.document_images[index],
          ...action.payload.updates,
        };
      }
    },

    /**
     * Remove a document image
     */
    removeDocumentImage: (state, action: PayloadAction<string>) => {
      state.formData.document_images = state.formData.document_images.filter(
        (img) => img.uri !== action.payload
      );
      state.isDirty = true;
    },

    /**
     * Set document URLs (after upload completes)
     */
    setDocumentUrls: (state, action: PayloadAction<string[]>) => {
      state.formData.document_urls = action.payload;
    },

    /**
     * Add a single document URL
     */
    addDocumentUrl: (state, action: PayloadAction<string>) => {
      if (!state.formData.document_urls.includes(action.payload)) {
        state.formData.document_urls.push(action.payload);
      }
    },

    /**
     * Remove a document URL
     */
    removeDocumentUrl: (state, action: PayloadAction<string>) => {
      state.formData.document_urls = state.formData.document_urls.filter(
        (url) => url !== action.payload
      );
    },

    // =========================================================================
    // VALIDATION
    // =========================================================================

    /**
     * Set validation errors
     */
    setValidationErrors: (state, action: PayloadAction<CustomerValidationErrors>) => {
      state.validationErrors = action.payload;
    },

    /**
     * Clear a specific validation error
     */
    clearValidationError: (state, action: PayloadAction<keyof CustomerValidationErrors>) => {
      delete state.validationErrors[action.payload];
    },

    /**
     * Clear all validation errors
     */
    clearAllValidationErrors: (state) => {
      state.validationErrors = {};
    },

    // =========================================================================
    // LOADING STATES
    // =========================================================================

    /**
     * Set loading state
     */
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    /**
     * Set submitting state
     */
    setIsSubmitting: (state, action: PayloadAction<boolean>) => {
      state.isSubmitting = action.payload;
    },

    // =========================================================================
    // BULK OPERATIONS
    // =========================================================================

    /**
     * Load customer data for editing
     */
    loadCustomerData: (
      state,
      action: PayloadAction<{
        customer_id: string;
        formData: CustomerFormData;
      }>
    ) => {
      state.mode = 'edit';
      state.customer_id = action.payload.customer_id;
      state.formData = action.payload.formData;
      state.isDirty = false;
      state.validationErrors = {};
    },

    /**
     * Reset form to initial state
     */
    resetForm: () => {
      return INITIAL_CUSTOMER_FORM_STATE;
    },

    /**
     * Initialize form for create mode
     */
    initializeCreateMode: (state) => {
      return {
        ...INITIAL_CUSTOMER_FORM_STATE,
        mode: 'create' as CustomerFormMode,
        current_step: 1 as CustomerFormStep,
      };
    },
  },
});

// =============================================================================
// EXPORT ACTIONS
// =============================================================================

export const {
  // Mode & ID
  setMode,
  setCustomerId,
  // Navigation
  setCurrentStep,
  nextStep,
  previousStep,
  // Form data
  updateFormData,
  updateBasicInfo,
  updateDetails,
  // Document images
  addDocumentImage,
  updateDocumentImage,
  removeDocumentImage,
  setDocumentUrls,
  addDocumentUrl,
  removeDocumentUrl,
  // Validation
  setValidationErrors,
  clearValidationError,
  clearAllValidationErrors,
  // Loading states
  setIsLoading,
  setIsSubmitting,
  // Bulk operations
  loadCustomerData,
  resetForm,
  initializeCreateMode,
} = customerFormSlice.actions;

// =============================================================================
// SELECTORS
// =============================================================================

// Base selectors
export const selectCustomerFormState = (state: { customerForm: CustomerFormState }) =>
  state.customerForm;

export const selectCustomerFormMode = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.mode;

export const selectCustomerFormId = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.customer_id;

export const selectCustomerFormData = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.formData;

export const selectCustomerFormCurrentStep = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.current_step;

export const selectCustomerFormValidationErrors = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.validationErrors;

export const selectCustomerFormIsLoading = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.isLoading;

export const selectCustomerFormIsSubmitting = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.isSubmitting;

export const selectCustomerFormIsDirty = (state: { customerForm: CustomerFormState }) =>
  state.customerForm.isDirty;

// Memoized selectors
export const selectCustomerBasicInfo = createSelector([selectCustomerFormData], (formData) => ({
  name: formData.name,
  mobile: formData.mobile,
  email: formData.email,
}));

export const selectCustomerDetails = createSelector([selectCustomerFormData], (formData) => ({
  city: formData.city,
  state: formData.state,
  pincode: formData.pincode,
  address: formData.address,
  gst: formData.gst,
  pan: formData.pan,
  contact_name: formData.contact_name,
  contact_mobile: formData.contact_mobile,
  contact_email: formData.contact_email,
}));

export const selectCustomerDocuments = createSelector([selectCustomerFormData], (formData) => ({
  document_urls: formData.document_urls,
  document_images: formData.document_images,
}));

export const selectIsCreateMode = createSelector(
  [selectCustomerFormMode],
  (mode) => mode === 'create'
);

export const selectIsEditMode = createSelector(
  [selectCustomerFormMode],
  (mode) => mode === 'edit'
);

export const selectCompletedSteps = createSelector(
  [selectCustomerFormCurrentStep],
  (currentStep): number[] => {
    const completed: number[] = [];
    for (let i = 1; i < currentStep; i++) {
      completed.push(i);
    }
    return completed;
  }
);

// =============================================================================
// EXPORT REDUCER
// =============================================================================

export default customerFormSlice.reducer;
