/**
 * Rate editor (pricing spec section 7). One screen for Change rate, Add default rate, Add customer
 * rate, Correct rate and Edit new rate, and the landing of the invoice pencil. It loads the item's
 * rates fresh (it writes money), keeps one draft, and saves everything in one call to the
 * server's replace_item_rates, so a failure never leaves the item with no rate or with two.
 *
 * Every date is a goods-received date: a rate that starts on a day is charged to lots received
 * from that day.
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
  useWindowDimensions,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType, ReplaceRatesResult } from '@/types/item-pricing.types';
import { showToast } from '@/utils/toast';
import { notifyRatesChanged, type EditorMode, type EditorParams } from '@/features/item-pricing/contract';
import {
  hasChanges,
  initialDraft,
  lotsRule,
  resyncToday,
  savedStop,
  switchNewRateType,
  setBandField,
  setStartsOn,
  summaryLines,
  toReplaceInput,
  validate,
  type Draft,
  type EditorContext,
  type StartsOnChoice,
} from '@/features/item-pricing/editModel';
import { rateRights } from '@/features/item-pricing/rateRights';
import { laterDialogText, plannedOnDay } from '@/features/item-pricing/laterRates';
import { dateText, todayDay } from '@/features/item-pricing/rateText';
import { BandsEditor } from '@/features/item-pricing/components/BandsEditor';
import { ChangeSummary } from '@/features/item-pricing/components/ChangeSummary';
import { EditorStrip } from '@/features/item-pricing/components/EditorStrip';
import { fieldLink, type FieldNode, type FieldRegistry } from '@/features/item-pricing/components/fieldLink';
import { StartsOnField } from '@/features/item-pricing/components/StartsOnField';
import { priceTypeLabel } from '@/features/item-pricing/utils/priceLabels';

/** A focused field ends this far above the keyboard (P-09). */
const ABOVE_KEYBOARD = space.xxl;

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; draft: Draft; initial: Draft; context: EditorContext };

const TITLES: Record<EditorContext['mode'], 'change' | 'addDefault' | 'addCustomer' | 'correct' | 'upcoming'> = {
  change: 'change',
  add: 'addDefault',
  addCustomer: 'addCustomer',
  correct: 'correct',
  upcoming: 'upcoming',
};

const isAddMode = (mode: EditorContext['mode']) => mode === 'add' || mode === 'addCustomer';

/** The title while the rates load: the invoice and any unknown mode open as Change rate. */
const titleFor = (mode: string | undefined): (typeof TITLES)[EditorContext['mode']] =>
  mode && Object.prototype.hasOwnProperty.call(TITLES, mode) ? TITLES[mode as EditorContext['mode']] : 'change';

const RateEditorScreen: React.FC = () => {
  const params = useLocalSearchParams() as unknown as EditorParams;
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const { role } = useRoleBasedAccess();
  const rights = rateRights(role);
  const offline = useIsOffline();

  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [strip, setStrip] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [later, setLater] = useState<NonNullable<ReplaceRatesResult['later']> | null>(null);
  const checked = useRef(false);
  // The sticky Save bar's measured height: the form scrolls clear of it, a field never ends under it.
  const [barHeight, setBarHeight] = useState(0);
  const barHeightRef = useRef(0);
  const windowHeight = useWindowDimensions().height;
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;

  // ---- load the item's rates, fresh ----
  useEffect(() => {
    let live = true;
    setLoaded({ state: 'loading' });
    if (!params.item_id) {
      setLoaded({ state: 'error', message: t('pricing.edit.notFound') });
      return;
    }
    listItemRates(params.item_id).then(
      rows => {
        if (!live) return;
        const opened = initialDraft({ mode: params.mode ?? 'change', params, rows, role, today: todayDay() });
        setLoaded({ state: 'ready', draft: opened.draft, initial: opened.draft, context: opened.context });
      },
      (e: unknown) => {
        if (live) setLoaded({ state: 'error', message: e instanceof Error ? e.message : '' });
      },
    );
    return () => {
      live = false;
    };
    // The role and params are read once per load; a changed role is handled by the route guard.
  }, [params.item_id, params.mode, attempt]);

  const ready = loaded.state === 'ready' ? loaded : null;
  const draft = ready?.draft;
  const context = ready?.context;

  const setDraft = useCallback((next: Draft) => {
    setLoaded(current => (current.state === 'ready' ? { ...current, draft: next } : current));
    setStrip(null);
    if (checked.current) setErrors(validate(next, context as EditorContext).errors);
  }, [context]);

  // ---- leaving with unsaved work (P-01) ----
  const changed = !!ready && !ready.context.managerOnly && hasChanges(ready.draft, ready.initial);
  const { leaveWithoutAsking } = useLeaveGuard({
    hasChanges: changed,
    title: ready && isAddMode(ready.context.mode) ? t('pricing.edit.discardAdd') : undefined,
  });

  // ---- keyboard: fields scroll above it, Next moves on (P-09) ----
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const focusedKey = useRef<string | null>(null);
  const nodes = useRef<Record<string, FieldNode | null>>({});

  const ensureVisible = useCallback((key: string) => {
    const node = nodes.current[key];
    if (!node) return;
    node.measureInWindow((_x, y, _w, h) => {
      // The Save bar sits on the keyboard's top edge, or on the window's bottom edge with no keyboard.
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
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ensureVisible]);

  const order = useMemo(() => (draft ? fieldOrder(draft, ready?.context.customerId ?? null) : []), [draft, ready]);

  const fields: FieldRegistry = useMemo(
    () => ({
      register: (key, node) => {
        nodes.current[key] = node;
      },
      onFocus: key => {
        focusedKey.current = key;
        ensureVisible(key);
      },
      next: key => {
        const following = order[order.indexOf(key) + 1];
        const node = following ? nodes.current[following] : null;
        if (node) node.focus();
        else Keyboard.dismiss();
      },
    }),
    [order, ensureVisible]
  );

  // ---- save ----
  const finish = useCallback(
    (data: Draft, ctx: EditorContext, keptEndDay?: string | null) => {
      notifyRatesChanged(ctx.itemId);
      const message =
        ctx.mode === 'correct'
          ? t('pricing.edit.savedCorrection')
          : ctx.mode === 'addCustomer'
            ? t('pricing.edit.savedCustomer')
            : t('pricing.edit.saved', { date: dateText(data.startsOn ?? '') });
      // A scheduled stop is kept by the server: say so (its answer first, else what the draft knew).
      const stop = savedStop(keptEndDay, data, ctx);
      showToast(stop ? `${message} ${t('pricing.edit.stillStops', { date: dateText(stop) })}` : message);
      leaveWithoutAsking(() => router.back());
    },
    [leaveWithoutAsking]
  );

  const fieldForServer = (result: ReplaceRatesResult, data: Draft): string => {
    const i = result.bandIndex ?? 0;
    const perBand = data.bands.some(b => b.labour !== undefined);
    if (result.field === 'unit_price') return `band.${i}.rent`;
    if (result.field === 'labour_rate') return perBand ? `band.${i}.labour` : 'labour';
    if (result.field === 'tax_percent') return perBand ? `band.${i}.tax` : 'tax';
    return `band.${i}.upTo`;
  };

  const scrollToError = (key: string) => {
    const node = nodes.current[key];
    if (!node) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    node.measureInWindow((_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - 160), animated: true }));
  };

  const submit = async (replaceLater = false) => {
    if (!ready || saving) return;
    const { draft: data, context: ctx } = ready;
    // Left open past midnight (India): the day chips move to the new day and the person looks again.
    const moved = resyncToday(data, ctx, todayDay());
    if (moved) {
      const initial = resyncToday(ready.initial, ctx, todayDay())?.draft ?? ready.initial;
      setLoaded({ state: 'ready', draft: moved.draft, initial, context: moved.ctx });
      setStrip(t('pricing.edit.dayChanged'));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    checked.current = true;
    const check = validate(data, ctx);
    setErrors(check.errors);
    if (!check.ok) {
      const keys = Object.keys(check.errors);
      AccessibilityInfo.announceForAccessibility(t('pricing.form.fixFields', { count: keys.length }));
      scrollToError(['startsOn', ...order].find(k => check.errors[k]) ?? keys[0]);
      return;
    }
    // A planned rate that starts on the first day is deleted by the server without a question: ask here.
    if (!replaceLater && ctx.mode !== 'correct' && data.startsOn) {
      const hidden = plannedOnDay(ctx.rows, { customerId: ctx.customerId, priceType: data.priceType }, data.startsOn, ctx.today, ctx.editingIds);
      if (hidden.length > 0) {
        setLater(hidden);
        return;
      }
    }
    setSaving(true);
    setStrip(null);
    try {
      const result = await replaceItemRates({ ...toReplaceInput(data, ctx), ...(replaceLater ? { replace_later: true } : {}) });
      if (result.success) {
        setLater(null);
        finish(data, ctx, result.keptEnd);
        return;
      }
      if (result.errorCode === 'LATER_RATES_EXIST' && result.later?.length) {
        setLater(result.later);
        return;
      }
      setLater(null);
      if (result.errorCode === 'STALE_RATES') {
        // Someone changed the rates meanwhile: load them again and say so.
        setStrip(result.message ?? t('pricing.error.generic'));
        setAttempt(n => n + 1);
        return;
      }
      if (result.outcomeUnknown) {
        // The change may be saved: the pages behind read the item again.
        notifyRatesChanged(ctx.itemId);
      }
      if (result.errorCode === 'PAST_DATE_NOT_ALLOWED' && ctx.mode === 'upcoming' && !ctx.canStartInPast) {
        setStrip(t('pricing.edit.err.moveAfterToday'));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      if ((result.errorCode === 'INVALID_BAND' || result.errorCode === 'INVALID_AMOUNT') && result.bandIndex !== undefined) {
        const key = fieldForServer(result, data);
        setErrors(current => ({ ...current, [key]: result.message ?? '' }));
        scrollToError(key);
        return;
      }
      setStrip(result.message ?? t('pricing.error.generic'));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  };

  // ---- drawing ----
  const header = (title: string) => (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <HeaderBackButton />
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {title}
      </Text>
    </View>
  );

  if (loaded.state === 'loading') {
    return (
      <View style={styles.container}>
        {header(t(`pricing.edit.title.${titleFor(params.mode)}`))}
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel={t('pricing.edit.loading')} />
        </View>
      </View>
    );
  }

  if (loaded.state === 'error') {
    return (
      <View style={styles.container}>
        {header(t('pricing.edit.title.change'))}
        <View style={styles.body}>
          <EditorStrip variant="critical" message={`${t('pricing.edit.loadErrorTitle')}${loaded.message ? `. ${loaded.message}` : ''}`} />
          <Button type="secondary" leftIcon="refresh" onPress={() => setAttempt(n => n + 1)}>
            {t('common.retry')}
          </Button>
        </View>
      </View>
    );
  }

  const { draft: current, context: ctx } = loaded;
  const title = t(`pricing.edit.title.${TITLES[ctx.mode]}`);

  if (ctx.mode === 'addCustomer' && !ctx.customerId) {
    return (
      <View style={styles.container}>
        {header(title)}
        <View style={styles.body}>
          <EditorStrip variant="critical" message={t('pricing.edit.customerNeeded')} />
        </View>
      </View>
    );
  }

  if (ctx.plannedGone) {
    return (
      <View style={styles.container}>
        {header(title)}
        <View style={styles.body}>
          <EditorStrip variant="critical" message={t('pricing.error.notARateStart')} />
          <Button type="secondary" onPress={() => router.back()}>
            {t('common.back')}
          </Button>
        </View>
      </View>
    );
  }

  if (ctx.managerOnly) {
    return (
      <View style={styles.container}>
        {header(title)}
        <View style={styles.body}>
          <EditorStrip variant="critical" message={t('pricing.edit.managerOnly')} />
          <Button type="secondary" onPress={() => router.back()}>
            {t('common.back')}
          </Button>
        </View>
      </View>
    );
  }

  const oneTime = current.priceType === 'one_time';
  const perBand = current.bands.some(b => b.labour !== undefined);
  const lines = summaryLines(current, ctx);
  const rule = lotsRule(current, ctx);
  const inThePast = !!current.startsOn && current.startsOn < ctx.today && ctx.mode !== 'correct';
  const saveLabel =
    ctx.mode === 'correct' ? t('pricing.edit.saveCorrection') : ctx.mode === 'addCustomer' ? t('pricing.edit.saveCustomer') : t('pricing.edit.save');
  const noStart = !current.startsOn;
  const forText = ctx.customerId ? ctx.customerName ?? '' : t('pricing.edit.forDefault');
  const helper = offline ? t('pricing.error.offline') : noStart ? t('pricing.edit.chooseDate') : null;
  const first = later?.[0];
  const laterText = later && later.length > 0 && current.startsOn ? laterDialogText(later, current.startsOn, ctx.today) : null;

  const switchType = (value: PriceType) => {
    const next = switchNewRateType(current, ctx, value);
    setLoaded(cur => (cur.state === 'ready' ? { ...cur, draft: next.draft, context: { ...cur.context, copied: next.copied } } : cur));
    setStrip(null);
    if (checked.current) setErrors(validate(next.draft, ctx).errors);
  };

  const onStartsOn = (choice: StartsOnChoice, day: string) => setDraft(setStartsOn(current, choice, day));

  return (
    <View style={styles.container}>
      {header(title)}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: Math.max(space.max, barHeight + space.lg) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          {strip ? <EditorStrip variant="critical" message={strip} testID="editor-error" /> : null}
          {ctx.invoice ? (
            <EditorStrip
              variant="info"
              message={t('pricing.edit.invoiceNote', {
                customer: ctx.invoice.customerName ?? '',
                date: dateText(current.startsOnChoice === 'fixed' || !current.startsOn ? ctx.invoice.grnDate : current.startsOn),
              })}
            />
          ) : null}
          {ctx.invoice?.mixedDays ? (
            <EditorStrip variant="info" message={t('pricing.edit.invoiceMixedDays', { date: dateText(ctx.invoice.grnDate) })} />
          ) : null}
          {ctx.invoice?.staff ? <EditorStrip variant="info" message={t('pricing.edit.invoiceStaff')} /> : null}
          {ctx.invoice?.staff && current.startsOn && current.startsOn >= ctx.today ? (
            <EditorStrip variant="info" message={t('pricing.edit.invoiceStaffLater', { date: dateText(current.startsOn) })} />
          ) : null}
          {ctx.mode === 'correct' ? (
            <EditorStrip variant="critical" message={t('pricing.edit.correctWarning', { date: dateText(current.startsOn ?? '') })} />
          ) : null}

          <View style={styles.card}>
            <KeyValueCell keyLabel={t('pricing.edit.item')} value={ctx.itemName} layout="stacked" />
            <KeyValueCell keyLabel={t('pricing.edit.for')} value={forText} layout="stacked" />
            {ctx.priceTypeChoosable ? (
              <SegmentedControl
                label={t('pricing.edit.type')}
                stacked
                value={current.priceType}
                onValueChange={value => switchType(value as PriceType)}
                options={[
                  { value: 'monthly', label: priceTypeLabel('monthly') },
                  { value: 'one_time', label: priceTypeLabel('one_time') },
                ]}
              />
            ) : (
              <KeyValueCell keyLabel={t('pricing.edit.type')} value={priceTypeLabel(current.priceType)} layout="stacked" />
            )}
          </View>

          <StartsOnField
            choice={current.startsOnChoice}
            day={current.startsOn}
            today={ctx.today}
            canStartInPast={ctx.canStartInPast}
            receivedDay={ctx.invoice && ctx.mode === 'addCustomer' ? ctx.invoice.grnDate : null}
            fixed={current.startsOnChoice === 'fixed'}
            error={errors.startsOn}
            onChange={onStartsOn}
          />
          {rule ? <Text style={styles.rule}>{rule}</Text> : null}
          {inThePast && ctx.canStartInPast ? (
            <EditorStrip variant="warning" message={t('pricing.edit.pastDate', { date: dateText(current.startsOn ?? '') })} />
          ) : null}
          {ctx.copied ? <Text style={styles.note}>{t('pricing.edit.copied')}</Text> : null}
          {current.firstBandZeroed ? <Text style={styles.note}>{t('pricing.edit.firstBandZeroed')}</Text> : null}

          <BandsEditor draft={current} ctx={ctx} errors={errors} onChange={setDraft} fields={fields} />

          {oneTime ? (
            <Text style={styles.note}>{t('pricing.edit.oneTimeLabour')}</Text>
          ) : perBand ? null : (
            <Input
              label={t('pricing.edit.labour')}
              required
              numeric
              selectTextOnFocus
              value={current.labour}
              onChangeText={text => setDraft({ ...current, labour: text })}
              keyboardType="decimal-pad"
              returnKeyType="next"
              error={errors.labour}
              leftIcon={<Text style={styles.affix}>₹</Text>}
              {...fieldLink(fields, 'labour')}
            />
          )}
          {perBand ? null : (
            <Input
              label={t('pricing.edit.tax')}
              required
              numeric
              selectTextOnFocus
              value={current.tax}
              onChangeText={text => setDraft({ ...current, tax: text })}
              keyboardType="decimal-pad"
              returnKeyType="done"
              error={errors.tax}
              rightIcon={<Text style={styles.affix}>%</Text>}
              {...fieldLink(fields, 'tax')}
            />
          )}

          <ChangeSummary lines={lines} />
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
            disabled={saving || offline || noStart}
            loading={saving}
            loadingText={t('pricing.edit.saving')}
          >
            {saveLabel}
          </Button>
        </View>
      </KeyboardAvoidingView>

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
  flex: { flex: 1 },
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
  body: {
    padding: layout.marginCompact,
    gap: space.lg,
    paddingBottom: space.max,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    alignSelf: 'center' as const,
  },
  card: { padding: space.lg, borderRadius: 12, backgroundColor: t.surface.card, gap: space.xs, ...t.shadow[1] },
  rule: { ...typography.subhead, color: t.text.secondary },
  note: { ...typography.footnote, color: t.text.secondary },
  affix: { ...typography.body, color: t.text.secondary },
  helper: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
  saveBar: {
    paddingTop: space.md,
    paddingHorizontal: layout.marginCompact,
    gap: space.xs,
    minHeight: touchTarget,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
});

export default RateEditorScreen;
