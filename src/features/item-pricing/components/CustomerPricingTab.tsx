/**
 * The Pricing tab of a customer (Customers -> a customer -> Pricing): the items the customer has an own rate for,
 * one row each (since when, a line per weight band, the default rate beside it, tags), and "+ Add item" for another.
 * A row opens the customer's rate box of that item (app/item-rates/[itemId]/customer/[customerId].tsx), where the
 * figures are typed over in place; every item not listed is charged at the default rate.
 *
 * Mounted only while the tab is shown, so the facility's rates are not read for a customer page that never opens it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { SectionFooter, SectionHeader } from '@/components/ui/SectionHeader';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import { customerRateAddPath, customerRatePath } from '../contract';
import { customerItemRows } from '../customerRates';
import { todayDay } from '../rateText';
import { useItemRates } from '../useItemRates';
import { CustomerItemRateRow } from './CustomerItemRateRow';
import { ItemPickerSheet, type PickableItem } from './ItemPickerSheet';
import { RatesState } from './RatesState';

export interface CustomerPricingTabProps {
  customerId: string;
  customerName: string;
  /** The customer is deactivated: the tab is read only (no "+ Add item"), with a strip that says why. */
  deactivated?: boolean;
  /** An item whose box opens at once (the `item` param of a link into the tab), so Back lands on this tab. */
  openItemId?: string;
  /** Told when `openItemId` was opened, so the page does not open it again when the tab is shown again. */
  onOpened?: () => void;
}

const SKELETON_ROWS = [0, 1, 2];

const makeStyles = (th: ThemeTokens) => ({
  list: { backgroundColor: th.surface.card },
  skeleton: { gap: space.md },
  strip: { paddingHorizontal: layout.marginCompact, paddingTop: space.sm },
});

export function CustomerPricingTab({ customerId, customerName, deactivated = false, openItemId, onOpened }: CustomerPricingTabProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const insets = useSafeAreaInsets();
  const { items, rates, status, refreshing, refresh } = useItemRates();
  const [picking, setPicking] = useState(false);
  const [pulling, setPulling] = useState(false);
  const day = todayDay();

  const entries = useMemo(() => customerItemRows(rates, items, customerId, day), [rates, items, customerId, day]);
  const pickable = useMemo<PickableItem[]>(() => {
    const rated = new Set(entries.map(entry => entry.itemId));
    return items.filter(item => !rated.has(item.id));
  }, [items, entries]);

  const openItem = useCallback(
    (itemId: string) => router.push(customerRatePath(itemId, customerId, undefined, customerName, deactivated)),
    [customerId, customerName, deactivated],
  );
  const addForItem = useCallback(
    (item: PickableItem) => {
      setPicking(false);
      // The full-screen Add customer rate form (owner, 2026-10-17).
      router.push(customerRateAddPath(item.id, customerId, customerName, deactivated));
    },
    [customerId, customerName, deactivated],
  );

  // A link that names an item lands on its box once; Back then returns to this tab.
  useEffect(() => {
    if (!openItemId) return;
    onOpened?.();
    openItem(openItemId);
  }, [openItemId]);

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  const addAction = deactivated
    ? undefined
    : { label: `+ ${t('pricing.customerTab.addItem')}`, accessibilityLabel: t('pricing.customerTab.addItem'), onPress: () => setPicking(true) };

  let body: React.ReactNode;
  if (status === 'loading') {
    body = (
      <View style={styles.skeleton} accessibilityLabel={t('pricing.list.loadingLabel')} testID="customer-pricing-skeleton">
        {SKELETON_ROWS.map(i => <ListSkeletonCard key={i} metricsCount={2} showFooter={false} />)}
      </View>
    );
  } else if (status === 'error') {
    body = (
      <RatesState
        icon="alert-circle-outline"
        title={t('pricing.list.loadErrorTitle')}
        text={t('pricing.list.loadErrorText')}
        actionLabel={t('pricing.list.tryAgain')}
        onAction={() => { void refresh(); }}
        testID="customer-pricing-error"
      />
    );
  } else if (entries.length === 0) {
    body = (
      <RatesState
        icon="tag-outline"
        title={t('pricing.customerTab.empty', { customer: customerName })}
        text={t('pricing.customerTab.emptyDefault')}
        actionLabel={deactivated ? undefined : `+ ${t('pricing.customerTab.addItem')}`}
        actionAccessibilityLabel={t('pricing.customerTab.addItem')}
        onAction={deactivated ? undefined : () => setPicking(true)}
        testID="customer-pricing-empty"
      />
    );
  } else {
    body = (
      <>
        <SectionHeader title={t('pricing.customerTab.sectionTitle')} count={entries.length} action={addAction} testID="customer-pricing-header" />
        <View style={styles.list}>
          {entries.map(entry => <CustomerItemRateRow key={entry.itemId} entry={entry} onPress={openItem} />)}
        </View>
        <SectionFooter text={t('pricing.customerTab.footer')} testID="customer-pricing-footer" />
      </>
    );
  }

  return (
    <View style={{ flex: 1 }} testID="customer-pricing-tab">
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.huge + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={pulling && refreshing} onRefresh={onPull} colors={[th.brand.tint]} tintColor={th.brand.tint} progressBackgroundColor={th.surface.card} />
        }
      >
        {deactivated ? (
          <View style={styles.strip} testID="customer-pricing-deactivated">
            <InlineValidation variant="warning" message={t('pricing.customerTab.deactivated')} />
          </View>
        ) : null}
        {body}
      </ScrollView>
      <ItemPickerSheet
        visible={picking && !deactivated}
        onClose={() => setPicking(false)}
        onSelect={addForItem}
        items={pickable}
        title={t('pricing.customerTab.pickTitle', { customer: customerName })}
        emptyText={status === 'ready' ? t('pricing.customerTab.pickNone') : t('pricing.edit.copyLoading')}
        loadError={status === 'error'}
        onRetry={() => { void refresh(); }}
      />
    </View>
  );
}

export default CustomerPricingTab;
