/**
 * Item page: the rates of one item.
 *
 * "Default rate" is a box per price type that is typed over in place (ScopeRates): the figures of the rate in force
 * in a table, and a Save bar with "Starts on" when something is changed. Under it the customers who have their own
 * rate and the rates typed on single GRNs are one line each, with their count, and open their own lists; "Old rates"
 * (read-only, every warehouse role) and the rule invoices follow close the page. The day control is behind the link
 * "See rates on another day": a day other than today shows the read-only rate cards.
 * Each tier of a default monthly rate is tagged Standard (it equals a tier of the standard rate) or This item; with no
 * standard rate saved, or not readable, there are no tags.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { rateRights } from '@/features/item-pricing/rateRights';
import { customerListPath, grnListPath, historyPath } from '@/features/item-pricing/contract';
import { customerRows } from '@/features/item-pricing/customerRates';
import { dateText, todayDay } from '@/features/item-pricing/rateText';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import { useStandardRate } from '@/features/item-pricing/useStandardRate';
import { useEditorFields } from '@/features/item-pricing/useEditorFields';
import type { EditorView } from '@/features/item-pricing/useRateEditor';
import { CountLinkRow } from '@/features/item-pricing/components/CountLinkRow';
import { groupByGrn } from '@/features/item-pricing/grnOnlyText';
import { HowInvoiceSheet } from '@/features/item-pricing/components/HowInvoiceSheet';
import { OldRatesSection } from '@/features/item-pricing/components/OldRatesSection';
import { OtherDayStrip } from '@/features/item-pricing/components/OtherDayStrip';
import { RatesOnBar } from '@/features/item-pricing/components/RatesOnBar';
import { RatesState } from '@/features/item-pricing/components/RatesState';
import { ScopeRates, type RateSaveBarState } from '@/features/item-pricing/components/ScopeRates';
import { ScopeSaveBar } from '@/features/item-pricing/components/ScopeSaveBar';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatTime } from '@/utils/formatters';
import { getItemGrnRates } from '@/services/item-pricing-service';
import type { ItemGrnRate } from '@/types/item-pricing.types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const makeStyles = (th: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: th.background.base },
  flex: { flex: 1 },
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
  foot: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: layout.marginCompact, paddingTop: space.md },
  link: { alignSelf: 'flex-start' as const, marginHorizontal: layout.marginCompact },
  skeleton: { gap: space.md },
  otherDay: { gap: space.sm, marginTop: space.lg },
});

export default function ItemRatesPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId: string; on?: string; add_band?: string }>();
  const itemId = String(params.itemId ?? '');
  const today = todayDay();
  const [day, setDay] = useState(typeof params.on === 'string' && DAY.test(params.on) ? params.on : today);
  // The day control is behind a link; a link that carries a day opens it, so the page is never silently read-only.
  const [dayOpen, setDayOpen] = useState(day !== today);
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const rights = rateRights(role);
  const offline = useIsOffline();
  const { itemRates, status, notFound, refreshing, refreshError, lastUpdated, refresh } = useItemRatesFor(itemId);
  // The standard rate is read once per page (from the session cache when it is there) for the Standard / This item tags.
  const standard = useStandardRate();
  const [pulling, setPulling] = useState(false);
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

  // ---- the rate boxes: their cells, their Save bar, the leave guard ----
  const [order, setOrder] = useState<string[]>([]);
  const [bar, setBar] = useState<RateSaveBarState | null>(null);
  const [anyDirty, setAnyDirty] = useState(false);
  const view = useRef<EditorView | null>(null);
  const { scrollRef, onScroll, fields, barHeight, setBarHeight, scrollToError, scrollToTop, keyboardUp } = useEditorFields(order, { trackKeyboard: true });
  view.current = { scrollToTop, scrollToError };
  useLeaveGuard({ hasChanges: anyDirty });

  const item = itemRates?.item ?? { id: itemId, name: '' };
  const rows = useMemo(() => itemRates?.rows ?? [], [itemRates]);
  const customers = useMemo(() => customerRows(rows, day), [rows, day]);
  const allEnded = useMemo(() => rows.filter(r => r.effective_to && r.effective_to < day), [rows, day]);
  const grnCount = useMemo(() => groupByGrn((grnRates ?? []).filter(r => !r.archived)).length, [grnRates]);

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  const backToToday = () => {
    setDay(today);
    setDayOpen(false);
  };

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
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {refreshError ? (
            <View style={styles.strip}>
              <InlineValidation variant="error" message={t('pricing.list.refreshFailed', { time: lastUpdated ? formatTime(new Date(lastUpdated)) : '' })} />
              <Button type="tertiary" onPress={() => { void refresh(); }}>{t('pricing.list.tryAgain')}</Button>
            </View>
          ) : null}
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={{ paddingTop: space.md, paddingBottom: space.huge + insets.bottom + (bar ? barHeight + space.lg : 0) }}
            refreshControl={<RefreshControl refreshing={pulling && refreshing} onRefresh={onPull} />}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {/* Default rate */}
            <SectionHeader title={t('pricing.item.default')} />
            <Text style={styles.note}>{t('pricing.item.defaultNote')}</Text>
            <View style={styles.block}>
              <ScopeRates
                item={item}
                customerId={null}
                rows={rows}
                day={day}
                today={today}
                rights={rights}
                offline={offline}
                role={role}
                standardTiers={standard.rate?.tiers}
                fields={fields}
                view={view}
                onOrder={setOrder}
                refreshRows={() => { void refresh(); }}
                onBar={setBar}
                onDirty={setAnyDirty}
                addBand={params.add_band === '1'}
              />
            </View>

            {/* Customer rates and rates typed on single GRNs: one line each */}
            <View style={styles.block}>
              {customers.length === 0 ? (
                <Text style={styles.note}>{t('pricing.item.noCustomerRates')}</Text>
              ) : (
                <CountLinkRow
                  label={t('pricing.item.customerRatesLink', { count: customers.length })}
                  onPress={() => router.push(customerListPath(itemId, day !== today ? day : undefined))}
                  testID="customer-rates-link"
                />
              )}
              {grnRatesFailed ? <Text style={styles.note} testID="grn-only-failed">{t('pricing.item.grnOnlyFailed')}</Text> : null}
              {grnCount > 0 ? (
                <CountLinkRow
                  label={t('pricing.item.grnRatesLink', { count: grnCount })}
                  onPress={() => router.push(grnListPath(itemId))}
                  testID="grn-rates-link"
                />
              ) : null}
            </View>

            {/* Old rates */}
            {rights.canSeeOldRates ? <OldRatesSection rows={allEnded} archivedGrnRates={(grnRates ?? []).filter(r => r.archived)} /> : null}

            <Text style={styles.foot}>{t('pricing.item.rule')}</Text>
            <Button type="tertiary" style={styles.link} onPress={() => setHowOpen(true)} testID="how-link">
              {t('pricing.item.howLink')}
            </Button>

            {/* Another day: behind a link; read-only */}
            {dayOpen ? (
              <View style={styles.otherDay} testID="other-day">
                {anyDirty ? (
                  <Text style={styles.note}>{t('pricing.box.locked')}</Text>
                ) : (
                  <RatesOnBar text={t('pricing.item.status', { date: dateText(day) })} day={day} today={today} onChangeDay={setDay} />
                )}
                {rights.canWrite && day !== today ? (
                  <View style={styles.strip}>
                    <OtherDayStrip day={day} onBack={backToToday} />
                  </View>
                ) : null}
                {day === today && !anyDirty ? (
                  <Button type="tertiary" style={styles.link} onPress={() => setDayOpen(false)} testID="other-day-hide">
                    {t('common.close')}
                  </Button>
                ) : null}
              </View>
            ) : anyDirty ? null : (
              <Button type="tertiary" style={styles.link} onPress={() => setDayOpen(true)} testID="other-day-link">
                {t('pricing.item.otherDayLink')}
              </Button>
            )}
          </ScrollView>

          {bar ? <ScopeSaveBar bar={bar} collapsed={keyboardUp} onHeight={setBarHeight} /> : null}
        </KeyboardAvoidingView>
      ) : null}

      <HowInvoiceSheet visible={howOpen} onClose={() => setHowOpen(false)} />
    </View>
  );
}
