/**
 * Add Item Bottom Sheet
 * Bottom sheet for adding dispatch items with GRN, Item, Lot selection
 * Used in dispatch form Step 2 when adding items from order flow
 *
 * Bottom sheet per docs/STYLE_GUIDE.md §13.9; fields per §13.2.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  BackHandler,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
import { getGRNDetailByNumber } from '../services/grnDetailService';
import { validateSingleItem, checkDuplicateLots } from '../schemas/dispatchValidation';
import type { GRNDetailItem, DispatchItemData, ItemFormData } from '@/types/dispatch.types';
import { EMPTY_DISPATCH_ITEM } from '@/types/dispatch.types';
import { GRNAutocompleteBottomSheet } from './GRNAutocompleteBottomSheet';
import { GRNItemBottomSheet } from './GRNItemBottomSheet';
import { LotBottomSheet } from './LotBottomSheet';
import { createLogger } from '@/utils/logger';

import { showAlert } from '@/utils/alert';
import { formatCount, formatNumber, formatWeight } from '@/utils/formatters';
import { localizeDigits, normalizeDigits, t as tr } from '@/i18n';
const addItemBottomSheetLogger = createLogger('AddItemBottomSheet');

interface AddItemBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onAddItem: (item: DispatchItemData) => void;
  existingItems: DispatchItemData[]; // To check for duplicates
}

const makeStyles = (t: ThemeTokens) => ({
  sheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...t.shadow[4],
  },
  handleIndicator: {
    backgroundColor: t.border.separator,
    width: 36,
    height: 4,
  },
  container: {
    flex: 1,
    backgroundColor: t.surface.sheet,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    minHeight: touchTarget + space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    gap: space.sm,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.marginCompact,
    paddingBottom: space.huge,
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
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
  },
  inputPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  inputDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  inputError: {
    borderColor: t.status.negative.border,
    borderWidth: 2,
    paddingHorizontal: space.md - 1,
  },
  inputIcon: {
    marginRight: space.sm,
  },
  selectorText: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
  },
  placeholderText: {
    color: t.text.placeholder,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    padding: 0,
    fontVariant: ['tabular-nums' as const],
  },
  inputDisabledText: {
    color: t.text.disabled,
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
  lotDetailsCard: {
    backgroundColor: t.background.base,
    borderRadius: radius.card,
    padding: space.lg,
    marginBottom: space.lg,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.informative.background,
    borderWidth: 1,
    borderColor: t.status.informative.border,
    borderRadius: radius.button,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.md,
    flexWrap: 'wrap' as const,
  },
  stockDisplayText: {
    ...typography.subhead,
    color: t.status.informative.text,
  },
  stockDisplayValue: {
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
  },
  footer: {
    flexDirection: 'row' as const,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
    gap: space.sm,
    ...t.shadow[3],
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.button,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    gap: space.sm,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.fill,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    gap: space.sm,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
});

export const AddItemBottomSheet: React.FC<AddItemBottomSheetProps> = ({
  isVisible, onClose,
  onAddItem,
  existingItems,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Current item form state
  const [currentItem, setCurrentItem] = useState<ItemFormData>({
    ...EMPTY_DISPATCH_ITEM,
    unique_id: `item_${Date.now()}`,
  });

  // GRN detail state
  const [selectedGRN, setSelectedGRN] = useState<{
    id: string;
    gr_no: string;
    date: string;
    customer_name: string;
    items: GRNDetailItem[];
  } | null>(null);
  const [isLoadingGRN, setIsLoadingGRN] = useState(false);

  // Nested bottom sheet visibility
  const [showGRNBottomSheet, setShowGRNBottomSheet] = useState(false);
  const [showItemBottomSheet, setShowItemBottomSheet] = useState(false);
  const [showLotBottomSheet, setShowLotBottomSheet] = useState(false);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Snap points for the bottom sheet
  const snapPoints = useMemo(() => ['85%'], []);

  // Reset form
  const resetForm = useCallback(() => {
    setCurrentItem({
      ...EMPTY_DISPATCH_ITEM,
      unique_id: `item_${Date.now()}_${Math.random()}`,
    });
    setSelectedGRN(null);
    setValidationErrors({});
  }, []);

  // Handle sheet changes
  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
        resetForm();
      }
    },
    [onClose, resetForm]
  );

  // Render backdrop
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        style={[props.style, { backgroundColor: t.overlay.scrim }]}
      />
    ),
    [t]
  );

  // Handle GRN selection
  const handleGRNSelect = useCallback(
    async (grn: { id: string; gr_no: string }) => {
      addItemBottomSheetLogger.debug('[AddItemBottomSheet] GRN selected:', grn.gr_no);
      setIsLoadingGRN(true);

      try {
        const result = await getGRNDetailByNumber(grn.gr_no);

        if (!result.success || !result.data) {
          addItemBottomSheetLogger.error('[AddItemBottomSheet] GRN load failed:', result.error);
          showAlert(tr('dispatch.items.loadGrnFailedTitle'), tr('common.checkConnection'));
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

        setCurrentItem((prev) => ({
          ...prev,
          grns_id: grnHeader.id,
          grns_gr_no: grnHeader.gr_no,
          grns_date: grnHeader.date,
          grns_customer_name: grnHeader.customer_name,
        }));

        setValidationErrors((prev) => {
          const { grns_gr_no: _grns_gr_no, ...rest } = prev;
          return rest;
        });
      } catch (err) {
        addItemBottomSheetLogger.error('[AddItemBottomSheet] Error loading GRN:', err);
        showAlert(tr('dispatch.items.loadGrnFailedTitle'), tr('common.checkConnection'));
      } finally {
        setIsLoadingGRN(false);
      }
    },
    []
  );

  // Handle item selection
  const handleItemSelect = useCallback(
    (item: { item_id: string; item_name: string }) => {
      addItemBottomSheetLogger.debug('[AddItemBottomSheet] Item selected:', item.item_name);

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
        const { grnItems_item_id: _grnItems_item_id, ...rest } = prev;
        return rest;
      });
    },
    []
  );

  // Handle lot selection
  const handleLotSelect = useCallback(
    (lot: GRNDetailItem) => {
      addItemBottomSheetLogger.debug('[AddItemBottomSheet] Lot selected:', lot.id);

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
        const { grnItems_id: _grnItems_id, ...rest } = prev;
        return rest;
      });
    },
    []
  );

  // Handle quantity change
  const handleQuantityChange = (text: string) => {
    const qty = parseInt(normalizeDigits(text)) || 0;
    setCurrentItem((prev) => ({
      ...prev,
      disp_quantity: qty,
    }));

    setValidationErrors((prev) => {
      const { disp_quantity: _disp_quantity, ...rest } = prev;
      return rest;
    });
  };

  // Get lots for selected item
  const lotsForSelectedItem = selectedGRN?.items.filter(
    (item) => item.item_id === currentItem.grnItems_item_id
  ) || [];

  // Calculate dynamic stock
  const displayStock = (currentItem.grnItems_stock || 0) - (currentItem.disp_quantity || 0);

  // Check if current item is valid
  const isCurrentItemValid =
    currentItem.grns_gr_no &&
    currentItem.grnItems_item_id &&
    currentItem.grnItems_id &&
    (currentItem.disp_quantity || 0) > 0 &&
    (currentItem.disp_quantity || 0) <= (currentItem.grnItems_stock || 0);

  // Handle add item
  const handleAddItem = async () => {
    addItemBottomSheetLogger.debug('[AddItemBottomSheet] Adding item');

    const validation = await validateSingleItem(currentItem);

    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      showAlert(tr('dispatch.items.checkItemTitle'), tr('dispatch.items.checkItemMessage'));
      return;
    }

    // Check for duplicate lots
    const allItems = [...existingItems, currentItem as DispatchItemData];
    const duplicateCheck = checkDuplicateLots(allItems);

    if (duplicateCheck.hasDuplicates) {
      showAlert(
        tr('dispatch.items.lotAlreadyAddedTitle'),
        tr('dispatch.items.lotAlreadyAddedMessage')
      );
      return;
    }

    // Add the item
    onAddItem(currentItem as DispatchItemData);

    // Reset form for next item
    resetForm();
  };

  // Handle add and close
  const handleAddAndClose = async () => {
    addItemBottomSheetLogger.debug('[AddItemBottomSheet] Adding item and closing');

    const validation = await validateSingleItem(currentItem);

    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      showAlert(tr('dispatch.items.checkItemTitle'), tr('dispatch.items.checkItemMessage'));
      return;
    }

    const allItems = [...existingItems, currentItem as DispatchItemData];
    const duplicateCheck = checkDuplicateLots(allItems);

    if (duplicateCheck.hasDuplicates) {
      showAlert(
        tr('dispatch.items.lotAlreadyAddedTitle'),
        tr('dispatch.items.lotAlreadyAddedMessage')
      );
      return;
    }

    onAddItem(currentItem as DispatchItemData);
    bottomSheetRef.current?.dismiss();
  };

  // Handle visibility changes
  useEffect(() => {
    if (isVisible) {
      resetForm();
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isVisible, resetForm]);

  // Android back closes the sheet first (nested sheets register their own handler later and win)
  useEffect(() => {
    if (!isVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      bottomSheetRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [isVisible]);

  const exceedsStock = (currentItem.disp_quantity || 0) > (currentItem.grnItems_stock || 0);

  const renderError = (message?: string) =>
    message ? (
      <View style={styles.errorRow} accessibilityRole="alert">
        <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
    ) : null;

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} accessibilityRole="header">{tr('dispatch.items.addItem')}</Text>
            <Pressable
              onPress={() => bottomSheetRef.current?.dismiss()}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={tr('dispatch.items.closeAddItem')}
            >
              <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
            </Pressable>
          </View>

          <BottomSheetScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* GRN Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, validationErrors.grns_gr_no && styles.labelError]}>
                {tr('common.grn')} <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.inputContainer,
                  pressed && styles.inputPressed,
                  validationErrors.grns_gr_no && styles.inputError,
                ]}
                onPress={() => setShowGRNBottomSheet(true)}
                accessibilityRole="button"
                accessibilityLabel={tr('dispatch.items.grnFieldLabel', { value: currentItem.grns_gr_no || tr('dispatch.items.notChosen') })}
                accessibilityHint={tr('dispatch.items.opensGrnList')}
                accessibilityState={{ busy: isLoadingGRN }}
              >
                <Icon name="package-down" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                <Text
                  style={[
                    styles.selectorText,
                    !currentItem.grns_gr_no && styles.placeholderText,
                  ]}
                >
                  {currentItem.grns_gr_no || tr('dispatch.items.chooseGrn')}
                </Text>
                <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>
              {renderError(validationErrors.grns_gr_no)}
            </View>

            {/* Item Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, validationErrors.grnItems_item_id && styles.labelError]}>
                {tr('common.item')} <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.inputContainer,
                  pressed && !!selectedGRN && styles.inputPressed,
                  !selectedGRN && styles.inputDisabled,
                  validationErrors.grnItems_item_id && styles.inputError,
                ]}
                onPress={() => selectedGRN && setShowItemBottomSheet(true)}
                disabled={!selectedGRN}
                accessibilityRole="button"
                accessibilityLabel={tr('dispatch.items.itemFieldLabel', { value: currentItem.grnItems_item_name || tr('dispatch.items.notChosen') })}
                accessibilityHint={selectedGRN ? tr('dispatch.items.opensItemList') : tr('dispatch.items.chooseGrnFirst')}
                accessibilityState={{ disabled: !selectedGRN }}
              >
                <Icon name="cube-outline" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                <Text
                  style={[
                    styles.selectorText,
                    !currentItem.grnItems_item_name && styles.placeholderText,
                  ]}
                >
                  {currentItem.grnItems_item_name || tr('dispatch.items.chooseItem')}
                </Text>
                <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>
              {renderError(validationErrors.grnItems_item_id)}
            </View>

            {/* Lot Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, validationErrors.grnItems_id && styles.labelError]}>
                {tr('dispatch.items.lot')} <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.inputContainer,
                  pressed && !!currentItem.grnItems_item_id && styles.inputPressed,
                  !currentItem.grnItems_item_id && styles.inputDisabled,
                  validationErrors.grnItems_id && styles.inputError,
                ]}
                onPress={() => currentItem.grnItems_item_id && setShowLotBottomSheet(true)}
                disabled={!currentItem.grnItems_item_id}
                accessibilityRole="button"
                accessibilityLabel={tr('dispatch.items.lotFieldLabel', {
                  value: currentItem.grnItems_id ? tr('dispatch.items.lotChosenState') : tr('dispatch.items.notChosen'),
                })}
                accessibilityHint={currentItem.grnItems_item_id ? tr('dispatch.items.opensLotList') : tr('dispatch.items.chooseItemFirst')}
                accessibilityState={{ disabled: !currentItem.grnItems_item_id }}
              >
                <Icon name="layers-outline" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                <Text
                  style={[
                    styles.selectorText,
                    !currentItem.grnItems_id && styles.placeholderText,
                  ]}
                >
                  {currentItem.grnItems_id ? tr('dispatch.items.lotChosen') : tr('dispatch.items.chooseLot')}
                </Text>
                <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>
              {renderError(validationErrors.grnItems_id)}
            </View>

            {/* Lot Details */}
            {currentItem.grnItems_id && (
              <View style={styles.lotDetailsCard}>
                <Text style={styles.lotDetailsTitle} accessibilityRole="header">{tr('dispatch.items.lotDetails')}</Text>
                <View style={styles.lotDetailsGrid}>
                  {currentItem.grnItems_package_mark && (
                    <View style={styles.detailItem}>
                      <Icon name="label-outline" size={iconSize.sm} color={t.icon.secondary} />
                      <Text style={styles.detailLabel}>{tr('common.packageMark')}</Text>
                      <Text style={styles.detailValue}>{currentItem.grnItems_package_mark}</Text>
                    </View>
                  )}
                  {currentItem.grnItems_rack && (
                    <View style={styles.detailItem}>
                      <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                      <Text style={styles.detailLabel}>{tr('common.rack')}</Text>
                      <Text style={styles.detailValue}>{currentItem.grnItems_rack}</Text>
                    </View>
                  )}
                  <View style={styles.detailItem}>
                    <Icon name="weight" size={iconSize.sm} color={t.icon.secondary} />
                    <Text style={styles.detailLabel}>{tr('common.weight')}</Text>
                    <Text style={styles.detailValue}>{formatWeight(currentItem.grnItems_weight)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Icon name="warehouse" size={iconSize.sm} color={t.icon.secondary} />
                    <Text style={styles.detailLabel}>{tr('common.inStock')}</Text>
                    <Text style={styles.detailValue}>
                      {formatCount(currentItem.grnItems_stock, 'bag')}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Quantity Input */}
            <View style={styles.formGroup}>
              <Text
                style={[styles.label, (validationErrors.disp_quantity || exceedsStock) && styles.labelError]}
                nativeID="add-item-quantity-label"
              >
                {tr('dispatch.items.bagsToDispatch')} <Text style={styles.required}>*</Text>
              </Text>

              {/* Dynamic Stock Display */}
              {currentItem.grnItems_id && (
                <View style={styles.stockDisplayCard}>
                  <Icon name="information" size={iconSize.sm} color={t.status.informative.text} />
                  <Text style={styles.stockDisplayText}>
                    {tr('common.inStock')} <Text style={styles.stockDisplayValue}>{formatNumber(currentItem.grnItems_stock)}</Text>
                  </Text>
                  {(currentItem.disp_quantity || 0) > 0 && (
                    <Text style={styles.stockDisplayText}>
                      · {tr('dispatch.items.leftAfterDispatch')} <Text style={styles.stockDisplayValue}>{formatNumber(displayStock)}</Text>
                    </Text>
                  )}
                </View>
              )}

              <View
                style={[
                  styles.inputContainer,
                  !currentItem.grnItems_id && styles.inputDisabled,
                  (validationErrors.disp_quantity || exceedsStock) && styles.inputError,
                ]}
              >
                <Icon name="counter" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    !currentItem.grnItems_id && styles.inputDisabledText,
                  ]}
                  value={(currentItem.disp_quantity || 0) > 0 ? localizeDigits((currentItem.disp_quantity || 0).toString()) : ''}
                  onChangeText={handleQuantityChange}
                  placeholder={tr('dispatch.items.enterBags')}
                  keyboardType="numeric"
                  editable={!!currentItem.grnItems_id}
                  placeholderTextColor={t.text.placeholder}
                  accessibilityLabel={tr('dispatch.items.bagsToDispatch')}
                  accessibilityLabelledBy="add-item-quantity-label"
                />
              </View>
              {exceedsStock &&
                renderError(tr('dispatch.items.maxBagsInHand', { count: currentItem.grnItems_stock }))}
              {renderError(validationErrors.disp_quantity)}
            </View>
          </BottomSheetScrollView>

          {/* Footer Buttons */}
          <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
                !isCurrentItemValid && styles.buttonDisabled,
              ]}
              onPress={handleAddItem}
              disabled={!isCurrentItemValid}
              accessibilityRole="button"
              accessibilityLabel={tr('dispatch.items.addAndAnother')}
              accessibilityState={{ disabled: !isCurrentItemValid }}
            >
              <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.secondaryButtonText}>{tr('dispatch.items.addAnother')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                !isCurrentItemValid && styles.buttonDisabled,
              ]}
              onPress={handleAddAndClose}
              disabled={!isCurrentItemValid}
              accessibilityRole="button"
              accessibilityLabel={tr('dispatch.items.addItem')}
              accessibilityState={{ disabled: !isCurrentItemValid }}
            >
              <Icon name="check" size={iconSize.md} color={t.brand.onFill} />
              <Text style={styles.primaryButtonText}>{tr('dispatch.items.addItem')}</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetModal>

      {/* Nested Bottom Sheets */}
      <GRNAutocompleteBottomSheet
        isVisible={showGRNBottomSheet}
        onClose={() => setShowGRNBottomSheet(false)}
        onSelect={handleGRNSelect}
        currentValue={
          currentItem.grns_id
            ? { id: currentItem.grns_id, gr_no: currentItem.grns_gr_no || '' }
            : undefined
        }
      />

      <GRNItemBottomSheet
        isVisible={showItemBottomSheet}
        onClose={() => setShowItemBottomSheet(false)}
        onSelect={handleItemSelect}
        items={selectedGRN?.items || []}
        currentValue={
          currentItem.grnItems_item_id
            ? { item_id: currentItem.grnItems_item_id, item_name: currentItem.grnItems_item_name || '' }
            : undefined
        }
      />

      <LotBottomSheet
        isVisible={showLotBottomSheet}
        onClose={() => setShowLotBottomSheet(false)}
        onSelect={handleLotSelect}
        lots={lotsForSelectedItem}
        currentValue={
          currentItem.grnItems_id
            ? { id: currentItem.grnItems_id }
            : undefined
        }
        grnInfo={selectedGRN ? { id: selectedGRN.id, gr_no: selectedGRN.gr_no } : undefined}
      />
    </>
  );
};
