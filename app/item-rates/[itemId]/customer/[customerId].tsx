/**
 * Customer-rate page (screen B2): one customer's own rate for one item, with the default rate
 * beside it. The same card and the same three actions as the item page; stopping this rate
 * puts the customer back on the default rate.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { editorPath, historyPath } from '@/features/item-pricing/contract';
import { rateRights } from '@/features/item-pricing/rateRights';
import { dateText, rentRange, todayDay, unitText } from '@/features/item-pricing/rateText';
import { planScope } from '@/features/item-pricing/scopePlan';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import { useRateActions, type RateScope } from '@/features/item-pricing/useRateActions';
import { OtherDayStrip } from '@/features/item-pricing/components/OtherDayStrip';
import { OldRatesSection } from '@/features/item-pricing/components/OldRatesSection';
import { RateCard } from '@/features/item-pricing/components/RateCard';
import { RateStrip } from '@/features/item-pricing/components/RateStrip';
import { RatesOnBar } from '@/features/item-pricing/components/RatesOnBar';
import { RatesState } from '@/features/item-pricing/components/RatesState';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatTime } from '@/utils/formatters';
import type { PriceType } from '@/types/item-pricing.types';

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
  compare: { ...typography.subhead, color: th.text.secondary, marginHorizontal: layout.marginCompact },
  strip: { marginHorizontal: layout.marginCompact, gap: space.sm },
  block: { gap: space.sm, marginBottom: space.lg },
  skeleton: { gap: space.md },
});

export default function CustomerRatePage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId: string; customerId: string; on?: string; customer_name?: string }>();
  const itemId = String(params.itemId ?? '');
  const customerId = String(params.customerId ?? '');
  const today = todayDay();
  const [day, setDay] = useState(typeof params.on === 'string' && DAY.test(params.on) ? params.on : today);
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const rights = rateRights(role);
  // Rates are changed from today's rows only (a viewed day's figures are not what the server changes).
  const writable = rights.canWrite && day === today;
  const offline = useIsOffline();
  const { itemRates, status, notFound, refreshing, refreshError, lastUpdated, refresh } = useItemRatesFor(itemId);
  const [pulling, setPulling] = useState(false);

  const item = itemRates?.item ?? { id: itemId, name: '' };
  const actions = useRateActions(item);
  const rows = useMemo(() => itemRates?.rows ?? [], [itemRates]);
  const own = useMemo(() => rows.filter(r => r.customer_id === customerId), [rows, customerId]);
  // The name outlives the rows: cancelling or undoing the customer's last own rate leaves no row to read it from.
  const knownName = useRef(typeof params.customer_name === 'string' ? params.customer_name : '');
  if (own[0]?.customer_name) knownName.current = own[0].customer_name;
  const customerName = knownName.current;
  const plan = useMemo(() => planScope(own, day), [own, day]);
  const defaultPlan = useMemo(() => planScope(rows.filter(r => r.customer_id === null), day), [rows, day]);

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  const scopeOf = (priceType: PriceType, view: (typeof plan.plans)[number]['view']): RateScope => ({
    priceType,
    customerId,
    customerName,
    bands: view.inForce,
    upcoming: view.upcoming,
    stopsAfter: view.stopsAfter,
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <HeaderBackButton />
          <View style={styles.titles}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
              {customerName ? t('pricing.customerRate.title', { customer: customerName }) : item.name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>{item.name}</Text>
          </View>
          {rights.canSeeChanges && itemRates ? (
            <Button
              type="tertiary"
              leftIcon="history"
              onPress={() => router.push(historyPath({ item_id: itemId, customer_id: customerId, item_name: item.name }))}
              testID="customer-changes"
            >
              {t('pricing.action.changes')}
            </Button>
          ) : null}
        </View>
      </View>

      {status === 'loading' ? (
        <View style={styles.skeleton} testID="customer-skeleton" accessibilityLabel={t('pricing.list.loadingLabel')}>
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
          testID="customer-load-error"
        />
      ) : null}
      {notFound ? (
        <RatesState icon="package-variant-closed" title={t('pricing.item.notFound')} actionLabel={t('pricing.item.back')} onAction={() => router.back()} testID="item-not-found" />
      ) : null}

      {itemRates ? (
        <>
          <RatesOnBar text={t('pricing.item.status', { date: dateText(day) })} day={day} today={today} onChangeDay={setDay} />
          {rights.canWrite && day !== today ? (
            <View style={styles.strip}>
              <OtherDayStrip day={day} onBack={() => setDay(today)} />
            </View>
          ) : null}
          {refreshError ? (
            <View style={styles.strip}>
              <InlineValidation variant="error" message={t('pricing.list.refreshFailed', { time: lastUpdated ? formatTime(new Date(lastUpdated)) : '' })} />
              <Button type="tertiary" onPress={() => { void refresh(); }}>{t('pricing.list.tryAgain')}</Button>
            </View>
          ) : null}
          <ScrollView
            contentContainerStyle={{ paddingTop: space.md, paddingBottom: space.huge + insets.bottom }}
            refreshControl={<RefreshControl refreshing={pulling && refreshing} onRefresh={onPull} />}
          >
            <View style={styles.block}>
              {plan.plans.length === 0 ? (
                <View style={styles.strip}>
                  <RateStrip variant="warning" message={t('pricing.customerRate.noneNow', { customer: customerName || '—' })} testID="no-own-rate" />
                  {writable && customerId ? (
                    <Button
                      type="primary"
                      size="fullWidth"
                      disabled={offline}
                      onPress={() => router.push(editorPath({ mode: 'addCustomer', item_id: itemId, item_name: item.name, customer_id: customerId, customer_name: customerName, price_type: defaultPlan.plans[0]?.priceType ?? 'monthly' }))}
                      testID="add-customer-rate"
                    >
                      {t('pricing.action.addCustomer')}
                    </Button>
                  ) : null}
                </View>
              ) : null}
              {plan.plans.map(({ priceType, view }) => {
                const defaultView = defaultPlan.plans.find(p => p.priceType === priceType)?.view;
                const defaultRows = defaultView?.inForce ?? [];
                return (
                  <View key={priceType} style={{ gap: space.sm }}>
                    {defaultRows.length > 0 ? (
                      <Text style={styles.compare} testID="default-is">
                        {t('pricing.customerRate.defaultIs', {
                          amount: rentRange(Math.min(...defaultRows.map(r => r.unit_price)), Math.max(...defaultRows.map(r => r.unit_price))),
                          unit: unitText(priceType),
                        })}
                      </Text>
                    ) : null}
                    <RateCard
                      priceType={priceType}
                      bands={view.inForce}
                      upcoming={view.upcoming}
                      stopsAfter={view.stopsAfter}
                      overlap={Boolean(view.overlap)}
                      canCorrect={rights.canCorrect}
                      canWrite={writable}
                      offline={offline}
                      busy={actions.busy}
                      day={day}
                      onChange={() => actions.change(scopeOf(priceType, view))}
                      onCorrect={() => actions.correct(scopeOf(priceType, view))}
                      onStop={() => actions.stop(scopeOf(priceType, view))}
                      onEditUpcoming={() => actions.editUpcoming(scopeOf(priceType, view))}
                      onCancelUpcoming={() => actions.askCancel(scopeOf(priceType, view))}
                      onUndoStop={() => { void actions.undoStop(scopeOf(priceType, view)); }}
                    />
                  </View>
                );
              })}
              {writable && customerName && plan.plans.length === 1 ? (
                <Button
                  type="tertiary"
                  leftIcon="plus"
                  disabled={offline}
                  onPress={() =>
                    router.push(
                      editorPath({
                        mode: 'addCustomer',
                        item_id: itemId,
                        item_name: item.name,
                        customer_id: customerId,
                        customer_name: customerName,
                        price_type: plan.plans[0].priceType === 'monthly' ? 'one_time' : 'monthly',
                      }),
                    )
                  }
                  testID="add-other-type"
                >
                  {plan.plans[0].priceType === 'monthly' ? t('pricing.action.addOneTime') : t('pricing.action.addMonthly')}
                </Button>
              ) : null}
            </View>
            {rights.canSeeOldRates ? <OldRatesSection rows={plan.ended} showCustomer={false} /> : null}
          </ScrollView>
        </>
      ) : null}
      {actions.dialog}
    </View>
  );
}
