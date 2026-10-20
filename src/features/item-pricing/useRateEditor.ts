/**
 * The state and the save flow of one rate form: opening a draft from the item's rows, the edits, whether
 * anything changed, and the save with every answer of replace_item_rates mapped to what the person sees.
 * Used by the rate boxes of the item page and the customer's rate pages.
 *
 * The hook does not load the rows: the caller reads them (listItemRates / the session cache) and passes them
 * in, `null` while they load. A new `rows` array opens a new draft, except while figures are being typed: the typing is kept
 * and `rowsChanged` says so (see below); the context follows the new rows. `refreshRows` is called when the server says
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
  copyTiersFrom,
  fieldOrder,
  hasChanges,
  initialDraft,
  resyncToday,
  savedStop,
  setStartsOn as withStartsOn,
  rentErrors,
  scopeRowsKey,
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
   * The other editor params it needs: `starts_on` for
   * 'correct' and 'upcoming'. `item_id`, `item_name`,
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
  /** The draft as it opened: `dirty` compares with it. */
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
  /**
   * The rows changed (another phone, a background read) while the figures were being typed: the typing is kept as it is
   * and the screen says so. Saving then sends the rows now held.
   */
  rowsChanged: boolean;
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
  const [rowsChanged, setRowsChanged] = useState(false);
  // The rows that come after this phone's own save close the form as saved; they are not "changed on another phone".
  const ownSave = useRef(false);
  // This phone's own save got no answer (timed out): the rows that come back may be that save, not another phone.
  const maybeSaved = useRef(false);
  const checked = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // ---- open a draft whenever a set of rows arrives (also the same array again after the rows were null) ----
  const openDraft = (fromRows: ItemStoragePrice[]) => {
    ownSave.current = false;
    maybeSaved.current = false;
    setRowsChanged(false);
    const openParams = {
      ...params,
      mode,
      item_id: item.id,
      item_name: item.name,
      customer_id: customer?.id,
      customer_name: customer?.name,
      price_type: priceType,
    } as EditorParams;
    const opened = initialDraft({ mode, params: openParams, rows: fromRows, role, today: todayNow(), earliest: getRateStartFloor() });
    setCore({ rows: fromRows, draft: opened.draft, initial: opened.draft, ctx: opened.context });
    // The draft is rebuilt from the server: it no longer holds another item's copied bands, nor the errors of the last
    // one. The strip stays: a refused save (STALE_RATES) reads the rows again and the message is for the new draft.
    setCopiedFrom(null);
    setErrors({});
    setLater(null);
    checked.current = false;
  };
  if (!rows && core) {
    setCore(null);
  } else if (rows && core && core.rows !== rows) {
    if (JSON.stringify(core.rows) === JSON.stringify(rows)) {
      // The same content read again (a refresh that found nothing new): swap the array and keep the typing, silently.
      setCore({ ...core, rows });
    } else if (!ownSave.current && !maybeSaved.current && !core.ctx.managerOnly && hasChanges(core.draft, core.initial)) {
      // Figures are being typed: new rows (a pull to refresh, a background read) must not replace them.
      const { customerId } = core.ctx;
      const type = core.draft.priceType;
      if (scopeRowsKey(core.rows, customerId, type) === scopeRowsKey(rows, customerId, type)) {
        // Only other rows of the item changed (another customer's rate, the other price type): this rate is as it was.
        setCore({ ...core, rows, ctx: { ...core.ctx, rows } });
      } else {
        // The rows of this rate changed: Save must send the rows now held (p_seen_rows), with the typing kept.
        const opened = initialDraft({
          mode,
          params: { ...params, mode, item_id: item.id, item_name: item.name, customer_id: customer?.id, customer_name: customer?.name, price_type: type } as EditorParams,
          rows,
          role,
          today: todayNow(),
          earliest: core.ctx.earliestStart ?? getRateStartFloor(),
        });
        setCore({ ...core, rows, ctx: { ...opened.context, copied: core.ctx.copied } });
        setRowsChanged(true);
      }
    } else {
      openDraft(rows);
    }
  } else if (rows && !core) {
    openDraft(rows);
  } else if (rows && core && rowsChanged && !hasChanges(core.draft, core.initial)) {
    // The typing was undone after the rows changed: rebuild from the rows now held and drop the warning.
    openDraft(core.rows);
  }

  const ready = !!rows && !!core && core.rows === rows;
  const open = ready ? core : null;
  const draft = open?.draft;
  const ctx = open?.ctx;

  const setDraft = useCallback((next: Draft) => {
    ownSave.current = false;
    maybeSaved.current = false;
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
    ownSave.current = true;
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
        // The typed figures stay: the rows the read brings replace the ones sent, and Save sends those.
        refreshRows();
        return;
      }
      if (result.outcomeUnknown) {
        // The change may be saved: the pages behind read the item again, and the rows that come back are not "another phone".
        maybeSaved.current = true;
        notifyRatesChanged(context.itemId);
      }
      if (result.errorCode === 'BANDS_OVERLAP' || result.errorCode === 'BANDS_GAP') {
        // The bands as a whole are wrong: the message sits under the bands as well as in the strip.
        const message = result.message ?? t('pricing.error.generic');
        setErrors(current => ({ ...current, bands: message }));
        setStrip(message);
        view?.current?.scrollToError('bands');
        return;
      }
      if (result.errorCode === 'INVALID_DATE') {
        // The day is outside what the server accepts: say so at the field, and learn the oldest allowed day from the answer.
        const earliest = result.earliest;
        if (earliest) setCore(cur => (cur ? { ...cur, ctx: { ...cur.ctx, earliestStart: earliest } } : cur));
        setErrors(current => ({ ...current, startsOn: result.message ?? '' }));
        view?.current?.scrollToError('startsOn');
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
    // The rent message shows as soon as a key is refused or a stored rent is too high, before Save.
    errors: draft ? { ...rentErrors(draft), ...errors } : errors,
    strip,
    saving,
    later,
    copiedFrom,
    earliest: ctx?.earliestStart,
    dirty,
    rowsChanged,
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
