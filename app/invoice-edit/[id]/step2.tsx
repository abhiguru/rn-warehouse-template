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
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { canNavigateFromStep2 } from '@/features/invoice/utils/swipeNavigationHelpers';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
import { formatNumber } from '@/utils/formatters';
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

      showAlert(tr('invoice.items.checkPricesTitle'), tr('invoice.items.checkPricesMessage'));
      return;
    }

    // Check if all items have valid pricing
    const invalidItems = items.filter(
      (item) => item.charge === 0 || item.duration === 0
    );

    if (invalidItems.length > 0) {
      showAlert(
        tr('invoice.items.checkPricesTitle'),
        tr('invoice.items.missingPrice', { count: invalidItems.length })
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
        steps={invoiceSteps()}
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
        <View style={[styles.card, styles.kvRow]} accessible accessibilityLabel={tr('invoice.items.itemsToInvoiceA11y', { count: items.length })}>
          <Text style={styles.kvKey}>{tr('invoice.items.itemsToInvoice')}</Text>
          <Text style={[styles.kvValue, styles.bold, styles.numeric]}>{formatNumber(items.length)}</Text>
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
            <Text style={styles.infoStripTitle} accessibilityRole="header">{tr('invoice.items.guide.title')}</Text>
            <Text style={styles.infoStripText}>
              • {tr('invoice.items.guide.tapGroup')}{'\n'}
              • {tr('invoice.items.guide.groupPrices')}{'\n'}
              • {tr('invoice.items.guide.openDispatch')}{'\n'}
              • <Text style={styles.bold}>{tr('invoice.label.duration')}</Text>{tr('invoice.items.guide.durationText')}{'\n'}
              • <Text style={styles.bold}>{tr('invoice.label.charge')}</Text>{tr('invoice.items.guide.chargeText')}{'\n'}
              • <Text style={styles.bold}>{tr('invoice.label.labourRate')}</Text>{tr('invoice.items.guide.labourText')}{'\n'}
              • <Text style={styles.bold}>{tr('invoice.label.tax')}</Text>{tr('invoice.items.guide.taxText')}{'\n'}
              • {tr('invoice.items.guide.customTag')}{'\n'}
              • {tr('invoice.items.guide.calculated')}
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
          accessibilityLabel={tr('invoice.items.backToDetails')}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.secondaryButtonText}>{tr('common.back')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={tr('invoice.items.nextReview')}
        >
          <Text style={styles.primaryButtonText}>{tr('invoice.items.nextReview')}</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.brand.onFill} />
        </Pressable>
      </View>
    </View>
  );
}
