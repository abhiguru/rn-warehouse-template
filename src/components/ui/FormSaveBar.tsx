/**
 * The Save bar of a form or settings screen (WH-218, APP-SPEC §1): one full-width primary button on `surface.card`
 * with a hairline `border.separator` above and `shadow[3]`, the look of WizardBottomBar. Render it below the scroll
 * view, not over it. It adds the bottom inset on iOS only: on Android the root stack already pads the screen by it
 * (STYLE_GUIDE §13.8, form chrome).
 */
import React from 'react';
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/useTheme';
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
  return (
    <View testID={testID} onLayout={onLayout} style={[styles.container, { paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + space.md }]}>
      {helper ? (typeof helper === 'string' ? <Text style={styles.helper}>{helper}</Text> : helper) : null}
      <Button type="primary" size="fullWidth" onPress={onPress} loading={loading} loadingText={loadingText} disabled={disabled} testID={buttonTestID}>
        {label}
      </Button>
    </View>
  );
}

export default FormSaveBar;
