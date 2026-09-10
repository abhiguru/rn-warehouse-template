/**
 * Invoice Form Step 4 - Final Review & Submit
 * Alternative final review step with detailed summary view
 *
 * Refactored to use useInvoiceForm hook for form state management.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { triggerSuccess, triggerError } from '@/hooks/useHaptics';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceSuccessDialog } from '@/features/invoice/components/InvoiceSuccessDialog';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { SavedInvoiceData } from '@/types/invoice.types';

export default function InvoiceFormStep4() {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Use the consolidated invoice form hook
  const {
    header,
    items,
    isSaving,
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 4,
    totalSteps: 4,
    stepBasePath: '/invoice-form/step',
    exitRoute: '/invoices',
  });

  const handleBack = async () => {
    await navigateToStep(3);
  };

  const handleSubmit = async () => {
    // Final validation check
    if (items.length === 0) {
      Alert.alert('No Items', 'Cannot create invoice without items');
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      Alert.alert('Invalid Data', 'Missing GRN or customer information');
      return;
    }

    // Show custom confirm dialog (dark mode compliant)
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = () => {
    setShowConfirmDialog(false);
    performSubmit();
  };

  const performSubmit = async () => {
    if (__DEV__) console.log('[InvoiceFormStep4] Submitting invoice via hook');

    const result = await submitForm();

    if (result.success) {
      triggerSuccess();
      if (__DEV__) console.log('[InvoiceFormStep4] Invoice created successfully:', result);

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
    } else {
      triggerError();
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
      console.error('[InvoiceFormStep4] Share PDF error:', error);
      setSnackbarMessage('Failed to share PDF');
      setSnackbarVisible(true);
    } finally {
      setIsShareLoading(false);
    }
  };

  // Calculate subtotal
  const subtotal = header.total + header.discount - header.labour - header.tax_amount;

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
        <Text style={[styles.headerTitle, { color: colors.gray900 }]}>Review Invoice</Text>
        <Text style={[styles.stepIndicator, { color: colors.gray600 }]}>Step 4 of 4: Review & Submit</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Invoice Header Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.gray900 }]}>Invoice Details</Text>
          <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
            <View style={[styles.infoRow, { borderBottomColor: colors.cellDivider }]}>
              <Text style={[styles.infoLabel, { color: colors.gray600 }]}>Invoice Number:</Text>
              <Text style={[styles.infoValue, { color: colors.gray900 }]}>#{header.inv_no}</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: colors.cellDivider }]}>
              <Text style={[styles.infoLabel, { color: colors.gray600 }]}>Invoice Date:</Text>
              <Text style={[styles.infoValue, { color: colors.gray900 }]}>
                {new Date(header.inv_date).toLocaleDateString()}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: colors.cellDivider }]}>
              <Text style={[styles.infoLabel, { color: colors.gray600 }]}>Financial Year:</Text>
              <Text style={[styles.infoValue, { color: colors.gray900 }]}>{header.inv_fin_year}</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: colors.cellDivider }]}>
              <Text style={[styles.infoLabel, { color: colors.gray600 }]}>GR Number:</Text>
              <Text style={[styles.infoValue, { color: colors.gray900 }]}>{header.gr_no}</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: colors.cellDivider }]}>
              <Text style={[styles.infoLabel, { color: colors.gray600 }]}>Customer:</Text>
              <Text style={[styles.infoValue, { color: colors.gray900 }]}>{header.customer_name}</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: colors.cellDivider }]}>
              <Text style={[styles.infoLabel, { color: colors.gray600 }]}>One-Time Charge:</Text>
              <Text style={[styles.infoValue, { color: colors.gray900 }]}>
                {header.one_time_charge ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        </View>

        {/* Financial Summary Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.gray900 }]}>Financial Summary</Text>
          <View style={[styles.card, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Subtotal (Storage):</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>₹{subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Labour Charges:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>₹{header.labour.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Tax Amount:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>₹{header.tax_amount.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Discount:</Text>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>-₹{header.discount.toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: colors.cellDivider }]}>
              <Text style={[styles.totalLabel, { color: colors.gray900 }]}>Grand Total:</Text>
              <Text style={[styles.totalValue, { color: colors.success }]}>₹{header.total.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View style={[styles.footer, { backgroundColor: colors.cellBackground, borderTopColor: colors.cellDivider }]}>
        <TouchableOpacity
          style={[styles.button, styles.backButton, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}
          onPress={handleBack}
          disabled={isSaving}
        >
          <Text style={[styles.backButtonText, { color: colors.gray900 }]}>← Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.submitButton, { backgroundColor: colors.primary }, isSaving && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.cellBackground} />
          ) : (
            <Text style={[styles.submitButtonText, { color: colors.cellBackground }]}>Submit Invoice</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmDialog}
        title="Confirm Submission"
        message={`Create invoice #${header.inv_no} for ${header.customer_name}?\n\nTotal: ₹${header.total.toFixed(2)}`}
        confirmText="Create"
        cancelText="Cancel"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmDialog(false)}
        variant="default"
        icon="document-text"
      />

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  header: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
    ...theme.shadows.sm,
  },
  headerTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
    marginBottom: theme.spacing.xs,
  },
  stepIndicator: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
    fontWeight: theme.fontWeight.medium,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.gray[300],
    ...theme.shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  infoLabel: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[700],
  },
  infoValue: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
  },
  itemsList: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  itemCard: {
    backgroundColor: theme.colors.gray[50],
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  itemNumber: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    marginRight: theme.spacing.sm,
  },
  itemName: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetailText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
  },
  itemTotal: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.semantic.success,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  summaryLabel: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[700],
  },
  summaryValue: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
  },
  totalRow: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.gray[300],
  },
  totalLabel: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },
  totalValue: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.semantic.success,
  },
  // Fiori: Footer with buttons
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: 16,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.fiori.objectCell.divider,
    ...theme.shadows.sm,
  },
  // Fiori: Button base - 44pt height, 8pt corner radius
  button: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Fiori: Secondary Normal button - transparent bg, gray border
  backButton: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
  },
  // Fiori: Button text - 17pt, semibold (600)
  backButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.fiori.text.primary,
  },
  // Fiori: Primary button - primary color
  submitButton: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.md,
  },
  // Fiori: Button text - 17pt, semibold (600), white
  submitButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.white,
  },
  // Fiori: Disabled state - 30% opacity
  disabledButton: {
    opacity: 0.3,
  },
});
