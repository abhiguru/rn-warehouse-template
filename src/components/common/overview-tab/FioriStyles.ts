/**
 * Overview tab styles (GRN, dispatch and invoice overview tabs).
 *
 * Layout and type come from `useOverviewStyles()`; colours, shadows and the icon
 * colours come from `useOverviewColors()`, which is built from the semantic
 * tokens for the current brand and mode (docs/STYLE_GUIDE.md §13.6).
 */

import { StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { useMemo } from 'react';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  trackedText,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';


// =============================================================================
// Layout and type (no colours)
// =============================================================================

// A factory, not a sheet built when the file is loaded: the type styles follow the
// language (Gujarati has taller lines and no letter spacing).
const makeOverviewStyles = (_t: ThemeTokens) => ({
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
  // Section header text (§13.6): footnote, semibold, capitals.
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
    textTransform: 'uppercase' as const,
  },

  // Card
  card: {
    borderRadius: radius.card,
    marginBottom: space.md,
  },
  cardClip: {
    borderRadius: radius.card,
    overflow: 'hidden' as const,
  },

  // Object cell
  objectCellHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: space.lg,
    minHeight: layout.objectCellMinHeight,
  },
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
  },
  contactActionText: {
    ...typography.body,
    flex: 1,
  },

  // Info chips
  chipsCard: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginBottom: space.md,
  },
  infoChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    flexDirection: 'row' as const,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: space.sm,
    gap: space.sm,
  },
  detailText: {
    flex: 1,
    ...typography.subhead,
  },
});

export type OverviewStyles = ReturnType<typeof makeOverviewStyles>;

/** Layout and type for the overview tab building blocks, in the current language. */
export function useOverviewStyles() {
  return useThemedStyles(makeOverviewStyles);
}

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
