/**
 * The way into a new dispatch from the Dispatch tab: the "Create dispatch" button and the button of the empty list.
 *
 * A new dispatch starts from an empty form. Whatever an earlier form left in the store (a number fetched for a form
 * that was left with Back, a date from the day before, an edit that was not finished) is not offered to it, so the
 * form is reset here, before step 1 opens. It is not reset in the form's layout: "Generate Dispatch" on an order
 * fills the form first and then opens step 1.
 *
 * A second tap before the tab is in front again does nothing (the first tap already opened step 1; a second one
 * opened another step 1 on top of it).
 *
 * Another dispatch form that is still open (an edit, or an earlier new dispatch, maybe hidden under other screens)
 * is asked about first, before anything is reset: emptying the form would leave the open one without its data. The
 * person is told which form is open and offered "Open it".
 */
import { useCallback, useRef } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { resetForm } from '@/store/slices/dispatchFormSlice';
import { endDispatchFormSession } from '@/features/dispatch/utils/dispatchFormSession';
import { openDispatchFormBlocking } from '@/features/dispatch/utils/openDispatchForms';
import { showOpenDispatchFormRefusal } from '@/features/dispatch/utils/refuseOpenForm';

export function useOpenNewDispatchForm(): () => void {
  const dispatch = useAppDispatch();

  // Set by the first tap until the tab is in front again.
  const isOpening = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isOpening.current = false;
    }, [])
  );

  return useCallback(() => {
    if (isOpening.current) return;
    const blocker = openDispatchFormBlocking();
    if (blocker) {
      showOpenDispatchFormRefusal(blocker);
      return;
    }
    isOpening.current = true;
    endDispatchFormSession();
    dispatch(resetForm());
    router.push('/dispatch-form/step1');
  }, [dispatch]);
}
