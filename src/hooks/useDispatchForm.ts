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
 * 2. **Module-Level Session ID** (`dispatchFormSession`)
 *    - Persists across hook instances (survives route changes)
 *    - Ended when the form is reset, to cancel in-flight async operations
 *    - Checked in async functions before updating Redux state
 *
 * 3. **What the server refuses (wave B, owner decisions D1 to D5)**
 *    - An edit sends the version it read (`expected_updated_at`); STALE_RECORD comes back as `stale` and the screen asks
 *      "Keep editing" / "Open it again" (`reloadDispatch`).
 *    - A dispatch on an invoice has its date and number locked (`invoicedNumber`); DISPATCH_INVOICED and the date rules
 *      (DISPATCH_DATE_FUTURE, DISPATCH_BEFORE_GRN) come back as `toDetails`, to step 1.
 *    - A new dispatch made from an order sends the order's version; ORDER_CHANGED reads the order again and merges its
 *      lines into the form (`orderChanged`).
 *
 * 4. **Edit mode does not load here**
 *    - The edit layout (`app/dispatch-edit/[id]/_layout.tsx`) resets the form, reads the dispatch
 *      on every entry and shows the steps only once it is loaded; it resets the form again when it
 *      closes. A step screen can therefore rely on the form holding the dispatch of its route.
 *    - Navigation and save in edit mode use the dispatch of the route and refuse when the form
 *      holds another one.
 *
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useStore } from 'react-redux';
import type { RootState } from '@/store';
import {
  updateHeader,
  refreshDefaultDate,
  markDispNoTyped,
  setSubmissionNonce,
  formCreated,
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
  setIsSaving,
  setCheckingAnswer,
  setValidationErrors,
  clearValidationErrors,
  clearFieldError,
  setTakenNumberError,
  selectDispatchTakenNumberError,
  setDateRefusal,
  setLoadedUpdatedAt,
  lockForInvoice,
  reloadDispatchData,
  reloadFromOrder,
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
  OrderLotAsk,
} from '@/types/dispatch.types';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateDispatchDateVsGRNDates,
  dateRuleScope,
} from '@/features/dispatch/schemas/dispatchValidation';
import {
  getNextDispatchNumber,
  createDispatch,
  updateDispatch,
  checkDispatchExists,
  loadDispatchData as readDispatch,
} from '@/features/dispatch/services/dispatchFormService';
import { currentDispatchFormSession, endDispatchFormSession } from '@/features/dispatch/utils/dispatchFormSession';

import { showAlert } from '@/utils/alert';
import { createLogger } from '@/utils/logger';
import { LOCAL_PHOTO_OWNERS, releaseLocalPhotos, releaseLocalPhotosOwnedBy } from '@/utils/localPhotoFiles';
import { t, formatIdentifier } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { validationSummary } from '@/utils/validationSummary';
import { documentNumberState } from '@/utils/documentNumberCheck';
import { linesFromOtherCustomers } from '@/features/dispatch/utils/lotOwnership';
import { formatDate, toLocalISODate } from '@/utils/formatters';
import { REFUSAL, refusalString, type ServerRefusal } from '@/utils/serverRefusal';
import { possibleDuplicateOf, type PossibleDuplicate } from '@/utils/possibleDuplicate';
import { convertOrderToDispatchData } from '@/utils/orderToDispatchConverter';

const log = createLogger('useDispatchForm');

// One object for a form that holds none, so a screen's effects do not see a new one at every render.
const NO_HELD_BAGS: Record<string, number> = {};
const NO_ORDER_LOTS: Record<string, OrderLotAsk> = {};

/**
 * A random id for one form. It only has to differ from the id of another form, so a plain
 * v4-shaped text is enough where the platform has no `crypto.randomUUID`.
 */
function newSubmissionNonce(): string {
  const platformCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof platformCrypto?.randomUUID === 'function') return platformCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (placeholder) => {
    const digit = Math.floor(Math.random() * 16);
    return (placeholder === 'x' ? digit : (digit % 4) + 8).toString(16);
  });
}

/**
 * A save finished after its form was left (the form was reset, or the screen went, while the request was on its way): the
 * dispatch is saved, but the form and the screen belong to someone else now, so only the person is told, in a dialog,
 * that it is saved. Otherwise a person who believes the form was discarded enters the same dispatch again.
 */
function reportSavedAfterLeaving(dispNo: string | undefined, failedPhotos: DispatchImageData[] | undefined): void {
  showAlert(
    t('dispatch.wizard.savedAfterLeavingTitle'),
    t(failedPhotos && failedPhotos.length > 0 ? 'dispatch.wizard.savedAfterLeavingPhotos' : 'dispatch.wizard.savedAfterLeaving', {
      number: formatIdentifier(dispNo ?? ''),
    })
  );
}

export type DispatchFormMode = 'create' | 'edit';

export interface UseDispatchFormOptions {
  mode: DispatchFormMode;
  dispatchIdParam?: string;
  sourceOrderId?: string;
}

export type DispatchSubmitResult = {
  success: boolean;
  dispatchId?: string;
  error?: string;
  orderLinesLeft?: number | null;
  failedPhotos?: DispatchImageData[];
  numberTaken?: { message: string };
  /**
   * The request was sent again after a lost answer and refused for the number twice: the first send may have saved the
   * dispatch. The message says so ("may already have been saved. Check the list before entering it again."); no next
   * number is offered, and the form is only closed.
   */
  numberMaybeSaved?: { message: string };
  /** The person left (or the form was reset) while the request was on its way or being checked; nothing more was done and nothing is to be said. */
  aborted?: boolean;
  /**
   * Edit: someone else changed the dispatch since it was read (STALE_RECORD, wave B D1). Nothing was saved. The screen
   * asks "Keep editing" / "Open it again" (`askStaleRecord('dispatch')`) and calls `reloadDispatch` for the second.
   */
  stale?: boolean;
  /**
   * The server refused something that step 1 holds (the date is in the future or before a GRN, or the dispatch is on an
   * invoice, wave B D2/D3). The date field already says so; the caller shows the message and takes the person to step 1.
   */
  toDetails?: { message: string };
  /**
   * A new dispatch from an order that changed after the form was opened (ORDER_CHANGED, wave B D5): the order's lines were
   * read again and merged into the form. `empty`: no line is left to dispatch (the form stays on its last step, with Create
   * disabled); otherwise the person is taken to the items step to check the quantities.
   */
  orderChanged?: { empty: boolean };
  /** Edit saved: the server also changed the order to match (wave B D4: bags given back to it or taken from it). */
  orderSynced?: boolean;
  /**
   * Create of a direct dispatch: the server warned that it looks like one made in the last 30 minutes (POSSIBLE_DUPLICATE,
   * migration 124). Nothing was saved. The screen asks "Possible duplicate" [Cancel | Save anyway]; Save anyway calls
   * `submitForm` again with `warnDuplicate: false`.
   */
  duplicate?: PossibleDuplicate;
};

/** What a caller may change about one submit. */
export interface DispatchSubmitOptions {
  /** Create: false is "Save anyway" after the duplicate warning (default true). */
  warnDuplicate?: boolean;
}

export interface UseDispatchFormReturn {
  // State
  header: DispatchHeaderData;
  items: DispatchItemData[];
  images: DispatchImageData[];
  dispatchId: string | null;
  isGeneratingNumber: boolean;
  isSaving: boolean;
  /**
   * A create or save got no answer and the app is asking the server what became of it (owner rule D22). The form is
   * locked: no edits, no Create or Save, no Previous or step pills or Back key. Only the X leaves, with its warning.
   */
  isCheckingAnswer: boolean;
  /** Edit: lot id -> the bags the dispatch held on that lot when it was read (the stock limit of a lot adds them). */
  heldBags: Record<string, number>;
  /** Edit: the number of the invoice the dispatch is on (its date and number are locked); null when it is on none. */
  invoicedNumber: string | null;
  /** New dispatch from an order: lot id -> what the order asks of the lot (the form shows "Order asks for N"); empty for any other form. */
  orderLots: Record<string, OrderLotAsk>;
  /** Edit: the dispatch is being read again ("Open it again"); the screen is busy (no save, no way to another step) until it is. */
  isReloading: boolean;
  validationErrors: Record<string, string>;
  isCreateMode: boolean;
  hasFormData: boolean;
  itemCount: number;
  isReadyToSubmit: boolean;

  // Initialization
  initializeForm: () => Promise<void>;
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
  /**
   * Create or save. A refusal for the dispatch number (another dispatch holds it) comes back with `numberTaken`: the
   * number field already says so, and the caller takes the person to step 1, where that field is.
   */
  submitForm: (
    generateInvoice?: boolean,
    onFailure?: (title: string, message: string) => void,
    options?: DispatchSubmitOptions
  ) => Promise<DispatchSubmitResult>;

  /**
   * Edit: read the dispatch again from the server and replace the form with it (wave B D1, "Open it again"). The step
   * the person is on stays. False when it could not be read (the person was told; the form is as it was).
   */
  reloadDispatch: () => Promise<boolean>;

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
    (): Record<string, string> => ({
      ...(takenNumberError ? { disp_no: takenNumberError } : {}),
      // The server refused the date (wave B D3) and the person was taken to step 1, where the field says why.
      ...(dispatchFormState.dateRefusal ? { disp_date: dispatchFormState.dateRefusal } : {}),
    })
  );

  const [isGeneratingNumber, setIsGeneratingNumber] = useState(isCreateMode && !header.disp_no);

  // The dispatch is being read again after "Open it again" (`reloadDispatch`).
  const [isReloading, setIsReloading] = useState(false);

  // AbortController for cancelling pending dispatch number change operations
  const dispNoChangeAbortRef = useRef<AbortController | null>(null);

  // Aborted when this screen goes or the form is reset: a create, save or delete that is asking the server what became of
  // a request that got no answer then stops, and nothing is sent again.
  const submitAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort();
    };
  }, []);

  // Refs to prevent duplicate operations
  const hasInitialized = useRef(false);
  const hasGeneratedDispNo = useRef(false);
  const hasSetSupervisor = useRef(false);
  const previousModeRef = useRef<DispatchFormMode | null>(null);

  /**
   * Initialize form for create mode
   */
  const initializeForm = useCallback(async () => {
    console.log('[useDispatchForm] initializeForm called:', {
      isCreateMode,
      hasInitialized: hasInitialized.current,
      session: currentDispatchFormSession(),
    });

    if (!isCreateMode || hasInitialized.current) {
      console.log('[useDispatchForm] initializeForm skipped - not create mode or already initialized');
      return;
    }
    hasInitialized.current = true;

    // Capture global session ID at start of operation
    const currentSessionId = currentDispatchFormSession();
    console.log('[useDispatchForm] initializeForm started with session:', currentSessionId);

    // A new dispatch is dated the day it is opened. The form can be older than that (a reset form keeps the day
    // it was reset on, and the app stays open overnight); a date the person picked is left alone.
    dispatch(refreshDefaultDate(toLocalISODate(new Date())));

    // Generate dispatch number
    if (!header.disp_no && !hasGeneratedDispNo.current) {
      hasGeneratedDispNo.current = true;
      setIsGeneratingNumber(true);
      try {
        const disp_no = await getNextDispatchNumber();
        // Check if session changed before updating state (prevents stale updates after navigation)
        if (currentDispatchFormSession() !== currentSessionId) {
          console.log('[useDispatchForm] Dispatch number generation cancelled - session changed from', currentSessionId, 'to', currentDispatchFormSession());
          return;
        }
        dispatch(updateHeader({ disp_no }));
      } catch (error) {
        console.error('[useDispatchForm] Failed to generate dispatch number:', error);
        if (currentDispatchFormSession() === currentSessionId) {
          showAlert(t('dispatch.wizard.errorTitle'), t('dispatch.wizard.numberFailed'));
        }
      } finally {
        setIsGeneratingNumber(false);
      }
    } else {
      setIsGeneratingNumber(false);
    }

    // Check session again before supervisor update
    if (currentDispatchFormSession() !== currentSessionId) return;

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
    dispatch(markDispNoTyped());
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
    const { header, items, loadedDateNumber, heldBags } = store.getState().dispatchForm;
    let result: { isValid: boolean; errors: Record<string, string> };

    // The date rules (not in the future, not before a GRN) judge a new dispatch whole; an edit only where it changed
    // something (owner decision D25): a changed day with every line, an unchanged day with the lines the edit added.
    const dateScope = dateRuleScope({
      isEdit: !isCreateMode,
      dispDate: header.disp_date,
      loadedDispDate: loadedDateNumber?.disp_date,
      heldBags,
      lines: items,
    });

    console.log('[useDispatchForm] validateCurrentStep called for step:', step);

    switch (step) {
      case 1:
        console.log('[useDispatchForm] Validating step 1');
        // Step 1 is checked again: a date the server refused earlier is judged by the checks now, not remembered.
        dispatch(setDateRefusal(null));
        result = await validateStep1(header, { checkFuture: dateScope.checkFuture });
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
        result = await validateStep3({ header, items }, { checkFuture: dateScope.checkFuture, grnDateLines: dateScope.lines });
        console.log('[useDispatchForm] Step 3 validation result:', result);
        if (result.isValid) {
          // Additional cross-validation: dispatch date vs GRN dates
          console.log('[useDispatchForm] 🔍 Running date cross-validation...');
          const dateValidation = validateDispatchDateVsGRNDates(header.disp_date, dateScope.lines);
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
  }, [store, dispatch, takenNumberError, isCreateMode]);

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
   * Edit mode: the form holds the dispatch of the route. Read from the store, not from the last
   * render, so a dispatch that was loaded or reset a moment ago is seen as it is.
   */
  const formHoldsRouteDispatch = useCallback((): boolean => {
    return Boolean(dispatchIdParam) && store.getState().dispatchForm.dispatch_id === dispatchIdParam;
  }, [store, dispatchIdParam]);

  /**
   * Navigate to a specific step
   */
  const navigateToStep = useCallback(async (step: number): Promise<boolean> => {
    const currentStep = dispatchFormState.current_step;
    console.log(`[useDispatchForm] navigateToStep called: currentStep=${currentStep}, targetStep=${step}`);

    // An edit goes by the dispatch of its route. The form must hold that dispatch: any other
    // way would send the person to the steps of a dispatch they did not open.
    if (!isCreateMode && !formHoldsRouteDispatch()) {
      showAlert(t('dispatch.wizard.errorTitle'), t('dispatch.wizard.editMismatch'));
      return false;
    }

    const canNavigate = await canNavigateToStep(step, currentStep);

    if (!canNavigate) {
      console.log('[useDispatchForm] Navigation denied by canNavigateToStep');
      return false;
    }

    dispatch(setCurrentStep(step));

    // Determine route based on mode
    const baseRoute = isCreateMode ? '/dispatch-form' : `/dispatch-edit/${dispatchIdParam}`;
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
  }, [dispatchFormState.current_step, canNavigateToStep, isCreateMode, dispatchIdParam, formHoldsRouteDispatch, dispatch]);

  /**
   * Submit the form (create or update)
   */
  const submitForm = useCallback(async (
    generateInvoice: boolean = false,
    onFailure?: (title: string, message: string) => void,
    submitOptions: DispatchSubmitOptions = {}
  ): Promise<DispatchSubmitResult> => {
    // The form this submit belongs to. A form that is left (X) or reset while the request is on its way is a new
    // session: whatever answer comes late must not touch the next form (its `formCreated`, its saving flags, its alerts).
    const formSession = currentDispatchFormSession();
    const formChanged = () => currentDispatchFormSession() !== formSession;

    // The caller may hold the error until a dialog still closing is gone (iOS shows no Modal over it)
    const report = onFailure ?? showAlert;

    // An edit saves the dispatch of its route. A form that holds another one is not saved: its
    // changes would land on a dispatch the person did not open.
    if (!isCreateMode && !formHoldsRouteDispatch()) {
      const message = t('dispatch.wizard.editMismatch');
      report(t('dispatch.wizard.errorTitle'), message);
      return { success: false, error: message };
    }

    // Validate step 3
    const validation = await validateCurrentStep(3);
    if (formChanged()) return { success: false, aborted: true };
    if (!validation.isValid) {
      report(t('dispatch.validation.title'), validationSummary(validation.errors) || t('dispatch.validation.fillRequired'));
      return { success: false, error: t('dispatch.validation.failed') };
    }

    dispatch(setIsSaving(true));

    /**
     * The server says another dispatch holds the number. The person is told which number is free
     * next. A number the form fetched itself is replaced by it; a number the person typed is kept
     * (the field flags it and step 1 does not pass until it is changed).
     */
    const reportNumberTaken = async (takenNumber: string): Promise<DispatchSubmitResult> => {
      let next: string | null = null;
      try {
        next = await getNextDispatchNumber();
      } catch {
        // The message then only asks for another number.
      }
      // The form was left while the next number was asked for: nothing is put into the form that is there now.
      if (formChanged()) return { success: false, aborted: true };
      const message = next
        ? t('dispatch.wizard.numberUsedNext', { number: formatIdentifier(takenNumber), next: formatIdentifier(next) })
        : t('dispatch.wizard.numberTaken', { number: formatIdentifier(takenNumber) });
      if (next && isCreateMode && !store.getState().dispatchForm.dispNoTyped) {
        dispatch(updateHeader({ disp_no: next }));
      } else {
        dispatch(setTakenNumberError(message));
      }
      report(t('dispatch.wizard.errorTitle'), message);
      return { success: false, error: message, numberTaken: { message } };
    };

    /** The server refused the dispatch date (wave B D3): the date field says why, and the caller takes the person to step 1. */
    const dateRefused = (message: string): DispatchSubmitResult => {
      dispatch(setDateRefusal(message));
      setLocalValidationErrors((prev) => ({ ...prev, disp_date: message }));
      return { success: false, error: message, toDetails: { message } };
    };

    /**
     * The refusals of migration 121 that this form words from the reason and the fields (never from the server's English).
     * Undefined for a reason that is none of them: the caller then shows the ordinary failure.
     */
    const wordRefusal = async (refusal: ServerRefusal): Promise<DispatchSubmitResult | undefined> => {
      switch (refusal.reason) {
        case REFUSAL.STALE_RECORD:
          // Nothing was saved; the screen asks whether to keep editing or to open the dispatch again.
          return { success: false, stale: true };

        case REFUSAL.DISPATCH_INVOICED: {
          // The dispatch was put on an invoice after this form read it. The date and the number are locked now and are put
          // back to what was read; the person is taken to step 1, where the two fields say why.
          const invoice = refusalString(refusal, 'invoice_no') ?? store.getState().dispatchForm.invoicedNumber ?? '';
          const message = t('dispatch.refusal.dispatchInvoiced', {
            dispatch: formatIdentifier(refusalString(refusal, 'dispatch_no') ?? header.disp_no),
            invoice: formatIdentifier(invoice),
          });
          dispatch(lockForInvoice(invoice));
          clearLocalErrors(['disp_no', 'disp_date']);
          return { success: false, error: message, toDetails: { message } };
        }

        case REFUSAL.DISPATCH_DATE_FUTURE:
          return dateRefused(
            t('dispatch.validation.dateFuture', { today: formatDate(refusalString(refusal, 'today') ?? new Date()) })
          );

        case REFUSAL.DISPATCH_BEFORE_GRN: {
          const grnNo = refusalString(refusal, 'gr_no');
          const grnDate = refusalString(refusal, 'grn_date');
          return dateRefused(
            grnNo && grnDate
              ? t('dispatch.validation.dateBeforeGrn', {
                  grn: formatIdentifier(grnNo),
                  grnDate: formatDate(grnDate),
                  dispatchDate: formatDate(refusalString(refusal, 'date') ?? header.disp_date),
                })
              : t('dispatch.validation.dispatchDateInvalid')
          );
        }

        case REFUSAL.ORDER_CHANGED: {
          // The order was changed (or dispatched) after this form was made from it. Its lines are read again and merged
          // into the form; the person is told, and creates the dispatch again from what the form now shows.
          const orderId = refusalString(refusal, 'source_order_id') ?? header.source_order_id;
          if (!orderId) return undefined;
          // Loaded when needed (as lostAnswer.ts does): a form's screens and tests do not need the whole orders service.
          const { OrderService } = require('@/services/order-service') as typeof import('@/services/order-service');
          let read: Awaited<ReturnType<typeof OrderService.getOrderWithItems>> | null;
          try {
            read = await OrderService.getOrderWithItems(orderId);
          } catch {
            read = null;
          }
          // The form was left while the order was read: nothing is put into the form that is there now.
          if (formChanged()) return { success: false, aborted: true };
          if (!read || !read.success || !read.data) {
            const message = t('lists.orderGroup.loadFailed');
            report(t('dispatch.wizard.errorTitle'), message);
            return { success: false, error: message };
          }
          const converted = convertOrderToDispatchData(read.data);
          dispatch(reloadFromOrder({
            items: converted.items,
            orderLots: converted.orderLots,
            source_order_updated_at: read.data.updated_at,
          }));
          return { success: false, orderChanged: { empty: store.getState().dispatchForm.items.length === 0 } };
        }

        default:
          return undefined;
      }
    };

    try {
      // One id per form, made when the form first tries to create and kept while it is sent again
      // after a lost answer: the same form is the same create, another form with the same
      // fields is not. It is part of the idempotency key only.
      let submissionNonce = store.getState().dispatchForm.submissionNonce ?? undefined;
      if (isCreateMode && !submissionNonce) {
        submissionNonce = newSubmissionNonce();
        dispatch(setSubmissionNonce(submissionNonce));
      }

      const payload = {
        header,
        items,
        images,
        generateInvoice,
      };

      // A request that gets no answer locks the form (the Review step shows why) while the server is asked what became
      // of it; the check is stopped when the person leaves.
      const controller = new AbortController();
      submitAbortRef.current = controller;
      const lostAnswer = { onLostAnswer: () => dispatch(setCheckingAnswer(true)), signal: controller.signal };

      const result = isCreateMode
        ? await createDispatch({ ...payload, submissionNonce, warnDuplicate: submitOptions.warnDuplicate }, lostAnswer)
        : await updateDispatch(
            dispatchIdParam!,
            // The version the form read (wave B D1): the server refuses the save when the dispatch changed since.
            { ...payload, expectedUpdatedAt: store.getState().dispatchForm.loadedUpdatedAt },
            lostAnswer
          );

      // The person left while the server was being asked, with no answer known: nothing is known, nobody to tell
      // (they were warned by the X's question). When they left while the first send was on its way and its answer was
      // lost, they were not warned: they are told it may have been saved, so they do not enter it again.
      if (result.aborted && !result.success) {
        if (result.maybeSaved) {
          showAlert(t('dispatch.wizard.maybeSavedAfterLeavingTitle'), t('errors.lostAnswer.leaveWarning'));
        }
        return { success: false, aborted: true };
      }

      // The form was left (X, which resets it and may have opened the next one) or the screen went while the request
      // was on its way. A saved dispatch is told to the person, in a dialog, so they do not enter it again; the next
      // form is not touched (no `formCreated`, no flags, no alert about a refusal).
      if (formChanged() || controller.signal.aborted) {
        if (result.success) {
          // The same form still stands (only this screen went): a new dispatch is marked as having made its dispatch, and
          // an edit holds the version it just saved, so its next save is not refused as someone else's change (D1).
          if (!formChanged() && isCreateMode && result.dispatch_id) dispatch(formCreated(result.dispatch_id));
          if (!formChanged() && !isCreateMode && result.updated_at) dispatch(setLoadedUpdatedAt(result.updated_at));
          reportSavedAfterLeaving(header.disp_no, result.failed_photos);
        }
        return { success: false, aborted: true };
      }

      if (result.success) {
        // The form has made its dispatch: it is finished, and is reset when it is left.
        if (isCreateMode && result.dispatch_id) dispatch(formCreated(result.dispatch_id));
        // An edit that was accepted: its new version is the one the next save of this form carries (wave B D1).
        if (!isCreateMode && result.updated_at) dispatch(setLoadedUpdatedAt(result.updated_at));
        return {
          success: true,
          dispatchId: result.dispatch_id,
          orderLinesLeft: result.order_lines_left,
          failedPhotos: result.failed_photos ?? [],
          ...(result.order_sync && result.order_sync.given_back + result.order_sync.taken > 0 ? { orderSynced: true } : {}),
        };
      }

      // The identical request was refused for the number after a lost answer, and again after the check: the first send
      // may have saved it. Not "the next free number is ...": the screen shows this, with only a way to close.
      if (result.numberMaybeSaved) {
        const message = t('dispatch.wizard.numberMaybeSaved', { number: formatIdentifier(result.number || header.disp_no) });
        return { success: false, error: message, numberMaybeSaved: { message } };
      }

      if (result.reason === 'NUMBER_TAKEN') {
        return await reportNumberTaken(result.number || header.disp_no);
      }

      // A likely duplicate of a direct dispatch (migration 124): nothing was saved; the screen asks the person.
      const possibleDuplicate = possibleDuplicateOf(result, 'dispatch');
      if (possibleDuplicate) return { success: false, duplicate: possibleDuplicate };

      // Wave B: a stale dispatch, a locked date or number, the date rules, an order that moved.
      if (result.refusal) {
        const worded = await wordRefusal(result.refusal);
        if (worded) return worded;
      }

      report(t('dispatch.wizard.errorTitle'), serverText(result.error, t('dispatch.wizard.saveFailed'), { write: true, form: true }));
      return { success: false, error: result.error };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('dispatch.wizard.unknownError');
      console.error('[useDispatchForm] Submit error:', error);
      if (formChanged()) return { success: false, aborted: true };
      report(t('dispatch.wizard.errorTitle'), errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      // A form that was left (or reset) has its own flags now: this submit must not clear the next form's.
      if (!formChanged()) {
        dispatch(setCheckingAnswer(false));
        dispatch(setIsSaving(false));
      }
    }
  }, [header, items, images, dispatchIdParam, isCreateMode, store, formHoldsRouteDispatch, validateCurrentStep, clearLocalErrors, dispatch]);

  /**
   * Edit: the server said someone else changed the dispatch and the person chose "Open it again" (wave B D1). The dispatch is
   * read again and the form is replaced with what was read, with its new version token; the step the person is on stays.
   * Forced: nothing here skips a dispatch that is already loaded.
   */
  const reloadDispatch = useCallback(async (): Promise<boolean> => {
    if (!dispatchIdParam) return false;
    const formSession = currentDispatchFormSession();
    // The screen is busy while the dispatch is read: a save or a step change meanwhile would be replaced by what is read.
    setIsReloading(true);
    try {
      const result = await readDispatch(dispatchIdParam);
      // The form was left (or another dispatch is in it) while this one was read: nothing is put into the form that is there now.
      if (currentDispatchFormSession() !== formSession || store.getState().dispatchForm.dispatch_id !== dispatchIdParam) return false;
      if (!result.success || !result.data) {
        showAlert(t('dispatch.wizard.errorTitle'), serverText(result.error, t('dispatch.wizard.loadFailed')));
        return false;
      }
      dispatch(reloadDispatchData({
        dispatchId: dispatchIdParam,
        header: result.data.header,
        items: result.data.items,
        updatedAt: result.data.updatedAt,
        invoicedNumber: result.data.invoicedNumber,
      }));
      setLocalValidationErrors({});
      return true;
    } finally {
      setIsReloading(false);
    }
  }, [dispatchIdParam, store, dispatch]);

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
    // A create or save still asking the server what became of a lost request stops (the person left through the X)
    submitAbortRef.current?.abort();

    // End the form's session to invalidate any pending async operations across all hook instances
    console.log('[useDispatchForm] Form session ended; new session:', endDispatchFormSession());

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
      // End the session to invalidate any pending operations from the old mode
      console.log('[useDispatchForm] Form session ended; new session:', endDispatchFormSession(), 'due to mode change');
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

  // A form that created its dispatch is finished: when the screen that did it is left, however it is left (a Back
  // key included), the form is emptied, so it cannot be sent a second time. A way out that already reset the form
  // (View list, Create another, Print) has cleared the flag, and this does nothing.
  useEffect(() => {
    return () => {
      const form = store.getState().dispatchForm;
      if (!form.savedDispatchId) return;
      releaseFormPhotoFiles(form.images);
      dispatch(resetForm());
    };
  }, [store, dispatch]);

  return {
    // State
    header,
    items,
    images,
    dispatchId,
    isGeneratingNumber,
    isSaving: dispatchFormState.is_saving,
    isCheckingAnswer: dispatchFormState.checkingAnswer === true,
    heldBags: dispatchFormState.heldBags ?? NO_HELD_BAGS,
    invoicedNumber: dispatchFormState.invoicedNumber ?? null,
    orderLots: dispatchFormState.orderLots ?? NO_ORDER_LOTS,
    isReloading,
    validationErrors,
    isCreateMode,
    hasFormData,
    itemCount,
    isReadyToSubmit,

    // Initialization
    initializeForm,
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

    // Reload (edit)
    reloadDispatch,

    // Reset
    resetFormState,
  };
}

export default useDispatchForm;
