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
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { formatInvoiceDate, makeInvoiceWizardStyles } from '@/constants/invoiceSteps';
import { triggerSuccess, triggerError } from '@/hooks/useHaptics';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceSuccessDialog } from '@/features/invoice/components/InvoiceSuccessDialog';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import {
  calculateInvoiceBreakdown,
  formatInvoiceAmount,
  formatInvoiceDeduction,
} from '@/utils/invoiceCalculations';
import { SavedInvoiceData } from '@/types/invoice.types';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
const makeHeaderStyles = (t: ThemeTokens) => ({
  header: {
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.md,
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  stepText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
});

export default function InvoiceFormStep4() {
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const headerStyles = useThemedStyles(makeHeaderStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

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
      showAlert(tr('invoice.form.noItemsTitle'), tr('invoice.review.noItemsShortMessage'));
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      showAlert(tr('invoice.review.selectGrnTitle'), tr('invoice.review.selectGrnShortMessage'));
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
      console.error('[InvoiceFormStep4] Share PDF error:', error);
      setSnackbarMessage(tr('invoice.review.pdfShareFailed'));
      setSnackbarVisible(true);
    } finally {
      setIsShareLoading(false);
    }
  };

  // Calculate subtotal
  const { subtotal, rounding } = calculateInvoiceBreakdown(items, header);

  return (
    <View style={styles.container}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      {/* Header */}
      <View style={[headerStyles.header, { paddingTop: insets.top + space.md }]}>
        <Text style={headerStyles.headerTitle} accessibilityRole="header">{tr('invoice.review.title')}</Text>
        <Text style={headerStyles.stepText}>{tr('invoice.review.stepOf', { step: 4, total: 4 })}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Invoice details */}
        <View>
          <Text style={styles.sectionHeader} accessibilityRole="header">{tr('invoice.review.invoiceDetails')}</Text>
          <View style={styles.card}>
            <View style={styles.kvRow}>
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
            <View style={[styles.kvRowStacked, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('common.customer')}</Text>
              <Text style={styles.kvValueStacked}>{header.customer_name}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.label.oneTimeCharge')}</Text>
              <Text style={styles.kvValue}>{header.one_time_charge ? tr('common.yes') : tr('common.no')}</Text>
            </View>
          </View>
        </View>

        {/* Amounts */}
        <View>
          <Text style={styles.sectionHeader} accessibilityRole="header">{tr('invoice.review.amounts')}</Text>
          <View style={styles.card}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>{tr('invoice.label.storage')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{formatInvoiceAmount(subtotal)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.label.labour')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{formatInvoiceAmount(header.labour)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.label.tax')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{formatInvoiceAmount(header.tax_amount)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.label.discount')}</Text>
              <Text style={[styles.kvValue, styles.numeric, header.discount > 0 && styles.kvDeduction]}>
                {formatInvoiceDeduction(header.discount)}
              </Text>
            </View>
            <View style={[styles.kvRow, styles.kvDivider]}>
              <Text style={styles.kvKey}>{tr('invoice.label.rounding')}</Text>
              <Text style={[styles.kvValue, styles.numeric]}>{formatInvoiceAmount(rounding)}</Text>
            </View>
            <View style={[styles.kvRow, styles.kvTotalRow]}>
              <Text style={styles.kvTotalKey}>{tr('common.total')}</Text>
              <Text style={styles.kvTotalValue}>{formatInvoiceAmount(header.total)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={handleBack}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={tr('common.back')}
          accessibilityState={{ disabled: isSaving }}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.secondaryButtonText}>{tr('common.back')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={isSaving ? undefined : handleSubmit}
          accessibilityRole="button"
          accessibilityLabel={isSaving ? tr('invoice.review.savingA11y') : tr('invoice.review.saveInvoice')}
          accessibilityState={{ busy: isSaving }}
        >
          {isSaving ? (
            <>
              <ActivityIndicator size="small" color={t.brand.onFill} />
              <Text style={styles.primaryButtonText}>{tr('common.saving')}</Text>
            </>
          ) : (
            <Text style={styles.primaryButtonText}>{tr('invoice.review.saveInvoice')}</Text>
          )}
        </Pressable>
      </View>

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmDialog}
        title={tr('invoice.review.saveTitle', { number: String(header.inv_no) })}
        message={tr('invoice.review.confirmMessage', { customer: header.customer_name, total: formatInvoiceAmount(header.total) })}
        confirmText={tr('invoice.review.saveInvoice')}
        cancelText={tr('common.cancel')}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmDialog(false)}
        variant="default"
        icon="file-document-outline"
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
            setSnackbarMessage(
              end && end !== start
                ? tr('invoice.print.sentRange', { start: String(start), end: String(end) })
                : tr('invoice.print.sentOne', { number: String(start) })
            );
          } else {
            setSnackbarMessage(tr('invoice.print.failed'));
          }
          setSnackbarVisible(true);
          resetFormState();
          router.replace('/invoices');
        }}
        title={tr('invoice.print.title')}
        defaultNumber={savedInvoiceData?.invoice_no?.toString() || ''}
        entity="invoice"
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

