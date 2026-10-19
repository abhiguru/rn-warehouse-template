/**
 * Invoice step 3, Review: the invoice's details, its quantities, the amounts
 * with the discount, and the save. One screen for a new invoice and for an
 * edit (`mode`); the logic is useInvoiceForm({ mode, step: 3 }).
 *
 * After the save the invoice dialog offers View, Share PDF, Print and (new
 * invoices) Create another. Print succeeds with a toast on the screen that is
 * left; a failure is an alert. A failure of the sharing is drawn inside the
 * dialog, because a message under it would be hidden by it.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, type Href } from 'expo-router';
import { useThemedStyles } from '@/hooks/useTheme';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import {
  discountNeedsReason,
  formatInvoiceAmount,
  invoiceConfirmMessage,
  zeroChargeNeedsReason,
} from '@/utils/invoiceCalculations';
import { useBlurOnKeyboardHide } from '@/hooks/useBlurOnKeyboardHide';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAfterClosed } from '@/hooks/useAfterClosed';
import WizardBottomBar from '@/components/WizardBottomBar';
import { ReviewCard, ReviewKeyValue, ReviewKeyValues, ReviewSection, useReviewSections } from '@/components/review/ReviewSections';
import { InvoiceReviewItemsTable } from '@/features/invoice/components/review/InvoiceReviewItemsTable';
import { InvoiceCalculationSummary } from '@/features/invoice/components/InvoiceCalculationSummary';
import { InvoiceSuccessDialog } from '@/features/invoice/components/InvoiceSuccessDialog';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import type { SavedInvoiceData } from '@/types/invoice.types';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  formatInvoiceDate,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { t as tr, formatIdentifier } from '@/i18n';
import { formatCount, formatFinancialYear } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import { invoiceGroupKey } from '@/features/invoice/utils/groupInvoiceItems';
import type { InvoiceStepProps } from './InvoiceDetailsStep';

const log = createLogger('InvoiceReviewStep');

/** The folding sections of the step, top to bottom. */
type ReviewSectionId = 'details' | 'items' | 'charges';

/** Shown for a value that is not set. */
const EMPTY = '—';

// The invoice's own financial year ("2025-26" -> 2025): numbers restart every April.
const printFinYear = (finYear: string): number | undefined => {
  const year = parseInt(finYear.split('-')[0], 10);
  return Number.isFinite(year) ? year : undefined;
};

export function InvoiceReviewStep({ mode }: InvoiceStepProps) {
  // Closing the keyboard lets go of the field it was for (its text is formatted and checked).
  useBlurOnKeyboardHide();
  const isEdit = mode === 'edit';
  const styles = useThemedStyles(makeInvoiceWizardStyles);

  const {
    header,
    items,
    invoiceId,
    isSaving,
    updateDiscountAmount,
    updateHeaderField,
    navigateToStep,
    submitForm,
    resetFormState,
  } = useInvoiceForm({ mode, step: STEP_NUMBERS.REVIEW });

  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<SavedInvoiceData | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // The print question calls onDismiss after onConfirm has answered it; that call is not a Cancel.
  const printAnswered = useRef(false);

  // Dialog states for dark mode compliance
  const [errorDialog, setErrorDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });
  const [showConfirmSubmitDialog, setShowConfirmSubmitDialog] = useState(false);
  // Every hop from one dialog to the next waits for the first to finish closing (iOS cannot present a Modal over
  // one that is still closing: nothing would appear, and Print, Share and Create another would be out of reach).
  const confirmClosed = useAfterClosed(showConfirmSubmitDialog);
  const successClosed = useAfterClosed(showSuccessDialog);
  const printClosed = useAfterClosed(showPrintDialog);
  const errorClosed = useAfterClosed(errorDialog.visible);
  // A refused save moves focus to the first field that needs fixing, once its message has been closed.
  const [focusRequest, setFocusRequest] = useState(0);
  const focusAfterError = useRef(false);

  // The steps of this form, for the Android Back key: Back goes to the step before.
  useBackHandler({
    currentStep: STEP_NUMBERS.REVIEW,
    totalSteps: 3,
    stepBasePath: isEdit ? `/invoice-edit/${invoiceId}/step` : '/invoice-form/step',
    exitRoute: '/invoices',
  });

  const [discountError, setDiscountError] = useState<string | null>(null);
  // Set by a refused save: the reasons that are still needed are drawn red (they are only asked for before that).
  const [showErrors, setShowErrors] = useState(false);
  // CHARGES is open when the step opens, and opened again by a refused save.
  const { open: openSection, toggle, show } = useReviewSections<ReviewSectionId>('charges');
  const refuseSave = () => {
    setShowErrors(true);
    show('charges');
    focusAfterError.current = true;
  };

  const { role } = useRoleBasedAccess();
  const reasonRequired = discountNeedsReason(header, role);
  // Stable, so that the memoized charges card is not drawn again when only something else changed.
  const handleDiscountReasonChange = useCallback((reason: string) => {
    updateHeaderField('discount_reason', reason);
  }, [updateHeaderField]);
  // A line with a charge of 0 needs a reason from staff (server migration 48).
  const zeroChargeReasonRequired = zeroChargeNeedsReason(header, items, role);
  const handleZeroChargeReasonChange = useCallback((reason: string) => {
    updateHeaderField('zero_charge_reason', reason);
  }, [updateHeaderField]);

  const showError = (title: string, message: string) => {
    setErrorDialog({ visible: true, title, message });
  };
  const closeError = () => {
    if (focusAfterError.current) {
      focusAfterError.current = false;
      errorClosed.later(() => setFocusRequest((n) => n + 1));
    }
    setErrorDialog({ visible: false, title: '', message: '' });
  };

  // Where the form goes when it is left: the invoice's page after an edit, the Invoices tab for a new one.
  const leaveForm = (savedId?: string) => {
    if (isEdit) {
      router.dismissTo(`/invoice-details/${savedId || invoiceId}` as Href);
      return;
    }
    resetFormState();
    router.dismissTo('/(tabs)/invoices');
  };

  const handleCancel = () => {
    leaveForm();
  };

  const handleBack = async () => {
    await navigateToStep(STEP_NUMBERS.ITEMS);
  };

  const handleSubmit = () => {
    // Final validation check
    if (items.length === 0) {
      showError(tr('invoice.form.noItemsTitle'), tr('invoice.review.noItemsMessage'));
      return;
    }

    if (!header.gr_id || !header.customer_id) {
      showError(tr('invoice.review.selectGrnTitle'), tr('invoice.review.selectGrnMessage'));
      return;
    }

    if (isEdit && !invoiceId) {
      showError(tr('invoice.review.notFoundTitle'), tr('invoice.review.notFoundMessage'));
      return;
    }

    // The discount field shows text that was not accepted, so the invoice
    // still holds the previous discount: saving now would not save what is shown.
    if (discountError) {
      refuseSave();
      showError(
        tr('invoice.review.discountCheckTitle'),
        `${discountError}\n${tr('invoice.review.discountNotApplied', { amount: formatInvoiceAmount(header.discount) })}`
      );
      return;
    }

    if (reasonRequired) {
      refuseSave();
      showError(
        tr('invoice.review.discountReasonTitle'),
        tr(isEdit ? 'invoice.review.discountReasonUpdateMessage' : 'invoice.review.discountReasonCreateMessage')
      );
      return;
    }

    if (zeroChargeReasonRequired) {
      refuseSave();
      showError(
        tr('invoice.review.zeroChargeReasonTitle'),
        tr(isEdit ? 'invoice.review.zeroChargeReasonUpdateMessage' : 'invoice.review.zeroChargeReasonCreateMessage')
      );
      return;
    }

    // Show confirm submission dialog
    setShowConfirmSubmitDialog(true);
  };

  // The question stays open, busy, until the save is over, so that a second tap on its button does nothing.
  const performSubmit = async () => {
    // A refusal is told once the question has closed, never over it.
    const result = await submitForm((title, message) => {
      confirmClosed.later(() => showAlert(title, message));
    });
    if (result === 'busy') return;

    if (result.success) {
      // Prepare saved invoice data for dialog
      const saved: SavedInvoiceData = {
        invoice_id: result.invoiceId || invoiceId || '',
        invoice_no: result.invoiceNo || 0,
        fin_year: header.inv_fin_year,
        customer_name: header.customer_name,
        // The server's stored total; the form's figure was only an estimate.
        total: result.total ?? null,
        estimated_total: header.total,
      };
      confirmClosed.later(() => {
        setSavedInvoiceData(saved);
        setShareError(null);
        setShowSuccessDialog(true);
      });
    }
    setShowConfirmSubmitDialog(false);
  };

  const handleCreateAnother = () => {
    setShowSuccessDialog(false);
    setSavedInvoiceData(null);
    resetFormState();
    // Step 1 of the stack is still open under this step: it asks for a fresh number itself.
    router.dismissTo('/invoice-form/step1');
  };

  const handleViewList = () => {
    const savedId = savedInvoiceData?.invoice_id;
    setShowSuccessDialog(false);
    setSavedInvoiceData(null);
    leaveForm(savedId);
  };

  const handlePrint = () => {
    printAnswered.current = false;
    successClosed.later(() => setShowPrintDialog(true));
    setShowSuccessDialog(false);
  };

  const handleSharePDF = async () => {
    if (!savedInvoiceData) return;

    setIsShareLoading(true);
    setShareError(null);
    try {
      // Extract year from fin_year string (e.g., '2025-26' -> 2025)
      const finYearNum = parseInt(header.inv_fin_year.split('-')[0], 10);

      // Generate PDF
      const pdfResult = await generateInvoicePDF(
        savedInvoiceData.invoice_no,
        finYearNum
      );
      if (!pdfResult.success || !pdfResult.pdfUrl) {
        setShareError(tr('invoice.review.pdfCreateFailed'));
        return;
      }

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Invoice_${savedInvoiceData.invoice_no}_FY${header.inv_fin_year}.pdf`
      );
      if (!shareResult.success) {
        setShareError(tr('invoice.review.pdfShareFailed'));
      }
    } catch (error) {
      log.error('Share PDF error:', error);
      setShareError(tr('invoice.review.pdfShareFailed'));
    } finally {
      setIsShareLoading(false);
    }
  };

  // Cancelling Print returns to the dialog it was opened from.
  const handlePrintDismiss = () => {
    if (printAnswered.current) {
      printAnswered.current = false;
      return;
    }
    printClosed.later(() => setShowSuccessDialog(true));
    setShowPrintDialog(false);
  };

  const handlePrintConfirm = async (start: string, end: string) => {
    const result = await printInvoiceRange(start, end, printFinYear(header.inv_fin_year));
    printAnswered.current = true;
    if (result.success) {
      setShowPrintDialog(false);
      // The toast shows on the screen the form returns to.
      const message = end && end !== start
        ? tr('invoice.print.sentRange', { start: String(start), end: String(end) })
        : tr('invoice.print.sentOne', { number: formatIdentifier(start) });
      const savedId = savedInvoiceData?.invoice_id;
      setSavedInvoiceData(null);
      leaveForm(savedId);
      showToast(message);
    } else {
      // A failed or unconfirmed print needs a decision: the invoice dialog is back, with the reason drawn in it
      // (an alert over it would be a second Modal opening at the same time).
      printClosed.later(() => {
        setShareError(tr(result.unconfirmed ? 'invoice.print.unconfirmed' : 'invoice.print.failed'));
        setShowSuccessDialog(true);
      });
      setShowPrintDialog(false);
    }
  };

  // Both walk every line: once per set of lines, not on each draw of the step.
  const totalQty = useMemo(() => items.reduce((sum, item) => sum + item.qty, 0), [items]);
  const groupCount = useMemo(() => new Set(items.map(invoiceGroupKey)).size, [items]);

  // The text of the save question is worked out only while it is open, and keeps its last text while it closes.
  const confirmMessage = useRef('');
  if (showConfirmSubmitDialog) confirmMessage.current = invoiceConfirmMessage(header, items);

  // The step circles and the Edit links go to the steps already in the stack.
  const handleStepPress = async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.REVIEW) return; // Already on this step
    await navigateToStep(stepNumber);
  };

  const confirmTitle = isEdit
    ? tr('invoice.review.updateTitle', { number: formatIdentifier(header.inv_no) })
    : tr('invoice.review.saveTitle', { number: formatIdentifier(header.inv_no) });
  const toggleSection = (section: string) => toggle(section as ReviewSectionId);
  const saveLabel = isEdit ? tr('invoice.review.updateInvoice') : tr('invoice.review.saveInvoice');

  return (
    <View style={styles.container}>
      <InvoiceStepIndicator
        steps={invoiceSteps()}
        currentStep={STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
        onStepPress={handleStepPress}
        invoiceNo={header.inv_no > 0 ? header.inv_no : undefined}
        isEditMode={isEdit}
      />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={100}
      >
        <ReviewCard testID="invoice-review">
          {/* Invoice details */}
          <ReviewSection
            id="details"
            testIDPrefix="invoice-review"
            title={tr('invoice.review.invoiceDetails')}
            onEdit={() => handleStepPress(STEP_NUMBERS.HEADER)}
            editLabel={tr('invoice.review.editDetailsA11y')}
            closedLine={[
              header.inv_no > 0 ? tr('invoice.review.closedInvoice', { number: formatIdentifier(header.inv_no) }) : null,
              formatInvoiceDate(header.inv_date) || null,
              header.customer_name || null,
            ].filter(Boolean).join(' · ')}
            open={openSection === 'details'}
            onToggle={toggleSection}
            first
          >
            <ReviewKeyValues>
              <ReviewKeyValue label={tr('common.invoiceNumber')} value={header.inv_no > 0 ? formatIdentifier(header.inv_no) : EMPTY} emphasized first />
              <ReviewKeyValue label={tr('invoice.form.invoiceDate')} value={formatInvoiceDate(header.inv_date) || EMPTY} />
              <ReviewKeyValue label={tr('invoice.label.financialYear')} value={header.inv_fin_year ? formatFinancialYear(header.inv_fin_year) : EMPTY} />
              <ReviewKeyValue label={tr('common.grn')} value={header.gr_no ? formatIdentifier(header.gr_no) : EMPTY} />
              <ReviewKeyValue label={tr('common.customer')} value={header.customer_name || EMPTY} />
              <ReviewKeyValue label={tr('invoice.label.oneTimeCharge')} value={header.one_time_charge ? tr('common.yes') : tr('common.no')} />
            </ReviewKeyValues>
          </ReviewSection>

          {/* Items: one row per group */}
          <ReviewSection
            id="items"
            testIDPrefix="invoice-review"
            title={tr('common.items')}
            count={groupCount}
            onEdit={() => handleStepPress(STEP_NUMBERS.ITEMS)}
            editLabel={tr('invoice.review.editItemsA11y')}
            closedLine={formatCount(totalQty, 'bag')}
            open={openSection === 'items'}
            onToggle={toggleSection}
            deferBody
          >
            <InvoiceReviewItemsTable items={items} />
          </ReviewSection>

          {/* Charges: storage, labour, tax, discount, rounding and the one total */}
          <ReviewSection
            id="charges"
            testIDPrefix="invoice-review"
            title={tr('invoice.review.charges')}
            tag={reasonRequired || zeroChargeReasonRequired ? tr('invoice.review.reasonNeeded') : undefined}
            closedLine={reasonRequired || zeroChargeReasonRequired ? null : tr('invoice.review.closedCharges', { amount: formatInvoiceAmount(header.total) })}
            open={openSection === 'charges'}
            onToggle={toggleSection}
          >
            <InvoiceCalculationSummary
              header={header}
              items={items}
              onDiscountChange={updateDiscountAmount}
              onDiscountErrorChange={setDiscountError}
              onDiscountReasonChange={handleDiscountReasonChange}
              reasonRequired={reasonRequired}
              onZeroChargeReasonChange={handleZeroChargeReasonChange}
              zeroChargeReasonRequired={zeroChargeReasonRequired}
              showErrors={showErrors}
              focusRequest={focusRequest}
            />
          </ReviewSection>
        </ReviewCard>
      </KeyboardAwareScrollView>

      {/* Bottom action bar */}
      <WizardBottomBar
        currentStep={STEP_NUMBERS.REVIEW}
        totalSteps={3}
        onPrevious={handleBack}
        previousAccessibilityLabel={tr('invoice.review.backToItems')}
        onNext={handleSubmit}
        nextLabel={saveLabel}
        isLoading={isSaving}
        loadingLabel={tr('common.saving')}
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
        shareError={shareError}
        isEditMode={isEdit}
        onDismissed={successClosed.onDismissed}
      />

      {/* Print Dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={handlePrintDismiss}
        onDismissed={printClosed.onDismissed}
        onConfirm={handlePrintConfirm}
        title={tr('invoice.print.title')}
        defaultNumber={savedInvoiceData?.invoice_no?.toString() || ''}
        entity="invoice"
        placeholder={tr('invoice.print.example', { example: '123' })}
      />

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText={tr('common.close')}
        cancelText=""
        onConfirm={closeError}
        onCancel={closeError}
        variant="warning"
        icon="alert-circle"
        onDismissed={errorClosed.onDismissed}
      />

      {/* Confirm Submit Dialog: busy while the save runs */}
      <ConfirmDialog
        visible={showConfirmSubmitDialog}
        title={confirmTitle}
        message={confirmMessage.current}
        confirmText={saveLabel}
        cancelText={tr('common.cancel')}
        onConfirm={performSubmit}
        onCancel={() => setShowConfirmSubmitDialog(false)}
        variant="default"
        icon="check-circle"
        busy={isSaving}
        onDismissed={confirmClosed.onDismissed}
      />
    </View>
  );
}

export default InvoiceReviewStep;
