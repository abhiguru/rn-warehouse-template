/**
 * The Android Back key on the first step of a create form (GRN, dispatch,
 * invoice; owner decision 7 of 2026-10-11).
 *
 * With something entered, Back asks before the form is discarded:
 * `askToDiscard` shows the question the close button (X) of that form shows,
 * and the "Discard" of that question does what the X's does. With nothing
 * entered, Back leaves for the list at once, as it did before.
 *
 * Later steps do not use this: there Back goes to the step before
 * (useBackHandler with `currentStep`). Edit forms do not use it either.
 *
 * The listener is added once when the step comes into focus and stays the same
 * one until the step is left (useBackHandler reads `hasData` and `askToDiscard`
 * at the moment Back is pressed). A bottom sheet adds its own listener when it
 * opens, which is later, so an open sheet is always asked first and closes.
 */
import { useRouter, type Href } from 'expo-router';
import { useBackHandler } from './useBackHandler';

export interface FirstStepBackOptions {
  /** False where the screen is shared with a form that leaves Back alone (edit mode). */
  enabled?: boolean;
  /** Whether the user has entered anything that would be lost. */
  hasData: boolean;
  /** Shows the form's discard question. Its "Discard" resets the form and leaves. */
  askToDiscard: () => void;
  /** Where Back goes when nothing was entered: the list the form was opened from. */
  exitRoute: string;
  /**
   * How it leaves: `replace` (the default) puts the route in place of the form; `dismissTo` takes the form off the
   * stack back to that route, which leaves a single entry of the tab screen (a replace left two).
   */
  exitWith?: 'replace' | 'dismissTo';
}

export function useFirstStepBack({ enabled = true, hasData, askToDiscard, exitRoute, exitWith = 'replace' }: FirstStepBackOptions): void {
  const router = useRouter();

  useBackHandler({
    enabled,
    onBackPress: () => {
      if (hasData) {
        askToDiscard();
      } else {
        if (exitWith === 'dismissTo') router.dismissTo(exitRoute as Href);
        else router.replace(exitRoute as Href);
      }
      return true;
    },
  });
}

export default useFirstStepBack;
