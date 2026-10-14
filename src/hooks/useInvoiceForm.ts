/**
 * useInvoiceForm Hook
 *
 * Custom hook that consolidates Invoice form logic from multiple screen components.
 * Handles form initialization, validation, navigation, pricing calculations, and data management.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { router, type Href } from 'expo-router';
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
  applySavedRates,
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
  GroupRates,
} from '@/types/invoice.types';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateFullInvoice,
  validateNewInvoiceStep1,
  validateNewInvoice,
} from '@/features/invoice/schemas/invoiceValidation';
import {
  getNextInvoiceNumber,
  loadInvoiceFormData as loadInvoiceFormDataService,
  loadInvoiceData as loadInvoiceDataService,
  createInvoice,
  updateInvoice,
  checkGrnStillInvoiceable,
} from '@/features/invoice/services/invoiceFormService';

import { describeValidationErrors } from '@/features/invoice/utils/validationMessages';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { calculateFinancialYear } from '@/utils/invoiceCalculations';

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
  bulkPricing: Record<string, GroupRates>;
  invoiceId: string | null;
  selectedGrId: string | null;
  isLoading: boolean;
  nextNumberFailed: boolean;
  /** The next invoice number is being asked for: the field is empty and the form does not go on. */
  isGettingNextNumber: boolean;
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
  /** Asks for the suggested number again when the field of a new invoice is empty. True when it asked. */
  suggestNumberIfEmpty: () => boolean;

  // Item actions
  setFormItems: (items: InvoiceItemData[]) => void;
  updateFormItem: (tempId: string, updates: Partial<InvoiceItemData>) => void;
  updateItemPricing: (tempId: string, values: Partial<EditedItemValues>) => void;

  // Bulk pricing actions
  applyBulkPricing: (values: Partial<EditedItemValues>) => void;
  /** Sets the given rates on the lines of a group; a rate left out is not touched. */
  applyGroupPricing: (groupKey: string, pricing: GroupRates) => void;
  /** Sets saved rates line by line; typed line rates are kept and no override mark is added. */
  applySavedRatesToLines: (rates: Array<{ temp_id: string; charge: number; labour_rate: number; tax: number }>) => void;

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
  // True while the next invoice number is being asked for. The field is empty for
  // that time and the form does not go on to the next step.
  const [isGettingNextNumber, setIsGettingNextNumber] = useState(false);

  // Refs to prevent duplicate operations
  const hasInitialized = useRef(false);
  const hasGeneratedInvNo = useRef(false);
  const isLoadingData = useRef(false);
  // Counts the requests for the next invoice number; an answer is used only while its request is the latest.
  const nextNumberRequest = useRef(0);
  // True while navigateToStep checks the form before it moves to a step.
  const isNavigating = useRef(false);

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
    setIsGettingNextNumber(true);
    setNextNumberFailed(false);
    const noNumber = () => {
      setNextNumberFailed(true);
      dispatch(updateHeader({ inv_no: 0, inv_no_typed: false }));
    };
    try {
      const result = await getNextInvoiceNumber(finYear);
      // Whatever took this request's place has also ended its wait.
      if (request !== nextNumberRequest.current) return;
      setIsGettingNextNumber(false);
      if (result.success && result.data) {
        dispatch(updateHeader({ inv_no: result.data.next_invoice_number, inv_no_typed: false }));
        // A message about a missing number (Next pressed too early) no longer applies.
        dispatch(clearValidationError('inv_no'));
        setLocalValidationErrors((prev) => {
          if (!('inv_no' in prev)) return prev;
          const next = { ...prev };
          delete next.inv_no;
          return next;
        });
      } else {
        noNumber();
      }
    } catch (error) {
      if (request !== nextNumberRequest.current) return;
      setIsGettingNextNumber(false);
      noNumber();
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
      // An answer still on its way is not put into a field the user is typing in.
      nextNumberRequest.current += 1;
      setIsGettingNextNumber(false);
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
        // The number in the field was the next one of the year before. It leaves
        // the field now, not when the answer arrives: until then it could be
        // taken for this year's number, edited and saved.
        dispatch(updateHeader({ inv_no: 0, inv_no_typed: false }));
        void requestNextNumber(finYear);
      }
    }
  }, [dispatch, clearLocalErrors, isCreateMode, header.inv_fin_year, header.inv_no_typed, requestNextNumber]);

  /**
   * A new invoice whose number field is empty gets the suggestion of its
   * financial year again. Called when the field is left, and before the form
   * goes on to the next step; never while the user is in the field, where a
   * number arriving between two key presses would be typed into ("55" + "7").
   * Nothing is asked after a lookup that failed: the form then asks for a
   * typed number. Returns true when a request was started.
   */
  const suggestNumberIfEmpty = useCallback((): boolean => {
    if (!isCreateMode || isGettingNextNumber || nextNumberFailed) return false;
    if (Number(header.inv_no) > 0) return false;
    void requestNextNumber(header.inv_fin_year);
    return true;
  }, [isCreateMode, isGettingNextNumber, nextNumberFailed, header.inv_no, header.inv_fin_year, requestNextNumber]);

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

  const applyGroupPricing = useCallback((groupKey: string, pricing: GroupRates) => {
    dispatch(bulkUpdateItemGroupPricing({ group_key: groupKey, pricing }));
  }, [dispatch]);

  const applySavedRatesToLines = useCallback(
    (rates: Array<{ temp_id: string; charge: number; labour_rate: number; tax: number }>) => {
      dispatch(applySavedRates(rates));
    },
    [dispatch]
  );

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
      // A new invoice's number also has the server's ceiling (backend migration 73).
      case 1:
        result = await (isCreateMode ? validateNewInvoiceStep1 : validateStep1)(header);
        break;
      case 2:
        result = await validateStep2(items);
        break;
      case 3:
        result = await (isCreateMode ? validateNewInvoice : validateStep3)({ header, items });
        break;
      case 4:
        result = await (isCreateMode ? validateNewInvoice : validateFullInvoice)({ header, items });
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
  }, [header, items, dispatch, isCreateMode]);

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
    if (step < 1 || step > 4) return false;
    // A second tap while the first is still being checked does nothing.
    if (isNavigating.current) return false;
    const currentStep = invoiceFormState.currentStep;
    // Going on waits for the invoice number: while it is being asked for, and
    // when the field was emptied (it is then asked for first).
    if (step > currentStep && (isGettingNextNumber || suggestNumberIfEmpty())) return false;
    isNavigating.current = true;
    try {
      const canNavigate = await canNavigateToStep(step, currentStep);
      if (!canNavigate) return false;

      dispatch(setCurrentStep(step));

      const route = `${isCreateMode ? '/invoice-form' : `/invoice-edit/${invoiceId}`}/step${step}` as Href;
      if (step < currentStep) {
        // Back to a step that is already in the stack: the steps above it are
        // taken off. A push here added a second entry of that step, and the
        // form's Discard then showed the one under it, emptied.
        router.dismissTo(route);
      } else {
        // `navigate` does nothing when the step is already in front, so a tap
        // that lands after the step opened does not open it a second time.
        router.navigate(route);
      }
      return true;
    } finally {
      isNavigating.current = false;
    }
  }, [invoiceFormState.currentStep, canNavigateToStep, isCreateMode, invoiceId, dispatch, isGettingNextNumber, suggestNumberIfEmpty]);

  /**
   * Submit the form (create or update)
   */
  const submitForm = useCallback(async (): Promise<{ success: boolean; invoiceId?: string; invoiceNo?: number; total?: number | null; error?: string }> => {
    // Validate full invoice
    const validation = await (isCreateMode ? validateNewInvoice : validateFullInvoice)({ header, items });
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
    setIsGettingNextNumber(false);
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
    isGettingNextNumber,
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
    suggestNumberIfEmpty,

    // Item actions
    setFormItems,
    updateFormItem,
    updateItemPricing,

    // Bulk pricing actions
    applyBulkPricing,
    applyGroupPricing,
    applySavedRatesToLines,

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
