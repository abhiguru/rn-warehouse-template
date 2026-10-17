/** The key under which an answer of the gated fetch offers to end its request unread. */
export const DISCARD_BODY = Symbol('discardBody');

/**
 * For a caller that returns without reading an answer's body (a gateway's or router's error
 * page). A request of the gated fetch (`gatedFetch` in supabaseConfig.ts) is in flight, and a
 * write holds a server switch back, until its body has been read or its time limit passes;
 * this ends it now, without reading the body. Any other response is left alone.
 */
export function discardBody(response: Response): void {
  const discard = (response as unknown as Record<symbol, unknown>)[DISCARD_BODY];
  if (typeof discard === 'function') discard();
}
