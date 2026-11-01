/**
 * Whether the screen is in front of the person: its route is focused, and the app is in
 * the foreground. Shared by `usePolling` (a screen's repeating read) and `useReportQuery`
 * (a report asked again when the person comes back to it).
 */
import { useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
// Expo Router ships React Navigation inside itself. NavigationContext is read directly so
// that a component rendered outside a navigator (tests, a root-level sheet) counts as
// focused instead of throwing, which `useIsFocused` would do there.
import { NavigationContext } from 'expo-router/react-navigation';

/**
 * Whether the hosting route is focused. True when `enabled` is false or the component is
 * rendered outside a navigator.
 *
 * React Navigation 8 warns when `navigation.isFocused()` is called while rendering (it can
 * be stale then), so the first render assumes focus and the effect reads the real value
 * at once. A route is almost always mounted in front (a pushed screen, a tab opened by the
 * person); starting from `false` instead would make every such mount look like a return to
 * the screen and ask again for data it has just asked for.
 */
export function useRouteFocus(enabled: boolean): boolean {
  return useRouteFocusState(enabled).focused;
}

/**
 * `useRouteFocus` plus whether the real focus has been read yet. Until `confirmed` is true the
 * `focused` value is only the assumption of the first render; a hook that acts on focus (a poll
 * that sends a request) waits for it, so a route mounted behind another one does nothing.
 * Always confirmed when `enabled` is false or there is no navigator.
 */
export function useRouteFocusState(enabled: boolean): { focused: boolean; confirmed: boolean } {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState<boolean>(true);
  const [confirmed, setConfirmed] = useState<boolean>(() => !enabled || !navigation);

  useEffect(() => {
    if (!enabled || !navigation) {
      setFocused(true);
      setConfirmed(true);
      return undefined;
    }
    setFocused(navigation.isFocused());
    setConfirmed(true);
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation, enabled]);

  return { focused, confirmed };
}

function isForeground(status: AppStateStatus | null | undefined): boolean {
  return status !== 'background' && status !== 'inactive';
}

/** Whether the app is in the foreground (AppState 'active'). */
export function useAppForeground(): boolean {
  const [foreground, setForeground] = useState<boolean>(() => isForeground(AppState.currentState as AppStateStatus | null | undefined));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      setForeground(next === 'active');
    });
    return () => subscription.remove();
  }, []);
  return foreground;
}
