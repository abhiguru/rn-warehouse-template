import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
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
} from '@/store/slices/invoiceFormSlice';
import { GRNAutocomplete } from '@/features/invoice/components/GRNAutocomplete';
import { validateStep1 } from '@/features/invoice/schemas/invoiceValidation';
import { loadInvoiceFormData as loadFormData } from '@/features/invoice/services/invoiceFormService';
import { InvoiceableGrn } from '@/types/invoice.types';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { canNavigateFromStep1 } from '@/features/invoice/utils/swipeNavigationHelpers';

import { showAlert } from '@/utils/alert';
import { getLanguage, normalizeDigits, t as tr, formatIdentifier, identifierInput } from '@/i18n';
import { formatFinancialYear } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';
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

  // Clear all local state on mount to prevent stale data
  useEffect(() => {
    setShowDatePicker(false);
    setLocalValidationErrors({});
    setShowGRNBottomSheet(false);
  }, []);

  // Nothing is reloaded when this screen comes back into focus (for example
  // after the GRN was viewed). The lines, the discount and its reason are the
  // saved invoice's; only choosing another GRN below replaces the lines.

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
        tr('invoice.form.changeGrnTitle'),
        tr('invoice.form.changeGrnMessage'),
        [
          { text: tr('common.cancel'), style: 'cancel' },
          {
            text: tr('invoice.form.changeGrnConfirm'),
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
        showAlert(tr('invoice.form.grnLoadFailedTitle'), serverText(response.message, tr('common.checkConnection')));
      }
    } catch (error: any) {
      console.error('[InvoiceEditStep1] Error loading GRN data:', error instanceof Error ? error.message : String(error));
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
      showAlert(tr('invoice.form.grnLoadFailedTitle'), tr('common.checkConnection'));
    } finally {
      dispatch(setIsLoadingItems(false));
    }
  };

  const handleInvoiceNumberChange = (text: string) => {
    const numValue = parseInt(normalizeDigits(text));
    if (!isNaN(numValue) && numValue > 0) {
      dispatch(updateHeader({ inv_no: numValue }));
      dispatch(clearValidationError('inv_no'));
    } else if (text === '') {
      dispatch(updateHeader({ inv_no: 0 }));
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
      const errorMessage = tr('invoice.form.fixFields', { count: errorCount });

      showAlert(tr('invoice.form.checkDetailsTitle'), errorMessage);
      return;
    }

    // Check if items are loaded
    if (!items || items.length === 0) {
      showAlert(tr('invoice.form.noItemsTitle'), tr('invoice.form.noItemsMessage'));
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

  // Whether the GRN is priced one-time. The server decides the amounts from
  // the GRN, so this is shown for information and cannot be switched here.
  const oneTimeChargeText = !header.gr_id
    ? tr('invoice.form.customerPlaceholder')
    : header.one_time_charge
      ? tr('common.yes')
      : tr('common.no');

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
        steps={invoiceSteps()}
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
            {tr('invoice.form.invoiceDate')} <Text style={styles.required}>*</Text>
          </Text>
          <Pressable
            style={({ pressed }) => [styles.field, styles.fieldRow, pressed && styles.fieldPressed, !!invDateError && styles.fieldError]}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={
              formatInvoiceDate(header.inv_date)
                ? tr('invoice.form.invoiceDateA11y', { date: formatInvoiceDate(header.inv_date) })
                : tr('invoice.form.invoiceDateNotSetA11y')
            }
            accessibilityHint={tr('invoice.form.datePickerHint')}
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
          locale={getLanguage()}
          mode="single"
          visible={showDatePicker}
          onDismiss={handleDateDismiss}
          date={header.inv_date ? new Date(header.inv_date) : new Date()}
          onConfirm={handleDateConfirm}
          onChange={handleDateConfirm}
          validRange={{ endDate: new Date() }}
          label={tr('invoice.form.selectInvoiceDate')}
          saveLabel={tr('common.save')}
        />

        {/* Financial year (read-only, calculated) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>{tr('invoice.label.financialYear')}</Text>
          <View style={styles.readOnlyField}>
            <Text style={[styles.readOnlyText, styles.numeric]}>{formatFinancialYear(header.inv_fin_year)}</Text>
          </View>
          <Text style={styles.helperText}>{tr('invoice.form.financialYearHelp')}</Text>
        </View>

        {/* Invoice number */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, !!invNoError && styles.labelError]}>
            {tr('common.invoiceNumber')} <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.field, styles.fieldRow, !!invNoError && styles.fieldError]}>
            <TextInput
              style={[styles.fieldValue, styles.numeric]}
              {...identifierInput(header.inv_no > 0 ? header.inv_no : '', handleInvoiceNumberChange)}
              placeholder={tr('common.invoiceNumber')}
              placeholderTextColor={t.text.placeholder}
              keyboardType="number-pad"
              returnKeyType="done"
              editable={!isLoading}
              accessibilityLabel={tr('common.invoiceNumber')}
            />
          </View>
          {renderError(invNoError)}
        </View>

        {/* GRN selection */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, !!grError && styles.labelError]}>
            {tr('common.grn')} <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.field, styles.fieldRow, !!grError && styles.fieldError]}>
            <Pressable
              style={styles.fieldValue}
              onPress={() => setShowGRNBottomSheet(true)}
              disabled={isLoadingItems}
              accessibilityRole="button"
              accessibilityLabel={header.gr_no ? tr('invoice.form.grnChangeA11y', { number: formatIdentifier(header.gr_no) }) : tr('invoice.form.selectGrn')}
              accessibilityState={{ disabled: isLoadingItems, busy: isLoadingItems }}
            >
              <Text
                style={[styles.readOnlyText, !header.gr_no && styles.fieldPlaceholder]}
                numberOfLines={1}
              >
                {header.gr_no ? tr('invoice.label.grnNumber', { number: formatIdentifier(header.gr_no) }) : tr('invoice.form.grnPlaceholder')}
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
                    accessibilityLabel={tr('invoice.form.viewGrnDetails')}
                  >
                    <Icon name="eye-outline" size={iconSize.md} color={t.brand.tint} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setShowGRNBottomSheet(true)}
                  style={styles.fieldIconButton}
                  accessibilityRole="button"
                  accessibilityLabel={tr('invoice.form.searchGrns')}
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
              <Text style={styles.warningText}>{tr('invoice.form.grnChangedWarning')}</Text>
            </View>
          )}
        </View>

        {/* Customer (filled from the GRN, read-only) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>{tr('common.customer')}</Text>
          <View style={styles.readOnlyField}>
            <Text style={[styles.readOnlyText, !header.customer_name && styles.readOnlyPlaceholder]}>
              {header.customer_name || tr('invoice.form.customerPlaceholder')}
            </Text>
          </View>
        </View>

        {/* One-time charge: the GRN's pricing mode, shown, not chosen here */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>{tr('invoice.label.oneTimeCharge')}</Text>
          <View
            style={styles.readOnlyField}
            accessible
            accessibilityLabel={`${tr('invoice.label.oneTimeCharge')}, ${oneTimeChargeText}`}
          >
            <Text style={[styles.readOnlyText, !header.gr_id && styles.readOnlyPlaceholder]}>{oneTimeChargeText}</Text>
          </View>
          <Text style={styles.helperText}>{tr('invoice.form.oneTimeChargeHelp')}</Text>
        </View>
      </KeyboardAwareScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + space.md }]}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={tr('invoice.form.nextItems')}
        >
          <Text style={styles.primaryButtonText}>{tr('invoice.form.nextItems')}</Text>
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
