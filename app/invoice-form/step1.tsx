/**
 * Invoice Form Step 1 - Header Information
 * Collects invoice date, number, GRN selection, and one-time charge toggle
 *
 * Refactored to use useInvoiceForm hook for form state management.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { GRNAutocomplete } from '@/features/invoice/components/GRNAutocomplete';
import { InvoiceableGrn } from '@/types/invoice.types';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import {
  INVOICE_STEPS,
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';

export default function InvoiceFormStep1() {
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

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

  // The step header already asks "Discard this invoice?" before calling this.
  const handleCancel = () => {
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
              placeholder={isLoading ? 'Generating…' : 'Invoice number'}
              placeholderTextColor={t.text.placeholder}
              keyboardType="number-pad"
              returnKeyType="done"
              editable={!isLoading}
              accessibilityLabel="Invoice number"
            />
            {isLoading && (
              <View style={styles.fieldSpinner}>
                <ActivityIndicator size="small" color={t.brand.tint} />
              </View>
            )}
          </View>
          {renderError(invNoError)}
          <Text style={styles.helperText}>
            {isLoading ? 'Getting the next invoice number…' : 'The next number is filled in. You can change it.'}
          </Text>
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
          onPress={() => updateHeaderField('one_time_charge', !header.one_time_charge)}
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
            onValueChange={(value) => {
              updateHeaderField('one_time_charge', value);
            }}
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

      {/* No Items Dialog */}
      <ConfirmDialog
        visible={showNoItemsDialog}
        title="No items to invoice"
        message="Select a GRN that has dispatched items, then continue."
        confirmText="Select GRN"
        cancelText="Close"
        onConfirm={() => {
          setShowNoItemsDialog(false);
          setShowGRNBottomSheet(true);
        }}
        onCancel={() => setShowNoItemsDialog(false)}
        variant="warning"
        icon="alert-circle"
      />
    </View>
  );
}
