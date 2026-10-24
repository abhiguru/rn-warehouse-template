/**
 * StatusTag: a status word with its icon on the status background (style guide
 * §3.5 and §13.5). Use it for every status in lists, headers and tables, so a
 * status never relies on colour alone.
 */
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, singleLineText, space, typography, type ThemeTokens } from '@/theme/tokens';

export type StatusKind = 'negative' | 'critical' | 'positive' | 'informative' | 'neutral';

/** The standard icon for each status (§3.5). */
export const STATUS_ICONS: Record<StatusKind, IconName> = {
  negative: 'alert-circle',
  critical: 'alert',
  positive: 'check-circle',
  informative: 'information',
  neutral: 'circle-outline',
};

export interface StatusTagProps {
  status: StatusKind;
  /** The status word, sentence case: "In stock", "Pending". */
  label: string;
  /** Override the standard icon; pass null for a category tag with no icon. */
  icon?: IconName | null;
  style?: StyleProp<ViewStyle>;
  /** The label wraps onto more lines instead of ending in "…" (a tag in a narrow table column). */
  wrap?: boolean;
  testID?: string;
}

const makeStyles = (_t: ThemeTokens) => ({
  tag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },
  text: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    // The label gives way (one line, then an ellipsis) when the tag's box is narrower
    // than the label: the tag never draws wider than its box. With room, nothing changes.
    flexShrink: 1,
  },
});

export function StatusTag({ status, label, icon, style, wrap = false, testID }: StatusTagProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const tone = t.status[status];
  const glyph = icon === undefined ? STATUS_ICONS[status] : icon;
  return (
    <View
      style={[styles.tag, { backgroundColor: tone.background }, style]}
      accessible
      accessibilityLabel={label}
      testID={testID}
    >
      {glyph ? <Icon name={glyph} size={iconSize.xs} color={tone.text} /> : null}
      <Text style={[styles.text, { color: tone.text }]} maxFontSizeMultiplier={1.6} {...(wrap ? {} : { numberOfLines: 1, ...singleLineText(0.9) })}>
        {label}
      </Text>
    </View>
  );
}

export default StatusTag;
