/**
 * BrandMark: the logo area for sign-in and other branded spots.
 *
 * A typeset wordmark in the brand's colours. Without a brand pack it reads "COLD STORAGE" with no
 * caption; a pack supplies its own wordmark lines and caption (src/theme/brandPack.ts).
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles, useTheme } from '@/hooks/useTheme';
import { radius, space, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr, getLanguage } from '@/i18n';
import { NEUTRAL_WORDMARK, getBrandPack, localized } from '@/theme/brandPack';

export interface BrandMarkProps {
  /** Accessible name of the organisation shown. */
  label: string;
}

const makeStyles = (t: ThemeTokens) => ({
  card: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.xxl,
    paddingVertical: space.lg,
    borderRadius: radius.sheet,
    backgroundColor: t.brandMark.panel,
  },
  wordmark: {
    ...typography.wordmark,
    color: t.brandMark.wordmark,
  },
  rule: {
    marginTop: space.xs,
    height: 4,
    width: 140,
    borderRadius: radius.pill,
    backgroundColor: t.brandMark.rule,
  },
  caption: {
    ...typography.caption1,
    marginTop: space.xs,
    fontWeight: '600' as const,
    letterSpacing: trackedText(1),
    color: t.brandMark.caption,
  },
});

export function BrandMark({ label }: BrandMarkProps) {
  const { brand } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pack = getBrandPack(brand);
  const lines = pack ? pack.wordmark : NEUTRAL_WORDMARK;
  const caption = pack ? localized(pack.caption, getLanguage()) : '';
  return (
    <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel={tr('auth.brand.logoLabel', { name: label })}>
      {lines.map(line => (
        <Text key={line} style={styles.wordmark}>{line}</Text>
      ))}
      <View style={styles.rule} />
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

export default BrandMark;
