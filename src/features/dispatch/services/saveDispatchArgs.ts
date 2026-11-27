/**
 * create_dispatch_with_stock_check's arguments for a dispatch form, without the request key (WH-161): the body a dispatch saved
 * on the phone carries, built as `createDispatch` builds its own (dispatchFormService.ts, the same members), so the two sends of
 * one form are the same request.
 *
 * Kept beside `createDispatch` and not moved out of it: that file holds legacy lint warnings a change would have to clear first.
 * When it is cleaned, `createDispatch` should call this function and the copy of its body there goes.
 */
import { toCalendarDay } from '@/utils/formatters';
import { normalizeVehicle } from '@/utils/vehicleNumber';
import type { createDispatch } from './dispatchFormService';

export type CreateDispatchFormPayload = Parameters<typeof createDispatch>[0];

/** A blank id or number is no source order: null, as the server is sent today. */
const orNull = (value: string | null | undefined): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function buildCreateDispatchArgs(payload: CreateDispatchFormPayload) {
  return {
    p_dispatch_data: {
      disp_no: payload.header.disp_no,
      disp_date: toCalendarDay(payload.header.disp_date), // the day, 'YYYY-MM-DD': the server takes the day from this text
      registration: normalizeVehicle(payload.header.registration).toUpperCase(),
      customer_id: payload.header.customer_id,
      customer_name: payload.header.customer_name,
      supervisor_id: payload.header.supervisor_id,
      supervisor_name: payload.header.supervisor_name,
      note: payload.header.note || '',
      source_order_id: orNull(payload.header.source_order_id),
      source_order_no: orNull(payload.header.source_order_no),
      ...(payload.header.source_order_updated_at ? { source_order_updated_at: payload.header.source_order_updated_at } : {}),
      // Opt-in (migration 124): a direct dispatch asks the server to check for a likely duplicate.
      ...(payload.header.source_order_id ? {} : { warn_duplicate: payload.warnDuplicate ?? true }),
    },
    p_dispatch_items: payload.items.map(item => ({
      gr_trl_id: item.grnItems_id, // The lot ID
      disp_qty: item.disp_quantity,
    })),
    p_generate_invoice: true as const, // Auto-generate invoice
    p_retry_count: 0 as const, // Required to disambiguate function overload
  };
}
