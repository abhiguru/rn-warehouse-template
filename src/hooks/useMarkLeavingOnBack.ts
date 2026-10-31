import { useContext, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useRouteFocusState } from './useRouteFocus';

/**
 * Runs `onLeaving` when the hardware Back key is pressed on this screen and that Back will take it
 * off the stack, and lets Back go on as it would have (the listener returns false). For a screen
 * that must know it is leaving before React Navigation's 'removed' event arrives, which is one
 * commit after the Back action.
 *
 * - The listener exists only while this screen is the focused route: a screen under another one
 *   never reacts to a Back that belongs to the screen in front.
 * - It marks only when there is a screen to go back to. On the only route of the stack, Back puts the
 *   app in the background and the screen stays.
 * - Listeners are asked newest first, so a handler added after this one (a dialog, a sheet) that takes
 *   the press never reaches this one. A handler added before it that takes the press afterwards cannot
 *   be seen from here; none of the screens that use this hook has one.
 */
export function useMarkLeavingOnBack(onLeaving: () => void): void {
  const navigation = useContext(NavigationContext);
  const { focused, confirmed } = useRouteFocusState(true);
  const listening = focused && confirmed;

  useEffect(() => {
    if (!listening || !navigation) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.canGoBack()) onLeaving();
      return false;
    });
    return () => subscription.remove();
  }, [listening, navigation, onLeaving]);
}
