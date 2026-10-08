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
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceItemsTable } from '@/features/invoice/components/InvoiceItemsTable';
import { InvoiceItemCard } from '@/features/invoice/components/InvoiceItemCard';
import { InvoiceStepIndicator } from '@/components/InvoiceStepIndicator';
import { INVOICE_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/invoiceSteps';
import { findOrCreateItemStoragePrice, getItemStoragePrices } from '@/services/item-pricing-service';

export default function InvoiceFormStep2() {
  // Theme colors for dark mode support
  const colors = useListColors();

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
      showError('Error', 'Customer must be selected before editing pricing');
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
        showError('Error', result.message || 'Failed to find or create pricing');
      }
    } catch (error) {
      console.error('[InvoiceFormStep2] Error in handleEditPricing:', error);
      showError('Error', 'Failed to open pricing form');
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
        'Invalid Pricing',
        `${invalidItems.length} item(s) have invalid pricing. Please ensure charge and duration are greater than 0.`
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
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
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
        {/* Items Count Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.tealLight, borderLeftColor: colors.teal }]}>
          <Text style={[styles.infoLabel, { color: colors.teal }]}>Total Items:</Text>
          <Text style={[styles.infoValue, { color: colors.teal }]}>{items.length}</Text>
        </View>

        {/* Grouped Items Table */}
        {isLoadingPricing && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading pricing...</Text>
          </View>
        )}
        <InvoiceItemsTable
          items={items}
          onItemUpdate={handleItemUpdate}
          onBulkEdit={handleBulkEdit}
          onEditPricing={handleEditPricing}
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

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setErrorDialog({ visible: false, title: '', message: '' })}
        onCancel={() => setErrorDialog({ visible: false, title: '', message: '' })}
        variant="warning"
        icon="alert-circle"
      />
    </View>
  );
}

// SAP Fiori Styles
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
  // Fiori: Info card with left accent border
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
  // Fiori: Helper card with warning accent
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
  loadingOverlay: {
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.xs,
  },
});
