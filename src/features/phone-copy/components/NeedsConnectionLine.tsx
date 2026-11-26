/**
 * One footnote line that says something needs a connection (WH-299; Design offline-capture.md 2.5 and 2.10 DS1): an
 * action's reason, a section of a page the copy cannot give, or a whole screen. Never an error: no red, no retry.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingVertical: space.xs },
  text: { ...typography.footnote, color: t.text.secondary, flexShrink: 1 },
});

interface Props {
  testID: string;
  text: string;
  /** The cloud icon of a section's line (DS1); an action's reason has none. */
  icon?: boolean;
}

export const NeedsConnectionLine: React.FC<Props> = ({ testID, text, icon = false }) => {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  return (
    <View style={styles.row} testID={testID}>
      {icon ? <Icon name="cloud-off-outline" size={iconSize.sm} color={tokens.icon.secondary} importantForAccessibility="no" /> : null}
      <Text style={styles.text} maxFontSizeMultiplier={1.6}>
        {text}
      </Text>
    </View>
  );
};
