/**
 * Dispatch Review Step - Unified Create/Edit Component
 * One folding card (style guide 14.3, the same card as the GRN Review step): DETAILS, PHOTOS (create only) and ITEMS,
 * one open at a time, ITEMS when the step opens. The items are a nested table with a total row.
 * Uses mode prop to differentiate between create and edit flows
 *
 * Refactored to use useDispatchForm hook for form state management.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { triggerSuccess, triggerError, triggerWarning } from '@/hooks/useHaptics';
import { uploadDeferredDispatchImages, unpreparedDispatchPhotos } from '@/features/dispatch/services/dispatchImageService';
import { abandonLocalPhotoUpload, releaseLocalPhotos } from '@/utils/localPhotoFiles';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, toDate, formatWeightEach, formatNumber, formatMobile } from '@/utils/formatters';
import { DispatchStepIndicator, dispatchSteps } from '@/components/DispatchStepIndicator';
import { t as tr, formatIdentifier } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { serverText } from '@/utils/serverText';
import { askStaleRecord } from '@/utils/staleRecordDialog';
import WizardBottomBar from '@/components/WizardBottomBar';
import { ReviewCard, ReviewKeyBlock, ReviewKeyValue, ReviewKeyValues, ReviewSection, useReviewSections } from '@/components/review/ReviewSections';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printDispatchRange } from '@/services/print-service';
import { DocumentSuccessDialog, DocumentData } from '@/components/DocumentSuccessDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatusTag } from '@/components/ui';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { generateDispatchPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { useDispatchForm, type DispatchSubmitResult } from '@/hooks/useDispatchForm';
import { useDispatchLotStock } from '@/features/dispatch/hooks/useDispatchLotStock';
import { LostAnswerStrip } from '@/features/dispatch/components/LostAnswerStrip';
import type { DispatchItemData, DispatchImageData } from '@/types/dispatch.types';
import { ImageUploadButton, type CustomUploadFunction } from '@/features/grn/components/ImageUploadButton';
import { ImagePreviewGrid } from '@/features/grn/components/ImagePreviewGrid';
import { ImageOverlay } from '@/components/ImageOverlay';
import {
    uploadDispatchImage,
    deleteDispatchImage,
    generateTempDispatchId,
    type ImageUploadProgress,
} from '@/features/dispatch/services/dispatchImageService';
import { DISPATCH_STEP_COUNT, DISPATCH_STEP_NUMBERS, getDispatchCompletedSteps } from '@/constants/dispatchSteps';
import {
    crowded,
    lastColumnAlone,
    makeTableStyles,
    nb,
    nestedRowWidth,
    numberColumnWidth,
    useTableLayout,
} from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { sourceColumnWidth, sourceText } from '@/components/dispatch-details/DispatchItemsTab';
import { getLanguage } from '@/i18n/language';

type DispatchReviewStepProps = {
    mode: 'create' | 'edit';
};

/** The folding sections of the step, top to bottom. */
type ReviewSectionId = 'details' | 'photos' | 'items';

/** A long mark wraps to this many lines and is then cut; the whole mark is in the line's spoken label. */
const MARK_LINES = 2;

/** Bags column width at font scale 1: room for "12,500". */
const QTY_WIDTH = 48;

export function DispatchReviewStep({ mode }: DispatchReviewStepProps) {
    const styles = useThemedStyles(makeStyles);
    const table = useThemedStyles(makeTableStyles);
    const screen = useTableLayout();
    const t = useTokens();

    const { id } = useLocalSearchParams<{ id: string }>();

    // Use the consolidated dispatch form hook
    const {
        header,
        items,
        images,
        isSaving,
        isCheckingAnswer,
        isCreateMode,
        addImageToForm,
        updateImageUploadProgress: updateImageProgress,
        updateImageUploadStatus: updateImageStatus,
        removeImageFromForm,
        navigateToStep,
        submitForm,
        reloadDispatch,
        resetFormState,
    } = useDispatchForm({
        mode,
        dispatchIdParam: id,
    });

    // Generate temp dispatch ID for image uploads (create mode only)
    const [tempDispatchId] = useState(() => generateTempDispatchId());

    // The sections fold, one open at a time; ITEMS when the step opens.
    const { open: openSection, toggle } = useReviewSections<ReviewSectionId>('items');
    const toggleSection = (section: string) => toggle(section as ReviewSectionId);

    // Fresh stock of every lot, one read per GRN (edit mode only)
    const stock = useDispatchLotStock(items, !isCreateMode);

    // Print dialog state (create mode)
    const [showPrintDialog, setShowPrintDialog] = useState(false);
    const [createdDispatchNumber, setCreatedDispatchNumber] = useState('');
    // Toasts wait until the success or print dialog is gone: a dialog is a modal and would hide them.
    const pendingToasts = useRef<string[]>([]);
    // Set while the print error alert is on screen
    const printAlertOpen = useRef(false);
    const queueToast = (message: string) => {
        pendingToasts.current.push(message);
    };
    const flushToasts = () => {
        const messages = pendingToasts.current;
        pendingToasts.current = [];
        if (messages.length > 0) showToast(messages.join(' '));
    };

    // Success dialog state (create mode)
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [successDialogData, setSuccessDialogData] = useState<DocumentData | null>(null);
    const [isShareLoading, setIsShareLoading] = useState(false);
    const [shareError, setShareError] = useState<string | null>(null);

    // Local submitting state - prevents duplicate submissions
    // This is set immediately when user confirms dialog, before any async work
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Photos of the dispatch just created that did not upload; the user is asked to try again or go on.
    const [photosNotUploaded, setPhotosNotUploaded] = useState<{ dispatchId: string; failed: DispatchImageData[] } | null>(null);
    const [isRetryingPhotos, setIsRetryingPhotos] = useState(false);

    // Image overlay state
    const [showImageOverlay, setShowImageOverlay] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

    // Confirm dialog state
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [showEditSuccessDialog, setShowEditSuccessDialog] = useState(false);
    // The edit also changed the order (bags given back to it or taken from it): the saved dialog says so (wave B D4).
    const [editOrderSynced, setEditOrderSynced] = useState(false);

    // A new dispatch from an order that has no line left after the order was read again (wave B D5): nothing to create.
    const orderEmpty = isCreateMode && !!header.source_order_id && items.length === 0;

    // The X in the step header asks before it calls this, so there is no second question here.
    const handleCancel = () => {
        resetFormState();
        if (isCreateMode) {
            router.replace('/dispatch');
        } else {
            router.back();
        }
    };

    // Handle back navigation
    const handleBack = async () => {
        await navigateToStep(DISPATCH_STEP_NUMBERS.ITEMS);
    };

    // ========================================================================
    // IMAGE UPLOAD HANDLERS (Create mode only)
    // ========================================================================

    const handleImageUploadStart = (tempImageData: any) => {
        const imageData: DispatchImageData = {
            id: tempImageData.id,
            file_name: tempImageData.fileName,
            image_url: tempImageData.imageUrl,
            upload_status: 'uploading',
            upload_progress: 0,
            file_size: tempImageData.fileSize,
            mime_type: tempImageData.mimeType,
        };
        addImageToForm(imageData);
    };

    const handleImageUploadProgress = (imageId: string, progress: ImageUploadProgress) => {
        updateImageProgress(imageId, progress.percentage);
    };

    const handleImageUploadComplete = (imageData: any) => {
        updateImageStatus(imageData.id, 'completed', imageData.imageUrl, imageData.storage_path || imageData.storagePath);
    };

    const handleImageUploadError = (imageId: string, _error: string) => {
        updateImageStatus(imageId, 'failed');
    };

    // A photo that is already on the server is removed there first. When that is refused
    // or fails, the photo stays in the form and the reason is shown: dropping it from the
    // form alone would hide a photo the dispatch still has.
    const handleRemoveImage = async (imageId: string) => {
        const imageToRemove = images.find((img) => img.id === imageId);
        if (imageToRemove?.upload_status === 'completed' && imageToRemove.storage_path) {
            let result: Awaited<ReturnType<typeof deleteDispatchImage>>;
            try {
                result = await deleteDispatchImage(imageId, imageToRemove.image_url);
            } catch {
                result = { success: false };
            }
            if (!result.success) {
                showAlert(tr('grn.photos.removeFailedTitle'), serverText(result.error, tr('common.checkConnection'), { write: true, photo: true }));
                return;
            }
            // The record is gone; only its stored file could not be confirmed deleted.
            if (result.partial) {
                showAlert(tr('dispatch.review.photoRemovedTitle'), serverText(result.error, tr('dispatch.photos.removedFileUnconfirmed'), { write: true, photo: true }));
            }
        }
        removeImageFromForm(imageId);
        // Its file on the phone, if the app wrote one, is not needed any more.
        if (imageToRemove) void releaseLocalPhotos([imageToRemove.image_url]);
    };

    const dispatchUploadFunction: CustomUploadFunction = async (asset, entityId, onProgress) => {
        return uploadDispatchImage(asset, entityId, onProgress);
    };

    // The totals: bags in all and the number of GRNs. No weight: a lot stores the weight of one bag, and
    // total weights are not shown (style guide 12.3).
    const totals = useMemo(() => {
        let totalQuantity = 0;
        items.forEach((item: DispatchItemData) => {
            totalQuantity += item.disp_quantity;
        });
        return { totalQuantity, uniqueGRNs: new Set(items.map((item) => item.grns_gr_no)).size };
    }, [items]);

    // Format date (guide 12.3: "9 Oct 2026")
    const formatDisplayDate = (isoDate: string) => {
        return toDate(isoDate) ? formatDate(isoDate) : '';
    };

    // What waits for the dialog that is closing: the success dialog, "Photos not uploaded", "Dispatch saved" or the alert
    // for a refused save. A Modal cannot be presented over another that is still closing on iOS (nothing would appear,
    // and Print, Share and Create another would be out of reach), so it runs from that dialog's `onDismissed` (iOS) or
    // once both are hidden (Android).
    const afterDialog = useRef<(() => void) | null>(null);
    const runAfterDialog = () => {
        const next = afterDialog.current;
        afterDialog.current = null;
        next?.();
    };
    useEffect(() => {
        if (!showConfirmDialog && photosNotUploaded === null && Platform.OS !== 'ios') runAfterDialog();
    }, [showConfirmDialog, photosNotUploaded]);

    // The save or create got no answer: the screen is locked and says so (owner rule D22), which the busy confirm would
    // hide (and it has no X). The confirm closes now, so `performSubmit` has no closing of it to wait for later.
    const confirmClosedEarly = useRef(false);
    useEffect(() => {
        if (isCheckingAnswer && showConfirmDialog) {
            confirmClosedEarly.current = true;
            setShowConfirmDialog(false);
        }
    }, [isCheckingAnswer, showConfirmDialog]);

    // Handle form submission
    const handleSubmit = async () => {
        if (orderEmpty) return;
        // Only the prepared copy of a photo is uploaded, never the camera or gallery file. A
        // photo still being prepared holds the save; one that could not be prepared has to go.
        if (isCreateMode) {
            const photoState = unpreparedDispatchPhotos(images);
            if (photoState === 'preparing') {
                showAlert(tr('grn.review.photosPreparingTitle'), tr('grn.review.photosPreparingMessage'));
                return;
            }
            if (photoState === 'failed') {
                showAlert(tr('grn.review.photoNotPreparedTitle'), tr('grn.review.photoNotPreparedMessage'));
                return;
            }
        }
        // Show custom confirm dialog (dark mode compliant)
        setShowConfirmDialog(true);
    };

    // The confirm dialog stays open and busy until the save has answered.
    const handleConfirmSubmit = () => {
        if (isSubmitting) return;
        // Set submitting immediately to prevent duplicate taps
        setIsSubmitting(true);
        void performSubmit();
    };

    // What the answer of the save shows. The next dialog is queued in `afterDialog`; it is drawn once the confirm has
    // finished closing.
    const showResult = (result: DispatchSubmitResult) => {
        if (!result.success) {
            triggerError();
            // The identical request was refused for the number after a lost answer, and again after the check: the first
            // send may have saved it. The form stays locked (busy) and its only way out is Close, which leaves the form;
            // no next number is offered and nothing can be sent again from here.
            if (result.numberMaybeSaved) {
                const { message } = result.numberMaybeSaved;
                afterDialog.current = () =>
                    showAlert(tr('dispatch.wizard.errorTitle'), message, [{ text: tr('common.close'), onPress: handleCancel }], { cancelable: false });
                return;
            }
            // Re-enable button on error so user can retry
            setIsSubmitting(false);
            // The error is shown by `afterDialog`, once the confirm is gone. When another dispatch holds the number,
            // the number field says so (and may already hold the next free number): the alert takes the person to
            // step 1, where that field is.
            if (result.numberTaken) {
                const { message } = result.numberTaken;
                afterDialog.current = () =>
                    showAlert(tr('dispatch.wizard.errorTitle'), message, [
                        { text: tr('common.ok'), onPress: () => { void navigateToStep(DISPATCH_STEP_NUMBERS.INFO); } },
                    ]);
            }
            // Wave B: the date is refused (D3), or the date and number are locked by an invoice (D2): the same way, to step 1.
            if (result.toDetails) {
                const { message } = result.toDetails;
                afterDialog.current = () =>
                    showAlert(tr('dispatch.wizard.errorTitle'), message, [
                        { text: tr('common.ok'), onPress: () => { void navigateToStep(DISPATCH_STEP_NUMBERS.INFO); } },
                    ]);
            }
            // Someone else changed the dispatch (D1): keep what was typed, or read the dispatch again.
            if (result.stale) {
                afterDialog.current = () => {
                    void (async () => {
                        if ((await askStaleRecord('dispatch')) === 'reload') await reloadDispatch();
                    })();
                };
            }
            // The order the new dispatch was made from changed (D5): its lines were read again into the form. The person
            // checks the quantities on the items step, or, when no line is left, stays here with Create disabled.
            if (result.orderChanged) {
                const { empty } = result.orderChanged;
                afterDialog.current = () =>
                    showAlert(
                        tr('dispatch.refusal.orderChangedTitle'),
                        tr(empty ? 'dispatch.refusal.orderEmpty' : 'dispatch.refusal.orderChangedMessage'),
                        [{ text: tr('common.ok'), onPress: () => { if (!empty) void navigateToStep(DISPATCH_STEP_NUMBERS.ITEMS); } }]
                    );
            }
            return;
        }

        triggerSuccess();
        if (isCreateMode) {
            setCreatedDispatchNumber(header.disp_no);
            setSuccessDialogData({
                documentNo: header.disp_no,
                customerName: header.customer_name || tr('dispatch.review.noCustomer'),
                date: formatDisplayDate(header.disp_date),
                itemCount: items.length,
            });

            // Said once the success dialog is gone, for a dispatch made from an order: the order is gone from the
            // queue only when this dispatch used up its last line. The server says how many lines are left; an
            // older server says nothing and nothing is said.
            if (result.orderLinesLeft === 0) {
                queueToast(tr('dispatch.review.orderFulfilled'));
            } else if (typeof result.orderLinesLeft === 'number' && result.orderLinesLeft > 0) {
                queueToast(tr('dispatch.review.orderLinesLeft', { count: result.orderLinesLeft }));
            }

            // The dispatch is saved. Photos that did not upload are named with a
            // retry before the success dialog, never passed over.
            if (result.dispatchId && result.failedPhotos && result.failedPhotos.length > 0) {
                triggerWarning();
                const failure = { dispatchId: result.dispatchId, failed: result.failedPhotos };
                afterDialog.current = () => setPhotosNotUploaded(failure);
                return;
            }
            afterDialog.current = () => setShowSuccessDialog(true);
        } else {
            setEditOrderSynced(result.orderSynced === true);
            afterDialog.current = () => setShowEditSuccessDialog(true);
        }
    };

    const performSubmit = async () => {
        const result = await submitForm(false, (title, message) => {
            afterDialog.current = () => showAlert(title, message);
        });
        // The person left (the X) while the server was still being asked what became of the request: nobody to tell.
        if (result.aborted) return;
        setShowConfirmDialog(false);

        showResult(result);

        // The confirm was closed earlier (the screen was locked): no "finished closing" is still to come, so the next
        // dialog is opened here.
        if (confirmClosedEarly.current) {
            confirmClosedEarly.current = false;
            runAfterDialog();
        }
    };

    /** How each photo that was not uploaded is named: its place among the photos picked in the form. */
    const photosNotUploadedMessage = (failed: DispatchImageData[]) =>
        tr('dispatch.review.photosNotUploadedMessage', {
            number: formatIdentifier(header.disp_no),
            photos: failed
                .map((photo) => `• ${tr('dispatch.review.failedPhoto', { position: images.findIndex((img) => img.id === photo.id) + 1 || failed.indexOf(photo) + 1 })}`)
                .join('\n'),
        });

    // The question stays on screen, busy, while the photos go: a busy dialog does not close for the Back key or a tap
    // outside it, so the retry always ends on this screen, and the success dialog (with the ways out, which empty the
    // form) follows. Leaving in the middle left the saved dispatch's form behind, ready to be created again.
    const handleRetryPhotos = async () => {
        if (!photosNotUploaded || isRetryingPhotos) return;
        const { dispatchId: savedDispatchId, failed } = photosNotUploaded;
        setIsRetryingPhotos(true);
        try {
            const outcome = await uploadDeferredDispatchImages(savedDispatchId, failed);
            if (outcome.failed.length > 0) {
                triggerWarning();
                setPhotosNotUploaded({ dispatchId: savedDispatchId, failed: outcome.failed });
                return;
            }
            triggerSuccess();
            queueToast(tr('dispatch.review.photosUploaded'));
            // The success dialog opens once this one has finished closing
            afterDialog.current = () => setShowSuccessDialog(true);
            setPhotosNotUploaded(null);
        } finally {
            setIsRetryingPhotos(false);
        }
    };

    const handleContinueWithoutPhotos = () => {
        // The photos are given up, retry included: their files on the phone go (the
        // registry keeps a file while an upload of it still runs, until it ends).
        if (photosNotUploaded) {
            const files = photosNotUploaded.failed.map((photo) => photo.image_url);
            files.forEach((file) => abandonLocalPhotoUpload(file));
            void releaseLocalPhotos(files);
        }
        // Success dialog after "Photos not uploaded" has finished closing
        afterDialog.current = () => setShowSuccessDialog(true);
        setPhotosNotUploaded(null);
    };

    const handleEditSuccessConfirm = () => {
        setShowEditSuccessDialog(false);
        resetFormState();
        // The edit was opened over the dispatch's page, which asks again when it comes back: go back to that page,
        // not on to a second copy of it. The dispatch is the one of the route, not whatever the form holds.
        if (id) router.dismissTo(`/dispatch-details/${id}` as Href);
        else router.back();
    };

    // Handle Share PDF (create mode); a failure is said inside the dialog, which is open
    const handleSharePDF = async () => {
        if (!createdDispatchNumber) return;

        setShareError(null);
        setIsShareLoading(true);
        try {
            const pdfResult = await generateDispatchPDF(createdDispatchNumber);
            if (!pdfResult.success || !pdfResult.pdfUrl) {
                setShareError(tr('dispatch.review.pdfFailed'));
                return;
            }

            const shareResult = await downloadAndSharePDF(
                pdfResult.pdfUrl,
                `Dispatch_${createdDispatchNumber}.pdf`
            );
            if (!shareResult.success) {
                setShareError(tr('dispatch.review.shareFailed'));
            }
        } catch {
            setShareError(tr('dispatch.review.shareFailed'));
        } finally {
            setIsShareLoading(false);
        }
    };

    // Success dialog handlers (create mode)
    const handleCreateAnother = () => {
        setShowSuccessDialog(false);
        resetFormState();
        router.replace('/dispatch-form/step1');
        flushToasts();
    };

    const handleViewList = () => {
        setShowSuccessDialog(false);
        resetFormState();
        router.replace('/dispatch');
        flushToasts();
    };

    const handlePrint = () => {
        setShowSuccessDialog(false);
        setShowPrintDialog(true);
    };

    const isBusy = isSaving || isSubmitting || isRetryingPhotos || isCheckingAnswer;

    // ========================================================================
    // THE ITEMS TABLE (Item | GRN/Received | Qty)
    // ========================================================================

    const language = getLanguage();
    const lineFacts = useMemo(() => lineFactsCache(), [language]);
    const stockStatus = isCreateMode ? 'ready' : stock.status;
    const stockOf = stock.stockOf;
    /** The stock tag of a line: bags left in a new dispatch, the stock read again in an edit; none after a failed read. */
    const stockTextOf = useMemo(
        () => (item: DispatchItemData): string | null => {
            if (isCreateMode) return tr('dispatch.review.stockLeft', { stock: formatNumber(item.grnItems_stock - item.disp_quantity) });
            if (stockStatus === 'loading') return tr('dispatch.review.stockChecking');
            if (stockStatus === 'error') return null;
            return tr('dispatch.review.stockInStock', { stock: formatNumber(stockOf(item.grnItems_id) ?? item.grnItems_stock) });
        },
        [isCreateMode, stockStatus, stockOf]
    );

    const sources = useMemo(() => items.map((item) => ({ grn_no: item.grns_gr_no, original_quantity: item.grnItems_quantity })), [items]);
    const grnHeading = tr('dispatch.details.table.sourceGrnReceived');
    const grnCount = tr('dispatch.details.table.grnCount', { count: totals.uniqueGRNs });
    const lineCount = tr('dispatch.details.table.lineCount', { count: items.length });
    // The Qty column is as wide as its widest number, the total included; both columns are drawn `space.xs` wider.
    const qtyWidth = numberColumnWidth(screen, QTY_WIDTH, items.map((item) => formatNumber(item.disp_quantity)), [formatNumber(totals.totalQuantity)]) + space.xs;
    const grnWidth = sourceColumnWidth(sources, screen, [grnCount], grnHeading);
    // A long GRN/received or a big quantity would squeeze the item names: the GRN text goes under the item, and a
    // Qty that would still crowd it goes there too, right-aligned.
    const row = nestedRowWidth(screen);
    const stacked = screen.stacked || crowded(row, [grnWidth, qtyWidth], 0, screen.scale);
    const qtyUnder = stacked && lastColumnAlone(row, qtyWidth, screen.scale);

    const itemColumns = useMemo(
        () =>
            lineColumnHelper.columns([
                lineColumnHelper.display({
                    id: 'item',
                    header: tr('common.item'),
                    meta: { width: 'grow' },
                    cell: ({ row: line }) => (
                        <DispatchReviewItemCell
                            item={line.original}
                            stockText={stockTextOf(line.original)}
                            source={stacked ? sourceText({ grn_no: line.original.grns_gr_no, original_quantity: line.original.grnItems_quantity }) : null}
                            qtyText={qtyUnder ? formatNumber(line.original.disp_quantity) : null}
                            styles={styles}
                            table={table}
                        />
                    ),
                }),
                ...(stacked
                    ? []
                    : [
                          lineColumnHelper.display({
                              id: 'grn',
                              header: grnHeading,
                              meta: { width: grnWidth, headerOneLine: true },
                              cell: ({ row: line }) => (
                                  <Text style={table.primary} numberOfLines={1}>
                                      {sourceText({ grn_no: line.original.grns_gr_no, original_quantity: line.original.grnItems_quantity })}
                                  </Text>
                              ),
                          }),
                      ]),
                lineColumnHelper.display({
                    id: 'qty',
                    header: tr('lists.card.colQty'),
                    // Under the item the quantity has no column of its own, only its heading over the end of the row.
                    meta: { width: qtyUnder ? 'auto' : qtyWidth, numeric: true, headerOnly: qtyUnder },
                    cell: ({ row: line }) => (
                        <Text style={table.numberStrong} numberOfLines={1}>{formatNumber(line.original.disp_quantity)}</Text>
                    ),
                }),
            ]),
        [stacked, qtyUnder, grnWidth, qtyWidth, grnHeading, stockTextOf, styles, table]
    );
    const itemsTable = useAppTable({
        columns: itemColumns,
        data: items,
        getRowId: (item) => item.unique_id,
    });

    // Handle step indicator press for navigation
    const handleStepIndicatorPress = async (stepNumber: number) => {
        if (stepNumber === DISPATCH_STEP_NUMBERS.REVIEW) return; // Already on this step
        await navigateToStep(stepNumber);
    };

    const submitLabel = isCreateMode ? tr('dispatch.review.createDispatch') : tr('dispatch.review.saveChanges');
    const submitBusyLabel = isCreateMode ? tr('dispatch.review.creating') : tr('dispatch.review.savingChanges');

    const imageDataForGrid = images.map((img) => ({
        id: img.id,
        imageUrl: img.image_url,
        fileName: img.file_name,
        fileSize: img.file_size || 0,
        mimeType: img.mime_type || 'image/jpeg',
        uploadTimestamp: new Date().toISOString(),
        uploadStatus: img.upload_status,
        progress: img.upload_progress,
    }));
    const address = [header.customer_address, header.customer_city].filter(
        (part, index, parts) => !!part && parts.indexOf(part) === index
    ).join(', ');

    return (
        <View style={styles.container}>
            <DispatchStepIndicator
                steps={dispatchSteps()}
                currentStep={DISPATCH_STEP_NUMBERS.REVIEW}
                completedSteps={getDispatchCompletedSteps(DISPATCH_STEP_NUMBERS.REVIEW)}
                onCancel={handleCancel}
                // While the server is asked what became of the request, the X is the only way out, and it warns
                // ("Keep waiting" / "Leave anyway")
                disabled={isCheckingAnswer}
                leaveWarning={isCheckingAnswer ? tr('errors.lostAnswer.leaveWarning') : undefined}
                cancelMessage={
                    isCreateMode
                        ? items.length > 0
                            ? tr('dispatch.wizard.discardItemsMessage', { count: items.length })
                            : tr('dispatch.wizard.discardDetailsMessage')
                        : tr('dispatch.wizard.discardEditMessage')
                }
                dispNo={header.disp_no}
                // No step pills while locked
                onStepPress={isCheckingAnswer ? undefined : handleStepIndicatorPress}
                isEditMode={!isCreateMode}
            />

            {isCheckingAnswer ? <LostAnswerStrip kind="save" testID="dispatch-review-checking" /> : null}

            {orderEmpty ? (
                <View style={styles.orderEmptyStrip} testID="dispatch-review-order-empty">
                    <InlineValidation variant="warning" message={tr('dispatch.refusal.orderEmpty')} />
                </View>
            ) : null}

            <View style={styles.contentWrapper}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <ReviewCard testID="dispatch-review-table">
                        {/* Dispatch details */}
                        <ReviewSection
                            id="details"
                            testIDPrefix="dispatch-review"
                            title={tr('dispatch.steps.details')}
                            onEdit={isCheckingAnswer ? undefined : () => navigateToStep(DISPATCH_STEP_NUMBERS.INFO)}
                            editLabel={tr('dispatch.review.editDetails')}
                            closedLine={[header.disp_no, formatDisplayDate(header.disp_date), header.customer_name].filter(Boolean).join(' · ')}
                            open={openSection === 'details'}
                            onToggle={toggleSection}
                            first
                        >
                            <ReviewKeyValues>
                                <ReviewKeyValue label={tr('common.dispatchNumber')} value={header.disp_no || EMPTY} emphasized first />
                                <ReviewKeyValue label={tr('common.date')} value={formatDisplayDate(header.disp_date) || EMPTY} />
                                <ReviewKeyValue label={tr('common.customer')} value={header.customer_name || EMPTY} />
                                <ReviewKeyBlock label={tr('dispatch.review.address')} value={address || EMPTY} />
                                <ReviewKeyValue label={tr('common.mobileNumber')} value={header.customer_mobile ? formatMobile(header.customer_mobile) : EMPTY} />
                                <ReviewKeyValue label={tr('dispatch.review.vehicle')} value={header.registration || EMPTY} />
                                <ReviewKeyValue label={tr('dispatch.form.supervisor')} value={header.supervisor_name || EMPTY} />
                                <ReviewKeyBlock label={tr('common.notes')} value={header.note || EMPTY} />

                                <View style={styles.totalsSection}>
                                    <ReviewKeyValue label={tr('dispatch.review.totalItems')} value={formatNumber(items.length)} emphasized first />
                                    <ReviewKeyValue label={tr('dispatch.summarySheet.grns')} value={formatNumber(totals.uniqueGRNs)} emphasized />
                                    <ReviewKeyValue label={tr('dispatch.review.totalQuantity')} value={formatNumber(totals.totalQuantity)} emphasized />
                                </View>
                            </ReviewKeyValues>
                        </ReviewSection>

                        {/* Photos (create only) */}
                        {isCreateMode ? (
                            <ReviewSection
                                id="photos"
                                testIDPrefix="dispatch-review"
                                title={tr('dispatch.review.photosHeading')}
                                count={images.length > 0 ? images.length : undefined}
                                closedLine={images.length > 0 ? formatCount(images.length, 'photo') : tr('dispatch.review.closedNoPhotos')}
                                open={openSection === 'photos'}
                                onToggle={toggleSection}
                            >
                                <View style={[table.nested, styles.photosBody]}>
                                    <Text style={styles.photosHint}>{tr('dispatch.review.photosHint')}</Text>

                                    {images.length > 0 && (
                                        <ImagePreviewGrid
                                            imageData={imageDataForGrid}
                                            onRemoveImage={handleRemoveImage}
                                            // handleRemoveImage removes a dispatch photo on the server; the
                                            // grid's own removal is the GRN one.
                                            removeFromServer={false}
                                            onImagePress={(imageData) => {
                                                const index = images.findIndex((img) => img.id === imageData.id);
                                                setSelectedImageIndex(index >= 0 ? index : 0);
                                                setShowImageOverlay(true);
                                            }}
                                            editable={!isCheckingAnswer}
                                            maxImages={10}
                                            columns={3}
                                        />
                                    )}

                                    {isCheckingAnswer ? null : (
                                        <ImageUploadButton
                                            onImageUploadStart={handleImageUploadStart}
                                            onImageUploadProgress={handleImageUploadProgress}
                                            onImageUploadComplete={handleImageUploadComplete}
                                            onImageUploadError={handleImageUploadError}
                                            grnId={tempDispatchId}
                                            imageType="header"
                                            currentImages={images.map((img) => img.image_url)}
                                            maxImages={10}
                                            buttonText={images.length > 0 ? tr('dispatch.review.addMorePhotos') : tr('dispatch.review.addPhotos')}
                                            customUploadFunction={dispatchUploadFunction}
                                        />
                                    )}
                                </View>
                            </ReviewSection>
                        ) : null}

                        {/* Items */}
                        <ReviewSection
                            id="items"
                            testIDPrefix="dispatch-review"
                            title={tr('common.items')}
                            count={items.length}
                            tag={!isCreateMode && stock.status === 'error' ? tr('dispatch.review.stockNotChecked') : undefined}
                            onEdit={isCheckingAnswer ? undefined : () => navigateToStep(DISPATCH_STEP_NUMBERS.ITEMS)}
                            editLabel={tr('dispatch.review.editItems')}
                            closedLine={tr('dispatch.review.closedItems', { quantity: formatNumber(totals.totalQuantity) })}
                            open={openSection === 'items'}
                            onToggle={toggleSection}
                        >
                            {!isCreateMode && stock.status === 'error' ? (
                                <View style={styles.errorStrip} testID="dispatch-review-stock-error">
                                    <InlineValidation variant="error" message={tr('dispatch.review.stockErrorMessage')} />
                                    <Pressable
                                        onPress={stock.retry}
                                        style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
                                        accessibilityRole="button"
                                        accessibilityLabel={tr('common.retry')}
                                        testID="dispatch-review-stock-retry"
                                    >
                                        <Text style={styles.retryText}>{tr('common.retry')}</Text>
                                    </Pressable>
                                </View>
                            ) : null}
                            <DataTable
                                table={itemsTable}
                                variant="nested"
                                headerOneLine={false}
                                testID="dispatch-review-items-table"
                                rowTestID={(line) => `dispatch-review-row-${line.original.unique_id}`}
                                rowLabel={(line) => lineFacts.label(line.original, line.index, stockTextOf(line.original))}
                                footer={
                                    <>
                                        <View
                                            style={[table.footerRow, styles.totalRow]}
                                            accessible
                                            accessibilityLabel={tr('dispatch.details.table.itemsTotalLabel', {
                                                lines: lineCount,
                                                grns: grnCount,
                                                bags: formatCount(totals.totalQuantity, 'bag'),
                                            })}
                                            testID="dispatch-review-items-total"
                                        >
                                            <View style={table.grow}>
                                                <Text style={table.primaryStrong}>{tr('common.total')}</Text>
                                                <Text style={table.secondary}>{nb(stacked ? `${lineCount} · ${grnCount}` : lineCount)}</Text>
                                            </View>
                                            {!stacked ? (
                                                <View style={{ width: grnWidth }}>
                                                    <Text style={table.primaryStrong} numberOfLines={1}>{grnCount}</Text>
                                                </View>
                                            ) : null}
                                            <Text style={[table.numberStrong, { width: qtyWidth }]} numberOfLines={1}>{formatNumber(totals.totalQuantity)}</Text>
                                        </View>
                                        {/* Message for edit mode (informative), as the table's note */}
                                        {!isCreateMode ? (
                                            <Text style={styles.tableNote} testID="dispatch-review-edit-hint">{tr('dispatch.review.editHint')}</Text>
                                        ) : null}
                                    </>
                                }
                            />
                        </ReviewSection>
                    </ReviewCard>
                </ScrollView>

                {/* Bottom bar (guide 13.8): Back secondary, primary action */}
                <WizardBottomBar
                    currentStep={DISPATCH_STEP_NUMBERS.REVIEW}
                    totalSteps={DISPATCH_STEP_COUNT}
                    onPrevious={handleBack}
                    previousAccessibilityLabel={tr('dispatch.review.backToItems')}
                    previousTestID="dispatch-review-back"
                    onNext={handleSubmit}
                    nextTestID="dispatch-review-submit"
                    nextLabel={submitLabel}
                    loadingLabel={submitBusyLabel}
                    nextDisabled={orderEmpty}
                    isLoading={isBusy}
                />
            </View>

            {/* Confirm Submit Dialog; busy until the save has answered */}
            <ConfirmDialog
                visible={showConfirmDialog}
                title={tr(isCreateMode ? 'dispatch.review.confirmCreateTitle' : 'dispatch.review.confirmSaveTitle', {
                    number: formatIdentifier(header.disp_no),
                })}
                message={tr(isCreateMode ? 'dispatch.review.confirmCreateMessage' : 'dispatch.review.confirmSaveMessage', {
                    count: items.length,
                })}
                confirmText={submitLabel}
                cancelText={tr('common.cancel')}
                onConfirm={handleConfirmSubmit}
                onCancel={() => setShowConfirmDialog(false)}
                variant="default"
                icon={isCreateMode ? 'check-circle' : 'pencil-outline'}
                busy={isSubmitting || isSaving}
                onDismissed={runAfterDialog}
            />

            {/* Photos of the created dispatch that did not upload */}
            <ConfirmDialog
                visible={photosNotUploaded !== null}
                title={tr('dispatch.review.photosNotUploadedTitle')}
                message={photosNotUploaded ? photosNotUploadedMessage(photosNotUploaded.failed) : ''}
                confirmText={tr('dispatch.review.retryPhotos')}
                cancelText={tr('dispatch.review.continueWithoutPhotos')}
                onConfirm={handleRetryPhotos}
                onCancel={handleContinueWithoutPhotos}
                variant="warning"
                icon="image-off-outline"
                dismissible={false}
                // Giving the photos up is the button's choice, not the Back key's (it used to take that way and drop the files unasked).
                ignoreBack
                busy={isRetryingPhotos}
                onDismissed={runAfterDialog}
            />

            {/* Success Dialog (create mode) */}
            {isCreateMode && (
                <DocumentSuccessDialog
                    isVisible={showSuccessDialog}
                    entity="dispatch"
                    documentData={successDialogData}
                    onCreateAnother={handleCreateAnother}
                    onViewList={handleViewList}
                    onPrint={handlePrint}
                    onSharePDF={handleSharePDF}
                    isShareLoading={isShareLoading}
                    shareError={shareError}
                />
            )}

            {/* Print Dialog (create mode) */}
            {isCreateMode && (
                <PrintRangeDialog
                    visible={showPrintDialog}
                    onDismiss={() => {
                        setShowPrintDialog(false);
                        resetFormState();
                        router.replace('/dispatch');
                        // After a failed print the toasts wait for the alert's button: a toast under the alert is lost
                        if (!printAlertOpen.current) flushToasts();
                    }}
                    onConfirm={async (start, end) => {
                        const result = await printDispatchRange(start, end);
                        if (result.success) {
                            queueToast(
                                result.print_job?.cups_job_id
                                    ? tr('dispatch.review.printSentWithJob', { job: String(result.print_job.cups_job_id) })
                                    : tr('dispatch.review.printSent')
                            );
                        } else {
                            // A dialog, not a toast: the step is left at once, and a failure is
                            // something the person must act on. The unconfirmed one must not invite a reprint.
                            // The queued toasts ("Order fulfilled...") are said when the person closes it.
                            printAlertOpen.current = true;
                            showAlert(
                                tr(result.unconfirmed ? 'dispatch.review.printUnconfirmedTitle' : 'dispatch.review.printFailedTitle'),
                                tr(result.unconfirmed ? 'dispatch.review.printUnconfirmed' : 'dispatch.review.printFailed'),
                                [{ text: tr('common.ok'), onPress: () => { printAlertOpen.current = false; flushToasts(); } }],
                                { onDismiss: () => { printAlertOpen.current = false; flushToasts(); } }
                            );
                        }
                        // Leaving the step is the dialog's onDismiss above, which the dialog calls after this.
                        setShowPrintDialog(false);
                    }}
                    title={tr('dispatch.review.printTitle')}
                    defaultNumber={createdDispatchNumber}
                    entity="dispatch"
                    placeholder={tr('dispatch.review.printPlaceholder', { example: 'D001' })}
                />
            )}

            {/* Full-screen image preview */}
            {images.length > 0 && (
                <ImageOverlay
                    visible={showImageOverlay}
                    images={images.map(img => ({
                        id: img.id,
                        imageUrl: img.image_url,
                        fileName: img.file_name || 'image.jpg',
                        fileSize: img.file_size || 0,
                        mimeType: img.mime_type || 'image/jpeg',
                        uploadTimestamp: new Date().toISOString(),
                        uploadStatus: img.upload_status,
                    }))}
                    initialIndex={selectedImageIndex}
                    onClose={() => setShowImageOverlay(false)}
                />
            )}

            {/* Edit Success Dialog (edit mode) */}
            <ConfirmDialog
                visible={showEditSuccessDialog}
                title={tr('dispatch.review.savedTitle', { number: formatIdentifier(header.disp_no) })}
                message={[tr('dispatch.review.savedMessage'), editOrderSynced ? tr('dispatch.refusal.orderSynced') : null].filter(Boolean).join('\n')}
                confirmText={tr('dispatch.review.viewDispatch')}
                cancelText=""
                onConfirm={handleEditSuccessConfirm}
                onCancel={handleEditSuccessConfirm}
                variant="default"
                icon="check-circle"
            />
        </View>
    );
}

/** An empty value of the details (style guide 12.3). */
const EMPTY = '—';

type DispatchReviewStyles = ReturnType<typeof makeStyles>;
type TableStyles = ReturnType<typeof makeTableStyles>;

const lineColumnHelper = createAppColumnHelper<DispatchItemData>();

/**
 * What the review's lines say about themselves, kept per line object and stock text: the screen-reader label naming the
 * item, mark, GRN, quantity, weight, rack, received quantity and stock (the rack and the received quantity are drawn on the line). A line that did not change is not worked out again, so opening a section
 * or a dialog does not format the other lines.
 */
function lineFactsCache() {
    const cache = new WeakMap<DispatchItemData, Map<string, string>>();
    return {
        label: (item: DispatchItemData, index: number, stockText: string | null): string => {
            let labels = cache.get(item);
            if (!labels) {
                labels = new Map();
                cache.set(item, labels);
            }
            const key = `${index}|${stockText ?? ''}`;
            let label = labels.get(key);
            if (label === undefined) {
                label = [
                    tr(item.grnItems_package_mark ? 'dispatch.review.itemRowLabelWithMark' : 'dispatch.review.itemRowLabel', {
                        index: index + 1,
                        item: item.grnItems_item_name,
                        mark: item.grnItems_package_mark,
                        grn: formatIdentifier(item.grns_gr_no),
                        quantity: formatCount(item.disp_quantity, 'bag'),
                    }),
                    formatWeightEach(item.grnItems_weight),
                    tr('grn.item.rackWithValue', { rack: item.grnItems_rack?.trim() || EMPTY }),
                    tr('dispatch.details.received', { bags: formatCount(item.grnItems_quantity, 'bag') }),
                    stockText,
                ]
                    .filter(Boolean)
                    .join(', ');
                labels.set(key, label);
            }
            return label;
        },
    };
}

interface DispatchReviewItemCellProps {
    item: DispatchItemData;
    /** "115 left", "120 in stock" or "Checking stock"; null when the stock could not be read. */
    stockText: string | null;
    /** "WMWM8884/1,677", under the item when the GRN column is gone; null while it is a column. */
    source: string | null;
    /** The dispatched quantity under the item, right-aligned, when it has no column of its own. */
    qtyText: string | null;
    styles: DispatchReviewStyles;
    table: TableStyles;
}

/** The Item cell of one line: name, mark, the tags (weight, rack, stock) and, when stacked, the GRN text and Qty. */
const DispatchReviewItemCell = React.memo(function DispatchReviewItemCell({ item, stockText, source, qtyText, styles, table }: DispatchReviewItemCellProps) {
    const weightText = formatWeightEach(item.grnItems_weight);
    const mark = item.grnItems_package_mark?.trim();
    const rack = item.grnItems_rack?.trim();
    return (
        <>
            <Text style={table.primaryStrong}>{item.grnItems_item_name}</Text>
            {mark ? <Text style={table.secondary} numberOfLines={MARK_LINES} ellipsizeMode="tail">{mark}</Text> : null}
            <View style={styles.itemTags}>
                {weightText !== null && <StatusTag wrap status="neutral" label={weightText} icon="weight-kilogram" />}
                <StatusTag wrap status="neutral" label={tr('grn.item.rackWithValue', { rack: rack || EMPTY })} icon="view-grid-outline" />
                {stockText !== null && <StatusTag wrap status="neutral" label={stockText} icon="warehouse" />}
            </View>
            {source !== null ? <Text style={[table.secondary, styles.stackedGrn]}>{source}</Text> : null}
            {qtyText !== null ? <Text style={table.numberStrong} numberOfLines={1}>{qtyText}</Text> : null}
        </>
    );
});

const makeStyles = (t: ThemeTokens) => ({
    container: {
        flex: 1,
        backgroundColor: t.background.base,
    },
    contentWrapper: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: space.lg,
        paddingBottom: space.xxl,
    },
    orderEmptyStrip: {
        marginHorizontal: space.lg,
        marginTop: space.sm,
    },
    totalsSection: {
        borderTopWidth: 1,
        borderTopColor: t.table.separator,
    },
    photosBody: {
        padding: space.sm,
        gap: space.md,
    },
    photosHint: {
        ...typography.subhead,
        color: t.text.secondary,
    },
    itemTags: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: space.s6,
        marginTop: space.xs,
    },
    stackedGrn: {
        marginTop: space.xs,
    },
    // The total pads like the lines of the nested table, so its figure lines up with theirs
    totalRow: {
        paddingHorizontal: space.sm,
    },
    tableNote: {
        ...typography.subhead,
        color: t.text.secondary,
        paddingHorizontal: space.sm,
        paddingVertical: space.sm,
        borderTopWidth: 1,
        borderTopColor: t.table.separator,
    },
    // The stock message strip (InlineValidation, guide 13.9) with the Try again button under it
    errorStrip: {
        margin: space.sm,
        gap: space.sm,
    },
    retryButton: {
        alignSelf: 'flex-start' as const,
        minHeight: touchTarget,
        paddingHorizontal: space.lg,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: t.border.button,
    },
    retryButtonPressed: {
        backgroundColor: t.brand.subtle,
    },
    retryText: {
        ...typography.callout,
        color: t.brand.tint,
    },
});

export default DispatchReviewStep;
