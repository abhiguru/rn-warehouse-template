import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
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
import { INVOICE_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/invoiceSteps';
import { canNavigateFromStep2 } from '@/features/invoice/utils/swipeNavigationHelpers';

export default function InvoiceEditStep2() {
  const dispatch = useAppDispatch();
  const colors = useListColors(); // Dark mode support
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

  const handleCancel = () => {
    Alert.alert('Cancel Invoice Edit', 'Are you sure you want to cancel? All unsaved changes will be lost.', [
      { text: 'Continue Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          router.dismiss(3);
          router.push('/invoices');
        },
      },
    ]);
  };

  const handleNext = async () => {
    // Validate items
    const validation = await validateStep2(items);

    if (!validation.isValid) {
      setLocalValidationErrors(validation.errors);
      dispatch(setValidationErrors(validation.errors));

      const errorFields = Object.keys(validation.errors);
      const errorMessage =
        errorFields.length > 0
          ? `Please check: ${errorFields.join(', ')}`
          : 'Please ensure all items have valid pricing';

      Alert.alert('Validation Error', errorMessage);
      return;
    }

    // Check if all items have valid pricing
    const invalidItems = items.filter(
      (item) => item.charge === 0 || item.duration === 0
    );

    if (invalidItems.length > 0) {
      Alert.alert(
        'Invalid Pricing',
        `${invalidItems.length} item(s) have invalid pricing. Please ensure charge and duration are greater than 0.`
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
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
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
        {/* Items Count Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.infoLight, borderLeftColor: colors.info }]}>
          <Text style={[styles.infoLabel, { color: colors.info }]}>Total Items:</Text>
          <Text style={[styles.infoValue, { color: colors.info }]}>{items.length}</Text>
        </View>

        {/* Grouped Items Table */}
        <InvoiceItemsTable
          items={items}
          onItemUpdate={handleItemUpdate}
          onBulkEdit={handleBulkEdit}
          renderItem={renderItem}
        />

        {/* Helper Text */}
        <View style={[styles.helperCard, { backgroundColor: colors.warningLight, borderLeftColor: colors.warning }]}>
          <Text style={[styles.helperTitle, { color: colors.gray900 }]}>💡 Pricing Guide</Text>
          <Text style={[styles.helperText, { color: colors.gray600 }]}>
            • Tap on item group header to expand/collapse{'\n'}
            • Use group pricing inputs to set pricing for all dispatches{'\n'}
            • Expand dispatch to view/edit individual item pricing{'\n'}
            • <Text style={styles.bold}>Duration</Text>: Number of months for storage (read-only){'\n'}
            • <Text style={styles.bold}>Charge</Text>: Storage rate per unit per month{'\n'}
            • <Text style={styles.bold}>Labour Rate</Text>: Handling charge per unit{'\n'}
            • <Text style={styles.bold}>Tax</Text>: Tax percentage (e.g., 18 for 18%){'\n'}
            • Items with custom pricing show orange "Custom" badge{'\n'}
            • All amounts are calculated automatically
          </Text>
        </View>
      </KeyboardAwareScrollView>
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
  infoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 4,
  },
  infoLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  infoValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  helperCard: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 4,
    marginTop: theme.spacing.md,
  },
  helperTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 20,
  },
  bold: {
    fontWeight: theme.fontWeight.semibold,
  },
});
