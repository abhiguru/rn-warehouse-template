/**
 * useGRNForm Hook
 *
 * Custom hook that consolidates GRN form logic from multiple screen components.
 * Handles form initialization, validation, navigation, and data management.
 *
 * ## Auto-Navigation Feature (GRN Number Change Detection)
 *
 * When user types a GRN number, the hook automatically:
 * - In CREATE mode: If number exists → navigates to EDIT mode for that GRN
 * - In EDIT mode: If number doesn't exist → navigates to CREATE mode
 * - In EDIT mode: If number exists but different → navigates to EDIT that GRN
 *
 * ### Key Patterns Used:
 *
 * 1. **AbortController for Debounce** (`grNoChangeAbortRef`)
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
 *    - previousGrnIdParamRef resets to undefined on each step
 *    - Instead, we check: `grnId === grnIdParam` (Redux persists across steps)
 *    - This prevents reloading data when navigating Step 1 → Step 2 → Step 3
 *
 * 4. **Dependency Array Management**
 *    - grnId is NOT in load effect deps (prevents reload on resetForm)
 *    - Only grnIdParam triggers reload (URL param change = new GRN to load)
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
  addItem,
  updateItem,
  removeItem,
  setValidationErrors,
  clearValidationError,
  setCurrentStep,
  setTempGrnId,
  setIsLoading,
  setIsSaving,
  loadGRNData,
  resetForm,
  addHeaderImage,
  removeHeaderImage,
  addItemImage,
  removeItemImage,
  selectGRNFormHeader,
  selectGRNFormItems,
  selectGRNFormId,
  selectGRNTempId,
  GRNHeaderData,
  GRNItemData,
  GRNImageData,
} from '@/store/slices/grnFormSlice';
import { validateStep1, validateStep2, validateStep3 } from '@/features/grn/schemas/grnValidation';
import { getNextGRNNumber, createGRN, updateGRN, loadGRNData as loadGRNDataService, checkGrnExists } from '@/features/grn/services/grnFormService';
import { generateTempGRNId } from '@/features/grn/services/imageUploadService';

/**
 * Module-level session ID that persists across all hook instances.
 * This allows cancellation to work when navigating between create/edit routes.
 *
 * Pattern: Increment before navigation, check in async functions before state updates.
 * If session changed, the async operation was cancelled and should not update state.
 */
let globalSessionId = 0;

export type GRNFormMode = 'create' | 'edit';

export interface UseGRNFormOptions {
  mode: GRNFormMode;
  grnIdParam?: string;
}

export interface UseGRNFormReturn {
  // State
  header: GRNHeaderData;
  items: GRNItemData[];
  grnId: string | null;
  tempGrnId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  validationErrors: Record<string, string>;
  isCreateMode: boolean;

  // Initialization
  initializeForm: () => Promise<void>;
  loadExistingGRN: (id: string) => Promise<void>;

  // Header actions
  updateHeaderField: (field: keyof GRNHeaderData, value: unknown) => void;
  updateHeaderFields: (updates: Partial<GRNHeaderData>) => void;
  handleGrNoChange: (newGrNo: string) => void;

  // Item actions
  addFormItem: (item: GRNItemData) => void;
  updateFormItem: (grnTrlId: string, updates: Partial<GRNItemData>) => void;
  removeFormItem: (grnTrlId: string) => void;

  // Image actions
  addHeaderImageToForm: (image: GRNImageData) => void;
  removeHeaderImageFromForm: (imageId: string) => void;
  addItemImageToForm: (itemId: string, image: GRNImageData) => void;
  removeItemImageFromForm: (itemId: string, imageId: string) => void;

  // Validation
  validateCurrentStep: (step: number) => Promise<{ isValid: boolean; errors: Record<string, string> }>;
  clearFieldError: (field: string) => void;

  // Navigation
  navigateToStep: (step: number) => Promise<boolean>;
  canNavigateToStep: (targetStep: number, currentStep: number) => Promise<boolean>;

  // Submission
  submitForm: () => Promise<{ success: boolean; grnId?: string; error?: string }>;

  // Reset
  resetFormState: () => void;
}

/**
 * Custom hook for GRN form management
 *
 * Consolidates form logic that was previously spread across multiple screen components:
 * - GrnHeaderStep.tsx
 * - GrnItemsStep.tsx
 * - GrnReviewStep.tsx
 */
export function useGRNForm({ mode, grnIdParam }: UseGRNFormOptions): UseGRNFormReturn {
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector((state) => state.auth);
  const grnFormState = useAppSelector((state) => state.grnForm);

  // Selectors
  const header = useAppSelector(selectGRNFormHeader);
  const items = useAppSelector(selectGRNFormItems);
  const grnId = useAppSelector(selectGRNFormId);
  const tempGrnId = useAppSelector(selectGRNTempId);

  const isCreateMode = mode === 'create';

  // Local state
  const [validationErrors, setLocalValidationErrors] = useState<Record<string, string>>({});

  // AbortController for cancelling pending GRN number change operations
  const grNoChangeAbortRef = useRef<AbortController | null>(null);

  // Cleanup AbortController on unmount to prevent memory leaks
  // @see PR14 - AbortController Refs Not Cleaned Up
  useEffect(() => {
    return () => {
      grNoChangeAbortRef.current?.abort();
      grNoChangeAbortRef.current = null;
    };
  }, []);

  // Refs to prevent duplicate operations
  const hasInitialized = useRef(false);
  const hasGeneratedGRN = useRef(false);
  const hasSetSupervisor = useRef(false);
  const isLoadingData = useRef(false);
  const previousModeRef = useRef<GRNFormMode | null>(null);
  // Track the previous grnIdParam to detect when we need to reload
  const previousGrnIdParamRef = useRef<string | undefined>(undefined);

  /**
   * Initialize form for create mode
   * - Generates GRN number
   * - Generates temp ID for image uploads
   * - Sets default supervisor
   */
  const initializeForm = useCallback(async () => {
    console.log('[useGRNForm] initializeForm called:', {
      isCreateMode,
      hasInitialized: hasInitialized.current,
      globalSessionId,
    });

    if (!isCreateMode || hasInitialized.current) {
      console.log('[useGRNForm] initializeForm skipped - not create mode or already initialized');
      return;
    }
    hasInitialized.current = true;

    // Capture global session ID at start of operation
    const currentSessionId = globalSessionId;
    console.log('[useGRNForm] initializeForm started with session:', currentSessionId);

    // Generate GRN number
    if (!header.gr_no && !hasGeneratedGRN.current) {
      hasGeneratedGRN.current = true;
      try {
        const grNumber = await getNextGRNNumber();
        // Check if session changed before updating state (prevents stale updates after navigation)
        if (globalSessionId !== currentSessionId) {
          console.log('[useGRNForm] GRN number generation cancelled - session changed from', currentSessionId, 'to', globalSessionId);
          return;
        }
        dispatch(updateHeader({ gr_no: grNumber }));
      } catch (error) {
        console.error('[useGRNForm] Failed to generate GRN number:', error);
        if (globalSessionId === currentSessionId) {
          Alert.alert('Error', 'Failed to generate GRN number');
        }
      }
    }

    // Check session again before continuing
    if (globalSessionId !== currentSessionId) return;

    // Generate temp ID for image uploads
    if (!grnId && !tempGrnId) {
      const tempId = generateTempGRNId();
      dispatch(setTempGrnId(tempId));
    }

    // Check session again before supervisor update
    if (globalSessionId !== currentSessionId) return;

    // Auto-set supervisor to current user
    if (!header.supervisor_id && userProfile && !hasSetSupervisor.current) {
      hasSetSupervisor.current = true;
      console.log('[useGRNForm] Auto-setting supervisor to current user:', userProfile.name);
      dispatch(updateHeader({
        supervisor_id: userProfile.id,
        supervisor_name: userProfile.name,
      }));
    }
  }, [isCreateMode, header.gr_no, header.supervisor_id, grnId, tempGrnId, userProfile, dispatch]);

  /**
   * Load existing GRN data for edit mode
   */
  const loadExistingGRN = useCallback(async (id: string) => {
    console.log('[useGRNForm] loadExistingGRN called for id:', id, {
      isLoadingData: isLoadingData.current,
      globalSessionId,
    });

    if (isLoadingData.current) {
      console.log('[useGRNForm] loadExistingGRN skipped - already loading');
      return;
    }
    isLoadingData.current = true;

    // Capture global session ID at start of operation
    const currentSessionId = globalSessionId;
    console.log('[useGRNForm] loadExistingGRN started with session:', currentSessionId);

    dispatch(setIsLoading(true));
    try {
      const result = await loadGRNDataService(id);
      // Check if session changed before updating state (prevents stale updates after navigation)
      if (globalSessionId !== currentSessionId) {
        console.log('[useGRNForm] Load GRN cancelled - session changed from', currentSessionId, 'to', globalSessionId);
        return;
      }
      if (result.success && result.data) {
        dispatch(loadGRNData({
          header: result.data.header,
          items: result.data.items,
          grnId: id,
        }));
      } else {
        if (globalSessionId === currentSessionId) {
          Alert.alert('Error', result.error || 'Failed to load GRN data');
        }
      }
    } catch (error) {
      console.error('[useGRNForm] Failed to load GRN:', error);
      if (globalSessionId === currentSessionId) {
        Alert.alert('Error', 'Failed to load GRN data');
      }
    } finally {
      dispatch(setIsLoading(false));
      isLoadingData.current = false;
    }
  }, [dispatch]);

  // Header actions
  const updateHeaderField = useCallback((field: keyof GRNHeaderData, value: unknown) => {
    dispatch(updateHeader({ [field]: value }));
    dispatch(clearValidationError(field));
  }, [dispatch]);

  const updateHeaderFields = useCallback((updates: Partial<GRNHeaderData>) => {
    dispatch(updateHeader(updates));
    Object.keys(updates).forEach((field) => {
      dispatch(clearValidationError(field));
    });
  }, [dispatch]);

  /**
   * Handle GRN number change with auto-navigation
   *
   * This function:
   * 1. Updates Redux immediately so UI is responsive
   * 2. Waits 750ms (debounce) before checking if number exists
   * 3. If exists and different from current, navigates to edit that GRN
   * 4. If doesn't exist and in edit mode, navigates to create mode
   *
   * Uses AbortController to cancel pending operations when user types more
   */
  const handleGrNoChange = useCallback((newGrNo: string) => {
    // Cancel any pending operation
    grNoChangeAbortRef.current?.abort();
    grNoChangeAbortRef.current = new AbortController();
    const signal = grNoChangeAbortRef.current.signal;

    // Update Redux immediately so UI is responsive
    dispatch(updateHeader({ gr_no: newGrNo }));
    dispatch(clearValidationError('gr_no'));

    // Start async operation
    (async () => {
      // Skip check if < 5 chars
      if (newGrNo.length < 5) {
        console.log('[useGRNForm] handleGrNoChange: Skipping check, < 5 chars');
        return;
      }

      // Debounce 750ms
      await new Promise(r => setTimeout(r, 750));
      if (signal.aborted) {
        console.log('[useGRNForm] handleGrNoChange: Aborted after debounce');
        return;
      }

      console.log('[useGRNForm] handleGrNoChange: Checking if GRN exists:', newGrNo);

      // Check existence
      const result = await checkGrnExists(newGrNo);
      if (signal.aborted) {
        console.log('[useGRNForm] handleGrNoChange: Aborted after check');
        return;
      }

      console.log('[useGRNForm] handleGrNoChange: Check result:', result);

      // Navigate if needed
      if (result.exists && result.grnId && result.grnId !== grnIdParam) {
        // GRN exists and it's different from current - navigate to edit
        console.log('[useGRNForm] handleGrNoChange: Navigating to edit mode for:', result.grnId);
        globalSessionId += 1;

        // Pre-load GRN data from checkGrnExists result (avoids second RPC call)
        if (result.grnData) {
          console.log('[useGRNForm] Pre-loading GRN data from check result');
          dispatch(loadGRNData({
            grnId: result.grnId,
            header: result.grnData.header,
            items: result.grnData.items,
          }));
        } else {
          dispatch(resetForm());
        }

        router.replace(`/grn-edit/${result.grnId}/step1`);
      } else if (!result.exists && mode === 'edit') {
        // GRN doesn't exist and we're in edit mode - navigate to create
        console.log('[useGRNForm] handleGrNoChange: Navigating to create mode');
        globalSessionId += 1;
        dispatch(resetForm());
        // After reset, set the GRN number user typed
        dispatch(updateHeader({ gr_no: newGrNo }));
        router.replace('/grn-form/step1');
      }
      // If GRN exists and matches current (grnIdParam), do nothing - already editing it
      // If GRN doesn't exist and in create mode, do nothing - user is creating new
    })();
  }, [grnIdParam, mode, dispatch]);

  // Item actions
  const addFormItem = useCallback((item: GRNItemData) => {
    dispatch(addItem(item));
  }, [dispatch]);

  const updateFormItem = useCallback((grnTrlId: string, updates: Partial<GRNItemData>) => {
    dispatch(updateItem({ grn_trl_id: grnTrlId, item: updates }));
  }, [dispatch]);

  const removeFormItem = useCallback((grnTrlId: string) => {
    dispatch(removeItem(grnTrlId));
  }, [dispatch]);

  // Image actions
  const addHeaderImageToForm = useCallback((image: GRNImageData) => {
    dispatch(addHeaderImage(image));
  }, [dispatch]);

  const removeHeaderImageFromForm = useCallback((imageId: string) => {
    dispatch(removeHeaderImage(imageId));
  }, [dispatch]);

  const addItemImageToForm = useCallback((itemId: string, image: GRNImageData) => {
    dispatch(addItemImage({ itemId, imageData: image }));
  }, [dispatch]);

  const removeItemImageFromForm = useCallback((itemId: string, imageId: string) => {
    dispatch(removeItemImage({ itemId, imageId }));
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
        // validateStep2 expects { items: [...] } not just the array
        result = await validateStep2({ items });
        break;
      case 3:
        result = await validateStep3({ header, items });
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

  const clearFieldError = useCallback((field: string) => {
    setLocalValidationErrors((prev) => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
    dispatch(clearValidationError(field));
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
    const currentStep = grnFormState.currentStep;
    const canNavigate = await canNavigateToStep(step, currentStep);

    if (!canNavigate) return false;

    dispatch(setCurrentStep(step));

    // Determine route based on mode
    const baseRoute = isCreateMode ? '/grn-form' : `/grn-edit/${grnId}`;

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
    }

    return true;
  }, [grnFormState.currentStep, canNavigateToStep, isCreateMode, grnId, dispatch]);

  /**
   * Submit the form (create or update)
   */
  const submitForm = useCallback(async (): Promise<{ success: boolean; grnId?: string; error?: string }> => {
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
      };

      const result = isCreateMode
        ? await createGRN(payload)
        : await updateGRN(grnId!, payload);

      if (result.success) {
        return { success: true, grnId: result.data?.id };
      } else {
        Alert.alert('Error', result.error || 'Failed to save GRN');
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useGRNForm] Submit error:', error);
      Alert.alert('Error', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      dispatch(setIsSaving(false));
    }
  }, [header, items, grnId, isCreateMode, validateCurrentStep, dispatch]);

  /**
   * Reset form to initial state
   *
   * NOTE: We intentionally do NOT reset instance-local refs (hasInitialized, hasGeneratedGRN, etc.)
   * because they are component-scoped - when we navigate, a new component with fresh refs is created.
   */
  const resetFormState = useCallback(() => {
    console.log('[useGRNForm] resetFormState called');

    // Cancel any pending GRN number change operation
    grNoChangeAbortRef.current?.abort();

    // Increment GLOBAL session ID to invalidate any pending async operations across all hook instances
    globalSessionId += 1;
    console.log('[useGRNForm] Global session incremented to:', globalSessionId);

    setLocalValidationErrors({});
    dispatch(resetForm());
  }, [dispatch]);

  // Track mode changes (for cases where component is reused with different mode)
  // NOTE: With router.replace(), a new component instance is created, so this effect rarely fires.
  // When it does fire (same component, different mode), we increment session to invalidate old operations.
  // We do NOT reset instance refs because that would trigger re-initialization race conditions.
  useEffect(() => {
    if (previousModeRef.current !== null && previousModeRef.current !== mode) {
      console.log('[useGRNForm] Mode changed from', previousModeRef.current, 'to', mode, '- incrementing session');
      // Increment session to invalidate any pending operations from the old mode
      globalSessionId += 1;
      console.log('[useGRNForm] Global session incremented to:', globalSessionId, 'due to mode change');
      // DO NOT reset instance refs - let the new mode's useEffect handle initialization
    }
    previousModeRef.current = mode;
  }, [mode]);

  // Auto-initialize for create mode
  useEffect(() => {
    console.log('[useGRNForm] Auto-init effect running:', {
      isCreateMode,
      hasInitialized: hasInitialized.current,
    });

    if (isCreateMode && !hasInitialized.current) {
      console.log('[useGRNForm] Auto-init calling initializeForm()');
      initializeForm();
    }
  }, [isCreateMode, initializeForm]);

  // Load data for edit mode when grnIdParam changes
  // NOTE: grnId is intentionally NOT in the dependency array to prevent
  // re-loading when resetForm() sets grnId to null during navigation
  useEffect(() => {
    console.log('[useGRNForm] Load effect running:', {
      isCreateMode,
      grnIdParam,
      previousGrnIdParam: previousGrnIdParamRef.current,
      reduxGrnId: grnId,
      isLoadingData: isLoadingData.current,
    });

    // Only load if:
    // 1. We're in edit mode
    // 2. We have a grnIdParam
    // 3. Redux doesn't already have this GRN loaded (grnId !== grnIdParam)
    // 4. Not already loading
    // NOTE: We check grnId !== grnIdParam instead of using previousGrnIdParamRef
    // because the ref is local to each hook instance and resets when navigating between steps.
    // Redux state persists across step navigation, so it's a reliable indicator.
    if (!isCreateMode && grnIdParam && !isLoadingData.current) {
      const alreadyLoaded = grnId === grnIdParam;
      const shouldLoad = !alreadyLoaded;

      console.log('[useGRNForm] Load check:', { alreadyLoaded, shouldLoad });

      if (shouldLoad) {
        console.log('[useGRNForm] Load effect calling loadExistingGRN:', grnIdParam);
        // Reset form before loading new data to prevent stale data flash
        if (previousGrnIdParamRef.current && previousGrnIdParamRef.current !== grnIdParam) {
          console.log('[useGRNForm] GRN ID changed, resetting form first');
          dispatch(resetForm());
        }
        loadExistingGRN(grnIdParam);
      }
    }

    previousGrnIdParamRef.current = grnIdParam;
  }, [isCreateMode, grnIdParam, loadExistingGRN, dispatch]);

  return {
    // State
    header,
    items,
    grnId,
    tempGrnId,
    isLoading: grnFormState.isLoading,
    isSaving: grnFormState.isSaving,
    validationErrors,
    isCreateMode,

    // Initialization
    initializeForm,
    loadExistingGRN,

    // Header actions
    updateHeaderField,
    updateHeaderFields,
    handleGrNoChange,

    // Item actions
    addFormItem,
    updateFormItem,
    removeFormItem,

    // Image actions
    addHeaderImageToForm,
    removeHeaderImageFromForm,
    addItemImageToForm,
    removeItemImageFromForm,

    // Validation
    validateCurrentStep,
    clearFieldError,

    // Navigation
    navigateToStep,
    canNavigateToStep,

    // Submission
    submitForm,

    // Reset
    resetFormState,
  };
}

export default useGRNForm;
