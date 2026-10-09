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
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import {
  INVOICE_STEPS,
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';

import { showAlert } from '@/utils/alert';
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
      showAlert('No items to invoice', 'Go back to the details step and select a GRN that has dispatched items.');
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      showAlert('Select a GRN', 'Go back to the details step and select the GRN for this invoice.');
      return;
    }

    if (!invoiceId) {
      showAlert("Couldn't find the invoice", 'Open the invoice again from the list.');
      return;
    }

    if (reasonRequired) {
      showAlert('Enter a discount reason', 'Enter the reason for this discount change before updating the invoice.');
      return;
    }

    // Confirm submission
    showAlert(
      `Update invoice ${header.inv_no}?`,
      `${header.customer_name}\nTotal ${formatInvoiceAmount(header.total)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Update invoice', style: 'default', onPress: submitInvoiceUpdate },
      ]
    );
  };

  const submitInvoiceUpdate = async () => {
    if (!invoiceId) {
      showAlert("Couldn't find the invoice", 'Open the invoice again from the list.');
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
        showAlert("Couldn't update the invoice", response.message || 'Check your connection and try again.');
      }
    } catch (error: any) {
      console.error('[InvoiceEditStep3] Error updating invoice:', error);
      showAlert("Couldn't update the invoice", 'Check your connection and try again.');
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
        setSnackbarMessage("Couldn't create the PDF. Try again.");
        setSnackbarVisible(true);
        return;
      }

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Invoice_${savedInvoiceData.invoice_no}_FY${header.inv_fin_year}.pdf`
      );
      if (!shareResult.success) {
        setSnackbarMessage("Couldn't share the PDF. Try again.");
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('[InvoiceEditStep3] Share PDF error:', error);
      setSnackbarMessage("Couldn't share the PDF. Try again.");
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
        steps={INVOICE_STEPS}
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
              Invoice details
            </Text>
            <Pressable
              onPress={() => handleStepPress(STEP_NUMBERS.HEADER)}
              style={styles.editLink}
              accessibilityRole="link"
              accessibilityLabel="Edit invoice details"
            >
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View style={styles.kvRowStacked}>
              <Text style={styles.kvKey}>Customer</Text>
              <Text style={styles.kvValueStacked}>{header.customer_name}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>Invoice number</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{header.inv_no}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>Invoice date</Text>
              <Text style={styles.kvValue}>{formatInvoiceDate(header.inv_date)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>Financial year</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{header.inv_fin_year}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>GRN</Text>
              <Text style={styles.kvValue}>{header.gr_no}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>One-time charge</Text>
              <Text style={styles.kvValue}>{header.one_time_charge ? 'Yes' : 'No'}</Text>
            </View>
          </View>
        </View>

        {/* Items */}
        <View>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, styles.sectionHeaderInRow]} accessibilityRole="header">
              Items
            </Text>
            <Pressable
              onPress={() => handleStepPress(STEP_NUMBERS.ITEMS)}
              style={styles.editLink}
              accessibilityRole="link"
              accessibilityLabel="Edit items"
            >
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Quantity received on the GRN</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{formatNumber(totalGRQty)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>Quantity dispatched</Text>
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
          accessibilityLabel="Back to items"
          accessibilityState={{ disabled: isSaving }}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={isSaving ? undefined : handleSubmit}
          accessibilityRole="button"
          accessibilityLabel={isSaving ? 'Saving invoice' : 'Update invoice'}
          accessibilityState={{ busy: isSaving }}
        >
          {isSaving ? (
            <>
              <ActivityIndicator size="small" color={t.brand.onFill} />
              <Text style={styles.primaryButtonText}>Saving…</Text>
            </>
          ) : (
            <>
              <Icon name="check" size={iconSize.md} color={t.brand.onFill} />
              <Text style={styles.primaryButtonText}>Update invoice</Text>
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
            setSnackbarMessage(end && end !== start ? `Invoices ${start} to ${end} sent to the printer.` : `Invoice ${start} sent to the printer.`);
          } else {
            setSnackbarMessage("Couldn't print the invoice. Check the printer and try again.");
          }
          setSnackbarVisible(true);
          dispatch(resetForm());
          router.dismiss(3);
          router.push('/invoices');
        }}
        title="Print invoice"
        defaultNumber={savedInvoiceData?.invoice_no?.toString() || ''}
        label="Invoice number"
        placeholder="For example, 123"
      />

      {/* Snackbar for print status */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbarVisible(false),
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

