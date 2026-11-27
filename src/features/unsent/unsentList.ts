/**
 * What the "Unsent items" screen lists (WH-301, contract section 10; Design 4.2): the signed-in person's own items, the
 * ones not sent yet oldest first and the ones sent today newest first, each with the words of its row. Another person's
 * items are never listed (spec step 27).
 */
import { useEffect, useState } from 'react';
import { createLogger, loggableError } from '@/utils/logger';
import { t as tr } from '@/i18n';
import { orderEffectLines, parseOrderEffects } from '@/services/orderEffects';
import { describeReason, reasonOf } from '@/features/holding/heldReason';
import { heldWhatText } from '@/features/holding/heldWhat';
import { ownHeldCopyRows, type HeldCopyRow } from '@/features/holding/heldRows';
import { listOwnForms, type FormKind } from './formDrafts';
import { refusalCodeOf, refusalFamilyOf } from './refusalTags';
import { answerFiguresOf } from './refusalAnswer';
import { DEPENDS_ON_REFUSED } from './sendEngine';
import { listItems, otherPeople, photosOfItem, type UnsentRowView } from './unsentQueue';
import { getLastSentAt, type ItemState } from './unsentRows';
import { subscribeUnsent } from './unsentStore';

const logger = createLogger('[unsent-list]');

export interface UnsentListRow {
  id: string;
  state: ItemState;
  section: 'unfinished' | 'unsent' | 'held' | 'sent';
  /** The row's title in the person's language, and the customer. */
  title: string;
  customer: string | null;
  recordedAt: number;
  /** The server's number once a record is sent ("Sent · GRN 312"), 0-9 as an identifier. */
  sentNumber: string | null;
  /** A photo file of this item is gone from the phone (the record was sent without it). */
  photoMissing: boolean;
  /** The tag shown at the right; an unfinished form has none. */
  tag: 'saved' | 'sending' | 'sent' | 'waiting' | 'held' | 'notPassedOn' | 'rejected' | 'accepted' | null;
  /** Set for an unfinished form (the row of "Not finished"): which form it is. */
  form: { kind: FormKind; grnId: string | null } | null;
  /** Under "Held": why it was not sent (the footnote); null when nothing is known. */
  reason: string | null;
  /** The document an accepted held item became ("Accepted · GRN 311"): which kind of document `sentNumber` is the number of. */
  sentDoc?: 'grn' | 'dispatch';
  /** Set on a row that comes from the copy (the server holds the item): the id its page opens by. */
  heldId?: string;
  /** A refused item that could not be handed over: the reason's tag, for the Delete confirmation (Design 7.11). */
  notPassedOnReason?: string;
  /** Under "Sent today" for a dispatch whose send changed open orders (WH-161, PQ5). */
  orderNotes?: string[];
  /** The record a tap opens, when it exists. */
  target: { grnId?: string; dispatchId?: string };
}

export interface UnsentListState {
  loaded: boolean;
  rows: UnsentListRow[];
  lastSentAt: number | null;
  /** Another person's unsent items on this phone: their name and how many; never listed, sent or deleted here. */
  others: { name: string; count: number }[];
}

const numberOf = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.number === 'string' || typeof record.number === 'number') return String(record.number);
  if (typeof record.gr_no === 'string' && record.gr_no !== '') return `${tr('common.grn')} ${record.gr_no}`;
  if (typeof record.disp_no === 'string' && record.disp_no !== '') return `${tr('common.dispatch')} ${record.disp_no}`;
  return null;
};

/** The lines of `order_effects` from a sent dispatch answer, in the online dialog's words (WH-161, PQ5). */
export const orderNotesOfResult = (result: unknown): string[] => {
  if (typeof result !== 'object' || result === null || !('order_effects' in result)) return [];
  return orderEffectLines(parseOrderEffects((result as { order_effects?: unknown }).order_effects));
};

/** The lead and bulleted lines behind `document-success-order-notes`, or null when empty. */
export const formatOrderNotes = (lines: readonly string[] | undefined): string | null =>
  lines && lines.length > 0 ? `${tr('orders.effect.doneLead')}\n${lines.map(line => `• ${line}`).join('\n')}` : null;

const sentTargetOf = (target: UnsentRowView['target'], result: unknown): UnsentRowView['target'] => {
  if (typeof result !== 'object' || result === null) return target;
  const record = result as Record<string, unknown>;
  if (typeof record.grn_id === 'string' && record.grn_id !== '') return { ...target, grnId: record.grn_id };
  if (typeof record.dispatch_id === 'string' && record.dispatch_id !== '') return { ...target, dispatchId: record.dispatch_id };
  return target;
};

/** The words for what an item is. A photos item is described from its files; any other kind keeps the words it was saved with. */
async function titleOf(row: UnsentRowView): Promise<{ title: string; photoMissing: boolean }> {
  if (row.kind !== 'photos') return { title: row.what, photoMissing: false };
  const photos = await photosOfItem(row.id);
  const count = photos.length;
  const dispatch = row.photoDoc === 'dispatch';
  const number = row.targetNumber;
  // A document with no number yet (a new one not sent) is "the new GRN" or "the new dispatch" (Design 4.10).
  const key = number
    ? dispatch
      ? 'offline.unsent.whatPhotosDispatch'
      : 'offline.unsent.whatPhotos'
    : dispatch
      ? 'offline.unsent.whatPhotosNewDispatch'
      : 'offline.unsent.whatPhotosNewGrn';
  return {
    title: tr(key, { count, number: number ?? '' }),
    photoMissing: photos.some(photo => photo.missing === 1),
  };
}

/** The tag of a row: a record waiting for the GRN it depends on reads "Waiting for its GRN". */
function tagOf(state: ItemState): UnsentListRow['tag'] {
  switch (state) {
    case 'held':
      return 'held';
    case 'sending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'waiting':
      return 'waiting';
    case 'refused':
      return 'held';
    case 'saved':
      return 'saved';
  }
}

/**
 * The footnote of a held item: what follows a refused item says so in its own words, never the refused item's reason
 * (Design 4.6). A refused item never shows the server's raw text: a code with a row in 7.5 shows its tag ("Refused: Stock
 * short", Design 4.10 of 2026-11-27; the answer carries no figures for the full sentence), any other code `refusedGeneric`.
 */
function heldReason(reason: string | null, result: unknown, view: Pick<UnsentRowView, 'kind' | 'customer'>): string | null {
  if (reason === null) return null;
  if (reason === DEPENDS_ON_REFUSED) return tr('offline.unsent.dependsOnRefused');
  const family = refusalFamilyOf(refusalCodeOf(result));
  if (!family) return tr('offline.unsent.refusedGeneric');
  const tag = tr('offline.unsent.refusedTag', { tag: tr(`offline.unsent.refusedTags.${family}`) });
  // A reason with a row in Design 7.5 tells its sentence from the server's own figures (its answer is kept with the item); any
  // other reason, or a sentence whose figures are missing, tells the tag.
  if (reasonOf(family) !== family) return tag;
  const answer = typeof result === 'object' && result !== null ? (result as { answer?: unknown }).answer : undefined;
  return describeReason(family, { kind: view.kind, what: null, customer: view.customer, data: answerFiguresOf(answer), followsWhat: null }).sentence ?? tag;
}

/** The short tag of the reason of a refused item (Design 7.5, 7.9): "Stock short", or "Refused" for a code with no row. */
function reasonTagOf(result: unknown): string {
  const family = refusalFamilyOf(refusalCodeOf(result));
  return family ? tr(`offline.unsent.refusedTags.${family}`) : tr('offline.holding.tags.other');
}

/**
 * The tag and footnote of a refused row whose hand-over to the server is still to come (Design 7.9 DQ8, 7.11): "Sending…"
 * with the hand-over line while the first attempt is under way, "Not passed on" with its own line once an attempt failed;
 * what follows the refused item says so in its own words then (4.6).
 */
function handingOver(view: UnsentRowView): { tag: 'sending' | 'notPassedOn'; reason: string } {
  if (!view.handoverFailed) return { tag: 'sending', reason: tr('offline.holding.handingOver') };
  const dependant = view.reason === DEPENDS_ON_REFUSED;
  return { tag: 'notPassedOn', reason: dependant ? tr('offline.unsent.dependsOnRefused') : tr('offline.holding.notPassedOnText', { reason: reasonTagOf(view.result) }) };
}

export async function loadUnsentList(): Promise<Omit<UnsentListState, 'loaded'>> {
  const views = await listItems();
  const rows: UnsentListRow[] = [];
  for (const view of views) {
    const { title, photoMissing } = await titleOf(view);
    const passing = view.section === 'unsent' && view.state === 'refused' ? handingOver(view) : null;
    rows.push({
      id: view.id,
      state: view.state,
      section: view.section,
      title,
      customer: view.customer,
      recordedAt: view.recordedAt,
      sentNumber: view.section === 'sent' ? numberOf(view.result) : null,
      photoMissing,
      tag: passing ? passing.tag : tagOf(view.state),
      form: null,
      reason: passing ? passing.reason : view.section === 'held' ? heldReason(view.reason, view.result, view) : null,
      ...(passing?.tag === 'notPassedOn' ? { notPassedOnReason: reasonTagOf(view.result) } : {}),
      orderNotes: view.section === 'sent' && view.kind === 'newDispatch' ? orderNotesOfResult(view.result) : [],
      target: view.section === 'sent' ? sentTargetOf(view.target, view.result) : view.target,
    });
  }
  // "Not sent yet" oldest first (the order they are sent); "Held": each refused item with what follows it directly under
  // it; "Sent today" newest first.
  const unsent = rows.filter(row => row.section === 'unsent');
  // The rows of the copy the person recorded (held, rejected, accepted today), but not an item the file still has too.
  const inFile = new Set(views.flatMap(view => (view.heldId === null ? [] : [view.heldId])));
  const fromCopy = ownHeldCopyRows().filter(row => !inFile.has(row.id)).map(copyRow);
  const idOfHeld = new Map(views.flatMap(view => (view.heldId === null ? [] : [[view.heldId, view.id] as const])));
  const heldRows = [
    ...views.filter(view => view.section === 'held').map(view => ({ id: view.id, parent: view.dependsOn })),
    ...fromCopy.filter(entry => entry.row.section === 'held').map(entry => ({ id: entry.row.id, parent: entry.follows === null ? null : (idOfHeld.get(entry.follows) ?? entry.follows) })),
  ];
  const everyRow = [...rows, ...fromCopy.map(entry => entry.row)];
  const heldIds = new Set(heldRows.map(entry => entry.id));
  const roots = heldRows
    .filter(entry => !(entry.parent !== null && heldIds.has(entry.parent)))
    .sort((a, b) => (everyRow.find(row => row.id === a.id)?.recordedAt ?? 0) - (everyRow.find(row => row.id === b.id)?.recordedAt ?? 0));
  const held: UnsentListRow[] = [];
  const place = (id: string) => {
    const row = everyRow.find(own => own.id === id);
    if (row) held.push(row);
    for (const entry of heldRows) if (entry.parent === id) place(entry.id);
  };
  for (const root of roots) place(root.id);
  const sent = [...rows.filter(row => row.section === 'sent'), ...fromCopy.filter(entry => entry.row.section === 'sent').map(entry => entry.row)].reverse();
  const unfinished = (await listOwnForms()).map(formRow);
  return { rows: [...unfinished, ...unsent, ...held, ...sent], lastSentAt: await getLastSentAt(), others: await otherPeople() };
}

/** The row of an item of the copy the person recorded (WH-304, Design 7.4): held, rejected, or accepted today. */
function copyRow(held: HeldCopyRow): { row: UnsentListRow; follows: string | null } {
  const raw = held.raw;
  const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
  const follows = text(raw.follows);
  const recordedAt = Date.parse(text(raw.recorded_at) ?? '');
  const base = {
    id: held.id,
    state: 'held' as const,
    title: heldWhatText(raw.what),
    customer: text(raw.customer_name),
    recordedAt: Number.isNaN(recordedAt) ? 0 : recordedAt,
    sentNumber: null,
    photoMissing: false,
    form: null,
    heldId: held.id,
  };
  if (held.state === 'accepted') {
    const result = typeof raw.result === 'object' && raw.result !== null ? (raw.result as Record<string, unknown>) : {};
    const grn = text(result.grn_id);
    const dispatch = text(result.dispatch_id);
    const dispatchNumber = text(result.disp_no);
    return {
      follows,
      row: {
        ...base,
        state: 'sent',
        section: 'sent',
        tag: 'accepted',
        sentNumber: dispatchNumber ?? text(result.gr_no),
        sentDoc: dispatchNumber === null ? 'grn' : 'dispatch',
        reason: null,
        target: { ...(grn === null ? {} : { grnId: grn }), ...(dispatch === null ? {} : { dispatchId: dispatch }) },
      },
    };
  }
  if (held.state === 'rejected') {
    return { follows, row: { ...base, section: 'held', tag: 'rejected', reason: text(raw.reject_reason), target: {} } };
  }
  const reason = reasonOf(raw.reason);
  const words = describeReason(reason, { kind: held.kind, what: raw.what, customer: text(raw.customer_name), data: raw.reason_data, followsWhat: null });
  return {
    follows,
    row: {
      ...base,
      section: 'held',
      tag: 'held',
      // What follows a held item says so in its own words, never the held item's reason (Design 4.6).
      reason: reason === 'followsHeld' ? tr('offline.unsent.dependsOnRefused') : (words.sentence ?? tr('offline.unsent.refusedTag', { tag: words.tag })),
      target: {},
    },
  };
}

/** A row of "Not finished": the form's words, when it was started, no tag. */
function formRow(form: Awaited<ReturnType<typeof listOwnForms>>[number]): UnsentListRow {
  const title =
    form.kind === 'grn'
      ? tr('offline.unsent.whatFormGrn')
      : form.kind === 'dispatch'
        ? tr('offline.unsent.whatFormDispatch')
        : tr('offline.unsent.whatFormEdit', { number: form.number ?? '' });
  return {
    id: form.id,
    state: 'saved',
    section: 'unfinished',
    title,
    customer: form.customer,
    recordedAt: form.startedAt,
    sentNumber: null,
    photoMissing: false,
    tag: null,
    form: { kind: form.kind, grnId: form.grnId },
    reason: null,
    target: {},
  };
}

/** The list as a hook: loaded again on every change of the store. */
export function useUnsentList(): UnsentListState {
  const [state, setState] = useState<UnsentListState>({ loaded: false, rows: [], lastSentAt: null, others: [] });
  useEffect(() => {
    // The latest read wins; one that answers after the screen is gone is dropped.
    let latest = 0;
    let live = true;
    const run = async () => {
      const mine = ++latest;
      let next: UnsentListState;
      try {
        next = { loaded: true, ...(await loadUnsentList()) };
      } catch (error) {
        logger.warn('The unsent list could not be read', loggableError(error));
        next = { loaded: true, rows: [], lastSentAt: null, others: [] };
      }
      if (live && mine === latest) setState(next);
    };
    void run();
    const stop = subscribeUnsent(() => void run());
    return () => {
      live = false;
      stop();
    };
  }, []);
  return state;
}
