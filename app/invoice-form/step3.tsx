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
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { t as tr, formatIdentifier } from '@/i18n';
import { formatNumber, formatFinancialYear } from '@/utils/formatters';

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
        title: tr('invoice.form.noItemsTitle'),
        message: tr('invoice.review.noItemsMessage'),
      });
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      setErrorDialog({
        visible: true,
        title: tr('invoice.review.selectGrnTitle'),
        message: tr('invoice.review.selectGrnMessage'),
      });
      return;
    }

    if (reasonRequired) {
      setErrorDialog({
        visible: true,
        title: tr('invoice.review.discountReasonTitle'),
        message: tr('invoice.review.discountReasonCreateMessage'),
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
      console.error('[InvoiceFormStep3] Share PDF error:', error);
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
        steps={invoiceSteps()}
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
              <Text style={[styles.kvValue, styles.numeric]}>{formatFinancialYear(header.inv_fin_year)}</Text>
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
          accessibilityLabel={isSaving ? tr('invoice.review.savingA11y') : tr('invoice.review.saveInvoice')}
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
              <Text style={styles.primaryButtonText}>{tr('invoice.review.saveInvoice')}</Text>
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
            setSnackbarMessage(
              end && end !== start
                ? tr('invoice.print.sentRange', { start: String(start), end: String(end) })
                : tr('invoice.print.sentOne', { number: formatIdentifier(start) })
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

      {/* Snackbar for print/share status */}
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

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText={tr('common.close')}
        cancelText=""
        onConfirm={() => setErrorDialog({ visible: false, title: '', message: '' })}
        onCancel={() => setErrorDialog({ visible: false, title: '', message: '' })}
        variant="warning"
        icon="alert-circle"
      />

      {/* Confirm Submit Dialog */}
      <ConfirmDialog
        visible={showConfirmSubmitDialog}
        title={tr('invoice.review.saveTitle', { number: formatIdentifier(header.inv_no) })}
        message={tr('invoice.review.confirmMessage', { customer: header.customer_name, total: formatInvoiceAmount(header.total) })}
        confirmText={tr('invoice.review.saveInvoice')}
        cancelText={tr('common.cancel')}
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

