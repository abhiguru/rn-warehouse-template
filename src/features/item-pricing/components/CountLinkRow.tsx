/**
 * A row that leads to a list: its text (with the count in it, "Customer rates for this item (3)") and a chevron.
 * One target of at least 48 dp across the card, read as a link.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface CountLinkRowProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

const makeStyles = (th: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    marginHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    backgroundColor: th.surface.card,
  },
  pressed: { backgroundColor: th.surface.cardPressed },
  text: { ...typography.body, flex: 1, color: th.text.primary },
});

export function CountLinkRow({ label, onPress, testID }: CountLinkRowProps) {
  const th = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={styles.text}>{label}</Text>
      <Icon name="chevron-right" size={iconSize.md} color={th.icon.secondary} />
    </Pressable>
  );
}

export default CountLinkRow;
