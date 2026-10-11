/**
 * useInvoiceForm Hook
 *
 * Custom hook that consolidates Invoice form logic from multiple screen components.
 * Handles form initialization, validation, navigation, pricing calculations, and data management.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
  checkGrnStillInvoiceable,
} from '@/features/invoice/services/invoiceFormService';

import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { calculateFinancialYear } from '@/utils/invoiceCalculations';

/** Field errors as plain sentences for an alert (style guide §12.2), never raw field keys. */
function describeValidationErrors(errors: Record<string, string>): string {
  const messages = Array.from(new Set(Object.values(errors).filter(Boolean)));
  if (messages.length === 0) return t('invoice.form.fillRequired');
  return messages.slice(0, 5).join('\n');
}

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
  nextNumberFailed: boolean;
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

  // Validation
  validateCurrentStep: (step: number) => Promise<{ isValid: boolean; errors: Record<string, string> }>;
  clearFieldValidationError: (field: string) => void;
  clearAllFormValidationErrors: () => void;

  // Navigation
  navigateToStep: (step: number) => Promise<boolean>;
  canNavigateToStep: (targetStep: number, currentStep: number) => Promise<boolean>;

  // Submission
  /** `total` is the total the server stored, or null when it could not be read back after the save. */
  submitForm: () => Promise<{ success: boolean; invoiceId?: string; invoiceNo?: number; total?: number | null; error?: string }>;

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
  // True when the server could not suggest the next invoice number, so the form asks for it to be typed.
  const [nextNumberFailed, setNextNumberFailed] = useState(false);

  // Refs to prevent duplicate operations
  const hasInitialized = useRef(false);
  const hasGeneratedInvNo = useRef(false);
  const isLoadingData = useRef(false);
  // Counts the requests for the next invoice number; an answer is used only while its request is the latest.
  const nextNumberRequest = useRef(0);

  /**
   * Ask the server for the next invoice number of a financial year and put it
   * in the form. Numbers are counted per financial year, so this runs when a
   * new invoice opens and again when its date moves to another financial year.
   *
   * The answer is dropped when it is no longer wanted: a later request has
   * taken its place, the user typed a number meanwhile, or the form was reset.
   * When no number comes back the field is emptied, so that a number suggested
   * for another year does not stay, and the form asks for one to be typed.
   */
  const requestNextNumber = useCallback(async (finYear: string) => {
    const request = ++nextNumberRequest.current;
    try {
      const result = await getNextInvoiceNumber(finYear);
      if (request !== nextNumberRequest.current) return;
      if (result.success && result.data) {
        setNextNumberFailed(false);
        dispatch(updateHeader({ inv_no: result.data.next_invoice_number, inv_no_typed: false }));
      } else {
        setNextNumberFailed(true);
        dispatch(updateHeader({ inv_no: 0, inv_no_typed: false }));
      }
    } catch (error) {
      if (request !== nextNumberRequest.current) return;
      console.error('[useInvoiceForm] Failed to generate invoice number:', error);
      showAlert(t('invoice.form.numberFailedTitle'), t('common.checkConnection'));
    }
  }, [dispatch]);

  /**
   * Initialize form for create mode
   */
  const initializeForm = useCallback(async () => {
    if (!isCreateMode || hasInitialized.current) return;
    hasInitialized.current = true;

    // Generate invoice number
    if (!header.inv_no && !hasGeneratedInvNo.current) {
      hasGeneratedInvNo.current = true;
      await requestNextNumber(header.inv_fin_year);
    }
  }, [isCreateMode, header.inv_no, header.inv_fin_year, requestNextNumber]);

  /**
   * Load existing invoice data for edit mode
   */
  const loadExistingInvoiceRef = useRef<((id: string) => Promise<void>) | null>(null);
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
        showAlert(t('invoice.edit.loadFailedTitle'), serverText(result.message, t('common.checkConnection')), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.retry'), onPress: () => { void loadExistingInvoiceRef.current?.(id); } },
        ]);
      }
    } catch (error) {
      console.error('[useInvoiceForm] Failed to load invoice:', error);
      showAlert(t('invoice.edit.loadFailedTitle'), t('common.checkConnection'));
    } finally {
      dispatch(setIsLoading(false));
      isLoadingData.current = false;
    }
  }, [dispatch]);

  loadExistingInvoiceRef.current = loadExistingInvoice;

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
        showAlert(t('invoice.form.grnLoadFailedTitle'), serverText(result.message, t('common.checkConnection')));
      }
    } catch (error) {
      console.error('[useInvoiceForm] Failed to load GRN data:', error);
      showAlert(t('invoice.form.grnLoadFailedTitle'), t('common.checkConnection'));
    } finally {
      dispatch(setIsLoadingItems(false));
    }
  }, [dispatch]);

  // The screens read the local copy of the errors, so a changed field has to be cleared there too.
  const clearLocalErrors = useCallback((fields: string[]) => {
    setLocalValidationErrors((prev) => {
      if (!fields.some((field) => field in prev)) return prev;
      const next = { ...prev };
      fields.forEach((field) => { delete next[field]; });
      return next;
    });
  }, []);

  // Header actions
  const updateHeaderFields = useCallback((updates: Partial<InvoiceHeaderData>) => {
    const changes: Partial<InvoiceHeaderData> = { ...updates };
    if ('inv_no' in changes) {
      // A number typed into the field is the user's own and is never replaced
      // by a suggestion. An emptied field holds no number to keep.
      changes.inv_no_typed = Number(changes.inv_no) > 0;
      nextNumberRequest.current += 1;
    }
    dispatch(updateHeader(changes));
    Object.keys(updates).forEach((field) => {
      dispatch(clearValidationError(field));
    });
    clearLocalErrors(Object.keys(updates));

    // A new invoice whose date moved to another financial year: the suggested
    // number belonged to the year before, so the next one of this year is asked for.
    if (isCreateMode && changes.inv_date) {
      const finYear = calculateFinancialYear(changes.inv_date);
      const typed = 'inv_no' in changes ? changes.inv_no_typed : header.inv_no_typed;
      if (finYear !== header.inv_fin_year && !typed) {
        void requestNextNumber(finYear);
      }
    }
  }, [dispatch, clearLocalErrors, isCreateMode, header.inv_fin_year, header.inv_no_typed, requestNextNumber]);

  const updateHeaderField = useCallback((field: keyof InvoiceHeaderData, value: unknown) => {
    updateHeaderFields({ [field]: value });
  }, [updateHeaderFields]);

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
        showAlert(t('invoice.form.checkInvoiceTitle'), describeValidationErrors(validation.errors));
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
  const submitForm = useCallback(async (): Promise<{ success: boolean; invoiceId?: string; invoiceNo?: number; total?: number | null; error?: string }> => {
    // Validate full invoice
    const validation = await validateFullInvoice({ header, items });
    if (!validation.isValid) {
      showAlert(t('invoice.form.checkInvoiceTitle'), describeValidationErrors(validation.errors));
      return { success: false, error: t('errors.general.validationFailed') };
    }

    dispatch(setIsSaving(true));

    try {
      // A new invoice: ask the server once more whether the GRN can still be
      // invoiced and has the same dispatch lines. An existing invoice holds
      // its GRN already, so the same question would always be refused.
      if (isCreateMode) {
        const check = await checkGrnStillInvoiceable(header.gr_id, items);
        if (!check.ok) {
          showAlert(t('invoice.form.saveFailedTitle'), check.message);
          return { success: false, error: check.message };
        }
      }

      // Transform header to match CreateInvoicePayload format
      // The service internally converts inv_fin_year from string to number
      const payload = {
        header: {
          ...header,
          inv_fin_year: parseInt(String(header.inv_fin_year).split('-')[0], 10),
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
          total: result.data?.total ?? null,
        };
      } else {
        showAlert(t('invoice.form.saveFailedTitle'), serverText(result.message, t('common.checkConnection')));
        return { success: false, error: result.message };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useInvoiceForm] Submit error:', error);
      showAlert(t('invoice.form.saveFailedTitle'), t('common.checkConnection'));
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
    // An answer still on its way belongs to the form that is being thrown away.
    nextNumberRequest.current += 1;
    setNextNumberFailed(false);
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
    nextNumberFailed,
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
