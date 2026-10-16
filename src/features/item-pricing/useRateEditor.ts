/**
 * The state and the save flow of one rate form: opening a draft from the item's rows, the edits, whether
 * anything changed, and the save with every answer of replace_item_rates mapped to what the person sees.
 * Ported from app/item-rates/edit.tsx, which now uses it; the item page's rate boxes use it too.
 *
 * The hook does not load the rows: the caller reads them (listItemRates / the session cache) and passes them
 * in, `null` while they load. A new `rows` array opens a new draft. `refreshRows` is called when the server says
 * the rates changed meanwhile (STALE_RATES): the caller reads them again and passes the new array.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { t } from '@/i18n';
import { replaceItemRates } from '@/services/item-pricing-service';
import { getRateStartFloor } from '@/services/rateStartFloor';
import type { ItemStoragePrice, PriceType, ReplaceRatesResult } from '@/types/item-pricing.types';
import { showToast } from '@/utils/toast';
import { notifyRatesChanged, type EditorMode, type EditorParams } from './contract';
import {
  appendEmptyBand,
  copyTiersFrom,
  fieldOrder,
  hasChanges,
  initialDraft,
  resyncToday,
  savedStop,
  setStartsOn as withStartsOn,
  switchNewRateType,
  toReplaceInput,
  validate,
  withoutRents,
  type Draft,
  type EditorContext,
  type StartsOnChoice,
} from './editModel';
import { plannedOnDay } from './laterRates';
import { dateText } from './rateText';

/** What the save flow asks of the screen's scroll view (useEditorFields gives both). */
export interface EditorView {
  scrollToTop: () => void;
  scrollToError: (key: string) => void;
}

export interface UseRateEditorArgs {
  item: { id: string; name?: string };
  /** The customer whose rate this is; null for the item's default rate. */
  customer: { id: string; name?: string } | null;
  /** Absent: the editor picks it (the rate in force; Monthly when the item has none). */
  priceType?: PriceType;
  mode: EditorMode;
  /**
   * The other editor params it needs: `starts_on` and `weight_max` (and the rest of the invoice line) for
   * 'correct', 'upcoming' and 'invoice'; `add_band: '1'` for one more empty band. `item_id`, `item_name`,
   * `customer_id`, `customer_name`, `price_type` and `mode` come from the other args.
   */
  params?: Partial<EditorParams>;
  /** Every row of the item (ended ones too); null while they load. A new array opens a new draft. */
  rows: ItemStoragePrice[] | null;
  /** Read the rows again (STALE_RATES); the caller passes the new array as `rows`. */
  refreshRows: () => void;
  role: string | null | undefined;
  /** Today's calendar day, YYYY-MM-DD, or a function that gives it (read again at every save: a form left open past midnight). */
  today: string | (() => string);
  /** The rates were saved and the toast shown: leave, or show the saved state. */
  onSaved: () => void;
  /** The screen's scroll view. A ref, so the hook can be called before the view's hook that needs its `order`. */
  view?: React.RefObject<EditorView | null>;
}

type LaterRates = NonNullable<ReplaceRatesResult['later']>;

export interface UseRateEditor {
  /** A draft is open for the current `rows`. */
  ready: boolean;
  draft: Draft | undefined;
  /** The draft as it opened (before the empty band of `add_band`): `dirty` compares with it. */
  initial: Draft | undefined;
  ctx: EditorContext | undefined;
  /** Field errors by key (`startsOn`, `labour`, `tax`, `firstFrom`, `bands`, `band.N.upTo|from|rent|labour|tax`). */
  errors: Record<string, string>;
  /** The message strip above the form (server refusals, a day change); null when none. */
  strip: string | null;
  saving: boolean;
  /** The later rates the save would delete, for the confirm dialog; null when no question is open. */
  later: LaterRates | null;
  /** The name of the item whose bands were copied into the draft. */
  copiedFrom: string | null;
  /** The oldest day a rate may start (learned from the server when it refused a day). */
  earliest: string | null | undefined;
  /** Something was changed and the form is not manager-only: ask before leaving. */
  dirty: boolean;
  /** The keys of the number fields in the order the Next key walks them. */
  order: string[];
  setDraft: (next: Draft) => void;
  /** Starts-on choice from StartsOnField. */
  setStartsOn: (choice: StartsOnChoice, day: string) => void;
  /** Monthly / One-time on a new rate (re-seeds the bands from the default where there is one). */
  switchType: (value: PriceType) => void;
  /** Take the bands of another item into the draft. */
  copyFrom: (item: { id: string; name: string }, rows: ItemStoragePrice[]) => void;
  /** Save. `replaceLater` true is the answer Yes of the later-rates question. */
  submit: (replaceLater?: boolean) => Promise<void>;
  /** The answer No of the later-rates question. */
  dismissLater: () => void;
  /** Clear the strip (the person started typing again). */
  clearStrip: () => void;
}

interface Core {
  rows: ItemStoragePrice[];
  draft: Draft;
  initial: Draft;
  ctx: EditorContext;
}

export function useRateEditor(args: UseRateEditorArgs): UseRateEditor {
  const { item, customer, priceType, mode, params, rows, refreshRows, role, today, onSaved, view } = args;
  const todayNow = typeof today === 'function' ? today : () => today;

  const [core, setCore] = useState<Core | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [strip, setStrip] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [later, setLater] = useState<LaterRates | null>(null);
  // The item whose tiers were copied into the draft (names the note under the start day).
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const checked = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // ---- open a draft whenever a set of rows arrives (also the same array again after the rows were null) ----
  if (!rows && core) {
    setCore(null);
  } else if (rows && core?.rows !== rows) {
    const openParams = {
      ...params,
      mode,
      item_id: item.id,
      item_name: item.name,
      customer_id: customer?.id,
      customer_name: customer?.name,
      price_type: priceType,
    } as EditorParams;
    const opened = initialDraft({ mode, params: openParams, rows, role, today: todayNow(), earliest: getRateStartFloor() });
    // The Add button of the list asks for one more empty band; `initial` stays without it, so leaving untouched asks first.
    const draft = params?.add_band === '1' ? appendEmptyBand(opened.draft) : opened.draft;
    setCore({ rows, draft, initial: opened.draft, ctx: opened.context });
    // The draft is rebuilt from the server: it no longer holds another item's copied bands.
    setCopiedFrom(null);
  }

  const ready = !!rows && !!core && core.rows === rows;
  const open = ready ? core : null;
  const draft = open?.draft;
  const ctx = open?.ctx;

  const setDraft = useCallback((next: Draft) => {
    setCore(current => (current ? { ...current, draft: next } : current));
    setStrip(null);
    if (checked.current && ctx) setErrors(validate(next, ctx).errors);
  }, [ctx]);

  const dirty = !!open && !open.ctx.managerOnly && hasChanges(open.draft, open.initial);
  const order = useMemo(() => (draft ? fieldOrder(draft, ctx?.customerId ?? null) : []), [draft, ctx]);

  const setStartsOn = (choice: StartsOnChoice, day: string) => {
    if (draft) setDraft(withStartsOn(draft, choice, day));
  };

  const switchType = (value: PriceType) => {
    if (!draft || !ctx) return;
    const next = switchNewRateType(draft, ctx, value);
    // Bands copied from another item: its rents are rents of the other price type, so they are cleared
    // when nothing of this type was found to take their place; either way the note no longer applies.
    const nextDraft = copiedFrom && !next.copied && value !== draft.priceType ? withoutRents(next.draft) : next.draft;
    if (value !== draft.priceType) setCopiedFrom(null);
    setCore(cur => (cur ? { ...cur, draft: nextDraft, ctx: { ...cur.ctx, copied: next.copied } } : cur));
    setStrip(null);
    if (checked.current) setErrors(validate(nextDraft, ctx).errors);
  };

  const copyFrom = (from: { id: string; name: string }, fromRows: ItemStoragePrice[]) => {
    if (!draft) return;
    setCopiedFrom(from.name);
    setDraft(copyTiersFrom(draft, fromRows));
  };

  const finish = (data: Draft, context: EditorContext, keptEndDay?: string | null) => {
    notifyRatesChanged(context.itemId);
    const message =
      context.mode === 'correct'
        ? t('pricing.edit.savedCorrection')
        : context.mode === 'addCustomer'
          ? t('pricing.edit.savedCustomer')
          : t('pricing.edit.saved', { date: dateText(data.startsOn ?? '') });
    // A scheduled stop is kept by the server: say so (its answer first, else what the draft knew).
    const stop = savedStop(keptEndDay, data, context);
    showToast(stop ? `${message} ${t('pricing.edit.stillStops', { date: dateText(stop) })}` : message);
    onSavedRef.current();
  };

  const fieldForServer = (result: ReplaceRatesResult, data: Draft): string => {
    const i = result.bandIndex ?? 0;
    const perBand = data.bands.some(b => b.labour !== undefined);
    if (result.field === 'unit_price') return `band.${i}.rent`;
    if (result.field === 'labour_rate') return perBand ? `band.${i}.labour` : 'labour';
    if (result.field === 'tax_percent') return perBand ? `band.${i}.tax` : 'tax';
    return `band.${i}.upTo`;
  };

  const submit = async (replaceLater = false) => {
    if (!open || saving) return;
    const { draft: data, ctx: context } = open;
    // Left open past midnight (India): the day chips move to the new day and the person looks again.
    const moved = resyncToday(data, context, todayNow());
    if (moved) {
      const initial = resyncToday(open.initial, context, todayNow())?.draft ?? open.initial;
      setCore({ rows: open.rows, draft: moved.draft, initial, ctx: moved.ctx });
      setStrip(t('pricing.edit.dayChanged'));
      view?.current?.scrollToTop();
      return;
    }
    checked.current = true;
    const check = validate(data, context);
    setErrors(check.errors);
    if (!check.ok) {
      const keys = Object.keys(check.errors);
      AccessibilityInfo.announceForAccessibility(t('pricing.form.fixFields', { count: keys.length }));
      view?.current?.scrollToError(['startsOn', ...order].find(k => check.errors[k]) ?? keys[0]);
      return;
    }
    // A planned rate that starts on the first day is deleted by the server without a question: ask here.
    if (!replaceLater && context.mode !== 'correct' && data.startsOn) {
      const hidden = plannedOnDay(context.rows, { customerId: context.customerId, priceType: data.priceType }, data.startsOn, context.today, context.editingIds);
      if (hidden.length > 0) {
        setLater(hidden);
        return;
      }
    }
    setSaving(true);
    setStrip(null);
    try {
      const result = await replaceItemRates({ ...toReplaceInput(data, context), ...(replaceLater ? { replace_later: true } : {}) });
      if (result.success) {
        setLater(null);
        finish(data, context, result.keptEnd);
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
        refreshRows();
        return;
      }
      if (result.outcomeUnknown) {
        // The change may be saved: the pages behind read the item again.
        notifyRatesChanged(context.itemId);
      }
      if (result.errorCode === 'INVALID_DATE') {
        // The day is outside what the server accepts: say so at the field, and learn the oldest allowed day from the answer.
        const earliest = result.earliest;
        if (earliest) setCore(cur => (cur ? { ...cur, ctx: { ...cur.ctx, earliestStart: earliest } } : cur));
        setErrors(current => ({ ...current, startsOn: result.message ?? '' }));
        view?.current?.scrollToError('startsOn');
        return;
      }
      if (result.errorCode === 'PAST_DATE_NOT_ALLOWED' && context.mode === 'upcoming' && !context.canStartInPast) {
        setStrip(t('pricing.edit.err.moveAfterToday'));
        view?.current?.scrollToTop();
        return;
      }
      if ((result.errorCode === 'INVALID_BAND' || result.errorCode === 'INVALID_AMOUNT') && result.bandIndex !== undefined) {
        const key = fieldForServer(result, data);
        setErrors(current => ({ ...current, [key]: result.message ?? '' }));
        view?.current?.scrollToError(key);
        return;
      }
      setStrip(result.message ?? t('pricing.error.generic'));
      view?.current?.scrollToTop();
    } finally {
      setSaving(false);
    }
  };

  return {
    ready,
    draft,
    initial: open?.initial,
    ctx,
    errors,
    strip,
    saving,
    later,
    copiedFrom,
    earliest: ctx?.earliestStart,
    dirty,
    order,
    setDraft,
    setStartsOn,
    switchType,
    copyFrom,
    submit,
    dismissLater: () => setLater(null),
    clearStrip: () => setStrip(null),
  };
}
