import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  updateDiscount,
  updateHeader,
  resetForm,
  setIsSaving,
  setCurrentStep,
  selectInvoiceFormHeader,
  selectInvoiceFormItems,
  selectInvoiceFormId,
} from '@/store/slices/invoiceFormSlice';
import { InvoiceCalculationSummary } from '@/features/invoice/components/InvoiceCalculationSummary';
import { InvoiceSuccessDialog } from '@/features/invoice/components/InvoiceSuccessDialog';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import {
  updateInvoice,
  transformFormDataToPayload,
} from '@/features/invoice/services/invoiceFormService';
import { SavedInvoiceData } from '@/types/invoice.types';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { discountNeedsReason, formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
import { formatNumber } from '@/utils/formatters';
export default function InvoiceEditStep3() {
  const dispatch = useAppDispatch();
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const header = useAppSelector(selectInvoiceFormHeader);
  const items = useAppSelector(selectInvoiceFormItems);
  const invoiceId = useAppSelector(selectInvoiceFormId);
  const { is_saving: isSaving } = useAppSelector((state) => state.invoiceForm);

  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<SavedInvoiceData | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isShareLoading, setIsShareLoading] = useState(false);

  const handleDiscountChange = (value: number) => {
    dispatch(updateDiscount(value));
  };

  const { role } = useRoleBasedAccess();
  const reasonRequired = discountNeedsReason(header, role);
  const handleDiscountReasonChange = (reason: string) => {
    dispatch(updateHeader({ discount_reason: reason }));
  };

  const handleBack = () => {
    router.back();
  };

  // The step header already asks "Discard changes to this invoice?" before calling this.
  const handleCancel = () => {
    dispatch(resetForm());
    router.dismiss(3);
    router.push('/invoices');
  };

  const handleSubmit = async () => {
    // Final validation check
    if (items.length === 0) {
      showAlert(tr('invoice.form.noItemsTitle'), tr('invoice.review.noItemsMessage'));
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      showAlert(tr('invoice.review.selectGrnTitle'), tr('invoice.review.selectGrnMessage'));
      return;
    }

    if (!invoiceId) {
      showAlert(tr('invoice.review.notFoundTitle'), tr('invoice.review.notFoundMessage'));
      return;
    }

    if (reasonRequired) {
      showAlert(tr('invoice.review.discountReasonTitle'), tr('invoice.review.discountReasonUpdateMessage'));
      return;
    }

    // Confirm submission
    showAlert(
      tr('invoice.review.updateTitle', { number: String(header.inv_no) }),
      tr('invoice.review.confirmMessage', { customer: header.customer_name, total: formatInvoiceAmount(header.total) }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr('invoice.review.updateInvoice'), style: 'default', onPress: submitInvoiceUpdate },
      ]
    );
  };

  const submitInvoiceUpdate = async () => {
    if (!invoiceId) {
      showAlert(tr('invoice.review.notFoundTitle'), tr('invoice.review.notFoundMessage'));
      return;
    }

    dispatch(setIsSaving(true));

    try {
      // Transform form data to RPC payload
      const payload = transformFormDataToPayload(header, items);

      // Call update invoice service
      const response = await updateInvoice(invoiceId, payload);

      if (response.success && response.data) {
        // Prepare saved invoice data for dialog
        setSavedInvoiceData({
          invoice_id: response.data.invoice_id,
          invoice_no: response.data.invoice_no,
          fin_year: header.inv_fin_year,
          customer_name: header.customer_name,
          total: header.total,
        });

        // Show success dialog
        setShowSuccessDialog(true);
      } else {
        console.error('[InvoiceEditStep3] Failed to update invoice:', response.message);
        showAlert(tr('invoice.review.updateFailedTitle'), response.message || tr('common.checkConnection'));
      }
    } catch (error: any) {
      console.error('[InvoiceEditStep3] Error updating invoice:', error);
      showAlert(tr('invoice.review.updateFailedTitle'), tr('common.checkConnection'));
    } finally {
      dispatch(setIsSaving(false));
    }
  };

  const handleEditAnother = () => {
    setShowSuccessDialog(false);
    setSavedInvoiceData(null);
    dispatch(resetForm());
    // Navigate back to invoice list, user can select another to edit
    router.dismiss(3);
    router.push('/invoices');
  };

  const handleViewList = () => {
    setShowSuccessDialog(false);
    setSavedInvoiceData(null);
    dispatch(resetForm());
    router.dismiss(3);
    router.push('/invoices');
  };

  const handlePrint = () => {
    setShowSuccessDialog(false);
    setShowPrintDialog(true);
  };

  const handleSharePDF = async () => {
    if (!savedInvoiceData) return;

    setIsShareLoading(true);
    try {
      // Extract year from fin_year string (e.g., '2025-26' -> 2025)
      const finYearNum = parseInt(header.inv_fin_year.split('-')[0], 10);

      // Generate PDF
      const pdfResult = await generateInvoicePDF(
        savedInvoiceData.invoice_no,
        finYearNum
      );
      if (!pdfResult.success || !pdfResult.pdfUrl) {
        setSnackbarMessage(tr('invoice.review.pdfCreateFailed'));
        setSnackbarVisible(true);
        return;
      }

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Invoice_${savedInvoiceData.invoice_no}_FY${header.inv_fin_year}.pdf`
      );
      if (!shareResult.success) {
        setSnackbarMessage(tr('invoice.review.pdfShareFailed'));
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('[InvoiceEditStep3] Share PDF error:', error);
      setSnackbarMessage(tr('invoice.review.pdfShareFailed'));
      setSnackbarVisible(true);
    } finally {
      setIsShareLoading(false);
    }
  };

  // Calculate totals for items summary
  // Total Dispatch Qty: sum of all dispatch item quantities being invoiced
  const totalDispatchQty = items.reduce((sum, item) => sum + item.qty, 0);

  // Total GRN Qty: Original quantity received in the GRN for all unique items
  // Group by item_id + package_mark and take the grn_original_qty (same for all items with same group key)
  const uniqueGrnItems = items.reduce((acc, item) => {
    const groupKey = `${item.item_id}_${item.package_mark}`;
    if (!acc[groupKey]) {
      acc[groupKey] = item.grn_original_qty;
    }
    return acc;
  }, {} as Record<string, number>);

  const totalGRQty = Object.values(uniqueGrnItems).reduce((sum, qty) => sum + qty, 0);

  const handleStepPress = (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.REVIEW) return; // Already on this step
    if (stepNumber === STEP_NUMBERS.HEADER) {
      dispatch(setCurrentStep(0));
      router.push(`/invoice-edit/${invoiceId}/step1`);
    } else if (stepNumber === STEP_NUMBERS.ITEMS) {
      handleBack();
    }
  };


  return (
    <View style={styles.container}>
      <InvoiceStepIndicator
        steps={invoiceSteps()}
        currentStep={STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
        onStepPress={handleStepPress}
        invoiceNo={header.inv_no > 0 ? header.inv_no : undefined}
        isEditMode={true}
      />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={100}
      >
        {/* Invoice details */}
        <View>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, styles.sectionHeaderInRow]} accessibilityRole="header">
              {tr('invoice.review.invoiceDetails')}
            </Text>
            <Pressable
              onPress={() => handleStepPress(STEP_NUMBERS.HEADER)}
              style={styles.editLink}
              accessibilityRole="link"
              accessibilityLabel={tr('invoice.review.editDetailsA11y')}
            >
              <Text style={styles.secondaryButtonText}>{tr('common.edit')}</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View style={styles.kvRowStacked}>
              <Text style={styles.kvKey}>{tr('common.customer')}</Text>
              <Text style={styles.kvValueStacked}>{header.customer_name}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('common.invoiceNumber')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{header.inv_no}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.form.invoiceDate')}</Text>
              <Text style={styles.kvValue}>{formatInvoiceDate(header.inv_date)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.label.financialYear')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{header.inv_fin_year}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('common.grn')}</Text>
              <Text style={styles.kvValue}>{header.gr_no}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.label.oneTimeCharge')}</Text>
              <Text style={styles.kvValue}>{header.one_time_charge ? tr('common.yes') : tr('common.no')}</Text>
            </View>
          </View>
        </View>

        {/* Items */}
        <View>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, styles.sectionHeaderInRow]} accessibilityRole="header">
              {tr('common.items')}
            </Text>
            <Pressable
              onPress={() => handleStepPress(STEP_NUMBERS.ITEMS)}
              style={styles.editLink}
              accessibilityRole="link"
              accessibilityLabel={tr('invoice.review.editItemsA11y')}
            >
              <Text style={styles.secondaryButtonText}>{tr('common.edit')}</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>{tr('invoice.review.qtyReceived')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{formatNumber(totalGRQty)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.review.qtyDispatched')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{formatNumber(totalDispatchQty)}</Text>
            </View>
          </View>
        </View>

        {/* Calculation Summary with Discount */}
        <InvoiceCalculationSummary
          header={header}
          items={items}
          onDiscountChange={handleDiscountChange}
          onDiscountReasonChange={handleDiscountReasonChange}
          reasonRequired={reasonRequired}
        />
      </KeyboardAwareScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={handleBack}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={tr('invoice.review.backToItems')}
          accessibilityState={{ disabled: isSaving }}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.secondaryButtonText}>{tr('common.back')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={isSaving ? undefined : handleSubmit}
          accessibilityRole="button"
          accessibilityLabel={isSaving ? tr('invoice.review.savingA11y') : tr('invoice.review.updateInvoice')}
          accessibilityState={{ busy: isSaving }}
        >
          {isSaving ? (
            <>
              <ActivityIndicator size="small" color={t.brand.onFill} />
              <Text style={styles.primaryButtonText}>{tr('common.saving')}</Text>
            </>
          ) : (
            <>
              <Icon name="check" size={iconSize.md} color={t.brand.onFill} />
              <Text style={styles.primaryButtonText}>{tr('invoice.review.updateInvoice')}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Success Dialog */}
      <InvoiceSuccessDialog
        isVisible={showSuccessDialog}
        invoiceData={savedInvoiceData}
        onCreateAnother={handleEditAnother}
        onViewList={handleViewList}
        onPrint={handlePrint}
        onSharePDF={handleSharePDF}
        isShareLoading={isShareLoading}
        isEditMode={true}
      />

      {/* Print Dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => {
          setShowPrintDialog(false);
          dispatch(resetForm());
          router.dismiss(3);
          router.push('/invoices');
        }}
        onConfirm={async (start, end) => {
          const result = await printInvoiceRange(start, end);
          setShowPrintDialog(false);
          if (result.success) {
            setSnackbarMessage(
              end && end !== start
                ? tr('invoice.print.sentRange', { start: String(start), end: String(end) })
                : tr('invoice.print.sentOne', { number: String(start) })
            );
          } else {
            setSnackbarMessage(tr('invoice.print.failed'));
          }
          setSnackbarVisible(true);
          dispatch(resetForm());
          router.dismiss(3);
          router.push('/invoices');
        }}
        title={tr('invoice.print.title')}
        defaultNumber={savedInvoiceData?.invoice_no?.toString() || ''}
        label={tr('common.invoiceNumber')}
        placeholder={tr('invoice.print.example', { example: '123' })}
      />

      {/* Snackbar for print status */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: tr('common.dismiss'),
          onPress: () => setSnackbarVisible(false),
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

