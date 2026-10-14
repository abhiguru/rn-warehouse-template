/**
 * What the screens and the route guard need to know about central login, in
 * memory only (docs/CENTRAL_LOGIN.md).
 *
 * It lives outside React and outside the Redux store on purpose: opening a
 * facility changes the selected server, which rebuilds the whole navigation
 * tree (app/_layout.tsx), so a screen cannot hold "a facility is being opened"
 * or "this was the answer" in its own state. Nothing here is a secret and
 * nothing here is written to disk; the tokens are in centralSession.ts.
 *
 * This file imports nothing, so the route guard can read it in every test.
 */

export type CentralUser = {
  /** The central user id (`sub`), stable for the life of the account. */
  id: string;
  /** `91` and ten digits, as the service answers. */
  phoneNumber: string;
  name: string | null;
  createdAt: string;
};

/** `unknown` until the stored session has been read at start. */
export type CentralStatus = 'unknown' | 'signedOut' | 'signedIn';

/** The status of a facility on the person's own list (centralFacilities.ts). */
export type FacilityStatus = 'approved' | 'requested' | 'revoked' | 'link_needed' | 'unavailable';

/** Why a facility could not be opened; the screen shows `message`. */
export type OpenFailureReason =
  | 'not_signed_in'
  | 'facility_unreachable'
  | 'busy'
  | 'switch_failed'
  | 'central'
  | 'unknown_facility'
  | 'identity_conflict'
  | 'account_unavailable'
  | 'central_unavailable'
  | 'central_keys_unavailable'
  | 'invalid_identity_token'
  | 'invalid_otp'
  | 'rate_limited'
  | 'enrollment_limited'
  | 'network'
  /** Deleting the account at the facility failed, or its result is not known. */
  | 'account_deletion'
  | 'failed';

export type OpenOutcome =
  /** A facility session was stored and the profile is in the store: the guard enters the app. */
  | { kind: 'login' }
  /** An access request is waiting at the facility: show the waiting screen. */
  | { kind: 'pending' }
  /**
   * The facility asks for its own code (it has switched that on, at each new
   * sign-in there). It was asked to send one; `codeSent` is false when that request failed (`message` says why).
   */
  | { kind: 'link_required'; codeSent: boolean; message?: string; retryAfterSeconds?: number }
  /** The facility does not accept association sign-in: offer its own SMS sign-in. */
  | { kind: 'sms_offer' }
  | { kind: 'failed'; reason: OpenFailureReason; message: string; retryAfterSeconds?: number };

export type PendingLink = {
  origin: string;
  /** The facility's name, for the heading of the code step. */
  name: string;
  /** The central phone number the facility sent its code to. */
  phoneNumber: string;
};

export type CentralState = {
  status: CentralStatus;
  user: CentralUser | null;
  /** The number a central code was sent to, between the two sign-in steps. */
  signInPhone: string | null;
  /** Set when the session ended because the service refused it; shown once on central sign-in. */
  endedMessage: string | null;
  /** The facility whose own SMS sign-in is in use because it does not accept association sign-in. */
  facilitySmsOrigin: string | null;
  /** The origin of the facility being opened, or null. */
  opening: string | null;
  /** How many sign-outs or account deletions are running (src/store/centralSignOut.ts): above 0, no facility may be opened. */
  leaving: number;
  /** The answer of the last open that no screen has handled yet. */
  outcome: { id: number; origin: string; name: string; outcome: OpenOutcome } | null;
  /** The linking step in progress (app/facility-link.tsx). */
  pendingLink: PendingLink | null;
  /** False until My facilities has had its one chance to skip the list at start. */
  autoOpenSpent: boolean;
};

const initial: CentralState = {
  status: 'unknown',
  user: null,
  signInPhone: null,
  endedMessage: null,
  facilitySmsOrigin: null,
  opening: null,
  leaving: 0,
  outcome: null,
  pendingLink: null,
  autoOpenSpent: false,
};

let state: CentralState = initial;
const listeners = new Set<() => void>();

export const getCentralState = (): CentralState => state;

export function subscribeCentralState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Moves on whenever the person changes: a sign-in, a sign-out, or another person's
 * sign-in. Work begun for one person (opening a facility, openFacility.ts) compares it
 * before each step and stops when it has moved. Not moved by a profile change of the
 * same person (a new name) or a token refresh.
 */
let identityGeneration = 0;
export const getCentralIdentityGeneration = (): number => identityGeneration;

export function setCentralState(patch: Partial<CentralState>): void {
  const before = state;
  state = { ...state, ...patch };
  if (state.status !== before.status || state.user?.id !== before.user?.id) identityGeneration += 1;
  for (const listener of [...listeners]) listener();
}

let outcomeId = 0;
export const nextOutcomeId = (): number => ++outcomeId;

/** Tests only. */
export function resetCentralStateForTests(): void {
  state = initial;
  outcomeId = 0;
  identityGeneration += 1;
  for (const listener of [...listeners]) listener();
}
