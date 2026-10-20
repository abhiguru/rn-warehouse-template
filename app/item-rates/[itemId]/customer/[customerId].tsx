/**
 * The customer's rate box (screen B2): one customer's own rate for one item, opened from the customer's Pricing tab.
 * The figures are typed over in place, in the same box as the item's default rate (ScopeRates with a customer): a
 * Save bar with "Starts on" appears when something is changed, "Default rate: ..." sits beside the box, and Correct /
 * Stop sit under it; stopping this rate puts the customer back on the default rate. A customer with no own rate for
 * the item gets the strip that says so and "Add customer rate", which opens the full-screen form that adds it. Old rates are folded at the bottom, and the day
 * control is behind the link "See rates on another day" (a day other than today is read-only).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { historyPath, knownDeactivated } from '@/features/item-pricing/contract';
import { rateRights } from '@/features/item-pricing/rateRights';
import { dateText, todayDay } from '@/features/item-pricing/rateText';
import { planScope } from '@/features/item-pricing/scopePlan';
import { useEditorFields } from '@/features/item-pricing/useEditorFields';
import { useCustomerDeactivatedState } from '@/features/item-pricing/useCustomerDeactivated';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import type { EditorView } from '@/features/item-pricing/useRateEditor';
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
  titles: { flex: 1 },
  title: { ...typography.headline, color: th.text.primary },
  subtitle: { ...typography.subhead, color: th.text.secondary },
  note: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: layout.marginCompact, paddingBottom: space.sm },
  strip: { marginHorizontal: layout.marginCompact, gap: space.sm },
  block: { gap: space.md, marginBottom: space.lg },
  link: { alignSelf: 'flex-start' as const, marginHorizontal: layout.marginCompact },
  skeleton: { gap: space.md },
  otherDay: { gap: space.sm, marginTop: space.lg },
});

export default function CustomerRatePage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId: string; customerId: string; on?: string; customer_name?: string; deactivated?: string }>();
  const itemId = String(params.itemId ?? '');
  const customerId = String(params.customerId ?? '');
  const today = todayDay();
  const [day, setDay] = useState(typeof params.on === 'string' && DAY.test(params.on) ? params.on : today);
  // The day control is behind a link; a link that carries a day opens it, so the page is never silently read-only.
  const [dayOpen, setDayOpen] = useState(day !== today);
  const role = useAppSelector(state => state.auth.userProfile?.role);
  // A deactivated customer's rates are read only: no new rate, no change, no correction, no stop.
  // Unknown (not yet read) counts as read only.
  const { deactivated, failed: deactivatedCheckFailed, retry: retryDeactivated } = useCustomerDeactivatedState(customerId, knownDeactivated(params.deactivated));
  const rights = useMemo(
    () => (deactivated !== false ? { ...rateRights(role), canWrite: false, canCorrect: false, canStartInPast: false } : rateRights(role)),
    [role, deactivated]
  );
  const offline = useIsOffline();
  const { itemRates, status, notFound, refreshing, refreshError, lastUpdated, refresh } = useItemRatesFor(itemId);
  const [pulling, setPulling] = useState(false);

  // ---- the rate box: its cells, its Save bar, the leave guard ----
  const [order, setOrder] = useState<string[]>([]);
  const [bar, setBar] = useState<RateSaveBarState | null>(null);
  const [anyDirty, setAnyDirty] = useState(false);
  const view = useRef<EditorView | null>(null);
  const { scrollRef, onScroll, fields, barHeight, setBarHeight, scrollToError, scrollToTop, keyboardUp } = useEditorFields(order, { trackKeyboard: true });
  view.current = { scrollToTop, scrollToError };
  // While the box saves, the ways out are held, not asked about.
  useLeaveGuard({ hasChanges: anyDirty, blocked: Boolean(bar?.save.loading) });

  const item = itemRates?.item ?? { id: itemId, name: '' };
  const rows = useMemo(() => itemRates?.rows ?? [], [itemRates]);
  const own = useMemo(() => rows.filter(r => r.customer_id === customerId), [rows, customerId]);
  // The name outlives the rows: cancelling or undoing the customer's last own rate leaves no row to read it from.
  const knownName = useRef(typeof params.customer_name === 'string' ? params.customer_name : '');
  if (own[0]?.customer_name) knownName.current = own[0].customer_name;
  const customerName = knownName.current;
  const ended = useMemo(() => planScope(own, day).ended, [own, day]);

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
              onPress={() => router.push(historyPath({ item_id: itemId, customer_id: customerId, item_name: item.name, ...(customerName ? { customer_name: customerName } : {}) }))}
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
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {refreshError ? (
            <View style={styles.strip}>
              <InlineValidation variant="error" message={t('pricing.list.refreshFailed', { time: lastUpdated ? formatTime(new Date(lastUpdated)) : '' })} />
              <Button type="tertiary" onPress={() => { void refresh(); }}>{t('pricing.list.tryAgain')}</Button>
            </View>
          ) : null}
          {deactivated === true ? (
            <View style={styles.strip}>
              <InlineValidation variant="warning" message={t('pricing.customerTab.deactivated')} />
            </View>
          ) : null}
          {deactivated === null && deactivatedCheckFailed ? (
            <View style={styles.strip} testID="customer-check-failed">
              <InlineValidation variant="error" message={t('pricing.customerTab.checkFailed')} />
              <Button type="tertiary" onPress={retryDeactivated} testID="customer-check-retry">{t('pricing.list.tryAgain')}</Button>
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
            <View style={styles.block}>
              <ScopeRates
                item={item}
                customerId={customerId}
                customerName={customerName}
                rows={rows}
                day={day}
                today={today}
                rights={rights}
                offline={offline}
                role={role}
                fields={fields}
                view={view}
                onOrder={setOrder}
                refreshRows={() => { void refresh(); }}
                onBar={setBar}
                onDirty={setAnyDirty}
              />
            </View>

            {rights.canSeeOldRates ? <OldRatesSection rows={ended} /> : null}

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
    </View>
  );
}
