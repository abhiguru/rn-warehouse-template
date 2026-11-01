import type { GRNItemData } from '@/store/slices/grnFormSlice';
import { t as tr } from '@/i18n';

/**
 * What locks a stored line of an edited GRN, as far as the screen says it: 'invoiced' (quantity, item, packing and
 * weight), 'dispatched' (quantity, item and packing) from the server's locks, or 'quantity' on an older server that
 * sends none (the line's stock differs from its quantity). null: nothing is locked, or a new GRN.
 */
export type LineLock = 'invoiced' | 'dispatched' | 'quantity' | null;

export function lineLock(item: Pick<GRNItemData, 'locks' | 'qty' | 'stock'>, isCreateMode: boolean): LineLock {
  if (isCreateMode) return null;
  if (item.locks) return item.locks.invoiced ? 'invoiced' : item.locks.dispatched ? 'dispatched' : null;
  return item.qty !== item.stock ? 'quantity' : null;
}

/** The tag text and the spoken text of a line's lock. */
export const LOCK_TAG: Record<Exclude<LineLock, null>, () => string> = {
  invoiced: () => tr('grn.item.lockedInvoiced'),
  dispatched: () => tr('grn.item.lockedDispatched'),
  quantity: () => tr('grn.item.quantityLocked'),
};
export const LOCK_A11Y: Record<Exclude<LineLock, null>, () => string> = {
  invoiced: () => tr('grn.review.a11yInvoicedLocked'),
  dispatched: () => tr('grn.review.a11yDispatchedLockedAll'),
  quantity: () => tr('grn.review.a11yDispatchedLocked'),
};
