import { useCallback, useMemo, useRef, type RefObject } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

/**
 * present() and dismiss() for a BottomSheetModal that a flag shows and hides.
 *
 * dismiss() must not reach a modal that is not on screen. @gorhom/bottom-sheet 5.2
 * then leaves the modal in its "dismissing" state for good, and a modal in that state
 * does not render when presented: the sheet silently never opens. A sheet that ran
 * `isVisible ? present() : dismiss()` in an effect did exactly that on its first render.
 *
 * Pass `onDismissed` to the modal's `onDismiss`.
 */
export function useModalSheet(ref: RefObject<BottomSheetModal | null>) {
  const presented = useRef(false);

  const present = useCallback(() => {
    presented.current = true;
    ref.current?.present();
  }, [ref]);

  const dismiss = useCallback(() => {
    if (presented.current) ref.current?.dismiss();
  }, [ref]);

  const onDismissed = useCallback(() => {
    presented.current = false;
  }, []);

  return useMemo(() => ({ present, dismiss, onDismissed }), [present, dismiss, onDismissed]);
}
