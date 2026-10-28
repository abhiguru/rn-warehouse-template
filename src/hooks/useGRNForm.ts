/**
 * useGRNForm Hook
 *
 * Custom hook that consolidates GRN form logic from multiple screen components.
 * Handles form initialization, validation, navigation, and data management.
 *
 * ## GRN number check
 *
 * When the user types a GRN number, the hook asks the server whether it is taken:
 * - taken by another GRN → the field shows "already exists" and step 1 does not
 *   pass; the form (lines, photos, mode) is left exactly as it was
 * - the number of the GRN being edited → nothing to report
 * - free, or the check failed → nothing to report (`save_grn`/`update_grn`
 *   refuse a duplicate in any case)
 *
 * The check never navigates and never loads or resets the form. Its answer has
 * no lines and no photos; a form filled from it would make `update_grn` delete
 * every photo of that GRN on save.
 *
 * ### Key Patterns Used:
 *
 * 1. **AbortController for Debounce** (`grNoChangeAbortRef`)
 *    - Cancels pending checks when user types quickly
 *    - 750ms debounce before checking database
 *    - Minimum 5 characters before checking
 *
 * 2. **Module-Level Session ID** (`currentGrnFormSession()`, features/grn/utils/grnFormSession.ts)
 *    - Persists across hook instances (survives route changes)
 *    - Incremented before navigation to cancel in-flight async operations
 *    - Checked in async functions before updating Redux state
 *
 * 3. **No loading here**
 *    - The edit form is loaded by its layout (app/grn-edit/[id]/_layout.tsx), which reads the GRN from the
 *      server every time the edit flow is entered and shows the steps only once it is in the form
 *    - This hook only reads the form and changes it
 *
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { createLogger, loggableError } from '@/utils/logger';
import { numberForNewDate, type NumberOffer } from '@/services/documentNumberingService';
import { calculateFinancialYear } from '@/utils/invoiceCalculations';
import { LOCAL_PHOTO_OWNERS, releaseLocalPhotos, releaseLocalPhotosOwnedBy } from '@/utils/localPhotoFiles';
import {
  updateHeader,
  addItem,
  updateItem,
  removeItem,
  setValidationErrors,
  clearValidationError,
  setCurrentStep,
  setTempGrnId,
  setIsSaving,
  resetForm,
  addHeaderImage,
  removeHeaderImage,
  addItemImage,
  removeItemImage,
  selectGRNFormHeader,
  selectGRNFormItems,
  selectGRNFormId,
  selectGRNTempId,
  selectGRNTakenNumberError,
  selectGRNGrNoTyped,
  selectGRNFirstDispatchDate,
  selectGRNLoadedDate,
  setTakenNumberError,
  setGrNoTyped,
  GRNHeaderData,
  GRNItemData,
  GRNImageData,
} from '@/store/slices/grnFormSlice';
import { validateStep1, validateStep2, validateStep3, withoutStoredNumberError } from '@/features/grn/schemas/grnValidation';
import { getNextGRNNumber, checkGrnExists } from '@/features/grn/services/grnFormService';
import { generateTempGRNId } from '@/features/grn/services/imageUploadService';
import { currentGrnFormSession, nextGrnFormSession } from '@/features/grn/utils/grnFormSession';

import { showAlert } from '@/utils/alert';
import { toCalendarDay, formatDate } from '@/utils/formatters';
import { t, formatIdentifier } from '@/i18n';
import { documentNumberState } from '@/utils/documentNumberCheck';
/** Plain-language list of validation messages for an alert (never raw field keys). */
function describeValidationErrors(errors: Record<string, string>): string {
  const messages = Array.from(new Set(Object.values(errors).filter(Boolean)));
  if (messages.length === 0) return t('errors.grn.form.fillRequired');
  return messages.map(message => `• ${message}`).join('\n');
}

const log = createLogger('useGRNForm');

/**
 * The form is being reset or discarded: the photo files the app wrote for it
 * go, also those of photos removed from it earlier. A file whose upload is
 * still running, or failed and may be retried, is kept until that is settled
 * (see localPhotoFiles); gallery photos are never touched.
 */
function releaseFormPhotoFiles(header: GRNHeaderData, items: GRNItemData[]): void {
  const uris = [...(header.gr_images || []), ...items.flatMap(item => item.trl_images || [])].map(
    image => image.imageUrl
  );
  const resetAt = Date.now();
  void releaseLocalPhotos(uris);
  void releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm, { createdBefore: resetAt });
}

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
  isGeneratingNumber: boolean;
  /** The pattern of the facility's numbering ("A####"), null when not known (older backend) or the rule is free text. */
  numberHint: string | null;
  /** Why the box was left empty: the rule is typed by hand (TYPE_IT) or the series is used up (SERIES_FULL); else null. */
  numberReason: NumberOffer['reason'];
  isSaving: boolean;
  validationErrors: Record<string, string>;
  isCreateMode: boolean;

  // Initialization
  initializeForm: () => Promise<void>;

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

  // Message for a typed number that another GRN already holds; step 1 does not pass while it
  // is set. It lives in the form slice: a screen's own copy was lost when step 1 was left
  // and reopened, and the taken number then passed until save_grn refused it.
  const takenNumberError = useAppSelector(selectGRNTakenNumberError);

  // Edit only (get_grn_edit_state, backend migration 121): the GRN may not be dated after its first dispatch. The
  // server refuses only a date that was changed, so a date that was already later when the GRN was opened is left alone.
  const firstDispatchDate = useAppSelector(selectGRNFirstDispatchDate);
  const loadedDate = useAppSelector(selectGRNLoadedDate);

  // Local state
  const [validationErrors, setLocalValidationErrors] = useState<Record<string, string>>(
    (): Record<string, string> => (takenNumberError ? { gr_no: takenNumberError } : {})
  );
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(isCreateMode && !header.gr_no);
  // What the facility's rule said with the last number it gave (pattern, reason for no number).
  const [numberOffer, setNumberOffer] = useState<NumberOffer | null>(null);

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

  // The form's photos as last rendered, for the reset paths below (a ref, so
  // resetFormState keeps its identity while the form changes).
  const formPhotosRef = useRef({ header, items });
  useEffect(() => {
    formPhotosRef.current = { header, items };
  }, [header, items]);

  // Requests for the number of the form: the first suggestion and every re-ask for a new date are numbered in one sequence.
  // An answer is dropped when a newer request already put a number in the box (`appliedRequest`), or when the date went back
  // to the year of the number the form holds (`supersededUpTo`: what was still on its way is out of date). A newer request
  // that has not answered, or answered "leave the number" (null), drops nothing.
  const dateNumberRequest = useRef(0);
  const appliedRequest = useRef(0);
  const supersededUpTo = useRef(0);
  // The financial year of the number the form holds (not of one being fetched); null when no request has settled it. A form
  // that starts with a number holds one for its date. A request that fails leaves it, so the next date change asks again.
  const numberYear = useRef<string | null>(isCreateMode && header.gr_no && header.date ? calculateFinancialYear(header.date) : null);

  // Refs to prevent duplicate operations
  const hasInitialized = useRef(false);
  const hasGeneratedGRN = useRef(false);
  const hasSetSupervisor = useRef(false);
  const previousModeRef = useRef<GRNFormMode | null>(null);

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
      globalSessionId: currentGrnFormSession(),
    });

    if (!isCreateMode || hasInitialized.current) {
      console.log('[useGRNForm] initializeForm skipped - not create mode or already initialized');
      return;
    }
    hasInitialized.current = true;

    // Capture global session ID at start of operation
    const currentSessionId = currentGrnFormSession();
    console.log('[useGRNForm] initializeForm started with session:', currentSessionId);

    // Generate GRN number
    if (!header.gr_no && !hasGeneratedGRN.current) {
      hasGeneratedGRN.current = true;
      setIsGeneratingNumber(true);
      const request = ++dateNumberRequest.current;
      const answered: { offer: NumberOffer | null } = { offer: null };
      try {
        const grNumber = await getNextGRNNumber(header.date, offer => { answered.offer = offer; });
        // Check if session changed before updating state (prevents stale updates after navigation)
        if (currentGrnFormSession() !== currentSessionId) {
          console.log('[useGRNForm] GRN number generation cancelled - session changed from', currentSessionId, 'to', currentGrnFormSession());
          return;
        }
        // A newer request put a number in the box meanwhile, or the date went back to the year of the number held.
        if (request <= appliedRequest.current || request <= supersededUpTo.current) return;
        setNumberOffer(answered.offer);
        if (header.date) numberYear.current = calculateFinancialYear(header.date);
        // '' is no suggestion (free text, a full series): the box stays empty for the person to type.
        if (grNumber) {
          dispatch(updateHeader({ gr_no: grNumber }));
          appliedRequest.current = request;
        }
      } catch (error) {
        console.error('[useGRNForm] Failed to generate GRN number:', error);
        if (currentGrnFormSession() === currentSessionId) {
          showAlert(t('errors.grn.form.numberFailedTitle'), t('common.checkConnection'));
        }
      } finally {
        setIsGeneratingNumber(false);
      }
    } else {
      setIsGeneratingNumber(false);
    }

    // Check session again before continuing
    if (currentGrnFormSession() !== currentSessionId) return;

    // Generate temp ID for image uploads
    if (!grnId && !tempGrnId) {
      const tempId = generateTempGRNId();
      dispatch(setTempGrnId(tempId));
    }

    // Check session again before supervisor update
    if (currentGrnFormSession() !== currentSessionId) return;

    // Auto-set supervisor to current user
    if (!header.supervisor_id && userProfile && !hasSetSupervisor.current) {
      hasSetSupervisor.current = true;
      log.debug('Auto-setting supervisor to the current user');
      dispatch(updateHeader({
        supervisor_id: userProfile.id,
        supervisor_name: userProfile.name,
      }));
    }
  }, [isCreateMode, header.gr_no, header.supervisor_id, grnId, tempGrnId, userProfile, dispatch]);

  // The screens read the local copy of the errors, so a changed field has to be cleared there too.
  const clearLocalErrors = useCallback((fields: string[]) => {
    setLocalValidationErrors((prev) => {
      if (!fields.some((field) => field in prev)) return prev;
      const next = { ...prev };
      fields.forEach((field) => { delete next[field]; });
      return next;
    });
  }, []);

  // Whether the number was typed by the person, as the last render saw it.
  const grNoTyped = useAppSelector(selectGRNGrNoTyped);
  const grNoTypedRef = useRef(grNoTyped);
  grNoTypedRef.current = grNoTyped;

  /**
   * The date moved to another financial year (1 April): under a financial-year rule the number the form fetched belonged
   * to the year before, so the suggestion is asked again for the new date. A number the person typed is never replaced,
   * and under another rule nothing changes (the server says which rule it is). The year compared with is the one the
   * form's number was fetched for, not the previous date: a request that failed is asked again on the next change.
   */
  const askNumberForDate = useCallback(async (newDate: unknown) => {
    if (!isCreateMode || typeof newDate !== 'string' || !newDate || grNoTypedRef.current) return;
    const year = calculateFinancialYear(newDate);
    if (numberYear.current === year) {
      // The number the form holds is right for this date: an answer still on its way for another year is out of date.
      supersededUpTo.current = dateNumberRequest.current;
      return;
    }
    const request = ++dateNumberRequest.current;
    const session = currentGrnFormSession();
    const answered: { offer: NumberOffer | null } = { offer: null };
    try {
      const number = await numberForNewDate('grn', newDate, offer => { answered.offer = offer; });
      if (currentGrnFormSession() !== session || request <= appliedRequest.current || request <= supersededUpTo.current) return;
      if (answered.offer) setNumberOffer(answered.offer);
      if (grNoTypedRef.current) return;
      if (number === null) {
        // Another rule, or a backend without it: the number held fits any date. Only the newest request says so.
        if (request === dateNumberRequest.current) numberYear.current = year;
        return;
      }
      dispatch(updateHeader({ gr_no: number }));
      appliedRequest.current = request;
      numberYear.current = year;
    } catch (error) {
      // The number stays, and so does its year: the next change of the date asks again. The server checks the number
      // when the GRN is saved.
      log.error('Could not ask for the GRN number of the new date', loggableError(error));
    }
  }, [isCreateMode, dispatch]);

  // Header actions
  const updateHeaderField = useCallback((field: keyof GRNHeaderData, value: unknown) => {
    if (field === 'date') void askNumberForDate(value);
    dispatch(updateHeader({ [field]: value }));
    dispatch(clearValidationError(field));
    clearLocalErrors([field]);
  }, [dispatch, clearLocalErrors, askNumberForDate]);

  const updateHeaderFields = useCallback((updates: Partial<GRNHeaderData>) => {
    if ('date' in updates) void askNumberForDate(updates.date);
    dispatch(updateHeader(updates));
    Object.keys(updates).forEach((field) => {
      dispatch(clearValidationError(field));
    });
    clearLocalErrors(Object.keys(updates));
  }, [dispatch, clearLocalErrors, askNumberForDate]);

  /**
   * Handle GRN number change
   *
   * This function:
   * 1. Updates Redux immediately so UI is responsive
   * 2. Waits 750ms (debounce) before checking if number exists
   * 3. If another GRN holds the number, reports it on the field
   *
   * It never navigates and never resets or reloads the form.
   * Uses AbortController to cancel pending operations when user types more
   */
  const handleGrNoChange = useCallback((typedGrNo: string) => {
    // A GRN number has no spaces; "G0001 " would be stored next to "G0001".
    const newGrNo = typedGrNo.replace(/\s+/g, '');

    // Cancel any pending operation
    grNoChangeAbortRef.current?.abort();
    grNoChangeAbortRef.current = new AbortController();
    const signal = grNoChangeAbortRef.current.signal;

    // Update Redux immediately so UI is responsive. A number the person typed is theirs: a refusal at Create
    // because another GRN holds it does not replace it with the next free number (a cleared field is not typed).
    dispatch(updateHeader({ gr_no: newGrNo }));
    dispatch(setGrNoTyped(newGrNo.length > 0));
    dispatch(clearValidationError('gr_no'));
    dispatch(setTakenNumberError(null));
    clearLocalErrors(['gr_no']);

    // Start async operation
    (async () => {
      // Skip check if < 5 chars
      if (newGrNo.length < 5) {
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
      log.debug('Checking whether the typed GRN number exists');

      // Check existence
      const result = await checkGrnExists(newGrNo);
      if (signal.aborted) {
        log.debug('Number check dropped after the answer');
        return;
      }

      // In edit mode the GRN's own number is not a duplicate.
      const state = documentNumberState(
        { exists: result.exists, id: result.grnId, error: result.error },
        mode === 'edit' ? grnIdParam : null
      );
      log.debug('Number check result', { state });
      if (state !== 'taken') return;

      const takenNumber = result.grNo || newGrNo;
      const message = result.customerName
        ? t('grn.form.numberTakenFor', { number: formatIdentifier(takenNumber), customer: result.customerName })
        : t('grn.form.numberTaken', { number: formatIdentifier(takenNumber) });
      dispatch(setTakenNumberError(message));
      setLocalValidationErrors((prev) => ({ ...prev, gr_no: message }));
    })();
  }, [grnIdParam, mode, dispatch, clearLocalErrors]);

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

    // The number of a saved GRN is read-only and goes back as stored: only a number another GRN holds (below) can stop it.
    if (!isCreateMode) result = withoutStoredNumberError(result);

    // A number another GRN holds keeps step 1 from passing until it is changed.
    if (step === 1 && takenNumberError) {
      result = { isValid: false, errors: { ...result.errors, gr_no: takenNumberError } };
    }

    // A GRN is not dated after its first dispatch (owner decision D3): a changed date later than that day is refused.
    if (step === 1 && !isCreateMode && firstDispatchDate && header.date && !result.errors.date) {
      const day = toCalendarDay(header.date);
      if (day > firstDispatchDate && (!loadedDate || day !== toCalendarDay(loadedDate))) {
        result = {
          isValid: false,
          errors: {
            ...result.errors,
            date: t('grn.validation.dateAfterDispatch', { grn: formatIdentifier(header.gr_no), date: formatDate(firstDispatchDate) }),
          },
        };
      }
    }

    if (!result.isValid) {
      setLocalValidationErrors(result.errors);
      dispatch(setValidationErrors(result.errors));
    } else {
      setLocalValidationErrors({});
      dispatch(setValidationErrors({}));
    }

    return result;
  }, [header, items, dispatch, takenNumberError, isCreateMode, firstDispatchDate, loadedDate]);

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
        showAlert(t('errors.grn.form.checkDetailsTitle'), describeValidationErrors(validation.errors));
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

    // Determine route based on mode. In edit mode the route's own id: the form's id is only what was last loaded.
    const baseRoute = isCreateMode ? '/grn-form' : `/grn-edit/${grnIdParam ?? grnId}`;

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
  }, [grnFormState.currentStep, canNavigateToStep, isCreateMode, grnIdParam, grnId, dispatch]);

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
    nextGrnFormSession();
    console.log('[useGRNForm] Global session incremented to:', currentGrnFormSession());

    setLocalValidationErrors({});
    releaseFormPhotoFiles(formPhotosRef.current.header, formPhotosRef.current.items);
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
      nextGrnFormSession();
      console.log('[useGRNForm] Global session incremented to:', currentGrnFormSession(), 'due to mode change');
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

  return {
    // State
    header,
    items,
    grnId,
    tempGrnId,
    isGeneratingNumber,
    numberHint: numberOffer?.hint ?? null,
    numberReason: numberOffer?.reason ?? null,
    isSaving: grnFormState.isSaving,
    validationErrors,
    isCreateMode,

    // Initialization
    initializeForm,

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

    // Reset
    resetFormState,
  };
}

export default useGRNForm;
