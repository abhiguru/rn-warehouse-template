/**
 * Stock status of a GRN or GRN item (style guide §3.5).
 *
 * Nothing left because everything was dispatched is the normal end of a GRN,
 * not an error, so it is neutral "Fully dispatched". While stock is left the
 * app-wide stock-level rule applies (style guide §3.5): under 20% of the
 * received quantity is critical "Low stock", otherwise positive "In stock".
 *
 * TODO: the guide names LOW_STOCK_RATIO in src/utils/stockStatus.ts as the
 * single home of the threshold. Import it from there once it exists and drop
 * the copy below.
 */
import type { StatusKind } from '@/components/ui';

/** App-wide low-stock threshold as a share of the received quantity. */
export const LOW_STOCK_RATIO = 0.2;

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
  if (safeStock < safeQty * LOW_STOCK_RATIO) {
    return { status: 'critical', label: 'Low stock', icon: 'alert' };
  }
  return { status: 'positive', label: 'In stock', icon: 'check-circle' };
}
