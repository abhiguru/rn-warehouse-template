/**
 * The navigation bar of the central login screens (style guide §13.8): Back at
 * the start when the screen has somewhere to go back to, the title in
 * `headline`, an optional action at the end.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { useThemedStyles } from '@/hooks/useTheme';
import { space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface CentralHeaderProps {
  title: string;
  /** Shows the Back button. */
  onBack?: () => void;
  /** Drawn at the end of the bar. */
  action?: React.ReactNode;
}

const SIDE_WIDTH = 80;

const makeStyles = (t: ThemeTokens) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  side: { minWidth: SIDE_WIDTH },
  end: { minWidth: SIDE_WIDTH, alignItems: 'flex-end' as const },
  title: { ...typography.headline, color: t.text.primary, flexShrink: 1, textAlign: 'center' as const },
});

export function CentralHeader({ title, onBack, action }: CentralHeaderProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.side}>{onBack ? <HeaderBackButton onPress={onBack} /> : null}</View>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.end}>{action}</View>
    </View>
  );
}

export default CentralHeader;
