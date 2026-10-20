/**
 * The Pricing tab of an item (Items -> an item -> Pricing): the item's default rate, the one every customer pays
 * unless they have their own (a customer's own rate is under Customers -> a customer -> Pricing).
 *
 * A Monthly | One-time switch picks the kind. Every period of that kind is a card, newest first: Upcoming (Change,
 * Cancel), In force (Correct this rate, Stop this rate, and the strip of a rate that stops, with Undo stop) and Ended
 * (read only). "+ Add rate", Correct and Change open the full-screen rate form (app/item-rates/[itemId]/rate.tsx);
 * Stop opens the stop screen; a save elsewhere refetches the item, so the tab shows it on return. Under the cards
 * come the item's Changes and "How an invoice picks a rate". The buttons that change rates are for a role that may
 * write, and wait for a connection. Each monthly tier in force is tagged Standard or This item.
 *
 * Mounted only while the tab is shown, so the item's rates are not read for an item page that never opens it.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { PriceType } from '@/types/item-pricing.types';
import { formatTime } from '@/utils/formatters';
import { historyPath, rateFormPath } from '../contract';
import { ratePeriods, type RatePeriod } from '../ratePeriods';
import { seenRowIds } from '../editModel';
import { rateState, scopeView } from '../rateModel';
import { rateRights } from '../rateRights';
import { addDays, dateText, todayDay } from '../rateText';
import { tierTags } from '../standardRate';
import { useItemRatesFor } from '../useItemRates';
import { useRateActions, type RateScope } from '../useRateActions';
import { useStandardRate } from '../useStandardRate';
import { priceTypeLabel } from '../utils/priceLabels';
import { HowInvoiceSheet } from './HowInvoiceSheet';
import { RatePeriodCard } from './RatePeriodCard';
import { RateStrip, type RateStripAction } from './RateStrip';
import { RatesState } from './RatesState';

export interface ItemPricingTabProps {
  itemId: string;
  itemName: string;
  /** The item is deactivated (Overview -> Deactivate): its rates cannot change, so the tab says so. */
  active?: boolean;
}

const SKELETON_CARDS = [0, 1];

const makeStyles = (th: ThemeTokens) => ({
  switchRow: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, paddingBottom: space.sm },
  cards: { gap: space.md },
  add: { alignSelf: 'flex-start' as const, marginHorizontal: layout.marginCompact },
  note: { ...typography.footnote, color: th.text.secondary, marginHorizontal: layout.marginCompact },
  empty: { ...typography.subhead, color: th.text.secondary, marginHorizontal: layout.marginCompact },
  strip: { marginHorizontal: layout.marginCompact },
  links: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: space.sm, marginHorizontal: layout.marginCompact, marginTop: space.lg },
  skeleton: { gap: space.md },
  block: { gap: space.md },
});

export function ItemPricingTab({ itemId, itemName, active = true }: ItemPricingTabProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const insets = useSafeAreaInsets();
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const rights = rateRights(role);
  const offline = useIsOffline();
  const { itemRates, status, notFound, refreshing, refreshError, lastUpdated, refresh } = useItemRatesFor(itemId);
  // The standard rate is read once per page (from the session cache when it is there) for the Standard / This item tags.
  const standard = useStandardRate();
  const actions = useRateActions({ id: itemId, name: itemName });
  const [chosenType, setChosenType] = useState<PriceType | null>(null);
  const [pulling, setPulling] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const day = todayDay();

  const rows = useMemo(() => itemRates?.rows ?? [], [itemRates]);
  // Opens on Monthly; on One-time when the item has one-time periods and no monthly one. A tap on the switch decides after that.
  const priceType: PriceType =
    chosenType ??
    (rows.some(r => r.customer_id === null && r.price_type === 'monthly') ? 'monthly' : rows.some(r => r.customer_id === null && r.price_type === 'one_time') ? 'one_time' : 'monthly');
  const periods = useMemo(() => ratePeriods(rows, priceType, day), [rows, priceType, day]);
  // What is in force and what stops for the chosen kind: Stop, Undo stop and Cancel work on these.
  const view = useMemo(() => scopeView(rows.filter(r => r.customer_id === null && r.price_type === priceType), day), [rows, priceType, day]);
  const inForcePeriod = periods.find(p => p.state === 'inForce');
  const busy = actions.busy;
  const canChange = rights.canWrite && active;

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  // Correct needs the rows in force to share one start day (old data can hold bands that started on different days).
  const oneStart = new Set(view.inForce.map(r => r.effective_from)).size <= 1;

  // The rows Cancel of an upcoming period gives back: those in force the day before it starts (not always the ones in
  // force today: a later upcoming period follows an earlier upcoming one).
  const rowsBefore = (period: RatePeriod) => {
    const dayBefore = addDays(period.from, -1);
    return rows
      .filter(r => r.customer_id === null && r.price_type === priceType && rateState(r, dayBefore) === 'inForce')
      .sort((a, b) => a.weight_min - b.weight_min || a.weight_max - b.weight_max);
  };

  const scopeOf = (period: RatePeriod): RateScope => ({
    priceType,
    customerId: null,
    bands: period.state === 'upcoming' ? rowsBefore(period) : view.inForce,
    upcoming: period.state === 'upcoming' ? { startsOn: period.from, rows: period.rows } : null,
    stopsAfter: view.stopsAfter,
    seenRows: seenRowIds(rows, null, priceType),
  });
  const openForm = (mode: 'add' | 'correct' | 'upcoming', startsOn?: string) =>
    router.push(rateFormPath({ itemId, mode, priceType, startsOn }));

  const buttonsOf = (period: RatePeriod): RateStripAction[] => {
    if (!canChange || !active) return [];
    if (period.state === 'upcoming') {
      return [
        { label: t('pricing.action.changeUpcoming'), a11yLabel: t('pricing.itemTab.changeA11y', { date: dateText(period.from) }), onPress: () => openForm('upcoming', period.from), disabled: offline || busy, testID: 'period-change' },
        { label: t('pricing.action.cancelPeriod'), a11yLabel: t('pricing.itemTab.cancelA11y', { date: dateText(period.from) }), onPress: () => actions.askCancel(scopeOf(period)), disabled: offline || busy, negative: true, testID: 'period-cancel' },
      ];
    }
    // Only the newest period in force has buttons: older data can hold two (they overlap), and the rate screens work on the newest.
    if (period.state === 'inForce' && period === inForcePeriod) {
      return [
        ...(rights.canCorrect && oneStart
          ? [{ label: t('pricing.action.correct'), a11yLabel: t('pricing.itemTab.correctA11y', { date: dateText(period.from) }), onPress: () => openForm('correct', period.from), disabled: offline || busy, testID: 'period-correct' }]
          : []),
        { label: t('pricing.action.stop'), a11yLabel: t('pricing.itemTab.stopA11y', { date: dateText(period.from) }), onPress: () => actions.stop(scopeOf(period)), disabled: offline || busy, negative: true, testID: 'period-stop' },
      ];
    }
    return [];
  };

  let body: React.ReactNode;
  if (status === 'loading') {
    body = (
      <View style={styles.skeleton} accessibilityLabel={t('pricing.list.loadingLabel')} testID="item-pricing-skeleton">
        {SKELETON_CARDS.map(i => <ListSkeletonCard key={i} metricsCount={3} />)}
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
        testID="item-pricing-error"
      />
    );
  } else if (notFound || !active) {
    body = <RatesState icon="package-variant-closed" title={t('pricing.item.notFound')} testID="item-pricing-not-found" />;
  } else {
    const hasButtons = periods.some(p => buttonsOf(p).length > 0) || canChange;
    body = (
      <View style={styles.block}>
        {refreshError ? (
          <View style={styles.strip}>
            <InlineValidation variant="error" message={t('pricing.list.refreshFailed', { time: lastUpdated ? formatTime(new Date(lastUpdated)) : '' })} />
            <Button type="tertiary" onPress={() => { void refresh(); }}>{t('pricing.list.tryAgain')}</Button>
          </View>
        ) : null}
        <SectionHeader
          title={t(priceType === 'monthly' ? 'pricing.itemTab.sectionMonthly' : 'pricing.itemTab.sectionOneTime')}
          count={periods.length}
          testID="item-pricing-header"
        />
        {canChange ? (
          <Button
            type="tertiary"
            leftIcon="plus"
            style={styles.add}
            disabled={offline || busy}
            onPress={() => openForm('add')}
            accessibilityLabel={t(priceType === 'monthly' ? 'pricing.itemTab.addMonthlyA11y' : 'pricing.itemTab.addOneTimeA11y')}
            testID="period-add"
          >
            {t('pricing.itemTab.addRate')}
          </Button>
        ) : null}
        {periods.length === 0 ? (
          <Text style={styles.empty} testID="item-pricing-empty">
            {t(priceType === 'monthly' ? 'pricing.itemTab.emptyMonthly' : 'pricing.itemTab.emptyOneTime')}
          </Text>
        ) : (
          <View style={styles.cards}>
            {periods.map(period => {
              const tags = period.state === 'inForce' && priceType === 'monthly' ? tierTags(period.rows, standard.rate?.tiers) : null;
              return (
                <RatePeriodCard key={period.key} period={period} tags={tags} actions={buttonsOf(period)}>
                  {period === inForcePeriod && view.stopsAfter ? (
                    <RateStrip
                      variant="warning"
                      message={t('pricing.item.stops', { date: dateText(view.stopsAfter) })}
                      actions={
                        canChange
                          ? [{ label: t('pricing.action.undoStop'), onPress: () => { void actions.undoStop(scopeOf(period)); }, disabled: offline || busy, testID: 'undo-stop' }]
                          : undefined
                      }
                    />
                  ) : null}
                </RatePeriodCard>
              );
            })}
          </View>
        )}
        {offline && hasButtons ? <Text style={styles.note}>{t('pricing.item.offlineChange')}</Text> : null}
        <View style={styles.links}>
          {rights.canSeeChanges ? (
            <Button type="tertiary" leftIcon="history" onPress={() => router.push(historyPath({ item_id: itemId, item_name: itemName }))} testID="item-changes">
              {t('pricing.action.changes')}
            </Button>
          ) : null}
          <Button type="tertiary" onPress={() => setHowOpen(true)} testID="how-link">
            {t('pricing.item.howLink')}
          </Button>
        </View>
      </View>
    );
  }

  const showSwitch = status === 'ready' && !notFound && active;
  return (
    <View style={{ flex: 1 }} testID="item-pricing-tab">
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.huge + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={pulling && refreshing} onRefresh={onPull} colors={[th.brand.tint]} tintColor={th.brand.tint} progressBackgroundColor={th.surface.card} />
        }
      >
        {showSwitch ? (
          <View style={styles.switchRow}>
            <SegmentedControl
              stacked
              style={{ paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 }}
              accessibilityLabel={t('pricing.itemTab.rateTypeLabel')}
              value={priceType}
              onValueChange={value => setChosenType(value as PriceType)}
              options={[
                { value: 'monthly', label: priceTypeLabel('monthly') },
                { value: 'one_time', label: priceTypeLabel('one_time') },
              ]}
            />
          </View>
        ) : null}
        {body}
      </ScrollView>
      <HowInvoiceSheet visible={howOpen} onClose={() => setHowOpen(false)} />
      {actions.dialog}
    </View>
  );
}

export default ItemPricingTab;
