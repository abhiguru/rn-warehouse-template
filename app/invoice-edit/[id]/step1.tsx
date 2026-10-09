import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  updateHeader,
  setValidationErrors,
  clearValidationError,
  setCurrentStep,
  selectInvoiceFormHeader,
  selectInvoiceFormItems,
  selectInvoiceFormId,
  setIsLoadingItems,
  loadInvoiceFormData,
  setSelectedGrId,
  setItems,
  updateAllDurations,
  restoreOriginalDurations,
} from '@/store/slices/invoiceFormSlice';
import { GRNAutocomplete } from '@/features/invoice/components/GRNAutocomplete';
import { validateStep1 } from '@/features/invoice/schemas/invoiceValidation';
import { loadInvoiceFormData as loadFormData } from '@/features/invoice/services/invoiceFormService';
import { InvoiceableGrn } from '@/types/invoice.types';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import {
  INVOICE_STEPS,
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { canNavigateFromStep1 } from '@/features/invoice/utils/swipeNavigationHelpers';

import { showAlert } from '@/utils/alert';
export default function InvoiceEditStep1() {
  const dispatch = useAppDispatch();
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const header = useAppSelector(selectInvoiceFormHeader);
  const items = useAppSelector(selectInvoiceFormItems);
  const invoiceId = useAppSelector(selectInvoiceFormId);
  const { is_loading: isLoading, is_loading_items: isLoadingItems } = useAppSelector((state) => state.invoiceForm);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [validationErrors, setLocalValidationErrors] = useState<Record<string, string>>({});
  const [showGRNBottomSheet, setShowGRNBottomSheet] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<InvoiceableGrn | null>(null);

  // Store original GRN ID to detect changes
  const [originalGrId] = useState(header.gr_id);

  // Track focus count to skip initial mount for data reload
  const focusCountRef = useRef(0);

  // Clear all local state on mount to prevent stale data
  useEffect(() => {
    setShowDatePicker(false);
    setLocalValidationErrors({});
    setShowGRNBottomSheet(false);
  }, []);

  // Handle one_time_charge toggle - update all durations
  useEffect(() => {
    // Only run if items exist
    if (items.length === 0) return;

    if (header.one_time_charge) {
      // Set all durations to 1 month
      dispatch(updateAllDurations(1));
    } else {
      // Restore original durations from cache
      dispatch(restoreOriginalDurations());
    }
  }, [header.one_time_charge, dispatch, items.length]);

  // Reload GRN data when returning from details/edit screen
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;

      // Only reload on subsequent focuses (not initial mount)
      if (focusCountRef.current > 1 && header.gr_id) {
        // Reload GRN data using the existing loadNewGRNData logic
        const reloadGRNData = async () => {
          dispatch(setIsLoadingItems(true));
          try {
            const response = await loadFormData(header.gr_id);
            if (response.success && response.data) {
              dispatch(
                loadInvoiceFormData({
                  header: {
                    customer_id: response.data.header.customer_id,
                    customer_name: response.data.header.customer_name,
                    gr_id: response.data.header.gr_id,
                    gr_no: response.data.header.gr_no,
                  },
                  items: response.data.items,
                  grId: header.gr_id,
                })
              );
            }
          } catch (error) {
            console.error('[InvoiceEditStep1] Error reloading GRN data:', error);
          } finally {
            dispatch(setIsLoadingItems(false));
          }
        };
        reloadGRNData();
      }
    }, [header.gr_id, dispatch])
  );

  // Navigate to GRN details screen
  const handleViewGRNDetails = useCallback(() => {
    if (header.gr_id) {
      router.push(`/grn-details/${header.gr_id}`);
    }
  }, [header.gr_id]);

  const handleDateConfirm = (params: { date: Date | undefined }) => {
    setShowDatePicker(false);
    if (params.date) {
      // Use local date components to avoid timezone shift issues
      // toISOString() converts to UTC which can shift the date back by 1 day in IST
      const year = params.date.getFullYear();
      const month = String(params.date.getMonth() + 1).padStart(2, '0');
      const day = String(params.date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      dispatch(updateHeader({ inv_date: dateString }));
      dispatch(clearValidationError('inv_date'));
    }
  };

  const handleDateDismiss = () => {
    setShowDatePicker(false);
  };

  const handleGRNSelect = async (grn: InvoiceableGrn) => {
    // Warn user if changing GRN (will affect invoice totals and items)
    if (header.gr_id && header.gr_id !== grn.id) {
      showAlert(
        'Change the GRN?',
        'All items on this invoice will be replaced with the new GRN\'s items and the totals recalculated. You can\'t undo this.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Change GRN',
            style: 'destructive',
            onPress: () => loadNewGRNData(grn),
          },
        ]
      );
    } else {
      loadNewGRNData(grn);
    }
  };

  const loadNewGRNData = async (grn: InvoiceableGrn) => {
    setSelectedGrn(grn);
    setShowGRNBottomSheet(false);

    // Load invoice form data for this GRN
    dispatch(setIsLoadingItems(true));
    try {
      const response = await loadFormData(grn.id);
      if (response.success && response.data) {
        // Update header with customer and GRN info
        dispatch(
          loadInvoiceFormData({
            header: {
              customer_id: response.data.header.customer_id,
              customer_name: response.data.header.customer_name,
              gr_id: response.data.header.gr_id,
              gr_no: response.data.header.gr_no,
            },
            items: response.data.items,
            grId: grn.id,
          })
        );
        dispatch(clearValidationError('gr_id'));
      } else {
        // Clear failed GRN selection and reset items
        dispatch(setSelectedGrId(null));
        dispatch(setItems([]));
        dispatch(
          updateHeader({
            gr_id: '',
            gr_no: '',
            customer_id: '',
            customer_name: '',
          })
        );
        showAlert("Couldn't load the GRN", response.message || 'Check your connection and try again.');
      }
    } catch (error: any) {
      console.error('[InvoiceEditStep1] Error loading GRN data:', error);
      // Clear failed GRN selection and reset items
      dispatch(setSelectedGrId(null));
      dispatch(setItems([]));
      dispatch(
        updateHeader({
          gr_id: '',
          gr_no: '',
          customer_id: '',
          customer_name: '',
        })
      );
      showAlert("Couldn't load the GRN", 'Check your connection and try again.');
    } finally {
      dispatch(setIsLoadingItems(false));
    }
  };

  const handleInvoiceNumberChange = (text: string) => {
    const numValue = parseInt(text);
    if (!isNaN(numValue) && numValue > 0) {
      dispatch(updateHeader({ inv_no: numValue }));
      dispatch(clearValidationError('inv_no'));
    } else if (text === '') {
      dispatch(updateHeader({ inv_no: 0 }));
    }
  };

  const handleOneTimeChargeToggle = (value: boolean) => {
    // ⚠️ Show confirmation when toggling one-time charge
    if (value !== header.one_time_charge) {
      const message = value
        ? 'Every item will be charged for 1 month.'
        : 'Items will be charged for the months they were stored.';

      showAlert(value ? 'Turn on one-time charge?' : 'Turn off one-time charge?', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: value ? 'Turn on' : 'Turn off',
          onPress: () => {
            dispatch(updateHeader({ one_time_charge: value }));
          },
        },
      ]);
    }
  };

  // The step header already asks "Discard changes to this invoice?" before calling this.
  const handleCancel = () => {
    router.dismiss(3);
    router.push('/invoices');
  };

  const handleNext = async () => {
    // Validate form
    const validation = await validateStep1(header);

    if (!validation.isValid) {
      setLocalValidationErrors(validation.errors);
      dispatch(setValidationErrors(validation.errors));

      const errorCount = Object.keys(validation.errors).length;
      const errorMessage =
        errorCount === 1
          ? 'Fix the highlighted field, then continue.'
          : `Fix the ${errorCount} highlighted fields, then continue.`;

      showAlert('Check the invoice details', errorMessage);
      return;
    }

    // Check if items are loaded
    if (!items || items.length === 0) {
      showAlert('No items to invoice', 'Select a GRN that has dispatched items, then continue.');
      return;
    }

    // Clear errors and proceed
    setLocalValidationErrors({});
    dispatch(setValidationErrors({}));
    dispatch(setCurrentStep(1));
    router.push(`/invoice-edit/${invoiceId}/step2`);
  };

  const handleStepPress = async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.HEADER) return; // Already on this step
    if (stepNumber === STEP_NUMBERS.ITEMS) {
      if (await canNavigateFromStep1(header, items)) {
        handleNext();
      }
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      // Navigate to review - validate step 1 first, then go to step 3 (skipping step 2 UI)
      if (await canNavigateFromStep1(header, items)) {
        // In edit mode, items are already loaded - navigate directly to review
        dispatch(setCurrentStep(2));
        router.push(`/invoice-edit/${invoiceId}/step3`);
      }
    }
  };

  const invDateError = validationErrors.inv_date;
  const invNoError = validationErrors.inv_no;
  const grError = validationErrors.gr_id;

  const renderError = (message?: string) =>
    message ? (
      <View style={styles.messageRow} accessibilityLiveRegion="polite">
        <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
    ) : null;

  return (
    <View style={styles.container}>
      <InvoiceStepIndicator
        steps={INVOICE_STEPS}
        currentStep={STEP_NUMBERS.HEADER}
        completedSteps={getCompletedSteps(STEP_NUMBERS.HEADER)}
        onCancel={handleCancel}
        onStepPress={handleStepPress}
        invoiceNo={header.inv_no > 0 ? header.inv_no : undefined}
        isEditMode={true}
      />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
      >
        {/* Invoice date */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, !!invDateError && styles.labelError]}>
            Invoice date <Text style={styles.required}>*</Text>
          </Text>
          <Pressable
            style={({ pressed }) => [styles.field, styles.fieldRow, pressed && styles.fieldPressed, !!invDateError && styles.fieldError]}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Invoice date, ${formatInvoiceDate(header.inv_date) || 'not set'}`}
            accessibilityHint="Opens the date picker"
          >
            <Text style={styles.fieldValue}>{formatInvoiceDate(header.inv_date)}</Text>
            <View style={styles.fieldIconButton}>
              <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
            </View>
          </Pressable>
          {renderError(invDateError)}
        </View>

        {/* Date Picker Modal */}
        <DatePickerModal
          locale="en"
          mode="single"
          visible={showDatePicker}
          onDismiss={handleDateDismiss}
          date={header.inv_date ? new Date(header.inv_date) : new Date()}
          onConfirm={handleDateConfirm}
          onChange={handleDateConfirm}
          validRange={{ endDate: new Date() }}
          label="Select invoice date"
        />

        {/* Financial year (read-only, calculated) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Financial year</Text>
          <View style={styles.readOnlyField}>
            <Text style={[styles.readOnlyText, styles.numeric]}>{header.inv_fin_year}</Text>
          </View>
          <Text style={styles.helperText}>Set from the invoice date.</Text>
        </View>

        {/* Invoice number */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, !!invNoError && styles.labelError]}>
            Invoice number <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.field, styles.fieldRow, !!invNoError && styles.fieldError]}>
            <TextInput
              style={[styles.fieldValue, styles.numeric]}
              value={header.inv_no > 0 ? header.inv_no.toString() : ''}
              onChangeText={handleInvoiceNumberChange}
              placeholder="Invoice number"
              placeholderTextColor={t.text.placeholder}
              keyboardType="number-pad"
              returnKeyType="done"
              editable={!isLoading}
              accessibilityLabel="Invoice number"
            />
          </View>
          {renderError(invNoError)}
        </View>

        {/* GRN selection */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, !!grError && styles.labelError]}>
            GRN <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.field, styles.fieldRow, !!grError && styles.fieldError]}>
            <Pressable
              style={styles.fieldValue}
              onPress={() => setShowGRNBottomSheet(true)}
              disabled={isLoadingItems}
              accessibilityRole="button"
              accessibilityLabel={header.gr_no ? `GRN ${header.gr_no}. Change GRN` : 'Select GRN'}
              accessibilityState={{ disabled: isLoadingItems, busy: isLoadingItems }}
            >
              <Text
                style={[styles.readOnlyText, !header.gr_no && styles.fieldPlaceholder]}
                numberOfLines={1}
              >
                {header.gr_no ? `GRN ${header.gr_no}` : 'Search and select a GRN'}
              </Text>
            </Pressable>

            {isLoadingItems ? (
              <View style={styles.fieldSpinner}>
                <ActivityIndicator size="small" color={t.brand.tint} />
              </View>
            ) : (
              <>
                {!!header.gr_id && (
                  <Pressable
                    onPress={handleViewGRNDetails}
                    style={styles.fieldIconButton}
                    accessibilityRole="button"
                    accessibilityLabel="View GRN details"
                  >
                    <Icon name="eye-outline" size={iconSize.md} color={t.brand.tint} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setShowGRNBottomSheet(true)}
                  style={styles.fieldIconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Search GRNs"
                >
                  <Icon name="magnify" size={iconSize.md} color={t.icon.primary} />
                </Pressable>
              </>
            )}
          </View>
          {renderError(grError)}
          {header.gr_id !== originalGrId && (
            <View style={styles.messageRow}>
              <Icon name="alert" size={iconSize.sm} color={t.status.critical.text} />
              <Text style={styles.warningText}>GRN changed. The items now come from the new GRN.</Text>
            </View>
          )}
        </View>

        {/* Customer (filled from the GRN, read-only) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Customer</Text>
          <View style={styles.readOnlyField}>
            <Text style={[styles.readOnlyText, !header.customer_name && styles.readOnlyPlaceholder]}>
              {header.customer_name || 'Filled in when you select a GRN'}
            </Text>
          </View>
        </View>

        {/* One-time charge */}
        <Pressable
          style={({ pressed }) => [styles.switchRow, pressed && styles.switchRowPressed]}
          onPress={() => handleOneTimeChargeToggle(!header.one_time_charge)}
          accessibilityRole="switch"
          accessibilityLabel="One-time charge"
          accessibilityState={{ checked: header.one_time_charge }}
        >
          <View style={styles.switchLabelContainer}>
            <Text style={styles.switchLabel}>One-time charge</Text>
            <Text style={styles.helperText}>
              On: every item is charged for 1 month. Off: items are charged for the months they were stored.
            </Text>
          </View>
          <Switch
            value={header.one_time_charge}
            onValueChange={handleOneTimeChargeToggle}
            trackColor={{ false: t.control.trackOff, true: t.brand.fill }}
            thumbColor={t.control.thumb}
            ios_backgroundColor={t.control.trackOff}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
      </KeyboardAwareScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel="Next: items"
        >
          <Text style={styles.primaryButtonText}>Next: items</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.brand.onFill} />
        </Pressable>
      </View>

      {/* GRN Selection Bottom Sheet */}
      <GRNAutocomplete
        isVisible={showGRNBottomSheet}
        onClose={() => setShowGRNBottomSheet(false)}
        onSelect={handleGRNSelect}
        currentValue={selectedGrn}
      />

    </View>
  );
}
