/**
 * Stop this rate (pricing spec section 8). A route, not a sheet, so the item pages need only its
 * route params. Stopping is "replace the rates from the day after the last day with no bands":
 * one call, and every lot received up to the last day is still billed the rate.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType, ReplaceRatesResult } from '@/types/item-pricing.types';
import { showToast } from '@/utils/toast';
import { notifyRatesChanged, type StopParams } from '@/features/item-pricing/contract';
import { rateAfterCustomerStop, seenRowIds } from '@/features/item-pricing/editModel';
import { laterDialogText, plannedOnDay } from '@/features/item-pricing/laterRates';
import { addDays, dateText, money, todayDay, unitText } from '@/features/item-pricing/rateText';
import { EditorStrip } from '@/features/item-pricing/components/EditorStrip';
import { StopRateForm, type StopChoice } from '@/features/item-pricing/components/StopRateForm';

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; rows: ItemStoragePrice[] };

const RateStopScreen: React.FC = () => {
  const params = useLocalSearchParams() as unknown as StopParams;
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const offline = useIsOffline();
  const priceType: PriceType = params.price_type === 'one_time' ? 'one_time' : 'monthly';
  const customerId = params.customer_id || null;

  const today = todayDay();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<StopChoice>('today');
  const [day, setDay] = useState(today);
  const [strip, setStrip] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [later, setLater] = useState<NonNullable<ReplaceRatesResult['later']> | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded({ state: 'loading' });
    listItemRates(params.item_id).then(
      rows => {
        if (live) setLoaded({ state: 'ready', rows });
      },
      (e: unknown) => {
        if (live) setLoaded({ state: 'error', message: e instanceof Error ? e.message : '' });
      },
    );
    return () => {
      live = false;
    };
  }, [params.item_id, attempt]);

  const submit = useCallback(
    async (replaceLater = false) => {
      if (saving || loaded.state !== 'ready') return;
      const startsOn = addDays(day, 1);
      // A planned rate that starts the day after the last day would be deleted without a question.
      if (!replaceLater) {
        const hidden = plannedOnDay(loaded.rows, { customerId, priceType }, startsOn, today);
        if (hidden.length > 0) {
          setLater(hidden);
          return;
        }
      }
      setSaving(true);
      setStrip(null);
      try {
        const result = await replaceItemRates({
          item_id: params.item_id,
          customer_id: customerId,
          price_type: priceType,
          starts_on: startsOn,
          bands: [],
          seen_rows: seenRowIds(loaded.rows, customerId, priceType),
          ...(replaceLater ? { replace_later: true } : {}),
        });
        if (result.success) {
          setLater(null);
          notifyRatesChanged(params.item_id);
          showToast(t('pricing.stop.done', { date: dateText(day) }));
          router.back();
          return;
        }
        if (result.errorCode === 'LATER_RATES_EXIST' && result.later?.length) {
          setLater(result.later);
          return;
        }
        setLater(null);
        setStrip(result.message ?? t('pricing.error.generic'));
        if (result.errorCode === 'STALE_RATES') setAttempt(n => n + 1);
        if (result.outcomeUnknown) notifyRatesChanged(params.item_id);
      } finally {
        setSaving(false);
      }
    },
    [saving, loaded, today, params.item_id, customerId, priceType, day]
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <HeaderBackButton />
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {t('pricing.stop.title')}
      </Text>
    </View>
  );

  if (loaded.state === 'loading') {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel={t('pricing.edit.loading')} />
        </View>
      </View>
    );
  }
  if (loaded.state === 'error') {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.content}>
          <EditorStrip variant="critical" message={`${t('pricing.edit.loadErrorTitle')}${loaded.message ? `. ${loaded.message}` : ''}`} />
          <Button type="secondary" leftIcon="refresh" onPress={() => setAttempt(n => n + 1)}>
            {t('common.retry')}
          </Button>
        </View>
      </View>
    );
  }

  const itemName = params.item_name || loaded.rows[0]?.item_name || '';
  const customerName = params.customer_name || loaded.rows.find(r => customerId && r.customer_id === customerId)?.customer_name || '';
  let body: string;
  if (customerId) {
    const after = rateAfterCustomerStop(loaded.rows, customerId, priceType, today, addDays(day, 1));
    body = after
      ? t('pricing.stop.customerBody', {
          customer: customerName,
          amount: Math.min(...after) === Math.max(...after) ? money(after[0]) : `${money(Math.min(...after))}–${money(Math.max(...after))}`,
          unit: unitText(priceType),
        })
      : t('pricing.stop.customerBodyNone', { customer: customerName });
  } else {
    body = t('pricing.stop.defaultBody', { item: itemName });
  }
  const first = later?.[0];
  const laterText = later && later.length > 0 ? laterDialogText(later, addDays(day, 1), today) : null;

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.max + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <StopRateForm
          body={body}
          today={today}
          choice={choice}
          day={day}
          onChange={(next, picked) => {
            setChoice(next);
            setDay(picked);
            setStrip(null);
          }}
          strip={strip}
          busy={saving}
          helper={offline ? t('pricing.error.offline') : null}
          onStop={() => void submit()}
          onCancel={() => router.back()}
        />
      </ScrollView>
      <ConfirmDialog
        visible={!!first}
        variant="warning"
        title={laterText?.title ?? ''}
        message={laterText?.message ?? ''}
        confirmText={t('pricing.edit.laterConfirm')}
        cancelText={t('pricing.edit.laterKeep')}
        busy={saving}
        onConfirm={() => void submit(true)}
        onCancel={() => setLater(null)}
      />
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingBottom: space.xs,
    paddingHorizontal: space.sm,
    gap: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerTitle: { ...typography.title2, color: t.text.primary, flexShrink: 1 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  content: {
    padding: layout.marginCompact,
    gap: space.lg,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    alignSelf: 'center' as const,
  },
});

export default RateStopScreen;
