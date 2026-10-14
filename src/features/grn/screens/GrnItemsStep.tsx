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
  reconcileItems,
  removeItem,
  addItemImage,
  completeItemImageUpload,
  failItemImageUpload,
  removeItemImage,
  restoreItemImages,
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
import { GRN_STEP_COUNT, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { grnSteps } from '@/features/grn/utils/grnStepLabels';
import { generateTempGRNId, uploadGRNItemImage, validateImageFile } from '@/features/grn/services/imageUploadService';
import { isTemporaryGRNImageId } from '@/features/grn/services/imageId';
import { releaseLocalPhotos } from '@/utils/localPhotoFiles';
import ItemsSummaryBottomSheet from '@/features/grn/components/ItemsSummaryBottomSheet';
import {
  HorizontalItemForm,
  ItemFormData,
  HorizontalItemFormRef,
  ItemFormFieldName,
} from '@/features/grn/components/HorizontalItemForm';
import {
  validateStep2,
  isValidReceiptQuantity,
  parseReceiptQuantity,
  parseReceiptWeight,
} from '@/features/grn/schemas/grnValidation';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('grn');
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

/** A new, empty item for the form. It starts with the rack of the first saved item. */
const freshItem = (lines: readonly ItemFormData[]): ItemFormData => {
  const item = EMPTY_GRN_ITEM();
  if (lines.length > 0 && lines[0].rack) item.rack = lines[0].rack;
  return item;
};

/** The fields the row draws after Item and Quantity, in its order. Their names are also their error keys. */
const FIELDS_AFTER_QUANTITY = ['weight', 'rack', 'package_mark'] as const satisfies readonly ItemFormFieldName[];

const photosOf = (item: ItemFormData): GRNImageData[] => item.trl_images || [];
const photoIds = (item: ItemFormData) => photosOf(item).map((img) => img.id).join('|');

/**
 * Whether the item in the form is open: it differs from the item that was put
 * into the form (`baseline`) in its item, quantity, weight, mark, rack (spaces
 * at the ends do not count) or photos. A new form that holds only the rack it
 * was given, and a saved item that was opened and not changed, are not open.
 */
const isItemDirty = (item: ItemFormData, baseline: ItemFormData): boolean =>
  item.item_table_id !== baseline.item_table_id ||
  item.qty !== baseline.qty ||
  item.weight !== baseline.weight ||
  item.package_mark !== baseline.package_mark ||
  (item.rack || '').trim() !== (baseline.rack || '').trim() ||
  photoIds(item) !== photoIds(baseline);

/** The field errors of one item, or null when it can be saved. */
const validateItem = async (item: ItemFormData): Promise<Record<string, string> | null> => {
  const validation = await validateStep2({
    items: [{
      item_table_id: item.item_table_id,
      item_name: item.item_name,
      packaging: item.packaging,
      // The typed text goes to the schema unchanged: its whole-number
      // transform reports empty, fractional, signed or garbled input instead
      // of coercing it to a number first.
      qty: item.qty,
      stock: item.qty,
      weight: item.weight,
      rack: item.rack,
      package_mark: item.package_mark,
      trl_images: photosOf(item),
    }],
  });
  if (validation.isValid) return null;

  const itemErrors: Record<string, string> = {};
  Object.keys(validation.errors).forEach((errorKey) => {
    if (errorKey.startsWith('items[0]')) {
      itemErrors[errorKey.replace('items[0].', '')] = validation.errors[errorKey];
    }
  });
  return itemErrors;
};

/** Where the worker is going when the item in the form is left. */
type Exit =
  | { to: 'review' }
  /** `leave` is what going back does; without it, one step back in the stack. */
  | { to: 'details'; leave?: () => void }
  | { to: 'row'; row: ItemFormData };

/**
 * What the route asks of the step when the phone's Back key is pressed: the
 * step calls `leave` once the item in the form may be left.
 */
export type GrnItemsBackGuard = (leave: () => void) => void;

type GrnItemsStepProps = {
  mode: 'create' | 'edit';
  /** The step puts its guard here while it is shown (see the two step-2 routes). */
  backGuard?: React.RefObject<GrnItemsBackGuard | null>;
};

export function GrnItemsStep({ mode, backGuard }: GrnItemsStepProps) {
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

  const [showItemsSummarySheet, setShowItemsSummarySheet] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentItem, setCurrentItem] = useState<ItemFormData>(EMPTY_GRN_ITEM);
  const [savedItems, setSavedItems] = useState<ItemFormData[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Map of grn_trl_id -> original stock value for items with dispatches
  const [itemsWithDispatchesOnLoad, setItemsWithDispatchesOnLoad] = useState<Map<string, number>>(new Map());

  const hasSyncedFromRedux = useRef(false);
  const formRef = useRef<HorizontalItemFormRef>(null);

  // The item as it was put into the form; `isItemDirty` compares the form with it.
  const baseline = useRef<ItemFormData>(currentItem);
  // The "Save this item?" question is on screen, or its answer is still being carried out.
  const promptOpen = useRef(false);
  // The item in the form is being stored (a second tap on the checkmark does nothing).
  const committing = useRef(false);

  // What the step holds, as it was last drawn. Every way out of the step reads
  // it when it is used, so none of them works on the values of an older draw
  // (the pattern of src/hooks/useBackHandler.ts). It is written while drawing:
  // right after a `set…` call it still holds the values from before. That is
  // why `discardOpenItem` and `commitOpenItem` return the lines they leave and
  // `continueTo` is given them, instead of reading them from here.
  const latest = useRef({ currentItem, editingItemId, savedItems, items, isNavigating, isCreateMode, grnId, itemsWithDispatchesOnLoad });
  latest.current = { currentItem, editingItemId, savedItems, items, isNavigating, isCreateMode, grnId, itemsWithDispatchesOnLoad };

  /** Puts an item into the form: a new one (`editingId` null) or a saved one to correct. */
  const loadForm = useCallback((item: ItemFormData, editingId: string | null) => {
    baseline.current = item;
    setCurrentItem(item);
    setEditingItemId(editingId);
  }, []);

  const isCurrentItemValid = useMemo(() => {
    return !!(
      currentItem.item_table_id &&
      currentItem.item_name &&
      currentItem.qty &&
      isValidReceiptQuantity(currentItem.qty)
    );
  }, [currentItem.item_table_id, currentItem.item_name, currentItem.qty]);

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

  // The X in the step header asks before it calls this, so there is no second question here.
  const handleCancel = () => {
    resetFormState();
    // Always navigate to GRN list directly, not back one step
    router.replace('/grn');
  };

  // Back on this step (from Review, or a failed opening of it): Next works again.
  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (items.length > 0) {
        // Update dispatched items map, preserving existing entries (original stock values)
        if (!isCreateMode) {
          setItemsWithDispatchesOnLoad((prevMap) => {
            const newMap = new Map(prevMap);
            items.forEach((item) => {
              // Only add new items with dispatches, preserve existing entries
              if (item.qty !== item.stock && !newMap.has(item.grn_trl_id)) {
                newMap.set(item.grn_trl_id, item.stock);
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

        // A form nobody typed into is made new again (it takes the first item's
        // rack). A saved item being corrected, or a new item with something
        // typed, stays: the stored lines also change when another item is
        // deleted or a photo is added.
        const now = latest.current;
        if (!now.editingItemId && !isItemDirty(now.currentItem, baseline.current)) {
          loadForm(freshItem(syncedItems), null);
        }
      } else if (!isCreateMode) {
        setItemsWithDispatchesOnLoad(new Map());
      }

      return () => { };
    }, [items, isCreateMode, loadForm])
  );

  const zeroItemsHandledRef = useRef(false);

  useEffect(() => {
    if (items.length === 0) {
      if (zeroItemsHandledRef.current) {
        return;
      }
      zeroItemsHandledRef.current = true;

      const emptied = freshItem(savedItems);
      setSavedItems([]);
      // As above: what was typed for a new item outlives the deletion of the last saved one.
      const now = latest.current;
      if (!now.editingItemId && !isItemDirty(now.currentItem, baseline.current)) {
        loadForm(emptied, null);
      }
    } else {
      zeroItemsHandledRef.current = false;
    }
  }, [items.length, savedItems, loadForm]);

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

  /** Brings the first field with an error into view: the form is one sideways row. */
  const showFirstError = (errors: Record<string, string>) => {
    if (errors.item_table_id || errors.item_name) {
      formRef.current?.resetScroll();
    } else if (errors.qty) {
      formRef.current?.focusQty();
    } else {
      // Weight, Rack and Mark are out of view while Item and Quantity are shown.
      const field = FIELDS_AFTER_QUANTITY.find((name) => errors[name]);
      if (field) formRef.current?.revealField(field);
    }
  };

  /**
   * Stores the item in the form: the checkmark, and "Save" in the question
   * asked before the item is left. Returns the step's lines with the item in
   * them, or null when it cannot be saved: then it stays in the form as typed,
   * with its errors shown.
   */
  const commitOpenItem = async (): Promise<ItemFormData[] | null> => {
    if (committing.current) return null;
    committing.current = true;
    try {
      const { currentItem: item, editingItemId: editingId } = latest.current;

      const errors = await validateItem(item);
      if (errors) {
        // Only the errors are written: the typed values, the item being corrected and the baseline stay.
        setCurrentItem((prev) => ({ ...prev, errors }));
        showAlert(tr('grn.itemsStep.checkItemTitle'), tr('grn.itemsStep.fixHighlightedSave'), [
          { text: tr('common.ok'), onPress: () => showFirstError(errors) },
        ]);
        return null;
      }

      const { savedItems: lines, isCreateMode: creating, itemsWithDispatchesOnLoad: dispatched } = latest.current;
      const hasDispatches = !creating && item.grn_trl_id && dispatched.has(item.grn_trl_id);
      const parsedQty = parseReceiptQuantity(item.qty);
      if (parsedQty === null) {
        showAlert(tr('grn.itemsStep.checkItemTitle'), tr('grn.itemsStep.quantityWhole'));
        return null;
      }
      // Use the original stock value from the Map (preserved from initial load)
      const originalStock = dispatched.get(item.grn_trl_id);
      const preservedStock = hasDispatches && originalStock !== undefined ? originalStock : parsedQty;

      // The rack is free text; only the spaces typed at its ends are dropped.
      const savedItem: ItemFormData = { ...item, rack: (item.rack || '').trim(), errors: {} };
      const storeItem: GRNItemData = {
        grn_trl_id: savedItem.grn_trl_id,
        item_table_id: savedItem.item_table_id,
        item_name: savedItem.item_name,
        packaging: savedItem.packaging,
        qty: parsedQty,
        stock: preservedStock,
        weight: parseReceiptWeight(savedItem.weight) ?? 0,
        rack: savedItem.rack,
        package_mark: savedItem.package_mark,
        trl_images: photosOf(savedItem),
      };

      let next: ItemFormData[];
      if (editingId !== null) {
        dispatch(updateItem({ grn_trl_id: editingId, item: storeItem }));
        next = lines.map((line) => (line.grn_trl_id === editingId ? savedItem : line));
        // Photos the saved item had and this correction took off: only now are
        // their files on the phone not needed any more (see handleImageRemove).
        const kept = new Set(photosOf(savedItem).map((img) => img.id));
        const takenOff = photosOf(baseline.current).filter((img) => !kept.has(img.id) && isTemporaryGRNImageId(img.id));
        if (takenOff.length > 0) void releaseLocalPhotos(takenOff.map((img) => img.imageUrl));
      } else {
        dispatch(addItem(storeItem));
        next = [...lines, savedItem];
      }
      setSavedItems(next);
      loadForm(freshItem(next), null);
      Vibration.vibrate(10);

      // Reset scroll to Item field for next entry
      formRef.current?.resetScroll();
      return next;
    } finally {
      committing.current = false;
    }
  };

  /**
   * Drops what was typed and not checkmarked. A new item leaves the form; a
   * saved item keeps its stored values. Returns the step's lines as they are
   * without that input.
   */
  const discardOpenItem = (): ItemFormData[] => {
    const { currentItem: item, editingItemId: editingId, savedItems: lines } = latest.current;
    const before = baseline.current;
    let next = lines;

    if (photoIds(item) !== photoIds(before)) {
      // A photo that was picked for this item and never reached the server: its file is not needed.
      const kept = new Set(photosOf(before).map((img) => img.id));
      const picked = photosOf(item).filter((img) => !kept.has(img.id) && isTemporaryGRNImageId(img.id));
      if (picked.length > 0) void releaseLocalPhotos(picked.map((img) => img.imageUrl));

      // Photos are the one part of a correction that reaches the store before
      // the checkmark (handleImageUploadStart, handleImageRemove), and a saved
      // photo that was removed waits to be deleted when the GRN is saved. Both
      // are taken back, here and in the lines that go on to Review.
      if (editingId !== null) {
        dispatch(restoreItemImages({ itemId: editingId, images: photosOf(before) }));
        next = lines.map((line) => (line.grn_trl_id === editingId ? { ...line, trl_images: photosOf(before) } : line));
        setSavedItems(next);
      }
    }

    loadForm(freshItem(next), null);
    return next;
  };

  /** Stores the step's lines and opens Review. It is given the lines and never looks at the form. */
  const proceedToReview = (lines: ItemFormData[]) => {
    const { items: storedItems, isCreateMode: creating, grnId: editedGrnId, itemsWithDispatchesOnLoad: dispatched } = latest.current;

    if (lines.length === 0) {
      showAlert(tr('grn.itemsStep.addItemTitle'), tr('grn.itemsStep.addItemMessage'));
      return;
    }

    // Every saved item passed the schema when it was added; a quantity that no
    // longer parses must stop the step rather than be stored as 0.
    const parsedItems = lines.map((itemToSave) => ({
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

    dispatch(setValidationErrors({}));

    // One lookup of the stored lines, and one action for all of them: a line
    // that did not change keeps its stored object.
    const storedById = new Map<string, GRNItemData>();
    storedItems.forEach((item) => {
      if (!storedById.has(item.grn_trl_id)) storedById.set(item.grn_trl_id, item);
    });
    const storeItems: GRNItemData[] = [];
    parsedItems.forEach(({ itemToSave, parsedQty }) => {
      if (parsedQty === null) return;
      const existingInStore = storedById.get(itemToSave.grn_trl_id);
      const hasDispatches = !creating && dispatched.has(itemToSave.grn_trl_id);
      // A line with dispatches keeps its stored stock; any other line's stock is its quantity.
      const stockValue = hasDispatches
        ? existingInStore?.stock ?? parsedQty
        : parsedQty;

      storeItems.push({
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
      });
    });
    dispatch(reconcileItems(storeItems));

    dispatch(setCurrentStep(3));
    setIsNavigating(true);

    // On the next frame, so the button shows "Opening review…" first.
    const open = (go: () => void) => {
      requestAnimationFrame(() => {
        try {
          go();
        } catch (error) {
          log.error('Navigation error', loggableError(error));
          setIsNavigating(false);
        }
      });
    };

    if (creating) {
      open(() => router.push('/grn-form/step3'));
    } else {
      if (!editedGrnId) {
        showAlert(tr('grn.itemsStep.reviewFailedTitle'), tr('grn.form.reopenMessage'));
        setIsNavigating(false);
        return;
      }
      open(() => router.push(`/grn-edit/${editedGrnId}/step3`));
    }
  };

  /** Goes where the worker was going. `lines` are the step's lines as they now stand. */
  const continueTo = (exit: Exit, lines: ItemFormData[]) => {
    if (exit.to === 'row') {
      const row = lines.find((line) => line.grn_trl_id === exit.row.grn_trl_id) ?? exit.row;
      loadForm({ ...row }, row.grn_trl_id);
      Vibration.vibrate(10);
      return;
    }

    // The form is closed before the step is left: coming back never shows an item that was left open.
    loadForm(freshItem(lines), null);
    if (exit.to === 'review') {
      proceedToReview(lines);
      return;
    }
    dispatch(setCurrentStep(1));
    if (exit.leave) {
      exit.leave();
    } else {
      router.back();
    }
  };

  /**
   * Every way out of the item in the form comes through here: footer Next and
   * Back, both step circles, the phone's Back key and opening another saved
   * item. An item that was not checkmarked is asked about first.
   */
  const requestExit = (exit: Exit) => {
    const now = latest.current;
    if (promptOpen.current || now.isNavigating) return;
    // A tap on the saved item that is already in the form.
    if (exit.to === 'row' && exit.row.grn_trl_id === now.editingItemId) return;
    if (!isItemDirty(now.currentItem, baseline.current)) {
      continueTo(exit, now.savedItems);
      return;
    }

    const correcting = now.editingItemId !== null;
    const position = now.savedItems.findIndex((line) => line.grn_trl_id === now.editingItemId) + 1;
    const name = now.currentItem.item_name || baseline.current.item_name;
    // Every button and closing the dialog without one (AlertHost then also runs "Keep editing") ends here.
    const closed = () => {
      promptOpen.current = false;
    };
    promptOpen.current = true;
    showAlert(
      correcting ? tr('grn.itemsStep.saveChangesTitle') : tr('grn.itemsStep.saveItemTitle'),
      correcting ? tr('grn.itemsStep.saveChangesMessage', { position, name }) : tr('grn.itemsStep.saveItemMessage'),
      [
        { text: tr('common.keepEditing'), style: 'cancel', onPress: closed },
        {
          text: correcting ? tr('grn.itemsStep.discardChanges') : tr('grn.itemsStep.discardItem'),
          style: 'destructive',
          onPress: () => {
            closed();
            continueTo(exit, discardOpenItem());
          },
        },
        {
          text: correcting ? tr('grn.itemsStep.saveChanges') : tr('grn.itemsStep.saveItem'),
          onPress: async () => {
            try {
              const lines = await commitOpenItem();
              if (lines) continueTo(exit, lines);
            } finally {
              closed();
            }
          },
        },
      ],
      { cancelable: true, onDismiss: closed }
    );
  };

  // The phone's Back key: the route owns the key and asks here (app/grn-form/step2.tsx, app/grn-edit/[id]/step2.tsx).
  const requestExitRef = useRef(requestExit);
  requestExitRef.current = requestExit;
  useEffect(() => {
    if (!backGuard) return undefined;
    const guard: GrnItemsBackGuard = (leave) => requestExitRef.current({ to: 'details', leave });
    backGuard.current = guard;
    return () => {
      if (backGuard.current === guard) backGuard.current = null;
    };
  }, [backGuard]);

  const handleRemoveItem = useCallback((itemId: string) => {
    const now = latest.current;
    const updatedItems = now.savedItems.filter((item) => item.grn_trl_id !== itemId);
    setSavedItems(updatedItems);
    dispatch(removeItem(itemId));

    // The item being corrected was deleted: the form has nothing left to correct.
    if (now.editingItemId === itemId) {
      loadForm(freshItem(updatedItems), null);
    }
  }, [dispatch, loadForm]);

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

  // Nothing is deleted on the server here. The photo leaves the form; a saved photo is
  // remembered by the store and deleted when the GRN is saved, so "Discard changes" keeps it.
  const handleImageRemove = async (imageId: string) => {
    const removed = currentItem.trl_images?.find((img) => img.id === imageId);
    dispatch(removeItemImage({ itemId: currentItem.grn_trl_id, imageId }));
    // A photo that never reached the server: its file on the phone is not needed.
    // A photo the saved item already had when it was opened is the exception:
    // "Discard changes" puts it back, so its file stays until the correction is
    // checkmarked (commitOpenItem).
    const canComeBack = photosOf(baseline.current).some((img) => img.id === imageId);
    if (removed && isTemporaryGRNImageId(imageId) && !canComeBack) void releaseLocalPhotos([removed.imageUrl]);
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
        showAlert(tr('grn.itemsStep.addPhotoFailedTitle'), serverText(validation.error, tr('grn.itemsStep.chooseJpegPng')));
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

      // A temporary id only prepares the photo on the device. It is uploaded when the GRN
      // is saved, in create and in edit mode: an edit that is discarded must not have added
      // photos, and a line added in this edit has no server id to attach a photo to yet.
      const deferredUploadId = tempGrnId || generateTempGRNId();
      try {
        const uploadResult = await uploadGRNItemImage(asset, deferredUploadId, currentItem.grn_trl_id);
        if (!uploadResult.success) {
          // The photo could not be prepared (too large, unreadable): say so and take it out again.
          handleImageRemove(tempImageData.id);
          showAlert(
            tr('grn.photos.captureFailedTitle'),
            serverText(uploadResult.error, tr('grn.photos.captureFailedMessage'))
          );
          return;
        }
        const uploadedImageData: GRNImageData = {
          id: uploadResult.imageId || tempImageData.id,
          fileName: uploadResult.metadata?.fileName || 'item-image.jpg',
          imageUrl: uploadResult.imageUrl || '',
          storagePath: uploadResult.metadata?.storagePath,
          uploadStatus: 'completed',
          fileSize: uploadResult.metadata?.fileSize,
          mimeType: uploadResult.metadata?.mimeType,
          uploadTimestamp: uploadResult.metadata?.uploadTimestamp,
        };
        handleImageUploadComplete(uploadedImageData, tempImageData.id);
      } catch (error) {
        log.error('Upload failed', loggableError(error));
        // The entry still points at the original file: it is taken out, like a refused photo.
        handleImageRemove(tempImageData.id);
        showAlert(tr('grn.photos.captureFailedTitle'), tr('grn.photos.captureFailedMessage'));
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
            log.error('Camera error', loggableError(error));
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
            log.error('Gallery error', loggableError(error));
          }
        },
      },
      { text: tr('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleStepIndicatorPress = (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.HEADER) {
      requestExit({ to: 'details' });
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      requestExit({ to: 'review' });
    }
  };

  return (
    <View style={styles.container}>
      <GRNStepIndicator
        steps={grnSteps()}
        currentStep={STEP_NUMBERS.ITEMS}
        completedSteps={getCompletedSteps(STEP_NUMBERS.ITEMS)}
        onCancel={handleCancel}
        cancelMessage={
          hasUnsavedData()
            ? tr('grn.itemsStep.itemsWillBeLost', { count: savedItems.length || items.length })
            : undefined
        }
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
          onSaveItem={commitOpenItem}
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

      {/* Back and Next ask about an item that was not checkmarked, as the step circles do */}
      <WizardBottomBar
        currentStep={STEP_NUMBERS.ITEMS}
        totalSteps={GRN_STEP_COUNT}
        onPrevious={() => requestExit({ to: 'details' })}
        onNext={() => requestExit({ to: 'review' })}
        isLoading={isNavigating}
        loadingLabel={tr('grn.itemsStep.openingReview')}
      />

      <ItemsSummaryBottomSheet
        isVisible={showItemsSummarySheet}
        onClose={() => setShowItemsSummarySheet(false)}
        items={savedItems}
        onRemoveItem={handleRemoveItem}
        onEditItem={(row) => requestExit({ to: 'row', row })}
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
