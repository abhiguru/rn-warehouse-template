import type { GRNDetailItem } from '@/types/dispatch.types';

type StockLot = Pick<GRNDetailItem, 'id' | 'stock'>;

/**
 * Returns true when a GRN has stock to dispatch, but every in-stock lot is
 * already represented in the current dispatch draft.
 */
export function areAllAvailableLotsAlreadyAdded(
  lots: StockLot[],
  addedLotIds: string[],
): boolean {
  const availableLots = lots.filter((lot) => lot.stock > 0);

  if (availableLots.length === 0) {
    return false;
  }

  const addedIds = new Set(addedLotIds);
  return availableLots.every((lot) => addedIds.has(lot.id));
}
