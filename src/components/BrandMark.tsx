/**
 * BrandMark: the logo area for sign-in and other branded spots.
 *
 * Orange brand: the template's logo image.
 * GCSA brand: a typeset "GCSA" wordmark in the association's navy and grey. The
 * association's own logo file is not part of this public template; a branded
 * build can add it once the association has agreed.
 */
import React from 'react';
import { Image, Text, View } from 'react-native';
import { useThemedStyles, useTheme } from '@/hooks/useTheme';
import { radius, space, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

const templateLogo = require('../../assets/logo.png');

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
  image: {
    width: 120,
    height: 64,
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
  if (brand === 'gcsa') {
    return (
      <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel={tr('auth.brand.logoLabel', { name: label })}>
        <Text style={styles.wordmark}>GCSA</Text>
        <View style={styles.rule} />
        <Text style={styles.caption}>{tr('auth.brand.associationCaption')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel={tr('auth.brand.logoLabel', { name: label })}>
      <Image source={templateLogo} style={styles.image} resizeMode="contain" />
    </View>
  );
}

export default BrandMark;
