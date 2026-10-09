import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  updateEditedItem,
  bulkUpdateItemGroupPricing,
  setValidationErrors,
  setCurrentStep,
  selectInvoiceFormHeader,
  selectInvoiceFormItems,
  selectInvoiceFormItemOverrides,
  selectInvoiceFormId,
} from '@/store/slices/invoiceFormSlice';
import { InvoiceItemsTable } from '@/features/invoice/components/InvoiceItemsTable';
import { InvoiceItemCard } from '@/features/invoice/components/InvoiceItemCard';
import { validateStep2 } from '@/features/invoice/schemas/invoiceValidation';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import {
  INVOICE_STEPS,
  STEP_NUMBERS,
  getCompletedSteps,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { canNavigateFromStep2 } from '@/features/invoice/utils/swipeNavigationHelpers';

import { showAlert } from '@/utils/alert';
import { formatCount } from '@/utils/formatters';
export default function InvoiceEditStep2() {
  const dispatch = useAppDispatch();
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const header = useAppSelector(selectInvoiceFormHeader);
  const items = useAppSelector(selectInvoiceFormItems);
  const itemOverrides = useAppSelector(selectInvoiceFormItemOverrides);
  const invoiceId = useAppSelector(selectInvoiceFormId);

  const [validationErrors, setLocalValidationErrors] = useState<Record<string, string>>({});

  const handleItemUpdate = (tempId: string, field: string, value: number) => {
    dispatch(updateEditedItem({ temp_id: tempId, values: { [field]: value } }));
  };

  const handleBulkEdit = (groupKey: string, pricing: { charge: number; labour_rate: number; tax: number }) => {
    dispatch(bulkUpdateItemGroupPricing({ group_key: groupKey, pricing }));
  };

  const handleBack = () => {
    dispatch(setCurrentStep(0));
    router.back();
  };

  // The step header already asks "Discard changes to this invoice?" before calling this.
  const handleCancel = () => {
    router.dismiss(3);
    router.push('/invoices');
  };

  const handleNext = async () => {
    // Validate items
    const validation = await validateStep2(items);

    if (!validation.isValid) {
      setLocalValidationErrors(validation.errors);
      dispatch(setValidationErrors(validation.errors));

      showAlert('Check the item prices', 'Every item needs a charge and a duration greater than 0.');
      return;
    }

    // Check if all items have valid pricing
    const invalidItems = items.filter(
      (item) => item.charge === 0 || item.duration === 0
    );

    if (invalidItems.length > 0) {
      showAlert(
        'Check the item prices',
        `${invalidItems.length === 1 ? '1 item has' : `${invalidItems.length} items have`} no charge or duration. Enter a charge and duration greater than 0.`
      );
      return;
    }

    // Clear errors and proceed
    setLocalValidationErrors({});
    dispatch(setValidationErrors({}));
    dispatch(setCurrentStep(2));
    router.push(`/invoice-edit/${invoiceId}/step3`);
  };

  const renderItem = (item: any) => (
    <InvoiceItemCard
      item={item}
      onUpdate={handleItemUpdate}
      overriddenFields={itemOverrides[item.temp_id] || []}
    />
  );

  const handleStepPress = async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.ITEMS) return; // Already on this step
    if (stepNumber === STEP_NUMBERS.HEADER) {
      handleBack();
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      if (await canNavigateFromStep2(items)) {
        handleNext();
      }
    }
  };

  return (
    <View style={styles.container}>
      <InvoiceStepIndicator
        steps={INVOICE_STEPS}
        currentStep={STEP_NUMBERS.ITEMS}
        completedSteps={getCompletedSteps(STEP_NUMBERS.ITEMS)}
        onCancel={handleCancel}
        onStepPress={handleStepPress}
        invoiceNo={header.inv_no > 0 ? header.inv_no : undefined}
        isEditMode={true}
      />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={120}
        keyboardShouldPersistTaps="handled"
      >
        {/* Item count */}
        <View style={[styles.card, styles.kvRow]} accessible accessibilityLabel={`${formatCount(items.length, 'item')} to invoice`}>
          <Text style={styles.kvKey}>Items to invoice</Text>
          <Text style={[styles.kvValue, styles.bold, styles.numeric]}>{items.length}</Text>
        </View>

        {/* Grouped Items Table */}
        <InvoiceItemsTable
          items={items}
          onItemUpdate={handleItemUpdate}
          onBulkEdit={handleBulkEdit}
          renderItem={renderItem}
        />

        {/* Pricing guide */}
        <View style={styles.infoStrip}>
          <Icon name="information" size={iconSize.md} color={t.status.informative.text} />
          <View style={styles.infoStripContent}>
            <Text style={styles.infoStripTitle} accessibilityRole="header">How pricing works</Text>
            <Text style={styles.infoStripText}>
              • Tap an item group to open or close it.{'\n'}
              • Group prices apply to every dispatch in the group.{'\n'}
              • Open a dispatch to change the price of one line.{'\n'}
              • <Text style={styles.bold}>Duration</Text>: months in storage (calculated).{'\n'}
              • <Text style={styles.bold}>Charge</Text>: storage rate per unit per month.{'\n'}
              • <Text style={styles.bold}>Labour rate</Text>: handling charge per unit.{'\n'}
              • <Text style={styles.bold}>Tax</Text>: tax percent, for example 18 for 18%.{'\n'}
              • Lines with their own price show a &quot;Custom&quot; tag.{'\n'}
              • Amounts are calculated for you.
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Back to details"
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel="Next: review"
        >
          <Text style={styles.primaryButtonText}>Next: review</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.brand.onFill} />
        </Pressable>
      </View>
    </View>
  );
}
