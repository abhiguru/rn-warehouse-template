/**
 * Dispatch Items Step - Unified Create/Edit Component
 * Single item form pattern - user fills one item at a time and saves to list
 * Uses mode prop to differentiate between create and edit flows
 *
 * Refactored to use useDispatchForm hook for form state management.
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    Platform,
    Vibration,
    Keyboard,
    ActivityIndicator,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DispatchStepIndicator } from '@/components/DispatchStepIndicator';
import SwipeableFormStep from '@/components/SwipeableFormStep';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useDispatchForm } from '@/hooks/useDispatchForm';
import {
    GRNAutocompleteBottomSheet,
    GRNItemBottomSheet,
    LotBottomSheet,
    ItemsSummaryBottomSheet,
} from '@/features/dispatch/components';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { validateSingleItem, checkDuplicateLots } from '@/features/dispatch/schemas/dispatchValidation';
import type { GRNDetailItem, DispatchItemData, ItemFormData } from '@/types/dispatch.types';
import { EMPTY_DISPATCH_ITEM } from '@/types/dispatch.types';
import { DISPATCH_STEPS, DISPATCH_STEP_NUMBERS, getDispatchCompletedSteps } from '@/constants/dispatchSteps';
import { getUserFriendlyError } from '@/utils/errorHandler';

type DispatchItemsStepProps = {
    mode: 'create' | 'edit';
};

export function DispatchItemsStep({ mode }: DispatchItemsStepProps) {
    // Theme colors for dark mode support
    const colors = useListColors();

    const { id } = useLocalSearchParams<{ id: string }>();

    // Use the consolidated dispatch form hook
    const {
        header,
        items: savedItems,
        isCreateMode,
        addFormItems,
        updateFormItem,
        removeFormItem,
        navigateToStep,
        resetFormState,
    } = useDispatchForm({
        mode,
        dispatchIdParam: id,
    });

    // Refs
    const scrollViewRef = useRef<any>(null);
    const quantityInputRef = useRef<TextInput>(null);

    // Current item form state (single item being filled)
    const [currentItem, setCurrentItem] = useState<ItemFormData>({
        ...EMPTY_DISPATCH_ITEM,
        unique_id: `item_${Date.now()}`,
    });

    // Editing state - tracks which item is being edited (null = adding new item)
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [originalDispatchedQty, setOriginalDispatchedQty] = useState(0);

    // GRN detail state
    const [selectedGRN, setSelectedGRN] = useState<{
        id: string;
        gr_no: string;
        date: string;
        customer_name: string;
        items: GRNDetailItem[];
    } | null>(null);
    const [isLoadingGRN, setIsLoadingGRN] = useState(false);

    // Bottom sheet visibility
    const [showGRNBottomSheet, setShowGRNBottomSheet] = useState(false);
    const [showItemBottomSheet, setShowItemBottomSheet] = useState(false);
    const [showLotBottomSheet, setShowLotBottomSheet] = useState(false);
    const [showSummaryBottomSheet, setShowSummaryBottomSheet] = useState(false);

    // Validation state
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    // Loading state for add button
    const [isAddingItem, setIsAddingItem] = useState(false);

    // Dialog states for dark mode compliant confirmations
    const [showDiscardDialog, setShowDiscardDialog] = useState(false);
    const [showClearItemDialog, setShowClearItemDialog] = useState(false);
    const [showUnsavedBackDialog, setShowUnsavedBackDialog] = useState(false);
    const [showUnsavedEditDialog, setShowUnsavedEditDialog] = useState(false);

    // Track the last saved item's uniqueId to detect when returning from step3
    const lastSavedItemRef = useRef<string | null>(null);

    // Reset form when screen is focused (create mode only)
    useFocusEffect(
        useCallback(() => {
            if (!isCreateMode) return;

            const latestSavedItem = savedItems.length > 0 ? savedItems[savedItems.length - 1] : null;

            console.log('[DispatchItemsStep] Screen focused, checking if form needs reset');

            if (!editingItemId && currentItem.unique_id) {
                const isCurrentFormSaved = savedItems.some(
                    (item) => item.unique_id === currentItem.unique_id
                );

                if (isCurrentFormSaved) {
                    console.log('[DispatchItemsStep] Current form item was saved, resetting form');
                    setCurrentItem({
                        ...EMPTY_DISPATCH_ITEM,
                        unique_id: `item_${Date.now()}_${Math.random()}`,
                    });
                    setSelectedGRN(null);
                    setValidationErrors({});
                }
            }

            if (latestSavedItem) {
                lastSavedItemRef.current = latestSavedItem.unique_id;
            }

            return () => { };
        }, [isCreateMode, editingItemId, currentItem.unique_id, savedItems])
    );

    // Check if user has added any items
    const hasUnsavedData = () => savedItems.length > 0;

    // Handle cancel with confirmation
    const handleCancel = () => {
        if (isCreateMode && hasUnsavedData()) {
            setShowDiscardDialog(true);
        } else {
            resetFormState();
            if (isCreateMode) {
                router.replace('/dispatch');
            } else {
                router.back();
                router.back();
            }
        }
    };

    const handleDiscardConfirm = () => {
        setShowDiscardDialog(false);
        resetFormState();
        router.replace('/dispatch');
    };

    // Handle GRN selection
    const handleGRNSelect = useCallback(
        async (grn: { id: string; gr_no: string }) => {
            console.log('[DispatchItemsStep] GRN selected:', grn.gr_no);
            setIsLoadingGRN(true);

            try {
                // Always include zero-stock items so fully dispatched GRNs show their items
                const result = await getGRNDetailByNumber(grn.gr_no, true);

                if (!result.success || !result.data) {
                    Alert.alert('Error', result.error || 'Failed to load GRN details');
                    return;
                }

                const { grn: grnHeader, items: grnItems } = result.data;

                // Load GRN even if no items with stock - UI will show "available 0"
                setSelectedGRN({
                    id: grnHeader.id,
                    gr_no: grnHeader.gr_no,
                    date: grnHeader.date,
                    customer_name: grnHeader.customer_name,
                    items: grnItems,
                });

                // Auto-select first lot in create mode
                // Prefer lot with stock that is NOT already in the order
                if (isCreateMode) {
                    // Get lot IDs already in the order
                    const alreadyAddedLotIds = savedItems.map(item => item.grnItems_id).filter(Boolean);

                    // Find first lot with stock that is NOT already added
                    const firstAvailableLot = grnItems.find(
                        (item) => item.stock > 0 && !alreadyAddedLotIds.includes(item.id)
                    );

                    if (firstAvailableLot) {
                        // Auto-select the first available lot
                        setCurrentItem((prev) => ({
                            ...prev,
                            grns_id: grnHeader.id,
                            grns_gr_no: grnHeader.gr_no,
                            grns_date: grnHeader.date,
                            grns_customer_name: grnHeader.customer_name,
                            grnItems_item_id: firstAvailableLot.item_id,
                            grnItems_item_name: firstAvailableLot.item_name,
                            grnItems_id: firstAvailableLot.id,
                            grnItems_quantity: firstAvailableLot.quantity,
                            grnItems_stock: firstAvailableLot.stock,
                            grnItems_package_mark: firstAvailableLot.package_mark,
                            grnItems_rack: firstAvailableLot.rack,
                            grnItems_weight: firstAvailableLot.weight,
                        }));
                    } else {
                        // No available lots (all added or no stock) - just set GRN info, don't auto-select lot
                        setCurrentItem((prev) => ({
                            ...prev,
                            grns_id: grnHeader.id,
                            grns_gr_no: grnHeader.gr_no,
                            grns_date: grnHeader.date,
                            grns_customer_name: grnHeader.customer_name,
                            // Clear any previous lot selection
                            grnItems_item_id: '',
                            grnItems_item_name: '',
                            grnItems_id: '',
                            grnItems_quantity: 0,
                            grnItems_stock: 0,
                            grnItems_package_mark: '',
                            grnItems_rack: '',
                            grnItems_weight: 0,
                        }));
                    }
                } else {
                    setCurrentItem((prev) => ({
                        ...prev,
                        grns_id: grnHeader.id,
                        grns_gr_no: grnHeader.gr_no,
                        grns_date: grnHeader.date,
                        grns_customer_name: grnHeader.customer_name,
                    }));
                }

                setValidationErrors((prev) => {
                    const { grns_gr_no, grnItems_item_id, grnItems_id, ...rest } = prev;
                    return rest;
                });
            } catch (error) {
                console.error('[DispatchItemsStep] Error loading GRN:', error);
                Alert.alert('Error', getUserFriendlyError('grn', 'load'));
            } finally {
                setIsLoadingGRN(false);
            }
        },
        [isCreateMode, savedItems]
    );

    // Handle item selection
    const handleItemSelect = useCallback((item: { item_id: string; item_name: string }) => {
        console.log('[DispatchItemsStep] Item selected:', item.item_name);

        setCurrentItem((prev) => ({
            ...prev,
            grnItems_item_id: item.item_id,
            grnItems_item_name: item.item_name,
            grnItems_id: '',
            grnItems_quantity: 0,
            grnItems_stock: 0,
            grnItems_package_mark: '',
            grnItems_rack: '',
            grnItems_weight: 0,
            disp_quantity: 0,
        }));

        setValidationErrors((prev) => {
            const { grnItems_item_id, ...rest } = prev;
            return rest;
        });
    }, []);

    // Handle lot selection
    const handleLotSelect = useCallback((lot: GRNDetailItem) => {
        console.log('[DispatchItemsStep] Lot selected:', lot.id);

        setCurrentItem((prev) => ({
            ...prev,
            grnItems_id: lot.id,
            grnItems_item_id: lot.item_id,
            grnItems_item_name: lot.item_name,
            grnItems_quantity: lot.quantity,
            grnItems_stock: lot.stock,
            grnItems_package_mark: lot.package_mark,
            grnItems_rack: lot.rack,
            grnItems_weight: lot.weight,
        }));

        setValidationErrors((prev) => {
            const { grnItems_id, ...rest } = prev;
            return rest;
        });
    }, []);

    // Handle quantity change
    const handleQuantityChange = (text: string) => {
        const qty = parseInt(text) || 0;
        setCurrentItem((prev) => ({
            ...prev,
            disp_quantity: qty,
        }));

        setValidationErrors((prev) => {
            const { disp_quantity, ...rest } = prev;
            return rest;
        });
    };

    // Handle quick quantity adjustment (+/- buttons)
    const handleQuickQuantityChange = useCallback((delta: number) => {
        if (!currentItem.grnItems_id) return;

        setCurrentItem((prev) => {
            const currentQty = prev.disp_quantity ?? 0;
            const newQty = Math.max(0, currentQty + delta);
            return {
                ...prev,
                disp_quantity: newQty,
            };
        });

        setValidationErrors((prev) => {
            const { disp_quantity, ...rest } = prev;
            return rest;
        });
    }, [currentItem.grnItems_id]);

    // Get lots for selected item
    const lotsForSelectedItem =
        selectedGRN?.items.filter((item) => item.item_id === currentItem.grnItems_item_id) || [];

    // Get lot IDs that are already in the order (for "Already in order" indicator in LotBottomSheet)
    const addedLotIds = useMemo(() =>
        savedItems.map(item => item.grnItems_id).filter(Boolean) as string[],
        [savedItems]
    );

    // Calculate remaining stock after applying current dispatch quantity
    // In edit mode: current_stock already excludes original dispatch, so add it back first
    // then subtract the new quantity to show what will remain
    const displayStock =
        editingItemId !== null
            ? (currentItem.grnItems_stock ?? 0) + ((currentItem.original_disp_quantity ?? 0) - (currentItem.disp_quantity ?? 0))
            : (currentItem.grnItems_stock ?? 0) - (currentItem.disp_quantity ?? 0);

    // Max allowed quantity
    // In edit mode: available = current_stock + original_disp_quantity (what we already hold)
    // In create mode: available = current_stock
    const maxAllowedQty =
        editingItemId !== null
            ? (currentItem.grnItems_stock ?? 0) + (currentItem.original_disp_quantity ?? 0)
            : currentItem.grnItems_stock ?? 0;

    // Check if current item is valid
    const isCurrentItemValid =
        currentItem.grns_gr_no &&
        currentItem.grnItems_item_id &&
        currentItem.grnItems_id &&
        (currentItem.disp_quantity ?? 0) > 0 &&
        (currentItem.disp_quantity ?? 0) <= maxAllowedQty;

    // Add or update current item
    const handleAddItem = async () => {
        // Immediately show loading state for instant feedback
        setIsAddingItem(true);

        try {
            const isEditing = editingItemId !== null;
            console.log('[DispatchItemsStep]', isEditing ? 'Updating item' : 'Adding item');

            const validation = await validateSingleItem(currentItem);

            if (!validation.isValid) {
                setValidationErrors(validation.errors);
                Alert.alert('Validation Error', 'Please fill in all required fields correctly');
                return;
            }

            // Check for duplicate lots
            const otherItems = isEditing
                ? savedItems.filter((item) => item.unique_id !== editingItemId)
                : savedItems;
            const allItems = [...otherItems, currentItem as DispatchItemData];
            const duplicateCheck = checkDuplicateLots(allItems);

            if (duplicateCheck.hasDuplicates) {
                Alert.alert(
                    'Duplicate Lot',
                    'This lot has already been added. Each lot can only be dispatched once.'
                );
                return;
            }

            if (isEditing) {
                updateFormItem(editingItemId, currentItem as DispatchItemData);
                console.log('[DispatchItemsStep] Item updated:', editingItemId);
            } else {
                addFormItems([currentItem as DispatchItemData]);
                console.log('[DispatchItemsStep] Item added. Total:', savedItems.length + 1);
            }

            // Haptic feedback on item add/update
            Vibration.vibrate(5);

            // Reset form
            setEditingItemId(null);
            setOriginalDispatchedQty(0);
            setCurrentItem({
                ...EMPTY_DISPATCH_ITEM,
                unique_id: `item_${Date.now()}_${Math.random()}`,
            });
            setSelectedGRN(null);
            setValidationErrors({});
        } finally {
            setIsAddingItem(false);
        }
    };

    // Handle delete item
    const handleDeleteItem = (unique_id: string) => {
        if (editingItemId === unique_id) {
            setEditingItemId(null);
            setOriginalDispatchedQty(0);
            setCurrentItem({
                ...EMPTY_DISPATCH_ITEM,
                unique_id: `item_${Date.now()}_${Math.random()}`,
            });
            setSelectedGRN(null);
            setValidationErrors({});
        }
        removeFormItem(unique_id);
        // Haptic feedback on item delete
        Vibration.vibrate(5);
    };

    // Handle edit item
    const handleEditItem = useCallback(
        async (item: DispatchItemData) => {
            console.log('[DispatchItemsStep] Editing item:', item.unique_id);

            setEditingItemId(item.unique_id);
            setOriginalDispatchedQty(item.disp_quantity ?? 0);
            setCurrentItem({
                unique_id: item.unique_id,
                grns_id: item.grns_id,
                grns_gr_no: item.grns_gr_no,
                grns_date: item.grns_date,
                grns_customer_name: item.grns_customer_name,
                grnItems_id: item.grnItems_id,
                grnItems_item_id: item.grnItems_item_id,
                grnItems_item_name: item.grnItems_item_name,
                grnItems_quantity: item.grnItems_quantity,
                grnItems_stock: item.grnItems_stock,
                grnItems_package_mark: item.grnItems_package_mark,
                grnItems_rack: item.grnItems_rack,
                grnItems_weight: item.grnItems_weight,
                disp_quantity: item.disp_quantity,
                original_disp_quantity: item.original_disp_quantity !== undefined ? item.original_disp_quantity : 0,
            });

            try {
                // Include zero-stock items when editing (the lot we're editing may have been fully consumed)
                const result = await getGRNDetailByNumber(item.grns_gr_no, true);
                if (result.success && result.data) {
                    const { grn: grnHeader, items: grnItems } = result.data;
                    setSelectedGRN({
                        id: grnHeader.id,
                        gr_no: grnHeader.gr_no,
                        date: grnHeader.date,
                        customer_name: grnHeader.customer_name,
                        items: grnItems,
                    });
                }
            } catch (error) {
                console.error('[DispatchItemsStep] Error loading GRN for edit:', error);
            }

            setValidationErrors({});
            // Haptic feedback on edit item
            Vibration.vibrate(5);

            scrollViewRef.current?.scrollToPosition?.(0, 0, true);
            setTimeout(() => quantityInputRef.current?.focus(), 500);
        },
        []
    );

    // Handle cancel edit (edit mode only)
    const handleCancelEdit = useCallback(async () => {
        const originalItem = savedItems.find((item) => item.unique_id === editingItemId);

        if (!originalItem) {
            resetEditState();
            return;
        }

        const hasChanges = currentItem.disp_quantity !== originalItem.disp_quantity;

        if (!hasChanges) {
            resetEditState();
            return;
        }

        setShowUnsavedEditDialog(true);
    }, [editingItemId, currentItem, savedItems]);

    const handleUnsavedEditDiscard = () => {
        setShowUnsavedEditDialog(false);
        resetEditState();
    };

    const handleUnsavedEditSave = async () => {
        const validation = await validateSingleItem(currentItem);
        if (!validation.isValid) {
            setShowUnsavedEditDialog(false);
            Alert.alert('Validation Error', 'Please fix errors before saving');
            return;
        }
        setShowUnsavedEditDialog(false);
        updateFormItem(editingItemId!, currentItem as DispatchItemData);
        Vibration.vibrate(5);
        resetEditState();
    };

    const resetEditState = () => {
        setEditingItemId(null);
        setOriginalDispatchedQty(0);
        setCurrentItem({
            ...EMPTY_DISPATCH_ITEM,
            unique_id: `item_${Date.now()}_${Math.random()}`,
        });
        setSelectedGRN(null);
        setValidationErrors({});
    };

    // Check if user has entered significant data (lot + quantity)
    const hasSignificantData = useCallback(() => {
        return (
            currentItem.grnItems_id &&
            (currentItem.disp_quantity ?? 0) > 0
        );
    }, [currentItem.grnItems_id, currentItem.disp_quantity]);

    // Check if user has entered any data at all
    const hasAnyData = useCallback(() => {
        return (
            currentItem.grns_gr_no ||
            currentItem.grnItems_item_id ||
            currentItem.grnItems_id ||
            (currentItem.disp_quantity ?? 0) > 0
        );
    }, [currentItem.grns_gr_no, currentItem.grnItems_item_id, currentItem.grnItems_id, currentItem.disp_quantity]);

    // Clear current item form (without saving)
    const handleClearCurrentItem = useCallback(() => {
        if (!hasAnyData()) {
            return;
        }

        if (hasSignificantData()) {
            // Lot selected + quantity entered - confirm before clearing
            setShowClearItemDialog(true);
        } else {
            // Only partial data - clear without confirmation
            resetEditState();
        }
    }, [hasAnyData, hasSignificantData]);

    const handleClearItemConfirm = () => {
        setShowClearItemDialog(false);
        resetEditState();
    };

    // Get navigation routes
    const getNextRoute = () =>
        isCreateMode ? '/dispatch-form/step3' : `/dispatch-edit/${id}/step3`;

    // Handle back navigation
    const handleBack = () => {
        if (savedItems.length > 0 || isCurrentItemValid) {
            setShowUnsavedBackDialog(true);
        } else {
            navigateToStep(1);
        }
    };

    const handleUnsavedBackConfirm = async () => {
        setShowUnsavedBackDialog(false);
        await navigateToStep(1);
    };

    // Handle next navigation
    const handleNext = async () => {
        const isEditing = editingItemId !== null;

        if (savedItems.length === 0 && !isCurrentItemValid) {
            Alert.alert('No Items', 'Please add at least one item before proceeding.', [{ text: 'OK' }]);
            return;
        }

        if (isCurrentItemValid) {
            const validation = await validateSingleItem(currentItem);

            if (!validation.isValid) {
                setValidationErrors(validation.errors);
                Alert.alert('Validation Error', 'Please fill in all required fields correctly');
                return;
            }

            const otherItems = isEditing
                ? savedItems.filter((item) => item.unique_id !== editingItemId)
                : savedItems;
            const allItems = [...otherItems, currentItem as DispatchItemData];
            const duplicateCheck = checkDuplicateLots(allItems);

            if (duplicateCheck.hasDuplicates) {
                Alert.alert(
                    'Duplicate Lot',
                    'This lot has already been added. Each lot can only be dispatched once.'
                );
                return;
            }

            if (isEditing) {
                updateFormItem(editingItemId, currentItem as DispatchItemData);
            } else {
                addFormItems([currentItem as DispatchItemData]);
            }
            // Haptic feedback on proceed to next step
            Vibration.vibrate(5);
            setEditingItemId(null);
            setOriginalDispatchedQty(0);
        }

        console.log('[DispatchItemsStep] Navigating to step3 via hook');
        await navigateToStep(3);
    };

    // Calculate editing item number for display
    const editingIndex = editingItemId
        ? savedItems.findIndex((item) => item.unique_id === editingItemId)
        : -1;
    const editingItemNumber = editingIndex >= 0 ? editingIndex + 1 : 1;
    const isEditingItem = editingItemId !== null;

    // Handle step indicator press for navigation
    const handleStepIndicatorPress = async (stepNumber: number) => {
        if (stepNumber === DISPATCH_STEP_NUMBERS.ITEMS) return; // Already on this step
        if (stepNumber === DISPATCH_STEP_NUMBERS.INFO) {
            // Go back to step 1
            await navigateToStep(1);
        } else if (stepNumber === DISPATCH_STEP_NUMBERS.REVIEW) {
            // Go to step 3 if we have items
            if (savedItems.length > 0) {
                await navigateToStep(3);
            }
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
            <DispatchStepIndicator
                steps={DISPATCH_STEPS}
                currentStep={DISPATCH_STEP_NUMBERS.ITEMS}
                completedSteps={getDispatchCompletedSteps(DISPATCH_STEP_NUMBERS.ITEMS)}
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

            {/* Hero Banner */}
            <View style={[styles.heroBanner, isEditingItem && styles.heroBannerEditing]}>
                <TouchableOpacity
                    style={styles.heroTitleContainer}
                    onPress={() => {
                        if (savedItems.length > 0) {
                            Keyboard.dismiss();
                            setTimeout(() => setShowSummaryBottomSheet(true), 100);
                        }
                    }}
                    activeOpacity={savedItems.length > 0 ? 0.7 : 1}
                >
                    <View style={[styles.heroItemBadge, isEditingItem && styles.heroItemBadgeEditing]}>
                        <Text style={styles.heroItemBadgeText}>
                            {isEditingItem ? editingItemNumber : savedItems.length + 1}
                        </Text>
                    </View>
                    <View style={styles.heroTextContainer}>
                        <Text style={styles.heroTitle}>
                            {isEditingItem
                                ? `Editing Item ${editingItemNumber}`
                                : savedItems.length === 0
                                    ? 'Adding Item 1'
                                    : `Adding Item ${savedItems.length + 1}`}
                        </Text>
                        {savedItems.length > 0 && (
                            <View style={styles.heroSubtitleContainer}>
                                <Icon name="eye" size={14} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.heroSubtitle}>
                                    View All {savedItems.length} {savedItems.length === 1 ? 'item' : 'items'}
                                </Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
                {/* Clear button - only show when form has data and not in edit mode */}
                {!isEditingItem && hasAnyData() && (
                    <TouchableOpacity
                        style={styles.clearPillButton}
                        onPress={handleClearCurrentItem}
                        activeOpacity={0.8}
                    >
                        <Icon name="close" size={20} color={theme.colors.white} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.addPillButton, (!isCurrentItemValid || isAddingItem) && styles.addPillButtonDisabled]}
                    onPress={handleAddItem}
                    activeOpacity={0.8}
                    disabled={!isCurrentItemValid || isAddingItem}
                >
                    {isAddingItem ? (
                        <ActivityIndicator size="small" color={theme.colors.white} />
                    ) : (
                        <Icon name="check" size={24} color={theme.colors.white} />
                    )}
                </TouchableOpacity>
            </View>

            <SwipeableFormStep
                onSwipeLeft={handleNext}
                onSwipeRight={() => navigateToStep(1)}
                canSwipeLeft={true}
                canSwipeRight={true}
            >
                <KeyboardAwareScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    enableOnAndroid={true}
                    enableAutomaticScroll={true}
                    extraScrollHeight={Platform.OS === 'android' ? 350 : 250}
                    keyboardOpeningTime={0}
                    extraHeight={300}
                >
                    {/* Edit Mode Banner (edit mode only) */}
                    {!isCreateMode && isEditingItem && (
                        <View style={styles.editModeBanner}>
                            <Icon name="pencil" size={20} color={theme.colors.white} />
                            <View style={styles.editModeBannerText}>
                                <Text style={styles.editModeBannerTitle}>Editing Item</Text>
                                <Text style={styles.editModeBannerSubtitle}>
                                    {currentItem.grnItems_item_name} ({currentItem.grns_gr_no})
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleCancelEdit}
                                style={styles.editModeCancelButton}
                                activeOpacity={0.7}
                            >
                                <Icon name="close" size={20} color={theme.colors.white} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* GR No Selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.gray600 }]}>
                            GR NO<Text style={[styles.required, { color: colors.error }]}> *</Text>
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.inputContainer,
                                { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider },
                                validationErrors.grns_gr_no && { borderColor: colors.error, borderWidth: 2 },
                            ]}
                            onPress={() => setShowGRNBottomSheet(true)}
                            activeOpacity={0.7}
                        >
                            <Icon
                                name="clipboard-text"
                                size={20}
                                color={colors.gray400}
                                style={styles.inputIcon}
                            />
                            <Text
                                style={[styles.selectorText, { color: colors.gray900 }, !currentItem.grns_gr_no && { color: colors.gray400 }]}
                                numberOfLines={1}
                            >
                                {currentItem.grns_gr_no || 'Select GR No'}
                            </Text>
                            <Icon name="chevron-down" size={20} color={colors.gray400} />
                        </TouchableOpacity>
                        {validationErrors.grns_gr_no && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.grns_gr_no}</Text>
                        )}
                    </View>

                    {/* Item Selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.gray600 }]}>
                            ITEM<Text style={[styles.required, { color: colors.error }]}> *</Text>
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.inputContainer,
                                { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider },
                                !selectedGRN && { backgroundColor: colors.gray50, opacity: 0.6 },
                                validationErrors.grnItems_item_id && { borderColor: colors.error, borderWidth: 2 },
                            ]}
                            onPress={() => selectedGRN && setShowItemBottomSheet(true)}
                            disabled={!selectedGRN}
                            activeOpacity={0.7}
                        >
                            <Icon
                                name="package-variant"
                                size={20}
                                color={colors.gray400}
                                style={styles.inputIcon}
                            />
                            <Text
                                style={[
                                    styles.selectorText,
                                    { color: colors.gray900 },
                                    !currentItem.grnItems_item_name && { color: colors.gray400 },
                                ]}
                                numberOfLines={1}
                            >
                                {currentItem.grnItems_item_name || 'Select item'}
                            </Text>
                            <Icon name="chevron-down" size={20} color={colors.gray400} />
                        </TouchableOpacity>
                        {validationErrors.grnItems_item_id && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.grnItems_item_id}</Text>
                        )}
                    </View>

                    {/* Lot Selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.gray600 }]}>
                            LOT<Text style={[styles.required, { color: colors.error }]}> *</Text>
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.inputContainer,
                                { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider },
                                !currentItem.grnItems_item_id && { backgroundColor: colors.gray50, opacity: 0.6 },
                                validationErrors.grnItems_id && { borderColor: colors.error, borderWidth: 2 },
                            ]}
                            onPress={() => currentItem.grnItems_item_id && setShowLotBottomSheet(true)}
                            disabled={!currentItem.grnItems_item_id}
                            activeOpacity={0.7}
                        >
                            <Icon name="layers" size={20} color={colors.gray400} style={styles.inputIcon} />
                            <Text
                                style={[styles.selectorText, { color: colors.gray900 }, !currentItem.grnItems_id && { color: colors.gray400 }]}
                                numberOfLines={1}
                            >
                                {currentItem.grnItems_id
                                    ? `Qty: ${currentItem.grnItems_quantity ?? 0} · Stock: ${currentItem.grnItems_stock ?? 0}`
                                    : 'Select lot'}
                            </Text>
                            <Icon name="chevron-down" size={20} color={colors.gray400} />
                        </TouchableOpacity>
                        {validationErrors.grnItems_id && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.grnItems_id}</Text>
                        )}
                    </View>

                    {/* Quantity Input - Now after Lot selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.gray600 }]}>
                            DISPATCH QUANTITY<Text style={[styles.required, { color: colors.error }]}> *</Text>
                        </Text>

                        {currentItem.grnItems_id && (
                            <View style={[styles.stockDisplayCard, { backgroundColor: colors.tealLight }]}>
                                {/* Show "Dispatching From" when GRN customer differs from dispatch customer */}
                                {currentItem.grns_customer_name &&
                                 header.customer_name &&
                                 currentItem.grns_customer_name !== header.customer_name && (
                                    <View style={[styles.dispatchingFromRow, { borderBottomColor: colors.warningLight }]}>
                                        <Icon name="swap-horizontal" size={16} color={colors.warning} />
                                        <Text style={[styles.dispatchingFromText, { color: colors.warning }]}>
                                            Dispatching From:{' '}
                                            <Text style={[styles.dispatchingFromValue, { color: colors.warning }]}>{currentItem.grns_customer_name}</Text>
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.stockInfoRow}>
                                    <Icon name="database" size={18} color={colors.teal} />
                                    <Text style={[styles.stockDisplayText, { color: colors.teal }]}>
                                        In Stock:{' '}
                                        <Text style={[styles.stockDisplayValue, { color: colors.teal }]}>{currentItem.grnItems_stock ?? 0}</Text>
                                    </Text>
                                    {(currentItem.disp_quantity ?? 0) > 0 && (
                                        <>
                                            <Text style={[styles.stockDisplaySeparator, { color: colors.teal }]}>•</Text>
                                            <Text style={[styles.stockDisplayText, { color: colors.teal }]}>
                                                Remaining: <Text style={[styles.stockDisplayValue, { color: colors.teal }]}>{displayStock}</Text>
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </View>
                        )}

                        <View style={styles.quantityRow}>
                            <View style={[styles.inputContainer, styles.quantityInputContainer, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
                                <Icon
                                    name="counter"
                                    size={20}
                                    color={colors.gray400}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    ref={quantityInputRef}
                                    style={[
                                        styles.input,
                                        { color: colors.gray900 },
                                        !currentItem.grnItems_id && { backgroundColor: colors.gray50, opacity: 0.6 },
                                        validationErrors.disp_quantity && { borderColor: colors.error, borderWidth: 2 },
                                        (currentItem.disp_quantity ?? 0) > maxAllowedQty && { borderColor: colors.error, borderWidth: 2 },
                                    ]}
                                    value={
                                        (currentItem.disp_quantity ?? 0) > 0 ? (currentItem.disp_quantity ?? 0).toString() : ''
                                    }
                                    onChangeText={handleQuantityChange}
                                    placeholder="Qty"
                                    placeholderTextColor={colors.gray400}
                                    keyboardType="numeric"
                                    editable={!!currentItem.grnItems_id}
                                    onFocus={() => {
                                        setTimeout(() => {
                                            scrollViewRef.current?.scrollToFocusedInput(quantityInputRef.current);
                                        }, 100);
                                    }}
                                />
                            </View>
                            <View style={styles.quickButtons}>
                                <TouchableOpacity
                                    style={[styles.quickButton, styles.quickButtonMinus, { backgroundColor: colors.gray100 }]}
                                    onPress={() => handleQuickQuantityChange(-10)}
                                    disabled={!currentItem.grnItems_id}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.quickButtonText, { color: colors.error }]}>-10</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.quickButton, styles.quickButtonMinus, { backgroundColor: colors.gray100 }]}
                                    onPress={() => handleQuickQuantityChange(-5)}
                                    disabled={!currentItem.grnItems_id}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.quickButtonText, { color: colors.error }]}>-5</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.quickButton, styles.quickButtonPlus, { backgroundColor: colors.primaryLight }]}
                                    onPress={() => handleQuickQuantityChange(5)}
                                    disabled={!currentItem.grnItems_id}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.quickButtonText, { color: colors.primary }]}>+5</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.quickButton, styles.quickButtonPlus, { backgroundColor: colors.primaryLight }]}
                                    onPress={() => handleQuickQuantityChange(10)}
                                    disabled={!currentItem.grnItems_id}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.quickButtonText, { color: colors.primary }]}>+10</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {(currentItem.disp_quantity ?? 0) > maxAllowedQty && (
                            <Text style={[styles.errorText, { color: colors.error }]}>
                                Quantity exceeds {isEditingItem ? 'original' : 'available'} stock ({maxAllowedQty})
                            </Text>
                        )}
                        {validationErrors.disp_quantity && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.disp_quantity}</Text>
                        )}
                    </View>

                    {/* Lot Details - In Stock moved to first */}
                    {currentItem.grnItems_id && (
                        <View style={[styles.lotDetailsCard, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
                            <Text style={[styles.lotDetailsTitle, { color: colors.gray900 }]}>Lot Details</Text>
                            <View style={styles.lotDetailsGrid}>
                                <View style={styles.detailItem}>
                                    <Icon name="package" size={16} color={colors.gray500} />
                                    <Text style={[styles.detailLabel, { color: colors.gray600 }]}>In Stock:</Text>
                                    <Text style={[styles.detailValue, { color: colors.success }]}>
                                        {currentItem.grnItems_stock}
                                    </Text>
                                </View>
                                {currentItem.grnItems_package_mark && (
                                    <View style={styles.detailItem}>
                                        <Icon name="label" size={16} color={colors.gray500} />
                                        <Text style={[styles.detailLabel, { color: colors.gray600 }]}>Package Mark:</Text>
                                        <Text style={[styles.detailValue, { color: colors.gray900 }]}>{currentItem.grnItems_package_mark}</Text>
                                    </View>
                                )}
                                {currentItem.grnItems_rack && (
                                    <View style={styles.detailItem}>
                                        <Icon name="warehouse" size={16} color={colors.gray500} />
                                        <Text style={[styles.detailLabel, { color: colors.gray600 }]}>Rack:</Text>
                                        <Text style={[styles.detailValue, { color: colors.gray900 }]}>{currentItem.grnItems_rack}</Text>
                                    </View>
                                )}
                                <View style={styles.detailItem}>
                                    <Icon name="weight" size={16} color={colors.gray500} />
                                    <Text style={[styles.detailLabel, { color: colors.gray600 }]}>Weight:</Text>
                                    <Text style={[styles.detailValue, { color: colors.gray900 }]}>{currentItem.grnItems_weight} kg</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </KeyboardAwareScrollView>
            </SwipeableFormStep>

            {/* Bottom Sheets */}
            <GRNAutocompleteBottomSheet
                isVisible={showGRNBottomSheet}
                onClose={() => setShowGRNBottomSheet(false)}
                onSelect={handleGRNSelect}
                currentValue={
                    currentItem.grns_id && currentItem.grns_gr_no
                        ? { id: currentItem.grns_id, gr_no: currentItem.grns_gr_no }
                        : undefined
                }
                customerId={header.customer_id}
            />

            <GRNItemBottomSheet
                isVisible={showItemBottomSheet}
                onClose={() => setShowItemBottomSheet(false)}
                onSelect={handleItemSelect}
                items={selectedGRN?.items || []}
                currentValue={
                    currentItem.grnItems_item_id && currentItem.grnItems_item_name
                        ? { item_id: currentItem.grnItems_item_id, item_name: currentItem.grnItems_item_name }
                        : undefined
                }
            />

            <LotBottomSheet
                isVisible={showLotBottomSheet}
                onClose={() => setShowLotBottomSheet(false)}
                onSelect={handleLotSelect}
                lots={lotsForSelectedItem}
                currentValue={currentItem.grnItems_id ? { id: currentItem.grnItems_id } : undefined}
                grnInfo={selectedGRN ? { id: selectedGRN.id, gr_no: selectedGRN.gr_no } : undefined}
                addedLotIds={addedLotIds}
            />

            <ItemsSummaryBottomSheet
                isVisible={showSummaryBottomSheet}
                onClose={() => setShowSummaryBottomSheet(false)}
                items={savedItems}
                onDeleteItem={handleDeleteItem}
                onEditItem={handleEditItem}
                editingItemId={editingItemId ?? undefined}
            />

            {/* Dark mode compliant confirmation dialogs */}
            <ConfirmDialog
                visible={showDiscardDialog}
                title="Discard Changes?"
                message={`You have ${savedItems.length} item(s) that will be lost. Are you sure you want to leave?`}
                confirmText="Discard"
                cancelText="Stay"
                onConfirm={handleDiscardConfirm}
                onCancel={() => setShowDiscardDialog(false)}
                variant="danger"
                icon="trash-outline"
            />

            <ConfirmDialog
                visible={showClearItemDialog}
                title="Clear Current Item?"
                message="This will discard all entered data for this item."
                confirmText="Clear"
                cancelText="Cancel"
                onConfirm={handleClearItemConfirm}
                onCancel={() => setShowClearItemDialog(false)}
                variant="warning"
                icon="close-circle-outline"
            />

            <ConfirmDialog
                visible={showUnsavedBackDialog}
                title="Unsaved Changes"
                message="You have unsaved items. Go back anyway?"
                confirmText="Go Back"
                cancelText="Stay"
                onConfirm={handleUnsavedBackConfirm}
                onCancel={() => setShowUnsavedBackDialog(false)}
                variant="warning"
                icon="arrow-back-circle-outline"
            />

            <ConfirmDialog
                visible={showUnsavedEditDialog}
                title="Unsaved Changes"
                message="You have unsaved changes to this item. Discard them?"
                confirmText="Discard"
                cancelText="Keep Editing"
                onConfirm={handleUnsavedEditDiscard}
                onCancel={() => setShowUnsavedEditDialog(false)}
                variant="warning"
                icon="alert-circle-outline"
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: theme.spacing.lg,
        paddingBottom: 150,
    },
    formSection: {
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.lg,
    },
    formGroup: {
        marginBottom: theme.spacing.xl,
    },
    label: {
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.semibold,
        marginBottom: theme.spacing.sm,
    },
    required: {
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: theme.borderRadius.lg,
        minHeight: theme.touchTarget.minimum,
        paddingHorizontal: theme.spacing.md,
    },
    inputIcon: {
        marginRight: theme.spacing.sm,
    },
    input: {
        flex: 1,
        fontSize: theme.fontSize.base,
        padding: 0,
        ...Platform.select({
            android: {
                textAlignVertical: 'center',
                includeFontPadding: false,
            },
        }),
    },
    selectorText: {
        flex: 1,
        fontSize: theme.fontSize.base,
    },
    quantityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    quantityInputContainer: {
        flex: 1,
    },
    quickButtons: {
        flexDirection: 'row',
        gap: 4,
    },
    quickButton: {
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.md,
        minWidth: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickButtonMinus: {
    },
    quickButtonPlus: {
    },
    quickButtonText: {
        fontSize: 13,
        fontWeight: '700',
    },
    errorText: {
        fontSize: theme.fontSize.xs,
        marginTop: theme.spacing.xs,
    },
    heroBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.primary,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
    },
    heroBannerEditing: {
        backgroundColor: theme.colors.blue[500],
    },
    heroTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        flex: 1,
    },
    heroItemBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroItemBadgeEditing: {
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
    heroItemBadgeText: {
        fontSize: theme.fontSize.base,
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.white,
    },
    heroTextContainer: {
        flex: 1,
    },
    heroTitle: {
        fontSize: theme.fontSize.lg,
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.white,
    },
    heroSubtitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginTop: 2,
    },
    heroSubtitle: {
        fontSize: theme.fontSize.xs,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: theme.fontWeight.medium,
    },
    addPillButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addPillButtonDisabled: {
        opacity: 0.4,
    },
    clearPillButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.sm,
    },
    editModeBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.blue[600],
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing.lg,
        gap: theme.spacing.md,
    },
    editModeBannerText: {
        flex: 1,
    },
    editModeBannerTitle: {
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.semibold,
        color: theme.colors.white,
    },
    editModeBannerSubtitle: {
        fontSize: theme.fontSize.xs,
        color: theme.colors.blue[100],
        marginTop: 2,
    },
    editModeCancelButton: {
        padding: theme.spacing.xs,
    },
    lotDetailsCard: {
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.lg,
        borderWidth: 1,
        borderColor: theme.colors.gray[200],
    },
    lotDetailsTitle: {
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.semibold,
        color: theme.colors.gray[900],
        marginBottom: theme.spacing.md,
    },
    lotDetailsGrid: {
        gap: theme.spacing.sm,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    detailLabel: {
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.medium,
        color: theme.colors.gray[600],
        minWidth: 100,
    },
    detailValue: {
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.semibold,
        color: theme.colors.gray[900],
        flex: 1,
    },
    stockValue: {
        color: theme.colors.semantic.success,
    },
    stockDisplayCard: {
        flexDirection: 'column',
        backgroundColor: theme.colors.blue[50],
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.md,
    },
    dispatchingFromRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.orange[200],
        marginBottom: theme.spacing.xs,
    },
    dispatchingFromText: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.orange[700],
    },
    dispatchingFromValue: {
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.orange[800],
    },
    stockInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
    },
    stockDisplayText: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.blue[800],
    },
    stockDisplayValue: {
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.blue[900],
    },
    stockDisplaySeparator: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.blue[600],
        marginHorizontal: theme.spacing.xs,
    },
});

export default DispatchItemsStep;
