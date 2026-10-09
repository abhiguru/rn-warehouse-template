/**
 * Legacy list palette (adapter).
 *
 * Nothing in the app reads this palette any more: the list rows and lists read
 * semantic tokens directly (`useThemedStyles`, `useTokens`; see
 * docs/STYLE_GUIDE.md). It stays only until the last test mocks of this module
 * are gone, then this file is deleted.
 */

import { useMemo } from 'react';
import { useTokens } from './useTheme';
import type { ThemeTokens } from '@/theme/tokens';

/**
 * Legacy row palette: the semantic tokens mapped onto the flat colour keys the
 * row components in list-items/* used to take as their `colors` prop.
 */
export function buildListRowPalette(t: ThemeTokens) {
  const { positive, critical, negative, informative, neutral } = t.status;
  return {
    // Brand
    primary: t.brand.fill,
    primaryLight: t.brand.subtle,
    primaryDark: t.brand.tint,

    // Former indigo accent: informative status
    secondary: informative.text,
    secondaryLight: informative.background,

    // Semantic colours
    success: positive.text,
    successLight: positive.background,
    warning: critical.text,
    warningLight: critical.background,
    error: negative.text,
    errorLight: negative.background,
    info: informative.text,
    infoLight: informative.background,

    // Grey scale mapped to neutral roles
    gray50: t.background.base,
    gray100: t.background.base,
    gray200: t.border.divider,
    gray300: t.border.separator,
    gray400: t.icon.secondary,
    gray500: t.text.secondary,
    gray600: t.text.secondary,
    gray700: t.text.secondary,
    gray800: t.text.primary,
    gray900: t.text.primary,

    // Surfaces
    white: t.surface.card,
    black: t.text.primary,

    // Decorative accents mapped to status roles
    teal: informative.text,
    tealLight: informative.background,
    blue: informative.text,
    blueLight: informative.background,
    purple: neutral.text,
    purpleLight: neutral.background,
    orange: critical.text,
    orangeLight: critical.background,

    // Fiori status colours
    statusPositive: positive.text,
    statusPositiveLight: positive.background,
    statusPositiveDark: positive.text,
    statusPositiveBorder: positive.border,

    statusCritical: critical.text,
    statusCriticalLight: critical.background,
    statusCriticalDark: critical.text,
    statusCriticalBorder: critical.border,

    statusNegative: negative.text,
    statusNegativeLight: negative.background,
    statusNegativeDark: negative.text,
    statusNegativeBorder: negative.border,

    statusNeutral: informative.text,
    statusNeutralLight: informative.background,
    statusNeutralDark: informative.text,
    statusNeutralBorder: informative.border,

    statusNone: neutral.text,
    statusNoneLight: neutral.background,

    statusWarning: critical.text,
    statusWarningLight: critical.background,
    statusWarningDark: critical.text,
    statusWarningBorder: critical.border,

    // Object cells
    cellBackground: t.surface.card,
    cellBackgroundPressed: t.surface.cardPressed,
    cellBackgroundSelected: t.surface.selected,
    cellSelectedBorder: t.brand.tint,
    cellDivider: t.border.divider,

    // Text
    textPrimary: t.text.primary,
    textSecondary: t.text.secondary,
    textTertiary: t.text.secondary,
    textInverse: t.brand.onFill,
  };
}

/** Map the semantic tokens onto the legacy palette keys. */
export const buildLegacyListPalette = buildListRowPalette;

/** Theme-aware legacy list palette for the current brand and mode. */
function useLegacyListPalette() {
  const tokens = useTokens();
  return useMemo(() => buildListRowPalette(tokens), [tokens]);
}

export type ListColors = ReturnType<typeof buildListRowPalette>;

export default useLegacyListPalette;
