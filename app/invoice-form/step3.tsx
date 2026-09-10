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
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Snackbar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceCalculationSummary } from '@/features/invoice/components/InvoiceCalculationSummary';
import { InvoiceSuccessDialog } from '@/features/invoice/components/InvoiceSuccessDialog';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { SavedInvoiceData } from '@/types/invoice.types';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import { INVOICE_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/invoiceSteps';

export default function InvoiceFormStep3() {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Use the consolidated invoice form hook
  const {
    header,
    items,
    isSaving,
    updateDiscountAmount,
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
        title: 'No Items',
        message: 'Cannot create invoice without items',
      });
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      setErrorDialog({
        visible: true,
        title: 'Invalid Data',
        message: 'Missing GRN or customer information',
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
      console.error('[InvoiceFormStep3] Share PDF error:', error);
      setSnackbarMessage('Failed to share PDF');
      setSnackbarVisible(true);
    } finally {
      setIsShareLoading(false);
    }
  };

  // Calculate breakdown values
  const subtotal = header.total + header.discount - header.labour - header.tax_amount;

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
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
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

        {/* Submit Invoice Button - Inline at bottom of content */}
        <View style={styles.bottomButtonContainer}>
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary }, isSaving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.cellBackground} />
            ) : (
              <>
                <Icon name="check" size={20} color={colors.cellBackground} style={{ marginRight: 8 }} />
                <Text style={[styles.submitButtonText, { color: colors.cellBackground }]}>Submit Invoice</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>

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
            setSnackbarMessage(`Print job submitted for invoice ${start}${end && end !== start ? ` to ${end}` : ''}`);
          } else {
            setSnackbarMessage(result.message || 'Failed to submit print job');
          }
          setSnackbarVisible(true);
          resetFormState();
          router.replace('/invoices');
        }}
        title="Print Invoice"
        defaultNumber={savedInvoiceData?.invoice_no?.toString() || ''}
        label="Invoice Number"
        placeholder="e.g., 123"
      />

      {/* Snackbar for print/share status */}
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

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setErrorDialog({ visible: false, title: '', message: '' })}
        onCancel={() => setErrorDialog({ visible: false, title: '', message: '' })}
        variant="warning"
        icon="alert-circle"
      />

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmSubmitDialog}
        title="Confirm Submission"
        message={`Create invoice #${header.inv_no} for ${header.customer_name}?\n\nTotal: ₹${header.total.toFixed(2)}`}
        confirmText="Create"
        cancelText="Cancel"
        onConfirm={() => {
          setShowConfirmSubmitDialog(false);
          performSubmit();
        }}
        onCancel={() => setShowConfirmSubmitDialog(false)}
        variant="default"
        icon="checkmark-circle"
      />
    </View>
  );
}

// SAP Fiori Styles
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
  // Fiori: Card component
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
  // Fiori: Secondary text color for labels
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
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  breakdownLabel: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[700],
  },
  breakdownValue: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.gray[300],
    marginVertical: theme.spacing.sm,
  },
  subtotalLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },
  subtotalValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.blue[50],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.blue[500],
  },
  infoIcon: {
    fontSize: 24,
    marginRight: theme.spacing.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.blue[700],
    marginBottom: theme.spacing.xs,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[700],
    lineHeight: 20,
  },
  bottomButtonContainer: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  // Fiori: Primary button - 44pt height, primary color, 8pt corner radius
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 44,
    ...theme.shadows.md,
  },
  // Fiori: Disabled state - 30% opacity
  submitButtonDisabled: {
    opacity: 0.3,
  },
  // Fiori: Button text - 17pt, semibold (600)
  submitButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.white,
  },
});
