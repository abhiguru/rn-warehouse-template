/**
 * Stock status of a GRN or GRN item (style guide §3.5).
 *
 * Nothing left because everything was dispatched is the normal end of a GRN,
 * not an error, so it is neutral "Fully dispatched". While stock is left the
 * app-wide stock-level rule applies: under LOW_STOCK_PERCENT of the received
 * quantity is critical "Low stock", otherwise positive "In stock".
 *
 * TODO: move this rule into src/utils/stockStatus.ts so orders, GRNs and
 * reports share one helper (that file is outside this change).
 */
import type { StatusKind } from '@/components/ui/StatusTag';

/** App-wide low-stock threshold, in percent of the received quantity. */
export const LOW_STOCK_PERCENT = 20;

export interface GRNStockStatus {
  status: StatusKind;
  label: string;
  icon: string;
}

/** Status for a received quantity and what is still in stock; null when nothing was received. */
export function getGRNStockStatus(stock: number, qty: number): GRNStockStatus | null {
  const safeQty = Number(qty) || 0;
  const safeStock = Number(stock) || 0;
  if (safeQty <= 0) return null;
  if (safeStock <= 0) {
    return { status: 'neutral', label: 'Fully dispatched', icon: 'check-all' };
  }
  if ((safeStock / safeQty) * 100 < LOW_STOCK_PERCENT) {
    return { status: 'critical', label: 'Low stock', icon: 'alert' };
  }
  return { status: 'positive', label: 'In stock', icon: 'check-circle' };
}
