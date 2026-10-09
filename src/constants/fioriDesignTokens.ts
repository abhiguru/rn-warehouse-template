/**
 * Report dimension and typography constants (legacy adapter).
 *
 * Kept for report components that have not moved to the metrics tokens yet.
 * Every value comes from `src/theme/tokens/metrics.ts`; new code imports
 * `typography`, `space`, `radius`, `layout`, `iconSize` and `touchTarget` from
 * '@/theme/tokens' directly. Deleted in migration phase 6.
 */
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';

// =============================================================================
// DIMENSION TOKENS
// =============================================================================

export const FIORI_DIMENSIONS = {
  /** Minimum height for object cells (72). */
  objectCellMinHeight: layout.objectCellMinHeight,

  /** Image or avatar size in an object cell (44). */
  objectCellImageSize: layout.avatar.md,

  /** Radius of images in an object cell. */
  objectCellImageRadius: radius.card,

  /** Card corner radius. */
  cardCornerRadius: radius.card,

  /** Card padding. */
  cardPadding: space.lg,

  /** Card body padding. */
  cardBodyPadding: space.lg,

  /** Section header minimum height. */
  sectionHeaderHeight: space.xxxl,

  /** Minimum touch target (44 iOS, 48 Android). */
  touchTarget,

  /** Icon button glyph size. */
  iconButtonSize: iconSize.lg,

  /** Activity icon size for dashboard cards. */
  activityIconSize: iconSize.xl,
} as const;

// =============================================================================
// TYPOGRAPHY TOKENS
// =============================================================================

export const FIORI_TYPOGRAPHY = {
  /** Section header: footnote, capitals, semibold. */
  sectionHeader: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },

  /** Object cell title. */
  title: typography.headline,

  /** Secondary line. */
  subtitle: typography.subhead,

  /** Metadata. */
  footnote: typography.footnote,

  /** Small labels. */
  caption: typography.caption1,

  /** Dashboard card title. */
  cardTitle: typography.headline,

  /** KPI trend value. */
  trendValue: typography.title2,
} as const;

export type FioriDimensions = typeof FIORI_DIMENSIONS;
export type FioriTypography = typeof FIORI_TYPOGRAPHY;
