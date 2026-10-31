/**
 * Whether the last refusal for an expired access token was followed by a real renewal of the session.
 *
 * `supabaseConfig.ts` writes it when a request is refused as "JWT expired" and tries to renew the session;
 * `serverText.ts` reads it to word a change that was not sent again: "Your sign-in was renewed. Tap Save
 * again." is true only when the session was renewed, and is otherwise the session-ended text. No imports,
 * so both can use it.
 */
const RECENT_MS = 30 * 1000;
let last: { renewed: boolean; at: number } | null = null;

export function noteExpiredTokenRenewal(renewed: boolean): void {
  last = { renewed, at: Date.now() };
}

/** True when the last expired-token refusal ended with a renewed session, within the last 30 seconds. */
export function sessionWasJustRenewed(): boolean {
  return last !== null && last.renewed && Math.abs(Date.now() - last.at) < RECENT_MS;
}

/** Tests only. */
export function resetSessionRenewalForTests(): void {
  last = null;
}
