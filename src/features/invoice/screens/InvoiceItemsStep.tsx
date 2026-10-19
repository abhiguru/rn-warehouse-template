/**
 * Invoice step 2, Items: the lines of the GRN grouped by item, with their
 * prices, as one card for each item and mark (InvoiceItemsEditor). The dispatch
 * lines of a card are closed behind a toggle at its bottom; Next (checkAll) opens a
 * closed card whose figure is wrong. One screen
 * for a new invoice and for an edit (`mode`); the logic is
 * useInvoiceForm({ mode, step: 2 }).
 *
 * The pricing pencil beside a group (open the item's price list) belongs to a
 * new invoice only (usePricingPencil).
 */

import React, { useCallback, useMemo, useState, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import WizardBottomBar from '@/components/WizardBottomBar';
import { router, type Href } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useAppStore } from '@/store/hooks';
import { useBlurOnKeyboardHide } from '@/hooks/useBlurOnKeyboardHide';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceItemsEditor, type InvoiceItemsEditorHandle } from '@/features/invoice/components/items/InvoiceItemsEditor';
import { makeItemsStyles } from '@/features/invoice/components/items/itemsStyles';
import { usePricingPencil } from '@/features/invoice/hooks/usePricingPencil';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import { STEP_NUMBERS, getCompletedSteps, makeInvoiceWizardStyles } from '@/constants/invoiceSteps';
import { t as tr } from '@/i18n';
import { getLanguage } from '@/i18n/language';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { canOpenScreen } from '@/config/roles';
import type { InvoiceStepProps } from './InvoiceDetailsStep';

export function InvoiceItemsStep({ mode }: InvoiceStepProps) {
  // Closing the keyboard lets go of the field it was for (its text is formatted and checked).
  useBlurOnKeyboardHide();
  const isEdit = mode === 'edit';
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const itemsStyles = useThemedStyles(makeItemsStyles);
  const t = useTokens();

  const {
    header,
    items,
    itemOverrides,
    invoiceId,
    updateItemPricing,
    applyGroupPricing,
    applySavedRatesToLines,
    navigateToStep,
    resetFormState,
  } = useInvoiceForm({ mode, step: STEP_NUMBERS.ITEMS });

  const editorRef = useRef<InvoiceItemsEditorHandle>(null);

  // Dialog states for dark mode compliance
  const [errorDialog, setErrorDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });
  const [helpVisible, setHelpVisible] = useState(false);

  const showError = useCallback((title: string, message: string) => {
    setErrorDialog({ visible: true, title, message });
  }, []);

  // Prices are changed by administrators and supervisors (the same gate as the price list; the
  // server refuses staff from migration 90).
  const { role } = useRoleBasedAccess();
  const canManagePrices = !isEdit && canOpenScreen(role, 'itemPricingWrite');

  const { editPricing, isLoadingPricing, discard } = usePricingPencil({ header, items, applySavedRatesToLines, showError });

  // The steps of this form, for the Android Back key: Back goes to the step before.
  const stepBasePath = isEdit ? `/invoice-edit/${invoiceId}/step` : '/invoice-form/step';
  useBackHandler({
    currentStep: STEP_NUMBERS.ITEMS,
    totalSteps: 3,
    stepBasePath,
    exitRoute: '/invoices',
  });

  // Stable between keystrokes, so the editor (and its memos) see the same props when only a figure changed.
  const handleItemUpdate = useCallback(
    (tempId: string, field: string, value: number) => updateItemPricing(tempId, { [field]: value }),
    [updateItemPricing]
  );
  const language = getLanguage();
  const listHeader = useMemo(
    () => (
      <>
        <Button
          type="tertiary"
          leftIcon="information-outline"
          onPress={() => setHelpVisible(true)}
        >
          {tr('invoice.items.howPricingWorks')}
        </Button>
        {isLoadingPricing && (
          <View style={itemsStyles.loadingRow} accessibilityRole="progressbar" accessibilityLabel={tr('invoice.items.openingPricingA11y')}>
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={itemsStyles.loadingText}>{tr('invoice.items.openingPricing')}</Text>
          </View>
        )}
      </>
    ),
    // `language` is not read inside: the texts are, and they follow it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoadingPricing, itemsStyles, t.brand.tint, language]
  );

  // The handlers below are stable: they read what they need at press time (the latest hook functions from this ref,
  // the lines from the store), so a figure typed on a line does not give the step indicator, the bottom bar or the
  // dialogs new props, and only what shows the changed figures draws again.
  const store = useAppStore();
  const latest = useRef({ navigateToStep, discard, resetFormState, isEdit, invoiceId, showError });
  latest.current = { navigateToStep, discard, resetFormState, isEdit, invoiceId, showError };

  const handleBack = useCallback(async () => {
    await latest.current.navigateToStep(STEP_NUMBERS.HEADER);
  }, []);

  const handleCancel = useCallback(() => {
    const { discard: discardPricing, isEdit: editing, invoiceId: id, resetFormState: reset } = latest.current;
    discardPricing();
    if (editing) {
      router.dismissTo(`/invoice-details/${id}` as Href);
      return;
    }
    reset();
    router.dismissTo('/(tabs)/invoices');
  }, []);

  const handleNext = useCallback(async () => {
    // A figure still holds text that was not accepted: show it, focus the first, and stay.
    if ((editorRef.current?.checkAll() ?? 0) > 0) return;

    // A charge of 0 is allowed; its reason is asked for on the review step.
    // A line without a duration is not: it would be charged for no time at all.
    const invalidItems = store.getState().invoiceForm.items.filter((item) => item.duration === 0);

    if (invalidItems.length > 0) {
      latest.current.showError(
        tr('invoice.items.checkPricesTitle'),
        tr('invoice.items.zeroDuration', { count: invalidItems.length })
      );
      return;
    }

    // Everything else the items check refuses (a duration under half a month,
    // days below 0, a rate out of range) is reported in its own words.
    await latest.current.navigateToStep(STEP_NUMBERS.REVIEW);
  }, [store]);

  const handleStepPress = useCallback(async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.ITEMS) return; // Already on this step
    if (stepNumber === STEP_NUMBERS.HEADER) {
      await handleBack();
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      await handleNext();
    }
  }, [handleBack, handleNext]);

  const invoiceNo = header.inv_no > 0 ? header.inv_no : undefined;
  // Elements kept between keystrokes (same element, no draw). The texts follow `language`.
  const stepIndicator = useMemo(
    () => (
      <InvoiceStepIndicator
        steps={invoiceSteps()}
        currentStep={STEP_NUMBERS.ITEMS}
        completedSteps={getCompletedSteps(STEP_NUMBERS.ITEMS)}
        onCancel={handleCancel}
        onStepPress={handleStepPress}
        invoiceNo={invoiceNo}
        isEditMode={isEdit}
      />
    ),
    // `language` is not read inside: the texts are, and they follow it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleCancel, handleStepPress, invoiceNo, isEdit, language]
  );
  const bottomBar = useMemo(
    () => (
      <WizardBottomBar
        currentStep={STEP_NUMBERS.ITEMS}
        totalSteps={3}
        onPrevious={handleBack}
        previousAccessibilityLabel={tr('invoice.items.backToDetails')}
        onNext={handleNext}
        nextLabel={tr('invoice.items.nextReview')}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleBack, handleNext, language]
  );
  const closeHelp = useCallback(() => setHelpVisible(false), []);
  const closeError = useCallback(() => setErrorDialog({ visible: false, title: '', message: '' }), []);
  const dialogs = useMemo(
    () => (
      <>
        {/* How pricing works */}
        <ConfirmDialog
          visible={helpVisible}
          title={tr('invoice.items.howPricingWorks')}
          message={tr('invoice.items.helpMessage')}
          confirmText={tr('common.close')}
          cancelText=""
          onConfirm={closeHelp}
          onCancel={closeHelp}
          icon="information"
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
        />
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [helpVisible, errorDialog, closeHelp, closeError, language]
  );

  return (
    <View style={styles.container}>
      {stepIndicator}

      {/* The editor is the page's scroll container: the content above the cards goes in its header */}
      <InvoiceItemsEditor
        ref={editorRef}
        items={items}
        oneTime={!!header.one_time_charge}
        itemOverrides={itemOverrides}
        onItemUpdate={handleItemUpdate}
        onBulkEdit={applyGroupPricing}
        onRestoreRates={applySavedRatesToLines}
        onEditPricing={canManagePrices ? editPricing : undefined}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={listHeader}
      />

      {bottomBar}

      {dialogs}
    </View>
  );
}

export default InvoiceItemsStep;
