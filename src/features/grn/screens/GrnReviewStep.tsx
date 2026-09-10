import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';
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

// ============================================================================
// FIORI DESIGN TOKENS
// Based on SAP Fiori for iOS Design Guidelines
// ============================================================================
const FIORI = {
  // Colors
  colors: {
    // Backgrounds
    pageBackground: '#F7F9FA',
    cardBackground: '#FFFFFF',
    cardBackgroundPressed: '#F5F6F7',
    // Borders
    cardBorder: '#E5E5E5',
    divider: '#E5E5E5',
    // Text
    textPrimary: '#1D2D3E',
    textSecondary: '#556B82',
    textTertiary: '#7e8e9d',
    // Brand
    primary: '#f69000',
    primaryDark: '#dd8200',
    primaryLight: '#fff4e6',
    // Semantic
    success: '#53b1b1',
    successLight: '#e8f4f4',
    warning: '#f6c624',
    warningLight: '#fef3c7',
    negative: '#D32030',
    negativeLight: '#FFF4F2',
    // Status
    info: '#0057D2',
    infoLight: '#EBF8FF',
  },
  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  // Typography
  typography: {
    // Section Header
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    // Card Title
    cardTitle: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    // Body
    bodyRegular: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    bodyMedium: {
      fontSize: 15,
      fontWeight: '500' as const,
    },
    // Caption
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    // Button
    buttonPrimary: {
      fontSize: 17,
      fontWeight: '600' as const,
      letterSpacing: -0.41,
    },
  },
  // Dimensions
  dimensions: {
    cardRadius: 12,
    cardPadding: 16,
    buttonHeight: 44,
    buttonRadius: 8,
    sectionHeaderHeight: 32,
    objectCellMinHeight: 56,
    avatarSize: 40,
    iconSize: 20,
    touchTarget: 44,
  },
  // Shadows
  shadows: {
    card: {
      ...Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 3,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    footer: {
      ...Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
        },
        android: {
          elevation: 8,
        },
      }),
    },
  },
} as const;

type GrnReviewStepProps = {
  mode: 'create' | 'edit';
};

export function GrnReviewStep({ mode }: GrnReviewStepProps) {
  // Theme colors for dark mode support
  const colors = useListColors();

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
    Alert.alert(
      isCreateMode ? 'Discard Changes?' : 'Cancel GRN Edit',
      `You have ${items.length} item(s) ${isCreateMode ? 'ready to submit' : 'ready to update'}. Are you sure you want to leave?`,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Discard',
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
          errorMessages.push(`• ${message} (in GRN Details)`);
        } else if (field.startsWith('items')) {
          const match = field.match(/items\[(\d+)\]\.(.+)/);
          if (match) {
            const itemIndex = parseInt(match[1], 10) + 1;
            errorMessages.push(`• ${message} (in Item #${itemIndex})`);
          } else {
            errorMessages.push(`• ${message} (in Items section)`);
          }
        } else {
          errorMessages.push(`• ${message}`);
        }
      });

      Alert.alert('Validation Error', errorMessages.join('\n') || 'Please go back and fix validation errors');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if ((isCreateMode && isSubmitting) || (!isCreateMode && isSaving)) return;

    const isValid = await validateFormData();
    if (!isValid) return;

    if (!header.gr_images || header.gr_images.length === 0) {
      Alert.alert(
        'Image Required',
        `Please attach an image of the GRN book entry for GRN No ${header.gr_no}`
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
          date: new Date(header.date).toLocaleDateString(),
          itemCount: items.length,
        });
        setShowSuccessDialog(true);
      } else {
        triggerError();
        Alert.alert('Error', result.error || 'Failed to create GRN');
      }
    } catch (error) {
      triggerError();
      console.error('[GrnReviewStep] Submission error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performUpdate = async () => {
    if (!grnId) {
      Alert.alert('Error', 'No GRN ID found');
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
          setSnackbarMessage(`Some fields were not updated due to stock protection:\n${skippedText}`);
        } else {
          triggerSuccess();
          setSnackbarMessage('GRN updated successfully');
        }
        setSnackbarVisible(true);

        const grNo = header.gr_no || '';
        setDocumentNumber(grNo);
        setSuccessDialogData({
          documentNo: grNo,
          customerName: header.customer_name || 'Unknown',
          date: new Date(header.date).toLocaleDateString(),
          itemCount: items.length,
        });
        setShowSuccessDialog(true);
      } else {
        triggerError();
        const errorMessage = result.error || 'Failed to update GRN';
        if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
          Alert.alert('Stock Protection Error', 'Cannot modify quantity/stock for items that have been dispatched. You can still update other details.');
        } else {
          Alert.alert('Error', errorMessage);
        }
      }
    } catch (error) {
      triggerError();
      console.error('[GrnReviewStep] Update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      if (errorMessage.includes('Stock Protection') || errorMessage.includes('STOCK_PROTECTED') || errorMessage.includes('dispatches exist')) {
        Alert.alert('Stock Protection Error', 'Cannot modify quantity/stock for items that have been dispatched. You can still update other details.');
      } else {
        Alert.alert('Error', errorMessage);
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
        setSnackbarMessage(pdfResult.error || 'Failed to generate PDF');
        setSnackbarVisible(true);
        return;
      }

      const shareResult = await downloadAndSharePDF(pdfResult.pdfUrl, `GRN_${documentNumber}.pdf`);
      if (!shareResult.success) {
        setSnackbarMessage(shareResult.error || 'Failed to share PDF');
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('[GrnReviewStep] Share PDF error:', error);
      setSnackbarMessage('Failed to share PDF');
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
  // FIORI COMPONENTS
  // ============================================================================

  // Section Header Component - Fiori Spec Compliant
  const SectionHeader = ({ title, count, action }: {
    title: string;
    count?: number;
    action?: { icon: string; onPress: () => void };
  }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.gray50 }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.gray600 }]}>
        {title.toUpperCase()}{count !== undefined ? ` (${count})` : ''}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.sectionHeaderAction,
            pressed && { backgroundColor: colors.primaryLight },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${title.toLowerCase()}`}
        >
          <Icon name={action.icon} size={20} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );

  // Key-Value Row Component - Fiori Data Table Style
  const KeyValueRow = ({ label, value, isHighlighted }: {
    label: string;
    value: string | React.ReactNode;
    isHighlighted?: boolean;
  }) => (
    <View style={styles.keyValueRow}>
      <Text style={[styles.keyValueLabel, { color: colors.gray600 }]}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={[styles.keyValueValue, { color: colors.gray900 }, isHighlighted && { color: colors.primary }]}>
          {value}
        </Text>
      ) : value}
    </View>
  );

  // Status Badge Component - Fiori Style
  const StatusBadge = ({ label, variant }: {
    label: string;
    variant: 'success' | 'warning' | 'info' | 'negative';
  }) => {
    const variantStyles = {
      success: { bg: colors.successLight, text: colors.teal },
      warning: { bg: colors.warningLight, text: '#92661a' },
      info: { bg: colors.tealLight, text: colors.teal },
      negative: { bg: colors.errorLight, text: colors.error },
    };
    const style = variantStyles[variant];

    return (
      <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
        <Text style={[styles.statusBadgeText, { color: style.text }]}>{label}</Text>
      </View>
    );
  };

  // Object Cell Component - Fiori Style for Items
  const ItemObjectCell = ({
    index,
    item,
    isLast,
    isProtected,
  }: {
    index: number;
    item: typeof items[0];
    isLast: boolean;
    isProtected: boolean;
  }) => {
    const qty = item.qty || 0;
    const weight = item.weight || 0;
    const hasWeight = weight > 0;
    const rack = item.rack?.trim();
    const packageMark = item.package_mark?.trim();
    const imageCount = item.trl_images?.length || 0;

    return (
      <View style={[
        styles.objectCell,
        { backgroundColor: colors.cellBackground },
        !isLast && [styles.objectCellBorder, { borderBottomColor: colors.cellDivider }],
        isProtected && { backgroundColor: colors.warningLight },
      ]}>
        {/* Avatar / Index */}
        <View style={[styles.objectCellAvatar, { backgroundColor: colors.primary }, isProtected && { backgroundColor: colors.warning }]}>
          <Text style={[styles.objectCellAvatarText, { color: colors.cellBackground }]}>{index + 1}</Text>
        </View>

        {/* Content */}
        <View style={styles.objectCellContent}>
          {/* Headline */}
          <Text style={[styles.objectCellHeadline, { color: colors.gray900 }]} numberOfLines={1}>
            {item.item_name}
          </Text>

          {/* Subheadline - Packaging */}
          {item.packaging && (
            <Text style={[styles.objectCellSubheadline, { color: colors.gray600 }]} numberOfLines={1}>
              {item.packaging}
            </Text>
          )}

          {/* Footnote - Details */}
          <View style={styles.objectCellFootnote}>
            {hasWeight && (
              <View style={[styles.objectCellChip, { backgroundColor: colors.gray100 }]}>
                <Icon name="weight-kilogram" size={12} color={colors.gray500} />
                <Text style={[styles.objectCellChipText, { color: colors.gray600 }]}>{weight} kg</Text>
              </View>
            )}
            {rack && (
              <View style={[styles.objectCellChip, { backgroundColor: colors.gray100 }]}>
                <Icon name="view-grid" size={12} color={colors.gray500} />
                <Text style={[styles.objectCellChipText, { color: colors.gray600 }]}>{rack}</Text>
              </View>
            )}
            {packageMark && (
              <View style={[styles.objectCellChip, { backgroundColor: colors.gray100 }]}>
                <Icon name="label" size={12} color={colors.gray500} />
                <Text style={[styles.objectCellChipText, { color: colors.gray600 }]} numberOfLines={1}>{packageMark}</Text>
              </View>
            )}
            {imageCount > 0 && (
              <View style={[styles.objectCellChip, { backgroundColor: colors.successLight }]}>
                <Icon name="camera" size={12} color={colors.success} />
                <Text style={[styles.objectCellChipText, { color: colors.success }]}>
                  {imageCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Status / Quantity Badge */}
        <View style={styles.objectCellStatus}>
          <View style={[styles.qtyBadge, { backgroundColor: colors.successLight }, isProtected && { backgroundColor: colors.warningLight }]}>
            <Text style={[styles.qtyBadgeValue, isProtected && styles.qtyBadgeValueProtected]}>
              {qty}
            </Text>
            <Text style={[styles.qtyBadgeLabel, { color: colors.gray500 }]}>qty</Text>
            {isProtected && (
              <Icon name="lock" size={10} color={colors.warning} style={{ marginLeft: 2 }} />
            )}
          </View>
        </View>
      </View>
    );
  };

  // Summary KPI Component - Fiori Style
  const SummaryKPI = ({ icon, label, value, unit }: {
    icon: string;
    label: string;
    value: number | string;
    unit?: string;
  }) => (
    <View style={styles.summaryKPI}>
      <View style={[styles.summaryKPIIcon, { backgroundColor: colors.gray100 }]}>
        <Icon name={icon} size={18} color={colors.gray600} />
      </View>
      <View style={styles.summaryKPIContent}>
        <Text style={[styles.summaryKPILabel, { color: colors.gray600 }]}>{label}</Text>
        <Text style={[styles.summaryKPIValue, { color: colors.primary }]}>
          {value}{unit ? ` ${unit}` : ''}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      <GRNStepIndicator
        steps={GRN_STEPS}
        currentStep={STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
        cancelMessage={isCreateMode ? undefined : 'Are you sure you want to cancel editing? All unsaved changes will be lost.'}
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
          {/* ================================================================
              CARD 1: GRN HEADER INFORMATION
              Fiori Card with Data Table Body
          ================================================================ */}
          <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
            <SectionHeader title="GRN Details" />

            <View style={styles.cardBody}>
              <KeyValueRow
                label="GR Number"
                value={header.gr_no || '-'}
                isHighlighted
              />

              {header.registration && (
                <KeyValueRow
                  label="Registration"
                  value={header.registration}
                />
              )}

              <KeyValueRow
                label="Date"
                value={new Date(header.date).toLocaleDateString()}
              />

              <KeyValueRow
                label="Customer"
                value={header.customer_name || '-'}
              />

              <KeyValueRow
                label="Sender"
                value={header.sender_name || '-'}
              />

              <KeyValueRow
                label="Supervisor"
                value={header.supervisor_name || '-'}
              />

              <KeyValueRow
                label="Pricing Mode"
                value={header.pricing_mode === 'ONE_TIME' ? 'One Time' : 'Monthly'}
              />

              {header.leon && (
                <KeyValueRow
                  label="LEON"
                  value={<StatusBadge label="Enabled" variant="success" />}
                />
              )}

              {header.note && (
                <View style={[styles.notesSection, { borderTopColor: colors.cellDivider }]}>
                  <Text style={[styles.notesLabel, { color: colors.gray600 }]}>Notes</Text>
                  <Text style={[styles.notesValue, { color: colors.gray900 }]}>{header.note}</Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.cellDivider }]} />

            {/* Images Section */}
            <View style={styles.cardBody}>
              <View style={styles.imagesSectionHeader}>
                <View>
                  <Text style={[styles.imagesSectionTitle, { color: colors.gray900 }]}>
                    GRN Images {header.gr_images && header.gr_images.length > 0 ? `(${header.gr_images.length})` : ''}
                  </Text>
                  <Text style={[styles.imagesSectionSubtitle, { color: colors.gray500 }]}>
                    Attach photos of the goods receipt
                  </Text>
                </View>
              </View>

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

          {/* ================================================================
              CARD 2: ITEMS LIST
              Fiori List Card with Object Cells
          ================================================================ */}
          <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
            <SectionHeader title="Items" count={items.length} />

            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyStateIcon, { backgroundColor: colors.gray100 }]}>
                  <Icon name="package-variant-closed" size={32} color={colors.gray500} />
                </View>
                <Text style={[styles.emptyStateTitle, { color: colors.gray900 }]}>No Items Added</Text>
                <Text style={[styles.emptyStateSubtitle, { color: colors.gray600 }]}>
                  Go back to add items to this GRN
                </Text>
              </View>
            ) : (
              <View style={styles.objectCellList}>
                {items.map((item, index) => (
                  <ItemObjectCell
                    key={item.grn_trl_id || `item-${index}`}
                    index={index}
                    item={item}
                    isLast={index === items.length - 1}
                    isProtected={!isCreateMode && item.qty !== item.stock}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ================================================================
              CARD 3: SUMMARY
              Fiori KPI Card
          ================================================================ */}
          <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
            <SectionHeader title="Summary" />

            <View style={styles.summaryGrid}>
              <SummaryKPI
                icon="format-list-numbered"
                label="Total Items"
                value={totalItems}
              />
              <SummaryKPI
                icon="counter"
                label="Total Quantity"
                value={totalQty}
              />
            </View>
          </View>
        </ScrollView>

        {/* ================================================================
            FOOTER: PRIMARY ACTION BUTTON
            Fiori Full-Width Primary Button
        ================================================================ */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, FIORI.spacing.lg), backgroundColor: colors.cellBackground, borderTopColor: colors.cellDivider }]}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed && { backgroundColor: colors.primaryDark },
              isSubmittingState && styles.primaryButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmittingState}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: isSubmittingState }}
          >
            {isSubmittingState ? (
              <ActivityIndicator size="small" color={colors.cellBackground} />
            ) : (
              <>
                <Icon
                  name={isCreateMode ? 'check-circle' : 'content-save'}
                  size={22}
                  color={colors.cellBackground}
                  style={styles.primaryButtonIcon}
                />
                <Text style={[styles.primaryButtonText, { color: colors.cellBackground }]}>{ctaLabel}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmDialog}
        title={isCreateMode ? 'Confirm Create' : 'Confirm Update'}
        message={`Are you sure you want to ${isCreateMode ? 'create' : 'update'} this GRN with ${totalItems} item${totalItems !== 1 ? 's' : ''}?`}
        confirmText={isCreateMode ? 'Create' : 'Update'}
        cancelText="Cancel"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmDialog(false)}
        variant="default"
        icon={isCreateMode ? 'add-circle' : 'create'}
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
            setSnackbarMessage(`Print job submitted${result.print_job?.cups_job_id ? ` (Job #${result.print_job.cups_job_id})` : ''}`);
          } else {
            setSnackbarMessage(result.error || 'Failed to submit print job');
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
        label="GRN Number"
        placeholder="e.g., Z0797"
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: colors.gray900 }}
      >
        {snackbarMessage}
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
// STYLES - 100% FIORI COMPLIANT
// ============================================================================
const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: FIORI.spacing.lg,
    paddingBottom: FIORI.spacing.xl,
    gap: FIORI.spacing.lg,
  },

  // Card - Fiori Card Container
  card: {
    borderRadius: FIORI.dimensions.cardRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...FIORI.shadows.card,
  },
  cardBody: {
    padding: FIORI.dimensions.cardPadding,
  },
  cardDivider: {
    height: 1,
    marginHorizontal: FIORI.dimensions.cardPadding,
  },

  // Section Header - Fiori Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: FIORI.dimensions.cardPadding,
    paddingTop: FIORI.spacing.md,
    paddingBottom: FIORI.spacing.sm,
  },
  sectionHeaderText: {
    ...FIORI.typography.sectionTitle,
  },
  sectionHeaderAction: {
    width: FIORI.dimensions.touchTarget,
    height: FIORI.dimensions.touchTarget,
    borderRadius: FIORI.dimensions.touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Key-Value Row - Fiori Data Table
  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: FIORI.spacing.sm,
    minHeight: FIORI.dimensions.touchTarget,
  },
  keyValueLabel: {
    ...FIORI.typography.bodyRegular,
    flex: 1,
  },
  keyValueValue: {
    ...FIORI.typography.bodyMedium,
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '60%',
  },

  // Status Badge - Fiori Badge
  statusBadge: {
    paddingHorizontal: FIORI.spacing.sm,
    paddingVertical: FIORI.spacing.xs,
    borderRadius: 4,
  },
  statusBadgeText: {
    ...FIORI.typography.caption,
    fontWeight: '500',
  },

  // Notes Section
  notesSection: {
    marginTop: FIORI.spacing.sm,
    paddingTop: FIORI.spacing.sm,
    borderTopWidth: 1,
  },
  notesLabel: {
    ...FIORI.typography.caption,
    marginBottom: FIORI.spacing.xs,
  },
  notesValue: {
    ...FIORI.typography.bodyRegular,
  },

  // Images Section
  imagesSectionHeader: {
    marginBottom: FIORI.spacing.md,
  },
  imagesSectionTitle: {
    ...FIORI.typography.bodyMedium,
  },
  imagesSectionSubtitle: {
    ...FIORI.typography.caption,
    marginTop: 2,
  },

  // Object Cell - Fiori Object Cell
  objectCellList: {
    // No padding, cells go edge to edge
  },
  objectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI.dimensions.cardPadding,
    paddingVertical: FIORI.spacing.md,
    minHeight: FIORI.dimensions.objectCellMinHeight,
  },
  objectCellBorder: {
    borderBottomWidth: 1,
  },
  objectCellAvatar: {
    width: FIORI.dimensions.avatarSize,
    height: FIORI.dimensions.avatarSize,
    borderRadius: FIORI.dimensions.avatarSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: FIORI.spacing.md,
  },
  objectCellAvatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  objectCellContent: {
    flex: 1,
    marginRight: FIORI.spacing.sm,
  },
  objectCellHeadline: {
    ...FIORI.typography.bodyMedium,
  },
  objectCellSubheadline: {
    ...FIORI.typography.caption,
    marginTop: 1,
  },
  objectCellFootnote: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FIORI.spacing.sm,
    marginTop: FIORI.spacing.sm,
  },
  objectCellChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI.spacing.sm,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  objectCellChipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  objectCellStatus: {
    alignItems: 'flex-end',
  },
  qtyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI.spacing.sm,
    paddingVertical: FIORI.spacing.xs,
    borderRadius: 12,
    gap: 3,
  },
  qtyBadgeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  qtyBadgeValueProtected: {
    color: '#92661a',
  },
  qtyBadgeLabel: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Empty State - Fiori Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: FIORI.spacing.xxl * 2,
    paddingHorizontal: FIORI.dimensions.cardPadding,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: FIORI.spacing.lg,
  },
  emptyStateTitle: {
    ...FIORI.typography.cardTitle,
    marginBottom: FIORI.spacing.xs,
  },
  emptyStateSubtitle: {
    ...FIORI.typography.bodyRegular,
    textAlign: 'center',
  },

  // Summary Grid - Fiori KPI
  summaryGrid: {
    padding: FIORI.dimensions.cardPadding,
    gap: FIORI.spacing.md,
  },
  summaryKPI: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: FIORI.spacing.sm,
  },
  summaryKPIIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: FIORI.spacing.md,
  },
  summaryKPIContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryKPILabel: {
    ...FIORI.typography.bodyRegular,
  },
  summaryKPIValue: {
    fontSize: 18,
    fontWeight: '600',
  },

  // Footer - Fiori Footer with Primary Button
  footer: {
    paddingHorizontal: FIORI.spacing.lg,
    paddingTop: FIORI.spacing.md,
    borderTopWidth: 1,
    ...FIORI.shadows.footer,
  },

  // Primary Button - Fiori Primary Tint Button
  primaryButton: {
    height: FIORI.dimensions.buttonHeight,
    borderRadius: FIORI.dimensions.buttonRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: FIORI.spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.3,
  },
  primaryButtonIcon: {
    marginRight: FIORI.spacing.sm,
  },
  primaryButtonText: {
    ...FIORI.typography.buttonPrimary,
  },
});

export default GrnReviewStep;
