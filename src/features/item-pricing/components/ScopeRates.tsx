/**
 * One customer's own rates for one item, as the customer-rate page (Customers -> a customer -> Pricing -> an item)
 * shows them: a rate box per price type that is in force, edited in place; under it the strips for a rate that has
 * not begun and one that stops, and the buttons Correct this rate and Stop this rate. Where the customer has no rate
 * yet, the strip that says so and the button that opens the full-screen form. (The item's default rate is on the
 * item page's Pricing tab, ItemPricingTab.)
 *
 * Writable only for a manager looking at today; any other day (or role) gets the read-only RateCard.
 *
 * Only one box is edited at a time: while one is changed the others show their figures and say so (`locked`). The
 * page owns the Save bar and the scroll view, so this component reports to it: `onBar` gets what the Save bar must
 * show (null when nothing is being changed), `onDirty` whether anything is changed (for the leave guard), `onOrder`
 * the keys of the cells in the order the Next key walks them, and the cells register with `fields`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { customerRateAddPath, type EditorMode } from '../contract';
import { router } from 'expo-router';
import { lotsRule, seenRowIds, summaryLines } from '../editModel';
import { laterDialogText } from '../laterRates';
import { applicableRate, type ScopeView } from '../rateModel';
import type { RateRights } from '../rateRights';
import { bandText, dateText, money, rentRange, unitText } from '../rateText';
import { planScope } from '../scopePlan';
import { useRateActions, type RateScope } from '../useRateActions';
import { useRateEditor, type EditorView } from '../useRateEditor';
import { RateCard, inForceText } from './RateCard';
import { RateBox } from './RateBox';
import { RateStrip } from './RateStrip';
import { scopeFields, type FieldRegistry } from './fieldLink';
import type { RateSaveBarState } from './ScopeSaveBar';

export type { RateSaveBarState } from './ScopeSaveBar';

export interface ScopeRatesProps {
  item: { id: string; name: string };
  /** The customer whose own rate this is. */
  customerId: string;
  customerName?: string;
  /** Every row of the item, whichever customer: the customer's are picked here, and the default rate is shown beside them. */
  rows: ItemStoragePrice[];
  /** The day the page looks at, and today. Boxes are drawn only when they are the same day. */
  day: string;
  today: string;
  rights: RateRights;
  offline: boolean;
  role: string | null | undefined;
  /** The page's cell registry (useEditorFields), for the Next key and for scrolling a cell above the keyboard. */
  fields?: FieldRegistry;
  /** The page's scroll view (useEditorFields gives `scrollToTop` and `scrollToError`). */
  view?: React.RefObject<EditorView | null>;
  /** The keys of the cells in Next-key order, for `useEditorFields(order)`. */
  onOrder?: (order: string[]) => void;
  /** Read the rows again (the server said they changed meanwhile). */
  refreshRows: () => void;
  /** What the page's Save bar shows, or null when no box is being changed. Draw it with ScopeSaveBar. */
  onBar: (bar: RateSaveBarState | null) => void;
  /** Something in a box is changed and not saved. */
  onDirty: (dirty: boolean) => void;
}

// ---------------------------------------------------------------------------------------------
// One box
// ---------------------------------------------------------------------------------------------

/** What a box tells its scope. */
interface BoxReport {
  active: boolean;
  dirty: boolean;
  order: string[];
  bar: RateSaveBarState | null;
}

interface Shared {
  item: { id: string; name: string };
  customerId: string;
  customerName?: string;
  rows: ItemStoragePrice[];
  role: string | null | undefined;
  today: () => string;
  offline: boolean;
  rights: RateRights;
  fields?: FieldRegistry;
  view?: React.RefObject<EditorView | null>;
  refreshRows: () => void;
}

interface BoxProps {
  /** 'monthly', 'one_time' or 'add': the prefix of its cells' keys and the key of its report. */
  id: string;
  mode: EditorMode;
  priceType?: PriceType;
  startsOn?: string;
  /** Since when the rate in the box is in force. */
  caption?: string;
  locked: boolean;
  shared: Shared;
  report: (id: string, report: BoxReport | null) => void;
  onSaved: () => void;
  /** Leave a correction, an edit of a planned rate or a new rate: back to the rate in force. */
  onClose: () => void;
  /** Throw away what was typed and show the saved figures again. */
  onDiscard: () => void;
}

const makeStyles = (th: ThemeTokens) => ({
  scope: { gap: space.lg },
  plan: { gap: space.sm },
  strip: { marginHorizontal: layout.marginCompact, gap: space.xs },
  actions: { marginHorizontal: layout.marginCompact, flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: space.sm },
  note: { ...typography.footnote, color: th.text.secondary, marginHorizontal: layout.marginCompact },
  compare: { ...typography.subhead, color: th.text.secondary, marginHorizontal: layout.marginCompact },
  add: { alignSelf: 'flex-start' as const, marginHorizontal: layout.marginCompact },
});

function ScopeBox({ id, mode, priceType, startsOn, caption, locked, shared, report, onSaved, onClose, onDiscard }: BoxProps) {
  const styles = useThemedStyles(makeStyles);
  const adding = mode === 'add' || mode === 'addCustomer';
  const [saved, setSaved] = useState(false);
  // "Discard this rate?" (house rule, style guide §14.4): typed figures are not thrown away by one tap.
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);

  const viewRef = useRef<EditorView | null>(null);
  viewRef.current = {
    scrollToTop: () => shared.view?.current?.scrollToTop(),
    scrollToError: key => shared.view?.current?.scrollToError(`${id}:${key}`),
  };

  const editor = useRateEditor({
    item: shared.item,
    customer: { id: shared.customerId, name: shared.customerName },
    priceType,
    mode,
    params: startsOn ? { starts_on: startsOn } : {},
    rows: shared.rows,
    refreshRows: shared.refreshRows,
    role: shared.role,
    today: shared.today,
    onSaved: () => {
      // The figures stay as typed until the rows come back from the server; no Save bar meanwhile.
      setSaved(true);
      onSaved();
    },
    view: viewRef,
  });
  const boxEditor = { ...editor, setDraft: (next: Parameters<typeof editor.setDraft>[0]) => { setSaved(false); editor.setDraft(next); } };

  const { draft, ctx, errors, saving, later } = editor;
  const dirty = editor.ready && editor.dirty && !saved;
  const active = editor.ready && !saved && (dirty || adding);

  // Functions the Save bar keeps between reports: they read the latest editor.
  const latest = useRef({ editor, onClose, onDiscard, special: adding || mode !== 'change', saved });
  latest.current = { editor, onClose, onDiscard, special: adding || mode !== 'change', saved };
  const stable = useRef({
    onChange: (choice: Parameters<typeof editor.setStartsOn>[0], day: string) => latest.current.editor.setStartsOn(choice, day),
    save: () => { void latest.current.editor.submit(); },
    discard: () => {
      const go = () => (latest.current.special ? latest.current.onClose() : latest.current.onDiscard());
      if (latest.current.editor.dirty && !latest.current.saved) setPendingDiscard(() => go);
      else go();
    },
  }).current;
  /** The Discard buttons of the box: ask first when figures were typed. */
  const askToDiscard = (go: () => void) => () => {
    if (dirty) setPendingDiscard(() => go);
    else go();
  };

  let bar: RateSaveBarState | null = null;
  if (active && draft && ctx) {
    const inThePast = !!draft.startsOn && draft.startsOn < ctx.today && ctx.mode !== 'correct';
    bar = {
      startsOn: {
        choice: draft.startsOnChoice,
        day: draft.startsOn,
        today: ctx.today,
        earliest: ctx.earliestStart,
        canStartInPast: ctx.canStartInPast,
        fixed: draft.startsOnChoice === 'fixed',
        error: errors.startsOn,
        onChange: stable.onChange,
      },
      rule: lotsRule(draft, ctx),
      warning: inThePast && ctx.canStartInPast ? t('pricing.edit.pastDate', { date: dateText(draft.startsOn ?? '') }) : null,
      summaryLines: summaryLines(draft, ctx),
      helper: shared.offline ? t('pricing.error.offline') : !draft.startsOn ? t('pricing.edit.chooseDate') : null,
      saveLabel: ctx.mode === 'correct' ? t('pricing.edit.saveCorrection') : ctx.mode === 'addCustomer' ? t('pricing.edit.saveCustomer') : t('pricing.edit.save'),
      save: { onPress: stable.save, disabled: saving || shared.offline || !draft.startsOn, loading: saving },
      discard: { onPress: stable.discard },
    };
  }
  const order = useMemo(() => editor.order.map(key => `${id}:${key}`), [editor.order, id]);
  // The scope hears of a change only when something it draws changes, not on every render.
  const signature = JSON.stringify([
    active,
    dirty,
    order,
    bar && [bar.startsOn.choice, bar.startsOn.day, bar.startsOn.today, bar.startsOn.earliest, bar.startsOn.canStartInPast, bar.startsOn.fixed, bar.startsOn.error, bar.rule, bar.warning, bar.summaryLines, bar.helper, bar.saveLabel, bar.save.disabled, bar.save.loading],
  ]);
  useEffect(() => {
    report(id, { active, dirty, order, bar });
    // `signature` says everything the report holds.
  }, [signature]);
  useEffect(() => () => report(id, null), [id, report]);

  if (!editor.ready || !draft || !ctx) return null;

  const first = later?.[0];
  const laterText = later && later.length > 0 && draft.startsOn ? laterDialogText(later, draft.startsOn, ctx.today) : null;
  const gone = ctx.plannedGone || ctx.managerOnly;

  return (
    <View style={styles.plan}>
      {gone ? (
        <View style={styles.strip}>
          <RateStrip
            variant="critical"
            message={ctx.managerOnly ? t('pricing.edit.managerOnly') : t('pricing.error.notARateStart')}
            actions={[{ label: t('common.back'), onPress: onClose, testID: 'box-gone-back' }]}
          />
        </View>
      ) : (
        <>
          {mode === 'correct' ? (
            <View style={styles.strip}>
              <RateStrip
                variant="critical"
                message={t('pricing.edit.correctWarning', { date: dateText(draft.startsOn ?? '') })}
                actions={[{ label: t('pricing.box.discard'), onPress: askToDiscard(onClose), testID: 'correct-discard' }]}
                testID="correct-warning"
              />
            </View>
          ) : null}
          {mode === 'upcoming' ? (
            <View style={styles.strip}>
              <RateStrip
                variant="info"
                message={t('pricing.edit.title.upcoming')}
                actions={[{ label: t('pricing.box.discard'), onPress: askToDiscard(onClose), testID: 'upcoming-discard' }]}
                testID="upcoming-mode"
              />
            </View>
          ) : null}
          <RateBox
            editor={boxEditor}
            fields={scopeFields(shared.fields, id)}
            oneTime={priceType === 'one_time'}
            caption={caption}
            locked={locked}
            testID={`rate-box-${id}`}
          />
          {adding ? (
            <Button type="tertiary" style={styles.add} onPress={askToDiscard(onClose)} disabled={saving} testID="box-close">
              {t('pricing.box.discard')}
            </Button>
          ) : null}
        </>
      )}
      <ConfirmDialog
        visible={pendingDiscard !== null}
        variant="danger"
        title={adding ? t('pricing.rateForm.discardTitle') : t('common.discardChangesTitle')}
        message={t('common.discardChangesMessage')}
        confirmText={t('common.discard')}
        cancelText={t('common.keepEditing')}
        onConfirm={() => {
          const go = pendingDiscard;
          setPendingDiscard(null);
          go?.();
        }}
        onCancel={() => setPendingDiscard(null)}
        testID="discard-rate-dialog"
      />
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
}

// ---------------------------------------------------------------------------------------------
// The scope
// ---------------------------------------------------------------------------------------------

/** The same rows again while their content is the same: a read that found nothing new must not reopen a draft being typed. */
function useStableRows(rows: ItemStoragePrice[]): { rows: ItemStoragePrice[]; signature: string } {
  const text = useMemo(() => JSON.stringify(rows), [rows]);
  const kept = useRef({ text, rows });
  if (kept.current.text !== text) kept.current = { text, rows };
  return { rows: kept.current.rows, signature: text };
}

type PlanMode = { mode: 'change' | 'correct' | 'upcoming'; startsOn?: string; nonce: number };
const DEFAULT_MODE: PlanMode = { mode: 'change', nonce: 0 };

export function ScopeRates({
  item,
  customerId,
  customerName,
  rows: allRows,
  day,
  today,
  rights,
  offline,
  role,
  fields,
  view,
  onOrder,
  refreshRows,
  onBar,
  onDirty,
}: ScopeRatesProps) {
  const styles = useThemedStyles(makeStyles);
  const actions = useRateActions(item);
  const { rows, signature } = useStableRows(allRows);
  const scopeRows = useMemo(() => rows.filter(r => (r.customer_id ?? null) === customerId), [rows, customerId]);
  const plan = useMemo(() => planScope(scopeRows, day), [scopeRows, day]);
  const defaultPlan = useMemo(() => planScope(rows.filter(r => r.customer_id === null), day), [rows, day]);
  const writable = rights.canWrite && day === today;

  const [modes, setModes] = useState<Partial<Record<PriceType, PlanMode>>>({});
  const [adding, setAdding] = useState<{ priceType?: PriceType; nonce: number } | null>(null);
  const [reports, setReports] = useState<Record<string, BoxReport>>({});
  // A save is done; the rows that come back close the correction or the new rate that was saved.
  const [savedFlag, setSavedFlag] = useState(false);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    if (savedFlag) {
      setSavedFlag(false);
      setModes({});
      setAdding(null);
    }
  }
  const onSaved = useCallback(() => setSavedFlag(true), []);

  const report = useCallback((id: string, next: BoxReport | null) => {
    setReports(current => {
      if (!next) {
        if (!(id in current)) return current;
        const { [id]: _gone, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: next };
    });
  }, []);

  const ids = Object.keys(reports);
  const activeId = ids.find(id => reports[id].active);
  const anyDirty = ids.some(id => reports[id].dirty);
  const activeBar = activeId ? reports[activeId].bar : null;
  const combinedOrder = useMemo(
    () => ['monthly', 'one_time', 'add'].flatMap(id => reports[id]?.order ?? []),
    [reports],
  );
  const orderKey = combinedOrder.join('|');

  useEffect(() => { onBar(activeBar); }, [activeBar]);
  useEffect(() => { onDirty(anyDirty); }, [anyDirty]);
  useEffect(() => { onOrder?.(combinedOrder); }, [orderKey]);
  useEffect(() => () => { onBar(null); onDirty(false); }, []);

  const todayRef = useRef(today);
  todayRef.current = today;
  const shared: Shared = {
    item,
    customerId,
    customerName,
    rows,
    role,
    today: () => todayRef.current,
    offline,
    rights,
    fields,
    view,
    refreshRows,
  };

  const busy = actions.busy;
  const switching = offline || busy || activeId !== undefined;
  const mode = (priceType: PriceType): PlanMode => modes[priceType] ?? DEFAULT_MODE;
  const setMode = (priceType: PriceType, next: Omit<PlanMode, 'nonce'>) =>
    setModes(current => ({ ...current, [priceType]: { ...next, nonce: (current[priceType]?.nonce ?? 0) + 1 } }));
  const resetMode = (priceType: PriceType) => setMode(priceType, { mode: 'change' });
  const scopeOf = (priceType: PriceType, view: ScopeView): RateScope => ({
    priceType,
    customerId,
    customerName,
    bands: view.inForce,
    upcoming: view.upcoming,
    stopsAfter: view.stopsAfter,
    seenRows: seenRowIds(rows, customerId, priceType),
  });

  const hasMonthly = plan.plans.some(p => p.priceType === 'monthly');
  const hasOneTime = plan.plans.some(p => p.priceType === 'one_time');
  const addMode: EditorMode = 'addCustomer';
  const startAdding = (priceType?: PriceType) => setAdding(current => ({ priceType, nonce: (current?.nonce ?? 0) + 1 }));

  const addBox = adding && writable ? (
    <ScopeBox
      key={`add:${adding.nonce}`}
      id="add"
      mode={addMode}
      priceType={adding.priceType}
      locked={activeId !== undefined && activeId !== 'add'}
      shared={shared}
      report={report}
      onSaved={onSaved}
      onClose={() => setAdding(null)}
      onDiscard={() => startAdding(adding.priceType)}
    />
  ) : null;

  // ---- nothing in force or coming ----
  const noRate = plan.plans.length === 0 ? (
    <View style={styles.strip}>
      <RateStrip variant="warning" message={t('pricing.customerRate.noneNow', { customer: customerName || '—' })} testID="no-own-rate" />
      {writable && !adding ? (
        <Button
          type="primary"
          size="fullWidth"
          disabled={offline}
          // A customer's first rate for the item is added on the full-screen form (owner, 2026-10-17). The button shows on a writable page only, so the customer is not deactivated.
          onPress={() => router.push(customerRateAddPath(item.id, customerId, customerName || undefined, false))}
          testID="add-customer-rate"
        >
          {t('pricing.action.addCustomer')}
        </Button>
      ) : null}
      {offline && writable ? <Text style={styles.note}>{t('pricing.item.offlineChange')}</Text> : null}
    </View>
  ) : null;

  return (
    <View style={styles.scope} testID="scope-rates">
      {noRate}
      {plan.plans.map(({ priceType, view: scopeView }) => {
        const bands = scopeView.inForce;
        const hasRate = bands.length > 0;
        const upcoming = scopeView.upcoming;
        const stopsAfter = scopeView.stopsAfter;
        const defaultBands = defaultPlan.plans.find(p => p.priceType === priceType)?.view.inForce ?? [];

        if (!writable) {
          return (
            <View key={priceType} style={styles.plan}>
              {defaultBands.length > 0 ? (
                <Text style={styles.compare} testID="default-is">
                  {t('pricing.customerRate.defaultIs', {
                    amount: rentRange(Math.min(...defaultBands.map(r => r.unit_price)), Math.max(...defaultBands.map(r => r.unit_price))),
                    unit: unitText(priceType),
                  })}
                </Text>
              ) : null}
              {!hasRate && upcoming ? (
                <View style={styles.strip}>
                  <RateStrip variant="warning" message={t('pricing.item.onlyUpcoming', { date: dateText(upcoming.startsOn) })} />
                </View>
              ) : null}
              <RateCard
                priceType={priceType}
                bands={bands}
                upcoming={upcoming}
                stopsAfter={stopsAfter}
                overlap={Boolean(scopeView.overlap)}
                day={day}
              />
            </View>
          );
        }

        const current = mode(priceType);
        const showBox = hasRate || current.mode === 'upcoming';
        const overlapRate = scopeView.overlap && hasRate
          ? applicableRate(bands, { customer_id: bands[0].customer_id, weight: bands[0].weight_max, price_type: priceType, day })
          : undefined;
        const upcomingAmount = upcoming ? rentRange(Math.min(...upcoming.rows.map(r => r.unit_price)), Math.max(...upcoming.rows.map(r => r.unit_price))) : '';

        return (
          <View key={priceType} style={styles.plan} testID={`scope-plan-${priceType}`}>
            {defaultBands.length > 0 ? (
              <Text style={styles.compare} testID="default-is">
                {t('pricing.customerRate.defaultIs', {
                  amount: rentRange(Math.min(...defaultBands.map(r => r.unit_price)), Math.max(...defaultBands.map(r => r.unit_price))),
                  unit: unitText(priceType),
                })}
              </Text>
            ) : null}
            {!hasRate && upcoming ? (
              <View style={styles.strip}>
                <RateStrip variant="warning" message={t('pricing.item.onlyUpcoming', { date: dateText(upcoming.startsOn) })} />
              </View>
            ) : null}
            {overlapRate ? (
              <View style={styles.strip}>
                <RateStrip
                  variant="critical"
                  message={t('pricing.item.overlap', { band: bandText(overlapRate.weight_min, overlapRate.weight_max), amount: money(overlapRate.unit_price) })}
                />
              </View>
            ) : null}
            {showBox ? (
              <ScopeBox
                key={`${priceType}:${current.mode}:${current.nonce}`}
                id={priceType}
                mode={current.mode}
                priceType={priceType}
                startsOn={current.startsOn}
                caption={hasRate && current.mode !== 'upcoming' ? inForceText(bands) : undefined}
                locked={activeId !== undefined && activeId !== priceType}
                shared={shared}
                report={report}
                onSaved={onSaved}
                onClose={() => resetMode(priceType)}
                onDiscard={() => resetMode(priceType)}
              />
            ) : null}

            {upcoming ? (
              <View style={styles.strip}>
                <RateStrip
                  variant="info"
                  message={t('pricing.item.upcoming', { date: dateText(upcoming.startsOn), amount: upcomingAmount, unit: unitText(priceType) })}
                  actions={[
                    {
                      label: t('pricing.action.editUpcoming'),
                      onPress: () => setMode(priceType, { mode: 'upcoming', startsOn: upcoming.startsOn }),
                      disabled: switching,
                      testID: 'edit-upcoming',
                    },
                    {
                      label: t('pricing.action.cancelUpcoming'),
                      onPress: () => actions.askCancel(scopeOf(priceType, scopeView)),
                      // Not while figures are typed: the rows would be read again under them.
                      disabled: offline || busy || anyDirty,
                      a11yHint: anyDirty ? t('pricing.item.finishTypingFirst') : undefined,
                      negative: true,
                      testID: 'cancel-upcoming',
                    },
                  ]}
                />
              </View>
            ) : null}
            {hasRate && stopsAfter ? (
              <View style={styles.strip}>
                <RateStrip
                  variant="warning"
                  message={t('pricing.item.stops', { date: dateText(stopsAfter) })}
                  actions={[{ label: t('pricing.action.undoStop'), onPress: () => { void actions.undoStop(scopeOf(priceType, scopeView)); }, disabled: offline || busy || anyDirty, a11yHint: anyDirty ? t('pricing.item.finishTypingFirst') : undefined, testID: 'undo-stop' }]}
                />
              </View>
            ) : null}
            {hasRate && current.mode === 'change' ? (
              <View style={styles.actions}>
                {rights.canCorrect ? (
                  <Button
                    type="tertiary"
                    onPress={() => setMode(priceType, { mode: 'correct', startsOn: bands[0]?.effective_from })}
                    disabled={switching}
                    testID="rate-correct"
                  >
                    {t('pricing.action.correct')}
                  </Button>
                ) : null}
                <Button
                  type="tertiary"
                  variant="negative"
                  onPress={() => actions.stop(scopeOf(priceType, scopeView))}
                  disabled={offline || busy || anyDirty}
                  accessibilityHint={anyDirty ? t('pricing.item.finishTypingFirst') : undefined}
                  testID="rate-stop"
                >
                  {t('pricing.action.stop')}
                </Button>
              </View>
            ) : null}
            {offline && hasRate ? <Text style={styles.note}>{t('pricing.item.offlineChange')}</Text> : null}
            {anyDirty && hasRate && (upcoming || stopsAfter || current.mode === 'change') ? (
              <Text style={styles.note} testID="finish-typing-first">{t('pricing.item.finishTypingFirst')}</Text>
            ) : null}
          </View>
        );
      })}

      {addBox}
      {writable && plan.plans.length > 0 && !(hasMonthly && hasOneTime) && !adding ? (
        <Button
          type="tertiary"
          leftIcon="plus"
          style={styles.add}
          disabled={switching}
          onPress={() => startAdding(hasMonthly ? 'one_time' : 'monthly')}
          testID="add-other-type"
        >
          {hasMonthly ? t('pricing.action.addOneTime') : t('pricing.action.addMonthly')}
        </Button>
      ) : null}
      {actions.dialog}
    </View>
  );
}

export default ScopeRates;
