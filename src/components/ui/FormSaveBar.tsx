/**
 * The Save bar of a form or settings screen (WH-218, APP-SPEC §1): one full-width primary button on `surface.card`
 * with a hairline `border.separator` above and `shadow[3]`, the look of WizardBottomBar. Render it below the scroll
 * view, not over it. It adds the bottom inset on iOS only, and drops it while the keyboard is up: on Android the root stack already pads the screen by it
 * (STYLE_GUIDE §13.8, form chrome).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import type { ViewRef } from '@/types/nativeRefs';
import { Button } from './Button';

export interface FormSaveBarProps {
  /** The visible label, also the spoken one: "Save customer". */
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** A line above the button (why Save waits, what it does): a string or a node; wraps, never cut. */
  helper?: React.ReactNode;
  /** Button text while loading (the spinner shows beside it). */
  loadingText?: string;
  /** Reports the bar's height, for a screen that keeps its last field clear of the bar. */
  onLayout?: (event: LayoutChangeEvent) => void;
  /** On the bar itself. */
  testID?: string;
  /** On the button (where a screen's own tests press Save). */
  buttonTestID?: string;
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: layout.marginCompact,
      paddingTop: space.md,
      backgroundColor: t.surface.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.separator,
      ...t.shadow[3],
    },
    helper: { ...typography.footnote, color: t.text.secondary, textAlign: 'center', marginBottom: space.sm },
  });

export function FormSaveBar({ label, onPress, loading = false, disabled = false, helper, loadingText, onLayout, testID, buttonTestID }: FormSaveBarProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  // With the keyboard up the bar sits on it: no home-indicator space under it. And if the window was not made
  // shorter by the keyboard (edge to edge on Android does not always do it), the bar is lifted by exactly the part
  // of it the keyboard covers, so it never stays behind the keyboard. It is measured, so a window that does shrink
  // (the overlap is 0) changes nothing, and the scroll area above, being the flexible part of the column, gives way.
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [lift, setLift] = useState(0);
  const barRef = useRef<ViewRef>(null);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardShown(true);
      const keyboardTop = event.endCoordinates.screenY;
      barRef.current?.measureInWindow((_x, y, _width, height) => {
        // The measured place already includes the lift, so the part still covered (or the gap left) corrects it.
        setLift(previous => Math.max(0, previous + (y + height - keyboardTop)));
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardShown(false);
      setLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <View ref={barRef} testID={testID} onLayout={onLayout} style={[styles.container, { marginBottom: lift, paddingBottom: (Platform.OS === 'ios' && !keyboardShown ? insets.bottom : 0) + space.md }]}>
      {helper ? (typeof helper === 'string' ? <Text style={styles.helper}>{helper}</Text> : helper) : null}
      <Button type="primary" size="fullWidth" onPress={onPress} loading={loading} loadingText={loadingText} disabled={disabled} testID={buttonTestID}>
        {label}
      </Button>
    </View>
  );
}

export default FormSaveBar;
