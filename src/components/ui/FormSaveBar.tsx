/**
 * The Save bar of a form or settings screen (WH-218, APP-SPEC §1): one full-width primary button on `surface.card`
 * with a hairline `border.separator` above and `shadow[3]`, the look of WizardBottomBar. Render it below the scroll
 * view, not over it. It adds the bottom inset on iOS only: on Android the root stack already pads the screen by it
 * (STYLE_GUIDE §13.8, form chrome).
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, space } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { Button } from './Button';

export interface FormSaveBarProps {
  /** The visible label, also the spoken one: "Save customer". */
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
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
  });

export function FormSaveBar({ label, onPress, loading = false, disabled = false, testID }: FormSaveBarProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.container, { paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + space.md }]}>
      <Button type="primary" size="fullWidth" onPress={onPress} loading={loading} disabled={disabled} testID={testID}>
        {label}
      </Button>
    </View>
  );
}

export default FormSaveBar;
