/**
 * The `newDispatch` kind (WH-161, product/tech/app-offline-new-records.md 5, 17.2): a dispatch made with no connection, sent as
 * `create_dispatch_with_stock_check` with the item's permanent request ID. Lane `record`, never merged, never from an order
 * (`source_order_id` is never in `args`), never from a lot of a GRN that is itself unsent.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { NewDocRow, OverlayPart } from '@/features/phone-copy/unsentOverlay';
import { outcomeOfAnswer } from './newRecordAnswer';
import { registerSendKind, type SendKind, type SendOutcome } from './sendKinds';
import type { ItemState } from './unsentRows';

export interface NewDispatchBody {
  v: 1;
  localId: string;
  args: {
    p_dispatch_data: Record<string, unknown>;
    p_dispatch_items: { gr_trl_id: string; disp_qty: number }[];
    p_generate_invoice: true;
    p_retry_count: 0;
  };
  show: { customerName: string };
}

export function isNewDispatchBody(value: unknown): value is NewDispatchBody {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Partial<NewDispatchBody>;
  return typeof body.localId === 'string' && typeof body.args === 'object' && body.args !== null && Array.isArray(body.args.p_dispatch_items);
}

async function sendNewDispatch(body: NewDispatchBody, requestKey: string): Promise<SendOutcome> {
  if (!isNewDispatchBody(body)) return { kind: 'refused', reason: 'newDispatch: unreadable body' };
  const client = await getAuthenticatedClient();
  const answer = await client.rpc('create_dispatch_with_stock_check', { ...body.args, p_idempotency_key: requestKey });
  return outcomeOfAnswer('dispatch', answer.data, answer.error);
}

export function newDispatchRow(body: NewDispatchBody, state: ItemState, item: { id: string; recordedAt: number; result: unknown }): NewDocRow {
  const result = typeof item.result === 'object' && item.result !== null ? (item.result as Record<string, unknown>) : {};
  const data = body.args.p_dispatch_data;
  const typed = typeof data.disp_no === 'string' && data.disp_no !== '' ? data.disp_no : null;
  return {
    kind: 'dispatch',
    localId: body.localId,
    itemId: item.id,
    state: state === 'sent' ? 'sent' : state === 'sending' ? 'sending' : 'saved',
    serverId: typeof result.dispatch_id === 'string' ? result.dispatch_id : null,
    number: typeof result.disp_no === 'string' ? result.disp_no : typed,
    recordedAt: item.recordedAt,
    refused: state === 'refused',
    header: {
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      date: data.disp_date,
      registration: data.registration,
      supervisor_name: data.supervisor_name,
      note: data.note,
    },
    lines: body.args.p_dispatch_items.map(line => ({ lot_id: line.gr_trl_id, qty: line.disp_qty })),
  };
}

function overlayOf(body: NewDispatchBody, state: ItemState, item?: { id: string; recordedAt: number; result: unknown }): OverlayPart {
  if (!isNewDispatchBody(body) || !item) return {};
  const less: Record<string, number> = {};
  for (const line of body.args.p_dispatch_items) less[line.gr_trl_id] = (less[line.gr_trl_id] ?? 0) + line.disp_qty;
  // A sent one stops taking bags off when the copy holds it (the readers drop the row then); until then the figures stay.
  return { newDocuments: [newDispatchRow(body, state, item)], lessUnsent: less };
}

const newDispatchKind: SendKind = {
  lane: 'record',
  send: (body, ctx) => sendNewDispatch(body, ctx.requestKey),
  outcomeOf: answer => outcomeOfAnswer('dispatch', answer),
  overlay: overlayOf,
};

registerSendKind('newDispatch', newDispatchKind);
