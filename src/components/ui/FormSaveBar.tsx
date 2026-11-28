/**
 * The Save bar of a form or settings screen (WH-218, APP-SPEC §1): one full-width primary button on `surface.card`
 * with a hairline `border.separator` above and `shadow[3]`, the look of WizardBottomBar. Render it below the scroll
 * view, not over it. It adds the bottom inset on iOS only, and drops it while the keyboard is up: on Android the root stack already pads the screen by it
 * (STYLE_GUIDE §13.8, form chrome).
 */
import React from 'react';
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardCoverLift } from '@/hooks/useKeyboardCoverLift';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { NeedsConnectionLine } from '@/features/phone-copy/components/NeedsConnectionLine';
import { needsConnectionLabel } from '@/features/phone-copy/useNeedsConnection';
import { layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
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
  /**
   * Saving needs the server and the phone is offline (WH-348, Design 2.5): the bar says "Needs a connection" once, above the
   * button, under this testID; Save is disabled and its screen-reader label carries the reason.
   */
  needsConnectionTestID?: string;
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

export function FormSaveBar({ label, onPress, loading = false, disabled = false, helper, loadingText, onLayout, testID, buttonTestID, needsConnectionTestID }: FormSaveBarProps) {
  const needsServer = needsConnectionTestID !== undefined;
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  // With the keyboard up the bar sits on it: no home-indicator space under it, and it is lifted by the part the
  // keyboard covers (useKeyboardCoverLift).
  const { ref: barRef, lift, keyboardShown, onLayout: measureLift } = useKeyboardCoverLift();
  return (
    <View ref={barRef} testID={testID} onLayout={event => { measureLift(event); onLayout?.(event); }} style={[styles.container, { marginBottom: lift, paddingBottom: (Platform.OS === 'ios' && !keyboardShown ? insets.bottom : 0) + space.md }]}>
      {needsServer ? <NeedsConnectionLine testID={needsConnectionTestID} text={tr('components.offlineRead.needsConnection')} /> : null}
      {helper ? (typeof helper === 'string' ? <Text style={styles.helper}>{helper}</Text> : helper) : null}
      <Button
        type="primary"
        size="fullWidth"
        onPress={onPress}
        loading={loading}
        loadingText={loadingText}
        disabled={disabled || needsServer}
        testID={buttonTestID}
        accessibilityLabel={needsServer ? needsConnectionLabel(label) : undefined}
      >
        {label}
      </Button>
    </View>
  );
}

export default FormSaveBar;
