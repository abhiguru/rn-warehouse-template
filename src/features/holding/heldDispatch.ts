/**
 * A held new dispatch in the dispatch form (WH-304, contract 5.2): the form is the Edit dispatch wizard opened on
 * `/dispatch-edit/held-<id>`, filled from the held body, and its Save is `decide_held_item` with the corrected body. The body holds
 * only lot ids and quantities, so each lot's own facts (item, GRN, rack, mark, stock now) are read from the server for the form.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { buildCreateDispatchArgs } from '@/features/dispatch/services/saveDispatchArgs';
import { isNewDispatchBody, type NewDispatchBody } from '@/features/unsent/newDispatchKind';
import type { DispatchHeaderData, DispatchItemData } from '@/types/dispatch.types';
import { getHeldItem, type HeldItemDetail } from './holdingApi';

export type LoadedHeldDispatch =
  | { kind: 'loaded'; item: HeldItemDetail; held: NewDispatchBody; header: DispatchHeaderData; items: DispatchItemData[] }
  | { kind: 'unavailable' };

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** The form's header from the held dispatch's data. */
function headerOf(data: Record<string, unknown>): DispatchHeaderData {
  return {
    disp_no: text(data.disp_no),
    disp_date: text(data.disp_date),
    registration: text(data.registration),
    customer_id: text(data.customer_id),
    customer_name: text(data.customer_name),
    supervisor_id: text(data.supervisor_id),
    supervisor_name: text(data.supervisor_name),
    note: text(data.note),
  };
}

/** Reads the lots (and their GRNs) the held dispatch takes from; a lot the server no longer has makes the item `unavailable`. */
async function readLots(lotIds: string[]): Promise<{ lots: Fields[]; grns: Map<string, Fields> } | null> {
  const client = await getAuthenticatedClient();
  const lots = await client.from('goodsreceived_trl').select('id, gr_id, item_id, item_name, packaging, qty, stock, weight, rack, package_mark').in('id', lotIds);
  if (lots.error || !Array.isArray(lots.data) || lots.data.length < new Set(lotIds).size) return null;
  const grnIds = [...new Set(lots.data.flatMap((lot: unknown) => (isFields(lot) && typeof lot.gr_id === 'string' ? [lot.gr_id] : [])))];
  const grns = await client.from('goodsreceived').select('id, gr_no, date, customer_name, customer_id').in('id', grnIds);
  if (grns.error || !Array.isArray(grns.data)) return null;
  const byId = new Map<string, Fields>();
  for (const grn of grns.data as unknown[]) if (isFields(grn) && typeof grn.id === 'string') byId.set(grn.id, grn);
  return { lots: (lots.data as unknown[]).filter(isFields), grns: byId };
}

/** The held item and the form's values from its body. A decided item, another kind or an unreadable body is `unavailable`. */
export async function loadHeldDispatch(heldId: string): Promise<LoadedHeldDispatch> {
  const item = await getHeldItem(heldId);
  if (item.kind !== 'newDispatch' || item.state !== 'held' || !isNewDispatchBody(item.body)) return { kind: 'unavailable' };
  const held = item.body;
  const lines = held.args.p_dispatch_items;
  const read = await readLots(lines.map(line => line.gr_trl_id));
  if (read === null) return { kind: 'unavailable' };
  const header = headerOf(held.args.p_dispatch_data);
  const items: DispatchItemData[] = [];
  for (const line of lines) {
    const lot = read.lots.find(entry => entry.id === line.gr_trl_id);
    const grn = lot ? read.grns.get(text(lot.gr_id)) : undefined;
    if (!lot || !grn) return { kind: 'unavailable' };
    items.push({
      unique_id: line.gr_trl_id,
      grns_id: text(lot.gr_id),
      grns_gr_no: text(grn.gr_no),
      grns_date: text(grn.date),
      grns_customer_name: text(grn.customer_name),
      grns_customer_id: header.customer_id || undefined,
      grnItems_id: line.gr_trl_id,
      grnItems_item_id: text(lot.item_id),
      grnItems_item_name: text(lot.item_name),
      grnItems_quantity: num(lot.qty),
      grnItems_stock: num(lot.stock),
      grnItems_package_mark: text(lot.package_mark),
      grnItems_packaging: text(lot.packaging) || undefined,
      grnItems_rack: text(lot.rack),
      grnItems_weight: num(lot.weight),
      disp_quantity: line.disp_qty,
      // No bag of this dispatch is on the server: the lot's stock limit is its stock now, nothing given back.
      original_disp_quantity: 0,
    });
  }
  return { kind: 'loaded', item, held, header, items };
}

/** The body "Accept with changes" sends: the held body with the form's header and lines; the recorder's own flags stay. */
export function correctedDispatchBody(held: NewDispatchBody, form: { header: DispatchHeaderData; items: DispatchItemData[] }): NewDispatchBody {
  const built = buildCreateDispatchArgs({ header: form.header, items: form.items });
  const warn = held.args.p_dispatch_data.warn_duplicate;
  return {
    v: 1,
    localId: held.localId,
    args: {
      ...built,
      p_dispatch_data: { ...built.p_dispatch_data, ...(warn === undefined ? {} : { warn_duplicate: warn }) },
    },
    show: { customerName: form.header.customer_name },
  };
}
