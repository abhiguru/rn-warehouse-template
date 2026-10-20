/**
 * useInvoiceForm Hook
 *
 * The logic of the invoice wizard, for a new invoice and for an edit, and for
 * each of its three steps: `useInvoiceForm({ mode, step })`. The step is the
 * calling screen's own (1-based); checks and navigation start from it, never
 * from the slice's `currentStep`, which a focus effect keeps current.
 *
 * What a screen reads here is the store's: the form, the invoice number
 * request (so a step 1 that is already open sees a new form begin), the
 * validation errors. What lives in the hook is what belongs to one saving
 * attempt (the lock against a second save).
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { router, useFocusEffect, type Href } from 'expo-router';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import {
  updateHeader,
  updateEditedItem,
  bulkUpdateItemGroupPricing,
  applySavedRates,
  updateDiscount,
  setCurrentStep,
  setIsSaving,
  setIsLoadingItems,
  setValidationErrors,
  setValidationError,
  clearValidationError,
  loadInvoiceFormData,
  loadInvoiceEditData,
  applyServerDurations,
  resetForm,
  numberRequested,
  numberAnswered,
  numberCancelled,
  selectInvoiceFormHeader,
  selectInvoiceFormItems,
  selectInvoiceFormItemOverrides,
  selectInvoiceFormId,
  selectInvoiceNumberStatus,
  selectInvoiceFormBaseline,
  selectInvoiceFormChanged,
  restoreSavedGrn,
} from '@/store/slices/invoiceFormSlice';
import type {
  CreateInvoicePayload,
  InvoiceHeaderData,
  InvoiceItemData,
  EditedItemValues,
  GroupRates,
} from '@/types/invoice.types';
import {
  validateStep1,
  validateStep2,
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
  invoiceFromStoredAnswer,
  checkGrnStillInvoiceable,
} from '@/features/invoice/services/invoiceFormService';
import { transformFormDataToPayload } from '@/features/invoice/utils/invoicePayload';
import { newInvoiceRequestKey } from '@/features/invoice/utils/requestKey';
import { sendUntilAnswered } from '@/features/invoice/utils/lostAnswerSubmit';
import { InvoiceRouteIdContext } from '@/features/invoice/utils/invoiceRouteId';

import { describeValidationErrors } from '@/features/invoice/utils/validationMessages';
import { showAlert } from '@/utils/alert';
import { t, formatIdentifier } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';
import { REFUSAL, refusalNumber, refusalString } from '@/utils/serverRefusal';
import { formatCount } from '@/utils/formatters';
import { calculateFinancialYear, formatInvoiceAmount, serverLineDurations } from '@/utils/invoiceCalculations';

const log = createLogger('useInvoiceForm');

export type InvoiceFormMode = 'create' | 'edit';

export interface UseInvoiceFormOptions {
  mode: InvoiceFormMode;
  /** The step of the screen that calls the hook: 1 Details, 2 Items, 3 Review. */
  step: number;
}

/** What `navigateToStep` did. `noItems`: no GRN is chosen yet; the screen says so. */
export type NavigateResult = 'ok' | 'busy' | 'noItems' | 'invalid';

export interface SubmitSuccess {
  success: true;
  invoiceId?: string;
  invoiceNo?: number;
  /** The total the server stored, or null when it could not be read back after the save. */
  total: number | null;
}
export interface SubmitFailure {
  success: false;
  error?: string;
  /** The invoice number is taken: the form holds the next free one (unless it was typed; then the field shows the message). */
  numberTaken?: boolean;
  /** The GRN's dispatch lines changed since the form read them: the lines can be loaded again. */
  reloadLines?: boolean;
  /** The person left the form while the server was being asked about a lost answer: nothing is told. */
  left?: boolean;
}

/** What a screen may add to the way it tells a refused save (the button or the step it offers with the message). */
export interface SubmitFailureInfo {
  /** Offer "Reload lines" with the message. */
  reloadLines?: boolean;
  /** Take the person to the step that has the invoice number (step 1) after the message. */
  numberTaken?: boolean;
  /** The message is the one that says the invoice may already be saved: it is shown with only a way to close the form. */
  numberMaybeSaved?: boolean;
  /**
   * The invoice was changed by someone else after this form read it (STALE_RECORD, D1), or the server's total is one this
   * form cannot work out even from the server's own durations (TOTAL_CHANGED, D18): nothing was saved. The screen asks
   * `askStaleRecord('invoice')` instead of showing the message, and on "Open it again" calls `reloadInvoice`.
   */
  stale?: boolean;
  /** The server's total is one the form cannot work out (TOTAL_CHANGED, D18): the message offers "Open it again" (a new invoice reads the lines again, an edit opens the invoice again). */
  totalUnmatched?: boolean;
  /** The server's total differs from the form's (TOTAL_CHANGED, D18) and the form now holds the server's figures: the Charges section is opened. */
  totalChanged?: boolean;
  /** The GRN still has stock (GRN_HAS_STOCK, D9): a new invoice goes back to step 1, where the GRN field is marked. */
  grnHasStock?: boolean;
}
/** `busy`: a save is already on its way; this call did nothing. */
export type SubmitResult = SubmitSuccess | SubmitFailure | 'busy';

export interface StepCheck {
  isValid: boolean;
  errors: Record<string, string>;
  /** `noItems`: step 1 has no lines; `zeroDuration`: step 2 has lines without a duration. */
  problem?: 'noItems' | 'zeroDuration';
  zeroDurationCount?: number;
}

export interface UseInvoiceFormReturn {
  // State
  header: InvoiceHeaderData;
  /** On step 1 this array follows a change of the line COUNT only (that step shows nothing else of it); the other steps follow every change. */
  items: InvoiceItemData[];
  /** The rates typed on the lines, by line. Read on step 2 only (the other steps get an empty object). */
  itemOverrides: Record<string, string[]>;
  invoiceId: string | null;
  isLoading: boolean;
  nextNumberFailed: boolean;
  /** The next invoice number is being asked for: the field is empty and the form does not go on. */
  isGettingNextNumber: boolean;
  isSaving: boolean;
  isLoadingItems: boolean;
  validationErrors: Record<string, string>;
  isCreateMode: boolean;
  /** Edit only: whether the form differs from the saved invoice. Asked when needed (the Back key), not followed. */
  getIsChanged: () => boolean;
  /** Rates typed on the lines, a discount or a reason: all of it is lost when the lines are replaced. */
  hasLineEdits: boolean;
  /** Rates typed on the lines (or a group rate): the only part lost when the same GRN's lines are read again. */
  hasTypedRates: boolean;
  /** Edit only: the GRN the invoice was saved with. */
  savedGrId: string | null;
  /** Edit only: the GRN the invoice was saved with, as the picker lists it. */
  savedGrn: { id: string; gr_no: string; customer_name: string } | null;
  /**
   * Edit only: reads the invoice again from the server and replaces the form with it (the answer to "Open it again", D1).
   * True when the form was replaced; false (form unchanged, a message shown) when it could not be read.
   */
  reloadInvoice: () => Promise<boolean>;
  /** Edit only: the invoice is being read again ("Open it again"). The bottom bar and the step links wait for it. */
  reloading: boolean;

  // GRN
  /** Loads the lines of a GRN and puts them in the form; false (form unchanged, a message shown) when it fails. */
  loadGRNData: (grId: string, grNo?: string) => Promise<boolean>;

  // Header actions
  updateHeaderField: (field: keyof InvoiceHeaderData, value: unknown) => void;
  updateHeaderFields: (updates: Partial<InvoiceHeaderData>) => void;
  updateDiscountAmount: (discount: number) => void;
  /** Asks for the suggested number again when the field of a new invoice is empty. True when it asked. */
  suggestNumberIfEmpty: () => boolean;
  /** Asks again after the request failed or timed out ("Try again" next to the number field). */
  retryNextNumber: () => void;
  /** Edit only: puts back the GRN the invoice was saved with, its lines, discount and reasons. */
  restoreSavedLines: () => void;

  // Item actions
  updateItemPricing: (tempId: string, values: Partial<EditedItemValues>) => void;
  /** Sets the given rates on the lines of a group; a rate left out is not touched. */
  applyGroupPricing: (groupKey: string, pricing: GroupRates) => void;
  /** Sets saved rates line by line; typed line rates are kept and no override mark is added. */
  applySavedRatesToLines: (rates: Array<{ temp_id: string; charge: number; labour_rate: number; tax: number }>) => void;

  // Validation
  validateCurrentStep: (step: number) => Promise<StepCheck>;
  /** Checks one field of step 1 and shows (or clears) its message: called when the field is left. */
  validateField: (field: string) => Promise<void>;
  clearFieldValidationError: (field: string) => void;

  // Navigation
  navigateToStep: (step: number) => Promise<NavigateResult>;

  // Submission
  /** `onFailure` receives the message of a refused save instead of the alert (a screen that draws it once its dialog is closed). */
  submitForm: (onFailure?: (title: string, message: string, info?: SubmitFailureInfo) => void) => Promise<SubmitResult>;
  /**
   * The save's answer was lost (owner rule D22): the server is being asked whether it was saved, and the screen is
   * locked until that is known (no edits, no Save or Update, no way to another step; only the close button, with the
   * warning that the invoice may have been saved).
   */
  lostAnswer: boolean;
  /** The person chose to leave while the answer is lost: stops asking, sends nothing more. */
  leaveAfterLostAnswer: () => void;

  // Reset
  resetFormState: () => void;
}

// Numbers the requests for the next invoice number. A request is wanted only while it is the latest.
let numberRequestCounter = 0;
let latestNumberRequest = 0;

/** A request for the next number that has not answered after this long is treated as failed (the field is typed in). */
export const NUMBER_REQUEST_TIMEOUT_MS = 15000;

/** Rejects when `work` has not settled after `ms`. */
const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });

/** The keys of a validation result that belong to the invoice number field. */
const numberErrors = (errors: Record<string, string>): Record<string, string> => {
  const found: Record<string, string> = {};
  Object.entries(errors).forEach(([key, message]) => {
    if (key === 'inv_no' || key.endsWith('.inv_no')) found[key] = message;
  });
  return found;
};

/** The key a field's message is shown under (the full invoice schema nests the header). */
const withoutHeaderPrefix = (errors: Record<string, string>): Record<string, string> => {
  const flat: Record<string, string> = {};
  Object.entries(errors).forEach(([key, message]) => {
    flat[key.startsWith('header.') ? key.slice('header.'.length) : key] = message;
  });
  return flat;
};

const NO_OVERRIDES: Record<string, string[]> = {};
const selectNoOverrides = () => NO_OVERRIDES;

/** The header's totals follow the lines (every figure typed on step 2 moves them); steps 1 and 2 show none of them. */
const TOTAL_KEYS: ReadonlyArray<keyof InvoiceHeaderData> = ['labour', 'tax_amount', 'total'];
const sameHeaderBesidesTotals = (a: InvoiceHeaderData, b: InvoiceHeaderData): boolean => {
  if (a === b) return true;
  const keys = Object.keys(a) as Array<keyof InvoiceHeaderData>;
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => TOTAL_KEYS.includes(key) || Object.is(a[key], b[key]));
};
const sameCount = (a: readonly unknown[], b: readonly unknown[]): boolean => a === b || a.length === b.length;

/** Whether an object holds any key (without listing them all). */
const hasKeys = (value: object): boolean => {
  for (const _key in value) return true;
  return false;
};

/**
 * The form holds another invoice than the route's (J1): a second form was opened over this one and loaded its own.
 * A form with no invoice at all is not "another invoice": it was emptied, and the checks of the form catch that.
 */
const holdsAnotherInvoice = (formInvoiceId: string | null, routeInvoiceId: string): boolean =>
  !!formInvoiceId && formInvoiceId !== routeInvoiceId;

export function useInvoiceForm({ mode, step }: UseInvoiceFormOptions): UseInvoiceFormReturn {
  const dispatch = useAppDispatch();

  const store = useAppStore();

  // What a step subscribes to is what it shows. Steps 1 and 2 stay mounted together in the stack, so a figure
  // typed on step 2 must not draw step 1 again: step 1 follows the line count, not the lines, and neither step
  // follows the header's totals. The callbacks below read the latest state from the store, not these values.
  const header = useAppSelector(selectInvoiceFormHeader, step === 3 ? undefined : sameHeaderBesidesTotals);
  const items = useAppSelector(selectInvoiceFormItems, step === 1 ? sameCount : undefined);
  const itemOverrides = useAppSelector(step === 2 ? selectInvoiceFormItemOverrides : selectNoOverrides);
  const formInvoiceId = useAppSelector(selectInvoiceFormId);
  // An edit saves and navigates by the invoice its route is for. The slice holds whichever invoice was loaded last,
  // and a second form opened over this one must never turn this one into a save of that invoice (J1).
  const routeInvoiceId = useContext(InvoiceRouteIdContext);
  const invoiceId = mode === 'edit' && routeInvoiceId ? routeInvoiceId : formInvoiceId;
  const numberStatus = useAppSelector(selectInvoiceNumberStatus);
  const baseline = useAppSelector(selectInvoiceFormBaseline);
  // Not subscribed: step 1 stays mounted under step 2, and following the fingerprint would walk every line
  // (JSON.stringify) on each key typed on step 2. The Back key asks at press time.
  const getIsChanged = useCallback(() => selectInvoiceFormChanged(store.getState()), [store]);
  const validationErrors = useAppSelector((state) => state.invoiceForm.validationErrors);
  const isLoading = useAppSelector((state) => state.invoiceForm.is_loading);
  const isSaving = useAppSelector((state) => state.invoiceForm.is_saving);
  const isLoadingItems = useAppSelector((state) => state.invoiceForm.is_loading_items);

  const isCreateMode = mode === 'create';
  const hasLineEdits = useAppSelector((state) => {
    const form = state.invoiceForm;
    return (
      hasKeys(form.editedItems) ||
      hasKeys(form.bulkPricing) ||
      (form.header.discount || 0) !== 0 ||
      !!form.header.discount_reason?.trim() ||
      !!form.header.zero_charge_reason?.trim()
    );
  });
  // Reading the same GRN's lines again keeps the discount and the reasons; only typed rates go.
  const hasTypedRates = useAppSelector((state) => hasKeys(state.invoiceForm.editedItems) || hasKeys(state.invoiceForm.bulkPricing));
  const savedGrn = useMemo(
    () => (baseline ? { id: baseline.gr_id, gr_no: baseline.header.gr_no, customer_name: baseline.header.customer_name } : null),
    [baseline]
  );
  const isGettingNextNumber = numberStatus === 'loading';
  const nextNumberFailed = numberStatus === 'failed';

  // An answer is lost (D22): held here, in the hook of the screen that saves. The controller ends the asking when the
  // person leaves the form (or the screen goes), so nothing is sent from a form that is gone.
  const [lostAnswer, setLostAnswer] = useState(false);
  // The invoice is being read again after "Open it again" (D1): the form is about to be replaced.
  const [reloading, setReloading] = useState(false);
  const saveAbort = useRef<AbortController | null>(null);
  useEffect(() => () => saveAbort.current?.abort(), []);
  const leaveAfterLostAnswer = useCallback(() => {
    saveAbort.current?.abort();
  }, []);

  // A save is on its way (set before the first await, so a second tap finds it).
  const saveLock = useRef(false);
  // True while navigateToStep checks the form before it moves to a step.
  const isNavigating = useRef(false);

  // The slice keeps the step of the screen in front, for whoever reads it.
  useFocusEffect(
    useCallback(() => {
      dispatch(setCurrentStep(step));
    }, [dispatch, step])
  );

  /**
   * Ask the server for the next invoice number of a financial year and put it
   * in the form. Numbers are counted per financial year, so this runs when a
   * new invoice opens and again when its date moves to another financial year.
   *
   * The answer is dropped when it is no longer wanted: a later request has
   * taken its place, the user typed a number meanwhile, or the form was reset
   * (the slice ignores an answer whose request is not the latest).
   * When no number comes back the field is emptied, so that a number suggested
   * for another year does not stay, and the form asks for one to be typed.
   */
  const requestNextNumber = useCallback(async (finYear: string) => {
    const id = ++numberRequestCounter;
    latestNumberRequest = id;
    dispatch(numberRequested(id));
    try {
      const result = await withTimeout(getNextInvoiceNumber(finYear), NUMBER_REQUEST_TIMEOUT_MS);
      if (id !== latestNumberRequest) return;
      const number = result.success && result.data ? result.data.next_invoice_number : null;
      dispatch(numberAnswered({ id, number }));
    } catch (error) {
      if (id !== latestNumberRequest) return;
      dispatch(numberAnswered({ id, number: null }));
      log.error('Failed to generate invoice number:', error);
      showAlert(t('invoice.form.numberFailedTitle'), t('common.checkConnection'));
    }
  }, [dispatch]);

  // A request still on its way is no longer wanted.
  const dropNumberRequest = useCallback(() => {
    latestNumberRequest = ++numberRequestCounter;
  }, []);

  // A new invoice asks for its number when step 1 comes to the front: when the form opens, and when "Create another"
  // goes back to step 1 (it reset the form from step 3, so step 1 was under it and finds a new form when it focuses).
  // Never because the form was reset: every way out of a form resets it before the screen is gone (Cancel, View
  // invoices, print done), and that must not ask the server for a number nobody will see.
  const latestForm = useRef({ inv_no: header.inv_no, finYear: header.inv_fin_year, numberStatus });
  latestForm.current = { inv_no: header.inv_no, finYear: header.inv_fin_year, numberStatus };
  useFocusEffect(
    useCallback(() => {
      if (!isCreateMode || step !== 1) return;
      const now = latestForm.current;
      if (Number(now.inv_no) > 0 || now.numberStatus !== 'idle') return;
      void requestNextNumber(now.finYear);
      // Later asks: the field being left empty, the date moving to another financial year, and "Try again".
    }, [isCreateMode, step, requestNextNumber])
  );

  /**
   * Load GRN data. The lines are read first and put in the form only when that
   * worked: a failure leaves the invoice with the GRN and the lines it had, and
   * says which GRN could not be loaded and which one stays.
   */
  const loadGRNData = useCallback(async (grId: string, grNo?: string): Promise<boolean> => {
    dispatch(setIsLoadingItems(true));
    const previousGrNo = header.gr_no;
    const failed = (reason: string) => {
      const kept = header.gr_id && previousGrNo && grNo
        ? `\n${t('invoice.form.grnLoadKept', { next: formatIdentifier(grNo), previous: formatIdentifier(previousGrNo) })}`
        : '';
      showAlert(t('invoice.form.grnLoadFailedTitle'), `${reason}${kept}`);
    };
    try {
      const result = await loadInvoiceFormDataService(grId);
      if (result.success && result.data) {
        const loaded = result.data.header;
        dispatch(loadInvoiceFormData({
          // An invoice being edited keeps everything of its header except the GRN and its customer.
          header: isCreateMode
            ? loaded
            : {
                customer_id: loaded.customer_id,
                customer_name: loaded.customer_name,
                gr_id: loaded.gr_id,
                gr_no: loaded.gr_no,
              },
          items: result.data.items,
          grId,
        }));
        dispatch(clearValidationError('gr_id'));
        return true;
      }
      failed(serverText(result.message, t('common.checkConnection')));
      return false;
    } catch (error) {
      log.error('Failed to load GRN data:', error);
      failed(t('common.checkConnection'));
      return false;
    } finally {
      dispatch(setIsLoadingItems(false));
    }
  }, [dispatch, isCreateMode, header.gr_id, header.gr_no]);

  // Header actions
  const updateHeaderFields = useCallback((updates: Partial<InvoiceHeaderData>) => {
    const changes: Partial<InvoiceHeaderData> = { ...updates };
    if ('inv_no' in changes) {
      // A number typed into the field is the user's own and is never replaced
      // by a suggestion. An emptied field holds no number to keep.
      changes.inv_no_typed = Number(changes.inv_no) > 0;
      // An answer still on its way is not put into a field the user is typing in.
      dropNumberRequest();
      dispatch(numberCancelled());
    }
    dispatch(updateHeader(changes));
    // A changed field no longer has its message.
    Object.keys(updates).forEach((field) => {
      dispatch(clearValidationError(field));
    });

    // The date moved to another financial year: the number belonged to the year
    // before, unless the user typed it.
    if (changes.inv_date) {
      const finYear = calculateFinancialYear(changes.inv_date);
      const typed = 'inv_no' in changes ? changes.inv_no_typed : header.inv_no_typed;
      if (finYear !== header.inv_fin_year && !typed) {
        if (!isCreateMode && baseline && finYear === baseline.inv_fin_year) {
          // Back in the year the invoice was saved in: its own number returns.
          dropNumberRequest();
          dispatch(numberCancelled());
          dispatch(updateHeader({ inv_no: baseline.inv_no, inv_no_typed: false }));
        } else {
          // The number in the field was the next one of the year before. It leaves
          // the field now, not when the answer arrives: until then it could be
          // taken for this year's number, edited and saved.
          dispatch(updateHeader({ inv_no: 0, inv_no_typed: false }));
          void requestNextNumber(finYear);
        }
      }
    }
  }, [dispatch, dropNumberRequest, isCreateMode, baseline, header.inv_fin_year, header.inv_no_typed, requestNextNumber]);

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

  const retryNextNumber = useCallback(() => {
    if (!isCreateMode) return;
    void requestNextNumber(header.inv_fin_year);
  }, [isCreateMode, header.inv_fin_year, requestNextNumber]);

  const updateHeaderField = useCallback((field: keyof InvoiceHeaderData, value: unknown) => {
    updateHeaderFields({ [field]: value });
  }, [updateHeaderFields]);

  const updateDiscountAmount = useCallback((discount: number) => {
    dispatch(updateDiscount(discount));
  }, [dispatch]);

  // Item actions
  const updateItemPricing = useCallback((tempId: string, values: Partial<EditedItemValues>) => {
    dispatch(updateEditedItem({ temp_id: tempId, values }));
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

  // The invoice number may differ from the saved one only within the server's range.
  const numberChanged = !isCreateMode && baseline !== null && header.inv_no !== baseline.inv_no;

  /** Step 1 (`details`) or the whole invoice (`full`), with the rules of a new invoice or of an edit. */
  const runSchema = useCallback(async (kind: 'details' | 'full') => {
    const { header, items } = store.getState().invoiceForm;
    const data = { header, items };
    if (isCreateMode) {
      return kind === 'details' ? validateNewInvoiceStep1(header) : validateNewInvoice(data);
    }
    // An invoice saved before the 8-digit ceiling may keep a longer number; a changed number has the ceiling.
    const result = await (kind === 'details' ? validateStep1(header) : validateFullInvoice(data));
    if (!numberChanged) return result;
    const capped = await (kind === 'details' ? validateNewInvoiceStep1(header) : validateNewInvoice(data));
    const extra = numberErrors(capped.errors);
    if (Object.keys(extra).length === 0 || Object.keys(numberErrors(result.errors)).length > 0) return result;
    return { isValid: false, errors: { ...result.errors, ...extra } };
  }, [store, isCreateMode, numberChanged]);

  /**
   * Validate a specific step (1 Details, 2 Items, 3 the whole invoice) and
   * show the messages of the fields.
   */
  const validateCurrentStep = useCallback(async (checkedStep: number): Promise<StepCheck> => {
    let result: StepCheck;
    const { items } = store.getState().invoiceForm;

    switch (checkedStep) {
      case 1:
        if (items.length === 0) {
          // No GRN yet: the screen offers to select one.
          return { isValid: false, errors: {}, problem: 'noItems' };
        }
        result = await runSchema('details');
        break;
      case 2: {
        // A line without a duration would be charged for no time at all.
        const zeroDurationCount = items.filter((item) => item.duration === 0).length;
        if (zeroDurationCount > 0) {
          return { isValid: false, errors: {}, problem: 'zeroDuration', zeroDurationCount };
        }
        result = await validateStep2(items);
        break;
      }
      case 3:
        result = await runSchema('full');
        break;
      default:
        result = { isValid: true, errors: {} };
    }

    dispatch(setValidationErrors(withoutHeaderPrefix(result.errors)));
    return result;
  }, [store, runSchema, dispatch]);

  const validateField = useCallback(async (field: string) => {
    const result = await runSchema('details');
    dispatch(setValidationError({ field, message: result.errors[field] ?? null }));
  }, [runSchema, dispatch]);

  const clearFieldValidationError = useCallback((field: string) => {
    dispatch(clearValidationError(field));
  }, [dispatch]);

  /**
   * Navigate to a specific step. Going on checks every step from this screen's
   * own up to the one before the target; going back is always allowed.
   */
  const navigateToStep = useCallback(async (target: number): Promise<NavigateResult> => {
    if (target < 1 || target > 3) return 'invalid';
    // The form holds another invoice than this route's (J1): nothing goes on from here, and the route is never
    // built from the other invoice's id. Going back stays allowed.
    if (target > step && !isCreateMode && invoiceId && holdsAnotherInvoice(store.getState().invoiceForm.invoice_id, invoiceId)) {
      showAlert(t('invoice.edit.otherInvoiceTitle'), t('invoice.edit.otherInvoiceMessage'));
      return 'invalid';
    }
    // A second tap while the first is still being checked does nothing.
    if (isNavigating.current) return 'busy';
    // Going on waits for the invoice number: while it is being asked for, and
    // when the field was emptied (it is then asked for first).
    if (target > step && (isGettingNextNumber || suggestNumberIfEmpty())) return 'busy';
    isNavigating.current = true;
    try {
      for (let checked = step; checked < target; checked++) {
        const check = await validateCurrentStep(checked);
        if (check.isValid) continue;
        if (check.problem === 'noItems') return 'noItems';
        if (check.problem === 'zeroDuration') {
          showAlert(
            t('invoice.items.checkPricesTitle'),
            t('invoice.items.zeroDuration', { count: check.zeroDurationCount ?? 0 })
          );
          return 'invalid';
        }
        showAlert(
          t(checked === 2 ? 'invoice.items.checkPricesTitle' : 'invoice.form.checkInvoiceTitle'),
          describeValidationErrors(check.errors)
        );
        return 'invalid';
      }

      const route = `${isCreateMode ? '/invoice-form' : `/invoice-edit/${invoiceId}`}/step${target}` as Href;
      if (target < step) {
        // Back to a step that is already in the stack: the steps above it are
        // taken off. A push here added a second entry of that step, and the
        // form's Discard then showed the one under it, emptied.
        router.dismissTo(route);
      } else if (target > step) {
        // `navigate` does nothing when the step is already in front, so a tap
        // that lands after the step opened does not open it a second time.
        router.navigate(route);
      }
      return 'ok';
    } finally {
      isNavigating.current = false;
    }
  }, [step, store, validateCurrentStep, isCreateMode, invoiceId, isGettingNextNumber, suggestNumberIfEmpty]);

  /**
   * The invoice number was refused as taken (a second phone saved the same suggestion first, or an edit moved the
   * invoice to a number that is used). Asks for the next free number of the financial year and returns the message.
   * A number the person typed stays, and its field shows the message. A number the app suggested is replaced by the
   * free one: the field is then correct, so it shows no error and the alert says what happened (I4).
   */
  const handleNumberTaken = useCallback(async (takenNumber: number): Promise<string> => {
    const current = store.getState().invoiceForm.header;
    let next: number | null = null;
    try {
      const answer = await withTimeout(getNextInvoiceNumber(current.inv_fin_year), NUMBER_REQUEST_TIMEOUT_MS);
      if (answer.success && answer.data && answer.data.next_invoice_number > 0) next = answer.data.next_invoice_number;
    } catch (error) {
      log.warn('Could not read the next invoice number after a taken number:', error);
    }
    const message = next
      ? t('invoice.form.numberTaken', { number: formatIdentifier(takenNumber), next: formatIdentifier(next) })
      : t('invoice.form.numberTakenNoNext', { number: formatIdentifier(takenNumber) });
    if (next && !store.getState().invoiceForm.header.inv_no_typed) {
      // A request for a suggestion that is still on its way is no longer wanted.
      dropNumberRequest();
      dispatch(numberCancelled());
      dispatch(updateHeader({ inv_no: next, inv_no_typed: false }));
      dispatch(clearValidationError('inv_no'));
    } else {
      dispatch(setValidationError({ field: 'inv_no', message }));
    }
    return message;
  }, [store, dispatch, dropNumberRequest]);

  /**
   * Submit the form (create or update). The lock is taken before the first
   * await, so a second tap while the first is still being checked or sent does
   * nothing and gets 'busy'.
   */
  const submitForm = useCallback(async (
    onFailure?: (title: string, message: string, info?: SubmitFailureInfo) => void
  ): Promise<SubmitResult> => {
    const report = onFailure ?? ((title: string, message: string) => showAlert(title, message));
    // A failed update reads "update", as the button did.
    const failedTitleKey = isCreateMode ? 'invoice.form.saveFailedTitle' : 'invoice.review.updateFailedTitle';
    if (saveLock.current) return 'busy';
    saveLock.current = true;
    dispatch(setIsSaving(true));

    try {
      // An edit saves the invoice its route is for. The form holds another one (a second form was opened over
      // this one): nothing is sent, and no other invoice is changed by this form's figures (J1).
      if (!isCreateMode && invoiceId && holdsAnotherInvoice(store.getState().invoiceForm.invoice_id, invoiceId)) {
        const message = t('invoice.edit.otherInvoiceMessage');
        report(t('invoice.edit.otherInvoiceTitle'), message);
        return { success: false, error: message };
      }

      const validation = await runSchema('full');
      if (!validation.isValid) {
        report(t('invoice.form.checkInvoiceTitle'), describeValidationErrors(validation.errors));
        return { success: false, error: t('errors.general.validationFailed') };
      }

      // A new invoice: ask the server once more whether the GRN can still be
      // invoiced and has the same dispatch lines. An existing invoice holds
      // its GRN already, so the same question would always be refused.
      if (isCreateMode) {
        const check = await checkGrnStillInvoiceable(header.gr_id, items);
        if (!check.ok) {
          if (check.linesChanged) {
            // The lines changed: the message goes with "Reload lines" (I3), which reads them again.
            report(t('invoice.form.saveFailedTitle'), check.message, { reloadLines: true });
            return { success: false, error: check.message, reloadLines: true };
          }
          report(t('invoice.form.saveFailedTitle'), check.message);
          return { success: false, error: check.message };
        }
      }

      // One request code for this save, made now and kept until its outcome is known (D22). Every send of this save,
      // the first and any send after a lost answer, is the identical request: the same payload and the same code.
      const requestKey = newInvoiceRequestKey(isCreateMode ? 'create' : 'update');
      const base: CreateInvoicePayload = isCreateMode
        ? {
            // The service converts inv_fin_year from "2026-27" to the year it starts in.
            header: { ...header, inv_fin_year: parseInt(String(header.inv_fin_year).split('-')[0], 10) },
            items,
          }
        : transformFormDataToPayload(header, items);
      // What the server checks besides the figures (wave B), part of the captured payload like the request code, so every
      // send of this save, a resend after a lost answer too, is the identical request. The total is the figure of the save
      // question the person confirmed (D18). An edit also sends the version it was loaded from (D1), when it holds one.
      const loadedUpdatedAt = isCreateMode ? null : store.getState().invoiceForm.loadedUpdatedAt;
      const payload: CreateInvoicePayload = {
        ...base,
        header: {
          ...base.header,
          expected_total: header.total,
          ...(loadedUpdatedAt ? { expected_updated_at: loadedUpdatedAt } : {}),
        },
      };
      const controller = new AbortController();
      saveAbort.current = controller;
      const outcome = await sendUntilAnswered({
        // A send after a lost answer says so: a failure of it that is not the server's answer is not settled (D22).
        send: (resend) =>
          isCreateMode
            ? (resend ? createInvoice(payload, requestKey, { resend: true }) : createInvoice(payload, requestKey))
            : (resend ? updateInvoice(invoiceId!, payload, requestKey, { resend: true }) : updateInvoice(invoiceId!, payload, requestKey)),
        requestKey,
        fromStored: (stored) => invoiceFromStoredAnswer(isCreateMode ? null : invoiceId!, payload, stored),
        signal: controller.signal,
        onLocked: setLostAnswer,
      });
      // The person left the form while the server was asked: there is nobody to tell.
      if (outcome === 'left') return { success: false, left: true };
      const result = outcome;

      if (result.success) {
        return {
          success: true,
          invoiceId: result.data?.invoice_id,
          invoiceNo: result.data?.invoice_no,
          total: result.data?.total ?? null,
        };
      }
      if (result.numberMaybeSaved) {
        // The identical save was refused for the number after a lost answer, and again after the check: the first send
        // may have saved it. No next number; the screen shows this with only a way to close the form.
        const message = t('invoice.form.numberMaybeSaved', { number: formatIdentifier(result.numberTaken?.number ?? header.inv_no) });
        report(t(failedTitleKey), message, { numberMaybeSaved: true });
        return { success: false, error: message };
      }
      if (result.numberTaken) {
        // I4: say which number is taken and which is free, and take the person to the step with the field.
        const message = await handleNumberTaken(result.numberTaken.number);
        report(t('invoice.form.numberTakenTitle'), message, { numberTaken: true });
        return { success: false, error: message, numberTaken: true };
      }
      const refusal = result.refusal;
      if (refusal?.reason === REFUSAL.STALE_RECORD && !isCreateMode) {
        // D1: someone else changed the invoice. The screen asks "Keep editing" or "Open it again"; the form is not touched.
        report(t(failedTitleKey), serverText(result.message, t('common.checkConnection')), { stale: true });
        return { success: false, error: result.message };
      }
      const stock = refusal?.reason === REFUSAL.GRN_HAS_STOCK ? refusalNumber(refusal, 'stock') : undefined;
      if (refusal && stock !== undefined) {
        // D9: the GRN still has stock. A new invoice goes back to step 1 with the GRN field marked; an edit stays here.
        const message = t('invoice.refusal.hasStock', {
          grn: formatIdentifier(refusalString(refusal, 'gr_no') ?? header.gr_no),
          stock: formatCount(stock, 'bag'),
        });
        if (isCreateMode) dispatch(setValidationError({ field: 'gr_id', message }));
        report(t(failedTitleKey), message, isCreateMode ? { grnHasStock: true } : undefined);
        return { success: false, error: message };
      }
      const currentTotal = refusal?.reason === REFUSAL.TOTAL_CHANGED ? refusalNumber(refusal, 'current_total') : undefined;
      if (refusal && currentTotal !== undefined) {
        // D18: the total the person confirmed is not the server's. The server's duration and days go on the lines it
        // names and the figures are worked out again; the typed discount, reasons, rates, number and date stay. The form
        // stays on this step, so the next Save sends the new total.
        dispatch(applyServerDurations(serverLineDurations(refusal.fields.lines)));
        // The form cannot work out the server's total when its own, from the server's durations, is still more than 1 away
        // (the server accepts a total within 1): sending the new figure again would be refused again, and so on. The lines
        // are read again instead: a new invoice offers "Reload lines", an edit "Open it again".
        const formTotal = store.getState().invoiceForm.header.total;
        if (Math.abs(formTotal - currentTotal) > 1) {
          const message = t('invoice.refusal.totalUnmatched', { current: formatInvoiceAmount(currentTotal) });
          if (isCreateMode) {
            report(t(failedTitleKey), message, { reloadLines: true, totalUnmatched: true });
            return { success: false, error: message, reloadLines: true };
          }
          report(t(failedTitleKey), message, { totalUnmatched: true });
          return { success: false, error: message };
        }
        const message = t('invoice.refusal.totalChanged', {
          current: formatInvoiceAmount(currentTotal),
          expected: formatInvoiceAmount(refusalNumber(refusal, 'expected_total') ?? header.total),
        });
        report(t(failedTitleKey), message, { totalChanged: true });
        return { success: false, error: message };
      }
      // A refusal, or a failure before the request was sent. A lost answer is asked about above (D22), so the
      // old "it may have been saved, check the list" wording is not used for Save invoice and Update invoice.
      report(t(failedTitleKey), serverText(result.message, t('common.checkConnection')));
      return { success: false, error: result.message };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Submit error:', error);
      report(t(failedTitleKey), t('common.checkConnection'));
      return { success: false, error: errorMessage };
    } finally {
      saveAbort.current = null;
      dispatch(setIsSaving(false));
      saveLock.current = false;
    }
  }, [header, items, invoiceId, isCreateMode, store, dispatch, runSchema, handleNumberTaken]);

  /**
   * "Open it again" after STALE_RECORD (D1): the invoice is read again and the form is replaced with what was read, with
   * the version it carries. Done here, not by the edit layout, so the screens stay where they are and nothing is skipped
   * because "this invoice is already loaded". The form is replaced only when the read worked.
   */
  const reloadInvoice = useCallback(async (): Promise<boolean> => {
    if (isCreateMode || !invoiceId) return false;
    // The form holds another invoice than this route's (J1): it is not replaced from here, and the person is told why.
    if (holdsAnotherInvoice(store.getState().invoiceForm.invoice_id, invoiceId)) {
      showAlert(t('invoice.edit.otherInvoiceTitle'), t('invoice.edit.otherInvoiceMessage'));
      return false;
    }
    setReloading(true);
    try {
      const result = await loadInvoiceDataService(invoiceId);
      if (result.success && result.data) {
        dispatch(loadInvoiceEditData({
          invoiceId,
          header: result.data.header as InvoiceHeaderData,
          items: result.data.items,
          grId: result.data.header.gr_id || '',
          updatedAt: result.data.updated_at ?? null,
        }));
        return true;
      }
      showAlert(t('invoice.edit.openFailedTitle'), serverText(result.message, t('common.checkConnection')));
      return false;
    } catch (error) {
      log.error('Failed to read the invoice again:', error);
      showAlert(t('invoice.edit.openFailedTitle'), t('common.checkConnection'));
      return false;
    } finally {
      setReloading(false);
    }
  }, [isCreateMode, invoiceId, store, dispatch]);

  const restoreSavedLines = useCallback(() => {
    dispatch(restoreSavedGrn());
    dispatch(clearValidationError('gr_id'));
  }, [dispatch]);

  /**
   * Reset form to initial state
   */
  const resetFormState = useCallback(() => {
    // An answer still on its way belongs to the form that is being thrown away.
    dropNumberRequest();
    dispatch(resetForm());
  }, [dispatch, dropNumberRequest]);

  return {
    header,
    items,
    itemOverrides,
    invoiceId,
    isLoading,
    nextNumberFailed,
    isGettingNextNumber,
    isSaving,
    isLoadingItems,
    validationErrors,
    isCreateMode,
    getIsChanged,
    hasLineEdits,
    hasTypedRates,
    savedGrId: baseline?.gr_id ?? null,
    savedGrn,
    reloadInvoice,
    reloading,

    loadGRNData,

    updateHeaderField,
    updateHeaderFields,
    updateDiscountAmount,
    suggestNumberIfEmpty,
    retryNextNumber,
    restoreSavedLines,

    updateItemPricing,
    applyGroupPricing,
    applySavedRatesToLines,

    validateCurrentStep,
    validateField,
    clearFieldValidationError,

    navigateToStep,

    submitForm,
    lostAnswer,
    leaveAfterLostAnswer,

    resetFormState,
  };
}

export default useInvoiceForm;
