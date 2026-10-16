/**
 * Customer rates of one item: a row for every customer who has a rate of their own for it (in force or coming),
 * opening that customer's Pricing tab on this item. Reached from "Customer rates for this item" on the item page,
 * on the day the item page was looking at.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { customerPricingPath } from '@/features/item-pricing/contract';
import { customerRows } from '@/features/item-pricing/customerRates';
import { todayDay } from '@/features/item-pricing/rateText';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import { CustomerRateRow } from '@/features/item-pricing/components/CustomerRateRow';
import { RatesState } from '@/features/item-pricing/components/RatesState';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const makeStyles = (th: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: th.background.base },
  header: {
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: th.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border.divider,
  },
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  titles: { flex: 1 },
  title: { ...typography.headline, color: th.text.primary },
  subtitle: { ...typography.subhead, color: th.text.secondary },
  rows: { marginHorizontal: layout.marginCompact, borderRadius: 12, overflow: 'hidden' as const },
  skeleton: { gap: space.md },
});

export default function ItemCustomerRatesPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId: string; on?: string }>();
  const itemId = String(params.itemId ?? '');
  const today = todayDay();
  const day = typeof params.on === 'string' && DAY.test(params.on) ? params.on : today;
  const { itemRates, status, notFound, refreshing, refresh } = useItemRatesFor(itemId);
  const [pulling, setPulling] = useState(false);
  const customers = useMemo(() => customerRows(itemRates?.rows ?? [], day), [itemRates, day]);

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <HeaderBackButton />
          <View style={styles.titles}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{t('pricing.customersList.title')}</Text>
            {itemRates ? <Text style={styles.subtitle} numberOfLines={2}>{itemRates.item.name}</Text> : null}
          </View>
        </View>
      </View>

      {status === 'loading' ? (
        <View style={styles.skeleton} testID="customers-skeleton" accessibilityLabel={t('pricing.list.loadingLabel')}>
          <ListSkeletonCard metricsCount={3} />
          <ListSkeletonCard metricsCount={3} />
        </View>
      ) : null}

      {status === 'error' ? (
        <RatesState
          icon="alert-circle-outline"
          title={t('pricing.list.loadErrorTitle')}
          text={t('pricing.list.loadErrorText')}
          actionLabel={t('pricing.list.tryAgain')}
          onAction={() => { void refresh(); }}
          testID="customers-load-error"
        />
      ) : null}

      {notFound ? (
        <RatesState
          icon="package-variant-closed"
          title={t('pricing.item.notFound')}
          actionLabel={t('pricing.item.back')}
          onAction={() => router.back()}
          testID="item-not-found"
        />
      ) : null}

      {itemRates ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: space.md, paddingBottom: space.huge + insets.bottom }}
          refreshControl={<RefreshControl refreshing={pulling && refreshing} onRefresh={onPull} />}
        >
          {customers.length === 0 ? (
            <RatesState icon="account-outline" title={t('pricing.item.noCustomerRates')} testID="customers-empty" />
          ) : (
            <View style={styles.rows}>
              {customers.map(c => (
                <CustomerRateRow
                  key={c.id}
                  customerId={c.id}
                  customerName={c.name}
                  bands={c.bands}
                  newRateFrom={c.newRateFrom}
                  onPress={id => router.push(customerPricingPath(id, itemId))}
                />
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}
