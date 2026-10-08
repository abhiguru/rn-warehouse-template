/**
 * Order to Dispatch Conversion Utility
 * Converts an Order with OrderItems to dispatch form data for pre-loading
 */

import type { Order, OrderItem } from '@/types/order.types';
import type { DispatchHeaderData, DispatchItemData } from '@/types/dispatch.types';

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
        reason: 'Missing GRN item data',
      });
      return;
    }

    // Skip items with no stock
    if (grnItem.current_stock <= 0) {
      skippedItems.push({
        item: orderItem,
        reason: 'No stock available',
      });
      return;
    }

    // Create dispatch item
    const dispatchItem: DispatchItemData = {
      unique_id: `order_${orderItem.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

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
