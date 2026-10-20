import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
  selectGRNRemovedImages,
  selectGRNSaveUnconfirmed,
  selectGRNRates,
  selectGRNRateChanges,
  selectGRNInvoiced,
  selectGRNRemovedRates,
  setGrnRates,
  setRateChanges,
  setRemovedGrnRates,
  setSaveUnconfirmed,
  adoptSavedLines,
} from '@/store/slices/grnFormSlice';
import { useGRNForm } from '@/hooks';
import { ImageUploadButton } from '@/features/grn/components/ImageUploadButton';
import { createGRN, updateGRN, findLinesSavedByLostUpdate, type GRNPhotoSaveReport } from '@/features/grn/services/grnFormService';
import { uploadGRNPhotos, unpreparedGRNPhotos, type FailedGRNPhoto } from '@/features/grn/services/imageUploadService';
import { photosNotUploadedMessage } from '@/features/grn/utils/photoSaveReport';
import { isTemporaryGRNImageId } from '@/features/grn/services/imageId';
import { abandonLocalPhotoUpload, releaseLocalPhotos } from '@/utils/localPhotoFiles';
import { validateStep3 } from '@/features/grn/schemas/grnValidation';
import { ImagePreviewGrid } from '@/features/grn/components/ImagePreviewGrid';
import { ImageOverlay } from '@/components/ImageOverlay';
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import { GRN_STEP_COUNT, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { grnSteps } from '@/features/grn/utils/grnStepLabels';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printGRNRange } from '@/services/print-service';
import { DocumentSuccessDialog, DocumentData } from '@/components/DocumentSuccessDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { useStandardRate } from '@/features/item-pricing/useStandardRate';
import { canOpenScreen } from '@/config/roles';
import { StatusTag } from '@/components/ui';
import { t as tr, formatIdentifier } from '@/i18n';
import { getLanguage } from '@/i18n/language';
import { serverText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';

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
  // The last update got no answer: the server is asked what it holds before the next one.
  const saveUnconfirmed = useAppSelector(selectGRNSaveUnconfirmed);
  // Rates saved with the GRN: the set for this GRN only, and changes of the item's rate (backend migration 86).
  const grnRates = useAppSelector(selectGRNRates);
  const rateChanges = useAppSelector(selectGRNRateChanges);
  const removedRates = useAppSelector(selectGRNRemovedRates);
  // An invoiced GRN being edited: its rates are shown, sent back as they are, and cannot be set here.
  const grnInvoiced = useAppSelector(selectGRNInvoiced) && !isCreateMode;
  // Set once this form has created its GRN. A further press of Create never creates again:
  // save_grn would answer the repeat with the same GRN and every photo would go up twice.
  const createdRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Photos of the GRN just saved that did not upload; the user is asked to try again or go on.
  const [photosNotUploaded, setPhotosNotUploaded] = useState<{ grnId: string; failed: FailedGRNPhoto[] } | null>(null);
  const [isRetryingPhotos, setIsRetryingPhotos] = useState(false);
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
  const scrollRef = useRef<ScrollView>(null);
  const ratesY = useRef(0);
  // The sections are rows of one table card: RATES' place in the scroll is the card's plus its own in the card.
  const cardY = useRef(0);
  // Scroll to Rates each time the block moves while the GRN loads, until the person scrolls or opens a section.
  const ratesFocusPending = useRef(openedOnRates);
  // The sections fold, one open at a time (owner, 2026-10-17): ITEMS when the step opens, RATES when it was
  // opened from the GRN's Rates. A closed section shows a one-line summary under its heading.
  const { open: openSection, toggle, show } = useReviewSections<ReviewSectionId>(openedOnRates ? 'rates' : 'items');
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
    if (!sheetRow) return;
    const next = withEntry({ grnRates, changes: rateChanges }, sheetRow.item_id, entry, rateCtx);
    dispatch(setGrnRates(next.grnRates));
    dispatch(setRateChanges(next.changes));
    setSheetRow(null);
  };
  const dropRateEntry = (row: PricedRow) => {
    const next = withoutEntryFor({ grnRates, changes: rateChanges }, row);
    dispatch(setGrnRates(next.grnRates));
    dispatch(setRateChanges(next.changes));
  };
  /**
   * Undo change takes back an edit made in this form at once; Remove drops a rate this GRN already has, so it asks
   * first (owner, 2026-10-17: it acted with no question and nothing on screen said it waits for the save).
   */
  const undoRateEntry = (row: PricedRow) => {
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
    const next = restoreRemovedFor({ grnRates, removed: removedRates }, row);
    dispatch(setGrnRates(next.grnRates));
    dispatch(setRemovedGrnRates(next.removed));
  };
  /** `p_rates` as the form holds them now. */
  const ratesToSave = () => (canSetRates ? buildRates({ grnRates, changes: rateChanges, ctx: rateCtx, lines: items, invoiced: grnInvoiced }) : undefined);
  /** The server refused the rates: read them again and say why. */
  const showRateRefusal = (rateError: { code: string; data: unknown }, message: string) => {
    void stored.refresh();
    showAlert(tr('grn.review.ratesRefusedTitle'), rateRefusalText(rateError.code, rateError.data, message));
    scrollToRates();
  };

  // The X in the step header asks before it calls this, so there is no second question here.
  const handleCancel = () => {
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

  const handlePrevious = () => {
    dispatch(setCurrentStep(2));
    if (openedOnRates) {
      router.replace(editStep(1));
      router.push(editStep(2));
      return;
    }
    router.back();
  };

  const handleNavigateToHeader = () => {
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

  // The Back key goes to step 2 as Previous does; on the normal way in, the stack already does that.
  useBackHandler({
    enabled: openedOnRates,
    onBackPress: () => {
      handlePrevious();
      return true;
    },
  });

  const handleStepIndicatorPress = (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.REVIEW) return;
    if (stepNumber === STEP_NUMBERS.ITEMS) {
      handlePrevious();
    } else if (stepNumber === STEP_NUMBERS.HEADER) {
      handleNavigateToHeader();
    }
  };

  const validateFormData = async (): Promise<boolean> => {
    const validation = await validateStep3({ header, items });

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

    // Show custom confirm dialog (dark mode compliant)
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmDialog(false);
    // One save at a time. A second tap on Confirm before the dialog closes would save again,
    // and every photo picked in the form would be uploaded twice.
    if (saveInFlightRef.current || (isCreateMode && createdRef.current)) return;
    saveInFlightRef.current = true;
    try {
      if (isCreateMode) {
        await performCreate();
      } else {
        await performUpdate();
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

  const handleRetryPhotos = async () => {
    if (!photosNotUploaded || isRetryingPhotos) return;
    const { grnId: savedGrnId, failed } = photosNotUploaded;
    setPhotosNotUploaded(null);
    setIsRetryingPhotos(true);
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

  const performCreate = async () => {
    setIsSubmitting(true);
    try {
      const result = await createGRN({
        header,
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
      });

      if (result.success && result.data) {
        createdRef.current = true;
        triggerSuccess();
        resetFormState();
        const grNo = result.data.gr_no;
        setDocumentNumber(grNo);
        setSuccessDialogData({
          documentNo: grNo,
          customerName: header.customer_name || tr('common.unknown'),
          date: formatReviewDate(header.date),
          itemCount: items.length,
        });
        finishSave(result.data.id, result.data.photos);
      } else {
        triggerError();
        if (result.rateError) showRateRefusal(result.rateError, result.error);
        else showAlert(saveFailedTitle(), serverText(result.error, connectionHint(), { write: true, form: true }));
      }
    } catch (error) {
      triggerError();
      log.error('Submission error', loggableError(error));
      showAlert(saveFailedTitle(), connectionHint());
    } finally {
      setIsSubmitting(false);
    }
  };

  const performUpdate = async () => {
    if (!grnId) {
      showAlert(saveFailedTitle(), tr('grn.form.reopenMessage'));
      return;
    }

    dispatch(setIsSaving(true));
    try {
      // After an update that got no answer, a line added in this edit may already be on the
      // GRN: it gets its saved id first, so this Save updates it instead of adding it a second
      // time. The same Save repeated is also answered from the first by its idempotency key;
      // the saved ids cover a form that was changed in between and a server without the key.
      let adopted: Record<string, string> = {};
      if (saveUnconfirmed) {
        const check = await findLinesSavedByLostUpdate(grnId, items);
        if (!check.success) {
          triggerError();
          showAlert(saveFailedTitle(), check.error);
          return;
        }
        adopted = check.adopted;
        dispatch(adoptSavedLines(adopted));
        dispatch(setSaveUnconfirmed(false));
      }

      const result = await updateGRN(grnId, {
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
      }, { removedImages, adoptedLineIds: adopted });

      if (result.success) {
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
        });
        const savedPhotos = result.data?.photos;
        if (skippedMessage) {
          // Its own dialog first, so the warning is not hidden behind the success dialog. Not awaited:
          // the Save button must not stay busy while the dialog is open. askAlert settles on OK or dismissal.
          void askAlert(tr('grn.review.skippedTitle'), skippedMessage, [{ text: tr('common.ok'), value: true }], false)
            .then(() => finishSave(grnId, savedPhotos));
        } else {
          finishSave(grnId, savedPhotos);
        }
      } else if (result.outcomeUnknown) {
        // Sent, not answered: the GRN may or may not be saved. The form stays as it is.
        triggerError();
        dispatch(setSaveUnconfirmed(true));
        showAlert(saveFailedTitle(), tr('grn.review.saveUnanswered'));
      } else {
        triggerError();
        const errorMessage = serverText(result.error, connectionHint(), { write: true, form: true });
        if (result.rateError) {
          showRateRefusal(result.rateError, result.error);
        } else if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
          showAlert(stockProtectedTitle(), stockProtectedMessage());
        } else {
          showAlert(saveFailedTitle(), errorMessage);
        }
      }
    } catch (error) {
      triggerError();
      log.error('Update error', loggableError(error));
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
        showAlert(stockProtectedTitle(), stockProtectedMessage());
      } else {
        showAlert(saveFailedTitle(), connectionHint());
      }
    } finally {
      dispatch(setIsSaving(false));
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
  const isSubmittingState = (isCreateMode ? isSubmitting : isSaving) || isRetryingPhotos;
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
            <GrnReviewItemCell item={row.original} weightText={lineFacts.weightText(row.original)} isProtected={!isCreateMode && row.original.qty !== row.original.stock} styles={styles} table={table} />
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
      />

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
                maxImages={10}
                onImagesSelected={() => { }}
                currentImages={header.gr_images?.map((img) => img.imageUrl) || []}
              />

              {header.gr_images && header.gr_images.length > 0 && (
                <ImagePreviewGrid
                  imageData={header.gr_images}
                  removeFromServer={false}
                  onRemoveImage={(imageId: string) => {
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
                rowLabel={row => lineFacts.label(row.original, row.index, !isCreateMode && row.original.qty !== row.original.stock)}
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
                  onChange={setSheetRow}
                  onAdd={setSheetRow}
                  onUndo={undoRateEntry}
                  canRestore={row => removedFor(removedRates, row).length > 0}
                  onRestore={restoreRateEntry}
                  onRetry={() => { void stored.refresh(); }}
                />
            </ReviewSection>
          ) : null}
          </ReviewCard>

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
        message={
          header.gr_no
            ? tr(isCreateMode ? 'grn.review.confirmCreateNumbered' : 'grn.review.confirmSaveNumbered', { number: formatIdentifier(header.gr_no), count: totalItems })
            : tr(isCreateMode ? 'grn.review.confirmCreate' : 'grn.review.confirmSave', { count: totalItems })
        }
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

/** What a screen reader says for one line of the review's Items table. */
function itemA11y(item: GRNItemData, index: number, isProtected: boolean, weightText: string | null): string {
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
    isProtected ? tr('grn.review.a11yDispatchedLocked') : undefined,
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
    label: (item: GRNItemData, index: number, isProtected: boolean) => {
      const found = entry(item);
      const key = `${index}|${isProtected}`;
      let label = found.labels.get(key);
      if (label === undefined) {
        label = itemA11y(item, index, isProtected, found.weightText);
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
  /** A stored line with dispatches: its quantity cannot change. */
  isProtected: boolean;
  styles: GrnReviewStyles;
  table: TableStyles;
}

/** The Item cell of one line of the review's Items table: name, packaging and the tags. */
const GrnReviewItemCell = React.memo(function GrnReviewItemCell({ item, weightText, isProtected, styles, table }: GrnReviewItemCellProps) {
  const rack = item.rack?.trim();
  const packageMark = item.package_mark?.trim();
  const imageCount = item.trl_images?.length || 0;

  return (
    <>
      <Text style={table.primaryStrong}>{item.item_name}</Text>
      {item.packaging ? <Text style={table.secondary} numberOfLines={1}>{item.packaging}</Text> : null}
      <View style={styles.itemTags}>
        {weightText !== null && <StatusTag wrap status="neutral" label={weightText} icon="weight-kilogram" />}
        {rack ? <StatusTag wrap status="neutral" label={tr('grn.item.rackWithValue', { rack })} icon="view-grid-outline" /> : null}
        {packageMark ? <StatusTag wrap status="neutral" label={tr('grn.item.markWithValue', { mark: packageMark })} icon="label-outline" /> : null}
        {imageCount > 0 && <StatusTag wrap status="neutral" label={formatCount(imageCount, 'photo')} icon="camera-outline" />}
        {isProtected && <StatusTag wrap status="critical" label={tr('grn.item.quantityLocked')} icon="lock-outline" />}
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
