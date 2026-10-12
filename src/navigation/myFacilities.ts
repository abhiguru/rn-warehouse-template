/**
 * Central login (docs/CENTRAL_LOGIN.md): the way back to My facilities from a screen that
 * was opened on top of it, the waiting screen and the code step.
 */
import { router } from 'expo-router';

/**
 * Back to the My facilities that is already in the stack. `replace` would put a second one
 * on top of the first: both stay mounted, both act on the next answer of an open, and Back
 * no longer leaves in one press.
 *
 * When there is none below (the waiting screen after a facility's own SMS sign-in is
 * reached by `replace`, with that facility's sign-in under it), `dismissTo` puts My
 * facilities in the place of the focused screen, as `replace` did.
 */
export function returnToMyFacilities(): void {
  router.dismissTo('/facilities');
}
