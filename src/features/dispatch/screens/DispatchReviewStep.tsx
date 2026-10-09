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
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { triggerSuccess, triggerError } from '@/hooks/useHaptics';
import { Snackbar } from 'react-native-paper';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
    fontWeight,
    iconSize,
    layout,
    radius,
    space,
    touchTarget,
    typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { parseLocalISODate } from '@/utils/formatters';
import { DispatchStepIndicator } from '@/components/DispatchStepIndicator';
import SwipeableFormStep from '@/components/SwipeableFormStep';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printDispatchRange } from '@/services/print-service';
import { DocumentSuccessDialog, DocumentData } from '@/components/DocumentSuccessDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { generateDispatchPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
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

/** Guide 12.3: mobile number as "+91 98765 43210". */
const formatMobile = (mobile: string) => {
    const digits = mobile.replace(/\D/g, '');
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    return `+91 ${mobile}`;
};

export function DispatchReviewStep({ mode }: DispatchReviewStepProps) {
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();

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

    // Format date (guide 12.3: "9 Oct 2026")
    const formatDisplayDate = (isoDate: string) => {
        if (!isoDate) return '';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? parseLocalISODate(isoDate) : new Date(isoDate);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
                customerName: header.customer_name || 'No customer',
                date: formatDisplayDate(header.disp_date),
                itemCount: items.length,
            });
            setShowSuccessDialog(true);

            // Show snackbar if order was cleared
            if (result.sourceOrderCleared) {
                setSnackbarMessage('Order fulfilled and removed from the queue.');
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
                setSnackbarMessage("Couldn't create the PDF. Check your connection and try again.");
                setSnackbarVisible(true);
                return;
            }

            const shareResult = await downloadAndSharePDF(
                pdfResult.pdfUrl,
                `Dispatch_${createdDispatchNumber}.pdf`
            );
            if (!shareResult.success) {
                setSnackbarMessage("Couldn't share the PDF. Try again.");
                setSnackbarVisible(true);
            }
        } catch (error) {
            setSnackbarMessage("Couldn't share the PDF. Try again.");
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

    const isBusy = isSaving || isSubmitting;

    // Render hero metrics (key totals at top for quick scanning)
    const renderHeroMetrics = () => (
        <View style={styles.heroSection}>
            {/* Customer card (surface.card; brand fills are not used for content headers) */}
            <View
                style={styles.customerCard}
                accessible
                accessibilityLabel={`Customer, ${header.customer_name || 'none chosen'}`}
            >
                <View style={styles.customerIconContainer}>
                    <Icon name="account-outline" size={iconSize.md} color={t.brand.tint} />
                </View>
                <View style={styles.customerTextContainer}>
                    <Text style={styles.customerLabel}>Customer</Text>
                    <Text style={styles.customerName} numberOfLines={2}>
                        {header.customer_name || 'No customer'}
                    </Text>
                    {(header.customer_address || header.customer_city) && (
                        <Text style={styles.customerMeta} numberOfLines={1}>
                            {header.customer_address || header.customer_city}
                            {header.customer_address && header.customer_city && header.customer_address !== header.customer_city && `, ${header.customer_city}`}
                        </Text>
                    )}
                    {header.customer_mobile && (
                        <View style={styles.customerMobileRow}>
                            <Icon name="phone-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.customerMeta} numberOfLines={1}>
                                {formatMobile(header.customer_mobile)}
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Key metrics grid (KPI tiles, guide 13.11) */}
            <View style={styles.metricsGrid}>
                <View style={styles.metricCard} accessible accessibilityLabel={`${items.length} ${items.length === 1 ? 'item' : 'items'}`}>
                    <View style={styles.metricIconContainer}>
                        <Icon name="cube-outline" size={iconSize.md} color={t.brand.tint} />
                    </View>
                    <View style={styles.metricContent}>
                        <Text style={styles.metricValue}>{items.length}</Text>
                        <Text style={styles.metricLabel}>{items.length === 1 ? 'Item' : 'Items'}</Text>
                    </View>
                </View>

                <View style={styles.metricCard} accessible accessibilityLabel={`Total quantity ${totals.grandTotalQuantity}`}>
                    <View style={styles.metricIconContainer}>
                        <Icon name="counter" size={iconSize.md} color={t.brand.tint} />
                    </View>
                    <View style={styles.metricContent}>
                        <Text style={styles.metricValue}>{totals.grandTotalQuantity}</Text>
                        <Text style={styles.metricLabel}>Total quantity</Text>
                    </View>
                </View>
            </View>
        </View>
    );

    // Section header with optional edit link (guide 14.3: Review has an edit link per section)
    const renderSectionHeader = (title: string, editStep?: number, editLabel?: string) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
            {editStep !== undefined && (
                <Pressable
                    onPress={() => navigateToStep(editStep)}
                    style={({ pressed }) => [styles.editLink, pressed && styles.editLinkPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={editLabel}
                    hitSlop={space.sm}
                >
                    <Icon name="pencil-outline" size={iconSize.sm} color={t.brand.tint} />
                    <Text style={styles.editLinkText}>Edit</Text>
                </Pressable>
            )}
        </View>
    );

    // Render header summary (compact version - customer shown in hero)
    const renderHeaderSummary = () => (
        <View style={styles.section}>
            {renderSectionHeader('Dispatch details', DISPATCH_STEP_NUMBERS.INFO, 'Edit dispatch details')}

            <View style={styles.card}>
                {/* Row 1: Dispatch No + Date */}
                <View style={styles.compactRow}>
                    <View style={styles.compactItem}>
                        <Icon name="truck-delivery-outline" size={iconSize.sm} color={t.icon.secondary} />
                        <View style={styles.compactItemContent}>
                            <Text style={styles.compactLabel}>Dispatch number</Text>
                            <Text style={styles.compactValue}>{header.disp_no}</Text>
                        </View>
                    </View>
                    <View style={styles.compactItem}>
                        <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
                        <View style={styles.compactItemContent}>
                            <Text style={styles.compactLabel}>Date</Text>
                            <Text style={styles.compactValue}>{formatDisplayDate(header.disp_date)}</Text>
                        </View>
                    </View>
                </View>

                {/* Row 2: Vehicle + Supervisor */}
                <View style={styles.compactRow}>
                    <View style={styles.compactItem}>
                        <Icon name="truck-outline" size={iconSize.sm} color={t.icon.secondary} />
                        <View style={styles.compactItemContent}>
                            <Text style={styles.compactLabel}>Vehicle</Text>
                            <Text style={styles.compactValue} numberOfLines={1}>{header.registration || '-'}</Text>
                        </View>
                    </View>
                    <View style={styles.compactItem}>
                        <Icon name="account-outline" size={iconSize.sm} color={t.icon.secondary} />
                        <View style={styles.compactItemContent}>
                            <Text style={styles.compactLabel}>Supervisor</Text>
                            <Text style={styles.compactValue} numberOfLines={1}>{header.supervisor_name || '-'}</Text>
                        </View>
                    </View>
                </View>

                {/* Row 3: Weight (full width) */}
                <View style={styles.compactRow}>
                    <View style={[styles.compactItem, styles.fullWidth]}>
                        <Icon name="weight" size={iconSize.sm} color={t.icon.secondary} />
                        <View style={styles.compactItemContent}>
                            <Text style={styles.compactLabel}>Total weight</Text>
                            <Text style={styles.compactValue}>{Math.round(totals.grandTotalWeight)} kg</Text>
                        </View>
                    </View>
                </View>

                {/* Notes (if any) */}
                {header.note && (
                    <View style={styles.notesRow}>
                        <Icon name="note-text-outline" size={iconSize.sm} color={t.icon.secondary} />
                        <Text style={styles.notesText} numberOfLines={2}>{header.note}</Text>
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
            <View key={item.unique_id} style={styles.itemCard}>
                <Pressable
                    style={({ pressed }) => [styles.itemHeader, pressed && styles.itemHeaderPressed]}
                    onPress={() => toggleItemExpansion(item.unique_id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Item ${index + 1}, ${item.grnItems_item_name}${item.grnItems_package_mark ? `, mark ${item.grnItems_package_mark}` : ''}, GRN ${item.grns_gr_no}, quantity ${item.disp_quantity}`}
                    accessibilityHint={isExpanded ? 'Hides item details' : 'Shows item details'}
                    accessibilityState={{ expanded: isExpanded }}
                >
                    <View style={styles.itemNumberBadge}>
                        <Text style={styles.itemNumber}>{index + 1}</Text>
                    </View>

                    <View style={styles.itemMainInfo}>
                        <View style={styles.itemTitleRow}>
                            <View style={styles.itemNameSection}>
                                <Text style={styles.itemName} numberOfLines={2}>
                                    {item.grnItems_item_name}
                                </Text>
                                {item.grnItems_package_mark && (
                                    <View style={styles.packageMarkBadge}>
                                        <Icon name="tag-outline" size={iconSize.sm} color={t.icon.secondary} />
                                        <Text style={styles.packageMarkText}>{item.grnItems_package_mark}</Text>
                                    </View>
                                )}
                            </View>
                            <Icon
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={iconSize.lg}
                                color={t.icon.secondary}
                            />
                        </View>
                        <View style={styles.itemMetaRow}>
                            <View style={styles.metaBadge}>
                                <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
                                <Text style={styles.metaText} maxFontSizeMultiplier={1.6}>
                                    GRN {item.grns_gr_no}/{item.grnItems_quantity}
                                </Text>
                            </View>
                            <View style={styles.metaBadge}>
                                <Icon name="cube-outline" size={iconSize.sm} color={t.icon.secondary} />
                                <Text style={styles.metaText} maxFontSizeMultiplier={1.6}>Qty {item.disp_quantity}</Text>
                            </View>
                        </View>
                    </View>
                </Pressable>

                {isExpanded && (
                    <View style={styles.itemDetails}>
                        <View style={styles.detailRow}>
                            <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.detailLabel}>GRN date</Text>
                            <Text style={styles.detailValue}>{formatDisplayDate(item.grns_date)}</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="account-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.detailLabel}>Customer</Text>
                            <Text style={styles.detailValue}>{item.grns_customer_name}</Text>
                        </View>

                        {item.grnItems_package_mark && (
                            <View style={styles.detailRow}>
                                <Icon name="tag-outline" size={iconSize.sm} color={t.icon.secondary} />
                                <Text style={styles.detailLabel}>Package mark</Text>
                                <Text style={styles.detailValue}>{item.grnItems_package_mark}</Text>
                            </View>
                        )}

                        {item.grnItems_rack && (
                            <View style={styles.detailRow}>
                                <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                                <Text style={styles.detailLabel}>Rack</Text>
                                <Text style={styles.detailValue}>{item.grnItems_rack}</Text>
                            </View>
                        )}

                        <View style={styles.detailRow}>
                            <Icon name="scale" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.detailLabel}>Unit weight</Text>
                            <Text style={styles.detailValue}>{item.grnItems_weight} kg</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="weight" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.detailLabel}>Total weight</Text>
                            <Text style={styles.detailValue}>{Math.round(itemTotalWeight)} kg</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="package-variant" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.detailLabel}>Original GRN quantity</Text>
                            <Text style={styles.detailValue}>{item.grnItems_quantity}</Text>
                        </View>

                        <View style={styles.detailRow}>
                            <Icon name="warehouse" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.detailLabel}>In stock</Text>
                            <Text style={[styles.detailValue, !isCreateMode && loadingStock && styles.detailValueLoading]}>
                                {!isCreateMode && loadingStock ? '-' : stockValue}
                            </Text>
                        </View>

                        {isCreateMode && (
                            <View style={styles.detailRow}>
                                <Icon name="database-check-outline" size={iconSize.sm} color={t.icon.secondary} />
                                <Text style={styles.detailLabel}>Stock after dispatch</Text>
                                <Text style={[styles.detailValue, styles.detailValueEmphasized]}>
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
            {renderSectionHeader(`Items (${items.length})`, DISPATCH_STEP_NUMBERS.ITEMS, 'Edit items')}

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
                {renderSectionHeader('Photos (optional)')}

                <View style={[styles.card, styles.imagesCard]}>
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
                            columns={3}
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
                        buttonText={images.length > 0 ? 'Add more photos' : 'Add photos'}
                        customUploadFunction={dispatchUploadFunction}
                    />

                    {images.length === 0 && (
                        <Text style={styles.imagesHint}>
                            You can add photos of the goods or the vehicle.
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    // Render totals section
    const renderTotalsSection = () => (
        <View style={styles.section}>
            {renderSectionHeader('Summary')}

            <View style={styles.card}>
                {isCreateMode &&
                    Object.entries(totals.itemWiseTotals).map(([itemName, itemTotals]) => (
                        <View key={itemName} style={styles.subtotalRow}>
                            <Icon name="cube-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.subtotalLabel}>{itemName}</Text>
                            <Text style={styles.subtotalValue}>{itemTotals.quantity}</Text>
                        </View>
                    ))}

                {isCreateMode && <View style={styles.totalsDivider} />}

                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total quantity</Text>
                    <Text style={styles.totalValue}>{totals.grandTotalQuantity}</Text>
                </View>

                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total weight</Text>
                    <Text style={styles.totalValue}>{Math.round(totals.grandTotalWeight)} kg</Text>
                </View>

                {!isCreateMode && (
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>GRNs</Text>
                        <Text style={styles.totalValue}>{totals.uniqueGRNs}</Text>
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

    const submitLabel = isCreateMode ? 'Create dispatch' : 'Save changes';
    const submitBusyLabel = isCreateMode ? 'Creating dispatch…' : 'Saving changes…';

    return (
        <View style={styles.container}>
            <DispatchStepIndicator
                steps={DISPATCH_STEPS}
                currentStep={DISPATCH_STEP_NUMBERS.REVIEW}
                completedSteps={getDispatchCompletedSteps(DISPATCH_STEP_NUMBERS.REVIEW)}
                onCancel={handleCancel}
                cancelMessage={
                    isCreateMode
                        ? 'Discard this dispatch? The details you entered will be lost.'
                        : 'Discard your changes to this dispatch? Unsaved changes will be lost.'
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
                        contentContainerStyle={styles.scrollContent}
                    >
                        {renderHeroMetrics()}
                        {renderHeaderSummary()}
                        {renderItemsSection()}
                        {renderImagesSection()}

                        {/* Message strip for edit mode (informative) */}
                        {!isCreateMode && (
                            <View style={styles.hintContainer}>
                                <Icon name="information" size={iconSize.md} color={t.status.informative.text} />
                                <Text style={styles.hintText}>
                                    Check the details before you save. Saving updates stock levels.
                                </Text>
                            </View>
                        )}
                    </ScrollView>

                    {/* Bottom bar (guide 13.8): Back secondary, primary action, bottom inset */}
                    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
                        <Pressable
                            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                            onPress={handleBack}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel="Back to items"
                            accessibilityState={{ disabled: isBusy }}
                        >
                            <Text style={styles.secondaryButtonText}>Back</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [
                                styles.submitButton,
                                pressed && styles.submitButtonPressed,
                                isBusy && styles.submitButtonDisabled,
                            ]}
                            onPress={handleSubmit}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel={isBusy ? submitBusyLabel : submitLabel}
                            accessibilityState={{ disabled: isBusy, busy: isBusy }}
                        >
                            {isBusy ? (
                                <ActivityIndicator size="small" color={t.brand.onFill} />
                            ) : (
                                <Icon name="check" size={iconSize.md} color={t.brand.onFill} />
                            )}
                            <Text style={styles.submitButtonText}>{isBusy ? submitBusyLabel : submitLabel}</Text>
                        </Pressable>
                    </View>
                </View>
            </SwipeableFormStep>

            {/* Confirm Submit Dialog */}
            <ConfirmDialog
                visible={showConfirmDialog}
                title={isCreateMode ? `Create dispatch ${header.disp_no}?` : `Save changes to dispatch ${header.disp_no}?`}
                message={`${items.length} ${items.length === 1 ? 'item' : 'items'} will be ${isCreateMode ? 'dispatched' : 'saved'} and stock levels updated.`}
                confirmText={submitLabel}
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
                                `Sent to the printer${result.print_job?.cups_job_id ? ` (job ${result.print_job.cups_job_id})` : ''}.`
                            );
                        } else {
                            setSnackbarMessage("Couldn't send to the printer. Check the printer and try again.");
                        }
                        setSnackbarVisible(true);
                        setShowPrintDialog(false);
                        resetFormState();
                        router.replace('/dispatch');
                    }}
                    title="Print dispatch"
                    defaultNumber={createdDispatchNumber}
                    label="Dispatch number"
                    placeholder="For example, D001"
                />
            )}

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={4000}
                style={styles.snackbar}
            >
                <Text style={styles.snackbarText}>{snackbarMessage}</Text>
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
                title="Discard this dispatch?"
                message={`The ${items.length} ${items.length === 1 ? 'item' : 'items'} you added will be lost.`}
                confirmText="Discard dispatch"
                cancelText="Keep editing"
                onConfirm={handleDiscardConfirm}
                onCancel={() => setShowDiscardDialog(false)}
                variant="danger"
                icon="trash-outline"
            />

            {/* Edit Success Dialog (edit mode) */}
            <ConfirmDialog
                visible={showEditSuccessDialog}
                title={`Dispatch ${header.disp_no} saved`}
                message="Your changes are saved and stock levels are updated."
                confirmText="View dispatch"
                cancelText=""
                onConfirm={handleEditSuccessConfirm}
                onCancel={handleEditSuccessConfirm}
                variant="default"
                icon="checkmark-circle"
            />
        </View>
    );
}

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
        paddingHorizontal: layout.marginCompact,
        paddingTop: space.lg,
        paddingBottom: space.lg,
    },
    card: {
        backgroundColor: t.surface.card,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.md,
        ...t.shadow[2],
    },
    fullWidth: {
        flex: 1,
    },
    // Hero section
    heroSection: {
        marginBottom: space.xxl,
        gap: space.md,
    },
    customerCard: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.md,
        backgroundColor: t.surface.card,
        borderRadius: radius.card,
        padding: space.lg,
        ...t.shadow[2],
    },
    customerIconContainer: {
        width: layout.avatar.md,
        height: layout.avatar.md,
        borderRadius: radius.pill,
        backgroundColor: t.brand.subtle,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    customerTextContainer: {
        flex: 1,
    },
    customerLabel: {
        ...typography.footnote,
        color: t.text.secondary,
    },
    customerName: {
        ...typography.headline,
        color: t.text.primary,
    },
    customerMeta: {
        ...typography.subhead,
        color: t.text.secondary,
        marginTop: space.xxs,
    },
    customerMobileRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xs,
    },
    metricsGrid: {
        flexDirection: 'row' as const,
        gap: space.sm,
    },
    metricCard: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        backgroundColor: t.surface.card,
        borderRadius: radius.card,
        padding: space.md,
        gap: space.md,
        ...t.shadow[2],
    },
    metricIconContainer: {
        width: layout.avatar.md,
        height: layout.avatar.md,
        borderRadius: radius.pill,
        backgroundColor: t.brand.subtle,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    metricContent: {
        flex: 1,
    },
    metricValue: {
        ...typography.title3,
        color: t.text.primary,
        fontVariant: ['tabular-nums' as const],
    },
    metricLabel: {
        ...typography.footnote,
        color: t.text.secondary,
    },
    section: {
        marginBottom: space.xxl,
    },
    sectionHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        marginBottom: space.sm,
        minHeight: touchTarget,
    },
    sectionTitle: {
        ...typography.footnote,
        fontWeight: fontWeight.semibold,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
        color: t.text.secondary,
    },
    editLink: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xs,
        minHeight: touchTarget,
        paddingHorizontal: space.sm,
        borderRadius: radius.button,
    },
    editLinkPressed: {
        backgroundColor: t.brand.subtle,
    },
    editLinkText: {
        ...typography.callout,
        color: t.brand.tint,
    },
    // Compact summary card
    compactRow: {
        flexDirection: 'row' as const,
        gap: space.md,
    },
    compactItem: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        gap: space.sm,
    },
    compactItemContent: {
        flex: 1,
    },
    compactLabel: {
        ...typography.footnote,
        color: t.text.secondary,
        marginBottom: space.xxs,
    },
    compactValue: {
        ...typography.body,
        fontWeight: fontWeight.semibold,
        color: t.text.primary,
    },
    notesRow: {
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        gap: space.sm,
        paddingTop: space.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: t.border.divider,
    },
    notesText: {
        ...typography.subhead,
        flex: 1,
        color: t.text.primary,
    },
    itemsContainer: {
        gap: space.sm,
    },
    itemCard: {
        backgroundColor: t.surface.card,
        borderRadius: radius.card,
        overflow: 'hidden' as const,
        ...t.shadow[2],
    },
    itemHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        padding: space.lg,
        gap: space.md,
        minHeight: layout.objectCellMinHeight,
        backgroundColor: t.surface.card,
    },
    itemHeaderPressed: {
        backgroundColor: t.surface.cardPressed,
    },
    itemNumberBadge: {
        width: layout.avatar.sm,
        height: layout.avatar.sm,
        borderRadius: radius.pill,
        backgroundColor: t.brand.subtle,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    itemNumber: {
        ...typography.subhead,
        fontWeight: fontWeight.semibold,
        color: t.brand.tint,
        fontVariant: ['tabular-nums' as const],
    },
    itemMainInfo: {
        flex: 1,
        gap: space.xs,
    },
    itemTitleRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
    },
    itemNameSection: {
        flex: 1,
        gap: space.xs,
    },
    itemName: {
        ...typography.headline,
        color: t.text.primary,
    },
    packageMarkBadge: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xs,
        alignSelf: 'flex-start' as const,
    },
    packageMarkText: {
        ...typography.footnote,
        color: t.text.secondary,
    },
    itemMetaRow: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        alignItems: 'center' as const,
        gap: space.sm,
    },
    metaBadge: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xs,
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        backgroundColor: t.status.neutral.background,
        borderRadius: radius.field,
    },
    metaText: {
        ...typography.caption1,
        fontWeight: fontWeight.semibold,
        color: t.status.neutral.text,
        fontVariant: ['tabular-nums' as const],
    },
    itemDetails: {
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
        paddingTop: space.md,
        gap: space.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: t.border.divider,
        backgroundColor: t.background.base,
    },
    detailRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.sm,
    },
    detailLabel: {
        ...typography.subhead,
        color: t.text.secondary,
        minWidth: 120,
    },
    detailValue: {
        ...typography.subhead,
        fontWeight: fontWeight.semibold,
        color: t.text.primary,
        flex: 1,
        fontVariant: ['tabular-nums' as const],
    },
    detailValueEmphasized: {
        fontWeight: fontWeight.bold,
    },
    detailValueLoading: {
        color: t.text.secondary,
    },
    imagesCard: {
        gap: space.md,
    },
    imagesHint: {
        ...typography.footnote,
        color: t.text.secondary,
        textAlign: 'center' as const,
    },
    subtotalRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.sm,
    },
    subtotalLabel: {
        ...typography.subhead,
        color: t.text.secondary,
        flex: 1,
    },
    subtotalValue: {
        ...typography.subhead,
        fontWeight: fontWeight.semibold,
        color: t.text.primary,
        fontVariant: ['tabular-nums' as const],
    },
    totalsDivider: {
        height: 1,
        backgroundColor: t.border.separator,
    },
    totalRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.md,
    },
    totalLabel: {
        ...typography.body,
        color: t.text.secondary,
        flex: 1,
    },
    totalValue: {
        ...typography.headline,
        color: t.text.primary,
        fontVariant: ['tabular-nums' as const],
    },
    // Message strip (guide 13.9), informative
    hintContainer: {
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        gap: space.sm,
        padding: space.md,
        backgroundColor: t.status.informative.background,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: t.status.informative.border,
    },
    hintText: {
        ...typography.subhead,
        flex: 1,
        color: t.status.informative.text,
    },
    // Bottom bar (guide 13.8)
    bottomBar: {
        flexDirection: 'row' as const,
        gap: space.sm,
        paddingHorizontal: layout.marginCompact,
        paddingTop: space.md,
        backgroundColor: t.surface.card,
        ...t.shadow[3],
    },
    secondaryButton: {
        minHeight: 48,
        minWidth: 96,
        paddingHorizontal: space.lg,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: t.border.button,
    },
    secondaryButtonPressed: {
        backgroundColor: t.brand.subtle,
    },
    secondaryButtonText: {
        ...typography.callout,
        color: t.brand.tint,
    },
    submitButton: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        backgroundColor: t.brand.fill,
        minHeight: 48,
        paddingHorizontal: space.lg,
        borderRadius: radius.button,
        gap: space.sm,
    },
    submitButtonPressed: {
        backgroundColor: t.brand.fillPressed,
    },
    submitButtonDisabled: {
        opacity: t.interaction.disabledOpacity,
    },
    submitButtonText: {
        ...typography.callout,
        color: t.brand.onFill,
    },
    snackbar: {
        backgroundColor: t.surface.inverse,
        borderRadius: radius.button,
        ...t.shadow[3],
    },
    snackbarText: {
        ...typography.subhead,
        color: t.text.inverse,
    },
});

export default DispatchReviewStep;
