/**
 * Dispatch Review Step - Unified Create/Edit Component
 * Displays header summary, all saved items, and submission functionality
 * Uses mode prop to differentiate between create and edit flows
 *
 * Refactored to use useDispatchForm hook for form state management.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { triggerSuccess, triggerError } from '@/hooks/useHaptics';
import { Snackbar } from 'react-native-paper';
import { useListColors } from '@/hooks/useListColors';
import { DispatchStepIndicator } from '@/components/DispatchStepIndicator';
import SwipeableFormStep from '@/components/SwipeableFormStep';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printDispatchRange } from '@/services/print-service';
import { DocumentSuccessDialog, DocumentData } from '@/components/DocumentSuccessDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { generateDispatchPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import theme from '@/theme';
import { useDispatchForm } from '@/hooks/useDispatchForm';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
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
import { DISPATCH_STEPS, DISPATCH_STEP_NUMBERS, getDispatchCompletedSteps } from '@/constants/dispatchSteps';

type DispatchReviewStepProps = {
    mode: 'create' | 'edit';
};

export function DispatchReviewStep({ mode }: DispatchReviewStepProps) {
    // Theme colors for dark mode support
    const colors = useListColors();

    // #19 Fix: Only create color overrides, not full StyleSheet
    // This is a simple object (not StyleSheet.create) with only dynamic color values
    // Compose with array syntax: [styles.base, themedColors.override]
    const themedColors = useMemo(() => ({
        sectionTitle: { color: colors.textPrimary },
        compactSummaryCard: { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider },
        compactLabel: { color: colors.textSecondary },
        compactValue: { color: colors.textPrimary },
        notesRow: { borderTopColor: colors.cellDivider },
        notesText: { color: colors.textSecondary },
        summaryCard: { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider },
        summaryLabel: { color: colors.textSecondary },
        summaryValue: { color: colors.textPrimary },
        summaryDivider: { backgroundColor: colors.cellDivider },
        itemCard: { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider },
        itemName: { color: colors.textPrimary },
        itemDetails: { borderTopColor: colors.cellDivider, backgroundColor: colors.gray50 },
        detailLabel: { color: colors.textSecondary },
        detailValue: { color: colors.textPrimary },
        metaBadge: { backgroundColor: colors.gray100 },
        metaText: { color: colors.textSecondary },
        imagesCard: { backgroundColor: colors.gray50, borderColor: colors.cellDivider },
        imagesHint: { color: colors.textSecondary },
        subtotalIconContainer: { backgroundColor: colors.cellBackground },
        subtotalLabel: { color: colors.textSecondary },
        subtotalValue: { color: colors.textPrimary },
        totalIconContainer: { backgroundColor: colors.cellBackground },
        totalLabel: { color: colors.textSecondary },
        totalValue: { color: colors.textPrimary },
        hintContainer: { backgroundColor: colors.gray50, borderColor: colors.cellDivider },
        hintText: { color: colors.textSecondary },
        stickyButtonContainer: { backgroundColor: colors.cellBackground, borderTopColor: colors.cellDivider },
    }), [colors]);

    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id: string }>();

    // Use the consolidated dispatch form hook
    const {
        header,
        items,
        images,
        isSaving,
        dispatchId,
        isCreateMode,
        addImageToForm,
        updateImageUploadProgress: updateImageProgress,
        updateImageUploadStatus: updateImageStatus,
        removeImageFromForm,
        navigateToStep,
        submitForm,
        resetFormState,
    } = useDispatchForm({
        mode,
        dispatchIdParam: id,
    });

    // Generate temp dispatch ID for image uploads (create mode only)
    const [tempDispatchId] = useState(() => generateTempDispatchId());

    // Track expanded items
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    // Fresh stock values for edit mode
    const [freshStockValues, setFreshStockValues] = useState<Record<string, number>>({});
    const [loadingStock, setLoadingStock] = useState(false);

    // Print dialog state (create mode)
    const [showPrintDialog, setShowPrintDialog] = useState(false);
    const [createdDispatchNumber, setCreatedDispatchNumber] = useState('');
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    // Success dialog state (create mode)
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [successDialogData, setSuccessDialogData] = useState<DocumentData | null>(null);
    const [isShareLoading, setIsShareLoading] = useState(false);

    // Local submitting state - prevents duplicate submissions
    // This is set immediately when user confirms dialog, before any async work
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Image overlay state
    const [showImageOverlay, setShowImageOverlay] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

    // Confirm dialog state
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [showDiscardDialog, setShowDiscardDialog] = useState(false);
    const [showEditSuccessDialog, setShowEditSuccessDialog] = useState(false);

    // Debug logging
    useEffect(() => {
        console.log('[DispatchReviewStep] Header data on mount:', JSON.stringify(header, null, 2));
        console.log('[DispatchReviewStep] Items count:', items.length);
        if (isCreateMode) {
            console.log('[DispatchReviewStep] Images count:', images.length);
        }
    }, []);

    // Load fresh stock values (edit mode only)
    useEffect(() => {
        if (!isCreateMode && items.length > 0) {
            loadFreshStockValues();
        }
    }, [isCreateMode, items.length]);

    const loadFreshStockValues = async () => {
        setLoadingStock(true);
        const stockMap: Record<string, number> = {};

        try {
            for (const item of items) {
                try {
                    const result = await getGRNDetailByNumber(item.grns_gr_no);
                    if (result.success && result.data?.items) {
                        const lot = result.data.items.find(
                            (l: { id: string; stock: number }) => l.id === item.grnItems_id
                        );
                        if (lot) {
                            stockMap[item.unique_id] = lot.stock;
                        }
                    }
                } catch (error) {
                    console.error('[DispatchReviewStep] Error fetching stock:', error);
                }
            }
            setFreshStockValues(stockMap);
        } finally {
            setLoadingStock(false);
        }
    };

    // Handle cancel
    const handleCancel = () => {
        if (isCreateMode) {
            setShowDiscardDialog(true);
        } else {
            resetFormState();
            router.back();
        }
    };

    const handleDiscardConfirm = () => {
        setShowDiscardDialog(false);
        resetFormState();
        router.replace('/dispatch');
    };

    // Handle back navigation
    const handleBack = async () => {
        await navigateToStep(2);
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

    const handleImageUploadError = (imageId: string, error: string) => {
        console.error('[DispatchReviewStep] Image upload error:', imageId, error);
        updateImageStatus(imageId, 'failed');
    };

    const handleRemoveImage = async (imageId: string) => {
        const imageToRemove = images.find((img) => img.id === imageId);
        if (imageToRemove?.upload_status === 'completed' && imageToRemove.storage_path) {
            try {
                await deleteDispatchImage(imageId, imageToRemove.image_url);
            } catch (error) {
                console.error('[DispatchReviewStep] Failed to delete image:', error);
            }
        }
        removeImageFromForm(imageId);
    };

    const dispatchUploadFunction: CustomUploadFunction = async (asset, entityId, onProgress) => {
        return uploadDispatchImage(asset, entityId, onProgress);
    };

    // Toggle item expansion
    const toggleItemExpansion = (unique_id: string) => {
        setExpandedItems((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(unique_id)) {
                newSet.delete(unique_id);
            } else {
                newSet.add(unique_id);
            }
            return newSet;
        });
    };

    // Calculate totals
    const totals = useMemo(() => {
        const itemWiseTotals: Record<string, { quantity: number; weight: number }> = {};
        let grandTotalQuantity = 0;
        let grandTotalWeight = 0;
        const uniqueGRNs = new Set(items.map((item) => item.grns_gr_no)).size;

        items.forEach((item: DispatchItemData) => {
            const itemKey = item.grnItems_item_name;
            if (!itemWiseTotals[itemKey]) {
                itemWiseTotals[itemKey] = { quantity: 0, weight: 0 };
            }
            const qty = item.disp_quantity;
            const weight = item.grnItems_weight * qty;
            itemWiseTotals[itemKey].quantity += qty;
            itemWiseTotals[itemKey].weight += weight;
            grandTotalQuantity += qty;
            grandTotalWeight += weight;
        });

        return { itemWiseTotals, grandTotalQuantity, grandTotalWeight, uniqueGRNs };
    }, [items]);

    // Format date
    const formatDisplayDate = (isoDate: string) => {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear().toString().slice(-2);
        return `${day}/${month}/${year}`;
    };

    // Handle form submission
    const handleSubmit = async () => {
        // Show custom confirm dialog (dark mode compliant)
        setShowConfirmDialog(true);
    };

    const handleConfirmSubmit = () => {
        setShowConfirmDialog(false);
        // Set submitting immediately to prevent duplicate taps
        setIsSubmitting(true);
        performSubmit();
    };

    const performSubmit = async () => {
        const result = await submitForm();

        if (!result.success) {
            triggerError();
            // Re-enable button on error so user can retry
            setIsSubmitting(false);
            // Error already shown by submitForm via Alert
            return;
        }

        triggerSuccess();
        if (isCreateMode) {
            setCreatedDispatchNumber(header.disp_no);
            setSuccessDialogData({
                documentNo: header.disp_no,
                customerName: header.customer_name || 'Unknown',
                date: formatDisplayDate(header.disp_date),
                itemCount: items.length,
            });
            setShowSuccessDialog(true);

            // Show snackbar if order was cleared
            if (result.sourceOrderCleared) {
                setSnackbarMessage('Order fulfilled and removed from queue');
                setSnackbarVisible(true);
            }
        } else {
            setShowEditSuccessDialog(true);
        }
    };

    const handleEditSuccessConfirm = () => {
        setShowEditSuccessDialog(false);
        resetFormState();
        router.replace(`/dispatch-details/${dispatchId}`);
    };

    // Handle Share PDF (create mode)
    const handleSharePDF = async () => {
        if (!createdDispatchNumber) return;

        setIsShareLoading(true);
        try {
            const pdfResult = await generateDispatchPDF(createdDispatchNumber);
            if (!pdfResult.success || !pdfResult.pdfUrl) {
                setSnackbarMessage(pdfResult.error || 'Failed to generate PDF');
                setSnackbarVisible(true);
                return;
            }

            const shareResult = await downloadAndSharePDF(
                pdfResult.pdfUrl,
                `Dispatch_${createdDispatchNumber}.pdf`
            );
            if (!shareResult.success) {
                setSnackbarMessage(shareResult.error || 'Failed to share PDF');
                setSnackbarVisible(true);
            }
        } catch (error) {
            setSnackbarMessage('Failed to share PDF');
            setSnackbarVisible(true);
        } finally {
            setIsShareLoading(false);
        }
    };

    // Success dialog handlers (create mode)
    const handleCreateAnother = () => {
        setShowSuccessDialog(false);
        resetFormState();
        router.replace('/dispatch-form/step1');
    };

    const handleViewList = () => {
        setShowSuccessDialog(false);
        resetFormState();
        router.replace('/dispatch');
    };

    const handlePrint = () => {
        setShowSuccessDialog(false);
        setShowPrintDialog(true);
    };

    // Render hero metrics (key totals at top for quick scanning)
    const renderHeroMetrics = () => (
        <View style={[styles.heroSection, { backgroundColor: colors.gray50 }]}>
            {/* Customer banner */}
            <View style={[styles.customerBanner, { backgroundColor: colors.primary }]}>
                <Icon name="account-arrow-right" size={20} color={colors.cellBackground} />
                <View style={styles.customerBannerTextContainer}>
                    <Text style={[styles.customerBannerText, { color: colors.cellBackground }]} numberOfLines={1}>
                        To: {header.customer_name || 'No Customer'}
                    </Text>
                    {(header.customer_address || header.customer_city) && (
                        <Text style={[styles.customerBannerAddress, { color: colors.cellBackground }]} numberOfLines={1}>
                            {header.customer_address || header.customer_city}
                            {header.customer_address && header.customer_city && header.customer_address !== header.customer_city && `, ${header.customer_city}`}
                        </Text>
                    )}
                    {header.customer_mobile && (
                        <View style={styles.customerBannerMobileRow}>
                            <Icon name="phone" size={12} color={colors.cellBackground} />
                            <Text style={[styles.customerBannerAddress, { color: colors.cellBackground }]} numberOfLines={1}>
                                +91 {header.customer_mobile}
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Key metrics grid */}
            <View style={styles.metricsGrid}>
                <View style={[styles.metricCard, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
                    <View style={[styles.metricIconContainer, { backgroundColor: colors.tealLight }]}>
                        <Icon name="package-variant" size={22} color={colors.teal} />
                    </View>
                    <View style={styles.metricContent}>
                        <Text style={[styles.metricValue, { color: colors.gray900 }]}>{items.length}</Text>
                        <Text style={[styles.metricLabel, { color: colors.gray500 }]}>{items.length === 1 ? 'Item' : 'Items'}</Text>
                    </View>
                </View>

                <View style={[styles.metricCard, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
                    <View style={[styles.metricIconContainer, { backgroundColor: colors.successLight }]}>
                        <Icon name="counter" size={22} color={colors.success} />
                    </View>
                    <View style={styles.metricContent}>
                        <Text style={[styles.metricValue, { color: colors.gray900 }]}>{totals.grandTotalQuantity}</Text>
                        <Text style={[styles.metricLabel, { color: colors.gray500 }]}>Total Qty</Text>
                    </View>
                </View>
            </View>
        </View>
    );

    // Render header summary (compact version - customer shown in hero)
    const renderHeaderSummary = () => (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <Icon name="clipboard-text-outline" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, themedColors.sectionTitle]}>Dispatch Details</Text>
            </View>

            <View style={[styles.compactSummaryCard, themedColors.compactSummaryCard]}>
                {/* Row 1: Dispatch No + Date */}
                <View style={styles.compactRow}>
                    <View style={styles.compactItem}>
                        <Icon name="file-document" size={16} color={colors.gray500} />
                        <View style={styles.compactItemContent}>
                            <Text style={[styles.compactLabel, themedColors.compactLabel]}>Dispatch #</Text>
                            <Text style={[styles.compactValue, themedColors.compactValue]}>{header.disp_no}</Text>
                        </View>
                    </View>
                    <View style={styles.compactItem}>
                        <Icon name="calendar" size={16} color={colors.gray500} />
                        <View style={styles.compactItemContent}>
                            <Text style={[styles.compactLabel, themedColors.compactLabel]}>Date</Text>
                            <Text style={[styles.compactValue, themedColors.compactValue]}>{formatDisplayDate(header.disp_date)}</Text>
                        </View>
                    </View>
                </View>

                {/* Row 2: Vehicle + Supervisor */}
                <View style={styles.compactRow}>
                    <View style={styles.compactItem}>
                        <Icon name="truck" size={16} color={colors.gray500} />
                        <View style={styles.compactItemContent}>
                            <Text style={[styles.compactLabel, themedColors.compactLabel]}>Vehicle</Text>
                            <Text style={[styles.compactValue, themedColors.compactValue]} numberOfLines={1}>{header.registration || '-'}</Text>
                        </View>
                    </View>
                    <View style={styles.compactItem}>
                        <Icon name="account" size={16} color={colors.gray500} />
                        <View style={styles.compactItemContent}>
                            <Text style={[styles.compactLabel, themedColors.compactLabel]}>Supervisor</Text>
                            <Text style={[styles.compactValue, themedColors.compactValue]} numberOfLines={1}>{header.supervisor_name || '-'}</Text>
                        </View>
                    </View>
                </View>

                {/* Row 3: Weight (full width) */}
                <View style={styles.compactRow}>
                    <View style={[styles.compactItem, { flex: 1 }]}>
                        <Icon name="weight" size={16} color={colors.gray500} />
                        <View style={styles.compactItemContent}>
                            <Text style={[styles.compactLabel, themedColors.compactLabel]}>Total Weight</Text>
                            <Text style={[styles.compactValue, themedColors.compactValue]}>{Math.round(totals.grandTotalWeight)} kg</Text>
                        </View>
                    </View>
                </View>

                {/* Notes (if any) */}
                {header.note && (
                    <View style={[styles.notesRow, themedColors.notesRow]}>
                        <Icon name="note-text" size={16} color={colors.gray500} />
                        <Text style={[styles.notesText, themedColors.notesText]} numberOfLines={2}>{header.note}</Text>
                    </View>
                )}
            </View>
        </View>
    );

    // Render single item
    const renderItem = (item: DispatchItemData, index: number) => {
        const isExpanded = expandedItems.has(item.unique_id);
        const itemTotalWeight = item.grnItems_weight * item.disp_quantity;
        const stockValue = isCreateMode
            ? item.grnItems_stock
            : freshStockValues[item.unique_id] ?? item.grnItems_stock;

        return (
            <View key={item.unique_id} style={[styles.itemCard, themedColors.itemCard]}>
                <TouchableOpacity
                    style={styles.itemHeader}
                    onPress={() => toggleItemExpansion(item.unique_id)}
                    activeOpacity={0.7}
                >
                    <View style={styles.itemNumberBadge}>
                        <Text style={styles.itemNumber}>{index + 1}</Text>
                    </View>

                    <View style={styles.itemMainInfo}>
                        <View style={styles.itemTitleRow}>
                            <View style={styles.itemNameSection}>
                                <Text style={[styles.itemName, themedColors.itemName]} numberOfLines={1}>
                                    {item.grnItems_item_name}
                                </Text>
                                {item.grnItems_package_mark && (
                                    <View style={styles.packageMarkBadge}>
                                        <Icon name="label" size={12} color={theme.colors.orange[600]} />
                                        <Text style={styles.packageMarkText}>{item.grnItems_package_mark}</Text>
                                    </View>
                                )}
                            </View>
                            <Icon
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={24}
                                color={theme.colors.gray[400]}
                            />
                        </View>
                        <View style={styles.itemMetaRow}>
                            <View style={[styles.metaBadge, themedColors.metaBadge]}>
                                <Icon name="clipboard-text" size={12} color={theme.colors.blue[600]} />
                                <Text style={[styles.metaText, themedColors.metaText]}>
                                    {item.grns_gr_no}/{item.grnItems_quantity}
                                </Text>
                            </View>
                            <View style={[styles.metaBadge, themedColors.metaBadge]}>
                                <Icon name="package" size={12} color={theme.colors.green[600]} />
                                <Text style={[styles.metaText, themedColors.metaText]}>{item.disp_quantity} qty</Text>
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>

                {isExpanded && (
                    <View style={[styles.itemDetails, themedColors.itemDetails]}>
                        <View style={styles.detailRow}>
                            <Icon name="calendar" size={16} color={theme.colors.gray[500]} />
                            <Text style={[styles.detailLabel, themedColors.detailLabel]}>GRN Date:</Text>
                            <Text style={[styles.detailValue, themedColors.detailValue]}>{formatDisplayDate(item.grns_date)}</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="account" size={16} color={theme.colors.gray[500]} />
                            <Text style={[styles.detailLabel, themedColors.detailLabel]}>Customer:</Text>
                            <Text style={[styles.detailValue, themedColors.detailValue]}>{item.grns_customer_name}</Text>
                        </View>

                        {item.grnItems_package_mark && (
                            <View style={styles.detailRow}>
                                <Icon name="label" size={16} color={theme.colors.gray[500]} />
                                <Text style={[styles.detailLabel, themedColors.detailLabel]}>Package Mark:</Text>
                                <Text style={[styles.detailValue, themedColors.detailValue]}>{item.grnItems_package_mark}</Text>
                            </View>
                        )}

                        {item.grnItems_rack && (
                            <View style={styles.detailRow}>
                                <Icon name="warehouse" size={16} color={theme.colors.gray[500]} />
                                <Text style={[styles.detailLabel, themedColors.detailLabel]}>Rack:</Text>
                                <Text style={[styles.detailValue, themedColors.detailValue]}>{item.grnItems_rack}</Text>
                            </View>
                        )}

                        <View style={styles.detailRow}>
                            <Icon name="scale" size={16} color={theme.colors.gray[500]} />
                            <Text style={[styles.detailLabel, themedColors.detailLabel]}>Unit Weight:</Text>
                            <Text style={[styles.detailValue, themedColors.detailValue]}>{item.grnItems_weight} kg</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="weight" size={16} color={theme.colors.gray[500]} />
                            <Text style={[styles.detailLabel, themedColors.detailLabel]}>Total Weight:</Text>
                            <Text style={[styles.detailValue, themedColors.detailValue]}>{Math.round(itemTotalWeight)} kg</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="package-variant" size={16} color={theme.colors.gray[500]} />
                            <Text style={[styles.detailLabel, themedColors.detailLabel]}>Original GRN Qty:</Text>
                            <Text style={[styles.detailValue, themedColors.detailValue]}>{item.grnItems_quantity}</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="database" size={16} color={theme.colors.gray[500]} />
                            <Text style={[styles.detailLabel, themedColors.detailLabel]}>In Stock:</Text>
                            <Text style={[styles.detailValue, themedColors.detailValue, !isCreateMode && loadingStock && styles.detailValueLoading]}>
                                {!isCreateMode && loadingStock ? '-' : stockValue}
                            </Text>
                        </View>

                        {isCreateMode && (
                            <View style={styles.detailRow}>
                                <Icon name="database-check" size={16} color={theme.colors.semantic.success} />
                                <Text style={[styles.detailLabel, themedColors.detailLabel]}>Stock After Dispatch:</Text>
                                <Text style={[styles.detailValue, { color: theme.colors.semantic.success, fontWeight: '700' }]}>
                                    {item.grnItems_stock - item.disp_quantity}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

    // Render items section
    const renderItemsSection = () => (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <Icon name="package-variant" size={20} color={theme.colors.primary} />
                <Text style={[styles.sectionTitle, themedColors.sectionTitle]}>Items ({items.length})</Text>
            </View>

            <View style={styles.itemsContainer}>
                {items.map((item: DispatchItemData, index: number) => renderItem(item, index))}
            </View>
        </View>
    );

    // Render images section (create mode only)
    const renderImagesSection = () => {
        if (!isCreateMode) return null;

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

        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Icon name="camera" size={20} color={theme.colors.primary} />
                    <Text style={[styles.sectionTitle, themedColors.sectionTitle]}>Photos (Optional)</Text>
                </View>

                <View style={[styles.imagesCard, themedColors.imagesCard]}>
                    {images.length > 0 && (
                        <ImagePreviewGrid
                            imageData={imageDataForGrid}
                            onRemoveImage={handleRemoveImage}
                            onImagePress={(imageData) => {
                                const index = images.findIndex(img => img.id === imageData.id);
                                setSelectedImageIndex(index >= 0 ? index : 0);
                                setShowImageOverlay(true);
                            }}
                            editable={true}
                            maxImages={10}
                            columns={4}
                        />
                    )}

                    <ImageUploadButton
                        onImageUploadStart={handleImageUploadStart}
                        onImageUploadProgress={handleImageUploadProgress}
                        onImageUploadComplete={handleImageUploadComplete}
                        onImageUploadError={handleImageUploadError}
                        grnId={tempDispatchId}
                        imageType="header"
                        currentImages={images.map((img) => img.image_url)}
                        maxImages={10}
                        buttonText={images.length > 0 ? 'Add More Photos' : 'Add Photos'}
                        customUploadFunction={dispatchUploadFunction}
                    />

                    {images.length === 0 && (
                        <Text style={[styles.imagesHint, themedColors.imagesHint]}>
                            Optionally add photos of the dispatch items or vehicle
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    // Render totals section
    const renderTotalsSection = () => (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <Icon name="calculator" size={20} color={theme.colors.primary} />
                <Text style={[styles.sectionTitle, themedColors.sectionTitle]}>Summary</Text>
            </View>

            <View style={styles.totalsCard}>
                {isCreateMode &&
                    Object.entries(totals.itemWiseTotals).map(([itemName, itemTotals]) => (
                        <View key={itemName} style={styles.subtotalRow}>
                            <View style={[styles.subtotalIconContainer, themedColors.subtotalIconContainer]}>
                                <Icon name="package" size={16} color={theme.colors.blue[500]} />
                            </View>
                            <Text style={[styles.subtotalLabel, themedColors.subtotalLabel]}>{itemName}</Text>
                            <Text style={[styles.subtotalValue, themedColors.subtotalValue]}>{itemTotals.quantity} qty</Text>
                        </View>
                    ))}

                {isCreateMode && <View style={styles.totalsDivider} />}

                <View style={styles.totalRow}>
                    <View style={[styles.totalIconContainer, themedColors.totalIconContainer]}>
                        <Icon name="package" size={20} color={theme.colors.blue[600]} />
                    </View>
                    <Text style={[styles.totalLabel, themedColors.totalLabel]}>Total Quantity</Text>
                    <Text style={[styles.totalValue, themedColors.totalValue]}>{totals.grandTotalQuantity}</Text>
                </View>

                <View style={styles.totalRow}>
                    <View style={[styles.totalIconContainer, themedColors.totalIconContainer]}>
                        <Icon name="weight" size={20} color={theme.colors.green[600]} />
                    </View>
                    <Text style={[styles.totalLabel, themedColors.totalLabel]}>Total Weight</Text>
                    <Text style={[styles.totalValue, themedColors.totalValue]}>{Math.round(totals.grandTotalWeight)} kg</Text>
                </View>

                {!isCreateMode && (
                    <View style={styles.totalRow}>
                        <View style={[styles.totalIconContainer, themedColors.totalIconContainer]}>
                            <Icon name="clipboard-text" size={20} color={theme.colors.purple[600]} />
                        </View>
                        <Text style={[styles.totalLabel, themedColors.totalLabel]}>Unique GRNs</Text>
                        <Text style={[styles.totalValue, themedColors.totalValue]}>{totals.uniqueGRNs}</Text>
                    </View>
                )}
            </View>
        </View>
    );

    // Handle step indicator press for navigation
    const handleStepIndicatorPress = async (stepNumber: number) => {
        if (stepNumber === DISPATCH_STEP_NUMBERS.REVIEW) return; // Already on this step
        await navigateToStep(stepNumber);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
            <DispatchStepIndicator
                steps={DISPATCH_STEPS}
                currentStep={DISPATCH_STEP_NUMBERS.REVIEW}
                completedSteps={getDispatchCompletedSteps(DISPATCH_STEP_NUMBERS.REVIEW)}
                onCancel={handleCancel}
                cancelMessage={
                    isCreateMode
                        ? 'Are you sure you want to cancel? All entered data will be lost.'
                        : 'Are you sure you want to cancel editing? All unsaved changes will be lost.'
                }
                dispNo={header.disp_no}
                onStepPress={handleStepIndicatorPress}
                isEditMode={!isCreateMode}
            />

            <SwipeableFormStep
                onSwipeRight={() => navigateToStep(2)}
                canSwipeLeft={false}
                canSwipeRight={true}
            >
                <View style={styles.contentWrapper}>
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={[
                            styles.scrollContent,
                            // Add bottom safe area padding for edit mode (inline button)
                            !isCreateMode && { paddingBottom: Math.max(insets.bottom + 16, 24) }
                        ]}
                    >
                        {renderHeroMetrics()}
                        {renderHeaderSummary()}
                        {renderItemsSection()}
                        {renderImagesSection()}

                        {/* Hint for edit mode */}
                        {!isCreateMode && (
                            <View style={[styles.hintContainer, themedColors.hintContainer]}>
                                <Icon name="information" size={16} color={theme.colors.blue[600]} />
                                <Text style={[styles.hintText, themedColors.hintText]}>
                                    Review all information carefully before submitting. This action will update stock levels.
                                </Text>
                            </View>
                        )}

                        {/* Inline submit button for edit mode */}
                        {!isCreateMode && (
                            <TouchableOpacity
                                style={[styles.submitButton, (isSaving || isSubmitting) && styles.submitButtonDisabled]}
                                onPress={handleSubmit}
                                disabled={isSaving || isSubmitting}
                                activeOpacity={0.8}
                            >
                                {(isSaving || isSubmitting) ? (
                                    <>
                                        <ActivityIndicator size="small" color={theme.colors.white} />
                                        <Text style={styles.submitButtonText}>Updating...</Text>
                                    </>
                                ) : (
                                    <>
                                        <Icon name="check" size={20} color={theme.colors.white} />
                                        <Text style={styles.submitButtonText}>Update Dispatch</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </ScrollView>

                    {/* Sticky submit button for create mode */}
                    {isCreateMode && (
                        <View style={[styles.stickyButtonContainer, themedColors.stickyButtonContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                            <TouchableOpacity
                                style={[styles.submitButton, (isSaving || isSubmitting) && styles.submitButtonDisabled]}
                                onPress={handleSubmit}
                                disabled={isSaving || isSubmitting}
                                activeOpacity={0.8}
                            >
                                {(isSaving || isSubmitting) ? (
                                    <>
                                        <ActivityIndicator size="small" color={theme.colors.white} />
                                        <Text style={styles.submitButtonText}>Submitting...</Text>
                                    </>
                                ) : (
                                    <>
                                        <Icon name="check-circle" size={22} color={theme.colors.white} />
                                        <Text style={styles.submitButtonText}>Submit Dispatch</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </SwipeableFormStep>

            {/* Confirm Submit Dialog */}
            <ConfirmDialog
                visible={showConfirmDialog}
                title={isCreateMode ? 'Confirm Submission' : 'Confirm Update'}
                message={`You are about to ${isCreateMode ? 'create' : 'update'} dispatch ${header.disp_no} with ${items.length} item${items.length !== 1 ? 's' : ''}.\n\nThis will update stock levels. Continue?`}
                confirmText={isCreateMode ? 'Submit' : 'Update'}
                cancelText="Cancel"
                onConfirm={handleConfirmSubmit}
                onCancel={() => setShowConfirmDialog(false)}
                variant="default"
                icon={isCreateMode ? 'checkmark-circle' : 'create'}
            />

            {/* Success Dialog (create mode) */}
            {isCreateMode && (
                <DocumentSuccessDialog
                    isVisible={showSuccessDialog}
                    documentType="Dispatch"
                    documentData={successDialogData}
                    onCreateAnother={handleCreateAnother}
                    onViewList={handleViewList}
                    onPrint={handlePrint}
                    onSharePDF={handleSharePDF}
                    isShareLoading={isShareLoading}
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
                    }}
                    onConfirm={async (start, end) => {
                        const result = await printDispatchRange(start, end);
                        if (result.success) {
                            setSnackbarMessage(
                                `Print job submitted${result.print_job?.cups_job_id ? ` (Job #${result.print_job.cups_job_id})` : ''}`
                            );
                        } else {
                            setSnackbarMessage(result.error || 'Failed to submit print job');
                        }
                        setSnackbarVisible(true);
                        setShowPrintDialog(false);
                        resetFormState();
                        router.replace('/dispatch');
                    }}
                    title="Print Dispatch"
                    defaultNumber={createdDispatchNumber}
                    label="Dispatch Number"
                    placeholder="e.g., D001"
                />
            )}

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={3000}
                style={{ backgroundColor: colors.gray900 }}
            >
                {snackbarMessage}
            </Snackbar>

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

            {/* Discard Changes Dialog (create mode) */}
            <ConfirmDialog
                visible={showDiscardDialog}
                title="Discard Changes?"
                message={`You have ${items.length} item(s) ready to submit. Are you sure you want to leave?`}
                confirmText="Discard"
                cancelText="Stay"
                onConfirm={handleDiscardConfirm}
                onCancel={() => setShowDiscardDialog(false)}
                variant="danger"
                icon="trash-outline"
            />

            {/* Edit Success Dialog (edit mode) */}
            <ConfirmDialog
                visible={showEditSuccessDialog}
                title="Success"
                message={`Dispatch ${header.disp_no} updated successfully!`}
                confirmText="OK"
                cancelText=""
                onConfirm={handleEditSuccessConfirm}
                onCancel={handleEditSuccessConfirm}
                variant="default"
                icon="checkmark-circle"
            />
        </View>
    );
}

const styles = StyleSheet.create({
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
        paddingHorizontal: 20,
        paddingTop: 0,
        paddingBottom: 16,
    },
    // Hero section styles
    heroSection: {
        marginHorizontal: -20,
        marginBottom: 20,
    },
    customerBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 10,
    },
    customerBannerTextContainer: {
        flex: 1,
    },
    customerBannerText: {
        fontSize: 16,
        fontWeight: '600',
    },
    customerBannerAddress: {
        fontSize: 13,
        fontWeight: '400',
        opacity: 0.9,
        marginTop: 2,
    },
    customerBannerMobileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    metricsGrid: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 12,
    },
    metricCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        padding: 12,
        gap: 10,
        borderWidth: 1,
    },
    metricIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    metricContent: {
        flex: 1,
    },
    metricValue: {
        fontSize: 20,
        fontWeight: '700',
    },
    metricLabel: {
        fontSize: 11,
        fontWeight: '500',
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.gray[900],
    },
    // Compact summary card styles
    compactSummaryCard: {
        backgroundColor: theme.colors.white,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.gray[200],
        gap: 12,
    },
    compactRow: {
        flexDirection: 'row',
        gap: 12,
    },
    compactItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    compactItemContent: {
        flex: 1,
    },
    compactLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: theme.colors.gray[500],
        marginBottom: 2,
    },
    compactValue: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.gray[900],
    },
    notesRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.gray[100],
    },
    notesText: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.gray[600],
        fontStyle: 'italic',
    },
    // Legacy summary styles (kept for compatibility)
    summaryCard: {
        backgroundColor: theme.colors.white,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.gray[200],
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    summaryLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.gray[600],
        flex: 1,
    },
    summaryValue: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.gray[900],
        flex: 1,
        textAlign: 'right',
    },
    summaryDivider: {
        height: 1,
        backgroundColor: theme.colors.gray[100],
        marginVertical: 4,
    },
    itemsContainer: {
        gap: 12,
    },
    itemCard: {
        backgroundColor: theme.colors.white,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.gray[200],
        overflow: 'hidden',
    },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    itemNumberBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemNumber: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.white,
    },
    itemMainInfo: {
        flex: 1,
        gap: 4,
    },
    itemTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    itemNameSection: {
        flex: 1,
        gap: 4,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.gray[900],
    },
    packageMarkBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
    },
    packageMarkText: {
        fontSize: 12,
        color: theme.colors.orange[600],
        fontWeight: '500',
    },
    itemMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: theme.colors.gray[100],
        borderRadius: 6,
    },
    metaText: {
        fontSize: 11,
        fontWeight: '500',
        color: theme.colors.gray[700],
    },
    itemDetails: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        paddingTop: 8,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.gray[100],
        backgroundColor: theme.colors.gray[50],
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.gray[600],
        minWidth: 120,
    },
    detailValue: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.gray[900],
        flex: 1,
    },
    detailValueLoading: {
        color: theme.colors.gray[400],
    },
    imagesCard: {
        backgroundColor: theme.colors.gray[50],
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.gray[200],
        gap: 12,
    },
    imagesHint: {
        fontSize: 13,
        color: theme.colors.gray[500],
        textAlign: 'center',
        marginTop: 8,
    },
    totalsCard: {
        backgroundColor: theme.colors.blue[50],
        borderRadius: 12,
        padding: 16,
        gap: 16,
        borderWidth: 1,
        borderColor: theme.colors.blue[200],
    },
    subtotalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    subtotalIconContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: theme.colors.white,
        justifyContent: 'center',
        alignItems: 'center',
    },
    subtotalLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.gray[700],
        flex: 1,
    },
    subtotalValue: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.gray[900],
    },
    totalsDivider: {
        height: 1,
        backgroundColor: theme.colors.blue[200],
        marginVertical: 8,
    },
    totalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    totalIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.white,
        justifyContent: 'center',
        alignItems: 'center',
    },
    totalLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.gray[700],
        flex: 1,
    },
    totalValue: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.gray[900],
    },
    hintContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        padding: 16,
        backgroundColor: theme.colors.blue[50],
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.blue[200],
        marginTop: 8,
    },
    hintText: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.gray[700],
        lineHeight: 18,
    },
    stickyButtonContainer: {
        padding: 16,
        backgroundColor: theme.colors.white,
        borderTopWidth: 1,
        borderTopColor: theme.colors.gray[200],
        ...Platform.select({
            ios: {
                shadowColor: theme.colors.black,
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        paddingVertical: 16,
        borderRadius: 8,
        gap: 8,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.white,
    },
});

export default DispatchReviewStep;
