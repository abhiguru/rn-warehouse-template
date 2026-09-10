/**
 * SAP Fiori Design Tokens - Static Values
 *
 * This file centralizes dimensions and typography tokens used across
 * report screens following SAP Fiori design specifications.
 *
 * Colors are dynamic via useFioriColors hook from @/theme/fioriColors
 *
 * @see J15 - DRY Violation: FIORI_STATIC Constants Repeated 8 Times
 * @see design/sap-fiori-specs/
 */

// =============================================================================
// DIMENSION TOKENS
// =============================================================================

/**
 * SAP Fiori dimension specifications for consistent UI sizing
 */
export const FIORI_DIMENSIONS = {
  /** Minimum height for ObjectCell components (72pt) */
  objectCellMinHeight: 72,

  /** Default image/avatar size in ObjectCell (44pt) */
  objectCellImageSize: 44,

  /** Border radius for images in ObjectCell (10pt) */
  objectCellImageRadius: 10,

  /** Card corner radius (12pt) */
  cardCornerRadius: 12,

  /** Card horizontal/vertical padding (16pt) */
  cardPadding: 16,

  /** Card body content padding (16pt) */
  cardBodyPadding: 16,

  /** Section header minimum height (32pt) */
  sectionHeaderHeight: 32,

  /** Minimum touch target size (44pt - iOS HIG) */
  touchTarget: 44,

  /** Icon button size (24pt) */
  iconButtonSize: 24,

  /** Activity icon size for dashboard cards (36pt) */
  activityIconSize: 36,
} as const;

// =============================================================================
// TYPOGRAPHY TOKENS
// =============================================================================

/**
 * SAP Fiori typography specifications
 * Following Fiori Horizon theme typography scale
 */
export const FIORI_TYPOGRAPHY = {
  /** Section header style (uppercase, semibold, small) */
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },

  /** Primary title style (16pt semibold) */
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
  },

  /** Subtitle/secondary text style (14pt regular) */
  subtitle: {
    fontSize: 14,
    lineHeight: 18,
  },

  /** Footnote style for metadata (13pt) */
  footnote: {
    fontSize: 13,
    lineHeight: 16,
  },

  /** Caption style for small labels (12pt) */
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },

  /** Card title for dashboard widgets (17pt semibold) */
  cardTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
  },

  /** Trend value for KPI display (22pt bold) */
  trendValue: {
    fontSize: 22,
    fontWeight: '700' as const,
  },
} as const;

// =============================================================================
// COMBINED EXPORT (for backward compatibility)
// =============================================================================

/**
 * Combined FIORI_STATIC object for backward compatibility
 * Use FIORI_DIMENSIONS and FIORI_TYPOGRAPHY for new code
 */
export const FIORI_STATIC = {
  dimensions: FIORI_DIMENSIONS,
  typography: FIORI_TYPOGRAPHY,
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type FioriDimensions = typeof FIORI_DIMENSIONS;
export type FioriTypography = typeof FIORI_TYPOGRAPHY;
export type FioriStatic = typeof FIORI_STATIC;
