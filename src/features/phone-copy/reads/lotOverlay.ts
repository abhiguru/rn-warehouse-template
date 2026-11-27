/**
 * A lot row as this phone shows it: the copy's row, this person's unsent changes over it, and its stock (WH-303). A quantity
 * change moves the stock by the same amount (contract section 3.6); what is dispatched but not sent comes off after that.
 */
import { netStock, type UnsentOverlay } from '../unsentOverlay';
import { numberOf, type Row } from './rows';

// An overlay that says nothing about added and removed lines (a stand-in in a test, an older seam) has none.
type Lines = Partial<Pick<UnsentOverlay, 'lotsAdded' | 'lotsRemoved' | 'lotsGone'>>;

/** The lot ids an unsent edit removes from the GRN: they stay in place, greyed, until the edit is sent. */
export const removedLotIds = (overlay: UnsentOverlay, grnId: string): readonly string[] => (overlay as Lines).lotsRemoved?.(grnId) ?? [];

export function overlaidLot(lot: Row, overlay: UnsentOverlay): Row {
  const id = String(lot.id);
  const changes = overlay.lot(id);
  const was = numberOf(lot.qty);
  const now = changes ? numberOf(changes.qty) : null;
  const stock = numberOf(lot.stock);
  const moved = stock === null ? null : stock + (was !== null && now !== null ? now - was : 0);
  return { ...lot, ...changes, stock: netStock(overlay, id, moved) };
}

/** The lots of a GRN as the phone shows them: the copy's lots less those an edit removed and sent, then the lines it adds. */
export function lotsOfGrn(copyLots: readonly Row[], grnId: string, overlay: UnsentOverlay, keepRemoved: boolean): Row[] {
  const lines = overlay as Lines;
  const gone = new Set([...(lines.lotsGone?.(grnId) ?? []), ...(keepRemoved ? [] : removedLotIds(overlay, grnId))]);
  return [...copyLots.filter(lot => !gone.has(String(lot.id))).map(lot => overlaidLot(lot, overlay)), ...(lines.lotsAdded?.(grnId) ?? [])];
}
