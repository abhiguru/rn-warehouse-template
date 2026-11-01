/**
 * Ask before unsaved work is left (house rule of 2026-10-14, style guide §14.4).
 *
 * A form calls `useLeaveGuard({ hasChanges })`. While `hasChanges` is true,
 * every way back out of the screen asks once: the header Back (which calls
 * `router.back()`), the Android Back key and back gesture, and the iOS swipe
 * all reach the stack as GO_BACK or POP, and those are held while the
 * question "Discard changes?" is shown. "Keep editing" stays on the form;
 * "Discard" calls `onDiscard` and then carries out the way out that was held.
 * When nothing changed, nothing is asked.
 *
 * `blocked` holds every one of those ways out without a question while a save is running: a person who
 * leaves in the middle of a save would be asked "Discard?" for work that is being saved anyway. It ends
 * with the save (or when `leaveWithoutAsking` is called): a screen is never left while its save finishes behind it.
 *
 * Any other action that would take the screen off (a `router.replace`, a reset
 * or POP_TO_TOP by the route guard on sign-out or when the session ends) goes
 * through at once without a question.
 *
 * `leaveWithoutAsking(go)` turns the guard off for this screen and runs `go`
 * once the screen has drawn itself again: a successful save calls it to go
 * back without being asked. The guard stays off for the rest of the screen's
 * life (the screen is on its way out).
 *
 * House wording: create forms pass `title` "Discard this <thing>?" ("Discard
 * this item?"), edit forms use the default; with no `title` the
 * question is "Discard changes?". This hook does not replace useBackHandler or
 * useFirstStepBack in the GRN, dispatch and invoice wizards.
 *
 * @example
 * const { leaveWithoutAsking } = useLeaveGuard({ hasChanges: name !== saved.name });
 * const save = async () => {
 *   await saveName(name);
 *   showToast(t('users.selfEdit.savedTitle'));
 *   leaveWithoutAsking(() => router.back());
 * };
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreventRemove } from 'expo-router/react-navigation';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';

export interface LeaveGuardOptions {
  /** True when something on the form differs from what was saved or opened. */
  hasChanges: boolean;
  /** Title of the question; default "Discard changes?" (common.discardChangesTitle). */
  title?: string;
  /** Text of the question; default "Your changes have not been saved." (common.discardChangesMessage). */
  message?: string;
  /** Runs when "Discard" is pressed, before the screen is left. */
  onDiscard?: () => void;
  /** True while a save runs: the ways back out do nothing until it ends. */
  blocked?: boolean;
}

export interface LeaveGuard {
  /** Leave without the question: turns the guard off, then runs `go` after the next render. */
  leaveWithoutAsking: (go: () => void) => void;
}

/** The ways back out that a person takes: header Back, Back key, back gesture, iOS swipe. */
const ASKS_FIRST = new Set(['GO_BACK', 'POP']);

export function useLeaveGuard({ hasChanges, title, message, onDiscard, blocked = false }: LeaveGuardOptions): LeaveGuard {
  const [bypass, setBypass] = useState(false);
  // The way out asked for by leaveWithoutAsking, run once the guard is off.
  const pendingLeave = useRef<(() => void) | null>(null);
  const [leaveRequests, setLeaveRequests] = useState(0);

  // `repeat` switches the prevention off for this screen and then dispatches the held action again; a plain
  // `navigation.dispatch(action)` would be held (and asked about) once more while the prevention is still on.
  // `bypass` is set with it so the `preventRemove` value below follows (the hook warns when they disagree).
  usePreventRemove((hasChanges || blocked) && !bypass, ({ data, repeat }) => {
    const { action } = data;
    const goOn = () => {
      setBypass(true);
      repeat();
    };
    if (!ASKS_FIRST.has(action.type)) {
      goOn();
      return;
    }
    // A save is running: Back waits for it.
    if (blocked) return;
    showAlert(
      title ?? t('common.discardChangesTitle'),
      message ?? t('common.discardChangesMessage'),
      [
        { text: t('common.keepEditing'), style: 'cancel' },
        {
          text: t('common.discard'),
          style: 'destructive',
          onPress: () => {
            onDiscard?.();
            goOn();
          },
        },
      ],
      { cancelable: true }
    );
  });

  useEffect(() => {
    const go = pendingLeave.current;
    if (!go) return;
    pendingLeave.current = null;
    go();
  }, [leaveRequests]);

  const leaveWithoutAsking = useCallback((go: () => void) => {
    pendingLeave.current = go;
    setBypass(true);
    setLeaveRequests(count => count + 1);
  }, []);

  return { leaveWithoutAsking };
}

export default useLeaveGuard;
