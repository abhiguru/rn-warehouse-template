/**
 * Whether a screen reader (TalkBack, VoiceOver) is on, following the person switching it on or off
 * while the screen is open. The last known answer is kept for the session and is where the next
 * screen starts, so only the first one can draw for a moment as if it were off.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let known = false;

export function useScreenReader(): boolean {
  const [on, setOn] = useState(known);
  useEffect(() => {
    let active = true;
    let heard = false;
    Promise.resolve(AccessibilityInfo.isScreenReaderEnabled?.())
      .then((enabled) => {
        // An answer that comes after a switch event is older than the event.
        if (!active || heard) return;
        known = !!enabled;
        setOn(known);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      heard = true;
      known = !!enabled;
      if (active) setOn(known);
    });
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return on;
}

/** For tests: forget the last known answer. */
export const resetScreenReaderKnown = (): void => {
  known = false;
};

export default useScreenReader;
