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

/**
 * Central login: leave the facility for "My facilities". The same cleanup as a
 * server change, ending in no selected server: the facility session is ended
 * (and revoked at the facility unless `localOnly`), its caches, queries and
 * drafts are cleared, and the central session is left alone.
 */
export async function leaveFacility(dispatch: Dispatch, options: { localOnly?: boolean } = {}): Promise<LeaveFacilityOutcome> {
  if (queryClient.isMutating() > 0) return 'busy';
  if (!beginOperatorSwitch()) return 'busy';
  // The person asked to see the list: it must not send them straight back in.
  setCentralState({ autoOpenSpent: true, facilitySmsOrigin: null, pendingLink: null });
  try {
    const previous = getActiveOperatorServer();
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
