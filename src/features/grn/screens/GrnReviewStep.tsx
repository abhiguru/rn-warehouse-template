import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
} from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { triggerSuccess, triggerError, triggerWarning } from '@/hooks/useHaptics';
import { useBackHandler } from '@/hooks/useBackHandler';
import { router, useLocalSearchParams } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  GRNImageData,
  type GRNItemData,
  setCurrentStep,
  setValidationErrors,
  addHeaderImage,
  removeHeaderImage,
  updateHeaderImageProgress,
  completeHeaderImageUpload,
  failHeaderImageUpload,
  setIsSaving,
  updateHeader,
  selectGRNRemovedImages,
  selectGRNSubmissionNonce,
  selectGRNGrNoTyped,
  selectGRNRates,
  selectGRNRateChanges,
  selectGRNInvoiced,
  selectGRNLoadedUpdatedAt,
  selectGRNRemovedRates,
  loadGRNData as loadGRNFormData,
  setFirstDispatchDate,
  setGrnRates,
  setRateChanges,
  setRemovedGrnRates,
  setSubmissionNonce,
  setGrNoTyped,
  setTakenNumberError,
} from '@/store/slices/grnFormSlice';
import { useGRNForm } from '@/hooks';
import { ImageUploadButton } from '@/features/grn/components/ImageUploadButton';
import {
  createGRN,
  updateGRN,
  buildUpdateGRNRequest,
  getNextGRNNumber,
  loadGRNData as loadGRNDataService,
  type GRNLostAnswer,
  type GRNPhotoSaveReport,
} from '@/features/grn/services/grnFormService';
import { useOrderEffectsPreview } from '@/hooks/useOrderEffectsPreview';
import { orderEffectLines, orderEffectsNotice, previewUpdateGrn, withOrderEffects } from '@/services/orderEffects';
import { REFUSAL, refusalString, refusalStrings, type ServerRefusal } from '@/utils/serverRefusal';
import { invoicedNoNewLotText, lotInvoicedText } from '@/features/grn/utils/lockTexts';
import { askStaleRecord } from '@/utils/staleRecordDialog';
import { currentGrnFormSession, newSubmissionNonce } from '@/features/grn/utils/grnFormSession';
import { checkSubmission } from '@/utils/lostAnswer';
import { forgetUnfinishedSave, releaseUnfinishedSave } from '@/services/unfinishedSaves';
import { askPossibleDuplicate, type PossibleDuplicate } from '@/utils/possibleDuplicate';
import { LostAnswerNotice } from '@/features/grn/components/LostAnswerNotice';
import { uploadGRNPhotos, unpreparedGRNPhotos, type FailedGRNPhoto } from '@/features/grn/services/imageUploadService';
import { photosNotUploadedMessage } from '@/features/grn/utils/photoSaveReport';
import { isTemporaryGRNImageId } from '@/features/grn/services/imageId';
import { abandonLocalPhotoUpload, releaseLocalPhotos } from '@/utils/localPhotoFiles';
import { validateStep3, withoutStoredNumberError } from '@/features/grn/schemas/grnValidation';
import { ImagePreviewGrid } from '@/features/grn/components/ImagePreviewGrid';
import { ImageOverlay } from '@/components/ImageOverlay';
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import { GRN_STEP_COUNT, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { grnSteps } from '@/features/grn/utils/grnStepLabels';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printGRNRange } from '@/services/print-service';
import { DocumentSuccessDialog, DocumentData } from '@/components/DocumentSuccessDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { generateGRNPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';

import { askAlert, showAlert } from '@/utils/alert';
import WizardBottomBar from '@/components/WizardBottomBar';
import { ReviewCard, ReviewKeyValue, ReviewKeyValues, ReviewSection, useReviewSections } from '@/components/review/ReviewSections';
import { formatCount, formatDate, formatNumber, formatWeightEach, toCalendarDay } from '@/utils/formatters';
import { ONE_LINE, makeTableStyles, numberColumnWidth, useTableLayout } from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { GrnRatesSection } from '@/features/grn/rates/GrnRatesSection';
import { GrnRateSheet } from '@/features/grn/rates/GrnRateSheet';
import { useGrnRates } from '@/features/grn/rates/useGrnRates';
import {
  buildRates,
  contextKey,
  dropOtherPriceType,
  groupRows,
  missingCount,
  priceRows,
  priceTypeOf,
  removeSavedFor,
  removedFor,
  restoreRemovedFor,
  withEntry,
  withoutEntryFor,
  type PricedRow,
  type SheetEntry,
} from '@/features/grn/rates/grnRateModel';
import { rateRefusalText } from '@/features/grn/rates/rateErrors';
import { markItemRatesStale } from '@/features/item-pricing/useItemRates';
import { useStandardRate } from '@/features/item-pricing/useStandardRate';
import { canOpenScreen } from '@/config/roles';
import { StatusTag } from '@/components/ui';
import { t as tr, formatIdentifier } from '@/i18n';
import { getLanguage } from '@/i18n/language';
import { serverText } from '@/utils/serverText';
import { isNumberFormatRefusal, numberFormatText } from '@/utils/numberFormatRefusal';
import { createLogger, loggableError } from '@/utils/logger';
import { getGrnItemRates } from '@/services/item-pricing-service';
import type { ScrollViewRef } from '@/types/nativeRefs';

const log = createLogger('grn');

/** "9 Oct 2026" (§12.3); today when no date is set yet. */
function formatReviewDate(value: string | undefined): string {
  return formatDate(value || new Date());
}

// Alert texts as functions, so they follow the app's language (docs/I18N.md rule 2).
const stockProtectedTitle = () => tr('grn.header.dispatchedWarningTitle');
const stockProtectedMessage = () => tr('grn.review.stockProtectedMessage');
const saveFailedTitle = () => tr('grn.review.saveFailedTitle');
const connectionHint = () => tr('common.checkConnection');

type GrnReviewStepProps = {
  mode: 'create' | 'edit';
};

/** The folding sections of the step, top to bottom. */
/** The server's refusals about the date and the number of a new GRN: the person fixes them on step 1. */
const CREATE_STEP_REFUSALS: ReadonlySet<string> = new Set([REFUSAL.GRN_DATE_FUTURE, REFUSAL.GRN_NUMBER_SPACES]);

/** The app's sentence for a refusal about the date or the number of a GRN; undefined for any other reason. */
function refusalText(refusal: ServerRefusal): string | undefined {
  if (refusal.reason === REFUSAL.GRN_DATE_FUTURE) {
    const today = refusalString(refusal, 'today')?.slice(0, 10);
    return tr('grn.refusal.dateFuture', { date: today ? formatDate(today) : '' });
  }
  if (refusal.reason === REFUSAL.GRN_NUMBER_SPACES) return tr('grn.refusal.numberSpaces');
  return undefined;
}

type ReviewSectionId = 'details' | 'photos' | 'items' | 'rates';

export function GrnReviewStep({ mode }: GrnReviewStepProps) {
  const styles = useThemedStyles(makeStyles);
  const table = useThemedStyles(makeTableStyles);
  const screen = useTableLayout();
  const t = useTokens();

  // Extract ID from URL params for edit mode
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  // Opened on this step from GRN → Overview → Rates, on a rate typed on this GRN (owner, 2026-10-17;
  // features/grn/rates/paths.ts grnRatesStepPath): steps 1 and 2 are not under it, so going back puts
  // them there first, and the step scrolls to its Rates block once the GRN has loaded.
  const openedOnRates = mode === 'edit' && focus === 'rates';

  const {
    header,
    items,
    grnId,
    tempGrnId,
    isSaving,
    isCreateMode,
    resetFormState,
  } = useGRNForm({ mode, grnIdParam: id });

  const dispatch = useAppDispatch();
  // Saved photos removed in this edit; they are deleted when the GRN is saved.
  const removedImages = useAppSelector(selectGRNRemovedImages) ?? [];
  // The form's session id for the create's idempotency key: null until the first Create makes it, then kept for
  // every retry of this form (a reset clears it).
  const submissionNonce = useAppSelector(selectGRNSubmissionNonce);
  // The number was typed by the person, not offered by the form (see handleNumberTakenAtCreate).
  const grNoTyped = useAppSelector(selectGRNGrNoTyped);
  // Rates saved with the GRN: the set for this GRN only, and changes of the item's rate (backend migration 86).
  const grnRates = useAppSelector(selectGRNRates);
  const rateChanges = useAppSelector(selectGRNRateChanges);
  const removedRates = useAppSelector(selectGRNRemovedRates);
  // An invoiced GRN being edited: its rates are shown, sent back as they are, and cannot be set here.
  const grnInvoiced = useAppSelector(selectGRNInvoiced) && !isCreateMode;
  // The GRN's version token as the edit form read it (get_grn_edit_state, backend migration 121); null on an older
  // server. Save sends it back, and the server refuses the save when someone else changed the GRN since (STALE_RECORD).
  const loadedUpdatedAt = useAppSelector(selectGRNLoadedUpdatedAt);
  // Set once this form has created its GRN. A further press of Create never creates again:
  // save_grn would answer the repeat with the same GRN and every photo would go up twice.
  const createdRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Photos of the GRN just saved that did not upload; the user is asked to try again or go on.
  const [photosNotUploaded, setPhotosNotUploaded] = useState<{ grnId: string; failed: FailedGRNPhoto[] } | null>(null);
  const [isRetryingPhotos, setIsRetryingPhotos] = useState(false);
  // A create, an edit save or a photo retry is running: the form is locked. No field, photo or rate changes, and the
  // header's X, the step pills, Previous, the Back key and every other way off this step do nothing until it ends
  // (leaving would reset the form under the save).
  const isSubmittingState = (isCreateMode ? isSubmitting : isSaving) || isRetryingPhotos;
  // The save got no answer (owner rule D22): the form stays locked while the server is asked about that request.
  // The X alone leaves, with a warning that the GRN may be saved, and stops the check.
  const [lostChecking, setLostChecking] = useState(false);
  const lostAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => lostAbortRef.current?.abort(), []);
  const saveInFlightRef = useRef(false);
  const [localValidationErrors, setLocalValidationErrors] = useState<Record<string, string>>({});
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [documentNumber, setDocumentNumber] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState<DocumentData | null>(null);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showImageOverlay, setShowImageOverlay] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // ---- Rates section ----
  // Only administrators and supervisors set rates on a GRN (owner, 2026-10-16; the server refuses p_rates from
  // staff from backend migration 90). For anyone else the step has no Rates block, nothing is read for it,
  // no rate is checked and `p_rates` is left out of the save.
  const role = useAppSelector((s) => s.auth?.userProfile?.role);
  const canSetRates = canOpenScreen(role, 'itemPricing');
  const scrollRef = useRef<ScrollViewRef>(null);
  const ratesY = useRef(0);
  // The sections are rows of one table card: RATES' place in the scroll is the card's plus its own in the card.
  const cardY = useRef(0);
  // Scroll to Rates each time the block moves while the GRN loads, until the person scrolls or opens a section.
  const ratesFocusPending = useRef(openedOnRates);
  // The sections fold, one open at a time (owner, 2026-10-17): ITEMS when the step opens, RATES when it was
  // opened from the GRN's Rates, and on a new GRN with no GRN photo yet, the GRN PHOTOS (a photo is required).
  // A closed section shows a one-line summary under its heading. Read once, when the step mounts.
  const startSection: ReviewSectionId = openedOnRates ? 'rates' : isCreateMode && !header.gr_images?.length ? 'photos' : 'items';
  const { open: openSection, toggle, show } = useReviewSections<ReviewSectionId>(startSection);
  const toggleSection = (section: string) => {
    ratesFocusPending.current = false;
    toggle(section as ReviewSectionId);
  };
  const [sheetRow, setSheetRow] = useState<PricedRow | null>(null);
  const rateCtx = useMemo(
    () => ({ customerId: header.customer_id || null, day: toCalendarDay(header.date || new Date()), priceType: priceTypeOf(header.pricing_mode) }),
    [header.customer_id, header.date, header.pricing_mode],
  );
  const ctxKey = contextKey(rateCtx);
  const rateRowList = useMemo(() => groupRows(items), [items]);
  const stored = useGrnRates(canSetRates ? rateRowList.map((r) => r.item_id) : [], ctxKey);
  const standard = useStandardRate(canSetRates);
  const pricedRows = useMemo(
    () => priceRows(rateRowList, { rates: stored.rates, ctx: rateCtx, grnRates, changes: rateChanges }),
    [rateRowList, stored.rates, rateCtx, grnRates, rateChanges],
  );
  const preloadInput = useMemo(
    () => ({ rates: stored.rates, ctx: rateCtx, standard: standard.rate?.tiers ?? null }),
    [stored.rates, rateCtx, standard.rate],
  );
  // The price type changed in the GRN's details: what was set for the other type goes (the server drops the
  // stored ones of the other type on its own), and the person is told once.
  useEffect(() => {
    if (!canSetRates || grnInvoiced) return;
    const next = dropOtherPriceType({ grnRates, changes: rateChanges }, rateCtx.priceType);
    if (!next.removed) return;
    dispatch(setGrnRates(next.grnRates));
    dispatch(setRateChanges(next.changes));
    setSnackbarMessage(tr('grn.review.ratesOtherTypeRemoved'));
    setSnackbarVisible(true);
  }, [rateCtx.priceType, grnRates, rateChanges, grnInvoiced, canSetRates, dispatch]);
  const scrollRatesIntoView = () => scrollRef.current?.scrollTo({ y: Math.max(0, cardY.current + ratesY.current - space.lg), animated: true });
  /** Opens RATES and scrolls to it: at once when it is open, else once it has moved into place. */
  const scrollToRates = () => {
    if (openSection === 'rates') {
      scrollRatesIntoView();
      return;
    }
    ratesFocusPending.current = true;
    show('rates');
  };
  const saveRateEntry = (entry: SheetEntry) => {
    if (!sheetRow || isSubmittingState) return;
    const next = withEntry({ grnRates, changes: rateChanges }, sheetRow.item_id, entry, rateCtx);
    dispatch(setGrnRates(next.grnRates));
    dispatch(setRateChanges(next.changes));
    setSheetRow(null);
  };
  const dropRateEntry = (row: PricedRow) => {
    if (isSubmittingState) return;
    const next = withoutEntryFor({ grnRates, changes: rateChanges }, row);
    dispatch(setGrnRates(next.grnRates));
    dispatch(setRateChanges(next.changes));
  };
  /**
   * Undo change takes back an edit made in this form at once; Remove drops a rate this GRN already has, so it asks
   * first (owner, 2026-10-17: it acted with no question and nothing on screen said it waits for the save).
   */
  const undoRateEntry = (row: PricedRow) => {
    if (isSubmittingState) return;
    if (!(row.rate?.source === 'grn' && row.rate.entry?.saved === true)) {
      dropRateEntry(row);
      return;
    }
    void askAlert(
      tr('grn.rates.removeTitle'),
      tr('grn.rates.removeMessage', { item: row.item_name }),
      [
        { text: tr('common.cancel'), style: 'cancel', value: false },
        { text: tr('grn.rates.remove'), style: 'destructive', value: true },
      ],
      false
    ).then(remove => {
      if (!remove) return;
      const next = removeSavedFor({ grnRates, changes: rateChanges, removed: removedRates }, row);
      dispatch(setGrnRates(next.grnRates));
      dispatch(setRateChanges(next.changes));
      dispatch(setRemovedGrnRates(next.removed));
    });
  };
  /** Undo remove: the rate this GRN had goes back, before the save (owner, 2026-10-17). */
  const restoreRateEntry = (row: PricedRow) => {
    if (isSubmittingState) return;
    const next = restoreRemovedFor({ grnRates, removed: removedRates }, row);
    dispatch(setGrnRates(next.grnRates));
    dispatch(setRemovedGrnRates(next.removed));
  };
  /** `p_rates` as the form holds them now. */
  const ratesToSave = () => (canSetRates ? buildRates({ grnRates, changes: rateChanges, ctx: rateCtx, lines: items, invoiced: grnInvoiced, stored: stored.rates }) : undefined);
  /** The server refused the rates: read them again and say why. */
  const showRateRefusal = (rateError: { code: string; data: unknown }, message: string) => {
    void stored.refresh();
    showAlert(tr('grn.review.ratesRefusedTitle'), rateRefusalText(rateError.code, rateError.data, message));
    scrollToRates();
  };

  // The X in the step header asks before it calls this, so there is no second question here.
  const handleCancel = () => {
    // During a save nothing leaves; while its lost answer is being checked the X does, after its warning.
    if (isSubmittingState && !lostChecking) return;
    lostAbortRef.current?.abort();
    resetFormState();
    // Always navigate to GRN list directly, not back one step
    router.replace('/grn');
  };

  const calculateTotals = () => ({
    totalItems: items.length,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0),
  });

  const { totalItems, totalQty } = calculateTotals();

  const editStep = (step: 1 | 2) => ({ pathname: step === 1 ? ('/grn-edit/[id]/step1' as const) : ('/grn-edit/[id]/step2' as const), params: { id } });

  /** Back to the Items step. The callers that may run while a save is being settled check the lock themselves. */
  const goToItemsStep = () => {
    dispatch(setCurrentStep(2));
    if (openedOnRates) {
      router.replace(editStep(1));
      router.push(editStep(2));
      return;
    }
    router.back();
  };

  /** Back to the details step. */
  const goToDetailsStep = () => {
    dispatch(setCurrentStep(1));
    if (openedOnRates) {
      router.replace(editStep(1));
      return;
    }
    router.back();
    requestAnimationFrame(() => {
      router.back();
    });
  };

  const handlePrevious = () => {
    if (isSubmittingState) return;
    goToItemsStep();
  };

  const handleNavigateToHeader = () => {
    if (isSubmittingState) return;
    goToDetailsStep();
  };

  // The Back key goes to step 2 as Previous does; on the normal way in, the stack already does that. While a save
  // runs it does nothing (the create route's own handler ignores it too: app/grn-form/step3.tsx).
  useBackHandler({
    enabled: openedOnRates || isSubmittingState,
    onBackPress: () => {
      if (isSubmittingState) return true;
      handlePrevious();
      return true;
    },
  });

  const handleStepIndicatorPress = (stepNumber: number) => {
    if (isSubmittingState || stepNumber === STEP_NUMBERS.REVIEW) return;
    if (stepNumber === STEP_NUMBERS.ITEMS) {
      handlePrevious();
    } else if (stepNumber === STEP_NUMBERS.HEADER) {
      handleNavigateToHeader();
    }
  };

  const validateFormData = async (): Promise<boolean> => {
    const checked = await validateStep3({ header, items });
    // The number of a saved GRN is read-only and goes back as it was stored (owner decision D6): a stored number that
    // fails today's format (older data) does not stop the edit.
    const validation = isCreateMode ? checked : withoutStoredNumberError(checked);

    if (!validation.isValid) {
      setLocalValidationErrors(validation.errors);
      dispatch(setValidationErrors(validation.errors));

      const errorMessages: string[] = [];
      Object.entries(validation.errors).forEach(([field, message]) => {
        if (field.startsWith('header.')) {
          errorMessages.push(tr('grn.review.errorInDetails', { message }));
        } else if (field.startsWith('items')) {
          const match = field.match(/items\[(\d+)\]\.(.+)/);
          if (match) {
            const itemIndex = parseInt(match[1], 10) + 1;
            errorMessages.push(tr('grn.review.errorInItem', { message, number: itemIndex }));
          } else {
            errorMessages.push(tr('grn.review.errorInItems', { message }));
          }
        } else {
          errorMessages.push(`• ${message}`);
        }
      });

      showAlert(tr('grn.form.checkDetailsTitle'), errorMessages.join('\n') || tr('grn.review.fixHighlighted'));
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if ((isCreateMode && isSubmitting) || (!isCreateMode && isSaving)) return;
    if (isCreateMode && createdRef.current) {
      if (!photosNotUploaded) setShowSuccessDialog(true);
      return;
    }

    const isValid = await validateFormData();
    if (!isValid) return;

    // Every line needs a rate before the GRN is saved (and the rates must be known).
    if (canSetRates && stored.status !== 'ready') {
      showAlert(tr('grn.review.ratesNotLoadedTitle'), tr('grn.review.ratesNotLoadedMessage'));
      scrollToRates();
      return;
    }
    // An invoiced GRN is not checked: its invoice keeps its own figures and the server skips the check too.
    if (canSetRates && !grnInvoiced && missingCount(pricedRows) > 0) {
      showAlert(tr('grn.review.ratesMissingTitle'), tr('grn.review.ratesMissingMessage'));
      scrollToRates();
      return;
    }

    // Only the prepared copy of a photo is uploaded, never the camera or gallery file. A
    // photo still being prepared holds the save; one that could not be prepared has to go.
    const photoState = unpreparedGRNPhotos(header.gr_images || [], items.map((item) => ({ images: item.trl_images })));
    if (photoState === 'preparing') {
      showAlert(tr('grn.review.photosPreparingTitle'), tr('grn.review.photosPreparingMessage'));
      return;
    }
    if (photoState === 'failed') {
      showAlert(tr('grn.review.photoNotPreparedTitle'), tr('grn.review.photoNotPreparedMessage'));
      return;
    }

    if (!header.gr_images || header.gr_images.length === 0) {
      showAlert(
        tr('grn.review.photoRequiredTitle'),
        tr('grn.review.photoRequiredMessage', { number: formatIdentifier(header.gr_no) })
      );
      return;
    }

    // An edit asks the server again which orders it changes, so the question names what is true now.
    if (!isCreateMode) await refreshOrderEffects();

    // Show custom confirm dialog (dark mode compliant)
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmDialog(false);
    // One save at a time. A second tap on Confirm before the dialog closes would save again,
    // and every photo picked in the form would be uploaded twice.
    if (saveInFlightRef.current || (isCreateMode && createdRef.current)) return;
    saveInFlightRef.current = true;
    // The form's session as Confirm is pressed: if it has changed when the save answers, the form was left (and
    // maybe a new one started), and the answer must not touch the form, its photo files or this screen.
    const formSession = currentGrnFormSession();
    try {
      if (isCreateMode) {
        // A likely duplicate (backend migration 124) is a warning, never a block. The person answers it once the save has
        // ended (the busy flags are down, the form is as it was): Cancel leaves the form on this step, Save anyway sends
        // the same GRN again with the warning off. Nothing else can start a save meanwhile (`saveInFlightRef`).
        let warnDuplicate = true;
        // What the first attempt settled for this form: its number and its id. "Save anyway" is the same GRN, so it uses
        // them; this render's `header` and `submissionNonce` are older than the first attempt (it may have fetched the
        // number and made the id after this render).
        let carried: { grNo: string; nonce: string } | undefined;
        for (;;) {
          const attempt = await performCreate(formSession, warnDuplicate, carried);
          if (!attempt) break;
          const choice = await askPossibleDuplicate(attempt.duplicate);
          if (choice !== 'save' || currentGrnFormSession() !== formSession) break;
          warnDuplicate = false;
          carried = { grNo: attempt.grNo, nonce: attempt.nonce };
        }
      } else {
        await performUpdate(formSession);
      }
    } finally {
      saveInFlightRef.current = false;
    }
  };

  /**
   * The GRN is saved. Say what happened to its photos before the success dialog:
   * photos that did not upload are listed with a retry, never passed over.
   */
  const finishSave = (savedGrnId: string | undefined, photos: GRNPhotoSaveReport | undefined) => {
    void noteItemsWithoutRate(savedGrnId);
    if (photos && photos.removalFailures > 0) {
      setSnackbarMessage(tr('grn.review.photosNotRemoved', { count: photos.removalFailures }));
      setSnackbarVisible(true);
    }
    if (savedGrnId && photos && photos.failed.length > 0) {
      triggerWarning();
      setPhotosNotUploaded({ grnId: savedGrnId, failed: photos.failed });
      return;
    }
    setShowSuccessDialog(true);
  };

  /**
   * Staff do not see or set rates (owner decision D11): a GRN with an item that has no rate yet is still saved. What
   * they may read is the rate each lot is invoiced at (get_grn_item_rates), so the success dialog tells them which
   * items have none. A failed or missing read says nothing; the save is not affected.
   */
  const noteItemsWithoutRate = async (savedGrnId: string | undefined) => {
    if (canSetRates || !savedGrnId) return;
    try {
      const answer = await getGrnItemRates(savedGrnId);
      const names = [...new Set((answer?.rates ?? []).filter((rate) => rate.source === null).map((rate) => rate.item_name))];
      if (names.length === 0) return;
      setSuccessDialogData((current) => (current ? { ...current, notices: [tr('grn.review.noRateYet', { items: names.join(', ') })] } : current));
    } catch (rateError) {
      log.warn('Could not read the rates of the saved GRN', loggableError(rateError));
    }
  };

  const handleRetryPhotos = async () => {
    if (!photosNotUploaded || isRetryingPhotos) return;
    const { grnId: savedGrnId, failed } = photosNotUploaded;
    // The form's saving flag goes with the retry: the create route's Back key reads it, and leaving while the
    // photos upload would drop the retry (it did leave step 3 before).
    const formSession = currentGrnFormSession();
    setPhotosNotUploaded(null);
    setIsRetryingPhotos(true);
    dispatch(setIsSaving(true));
    try {
      const outcome = await uploadGRNPhotos(savedGrnId, failed);
      if (outcome.failed.length > 0) {
        triggerWarning();
        setPhotosNotUploaded({ grnId: savedGrnId, failed: outcome.failed });
        return;
      }
      triggerSuccess();
      setSnackbarMessage(tr('grn.review.photosUploaded'));
      setSnackbarVisible(true);
      setShowSuccessDialog(true);
    } finally {
      setIsRetryingPhotos(false);
      // A form that was left (or reset) already has its own saving flag.
      if (currentGrnFormSession() === formSession) dispatch(setIsSaving(false));
    }
  };

  const handleContinueWithoutPhotos = () => {
    // The photos are given up, retry included: their files on the phone go (the
    // registry keeps a file while an upload of it still runs, until it ends).
    if (photosNotUploaded) {
      const files = photosNotUploaded.failed.map((photo) => photo.image.imageUrl);
      files.forEach(abandonLocalPhotoUpload);
      void releaseLocalPhotos(files);
    }
    setPhotosNotUploaded(null);
    setShowSuccessDialog(true);
  };

  /**
   * A save finished after its form was left (the session changed since Confirm): the GRN is saved but the form,
   * its photo files and this screen belong to someone else now, so only the person is told, in a dialog, that it
   * is saved. Otherwise a person who believes the form was discarded enters the same GRN again.
   */
  const reportSavedAfterLeaving = (grNo: string | undefined, photos: GRNPhotoSaveReport | undefined) => {
    markItemRatesStale();
    showAlert(
      tr('grn.review.savedAfterLeavingTitle'),
      tr(photos && photos.failed.length > 0 ? 'grn.review.savedAfterLeavingPhotos' : 'grn.review.savedAfterLeaving', { number: formatIdentifier(grNo ?? '') })
    );
  };

  /**
   * Sends a save and settles a lost answer before anything else happens (owner rule D22). When the save was sent and
   * got no answer it may be applied, so the form stays locked (`lostChecking`: the strip, no edits, X only with its
   * warning) and the server is asked about that request's code once the phone is online and 10 s have passed since it
   * was sent. Found: `send` is called with the stored answer, which is handled like the answer that was lost. Not
   * found: the identical request is sent once more, byte for byte (`send` is given the lost attempt: its body and its
   * code), and its answer is handled the same way.
   *
   * Once an answer is lost the attempt is settled only by the server's answer to it: a resend that fails without one
   * (57014 while it waits behind the original, a failure before sending, a changed session, a gateway error) comes
   * back as a lost answer again (the service sets it), and the form stays locked and goes back to the check. A resend
   * refused for the number (`numberTaken` with a lost answer) means the first send may have saved it: it goes back to
   * the check too, and when the check finds nothing and the resend is refused for the number again the result says
   * `numberMaybeSaved`: no next number is offered. A 57014 on the FIRST send is an answer, not a lost one: nothing was
   * saved.
   *
   * @returns the answer to handle, or null when the form was left while the check ran (the X's warning said so).
   */
  const sendUntilAnswered = async <R extends { lostAnswer?: GRNLostAnswer; numberTaken?: { number: string } }>(
    send: (resend?: GRNLostAnswer, storedAnswer?: unknown) => Promise<R>,
    formLeft: () => boolean
  ): Promise<(R & { numberMaybeSaved?: boolean }) | null> => {
    try {
      let result = await send();
      let takenOnResend = false;
      while (result.lostAnswer) {
        // The person left: this screen gives the unfinished-save note up (the start-up check may settle it).
        if (formLeft()) {
          releaseUnfinishedSave(result.lostAnswer.key);
          return null;
        }
        if (result.numberTaken) {
          // The second refusal for the number after a check that found nothing: the person looks in the list. They are
          // told to check it, so nothing is left in doubt for the start-up check.
          if (takenOnResend) {
            await forgetUnfinishedSave(result.lostAnswer.key);
            return { ...result, lostAnswer: undefined, numberMaybeSaved: true };
          }
          takenOnResend = true;
        }
        const lost = result.lostAnswer;
        const controller = new AbortController();
        lostAbortRef.current = controller;
        setLostChecking(true);
        let check: { found: boolean; response?: unknown };
        try {
          check = await checkSubmission(lost.key, lost.sentAt, controller.signal);
        } catch (checkError) {
          // Aborted: the person left through the X. Anything else is not expected (the check retries by itself).
          if (!controller.signal.aborted) throw checkError;
          releaseUnfinishedSave(lost.key);
          return null;
        } finally {
          lostAbortRef.current = null;
        }
        if (controller.signal.aborted || formLeft()) {
          releaseUnfinishedSave(lost.key);
          return null;
        }
        // The server has the stored answer of the lost request: it is the answer, and nothing is left in doubt for the
        // next start of the app (a request that is sent again settles its own note in createGRN).
        if (check.found) await forgetUnfinishedSave(lost.key);
        result = check.found ? await send(undefined, check.response ?? undefined) : await send(lost);
      }
      return result;
    } finally {
      setLostChecking(false);
    }
  };

  /** Back to step 1, where the number is (the create form's stack is step 1, 2, 3). */
  const leaveToNumberStep = () => {
    dispatch(setCurrentStep(1));
    router.back();
    requestAnimationFrame(() => {
      router.back();
    });
  };

  /**
   * Another GRN holds the form's number (it was free when the form got it): the person is told and taken to the step
   * with the number. A number the form offered is replaced by the next free one (like the dispatch and invoice forms);
   * a number the person typed is not changed behind their back, step 1 refuses it until they do.
   */
  const handleNumberTakenAtCreate = async (takenNumber: string, formLeft: () => boolean) => {
    triggerError();
    const okButtons = [{ text: tr('common.ok'), onPress: leaveToNumberStep }];
    if (!grNoTyped) {
      let next: string | null = null;
      try {
        next = await getNextGRNNumber(header.date);
      } catch (numberError) {
        log.error('Could not get the next GRN number', loggableError(numberError));
      }
      if (formLeft()) return;
      if (next && next !== takenNumber) {
        dispatch(updateHeader({ gr_no: next }));
        showAlert(
          saveFailedTitle(),
          tr('grn.review.numberUsedNext', { number: formatIdentifier(takenNumber), next: formatIdentifier(next) }),
          okButtons
        );
        return;
      }
    }
    const message = tr('grn.form.numberTaken', { number: formatIdentifier(takenNumber) });
    dispatch(setTakenNumberError(message));
    showAlert(saveFailedTitle(), message, okButtons);
  };

  /**
   * The create was refused for its number again after a lost answer and a check that found nothing: the first send may
   * have saved it. The form stays locked behind this one dialog, whose only button leaves the form for the list; no
   * next number is offered and nothing can be sent again from here.
   */
  const showNumberMaybeSaved = (number: string) => {
    showAlert(
      saveFailedTitle(),
      tr('grn.form.numberMaybeSaved', { number: formatIdentifier(number) }),
      [
        {
          text: tr('common.close'),
          onPress: () => {
            resetFormState();
            router.replace('/grn');
          },
        },
      ],
      { cancelable: false }
    );
  };

  /**
   * @param carried the number and the form id an earlier attempt of this same create settled ("Save anyway" repeats the GRN).
   * @returns the earlier GRN this one looks like, when the server warned about it (nothing was saved), with the number and
   * the form id this attempt used.
   */
  const performCreate = async (
    formSession: number,
    warnDuplicate = true,
    carried?: { grNo: string; nonce: string }
  ): Promise<{ duplicate: PossibleDuplicate; grNo: string; nonce: string } | undefined> => {
    const formLeft = () => currentGrnFormSession() !== formSession;
    // Set when the form must stay locked after this call (see showNumberMaybeSaved).
    let keepLocked = false;
    let possibleDuplicate: { duplicate: PossibleDuplicate; grNo: string; nonce: string } | undefined;
    setIsSubmitting(true);
    dispatch(setIsSaving(true));
    try {
      // The number is fetched once and kept in the form before the first send: a second press, or a retry after an
      // answer that never came, then sends the same body and gets the same idempotency key. (createGRN does not
      // ask for a number: a new one per press would save the GRN twice.)
      let grNo = carried?.grNo ?? header.gr_no;
      if (!grNo) {
        try {
          grNo = await getNextGRNNumber(header.date);
        } catch (numberError) {
          if (formLeft()) return;
          triggerError();
          log.error('Could not get the GRN number', loggableError(numberError));
          showAlert(tr('errors.grn.form.numberFailedTitle'), connectionHint());
          return;
        }
        if (formLeft()) return;
        // The facility's rule offers no number (free text, a full series): the person types one on step 1.
        if (!grNo) {
          triggerError();
          showAlert(saveFailedTitle(), tr('numbering.typeGrnNumber'), [{ text: tr('common.ok'), onPress: leaveToNumberStep }]);
          return;
        }
        dispatch(updateHeader({ gr_no: grNo }));
        dispatch(setGrNoTyped(false));
      }

      // The form's session id, made by the first Create and kept for every retry of this form (it is part of the
      // request code; a reset after a save clears it).
      let nonce = carried?.nonce ?? submissionNonce;
      if (!nonce) {
        nonce = newSubmissionNonce();
        dispatch(setSubmissionNonce(nonce));
      }

      // Built once: a send after a lost answer is the identical request, the same body under the same request code.
      const request = {
        header: { ...header, gr_no: grNo },
        items: items.map((item) => ({
          item_table_id: item.item_table_id,
          item_name: item.item_name,
          packaging: item.packaging,
          qty: item.qty,
          weight: item.weight,
          rack: item.rack,
          package_mark: item.package_mark,
          trl_images: item.trl_images || [],
        })),
        rates: ratesToSave(),
        nonce,
        warnDuplicate,
      };

      const result = await sendUntilAnswered(
        (resend, storedAnswer) =>
          createGRN({
            ...request,
            ...(storedAnswer === undefined ? {} : { storedAnswer }),
            ...(resend ? { resend } : {}),
          }),
        formLeft
      );
      // The form was left while the answer was being checked: nothing more to do here.
      if (!result) return;

      if (formLeft()) {
        if (result.success && result.data) reportSavedAfterLeaving(result.data.gr_no, result.data.photos);
        return;
      }

      if (result.success && result.data) {
        createdRef.current = true;
        // The rates saved with the GRN change which items have a rate: the Items list reads them again.
        markItemRatesStale();
        triggerSuccess();
        resetFormState();
        const grNo = result.data.gr_no;
        setDocumentNumber(grNo);
        setSuccessDialogData({
          documentNo: grNo,
          customerName: header.customer_name || tr('common.unknown'),
          date: formatReviewDate(header.date),
          itemCount: items.length,
          totalQuantity: totalQty,
        });
        finishSave(result.data.id, result.data.photos);
      } else if (result.duplicate) {
        // Nothing was saved: the person is asked once this call has ended (see handleConfirmSubmit).
        triggerWarning();
        possibleDuplicate = { duplicate: result.duplicate, grNo, nonce };
      } else if (result.numberMaybeSaved) {
        triggerError();
        keepLocked = true;
        showNumberMaybeSaved(result.numberTaken?.number ?? header.gr_no);
      } else if (result.numberTaken) {
        await handleNumberTakenAtCreate(result.numberTaken.number, formLeft);
      } else if (isNumberFormatRefusal(result.refusal)) {
        // The number does not follow the facility's numbering (migration 127): step 1 refuses it until it is changed.
        triggerError();
        const message = numberFormatText(result.refusal);
        dispatch(setTakenNumberError(message));
        showAlert(saveFailedTitle(), message, [{ text: tr('common.ok'), onPress: leaveToNumberStep }]);
      } else if (result.refusal && CREATE_STEP_REFUSALS.has(result.refusal.reason)) {
        // The date or the number is refused (migration 130): said in the app's words, and the person is taken to step 1.
        triggerError();
        const message = refusalText(result.refusal);
        if (message) {
          showAlert(saveFailedTitle(), message, [{ text: tr('common.ok'), onPress: leaveToNumberStep }]);
        }
      } else {
        triggerError();
        if (result.rateError) showRateRefusal(result.rateError, result.error);
        else showAlert(saveFailedTitle(), serverText(result.error, connectionHint(), { write: true, form: true }));
      }
    } catch (error) {
      if (formLeft()) return;
      triggerError();
      log.error('Submission error', loggableError(error));
      showAlert(saveFailedTitle(), connectionHint());
    } finally {
      if (!keepLocked) {
        setIsSubmitting(false);
        // A form that was left (or reset by this very save) already has its own saving flag.
        if (!formLeft()) dispatch(setIsSaving(false));
      }
    }
    return possibleDuplicate;
  };

  /**
   * The edit form is replaced by what the server holds now (the person chose "Open it again" after a stale save): the
   * GRN is read again, forced, the form's photo files and everything typed in it go, and the details step opens.
   * A read that fails changes nothing and says so.
   */
  const reopenFromServer = async (editedGrnId: string, formLeft: () => boolean) => {
    const reloaded = await loadGRNDataService(editedGrnId);
    if (formLeft()) return;
    if (!reloaded.success || !reloaded.data) {
      showAlert(tr('errors.grn.form.loadFailedTitle'), serverText(reloaded.error, tr('common.checkConnection')));
      return;
    }
    resetFormState();
    dispatch(loadGRNFormData({ ...reloaded.data, grnId: editedGrnId }));
    goToDetailsStep();
  };

  /**
   * update_grn refused the save by one of the rules of backend migration 121. The text is the app's own, written from
   * the reason and its fields (never the server's English), and the person is sent where it can be put right: the
   * details step for the number and the date, the items step for a line, Rates for a rate that would go. Nothing was saved.
   */
  const handleUpdateRefusal = async (refusal: ServerRefusal, editedGrnId: string, formLeft: () => boolean) => {
    const lineId = refusalString(refusal, 'line_id');
    const lineIndex = lineId ? items.findIndex((item) => item.grn_trl_id === lineId) : -1;
    const itemName = refusalString(refusal, 'item_name') ?? (lineIndex >= 0 ? items[lineIndex].item_name : '');
    const grNo = refusalString(refusal, 'gr_no') ?? header.gr_no;
    const invoiceNo = refusalString(refusal, 'invoice_no');
    const lineTitle = lineIndex >= 0 ? tr('grn.refusal.lineTitle', { position: lineIndex + 1 }) : saveFailedTitle();
    const ok = (onPress?: () => void) => [{ text: tr('common.ok'), onPress }];

    // What "Open it again" does after a line refusal: the form is replaced by the GRN as the server holds it now. The
    // refusal may come from a locked line the form did not know (changed by someone else since it was opened), and
    // nothing in the form could put it right.
    const reopen = () => {
      if (!formLeft()) void reopenFromServer(editedGrnId, formLeft);
    };
    const reopenButton = { text: tr('errors.refusal.stale.reload'), style: 'destructive' as const, onPress: reopen };
    // Close leaves the dialog; `then` is where a line refusal sends the person (the items step), when it does.
    const closeButton = (then?: () => void) => ({ text: tr('common.close'), style: 'cancel' as const, onPress: then });

    switch (refusal.reason) {
      case REFUSAL.STALE_RECORD: {
        // 'keep' leaves the form as it is; 'reload' replaces it with the GRN as it is now.
        const choice = await askStaleRecord('grn');
        if (choice === 'reload' && !formLeft()) await reopenFromServer(editedGrnId, formLeft);
        return;
      }
      case REFUSAL.LOT_INVOICED:
        showAlert(lineTitle, lotInvoicedText(itemName, invoiceNo), [closeButton(goToItemsStep), reopenButton]);
        return;
      case REFUSAL.LOT_DISPATCHED:
        showAlert(lineTitle, tr('grn.refusal.lotDispatched', { item: itemName }), [closeButton(goToItemsStep), reopenButton]);
        return;
      case REFUSAL.GRN_INVOICED:
        showAlert(saveFailedTitle(), invoicedNoNewLotText(formatIdentifier(grNo), invoiceNo), ok(goToItemsStep));
        return;
      case REFUSAL.GRN_DATE_AFTER_DISPATCH: {
        // The first dispatch is on this day: the details step's picker and check follow it.
        const firstDispatch = refusalString(refusal, 'first_dispatch_date')?.slice(0, 10);
        if (firstDispatch) dispatch(setFirstDispatchDate(firstDispatch));
        showAlert(
          saveFailedTitle(),
          tr('grn.validation.dateAfterDispatch', { grn: formatIdentifier(grNo), date: firstDispatch ? formatDate(firstDispatch) : '' }),
          ok(goToDetailsStep)
        );
        return;
      }
      case REFUSAL.GRN_DATE_LOCKED:
        showAlert(saveFailedTitle(), tr('grn.refusal.dateInvoiced'), ok(goToDetailsStep));
        return;
      case REFUSAL.GRN_DATE_FUTURE:
      case REFUSAL.GRN_NUMBER_SPACES:
        showAlert(saveFailedTitle(), refusalText(refusal) ?? serverText(refusal.text, connectionHint(), { write: true, form: true }), ok(goToDetailsStep));
        return;
      case REFUSAL.GRN_PHOTO_REQUIRED:
        // An edit may not leave a GRN with no photo: the photos section is where one is added.
        showAlert(saveFailedTitle(), tr('grn.refusal.lastPhoto'), ok(() => show('photos')));
        return;
      case REFUSAL.GRN_NUMBER_LOCKED:
        showAlert(saveFailedTitle(), tr('grn.refusal.numberLocked'), ok(goToDetailsStep));
        return;
      case REFUSAL.RATES_NEED_MANAGER: {
        // A staff edit that would remove a rate set for this GRN: stays here, the form is kept.
        const names = refusalStrings(refusal, 'items') ?? [];
        showAlert(
          saveFailedTitle(),
          names.length > 0 ? tr('grn.refusal.ratesNeedManagerItems', { items: names.join(', ') }) : tr('grn.refusal.ratesNeedManager')
        );
        return;
      }
      case REFUSAL.RATES_WOULD_DROP: {
        // A weight or pricing-mode edit would drop a rate set for this GRN: Rates is where a new one is set.
        const names = refusalStrings(refusal, 'items') ?? [];
        void stored.refresh();
        showAlert(
          tr('grn.review.ratesRefusedTitle'),
          names.length > 0 ? tr('grn.refusal.ratesWouldDropItems', { items: names.join(', ') }) : tr('grn.refusal.ratesWouldDrop')
        );
        scrollToRates();
        return;
      }
      case REFUSAL.LINE_ON_ORDER:
        showAlert(
          tr('grn.refusal.removeTitle'),
          tr('grn.refusal.lineOnOrder', { item: itemName, customer: refusalString(refusal, 'customer_name') ?? header.customer_name }),
          [closeButton(), reopenButton]
        );
        return;
      case REFUSAL.LINE_DISPATCHED_BEFORE:
        showAlert(tr('grn.refusal.removeTitle'), tr('grn.refusal.lineDispatchedBefore', { item: itemName }), [closeButton(), reopenButton]);
        return;
      default:
        // A rule this app does not know yet: the server's own sentence, as before.
        showAlert(saveFailedTitle(), serverText(refusal.text, connectionHint(), { write: true, form: true }));
    }
  };

  /** The update_grn request as the form holds it now (built once per save; a resend is identical). */
  const buildUpdateRequest = () => ({
    header: {
      registration: header.registration,
      date: header.date,
      sender_id: header.sender_id,
      sender_name: header.sender_name,
      customer_id: header.customer_id,
      customer_name: header.customer_name,
      supervisor_id: header.supervisor_id,
      supervisor_name: header.supervisor_name,
      note: header.note,
      leon: header.leon,
      pricing_mode: header.pricing_mode,
      gr_images: header.gr_images,
    },
    items: items.map((item) => ({
      grn_trl_id: item.grn_trl_id,
      item_table_id: item.item_table_id,
      item_name: item.item_name,
      packaging: item.packaging,
      qty: item.qty,
      stock: item.stock,
      weight: item.weight,
      rack: item.rack,
      package_mark: item.package_mark,
      trl_images: item.trl_images || [],
    })),
    rates: ratesToSave(),
    // The version the form was read at: part of the request, so a resend after a lost answer is byte for byte the same.
    expectedUpdatedAt: loadedUpdatedAt,
  });

  // What saving this edit does to customers' orders (migration 128), read when the step opens and again when Save is
  // tapped. An older server has no preview: null, and the question is asked as it always was.
  const effectsGrnId = Array.isArray(id) ? id[0] : id || grnId;
  const { effects: orderEffects, refresh: refreshOrderEffects } = useOrderEffectsPreview(
    !isCreateMode && !!effectsGrnId && items.length > 0,
    JSON.stringify([header.customer_id, header.date, items.map((item) => [item.grn_trl_id, item.item_table_id, item.qty, item.stock])]),
    () => previewUpdateGrn(buildUpdateGRNRequest(effectsGrnId as string, buildUpdateRequest()).rpcRequest)
  );

  const performUpdate = async (formSession: number) => {
    const formLeft = () => currentGrnFormSession() !== formSession;
    // The GRN being edited is the route's; the form's id is only what was loaded last. If they differ the form
    // holds another GRN (the edit layout loads the route's GRN before this step is shown, so this is a guard).
    const routeGrnId = Array.isArray(id) ? id[0] : id;
    if (!grnId || (routeGrnId && routeGrnId !== grnId)) {
      showAlert(saveFailedTitle(), tr('grn.form.reopenMessage'));
      return;
    }
    const editedGrnId = routeGrnId || grnId;

    dispatch(setIsSaving(true));
    try {
      // Built once: a send after a lost answer is the identical request. Its request code is the edit session's key
      // for this body, kept until a save is answered (grnUpdateIdempotencyKey).
      const request = buildUpdateRequest();

      const result = await sendUntilAnswered(
        (resend, storedAnswer) =>
          updateGRN(editedGrnId, request, {
            removedImages,
            ...(storedAnswer === undefined ? {} : { storedAnswer }),
            ...(resend ? { resend } : {}),
          }),
        formLeft
      );
      // The form was left while the answer was being checked: nothing more to do here.
      if (!result) return;

      if (formLeft()) {
        if (result.success) reportSavedAfterLeaving(header.gr_no, result.data?.photos);
        return;
      }

      if (result.success) {
        markItemRatesStale();
        // The server lists every dispatched line on every save; only a quantity that differs from the kept one was really refused.
        const skippedItems = result.data?.stats?.items_skipped_stock?.filter((entry) => {
          const sent = items.find((item) => item.grn_trl_id === entry.grn_trl_item_id);
          if (!sent || typeof entry.current_qty !== 'number') return true;
          return Number(sent.qty) !== Number(entry.current_qty);
        });

        let skippedMessage: string | null = null;
        if (skippedItems && skippedItems.length > 0) {
          triggerWarning();
          const skippedText = skippedItems
            .map((item) => `• ${typeof item.dispatched_qty === 'number'
              ? tr('grn.review.skippedLine', { item: item.item_name, qty: formatNumber(item.dispatched_qty) })
              : item.item_name}`)
            .join('\n');
          skippedMessage = tr('grn.review.savedWithSkipped', { items: skippedText });
        } else {
          triggerSuccess();
          setSnackbarMessage(header.gr_no ? tr('grn.review.savedWithNumber', { number: formatIdentifier(header.gr_no) }) : tr('grn.review.saved'));
          setSnackbarVisible(true);
        }

        const grNo = header.gr_no || '';
        setDocumentNumber(grNo);
        setSuccessDialogData({
          documentNo: grNo,
          customerName: header.customer_name || tr('common.unknown'),
          date: formatReviewDate(header.date),
          itemCount: items.length,
          totalQuantity: totalQty,
          orderNotes: orderEffectLines(result.data?.orderEffects),
        });
        const savedPhotos = result.data?.photos;
        if (skippedMessage) {
          // Its own dialog first, so the warning is not hidden behind the success dialog. Not awaited:
          // the Save button must not stay busy while the dialog is open. askAlert settles on OK or dismissal.
          void askAlert(tr('grn.review.skippedTitle'), skippedMessage, [{ text: tr('common.ok'), value: true }], false)
            .then(() => finishSave(editedGrnId, savedPhotos));
        } else {
          finishSave(editedGrnId, savedPhotos);
        }
      } else {
        triggerError();
        const errorMessage = serverText(result.error, connectionHint(), { write: true, form: true });
        if (result.refusal) {
          await handleUpdateRefusal(result.refusal, editedGrnId, formLeft);
        } else if (result.rateError) {
          showRateRefusal(result.rateError, result.error);
        } else if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
          showAlert(stockProtectedTitle(), stockProtectedMessage());
        } else {
          showAlert(saveFailedTitle(), errorMessage);
        }
      }
    } catch (error) {
      if (formLeft()) return;
      triggerError();
      log.error('Update error', loggableError(error));
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
        showAlert(stockProtectedTitle(), stockProtectedMessage());
      } else {
        showAlert(saveFailedTitle(), connectionHint());
      }
    } finally {
      // A form that was left already has its own saving flag: this save must not clear the next form's.
      if (!formLeft()) dispatch(setIsSaving(false));
    }
  };

  const handleSharePDF = async () => {
    if (!documentNumber) return;
    setIsShareLoading(true);
    try {
      const pdfResult = await generateGRNPDF(documentNumber);
      if (!pdfResult.success || !pdfResult.pdfUrl) {
        setSnackbarMessage(tr('grn.review.pdfCreateFailed'));
        setSnackbarVisible(true);
        return;
      }

      const shareResult = await downloadAndSharePDF(pdfResult.pdfUrl, `GRN_${documentNumber}.pdf`);
      if (!shareResult.success) {
        setSnackbarMessage(tr('grn.review.pdfShareFailed'));
        setSnackbarVisible(true);
      }
    } catch (error) {
      log.error('Share PDF error', loggableError(error));
      setSnackbarMessage(tr('grn.review.pdfShareFailed'));
      setSnackbarVisible(true);
    } finally {
      setIsShareLoading(false);
    }
  };

  const handleCreateAnother = () => {
    setShowSuccessDialog(false);
    if (isCreateMode) {
      resetFormState();
      router.replace('/grn-form/step1');
    } else {
      resetFormState();
      router.replace('/grn');
    }
  };

  const handleViewList = () => {
    setShowSuccessDialog(false);
    if (!isCreateMode) {
      resetFormState();
    }
    router.replace('/grn');
  };

  const handlePrint = () => {
    if (!documentNumber && header.gr_no) {
      setDocumentNumber(header.gr_no);
    }
    setShowSuccessDialog(false);
    setShowPrintDialog(true);
  };

  // Photos are never uploaded when they are picked, in create or in edit mode: they stay on
  // the device under a temporary id and go up when the GRN is saved, so "Discard changes"
  // leaves the saved GRN's photos as they were.
  const imageUploadGrnId = tempGrnId ?? undefined;
  const ctaLabel = isCreateMode ? tr('grn.review.createGrn') : tr('grn.review.saveGrn');

  // The Qty column is as wide as its widest number, the total included.
  const qtyWidth = numberColumnWidth(screen, 40, items.map((item) => formatNumber(item.qty || 0)), [formatNumber(totalQty)]);
  // What a line says about itself, worked out once per line (and per language): its weight as text and its screen-reader
  // label. A dialog or a photo upload on this step, or one line changing, does not work out the other lines again.
  const language = getLanguage();
  const lineFacts = useMemo(() => itemFactsCache(), [language]);
  // The Items table (Item | Qty). Its columns are built again only when the mode, the theme or the Qty width change:
  // a dialog or a photo upload on this step does not redraw every line.
  const itemColumns = useMemo(
    () =>
      itemColumnHelper.columns([
        itemColumnHelper.display({
          id: 'item',
          header: tr('grn.rates.colItem'),
          meta: { width: 'grow' },
          cell: ({ row }) => (
            <GrnReviewItemCell item={row.original} weightText={lineFacts.weightText(row.original)} lock={lineLock(row.original, isCreateMode)} styles={styles} table={table} />
          ),
        }),
        itemColumnHelper.display({
          id: 'qty',
          header: tr('grn.item.qtyShort'),
          meta: { width: qtyWidth, numeric: true },
          cell: ({ row }) => <Text style={table.number} {...ONE_LINE}>{formatNumber(row.original.qty || 0)}</Text>,
        }),
      ]),
    [isCreateMode, styles, table, qtyWidth, lineFacts]
  );
  const itemsTable = useAppTable({
    columns: itemColumns,
    data: items,
    getRowId: (item, index) => item.grn_trl_id || `item-${index}`,
  });

  const grImages = header.gr_images ?? [];
  const ratesMissing = !grnInvoiced && stored.status === 'ready' ? missingCount(pricedRows) : 0;
  const ratesClosedLine =
    stored.status === 'loading'
      ? tr('grn.rates.loading')
      : stored.status === 'error'
        ? tr('grn.rates.loadErrorTitle')
        : grnInvoiced
          ? tr('grn.review.closedRatesInvoiced')
          : ratesMissing > 0
            ? null
            : tr('grn.review.closedRatesAll');

  return (
    <View style={styles.container}>
      <GRNStepIndicator
        steps={grnSteps()}
        currentStep={STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
        cancelMessage={tr(isCreateMode ? 'grn.review.discardCreateMessage' : 'grn.review.discardEditMessage', { count: items.length })}
        onStepPress={handleStepIndicatorPress}
        grnNo={header.gr_no || undefined}
        isEditMode={!isCreateMode}
        disabled={isSubmittingState}
        leaveWarning={lostChecking ? tr('errors.lostAnswer.leaveWarning') : undefined}
      />

      {/* The save got no answer: the form is locked while the server is asked whether it was saved. */}
      {lostChecking ? <LostAnswerNotice message={tr('errors.lostAnswer.checking')} /> : null}

      <View style={styles.contentWrapper}>
        <ScrollView
          ref={scrollRef}
          onScrollBeginDrag={() => { ratesFocusPending.current = false; }}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ReviewCard onLayout={(e) => { cardY.current = e.nativeEvent.layout.y; }} testID="grn-review-table">
          {/* GRN details */}
          <ReviewSection
            id="details"
            testIDPrefix="grn-review"
            title={tr('grn.steps.details')}
            onEdit={handleNavigateToHeader}
            editLabel={tr('grn.review.editDetails')}
            closedLine={[header.gr_no, header.date ? formatReviewDate(header.date) : null, header.customer_name].filter(Boolean).join(' · ')}
            open={openSection === 'details'}
            onToggle={toggleSection}
            first
          >
            <ReviewKeyValues>
              <ReviewKeyValue label={tr('common.grnNumber')} value={header.gr_no || tr('common.notSet')} emphasized first />
              {header.registration ? <ReviewKeyValue label={tr('grn.header.vehicleRegistration')} value={header.registration} /> : null}
              <ReviewKeyValue label={tr('common.date')} value={formatReviewDate(header.date)} />
              <ReviewKeyValue label={tr('common.customer')} value={header.customer_name || tr('grn.review.notSelected')} />
              <ReviewKeyValue label={tr('grn.header.sender')} value={header.sender_name || tr('grn.review.notSelected')} />
              <ReviewKeyValue label={tr('grn.header.supervisor')} value={header.supervisor_name || tr('grn.review.notSelected')} />
              <ReviewKeyValue label={tr('grn.header.pricingMode')} value={header.pricing_mode === 'ONE_TIME' ? tr('grn.header.oneTime') : tr('grn.header.monthly')} />
              {header.leon
                ? <ReviewKeyValue label={tr('grn.header.leon')} value={<StatusTag wrap status="positive" label={tr('common.on')} />} />
                : null}

              {header.note ? (
                <View style={[styles.notesSection, table.nestedDivider]}>
                  <Text style={styles.notesLabel}>{tr('common.notes')}</Text>
                  <Text style={styles.notesValue}>{header.note}</Text>
                </View>
              ) : null}

              {/* The totals, here since the Summary section went (owner, 2026-10-17) */}
              <View style={styles.totalsSection}>
                <ReviewKeyValue label={tr('grn.review.totalItems')} value={formatNumber(totalItems)} emphasized first />
                <ReviewKeyValue label={tr('grn.review.totalQuantity')} value={formatNumber(totalQty)} emphasized />
              </View>
            </ReviewKeyValues>
          </ReviewSection>

          {/* GRN photos */}
          <ReviewSection
            id="photos"
            testIDPrefix="grn-review"
            title={tr('grn.review.photosTitle')}
            count={grImages.length > 0 ? grImages.length : undefined}
            closedLine={grImages.length > 0 ? formatCount(grImages.length, 'photo') : tr('grn.review.closedNoPhotos')}
            open={openSection === 'photos'}
            onToggle={toggleSection}
          >
            <View style={[table.nested, styles.photosBody]}>
              <Text style={styles.imagesSectionSubtitle}>
                {tr('grn.review.photosHint')}
              </Text>

              <ImageUploadButton
                documentScan
                onImageUploadStart={(tempImageData: GRNImageData) => {
                  dispatch(addHeaderImage(tempImageData));
                }}
                onImageUploadProgress={(imageId: string, progress) => {
                  dispatch(updateHeaderImageProgress({ imageId, progress: progress.percentage }));
                }}
                onImageUploadComplete={(imageData: GRNImageData) => {
                  dispatch(completeHeaderImageUpload({
                    imageId: imageData.id,
                    imageUrl: imageData.imageUrl,
                    storagePath: imageData.storagePath,
                    fileSize: imageData.fileSize,
                    mimeType: imageData.mimeType
                  }));
                }}
                onImageUploadError={(imageId: string, error: string) => {
                  dispatch(failHeaderImageUpload({ imageId, error }));
                }}
                grnId={imageUploadGrnId}
                imageType="header"
                disabled={isSubmittingState}
                maxImages={10}
                onImagesSelected={() => { }}
                currentImages={header.gr_images?.map((img) => img.imageUrl) || []}
              />

              {header.gr_images && header.gr_images.length > 0 && (
                <ImagePreviewGrid
                  imageData={header.gr_images}
                  removeFromServer={false}
                  editable={!isSubmittingState}
                  onRemoveImage={(imageId: string) => {
                    if (isSubmittingState) return;
                    const removed = header.gr_images?.find((img) => img.id === imageId);
                    dispatch(removeHeaderImage(imageId));
                    // A photo that never reached the server: its file on the phone is not needed.
                    if (removed && isTemporaryGRNImageId(imageId)) void releaseLocalPhotos([removed.imageUrl]);
                  }}
                  onImagePress={(imageData) => {
                    const index = header.gr_images?.findIndex(img => img.id === imageData.id) ?? 0;
                    setSelectedImageIndex(index >= 0 ? index : 0);
                    setShowImageOverlay(true);
                  }}
                  showMetadata={false}
                  showProgress={true}
                  maxImages={10}
                  columns={3}
                />
              )}
            </View>
          </ReviewSection>

          {/* Items */}
          <ReviewSection
            id="items"
            testIDPrefix="grn-review"
            title={tr('common.items')}
            count={items.length}
            onEdit={handlePrevious}
            editLabel={tr('grn.review.editItems')}
            closedLine={tr('grn.review.closedItems', { quantity: formatNumber(totalQty) })}
            open={openSection === 'items'}
            onToggle={toggleSection}
          >
            {items.length === 0 ? (
              <View style={[table.nested, styles.emptyState]}>
                <Icon name="package-variant-closed" size={iconSize.hero} color={t.icon.secondary} />
                <Text style={styles.emptyStateTitle}>{tr('grn.review.emptyTitle')}</Text>
                <Text style={styles.emptyStateSubtitle}>{tr('grn.review.emptySubtitle')}</Text>
              </View>
            ) : (
              <DataTable
                table={itemsTable}
                variant="nested"
                testID="grn-review-items-table"
                rowLabel={row => lineFacts.label(row.original, row.index, lineLock(row.original, isCreateMode))}
                footer={
                  <View style={styles.itemsTotal} accessible accessibilityLabel={`${tr('grn.review.totalQuantity')}, ${formatNumber(totalQty)}`}>
                    <Text style={[table.primaryStrong, table.grow]}>{tr('common.total')}</Text>
                    <Text style={[table.numberStrong, { width: qtyWidth }]} {...ONE_LINE}>{formatNumber(totalQty)}</Text>
                  </View>
                }
              />
            )}
          </ReviewSection>

          {/* Rates: administrators and supervisors only */}
          {canSetRates ? (
            <ReviewSection
              id="rates"
              testIDPrefix="grn-review"
              title={tr('grn.rates.title')}
              tag={ratesMissing > 0 ? tr('grn.rates.withoutRate', { count: ratesMissing }) : undefined}
              closedLine={ratesClosedLine}
              open={openSection === 'rates'}
              onToggle={toggleSection}
              blockTestID="grn-rates-section"
              onLayout={(e) => {
                ratesY.current = e.nativeEvent.layout.y;
                if (ratesFocusPending.current && items.length > 0) scrollRatesIntoView();
              }}
            >
                <GrnRatesSection
                  rows={pricedRows}
                  status={stored.status}
                  offline={stored.offline}
                  oneTime={rateCtx.priceType === 'one_time'}
                  day={rateCtx.day}
                  invoiced={grnInvoiced}
                  onChange={(row) => { if (!isSubmittingState) setSheetRow(row); }}
                  onAdd={(row) => { if (!isSubmittingState) setSheetRow(row); }}
                  onUndo={undoRateEntry}
                  canRestore={row => removedFor(removedRates, row).length > 0}
                  onRestore={restoreRateEntry}
                  onRetry={() => { void stored.refresh(); }}
                />
            </ReviewSection>
          ) : null}
          </ReviewCard>
          {!isCreateMode && orderEffectsNotice(orderEffects) ? (
            <View testID="grn-review-order-effects" style={{ margin: space.sm }}>
              <InlineValidation variant="warning" message={orderEffectsNotice(orderEffects)} />
            </View>
          ) : null}

        </ScrollView>

        {/* Bottom action bar */}
        <WizardBottomBar
          currentStep={STEP_NUMBERS.REVIEW}
          totalSteps={GRN_STEP_COUNT}
          onPrevious={handlePrevious}
          onNext={handleSubmit}
          nextLabel={ctaLabel}
          isLoading={isSubmittingState}
          loadingLabel={
            isRetryingPhotos
              ? tr('grn.review.uploadingPhotos')
              : isCreateMode ? tr('grn.review.creating') : tr('grn.review.saving')
          }
        />
      </View>

      {canSetRates ? (
        <GrnRateSheet
          visible={sheetRow !== null}
          onClose={() => setSheetRow(null)}
          row={sheetRow}
          input={preloadInput}
          customerName={header.customer_name || tr('common.unknown')}
          priceTypeText={rateCtx.priceType === 'one_time' ? tr('grn.header.oneTime') : tr('grn.header.monthly')}
          grnNumber={header.gr_no || undefined}
          onSave={saveRateEntry}
        />
      ) : null}

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmDialog}
        title={isCreateMode ? tr('grn.review.confirmCreateTitle') : tr('grn.review.confirmSaveTitle')}
        message={withOrderEffects(
          header.gr_no
            ? tr(isCreateMode ? 'grn.review.confirmCreateNumbered' : 'grn.review.confirmSaveNumbered', { number: formatIdentifier(header.gr_no), count: totalItems })
            : tr(isCreateMode ? 'grn.review.confirmCreate' : 'grn.review.confirmSave', { count: totalItems }),
          isCreateMode ? null : orderEffects
        )}
        confirmText={ctaLabel}
        cancelText={tr('common.cancel')}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmDialog(false)}
        variant="default"
        icon={isCreateMode ? 'plus-circle' : 'pencil-outline'}
      />

      {/* Photos of the saved GRN that did not upload */}
      <ConfirmDialog
        visible={photosNotUploaded !== null}
        title={tr('grn.review.photosNotUploadedTitle')}
        message={photosNotUploaded ? photosNotUploadedMessage(documentNumber, photosNotUploaded.failed) : ''}
        confirmText={tr('grn.review.retryPhotos')}
        cancelText={tr('grn.review.continueWithoutPhotos')}
        onConfirm={handleRetryPhotos}
        onCancel={handleContinueWithoutPhotos}
        variant="warning"
        icon="image-off-outline"
        dismissible={false}
      />

      <DocumentSuccessDialog
        isVisible={showSuccessDialog}
        entity="grn"
        documentData={successDialogData}
        onCreateAnother={handleCreateAnother}
        onViewList={handleViewList}
        onPrint={handlePrint}
        onSharePDF={handleSharePDF}
        isShareLoading={isShareLoading}
        isEditMode={!isCreateMode}
      />

      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => {
          setShowPrintDialog(false);
          if (!isCreateMode) {
            resetFormState();
            router.replace('/grn');
          } else {
            // Back to the choices of the created GRN, not to a form that could be sent again.
            setShowSuccessDialog(true);
          }
        }}
        onConfirm={async (start, end) => {
          const result = await printGRNRange(start, end);
          if (result.success) {
            setSnackbarMessage(tr('grn.review.printSent'));
            setSnackbarVisible(true);
          } else {
            // A dialog, not the snackbar: the screen is left (edit) or covered by the success
            // dialog (create) at once, and a failure is something the person must act on.
            // The unconfirmed one must not invite a reprint.
            showAlert(
              tr(result.unconfirmed ? 'grn.review.printUnconfirmedTitle' : 'grn.review.printFailedTitle'),
              tr(result.unconfirmed ? 'grn.review.printUnconfirmed' : 'grn.review.printFailed')
            );
          }
          // Leaving the step is the dialog's onDismiss above, which the dialog calls after this.
          setShowPrintDialog(false);
        }}
        title={tr('grn.details.printTitle')}
        defaultNumber={documentNumber || header.gr_no || ''}
        entity="grn"
        placeholder={tr('grn.form.forExample', { example: 'Z0797' })}
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        style={styles.snackbar}
      >
        <Text style={styles.snackbarText}>{snackbarMessage}</Text>
      </Snackbar>

      {/* Full-screen image preview */}
      {header.gr_images && header.gr_images.length > 0 && (
        <ImageOverlay
          visible={showImageOverlay}
          images={header.gr_images.map(img => ({
            id: img.id,
            imageUrl: img.imageUrl,
            fileName: img.fileName || 'image.jpg',
            fileSize: img.fileSize || 0,
            mimeType: img.mimeType || 'image/jpeg',
            uploadTimestamp: img.uploadTimestamp || new Date().toISOString(),
            uploadStatus: img.uploadStatus,
          }))}
          initialIndex={selectedImageIndex}
          onClose={() => setShowImageOverlay(false)}
        />
      )}
    </View>
  );
}

type GrnReviewStyles = ReturnType<typeof makeStyles>;
type TableStyles = ReturnType<typeof makeTableStyles>;

const itemColumnHelper = createAppColumnHelper<GRNItemData>();

/**
 * What locks a stored line of an edited GRN, as far as the screen says it: 'invoiced' (quantity, item, packing and
 * weight), 'dispatched' (quantity, item and packing) from the server's locks, or 'quantity' on an older server that
 * sends none (the line's stock differs from its quantity). null: nothing is locked, or a new GRN.
 */
type LineLock = 'invoiced' | 'dispatched' | 'quantity' | null;

function lineLock(item: GRNItemData, isCreateMode: boolean): LineLock {
  if (isCreateMode) return null;
  if (item.locks) return item.locks.invoiced ? 'invoiced' : item.locks.dispatched ? 'dispatched' : null;
  return item.qty !== item.stock ? 'quantity' : null;
}

/** The tag text and the spoken text of a line's lock. */
const LOCK_TAG: Record<Exclude<LineLock, null>, () => string> = {
  invoiced: () => tr('grn.item.lockedInvoiced'),
  dispatched: () => tr('grn.item.lockedDispatched'),
  quantity: () => tr('grn.item.quantityLocked'),
};
const LOCK_A11Y: Record<Exclude<LineLock, null>, () => string> = {
  invoiced: () => tr('grn.review.a11yInvoicedLocked'),
  dispatched: () => tr('grn.review.a11yDispatchedLockedAll'),
  quantity: () => tr('grn.review.a11yDispatchedLocked'),
};

/** What a screen reader says for one line of the review's Items table. */
function itemA11y(item: GRNItemData, index: number, lock: LineLock, weightText: string | null): string {
  const qty = item.qty || 0;
  const rack = item.rack?.trim();
  const packageMark = item.package_mark?.trim();
  const imageCount = item.trl_images?.length || 0;
  return [
    tr('grn.item.itemNumber', { number: index + 1 }),
    item.item_name,
    item.packaging,
    tr('grn.item.a11yQuantity', { quantity: formatNumber(qty) }),
    weightText,
    rack ? tr('grn.item.a11yRack', { rack }) : undefined,
    packageMark ? tr('grn.item.a11yMark', { mark: packageMark }) : undefined,
    imageCount > 0 ? formatCount(imageCount, 'photo') : undefined,
    lock ? LOCK_A11Y[lock]() : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * The facts of the review's lines, kept per line object: its weight as text ("40 kg each"; null when it has none) and
 * its screen-reader label. A line that did not change is not worked out again.
 */
function itemFactsCache() {
  const cache = new WeakMap<GRNItemData, { weightText: string | null; labels: Map<string, string> }>();
  const entry = (item: GRNItemData) => {
    let found = cache.get(item);
    if (!found) {
      found = { weightText: formatWeightEach(item.weight), labels: new Map() };
      cache.set(item, found);
    }
    return found;
  };
  return {
    weightText: (item: GRNItemData) => entry(item).weightText,
    label: (item: GRNItemData, index: number, lock: LineLock) => {
      const found = entry(item);
      const key = `${index}|${lock}`;
      let label = found.labels.get(key);
      if (label === undefined) {
        label = itemA11y(item, index, lock, found.weightText);
        found.labels.set(key, label);
      }
      return label;
    },
  };
}

interface GrnReviewItemCellProps {
  item: GRNItemData;
  /** The weight of one package ("50 kg each"); null when the line has none, and then nothing is shown. */
  weightText: string | null;
  /** What locks this stored line (see LineLock); null when nothing does. */
  lock: LineLock;
  styles: GrnReviewStyles;
  table: TableStyles;
}

/** The Item cell of one line of the review's Items table: name, packaging and the tags. */
const GrnReviewItemCell = React.memo(function GrnReviewItemCell({ item, weightText, lock, styles, table }: GrnReviewItemCellProps) {
  const rack = item.rack?.trim();
  const packageMark = item.package_mark?.trim();
  const imageCount = item.trl_images?.length || 0;

  return (
    <>
      <Text style={table.primaryStrong}>{item.item_name}</Text>
      {item.packaging ? <Text style={table.secondary} numberOfLines={1}>{item.packaging}</Text> : null}
      <View style={styles.itemTags}>
        {weightText !== null && <StatusTag wrap status="neutral" label={weightText} icon="weight-kilogram" />}
        {rack ? <StatusTag wrap status="neutral" label={rack} accessibilityLabel={tr('grn.item.rackWithValue', { rack })} icon="view-grid-outline" /> : null}
        {packageMark ? <StatusTag wrap status="neutral" label={packageMark} accessibilityLabel={tr('grn.item.markWithValue', { mark: packageMark })} icon="label-outline" /> : null}
        {imageCount > 0 && <StatusTag wrap status="neutral" label={formatNumber(imageCount)} accessibilityLabel={formatCount(imageCount, 'photo')} icon="camera-outline" />}
        {lock !== null && <StatusTag wrap status="critical" label={LOCK_TAG[lock]()} icon="lock-outline" />}
      </View>
    </>
  );
});

// ============================================================================
// STYLES
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  contentWrapper: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: space.lg, paddingBottom: space.xxl },

  photosBody: { padding: space.sm },

  notesSection: { paddingVertical: space.sm, paddingHorizontal: space.sm },
  notesLabel: { ...typography.subhead, color: t.text.secondary, marginBottom: space.xs },
  notesValue: { ...typography.body, color: t.text.primary },
  totalsSection: { borderTopWidth: 1, borderTopColor: t.table.separator },

  imagesSectionSubtitle: { ...typography.subhead, color: t.text.secondary, marginBottom: space.md },

  itemTags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.s6, marginTop: space.xs },
  itemsTotal: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.table.separator,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  emptyStateTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  emptyStateSubtitle: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },

  snackbar: { backgroundColor: t.surface.inverse, borderRadius: radius.button, ...t.shadow[3] },
  snackbarText: { ...typography.subhead, color: t.text.inverse },
});

export default GrnReviewStep;
