/**
 * Central login (docs/CENTRAL_LOGIN.md): the way back to My facilities from a screen that
 * was opened on top of it, the waiting screen and the code step.
 */
import { router } from 'expo-router';
import { currentRootState, liveRootRoute, myFacilitiesBelow } from './RouteGuard';

/**
 * Back to the My facilities that is already in the stack. `replace` would put a second one
 * on top of the first: both stay mounted, both act on the next answer of an open, and Back
 * no longer leaves in one press.
 *
 * This can run late: the waiting screen signs out at the facility first and goes back only
 * when that returns, and the person may have pressed Back in the meantime. When My facilities
 * is then already the route that is shown, `dismissTo` goes to the route that is shown and
 * changes nothing, whereas `replace` would give it a new key and mount it a second time.
 *
 * When there is no My facilities below the screen (the waiting screen after a facility's own
 * SMS sign-in is reached by `replace`, with that facility's sign-in under it), the stack is
 * taken down and My facilities replaces the screen: alone, as after central sign-in.
 * `dismissTo` would leave [login, facilities], and one Back from there shows a spinner while
 * the guard brings My facilities back. When the navigator's state cannot be read, or the
 * app's stack cannot be found in it, nothing is known about the stack and `dismissTo` is all
 * there is.
 */
export function returnToMyFacilities(): void {
  const rootState = currentRootState();
  const shown = liveRootRoute(rootState);
  if (shown === undefined || shown === 'facilities' || myFacilitiesBelow(rootState)) {
    router.dismissTo('/facilities');
    return;
  }
  if (router.canDismiss()) router.dismissAll();
  router.replace('/facilities');
}

/**
 * To My facilities after central sign-in, as the only screen in the stack. The code step
 * sits on central sign-in, which is the only screen under it (the route guard takes the
 * stack down before it puts central sign-in in place of a screen). Replacing only the code
 * step would leave central sign-in under the new My facilities, hidden until the person is
 * signed in again and then mounted a second time. So the stack is first taken down to its
 * first route, central sign-in, and My facilities replaces that.
 */
export function startAtMyFacilities(): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/facilities');
}
