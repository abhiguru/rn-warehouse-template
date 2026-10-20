/**
 * Changing the facility the app works with, and leaving one.
 *
 * One sequence for every way of changing the server: the server address screen
 * (OperatorServerSelection) and, with central login, opening a facility from
 * "My facilities" (src/config/openFacility.ts). The order matters and is the
 * same everywhere: refuse while a write is in flight, stage the destination,
 * end the old session, clear everything that belonged to it, and only then
 * commit the new server.
 */
import type { UnknownAction } from '@reduxjs/toolkit';
import { logout } from '@/store/slices/authSlice';
import { clearSessionScopedState } from '@/store/sessionScopedState';
import ConfigService from '@/services/configService';
import { queryClient } from '@/lib/queryClient';
import {
  beginOperatorSwitch,
  clearPendingEnrollment,
  endOperatorSwitch,
  getPendingEnrollmentToken,
  isOperatorSwitchFree,
  signOutPendingEnrollment,
} from '@/config/supabaseConfig';
import { setCentralState } from '@/config/centralState';
import {
  clearOperatorServer,
  commitStagedOperatorServer,
  getActiveOperatorServer,
  loadOperatorServer,
  stageOperatorServer,
  type OperatorServer,
} from '@/config/operatorServer';
import {
  clearStaleFacility,
  forgetStaleGeneration,
  isSameFacility,
  loadStaleFacilities,
  staleGenerationOf,
  type StaleFacility,
} from '@/config/staleFacilitySession';
import { getSessionGeneration } from '@/config/sessionLifecycle';

/** The store's dispatch; `logout` is a thunk, so its result is unwrapped. */
type Dispatch = (action: any) => any;

export type OperatorSwitchOutcome =
  /** The new server is committed and the old session and its state are gone. */
  | { kind: 'switched' }
  /** The server chosen is the one already active: nothing was touched. */
  | { kind: 'same' }
  /** A write is in flight (or another switch): nothing was touched. */
  | { kind: 'busy' }
  /** It failed part-way. `sessionCleared` says whether the old session is already gone. */
  | { kind: 'failed'; sessionCleared: boolean };

export interface OperatorSwitchHooks {
  /** The switch gate is held: the caller may show that it is busy. */
  onBegin?: () => void;
  /** Called while the gate is held, when the chosen server is the active one. */
  onSame?: () => void;
  /** Called while the gate is held, right after the new server is committed. A throw counts as a failure. */
  onCommitted?: () => void;
  /** Called after the gate is released, whatever happened. */
  onEnd?: () => void;
}

export async function switchOperatorServer(
  selected: OperatorServer,
  dispatch: Dispatch,
  hooks: OperatorSwitchHooks = {}
): Promise<OperatorSwitchOutcome> {
  if (queryClient.isMutating() > 0) return { kind: 'busy' };
  if (!beginOperatorSwitch()) return { kind: 'busy' };
  hooks.onBegin?.();
  let sessionCleared = false;
  try {
    const previous = getActiveOperatorServer();
    if (previous?.origin === selected.origin && previous.instanceId === selected.instanceId) {
      // Same server: nothing changes.
      hooks.onSame?.();
      return { kind: 'same' };
    }
    await stageOperatorServer(selected);
    sessionCleared = true;
    // The URL now serving another instance must not be handed the old refresh
    // credential through a revocation request.
    const replacedAtSameOrigin = previous?.origin === selected.origin && previous.instanceId !== selected.instanceId;
    await dispatch(logout(replacedAtSameOrigin ? { localOnly: true } : undefined)).unwrap();
    if (await getPendingEnrollmentToken()) {
      if (previous && !replacedAtSameOrigin) await signOutPendingEnrollment();
      else await clearPendingEnrollment();
    }
    await clearSessionScopedState(dispatch as (action: UnknownAction) => unknown);
    await ConfigService.clearCache();
    await commitStagedOperatorServer(selected);
    hooks.onCommitted?.();
    return { kind: 'switched' };
  } catch {
    return { kind: 'failed', sessionCleared };
  } finally {
    endOperatorSwitch();
    hooks.onEnd?.();
  }
}

export type LeaveFacilityOutcome = 'left' | 'busy' | 'failed';

export type LeaveFacilityOptions = {
  /** Nothing is revoked through the facility; its pending enrollment is only forgotten. */
  localOnly?: boolean;
  /**
   * Leave this facility only. When another server (or none) is selected by the time the
   * switch gate is held, the change that selected it has already ended this facility's
   * session: the answer is `left` and nothing is touched, so a session of whoever is
   * signed in now is never ended in its place.
   */
  facility?: StaleFacility;
  /**
   * Leave only the session of this session generation. Every end or replacement of the
   * stored session moves the generation (a sign-out, a new sign-in); a token refresh does not.
   * When it has moved by the time the gate is held, that session is already gone and a session
   * stored since is someone else's: the answer is `left` and nothing is touched.
   *
   * The leave writes the generation its own logout moved to back into `session`, so that a
   * later step of the same cleanup (the retry, the forced leave) can tell this cleanup's own
   * sign-out from a sign-in that began since.
   */
  session?: StaleSessionRef;
};

/** The generation of the session a cleanup is about; the cleanup's own sign-out updates it. */
export type StaleSessionRef = { generation: number };

/**
 * Central login: leave the facility for "My facilities". The same cleanup as a
 * server change, ending in no selected server: the facility session is ended
 * (and revoked at the facility unless `localOnly`), its caches, queries and
 * drafts are cleared, and the central session is left alone.
 *
 * `failed` also means the phone's secure storage kept the facility session (the sign-out's
 * `localCleared: false`): the rest of the cleanup ran, but the person must be told.
 */
export async function leaveFacility(dispatch: Dispatch, options: LeaveFacilityOptions = {}): Promise<LeaveFacilityOutcome> {
  return (await leaveFacilityDetailed(dispatch, options)).outcome;
}

/**
 * `leaveFacility`, also saying whether the cleanup ran through and only the phone's secure storage
 * kept the facility session (`storageKept`, answered with outcome `failed`). A cleanup that threw
 * part-way is `failed` with `storageKept: false`: it has to be run again.
 */
async function leaveFacilityDetailed(
  dispatch: Dispatch,
  options: LeaveFacilityOptions
): Promise<{ outcome: LeaveFacilityOutcome; storageKept: boolean }> {
  const { outcome, storageKept } = await leaveFacilityOnce(dispatch, options);
  if (outcome === 'left' && storageKept) return { outcome: 'failed', storageKept: true };
  return { outcome, storageKept: false };
}

async function leaveFacilityOnce(
  dispatch: Dispatch,
  options: LeaveFacilityOptions
): Promise<{ outcome: LeaveFacilityOutcome; storageKept: boolean }> {
  let storageKept = false;
  try {
    return { outcome: await leaveFacilityGated(dispatch, options, () => { storageKept = true; }), storageKept };
  } catch {
    return { outcome: 'failed', storageKept };
  }
}

async function leaveFacilityGated(dispatch: Dispatch, options: LeaveFacilityOptions, onStorageKept: () => void): Promise<LeaveFacilityOutcome> {
  if (queryClient.isMutating() > 0) return 'busy';
  if (!beginOperatorSwitch()) return 'busy';
  try {
    const previous = getActiveOperatorServer();
    if (options.facility && !isSameFacility(previous, options.facility)) return 'left';
    if (options.session && options.session.generation !== getSessionGeneration()) return 'left';
    // The person asked to see the list: it must not send them straight back in.
    setCentralState({ autoOpenSpent: true, facilitySmsOrigin: null, pendingLink: null });
    const ending = dispatch(logout(options.localOnly ? { localOnly: true } : undefined));
    // The logout's signOut moved the generation before its first await.
    if (options.session) options.session.generation = getSessionGeneration();
    const ended = await ending.unwrap();
    // The phone could not remove the session from its secure storage: finish the cleanup, then say so.
    if (ended?.localCleared === false) onStorageKept();
    if (await getPendingEnrollmentToken()) {
      // Offline the sign-out forgets the token and then throws: what counts is that it is gone.
      if (previous && !options.localOnly) await signOutPendingEnrollment().catch(() => {});
      else await clearPendingEnrollment();
      if (await getPendingEnrollmentToken()) throw new Error('pending enrollment not cleared');
    }
    await clearSessionScopedState(dispatch as (action: UnknownAction) => unknown);
    await ConfigService.clearCache();
    await clearOperatorServer();
    return 'left';
  } finally {
    endOperatorSwitch();
  }
}

/** How long a write in flight is given to settle before the final cleanup is tried again. */
export const LEAVE_RETRY_WAIT_MS = 5000;
const LEAVE_RETRY_POLL_MS = 100;

/** Resolves when no mutation is in flight and the switch gate is free, or after `limitMs`. */
async function waitForWritesToSettle(limitMs: number): Promise<void> {
  const until = Date.now() + limitMs;
  while ((queryClient.isMutating() > 0 || !isOperatorSwitchFree()) && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, LEAVE_RETRY_POLL_MS));
  }
}

/** The final cleanup, with one more try after a write in flight has had time to settle. */
export async function leaveWithRetry(dispatch: Dispatch, options: LeaveFacilityOptions = {}): Promise<LeaveFacilityOutcome> {
  return (await leaveWithRetryDetailed(dispatch, options)).outcome;
}

/** `leaveWithRetry`, also saying whether the phone kept the sign-in (see `leaveFacilityDetailed`). */
export async function leaveWithRetryDetailed(
  dispatch: Dispatch,
  options: LeaveFacilityOptions = {}
): Promise<{ outcome: LeaveFacilityOutcome; storageKept: boolean }> {
  const firstTry = await leaveFacilityDetailed(dispatch, options);
  if (firstTry.outcome === 'left') return firstTry;
  // The rest of the cleanup ran; a second try would find nothing selected and wrongly answer `left`.
  if (firstTry.storageKept) return firstTry;
  if (firstTry.outcome === 'busy') await waitForWritesToSettle(LEAVE_RETRY_WAIT_MS);
  return leaveFacilityDetailed(dispatch, options);
}

/**
 * The last resort for a facility session that must not stay on the phone, when
 * `leaveWithRetry` could not leave it (src/config/openFacility.ts: an exchange that finished
 * for the previous central person). The same steps as `leaveFacility`, without the switch
 * gate: a write still in flight keeps running and is not cancelled, but `logout` moves the
 * session generation before its first await, so the write's late answer is dropped and
 * nothing it brings back is stored. Offline, the revocation fails and the local clear still
 * protects the phone.
 *
 * It acts only on the session of `session.generation` at `facility` (by default the one
 * stored now), and writes the generation its own logout moved to back into `session`.
 * The logout then waits up to 15 s for the revocation without holding the gate, so the steps
 * after it run only while nothing has begun since: the generation is still the one the logout
 * set and `facility` is still selected. A sign-in that began meanwhile (a new session, or a
 * waiting request at another facility) is the next person's, and its enrollment, drafts,
 * caches and selected server are left alone. Every step runs even if one before it threw.
 *
 * True when the earlier session is gone from the phone: the logout removed the stored
 * session, no enrollment token of it is left, and its facility is no longer selected (or a
 * session begun since has taken its place).
 */
export async function forceLeaveFacility(
  dispatch: Dispatch,
  facility: StaleFacility,
  session: StaleSessionRef = { generation: getSessionGeneration() }
): Promise<boolean> {
  const stillSelected = () => isSameFacility(getActiveOperatorServer(), facility);
  // Ended or replaced already, or another server selected (whose switch ended it).
  if (!stillSelected() || getSessionGeneration() !== session.generation) return true;
  let complete = true;
  const step = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      complete = false;
    }
  };
  setCentralState({ autoOpenSpent: true, facilitySmsOrigin: null, pendingLink: null });
  const ending = dispatch(logout());
  // The logout's signOut has moved the generation by now; whatever moves it again is new.
  const ended = getSessionGeneration();
  session.generation = ended;
  const nothingNewSince = () => getSessionGeneration() === ended && stillSelected();
  await step(async () => {
    const result = await ending.unwrap();
    if (result?.localCleared === false) complete = false;
  });
  if (!nothingNewSince()) return complete;
  await step(async () => {
    // Offline the sign-out forgets the token and then throws: what counts is that it is gone.
    if (await getPendingEnrollmentToken()) await signOutPendingEnrollment().catch(() => {});
    if (await getPendingEnrollmentToken()) complete = false;
  });
  if (nothingNewSince()) await step(() => clearSessionScopedState(dispatch as (action: UnknownAction) => unknown));
  if (nothingNewSince()) await step(() => ConfigService.clearCache());
  if (nothingNewSince()) await step(() => clearOperatorServer());
  return complete && (!stillSelected() || getSessionGeneration() !== ended);
}

/**
 * The cleanup that a stale-facility entry (src/config/staleFacilitySession.ts) waits for: run
 * at start, on every return to the foreground and before that facility is opened.
 *
 * "Selected" is decided from the saved selection: at a cold start this runs before the
 * bootstrap has read it into memory, and an empty memory must not pass for "not selected"
 * (when the saved selection cannot be read, no entry is removed).
 *
 * - In this run of the app, when the earlier session's generation is known and has moved,
 *   that session is gone (ended, or replaced by a later sign-in that must be kept): the entry
 *   is removed and nothing is left.
 * - Otherwise a listed facility that is still selected is left with the full cleanup
 *   (`leaveFacility`; a write in flight answers `busy` and the entry stays for the next try),
 *   and once it is not selected, nothing of its session can be reached any more (a stored
 *   session is the selected server's, and every change of server ends it), and the entry goes.
 *
 * True when no entry is left.
 */
export async function retryStaleFacilityCleanup(dispatch: Dispatch): Promise<boolean> {
  const entries = await loadStaleFacilities();
  if (entries.length > 0 && getActiveOperatorServer() === null) {
    try {
      await loadOperatorServer();
    } catch {
      return false; // The selection is not known: no entry is removed.
    }
  }
  let remaining = 0;
  for (const facility of entries) {
    const generation = staleGenerationOf(facility);
    const replaced = generation !== undefined && generation !== getSessionGeneration();
    if (!replaced && isSameFacility(getActiveOperatorServer(), facility)) {
      const outcome = await leaveFacility(dispatch, { facility, ...(generation !== undefined ? { session: { generation } } : {}) });
      if (outcome !== 'left') {
        // A leave that failed part-way may have moved the generation itself: judge by the selection from now on.
        if (outcome === 'failed') forgetStaleGeneration(facility);
        // Kept only while the facility is still selected; once it is not, nothing of it can be reached.
        if (isSameFacility(getActiveOperatorServer(), facility)) {
          remaining += 1;
          continue;
        }
      }
    }
    if (!(await clearStaleFacility(facility))) remaining += 1;
  }
  return remaining === 0;
}
