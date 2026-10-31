import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Runs `onLeaving` when the hardware Back key is pressed on this screen, and lets Back go on as it
 * would have (the listener returns false). For a screen that must know it is leaving before React
 * Navigation's 'removed' event arrives, which is one commit after the Back action.
 */
export function useMarkLeavingOnBack(onLeaving: () => void): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onLeaving();
      return false;
    });
    return () => subscription.remove();
  }, [onLeaving]);
}
