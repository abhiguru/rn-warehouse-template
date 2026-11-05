/**
 * The rate editor's rules (pricing spec section 7): what the form holds, which start days are
 * offered, the weight-band maths, the checks and the call to the server. Pure: no React, no
 * network. Days are 'YYYY-MM-DD' strings and are compared as strings, never through UTC.
 *
 * The rows are passed in by the caller (useRateEditor's `rows`).
 */
import { localizeDigits, normalizeDigits, t } from '@/i18n';
import type { ItemStoragePrice, PriceType, ReplaceRatesInput } from '@/types/item-pricing.types';
import type { EditorMode, EditorParams } from './contract';
import { rateRights } from './rateRights';
import { addDays, bandText, dateText, money, unitText } from './rateText';
import { acceptRentText, labourNumber, priceNumber, rentNumber, RENT_MAX } from '@/utils/priceNumbers';

/** The server allows ten bands in one scope (INVALID_BANDS). */
export const MAX_BANDS = 10;

/** 'fixed': the day cannot be chosen (a correction keeps the rate's own start). */
export type StartsOnChoice = 'today' | 'nextMonth' | 'april' | 'other' | 'fixed' | 'ownStart';

export interface BandDraft {
  /** The heaviest bag this band holds, whole kg, as typed. */
  upTo: string;
  rent: string;
  /** Only when the loaded bands differ in labour or tax: then each band keeps its own. */
  labour?: string;
  tax?: string;
  /**
   * A customer's stored band that starts above the end of the band before it (those weights pay
   * the default rate). The editor keeps the gap; a band that starts right after the one before has none.
   */
  gapFrom?: number;
  /** The last rent key was refused (it would pass 9999.99 or 2 decimals): the field says why until a key is accepted. Not a change. */
  rentRefused?: true;
  /** A customer band's "From" as typed (not the first band, which has firstFromText). Set only when the person typed a start other than the end of the band before plus one. */
  fromText?: string;
}

export interface Draft {
  priceType: PriceType;
  startsOn: string | null;
  startsOnChoice: StartsOnChoice | null;
  /** Where the first band starts (0 for a default rate). The next bands start after the one before. */
  firstFrom: number;
  /** The "From" of the first band as typed (a customer rate only); firstFrom is its whole-kg reading. */
  firstFromText?: string;
  bands: BandDraft[];
  labour: string;
  tax: string;
  /** A default rate's stored first band started above 0 kg: it now starts at 0 (the editor says so). */
  firstBandZeroed?: true;
  /** Mode addBand: the first `locked` bands are the rate's own, shown closed and sent as loaded (ctx.lockedRows). */
  locked?: number;
}

export interface EditorContext {
  mode: EditorMode;
  itemId: string;
  itemName: string;
  customerId: string | null;
  customerName: string | null;
  /** True only for an item that has no rate of any type: the person picks Monthly or One-time. */
  priceTypeChoosable: boolean;
  today: string;
  canStartInPast: boolean;
  /** Mode 'correct' reached by someone who may not correct a rate in force. */
  managerOnly: boolean;
  /** Mode 'upcoming' for a planned rate that no longer exists (cancelled or moved elsewhere). */
  plannedGone: boolean;
  /** Every row of the item, ended ones too. */
  rows: ItemStoragePrice[];
  /** The planned rows an 'upcoming' edit replaces: they are not "the old rate" of the new one. */
  editingIds: string[];
  /** 'upcoming': the day the planned rate starts when the editor opened (moving it is a different call than correcting it). */
  originalStart: string | null;
  /** The bands, labour and tax were taken from the default rate (shows the copy note). */
  copied: boolean;
  /** The earliest day a rate may start (the oldest GRN's day); absent: three years before today. */
  earliestStart?: string | null;
  /** Mode addBand: the rows in force, exactly as loaded; the draft's first bands are their readings. */
  lockedRows?: ItemStoragePrice[];
  /** Mode addBand: the day the rate in force started (its rows' start). */
  ownStart?: string | null;
  /** Mode addBand: the rows in force do not share one start day, so only Today is offered (nothing is sent as a correction). */
  mixedStarts?: boolean;
  /** Mode addBand: a save from the default day would lose a row or a stop of the scope, so only Today is offered. */
  othersAtRisk?: boolean;
}

export interface Scope {
  customerId: string | null;
  priceType: PriceType;
}

const day = (value: string | null | undefined): string => (value ? value.slice(0, 10) : '');
const round2 = (n: number): number => Math.round(n * 100) / 100;
const two = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/**
 * The server accepts a start from the day of the facility's oldest GRN (`earliest_start` of the rates
 * read, migration 86) to two years after today (730 days). A server that does not send the floor is an
 * older one: it allowed three years before today (1095 days), which is the fallback.
 */
export const START_DAYS_BACK = 1095;
export const START_DAYS_AHEAD = 730;

/** The earliest day a rate may start. */
export function startFloor(today: string, earliest?: string | null): string {
  return earliest || addDays(today, -START_DAYS_BACK);
}

/** True when `startsOn` is a day the server accepts as a start (INVALID_DATE otherwise). */
export function dayInWindow(startsOn: string, today: string, earliest?: string | null): boolean {
  return startsOn >= startFloor(today, earliest) && startsOn <= addDays(today, START_DAYS_AHEAD);
}

/** Mode addBand: the rate in force began before the earliest day the server accepts (known only when the server sent it). */
export const startMoved = (ctx: EditorContext): boolean => !!ctx.ownStart && !!ctx.earliestStart && ctx.ownStart < ctx.earliestStart;

/** Mode addBand: the day of the default choice, the rate's own start, or the earliest allowed day when the rate began before it. */
export function ownStartDay(ctx: EditorContext): string | null {
  return ctx.ownStart ? (startMoved(ctx) ? (ctx.earliestStart as string) : ctx.ownStart) : null;
}

/** True when the save sends mode 'correct' on the rate's own start: a correction, or the default choice of Add rate on a rate in force. */
export function correcting(draft: Draft, ctx: EditorContext): boolean {
  return ctx.mode === 'correct' || (ctx.mode === 'addBand' && draft.startsOnChoice === 'ownStart' && !startMoved(ctx));
}

/** The soonest rate of the item's own scope that starts after `afterDay`, or null. */
export function laterRateStart(ctx: EditorContext, priceType: PriceType, afterDay: string): string | null {
  const later = ctx.rows
    .filter(r => inScope(r, { customerId: null, priceType }) && day(r.effective_from) > afterDay)
    .map(r => day(r.effective_from))
    .sort();
  return later[0] ?? null;
}

/**
 * Add rate on a rate in force, default choice. A rate that began before the server's earliest day cannot start
 * from a planned rate's side: the person is told (at the top) and the planned rate is never replaced from here.
 */
export function bandBlockedByPlanned(draft: Draft, ctx: EditorContext, earliest: string | null = null): string | null {
  if (ctx.mode !== 'addBand' || draft.startsOnChoice !== 'ownStart' || !ctx.ownStart) return null;
  const from = earliest && ctx.ownStart < earliest ? earliest : startMoved(ctx) ? (ctx.earliestStart as string) : null;
  if (!from) return null;
  const later = laterRateStart(ctx, draft.priceType, from);
  return later ? t('pricing.edit.bandLaterBlocked', { date: dateText(later), earliest: dateText(from) }) : null;
}

/** Add rate on a rate in force, default choice on its own start: a planned later rate does not get the new band (the form says so). */
export function bandPlannedNote(draft: Draft, ctx: EditorContext): string | null {
  if (ctx.mode !== 'addBand' || draft.startsOnChoice !== 'ownStart' || startMoved(ctx) || !draft.startsOn) return null;
  const later = laterRateStart(ctx, draft.priceType, draft.startsOn);
  return later ? t('pricing.edit.bandLaterPlanned', { date: dateText(later) }) : null;
}

/** A whole number of kilograms typed as digits only, else null. */
export function wholeKg(text: string | null | undefined): number | null {
  const cleaned = normalizeDigits(text ?? '').trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

const inScope = (row: ItemStoragePrice, scope: Scope): boolean =>
  (row.customer_id ?? null) === scope.customerId && row.price_type === scope.priceType;

/** The rows of a scope that are in force on a day (inclusive end day), lightest band first. */
export function rowsInForce(rows: ItemStoragePrice[], scope: Scope, onDay: string): ItemStoragePrice[] {
  return rows
    .filter(r => inScope(r, scope) && day(r.effective_from) <= onDay && (!r.effective_to || day(r.effective_to) >= onDay))
    .sort((a, b) => a.weight_min - b.weight_min);
}

/**
 * Add rate on a rate in force: true when saving from the default day would lose something. Correct mode deletes every row of the
 * scope starting that day and a change from the earliest day deletes every row starting from it; both give all new rows one kept
 * stop, which exists only when the rows in force that day share it (all open or one last day). So the default day is safe only when
 * every such row is one of the locked bands and the rows in force that day stop together.
 */
function defaultDayLosesRows(rows: ItemStoragePrice[], locked: ItemStoragePrice[], scope: Scope, ownStart: string, earliest: string | null): boolean {
  const moved = !!earliest && ownStart < earliest;
  const from = moved ? (earliest as string) : ownStart;
  const lockedIds = new Set(locked.map(r => r.id));
  const inScopeRows = rows.filter(r => inScope(r, scope));
  const deleted = inScopeRows.filter(r => (moved ? day(r.effective_from) >= from : day(r.effective_from) === from) && !lockedIds.has(r.id));
  const stops = new Set(rowsInForce(inScopeRows, scope, from).map(r => day(r.effective_to)));
  return deleted.length > 0 || stops.size > 1 || locked.some(r => day(r.effective_to) !== [...stops][0]);
}

/** The soonest planned rate of a scope after a day: its start and rows. */
function upcomingGroup(rows: ItemStoragePrice[], scope: Scope, afterDay: string, startsOn?: string) {
  const later = rows.filter(r => inScope(r, scope) && day(r.effective_from) > afterDay);
  if (later.length === 0) return null;
  const start = startsOn && later.some(r => day(r.effective_from) === startsOn)
    ? startsOn
    : later.map(r => day(r.effective_from)).sort()[0];
  return { startsOn: start, rows: later.filter(r => day(r.effective_from) === start).sort((a, b) => a.weight_min - b.weight_min) };
}

/** The rows of a scope that ended most recently. */
function latestEnded(rows: ItemStoragePrice[], scope: Scope, beforeDay: string): ItemStoragePrice[] {
  const ended = rows.filter(r => inScope(r, scope) && r.effective_to && day(r.effective_to) < beforeDay);
  if (ended.length === 0) return [];
  const last = ended.map(r => day(r.effective_to)).sort().reverse()[0];
  return ended.filter(r => day(r.effective_to) === last).sort((a, b) => a.weight_min - b.weight_min);
}

// ---------------------------------------------------------------------------------------------
// Start days
// ---------------------------------------------------------------------------------------------

export interface StartChip {
  id: 'today' | 'nextMonth' | 'april';
  day: string;
}

/** Today, the first of next month and the next 1 April (dropped when it is the first of next month). */
export function startChips(today: string): StartChip[] {
  const [y, m] = today.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const april = `${m < 4 ? y : y + 1}-04-01`;
  const chips: StartChip[] = [
    { id: 'today', day: today },
    { id: 'nextMonth', day: nextMonth },
  ];
  if (april !== nextMonth && april > today) chips.push({ id: 'april', day: april });
  return chips;
}

/**
 * The editor was left open past midnight (India): "Today" and the other start chips are the days
 * of the new date. Returns the draft and context to use, or null when the day has not changed.
 */
export function resyncToday(draft: Draft, ctx: EditorContext, now: string): { draft: Draft; ctx: EditorContext } | null {
  if (now === ctx.today) return null;
  let startsOn = draft.startsOn;
  if (draft.startsOnChoice === 'today') startsOn = now;
  else if (draft.startsOnChoice === 'nextMonth' || draft.startsOnChoice === 'april') {
    startsOn = startChips(now).find(c => c.id === draft.startsOnChoice)?.day ?? draft.startsOn;
  }
  return { draft: { ...draft, startsOn }, ctx: { ...ctx, today: now } };
}

export function setStartsOn(draft: Draft, choice: StartsOnChoice, startsOn: string): Draft {
  return { ...draft, startsOnChoice: choice, startsOn };
}

export function setPriceType(draft: Draft, priceType: PriceType): Draft {
  return { ...draft, priceType };
}

// ---------------------------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------------------------

/** The kilograms of a band end while it is being typed: "40.5" reads as 40 (the checks still refuse it). */
function typedKg(text: string | null | undefined): number | null {
  const match = /^(\d+)(?:\.\d*)?$/.exec(normalizeDigits(text ?? '').trim());
  return match ? Number(match[1]) : null;
}

/** Where band `index` starts: the first band's start, then the end of the band before plus one. Null when that end is not a number. */
export function fromOf(draft: Draft, index: number): number | null {
  if (index <= 0) return draft.firstFrom;
  const before = typedKg(draft.bands[index - 1]?.upTo);
  if (before === null) return null;
  // A typed start is read as typed; the checks refuse one that overlaps the band before.
  const typed = draft.bands[index]?.fromText;
  if (typed !== undefined) return wholeKg(typed);
  // A stored gap stays until the band before grows over it.
  return Math.max(before + 1, draft.bands[index]?.gapFrom ?? 0);
}

/**
 * The editor's fields in the order the keyboard's Next key visits them (and the first error is
 * looked for). A customer rate has a "From" on every band: `firstFrom`, then `band.<i>.from`.
 */
export function fieldOrder(draft: Draft, customerId: string | null): string[] {
  const perBand = draft.bands.some(b => b.labour !== undefined);
  const locked = draft.locked ?? 0;
  const keys = draft.bands.flatMap((b, i) => i < locked ? [] : [
    ...(customerId ? [i === 0 ? 'firstFrom' : `band.${i}.from`] : []),
    `band.${i}.upTo`,
    `band.${i}.rent`,
    ...(perBand ? [`band.${i}.labour`, `band.${i}.tax`] : []),
  ]);
  if (!perBand) keys.push(...(draft.priceType === 'one_time' ? [] : ['labour']), 'tax');
  return keys;
}

/** Sets where the first band of a customer rate starts, as typed. */
export function setFirstFrom(draft: Draft, text: string): Draft {
  return { ...draft, firstFromText: text, firstFrom: wholeKg(text) ?? 0 };
}

/**
 * Sets where band `index` (not the first) of a customer rate starts, as typed. A start above the end
 * of the band before leaves a gap; those weights pay the default rate. A start equal to that end
 * plus one is no gap: the band goes back to following on from the band before.
 */
export function setBandFrom(draft: Draft, index: number, text: string): Draft {
  if (index <= 0) return draft;
  const before = typedKg(draft.bands[index - 1]?.upTo);
  const kg = wholeKg(text);
  return {
    ...draft,
    bands: draft.bands.map((b, i) => {
      if (i !== index) return b;
      const { gapFrom: _gap, fromText: _text, ...rest } = b;
      return before !== null && kg === before + 1 ? rest : { ...rest, fromText: text };
    }),
  };
}

/** The weights a customer rate leaves to the default rate just before band `index` (null when none, or not a number yet). */
export function gapBefore(draft: Draft, index: number): { from: number; to: number } | null {
  const from = fromOf(draft, index);
  if (from === null) return null;
  const end = index <= 0 ? -1 : typedKg(draft.bands[index - 1]?.upTo);
  if (end === null || from <= end + 1) return null;
  return { from: end + 1, to: from - 1 };
}

export function setUpTo(draft: Draft, index: number, text: string): Draft {
  return { ...draft, bands: draft.bands.map((b, i) => (i === index ? { ...b, upTo: text } : b)) };
}

export function setBandField(draft: Draft, index: number, field: 'rent' | 'labour' | 'tax', text: string): Draft {
  // A rent that would pass 9999.99 or 2 decimals is not taken: the field keeps what it held.
  const old = draft.bands[index]?.rent ?? '';
  const value = field === 'rent' ? acceptRentText(old, text) : text;
  const refused = field === 'rent' && value === old && text !== old;
  return {
    ...draft,
    bands: draft.bands.map((b, i) => {
      if (i !== index) return b;
      if (field !== 'rent') return { ...b, [field]: value };
      const { rentRefused: _was, ...rest } = b;
      return { ...rest, rent: value, ...(refused ? { rentRefused: true as const } : {}) };
    }),
  };
}

/** The rent message of each band whose last key was refused, or whose rent (stored or copied) is above the limit. Shown before Save. */
export function rentErrors(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  draft.bands.forEach((band, i) => {
    const n = priceNumber(band.rent, 2);
    if (band.rentRefused || (n !== null && n > RENT_MAX)) errors[`band.${i}.rent`] = t('pricing.edit.err.rent');
  });
  return errors;
}

/** Why "Add weight band" cannot add one now: ten bands already, or the last "Up to" is not a whole number yet. */
export function appendBandBlock(draft: Draft): 'max' | 'upTo' | null {
  if (draft.bands.length >= MAX_BANDS) return 'max';
  if (wholeKg(draft.bands[draft.bands.length - 1]?.upTo) === null) return 'upTo';
  return null;
}

/**
 * Adds an empty band after the last one (it starts one kg above where the last ends). Labour and tax
 * are copied from the first band when each band keeps its own. Unchanged at ten
 * bands and while the last "Up to" is not a whole number.
 */
export function appendEmptyBand(draft: Draft): Draft {
  if (appendBandBlock(draft) !== null) return draft;
  // Add rate on a rate in force: the new band's labour and tax start as the band before's.
  const first = draft.locked ? draft.bands[draft.bands.length - 1] : draft.bands[0];
  const fresh: BandDraft = {
    upTo: '',
    rent: '',
    ...(draft.bands.some(b => b.labour !== undefined) ? { labour: first.labour ?? '', tax: first.tax ?? '' } : {}),
  };
  return { ...draft, bands: [...draft.bands, fresh] };
}

export type InsertBandResult = { ok: true; draft: Draft; index: number } | { ok: false; reason: string };

/**
 * Adds a band that starts at `startText` kg. Inside a band it splits it: that band ends one kg before the
 * start and the new band takes its old end, rent, labour and tax (no other band changes). Right after the
 * last band it is today's append (blank figures). Refused, with the reason in words, when the start is not a
 * whole number, is the start of a band already or lies before the first one, would leave a gap, or when
 * there are ten bands or a band's "Up to" is not yet a whole number.
 */
export function insertBandAt(draft: Draft, startText: string): InsertBandResult {
  const fail = (reason: string): InsertBandResult => ({ ok: false, reason });
  if (draft.bands.length >= MAX_BANDS) return fail(t('pricing.edit.bandsFull'));
  const ends = draft.bands.map(b => wholeKg(b.upTo));
  if (ends.some(e => e === null)) return fail(t('pricing.edit.insertNeedsUpTo'));
  const start = wholeKg(startText);
  if (start === null) return fail(t('pricing.edit.insertWhole'));
  const lastEnd = ends[ends.length - 1] as number;
  if (start > lastEnd + 1) return fail(t('pricing.edit.insertGap', { kg: localizeDigits(String(lastEnd + 1)) }));
  if (start === lastEnd + 1) {
    const draftAfter = appendEmptyBand(draft);
    return draftAfter === draft ? fail(t('pricing.edit.bandsFull')) : { ok: true, draft: draftAfter, index: draft.bands.length };
  }
  if (start < draft.firstFrom) return fail(t('pricing.edit.insertLow', { kg: localizeDigits(String(draft.firstFrom + 1)) }));
  for (let i = 0; i < draft.bands.length; i++) {
    const from = fromOf(draft, i);
    const end = ends[i] as number;
    if (from === null || !(from < start && start <= end)) continue;
    const { rentRefused: _refused, ...band } = draft.bands[i];
    const added: BandDraft = {
      upTo: String(end),
      rent: band.rent,
      ...(band.labour !== undefined ? { labour: band.labour } : {}),
      ...(band.tax !== undefined ? { tax: band.tax } : {}),
    };
    const bands = [...draft.bands.slice(0, i), { ...band, upTo: String(start - 1) }, added, ...draft.bands.slice(i + 1)];
    return { ok: true, draft: { ...draft, bands }, index: i + 1 };
  }
  return fail(t('pricing.edit.insertExists', { kg: localizeDigits(String(start)) }));
}

/**
 * Removes a band. The LAST band is dropped and the range gets shorter (the band before keeps its own
 * "Up to": owner decision 6, so "Up to 1, Up to 8, remove the rest" ends at 8). Any other band hands
 * its weights to the band before it (the first band's weights go to the next).
 * A band whose "Up to" is still empty (just added) has no weights to hand over either way.
 */
export function removeBand(draft: Draft, index: number): Draft {
  const locked = draft.locked ?? 0;
  if (draft.bands.length < 2 || index < locked || index >= draft.bands.length) return draft;
  const removed = draft.bands[index];
  const bands = draft.bands.filter((_, i) => i !== index);
  const last = index === draft.bands.length - 1;
  // A rate's own bands never take weights over: the band after simply follows the one before.
  if (index > locked && !last && removed.upTo.trim() !== '') bands[index - 1] = { ...bands[index - 1], upTo: removed.upTo };
  return { ...draft, bands };
}

// ---------------------------------------------------------------------------------------------
// Opening the editor
// ---------------------------------------------------------------------------------------------

const taxText = (n: number): string => String(Number(n));

/** A draft from rows of one scope (all in force together). */
function draftFromRows(rows: ItemStoragePrice[], priceType: PriceType, keepRent = true, zeroStart = false): Draft {
  const first = rows[0];
  // The server refuses a default rate whose bands do not start at 0 kg (BANDS_GAP).
  const zeroed = zeroStart && first.weight_min > 0;
  const perBand = rows.some(r => r.labour_rate !== first.labour_rate || r.tax_percent !== first.tax_percent);
  return {
    priceType,
    startsOn: null,
    startsOnChoice: null,
    firstFrom: zeroed ? 0 : first.weight_min,
    ...(zeroed ? { firstBandZeroed: true as const } : {}),
    bands: rows.map((r, i) => ({
      upTo: String(r.weight_max),
      rent: keepRent ? two(r.unit_price) : '',
      ...(perBand ? { labour: two(r.labour_rate), tax: taxText(r.tax_percent) } : {}),
      // A customer's own bands may leave weights between them to the default rate: keep that.
      ...(!zeroStart && i > 0 && r.weight_min > rows[i - 1].weight_max + 1 ? { gapFrom: r.weight_min } : {}),
    })),
    labour: two(first.labour_rate),
    tax: taxText(first.tax_percent),
  };
}

/**
 * The draft with the bands, labour and tax of another item's default rate (its rows in force,
 * one price type). The start day the person chose stays. Unchanged when the other item has no rows.
 */
export function copyTiersFrom(draft: Draft, rows: ItemStoragePrice[]): Draft {
  if (rows.length === 0) return draft;
  const sorted = [...rows].sort((a, b) => a.weight_min - b.weight_min);
  return { ...draftFromRows(sorted, draft.priceType, true, true), startsOn: draft.startsOn, startsOnChoice: draft.startsOnChoice };
}

/** One band 0-100 and nothing else filled in. */
function emptyDraft(priceType: PriceType): Draft {
  return {
    priceType,
    startsOn: null,
    startsOnChoice: null,
    firstFrom: 0,
    bands: [{ upTo: '100', rent: '' }],
    labour: '',
    tax: '',
  };
}

const withStart = (draft: Draft, choice: StartsOnChoice, startsOn: string): Draft => setStartsOn(draft, choice, startsOn);

/** The draft of a new rate of one type: the default's bands (same type, else the last ended one, else the other type's), else empty. */
function seedNewRate(
  mode: 'add' | 'addCustomer',
  rows: ItemStoragePrice[],
  priceType: PriceType,
  today: string,
  zeroStart: boolean
): { draft: Draft; copied: boolean } {
  const defaultScope: Scope = { customerId: null, priceType };
  const sameTypeDefault = rowsInForce(rows, defaultScope, today);
  const endedDefault = mode === 'add' ? latestEnded(rows, defaultScope, today) : [];
  const otherType: PriceType = priceType === 'monthly' ? 'one_time' : 'monthly';
  const otherDefault = mode === 'add' ? rowsInForce(rows, { customerId: null, priceType: otherType }, today) : [];
  if (sameTypeDefault.length > 0) return { draft: draftFromRows(sameTypeDefault, priceType, true, zeroStart), copied: true };
  if (endedDefault.length > 0) return { draft: draftFromRows(endedDefault, priceType, true, zeroStart), copied: true };
  if (otherDefault.length > 0) {
    // Bands and tax of the other type's rate; its rent is not a rent of this type. A one-time
    // rate has no labour (stored as 0), so a monthly rate copied from it must ask for labour.
    let draft = draftFromRows(otherDefault, priceType, false, zeroStart);
    if (otherType === 'one_time') {
      draft = { ...draft, labour: '', bands: draft.bands.map(b => (b.labour === undefined ? b : { ...b, labour: '' })) };
    }
    return { draft, copied: true };
  }
  return { draft: emptyDraft(priceType), copied: false };
}

/**
 * The person chose the other type while adding a customer's first rate: the draft is seeded again
 * from the default rate of that type (a rent of one type is not a rent of the other), and the
 * start day they chose is kept.
 */
export function switchNewRateType(draft: Draft, ctx: EditorContext, priceType: PriceType): { draft: Draft; copied: boolean } {
  if (ctx.mode !== 'add' && ctx.mode !== 'addCustomer') return { draft: setPriceType(draft, priceType), copied: ctx.copied };
  const seeded = seedNewRate(ctx.mode, ctx.rows, priceType, ctx.today, ctx.customerId === null);
  // Nothing to copy for this type: what the person typed stays.
  if (!seeded.copied) return { draft: setPriceType(draft, priceType), copied: false };
  return {
    draft: { ...seeded.draft, startsOn: draft.startsOn, startsOnChoice: draft.startsOnChoice },
    copied: seeded.copied,
  };
}

/** The draft with every rent cleared: rents copied from another item are rents of one price type only. */
export function withoutRents(draft: Draft): Draft {
  return { ...draft, bands: draft.bands.map(b => ({ ...b, rent: '' })) };
}

interface OpenArgs {
  mode: EditorMode;
  params: EditorParams;
  rows: ItemStoragePrice[];
  role: string | null | undefined;
  today: string;
  /** `earliest_start` of the rates read, when the server sent it. */
  earliest?: string | null;
}

export function initialDraft({ mode, params, rows, role, today, earliest }: OpenArgs): { draft: Draft; context: EditorContext } {
  const rights = rateRights(role);
  const customerId = params.customer_id || null;
  const itemName = params.item_name || rows[0]?.item_name || '';
  const customerName = params.customer_name || rows.find(r => customerId && r.customer_id === customerId)?.customer_name || null;
  const itemHasRates = rows.length > 0;

  const typeFromParams = (params.price_type === 'one_time' || params.price_type === 'monthly' ? params.price_type : undefined) as PriceType | undefined;
  const hasInForce = (type: PriceType) => rowsInForce(rows, { customerId, priceType: type }, today).length > 0;
  const defaultInForce = (type: PriceType) => rowsInForce(rows, { customerId: null, priceType: type }, today).length > 0;
  // A customer's first rate follows the item's default type (monthly when it has both).
  const priceType: PriceType = typeFromParams
    ?? (mode === 'addCustomer' && !hasInForce('monthly') && !hasInForce('one_time') && !defaultInForce('monthly') && defaultInForce('one_time')
      ? 'one_time'
      : hasInForce('monthly') || !hasInForce('one_time') ? 'monthly' : 'one_time');
  const scope: Scope = { customerId, priceType };
  const zeroStart = customerId === null;

  const base = {
    itemId: params.item_id,
    itemName,
    customerId,
    customerName,
    today,
    canStartInPast: rights.canStartInPast,
    earliestStart: earliest ?? null,
    managerOnly: false,
    plannedGone: false,
    rows,
    editingIds: [] as string[],
    originalStart: null as string | null,
    copied: false,
  };

  // ---- Add rate on a rate in force: the rate's own bands closed, a new band open (WH-74) ----
  if (mode === 'addBand') {
    const own = rowsInForce(rows, scope, today);
    // Nothing in force (the rate ended meanwhile): the form opens as Add rate always did.
    if (own.length === 0) return initialDraft({ mode: 'add', params, rows, role, today, earliest });
    const lastOwn = own[own.length - 1];
    const starts = [...new Set(own.map(r => day(r.effective_from)))].sort();
    const mixedStarts = starts.length > 1;
    const othersAtRisk = !mixedStarts && defaultDayLosesRows(rows, own, scope, starts[0], earliest ?? null);
    const ownStart = mixedStarts || othersAtRisk ? null : starts[0];
    const context: EditorContext = { ...base, mode, priceTypeChoosable: false, lockedRows: own, ownStart, mixedStarts, othersAtRisk };
    const opened = draftFromRows(own, priceType, true, false);
    const draft: Draft = {
      ...opened,
      bands: [
        ...own.map(r => ({ upTo: String(r.weight_max), rent: two(r.unit_price), labour: two(r.labour_rate), tax: taxText(r.tax_percent) })),
        { upTo: '', rent: '', labour: two(lastOwn.labour_rate), tax: taxText(lastOwn.tax_percent) },
      ],
      locked: own.length,
    };
    const ownDay = ownStartDay(context);
    return { draft: ownDay ? withStart(draft, 'ownStart', ownDay) : withStart(draft, 'today', today), context };
  }

  // ---- a new rate ----
  if (mode === 'add' || mode === 'addCustomer') {
    const { draft, copied } = seedNewRate(mode, rows, priceType, today, zeroStart);
    return {
      draft: withStart(draft, 'today', today),
      context: {
        ...base,
        mode,
        // A customer with no rate of their own yet may get either type; an item with no rate chooses too.
        priceTypeChoosable: mode === 'addCustomer'
          ? !rows.some(r => r.customer_id === customerId && (!r.effective_to || day(r.effective_to) >= today))
          : !itemHasRates && !typeFromParams,
        copied,
      },
    };
  }

  // ---- upcoming: the planned rate ----
  if (mode === 'upcoming') {
    const planned = upcomingGroup(rows, scope, today, params.starts_on);
    // The page asked for the rate that starts on a day; when no rate starts that day any more, it was cancelled or moved.
    const wanted = params.starts_on && planned && planned.startsOn !== params.starts_on ? null : planned;
    if (wanted) {
      return {
        draft: withStart(draftFromRows(wanted.rows, priceType, true, zeroStart), 'other', wanted.startsOn),
        context: { ...base, mode, priceTypeChoosable: false, editingIds: wanted.rows.map(r => r.id), originalStart: wanted.startsOn },
      };
    }
    return { draft: emptyDraft(priceType), context: { ...base, mode, priceTypeChoosable: false, plannedGone: true } };
  }

  // ---- change / correct: the rate in force (else the planned one, else the last one) ----
  const inForce = rowsInForce(rows, scope, today);
  const planned = inForce.length === 0 ? upcomingGroup(rows, scope, today) : null;
  const source = inForce.length > 0 ? inForce : planned ? planned.rows : latestEnded(rows, scope, today);
  const draft = source.length > 0 ? draftFromRows(source, priceType, true, zeroStart) : emptyDraft(priceType);

  if (mode === 'correct') {
    const start = (params.starts_on && source.some(r => day(r.effective_from) === params.starts_on)
      ? params.starts_on
      : source.map(r => day(r.effective_from)).sort()[0]) || today;
    return {
      draft: withStart(draft, 'fixed', start),
      context: { ...base, mode, priceTypeChoosable: false, managerOnly: !rights.canCorrect },
    };
  }

  const preselect = params.starts_on ? withStart(draft, 'other', params.starts_on) : draft;
  return { draft: preselect, context: { ...base, mode: 'change', priceTypeChoosable: false } };
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

export interface Validation {
  ok: boolean;
  /** Keys: startsOn, bands, band.<i>.upTo, band.<i>.rent, band.<i>.labour, band.<i>.tax, labour, tax. */
  errors: Record<string, string>;
}

export function validate(draft: Draft, ctx: EditorContext): Validation {
  const errors: Record<string, string> = {};
  const oneTime = draft.priceType === 'one_time';

  if (!draft.startsOn) {
    errors.startsOn = t('pricing.edit.chooseDate');
  } else if (!correcting(draft, ctx) && draft.startsOn < startFloor(ctx.today, ctx.earliestStart)) {
    // A day from the server is named; without one (an older server) the old three-year window is described.
    errors.startsOn = ctx.earliestStart
      ? t('pricing.error.invalidDate', { date: dateText(ctx.earliestStart) })
      : t('pricing.error.invalidDateWindow');
  } else if (!correcting(draft, ctx) && !dayInWindow(draft.startsOn, ctx.today, ctx.earliestStart)) {
    errors.startsOn = t('pricing.error.startTooFar');
  }

  if (draft.bands.length > MAX_BANDS) errors.bands = t('pricing.error.tooManyBands');

  if (ctx.customerId && draft.firstFromText !== undefined && wholeKg(draft.firstFromText) === null) {
    errors.firstFrom = t('pricing.edit.err.wholeKg');
  }

  draft.bands.forEach((band, i) => {
    // The rate's own bands are sent as loaded and never checked here.
    if (i < (draft.locked ?? 0)) return;
    const upTo = wholeKg(band.upTo);
    if (upTo === null) {
      errors[`band.${i}.upTo`] = t('pricing.edit.err.wholeKg');
    } else if (upTo <= 0) {
      errors[`band.${i}.upTo`] = t('pricing.edit.err.moreThanZero');
    } else {
      const from = fromOf(draft, i);
      if (from !== null && upTo < from) {
        errors[`band.${i}.upTo`] = t('pricing.edit.err.afterStart', {
          kg: localizeDigits(String(from - 1)),
          start: localizeDigits(String(from)),
        });
      }
    }
    if (i > 0 && band.fromText !== undefined) {
      const start = wholeKg(band.fromText);
      const before = wholeKg(draft.bands[i - 1].upTo);
      if (!ctx.customerId) {
        // The server refuses a default rate with a gap (BANDS_GAP): weights without a rate would have no price.
        errors[`band.${i}.from`] = t('pricing.edit.err.gapDefault');
      } else if (start === null) {
        errors[`band.${i}.from`] = t('pricing.edit.err.wholeKg');
      } else if (before !== null && start <= before) {
        errors[`band.${i}.from`] = t('pricing.edit.err.fromOverlap', {
          kg: localizeDigits(String(before)),
          next: localizeDigits(String(before + 1)),
        });
      }
    }
    if (rentNumber(band.rent) === null) errors[`band.${i}.rent`] = t('pricing.edit.err.rent');
    if (band.labour !== undefined && !oneTime && labourNumber(band.labour) === null) {
      errors[`band.${i}.labour`] = t('pricing.edit.err.labour');
    }
    if (band.tax !== undefined) {
      const tax = priceNumber(band.tax, 2);
      if (tax === null || tax > 100) errors[`band.${i}.tax`] = t('pricing.edit.err.tax');
    }
  });

  const shared = !draft.bands.some(b => b.labour !== undefined);
  if (shared && !oneTime && labourNumber(draft.labour) === null) errors.labour = t('pricing.edit.err.labour');
  if (!draft.bands.some(b => b.tax !== undefined)) {
    if (draft.tax.trim() === '') errors.tax = t('pricing.edit.err.taxRequired');
    else {
      const tax = priceNumber(draft.tax, 2);
      if (tax === null || tax > 100) errors.tax = t('pricing.edit.err.tax');
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Where band `i` starts for the change check: the number typed or stored, else the text if it is not a number. */
function startOf(d: Draft, i: number): number | string | null {
  const b = d.bands[i];
  if (b.fromText !== undefined) return wholeKg(b.fromText) ?? `text:${b.fromText}`;
  return b.gapFrom ?? null;
}

/** True when the draft differs from the one the form opened with (any field). */
export function hasChanges(draft: Draft, initial: Draft): boolean {
  if (draft.locked !== undefined) {
    // Add rate on a rate in force: only what is typed in the new bands counts (opening, or the choice of day, is no change;
    // with no new band left there is nothing to save).
    const mine = draft.bands.slice(draft.locked);
    const first = initial.bands.slice(initial.locked ?? 0);
    if (mine.length === 0) return false;
    return mine.length !== first.length || mine.some((b, i) => b.upTo !== first[i].upTo || b.rent !== first[i].rent || b.labour !== first[i].labour || b.tax !== first[i].tax);
  }
  const key = (d: Draft) =>
    JSON.stringify([d.priceType, d.startsOn, d.startsOnChoice, d.firstFrom, d.firstFromText !== undefined && wholeKg(d.firstFromText) === null ? d.firstFromText : null, d.labour, d.tax, d.bands.map((b, i) => [b.upTo, b.rent, b.labour ?? null, b.tax ?? null, startOf(d, i)])]);
  return key(draft) !== key(initial);
}

// ---------------------------------------------------------------------------------------------
// The call and the texts
// ---------------------------------------------------------------------------------------------

/** The ids of the rows of one scope that the screen loaded (sent as p_seen_rows). */
export function seenRowIds(rows: ItemStoragePrice[], customerId: string | null, priceType: PriceType): string[] {
  return rows.filter(r => inScope(r, { customerId, priceType })).map(r => r.id);
}

/** The rows of one scope with their content, as text: two reads of the item with the same text hold the same rates for that scope. */
export function scopeRowsKey(rows: ItemStoragePrice[], customerId: string | null, priceType: PriceType): string {
  return JSON.stringify(rows.filter(r => inScope(r, { customerId, priceType })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

export function toReplaceInput(draft: Draft, ctx: EditorContext): ReplaceRatesInput {
  const oneTime = draft.priceType === 'one_time';
  const planned = ctx.mode === 'upcoming' ? ctx.originalStart : null;
  // A correction (and an unmoved planned rate) replaces only the rows that start on that day; a moved
  // planned rate is first undone from its old start, then changed from the new one, in one call.
  const mode: 'change' | 'correct' = correcting(draft, ctx) || (planned !== null && draft.startsOn === planned) ? 'correct' : 'change';
  const moveFrom = planned !== null && draft.startsOn !== planned ? planned : null;
  return {
    mode,
    ...(moveFrom ? { move_from: moveFrom } : {}),
    seen_rows: seenRowIds(ctx.rows, ctx.customerId, draft.priceType),
    item_id: ctx.itemId,
    customer_id: ctx.customerId,
    price_type: draft.priceType,
    starts_on: draft.startsOn ?? '',
    bands: draft.bands.map((band, i) => {
      // The rate's own bands go back exactly as loaded (the rows' numbers, never a reading of the text shown).
      const own = i < (draft.locked ?? 0) ? ctx.lockedRows?.[i] : undefined;
      if (own) {
        return { weight_min: own.weight_min, weight_max: own.weight_max, unit_price: own.unit_price, labour_rate: own.labour_rate, tax_percent: own.tax_percent };
      }
      return {
      weight_min: fromOf(draft, i) ?? 0,
      weight_max: wholeKg(band.upTo) ?? 0,
      unit_price: round2(priceNumber(band.rent, 2) ?? 0),
      // Labour is included in a one-time rate: the server stores 0 whatever is sent.
      labour_rate: oneTime ? 0 : round2(priceNumber(band.labour ?? draft.labour, 2) ?? 0),
      tax_percent: priceNumber(band.tax ?? draft.tax, 2) ?? 0,
      };
    }),
  };
}

/** "₹11.00", or "₹6.00–₹9.50" for several bands. */
function figure(amounts: number[]): string {
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

/** The rows in force the day before the new rate starts: the rate that stays for earlier lots. */
function earlierRows(draft: Draft, ctx: EditorContext): ItemStoragePrice[] {
  if (!draft.startsOn) return [];
  return rowsInForce(
    ctx.rows.filter(r => !ctx.editingIds.includes(r.id)),
    { customerId: ctx.customerId, priceType: draft.priceType },
    addDays(draft.startsOn, -1)
  );
}

const sharedEnd = (rows: ItemStoragePrice[]): string | null => {
  const ends = new Set(rows.map(r => day(r.effective_to)));
  return rows.length > 0 && ends.size === 1 && [...ends][0] !== '' ? [...ends][0] : null;
};

/**
 * A last day is a stop only when no rate follows it: a rate that simply ends the day before another
 * one starts is not stopping (the item page says the same, scopeView.stopsAfter).
 */
function notFollowed(end: string | null, draft: Draft, ctx: EditorContext): string | null {
  if (!end || !draft.startsOn) return end;
  const next = addDays(end, 1);
  const replaced = (r: ItemStoragePrice) => ctx.editingIds.includes(r.id) || (correcting(draft, ctx) && day(r.effective_from) === draft.startsOn);
  const followed = ctx.rows.some(
    r => inScope(r, { customerId: ctx.customerId, priceType: draft.priceType }) && !replaced(r) &&
      day(r.effective_from) > (draft.startsOn as string) && day(r.effective_from) <= next
  );
  return followed ? null : end;
}

/**
 * What the success toast says about a stop. The server's answer wins, and a server answer of "no
 * stop" (null) is a statement too; only an answer that is missing falls back to what the draft knew.
 */
export function savedStop(serverEnd: string | null | undefined, draft: Draft, ctx: EditorContext): string | null {
  if (serverEnd === undefined) return keptEnd(draft, ctx);
  return notFollowed(serverEnd, draft, ctx);
}

/**
 * The last day the server keeps for the new rate (a scheduled stop), or null when the rate runs on.
 * A correction keeps the end of the rows it replaces; a change keeps the common end of the rows in
 * force on its start when no rate starts after it (migration 76, replace_item_rates).
 */
export function keptEnd(draft: Draft, ctx: EditorContext): string | null {
  if (!draft.startsOn) return null;
  const scope: Scope = { customerId: ctx.customerId, priceType: draft.priceType };
  if (ctx.mode === 'upcoming') return notFollowed(sharedEnd(ctx.rows.filter(r => ctx.editingIds.includes(r.id))), draft, ctx);
  if (correcting(draft, ctx)) {
    return notFollowed(sharedEnd(rowsInForce(ctx.rows, scope, draft.startsOn).filter(r => day(r.effective_from) === draft.startsOn)), draft, ctx);
  }
  const others = ctx.rows.filter(r => !ctx.editingIds.includes(r.id));
  if (others.some(r => inScope(r, scope) && day(r.effective_from) > (draft.startsOn as string))) return null;
  return sharedEnd(rowsInForce(others, scope, draft.startsOn));
}

/** "Lots received from 1 Jan 2027 are charged the new rate. Lots received before keep ₹11.00." */
export function lotsRule(draft: Draft, ctx: EditorContext): string | null {
  if (ctx.mode === 'correct' || !draft.startsOn) return null;
  if (ctx.mode === 'addBand') {
    const date = dateText(draft.startsOn);
    if (draft.startsOnChoice !== 'ownStart') return t('pricing.edit.ruleBandToday', { date });
    if (startMoved(ctx)) return t('pricing.edit.ruleBandEarliest', { date });
    // The item's first rate (no row of the scope, ended ones too, starts before it) also covers earlier days (migration 129, find_storage_price).
    const scope: Scope = { customerId: ctx.customerId, priceType: draft.priceType };
    const first = !!ctx.ownStart && !ctx.rows.some(r => inScope(r, scope) && day(r.effective_from) < (ctx.ownStart as string));
    return t(first ? 'pricing.edit.ruleBandFirst' : 'pricing.edit.ruleBandOwn', { date });
  }
  const earlier = earlierRows(draft, ctx);
  if (earlier.length === 0) return t('pricing.edit.lotsRuleNone', { date: dateText(draft.startsOn) });
  return t('pricing.edit.lotsRule', { date: dateText(draft.startsOn), old: figure(earlier.map(r => r.unit_price)) });
}

/** What the rate is now for the weights of band `index` ("₹11.00"), or null when there is no such rate. */
export function nowText(draft: Draft, ctx: EditorContext, index: number): string | null {
  if (ctx.mode === 'add' || ctx.mode === 'addCustomer' || ctx.mode === 'addBand') return null;
  const from = fromOf(draft, index);
  if (from === null) return null;
  const current = rowsInForce(
    ctx.rows.filter(r => !ctx.editingIds.includes(r.id)),
    { customerId: ctx.customerId, priceType: draft.priceType },
    ctx.today
  ).find(r => r.weight_min <= from && from <= r.weight_max);
  return current ? money(current.unit_price) : null;
}

/** The "What changes" card: the old rate until the day before, then the new one. Empty until the form is valid. */
export function summaryLines(draft: Draft, ctx: EditorContext): string[] {
  if (!draft.startsOn) return [];
  const unit = unitText(draft.priceType);
  const rents = draft.bands.map(b => priceNumber(b.rent, 2));
  const spans = draft.bands.map((b, i) => [fromOf(draft, i), wholeKg(b.upTo)] as const);
  if (rents.some(r => r === null) || spans.some(([a, b]) => a === null || b === null)) return [];
  const date = dateText(draft.startsOn);
  const kept = keptEnd(draft, ctx);
  const stillStops = kept ? [t('pricing.edit.stillStops', { date: dateText(kept) })] : [];

  if (ctx.mode === 'addBand') {
    // The rate's bands and the new ones, from the day chosen; with Today the rate they replace is named first.
    const lines: string[] = [];
    if (draft.startsOnChoice !== 'ownStart' && (ctx.lockedRows?.length ?? 0) > 0) {
      lines.push(t('pricing.edit.until', { date: dateText(addDays(draft.startsOn, -1)), amount: figure((ctx.lockedRows ?? []).map(r => r.unit_price)), unit }));
    }
    draft.bands.forEach((_, i) => {
      lines.push(t('pricing.edit.fromBand', { date, band: bandText(spans[i][0] as number, spans[i][1] as number), amount: money(rents[i] as number), unit }));
    });
    return [...lines, ...stillStops];
  }
  if (ctx.mode === 'correct') {
    return [t('pricing.edit.corrected', { date, amount: figure(rents as number[]), unit }), ...stillStops];
  }
  const lines: string[] = [];
  if (ctx.mode === 'upcoming' && ctx.originalStart && ctx.originalStart !== draft.startsOn) {
    lines.push(t('pricing.edit.moves', { from: dateText(ctx.originalStart), to: date }));
  }
  const earlier = earlierRows(draft, ctx);
  if (earlier.length > 0 && draft.startsOn) {
    lines.push(t('pricing.edit.until', { date: dateText(addDays(draft.startsOn, -1)), amount: figure(earlier.map(r => r.unit_price)), unit }));
  }
  if (draft.bands.length === 1) {
    lines.push(t('pricing.edit.fromLine', { date, amount: money(rents[0] as number), unit }));
  } else {
    draft.bands.forEach((_, i) => {
      lines.push(
        t('pricing.edit.fromBand', {
          date,
          band: bandText(spans[i][0] as number, spans[i][1] as number),
          amount: money(rents[i] as number),
          unit,
        })
      );
    });
  }
  return [...lines, ...stillStops];
}

// ---------------------------------------------------------------------------------------------
// The stop screen
// ---------------------------------------------------------------------------------------------

export interface StopChip {
  id: 'today' | 'monthEnd' | 'yearEnd';
  day: string;
}

const lastOfMonth = (isoDay: string): string => {
  const [y, m] = isoDay.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

/** The last day to offer: today, the end of this month, the end of this financial year (31 March). Equal days are offered once. */
export function stopChips(today: string): StopChip[] {
  const [y, m] = today.split('-').map(Number);
  const candidates: StopChip[] = [
    { id: 'today', day: today },
    { id: 'monthEnd', day: lastOfMonth(today) },
    { id: 'yearEnd', day: `${m <= 3 ? y : y + 1}-03-31` },
  ];
  return candidates.filter((chip, i) => candidates.findIndex(other => other.day === chip.day) === i);
}

/**
 * What a customer pays once the customer's own rate has stopped: the rents of the default rate
 * that cover all the customer's weights, or null when the default leaves some of them without a rate.
 */
export function rateAfterCustomerStop(
  rows: ItemStoragePrice[],
  customerId: string,
  priceType: PriceType,
  today: string,
  /** The day the customer starts paying the default rate (default: today). */
  fromDay: string = today
): number[] | null {
  const own = rowsInForce(rows, { customerId, priceType }, today);
  const defaults = rowsInForce(rows, { customerId: null, priceType }, fromDay);
  if (defaults.length === 0) return null;
  const covered = (from: number, to: number): boolean => {
    let next = from;
    for (const r of defaults) {
      if (r.weight_min <= next && r.weight_max >= next) next = r.weight_max + 1;
      if (next > to) return true;
    }
    return next > to;
  };
  if (own.some(r => !covered(r.weight_min, r.weight_max))) return null;
  const used = own.length === 0 ? defaults : defaults.filter(d => own.some(r => d.weight_min <= r.weight_max && d.weight_max >= r.weight_min));
  return used.map(r => r.unit_price);
}
