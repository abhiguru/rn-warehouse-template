/**
 * HeaderBackButton: the back control for screens that draw their own header
 * (style guide §8): the platform glyph (chevron-left on iOS, arrow-left on
 * Android) and the word "Back" in brand.tint, at least touchTarget high.
 * Defaults to router.back(); pass onPress to override (e.g. unsaved-changes checks).
 */
import React from 'react';
import { Platform, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

export const BACK_GLYPH = Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left';

export interface HeaderBackButtonProps {
  onPress?: () => void;
  /** Visible word; "Back" unless the screen needs another verb ("Close"). */
  label?: string;
  /** Colour for headers drawn over photos or brand fills. Defaults to brand.tint. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingRight: space.sm,
    gap: space.xxs,
  },
  pressed: { opacity: 1 - t.interaction.disabledOpacity / 2 },
  label: { ...typography.body },
});

export function HeaderBackButton({ onPress, label: labelProp, color, style, testID }: HeaderBackButtonProps) {
  const label = labelProp ?? tr('common.back');
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const tint = color ?? t.brand.tint;
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={space.sm}
      testID={testID}
    >
      <Icon name={BACK_GLYPH} size={iconSize.lg} color={tint} />
      <Text style={[styles.label, { color: tint }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

export default HeaderBackButton;
