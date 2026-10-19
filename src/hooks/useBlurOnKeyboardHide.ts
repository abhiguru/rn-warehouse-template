/**
 * Closing the keyboard (the Android Back key) leaves the field it was for focused, so nothing is
 * formatted, committed or checked until another field is tapped. This blurs the focused input when
 * the keyboard has gone, using react-native's own record of which input that is; it needs no state of
 * the screen, so it also works for a field the screen does not know about.
 */
import { useEffect } from 'react';
import { Keyboard, TextInput } from 'react-native';

export function useBlurOnKeyboardHide(): void {
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      TextInput.State.currentlyFocusedInput()?.blur();
    });
    return () => subscription.remove();
  }, []);
}

export default useBlurOnKeyboardHide;
