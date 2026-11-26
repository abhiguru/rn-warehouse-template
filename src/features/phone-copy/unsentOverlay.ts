/**
 * The seam for this phone's unsent work (WH-299, product/tech/app-offline-read-from-copy.md 10.4; Product's PR6). The
 * readers apply it last: what the phone has written replaces what the copy holds, and stock is the copy's less what is
 * dispatched but not sent and what is held. This card returns nothing; the markers on screen and the saving of unsent
 * work come with WH-301, which replaces `getUnsentOverlay`.
 */
type Fields = Record<string, unknown>;

export interface UnsentOverlay {
  /** Fields of a GRN this phone has changed and not sent, or null. */
  grn(grnId: string): Fields | null;
  /** Fields of a lot this phone has changed and not sent, or null. */
  lot(lotId: string): Fields | null;
  /** Fields of a dispatch this phone has changed and not sent, or null. */
  dispatch(dispatchId: string): Fields | null;
  /** Bags of the lot in dispatches not sent yet. */
  lessUnsent(lotId: string): number;
  /** Bags of the lot in held dispatches. */
  lessHeld(lotId: string): number;
}

const NOTHING: UnsentOverlay = { grn: () => null, lot: () => null, dispatch: () => null, lessUnsent: () => 0, lessHeld: () => 0 };

export function getUnsentOverlay(): UnsentOverlay {
  return NOTHING;
}

/** The stock a lot shows: the copy's less what is not sent and what is held. */
export function netStock(overlay: UnsentOverlay, lotId: string, copyStock: number | null): number | null {
  if (copyStock === null) return null;
  return copyStock - overlay.lessUnsent(lotId) - overlay.lessHeld(lotId);
}
