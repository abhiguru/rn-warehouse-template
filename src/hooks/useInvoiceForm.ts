/**
 * useInvoiceForm Hook
 *
 * Custom hook that consolidates Invoice form logic from multiple screen components.
 * Handles form initialization, validation, navigation, pricing calculations, and data management.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
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
  setValidationErrors,
  clearValidationError,
  clearAllValidationErrors,
  loadInvoiceFormData,
  loadInvoiceEditData,
  resetForm,
  selectInvoiceFormHeader,
  selectInvoiceFormItems,
  selectInvoiceFormEditedItems,
  selectInvoiceFormItemOverrides,
  selectInvoiceFormBulkPricing,
  selectInvoiceFormId,
  selectSelectedGrId,
} from '@/store/slices/invoiceFormSlice';
import type {
  InvoiceHeaderData,
  InvoiceItemData,
  EditedItemValues,
} from '@/types/invoice.types';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateFullInvoice,
} from '@/features/invoice/schemas/invoiceValidation';
import {
  getNextInvoiceNumber,
  loadInvoiceFormData as loadInvoiceFormDataService,
  loadInvoiceData as loadInvoiceDataService,
  createInvoice,
  updateInvoice,
} from '@/features/invoice/services/invoiceFormService';

export type InvoiceFormMode = 'create' | 'edit';

export interface UseInvoiceFormOptions {
  mode: InvoiceFormMode;
  invoiceIdParam?: string;
}

export interface UseInvoiceFormReturn {
  // State
  header: InvoiceHeaderData;
  items: InvoiceItemData[];
  editedItems: Record<string, EditedItemValues>;
  itemOverrides: Record<string, string[]>;
  bulkPricing: Record<string, { charge: number; labour_rate: number; tax: number }>;
  invoiceId: string | null;
  selectedGrId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  isLoadingItems: boolean;
  validationErrors: Record<string, string>;
  isCreateMode: boolean;

  // Initialization
  initializeForm: () => Promise<void>;
  loadExistingInvoice: (id: string) => Promise<void>;
  loadGRNData: (grId: string) => Promise<void>;

  // Header actions
  updateHeaderField: (field: keyof InvoiceHeaderData, value: unknown) => void;
  updateHeaderFields: (updates: Partial<InvoiceHeaderData>) => void;
  updateDiscountAmount: (discount: number) => void;

  // Item actions
  setFormItems: (items: InvoiceItemData[]) => void;
  updateFormItem: (tempId: string, updates: Partial<InvoiceItemData>) => void;
  updateItemPricing: (tempId: string, values: Partial<EditedItemValues>) => void;

  // Bulk pricing actions
  applyBulkPricing: (values: Partial<EditedItemValues>) => void;
  applyGroupPricing: (groupKey: string, pricing: { charge: number; labour_rate: number; tax: number }) => void;

  // Duration actions (one_time_charge toggle)
  setAllDurations: (duration: number) => void;
  restoreOriginalItemDurations: () => void;

  // Validation
  validateCurrentStep: (step: number) => Promise<{ isValid: boolean; errors: Record<string, string> }>;
  clearFieldValidationError: (field: string) => void;
  clearAllFormValidationErrors: () => void;

  // Navigation
  navigateToStep: (step: number) => Promise<boolean>;
  canNavigateToStep: (targetStep: number, currentStep: number) => Promise<boolean>;

  // Submission
  submitForm: () => Promise<{ success: boolean; invoiceId?: string; invoiceNo?: number; error?: string }>;

  // Reset
  resetFormState: () => void;

  // Totals recalculation
  recalculateFormTotals: () => void;
}

/**
 * Custom hook for Invoice form management
 *
 * Consolidates form logic from:
 * - invoice-form/step1.tsx through step4.tsx
 */
export function useInvoiceForm({
  mode,
  invoiceIdParam,
}: UseInvoiceFormOptions): UseInvoiceFormReturn {
  const dispatch = useAppDispatch();
  const invoiceFormState = useAppSelector((state) => state.invoiceForm);

  // Selectors
  const header = useAppSelector(selectInvoiceFormHeader);
  const items = useAppSelector(selectInvoiceFormItems);
  const editedItems = useAppSelector(selectInvoiceFormEditedItems);
  const itemOverrides = useAppSelector(selectInvoiceFormItemOverrides);
  const bulkPricing = useAppSelector(selectInvoiceFormBulkPricing);
  const invoiceId = useAppSelector(selectInvoiceFormId);
  const selectedGrId = useAppSelector(selectSelectedGrId);

  const isCreateMode = mode === 'create';

  // Local state
  const [validationErrors, setLocalValidationErrors] = useState<Record<string, string>>({});

  // Refs to prevent duplicate operations
  const hasInitialized = useRef(false);
  const hasGeneratedInvNo = useRef(false);
  const isLoadingData = useRef(false);

  /**
   * Initialize form for create mode
   */
  const initializeForm = useCallback(async () => {
    if (!isCreateMode || hasInitialized.current) return;
    hasInitialized.current = true;

    // Generate invoice number
    if (!header.inv_no && !hasGeneratedInvNo.current) {
      hasGeneratedInvNo.current = true;
      try {
        const result = await getNextInvoiceNumber(header.inv_fin_year);
        if (result.success && result.data) {
          dispatch(updateHeader({
            inv_no: result.data.next_invoice_number,
            inv_fin_year: result.data.financial_year,
          }));
        }
      } catch (error) {
        console.error('[useInvoiceForm] Failed to generate invoice number:', error);
        Alert.alert('Error', 'Failed to generate invoice number');
      }
    }
  }, [isCreateMode, header.inv_no, header.inv_fin_year, dispatch]);

  /**
   * Load existing invoice data for edit mode
   */
  const loadExistingInvoice = useCallback(async (id: string) => {
    if (isLoadingData.current) return;
    isLoadingData.current = true;

    dispatch(setIsLoading(true));
    try {
      const result = await loadInvoiceDataService(id);
      if (result.success && result.data) {
        // Ensure header has required fields for edit mode
        const loadedHeader = result.data.header as InvoiceHeaderData;
        dispatch(loadInvoiceEditData({
          invoiceId: id,
          header: loadedHeader,
          items: result.data.items,
          grId: loadedHeader.gr_id || '',
        }));
      } else {
        Alert.alert('Error', result.message || 'Failed to load invoice data');
      }
    } catch (error) {
      console.error('[useInvoiceForm] Failed to load invoice:', error);
      Alert.alert('Error', 'Failed to load invoice data');
    } finally {
      dispatch(setIsLoading(false));
      isLoadingData.current = false;
    }
  }, [dispatch]);

  /**
   * Load GRN data for invoice creation
   */
  const loadGRNData = useCallback(async (grId: string) => {
    dispatch(setIsLoadingItems(true));
    try {
      const result = await loadInvoiceFormDataService(grId);
      if (result.success && result.data) {
        dispatch(loadInvoiceFormData({
          header: result.data.header,
          items: result.data.items,
          grId,
        }));
      } else {
        Alert.alert('Error', result.message || 'Failed to load GRN data');
      }
    } catch (error) {
      console.error('[useInvoiceForm] Failed to load GRN data:', error);
      Alert.alert('Error', 'Failed to load GRN data');
    } finally {
      dispatch(setIsLoadingItems(false));
    }
  }, [dispatch]);

  // Header actions
  const updateHeaderField = useCallback((field: keyof InvoiceHeaderData, value: unknown) => {
    dispatch(updateHeader({ [field]: value }));
    dispatch(clearValidationError(field));
  }, [dispatch]);

  const updateHeaderFields = useCallback((updates: Partial<InvoiceHeaderData>) => {
    dispatch(updateHeader(updates));
    Object.keys(updates).forEach((field) => {
      dispatch(clearValidationError(field));
    });
  }, [dispatch]);

  const updateDiscountAmount = useCallback((discount: number) => {
    dispatch(updateDiscount(discount));
  }, [dispatch]);

  // Item actions
  const setFormItems = useCallback((itemsToSet: InvoiceItemData[]) => {
    dispatch(setItems(itemsToSet));
  }, [dispatch]);

  const updateFormItem = useCallback((tempId: string, updates: Partial<InvoiceItemData>) => {
    dispatch(updateItem({ temp_id: tempId, item: updates }));
  }, [dispatch]);

  const updateItemPricing = useCallback((tempId: string, values: Partial<EditedItemValues>) => {
    dispatch(updateEditedItem({ temp_id: tempId, values }));
  }, [dispatch]);

  // Bulk pricing actions
  const applyBulkPricing = useCallback((values: Partial<EditedItemValues>) => {
    dispatch(bulkUpdateItemPricing(values));
  }, [dispatch]);

  const applyGroupPricing = useCallback((groupKey: string, pricing: { charge: number; labour_rate: number; tax: number }) => {
    dispatch(bulkUpdateItemGroupPricing({ group_key: groupKey, pricing }));
  }, [dispatch]);

  // Duration actions
  const setAllDurations = useCallback((duration: number) => {
    dispatch(updateAllDurations(duration));
  }, [dispatch]);

  const restoreOriginalItemDurations = useCallback(() => {
    dispatch(restoreOriginalDurations());
  }, [dispatch]);

  // Totals recalculation
  const recalculateFormTotals = useCallback(() => {
    dispatch(recalculateTotals());
  }, [dispatch]);

  /**
   * Validate a specific step
   */
  const validateCurrentStep = useCallback(async (step: number): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
    let result: { isValid: boolean; errors: Record<string, string> };

    switch (step) {
      case 1:
        result = await validateStep1(header);
        break;
      case 2:
        result = await validateStep2(items);
        break;
      case 3:
        result = await validateStep3({ header, items });
        break;
      case 4:
        result = await validateFullInvoice({ header, items });
        break;
      default:
        result = { isValid: true, errors: {} };
    }

    if (!result.isValid) {
      setLocalValidationErrors(result.errors);
      dispatch(setValidationErrors(result.errors));
    } else {
      setLocalValidationErrors({});
      dispatch(setValidationErrors({}));
    }

    return result;
  }, [header, items, dispatch]);

  const clearFieldValidationError = useCallback((field: string) => {
    setLocalValidationErrors((prev) => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
    dispatch(clearValidationError(field));
  }, [dispatch]);

  const clearAllFormValidationErrors = useCallback(() => {
    setLocalValidationErrors({});
    dispatch(clearAllValidationErrors());
  }, [dispatch]);

  /**
   * Check if navigation to a target step is allowed
   */
  const canNavigateToStep = useCallback(async (targetStep: number, currentStep: number): Promise<boolean> => {
    // Can always go back
    if (targetStep < currentStep) return true;

    // Validate all steps before target
    for (let step = currentStep; step < targetStep; step++) {
      const validation = await validateCurrentStep(step);
      if (!validation.isValid) {
        const errorFields = Object.keys(validation.errors);
        const errorMessage = errorFields.length > 0
          ? `Please check: ${errorFields.join(', ')}`
          : 'Please fill all required fields';
        Alert.alert('Validation Error', errorMessage);
        return false;
      }
    }

    return true;
  }, [validateCurrentStep]);

  /**
   * Navigate to a specific step
   */
  const navigateToStep = useCallback(async (step: number): Promise<boolean> => {
    const currentStep = invoiceFormState.currentStep;
    const canNavigate = await canNavigateToStep(step, currentStep);

    if (!canNavigate) return false;

    dispatch(setCurrentStep(step));

    // Determine route based on mode
    const baseRoute = isCreateMode ? '/invoice-form' : `/invoice-edit/${invoiceId}`;

    switch (step) {
      case 1:
        router.push(`${baseRoute}/step1`);
        break;
      case 2:
        router.push(`${baseRoute}/step2`);
        break;
      case 3:
        router.push(`${baseRoute}/step3`);
        break;
      case 4:
        router.push(`${baseRoute}/step4`);
        break;
    }

    return true;
  }, [invoiceFormState.currentStep, canNavigateToStep, isCreateMode, invoiceId, dispatch]);

  /**
   * Submit the form (create or update)
   */
  const submitForm = useCallback(async (): Promise<{ success: boolean; invoiceId?: string; invoiceNo?: number; error?: string }> => {
    // Validate full invoice
    const validation = await validateFullInvoice({ header, items });
    if (!validation.isValid) {
      const errorFields = Object.keys(validation.errors);
      Alert.alert('Validation Error', `Please check: ${errorFields.join(', ')}`);
      return { success: false, error: 'Validation failed' };
    }

    dispatch(setIsSaving(true));

    try {
      // Transform header to match CreateInvoicePayload format
      // The service internally converts inv_fin_year from string to number
      const payload = {
        header: {
          ...header,
          inv_fin_year: parseInt(String(header.inv_fin_year).split('-')[0]) || 2025,
        },
        items,
      };

      const result = isCreateMode
        ? await createInvoice(payload)
        : await updateInvoice(invoiceId!, payload);

      if (result.success) {
        return {
          success: true,
          invoiceId: result.data?.invoice_id,
          invoiceNo: result.data?.invoice_no,
        };
      } else {
        Alert.alert('Error', result.message || 'Failed to save invoice');
        return { success: false, error: result.message };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useInvoiceForm] Submit error:', error);
      Alert.alert('Error', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      dispatch(setIsSaving(false));
    }
  }, [header, items, invoiceId, isCreateMode, dispatch]);

  /**
   * Reset form to initial state
   */
  const resetFormState = useCallback(() => {
    hasInitialized.current = false;
    hasGeneratedInvNo.current = false;
    isLoadingData.current = false;
    setLocalValidationErrors({});
    dispatch(resetForm());
  }, [dispatch]);

  // Auto-initialize for create mode
  useEffect(() => {
    if (isCreateMode && !hasInitialized.current) {
      initializeForm();
    }
  }, [isCreateMode, initializeForm]);

  // Load data for edit mode
  useEffect(() => {
    if (!isCreateMode && invoiceIdParam && invoiceId !== invoiceIdParam && !isLoadingData.current) {
      loadExistingInvoice(invoiceIdParam);
    }
  }, [isCreateMode, invoiceIdParam, invoiceId, loadExistingInvoice]);

  return {
    // State
    header,
    items,
    editedItems,
    itemOverrides,
    bulkPricing,
    invoiceId,
    selectedGrId,
    isLoading: invoiceFormState.is_loading,
    isSaving: invoiceFormState.is_saving,
    isLoadingItems: invoiceFormState.is_loading_items,
    validationErrors,
    isCreateMode,

    // Initialization
    initializeForm,
    loadExistingInvoice,
    loadGRNData,

    // Header actions
    updateHeaderField,
    updateHeaderFields,
    updateDiscountAmount,

    // Item actions
    setFormItems,
    updateFormItem,
    updateItemPricing,

    // Bulk pricing actions
    applyBulkPricing,
    applyGroupPricing,

    // Duration actions
    setAllDurations,
    restoreOriginalItemDurations,

    // Validation
    validateCurrentStep,
    clearFieldValidationError,
    clearAllFormValidationErrors,

    // Navigation
    navigateToStep,
    canNavigateToStep,

    // Submission
    submitForm,

    // Reset
    resetFormState,

    // Totals recalculation
    recalculateFormTotals,
  };
}

export default useInvoiceForm;
