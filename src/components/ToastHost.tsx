/**
 * ToastHost: draws showToast() messages (style guide §13.9). Mounted once in
 * app/_layout.tsx after AlertHost.
 *
 * The toast is a `surface.inverse` bar with `text.inverse` text in `subhead`,
 * `shadow[3]`, `radius.button`, the compact side margins, and sits
 * `space.xl` above the bottom inset (every caller is a stack screen, so there
 * is no tab bar under it). It fades in and out (`motion.standard`; a fade is
 * also what Reduce Motion asks for) and stays 4 seconds. A newer toast
 * replaces the one shown. Screen readers hear the message when it appears.
 * Touches around the toast reach the screen under it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, motion, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { registerToastHost, type ToastRequest } from '@/utils/toast';

// The host draws no colour of its own; only a shown toast reads the theme.
const hostStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: layout.marginCompact,
    right: layout.marginCompact,
    alignItems: 'center',
  },
});

const makeStyles = (t: ThemeTokens) => ({
  toast: {
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    backgroundColor: t.surface.inverse,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    ...t.shadow[3],
  },
  text: {
    ...typography.subhead,
    color: t.text.inverse,
  },
});

/** The toast on screen: fades in when drawn, and out when its time is up. */
function Toast({ toast, onGone }: { toast: ToastRequest; onGone: (id: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(toast.message);
    const fadeIn = Animated.timing(opacity, {
      toValue: 1,
      duration: motion.standard,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    fadeIn.start();
    let fadeOut: Animated.CompositeAnimation | undefined;
    const hide = setTimeout(() => {
      fadeOut = Animated.timing(opacity, {
        toValue: 0,
        duration: motion.standard,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      });
      fadeOut.start();
    }, toast.durationMs);
    // Taken away by the clock, not by the end of the animation, so it always goes.
    const remove = setTimeout(() => onGone(toast.id), toast.durationMs + motion.standard);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
      fadeIn.stop();
      fadeOut?.stop();
    };
  }, [toast, opacity, onGone]);

  return (
    // Read once, by announceForAccessibility above; a live region as well would read it twice.
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastRequest | null>(null);
  // Above the keyboard while it is up: a toast from a form sheet would otherwise be drawn under it.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => registerToastHost(request => setToast(request)), []);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  const onGone = useCallback((id: number) => {
    setToast(current => (current?.id === id ? null : current));
  }, []);

  if (!toast) return null;

  return (
    <View pointerEvents="box-none" style={[hostStyles.wrapper, { bottom: Math.max(insets.bottom, keyboardHeight) + space.xl }]}>
      {/* A new key for each toast: a replacement is drawn afresh, read once and timed anew. */}
      <Toast key={toast.id} toast={toast} onGone={onGone} />
    </View>
  );
}

export default ToastHost;
