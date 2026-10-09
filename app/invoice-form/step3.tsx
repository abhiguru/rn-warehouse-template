/**
 * Invoice Form Step 3 - Review and Submit
 * Displays invoice summary, calculation breakdown, and submit button
 *
 * Refactored to use useInvoiceForm hook for form state management.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Snackbar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { discountNeedsReason, formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceCalculationSummary } from '@/features/invoice/components/InvoiceCalculationSummary';
import { InvoiceSuccessDialog } from '@/features/invoice/components/InvoiceSuccessDialog';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { SavedInvoiceData } from '@/types/invoice.types';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import {
  INVOICE_STEPS,
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { formatNumber } from '@/utils/formatters';

export default function InvoiceFormStep3() {
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Use the consolidated invoice form hook
  const {
    header,
    items,
    isSaving,
    updateDiscountAmount,
    updateHeaderField,
    navigateToStep,
    submitForm,
    resetFormState,
  } = useInvoiceForm({ mode: 'create' });

  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<SavedInvoiceData | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isShareLoading, setIsShareLoading] = useState(false);

  // Dialog states for dark mode compliance
  const [errorDialog, setErrorDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });
  const [showConfirmSubmitDialog, setShowConfirmSubmitDialog] = useState(false);

  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 3,
    totalSteps: 4,
    stepBasePath: '/invoice-form/step',
    exitRoute: '/invoices',
  });

  const handleDiscountChange = (value: number) => {
    updateDiscountAmount(value);
  };

  const { role } = useRoleBasedAccess();
  const reasonRequired = discountNeedsReason(header, role);
  const handleDiscountReasonChange = (reason: string) => {
    updateHeaderField('discount_reason', reason);
  };

  const handleBack = async () => {
    await navigateToStep(2);
  };

  const handleCancel = () => {
    resetFormState();
    router.replace('/invoices');
  };

  const handleSubmit = async () => {
    // Final validation check
    if (items.length === 0) {
      setErrorDialog({
        visible: true,
        title: 'No items to invoice',
        message: 'Go back to the details step and select a GRN that has dispatched items.',
      });
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      setErrorDialog({
        visible: true,
        title: 'Select a GRN',
        message: 'Go back to the details step and select the GRN for this invoice.',
      });
      return;
    }

    if (reasonRequired) {
      setErrorDialog({
        visible: true,
        title: 'Enter a discount reason',
        message: 'Enter the reason for this discount before submitting the invoice.',
      });
      return;
    }

    // Show confirm submission dialog
    setShowConfirmSubmitDialog(true);
  };

  const performSubmit = async () => {
    const result = await submitForm();

    if (result.success) {
      // Prepare saved invoice data for dialog
      setSavedInvoiceData({
        invoice_id: result.invoiceId || '',
        invoice_no: result.invoiceNo || 0,
        fin_year: header.inv_fin_year,
        customer_name: header.customer_name,
        total: header.total,
      });

      // Show success dialog
      setShowSuccessDialog(true);
    }
    // Error handling is done by the hook
  };

  const handleCreateAnother = () => {
    setShowSuccessDialog(false);
    setSavedInvoiceData(null);
    resetFormState();
    router.push('/invoice-form/step1');
  };

  const handleViewList = () => {
    setShowSuccessDialog(false);
    setSavedInvoiceData(null);
    resetFormState();
    router.replace('/invoices');
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
      console.error('[InvoiceFormStep3] Share PDF error:', error);
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

  const handleStepPress = async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.REVIEW) return; // Already on this step
    if (stepNumber === STEP_NUMBERS.HEADER) {
      await navigateToStep(1);
    } else if (stepNumber === STEP_NUMBERS.ITEMS) {
      await handleBack();
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
          accessibilityLabel={isSaving ? 'Saving invoice' : 'Save invoice'}
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
              <Text style={styles.primaryButtonText}>Save invoice</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Success Dialog */}
      <InvoiceSuccessDialog
        isVisible={showSuccessDialog}
        invoiceData={savedInvoiceData}
        onCreateAnother={handleCreateAnother}
        onViewList={handleViewList}
        onPrint={handlePrint}
        onSharePDF={handleSharePDF}
        isShareLoading={isShareLoading}
      />

      {/* Print Dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => {
          setShowPrintDialog(false);
          resetFormState();
          router.replace('/invoices');
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
          resetFormState();
          router.replace('/invoices');
        }}
        title="Print invoice"
        defaultNumber={savedInvoiceData?.invoice_no?.toString() || ''}
        label="Invoice number"
        placeholder="For example, 123"
      />

      {/* Snackbar for print/share status */}
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

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText="Close"
        cancelText=""
        onConfirm={() => setErrorDialog({ visible: false, title: '', message: '' })}
        onCancel={() => setErrorDialog({ visible: false, title: '', message: '' })}
        variant="warning"
        icon="alert-circle"
      />

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmSubmitDialog}
        title={`Save invoice ${header.inv_no}?`}
        message={`${header.customer_name}\nTotal ${formatInvoiceAmount(header.total)}`}
        confirmText="Save invoice"
        cancelText="Cancel"
        onConfirm={() => {
          setShowConfirmSubmitDialog(false);
          performSubmit();
        }}
        onCancel={() => setShowConfirmSubmitDialog(false)}
        variant="default"
        icon="check-circle"
      />
    </View>
  );
}

