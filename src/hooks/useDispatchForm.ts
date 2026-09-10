/**
 * useDispatchForm Hook
 *
 * Custom hook that consolidates Dispatch form logic from multiple screen components.
 * Handles form initialization, validation, navigation, and data management.
 *
 * ## Auto-Navigation Feature (Dispatch Number Change Detection)
 *
 * When user types a Dispatch number, the hook automatically:
 * - In CREATE mode: If number exists → navigates to EDIT mode for that Dispatch
 * - In EDIT mode: If number doesn't exist → navigates to CREATE mode
 * - In EDIT mode: If number exists but different → navigates to EDIT that Dispatch
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
 * ### Important: For Invoice Form Implementation
 * When implementing similar auto-navigation for invoices, follow these patterns.
 * See plan file: ~/.claude/plans/buzzing-leaping-spark.md for detailed guide.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
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

/**
 * Module-level session ID that persists across all hook instances.
 * This allows cancellation to work when navigating between create/edit routes.
 *
 * Pattern: Increment before navigation, check in async functions before state updates.
 * If session changed, the async operation was cancelled and should not update state.
 */
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
  submitForm: (generateInvoice?: boolean) => Promise<{ success: boolean; dispatchId?: string; error?: string; sourceOrderCleared?: boolean }>;

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
export function useDispatchForm({
  mode,
  dispatchIdParam,
  sourceOrderId,
}: UseDispatchFormOptions): UseDispatchFormReturn {
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector((state) => state.auth);
  const dispatchFormState = useAppSelector((state) => state.dispatchForm);

  // Selectors
  const header = dispatchFormState.header;
  const items = dispatchFormState.items;
  const images = dispatchFormState.images;
  const dispatchId = dispatchFormState.dispatch_id;
  const hasFormData = useAppSelector(selectHasFormData);
  const itemCount = useAppSelector(selectItemCount);
  const isReadyToSubmit = useAppSelector(selectIsReadyToSubmit);

  const isCreateMode = mode === 'create';

  // Local state
  const [validationErrors, setLocalValidationErrors] = useState<Record<string, string>>({});

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
          Alert.alert('Error', 'Failed to generate dispatch number');
        }
      }
    }

    // Check session again before supervisor update
    if (globalSessionId !== currentSessionId) return;

    // Auto-set supervisor to current user
    if (!header.supervisor_id && userProfile && !hasSetSupervisor.current) {
      hasSetSupervisor.current = true;
      console.log('[useDispatchForm] Auto-setting supervisor to current user:', userProfile.name);
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
          Alert.alert('Error', result.error || 'Failed to load dispatch data');
        }
      }
    } catch (error) {
      console.error('[useDispatchForm] Failed to load dispatch:', error);
      if (globalSessionId === currentSessionId) {
        Alert.alert('Error', 'Failed to load dispatch data');
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

  // Header actions
  const updateHeaderField = useCallback((field: keyof DispatchHeaderData, value: unknown) => {
    dispatch(updateHeader({ [field]: value }));
    dispatch(clearFieldError(field));
  }, [dispatch]);

  const updateHeaderFields = useCallback((updates: Partial<DispatchHeaderData>) => {
    dispatch(updateHeader(updates));
    Object.keys(updates).forEach((field) => {
      dispatch(clearFieldError(field));
    });
  }, [dispatch]);

  /**
   * Handle dispatch number change with auto-navigation
   *
   * This function:
   * 1. Updates Redux immediately so UI is responsive
   * 2. Waits 750ms (debounce) before checking if number exists
   * 3. If exists and different from current, navigates to edit that dispatch
   * 4. If doesn't exist and in edit mode, navigates to create mode
   *
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

    // Start async operation
    (async () => {
      // Skip check if < 5 chars
      if (newDispNo.length < 5) {
        console.log('[useDispatchForm] handleDispNoChange: Skipping check, < 5 chars');
        return;
      }

      // Debounce 750ms
      await new Promise(r => setTimeout(r, 750));
      if (signal.aborted) {
        console.log('[useDispatchForm] handleDispNoChange: Aborted after debounce');
        return;
      }

      console.log('[useDispatchForm] handleDispNoChange: Checking if dispatch exists:', newDispNo);

      // Check existence
      const result = await checkDispatchExists(newDispNo);
      if (signal.aborted) {
        console.log('[useDispatchForm] handleDispNoChange: Aborted after check');
        return;
      }

      console.log('[useDispatchForm] handleDispNoChange: Check result:', result);

      // Navigate if needed
      if (result.exists && result.dispatchId && result.dispatchId !== dispatchIdParam) {
        // Dispatch exists and it's different from current - navigate to edit
        console.log('[useDispatchForm] handleDispNoChange: Navigating to edit mode for:', result.dispatchId);
        globalSessionId += 1;

        // Pre-load dispatch data from checkDispatchExists result (avoids second RPC call)
        if (result.dispatchData) {
          console.log('[useDispatchForm] Pre-loading dispatch data from check result');
          dispatch(loadDispatchData({
            dispatchId: result.dispatchId,
            header: result.dispatchData.header,
            items: result.dispatchData.items,
            images: [],
          }));
        } else {
          dispatch(resetForm());
        }

        router.replace(`/dispatch-edit/${result.dispatchId}/step1`);
      } else if (!result.exists && mode === 'edit') {
        // Dispatch doesn't exist and we're in edit mode - navigate to create
        console.log('[useDispatchForm] handleDispNoChange: Navigating to create mode');
        globalSessionId += 1;
        dispatch(resetForm());
        // After reset, set the dispatch number user typed
        dispatch(updateHeader({ disp_no: newDispNo }));
        router.replace('/dispatch-form/step1');
      }
      // If dispatch exists and matches current (dispatchIdParam), do nothing - already editing it
      // If dispatch doesn't exist and in create mode, do nothing - user is creating new
    })();
  }, [dispatchIdParam, mode, dispatch]);

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
    let result: { isValid: boolean; errors: Record<string, string> };

    console.log('[useDispatchForm] validateCurrentStep called for step:', step);

    switch (step) {
      case 1:
        console.log('[useDispatchForm] Validating step 1 - header:', JSON.stringify(header, null, 2));
        result = await validateStep1(header);
        console.log('[useDispatchForm] Step 1 validation result:', result);
        break;
      case 2:
        console.log('[useDispatchForm] Validating step 2 - items count:', items.length);
        console.log('[useDispatchForm] Items data:', JSON.stringify(items, null, 2));
        // NOTE: validateStep2 expects { items: [...] } not just the array
        result = await validateStep2({ items });
        console.log('[useDispatchForm] Step 2 validation result:', result);
        break;
      case 3:
        console.log('[useDispatchForm] Validating step 3 - header + items');
        console.log('[useDispatchForm] 🔍 Header disp_date:', header.disp_date, 'type:', typeof header.disp_date);
        console.log('[useDispatchForm] 🔍 Header full:', JSON.stringify(header, null, 2));
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
              errors: { disp_date: dateValidation.error || 'Invalid dispatch date' },
            };
          }
        }
        break;
      default:
        result = { isValid: true, errors: {} };
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
  }, [header, items, dispatch]);

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
        const errorMessage = errorFields.length > 0
          ? `Please check: ${errorFields.join(', ')}`
          : 'Please fill all required fields';
        console.log(`[useDispatchForm] Navigation blocked - step ${step} validation failed:`, errorFields);
        Alert.alert('Validation Error', errorMessage);
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
  const submitForm = useCallback(async (generateInvoice: boolean = false): Promise<{ success: boolean; dispatchId?: string; error?: string; sourceOrderCleared?: boolean }> => {
    // Validate step 3
    const validation = await validateCurrentStep(3);
    if (!validation.isValid) {
      const errorFields = Object.keys(validation.errors);
      Alert.alert('Validation Error', `Please check: ${errorFields.join(', ')}`);
      return { success: false, error: 'Validation failed' };
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
        };
      } else {
        Alert.alert('Error', result.error || 'Failed to save dispatch');
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useDispatchForm] Submit error:', error);
      Alert.alert('Error', errorMessage);
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
