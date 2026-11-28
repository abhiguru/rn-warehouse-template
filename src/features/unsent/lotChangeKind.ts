/**
 * The `lotChange` kind (WH-302, product/tech/app-offline-quick-change.md section 3): a change of one lot's rack and mark,
 * made from the lot's row, sent as `set_lot_rack_and_mark` with the item's permanent request ID. Lane `record`: in order,
 * one at a time. Several changes to one lot before any attempt are one item (`lotChangeService.ts`).
 *
 * `from` is the value the phone expected the server to hold when the person changed it; `to` the new value. The server
 * stores `to` and, when it holds something else that another person set, records the replacement (last sent wins).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { OverlayPart } from '@/features/phone-copy/unsentOverlay';
import type { TranslationKey } from '@/i18n';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';
import { classify } from './sendEngine';
import { registerSendKind, type SendKind, type SendOutcome } from './sendKinds';

export interface FieldChange {
  to: string | null;
  from: string | null;
}

export type LotField = 'rack' | 'package_mark';

export interface LotChangeBody {
  lotId: string;
  grnId: string;
  /** Phone time of the latest save into this item, ISO. A merge takes the later save's time; a resend carries the same. */
  recordedAt: string;
  changes: { rack?: FieldChange; package_mark?: FieldChange };
  /** Phone only, never sent: what the item was before the latest save merged into it, so a refusal told at once can put it back (PQ7). */
  previous?: { recordedAt: string; changes: LotChangeBody['changes']; what: string };
}

/** The locale key of each field's label, in the order they are listed ("Rack, Mark"). */
export const LOT_FIELD_LABELS: Readonly<Record<LotField, TranslationKey>> = { rack: 'common.rack', package_mark: 'grn.item.mark' };
export const LOT_FIELDS: readonly LotField[] = ['rack', 'package_mark'];

const isChange = (value: unknown): value is FieldChange =>
  typeof value === 'object' && value !== null && 'to' in value && 'from' in value;

export function isLotChangeBody(value: unknown): value is LotChangeBody {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Partial<LotChangeBody>;
  return typeof body.lotId === 'string' && typeof body.grnId === 'string' && typeof body.changes === 'object' && body.changes !== null;
}

/** The fields the body carries, in the order Rack, Mark. */
export const changedLotFields = (body: LotChangeBody): LotField[] => LOT_FIELDS.filter(field => isChange(body.changes[field]));

async function sendLotChange(body: LotChangeBody, requestKey: string): Promise<SendOutcome> {
  if (!isLotChangeBody(body)) return { kind: 'refused', reason: 'lotChange: unreadable body' };
  const client = await getAuthenticatedClient({ quietWrite: true });
  const answer = await client.rpc('set_lot_rack_and_mark', {
    p_lot_id: body.lotId,
    p_changes: { ...body.changes, recorded_at: body.recordedAt },
    p_request_key: requestKey,
  });
  // An unreadable HTTP 200, an empty one and a gateway's 502 / 504 are a LOST answer (the change may be applied), not a
  // plain transient failure: the item then stays tried, is checked by its request key, and is never merged into again.
  const error = answer.error ?? emptyAnswerAsError({ data: answer.data, error: answer.error, status: answer.status });
  return classify(answer.data, error ? withHttpStatus(error, answer.status) : null);
}

function overlayOf(body: LotChangeBody): OverlayPart {
  if (!isLotChangeBody(body)) return {};
  const values: Record<string, unknown> = {};
  const lotChanges: NonNullable<OverlayPart['lotChanges']> = [];
  for (const field of changedLotFields(body)) {
    const change = body.changes[field];
    if (!change) continue;
    values[field] = change.to;
    lotChanges.push({ lotId: body.lotId, grnId: body.grnId, field, label: LOT_FIELD_LABELS[field], from: change.from, to: change.to });
  }
  // The marks of the lot and its GRN come from `lotChanges`: only a field that still differs from the server's value counts.
  return lotChanges.length === 0 ? {} : { lot: { [body.lotId]: values }, lotChanges };
}

const lotChangeKind: SendKind = {
  lane: 'record',
  send: (body, ctx) => sendLotChange(body, ctx.requestKey),
  overlay: body => overlayOf(body),
};

registerSendKind('lotChange', lotChangeKind);
