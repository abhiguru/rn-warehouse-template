/**
 * Common Styles
 *
 * Reusable style objects to replace inline styles throughout the app.
 * Use these instead of inline `style={{ }}` for common patterns.
 *
 * Issue #37: Replace inline styles with StyleSheet
 *
 * Layout and spacing styles carry no colour. Styles with colour are built from
 * the semantic tokens: use `useCommonStyles()` (follows brand and mode). The
 * static `textStyles`, `containerStyles`, `overlayStyles` and `commonStyles`
 * exports are legacy adapters fixed to the default brand in light mode; they
 * are deleted in migration phase 6.
 *
 * @example
 * ```tsx
 * import { commonStyles } from '@/styles/common';
 *
 * <View style={commonStyles.flex1}>
 *   <Text style={commonStyles.textCenter}>Centered text</Text>
 * </View>
 * ```
 */

import { StyleSheet } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { DEFAULT_BRAND } from '@/store/slices/themeSlice';
import { getTokens, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

/**
 * Common layout styles
 */
export const layoutStyles = StyleSheet.create({
  /** Fill available space */
  flex1: {
    flex: 1,
  },

  /** Fill space with centered content */
  flex1Centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /** Fill space with vertically centered content */
  flex1CenteredVertical: {
    flex: 1,
    justifyContent: 'center',
  },

  /** Fill space with horizontally centered content */
  flex1CenteredHorizontal: {
    flex: 1,
    alignItems: 'center',
  },

  /** Row layout */
  row: {
    flexDirection: 'row',
  },

  /** Row with centered items */
  rowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  /** Row with space between */
  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  /** Column layout (default, but explicit) */
  column: {
    flexDirection: 'column',
  },

  /** Center both axes */
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

/**
 * Common spacing styles
 */
export const spacingStyles = StyleSheet.create({
  /** Standard bottom spacing */
  bottomSpacing: {
    height: 100,
  },

  /** Large bottom spacing */
  bottomSpacingLarge: {
    height: 150,
  },

  /** Small bottom spacing */
  bottomSpacingSmall: {
    height: 50,
  },

  /** Standard padding */
  padding: {
    padding: space.lg,
  },

  /** Horizontal padding */
  paddingHorizontal: {
    paddingHorizontal: space.lg,
  },

  /** Vertical padding */
  paddingVertical: {
    paddingVertical: space.lg,
  },

  /** Standard margin */
  margin: {
    margin: space.lg,
  },
});

/**
 * Colour-bearing common styles, built from the semantic tokens
 * (docs/STYLE_GUIDE.md §2).
 */
export const makeCommonThemedStyles = (t: ThemeTokens) => ({
  // Text
  textCenter: { textAlign: 'center' as const },
  textRight: { textAlign: 'right' as const },
  heading: { ...typography.title3, color: t.text.primary },
  subheading: { ...typography.headline, color: t.text.primary },
  body: { ...typography.body, color: t.text.primary },
  caption: { ...typography.footnote, color: t.text.secondary },
  error: { ...typography.footnote, color: t.status.negative.text },

  // Containers
  screenWhite: { flex: 1, backgroundColor: t.surface.card },
  screenGray: { flex: 1, backgroundColor: t.background.base },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    ...t.shadow[2],
  },
  surface: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
  },

  // Overlays
  backdrop: { flex: 1, backgroundColor: t.overlay.scrim },
  backdropDark: { flex: 1, backgroundColor: t.overlay.scrim },
  modalContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: layout.marginCompact,
  },
  bottomSheetContainer: { flex: 1, justifyContent: 'flex-end' as const },
});

/** Common text, container and overlay styles for the current brand and mode. */
export function useCommonStyles() {
  return useThemedStyles(makeCommonThemedStyles);
}

// Legacy static adapters: default brand, light mode.
const legacy = StyleSheet.create(makeCommonThemedStyles(getTokens(DEFAULT_BRAND, 'light')));

/**
 * Common text styles (legacy, light mode only). Prefer useCommonStyles().
 */
export const textStyles = {
  textCenter: legacy.textCenter,
  textRight: legacy.textRight,
  heading: legacy.heading,
  subheading: legacy.subheading,
  body: legacy.body,
  caption: legacy.caption,
  error: legacy.error,
};

/**
 * Common container styles (legacy, light mode only). Prefer useCommonStyles().
 */
export const containerStyles = {
  screenWhite: legacy.screenWhite,
  screenGray: legacy.screenGray,
  card: legacy.card,
  surface: legacy.surface,
};

/**
 * Common modal and overlay styles (legacy, light mode only). Prefer useCommonStyles().
 */
export const overlayStyles = {
  backdrop: legacy.backdrop,
  backdropDark: legacy.backdropDark,
  modalContainer: legacy.modalContainer,
  bottomSheetContainer: legacy.bottomSheetContainer,
};

/**
 * Combined export for convenience
 */
export const commonStyles = {
  // Layout
  flex1: layoutStyles.flex1,
  flex1Centered: layoutStyles.flex1Centered,
  row: layoutStyles.row,
  rowCentered: layoutStyles.rowCentered,
  rowSpaceBetween: layoutStyles.rowSpaceBetween,
  centered: layoutStyles.centered,

  // Spacing
  bottomSpacing: spacingStyles.bottomSpacing,
  padding: spacingStyles.padding,
  paddingHorizontal: spacingStyles.paddingHorizontal,

  // Text
  textCenter: textStyles.textCenter,
  heading: textStyles.heading,
  body: textStyles.body,
  caption: textStyles.caption,
  error: textStyles.error,

  // Containers
  screenWhite: containerStyles.screenWhite,
  screenGray: containerStyles.screenGray,
  card: containerStyles.card,

  // Overlays
  backdrop: overlayStyles.backdrop,
  modalContainer: overlayStyles.modalContainer,
};

export default commonStyles;
