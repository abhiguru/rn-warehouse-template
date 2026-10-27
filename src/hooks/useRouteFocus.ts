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
 */
export function useRouteFocus(enabled: boolean): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState<boolean>(() =>
    !enabled || !navigation ? true : navigation.isFocused()
  );

  useEffect(() => {
    if (!enabled || !navigation) {
      setFocused(true);
      return undefined;
    }
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation, enabled]);

  return focused;
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
