/**
 * The phone's own check of a quantity typed in an edit (WH-303, Design 6.x DQ7): below what has left the lot is refused
 * here before the server is asked. What has left is what the lock data says plus the lot's dispatches this phone has not
 * sent (the same figure the stock lines show). With no lock and no unsent dispatch it never fires, so the online form is as today.
 */
import { getUnsentOverlay } from '@/features/phone-copy/unsentOverlay';
import { t } from '@/i18n';
import type { GRNLineLocks } from '@/store/slices/grnFormSlice';
import { formatQuantity } from '@/utils/formatters';
import { displayPackaging } from '@/utils/packagingWord';

/** Bags that have left the lot as far as this phone knows. */
export const dispatchedFromLot = (lotId: string, locks: GRNLineLocks | undefined): number =>
  (locks?.dispatchedQty ?? 0) + (getUnsentOverlay().deductions().get(lotId) ?? 0);

/** The field error under Quantity, or null when the quantity covers what has left. */
export function belowDispatchedMessage(lotId: string, quantity: number, packaging: string, locks: GRNLineLocks | undefined): string | null {
  const dispatched = dispatchedFromLot(lotId, locks);
  if (dispatched <= 0 || quantity >= dispatched) return null;
  const word = displayPackaging(packaging);
  return t('offline.belowDispatched', { quantity: formatQuantity(quantity, word), dispatched: formatQuantity(dispatched, word) });
}
