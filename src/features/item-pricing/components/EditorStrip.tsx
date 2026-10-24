/**
 * A message strip at the top of the editor and the stop screen: info (blue), warning (amber) or
 * critical (red). Status background and border, an icon and the text in the status text colour;
 * announced when it appears. Feature-local: the shared InlineValidation has no info variant.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, typography, type ThemeTokens } from '@/theme/tokens';

export type StripVariant = 'info' | 'warning' | 'critical';

interface Props {
  variant: StripVariant;
  message: string;
  testID?: string;
}

const ICONS: Record<StripVariant, IconName> = { info: 'information', warning: 'alert', critical: 'alert-circle' };

const makeStyles = (_t: ThemeTokens) => ({
  strip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  text: { ...typography.subhead, flex: 1 },
});

export function EditorStrip({ variant, message, testID }: Props) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const status = variant === 'info' ? t.status.informative : variant === 'warning' ? t.status.critical : t.status.negative;
  return (
    <View
      style={[styles.strip, { backgroundColor: status.background, borderColor: status.border }]}
      accessible
      accessibilityRole={variant === 'critical' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      testID={testID}
    >
      <Icon name={ICONS[variant]} size={iconSize.sm} color={status.text} />
      <Text style={[styles.text, { color: status.text }]}>{message}</Text>
    </View>
  );
}

export default EditorStrip;
