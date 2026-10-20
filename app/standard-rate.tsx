/**
 * Standard rate (Settings, administrators and supervisors): the monthly rent, labour and tax by
 * weight that every new item gets (backend migration 85). Saving it also gives the tiers to the
 * active items that have no rate yet; items that already have a rate are never changed.
 *
 * The tiers are edited with the rate editor's own weight bands (an "Up to" in whole kilograms, each
 * tier starting where the one before ends), with a labour and tax on every tier. The server checks the
 * same rules again and names the tier and field it refuses.
 */
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
import { layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { fieldOrder, hasChanges, rentErrors, type Draft, type EditorContext } from '@/features/item-pricing/editModel';
import { todayDay } from '@/features/item-pricing/rateText';
import {
  fieldForRefusal,
  standardContext,
  standardDraft,
  tiersOf,
  validateStandard,
} from '@/features/item-pricing/standardRate';
import { useStandardRate, rememberStandardRate, clearStandardRateCache } from '@/features/item-pricing/useStandardRate';
import { BandsEditor } from '@/features/item-pricing/components/BandsEditor';
import { EditorStrip } from '@/features/item-pricing/components/EditorStrip';
import type { FieldNode, FieldRegistry } from '@/features/item-pricing/components/fieldLink';
import { RatesState } from '@/features/item-pricing/components/RatesState';

const ABOVE_KEYBOARD = space.xxl;

interface Form {
  draft: Draft;
  initial: Draft;
  ctx: EditorContext;
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
  const [saving, setSaving] = useState(false);
  const checked = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
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
    setForm({ draft, initial: draft, ctx: standardContext(today) });
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

  const submit = async () => {
    if (!form || saving) return;
    checked.current = true;
    const check = validateStandard(form.draft, form.ctx);
    setErrors(check.errors);
    if (!check.ok) {
      const keys = Object.keys(check.errors);
      AccessibilityInfo.announceForAccessibility(t('pricing.form.fixFields', { count: keys.length }));
      scrollToError(order.find(k => check.errors[k]) ?? keys[0]);
      return;
    }
    setSaving(true);
    setStrip(null);
    try {
      const result = await setStandardRate(tiersOf(form.draft, form.ctx));
      if (result.success) {
        const tiers = result.tiers && result.tiers.length > 0 ? result.tiers : tiersOf(form.draft, form.ctx);
        rememberStandardRate(key, { tiers, updatedAt: new Date().toISOString(), updatedByName: null });
        // The list and the item pages read the rates again when they come back into view.
        void refresh().catch(() => {});
        const priced = result.itemsPriced ?? 0;
        showToast(priced > 0 ? `${t('pricing.standard.saved')} ${t('pricing.standard.itemsGotIt', { count: priced })}` : t('pricing.standard.saved'));
        leaveWithoutAsking(() => router.back());
        return;
      }
      const target = fieldForRefusal(result);
      if (target) {
        setErrors(current => ({ ...current, [target]: result.message ?? '' }));
        scrollToError(target);
        return;
      }
      if (result.outcomeUnknown) clearStandardRateCache();
      setStrip(result.message ?? t('pricing.error.generic'));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  };

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
          {strip ? <EditorStrip variant="critical" message={strip} testID="standard-error" /> : null}
          <Text style={styles.note} testID="standard-note">{t('pricing.standard.note')}</Text>
          <BandsEditor draft={form.draft} ctx={form.ctx} errors={{ ...rentErrors(form.draft), ...errors }} onChange={setDraft} fields={fields} />
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
            disabled={saving || offline}
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
