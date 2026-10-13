import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { triggerSuccess, triggerError, triggerWarning } from '@/hooks/useHaptics';
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

import { showAlert } from '@/utils/alert';
import WizardBottomBar from '@/components/WizardBottomBar';
import { formatCount, formatDate, formatNumber, formatWeight } from '@/utils/formatters';
import { StatusTag } from '@/components/ui';
import { t as tr, formatIdentifier } from '@/i18n';
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

export function GrnReviewStep({ mode }: GrnReviewStepProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Extract ID from URL params for edit mode
  const { id } = useLocalSearchParams<{ id: string }>();

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

  const handlePrevious = () => {
    dispatch(setCurrentStep(2));
    router.back();
  };

  const handleNavigateToHeader = () => {
    dispatch(setCurrentStep(1));
    router.back();
    requestAnimationFrame(() => {
      router.back();
    });
  };

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
        showAlert(saveFailedTitle(), serverText(result.error, connectionHint()));
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
      }, { removedImages, adoptedLineIds: adopted });

      if (result.success) {
        const resultData = result.data as { data?: { items_skipped_stock?: Array<{ item_name: string; reason: string }> }; items_skipped_stock?: Array<{ item_name: string; reason: string }> } | undefined;
        const skippedItems = resultData?.data?.items_skipped_stock || resultData?.items_skipped_stock;

        if (skippedItems && skippedItems.length > 0) {
          triggerWarning();
          const skippedText = skippedItems.map((item) => `• ${item.item_name}: ${item.reason}`).join('\n');
          setSnackbarMessage(tr('grn.review.savedWithSkipped', { items: skippedText }));
        } else {
          triggerSuccess();
          setSnackbarMessage(header.gr_no ? tr('grn.review.savedWithNumber', { number: formatIdentifier(header.gr_no) }) : tr('grn.review.saved'));
        }
        setSnackbarVisible(true);

        const grNo = header.gr_no || '';
        setDocumentNumber(grNo);
        setSuccessDialogData({
          documentNo: grNo,
          customerName: header.customer_name || tr('common.unknown'),
          date: formatReviewDate(header.date),
          itemCount: items.length,
        });
        finishSave(grnId, result.data?.photos);
      } else if (result.outcomeUnknown) {
        // Sent, not answered: the GRN may or may not be saved. The form stays as it is.
        triggerError();
        dispatch(setSaveUnconfirmed(true));
        showAlert(saveFailedTitle(), tr('grn.review.saveUnanswered'));
      } else {
        triggerError();
        const errorMessage = serverText(result.error, connectionHint());
        if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
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

  // ============================================================================
  // FIORI BUILDING BLOCKS (plain render helpers, so rows are not remounted)
  // ============================================================================

  const renderSectionHeader = (
    title: string,
    options?: { count?: number; onEdit?: () => void; editLabel?: string }
  ) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText} accessibilityRole="header">
        {title.toUpperCase()}
        {options?.count !== undefined ? ` (${formatNumber(options.count)})` : ''}
      </Text>
      {options?.onEdit ? (
        <Pressable
          onPress={options.onEdit}
          style={({ pressed }) => [styles.editLink, pressed && styles.editLinkPressed]}
          accessibilityRole="button"
          accessibilityLabel={options.editLabel ?? tr('common.edit')}
          hitSlop={{ top: space.xs, bottom: space.xs }}
        >
          <Icon name="pencil-outline" size={iconSize.sm} color={t.brand.tint} />
          <Text style={styles.editLinkText}>{tr('common.edit')}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderKeyValue = (label: string, value: React.ReactNode, emphasized = false) => (
    <View style={styles.keyValueRow} key={label} accessible accessibilityLabel={typeof value === 'string' ? `${label}, ${value}` : undefined}>
      <Text style={styles.keyValueLabel}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={[styles.keyValueValue, emphasized && styles.keyValueValueEmphasized]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );

  // The item cells, built again only when the lines, the mode or the theme change:
  // a dialog or a photo upload on this step does not redraw every line.
  const itemCells = useMemo(
    () =>
      items.map((item, index) => (
        <GrnReviewItemCell
          key={item.grn_trl_id || `item-${index}`}
          item={item}
          index={index}
          isLast={index === items.length - 1}
          isProtected={!isCreateMode && item.qty !== item.stock}
          styles={styles}
        />
      )),
    [items, isCreateMode, styles]
  );

  const renderSummaryKPI = (icon: string, label: string, value: number) => (
    <View style={styles.summaryKPI} accessible accessibilityLabel={`${label}, ${formatNumber(value)}`}>
      <View style={styles.summaryKPIIcon}>
        <Icon name={icon} size={iconSize.md} color={t.brand.tint} />
      </View>
      <View style={styles.summaryKPIContent}>
        <Text style={styles.summaryKPILabel}>{label}</Text>
        <Text style={styles.summaryKPIValue}>{formatNumber(value)}</Text>
      </View>
    </View>
  );

  const grImages = header.gr_images ?? [];

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
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* GRN details */}
          {renderSectionHeader(tr('grn.steps.details'), { onEdit: handleNavigateToHeader, editLabel: tr('grn.review.editDetails') })}
          <View style={styles.card}>
            <View style={styles.cardBody}>
              {renderKeyValue(tr('common.grnNumber'), header.gr_no || tr('common.notSet'), true)}
              {header.registration ? renderKeyValue(tr('grn.header.vehicleRegistration'), header.registration) : null}
              {renderKeyValue(tr('common.date'), formatReviewDate(header.date))}
              {renderKeyValue(tr('common.customer'), header.customer_name || tr('grn.review.notSelected'))}
              {renderKeyValue(tr('grn.header.sender'), header.sender_name || tr('grn.review.notSelected'))}
              {renderKeyValue(tr('grn.header.supervisor'), header.supervisor_name || tr('grn.review.notSelected'))}
              {renderKeyValue(tr('grn.header.pricingMode'), header.pricing_mode === 'ONE_TIME' ? tr('grn.header.oneTime') : tr('grn.header.monthly'))}
              {header.leon
                ? renderKeyValue(
                    tr('grn.header.leon'),
                    <StatusTag status="positive" label={tr('common.on')} />
                  )
                : null}

              {header.note ? (
                <View style={styles.notesSection}>
                  <Text style={styles.notesLabel}>{tr('common.notes')}</Text>
                  <Text style={styles.notesValue}>{header.note}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* GRN photos */}
          {renderSectionHeader(tr('grn.review.photosTitle'), { count: grImages.length > 0 ? grImages.length : undefined })}
          <View style={styles.card}>
            <View style={styles.cardBody}>
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
          </View>

          {/* Items */}
          {renderSectionHeader(tr('common.items'), { count: items.length, onEdit: handlePrevious, editLabel: tr('grn.review.editItems') })}
          <View style={styles.card}>
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="package-variant-closed" size={iconSize.hero} color={t.icon.secondary} />
                <Text style={styles.emptyStateTitle}>{tr('grn.review.emptyTitle')}</Text>
                <Text style={styles.emptyStateSubtitle}>{tr('grn.review.emptySubtitle')}</Text>
              </View>
            ) : (
              <View>{itemCells}</View>
            )}
          </View>

          {/* Summary */}
          {renderSectionHeader(tr('grn.review.summary'))}
          <View style={styles.card}>
            <View style={styles.summaryGrid}>
              {renderSummaryKPI('format-list-numbered', tr('grn.review.totalItems'), totalItems)}
              {renderSummaryKPI('counter', tr('grn.review.totalQuantity'), totalQty)}
            </View>
          </View>
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
          } else {
            setSnackbarMessage(tr('grn.review.printFailed'));
          }
          setSnackbarVisible(true);
          setShowPrintDialog(false);
          if (!isCreateMode) {
            resetFormState();
            router.replace('/grn');
          } else {
            setShowSuccessDialog(true);
          }
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

interface GrnReviewItemCellProps {
  item: GRNItemData;
  index: number;
  isLast: boolean;
  /** A stored line with dispatches: its quantity cannot change. */
  isProtected: boolean;
  styles: GrnReviewStyles;
}

/** One line of the review's item list; drawn again only when its own props change. */
const GrnReviewItemCell = React.memo(function GrnReviewItemCell({ item, index, isLast, isProtected, styles }: GrnReviewItemCellProps) {
  const qty = item.qty || 0;
  const weight = item.weight || 0;
  const hasWeight = weight > 0;
  const rack = item.rack?.trim();
  const packageMark = item.package_mark?.trim();
  const imageCount = item.trl_images?.length || 0;
  const a11yParts = [
    tr('grn.item.itemNumber', { number: index + 1 }),
    item.item_name,
    item.packaging,
    tr('grn.item.a11yQuantity', { quantity: formatNumber(qty) }),
    hasWeight ? tr('grn.review.weightEach', { weight: formatWeight(weight) }) : undefined,
    rack ? tr('grn.item.a11yRack', { rack }) : undefined,
    packageMark ? tr('grn.item.a11yMark', { mark: packageMark }) : undefined,
    imageCount > 0 ? formatCount(imageCount, 'photo') : undefined,
    isProtected ? tr('grn.review.a11yDispatchedLocked') : undefined,
  ].filter(Boolean);

  return (
    <View
      style={[styles.objectCell, !isLast && styles.objectCellBorder]}
      accessible
      accessibilityLabel={a11yParts.join(', ')}
    >
      <View style={styles.objectCellAvatar}>
        <Text style={styles.objectCellAvatarText}>{formatNumber(index + 1)}</Text>
      </View>

      <View style={styles.objectCellContent}>
        <Text style={styles.objectCellHeadline} numberOfLines={2}>
          {item.item_name}
        </Text>

        {item.packaging ? (
          <Text style={styles.objectCellSubheadline} numberOfLines={1}>
            {item.packaging}
          </Text>
        ) : null}

        <View style={styles.objectCellFootnote}>
          {hasWeight && <StatusTag status="neutral" label={formatWeight(weight)} icon="weight-kilogram" />}
          {rack ? <StatusTag status="neutral" label={tr('grn.item.rackWithValue', { rack })} icon="view-grid-outline" /> : null}
          {packageMark ? <StatusTag status="neutral" label={tr('grn.item.markWithValue', { mark: packageMark })} icon="label-outline" /> : null}
          {imageCount > 0 && (
            <StatusTag status="neutral" label={formatCount(imageCount, 'photo')} icon="camera-outline" />
          )}
        </View>
      </View>

      <View style={styles.objectCellStatus}>
        <Text style={styles.qtyValue}>{formatNumber(qty)}</Text>
        <Text style={styles.qtyLabel}>{tr('grn.item.qtyShort')}</Text>
        {isProtected && (
          <StatusTag status="critical" label={tr('grn.item.quantityLocked')} icon="lock-outline" />
        )}
      </View>
    </View>
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

  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.xs,
  },
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
    flex: 1,
  },
  editLink: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
  },
  editLinkPressed: { backgroundColor: t.brand.subtle },
  editLinkText: { ...typography.callout, color: t.brand.tint },

  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginBottom: space.lg,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  cardBody: { padding: space.lg },

  keyValueRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    columnGap: space.md,
    paddingVertical: space.sm,
    minHeight: touchTarget - space.sm,
  },
  keyValueLabel: { ...typography.subhead, color: t.text.secondary },
  keyValueValue: { ...typography.body, color: t.text.primary, textAlign: 'right' as const, flexShrink: 1 },
  keyValueValueEmphasized: { fontWeight: fontWeight.semibold },

  notesSection: {
    marginTop: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
  },
  notesLabel: { ...typography.subhead, color: t.text.secondary, marginBottom: space.xs },
  notesValue: { ...typography.body, color: t.text.primary },

  imagesSectionSubtitle: { ...typography.subhead, color: t.text.secondary, marginBottom: space.md },

  objectCell: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: t.surface.card,
  },
  objectCellBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  objectCellAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  objectCellAvatarText: {
    ...typography.headline,
    color: t.brand.tint,
    fontVariant: ['tabular-nums' as const],
  },
  objectCellContent: { flex: 1, gap: space.xxs },
  objectCellHeadline: { ...typography.headline, color: t.text.primary },
  objectCellSubheadline: { ...typography.subhead, color: t.text.secondary },
  objectCellFootnote: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.s6,
    marginTop: space.xs,
  },
  objectCellStatus: { alignItems: 'flex-end' as const, gap: space.xxs },
  qtyValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  qtyLabel: { ...typography.caption1, color: t.text.secondary },

  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  emptyStateTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  emptyStateSubtitle: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },

  summaryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    padding: space.lg,
    gap: space.lg,
  },
  summaryKPI: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  summaryKPIIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  summaryKPIContent: { flex: 1 },
  summaryKPILabel: { ...typography.footnote, color: t.text.secondary },
  summaryKPIValue: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },

  snackbar: { backgroundColor: t.surface.inverse, borderRadius: radius.button, ...t.shadow[3] },
  snackbarText: { ...typography.subhead, color: t.text.inverse },
});

export default GrnReviewStep;
