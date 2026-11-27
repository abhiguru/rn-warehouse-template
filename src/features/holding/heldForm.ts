/**
 * Correcting a held item in the kind's own form (WH-304, product/tech/app-offline-holding-list.md 5.2, Design 7.3 and 7.9 DQ4): the
 * form opens filled with the held values, and its last button, "Accept with changes", calls `decide_held_item` with the corrected body
 * and nothing else (no save, no queue, no draft, no 2-hour gate). This file holds what the forms share: the route id of a held
 * item, and how a decision's answer reads.
 */
import { t as tr, formatIdentifier } from '@/i18n';
import { refusalFamilyOf } from '@/features/unsent/refusalTags';
import { TOAST_DURATION_MS } from '@/utils/toast';
import { describeReason } from './heldReason';
import { decideHeldItem, type HeldItemDetail } from './holdingApi';

/** A held item in a form's route: `/grn-edit/held-<id>/step1`. A GRN id is a uuid and never starts so. */
const ROUTE_PREFIX = 'held-';

export const heldRouteId = (heldId: string): string => `${ROUTE_PREFIX}${heldId}`;

/** The held item's id when a form's route id names one, else null. */
export function heldIdOfRoute(routeId: string | null | undefined): string | null {
  return typeof routeId === 'string' && routeId.startsWith(ROUTE_PREFIX) && routeId.length > ROUTE_PREFIX.length ? routeId.slice(ROUTE_PREFIX.length) : null;
}

/** How long the "It replaced a newer entry" toast stays: twice the normal time (the sentence is longer). */
const REPLACED_TOAST_MS = TOAST_DURATION_MS * 2;

/** What a corrected Accept ended in, as the form acts on it. */
export type CorrectedOutcome =
  | { kind: 'accepted'; toast: string; /** Set when the toast needs longer than the normal time (a newer entry was replaced). */ durationMs?: number }
  | { kind: 'alreadyDecided'; toast: string }
  /** The save refused the corrected item again: the item stays held, with this reason in words. */
  | { kind: 'refused'; message: string }
  | { kind: 'failed' };

const isFields = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Accepts the item with the form's corrected body, under this visit's decision key (a repeat is one decision). */
export async function acceptWithChanges(item: Pick<HeldItemDetail, 'id' | 'kind' | 'what' | 'customerName'>, body: unknown, decisionKey: string): Promise<CorrectedOutcome> {
  const outcome = await decideHeldItem({ id: item.id, action: 'accept', decisionKey, body });
  if (outcome.kind === 'done') {
    const done = isFields(outcome.result) ? outcome.result : {};
    // A change to a record reads "Accepted: GRN {{number}} updated" (Design 7.9 DQ5), a new record "Accepted as {{number}}".
    const change = item.kind === 'lotChange' || item.kind === 'grnEdit' || item.kind === 'photos';
    const number = change ? (textOf(done.gr_no) ?? textOf(done.disp_no)) : (textOf(done.disp_no) ?? textOf(done.gr_no));
    // DQ14: a held GRN edit that replaced a newer entry says so, with the long toast.
    const replaced: unknown = done.replaced;
    if (item.kind === 'grnEdit' && Array.isArray(replaced) && replaced.length > 0 && number !== null) {
      return { kind: 'accepted', toast: tr('offline.holding.acceptedReplaced', { number: formatIdentifier(number) }), durationMs: REPLACED_TOAST_MS };
    }
    return { kind: 'accepted', toast: tr(change ? 'offline.holding.acceptedChange' : 'offline.holding.accepted', { number: formatIdentifier(number) }) };
  }
  if (outcome.kind === 'alreadyDecided') {
    const key = outcome.state === 'rejected' ? 'offline.holding.alreadyRejected' : 'offline.holding.alreadyAccepted';
    return { kind: 'alreadyDecided', toast: tr(key, { name: outcome.decidedByName ?? '' }) };
  }
  if (outcome.kind === 'refused') {
    const words = describeReason(refusalFamilyOf(outcome.code), { kind: item.kind, what: item.what, customer: item.customerName, data: outcome.data, followsWhat: null });
    return { kind: 'refused', message: [words.sentence ?? words.tag, words.hint].join(' ') };
  }
  return { kind: 'failed' };
}
