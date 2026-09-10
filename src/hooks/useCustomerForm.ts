/**
 * useCustomerForm Hook
 *
 * Custom hook that consolidates customer form logic.
 * Handles form initialization, validation, navigation, and data management.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, Href } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setMode,
  setCustomerId,
  setCurrentStep,
  updateFormData,
  updateBasicInfo,
  updateDetails,
  addDocumentImage,
  removeDocumentImage,
  addDocumentUrl,
  removeDocumentUrl,
  setValidationErrors,
  clearValidationError,
  clearAllValidationErrors,
  setIsLoading,
  setIsSubmitting,
  loadCustomerData,
  resetForm,
  initializeCreateMode,
  selectCustomerFormState,
  selectCustomerFormData,
  selectCustomerFormMode,
  selectCustomerFormId,
  selectCustomerFormCurrentStep,
  selectCustomerFormValidationErrors,
  selectCustomerFormIsLoading,
  selectCustomerFormIsSubmitting,
  selectCustomerFormIsDirty,
  selectIsCreateMode,
  selectCompletedSteps,
} from '@/store/slices/customerFormSlice';
import {
  CustomerFormData,
  CustomerFormMode,
  CustomerFormStep,
  CustomerValidationErrors,
  CustomerDocumentImage,
  CreateCustomerParams,
  UpdateCustomerParams,
  INITIAL_CUSTOMER_FORM_DATA,
} from '@/types/customer.types';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep,
  validateFullForm,
  formatMobile,
  formatGST,
  formatPAN,
} from '@/features/customer/schemas/customerValidation';
import {
  customerService,
  createCustomer,
  updateCustomer,
  getCustomerById,
} from '@/services/customer-service';
import {
  CUSTOMER_STEP_NUMBERS,
  getStepRoutePath,
  getNextStepLabel,
} from '@/constants/customerSteps';

// =============================================================================
// TYPES
// =============================================================================

export interface UseCustomerFormOptions {
  mode: CustomerFormMode;
  customerIdParam?: string;
}

export interface UseCustomerFormReturn {
  // State
  formData: CustomerFormData;
  customerId: string | null;
  mode: CustomerFormMode;
  currentStep: CustomerFormStep;
  validationErrors: CustomerValidationErrors;
  isLoading: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  isCreateMode: boolean;
  completedSteps: number[];

  // Initialization
  initializeForm: () => Promise<void>;
  loadExistingCustomer: (id: string) => Promise<void>;

  // Basic info actions (Step 1)
  updateName: (value: string) => void;
  updateMobile: (value: string) => void;
  updateEmail: (value: string) => void;

  // Details actions (Step 2)
  updateCity: (value: string) => void;
  updateState: (value: string) => void;
  updatePincode: (value: string) => void;
  updateAddress: (value: string) => void;
  updateGST: (value: string) => void;
  updatePAN: (value: string) => void;
  updateContactName: (value: string) => void;
  updateContactMobile: (value: string) => void;
  updateContactEmail: (value: string) => void;

  // Bulk updates
  updateBasicInfoFields: (fields: Partial<Pick<CustomerFormData, 'name' | 'mobile' | 'email'>>) => void;
  updateDetailsFields: (fields: Partial<Omit<CustomerFormData, 'name' | 'mobile' | 'email' | 'document_urls' | 'document_images'>>) => void;

  // Document actions (Step 3)
  addDocument: (image: CustomerDocumentImage) => void;
  removeDocument: (uri: string) => void;

  // Validation
  validateCurrentStep: () => Promise<{ isValid: boolean; errors: CustomerValidationErrors }>;
  clearFieldError: (field: keyof CustomerValidationErrors) => void;
  clearAllErrors: () => void;

  // Navigation
  navigateToStep: (step: CustomerFormStep) => Promise<boolean>;
  goToNextStep: () => Promise<boolean>;
  goToPreviousStep: () => void;
  canNavigateToStep: (targetStep: CustomerFormStep) => Promise<boolean>;

  // Submission
  submitForm: () => Promise<{ success: boolean; customerId?: string; error?: string }>;

  // Reset
  resetFormState: () => void;

  // Helpers
  getNextButtonLabel: () => string;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useCustomerForm(options: UseCustomerFormOptions): UseCustomerFormReturn {
  const { mode: initialMode, customerIdParam } = options;
  const dispatch = useAppDispatch();

  // Selectors
  const formData = useAppSelector(selectCustomerFormData);
  const mode = useAppSelector(selectCustomerFormMode);
  const customerId = useAppSelector(selectCustomerFormId);
  const currentStep = useAppSelector(selectCustomerFormCurrentStep);
  const validationErrors = useAppSelector(selectCustomerFormValidationErrors);
  const isLoading = useAppSelector(selectCustomerFormIsLoading);
  const isSubmitting = useAppSelector(selectCustomerFormIsSubmitting);
  const isDirty = useAppSelector(selectCustomerFormIsDirty);
  const isCreateMode = useAppSelector(selectIsCreateMode);
  const completedSteps = useAppSelector(selectCompletedSteps);

  // Refs
  const isInitialized = useRef(false);

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize form for create mode
   */
  // Track the last loaded customer ID to prevent duplicate fetches
  const lastLoadedIdRef = useRef<string | null>(null);

  const initializeForm = useCallback(async () => {
    // Skip if this hook instance already initialized
    if (isInitialized.current) return;

    // Also skip if form is already in create mode in Redux (prevents reset when navigating between steps)
    if (mode === 'create' && (formData.name || formData.mobile)) {
      console.log('[useCustomerForm] Form already initialized in create mode with data, skipping reinit');
      isInitialized.current = true;
      return;
    }

    isInitialized.current = true;
    lastLoadedIdRef.current = null; // Reset when entering create mode

    console.log('[useCustomerForm] Initializing form in create mode');
    dispatch(initializeCreateMode());
  }, [dispatch, mode, formData.name, formData.mobile]);

  /**
   * Load existing customer for edit mode
   */
  const loadExistingCustomer = useCallback(
    async (id: string) => {
      if (!id) return;

      // Skip if Redux already has this customer's data loaded
      // This prevents re-fetching when navigating between steps (each step creates a new hook instance)
      // Check both customerId match AND that we have form data (name is required)
      if (customerId === id && formData.name) {
        console.log('[useCustomerForm] Customer already loaded in Redux, skipping fetch');
        return;
      }

      // Also skip if the local ref matches (for re-renders within the same step)
      if (lastLoadedIdRef.current === id) {
        console.log('[useCustomerForm] Customer already loaded, skipping fetch');
        return;
      }

      console.log('[useCustomerForm] Loading customer:', id);
      lastLoadedIdRef.current = id; // Mark as loading this ID
      dispatch(setIsLoading(true));

      try {
        const result = await getCustomerById(id);

        if (!result.success || !result.data) {
          Alert.alert('Error', result.message || 'Failed to load customer');
          router.back();
          return;
        }

        const customer = result.data;

        // Convert to form data
        const formDataToLoad: CustomerFormData = {
          name: customer.name || '',
          mobile: customer.mobile || '',
          email: customer.email || '',
          city: customer.city || '',
          state: customer.state || '',
          pincode: customer.pincode || '',
          address: customer.address || '',
          gst: customer.gst || '',
          pan: customer.pan || '',
          contact_name: customer.contact_name || '',
          contact_mobile: customer.contact_mobile || '',
          contact_email: customer.contact_email || '',
          document_urls: customer.document_urls || [],
          document_images: [], // Will be populated from URLs if needed
          image_urls: customer.image_urls || [],
          customer_images: [], // Will be populated from URLs if needed
        };

        dispatch(
          loadCustomerData({
            customer_id: id,
            formData: formDataToLoad,
          })
        );

        console.log('[useCustomerForm] Customer loaded successfully');
      } catch (error) {
        console.error('[useCustomerForm] Error loading customer:', error);
        Alert.alert('Error', 'Failed to load customer');
        router.back();
      } finally {
        dispatch(setIsLoading(false));
      }
    },
    [dispatch, customerId, formData.name]
  );

  // Initialize on mount
  useEffect(() => {
    if (initialMode === 'create') {
      initializeForm();
    } else if (initialMode === 'edit' && customerIdParam) {
      loadExistingCustomer(customerIdParam);
    }
  }, [initialMode, customerIdParam, initializeForm, loadExistingCustomer]);

  // ===========================================================================
  // BASIC INFO ACTIONS (STEP 1)
  // ===========================================================================

  const updateName = useCallback(
    (value: string) => {
      dispatch(updateBasicInfo({ name: value }));
      dispatch(clearValidationError('name'));
    },
    [dispatch]
  );

  const updateMobile = useCallback(
    (value: string) => {
      dispatch(updateBasicInfo({ mobile: value }));
      dispatch(clearValidationError('mobile'));
    },
    [dispatch]
  );

  const updateEmail = useCallback(
    (value: string) => {
      dispatch(updateBasicInfo({ email: value }));
      dispatch(clearValidationError('email'));
    },
    [dispatch]
  );

  const updateBasicInfoFields = useCallback(
    (fields: Partial<Pick<CustomerFormData, 'name' | 'mobile' | 'email'>>) => {
      dispatch(updateBasicInfo(fields));
      // Clear errors for updated fields
      Object.keys(fields).forEach((key) => {
        dispatch(clearValidationError(key as keyof CustomerValidationErrors));
      });
    },
    [dispatch]
  );

  // ===========================================================================
  // DETAILS ACTIONS (STEP 2)
  // ===========================================================================

  const updateCity = useCallback(
    (value: string) => {
      dispatch(updateDetails({ city: value }));
      dispatch(clearValidationError('city'));
    },
    [dispatch]
  );

  const updateState = useCallback(
    (value: string) => {
      dispatch(updateDetails({ state: value }));
      dispatch(clearValidationError('state'));
    },
    [dispatch]
  );

  const updatePincode = useCallback(
    (value: string) => {
      dispatch(updateDetails({ pincode: value }));
      dispatch(clearValidationError('pincode'));
    },
    [dispatch]
  );

  const updateAddress = useCallback(
    (value: string) => {
      dispatch(updateDetails({ address: value }));
      dispatch(clearValidationError('address'));
    },
    [dispatch]
  );

  const updateGST = useCallback(
    (value: string) => {
      dispatch(updateDetails({ gst: formatGST(value) }));
      dispatch(clearValidationError('gst'));
    },
    [dispatch]
  );

  const updatePAN = useCallback(
    (value: string) => {
      dispatch(updateDetails({ pan: formatPAN(value) }));
      dispatch(clearValidationError('pan'));
    },
    [dispatch]
  );

  const updateContactName = useCallback(
    (value: string) => {
      dispatch(updateDetails({ contact_name: value }));
      dispatch(clearValidationError('contact_name'));
    },
    [dispatch]
  );

  const updateContactMobile = useCallback(
    (value: string) => {
      dispatch(updateDetails({ contact_mobile: value }));
      dispatch(clearValidationError('contact_mobile'));
    },
    [dispatch]
  );

  const updateContactEmail = useCallback(
    (value: string) => {
      dispatch(updateDetails({ contact_email: value }));
      dispatch(clearValidationError('contact_email'));
    },
    [dispatch]
  );

  const updateDetailsFields = useCallback(
    (fields: Partial<Omit<CustomerFormData, 'name' | 'mobile' | 'email' | 'document_urls' | 'document_images'>>) => {
      dispatch(updateDetails(fields));
      // Clear errors for updated fields
      Object.keys(fields).forEach((key) => {
        dispatch(clearValidationError(key as keyof CustomerValidationErrors));
      });
    },
    [dispatch]
  );

  // ===========================================================================
  // DOCUMENT ACTIONS (STEP 3)
  // ===========================================================================

  const addDocument = useCallback(
    (image: CustomerDocumentImage) => {
      dispatch(addDocumentImage(image));
    },
    [dispatch]
  );

  const removeDocument = useCallback(
    (uri: string) => {
      dispatch(removeDocumentImage(uri));
    },
    [dispatch]
  );

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  const validateCurrentStep = useCallback(async (): Promise<{
    isValid: boolean;
    errors: CustomerValidationErrors;
  }> => {
    const result = await validateStep(currentStep, formData);

    if (!result.isValid) {
      dispatch(setValidationErrors(result.errors));
    }

    return result;
  }, [currentStep, formData, dispatch]);

  const clearFieldError = useCallback(
    (field: keyof CustomerValidationErrors) => {
      dispatch(clearValidationError(field));
    },
    [dispatch]
  );

  const clearAllErrors = useCallback(() => {
    dispatch(clearAllValidationErrors());
  }, [dispatch]);

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  const canNavigateToStep = useCallback(
    async (targetStep: CustomerFormStep): Promise<boolean> => {
      // Can always go back
      if (targetStep < currentStep) {
        return true;
      }

      // Validate all steps before target
      for (let step = currentStep; step < targetStep; step++) {
        const result = await validateStep(step as CustomerFormStep, formData);
        if (!result.isValid) {
          dispatch(setValidationErrors(result.errors));
          return false;
        }
      }

      return true;
    },
    [currentStep, formData, dispatch]
  );

  const navigateToStep = useCallback(
    async (step: CustomerFormStep): Promise<boolean> => {
      const canNavigate = await canNavigateToStep(step);

      if (!canNavigate) {
        return false;
      }

      dispatch(setCurrentStep(step));

      // Navigate to route
      const routePath = getStepRoutePath(step, mode, customerId || undefined);
      router.push(routePath as Href);

      return true;
    },
    [canNavigateToStep, mode, customerId, dispatch]
  );

  const goToNextStep = useCallback(async (): Promise<boolean> => {
    // Validate current step first
    const result = await validateCurrentStep();

    if (!result.isValid) {
      return false;
    }

    if (currentStep < 3) {
      const nextStep = (currentStep + 1) as CustomerFormStep;
      dispatch(setCurrentStep(nextStep));

      // Navigate to next route
      const routePath = getStepRoutePath(nextStep, mode, customerId || undefined);
      router.push(routePath as Href);

      return true;
    }

    return false;
  }, [currentStep, validateCurrentStep, mode, customerId, dispatch]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep > 1) {
      const prevStep = (currentStep - 1) as CustomerFormStep;
      dispatch(setCurrentStep(prevStep));
      router.back();
    }
  }, [currentStep, dispatch]);

  // ===========================================================================
  // SUBMISSION
  // ===========================================================================

  const submitForm = useCallback(async (): Promise<{
    success: boolean;
    customerId?: string;
    error?: string;
  }> => {
    // Validate full form
    const validation = await validateFullForm(formData);

    if (!validation.isValid) {
      dispatch(setValidationErrors(validation.errors));
      Alert.alert('Validation Error', 'Please fix the errors before submitting.');
      return { success: false, error: 'Validation failed' };
    }

    dispatch(setIsSubmitting(true));

    try {
      // Prepare params
      const params: CreateCustomerParams = {
        p_name: formData.name,
        p_mobile: formatMobile(formData.mobile),
        p_email: formData.email || undefined,
        p_city: formData.city || undefined,
        p_state: formData.state || undefined,
        p_pincode: formData.pincode || undefined,
        p_address: formData.address || undefined,
        p_gst_number: formData.gst || undefined,
        p_pan_number: formData.pan || undefined,
        p_contact_person: formData.contact_name || undefined,
        p_contact_mobile: formData.contact_mobile ? formatMobile(formData.contact_mobile) : undefined,
        p_contact_email: formData.contact_email || undefined,
        p_image_urls: formData.image_urls && formData.image_urls.length > 0 ? formData.image_urls : undefined,
        p_document_urls: formData.document_urls && formData.document_urls.length > 0 ? formData.document_urls : undefined,
      };

      let result;

      if (isCreateMode) {
        result = await createCustomer(params);
      } else {
        result = await updateCustomer({
          ...params,
          p_customer_id: customerId!,
        });
      }

      if (!result.success) {
        Alert.alert('Error', result.message || 'Failed to save customer');
        return { success: false, error: result.error };
      }

      // Success
      const newCustomerId = result.data?.id || customerId;

      Alert.alert(
        'Success',
        isCreateMode ? 'Customer created successfully' : 'Customer updated successfully',
        [
          {
            text: 'OK',
            onPress: () => {
              dispatch(resetForm());
              router.replace('/customers');
            },
          },
        ]
      );

      return { success: true, customerId: newCustomerId || undefined };
    } catch (error) {
      console.error('[useCustomerForm] Submit error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      dispatch(setIsSubmitting(false));
    }
  }, [formData, isCreateMode, customerId, dispatch]);

  // ===========================================================================
  // RESET
  // ===========================================================================

  const resetFormState = useCallback(() => {
    isInitialized.current = false;
    dispatch(resetForm());
  }, [dispatch]);

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  const getNextButtonLabel = useCallback((): string => {
    return getNextStepLabel(currentStep, !isCreateMode);
  }, [currentStep, isCreateMode]);

  // ===========================================================================
  // RETURN
  // ===========================================================================

  return {
    // State
    formData,
    customerId,
    mode,
    currentStep,
    validationErrors,
    isLoading,
    isSubmitting,
    isDirty,
    isCreateMode,
    completedSteps,

    // Initialization
    initializeForm,
    loadExistingCustomer,

    // Basic info actions
    updateName,
    updateMobile,
    updateEmail,
    updateBasicInfoFields,

    // Details actions
    updateCity,
    updateState,
    updatePincode,
    updateAddress,
    updateGST,
    updatePAN,
    updateContactName,
    updateContactMobile,
    updateContactEmail,
    updateDetailsFields,

    // Document actions
    addDocument,
    removeDocument,

    // Validation
    validateCurrentStep,
    clearFieldError,
    clearAllErrors,

    // Navigation
    navigateToStep,
    goToNextStep,
    goToPreviousStep,
    canNavigateToStep,

    // Submission
    submitForm,

    // Reset
    resetFormState,

    // Helpers
    getNextButtonLabel,
  };
}

export default useCustomerForm;
