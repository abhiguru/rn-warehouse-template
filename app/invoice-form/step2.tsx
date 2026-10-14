/**
 * Invoice Form Step 2 - Items Pricing
 * Displays items grouped by item name with bulk pricing options
 *
 * Refactored to use useInvoiceForm hook for form state management.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';
import { useInvoiceForm } from '@/hooks/useInvoiceForm';
import { useBackHandler } from '@/hooks/useBackHandler';
import { InvoiceItemsTable } from '@/features/invoice/components/InvoiceItemsTable';
import type { GroupRates } from '@/types/invoice.types';
import { InvoiceItemCard } from '@/features/invoice/components/InvoiceItemCard';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import {
  STEP_NUMBERS,
  getCompletedSteps,
  makeInvoiceWizardStyles,
} from '@/constants/invoiceSteps';
import { t as tr } from '@/i18n';
import { getItemStoragePrices, listItemRates } from '@/services/item-pricing-service';
import { subscribeRatesChanged } from '@/features/item-pricing/contract';
import { applicableRate } from '@/features/item-pricing/rateModel';
import { findCustomerPrice } from '@/features/item-pricing/utils/findCustomerPrice';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { canOpenScreen } from '@/config/roles';
import { formatNumber, toLocalISODate } from '@/utils/formatters';
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
    applySavedRatesToLines,
    navigateToStep,
    resetFormState,
  } = useInvoiceForm({ mode: 'create' });

  const [hasRateInputError, setHasRateInputError] = useState(false);

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

  // Prices are changed by administrators, supervisors and staff (as on the price list;
  // server migration 45). Everyone who reaches this form is one of them.
  const { role } = useRoleBasedAccess();
  const canManagePrices = canOpenScreen(role, 'itemPricingWrite');

  // The customer's own price row for an item group, read from the price list. Nothing is written.
  const findPriceFor = useCallback(
    async (itemId: string, weight: number) => {
      const result = await getItemStoragePrices({ p_filters: { item_ids: [itemId] }, p_limit: 100 });
      if (!result.success) return { ok: false as const, message: result.message };
      const price = findCustomerPrice(result.data, {
        item_id: itemId,
        customer_id: header.customer_id,
        weight,
        // The GRN's pricing mode decides which kind of price the invoice uses.
        price_type: header.one_time_charge ? 'one_time' : 'monthly',
        today: toLocalISODate(new Date()),
      });
      return { ok: true as const, price };
    },
    [header.customer_id, header.one_time_charge]
  );

  // The item group whose price form was opened. `saved` turns true only when the editor reports a
  // successful save, so leaving the editor without saving changes nothing on the invoice.
  const pendingPricingUpdate = useRef<{ item_id: string; weight: number; saved: boolean } | null>(null);
  useEffect(
    () =>
      subscribeRatesChanged(changedItem => {
        if (pendingPricingUpdate.current?.item_id === changedItem) pendingPricingUpdate.current.saved = true;
      }),
    []
  );

  // The latest lines and header, for the continuation below: it must read what the form holds when
  // the rates arrive, not what it held when it started.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const headerRef = useRef(header);
  headerRef.current = header;
  // Raised whenever the screen loses focus or the form is cancelled: an answer that started
  // before that is dropped, so it never writes into a form that was left or discarded.
  const applyToken = useRef(0);
  // True once the form was cancelled: a saved rate is then no longer applied or retried.
  const discarded = useRef(false);

  // When screen regains focus, apply the rates the editor saved: each line by its own weight and
  // goods-received day. Lines that were typed by hand keep their value (the form's override marks).
  useFocusEffect(
    useCallback(() => {
      const applyUpdatedPricing = async () => {
        const pending = pendingPricingUpdate.current;
        if (!pending || !pending.saved) {
          if (pending) pendingPricingUpdate.current = null;
          return;
        }
        const token = applyToken.current;
        const restore = () => {
          // Left before the answer came: try again the next time this step is shown.
          if (!discarded.current && !pendingPricingUpdate.current) {
            pendingPricingUpdate.current = pending;
          }
        };

        try {
          // Every rate of the item as saved (ended ones too: an older lot is priced by the rate of its own day).
          const rates = await listItemRates(pending.item_id);
          if (token !== applyToken.current) {
            restore();
            return;
          }
          const today = toLocalISODate(new Date());
          const current = headerRef.current;
          const updates: Array<{ temp_id: string; charge: number; labour_rate: number; tax: number }> = [];
          // Every line of the item, by its own weight: the saved change can move any of its bands.
          itemsRef.current
            .filter(line => line.item_id === pending.item_id)
            .forEach(line => {
              // The same rule invoices use: the customer's own rate before the default, narrowest band, latest start.
              const rate = applicableRate(rates, {
                customer_id: current.customer_id,
                weight: line.weight,
                price_type: current.one_time_charge ? 'one_time' : 'monthly',
                day: line.grn_date || today,
              });
              if (rate) {
                updates.push({ temp_id: line.temp_id, charge: rate.unit_price, labour_rate: rate.labour_rate, tax: rate.tax_percent });
              }
            });
          pendingPricingUpdate.current = null;
          if (updates.length > 0) applySavedRatesToLines(updates);
        } catch (error) {
          console.error('[InvoiceFormStep2] Error applying updated pricing:', error);
          if (token !== applyToken.current) {
            restore();
            return;
          }
          // Keep the saved marker: leaving this step and coming back tries again.
          showError(tr('invoice.items.ratesNotAppliedTitle'), tr('invoice.items.ratesNotAppliedMessage'));
        }
      };

      applyUpdatedPricing();
      return () => {
        applyToken.current += 1;
      };
    }, [applySavedRatesToLines])
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

  const handleBulkEdit = (groupKey: string, pricing: GroupRates) => {
    applyGroupPricing(groupKey, pricing);
  };

  const openingPricing = useRef(false);

  // Pencil beside an item group: open the price form. Looking at a price writes
  // nothing. The customer's existing price opens for editing; when there is
  // none, an empty form opens filled from the line, and the price row is
  // created only if that form is saved.
  const handleEditPricing = useCallback(async (params: {
    item_id: string;
    item_name: string;
    package_mark?: string;
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

    // A second tap while the first is still reading would stack a second editor.
    if (openingPricing.current) return;
    openingPricing.current = true;
    setIsLoadingPricing(true);

    try {
      const found = await findPriceFor(params.item_id, params.weight);
      if (!found.ok) {
        showError(tr('invoice.items.pricingOpenFailedTitle'), serverText(found.message, tr('common.checkConnection')));
        return;
      }

      discarded.current = false;
      pendingPricingUpdate.current = { item_id: params.item_id, weight: params.weight, saved: false };
      // The editor resolves the rate itself (the customer's own rate in force on the goods-received
      // day, or a new customer rate copied from the default): it needs the line and its day. The
      // days are those of the tapped group's own lines; a group of several days uses the latest.
      const own = items.filter(
        i => i.item_id === params.item_id && i.weight === params.weight && (params.package_mark === undefined || i.package_mark === params.package_mark)
      );
      const days = [...new Set(own.map(i => i.grn_date).filter((d): d is string => Boolean(d)))].sort();
      const grn_date = days[days.length - 1];
      router.push({
        pathname: '/item-rates/edit',
        params: {
          mode: 'invoice',
          item_id: params.item_id,
          item_name: params.item_name,
          customer_id: header.customer_id,
          customer_name: header.customer_name,
          price_type: header.one_time_charge ? 'one_time' : 'monthly',
          unit_price: String(params.charge),
          labour_rate: String(params.labour_rate),
          tax_percent: String(params.tax),
          weight_min: '0',
          weight_max: String(params.weight),
          grn_date,
          ...(days.length > 1 ? { grn_dates_differ: '1' } : {}),
        },
      });
    } catch (error) {
      console.error('[InvoiceFormStep2] Error in handleEditPricing:', error);
      showError(tr('invoice.items.pricingOpenFailedTitle'), tr('common.checkConnection'));
    } finally {
      openingPricing.current = false;
      setIsLoadingPricing(false);
    }
  }, [header.customer_id, header.customer_name, header.one_time_charge, findPriceFor, items]);

  const handleBack = async () => {
    await navigateToStep(1);
  };

  const handleCancel = () => {
    discarded.current = true;
    applyToken.current += 1;
    pendingPricingUpdate.current = null;
    resetFormState();
    router.replace('/invoices');
  };

  const handleNext = async () => {
    // A rate field still shows text that was not accepted (out of range, not a number).
    if (hasRateInputError) {
      showError(tr('invoice.items.checkPricesTitle'), tr('invoice.items.checkRateMessage'));
      return;
    }

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

      {/* Grouped Items Table: the page's scroll container, with the content above and below it */}
      <InvoiceItemsTable
        items={items}
        onItemUpdate={handleItemUpdate}
        onBulkEdit={handleBulkEdit}
        onEditPricing={canManagePrices ? handleEditPricing : undefined}
        onInputErrorChange={setHasRateInputError}
        renderItem={renderItem}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <>
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
          </>
        }
        ListFooterComponent={
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
        }
      />

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
