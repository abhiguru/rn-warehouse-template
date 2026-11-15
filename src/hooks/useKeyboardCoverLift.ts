/**
 * How far a bar at the bottom of a screen must be lifted so the keyboard does not cover it (WH-227, WH-228).
 * Edge to edge on Android does not always make the window shorter for the keyboard, so while the keyboard is up the
 * bar (put `ref` and `onLayout` on it) is measured against the keyboard's top edge and lifted by exactly the part it
 * covers right now; with the keyboard down the lift is 0. The bar's own lift is a margin, so the measured place
 * includes it: the un-lifted bottom is the measured bottom plus the current lift, and the covered part is that minus
 * the keyboard's top. It is measured again when the keyboard appears or changes height (`keyboardDidShow`,
 * `keyboardDidChangeFrame`), when the bar is laid out and when the window size changes, so a window that shrinks
 * after the keyboard appeared brings the lift back to 0. A bar mounted while the keyboard is already open is lifted
 * too. An event without coordinates changes nothing. Apply `lift` as the bar's `marginBottom`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, type LayoutChangeEvent } from 'react-native';
import type { ViewRef } from '@/types/nativeRefs';

export function useKeyboardCoverLift() {
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [lift, setLift] = useState(0);
  const ref = useRef<ViewRef>(null);
  const liftRef = useRef(0);
  /** The keyboard's top edge in window coordinates; null while it is down. */
  const keyboardTopRef = useRef<number | null>(null);

  const apply = useCallback((next: number) => {
    liftRef.current = next;
    setLift(next);
  }, []);

  const measure = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    if (keyboardTop === null) return;
    ref.current?.measureInWindow((_x, y, _width, height) => {
      if (keyboardTopRef.current === null) return;
      const unliftedBottom = y + height + liftRef.current;
      apply(Math.max(0, unliftedBottom - keyboardTopRef.current));
    });
  }, [apply]);

  useEffect(() => {
    const open = (event: { endCoordinates?: { screenY?: number } } | undefined) => {
      setKeyboardShown(true);
      const keyboardTop = event?.endCoordinates?.screenY;
      if (typeof keyboardTop !== 'number') return;
      keyboardTopRef.current = keyboardTop;
      measure();
    };
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', open),
      Keyboard.addListener('keyboardDidChangeFrame', event => {
        if (keyboardTopRef.current !== null) open(event);
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardTopRef.current = null;
        setKeyboardShown(false);
        apply(0);
      }),
      Dimensions.addEventListener('change', measure),
    ];
    // Mounted while the keyboard is already open: no show event will come.
    if (typeof Keyboard.isVisible === 'function' && Keyboard.isVisible() && typeof Keyboard.metrics === 'function') {
      open({ endCoordinates: Keyboard.metrics() ?? undefined });
    }
    return () => subscriptions.forEach(subscription => subscription?.remove());
  }, [apply, measure]);

  const onLayout = useCallback((_event: LayoutChangeEvent) => measure(), [measure]);

  return { ref, lift, keyboardShown, onLayout };
}

export default useKeyboardCoverLift;
