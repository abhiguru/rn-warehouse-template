/**
 * Invoice Form Step 1 - Header Information
 * Collects invoice date, number, GRN selection, and one-time charge toggle
 *
 * Refactored to use useInvoiceForm hook for form state management.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { GRNAutocomplete } from '@/features/invoice/components/GRNAutocomplete';
import { InvoiceableGrn } from '@/types/invoice.types';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import { INVOICE_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/invoiceSteps';

export default function InvoiceFormStep1() {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Use the consolidated invoice form hook - handles initialization
  const {
    header,
    items,
    isLoading,
    isLoadingItems,
    validationErrors,
    updateHeaderField,
    updateHeaderFields,
    loadGRNData,
    setAllDurations,
    restoreOriginalItemDurations,
    clearFieldValidationError,
    navigateToStep,
    resetFormState,
  } = useInvoiceForm({ mode: 'create' });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGRNBottomSheet, setShowGRNBottomSheet] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<InvoiceableGrn | null>(null);

  // Dialog states for dark mode compliance
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showNoItemsDialog, setShowNoItemsDialog] = useState(false);

  // Track focus count to skip initial mount for data reload
  const focusCountRef = useRef(0);

  // I11: Handle Android back button - on step 1, go back to invoice list
  useBackHandler({
    currentStep: 1,
    totalSteps: 4,
    stepBasePath: '/invoice-form/step',
    exitRoute: '/invoices',
  });

  // Note: Form initialization (invoice number generation) is handled by useInvoiceForm hook

  // Handle one_time_charge toggle - update all durations
  useEffect(() => {
    // Only run if items exist (after GRN is selected and loaded)
    if (items.length === 0) return;

    if (header.one_time_charge) {
      // Set all durations to 1 month
      setAllDurations(1);
    } else {
      // Restore original durations from cache
      restoreOriginalItemDurations();
    }
  }, [header.one_time_charge, items.length, setAllDurations, restoreOriginalItemDurations]);

  // Reload GRN data when returning from details/edit screen
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;

      // Only reload on subsequent focuses (not initial mount)
      if (focusCountRef.current > 1 && header.gr_id) {
        loadGRNData(header.gr_id);
      }
    }, [header.gr_id, loadGRNData])
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
      updateHeaderField('inv_date', dateString);
    }
  };

  const handleDateDismiss = () => {
    setShowDatePicker(false);
  };

  const handleGRNSelect = async (grn: InvoiceableGrn) => {
    setSelectedGrn(grn);
    setShowGRNBottomSheet(false);

    // Load invoice form data for this GRN via hook
    await loadGRNData(grn.id);
    clearFieldValidationError('gr_id');
  };

  const handleInvoiceNumberChange = (text: string) => {
    const numValue = parseInt(text);
    if (!isNaN(numValue) && numValue > 0) {
      updateHeaderField('inv_no', numValue);
    } else if (text === '') {
      updateHeaderField('inv_no', 0);
    }
  };

  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  const handleCancelConfirm = () => {
    setShowCancelDialog(false);
    resetFormState();
    router.back();
  };

  const handleNext = async () => {
    // Check if items are loaded
    if (!items || items.length === 0) {
      setShowNoItemsDialog(true);
      return;
    }

    await navigateToStep(2);
  };

  const handleStepPress = async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.HEADER) return; // Already on this step
    if (stepNumber === STEP_NUMBERS.ITEMS) {
      await handleNext();
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      // Navigate to review - validate step 1 first, then go to step 3 (if items exist)
      if (items && items.length > 0) {
        await navigateToStep(3);
      } else {
        setShowNoItemsDialog(true);
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
          <View style={styles.inputWithLoadingContainer}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider, color: colors.gray900 }, validationErrors.inv_no && { borderColor: colors.error, borderWidth: 2 }]}
              value={header.inv_no > 0 ? header.inv_no.toString() : ''}
              onChangeText={handleInvoiceNumberChange}
              placeholder="Auto-generated..."
              placeholderTextColor={colors.gray400}
              keyboardType="numeric"
              editable={!isLoading}
            />
            {isLoading && (
              <View style={styles.loadingIndicator}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
          </View>
          {validationErrors.inv_no && (
            <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.inv_no}</Text>
          )}
          <Text style={[styles.helperText, { color: colors.gray500 }]}>
            {isLoading ? 'Generating invoice number...' : 'Auto-generated, can be edited'}
          </Text>
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
                style={[styles.selectText, { color: colors.gray900 }, !header.gr_no && { color: colors.gray400 }]}
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
              onValueChange={(value) => {
                updateHeaderField('one_time_charge', value);
              }}
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

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        visible={showCancelDialog}
        title="Cancel Invoice Creation"
        message="Are you sure you want to cancel? All entered data will be lost."
        confirmText="Yes, Cancel"
        cancelText="No, Continue"
        onConfirm={handleCancelConfirm}
        onCancel={() => setShowCancelDialog(false)}
        variant="danger"
        icon="close-circle"
      />

      {/* No Items Dialog */}
      <ConfirmDialog
        visible={showNoItemsDialog}
        title="No Items"
        message="Please select a GRN with dispatch items before proceeding."
        confirmText="OK"
        cancelText=""
        onConfirm={() => setShowNoItemsDialog(false)}
        onCancel={() => setShowNoItemsDialog(false)}
        variant="warning"
        icon="alert-circle"
      />
    </View>
  );
}

// SAP Fiori Form Cell Styles
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
  // Fiori: Label uses 13pt
  label: {
    fontSize: 13,
    fontWeight: theme.fontWeight.normal,
    marginBottom: 6,
    lineHeight: 18,
  },
  required: {
  },
  // Fiori: Input field - 44pt min height, 17pt text
  input: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: theme.fontSize.base,
    minHeight: 44,
  },
  inputWithLoadingContainer: {
    position: 'relative',
  },
  loadingIndicator: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
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
  // Select input (GRN picker) - row layout with icon
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  selectText: {
    flex: 1,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
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
  // Fiori: Read-only field
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
  // Fiori: Helper text - 13pt
  helperText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  // Fiori: Error text - 13pt
  errorText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  // Fiori: Switch cell - 44pt min height, 16pt horizontal padding
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
