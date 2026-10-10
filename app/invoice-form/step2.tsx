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
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceItemsTable } from '@/features/invoice/components/InvoiceItemsTable';
import { InvoiceItemCard } from '@/features/invoice/components/InvoiceItemCard';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { t as tr } from '@/i18n';
import { findOrCreateItemStoragePrice, getItemStoragePrices } from '@/services/item-pricing-service';
import { formatNumber } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';

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
      showError(tr('invoice.items.selectCustomerTitle'), tr('invoice.items.selectCustomerMessage'));
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
        showError(tr('invoice.items.pricingOpenFailedTitle'), serverText(result.message, tr('common.checkConnection')));
      }
    } catch (error) {
      console.error('[InvoiceFormStep2] Error in handleEditPricing:', error);
      showError(tr('invoice.items.pricingOpenFailedTitle'), tr('common.checkConnection'));
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
        tr('invoice.items.checkPricesTitle'),
        tr('invoice.items.missingPrice', { count: invalidItems.length })
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
        steps={invoiceSteps()}
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
        <View style={[styles.card, styles.kvRow]} accessible accessibilityLabel={tr('invoice.items.itemsToInvoiceA11y', { count: items.length })}>
          <Text style={styles.kvKey}>{tr('invoice.items.itemsToInvoice')}</Text>
          <Text style={[styles.kvValue, styles.bold, styles.numeric]}>{formatNumber(items.length)}</Text>
        </View>

        {isLoadingPricing && (
          <View style={styles.loadingRow} accessibilityRole="progressbar" accessibilityLabel={tr('invoice.items.openingPricingA11y')}>
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.loadingText}>{tr('invoice.items.openingPricing')}</Text>
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
