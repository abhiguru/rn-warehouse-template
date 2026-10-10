import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Keyboard,
  Vibration,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useThemedStyles } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  GRNItemData,
  GRNImageData,
  addItem,
  updateItem,
  removeItem,
  addItemImage,
  completeItemImageUpload,
  failItemImageUpload,
  removeItemImage,
  setCurrentStep,
  setValidationErrors,
  selectGRNFormItems,
  selectGRNFormHeader,
  selectGRNFormId,
  selectGRNTempId,
} from '@/store/slices/grnFormSlice';
import { useGRNForm } from '@/hooks';
import * as ImagePicker from 'expo-image-picker';
import { withNativeHandoff } from '@/config/nativeHandoff';
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import WizardBottomBar from '@/components/WizardBottomBar';
import { GRN_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { deleteGRNImage, uploadGRNItemImage, validateImageFile } from '@/features/grn/services/imageUploadService';
import { isTemporaryGRNImageId } from '@/features/grn/services/imageId';
import ItemsSummaryBottomSheet from '@/features/grn/components/ItemsSummaryBottomSheet';
import { HorizontalItemForm, ItemFormData, HorizontalItemFormRef } from '@/features/grn/components/HorizontalItemForm';
import {
  validateStep2,
  isValidReceiptQuantity,
  parseReceiptQuantity,
  parseReceiptWeight,
} from '@/features/grn/schemas/grnValidation';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
const EMPTY_GRN_ITEM = (): ItemFormData => ({
  grn_trl_id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  item_table_id: '',
  item_name: '',
  packaging: '',
  qty: '',
  weight: '',
  rack: '',
  package_mark: '',
  trl_images: [],
  errors: {},
});

type GrnItemsStepProps = {
  mode: 'create' | 'edit';
};

export function GrnItemsStep({ mode }: GrnItemsStepProps) {
  const styles = useThemedStyles(makeStyles);

  // Extract ID from URL params for edit mode
  const { id } = useLocalSearchParams<{ id: string }>();

  // Use consolidated form hook for shared logic
  const {
    header,
    items,
    grnId,
    tempGrnId,
    isCreateMode,
    resetFormState,
  } = useGRNForm({ mode, grnIdParam: id });

  const dispatch = useAppDispatch();

  const [localValidationErrors, setLocalValidationErrors] = useState<Record<string, string>>({});
  const [showItemsSummarySheet, setShowItemsSummarySheet] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentItem, setCurrentItem] = useState<ItemFormData>(EMPTY_GRN_ITEM);
  const [savedItems, setSavedItems] = useState<ItemFormData[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Map of grn_trl_id -> original stock value for items with dispatches
  const [itemsWithDispatchesOnLoad, setItemsWithDispatchesOnLoad] = useState<Map<string, number>>(new Map());

  const hasSyncedFromRedux = useRef(false);
  const formRef = useRef<HorizontalItemFormRef>(null);

  const getNewItemWithRack = useCallback(() => {
    const newItem = EMPTY_GRN_ITEM();
    if (savedItems.length > 0 && savedItems[0].rack) {
      newItem.rack = savedItems[0].rack;
      console.log('[GrnItemsStep] Auto-populating rack from first item:', savedItems[0].rack);
    }
    return newItem;
  }, [savedItems]);

  const isCurrentItemValid = useMemo(() => {
    const isRackValid = (rack: string) => {
      if (!rack || rack.trim() === '') return true;
      // Allow two formats:
      // 1. floor/chamber only: e.g., "F1/C4", "BASE/Anti-Ch"
      // 2. rack/floor/chamber: e.g., "20B/F1/C4", "20B-20C/BASE/C7"
      const floorChamberOnlyPattern = /^(BASE|F1|F2|F3|F4)\/(C4|C7|C2|Anti-Ch)$/;
      const fullPattern = /^.+\/(BASE|F1|F2|F3|F4)\/(C4|C7|C2|Anti-Ch)$/;
      return floorChamberOnlyPattern.test(rack) || fullPattern.test(rack);
    };

    return !!(
      currentItem.item_table_id &&
      currentItem.item_name &&
      currentItem.qty &&
      isValidReceiptQuantity(currentItem.qty) &&
      isRackValid(currentItem.rack)
    );
  }, [currentItem.item_table_id, currentItem.item_name, currentItem.qty, currentItem.rack]);

  const editingItemNumber = useMemo(() => {
    if (!editingItemId) return 0;
    const index = savedItems.findIndex((item) => item.grn_trl_id === editingItemId);
    return index >= 0 ? index + 1 : 0;
  }, [editingItemId, savedItems]);

  const currentItemHasDispatches = useMemo(() => {
    if (!editingItemId || isCreateMode) return false;
    return itemsWithDispatchesOnLoad.has(editingItemId);
  }, [editingItemId, itemsWithDispatchesOnLoad, isCreateMode]);

  const handleQtyLockedPress = useCallback(() => {
    showAlert(
      tr('grn.itemsStep.qtyLockedTitle'),
      tr('grn.itemsStep.qtyLockedMessage')
    );
  }, []);

  const hasUnsavedData = () => savedItems.length > 0 || items.length > 0;

  const handleCancel = () => {
    const confirmDiscard = () => {
      resetFormState();
      // Always navigate to GRN list directly, not back one step
      router.replace('/grn');
    };

    if (hasUnsavedData()) {
      showAlert(
        isCreateMode ? tr('grn.form.discardTitle') : tr('grn.form.discardChangesTitle'),
        tr('grn.itemsStep.itemsWillBeLost', { count: savedItems.length || items.length }),
        [
          { text: tr('common.keepEditing'), style: 'cancel' },
          {
            text: isCreateMode ? tr('grn.form.discardGrn') : tr('grn.form.discardChanges'),
            style: 'destructive',
            onPress: confirmDiscard,
          },
        ]
      );
    } else {
      confirmDiscard();
    }
  };

  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);

      if (items.length > 0) {
        // Update dispatched items map, preserving existing entries (original stock values)
        if (!isCreateMode) {
          setItemsWithDispatchesOnLoad((prevMap) => {
            const newMap = new Map(prevMap);
            items.forEach((item) => {
              // Only add new items with dispatches, preserve existing entries
              if (item.qty !== item.stock && !newMap.has(item.grn_trl_id)) {
                newMap.set(item.grn_trl_id, item.stock);
                console.log('[GrnItemsStep] Item has dispatches:', item.grn_trl_id, 'qty:', item.qty, 'original stock:', item.stock);
              }
            });
            return newMap;
          });
        }

        const syncedItems: ItemFormData[] = items.map((item) => ({
          grn_trl_id: item.grn_trl_id,
          item_table_id: item.item_table_id,
          item_name: item.item_name,
          packaging: item.packaging,
          qty: item.qty.toString(),
          weight: item.weight.toString(),
          rack: item.rack,
          package_mark: item.package_mark,
          trl_images: item.trl_images || [],
          errors: {},
        }));
        setSavedItems(syncedItems);
        hasSyncedFromRedux.current = true;

        if (!editingItemId) {
          const newItem = EMPTY_GRN_ITEM();
          if (syncedItems.length > 0 && syncedItems[0].rack) {
            newItem.rack = syncedItems[0].rack;
          }
          setCurrentItem(newItem);
        }
      } else if (!isCreateMode) {
        setItemsWithDispatchesOnLoad(new Map());
      }

      return () => { };
    }, [items, editingItemId, isCreateMode])
  );

  const zeroItemsHandledRef = useRef(false);

  useEffect(() => {
    if (items.length === 0) {
      if (zeroItemsHandledRef.current) {
        return;
      }
      zeroItemsHandledRef.current = true;

      const defaultRack = savedItems.length > 0 ? savedItems[0].rack : '';
      setSavedItems([]);
      const newItem = EMPTY_GRN_ITEM();
      if (defaultRack) {
        newItem.rack = defaultRack;
      }
      setCurrentItem(newItem);
    } else {
      zeroItemsHandledRef.current = false;
    }
  }, [items.length, savedItems]);

  const updateFormField = (field: keyof ItemFormData, value: string) => {
    setCurrentItem((prev) => {
      const updated = { ...prev, [field]: value };
      if (updated.errors[field]) {
        const errors = { ...updated.errors };
        delete errors[field];
        updated.errors = errors;
      }
      return updated;
    });
  };

  const validateCurrentItem = async (): Promise<boolean> => {
    const itemsForValidation = [{
      item_table_id: currentItem.item_table_id,
      item_name: currentItem.item_name,
      packaging: currentItem.packaging,
      // The typed text goes to the schema unchanged: its whole-number
      // transform reports empty, fractional, signed or garbled input instead
      // of coercing it to a number first.
      qty: currentItem.qty,
      stock: currentItem.qty,
      weight: currentItem.weight,
      rack: currentItem.rack,
      package_mark: currentItem.package_mark,
      trl_images: currentItem.trl_images || [],
    }];

    const validation = await validateStep2({ items: itemsForValidation });

    if (!validation.isValid) {
      const itemErrors: Record<string, string> = {};
      Object.keys(validation.errors).forEach((errorKey) => {
        if (errorKey.startsWith('items[0]')) {
          const fieldName = errorKey.replace('items[0].', '');
          itemErrors[fieldName] = validation.errors[errorKey];
        }
      });
      setCurrentItem((prev) => ({ ...prev, errors: itemErrors }));
      setLocalValidationErrors(validation.errors);
      return false;
    }

    return true;
  };

  const handleAddItem = async () => {
    const isEditing = editingItemId !== null;

    const isValid = await validateCurrentItem();
    if (!isValid) {
      showAlert(tr('grn.itemsStep.checkItemTitle'), tr('grn.itemsStep.fillRequired'));
      return;
    }

    const hasDispatches = !isCreateMode && currentItem.grn_trl_id && itemsWithDispatchesOnLoad.has(currentItem.grn_trl_id);
    const parsedQty = parseReceiptQuantity(currentItem.qty);
    if (parsedQty === null) {
      showAlert(tr('grn.itemsStep.checkItemTitle'), tr('grn.itemsStep.quantityWhole'));
      return;
    }
    // Use the original stock value from the Map (preserved from initial load)
    const originalStock = itemsWithDispatchesOnLoad.get(currentItem.grn_trl_id);
    const preservedStock = hasDispatches && originalStock !== undefined ? originalStock : parsedQty;

    const storeItem: GRNItemData = {
      grn_trl_id: currentItem.grn_trl_id,
      item_table_id: currentItem.item_table_id,
      item_name: currentItem.item_name,
      packaging: currentItem.packaging,
      qty: parsedQty,
      stock: preservedStock,
      weight: parseReceiptWeight(currentItem.weight) ?? 0,
      rack: currentItem.rack,
      package_mark: currentItem.package_mark,
      trl_images: currentItem.trl_images || [],
    };

    if (isEditing) {
      dispatch(updateItem({ grn_trl_id: editingItemId!, item: storeItem }));
      setSavedItems((prev) => prev.map((item) => (item.grn_trl_id === editingItemId ? currentItem : item)));
    } else {
      dispatch(addItem(storeItem));
      setSavedItems((prev) => [...prev, currentItem]);
    }

    setEditingItemId(null);
    setCurrentItem(getNewItemWithRack());
    setLocalValidationErrors({});
    Vibration.vibrate(10);

    // Reset scroll to Item field for next entry
    formRef.current?.resetScroll();
  };

  const handleEditItem = useCallback((item: ItemFormData) => {
    setEditingItemId(item.grn_trl_id);
    setCurrentItem({ ...item });
    setLocalValidationErrors({});
    Vibration.vibrate(10);
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    const updatedItems = savedItems.filter((item) => item.grn_trl_id !== itemId);
    setSavedItems(updatedItems);
    dispatch(removeItem(itemId));

    if (editingItemId === itemId) {
      setEditingItemId(null);
      const newItem = EMPTY_GRN_ITEM();
      if (updatedItems.length > 0 && updatedItems[0].rack) {
        newItem.rack = updatedItems[0].rack;
      }
      setCurrentItem(newItem);
    }
  }, [dispatch, editingItemId, savedItems]);

  const handleImageUploadStart = (tempImageData: GRNImageData) => {
    dispatch(addItemImage({ itemId: currentItem.grn_trl_id, imageData: tempImageData }));
    setCurrentItem((prev) => ({
      ...prev,
      trl_images: [...(prev.trl_images || []), tempImageData],
    }));
  };

  const handleImageUploadComplete = (imageData: GRNImageData, tempImageId: string) => {
    dispatch(completeItemImageUpload({
      itemId: currentItem.grn_trl_id,
      imageId: tempImageId,
      persistedImageId: imageData.id,
      imageUrl: imageData.imageUrl,
      storagePath: imageData.storagePath,
      fileSize: imageData.fileSize,
      mimeType: imageData.mimeType
    }));
    setCurrentItem((prev) => ({
      ...prev,
      trl_images: (prev.trl_images || []).map((img) => (img.id === tempImageId ? { ...img, ...imageData } : img)),
    }));
  };

  const handleImageUploadError = (error: string) => {
    dispatch(failItemImageUpload({ itemId: currentItem.grn_trl_id, imageId: '', error }));
  };

  const handleImageRemove = async (imageId: string) => {
    const image = (currentItem.trl_images || []).find((candidate) => candidate.id === imageId);
    if (image && !isTemporaryGRNImageId(image.id)) {
      const result = await deleteGRNImage(image.id, image.imageUrl);
      if (!result.success) {
        showAlert(tr('grn.photos.removeFailedTitle'), tr('common.checkConnection'));
        return;
      }
      if (result.partial) {
        showAlert(tr('grn.itemsStep.photoRemovedTitle'), tr('grn.itemsStep.photoRemovedPartial'));
      }
    }

    dispatch(removeItemImage({ itemId: currentItem.grn_trl_id, imageId }));
    setCurrentItem((prev) => ({
      ...prev,
      trl_images: (prev.trl_images || []).filter((img) => img.id !== imageId),
    }));
  };

  const processPickedImage = async (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];

      const validation = validateImageFile(asset);
      if (!validation.valid) {
        showAlert(tr('grn.itemsStep.addPhotoFailedTitle'), validation.error || tr('grn.itemsStep.chooseJpegPng'));
        return;
      }

      const tempImageData: GRNImageData = {
        id: `temp_${Date.now()}`,
        imageUrl: asset.uri,
        fileName: asset.fileName || 'item-image.jpg',
        fileSize: asset.fileSize || 0,
        mimeType: asset.mimeType || 'image/jpeg',
        uploadStatus: 'uploading',
        uploadTimestamp: new Date().toISOString(),
      };

      handleImageUploadStart(tempImageData);

      const effectiveGrnId = grnId || tempGrnId;
      if (effectiveGrnId) {
        try {
          const uploadResult = await uploadGRNItemImage(asset, effectiveGrnId, currentItem.grn_trl_id);
          const uploadedImageData: GRNImageData = {
            id: uploadResult.imageId || tempImageData.id,
            fileName: uploadResult.metadata?.fileName || 'item-image.jpg',
            imageUrl: uploadResult.imageUrl || '',
            storagePath: uploadResult.metadata?.storagePath,
            uploadStatus: uploadResult.success ? 'completed' : 'failed',
            fileSize: uploadResult.metadata?.fileSize,
            mimeType: uploadResult.metadata?.mimeType,
            uploadTimestamp: uploadResult.metadata?.uploadTimestamp,
            error: uploadResult.error,
          };
          handleImageUploadComplete(uploadedImageData, tempImageData.id);
        } catch (error) {
          console.error('[GrnItemsStep] Upload failed:', error);
        }
      }
    }
  };

  const handleCameraIconPress = () => {
    if ((currentItem.trl_images?.length || 0) >= 2) {
      showAlert(tr('grn.photos.limitTitle'), tr('grn.photos.limitEachItem', { count: 2 }));
      return;
    }

    showAlert(tr('grn.photos.addPhotoTitle'), undefined, [
      {
        text: tr('grn.photos.takePhoto'),
        onPress: async () => {
          const { status } = await withNativeHandoff(() => ImagePicker.requestCameraPermissionsAsync());
          if (status !== 'granted') {
            showAlert(tr('grn.photos.cameraAccessTitle'), tr('grn.photos.cameraAccessMessage'));
            return;
          }
          try {
            const result = await withNativeHandoff(() =>
              ImagePicker.launchCameraAsync({
                mediaTypes: 'images' as const,
                allowsEditing: false,
                quality: 0.8,
              })
            );
            await processPickedImage(result);
          } catch (error) {
            console.error('[GrnItemsStep] Camera error:', error);
          }
        },
      },
      {
        text: tr('grn.photos.chooseFromGallery'),
        onPress: async () => {
          // Note: No permissions needed - Android 13+ Photo Picker handles access
          try {
            const result = await withNativeHandoff(() =>
              ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images' as const,
                allowsEditing: false,
                quality: 0.8,
                allowsMultipleSelection: false,
              })
            );
            await processPickedImage(result);
          } catch (error) {
            console.error('[GrnItemsStep] Gallery error:', error);
          }
        },
      },
      { text: tr('common.cancel'), style: 'cancel' },
    ]);
  };

  const handlePrevious = () => {
    dispatch(setCurrentStep(1));
    router.back();
  };

  const handleNext = async () => {
    if (isNavigating) {
      return;
    }

    let allItemsToSave: ItemFormData[] = [...savedItems];

    if (currentItem.item_table_id && currentItem.qty) {
      const alreadySaved = savedItems.some((saved) => saved.grn_trl_id === currentItem.grn_trl_id);
      if (!alreadySaved) {
        const isValid = await validateCurrentItem();
        if (!isValid) {
          showAlert(tr('grn.itemsStep.checkItemTitle'), tr('grn.itemsStep.fixHighlightedAdding'));
          return;
        }
        allItemsToSave.push(currentItem);
        setSavedItems((prev) => [...prev, currentItem]);
      }
    }

    if (allItemsToSave.length === 0) {
      showAlert(tr('grn.itemsStep.addItemTitle'), tr('grn.itemsStep.addItemMessage'));
      return;
    }

    // Every saved item passed the schema when it was added; a quantity that no
    // longer parses must stop the step rather than be stored as 0.
    const parsedItems = allItemsToSave.map((itemToSave) => ({
      itemToSave,
      parsedQty: parseReceiptQuantity(itemToSave.qty),
    }));
    const unparsable = parsedItems.find(({ parsedQty }) => parsedQty === null);
    if (unparsable) {
      showAlert(
        tr('grn.itemsStep.checkItemTitle'),
        unparsable.itemToSave.item_name
          ? tr('grn.itemsStep.quantityWholeForItem', { item: unparsable.itemToSave.item_name })
          : tr('grn.itemsStep.quantityWholeEachItem')
      );
      return;
    }

    setLocalValidationErrors({});
    dispatch(setValidationErrors({}));

    parsedItems.forEach(({ itemToSave, parsedQty }) => {
      if (parsedQty === null) return;
      const existingInStore = items.find((item) => item.grn_trl_id === itemToSave.grn_trl_id);
      const hasDispatches = !isCreateMode && itemsWithDispatchesOnLoad.has(itemToSave.grn_trl_id);
      const stockValue = hasDispatches
        ? existingInStore?.stock ?? parsedQty
        : parsedQty;

      const storeItem: GRNItemData = {
        grn_trl_id: itemToSave.grn_trl_id,
        item_table_id: itemToSave.item_table_id,
        item_name: itemToSave.item_name,
        packaging: itemToSave.packaging,
        qty: parsedQty,
        stock: stockValue,
        weight: parseReceiptWeight(itemToSave.weight) ?? 0,
        rack: itemToSave.rack,
        package_mark: itemToSave.package_mark,
        trl_images: itemToSave.trl_images || [],
      };

      if (existingInStore) {
        dispatch(updateItem({ grn_trl_id: itemToSave.grn_trl_id, item: storeItem }));
      } else {
        dispatch(addItem(storeItem));
      }
    });

    dispatch(setCurrentStep(3));
    setIsNavigating(true);

    if (isCreateMode) {
      try {
        requestAnimationFrame(() => {
          router.push('/grn-form/step3');
        });
      } catch (error) {
        console.error('[GrnItemsStep] Navigation error:', error);
        setIsNavigating(false);
      }
    } else {
      if (!grnId) {
        showAlert(tr('grn.itemsStep.reviewFailedTitle'), tr('grn.form.reopenMessage'));
        setIsNavigating(false);
        return;
      }
      try {
        requestAnimationFrame(() => {
          router.push(`/grn-edit/${grnId}/step3`);
        });
      } catch (error) {
        console.error('[GrnItemsStep] Navigation error:', error);
        setIsNavigating(false);
      }
    }
  };

  const handleSwipeLeft = () => {
    if (currentItem.item_table_id && currentItem.qty) {
      const alreadySaved = savedItems.some((saved) => saved.grn_trl_id === currentItem.grn_trl_id);
      if (!alreadySaved && !editingItemId) {
        showAlert(tr('grn.itemsStep.saveItemTitle'), tr('grn.itemsStep.saveItemMessage'), [
          { text: tr('common.keepEditing'), style: 'cancel' },
          {
            text: tr('grn.itemsStep.discardItem'),
            style: 'destructive',
            onPress: () => {
              setCurrentItem(getNewItemWithRack());
              if (savedItems.length === 0) {
                showAlert(tr('grn.itemsStep.addItemTitle'), tr('grn.itemsStep.addItemMessage'));
              } else {
                handleNext();
              }
            },
          },
          {
            text: tr('grn.itemsStep.saveItem'),
            onPress: handleNext,
          },
        ]);
        return;
      }
    }
    handleNext();
  };

  const handleSwipeRight = () => {
    if (currentItem.item_table_id && currentItem.qty) {
      const alreadySaved = savedItems.some((saved) => saved.grn_trl_id === currentItem.grn_trl_id);
      if (!alreadySaved && !editingItemId) {
        showAlert(tr('grn.itemsStep.saveItemTitle'), tr('grn.itemsStep.saveItemMessage'), [
          { text: tr('common.keepEditing'), style: 'cancel' },
          {
            text: tr('grn.itemsStep.discardItem'),
            style: 'destructive',
            onPress: () => {
              setCurrentItem(getNewItemWithRack());
              handlePrevious();
            },
          },
          {
            text: tr('grn.itemsStep.saveItem'),
            onPress: async () => {
              const isValid = await validateCurrentItem();
              if (isValid) {
                await handleAddItem();
                handlePrevious();
              } else {
                showAlert(tr('grn.itemsStep.checkItemTitle'), tr('grn.itemsStep.fixHighlightedSave'));
              }
            },
          },
        ]);
        return;
      }
    }
    handlePrevious();
  };

  const handleStepIndicatorPress = useCallback((stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.ITEMS) return;
    if (stepNumber === STEP_NUMBERS.HEADER) {
      handleSwipeRight();
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      handleSwipeLeft();
    }
  }, [handleSwipeLeft, handleSwipeRight]);

  return (
    <View style={styles.container}>
      <GRNStepIndicator
        steps={GRN_STEPS}
        currentStep={STEP_NUMBERS.ITEMS}
        completedSteps={getCompletedSteps(STEP_NUMBERS.ITEMS)}
        onCancel={handleCancel}
        onStepPress={handleStepIndicatorPress}
        grnNo={header.gr_no || undefined}
        isEditMode={!isCreateMode}
      />

      <View style={styles.formContent}>
        <HorizontalItemForm
          ref={formRef}
          currentItem={currentItem}
          onFieldChange={updateFormField}
          onImagePick={handleCameraIconPress}
          onImageRemove={handleImageRemove}
          onSaveItem={handleAddItem}
          isQtyLocked={!isCreateMode && currentItemHasDispatches}
          onQtyLockedPress={handleQtyLockedPress}
          isValid={isCurrentItemValid}
          isEditing={!!editingItemId}
          editingItemNumber={editingItemNumber}
          savedItemsCount={savedItems.length}
          onViewAll={() => {
            Keyboard.dismiss();
            setTimeout(() => setShowItemsSummarySheet(true), 100);
          }}
        />
      </View>

      {/* Back and Next run the same checks as the swipe (unsaved item, validation) */}
      <WizardBottomBar
        currentStep={STEP_NUMBERS.ITEMS}
        totalSteps={GRN_STEPS.length}
        onPrevious={handleSwipeRight}
        onNext={handleSwipeLeft}
        isLoading={isNavigating}
        loadingLabel={tr('grn.itemsStep.openingReview')}
      />

      <ItemsSummaryBottomSheet
        isVisible={showItemsSummarySheet}
        onClose={() => setShowItemsSummarySheet(false)}
        items={savedItems}
        onRemoveItem={handleRemoveItem}
        onEditItem={handleEditItem}
        editingItemId={editingItemId ?? undefined}
        dispatchedItemIds={isCreateMode ? undefined : new Set(itemsWithDispatchesOnLoad.keys())}
      />
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  formContent: {
    flex: 1,
  },
});

export default GrnItemsStep;
