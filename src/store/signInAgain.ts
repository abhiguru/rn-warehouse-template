/**
 * "Sign in again" on the "Couldn't start the app" screen (WH-363, product/design/offline-capture.md 12.3).
 *
 * Ends this phone's saved sign-in and removes the phone copy and its key (also when the key cannot be read: the file
 * and the key are deleted without reading either), and keeps the facility selected and on My facilities. Unsent work
 * is not in the session-scoped list, so it stays (spec step 21). On `ready` the facility's own sign-in (mobile number
 * and code) is what the route guard shows next.
 *
 * `failed`: the phone could not remove the saved sign-in from its secure storage. The facility stays selected, the
 * sign-out marker of `signOut` makes a later start remove what stayed, and the screen stays as it is.
 */
import { logout } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store';
import { queryClient } from '@/lib/queryClient';
import { beginOperatorSwitch, endOperatorSwitch } from '@/config/supabaseConfig';
import { setCentralState } from '@/config/centralState';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { eraseCopy } from '@/features/phone-copy/copyDb';

export type SignInAgainOutcome = 'ready' | 'busy' | 'failed';

export async function endSessionKeepingFacility(dispatch: AppDispatch): Promise<SignInAgainOutcome> {
  if (queryClient.isMutating() > 0) return 'busy';
  if (!beginOperatorSwitch()) return 'busy';
  try {
    const facility = getActiveOperatorServer();
    if (!facility) return 'failed';
    const ended = await dispatch(logout({ localOnly: true })).unwrap();
    // The copy's file and key go whatever the other clears did; `eraseCopy` never throws.
    await eraseCopy();
    if (ended?.localCleared === false) return 'failed';
    setCentralState({ autoOpenSpent: true, facilitySmsOrigin: facility.origin, pendingLink: null });
    return 'ready';
  } catch {
    return 'failed';
  } finally {
    endOperatorSwitch();
  }
}
