/**
 * A held new GRN in the GRN form (WH-304, contract 5.2): the form is the Edit GRN wizard opened on `/grn-edit/held-<id>`, filled from
 * the held body (as an unsent GRN's edit is, without its queue), and its Save is `decide_held_item` with the corrected body.
 */
import * as Crypto from 'expo-crypto';
import { buildSaveGrnArgs, type CreateGRNPayload } from '@/features/grn/services/saveGrnArgs';
import { grnFormOfBody, type LoadedUnsentGrn } from '@/features/unsent/editUnsentGrn';
import { isNewGrnBody, type NewGrnBody, type SaveGrnArgs } from '@/features/unsent/newGrnKind';
import { getHeldItem, type HeldItemDetail } from './holdingApi';

export type LoadedHeldGrn = { kind: 'loaded'; item: HeldItemDetail; held: NewGrnBody; data: LoadedUnsentGrn } | { kind: 'unavailable' };

/** The held item and the form's values from its body. A decided item, another kind or an unreadable body is `unavailable`. */
export async function loadHeldGrn(heldId: string): Promise<LoadedHeldGrn> {
  const item = await getHeldItem(heldId);
  if (item.kind !== 'newGrn' || item.state !== 'held' || !isNewGrnBody(item.body)) return { kind: 'unavailable' };
  return { kind: 'loaded', item, held: item.body, data: grnFormOfBody(item.body, []) };
}

/**
 * The body "Accept with changes" sends: the held body with the form's values. The number mode, the recorded time and the lots' ids
 * stay the recorder's, and rates the form does not hold stay as recorded.
 */
export function correctedGrnBody(held: NewGrnBody, request: CreateGRNPayload, lineIds: readonly (string | undefined)[]): NewGrnBody {
  const issueNumber = held.args.p_issue_number === true;
  const typedNumber = issueNumber ? '' : (request.header.gr_no ?? '').trim();
  const existing = new Set(held.lotLocalIds);
  const lotLocalIds = request.items.map((_item, index) => {
    const id = lineIds[index];
    return id && existing.has(id) ? id : Crypto.randomUUID();
  });
  const built = buildSaveGrnArgs(request, typedNumber);
  const args: SaveGrnArgs = {
    ...built,
    ...(built.p_rates === undefined && held.args.p_rates !== undefined ? { p_rates: held.args.p_rates } : {}),
    p_issue_number: issueNumber,
    p_recorded_at: held.args.p_recorded_at,
  };
  return {
    v: 1,
    localId: held.localId,
    lotLocalIds,
    args,
    show: { customerName: request.header.customer_name, lines: request.items.map(line => ({ itemName: line.item_name, packaging: line.packaging || null })) },
  };
}
