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
  stageOperatorServer,
  type OperatorServer,
} from '@/config/operatorServer';
import {
  clearStaleFacility,
  isSameFacility,
  loadStaleFacilities,
  type StaleFacility,
} from '@/config/staleFacilitySession';

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
};

/**
 * Central login: leave the facility for "My facilities". The same cleanup as a
 * server change, ending in no selected server: the facility session is ended
 * (and revoked at the facility unless `localOnly`), its caches, queries and
 * drafts are cleared, and the central session is left alone.
 */
export async function leaveFacility(dispatch: Dispatch, options: LeaveFacilityOptions = {}): Promise<LeaveFacilityOutcome> {
  if (queryClient.isMutating() > 0) return 'busy';
  if (!beginOperatorSwitch()) return 'busy';
  try {
    const previous = getActiveOperatorServer();
    if (options.facility && !isSameFacility(previous, options.facility)) return 'left';
    // The person asked to see the list: it must not send them straight back in.
    setCentralState({ autoOpenSpent: true, facilitySmsOrigin: null, pendingLink: null });
    await dispatch(logout(options.localOnly ? { localOnly: true } : undefined)).unwrap();
    if (await getPendingEnrollmentToken()) {
      if (previous && !options.localOnly) await signOutPendingEnrollment();
      else await clearPendingEnrollment();
    }
    await clearSessionScopedState(dispatch as (action: UnknownAction) => unknown);
    await ConfigService.clearCache();
    await clearOperatorServer();
    return 'left';
  } catch {
    return 'failed';
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
  const first = await leaveFacility(dispatch, options);
  if (first === 'left') return first;
  if (first === 'busy') await waitForWritesToSettle(LEAVE_RETRY_WAIT_MS);
  return leaveFacility(dispatch, options);
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
 * Every step runs even if one before it threw, and only while `facility` is still the
 * selected server (a change of server meanwhile has ended its session, and must not lose its
 * own). True when every step ran and the phone removed the stored session.
 */
export async function forceLeaveFacility(dispatch: Dispatch, facility: StaleFacility): Promise<boolean> {
  const stillSelected = () => isSameFacility(getActiveOperatorServer(), facility);
  if (!stillSelected()) return true;
  let complete = true;
  const step = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      complete = false;
    }
  };
  setCentralState({ autoOpenSpent: true, facilitySmsOrigin: null, pendingLink: null });
  await step(async () => {
    const ended = await dispatch(logout()).unwrap();
    if (ended?.localCleared === false) complete = false;
  });
  await step(async () => {
    if (await getPendingEnrollmentToken()) await signOutPendingEnrollment();
  });
  await step(() => clearSessionScopedState(dispatch as (action: UnknownAction) => unknown));
  await step(() => ConfigService.clearCache());
  await step(async () => {
    if (stillSelected()) await clearOperatorServer();
  });
  return complete && !stillSelected();
}

/**
 * The cleanup that a stale-facility entry (src/config/staleFacilitySession.ts) waits for: run
 * at start, on every return to the foreground and before that facility is opened. A listed
 * facility that is still the selected server is left with the full cleanup (`leaveFacility`;
 * a write in flight answers `busy` and the entry stays for the next try). Once it is not
 * selected, nothing of its session can be reached any more (a stored session is the selected
 * server's, and every change of server ends it), and the entry is removed.
 * True when no entry is left.
 */
export async function retryStaleFacilityCleanup(dispatch: Dispatch): Promise<boolean> {
  let remaining = 0;
  for (const facility of await loadStaleFacilities()) {
    if (isSameFacility(getActiveOperatorServer(), facility) && (await leaveFacility(dispatch, { facility })) !== 'left') {
      remaining += 1;
      continue;
    }
    if (!(await clearStaleFacility(facility))) remaining += 1;
  }
  return remaining === 0;
}
