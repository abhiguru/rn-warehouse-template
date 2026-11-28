/**
 * One footnote line that says something needs a connection (WH-299; Design offline-capture.md 2.5 and 2.10 DS1): an
 * action's reason, a section of a page the copy cannot give, or a whole screen. Never an error: no red, no retry.
 */
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingVertical: space.xs },
  text: { ...typography.footnote, color: t.text.secondary, flexShrink: 1 },
  inset: { paddingHorizontal: layout.marginCompact },
  // A Button's own side padding (Button container, space.lg): the line starts where the button's text starts.
  insetToButton: { paddingLeft: space.lg },
  // Under a full-width button whose label is centred: icon and text sit centred together.
  centered: { justifyContent: 'center' as const },
  textCentered: { textAlign: 'center' as const },
});

interface Props {
  testID: string;
  text: string;
  /** The cloud icon of a section's line (DS1); an action's reason has none. */
  icon?: boolean;
  /** The line stands on its own at the screen's edge (a list's footnote): it takes the screen's side margin. Inside a padded section it stays off. */
  inset?: boolean;
  /** The line stands under a left-aligned Button: it starts at that button's text ("button"). Off by default; wins over `inset`. */
  insetTo?: 'button';
  /** The line stands under a full-width button with a centred label: the icon and text are centred together ("center"). Off by default. */
  align?: 'center';
}

export function NeedsConnectionLine({ testID, text, icon = false, inset = false, insetTo, align }: Props) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const centered = align === 'center';
  const rowStyle = [
    styles.row,
    insetTo === 'button' ? styles.insetToButton : inset ? styles.inset : null,
    centered ? styles.centered : null,
  ];
  return (
    <View style={rowStyle} testID={testID}>
      {icon ? <Icon name="cloud-off-outline" size={iconSize.sm} color={tokens.icon.secondary} importantForAccessibility="no" /> : null}
      <Text style={centered ? [styles.text, styles.textCentered] : styles.text} maxFontSizeMultiplier={1.6}>
        {text}
      </Text>
    </View>
  );
}
