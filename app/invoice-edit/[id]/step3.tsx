import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  updateDiscount,
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
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import { INVOICE_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/invoiceSteps';

export default function InvoiceEditStep3() {
  const dispatch = useAppDispatch();
  const colors = useListColors(); // Dark mode support
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

  const handleBack = () => {
    router.back();
  };

  const handleCancel = () => {
    Alert.alert('Cancel Invoice Edit', 'Are you sure you want to cancel? All unsaved changes will be lost.', [
      { text: 'Continue Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          dispatch(resetForm());
          router.dismiss(3);
          router.push('/invoices');
        },
      },
    ]);
  };

  const handleSubmit = async () => {
    // Final validation check
    if (items.length === 0) {
      Alert.alert('No Items', 'Cannot update invoice without items');
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      Alert.alert('Invalid Data', 'Missing GRN or customer information');
      return;
    }

    if (!invoiceId) {
      Alert.alert('Error', 'Invoice ID not found');
      return;
    }

    // Confirm submission
    Alert.alert(
      'Confirm Update',
      `Update invoice #${header.inv_no} for ${header.customer_name}?\n\nTotal: ₹${header.total.toFixed(2)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Update', style: 'default', onPress: submitInvoiceUpdate },
      ]
    );
  };

  const submitInvoiceUpdate = async () => {
    if (!invoiceId) {
      Alert.alert('Error', 'Invoice ID not found');
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
        Alert.alert('Error', response.message || 'Failed to update invoice');
      }
    } catch (error: any) {
      console.error('[InvoiceEditStep3] Error updating invoice:', error);
      Alert.alert('Error', error.message || 'An error occurred while updating the invoice');
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
        setSnackbarMessage(pdfResult.error || 'Failed to generate PDF');
        setSnackbarVisible(true);
        return;
      }

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Invoice_${savedInvoiceData.invoice_no}_FY${header.inv_fin_year}.pdf`
      );
      if (!shareResult.success) {
        setSnackbarMessage(shareResult.error || 'Failed to share PDF');
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('[InvoiceEditStep3] Share PDF error:', error);
      setSnackbarMessage('Failed to share PDF');
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
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
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
        {/* Items Summary Card */}
        <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
          <View style={[styles.cardHeader, { borderBottomColor: colors.cellDivider }]}>
            <Text style={[styles.cardTitle, { color: colors.gray900 }]}>Items Summary</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Total GRN Qty:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>{totalGRQty}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Total Dispatch Qty:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>{totalDispatchQty}</Text>
            </View>
          </View>
        </View>

        {/* Invoice Details Card */}
        <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
          <View style={[styles.cardHeader, { borderBottomColor: colors.cellDivider }]}>
            <Text style={[styles.cardTitle, { color: colors.gray900 }]}>Invoice Details</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.summaryRowColumn}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Customer:</Text>
              <Text style={[styles.summaryValueMultiline, { color: colors.gray900 }]}>{header.customer_name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Invoice Number:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>#{header.inv_no}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Invoice Date:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>
                {new Date(header.inv_date).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Financial Year:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>{header.inv_fin_year}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>GR Number:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>{header.gr_no}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>One-Time Charge:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>
                {header.one_time_charge ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        </View>

        {/* Calculation Summary with Discount */}
        <InvoiceCalculationSummary
          header={header}
          onDiscountChange={handleDiscountChange}
        />

        {/* Update Invoice Button - Inline at bottom of content */}
        <View style={styles.bottomButtonContainer}>
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary }, isSaving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={[styles.submitButtonText, { color: colors.white }]}>Update Invoice ✓</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>

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
            setSnackbarMessage(`Print job submitted for invoice ${start}${end && end !== start ? ` to ${end}` : ''}`);
          } else {
            setSnackbarMessage(result.message || 'Failed to submit print job');
          }
          setSnackbarVisible(true);
          dispatch(resetForm());
          router.dismiss(3);
          router.push('/invoices');
        }}
        title="Print Invoice"
        defaultNumber={savedInvoiceData?.invoice_no?.toString() || ''}
        label="Invoice Number"
        placeholder="e.g., 123"
      />

      {/* Snackbar for print status */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

// SAP Fiori Styles - colors applied inline for dark mode support
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  card: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    ...theme.shadows.sm,
  },
  cardHeader: {
    padding: theme.spacing.md,
    borderBottomWidth: 1,
  },
  cardTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  summaryLabel: {
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
  summaryValue: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 22,
  },
  summaryRowColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
  },
  summaryValueMultiline: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    marginTop: theme.spacing.xs,
    flexWrap: 'wrap',
    lineHeight: 22,
  },
  bottomButtonContainer: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  submitButton: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    ...theme.shadows.md,
  },
  submitButtonDisabled: {
    opacity: 0.3,
  },
  submitButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
});
