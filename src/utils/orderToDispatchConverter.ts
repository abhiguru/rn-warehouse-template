/**
 * Order to Dispatch Conversion Utility
 * Converts an Order with OrderItems to dispatch form data for pre-loading
 */

import type { Order, OrderItem } from '@/types/order.types';
import type { DispatchHeaderData, DispatchItemData } from '@/types/dispatch.types';
import { t } from '@/i18n';

/** Every line made from an order line has a `unique_id` that starts with this; a line the person added by hand does not. */
const ORDER_LINE_ID_PREFIX = 'order_';

export interface ConvertedDispatchData {
  header: Partial<DispatchHeaderData>;
  items: DispatchItemData[];
  skippedItems: Array<{ item: OrderItem; reason: string }>;
}

/**
 * Convert an Order to dispatch form data
 * @param order - The order with items to convert
 * @returns Partial header data, dispatch items array, and any skipped items
 */
export function convertOrderToDispatchData(order: Order): ConvertedDispatchData {
  const skippedItems: Array<{ item: OrderItem; reason: string }> = [];
  const items: DispatchItemData[] = [];

  // Convert each order item to dispatch item
  order.items?.forEach((orderItem) => {
    const grnItem = orderItem.grn_item;

    // Skip items without GRN data
    if (!grnItem) {
      skippedItems.push({
        item: orderItem,
        reason: t('errors.dispatch.missingGrnItem'),
      });
      return;
    }

    // Skip items with no stock
    if (grnItem.current_stock <= 0) {
      skippedItems.push({
        item: orderItem,
        reason: t('errors.dispatch.noStock'),
      });
      return;
    }

    // Create dispatch item
    const dispatchItem: DispatchItemData = {
      unique_id: `${ORDER_LINE_ID_PREFIX}${orderItem.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

      // GRN Header reference
      grns_id: grnItem.gr_id,
      grns_gr_no: grnItem.grn_number || '',
      grns_date: grnItem.grn_date || '',
      grns_customer_name: order.customer?.name || '',

      // GRN Item (lot) reference
      grnItems_id: orderItem.grn_item_id,
      grnItems_item_id: grnItem.id,
      grnItems_item_name: grnItem.name,
      grnItems_quantity: grnItem.original_quantity,
      grnItems_stock: grnItem.current_stock,
      grnItems_package_mark: grnItem.package_mark || '',
      grnItems_rack: grnItem.rack || '',
      grnItems_weight: grnItem.weight || 0,

      // Use requested quantity, capped at available stock
      disp_quantity: Math.min(orderItem.requested_quantity, grnItem.current_stock),
    };

    items.push(dispatchItem);
  });

  // Build partial header with customer info
  const header: Partial<DispatchHeaderData> = {
    customer_id: order.customer_id,
    customer_name: order.customer?.name || '',
    source_order_id: order.id,
  };

  return {
    header,
    items,
    skippedItems,
  };
}

/**
 * The lines of a dispatch form made from an order, merged with the order as it is now (wave B, D5: the order changed
 * after the form was opened and its lines were read again). `fresh` is what `convertOrderToDispatchData` made from the
 * order now (a quantity of at most the stock, no line without stock).
 * - a lot that is on the order now keeps the line already in the form, with the quantity typed there, at most its
 *   stock now (a quantity of 0 or less is not a typed quantity: the order's own default is used);
 * - a line made from the order whose lot is no longer on it (or has no stock) is dropped;
 * - a lot new on the order is added with its default quantity;
 * - a line the person added by hand (not made from the order) stays as it is, unless the order now has that lot too.
 * The order of the form's lines is kept, new lots come last.
 */
export function mergeOrderIntoDispatchItems(current: DispatchItemData[], fresh: DispatchItemData[]): DispatchItemData[] {
  const freshByLot = new Map(fresh.map((line) => [line.grnItems_id, line]));
  const merged: DispatchItemData[] = [];
  const kept = new Set<string>();
  for (const line of current) {
    const now = freshByLot.get(line.grnItems_id);
    if (now) {
      const typed = line.disp_quantity > 0 ? line.disp_quantity : now.disp_quantity;
      merged.push({ ...now, unique_id: line.unique_id, disp_quantity: Math.max(1, Math.min(typed, now.grnItems_stock)) });
      kept.add(line.grnItems_id);
    } else if (!line.unique_id.startsWith(ORDER_LINE_ID_PREFIX)) {
      merged.push(line);
    }
  }
  for (const line of fresh) {
    if (!kept.has(line.grnItems_id)) merged.push(line);
  }
  return merged;
}

/**
 * Check if an order can be converted to a dispatch
 * @param order - The order to check
 * @returns Boolean indicating if conversion is possible
 */
export function canConvertToDispatch(order: Order): boolean {
  if (!order.items || order.items.length === 0) {
    return false;
  }

  // Check if at least one item has valid GRN data and stock
  return order.items.some(
    (item) => item.grn_item && item.grn_item.current_stock > 0
  );
}
