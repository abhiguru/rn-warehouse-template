/**
 * Standard rate (Settings, administrators and supervisors): the monthly rent, labour and tax by
 * weight that every new item gets (backend migration 85). Saving it also gives the tiers to the
 * active items that have no rate yet; items that already have a rate are never changed.
 *
 * The tiers are edited with the rate editor's own weight bands (an "Up to" in whole kilograms, each
 * tier starting where the one before ends), with a labour and tax on every tier. The server checks the
 * same rules again and names the tier and field it refuses.
 */
import { markItemRatesStale } from '@/features/item-pricing/useItemRates';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { setStandardRate } from '@/services/item-pricing-service';
import type { SetStandardRateResult, StandardTier } from '@/types/item-pricing.types';
import { layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { askAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { fieldOrder, hasChanges, rentErrors, wholeKg, type Draft, type EditorContext } from '@/features/item-pricing/editModel';
import { todayDay } from '@/features/item-pricing/rateText';
import {
  fieldForRefusal,
  standardContext,
  standardDraft,
  tierFigures,
  tiersDiffer,
  tiersOf,
  validateStandard,
} from '@/features/item-pricing/standardRate';
import { useStandardRate, rememberStandardRate, clearStandardRateCache } from '@/features/item-pricing/useStandardRate';
import { BandsEditor } from '@/features/item-pricing/components/BandsEditor';
import { EditorStrip } from '@/features/item-pricing/components/EditorStrip';
import type { FieldNode, FieldRegistry } from '@/features/item-pricing/components/fieldLink';
import { RateStrip } from '@/features/item-pricing/components/RateStrip';
import { RatesState } from '@/features/item-pricing/components/RatesState';
import type { ScrollViewRef } from '@/types/nativeRefs';

const ABOVE_KEYBOARD = space.xxl;

interface Form {
  draft: Draft;
  initial: Draft;
  ctx: EditorContext;
  /**
   * The version of the standard rate this draft was built from, the exact `updated_at` string the server sent
   * ('-infinity' when no tiers were loaded, null when the server sent none for saved tiers). Sent with Save so
   * the server refuses when someone else saved meanwhile. Not changed by a background refresh.
   */
  version: string | null;
  /** The tiers the draft was built from (the old figures the change question names). */
  saved: StandardTier[];
}

export default function StandardRateScreen() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const { rate, status, refresh, key, serverNeedsUpdate } = useStandardRate();
  const { height: windowHeight } = useWindowDimensions();

  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [strip, setStrip] = useState<string | null>(null);
  // Someone else saved the standard rate after this draft was built: Reload reads it again and drops the typing.
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  // The save was sent and no answer came: nothing may be saved again until the screen has read the standard rate anew.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const savingRef = useRef(false);
  // False once the screen is gone: a dry run or a question that finishes later must not save or ask over the previous screen.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const checked = useRef(false);
  const scrollRef = useRef<ScrollViewRef>(null);
  const nodes = useRef<Record<string, FieldNode | null>>({});
  const [barHeight, setBarHeight] = useState(0);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const focusedKey = useRef<string | null>(null);
  const barHeightRef = useRef(0);
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;

  // The screen always reads the standard rate again when it opens: a copy cached by an item page or
  // Add item may be older than what another phone saved, and Save sends every tier on the screen.
  const [fresh, setFresh] = useState<'loading' | 'ok' | 'error'>('loading');
  const readFresh = useCallback(() => {
    setFresh('loading');
    refresh().then(() => setFresh('ok'), () => setFresh('error'));
  }, [refresh]);
  useEffect(() => {
    readFresh();
    // Once per mount and facility.
  }, [key]);

  // The form is made once, from the standard rate as freshly read; a later refresh does not overwrite typing.
  useEffect(() => {
    if (!rate || form || fresh !== 'ok') return;
    const today = todayDay();
    const draft = standardDraft(rate.tiers, today);
    setForm({ draft, initial: draft, ctx: standardContext(today), version: rate.updatedAt ?? (rate.tiers.length === 0 ? '-infinity' : null), saved: rate.tiers });
  }, [rate, form, fresh]);

  const changed = !!form && hasChanges(form.draft, form.initial);
  const { leaveWithoutAsking } = useLeaveGuard({ hasChanges: changed });

  const setDraft = useCallback((next: Draft) => {
    setForm(current => (current ? { ...current, draft: next } : current));
    setStrip(null);
    if (checked.current && form) setErrors(validateStandard(next, form.ctx).errors);
  }, [form]);

  // Keyboard: a focused field scrolls above the Save bar, as in the rate editor.
  const ensureVisible = useCallback((fieldKey: string) => {
    const node = nodes.current[fieldKey];
    if (!node) return;
    node.measureInWindow((_x, y, _w, h) => {
      const barTop = (keyboardTop.current ?? windowHeightRef.current) - barHeightRef.current;
      const hidden = y + h + ABOVE_KEYBOARD - barTop;
      if (hidden > 0) scrollRef.current?.scrollTo({ y: scrollY.current + hidden, animated: true });
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      if (focusedKey.current) ensureVisible(focusedKey.current);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardTop.current = null; });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ensureVisible]);

  const order = useMemo(() => (form ? fieldOrder(form.draft, null) : []), [form]);
  const fields: FieldRegistry = useMemo(
    () => ({
      register: (fieldKey, node) => { nodes.current[fieldKey] = node; },
      onFocus: fieldKey => {
        focusedKey.current = fieldKey;
        ensureVisible(fieldKey);
      },
      next: fieldKey => {
        const following = nodes.current[order[order.indexOf(fieldKey) + 1]];
        if (following) following.focus();
        else Keyboard.dismiss();
      },
    }),
    [order, ensureVisible],
  );

  const scrollToError = (fieldKey: string) => {
    const node = nodes.current[fieldKey];
    if (!node) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    node.measureInWindow((_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - 160), animated: true }));
  };

  const reload = () => {
    setForm(null);
    setErrors({});
    setStrip(null);
    setStale(false);
    setUnconfirmed(false);
    checked.current = false;
    readFresh();
  };

  const submit = async () => {
    if (!form || saving || savingRef.current || unconfirmed) return;
    checked.current = true;
    const check = validateStandard(form.draft, form.ctx);
    setErrors(check.errors);
    if (!check.ok) {
      const keys = Object.keys(check.errors);
      AccessibilityInfo.announceForAccessibility(t('pricing.form.fixFields', { count: keys.length }));
      scrollToError(order.find(k => check.errors[k]) ?? keys[0]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStrip(null);
    setStale(false);
    try {
      const tiersToSend = tiersOf(form.draft, form.ctx);
      // First a dry run: it checks everything, writes nothing and counts the items that would be given this rate.
      const dry = await setStandardRate(tiersToSend, { expectedUpdatedAt: form.version, dryRun: true });
      if (!alive.current) return;
      if (!dry.success) {
        showRefusal(dry);
        return;
      }
      // A standard rate already saved is never replaced without asking: the old and the new figures are named.
      const saved = form.saved;
      if (saved.length > 0 && tiersDiffer(saved, tiersToSend)) {
        const change = await askAlert(
          t('pricing.standard.changeTitle'),
          t('pricing.standard.changeMessage', { old: tierFigures(saved), new: tierFigures(tiersToSend) }),
          [
            { text: t('common.back'), style: 'cancel', value: false },
            { text: t('pricing.standard.changeConfirm'), value: true },
          ],
          false,
        );
        if (!change || !alive.current) return;
      }
      if ((dry.itemsPriced ?? 0) > 0) {
        const go = await askAlert(
          t('pricing.standard.giveTitle', { count: dry.itemsPriced ?? 0 }),
          t('pricing.standard.giveMessage'),
          [
            { text: t('common.back'), style: 'cancel', value: false },
            { text: t('pricing.standard.giveConfirm'), value: true },
          ],
          false,
        );
        if (!go || !alive.current) return;
      }
      const result = await setStandardRate(tiersToSend, { expectedUpdatedAt: form.version });
      if (result.success) {
        const tiers = result.tiers && result.tiers.length > 0 ? result.tiers : tiersToSend;
        // The version is the server's own string (never a Date made here).
        rememberStandardRate(key, { tiers, updatedAt: result.updatedAt ?? null, updatedByName: null });
        // The Items list and the customer Pricing tabs read every rate again the next time they open (items got a rate).
        markItemRatesStale();
        void refresh().catch(() => {});
        const priced = result.itemsPriced ?? 0;
        showToast(priced > 0 ? `${t('pricing.standard.saved')} ${t('pricing.standard.itemsGotIt', { count: priced })}` : t('pricing.standard.saved'));
        if (alive.current) leaveWithoutAsking(() => router.back());
        return;
      }
      if (alive.current) showRefusal(result);
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  };

  /** A refused save or dry run: the field the server named, the stale question, or a strip at the top. */
  function showRefusal(result: SetStandardRateResult) {
    if (result.errorCode === 'STALE_STANDARD_RATE') {
      setStale(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const target = fieldForRefusal(result);
    if (target) {
      setErrors(current => ({ ...current, [target]: result.message ?? '' }));
      scrollToError(target);
      return;
    }
    if (result.outcomeUnknown) {
      clearStandardRateCache();
      setUnconfirmed(true);
    }
    setStrip(result.message ?? t('pricing.error.generic'));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <HeaderBackButton />
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {t('pricing.standard.title')}
      </Text>
    </View>
  );

  if (!form) {
    return (
      <View style={styles.container}>
        {header}
        {fresh === 'error' || status === 'error' ? (
          <RatesState
            icon="alert-circle-outline"
            title={t('pricing.standard.loadErrorTitle')}
            text={serverNeedsUpdate ? t('pricing.standard.error.serverNeedsUpdate') : t('pricing.list.loadErrorText')}
            actionLabel={t('pricing.list.tryAgain')}
            onAction={readFresh}
            testID="standard-load-error"
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator accessibilityLabel={t('pricing.standard.loading')} />
          </View>
        )}
      </View>
    );
  }

  const helper = offline ? t('pricing.error.offline') : null;
  // Under the last tier: what lies above it (a bag heavier than the last "Up to" gets no standard rate).
  const lastUpTo = wholeKg(form.draft.bands[form.draft.bands.length - 1]?.upTo ?? '');

  return (
    <View style={styles.container}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: Math.max(space.max, barHeight + space.lg) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          {stale ? (
            <RateStrip
              variant="critical"
              message={t('pricing.standard.error.stale')}
              actions={[{ label: t('pricing.standard.reload'), onPress: reload, disabled: saving, testID: 'standard-reload' }]}
              testID="standard-stale"
            />
          ) : null}
          {unconfirmed ? (
            <RateStrip
              variant="critical"
              message={t('pricing.standard.error.unconfirmed')}
              actions={[{ label: t('pricing.standard.reload'), onPress: reload, disabled: saving, testID: 'standard-reload-unconfirmed' }]}
              testID="standard-unconfirmed"
            />
          ) : strip ? <EditorStrip variant="critical" message={strip} testID="standard-error" /> : null}
          <Text style={styles.note} testID="standard-note">{t('pricing.standard.note')}</Text>
          <BandsEditor draft={form.draft} ctx={form.ctx} errors={{ ...rentErrors(form.draft), ...errors }} onChange={setDraft} fields={fields} />
          {lastUpTo !== null ? <Text style={styles.note} testID="standard-last-tier-hint">{t('pricing.standard.lastTierHint', { kg: lastUpTo })}</Text> : null}
        </ScrollView>

        <View
          style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, space.md) }]}
          testID="save-bar"
          onLayout={(e: LayoutChangeEvent) => {
            barHeightRef.current = e.nativeEvent.layout.height;
            setBarHeight(e.nativeEvent.layout.height);
          }}
        >
          {helper ? <Text style={styles.helper}>{helper}</Text> : null}
          <Button
            type="primary"
            size="fullWidth"
            onPress={() => void submit()}
            disabled={saving || offline || unconfirmed}
            loading={saving}
            loadingText={t('pricing.edit.saving')}
            testID="standard-save"
          >
            {t('pricing.standard.save')}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (th: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: th.background.base },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingBottom: space.xs,
    paddingHorizontal: space.sm,
    gap: space.xs,
    backgroundColor: th.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border.divider,
  },
  headerTitle: { ...typography.title2, color: th.text.primary, flexShrink: 1 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: {
    padding: layout.marginCompact,
    gap: space.lg,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    alignSelf: 'center' as const,
  },
  note: { ...typography.subhead, color: th.text.secondary },
  helper: { ...typography.footnote, color: th.text.secondary, textAlign: 'center' as const },
  saveBar: {
    paddingTop: space.md,
    paddingHorizontal: layout.marginCompact,
    gap: space.xs,
    minHeight: touchTarget,
    backgroundColor: th.surface.card,
    ...th.shadow[3],
  },
});
