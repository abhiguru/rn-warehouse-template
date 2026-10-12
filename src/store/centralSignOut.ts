/**
 * Ending the central sign-in from "My facilities" (docs/CENTRAL_LOGIN.md).
 *
 * Both actions also leave the facility the app has selected, with the same
 * cleanup as a server change, so nothing of a facility session outlives the
 * identity that opened it.
 */
import { getActiveOperatorServer, type OperatorServer } from '@/config/operatorServer';
import { deleteCentralAccount, signOutCentral, type CentralFailure } from '@/config/centralSession';
import { deleteMyFacilities, loadMyFacilities, removeMyFacility, updateMyFacility } from '@/config/centralFacilities';
import { getCentralState, nextOutcomeId, setCentralState } from '@/config/centralState';
import { isOperatorSwitchFree } from '@/config/supabaseConfig';
import { deleteAccount, isDeleteAccountRejection } from '@/store/slices/authSlice';
import { store } from '@/store';
import { queryClient } from '@/lib/queryClient';
import { t } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { leaveFacility, type LeaveFacilityOutcome } from './operatorSwitch';

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
async function leaveWithRetry(dispatch: Dispatch, options: { localOnly?: boolean }): Promise<LeaveFacilityOutcome> {
  const first = await leaveFacility(dispatch, options);
  if (first === 'left') return first;
  if (first === 'busy') await waitForWritesToSettle(LEAVE_RETRY_WAIT_MS);
  return leaveFacility(dispatch, options);
}

/**
 * Holds the "leaving" count (src/config/centralState.ts) for the whole of a
 * sign-out or deletion: openFacility refuses to start while it is above zero,
 * also in the moments between the store's request flags and the list changes.
 * A count, so one finishing does not release another still running.
 */
async function whileLeaving<T>(work: () => Promise<T>): Promise<T> {
  setCentralState({ leaving: getCentralState().leaving + 1 });
  try {
    return await work();
  } finally {
    setCentralState({ leaving: Math.max(0, getCentralState().leaving - 1) });
  }
}

/**
 * Tells the person about a failed deletion at the facility. Settings shows a
 * thrown message itself; once the facility session is gone from the store,
 * Settings is unmounted and the person is on My facilities, so the message is
 * published there as an answer instead.
 */
function reportDeletionFailure(server: OperatorServer, message: string): 'reported' {
  if (store.getState().auth.userProfile !== null) throw message;
  // An answer already waiting on the list is not overwritten: this one is shown directly.
  if (getCentralState().outcome !== null) {
    showAlert(t('central.account.deleteFailedTitle'), message);
    return 'reported';
  }
  setCentralState({
    outcome: {
      id: nextOutcomeId(),
      origin: server.origin,
      name: server.companyName || server.displayName,
      outcome: { kind: 'failed', reason: 'account_deletion', message },
    },
  });
  return 'reported';
}

type Dispatch = (action: any) => any;

export type CentralEndOutcome =
  | { ok: true }
  | { ok: false; reason: 'busy' }
  | { ok: false; reason: 'central'; failure: CentralFailure }
  /** Signed out in memory, but the phone's secure storage kept the session; the next start removes it. */
  | { ok: false; reason: 'local_clear_failed' };

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
 * Success is answered only when the phone removed the stored session: a
 * person who trusts "Sign out" on a shared phone must be told otherwise.
 */
export function signOutEverywhere(dispatch: Dispatch): Promise<CentralEndOutcome> {
  return whileLeaving(async () => {
    if (!(await leaveSelectedFacility(dispatch))) return { ok: false, reason: 'busy' };
    if (!(await signOutCentral())) return { ok: false, reason: 'local_clear_failed' };
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
/** The final cleanup's outcome, or `reported`: the deletion failed and the person has been told on My facilities. */
export type DeleteFacilityOutcome = LeaveFacilityOutcome | 'reported';

export function deleteFacilityAccount(dispatch: Dispatch): Promise<DeleteFacilityOutcome> {
  return whileLeaving(async () => {
    const server = getActiveOperatorServer();
    const userId = getCentralState().user?.id;
    setCentralState({ autoOpenSpent: true });
    const previousStatus =
      server && userId ? (await loadMyFacilities(userId)).find(entry => entry.origin === server.origin)?.status : undefined;
    if (server && userId) await updateMyFacility(userId, server.origin, { status: 'unavailable' }).catch(() => {});

    // What the server did, from the thunk's own account of it: `true` deleted
    // (even if the thunk then rejected), `false` kept, `null` not known.
    let serverDeleted: boolean | null = true;
    let message: string | undefined;
    try {
      await dispatch(deleteAccount()).unwrap();
    } catch (error) {
      if (isDeleteAccountRejection(error)) {
        serverDeleted = error.serverDeleted;
        message = error.message;
      } else {
        serverDeleted = null;
        message = typeof error === 'string' ? error : t('settings.deleteAccount.failed');
      }
    }

    if (serverDeleted === false) {
      // The server kept the account: the facility stays on the list as it was.
      if (server && userId && previousStatus) await updateMyFacility(userId, server.origin, { status: previousStatus }).catch(() => {});
      if (!server) throw message;
      return reportDeletionFailure(server, message ?? t('settings.deleteAccount.failed'));
    }
    if (serverDeleted === true) {
      if (server && userId) await removeMyFacility(userId, server.origin).catch(() => {});
    }
    // Deleted, or not known: either way the facility is left without revoking
    // anything through it, and an entry whose fate is not known stays
    // `unavailable` so no start can open it on its own.
    const outcome = await leaveWithRetry(dispatch, { localOnly: true });
    // Not known what the server did: the person is told, unless the cleanup
    // was refused as busy; then they are still inside the facility and that
    // is the message that matters. A cleanup that failed part-way has already
    // emptied the store (Settings is gone), so the deletion message is still
    // the one to show. The entry stays Unavailable either way.
    if (serverDeleted === null && server && outcome !== 'busy') return reportDeletionFailure(server, message ?? t('settings.deleteAccount.failed'));
    return outcome;
  });
}
