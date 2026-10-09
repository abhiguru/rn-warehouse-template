/**
 * Fab: the floating create button on list reports (style guide §14.1):
 * brand.fill with a plus in brand.onFill, 56 px, shadow 3, bottom right above
 * the tab bar. Show it only to roles that can create. Lists that use it add
 * FAB_CLEARANCE to their bottom padding so it never covers the last row.
 */
import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, type ThemeTokens } from '@/theme/tokens';

export const FAB_SIZE = 56;
/** Bottom padding a list needs so its last row can scroll clear of the button. */
export const FAB_CLEARANCE = FAB_SIZE + space.xxxl;

export interface FabProps {
  /** Accessible name, e.g. "Create GRN". */
  label: string;
  onPress: () => void;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  fab: {
    position: 'absolute' as const,
    right: layout.marginCompact,
    bottom: layout.marginCompact,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...t.shadow[3],
  },
  pressed: { backgroundColor: t.brand.fillPressed },
});

export function Fab({ label, onPress, icon = 'plus', style, testID }: FabProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed }) => [styles.fab, pressed && styles.pressed, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name={icon} size={iconSize.lg} color={t.brand.onFill} />
    </Pressable>
  );
}

export default Fab;
