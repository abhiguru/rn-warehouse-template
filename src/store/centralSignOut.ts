/**
 * Ending the central sign-in from "My facilities" (docs/CENTRAL_LOGIN.md).
 *
 * Both actions also leave the facility the app has selected, with the same
 * cleanup as a server change, so nothing of a facility session outlives the
 * identity that opened it.
 */
import { getActiveOperatorServer } from '@/config/operatorServer';
import { deleteCentralAccount, signOutCentral, type CentralFailure } from '@/config/centralSession';
import { deleteMyFacilities, loadMyFacilities, removeMyFacility, updateMyFacility } from '@/config/centralFacilities';
import { getCentralState, setCentralState } from '@/config/centralState';
import { deleteAccount } from '@/store/slices/authSlice';
import { store } from '@/store';
import { queryClient } from '@/lib/queryClient';
import { t } from '@/i18n';
import { leaveFacility, type LeaveFacilityOutcome } from './operatorSwitch';

/** How long a write in flight is given to settle before the final cleanup is tried again. */
export const LEAVE_RETRY_WAIT_MS = 5000;
const LEAVE_RETRY_POLL_MS = 100;

/** Resolves when no mutation is in flight, or after `limitMs`. */
async function waitForWritesToSettle(limitMs: number): Promise<void> {
  const until = Date.now() + limitMs;
  while (queryClient.isMutating() > 0 && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, LEAVE_RETRY_POLL_MS));
  }
}

/** The final cleanup, with one more try after a write in flight has had time to settle. */
async function leaveWithRetry(dispatch: Dispatch, options: { localOnly?: boolean }): Promise<LeaveFacilityOutcome> {
  const first = await leaveFacility(dispatch, options);
  if (first === 'left') return first;
  if (first === 'busy') await waitForWritesToSettle(LEAVE_RETRY_WAIT_MS);
  return leaveFacility(dispatch, options);
}

/**
 * Holds the "leaving" flag (src/config/centralState.ts) for the whole of a
 * sign-out or deletion: openFacility refuses to start meanwhile, also in the
 * moments between the store's request flags and the list changes.
 */
async function whileLeaving<T>(work: () => Promise<T>): Promise<T> {
  setCentralState({ leaving: true });
  try {
    return await work();
  } finally {
    setCentralState({ leaving: false });
  }
}

type Dispatch = (action: any) => any;

export type CentralEndOutcome = { ok: true } | { ok: false; reason: 'busy' } | { ok: false; reason: 'central'; failure: CentralFailure };

/** Leave the selected facility, if there is one. False while a write is in flight. */
async function leaveSelectedFacility(dispatch: Dispatch): Promise<boolean> {
  if (!getActiveOperatorServer()) return true;
  // A failed cleanup must not keep the person signed in: only "busy" stops here.
  return (await leaveFacility(dispatch)) !== 'busy';
}

/**
 * "Sign out" on My facilities: the central session is revoked and forgotten,
 * and the current facility is signed out too. The list of facilities stays on
 * the device for the next sign-in of the same person; it holds no secret.
 */
export function signOutEverywhere(dispatch: Dispatch): Promise<CentralEndOutcome> {
  return whileLeaving(async () => {
    if (!(await leaveSelectedFacility(dispatch))) return { ok: false, reason: 'busy' };
    await signOutCentral();
    return { ok: true };
  });
}

/**
 * "Delete my account": the current facility is left first (a write in flight
 * refuses the whole deletion), then the person is deleted at the central
 * service (`DELETE /v1/me`) and the device forgets the central session and the
 * person's list of facilities. Records at a facility are kept by that facility.
 */
export function deleteAccountEverywhere(dispatch: Dispatch): Promise<CentralEndOutcome> {
  return whileLeaving(async () => {
    if (!(await leaveSelectedFacility(dispatch))) return { ok: false, reason: 'busy' };
    const deleted = await deleteCentralAccount();
    if (!deleted.ok) return { ok: false, reason: 'central', failure: deleted };
    if (deleted.userId) await deleteMyFacilities(deleted.userId).catch(() => {});
    return { ok: true };
  });
}

/**
 * Settings, "Delete account" inside a facility while central login is on: the
 * profile at THAT facility is deleted (the existing `deleteAccount` thunk, which
 * also ends the facility session), the facility leaves the person's list, and
 * the app returns to My facilities through the same cleanup as "Switch
 * facility".
 *
 * The thunk's own `logout` empties the profile in the store the moment it
 * starts, long before it resolves (the server revocation can take 15 s). The
 * route guard then shows My facilities at once. So, BEFORE the thunk is
 * dispatched: the start-up skip is spent, the entry is marked `unavailable`
 * on disk (an attempted deletion must never be auto-opened again, also on the
 * next cold start, also if the removal below never runs), and the "leaving"
 * flag refuses every open until this function returns.
 *
 * The thunk can reject AFTER the server has deleted the account: the session
 * generation moved during the call (a concurrent forced sign-out), or its own
 * logout rejected after emptying the store. Such a rejection, recognised by
 * the profile being gone from the store or by the thunk's "session changed"
 * payload, is treated like a success for the cleanup: the entry is removed
 * and the facility left; the error is then rethrown. Only a refusal by the
 * server (the profile is still in the store) keeps the entry, with its
 * status restored. The returned outcome is that of the final cleanup.
 */
export function deleteFacilityAccount(dispatch: Dispatch): Promise<LeaveFacilityOutcome> {
  return whileLeaving(async () => {
    const server = getActiveOperatorServer();
    const userId = getCentralState().user?.id;
    setCentralState({ autoOpenSpent: true });
    const previousStatus =
      server && userId ? (await loadMyFacilities(userId)).find(entry => entry.origin === server.origin)?.status : undefined;
    if (server && userId) await updateMyFacility(userId, server.origin, { status: 'unavailable' }).catch(() => {});

    let failure: unknown = undefined;
    try {
      await dispatch(deleteAccount()).unwrap();
    } catch (error) {
      failure = error;
      const refused = store.getState().auth.userProfile !== null && error !== t('errors.auth.sessionChanged');
      if (refused) {
        // The server kept the account: the facility stays on the list as it was.
        if (server && userId && previousStatus) await updateMyFacility(userId, server.origin, { status: previousStatus }).catch(() => {});
        throw error;
      }
    }
    if (server && userId) await removeMyFacility(userId, server.origin).catch(() => {});
    // The profile is gone at the facility: there is no session left to revoke.
    const outcome = await leaveWithRetry(dispatch, { localOnly: true });
    if (failure !== undefined) throw failure;
    return outcome;
  });
}
