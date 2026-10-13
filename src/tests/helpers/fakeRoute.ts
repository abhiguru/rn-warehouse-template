/**
 * A route whose focus a test controls, as a native stack reports it, and the app's
 * foreground state. Give `route.navigation` to the real `NavigationContext.Provider` from
 * 'expo-router/react-navigation' around the tree; `useRouteFocus` and `useAppForeground`
 * (src/hooks/useRouteFocus.ts) then read them as they read the real ones.
 *
 * Callers wrap `blur`/`focus`/`setAppState` in `act`.
 */
import { AppState, type AppStateStatus } from 'react-native';

export function makeRoute(initiallyFocused = true) {
  let focused = initiallyFocused;
  const listeners: Record<'focus' | 'blur', Set<() => void>> = { focus: new Set(), blur: new Set() };
  const navigation = {
    isFocused: () => focused,
    addListener: (event: 'focus' | 'blur', callback: () => void) => {
      listeners[event].add(callback);
      return () => {
        listeners[event].delete(callback);
      };
    },
  };
  return {
    navigation,
    blur: () => {
      focused = false;
      listeners.blur.forEach(callback => callback());
    },
    focus: () => {
      focused = true;
      listeners.focus.forEach(callback => callback());
    },
  };
}

/**
 * Stand in for AppState's change events: `setAppState('background')` tells every listener.
 * Call in `beforeEach` and `restore()` in `afterEach`. No jest globals: the app's type
 * check reads this file too.
 */
export function fakeAppState() {
  let listeners: ((status: AppStateStatus) => void)[] = [];
  const original = AppState.addEventListener;
  AppState.addEventListener = ((_event: string, callback: (status: AppStateStatus) => void) => {
    listeners.push(callback);
    return {
      remove: () => {
        listeners = listeners.filter(listener => listener !== callback);
      },
    };
  }) as typeof AppState.addEventListener;
  return {
    setAppState: (status: AppStateStatus) => listeners.forEach(listener => listener(status)),
    listenerCount: () => listeners.length,
    restore: () => {
      AppState.addEventListener = original;
    },
  };
}
