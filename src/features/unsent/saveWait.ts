/** How long a form waits for its own item to be sent while the phone is reachable (the one wait of C302 and C303). */
export const SAVE_WAIT_MS = 8_000;

/** Extra time a note stays open after the 8 s wait, so a handler that never ends cannot hold the hand-over for ever. */
export const SAVE_WAIT_SAFETY_MS = 5_000;

/**
 * The saves whose form is still waiting for the server's answer, by item id, with when the wait ends. A refusal during the
 * wait goes back to the form or sheet and nothing is kept (Product PQ9, PQ2), so the hand-over to the holding list leaves
 * these items alone until the wait is over, whatever their kind.
 */
const openWaits = new Map<string, number>();

/** Notes that a form waits for this item; the returned function ends the note (call it when the wait ends). */
export function openSaveWait(itemId: string, ms: number = SAVE_WAIT_MS): () => void {
  const endsAt = Date.now() + ms;
  openWaits.set(itemId, endsAt);
  return () => {
    if (openWaits.get(itemId) === endsAt) openWaits.delete(itemId);
  };
}

/** Ends the note of an item at once: the form or sheet has finished handling the outcome. */
export function closeSaveWait(itemId: string): void {
  openWaits.delete(itemId);
}

/** How many ms of the item's save wait are left; 0 when no form waits for it. */
export function saveWaitLeft(itemId: string): number {
  const endsAt = openWaits.get(itemId);
  if (endsAt === undefined) return 0;
  const left = endsAt - Date.now();
  if (left <= 0) openWaits.delete(itemId);
  return Math.max(0, left);
}
