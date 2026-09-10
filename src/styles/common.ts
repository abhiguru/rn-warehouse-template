/**
 * Common Styles
 *
 * Reusable style objects to replace inline styles throughout the app.
 * Use these instead of inline `style={{ }}` for common patterns.
 *
 * Issue #37: Replace inline styles with StyleSheet
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

import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import theme from '@/theme';

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
    padding: theme.spacing.md,
  },

  /** Horizontal padding */
  paddingHorizontal: {
    paddingHorizontal: theme.spacing.md,
  },

  /** Vertical padding */
  paddingVertical: {
    paddingVertical: theme.spacing.md,
  },

  /** Standard margin */
  margin: {
    margin: theme.spacing.md,
  },
});

/**
 * Common text styles
 */
export const textStyles = StyleSheet.create({
  /** Centered text */
  textCenter: {
    textAlign: 'center',
  },

  /** Right-aligned text */
  textRight: {
    textAlign: 'right',
  },

  /** Primary heading */
  heading: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },

  /** Secondary heading */
  subheading: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[800],
  },

  /** Body text */
  body: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[700],
  },

  /** Caption text */
  caption: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[500],
  },

  /** Error text */
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.semantic.error,
  },
});

/**
 * Common container styles
 */
export const containerStyles = StyleSheet.create({
  /** Full-screen container with white background */
  screenWhite: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },

  /** Full-screen container with gray background */
  screenGray: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  /** Card container */
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    shadowColor: theme.colors.gray[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  /** Surface container */
  surface: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
});

/**
 * Common modal/overlay styles
 */
export const overlayStyles = StyleSheet.create({
  /** Semi-transparent backdrop */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },

  /** Dark backdrop */
  backdropDark: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },

  /** Centered modal container */
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },

  /** Bottom sheet style container */
  bottomSheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});

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
