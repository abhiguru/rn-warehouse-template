/**
 * Overview tab styles (GRN, dispatch and invoice overview tabs).
 *
 * Layout lives in the static `overviewStyles`; colours, shadows and the icon
 * colours come from `useOverviewColors()`, which is built from the semantic
 * tokens for the current brand and mode (docs/STYLE_GUIDE.md §13.6).
 *
 * `FIORI` is a legacy adapter for screens that still read a static object of
 * sizes and colours. Its sizes come from the metrics tokens and its colours
 * from the default brand in light mode, so it cannot follow dark mode or the
 * brand chosen in Settings. New code uses tokens directly. Deleted in phase 6.
 */

import { StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { useMemo } from 'react';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { DEFAULT_BRAND } from '@/store/slices/themeSlice';
import {
  fontWeight,
  getTokens,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

// =============================================================================
// Legacy static adapter (exported as FIORI)
// =============================================================================

const staticTokens = getTokens(DEFAULT_BRAND, 'light');

const sectionHeaderType = {
  ...typography.footnote,
  fontWeight: fontWeight.semibold,
  letterSpacing: 0.5,
  textTransform: 'uppercase' as const,
};

const legacyOverviewTokens = {
  colors: {
    pageBackground: staticTokens.background.base,
    cardBackground: staticTokens.surface.card,
    textPrimary: staticTokens.text.primary,
    textSecondary: staticTokens.text.secondary,
    textTertiary: staticTokens.text.secondary,
    primary: staticTokens.brand.fill,
    primaryDark: staticTokens.brand.fillPressed,
    primaryLight: staticTokens.brand.subtle,
    success: staticTokens.status.positive.text,
    successDark: staticTokens.status.positive.text,
    successLight: staticTokens.status.positive.background,
    warning: staticTokens.status.critical.text,
    warningLight: staticTokens.status.critical.background,
    negative: staticTokens.status.negative.text,
    negativeDark: staticTokens.status.negative.text,
    negativeLight: staticTokens.status.negative.background,
    positive: staticTokens.status.positive.text,
    positiveLight: staticTokens.status.positive.background,
    info: staticTokens.status.informative.text,
    infoLight: staticTokens.status.informative.background,
    divider: staticTokens.border.divider,
    cardBorder: staticTokens.border.divider,
  },
  spacing: {
    xs: space.xs,
    sm: space.sm,
    md: space.md,
    lg: space.lg,
    xl: space.xl,
    xxl: space.xxl,
  },
  typography: {
    headline: typography.headline,
    body: typography.subhead,
    bodyMedium: { ...typography.subhead, fontWeight: fontWeight.medium },
    caption: typography.footnote,
    sectionHeader: sectionHeaderType,
    button: typography.callout,
  },
  dimensions: {
    cardRadius: radius.card,
    cardPadding: space.lg,
    buttonHeight: touchTarget,
    buttonRadius: radius.button,
    touchTarget,
    avatarSize: layout.avatar.md,
    iconSize: iconSize.md,
  },
  shadows: {
    card: staticTokens.shadow[2] as ViewStyle,
  },
} as const;

export { legacyOverviewTokens as FIORI };

// =============================================================================
// Static layout (no colours)
// =============================================================================

export const overviewStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
  },
  bottomSpacer: {
    height: space.xxxl,
  },

  // Section header (§13.6): footnote, capitals, 24 above, 8 below
  sectionHeader: {
    paddingTop: space.xxl,
    paddingBottom: space.sm,
  },
  sectionHeaderText: {
    ...sectionHeaderType,
  },

  // Card
  card: {
    borderRadius: radius.card,
    marginBottom: space.md,
  },
  cardClip: {
    borderRadius: radius.card,
    overflow: 'hidden',
  },

  // Object cell
  objectCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    minHeight: layout.objectCellMinHeight,
  },
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  objectCellContent: {
    flex: 1,
  },
  objectCellLabel: {
    ...typography.footnote,
    marginBottom: space.xxs,
  },
  objectCellHeadline: {
    ...typography.headline,
  },
  objectCellSubheadline: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    marginTop: space.xxs,
  },

  // Contact actions
  contactActionsContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  contactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: touchTarget,
  },
  contactActionBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  contactActionIcon: {
    width: space.xxxl,
    height: space.xxxl,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  contactActionText: {
    ...typography.body,
    flex: 1,
  },

  // Info chips
  chipsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.pill,
    gap: space.s6,
  },
  infoChipText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
  },

  // Notes
  notesContent: {
    flexDirection: 'row',
    padding: space.lg,
  },
  notesIcon: {
    marginRight: space.md,
    marginTop: space.xxs,
  },
  notesText: {
    flex: 1,
    ...typography.body,
  },

  // Actions
  actionsContainer: {
    gap: space.md,
    marginBottom: space.lg,
  },

  // Primary button (§13.1)
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  primaryButtonText: {
    ...typography.callout,
  },

  // Secondary tint button
  secondaryTintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  secondaryTintButtonText: {
    ...typography.callout,
  },

  // Secondary negative button
  secondaryNegativeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  secondaryNegativeButtonText: {
    ...typography.callout,
  },

  // Disabled and busy controls
  buttonDisabled: {
    opacity: 0.4,
  },

  // Detail rows (invoice)
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
    gap: space.sm,
  },
  detailText: {
    flex: 1,
    ...typography.subhead,
  },
});

// =============================================================================
// Themed colours
// =============================================================================

const makeOverviewColorStyles = (t: ThemeTokens) => ({
  container: { backgroundColor: t.background.base } as ViewStyle,
  sectionHeaderText: { color: t.text.secondary } as TextStyle,
  card: { backgroundColor: t.surface.card, ...t.shadow[2] } as ViewStyle,
  cardPressed: { backgroundColor: t.surface.cardPressed } as ViewStyle,
  objectCellLabel: { color: t.text.secondary } as TextStyle,
  objectCellHeadline: { color: t.text.primary } as TextStyle,
  objectCellSubheadline: { color: t.text.primary } as TextStyle,
  contactActionsContainer: { borderTopColor: t.border.divider } as ViewStyle,
  contactActionBorder: { borderTopColor: t.border.divider } as ViewStyle,
  contactActionPressed: { backgroundColor: t.surface.cardPressed } as ViewStyle,
  contactActionIcon: { backgroundColor: t.brand.subtle } as ViewStyle,
  contactActionText: { color: t.text.primary } as TextStyle,
  infoChip: { backgroundColor: t.status.neutral.background } as ViewStyle,
  infoChipText: { color: t.status.neutral.text } as TextStyle,
  notesText: { color: t.text.primary } as TextStyle,
  primaryButton: { backgroundColor: t.brand.fill } as ViewStyle,
  primaryButtonPressed: { backgroundColor: t.brand.fillPressed } as ViewStyle,
  primaryButtonText: { color: t.brand.onFill } as TextStyle,
  secondaryTintButton: { borderColor: t.border.button } as ViewStyle,
  secondaryTintButtonPressed: { backgroundColor: t.brand.subtle } as ViewStyle,
  secondaryTintButtonText: { color: t.brand.tint } as TextStyle,
  secondaryNegativeButton: { borderColor: t.status.negative.border } as ViewStyle,
  secondaryNegativeButtonPressed: { backgroundColor: t.status.negative.background } as ViewStyle,
  secondaryNegativeButtonText: { color: t.status.negative.text } as TextStyle,
  detailText: { color: t.text.primary } as TextStyle,
});

/** Theme colours for the overview tab building blocks, plus raw icon colours. */
export function useOverviewColors() {
  const styles = useThemedStyles(makeOverviewColorStyles);
  const t = useTokens();

  return useMemo(
    () => ({
      ...styles,
      // Raw colours for icon props
      iconTertiary: t.icon.secondary,
      iconSuccess: t.brand.tint,
      iconInfo: t.brand.tint,
      iconError: t.status.negative.text,
      iconPrimary: t.icon.primary,
      iconOnFill: t.brand.onFill,
      iconBrand: t.brand.tint,
      iconNeutral: t.status.neutral.text,
    }),
    [styles, t]
  );
}
