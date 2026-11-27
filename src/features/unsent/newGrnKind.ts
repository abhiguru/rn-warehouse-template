/**
 * The `newGrn` kind (WH-161, product/tech/app-offline-new-records.md 5, 17.2): a GRN made with no connection, sent as `save_grn`
 * with the item's permanent request ID. Lane `record`: in order, one at a time, never merged. `args` are save_grn's arguments as
 * the form's direct save builds them (`buildSaveGrnArgs`), with the number blank and `p_issue_number` true where the server
 * issues it, the recorded time, and no `p_idempotency_key` (the item's request key goes there).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { NewDocRow, OverlayPart } from '@/features/phone-copy/unsentOverlay';
import type { buildSaveGrnArgs } from '@/features/grn/services/saveGrnArgs';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';
import { outcomeOfAnswer } from './newRecordAnswer';
// Keeps the phone's numbering row ready for the number box's mode (loaded with the kinds at start).
import './numberingCache';
import { registerSendKind, type SendKind, type SendOutcome } from './sendKinds';
import type { ItemState } from './unsentRows';

export type SaveGrnArgs = ReturnType<typeof buildSaveGrnArgs> & { p_issue_number: boolean; p_recorded_at: string };

export interface NewGrnBody {
  v: 1;
  /** The GRN's id on this phone until it is sent (uuid v4 made at Save). */
  localId: string;
  /** One uuid per line, in the order of `args.p_items`: the line's lot id on this phone. */
  lotLocalIds: string[];
  args: SaveGrnArgs;
  show: { customerName: string; lines: { itemName: string; packaging: string | null }[] };
}

export function isNewGrnBody(value: unknown): value is NewGrnBody {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Partial<NewGrnBody>;
  return typeof body.localId === 'string' && Array.isArray(body.lotLocalIds) && typeof body.args === 'object' && body.args !== null && Array.isArray(body.args.p_items);
}

async function sendNewGrn(body: NewGrnBody, requestKey: string): Promise<SendOutcome> {
  if (!isNewGrnBody(body)) return { kind: 'refused', reason: 'newGrn: unreadable body' };
  const client = await getAuthenticatedClient();
  const answer = await client.rpc('save_grn', { ...body.args, p_idempotency_key: requestKey });
  // An unreadable or empty HTTP 200 and a gateway's 502 / 504 are a LOST answer (the record may be saved), not a transient one.
  const error = answer.error ?? emptyAnswerAsError({ data: answer.data, error: answer.error, status: answer.status });
  return outcomeOfAnswer('grn', answer.data, error ? withHttpStatus(error, answer.status) : null);
}

/** The row an unsent GRN shows in lists and details, and its lots at stock = qty (6, 17.4). */
export function newGrnRow(body: NewGrnBody, state: ItemState, item: { id: string; recordedAt: number; result: unknown }): NewDocRow {
  const result = typeof item.result === 'object' && item.result !== null ? (item.result as Record<string, unknown>) : {};
  const serverId = typeof result.grn_id === 'string' ? result.grn_id : null;
  const issued = typeof result.gr_no === 'string' ? result.gr_no : null;
  const { args } = body;
  const typed = args.p_gr_no !== '' ? args.p_gr_no : null;
  return {
    kind: 'grn',
    localId: body.localId,
    itemId: item.id,
    state: state === 'sent' ? 'sent' : state === 'sending' ? 'sending' : 'saved',
    serverId,
    number: issued ?? typed,
    recordedAt: item.recordedAt,
    refused: state === 'refused',
    header: {
      customer_id: args.p_customer_id,
      customer_name: args.p_customer_name,
      date: args.p_date,
      registration: args.p_registration,
      supervisor_name: args.p_supervisor_name,
      sender_name: args.p_sender_name,
      note: args.p_note,
      pricing_mode: args.p_pricing_mode,
    },
    lines: args.p_items.map((line, index) => ({
      id: body.lotLocalIds[index] ?? `${body.localId}:${index}`,
      item_id: line.item_id,
      item_name: line.item_name,
      packaging: line.packaging,
      qty: line.qty,
      stock: line.qty,
      weight: line.weight,
      rack: line.rack,
      package_mark: line.package_mark,
    })),
  };
}

function overlayOf(body: NewGrnBody, state: ItemState, item?: { id: string; recordedAt: number; result: unknown }): OverlayPart {
  if (!isNewGrnBody(body) || !item) return {};
  return { newDocuments: [newGrnRow(body, state, item)] };
}

const newGrnKind: SendKind = {
  lane: 'record',
  send: (body, ctx) => sendNewGrn(body, ctx.requestKey),
  outcomeOf: answer => outcomeOfAnswer('grn', answer),
  overlay: overlayOf,
};

registerSendKind('newGrn', newGrnKind);
