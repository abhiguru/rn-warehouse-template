/**
 * useDispatchForm Hook
 *
 * Custom hook that consolidates Dispatch form logic from multiple screen components.
 * Handles form initialization, validation, navigation, and data management.
 *
 * ## Dispatch number check
 *
 * When the user types a dispatch number, the hook asks the server whether it is taken:
 * - taken by another dispatch → the field shows "already exists" and step 1
 *   does not pass; the form (items, photos, mode) is left exactly as it was
 * - the number of the dispatch being edited → nothing to report
 * - free, or the check failed → nothing to report (the server refuses a
 *   duplicate on save in any case)
 *
 * The check never navigates and never loads or resets the form: its answer has
 * no items and no photos.
 *
 * ### Key Patterns Used:
 *
 * 1. **AbortController for Debounce** (`dispNoChangeAbortRef`)
 *    - Cancels pending checks when user types quickly
 *    - 750ms debounce before checking database
 *    - Minimum 5 characters before checking
 *
 * 2. **Module-Level Session ID** (`globalSessionId`)
 *    - Persists across hook instances (survives route changes)
 *    - Incremented before navigation to cancel in-flight async operations
 *    - Checked in async functions before updating Redux state
 *
 * 3. **Redux-Based Load Check** (NOT ref-based)
 *    - Each step screen creates NEW hook instance with fresh refs
 *    - previousDispatchIdParamRef resets to undefined on each step
 *    - Instead, we check: `dispatchId === dispatchIdParam` (Redux persists across steps)
 *    - This prevents reloading data when navigating Step 1 → Step 2 → Step 3
 *
 * 4. **Dependency Array Management**
 *    - dispatchId is NOT in load effect deps (prevents reload on resetForm)
 *    - Only dispatchIdParam triggers reload (URL param change = new Dispatch to load)
 *
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useStore } from 'react-redux';
import type { RootState } from '@/store';
import {
  updateHeader,
  setDispatchId,
  addItem,
  addItems,
  updateItem,
  removeItem,
  replaceItems,
  clearItems,
  addImage,
  updateImageProgress,
  updateImageStatus,
  removeImage,
  setCurrentStep,
  setIsLoading,
  setIsSaving,
  setValidationErrors,
  clearValidationErrors,
  clearFieldError,
  setTakenNumberError,
  selectDispatchTakenNumberError,
  loadDispatchData,
  resetForm,
  loadFromOrder,
  selectHasFormData,
  selectItemCount,
  selectIsReadyToSubmit,
} from '@/store/slices/dispatchFormSlice';
import type {
  DispatchHeaderData,
  DispatchItemData,
  DispatchImageData,
} from '@/types/dispatch.types';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateDispatchDateVsGRNDates,
} from '@/features/dispatch/schemas/dispatchValidation';
import {
  getNextDispatchNumber,
  createDispatch,
  updateDispatch,
  loadDispatchData as loadDispatchDataService,
  checkDispatchExists,
} from '@/features/dispatch/services/dispatchFormService';

import { showAlert } from '@/utils/alert';
import { createLogger } from '@/utils/logger';
import { LOCAL_PHOTO_OWNERS, releaseLocalPhotos, releaseLocalPhotosOwnedBy } from '@/utils/localPhotoFiles';
import { t, formatIdentifier } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { validationSummary } from '@/utils/validationSummary';
import { documentNumberState } from '@/utils/documentNumberCheck';
import { linesFromOtherCustomers } from '@/features/dispatch/utils/lotOwnership';
/**
 * Module-level session ID that persists across all hook instances.
 * This allows cancellation to work when navigating between create/edit routes.
 *
 * Pattern: Increment before navigation, check in async functions before state updates.
 * If session changed, the async operation was cancelled and should not update state.
 */
const log = createLogger('useDispatchForm');

let globalSessionId = 0;

export type DispatchFormMode = 'create' | 'edit';

export interface UseDispatchFormOptions {
  mode: DispatchFormMode;
  dispatchIdParam?: string;
  sourceOrderId?: string;
}

export interface UseDispatchFormReturn {
  // State
  header: DispatchHeaderData;
  items: DispatchItemData[];
  images: DispatchImageData[];
  dispatchId: string | null;
  isLoading: boolean;
  isGeneratingNumber: boolean;
  isSaving: boolean;
  validationErrors: Record<string, string>;
  isCreateMode: boolean;
  hasFormData: boolean;
  itemCount: number;
  isReadyToSubmit: boolean;

  // Initialization
  initializeForm: () => Promise<void>;
  loadExistingDispatch: (id: string) => Promise<void>;
  loadFromOrderData: (orderId: string, orderData: { header: Partial<DispatchHeaderData>; items: DispatchItemData[] }) => void;

  // Header actions
  updateHeaderField: (field: keyof DispatchHeaderData, value: unknown) => void;
  updateHeaderFields: (updates: Partial<DispatchHeaderData>) => void;
  handleDispNoChange: (newDispNo: string) => void;

  // Item actions
  addFormItem: (item: DispatchItemData) => void;
  addFormItems: (items: DispatchItemData[]) => void;
  updateFormItem: (uniqueId: string, updates: Partial<DispatchItemData>) => void;
  removeFormItem: (uniqueId: string) => void;
  replaceAllItems: (items: DispatchItemData[]) => void;
  clearAllItems: () => void;

  // Image actions
  addImageToForm: (image: DispatchImageData) => void;
  updateImageUploadProgress: (imageId: string, progress: number) => void;
  updateImageUploadStatus: (imageId: string, status: 'uploading' | 'completed' | 'failed' | 'pending', url?: string, path?: string) => void;
  removeImageFromForm: (imageId: string) => void;

  // Validation
  validateCurrentStep: (step: number) => Promise<{ isValid: boolean; errors: Record<string, string> }>;
  clearFieldValidationError: (field: string) => void;
  clearAllValidationErrors: () => void;

  // Navigation
  navigateToStep: (step: number) => Promise<boolean>;
  canNavigateToStep: (targetStep: number, currentStep: number) => Promise<boolean>;

  // Submission
  submitForm: (generateInvoice?: boolean, onFailure?: (title: string, message: string) => void) => Promise<{ success: boolean; dispatchId?: string; error?: string; sourceOrderCleared?: boolean; failedPhotos?: DispatchImageData[] }>;

  // Reset
  resetFormState: () => void;
}

/**
 * Custom hook for Dispatch form management
 *
 * Consolidates form logic from:
 * - DispatchHeaderStep.tsx
 * - DispatchItemsStep.tsx
 * - DispatchReviewStep.tsx
 */
/**
 * The form is being reset: the photo files the app wrote for it go, also those
 * of photos removed from it earlier. A file whose upload is still running, or
 * failed and may be retried, is kept until that is settled (see
 * localPhotoFiles); gallery photos are never touched.
 */
function releaseFormPhotoFiles(images: DispatchImageData[]): void {
  const resetAt = Date.now();
  void releaseLocalPhotos(images.map(image => image.image_url));
  void releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.dispatchForm, { createdBefore: resetAt });
}

export function useDispatchForm({
  mode,
  dispatchIdParam,
  sourceOrderId,
}: UseDispatchFormOptions): UseDispatchFormReturn {
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector((state) => state.auth);
  const dispatchFormState = useAppSelector((state) => state.dispatchForm);
  const store = useStore<RootState>();

  // Selectors
  const header = dispatchFormState.header;
  const items = dispatchFormState.items;
  const images = dispatchFormState.images;
  const dispatchId = dispatchFormState.dispatch_id;
  const hasFormData = useAppSelector(selectHasFormData);
  const itemCount = useAppSelector(selectItemCount);
  const isReadyToSubmit = useAppSelector(selectIsReadyToSubmit);

  const isCreateMode = mode === 'create';

  // The form's photos as last rendered, for the reset paths below (a ref, so
  // resetFormState keeps its identity while the form changes).
  const formImagesRef = useRef(images);
  useEffect(() => {
    formImagesRef.current = images;
  }, [images]);

  // Message for a typed number that another dispatch already holds; step 1 does not pass
  // while it is set. It lives in the form slice: a screen's own copy was lost when step 1
  // was left and reopened.
  const takenNumberError = useAppSelector(selectDispatchTakenNumberError);

  // Local state
  const [validationErrors, setLocalValidationErrors] = useState<Record<string, string>>(
    (): Record<string, string> => (takenNumberError ? { disp_no: takenNumberError } : {})
  );

  const [isGeneratingNumber, setIsGeneratingNumber] = useState(isCreateMode && !header.disp_no);

  // AbortController for cancelling pending dispatch number change operations
  const dispNoChangeAbortRef = useRef<AbortController | null>(null);

  // Refs to prevent duplicate operations
  const hasInitialized = useRef(false);
  const hasGeneratedDispNo = useRef(false);
  const hasSetSupervisor = useRef(false);
  const isLoadingData = useRef(false);
  const previousModeRef = useRef<DispatchFormMode | null>(null);
  // Track the previous dispatchIdParam to detect when we need to reload
  const previousDispatchIdParamRef = useRef<string | undefined>(undefined);

  /**
   * Initialize form for create mode
   */
  const initializeForm = useCallback(async () => {
    console.log('[useDispatchForm] initializeForm called:', {
      isCreateMode,
      hasInitialized: hasInitialized.current,
      globalSessionId,
    });

    if (!isCreateMode || hasInitialized.current) {
      console.log('[useDispatchForm] initializeForm skipped - not create mode or already initialized');
      return;
    }
    hasInitialized.current = true;

    // Capture global session ID at start of operation
    const currentSessionId = globalSessionId;
    console.log('[useDispatchForm] initializeForm started with session:', currentSessionId);

    // Generate dispatch number
    if (!header.disp_no && !hasGeneratedDispNo.current) {
      hasGeneratedDispNo.current = true;
      setIsGeneratingNumber(true);
      try {
        const disp_no = await getNextDispatchNumber();
        // Check if session changed before updating state (prevents stale updates after navigation)
        if (globalSessionId !== currentSessionId) {
          console.log('[useDispatchForm] Dispatch number generation cancelled - session changed from', currentSessionId, 'to', globalSessionId);
          return;
        }
        dispatch(updateHeader({ disp_no }));
      } catch (error) {
        console.error('[useDispatchForm] Failed to generate dispatch number:', error);
        if (globalSessionId === currentSessionId) {
          showAlert(t('dispatch.wizard.errorTitle'), t('dispatch.wizard.numberFailed'));
        }
      } finally {
        setIsGeneratingNumber(false);
      }
    } else {
      setIsGeneratingNumber(false);
    }

    // Check session again before supervisor update
    if (globalSessionId !== currentSessionId) return;

    // Auto-set supervisor to current user
    if (!header.supervisor_id && userProfile && !hasSetSupervisor.current) {
      hasSetSupervisor.current = true;
      log.debug('Auto-setting supervisor to the current user');
      dispatch(updateHeader({
        supervisor_id: userProfile.id,
        supervisor_name: userProfile.name,
      }));
    }
  }, [isCreateMode, header.disp_no, header.supervisor_id, userProfile, dispatch]);

  /**
   * Load existing dispatch data for edit mode
   */
  const loadExistingDispatch = useCallback(async (id: string) => {
    console.log('[useDispatchForm] loadExistingDispatch called for id:', id, {
      isLoadingData: isLoadingData.current,
      globalSessionId,
    });

    if (isLoadingData.current) {
      console.log('[useDispatchForm] loadExistingDispatch skipped - already loading');
      return;
    }
    isLoadingData.current = true;

    // Capture global session ID at start of operation
    const currentSessionId = globalSessionId;
    console.log('[useDispatchForm] loadExistingDispatch started with session:', currentSessionId);

    dispatch(setIsLoading(true));
    try {
      const result = await loadDispatchDataService(id);
      // Check if session changed before updating state (prevents stale updates after navigation)
      if (globalSessionId !== currentSessionId) {
        console.log('[useDispatchForm] Load dispatch cancelled - session changed from', currentSessionId, 'to', globalSessionId);
        return;
      }
      if (result.success && result.data) {
        dispatch(loadDispatchData({
          dispatchId: id,
          header: result.data.header,
          items: result.data.items,
          images: [], // Images are not loaded from edit; they can be added fresh
        }));
      } else {
        if (globalSessionId === currentSessionId) {
          showAlert(t('dispatch.wizard.errorTitle'), serverText(result.error, t('dispatch.wizard.loadFailed')));
        }
      }
    } catch (error) {
      console.error('[useDispatchForm] Failed to load dispatch:', error);
      if (globalSessionId === currentSessionId) {
        showAlert(t('dispatch.wizard.errorTitle'), t('dispatch.wizard.loadFailed'));
      }
    } finally {
      dispatch(setIsLoading(false));
      isLoadingData.current = false;
    }
  }, [dispatch]);

  /**
   * Load from order data (order-to-dispatch flow)
   */
  const loadFromOrderData = useCallback((
    orderId: string,
    orderData: { header: Partial<DispatchHeaderData>; items: DispatchItemData[] }
  ) => {
    dispatch(loadFromOrder({
      header: orderData.header,
      items: orderData.items,
      source_order_id: orderId,
    }));
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
  const updateHeaderField = useCallback((field: keyof DispatchHeaderData, value: unknown) => {
    dispatch(updateHeader({ [field]: value }));
    dispatch(clearFieldError(field));
    clearLocalErrors([field]);
  }, [dispatch, clearLocalErrors]);

  const updateHeaderFields = useCallback((updates: Partial<DispatchHeaderData>) => {
    dispatch(updateHeader(updates));
    Object.keys(updates).forEach((field) => {
      dispatch(clearFieldError(field));
    });
    clearLocalErrors(Object.keys(updates));
  }, [dispatch, clearLocalErrors]);

  /**
   * Handle dispatch number change
   *
   * This function:
   * 1. Updates Redux immediately so UI is responsive
   * 2. Waits 750ms (debounce) before checking if number exists
   * 3. If another dispatch holds the number, reports it on the field
   *
   * It never navigates and never resets or reloads the form: the check's answer
   * has no items and no photos, and a number that is free while editing is just
   * this dispatch being given a new number.
   * Uses AbortController to cancel pending operations when user types more
   */
  const handleDispNoChange = useCallback((newDispNo: string) => {
    // Cancel any pending operation
    dispNoChangeAbortRef.current?.abort();
    dispNoChangeAbortRef.current = new AbortController();
    const signal = dispNoChangeAbortRef.current.signal;

    // Update Redux immediately so UI is responsive
    dispatch(updateHeader({ disp_no: newDispNo }));
    dispatch(clearFieldError('disp_no'));
    dispatch(setTakenNumberError(null));
    clearLocalErrors(['disp_no']);

    // Start async operation
    (async () => {
      // Skip check if < 5 chars
      if (newDispNo.length < 5) {
        log.debug('Number check skipped: fewer than 5 characters');
        return;
      }

      // Debounce 750ms
      await new Promise(r => setTimeout(r, 750));
      if (signal.aborted) {
        log.debug('Number check dropped after the wait');
        return;
      }

      // The typed number is not logged.
      log.debug('Checking whether the typed dispatch number exists');

      // Check existence
      const result = await checkDispatchExists(newDispNo);
      if (signal.aborted) {
        log.debug('Number check dropped after the answer');
        return;
      }

      // In edit mode the dispatch's own number is not a duplicate.
      const state = documentNumberState(
        { exists: result.exists, id: result.dispatchId, error: result.error },
        mode === 'edit' ? dispatchIdParam : null
      );
      log.debug('Number check result', { state });
      if (state !== 'taken') return;

      const takenNumber = result.dispNo || newDispNo;
      const message = result.customerName
        ? t('dispatch.wizard.numberTakenFor', { number: formatIdentifier(takenNumber), customer: result.customerName })
        : t('dispatch.wizard.numberTaken', { number: formatIdentifier(takenNumber) });
      dispatch(setTakenNumberError(message));
      setLocalValidationErrors((prev) => ({ ...prev, disp_no: message }));
    })();
  }, [dispatchIdParam, mode, dispatch, clearLocalErrors]);

  // Item actions
  const addFormItem = useCallback((item: DispatchItemData) => {
    dispatch(addItem(item));
  }, [dispatch]);

  const addFormItems = useCallback((itemsToAdd: DispatchItemData[]) => {
    dispatch(addItems(itemsToAdd));
  }, [dispatch]);

  const updateFormItem = useCallback((uniqueId: string, updates: Partial<DispatchItemData>) => {
    dispatch(updateItem({ uniqueId, updates }));
  }, [dispatch]);

  const removeFormItem = useCallback((uniqueId: string) => {
    dispatch(removeItem(uniqueId));
  }, [dispatch]);

  const replaceAllItems = useCallback((itemsToSet: DispatchItemData[]) => {
    dispatch(replaceItems(itemsToSet));
  }, [dispatch]);

  const clearAllItems = useCallback(() => {
    dispatch(clearItems());
  }, [dispatch]);

  // Image actions
  const addImageToForm = useCallback((image: DispatchImageData) => {
    dispatch(addImage(image));
  }, [dispatch]);

  const updateImageUploadProgress = useCallback((imageId: string, progress: number) => {
    dispatch(updateImageProgress({ id: imageId, progress }));
  }, [dispatch]);

  const updateImageUploadStatus = useCallback((
    imageId: string,
    status: 'uploading' | 'completed' | 'failed' | 'pending',
    imageUrl?: string,
    storagePath?: string
  ) => {
    dispatch(updateImageStatus({ id: imageId, status, imageUrl, storagePath }));
  }, [dispatch]);

  const removeImageFromForm = useCallback((imageId: string) => {
    dispatch(removeImage(imageId));
  }, [dispatch]);

  /**
   * Validate a specific step
   */
  const validateCurrentStep = useCallback(async (step: number): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
    // Read the store, not the values from the last render: the items step saves the item being typed and
    // asks for the next step in the same tap, and the saved item is not in this render yet.
    const { header, items } = store.getState().dispatchForm;
    let result: { isValid: boolean; errors: Record<string, string> };

    console.log('[useDispatchForm] validateCurrentStep called for step:', step);

    switch (step) {
      case 1:
        console.log('[useDispatchForm] Validating step 1');
        result = await validateStep1(header);
        console.log('[useDispatchForm] Step 1 validation result:', result);
        break;
      case 2:
        console.log('[useDispatchForm] Validating step 2 - items count:', items.length);
        // NOTE: validateStep2 expects { items: [...] } not just the array
        result = await validateStep2({ items });
        console.log('[useDispatchForm] Step 2 validation result:', result);
        break;
      case 3:
        console.log('[useDispatchForm] Validating step 3 - header + items');
        console.log('[useDispatchForm] 🔍 Header disp_date:', header.disp_date, 'type:', typeof header.disp_date);
        console.log('[useDispatchForm] 🔍 Items count:', items.length);
        if (items.length > 0) {
          console.log('[useDispatchForm] 🔍 First item grns_date:', items[0].grns_date);
          console.log('[useDispatchForm] 🔍 Items grns_dates:', items.map(i => ({ grns_gr_no: i.grns_gr_no, grns_date: i.grns_date })));
        }
        // Step 3 includes cross-validation
        result = await validateStep3({ header, items });
        console.log('[useDispatchForm] Step 3 validation result:', result);
        if (result.isValid) {
          // Additional cross-validation: dispatch date vs GRN dates
          console.log('[useDispatchForm] 🔍 Running date cross-validation...');
          const dateValidation = validateDispatchDateVsGRNDates(header.disp_date, items);
          console.log('[useDispatchForm] Date cross-validation result:', dateValidation);
          if (!dateValidation.isValid) {
            result = {
              isValid: false,
              errors: { disp_date: serverText(dateValidation.error, t('dispatch.validation.dispatchDateInvalid')) },
            };
          }
        }
        break;
      default:
        result = { isValid: true, errors: {} };
    }

    // A dispatch only takes stock of its own customer. The server refuses such a line too;
    // this stops the form before the whole dispatch has been reviewed.
    if (step === 2 || step === 3) {
      const otherCustomerGrns = [
        ...new Set(linesFromOtherCustomers(header.customer_id, items).map((line) => line.grns_gr_no)),
      ];
      if (otherCustomerGrns.length > 0) {
        result = {
          isValid: false,
          errors: {
            ...result.errors,
            items: t('dispatch.validation.otherCustomerLots', {
              grns: otherCustomerGrns.map((grNo) => formatIdentifier(grNo)).join(', '),
            }),
          },
        };
      }
    }

    // A number another dispatch holds keeps step 1 from passing until it is changed.
    if (step === 1 && takenNumberError) {
      result = { isValid: false, errors: { ...result.errors, disp_no: takenNumberError } };
    }

    if (!result.isValid) {
      console.log('[useDispatchForm] Validation FAILED - errors:', result.errors);
      setLocalValidationErrors(result.errors);
      dispatch(setValidationErrors(result.errors));
    } else {
      console.log('[useDispatchForm] Validation PASSED');
      setLocalValidationErrors({});
      dispatch(setValidationErrors({}));
    }

    return result;
  }, [store, dispatch, takenNumberError]);

  const clearFieldValidationError = useCallback((field: string) => {
    setLocalValidationErrors((prev) => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
    dispatch(clearFieldError(field));
  }, [dispatch]);

  const clearAllValidationErrors = useCallback(() => {
    setLocalValidationErrors({});
    dispatch(clearValidationErrors());
  }, [dispatch]);

  /**
   * Check if navigation to a target step is allowed
   */
  const canNavigateToStep = useCallback(async (targetStep: number, currentStep: number): Promise<boolean> => {
    console.log(`[useDispatchForm] canNavigateToStep: ${currentStep} -> ${targetStep}`);

    // Can always go back
    if (targetStep < currentStep) {
      console.log('[useDispatchForm] Going back - no validation needed');
      return true;
    }

    // Validate all steps before target
    for (let step = currentStep; step < targetStep; step++) {
      console.log(`[useDispatchForm] Validating step ${step} before navigating to ${targetStep}`);
      const validation = await validateCurrentStep(step);
      if (!validation.isValid) {
        const errorFields = Object.keys(validation.errors);
        const errorMessage = validationSummary(validation.errors) || t('dispatch.validation.fillRequired');
        console.log(`[useDispatchForm] Navigation blocked - step ${step} validation failed:`, errorFields);
        showAlert(t('dispatch.validation.title'), errorMessage);
        return false;
      }
    }

    console.log('[useDispatchForm] All validations passed, navigation allowed');
    return true;
  }, [validateCurrentStep]);

  /**
   * Navigate to a specific step
   */
  const navigateToStep = useCallback(async (step: number): Promise<boolean> => {
    const currentStep = dispatchFormState.current_step;
    console.log(`[useDispatchForm] navigateToStep called: currentStep=${currentStep}, targetStep=${step}`);

    const canNavigate = await canNavigateToStep(step, currentStep);

    if (!canNavigate) {
      console.log('[useDispatchForm] Navigation denied by canNavigateToStep');
      return false;
    }

    dispatch(setCurrentStep(step));

    // Determine route based on mode
    const baseRoute = isCreateMode ? '/dispatch-form' : `/dispatch-edit/${dispatchId}`;
    const route = `${baseRoute}/step${step}`;
    console.log(`[useDispatchForm] Navigating to route: ${route}`);

    switch (step) {
      case 1:
        router.replace(`${baseRoute}/step1`);
        break;
      case 2:
        router.replace(`${baseRoute}/step2`);
        break;
      case 3:
        router.replace(`${baseRoute}/step3`);
        break;
    }

    return true;
  }, [dispatchFormState.current_step, canNavigateToStep, isCreateMode, dispatchId, dispatch]);

  /**
   * Submit the form (create or update)
   */
  const submitForm = useCallback(async (generateInvoice: boolean = false, onFailure?: (title: string, message: string) => void): Promise<{ success: boolean; dispatchId?: string; error?: string; sourceOrderCleared?: boolean; failedPhotos?: DispatchImageData[] }> => {
    // The caller may hold the error until a dialog still closing is gone (iOS shows no Modal over it)
    const report = onFailure ?? showAlert;
    // Validate step 3
    const validation = await validateCurrentStep(3);
    if (!validation.isValid) {
      report(t('dispatch.validation.title'), validationSummary(validation.errors) || t('dispatch.validation.fillRequired'));
      return { success: false, error: t('dispatch.validation.failed') };
    }

    dispatch(setIsSaving(true));

    try {
      const payload = {
        header,
        items,
        images,
        generateInvoice,
      };

      const result = isCreateMode
        ? await createDispatch(payload)
        : await updateDispatch(dispatchId!, payload);

      if (result.success) {
        return {
          success: true,
          dispatchId: result.dispatch_id,
          sourceOrderCleared: result.source_order_cleared,
          failedPhotos: result.failed_photos ?? [],
        };
      } else {
        report(t('dispatch.wizard.errorTitle'), serverText(result.error, t('dispatch.wizard.saveFailed')));
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('dispatch.wizard.unknownError');
      console.error('[useDispatchForm] Submit error:', error);
      report(t('dispatch.wizard.errorTitle'), errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      dispatch(setIsSaving(false));
    }
  }, [header, items, images, dispatchId, isCreateMode, validateCurrentStep, dispatch]);

  /**
   * Reset form to initial state
   *
   * NOTE: We intentionally do NOT reset instance-local refs (hasInitialized, hasGeneratedDispNo, etc.)
   * because they are component-scoped - when we navigate, a new component with fresh refs is created.
   */
  const resetFormState = useCallback(() => {
    console.log('[useDispatchForm] resetFormState called');

    // Cancel any pending dispatch number change operation
    dispNoChangeAbortRef.current?.abort();

    // Increment GLOBAL session ID to invalidate any pending async operations across all hook instances
    globalSessionId += 1;
    console.log('[useDispatchForm] Global session incremented to:', globalSessionId);

    setLocalValidationErrors({});
    releaseFormPhotoFiles(formImagesRef.current);
    dispatch(resetForm());
  }, [dispatch]);

  // Track mode changes (for cases where component is reused with different mode)
  // NOTE: With router.replace(), a new component instance is created, so this effect rarely fires.
  // When it does fire (same component, different mode), we increment session to invalidate old operations.
  // We do NOT reset instance refs because that would trigger re-initialization race conditions.
  useEffect(() => {
    if (previousModeRef.current !== null && previousModeRef.current !== mode) {
      console.log('[useDispatchForm] Mode changed from', previousModeRef.current, 'to', mode, '- incrementing session');
      // Increment session to invalidate any pending operations from the old mode
      globalSessionId += 1;
      console.log('[useDispatchForm] Global session incremented to:', globalSessionId, 'due to mode change');
      // DO NOT reset instance refs - let the new mode's useEffect handle initialization
    }
    previousModeRef.current = mode;
  }, [mode]);

  // Auto-initialize for create mode
  useEffect(() => {
    console.log('[useDispatchForm] Auto-init effect running:', {
      isCreateMode,
      hasInitialized: hasInitialized.current,
    });

    if (isCreateMode && !hasInitialized.current) {
      console.log('[useDispatchForm] Auto-init calling initializeForm()');
      initializeForm();
    }
  }, [isCreateMode, initializeForm]);

  // Load data for edit mode when dispatchIdParam changes
  // NOTE: dispatchId is intentionally NOT in the dependency array to prevent
  // re-loading when resetForm() sets dispatchId to null during navigation
  useEffect(() => {
    console.log('[useDispatchForm] Load effect running:', {
      isCreateMode,
      dispatchIdParam,
      previousDispatchIdParam: previousDispatchIdParamRef.current,
      reduxDispatchId: dispatchId,
      isLoadingData: isLoadingData.current,
    });

    // Only load if:
    // 1. We're in edit mode
    // 2. We have a dispatchIdParam
    // 3. Redux doesn't already have this dispatch loaded (dispatchId !== dispatchIdParam)
    // 4. Not already loading
    // NOTE: We check dispatchId !== dispatchIdParam instead of using previousDispatchIdParamRef
    // because the ref is local to each hook instance and resets when navigating between steps.
    // Redux state persists across step navigation, so it's a reliable indicator.
    if (!isCreateMode && dispatchIdParam && !isLoadingData.current) {
      const alreadyLoaded = dispatchId === dispatchIdParam;
      const shouldLoad = !alreadyLoaded;

      console.log('[useDispatchForm] Load check:', { alreadyLoaded, shouldLoad });

      if (shouldLoad) {
        console.log('[useDispatchForm] Load effect calling loadExistingDispatch:', dispatchIdParam);
        // Reset form before loading new data to prevent stale data flash
        if (previousDispatchIdParamRef.current && previousDispatchIdParamRef.current !== dispatchIdParam) {
          console.log('[useDispatchForm] Dispatch ID changed, resetting form first');
          releaseFormPhotoFiles(formImagesRef.current);
          dispatch(resetForm());
        }
        loadExistingDispatch(dispatchIdParam);
      }
    }

    previousDispatchIdParamRef.current = dispatchIdParam;
  }, [isCreateMode, dispatchIdParam, loadExistingDispatch, dispatch]);

  return {
    // State
    header,
    items,
    images,
    dispatchId,
    isLoading: dispatchFormState.is_loading,
    isGeneratingNumber,
    isSaving: dispatchFormState.is_saving,
    validationErrors,
    isCreateMode,
    hasFormData,
    itemCount,
    isReadyToSubmit,

    // Initialization
    initializeForm,
    loadExistingDispatch,
    loadFromOrderData,

    // Header actions
    updateHeaderField,
    updateHeaderFields,
    handleDispNoChange,

    // Item actions
    addFormItem,
    addFormItems,
    updateFormItem,
    removeFormItem,
    replaceAllItems,
    clearAllItems,

    // Image actions
    addImageToForm,
    updateImageUploadProgress,
    updateImageUploadStatus,
    removeImageFromForm,

    // Validation
    validateCurrentStep,
    clearFieldValidationError,
    clearAllValidationErrors,

    // Navigation
    navigateToStep,
    canNavigateToStep,

    // Submission
    submitForm,

    // Reset
    resetFormState,
  };
}

export default useDispatchForm;
