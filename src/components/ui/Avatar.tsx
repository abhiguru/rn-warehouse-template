/**
 * Avatar: initials on a stable palette colour (style guide §3.2). The same
 * person or customer gets the same initials and colour on every screen.
 */
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTokens } from '@/hooks/useTheme';
import { fontWeight, layout } from '@/theme/tokens';
import { avatarColors, avatarInitials } from '@/utils/avatar';

export interface AvatarProps {
  /** Display name the initials come from. */
  name: string | null | undefined;
  /** Stable id for the colour; defaults to the name. */
  id?: string | number | null;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name, id, size = 'md', style }: AvatarProps) {
  const t = useTokens();
  const diameter = layout.avatar[size];
  const { background, text } = avatarColors(id ?? name, t);
  return (
    <View
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      accessible={false}
      importantForAccessibility="no"
    >
      <Text
        style={{ color: text, fontSize: Math.round(diameter * 0.4), fontWeight: fontWeight.semibold }}
        maxFontSizeMultiplier={1}
      >
        {avatarInitials(name)}
      </Text>
    </View>
  );
}

export default Avatar;
