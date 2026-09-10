import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Alert,
  Keyboard,
  Vibration,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useListColors } from '@/hooks/useListColors';
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
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import { GRN_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { uploadGRNItemImage, validateImageFile } from '@/features/grn/services/imageUploadService';
import ItemsSummaryBottomSheet from '@/features/grn/components/ItemsSummaryBottomSheet';
import { HorizontalItemForm, ItemFormData, HorizontalItemFormRef } from '@/features/grn/components/HorizontalItemForm';
import { validateStep2 } from '@/features/grn/schemas/grnValidation';

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
  // Theme colors
  const colors = useListColors();

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
      parseInt(currentItem.qty) > 0 &&
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
    Alert.alert(
      'Cannot Edit Quantity',
      'This item has dispatches. Changing quantity will affect stock calculations.'
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
      Alert.alert(
        isCreateMode ? 'Discard Changes?' : 'Cancel GRN Edit',
        `You have ${savedItems.length || items.length} item(s) that will be lost. Are you sure you want to leave?`,
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: confirmDiscard },
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
      qty: parseInt(currentItem.qty) || 0,
      stock: parseInt(currentItem.qty) || 0,
      weight: parseInt(currentItem.weight) || 0,
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
      Alert.alert('Validation Error', 'Please fill in all required fields correctly');
      return;
    }

    const hasDispatches = !isCreateMode && currentItem.grn_trl_id && itemsWithDispatchesOnLoad.has(currentItem.grn_trl_id);
    const parsedQty = parseInt(currentItem.qty) || 0;
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
      weight: parseInt(currentItem.weight) || 0,
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

  const handleImageUploadComplete = (imageData: GRNImageData) => {
    dispatch(completeItemImageUpload({
      itemId: currentItem.grn_trl_id,
      imageId: imageData.id,
      imageUrl: imageData.imageUrl,
      storagePath: imageData.storagePath,
      fileSize: imageData.fileSize,
      mimeType: imageData.mimeType
    }));
    setCurrentItem((prev) => ({
      ...prev,
      trl_images: (prev.trl_images || []).map((img) => (img.id === imageData.id ? { ...img, ...imageData } : img)),
    }));
  };

  const handleImageUploadError = (error: string) => {
    dispatch(failItemImageUpload({ itemId: currentItem.grn_trl_id, imageId: '', error }));
  };

  const handleImageRemove = (imageId: string) => {
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
        Alert.alert('Invalid Image', validation.error || 'Please select a valid image');
        return;
      }

      const tempImageData: GRNImageData = {
        id: `temp-${Date.now()}`,
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
            id: uploadResult.imageId || `uploaded-${Date.now()}`,
            fileName: uploadResult.metadata?.fileName || 'item-image.jpg',
            imageUrl: uploadResult.imageUrl || '',
            storagePath: uploadResult.imageUrl,
            uploadStatus: uploadResult.success ? 'completed' : 'failed',
            fileSize: uploadResult.metadata?.fileSize,
            mimeType: uploadResult.metadata?.mimeType,
            uploadTimestamp: uploadResult.metadata?.uploadTimestamp,
            error: uploadResult.error,
          };
          handleImageUploadComplete(uploadedImageData);
        } catch (error) {
          console.error('[GrnItemsStep] Upload failed:', error);
        }
      }
    }
  };

  const handleCameraIconPress = () => {
    if ((currentItem.trl_images?.length || 0) >= 2) {
      Alert.alert('Limit Reached', 'Maximum 2 images allowed per item.');
      return;
    }

    Alert.alert('Add Image', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera permission is required');
            return;
          }
          try {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: 'images' as const,
              allowsEditing: false,
              quality: 0.8,
            });
            await processPickedImage(result);
          } catch (error) {
            console.error('[GrnItemsStep] Camera error:', error);
          }
        },
      },
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          // Note: No permissions needed - Android 13+ Photo Picker handles access
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: 'images' as const,
              allowsEditing: false,
              quality: 0.8,
              allowsMultipleSelection: false,
            });
            await processPickedImage(result);
          } catch (error) {
            console.error('[GrnItemsStep] Gallery error:', error);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
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
          Alert.alert('Validation Error', 'Please fix the errors in the current item details');
          return;
        }
        allItemsToSave.push(currentItem);
        setSavedItems((prev) => [...prev, currentItem]);
      }
    }

    if (allItemsToSave.length === 0) {
      Alert.alert('No Items', 'Please add at least one item');
      return;
    }

    setLocalValidationErrors({});
    dispatch(setValidationErrors({}));

    allItemsToSave.forEach((itemToSave) => {
      const existingInStore = items.find((item) => item.grn_trl_id === itemToSave.grn_trl_id);
      const hasDispatches = !isCreateMode && itemsWithDispatchesOnLoad.has(itemToSave.grn_trl_id);
      const parsedQty = parseInt(itemToSave.qty) || 0;
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
        weight: parseInt(itemToSave.weight) || 0,
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
        Alert.alert('Missing GRN', 'Unable to find GRN ID for edit flow.');
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
        Alert.alert('Unsaved Item', 'You have an unsaved item. What would you like to do?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setCurrentItem(getNewItemWithRack());
              if (savedItems.length === 0) {
                Alert.alert('No Items', 'Please add at least one item');
              } else {
                handleNext();
              }
            },
          },
          {
            text: 'Save & Continue',
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
        Alert.alert('Unsaved Item', 'You have an unsaved item. What would you like to do?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setCurrentItem(getNewItemWithRack());
              handlePrevious();
            },
          },
          {
            text: 'Save & Go Back',
            onPress: async () => {
              const isValid = await validateCurrentItem();
              if (isValid) {
                await handleAddItem();
                handlePrevious();
              } else {
                Alert.alert('Validation Error', 'Please fix the errors before going back');
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
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      <GRNStepIndicator
        steps={GRN_STEPS}
        currentStep={STEP_NUMBERS.ITEMS}
        completedSteps={getCompletedSteps(STEP_NUMBERS.ITEMS)}
        onCancel={handleCancel}
        cancelMessage={isCreateMode ? undefined : 'Are you sure you want to cancel editing? All unsaved changes will be lost.'}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  formContent: {
    flex: 1,
  },
});

export default GrnItemsStep;
