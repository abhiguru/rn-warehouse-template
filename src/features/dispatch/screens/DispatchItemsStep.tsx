/**
 * Dispatch Items Step - Unified Create/Edit Component
 * Single item form pattern - user fills one item at a time and saves to list
 * Uses mode prop to differentiate between create and edit flows
 *
 * Refactored to use useDispatchForm hook for form state management.
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { areAllAvailableLotsAlreadyAdded } from '@/features/dispatch/utils/lotAvailability';

import { showAlert } from '@/utils/alert';
import { formatCount, formatWeight } from '@/utils/formatters';
type DispatchItemsStepProps = {
    mode: 'create' | 'edit';
};

export function DispatchItemsStep({ mode }: DispatchItemsStepProps) {
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();
    const insets = useSafeAreaInsets();

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
                    showAlert("Couldn't load the GRN", 'Check your connection and try again.');
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
                showAlert("Couldn't load the GRN", getUserFriendlyError('grn', 'load'));
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

    const allAvailableLotsAlreadyAdded = useMemo(
        () =>
            editingItemId === null &&
            selectedGRN !== null &&
            areAllAvailableLotsAlreadyAdded(selectedGRN.items, addedLotIds),
        [addedLotIds, editingItemId, selectedGRN]
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
                showAlert('Check the item', 'Fix the fields marked in red, then try again.');
                return;
            }

            // Check for duplicate lots
            const otherItems = isEditing
                ? savedItems.filter((item) => item.unique_id !== editingItemId)
                : savedItems;
            const allItems = [...otherItems, currentItem as DispatchItemData];
            const duplicateCheck = checkDuplicateLots(allItems);

            if (duplicateCheck.hasDuplicates) {
                showAlert(
                    'Lot already added',
                    'This lot is already in the dispatch. Each lot can be dispatched once.'
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
            showAlert('Check the item', 'Fix the fields marked in red before you save.');
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
            showAlert('Add an item first', 'Add at least one item before you continue.');
            return;
        }

        if (isCurrentItemValid) {
            const validation = await validateSingleItem(currentItem);

            if (!validation.isValid) {
                setValidationErrors(validation.errors);
                showAlert('Check the item', 'Fix the fields marked in red, then try again.');
                return;
            }

            const otherItems = isEditing
                ? savedItems.filter((item) => item.unique_id !== editingItemId)
                : savedItems;
            const allItems = [...otherItems, currentItem as DispatchItemData];
            const duplicateCheck = checkDuplicateLots(allItems);

            if (duplicateCheck.hasDuplicates) {
                showAlert(
                    'Lot already added',
                    'This lot is already in the dispatch. Each lot can be dispatched once.'
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

    const exceedsMax = (currentItem.disp_quantity ?? 0) > maxAllowedQty;
    const quantityHasError = !!validationErrors.disp_quantity || exceedsMax;
    const canSaveItem = !!isCurrentItemValid && !isAddingItem;
    const itemTitle = isEditingItem
        ? `Editing item ${editingItemNumber}`
        : `Adding item ${savedItems.length + 1}`;

    const renderError = (message?: string) =>
        message ? (
            <View style={styles.errorRow} accessibilityRole="alert">
                <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
                <Text style={styles.errorText}>{message}</Text>
            </View>
        ) : null;

    const quickButton = (delta: number) => (
        <Pressable
            key={delta}
            style={({ pressed }) => [
                styles.quickButton,
                pressed && !!currentItem.grnItems_id && styles.quickButtonPressed,
                !currentItem.grnItems_id && styles.disabled,
            ]}
            onPress={() => handleQuickQuantityChange(delta)}
            disabled={!currentItem.grnItems_id}
            accessibilityRole="button"
            accessibilityLabel={delta > 0 ? `Add ${delta} bags` : `Remove ${-delta} bags`}
            accessibilityState={{ disabled: !currentItem.grnItems_id }}
        >
            <Text style={styles.quickButtonText}>{delta > 0 ? `+${delta}` : `−${-delta}`}</Text>
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <DispatchStepIndicator
                steps={DISPATCH_STEPS}
                currentStep={DISPATCH_STEP_NUMBERS.ITEMS}
                completedSteps={getDispatchCompletedSteps(DISPATCH_STEP_NUMBERS.ITEMS)}
                onCancel={handleCancel}
                cancelMessage={
                    isCreateMode
                        ? 'Cancel this dispatch? Everything you entered will be lost.'
                        : 'Cancel editing? Your unsaved changes will be lost.'
                }
                dispNo={header.disp_no}
                onStepPress={handleStepIndicatorPress}
                isEditMode={!isCreateMode}
            />

            {/* Item header (surface.header, no brand fill) */}
            <View style={[styles.heroBanner, isEditingItem && styles.heroBannerEditing]}>
                <Pressable
                    style={({ pressed }) => [
                        styles.heroTitleContainer,
                        pressed && savedItems.length > 0 && styles.heroTitlePressed,
                    ]}
                    onPress={() => {
                        if (savedItems.length > 0) {
                            Keyboard.dismiss();
                            setTimeout(() => setShowSummaryBottomSheet(true), 100);
                        }
                    }}
                    disabled={savedItems.length === 0}
                    accessibilityRole={savedItems.length > 0 ? 'button' : 'header'}
                    accessibilityLabel={
                        savedItems.length > 0
                            ? `${itemTitle}. View all ${formatCount(savedItems.length, 'item')}`
                            : itemTitle
                    }
                >
                    <View style={[styles.heroItemBadge, isEditingItem && styles.heroItemBadgeEditing]}>
                        <Text style={[styles.heroItemBadgeText, isEditingItem && styles.heroItemBadgeTextEditing]}>
                            {isEditingItem ? editingItemNumber : savedItems.length + 1}
                        </Text>
                    </View>
                    <View style={styles.heroTextContainer}>
                        <Text style={styles.heroTitle}>{itemTitle}</Text>
                        {savedItems.length > 0 && (
                            <View style={styles.heroSubtitleContainer}>
                                <Icon name="format-list-bulleted" size={iconSize.sm} color={t.brand.tint} />
                                <Text style={styles.heroSubtitle}>
                                    View all {formatCount(savedItems.length, 'item')}
                                </Text>
                            </View>
                        )}
                    </View>
                </Pressable>
                {/* Clear button - only show when form has data and not in edit mode */}
                {!isEditingItem && hasAnyData() && (
                    <Pressable
                        style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                        onPress={handleClearCurrentItem}
                        accessibilityRole="button"
                        accessibilityLabel="Clear this item"
                    >
                        <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
                    </Pressable>
                )}
                <Pressable
                    style={({ pressed }) => [
                        styles.addPillButton,
                        pressed && styles.addPillButtonPressed,
                        !canSaveItem && styles.disabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={isEditingItem ? 'Save item changes' : 'Save item'}
                    accessibilityState={{ disabled: !canSaveItem, busy: isAddingItem }}
                    onPress={handleAddItem}
                    disabled={!canSaveItem}
                >
                    {isAddingItem ? (
                        <ActivityIndicator size="small" color={t.brand.onFill} />
                    ) : (
                        <Icon name="check" size={iconSize.lg} color={t.brand.onFill} />
                    )}
                </Pressable>
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
                    {/* Edit Mode message strip (edit mode only) */}
                    {!isCreateMode && isEditingItem && (
                        <View style={styles.editModeBanner}>
                            <Icon name="pencil-outline" size={iconSize.md} color={t.status.informative.text} />
                            <View style={styles.editModeBannerText}>
                                <Text style={styles.editModeBannerTitle}>Editing item</Text>
                                <Text style={styles.editModeBannerSubtitle}>
                                    {currentItem.grnItems_item_name} (GRN {currentItem.grns_gr_no})
                                </Text>
                            </View>
                            <Pressable
                                onPress={handleCancelEdit}
                                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                                accessibilityRole="button"
                                accessibilityLabel="Stop editing this item"
                            >
                                <Icon name="close" size={iconSize.md} color={t.status.informative.text} />
                            </Pressable>
                        </View>
                    )}

                    {/* GRN Selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, validationErrors.grns_gr_no && styles.labelError]}>
                            GRN<Text style={styles.required}> *</Text>
                        </Text>
                        <Pressable
                            style={({ pressed }) => [
                                styles.inputContainer,
                                pressed && styles.inputPressed,
                                validationErrors.grns_gr_no && styles.inputError,
                            ]}
                            onPress={() => setShowGRNBottomSheet(true)}
                            accessibilityRole="button"
                            accessibilityLabel={`GRN, required, ${currentItem.grns_gr_no || 'not chosen'}`}
                            accessibilityHint="Opens the GRN list"
                            accessibilityState={{ busy: isLoadingGRN }}
                        >
                            <Icon
                                name="package-down"
                                size={iconSize.md}
                                color={t.icon.secondary}
                                style={styles.inputIcon}
                            />
                            <Text
                                style={[styles.selectorText, !currentItem.grns_gr_no && styles.placeholderText]}
                                numberOfLines={1}
                            >
                                {currentItem.grns_gr_no || 'Choose GRN'}
                            </Text>
                            {isLoadingGRN ? (
                                <ActivityIndicator size="small" color={t.brand.tint} />
                            ) : (
                                <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
                            )}
                        </Pressable>
                        {renderError(validationErrors.grns_gr_no)}
                    </View>

                    {/* Item Selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, validationErrors.grnItems_item_id && styles.labelError]}>
                            Item<Text style={styles.required}> *</Text>
                        </Text>
                        <Pressable
                            style={({ pressed }) => [
                                styles.inputContainer,
                                pressed && !!selectedGRN && !allAvailableLotsAlreadyAdded && styles.inputPressed,
                                (!selectedGRN || allAvailableLotsAlreadyAdded) && styles.disabled,
                                validationErrors.grnItems_item_id && styles.inputError,
                            ]}
                            onPress={() => selectedGRN && setShowItemBottomSheet(true)}
                            disabled={!selectedGRN || allAvailableLotsAlreadyAdded}
                            accessibilityRole="button"
                            accessibilityLabel={`Item, required, ${currentItem.grnItems_item_name || 'not chosen'}`}
                            accessibilityHint={selectedGRN ? 'Opens the item list' : 'Choose a GRN first'}
                            accessibilityState={{ disabled: !selectedGRN || allAvailableLotsAlreadyAdded }}
                        >
                            <Icon
                                name="cube-outline"
                                size={iconSize.md}
                                color={t.icon.secondary}
                                style={styles.inputIcon}
                            />
                            <Text
                                style={[
                                    styles.selectorText,
                                    !currentItem.grnItems_item_name && styles.placeholderText,
                                ]}
                                numberOfLines={1}
                            >
                                {currentItem.grnItems_item_name || 'Choose item'}
                            </Text>
                            <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
                        </Pressable>
                        {renderError(validationErrors.grnItems_item_id)}
                        {allAvailableLotsAlreadyAdded && selectedGRN && (
                            <View style={styles.allLotsAddedNotice}>
                                <Icon name="information" size={iconSize.md} color={t.status.informative.text} />
                                <View style={styles.allLotsAddedContent}>
                                    <Text style={styles.allLotsAddedText}>
                                        Every item from GRN {selectedGRN.gr_no} with stock is already in this dispatch.
                                    </Text>
                                    <Pressable
                                        style={({ pressed }) => [styles.viewAllItemsButton, pressed && styles.linkPressed]}
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            setShowSummaryBottomSheet(true);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`View all ${savedItems.length} dispatch items`}
                                    >
                                        <Text style={styles.viewAllItemsText}>View all items</Text>
                                        <Icon name="chevron-right" size={iconSize.sm} color={t.brand.tint} />
                                    </Pressable>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Lot Selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, validationErrors.grnItems_id && styles.labelError]}>
                            Lot<Text style={styles.required}> *</Text>
                        </Text>
                        <Pressable
                            style={({ pressed }) => [
                                styles.inputContainer,
                                pressed && !!currentItem.grnItems_item_id && styles.inputPressed,
                                !currentItem.grnItems_item_id && styles.disabled,
                                validationErrors.grnItems_id && styles.inputError,
                            ]}
                            onPress={() => currentItem.grnItems_item_id && setShowLotBottomSheet(true)}
                            disabled={!currentItem.grnItems_item_id}
                            accessibilityRole="button"
                            accessibilityLabel={`Lot, required, ${currentItem.grnItems_id
                                ? `GRN quantity ${currentItem.grnItems_quantity ?? 0}, ${currentItem.grnItems_stock ?? 0} in stock`
                                : 'not chosen'}`}
                            accessibilityHint={currentItem.grnItems_item_id ? 'Opens the lot list' : 'Choose an item first'}
                            accessibilityState={{ disabled: !currentItem.grnItems_item_id }}
                        >
                            <Icon name="layers-outline" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                            <Text
                                style={[styles.selectorText, !currentItem.grnItems_id && styles.placeholderText]}
                                numberOfLines={1}
                            >
                                {currentItem.grnItems_id
                                    ? `GRN qty ${currentItem.grnItems_quantity ?? 0} · ${currentItem.grnItems_stock ?? 0} in stock`
                                    : 'Choose lot'}
                            </Text>
                            <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
                        </Pressable>
                        {renderError(validationErrors.grnItems_id)}
                    </View>

                    {/* Quantity Input - after Lot selector */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, quantityHasError && styles.labelError]}>
                            Bags to dispatch<Text style={styles.required}> *</Text>
                        </Text>

                        {currentItem.grnItems_id && (
                            <View style={styles.stockDisplayCard}>
                                {/* Show "Dispatching from" when GRN customer differs from dispatch customer */}
                                {currentItem.grns_customer_name &&
                                 header.customer_name &&
                                 currentItem.grns_customer_name !== header.customer_name && (
                                    <View style={styles.dispatchingFromRow}>
                                        <Icon name="alert" size={iconSize.sm} color={t.status.critical.text} />
                                        <Text style={styles.dispatchingFromText}>
                                            Dispatching from another customer:{' '}
                                            <Text style={styles.dispatchingFromValue}>{currentItem.grns_customer_name}</Text>
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.stockInfoRow}>
                                    <Icon name="information" size={iconSize.sm} color={t.status.informative.text} />
                                    <Text style={styles.stockDisplayText}>
                                        In stock{' '}
                                        <Text style={styles.stockDisplayValue}>{currentItem.grnItems_stock ?? 0}</Text>
                                    </Text>
                                    {(currentItem.disp_quantity ?? 0) > 0 && (
                                        <Text style={styles.stockDisplayText}>
                                            · Left after dispatch <Text style={styles.stockDisplayValue}>{displayStock}</Text>
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}

                        <View style={styles.quantityRow}>
                            <View
                                style={[
                                    styles.inputContainer,
                                    styles.quantityInputContainer,
                                    !currentItem.grnItems_id && styles.disabled,
                                    quantityHasError && styles.inputError,
                                ]}
                            >
                                <Icon
                                    name="counter"
                                    size={iconSize.md}
                                    color={t.icon.secondary}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    ref={quantityInputRef}
                                    accessibilityLabel="Bags to dispatch"
                                    style={styles.input}
                                    value={
                                        (currentItem.disp_quantity ?? 0) > 0 ? (currentItem.disp_quantity ?? 0).toString() : ''
                                    }
                                    onChangeText={handleQuantityChange}
                                    placeholder="Bags"
                                    placeholderTextColor={t.text.placeholder}
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
                                {[-10, -5, 5, 10].map(quickButton)}
                            </View>
                        </View>
                        {exceedsMax &&
                            renderError(
                                `Enter ${maxAllowedQty} bags or fewer. That is the ${isEditingItem ? 'original' : 'available'} stock.`
                            )}
                        {renderError(validationErrors.disp_quantity)}
                    </View>

                    {/* Lot Details */}
                    {currentItem.grnItems_id && (
                        <View style={styles.lotDetailsCard}>
                            <Text style={styles.lotDetailsTitle} accessibilityRole="header">Lot details</Text>
                            <View style={styles.lotDetailsGrid}>
                                <View style={styles.detailItem}>
                                    <Icon name="warehouse" size={iconSize.sm} color={t.icon.secondary} />
                                    <Text style={styles.detailLabel}>In stock</Text>
                                    <Text style={styles.detailValue}>
                                        {formatCount(currentItem.grnItems_stock, 'bag')}
                                    </Text>
                                </View>
                                {currentItem.grnItems_package_mark && (
                                    <View style={styles.detailItem}>
                                        <Icon name="label-outline" size={iconSize.sm} color={t.icon.secondary} />
                                        <Text style={styles.detailLabel}>Package mark</Text>
                                        <Text style={styles.detailValue}>{currentItem.grnItems_package_mark}</Text>
                                    </View>
                                )}
                                {currentItem.grnItems_rack && (
                                    <View style={styles.detailItem}>
                                        <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                                        <Text style={styles.detailLabel}>Rack</Text>
                                        <Text style={styles.detailValue}>{currentItem.grnItems_rack}</Text>
                                    </View>
                                )}
                                <View style={styles.detailItem}>
                                    <Icon name="weight" size={iconSize.sm} color={t.icon.secondary} />
                                    <Text style={styles.detailLabel}>Weight</Text>
                                    <Text style={styles.detailValue}>{formatWeight(currentItem.grnItems_weight)}</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </KeyboardAwareScrollView>
            </SwipeableFormStep>

            {/* Bottom bar (guide §13.8 form chrome): Back secondary, Next primary */}
            <View style={[styles.bottomBar, { paddingBottom: space.md + insets.bottom }]}>
                <Pressable
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                    onPress={handleBack}
                    accessibilityRole="button"
                    accessibilityLabel="Back to dispatch details"
                >
                    <Icon name="chevron-left" size={iconSize.md} color={t.text.primary} />
                    <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
                <Pressable
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
                    onPress={handleNext}
                    accessibilityRole="button"
                    accessibilityLabel="Next, review dispatch"
                >
                    <Text style={styles.primaryButtonText}>Next</Text>
                    <Icon name="chevron-right" size={iconSize.md} color={t.brand.onFill} />
                </Pressable>
            </View>

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

            {/* Confirmation dialogs */}
            <ConfirmDialog
                visible={showDiscardDialog}
                title="Discard this dispatch?"
                message={`The ${formatCount(savedItems.length, 'item')} you added will be lost.`}
                confirmText="Discard dispatch"
                cancelText="Keep editing"
                onConfirm={handleDiscardConfirm}
                onCancel={() => setShowDiscardDialog(false)}
                variant="danger"
                icon="trash-can-outline"
            />

            <ConfirmDialog
                visible={showClearItemDialog}
                title="Clear this item?"
                message="The GRN, lot and bags you entered for this item will be cleared."
                confirmText="Clear item"
                cancelText="Keep item"
                onConfirm={handleClearItemConfirm}
                onCancel={() => setShowClearItemDialog(false)}
                variant="warning"
                icon="close-circle-outline"
            />

            <ConfirmDialog
                visible={showUnsavedBackDialog}
                title="Go back to details?"
                message="You have items that are not saved yet. Go back anyway?"
                confirmText="Go back"
                cancelText="Stay"
                onConfirm={handleUnsavedBackConfirm}
                onCancel={() => setShowUnsavedBackDialog(false)}
                variant="warning"
                icon="arrow-left-circle-outline"
            />

            <ConfirmDialog
                visible={showUnsavedEditDialog}
                title="Discard changes to this item?"
                message="Your changes to this item will be lost."
                confirmText="Discard changes"
                cancelText="Keep editing"
                onConfirm={handleUnsavedEditDiscard}
                onCancel={() => setShowUnsavedEditDialog(false)}
                variant="warning"
                icon="alert-circle-outline"
            />
        </View>
    );
}

const makeStyles = (t: ThemeTokens) => ({
    container: {
        flex: 1,
        backgroundColor: t.background.base,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: layout.marginCompact,
        paddingBottom: 150,
    },
    formGroup: {
        marginBottom: space.lg,
    },
    label: {
        ...typography.footnote,
        color: t.text.secondary,
        marginBottom: space.xs,
    },
    labelError: {
        color: t.status.negative.text,
    },
    required: {
        color: t.text.required,
    },
    inputContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: t.border.field,
        backgroundColor: t.surface.field,
        borderRadius: radius.field,
        minHeight: touchTarget,
        paddingHorizontal: space.md,
    },
    inputPressed: {
        backgroundColor: t.surface.cardPressed,
    },
    inputError: {
        borderWidth: 2,
        borderColor: t.status.negative.border,
        paddingHorizontal: space.md - 1,
    },
    inputIcon: {
        marginRight: space.sm,
    },
    input: {
        ...typography.body,
        flex: 1,
        color: t.text.primary,
        padding: 0,
        fontVariant: ['tabular-nums' as const],
        ...Platform.select({
            android: {
                textAlignVertical: 'center' as const,
                includeFontPadding: false,
            },
        }),
    },
    selectorText: {
        ...typography.body,
        flex: 1,
        color: t.text.primary,
    },
    placeholderText: {
        color: t.text.placeholder,
    },
    disabled: {
        opacity: t.interaction.disabledOpacity,
    },
    errorRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xs,
        marginTop: space.xs,
    },
    errorText: {
        ...typography.footnote,
        flex: 1,
        color: t.status.negative.text,
    },
    allLotsAddedNotice: {
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        gap: space.sm,
        borderWidth: 1,
        borderColor: t.status.informative.border,
        backgroundColor: t.status.informative.background,
        borderRadius: radius.button,
        padding: space.md,
        marginTop: space.sm,
    },
    allLotsAddedContent: {
        flex: 1,
        gap: space.xs,
    },
    allLotsAddedText: {
        ...typography.footnote,
        color: t.status.informative.text,
    },
    viewAllItemsButton: {
        alignSelf: 'flex-start' as const,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xxs,
        minHeight: touchTarget,
        borderRadius: radius.button,
    },
    linkPressed: {
        backgroundColor: t.brand.subtle,
    },
    viewAllItemsText: {
        ...typography.subhead,
        fontWeight: fontWeight.semibold,
        color: t.brand.tint,
    },
    quantityRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        flexWrap: 'wrap' as const,
        gap: space.sm,
    },
    quantityInputContainer: {
        flex: 1,
        minWidth: 96,
    },
    quickButtons: {
        flexDirection: 'row' as const,
        gap: space.xs,
    },
    quickButton: {
        paddingHorizontal: space.sm,
        minHeight: touchTarget,
        minWidth: touchTarget,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: t.border.button,
        backgroundColor: t.surface.card,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    quickButtonPressed: {
        backgroundColor: t.brand.subtle,
    },
    quickButtonText: {
        ...typography.subhead,
        fontWeight: fontWeight.semibold,
        color: t.brand.tint,
        fontVariant: ['tabular-nums' as const],
    },
    heroBanner: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        gap: space.sm,
        backgroundColor: t.surface.header,
        paddingHorizontal: layout.marginCompact,
        paddingVertical: space.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border.divider,
    },
    heroBannerEditing: {
        backgroundColor: t.brand.subtle,
    },
    heroTitleContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.md,
        flex: 1,
        minHeight: touchTarget,
        borderRadius: radius.button,
    },
    heroTitlePressed: {
        backgroundColor: t.surface.cardPressed,
    },
    heroItemBadge: {
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        backgroundColor: t.brand.subtle,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    heroItemBadgeEditing: {
        backgroundColor: t.brand.fill,
    },
    heroItemBadgeText: {
        ...typography.headline,
        color: t.brand.tint,
        fontVariant: ['tabular-nums' as const],
    },
    heroItemBadgeTextEditing: {
        color: t.brand.onFill,
    },
    heroTextContainer: {
        flex: 1,
    },
    heroTitle: {
        ...typography.headline,
        color: t.text.primary,
    },
    heroSubtitleContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xs,
        marginTop: space.xxs,
    },
    heroSubtitle: {
        ...typography.footnote,
        fontWeight: fontWeight.semibold,
        color: t.brand.tint,
    },
    iconButton: {
        width: touchTarget,
        height: touchTarget,
        borderRadius: radius.pill,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    iconButtonPressed: {
        backgroundColor: t.surface.cardPressed,
    },
    addPillButton: {
        width: touchTarget,
        height: touchTarget,
        borderRadius: radius.pill,
        backgroundColor: t.brand.fill,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    addPillButtonPressed: {
        backgroundColor: t.brand.fillPressed,
    },
    editModeBanner: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        backgroundColor: t.status.informative.background,
        borderWidth: 1,
        borderColor: t.status.informative.border,
        paddingLeft: space.md,
        paddingVertical: space.xs,
        borderRadius: radius.button,
        marginBottom: space.lg,
        gap: space.sm,
    },
    editModeBannerText: {
        flex: 1,
    },
    editModeBannerTitle: {
        ...typography.subhead,
        fontWeight: fontWeight.semibold,
        color: t.status.informative.text,
    },
    editModeBannerSubtitle: {
        ...typography.footnote,
        color: t.text.primary,
        marginTop: space.xxs,
    },
    lotDetailsCard: {
        backgroundColor: t.surface.card,
        borderRadius: radius.card,
        padding: space.lg,
        marginBottom: space.lg,
        ...t.shadow[2],
    },
    lotDetailsTitle: {
        ...typography.footnote,
        fontWeight: fontWeight.semibold,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
        color: t.text.secondary,
        marginBottom: space.md,
    },
    lotDetailsGrid: {
        gap: space.sm,
    },
    detailItem: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.sm,
    },
    detailLabel: {
        ...typography.subhead,
        color: t.text.secondary,
        minWidth: 100,
    },
    detailValue: {
        ...typography.subhead,
        fontWeight: fontWeight.semibold,
        color: t.text.primary,
        flex: 1,
        fontVariant: ['tabular-nums' as const],
    },
    stockDisplayCard: {
        flexDirection: 'column' as const,
        backgroundColor: t.status.informative.background,
        borderWidth: 1,
        borderColor: t.status.informative.border,
        borderRadius: radius.button,
        padding: space.md,
        gap: space.sm,
        marginBottom: space.md,
    },
    dispatchingFromRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.sm,
        paddingBottom: space.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.status.informative.border,
    },
    dispatchingFromText: {
        ...typography.footnote,
        flex: 1,
        color: t.status.critical.text,
    },
    dispatchingFromValue: {
        fontWeight: fontWeight.semibold,
    },
    stockInfoRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        flexWrap: 'wrap' as const,
        gap: space.sm,
    },
    stockDisplayText: {
        ...typography.subhead,
        color: t.status.informative.text,
    },
    stockDisplayValue: {
        fontWeight: fontWeight.semibold,
        fontVariant: ['tabular-nums' as const],
    },
    bottomBar: {
        flexDirection: 'row' as const,
        gap: space.sm,
        paddingHorizontal: layout.marginCompact,
        paddingTop: space.md,
        backgroundColor: t.surface.card,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: t.border.separator,
        ...t.shadow[3],
    },
    secondaryButton: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: space.xs,
        minHeight: touchTarget,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: t.border.button,
    },
    secondaryButtonPressed: {
        backgroundColor: t.brand.subtle,
    },
    secondaryButtonText: {
        ...typography.callout,
        color: t.text.primary,
    },
    primaryButton: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: space.xs,
        minHeight: touchTarget,
        borderRadius: radius.button,
        backgroundColor: t.brand.fill,
    },
    primaryButtonPressed: {
        backgroundColor: t.brand.fillPressed,
    },
    primaryButtonText: {
        ...typography.callout,
        fontWeight: fontWeight.semibold,
        color: t.brand.onFill,
    },
});

export default DispatchItemsStep;
