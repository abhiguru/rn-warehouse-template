/**
 * How far a bar at the bottom of a screen must be lifted so the keyboard does not cover it (WH-227, WH-228).
 * Edge to edge on Android does not always make the window shorter for the keyboard, so on `keyboardDidShow` the bar
 * (put `ref` on it) is measured against the keyboard's top edge and lifted by exactly the part covered; on hide the
 * lift goes back to 0. The measured place already includes the lift, so the part still covered (or the gap left)
 * corrects it. A window that does shrink gives an overlap of 0 and nothing changes; the scroll area above, being the
 * flexible part of the column, gives way. Apply `lift` as the bar's `marginBottom`.
 */
import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import type { ViewRef } from '@/types/nativeRefs';

export function useKeyboardCoverLift() {
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [lift, setLift] = useState(0);
  const ref = useRef<ViewRef>(null);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardShown(true);
      // An event without its coordinates gives no lift, and never throws inside a keyboard listener.
      const keyboardTop = event?.endCoordinates?.screenY;
      if (typeof keyboardTop !== 'number') return;
      ref.current?.measureInWindow((_x, y, _width, height) => {
        setLift(previous => Math.max(0, previous + (y + height - keyboardTop)));
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardShown(false);
      setLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return { ref, lift, keyboardShown };
}

export default useKeyboardCoverLift;
