/**
 * Order to Dispatch Conversion Utility
 * Converts an Order with OrderItems to dispatch form data for pre-loading
 */

import type { Order, OrderItem } from '@/types/order.types';
import type { DispatchHeaderData, DispatchItemData, OrderLotAsk } from '@/types/dispatch.types';
import { t } from '@/i18n';

/** The `unique_id` of a line made from an order line starts with this. It only keeps the ids apart: where a line came from is told by its lot (see `OrderLotAsk`). */
const ORDER_LINE_ID_PREFIX = 'order_';

export interface ConvertedDispatchData {
  header: Partial<DispatchHeaderData>;
  items: DispatchItemData[];
  /** Lot id -> what the order asked of the lot, for every line that became a line of the form (D5). */
  orderLots: Record<string, OrderLotAsk>;
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
  const orderLots: Record<string, OrderLotAsk> = {};

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
    orderLots[orderItem.grn_item_id] = { requested: orderItem.requested_quantity, defaultQuantity: dispatchItem.disp_quantity };
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
    orderLots,
    skippedItems,
  };
}

/**
 * What a form that is made from an order knows of the order's lots, when the form has no such record (a form filled by a
 * caller that passed none): every line is taken as one the order gave, with the quantity it holds as its default.
 */
export function orderLotsOfItems(items: DispatchItemData[]): Record<string, OrderLotAsk> {
  const lots: Record<string, OrderLotAsk> = {};
  for (const line of items) {
    if (line.grnItems_id) lots[line.grnItems_id] = { requested: line.disp_quantity, defaultQuantity: line.disp_quantity };
  }
  return lots;
}

/**
 * The lines of a dispatch form made from an order, merged with the order as it is now (wave B, D5: the order changed
 * after the form was opened and its lines were read again). `fresh` is what `convertOrderToDispatchData` made from the
 * order now (a quantity of at most the stock, no line without stock); `before` is what the order asked of each lot when
 * the form was filled or last read again (`OrderLotAsk`). Where a line came from is told by its lot, not by its id:
 * - a lot that is on the order now keeps the line already in the form. Its quantity stays when the person changed it
 *   (at most the stock now); a quantity that is still the one the form was given for that lot (or 0) is not the
 *   person's, and takes the order's new default;
 * - a line made from the order whose lot is no longer on it (or has no stock) is dropped;
 * - a lot new on the order is added with its default quantity; a lot that was on the order when the form was filled and
 *   has no line now was removed by the person, and does not come back;
 * - a line the person added by hand (its lot was not on the order) stays as it is, unless the order now has that lot
 *   too, which makes it the order's line.
 * The order of the form's lines is kept, new lots come last.
 */
export function mergeOrderIntoDispatchItems(
  current: DispatchItemData[],
  fresh: DispatchItemData[],
  before: Record<string, OrderLotAsk> | null | undefined
): DispatchItemData[] {
  const wasOnOrder = before ?? {};
  const freshByLot = new Map(fresh.map((line) => [line.grnItems_id, line]));
  const merged: DispatchItemData[] = [];
  const placed = new Set<string>();
  for (const line of current) {
    const now = freshByLot.get(line.grnItems_id);
    if (now) {
      const wasDefault = line.disp_quantity === wasOnOrder[line.grnItems_id]?.defaultQuantity;
      const typed = line.disp_quantity > 0 && !wasDefault ? line.disp_quantity : now.disp_quantity;
      merged.push({ ...now, unique_id: line.unique_id, disp_quantity: Math.max(1, Math.min(typed, now.grnItems_stock)) });
      placed.add(line.grnItems_id);
    } else if (!wasOnOrder[line.grnItems_id]) {
      merged.push(line);
    }
  }
  for (const line of fresh) {
    if (!placed.has(line.grnItems_id) && !wasOnOrder[line.grnItems_id]) merged.push(line);
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
