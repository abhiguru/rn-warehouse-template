/**
 * Central login (docs/CENTRAL_LOGIN.md): the way back to My facilities from a screen that
 * was opened on top of it, the waiting screen and the code step.
 */
import { router } from 'expo-router';
import { currentRootState, myFacilitiesBelow } from './RouteGuard';

/**
 * Back to the My facilities that is already in the stack. `replace` would put a second one
 * on top of the first: both stay mounted, both act on the next answer of an open, and Back
 * no longer leaves in one press.
 *
 * When there is none below (the waiting screen after a facility's own SMS sign-in is
 * reached by `replace`, with that facility's sign-in under it), the stack is taken down
 * and My facilities replaces the screen: alone, as after central sign-in. `dismissTo` would
 * leave [login, facilities], and one Back from there shows a spinner while the guard
 * brings My facilities back. When the navigator's state cannot be read, `dismissTo` is all
 * there is.
 */
export function returnToMyFacilities(): void {
  const rootState = currentRootState();
  if (rootState === undefined || myFacilitiesBelow(rootState)) {
    router.dismissTo('/facilities');
    return;
  }
  if (router.canDismiss()) router.dismissAll();
  router.replace('/facilities');
}

/**
 * To My facilities after central sign-in, as the only screen in the stack. The code step
 * sits on central sign-in (and that, after a central session that ended on a central
 * screen, on an earlier My facilities): replacing only the code step would leave those
 * under the new My facilities, hidden until the person is signed in again and then mounted
 * a second time.
 */
export function startAtMyFacilities(): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/facilities');
}
