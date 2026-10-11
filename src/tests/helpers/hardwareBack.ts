/**
 * The Android Back key for screen tests: collects the listeners a screen
 * registers and presses Back the way React Native does (the listener added
 * last is asked first, and the first one that answers true ends the press).
 */
import { BackHandler, Platform } from 'react-native';

type Listener = () => boolean | null | undefined;

export function installHardwareBack() {
  const listeners: Listener[] = [];
  const platform = Platform.OS;
  Platform.OS = 'android';

  // Replaced by hand, not with jest.spyOn: this file is not a test file, so it
  // is also read by the app's type check, which does not know jest.
  const addEventListener = BackHandler.addEventListener;
  BackHandler.addEventListener = ((_event: string, listener: Listener) => {
    listeners.push(listener);
    return {
      remove: () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
  }) as typeof BackHandler.addEventListener;

  return {
    /** How many screens listen for Back right now. */
    count: () => listeners.length,
    /** Presses Back. True when a listener took the press; false when it is left to the system. */
    press: (): boolean => {
      for (let index = listeners.length - 1; index >= 0; index -= 1) {
        if (listeners[index]()) return true;
      }
      return false;
    },
    restore: () => {
      BackHandler.addEventListener = addEventListener;
      Platform.OS = platform;
    },
  };
}
