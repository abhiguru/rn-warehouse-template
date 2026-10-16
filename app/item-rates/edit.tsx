/**
 * Rate editor (pricing spec section 7). One screen for Change rate, Add default rate, Add customer
 * rate, Correct rate and Edit new rate, and the landing of the invoice pencil. It loads the item's
 * rates fresh (it writes money), keeps one draft, and saves everything in one call to the
 * server's replace_item_rates, so a failure never leaves the item with no rate or with two.
 *
 * Every date is a goods-received date: a rate that starts on a day is charged to lots received
 * from that day.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
import { listItemRates } from '@/services/item-pricing-service';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import type { EditorParams } from '@/features/item-pricing/contract';
import { lotsRule, summaryLines, type EditorContext } from '@/features/item-pricing/editModel';
import { laterDialogText } from '@/features/item-pricing/laterRates';
import { dateText, todayDay } from '@/features/item-pricing/rateText';
import { BandsEditor } from '@/features/item-pricing/components/BandsEditor';
import { CopyTiersSheet } from '@/features/item-pricing/components/CopyTiersSheet';
import { ChangeSummary } from '@/features/item-pricing/components/ChangeSummary';
import { EditorStrip } from '@/features/item-pricing/components/EditorStrip';
import { fieldLink } from '@/features/item-pricing/components/fieldLink';
import { StartsOnField } from '@/features/item-pricing/components/StartsOnField';
import { RateSaveBar } from '@/features/item-pricing/components/RateSaveBar';
import { useEditorFields } from '@/features/item-pricing/useEditorFields';
import { useRateEditor, type EditorView } from '@/features/item-pricing/useRateEditor';
import { priceTypeLabel } from '@/features/item-pricing/utils/priceLabels';

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; rows: ItemStoragePrice[] };

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
  const offline = useIsOffline();

  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [copyOpen, setCopyOpen] = useState(false);

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
        if (live) setLoaded({ state: 'ready', rows });
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

  // ---- the draft and the save flow ----
  const view = useRef<EditorView | null>(null);
  const editor = useRateEditor({
    item: { id: params.item_id, name: params.item_name },
    customer: params.customer_id ? { id: params.customer_id, name: params.customer_name } : null,
    priceType: params.price_type,
    mode: params.mode ?? 'change',
    params,
    rows: loaded.state === 'ready' ? loaded.rows : null,
    refreshRows: () => setAttempt(n => n + 1),
    role,
    today: todayDay,
    // `leaveWithoutAsking` comes from the guard below, which needs `editor.dirty`.
    onSaved: () => leaveWithoutAsking(() => router.back()),
    view,
  });
  const { draft, ctx: context, errors, strip, saving, later, copiedFrom, setDraft } = editor;

  // ---- leaving with unsaved work (P-01) ----
  const { leaveWithoutAsking } = useLeaveGuard({
    hasChanges: editor.dirty,
    title: context && isAddMode(context.mode) ? t('pricing.edit.discardAdd') : undefined,
  });

  // ---- keyboard: fields scroll above it, Next moves on (P-09) ----
  const { scrollRef, onScroll, fields, barHeight, setBarHeight, scrollToError, scrollToTop } = useEditorFields(editor.order);
  view.current = { scrollToTop, scrollToError };

  // ---- drawing ----
  const header = (title: string) => (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <HeaderBackButton />
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {title}
      </Text>
    </View>
  );

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

  if (loaded.state === 'loading' || !draft || !context) {
    return (
      <View style={styles.container}>
        {header(t(`pricing.edit.title.${titleFor(params.mode)}`))}
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel={t('pricing.edit.loading')} />
        </View>
      </View>
    );
  }

  const current = draft;
  const ctx = context;
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

  const canCopyTiers = !ctx.customerId && !ctx.invoice;
  const copyTiers = (item: { id: string; name: string }, rows: ItemStoragePrice[]) => {
    setCopyOpen(false);
    editor.copyFrom(item, rows);
  };

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
          onScroll={onScroll}
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
                onValueChange={value => editor.switchType(value as PriceType)}
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
            earliest={ctx.earliestStart}
            canStartInPast={ctx.canStartInPast}
            receivedDay={ctx.invoice && ctx.mode === 'addCustomer' ? ctx.invoice.grnDate : null}
            fixed={current.startsOnChoice === 'fixed'}
            error={errors.startsOn}
            onChange={editor.setStartsOn}
          />
          {rule ? <Text style={styles.rule}>{rule}</Text> : null}
          {inThePast && ctx.canStartInPast ? (
            <EditorStrip variant="warning" message={t('pricing.edit.pastDate', { date: dateText(current.startsOn ?? '') })} />
          ) : null}
          {copiedFrom ? (
            <Text style={styles.note} testID="copied-from-item">{t('pricing.edit.copiedFromItem', { item: copiedFrom })}</Text>
          ) : ctx.copied ? (
            <Text style={styles.note}>{t('pricing.edit.copied')}</Text>
          ) : null}
          {current.firstBandZeroed ? <Text style={styles.note}>{t('pricing.edit.firstBandZeroed')}</Text> : null}

          <BandsEditor draft={current} ctx={ctx} errors={errors} onChange={setDraft} fields={fields} />
          {canCopyTiers ? (
            <Button type="tertiary" leftIcon="content-copy" onPress={() => setCopyOpen(true)} disabled={offline} testID="copy-tiers">
              {t('pricing.edit.copyTiers')}
            </Button>
          ) : null}

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

        <RateSaveBar
          helper={helper}
          primary={{
            label: saveLabel,
            onPress: () => void editor.submit(),
            disabled: saving || offline || noStart,
            loading: saving,
            loadingText: t('pricing.edit.saving'),
          }}
          onHeight={setBarHeight}
        />
      </KeyboardAvoidingView>

      {copyOpen ? (
        <CopyTiersSheet
          visible
          onClose={() => setCopyOpen(false)}
          itemId={ctx.itemId}
          priceType={current.priceType}
          today={ctx.today}
          onPick={copyTiers}
        />
      ) : null}

      <ConfirmDialog
        visible={!!first}
        variant="warning"
        title={laterText?.title ?? ''}
        message={laterText?.message ?? ''}
        confirmText={t('pricing.edit.laterConfirm')}
        cancelText={t('pricing.edit.laterKeep')}
        busy={saving}
        onConfirm={() => void editor.submit(true)}
        onCancel={editor.dismissLater}
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
});

export default RateEditorScreen;
