/**
 * The session of the dispatch form.
 *
 * Every step screen has its own hook instance, so an operation that outlives its screen (the fetch of the next
 * number, say) has to ask whether the form it started for is still the one on screen. The form is a new session
 * each time it is reset: an operation that began in an older session does not write into the new form.
 *
 * Kept apart from useDispatchForm so a screen that only opens a new form (the Create dispatch buttons) can end the
 * old session without loading the whole form hook.
 */
let session = 0;

/** The session an operation starts in. */
export const currentDispatchFormSession = (): number => session;

/** The form is reset or replaced: operations of the old session are dropped when they answer. */
export const endDispatchFormSession = (): number => {
  session += 1;
  return session;
};
