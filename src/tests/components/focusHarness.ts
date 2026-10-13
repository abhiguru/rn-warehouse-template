/**
 * A stand-in for expo-router's `useFocusEffect` with a focus flag a test can switch.
 *
 *   jest.mock('expo-router', () => ({
 *     router: { push: jest.fn() },
 *     useFocusEffect: require('./focusHarness').useFocusEffect,
 *   }));
 *
 * It behaves like the installed hook (node_modules/expo-router/build/useFocusEffect.js):
 * while the screen is focused the effect runs on mount and again, after its cleanup,
 * whenever the callback's identity changes; a blur runs the cleanup; a focus after a
 * blur runs the effect again. With the flag left at true it is
 * `cb => useEffect(cb, [cb])`, never a no-op.
 */
import { useEffect } from 'react';

type Effect = () => void | (() => void);
type Listener = (focused: boolean) => void;

const listeners = new Set<Listener>();
let screenFocused = true;

export function useFocusEffect(effect: Effect) {
  useEffect(() => {
    let cleanup: void | (() => void);
    let running = false;
    const onChange: Listener = focused => {
      if (focused && !running) {
        cleanup = effect();
        running = true;
      } else if (!focused && running) {
        if (cleanup) cleanup();
        cleanup = undefined;
        running = false;
      }
    };
    if (screenFocused) onChange(true);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      if (cleanup) cleanup();
    };
  }, [effect]);
}

/** Blur (false) or focus (true) every screen rendered with this stand-in. Call inside act(). */
export function setScreenFocused(focused: boolean) {
  screenFocused = focused;
  listeners.forEach(listener => listener(focused));
}

/** The flag, for a `useIsFocused` stand-in; rerender after setScreenFocused to pass it on. */
export function isScreenFocused() {
  return screenFocused;
}

/** Back to a focused screen with no listeners, for the next test. */
export function resetScreenFocus() {
  screenFocused = true;
  listeners.clear();
}
