import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
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
import { INVOICE_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/invoiceSteps';
import { canNavigateFromStep1 } from '@/features/invoice/utils/swipeNavigationHelpers';

export default function InvoiceEditStep1() {
  const dispatch = useAppDispatch();
  const colors = useListColors(); // Dark mode support
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
      Alert.alert(
        'Change GRN?',
        `Changing the GRN will replace all current invoice items and recalculate totals. This action cannot be undone.\n\nContinue?`,
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
        Alert.alert('Error', response.message || 'Failed to load GRN data');
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
      Alert.alert('Error', 'Failed to load GRN data');
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
        ? 'Enabling one-time charge will set all item durations to 1 month. Continue?'
        : 'Disabling one-time charge will restore calculated durations. Continue?';

      Alert.alert('Confirm Change', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            dispatch(updateHeader({ one_time_charge: value }));
          },
        },
      ]);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel Invoice Edit', 'Are you sure you want to cancel? All unsaved changes will be lost.', [
      { text: 'Continue Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          router.dismiss(3);
          router.push('/invoices');
        },
      },
    ]);
  };

  const handleNext = async () => {
    // Validate form
    const validation = await validateStep1(header);

    if (!validation.isValid) {
      setLocalValidationErrors(validation.errors);
      dispatch(setValidationErrors(validation.errors));

      const errorFields = Object.keys(validation.errors);
      const errorMessage =
        errorFields.length > 0
          ? `Please check: ${errorFields.join(', ')}`
          : 'Please fill all required fields correctly';

      Alert.alert('Validation Error', errorMessage);
      return;
    }

    // Check if items are loaded
    if (!items || items.length === 0) {
      Alert.alert('No Items', 'Please select a GRN with dispatch items');
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

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
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
      >
        {/* Invoice Date */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.gray900 }]}>
            Invoice Date <Text style={[styles.required, { color: colors.error }]}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.input, styles.dateInput, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }, validationErrors.inv_date && { borderColor: colors.error, borderWidth: 2 }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Icon name="calendar" size={20} color={colors.gray500} />
            <Text style={[styles.dateText, { color: colors.gray900 }]}>
              {new Date(header.inv_date).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
          {validationErrors.inv_date && (
            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.inv_date}</Text>
          )}
        </View>

        {/* Date Picker Modal - Pure JS with dark mode support */}
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

        {/* Financial Year (Read-only, Auto-calculated) */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.gray900 }]}>Financial Year</Text>
          <View style={[styles.readOnlyField, { backgroundColor: colors.gray100 }]}>
            <Text style={[styles.readOnlyText, { color: colors.gray900 }]}>{header.inv_fin_year}</Text>
          </View>
          <Text style={[styles.helperText, { color: colors.gray500 }]}>Auto-calculated from invoice date</Text>
        </View>

        {/* Invoice Number */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.gray900 }]}>
            Invoice Number <Text style={[styles.required, { color: colors.error }]}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider, color: colors.gray900 }, validationErrors.inv_no && { borderColor: colors.error, borderWidth: 2 }]}
            value={header.inv_no > 0 ? header.inv_no.toString() : ''}
            onChangeText={handleInvoiceNumberChange}
            placeholder="Enter invoice number"
            placeholderTextColor={colors.gray400}
            keyboardType="numeric"
            editable={true}
          />
          {validationErrors.inv_no && (
            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.inv_no}</Text>
          )}
        </View>

        {/* GR Number Selection */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.gray900 }]}>
            GR Number <Text style={[styles.required, { color: colors.error }]}>*</Text>
          </Text>
          <View
            style={[styles.input, styles.selectInput, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }, validationErrors.gr_id && { borderColor: colors.error, borderWidth: 2 }]}
          >
            <TouchableOpacity
              style={styles.selectTextContainer}
              onPress={() => setShowGRNBottomSheet(true)}
              disabled={isLoadingItems}
            >
              <Text
                style={[styles.flex1, { color: colors.gray900 }, !header.gr_no && { color: colors.gray400 }]}
                numberOfLines={1}
              >
                {header.gr_no || 'Search and select GRN...'}
              </Text>
            </TouchableOpacity>

            <View style={styles.selectIcons}>
              {isLoadingItems ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  {/* View Details button - only show when GRN is selected */}
                  {header.gr_id && (
                    <TouchableOpacity
                      onPress={handleViewGRNDetails}
                      style={styles.iconButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Icon name="eye-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  {/* Change GRN button */}
                  <TouchableOpacity
                    onPress={() => setShowGRNBottomSheet(true)}
                    style={styles.iconButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon name="magnify" size={20} color={colors.gray400} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          {validationErrors.gr_id && (
            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.gr_id}</Text>
          )}
          {header.gr_id !== originalGrId && (
            <Text style={[styles.warningText, { color: colors.warning }]}>⚠️ GRN has been changed</Text>
          )}
        </View>

        {/* Customer Name (Auto-filled, Read-only) */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.gray900 }]}>Customer Name</Text>
          <View style={[styles.readOnlyField, { backgroundColor: colors.gray100 }]}>
            <Text style={[styles.readOnlyText, { color: colors.gray900 }]}>
              {header.customer_name || 'Select GRN to auto-fill'}
            </Text>
          </View>
          <Text style={[styles.helperText, { color: colors.gray500 }]}>Auto-filled from selected GRN</Text>
        </View>

        {/* One-Time Charge Toggle */}
        <View style={styles.formGroup}>
          <View style={[styles.switchRow, { backgroundColor: colors.cellBackground }]}>
            <View style={styles.switchLabelContainer}>
              <Text style={[styles.label, { color: colors.gray900 }]}>One-Time Charge</Text>
              <Text style={[styles.helperText, { color: colors.gray500 }]}>
                Enable to set all durations to 1 month (single billing). Disable to restore calculated durations (recurring charges).
              </Text>
            </View>
            <Switch
              value={header.one_time_charge}
              onValueChange={handleOneTimeChargeToggle}
              trackColor={{ false: colors.gray200, true: colors.primary }}
              thumbColor={colors.cellBackground}
              ios_backgroundColor={colors.gray200}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>

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

// SAP Fiori Form Cell Styles - colors applied inline for dark mode support
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
  },
  formGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: theme.fontWeight.normal,
    marginBottom: 6,
    lineHeight: 18,
  },
  required: {
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: theme.fontSize.base,
    minHeight: 44,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dateText: {
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
  flex1: {
    flex: 1,
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  selectTextContainer: {
    flex: 1,
  },
  selectIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  readOnlyField: {
    borderWidth: 0,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
  helperText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  warningText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    minHeight: 44,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
});
