/**
 * Ending the central sign-in from "My facilities" (docs/CENTRAL_LOGIN.md).
 *
 * Both actions also leave the facility the app has selected, with the same
 * cleanup as a server change, so nothing of a facility session outlives the
 * identity that opened it.
 */
import { getActiveOperatorServer } from '@/config/operatorServer';
import { deleteCentralAccount, signOutCentral, type CentralFailure } from '@/config/centralSession';
import { deleteMyFacilities } from '@/config/centralFacilities';
import { leaveFacility } from './operatorSwitch';

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
 * "Delete my account": the person is deleted at the central service
 * (`DELETE /v1/me`), then the device forgets the central session, the person's
 * list of facilities and the current facility session. Records at a facility
 * are kept by that facility.
 */
export async function deleteAccountEverywhere(dispatch: Dispatch): Promise<CentralEndOutcome> {
  const deleted = await deleteCentralAccount();
  if (!deleted.ok) return { ok: false, reason: 'central', failure: deleted };
  if (deleted.userId) await deleteMyFacilities(deleted.userId).catch(() => {});
  await leaveSelectedFacility(dispatch);
  return { ok: true };
}
