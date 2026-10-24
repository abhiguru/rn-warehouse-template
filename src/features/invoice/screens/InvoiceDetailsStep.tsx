/**
 * Invoice step 1, Details: the date, the number and the GRN of an invoice.
 * One screen for a new invoice and for an edit (`mode`); the logic is
 * useInvoiceForm({ mode, step: 1 }).
 *
 * The messages of the fields appear when a field is left and when Next is
 * pressed, and go when the field changes.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { router, type Href } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { useInvoiceForm, type InvoiceFormMode } from '@/hooks/useInvoiceForm';
import { useBlurOnKeyboardHide } from '@/hooks/useBlurOnKeyboardHide';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAfterClosed } from '@/hooks/useAfterClosed';
import { GRNAutocomplete } from '@/features/invoice/components/GRNAutocomplete';
import type { InvoiceableGrn } from '@/types/invoice.types';
import WizardBottomBar from '@/components/WizardBottomBar';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { getLanguage, normalizeDigits, t as tr, formatIdentifier, identifierInput } from '@/i18n';
import { formatFinancialYear } from '@/utils/formatters';
import { showAlert } from '@/utils/alert';
import { INVOICE_NUMBER_DIGITS } from '@/features/invoice/schemas/invoiceValidation';

/** An invoice saved before the 8-digit ceiling may have a longer number; 10 digits are the most the server stores. */
const EDIT_NUMBER_DIGITS = 10;

/**
 * The wizard styles with this step's look: the content ends clear of the bottom bar, so the help text under the last
 * field is never behind it. The read-only fields keep the style guide's (§10, §13.2): `surface.fieldReadOnly`, no
 * border, the value in `text.primary`.
 */
const makeDetailsStyles = (t: ThemeTokens) => {
  const base = makeInvoiceWizardStyles(t);
  return {
    ...base,
    scrollContent: { ...base.scrollContent, paddingBottom: space.giant },
    retryButton: {
      alignSelf: 'flex-start' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.xs,
      minHeight: touchTarget,
      paddingHorizontal: space.sm,
      borderRadius: radius.button,
    },
    retryButtonText: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.brand.tint },
  };
};

export interface InvoiceStepProps {
  mode: InvoiceFormMode;
}

/**
 * The Android Back key on step 1 of an edit: with changes it asks what the
 * header's X asks, without it leaves at once. Drawn in an edit only, so that a
 * new invoice listens for Back once (the header does it there).
 */
function EditBackKey({ getIsChanged, onLeave }: { getIsChanged: () => boolean; onLeave: () => void }) {
  useBackHandler({
    onBackPress: () => {
      if (getIsChanged()) {
        showAlert(tr('invoice.steps.discardEditTitle'), tr('invoice.steps.discardEditMessage'), [
          { text: tr('common.keepEditing'), style: 'cancel' },
          { text: tr('common.discard'), style: 'destructive', onPress: onLeave },
        ]);
      } else {
        onLeave();
      }
      return true;
    },
  });
  return null;
}

export function InvoiceDetailsStep({ mode }: InvoiceStepProps) {
  // Closing the keyboard lets go of the field it was for (its text is formatted and checked).
  useBlurOnKeyboardHide();
  const isEdit = mode === 'edit';
  const styles = useThemedStyles(makeDetailsStyles);
  const t = useTokens();

  const {
    header,
    items,
    invoiceId,
    isLoading,
    isLoadingItems,
    getIsChanged,
    hasLineEdits,
    savedGrId,
    savedGrn,
    nextNumberFailed,
    isGettingNextNumber,
    validationErrors,
    updateHeaderField,
    suggestNumberIfEmpty,
    retryNextNumber,
    restoreSavedLines,
    validateField,
    loadGRNData,
    navigateToStep,
    resetFormState,
  } = useInvoiceForm({ mode, step: STEP_NUMBERS.HEADER });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGRNBottomSheet, setShowGRNBottomSheet] = useState(false);
  const [showNoItemsDialog, setShowNoItemsDialog] = useState(false);
  // The GRN picked from the list while the question "Change the GRN?" waits for an answer.
  const [pendingGrn, setPendingGrn] = useState<InvoiceableGrn | null>(null);
  // Each dialog hands over to the next one only after it has finished closing (a Modal opened while another is still
  // closing is dropped on iOS): "Select GRN" to the picker, and the picker to "Change the GRN?".
  const noItemsClosed = useAfterClosed(showNoItemsDialog);
  const sheetClosed = useAfterClosed(showGRNBottomSheet);

  // What the user has put into a new invoice. The suggested number and
  // today's date are filled in by the form itself and are not counted.
  const hasEnteredData = !!header.gr_id || items.length > 0 || !!header.inv_no_typed;

  // Nothing is reloaded when this screen comes back into focus (after the GRN
  // was viewed, or on the way back from a later step). A reload replaced the
  // lines with the price list's rates and threw away rates typed on step 2.
  // Only choosing another GRN loads lines; a GRN that changed meanwhile is
  // caught when the invoice is saved (the preview is read again before save).

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
      updateHeaderField('inv_date', `${year}-${month}-${day}`);
    }
  };

  const handleDateDismiss = () => {
    setShowDatePicker(false);
  };

  /** Puts the chosen GRN's lines in the form; a failed load leaves the previous GRN and its lines. */
  const loadChosenGrn = async (grn: InvoiceableGrn) => {
    setPendingGrn(null);
    await loadGRNData(grn.id, grn.gr_no);
  };

  const handleGRNSelect = (grn: InvoiceableGrn) => {
    setShowGRNBottomSheet(false);
    if (header.gr_id === grn.id) return; // the GRN that is chosen already: nothing changes, no question
    // An edit moved to another GRN goes back to the one it was saved with: its saved lines come back. Only typed
    // rates on the other GRN's lines are lost, so only they are asked about.
    if (isEdit && savedGrn && grn.id === savedGrn.id) {
      if (hasLineEdits) sheetClosed.later(() => setPendingGrn(grn));
      else restoreSavedLines();
      return;
    }
    // Choosing another GRN replaces the lines. In an edit that always loses the
    // invoice's saved lines, in a new invoice only what was typed on them.
    if (header.gr_id && (isEdit || hasLineEdits)) {
      sheetClosed.later(() => setPendingGrn(grn));
      return;
    }
    void loadChosenGrn(grn);
  };

  // The question is about going back to the saved GRN (its lines, discount and reason return), not about a new one.
  const restoring = isEdit && !!savedGrn && pendingGrn?.id === savedGrn.id;
  const confirmPendingGrn = () => {
    if (!pendingGrn) return;
    if (restoring) {
      setPendingGrn(null);
      restoreSavedLines();
      return;
    }
    void loadChosenGrn(pendingGrn);
  };

  // The next invoice number is on its way (a new form, or the date moved to another financial year).
  const isGettingNumber = isLoading || isGettingNextNumber;

  const handleInvoiceNumberChange = (text: string) => {
    // At most as many digits as the largest number the server accepts (maxLength
    // below does the same as the user types; this also covers a paste).
    const digits = isEdit ? EDIT_NUMBER_DIGITS : INVOICE_NUMBER_DIGITS;
    const numValue = parseInt(normalizeDigits(text).slice(0, digits));
    if (!isNaN(numValue) && numValue > 0) {
      updateHeaderField('inv_no', numValue);
    } else if (text === '') {
      updateHeaderField('inv_no', 0);
    }
  };

  // Where an edit goes back to: the invoice's own page.
  const leaveEdit = () => {
    router.dismissTo(`/invoice-details/${invoiceId}` as Href);
  };

  // The step header already asks "Discard this invoice?" / "Discard changes to this
  // invoice?" before calling this.
  // The Invoices tab, named: `back()` only took off the top entry, and when the
  // stack held a second step 1 it showed that step 1, emptied by the reset.
  const handleCancel = () => {
    if (isEdit) {
      leaveEdit();
      return;
    }
    resetFormState();
    router.dismissTo('/(tabs)/invoices');
  };

  const goToStep = async (step: number) => {
    const result = await navigateToStep(step);
    // The messages of the fields are on the screen; with no GRN the question is "Select GRN".
    if (result === 'noItems') setShowNoItemsDialog(true);
  };

  const handleNext = async () => {
    await goToStep(STEP_NUMBERS.ITEMS);
  };

  const handleStepPress = async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.HEADER) return; // Already on this step
    await goToStep(stepNumber);
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

  const numberHint = isGettingNumber
    ? tr('invoice.form.gettingNumber')
    : nextNumberFailed
      ? tr('invoice.form.numberUnavailable')
      : !isEdit && header.inv_no_typed
        ? tr('invoice.form.numberTyped')
        : !isEdit && header.inv_no > 0
          ? tr('invoice.form.numberHelp')
          // An emptied field: nothing is filled in until the field is left.
          : '';

  // The invoice's own GRN, listed first in the picker of an edit while it is the one chosen.
  const pinnedGrn = isEdit && savedGrn ? savedGrn : null;

  return (
    <View style={styles.container}>
      {isEdit && <EditBackKey getIsChanged={getIsChanged} onLeave={leaveEdit} />}

      <InvoiceStepIndicator
        steps={invoiceSteps()}
        currentStep={STEP_NUMBERS.HEADER}
        completedSteps={getCompletedSteps(STEP_NUMBERS.HEADER)}
        onCancel={handleCancel}
        // The Android Back key asks the same question as the X once something was entered.
        backOnFirstStep={isEdit ? undefined : { hasData: hasEnteredData, exitRoute: '/(tabs)/invoices', exitWith: 'dismissTo' }}
        onStepPress={handleStepPress}
        invoiceNo={header.inv_no > 0 ? header.inv_no : undefined}
        isEditMode={isEdit}
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
              placeholder={isGettingNumber ? tr('invoice.form.generating') : tr('common.invoiceNumber')}
              placeholderTextColor={t.text.placeholder}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={isEdit ? EDIT_NUMBER_DIGITS : INVOICE_NUMBER_DIGITS}
              // Stays editable while the number is asked for: a typed number is kept and ends the wait.
              editable={!isLoading}
              // An emptied field of a new invoice that is left gets the suggestion again; any other is checked.
              onBlur={() => { if (!suggestNumberIfEmpty()) void validateField('inv_no'); }}
              accessibilityLabel={tr('common.invoiceNumber')}
            />
            {isGettingNumber && (
              <View style={styles.fieldSpinner}>
                <ActivityIndicator size="small" color={t.brand.tint} />
              </View>
            )}
          </View>
          {renderError(invNoError)}
          {!!numberHint && <Text style={styles.helperText}>{numberHint}</Text>}
          {nextNumberFailed && !isGettingNumber && !isEdit && (
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && styles.fieldPressed]}
              onPress={retryNextNumber}
              accessibilityRole="button"
              accessibilityLabel={tr('invoice.form.numberRetryA11y')}
              testID="invoice-number-retry"
            >
              <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.retryButtonText}>{tr('common.retry')}</Text>
            </Pressable>
          )}
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
              {/* The number wraps: it is never cut to one line. */}
              <Text
                style={[styles.readOnlyText, !header.gr_no && styles.fieldPlaceholder]}
                testID="invoice-grn-value"
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
          {isEdit && !!savedGrId && header.gr_id !== savedGrId && (
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

      {/* Bottom action bar: no Back on step 1. It is busy while the invoice number is asked for, which Next would otherwise find empty. */}
      <WizardBottomBar
        currentStep={STEP_NUMBERS.HEADER}
        totalSteps={3}
        onNext={handleNext}
        nextLabel={tr('invoice.form.nextItems')}
        isLoading={isGettingNextNumber}
        loadingLabel={tr('invoice.form.generating')}
      />

      {/* GRN Selection Bottom Sheet: its current GRN is the form's own */}
      <GRNAutocomplete
        isVisible={showGRNBottomSheet}
        onClose={() => setShowGRNBottomSheet(false)}
        onSelect={handleGRNSelect}
        onDismissed={sheetClosed.onDismissed}
        currentValue={header.gr_id ? { id: header.gr_id } : null}
        pinnedGrn={pinnedGrn}
      />

      {/* No Items Dialog */}
      <ConfirmDialog
        visible={showNoItemsDialog}
        title={tr('invoice.form.noItemsTitle')}
        message={tr('invoice.form.noItemsMessage')}
        confirmText={tr('invoice.form.selectGrn')}
        cancelText={tr('common.close')}
        onConfirm={() => {
          noItemsClosed.later(() => setShowGRNBottomSheet(true));
          setShowNoItemsDialog(false);
        }}
        onCancel={() => setShowNoItemsDialog(false)}
        onDismissed={noItemsClosed.onDismissed}
        variant="warning"
        icon="alert-circle"
      />

      {/* Change the GRN? Its lines replace the invoice's; Cancel keeps everything. */}
      <ConfirmDialog
        visible={pendingGrn !== null}
        title={tr(restoring ? 'invoice.form.restoreGrnTitle' : 'invoice.form.changeGrnTitle')}
        message={restoring ? tr('invoice.form.restoreGrnMessage') : `${tr('invoice.form.changeGrnMessage')} ${tr('invoice.form.changeGrnDiscountCleared')}`}
        confirmText={tr(restoring ? 'invoice.form.restoreGrnConfirm' : 'invoice.form.changeGrnConfirm')}
        cancelText={tr('common.cancel')}
        onConfirm={confirmPendingGrn}
        onCancel={() => setPendingGrn(null)}
        variant="warning"
        icon="alert-circle"
      />
    </View>
  );
}

export default InvoiceDetailsStep;
