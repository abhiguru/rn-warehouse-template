/**
 * Invoice step 2, Items: the lines of the GRN grouped by item, with their
 * prices, as one card for each item and mark (InvoiceItemsEditor). One screen
 * for a new invoice and for an edit (`mode`); the logic is
 * useInvoiceForm({ mode, step: 2 }).
 *
 * The pricing pencil beside a group (open the item's price list) belongs to a
 * new invoice only (usePricingPencil).
 */

import React, { useState, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import WizardBottomBar from '@/components/WizardBottomBar';
import { router, type Href } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBlurOnKeyboardHide } from '@/hooks/useBlurOnKeyboardHide';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceItemsEditor, type InvoiceItemsEditorHandle } from '@/features/invoice/components/items/InvoiceItemsEditor';
import { makeItemsStyles } from '@/features/invoice/components/items/itemsStyles';
import { usePricingPencil } from '@/features/invoice/hooks/usePricingPencil';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import { STEP_NUMBERS, getCompletedSteps, makeInvoiceWizardStyles } from '@/constants/invoiceSteps';
import { t as tr } from '@/i18n';
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

  const showError = (title: string, message: string) => {
    setErrorDialog({ visible: true, title, message });
  };

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

  const handleBack = async () => {
    await navigateToStep(STEP_NUMBERS.HEADER);
  };

  const handleCancel = () => {
    discard();
    if (isEdit) {
      router.dismissTo(`/invoice-details/${invoiceId}` as Href);
      return;
    }
    resetFormState();
    router.dismissTo('/(tabs)/invoices');
  };

  const handleNext = async () => {
    // A figure still holds text that was not accepted: show it, focus the first, and stay.
    if ((editorRef.current?.checkAll() ?? 0) > 0) return;

    // A charge of 0 is allowed; its reason is asked for on the review step.
    // A line without a duration is not: it would be charged for no time at all.
    const invalidItems = items.filter((item) => item.duration === 0);

    if (invalidItems.length > 0) {
      showError(
        tr('invoice.items.checkPricesTitle'),
        tr('invoice.items.zeroDuration', { count: invalidItems.length })
      );
      return;
    }

    // Everything else the items check refuses (a duration under half a month,
    // days below 0, a rate out of range) is reported in its own words.
    await navigateToStep(STEP_NUMBERS.REVIEW);
  };

  const handleStepPress = async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.ITEMS) return; // Already on this step
    if (stepNumber === STEP_NUMBERS.HEADER) {
      await handleBack();
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      await handleNext();
    }
  };

  return (
    <View style={styles.container}>
      <InvoiceStepIndicator
        steps={invoiceSteps()}
        currentStep={STEP_NUMBERS.ITEMS}
        completedSteps={getCompletedSteps(STEP_NUMBERS.ITEMS)}
        onCancel={handleCancel}
        onStepPress={handleStepPress}
        invoiceNo={header.inv_no > 0 ? header.inv_no : undefined}
        isEditMode={isEdit}
      />

      {/* The editor is the page's scroll container: the content above the cards goes in its header */}
      <InvoiceItemsEditor
        ref={editorRef}
        items={items}
        oneTime={!!header.one_time_charge}
        itemOverrides={itemOverrides}
        onItemUpdate={(tempId, field, value) => updateItemPricing(tempId, { [field]: value })}
        onBulkEdit={applyGroupPricing}
        onRestoreRates={applySavedRatesToLines}
        onEditPricing={canManagePrices ? editPricing : undefined}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
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
        }
      />

      <WizardBottomBar
        currentStep={STEP_NUMBERS.ITEMS}
        totalSteps={3}
        onPrevious={handleBack}
        previousAccessibilityLabel={tr('invoice.items.backToDetails')}
        onNext={handleNext}
        nextLabel={tr('invoice.items.nextReview')}
      />

      {/* How pricing works */}
      <ConfirmDialog
        visible={helpVisible}
        title={tr('invoice.items.howPricingWorks')}
        message={tr('invoice.items.helpMessage')}
        confirmText={tr('common.close')}
        cancelText=""
        onConfirm={() => setHelpVisible(false)}
        onCancel={() => setHelpVisible(false)}
        icon="information"
      />

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
    </View>
  );
}

export default InvoiceItemsStep;
