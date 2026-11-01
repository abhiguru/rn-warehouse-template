/**
 * Whether the last refusal for an expired access token was followed by a real renewal of the session.
 *
 * `supabaseConfig.ts` writes it when a request is refused as "JWT expired" and tries to renew the session;
 * `serverText.ts` reads it to word a change that was not sent again: "Your sign-in was renewed. Tap Save
 * again." is true only when the session was renewed, and is otherwise the session-ended text. Imports only
 * the session registry (which imports only sessionLifecycle), so both can use it.
 */
import { registerSessionScoped } from './sessionScopedRegistry';

const RECENT_MS = 30 * 1000;
let last: { renewed: boolean; at: number } | null = null;

export function noteExpiredTokenRenewal(renewed: boolean): void {
  last = { renewed, at: Date.now() };
}

/** True when the last expired-token refusal ended with a renewed session, within the last 30 seconds. */
export function sessionWasJustRenewed(): boolean {
  return last !== null && last.renewed && Math.abs(Date.now() - last.at) < RECENT_MS;
}

// A renewal of one session must not word a refusal in the next one: logout, forced logout, account deletion and a
// server switch forget it. Not on every generation change: the renewal itself advances the generation, and the
// message that follows needs the flag.
registerSessionScoped('session-renewal', () => resetSessionRenewalForTests());

/** Tests only. */
export function resetSessionRenewalForTests(): void {
  last = null;
}
