/**
 * What a save does to customers' open orders (server migration 128): a dispatch or a GRN edit can lower or remove an
 * order line, and deleting a GRN removes its lines. The preview functions answer that before the save; the real
 * saves repeat it as `order_effects`. A server without the preview functions answers "function not found": every
 * preview here then answers null and the screens ask their questions as they always did.
 *
 * Nothing here writes. The dispatch bodies repeat what dispatchFormService sends (the preview takes the same data).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { createLogger } from '@/utils/logger';
import { toCalendarDay } from '@/utils/formatters';
import { formatIdentifier, t } from '@/i18n';
import type { DispatchHeaderData, DispatchItemData } from '@/types/dispatch.types';

const log = createLogger('orderEffects');

export type OrderEffectChange = 'reduced' | 'increased' | 'added' | 'removed' | 'exceeds_stock';

export interface OrderEffect {
  customerId: string;
  customerName: string;
  orderId: string;
  orderNo: string | null;
  orderItemId: string | null;
  grnItemId: string | null;
  itemName: string;
  packageMark: string | null;
  grnNo: string | null;
  oldQuantity: number;
  newQuantity: number;
  removed: boolean;
  change: OrderEffectChange;
  /** Only for `exceeds_stock`: what the lot will hold. */
  availableStock: number | null;
  /** Lines the order keeps after this save; 0 means the order goes. */
  orderLinesLeft: number | null;
}

const CHANGES: readonly string[] = ['reduced', 'increased', 'added', 'removed', 'exceeds_stock'];

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const count = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The effects of an answer's `order_effects`; [] when it has none (an older server) or holds something unreadable. */
export function parseOrderEffects(raw: unknown): OrderEffect[] {
  if (!Array.isArray(raw)) return [];
  const effects: OrderEffect[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.change !== 'string' || !CHANGES.includes(e.change)) continue;
    effects.push({
      customerId: text(e.customer_id) ?? '',
      customerName: text(e.customer_name) ?? '',
      orderId: text(e.order_id) ?? '',
      orderNo: text(e.order_no),
      orderItemId: text(e.order_item_id),
      grnItemId: text(e.grn_item_id),
      itemName: text(e.item_name) ?? '',
      packageMark: text(e.package_mark),
      grnNo: text(e.grn_no),
      oldQuantity: count(e.old_quantity) ?? 0,
      newQuantity: count(e.new_quantity) ?? 0,
      removed: e.removed === true,
      change: e.change as OrderEffectChange,
      availableStock: count(e.available_stock),
      orderLinesLeft: count(e.order_lines_left),
    });
  }
  return effects;
}

/** "Lakeview Spices' order": a name ending in s takes only the apostrophe. */
const orderOf = (name: string): string => t(/s$/i.test(name.trim()) ? 'orders.effect.orderOfS' : 'orders.effect.orderOf', { name });

/** One sentence per affected order line, in the app's language, in the order the server sent them. */
export function orderEffectLines(effects: readonly OrderEffect[] | null | undefined): string[] {
  if (!effects) return [];
  return effects.map((effect) => {
    const params = {
      order: orderOf(effect.customerName),
      item: effect.itemName,
      grn: effect.grnNo ? formatIdentifier(effect.grnNo) : '',
    };
    switch (effect.change) {
      case 'removed':
        return t(effect.orderLinesLeft === 0 ? 'orders.effect.removedLast' : 'orders.effect.removed', params);
      case 'added':
        return t('orders.effect.added', { ...params, count: effect.newQuantity });
      case 'exceeds_stock':
        return t('orders.effect.exceedsStock', { ...params, wanted: effect.newQuantity, count: effect.availableStock ?? 0 });
      case 'increased':
        return t('orders.effect.increased', { ...params, from: effect.oldQuantity, count: effect.newQuantity });
      default:
        return t('orders.effect.reduced', { ...params, from: effect.oldQuantity, count: effect.newQuantity });
    }
  });
}

/** The question before a save: `message`, then the lines under a lead. Unchanged when no order is affected. */
export function withOrderEffects(message: string, effects: readonly OrderEffect[] | null | undefined, lead: 'questionLead' | 'doneLead' = 'questionLead'): string {
  const lines = orderEffectLines(effects);
  if (lines.length === 0) return message;
  return `${message}\n\n${t(`orders.effect.${lead}`)}\n${lines.map((line) => `• ${line}`).join('\n')}`;
}

/** The note on a Review step: its title, then the lines. Empty when no order is affected. */
export function orderEffectsNotice(effects: readonly OrderEffect[] | null | undefined): string {
  const lines = orderEffectLines(effects);
  return lines.length === 0 ? '' : `${t('orders.effect.noticeTitle')}\n${lines.map((line) => `• ${line}`).join('\n')}`;
}

/** The longest a preview may hold the screen; after it the question is asked without the orders. */
const PREVIEW_TIMEOUT_MS = 8000;

/**
 * One preview call. The effects when the server answers `success` with the list; null for anything else: an older
 * server (function not found), a refusal (the real save gives it again, worded by the screen), no connection, a timeout.
 */
async function preview(name: string, args: Record<string, unknown>): Promise<OrderEffect[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = (async () => {
      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc(name, args);
      if (error || !data || typeof data !== 'object') return null;
      const answer = data as { success?: unknown; order_effects?: unknown };
      if (answer.success !== true || !Array.isArray(answer.order_effects)) return null;
      return parseOrderEffects(answer.order_effects);
    })();
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PREVIEW_TIMEOUT_MS);
    });
    return await Promise.race([call, timeout]);
  } catch (error) {
    log.debug('Order effects not previewed', { name, message: error instanceof Error ? error.name : 'unknown' });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const dispatchData = (header: DispatchHeaderData) => ({
  disp_no: header.disp_no,
  disp_date: toCalendarDay(header.disp_date),
  registration: header.registration.toUpperCase(),
  customer_id: header.customer_id,
  customer_name: header.customer_name,
  supervisor_id: header.supervisor_id,
  supervisor_name: header.supervisor_name,
  note: header.note || '',
});
const dispatchItems = (items: readonly DispatchItemData[]) =>
  items.map((item) => ({ gr_trl_id: item.grnItems_id, disp_qty: item.disp_quantity }));

/** What creating this dispatch does to orders (staff and above; others get null). */
export const previewCreateDispatch = (header: DispatchHeaderData, items: readonly DispatchItemData[]) =>
  preview('preview_create_dispatch', {
    p_dispatch_data: {
      ...dispatchData(header),
      source_order_id: header.source_order_id || null,
      source_order_no: header.source_order_no || null,
      ...(header.source_order_updated_at ? { source_order_updated_at: header.source_order_updated_at } : {}),
    },
    p_dispatch_items: dispatchItems(items),
  });

/** What saving this edit of a dispatch does to orders. */
export const previewUpdateDispatch = (
  dispatchId: string,
  header: DispatchHeaderData,
  items: readonly DispatchItemData[],
  expectedUpdatedAt?: string | null
) =>
  preview('preview_update_dispatch', {
    p_dispatch_id: dispatchId,
    p_dispatch_data: { ...dispatchData(header), ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}) },
    p_dispatch_items: dispatchItems(items),
  });

/** What saving this GRN edit does to orders. `request` is the update_grn arguments (buildUpdateGRNRequest's rpcRequest). */
export const previewUpdateGrn = (request: Record<string, unknown>) => preview('preview_update_grn', request);

/** What deleting this GRN does to orders (admin and supervisor only; others get null). */
export const previewDeleteGrn = (grnId: string) => preview('preview_delete_grn', { p_grn_id: grnId });
