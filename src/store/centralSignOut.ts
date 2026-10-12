/**
 * Ending the central sign-in from "My facilities" (docs/CENTRAL_LOGIN.md).
 *
 * Both actions also leave the facility the app has selected, with the same
 * cleanup as a server change, so nothing of a facility session outlives the
 * identity that opened it.
 */
import { getActiveOperatorServer } from '@/config/operatorServer';
import { deleteCentralAccount, signOutCentral, type CentralFailure } from '@/config/centralSession';
import { deleteMyFacilities, removeMyFacility } from '@/config/centralFacilities';
import { getCentralState, setCentralState } from '@/config/centralState';
import { deleteAccount } from '@/store/slices/authSlice';
import { leaveFacility, type LeaveFacilityOutcome } from './operatorSwitch';

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
export async function signOutEverywhere(dispatch: Dispatch): Promise<CentralEndOutcome> {
  if (!(await leaveSelectedFacility(dispatch))) return { ok: false, reason: 'busy' };
  await signOutCentral();
  return { ok: true };
}

/**
 * "Delete my account": the current facility is left first (a write in flight
 * refuses the whole deletion), then the person is deleted at the central
 * service (`DELETE /v1/me`) and the device forgets the central session and the
 * person's list of facilities. Records at a facility are kept by that facility.
 */
export async function deleteAccountEverywhere(dispatch: Dispatch): Promise<CentralEndOutcome> {
  if (!(await leaveSelectedFacility(dispatch))) return { ok: false, reason: 'busy' };
  const deleted = await deleteCentralAccount();
  if (!deleted.ok) return { ok: false, reason: 'central', failure: deleted };
  if (deleted.userId) await deleteMyFacilities(deleted.userId).catch(() => {});
  return { ok: true };
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
 * route guard then shows My facilities at once, so the start-up skip is spent
 * BEFORE the thunk is dispatched; otherwise the list could open the facility
 * again and file a new access request for the account just deleted. Spending
 * it on a failed deletion is harmless. `openFacility` also refuses to start
 * while that logout is pending. Throws what the thunk throws; the returned
 * outcome is that of the final cleanup.
 */
export async function deleteFacilityAccount(dispatch: Dispatch): Promise<LeaveFacilityOutcome> {
  const server = getActiveOperatorServer();
  const userId = getCentralState().user?.id;
  setCentralState({ autoOpenSpent: true });
  await dispatch(deleteAccount()).unwrap();
  if (server && userId) await removeMyFacility(userId, server.origin).catch(() => {});
  // The profile is gone at the facility: there is no session left to revoke.
  // A write that was still in flight gets one more chance to settle.
  let outcome = await leaveFacility(dispatch, { localOnly: true });
  if (outcome !== 'left') outcome = await leaveFacility(dispatch, { localOnly: true });
  return outcome;
}
