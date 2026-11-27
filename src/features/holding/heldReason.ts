/**
 * Why an item is held, in words (WH-304; product/design/offline-capture.md 7.5 and 7.9 DQ1, DQ2; contract section 2.1): the twelve
 * reasons the server names, each with a tag, a sentence and a fix hint. A figure the server could not give leaves its clause out:
 * the sentence is the variant without it (Design gives the deleted and locked ones), or none; never a placeholder, "unknown" or an
 * empty value (DQ2). A hint that needs a figure it lacks falls back to the hint of `other`.
 */
import { formatDate } from '@/utils/formatters';
import { t as tr, type TranslationKey } from '@/i18n';

export const HELD_REASONS = [
  'stockShort', 'noRate', 'numberUsed', 'numberFormat', 'deleted', 'locked', 'dateRefused', 'duplicate', 'belowDispatched',
  'followsHeld', 'moved', 'other',
] as const;
export type HeldReason = (typeof HELD_REASONS)[number];

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const numberOf = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The reason a value names; a name this app does not know is `other`, never an error. */
export function reasonOf(value: unknown): HeldReason {
  return HELD_REASONS.find(reason => reason === value) ?? 'other';
}

/** The short tag of a reason (7.5, 7.9). */
export function reasonTag(reason: HeldReason): string {
  if (reason === 'followsHeld') return tr('offline.holding.tags.waits');
  if (reason === 'moved') return tr('offline.holding.tags.moved');
  if (reason === 'other') return tr('offline.holding.tags.other');
  return tr(`offline.unsent.refusedTags.${reason}` as TranslationKey);
}

export interface ReasonContext {
  /** The item's kind (`newGrn`, `newDispatch`, `lotChange`, `grnEdit`, `photos`), for the word "GRN" or "dispatch". */
  kind: string;
  /** The item's `what` as the phone handed it over (`{ key, params }`): its number is the document's. */
  what: unknown;
  customer: string | null;
  /** `reason_data`: the figures of the refusal. */
  data: unknown;
  /** What the item before this one is, for `followsHeld`; null when the screen does not know. */
  followsWhat: string | null;
}

const documentWord = (kind: string, what: unknown): string => {
  const key = isFields(what) && typeof what.key === 'string' ? what.key : '';
  const dispatch = kind === 'newDispatch' || key.includes('Dispatch');
  return tr(dispatch ? 'common.importedDocument.dispatch' : 'common.importedDocument.grn');
};

const numberOfWhat = (what: unknown): string | null => (isFields(what) && isFields(what.params) ? textOf(what.params.number) : null);

const dateOf = (value: unknown): string | null => {
  const raw = textOf(value);
  return raw === null ? null : formatDate(raw);
};

function sentenceOf(reason: HeldReason, ctx: ReasonContext): string | null {
  const data = isFields(ctx.data) ? ctx.data : {};
  const document = documentWord(ctx.kind, ctx.what);
  const number = textOf(data.number) ?? numberOfWhat(ctx.what);
  switch (reason) {
    case 'stockShort': {
      const lines = Array.isArray(data.lines) ? (data.lines as unknown[]) : [];
      const parts = lines.flatMap(line => {
        if (!isFields(line)) return [];
        const lot = textOf(line.item_name);
        const available = numberOf(line.available);
        const quantity = numberOf(line.requested);
        return lot !== null && available !== null && quantity !== null ? [tr('offline.holding.sentence.stockShort', { lot, available, quantity })] : [];
      });
      return parts.length > 0 ? parts.join(' ') : null;
    }
    case 'noRate': {
      const lines = Array.isArray(data.lines) ? (data.lines as unknown[]) : [];
      const first = lines.find(isFields);
      const item = textOf(isFields(first) ? first.item_name : null) ?? textOf(data.item_name);
      return item !== null && ctx.customer !== null ? tr('offline.holding.sentence.noRate', { item, customer: ctx.customer }) : null;
    }
    case 'numberUsed':
      return number === null ? null : tr('offline.holding.sentence.numberUsed', { number, document });
    case 'numberFormat':
      return number === null ? null : tr('offline.holding.sentence.numberFormat', { number });
    case 'deleted': {
      if (number === null) return null;
      const name = textOf(data.deleted_by_name);
      const date = dateOf(data.deleted_at);
      return name !== null && date !== null
        ? tr('offline.holding.sentence.deleted', { document, number, name, date })
        : tr('offline.holding.sentence.deletedShort', { document, number });
    }
    case 'locked': {
      const field = textOf(data.field);
      const lockName = textOf(data.lock);
      const lock = lockName === 'dispatch' || lockName === 'invoice' || lockName === 'order' ? tr(`offline.holding.lock.${lockName}`) : null;
      if (field === null || number === null || lock === null) return null;
      const date = dateOf(data.since);
      return date === null
        ? tr('offline.holding.sentence.lockedShort', { field, document, number, lock })
        : tr('offline.holding.sentence.locked', { field, document, number, lock, date });
    }
    case 'dateRefused': {
      const date = dateOf(data.date) ?? dateOf(data.recorded_at);
      const rule = textOf(data.rule);
      return date !== null && rule !== null ? tr('offline.holding.sentence.dateRefused', { date, rule }) : null;
    }
    case 'duplicate': {
      const other = textOf(data.other) ?? textOf(data.other_gr_no);
      const date = dateOf(data.date) ?? dateOf(data.saved_at);
      return other !== null && date !== null ? tr('offline.holding.sentence.duplicate', { other, date }) : null;
    }
    case 'belowDispatched': {
      const quantity = numberOf(data.requested);
      const dispatched = numberOf(data.dispatched_qty);
      return quantity !== null && dispatched !== null ? tr('offline.holding.sentence.belowDispatched', { quantity, dispatched }) : null;
    }
    case 'followsHeld':
      return ctx.followsWhat === null ? null : tr('offline.holding.sentence.followsHeld', { what: ctx.followsWhat });
    case 'moved': {
      const admin = textOf(data.admin_name);
      const name = textOf(data.recorder_name);
      const date = dateOf(data.moved_at);
      return admin !== null && name !== null && date !== null ? tr('offline.holding.sentence.moved', { admin, name, date }) : null;
    }
    case 'other':
      return tr('offline.holding.sentence.other');
  }
}

function hintOf(reason: HeldReason, ctx: ReasonContext): string {
  const data = isFields(ctx.data) ? ctx.data : {};
  if (reason === 'noRate') {
    return ctx.customer === null ? tr('offline.holding.hint.other') : tr('offline.holding.hint.noRate', { customer: ctx.customer });
  }
  if (reason === 'duplicate') {
    const other = textOf(data.other) ?? textOf(data.other_gr_no);
    return other === null ? tr('offline.holding.hint.other') : tr('offline.holding.hint.duplicate', { other });
  }
  return tr(`offline.holding.hint.${reason}` as TranslationKey);
}

export interface ReasonWords {
  reason: HeldReason;
  tag: string;
  /** The sentence with its figures, or null when the figures are not there. */
  sentence: string | null;
  hint: string;
}

/** The tag, sentence and fix hint of a held item's reason. */
export function describeReason(value: unknown, ctx: ReasonContext): ReasonWords {
  const reason = reasonOf(value);
  return { reason, tag: reasonTag(reason), sentence: sentenceOf(reason, ctx), hint: hintOf(reason, ctx) };
}
