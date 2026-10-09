/**
 * Invoice Form Step 2 - Items Pricing
 * Displays items grouped by item name with bulk pricing options
 *
 * Refactored to use useInvoiceForm hook for form state management.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceItemsTable } from '@/features/invoice/components/InvoiceItemsTable';
import { InvoiceItemCard } from '@/features/invoice/components/InvoiceItemCard';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import {
  INVOICE_STEPS,
  STEP_NUMBERS,
  getCompletedSteps,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { findOrCreateItemStoragePrice, getItemStoragePrices } from '@/services/item-pricing-service';

export default function InvoiceFormStep2() {
  const styles = useThemedStyles(makeInvoiceWizardStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Use the consolidated invoice form hook
  const {
    header,
    items,
    itemOverrides,
    updateItemPricing,
    applyGroupPricing,
    navigateToStep,
    resetFormState,
  } = useInvoiceForm({ mode: 'create' });

  // State for loading when navigating to pricing form
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);

  // Dialog states for dark mode compliance
  const [errorDialog, setErrorDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  const showError = (title: string, message: string) => {
    setErrorDialog({ visible: true, title, message });
  };

  // Track the last edited item for applying pricing on return
  const pendingPricingUpdate = useRef<{
    item_id: string;
    weight: number;
    price_id: string;
  } | null>(null);

  // When screen regains focus, check if we need to apply updated pricing
  useFocusEffect(
    useCallback(() => {
      const applyUpdatedPricing = async () => {
        if (!pendingPricingUpdate.current) return;

        const { item_id, weight, price_id } = pendingPricingUpdate.current;

        try {
          // Fetch pricing records and find the specific one by ID
          const result = await getItemStoragePrices({
            p_filters: { item_ids: [item_id] },
            p_limit: 100,
          });

          if (result.success && result.data.length > 0) {
            // Find the specific pricing record by ID
            const updatedPrice = result.data.find(p => p.id === price_id);
            if (!updatedPrice) {
              return;
            }

            // Apply pricing to all groups with the same item_id AND weight
            const matchingItems = items.filter(item =>
              item.item_id === item_id && item.weight === weight
            );

            if (matchingItems.length > 0) {
              // Get unique package_marks for groups with this weight
              const packageMarks = new Set(matchingItems.map(item => item.package_mark));
              packageMarks.forEach(packageMark => {
                const groupKey = `${item_id}:::${packageMark}`;
                applyGroupPricing(groupKey, {
                  charge: updatedPrice.unit_price,
                  labour_rate: updatedPrice.labour_rate,
                  tax: updatedPrice.tax_percent,
                });
              });
            }
          }
        } catch (error) {
          console.error('[InvoiceFormStep2] Error applying updated pricing:', error);
        } finally {
          // Clear the pending update
          pendingPricingUpdate.current = null;
        }
      };

      applyUpdatedPricing();
    }, [items, applyGroupPricing])
  );

  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 2,
    totalSteps: 4,
    stepBasePath: '/invoice-form/step',
    exitRoute: '/invoices',
  });

  const handleItemUpdate = (tempId: string, field: string, value: number) => {
    updateItemPricing(tempId, { [field]: value });
  };

  const handleBulkEdit = (groupKey: string, pricing: { charge: number; labour_rate: number; tax: number }) => {
    applyGroupPricing(groupKey, pricing);
  };

  // Handle edit pricing button press - find or create pricing record and navigate to edit form
  const handleEditPricing = useCallback(async (params: {
    item_id: string;
    item_name: string;
    weight: number;
    charge: number;
    labour_rate: number;
    tax: number;
  }) => {
    // Validate customer_id exists
    if (!header.customer_id) {
      showError('Select a customer first', 'Select a GRN on the details step, then edit the pricing.');
      return;
    }

    setIsLoadingPricing(true);

    try {
      // Determine price type from invoice header
      const priceType = header.one_time_charge ? 'one_time' : 'monthly';

      const result = await findOrCreateItemStoragePrice({
        item_id: params.item_id,
        customer_id: header.customer_id,
        weight: params.weight,
        price_type: priceType,
        default_values: {
          unit_price: params.charge,
          labour_rate: params.labour_rate,
          tax_percent: params.tax,
          weight_min: 0,
          weight_max: params.weight,
        },
      });

      if (result.success && result.data) {
        // Store the pending update so we can apply it when returning
        pendingPricingUpdate.current = {
          item_id: params.item_id,
          weight: params.weight,
          price_id: result.data.id,
        };
        // Navigate to pricing form in edit mode
        router.push(`/item-pricing-form?id=${result.data.id}&mode=edit`);
      } else {
        showError("Couldn't open the pricing", result.message || 'Check your connection and try again.');
      }
    } catch (error) {
      console.error('[InvoiceFormStep2] Error in handleEditPricing:', error);
      showError("Couldn't open the pricing", 'Check your connection and try again.');
    } finally {
      setIsLoadingPricing(false);
    }
  }, [header.customer_id, header.one_time_charge]);

  const handleBack = async () => {
    await navigateToStep(1);
  };

  const handleCancel = () => {
    resetFormState();
    router.replace('/invoices');
  };

  const handleNext = async () => {
    // Check if all items have valid pricing before navigating
    const invalidItems = items.filter(
      (item) => item.charge === 0 || item.duration === 0
    );

    if (invalidItems.length > 0) {
      showError(
        'Check the item prices',
        `${invalidItems.length === 1 ? '1 item has' : `${invalidItems.length} items have`} no charge or duration. Enter a charge and duration greater than 0.`
      );
      return;
    }

    await navigateToStep(3);
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
      await handleBack();
    } else if (stepNumber === STEP_NUMBERS.REVIEW) {
      await handleNext();
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
        <View style={[styles.card, styles.kvRow]} accessible accessibilityLabel={`${items.length} ${items.length === 1 ? 'item' : 'items'} to invoice`}>
          <Text style={styles.kvKey}>Items to invoice</Text>
          <Text style={[styles.kvValue, styles.bold, styles.numeric]}>{items.length}</Text>
        </View>

        {isLoadingPricing && (
          <View style={styles.loadingRow} accessibilityRole="progressbar" accessibilityLabel="Opening pricing">
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.loadingText}>Opening pricing…</Text>
          </View>
        )}

        {/* Grouped Items Table */}
        <InvoiceItemsTable
          items={items}
          onItemUpdate={handleItemUpdate}
          onBulkEdit={handleBulkEdit}
          onEditPricing={handleEditPricing}
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

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText="Close"
        cancelText=""
        onConfirm={() => setErrorDialog({ visible: false, title: '', message: '' })}
        onCancel={() => setErrorDialog({ visible: false, title: '', message: '' })}
        variant="warning"
        icon="alert-circle"
      />
    </View>
  );
}
