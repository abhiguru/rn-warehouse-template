/**
 * save_grn's arguments for a GRN form, without the request key (WH-161): the body a GRN saved on the phone carries, built as
 * `createGRN` builds its own (grnFormService.ts, the same members in the same order), so the two sends of one form are the same
 * request. `grNumber` is the number to send: '' when the server issues it.
 *
 * Kept beside `createGRN` and not moved out of it: that file holds legacy lint warnings a change would have to clear first.
 * When it is cleaned, `createGRN` should call this function and the copy of its body there goes.
 */
import { toCalendarDay } from '@/utils/formatters';
import { normalizeVehicle } from '@/utils/vehicleNumber';
import type { createGRN } from './grnFormService';

export type CreateGRNPayload = Parameters<typeof createGRN>[0];

export function buildSaveGrnArgs(payload: CreateGRNPayload, grNumber: string) {
  const rpcItems = payload.items.map(item => ({
    item_id: item.item_table_id || null,
    item_name: item.item_name,
    packaging: item.packaging || null,
    qty: item.qty,
    weight: item.weight || 0,
    rack: item.rack || null,
    package_mark: item.package_mark || null,
    pricing_mode: payload.header.pricing_mode || 'MONTHLY',
  }));
  return {
    p_gr_no: grNumber,
    p_date: toCalendarDay(payload.header.date),
    p_customer_id: payload.header.customer_id,
    p_customer_name: payload.header.customer_name,
    p_sender_id: payload.header.sender_id || null,
    p_sender_name: payload.header.sender_name || null,
    p_supervisor_id: payload.header.supervisor_id || null,
    p_supervisor_name: payload.header.supervisor_name || null,
    p_registration: normalizeVehicle(payload.header.registration ?? '') || null,
    p_note: payload.header.note || null,
    p_leon: payload.header.leon || false,
    p_pricing_mode: payload.header.pricing_mode || 'MONTHLY',
    p_items: rpcItems,
    // Part of what the idempotency key hashes: the same form with other rates is another save.
    ...(payload.rates ? { p_rates: payload.rates } : {}),
    // Opt-in (migration 124): the server checks for a likely duplicate only when asked. False is "Save anyway".
    p_warn_duplicate: payload.warnDuplicate ?? true,
  };
}
