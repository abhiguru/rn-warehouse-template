/**
 * Whether a screen reader (TalkBack, VoiceOver) is on, following the person switching it on or off
 * while the screen is open.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve(AccessibilityInfo.isScreenReaderEnabled?.())
      .then((enabled) => {
        if (active) setOn(!!enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return on;
}

export default useScreenReader;
