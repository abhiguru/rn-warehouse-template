/**
 * Item page (screen B of the item rate card): the rates of one item.
 *
 * "Default rate" with a card per price type, "Customer rates" with one row per customer who has
 * their own rate, "Old rates" (read-only, every warehouse role) and the rule invoices follow.
 * The day shown is a goods-received day: the list's day arrives as `on`, and Change date moves it.
 * Each tier of a default monthly rate is tagged Standard (it equals a tier of the standard rate) or
 * This item; with no standard rate saved, or not readable, there are no tags.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { rateRights } from '@/features/item-pricing/rateRights';
import { customerRatePath, editorPath, historyPath } from '@/features/item-pricing/contract';
import { planScope } from '@/features/item-pricing/scopePlan';
import { dateText, todayDay } from '@/features/item-pricing/rateText';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import { useStandardRate } from '@/features/item-pricing/useStandardRate';
import { tierTags } from '@/features/item-pricing/standardRate';
import { useRateActions, type RateScope } from '@/features/item-pricing/useRateActions';
import { CustomerPickerSheet, type PickedCustomer } from '@/features/item-pricing/components/CustomerPickerSheet';
import { CustomerRateRow } from '@/features/item-pricing/components/CustomerRateRow';
import { HowInvoiceSheet } from '@/features/item-pricing/components/HowInvoiceSheet';
import { OtherDayStrip } from '@/features/item-pricing/components/OtherDayStrip';
import { GrnOnlyRatesSection } from '@/features/item-pricing/components/GrnOnlyRatesSection';
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
import { getItemGrnRates } from '@/services/item-pricing-service';
import type { ItemGrnRate, ItemStoragePrice, PriceType } from '@/types/item-pricing.types';

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
  title: { ...typography.headline, flex: 1, color: th.text.primary },
  note: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: layout.marginCompact, paddingBottom: space.sm },
  block: { gap: space.md, marginBottom: space.lg },
  strip: { marginHorizontal: layout.marginCompact },
  add: { alignSelf: 'flex-start' as const, marginHorizontal: layout.marginCompact },
  foot: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: layout.marginCompact, paddingTop: space.md },
  link: { alignSelf: 'flex-start' as const, marginHorizontal: layout.marginCompact },
  skeleton: { gap: space.md },
  customerRows: { marginHorizontal: layout.marginCompact, borderRadius: 12, overflow: 'hidden' as const },
});

/** The customers with an own rate in force or coming, as rows of the item page. */
function customerRows(rows: ItemStoragePrice[], day: string) {
  const ids = [...new Set(rows.filter(r => r.customer_id).map(r => r.customer_id as string))];
  return ids
    .map(id => {
      const own = rows.filter(r => r.customer_id === id);
      const plan = planScope(own, day);
      const first = plan.plans[0];
      if (!first) return null;
      const bands = first.view.inForce.length > 0 ? first.view.inForce : first.view.upcoming?.rows ?? [];
      return {
        id,
        name: own[0].customer_name ?? '',
        bands,
        newRateFrom: first.view.upcoming?.startsOn ?? null,
        priceType: first.priceType,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function ItemRatesPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId: string; on?: string }>();
  const itemId = String(params.itemId ?? '');
  const today = todayDay();
  const [day, setDay] = useState(typeof params.on === 'string' && DAY.test(params.on) ? params.on : today);
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const rights = rateRights(role);
  // Rates are changed from today's rows only (a viewed day's figures are not what the server changes).
  const writable = rights.canWrite && day === today;
  const offline = useIsOffline();
  const { itemRates, status, notFound, refreshing, refreshError, lastUpdated, refresh } = useItemRatesFor(itemId);
  // The standard rate is read once per page (from the session cache when it is there) for the Standard / This item tags.
  const standard = useStandardRate();
  const [pulling, setPulling] = useState(false);
  const [picking, setPicking] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  // Rates set for one GRN only (migration 86), read once the page is open; never blocks the page.
  const [grnRates, setGrnRates] = useState<ItemGrnRate[] | null>(null);
  const [grnRatesFailed, setGrnRatesFailed] = useState(false);
  const itemReady = status === 'ready' && !!itemRates;
  useEffect(() => {
    if (!itemReady || !itemId) return undefined;
    let live = true;
    getItemGrnRates(itemId).then(
      list => { if (live) { setGrnRates(list); setGrnRatesFailed(false); } },
      () => { if (live) setGrnRatesFailed(true); },
    );
    return () => { live = false; };
  }, [itemReady, itemId]);

  const item = itemRates?.item ?? { id: itemId, name: '' };
  const actions = useRateActions(item);
  const rows = useMemo(() => itemRates?.rows ?? [], [itemRates]);
  const defaults = useMemo(() => planScope(rows.filter(r => r.customer_id === null), day), [rows, day]);
  const customers = useMemo(() => customerRows(rows, day), [rows, day]);
  const allEnded = useMemo(() => {
    const ended = rows.filter(r => r.effective_to && r.effective_to < day);
    return ended;
  }, [rows, day]);

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  const scopeOf = (priceType: PriceType, view: (typeof defaults.plans)[number]['view']): RateScope => ({
    priceType,
    customerId: null,
    bands: view.inForce,
    upcoming: view.upcoming,
    stopsAfter: view.stopsAfter,
  });

  const pickCustomer = (customer: PickedCustomer) => {
    setPicking(false);
    const priceType = defaults.plans[0]?.priceType ?? 'monthly';
    // A customer who already has an own rate of this type is edited on their own page: adding would end that rate.
    const hasOwn = planScope(rows.filter(r => r.customer_id === customer.id), today).plans.some(p => p.priceType === priceType);
    if (hasOwn) {
      router.push(customerRatePath(itemId, customer.id, undefined, customer.name));
      return;
    }
    router.push(editorPath({ mode: 'addCustomer', item_id: itemId, item_name: item.name, customer_id: customer.id, customer_name: customer.name, price_type: priceType }));
  };

  const hasMonthly = defaults.plans.some(p => p.priceType === 'monthly');
  const hasOneTime = defaults.plans.some(p => p.priceType === 'one_time');

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <HeaderBackButton />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{item.name}</Text>
          {rights.canSeeChanges && itemRates ? (
            <Button type="tertiary" leftIcon="history" onPress={() => router.push(historyPath({ item_id: itemId, item_name: item.name }))} testID="item-changes">
              {t('pricing.action.changes')}
            </Button>
          ) : null}
        </View>
      </View>

      {status === 'loading' ? (
        <View style={styles.skeleton} testID="item-skeleton" accessibilityLabel={t('pricing.list.loadingLabel')}>
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
          testID="item-load-error"
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
            keyboardShouldPersistTaps="handled"
          >
            {/* Default rate */}
            <SectionHeader title={t('pricing.item.default')} />
            <Text style={styles.note}>{t('pricing.item.defaultNote')}</Text>
            <View style={styles.block}>
              {defaults.plans.length === 0 ? (
                <View style={[styles.strip, { gap: space.sm }]}>
                  <RateStrip
                    variant="critical"
                    message={defaults.endedOnly && defaults.lastEnded
                      ? t('pricing.item.defaultEnded', { date: dateText(defaults.lastEnded) })
                      : t('pricing.item.noDefault', { item: item.name })}
                    testID="no-default"
                  />
                  {writable ? (
                    <Button
                      type="primary"
                      size="fullWidth"
                      disabled={offline}
                      onPress={() => router.push(editorPath({ mode: 'add', item_id: itemId, item_name: item.name }))}
                      testID="add-default"
                    >
                      {t('pricing.action.addDefault')}
                    </Button>
                  ) : null}
                  {offline && writable ? <Text style={styles.note}>{t('pricing.item.offlineChange')}</Text> : null}
                </View>
              ) : null}
              {defaults.plans.map(({ priceType, view }) => (
                <View key={priceType} style={{ gap: space.sm }}>
                  {view.inForce.length === 0 && view.upcoming ? (
                    <View style={styles.strip}>
                      <RateStrip variant="warning" message={t('pricing.item.onlyUpcoming', { date: dateText(view.upcoming.startsOn) })} />
                    </View>
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
                    tags={priceType === 'monthly' ? tierTags(view.inForce, standard.rate?.tiers) : null}
                    day={day}
                    onChange={() => actions.change(scopeOf(priceType, view))}
                    onCorrect={() => actions.correct(scopeOf(priceType, view))}
                    onStop={() => actions.stop(scopeOf(priceType, view))}
                    onEditUpcoming={() => actions.editUpcoming(scopeOf(priceType, view))}
                    onCancelUpcoming={() => actions.askCancel(scopeOf(priceType, view))}
                    onUndoStop={() => { void actions.undoStop(scopeOf(priceType, view)); }}
                  />
                </View>
              ))}
              {writable && defaults.plans.length > 0 && !(hasMonthly && hasOneTime) ? (
                <Button
                  type="tertiary"
                  leftIcon="plus"
                  style={styles.add}
                  disabled={offline}
                  onPress={() => router.push(editorPath({ mode: 'add', item_id: itemId, item_name: item.name, price_type: hasMonthly ? 'one_time' : 'monthly' }))}
                  testID="add-other-type"
                >
                  {hasMonthly ? t('pricing.action.addOneTime') : t('pricing.action.addMonthly')}
                </Button>
              ) : null}
            </View>

            {/* Customer rates */}
            <SectionHeader
              title={t('pricing.item.customerRates')}
              count={customers.length}
              action={writable && customers.length > 0 ? { label: t('pricing.action.addCustomer'), onPress: () => setPicking(true) } : undefined}
            />
            <View style={styles.block}>
              {customers.length === 0 ? (
                <View style={[styles.strip, { gap: space.sm }]}>
                  <Text style={styles.note}>{t('pricing.item.noCustomerRates')}</Text>
                  {writable ? (
                    <Button type="secondary" disabled={offline} onPress={() => setPicking(true)} testID="add-customer-rate">
                      {t('pricing.action.addCustomer')}
                    </Button>
                  ) : null}
                </View>
              ) : (
                <View style={styles.customerRows}>
                  {customers.map(c => (
                    <CustomerRateRow
                      key={c.id}
                      customerId={c.id}
                      customerName={c.name}
                      bands={c.bands}
                      newRateFrom={c.newRateFrom}
                      onPress={id => router.push(customerRatePath(itemId, id, day !== today ? day : undefined, c.name))}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* Rates for one GRN only */}
            <GrnOnlyRatesSection rates={grnRates} failed={grnRatesFailed} />

            {/* Old rates */}
            {rights.canSeeOldRates ? <OldRatesSection rows={allEnded} archivedGrnRates={(grnRates ?? []).filter(r => r.archived)} /> : null}

            <Text style={styles.foot}>{t('pricing.item.rule')}</Text>
            <Button type="tertiary" style={styles.link} onPress={() => setHowOpen(true)} testID="how-link">
              {t('pricing.item.howLink')}
            </Button>
          </ScrollView>
        </>
      ) : null}

      <CustomerPickerSheet visible={picking} onClose={() => setPicking(false)} onSelect={pickCustomer} />
      <HowInvoiceSheet visible={howOpen} onClose={() => setHowOpen(false)} />
      {actions.dialog}
    </View>
  );
}
