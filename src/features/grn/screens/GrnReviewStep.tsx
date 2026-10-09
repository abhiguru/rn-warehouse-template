import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { triggerSuccess, triggerError, triggerWarning } from '@/hooks/useHaptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  GRNImageData,
  setCurrentStep,
  setValidationErrors,
  addHeaderImage,
  removeHeaderImage,
  updateHeaderImageProgress,
  completeHeaderImageUpload,
  failHeaderImageUpload,
  setIsSaving,
} from '@/store/slices/grnFormSlice';
import { useGRNForm } from '@/hooks';
import { ImageUploadButton } from '@/features/grn/components/ImageUploadButton';
import { createGRN, updateGRN } from '@/features/grn/services/grnFormService';
import { validateStep3 } from '@/features/grn/schemas/grnValidation';
import { ImagePreviewGrid } from '@/features/grn/components/ImagePreviewGrid';
import { ImageOverlay } from '@/components/ImageOverlay';
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import { GRN_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printGRNRange } from '@/services/print-service';
import { DocumentSuccessDialog, DocumentData } from '@/components/DocumentSuccessDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { generateGRNPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';

import { showAlert } from '@/utils/alert';
const numberFormat = new Intl.NumberFormat('en-IN');
const weightFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9 Oct 2026", the style guide date format. */
function formatReviewDate(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (isNaN(date.getTime())) return '';
  // Three-letter months on every engine (en-IN prints "Sept" on some).
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const STOCK_PROTECTED_TITLE = 'Some items are already dispatched';
const STOCK_PROTECTED_MESSAGE =
  "You can't change the quantity or stock of dispatched items. You can still change other details.";
const SAVE_FAILED_TITLE = "Couldn't save the GRN";
const CONNECTION_HINT = 'Check your connection and try again.';

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
  const insets = useSafeAreaInsets();

  const [isSubmitting, setIsSubmitting] = useState(false);
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

  useEffect(() => {
    console.log('[GrnReviewStep] Header data:', header);
    console.log('[GrnReviewStep] Items count:', items.length);
  }, [header, items]);

  const handleCancel = () => {
    showAlert(
      isCreateMode ? 'Discard this GRN?' : 'Discard changes to this GRN?',
      `${items.length} ${items.length === 1 ? 'item' : 'items'} ${isCreateMode ? 'and the GRN details' : 'and your changes'} will be lost.`,
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: isCreateMode ? 'Discard GRN' : 'Discard changes',
          style: 'destructive',
          onPress: () => {
            resetFormState();
            // Always navigate to GRN list directly, not back one step
            router.replace('/grn');
          },
        },
      ]
    );
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
          errorMessages.push(`• ${message} (GRN details)`);
        } else if (field.startsWith('items')) {
          const match = field.match(/items\[(\d+)\]\.(.+)/);
          if (match) {
            const itemIndex = parseInt(match[1], 10) + 1;
            errorMessages.push(`• ${message} (item ${itemIndex})`);
          } else {
            errorMessages.push(`• ${message} (items)`);
          }
        } else {
          errorMessages.push(`• ${message}`);
        }
      });

      showAlert('Check the GRN details', errorMessages.join('\n') || 'Go back and fix the highlighted fields.');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if ((isCreateMode && isSubmitting) || (!isCreateMode && isSaving)) return;

    const isValid = await validateFormData();
    if (!isValid) return;

    if (!header.gr_images || header.gr_images.length === 0) {
      showAlert(
        'Add a photo of the GRN',
        `Attach a photo of the GRN book entry for GRN ${header.gr_no}.`
      );
      return;
    }

    // Show custom confirm dialog (dark mode compliant)
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = () => {
    setShowConfirmDialog(false);
    if (isCreateMode) {
      performCreate();
    } else {
      performUpdate();
    }
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
        triggerSuccess();
        resetFormState();
        const grNo = result.data.gr_no;
        setDocumentNumber(grNo);
        setSuccessDialogData({
          documentNo: grNo,
          customerName: header.customer_name || 'Unknown',
          date: formatReviewDate(header.date),
          itemCount: items.length,
        });
        setShowSuccessDialog(true);
      } else {
        triggerError();
        showAlert(SAVE_FAILED_TITLE, result.error || CONNECTION_HINT);
      }
    } catch (error) {
      triggerError();
      console.error('[GrnReviewStep] Submission error:', error);
      showAlert(SAVE_FAILED_TITLE, CONNECTION_HINT);
    } finally {
      setIsSubmitting(false);
    }
  };

  const performUpdate = async () => {
    if (!grnId) {
      showAlert(SAVE_FAILED_TITLE, 'Go back to the GRN list and open this GRN again.');
      return;
    }

    dispatch(setIsSaving(true));
    try {
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
      });

      if (result.success) {
        const resultData = result.data as { data?: { items_skipped_stock?: Array<{ item_name: string; reason: string }> }; items_skipped_stock?: Array<{ item_name: string; reason: string }> } | undefined;
        const skippedItems = resultData?.data?.items_skipped_stock || resultData?.items_skipped_stock;

        if (skippedItems && skippedItems.length > 0) {
          triggerWarning();
          const skippedText = skippedItems.map((item) => `• ${item.item_name}: ${item.reason}`).join('\n');
          setSnackbarMessage(`GRN saved. Some quantities were not changed because those items are already dispatched:\n${skippedText}`);
        } else {
          triggerSuccess();
          setSnackbarMessage(header.gr_no ? `GRN ${header.gr_no} saved.` : 'GRN saved.');
        }
        setSnackbarVisible(true);

        const grNo = header.gr_no || '';
        setDocumentNumber(grNo);
        setSuccessDialogData({
          documentNo: grNo,
          customerName: header.customer_name || 'Unknown',
          date: formatReviewDate(header.date),
          itemCount: items.length,
        });
        setShowSuccessDialog(true);
      } else {
        triggerError();
        const errorMessage = result.error || CONNECTION_HINT;
        if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
          showAlert(STOCK_PROTECTED_TITLE, STOCK_PROTECTED_MESSAGE);
        } else {
          showAlert(SAVE_FAILED_TITLE, errorMessage);
        }
      }
    } catch (error) {
      triggerError();
      console.error('[GrnReviewStep] Update error:', error);
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
        showAlert(STOCK_PROTECTED_TITLE, STOCK_PROTECTED_MESSAGE);
      } else {
        showAlert(SAVE_FAILED_TITLE, CONNECTION_HINT);
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
        setSnackbarMessage("Couldn't create the PDF. Try again.");
        setSnackbarVisible(true);
        return;
      }

      const shareResult = await downloadAndSharePDF(pdfResult.pdfUrl, `GRN_${documentNumber}.pdf`);
      if (!shareResult.success) {
        setSnackbarMessage("Couldn't share the PDF. Try again.");
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('[GrnReviewStep] Share PDF error:', error);
      setSnackbarMessage("Couldn't share the PDF. Try again.");
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

  const imageUploadGrnId = isCreateMode ? (grnId || tempGrnId) ?? undefined : grnId ?? undefined;
  const isSubmittingState = isCreateMode ? isSubmitting : isSaving;
  const ctaLabel = isCreateMode ? 'Create GRN' : 'Update GRN';

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
        {options?.count !== undefined ? ` (${numberFormat.format(options.count)})` : ''}
      </Text>
      {options?.onEdit ? (
        <Pressable
          onPress={options.onEdit}
          style={({ pressed }) => [styles.editLink, pressed && styles.editLinkPressed]}
          accessibilityRole="button"
          accessibilityLabel={options.editLabel ?? `Edit ${title.toLowerCase()}`}
          hitSlop={{ top: space.xs, bottom: space.xs }}
        >
          <Icon name="pencil-outline" size={iconSize.sm} color={t.brand.tint} />
          <Text style={styles.editLinkText}>Edit</Text>
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

  const renderItemCell = (item: (typeof items)[0], index: number, isLast: boolean, isProtected: boolean) => {
    const qty = item.qty || 0;
    const weight = item.weight || 0;
    const hasWeight = weight > 0;
    const rack = item.rack?.trim();
    const packageMark = item.package_mark?.trim();
    const imageCount = item.trl_images?.length || 0;
    const a11yParts = [
      `Item ${index + 1}`,
      item.item_name,
      item.packaging,
      `quantity ${numberFormat.format(qty)}`,
      hasWeight ? `${weightFormat.format(weight)} kilograms each` : undefined,
      rack ? `rack ${rack}` : undefined,
      packageMark ? `mark ${packageMark}` : undefined,
      imageCount > 0 ? `${imageCount} ${imageCount === 1 ? 'photo' : 'photos'}` : undefined,
      isProtected ? 'already dispatched, quantity locked' : undefined,
    ].filter(Boolean);

    return (
      <View
        key={item.grn_trl_id || `item-${index}`}
        style={[styles.objectCell, !isLast && styles.objectCellBorder]}
        accessible
        accessibilityLabel={a11yParts.join(', ')}
      >
        <View style={styles.objectCellAvatar}>
          <Text style={styles.objectCellAvatarText}>{index + 1}</Text>
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
            {hasWeight && (
              <View style={styles.objectCellChip}>
                <Icon name="weight-kilogram" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.objectCellChipText} maxFontSizeMultiplier={1.6}>
                  {weightFormat.format(weight)} kg
                </Text>
              </View>
            )}
            {rack ? (
              <View style={styles.objectCellChip}>
                <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.objectCellChipText} maxFontSizeMultiplier={1.6}>
                  Rack {rack}
                </Text>
              </View>
            ) : null}
            {packageMark ? (
              <View style={styles.objectCellChip}>
                <Icon name="label-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.objectCellChipText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
                  {packageMark}
                </Text>
              </View>
            ) : null}
            {imageCount > 0 && (
              <View style={styles.objectCellChip}>
                <Icon name="camera-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.objectCellChipText} maxFontSizeMultiplier={1.6}>
                  {imageCount} {imageCount === 1 ? 'photo' : 'photos'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.objectCellStatus}>
          <Text style={styles.qtyValue}>{numberFormat.format(qty)}</Text>
          <Text style={styles.qtyLabel}>Qty</Text>
          {isProtected && (
            <View style={styles.protectedTag}>
              <Icon name="lock-outline" size={iconSize.sm} color={t.status.critical.text} />
              <Text style={styles.protectedTagText} maxFontSizeMultiplier={1.6}>
                Dispatched
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderSummaryKPI = (icon: string, label: string, value: number) => (
    <View style={styles.summaryKPI} accessible accessibilityLabel={`${label}, ${numberFormat.format(value)}`}>
      <View style={styles.summaryKPIIcon}>
        <Icon name={icon} size={iconSize.md} color={t.brand.tint} />
      </View>
      <View style={styles.summaryKPIContent}>
        <Text style={styles.summaryKPILabel}>{label}</Text>
        <Text style={styles.summaryKPIValue}>{numberFormat.format(value)}</Text>
      </View>
    </View>
  );

  const grImages = header.gr_images ?? [];

  return (
    <View style={styles.container}>
      <GRNStepIndicator
        steps={GRN_STEPS}
        currentStep={STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
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
          {renderSectionHeader('GRN details', { onEdit: handleNavigateToHeader, editLabel: 'Edit GRN details' })}
          <View style={styles.card}>
            <View style={styles.cardBody}>
              {renderKeyValue('GRN number', header.gr_no || 'Not set', true)}
              {header.registration ? renderKeyValue('Vehicle registration', header.registration) : null}
              {renderKeyValue('Date', formatReviewDate(header.date))}
              {renderKeyValue('Customer', header.customer_name || 'Not selected')}
              {renderKeyValue('Sender', header.sender_name || 'Not selected')}
              {renderKeyValue('Supervisor', header.supervisor_name || 'Not selected')}
              {renderKeyValue('Pricing mode', header.pricing_mode === 'ONE_TIME' ? 'One time' : 'Monthly')}
              {header.leon
                ? renderKeyValue(
                    'Leon',
                    <View style={styles.statusTag}>
                      <Icon name="check-circle" size={iconSize.sm} color={t.status.positive.text} />
                      <Text style={styles.statusTagText} maxFontSizeMultiplier={1.6}>
                        On
                      </Text>
                    </View>
                  )
                : null}

              {header.note ? (
                <View style={styles.notesSection}>
                  <Text style={styles.notesLabel}>Notes</Text>
                  <Text style={styles.notesValue}>{header.note}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* GRN photos */}
          {renderSectionHeader('GRN photos', { count: grImages.length > 0 ? grImages.length : undefined })}
          <View style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.imagesSectionSubtitle}>
                Attach a photo of the GRN book entry. At least one photo is required.
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
                  onRemoveImage={(imageId: string) => {
                    dispatch(removeHeaderImage(imageId));
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
          {renderSectionHeader('Items', { count: items.length, onEdit: handlePrevious, editLabel: 'Edit items' })}
          <View style={styles.card}>
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="package-variant-closed" size={iconSize.hero} color={t.icon.secondary} />
                <Text style={styles.emptyStateTitle}>No items yet</Text>
                <Text style={styles.emptyStateSubtitle}>Go back to the Items step to add items to this GRN.</Text>
              </View>
            ) : (
              <View>
                {items.map((item, index) =>
                  renderItemCell(item, index, index === items.length - 1, !isCreateMode && item.qty !== item.stock)
                )}
              </View>
            )}
          </View>

          {/* Summary */}
          {renderSectionHeader('Summary')}
          <View style={styles.card}>
            <View style={styles.summaryGrid}>
              {renderSummaryKPI('format-list-numbered', 'Total items', totalItems)}
              {renderSummaryKPI('counter', 'Total quantity', totalQty)}
            </View>
          </View>
        </ScrollView>

        {/* Bottom action bar */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={handleSubmit}
            disabled={isSubmittingState}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: isSubmittingState, busy: isSubmittingState }}
          >
            {isSubmittingState ? (
              <>
                <ActivityIndicator size="small" color={t.brand.onFill} />
                <Text style={styles.primaryButtonText}>{isCreateMode ? 'Creating GRN…' : 'Saving GRN…'}</Text>
              </>
            ) : (
              <>
                <Icon
                  name={isCreateMode ? 'check-circle-outline' : 'content-save-outline'}
                  size={iconSize.lg}
                  color={t.brand.onFill}
                />
                <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmDialog}
        title={isCreateMode ? 'Create this GRN?' : 'Save changes to this GRN?'}
        message={`${isCreateMode ? 'Create' : 'Save'} ${header.gr_no ? `GRN ${header.gr_no}` : 'this GRN'} with ${numberFormat.format(totalItems)} ${totalItems === 1 ? 'item' : 'items'}?`}
        confirmText={isCreateMode ? 'Create GRN' : 'Save GRN'}
        cancelText="Cancel"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmDialog(false)}
        variant="default"
        icon={isCreateMode ? 'plus-circle' : 'pencil-outline'}
      />

      <DocumentSuccessDialog
        isVisible={showSuccessDialog}
        documentType="GRN"
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
          }
        }}
        onConfirm={async (start, end) => {
          const result = await printGRNRange(start, end);
          if (result.success) {
            setSnackbarMessage('Print job sent to the printer.');
          } else {
            setSnackbarMessage("Couldn't send the print job. Check the printer and try again.");
          }
          setSnackbarVisible(true);
          setShowPrintDialog(false);
          if (!isCreateMode) {
            resetFormState();
            router.replace('/grn');
          }
        }}
        title="Print GRN"
        defaultNumber={documentNumber || header.gr_no || ''}
        label="GRN number"
        placeholder="For example Z0797"
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
    letterSpacing: 0.5,
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

  statusTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    backgroundColor: t.status.positive.background,
  },
  statusTagText: { ...typography.caption1, fontWeight: fontWeight.semibold, color: t.status.positive.text },

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
  objectCellChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    backgroundColor: t.status.neutral.background,
  },
  objectCellChipText: {
    ...typography.caption1,
    color: t.status.neutral.text,
    fontVariant: ['tabular-nums' as const],
  },
  objectCellStatus: { alignItems: 'flex-end' as const, gap: space.xxs },
  qtyValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  qtyLabel: { ...typography.caption1, color: t.text.secondary },
  protectedTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    backgroundColor: t.status.critical.background,
  },
  protectedTagText: { ...typography.caption1, fontWeight: fontWeight.semibold, color: t.status.critical.text },

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

  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    minHeight: 48,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: { backgroundColor: t.brand.fillPressed },
  primaryButtonText: { ...typography.callout, fontWeight: fontWeight.semibold, color: t.brand.onFill },

  snackbar: { backgroundColor: t.surface.inverse, borderRadius: radius.button, ...t.shadow[3] },
  snackbarText: { ...typography.subhead, color: t.text.inverse },
});

export default GrnReviewStep;
