/**
 * GRNListFiori styles
 *
 * List report (style guide 14.1) with object cells (13.6). Built from the
 * semantic tokens for the current brand and mode; use with
 * `useThemedStyles(makeGRNListStyles)`. The factory is module-level so the
 * stylesheet is cached and shared by every card. The header, states and the
 * open card's table come from the shared parts and bring their own styles.
 */

import { StyleSheet } from 'react-native';
import { FAB_CLEARANCE } from '@/components/ui/Fab';
import {
  fontWeight,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

export const makeGRNListStyles = (t: ThemeTokens) => ({
  // =========================================================================
  // Container
  // =========================================================================
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },

  // =========================================================================
  // Section headers (ui/SectionHeader): in line with the cards' edge
  // =========================================================================
  sectionHeader: {
    paddingHorizontal: space.xs,
  },

  // =========================================================================
  // List container
  // =========================================================================
  listContent: {
    flexGrow: 1,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
    // Room for the floating create button
    paddingBottom: FAB_CLEARANCE,
  },

  // =========================================================================
  // Object cell card
  // =========================================================================
  // The outline keeps each card distinct in dark mode, where the shadow does not show.
  card: {
    marginBottom: space.md,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: t.border.separator,
    ...t.shadow[2],
  },

  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  cardContentWrapper: {
    overflow: 'hidden' as const,
    borderRadius: radius.card,
  },

  objectCellRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    minHeight: layout.objectCellMinHeight,
    padding: space.lg,
    gap: space.md,
  },

  mainContent: {
    flex: 1,
    gap: space.xxs,
  },

  titleText: {
    ...typography.headline,
    color: t.text.primary,
  },

  subtitleText: {
    ...typography.subhead,
    color: t.text.secondary,
  },

  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.xs,
    flexWrap: 'wrap' as const,
    gap: space.xs,
  },

  // One fact (icon and text): it never shrinks, so the row wraps between facts and a date never breaks inside itself.
  footerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    flexShrink: 0,
  },

  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Says the card shows only the items that match the filters (code review 2026-10-18, R1-02).
  filteredNote: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },

  footerDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: t.icon.secondary,
    marginHorizontal: space.xs,
  },

  // "120 of 200 bags" over the status tag. It may wrap at large text; it is never cut.
  attributeStack: {
    alignItems: 'flex-end' as const,
    gap: space.xs,
    minWidth: 72,
    maxWidth: '45%' as const,
  },

  // The main value of an object cell (13.6): headline, tabular.
  stockValueText: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },

  // =========================================================================
  // The open card's lines (a nested DataTable, guide 13.7)
  // =========================================================================
  expandedSection: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },

  /** Read-only lines: the compact row height (§5.2), a one-line row in its middle. */
  lineCompact: {
    minHeight: 36,
    paddingVertical: space.sm,
  },

  /** A line's stock status under its item, when it is not In stock. */
  lineTag: {
    marginTop: space.xxs,
  },

  // =========================================================================
  // Expand / collapse button
  // =========================================================================
  // The card's own footer: tinted, with the text at the start, so it reads as
  // part of this card and not as a control for the whole list.
  expandButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
    backgroundColor: t.background.base,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
  },

  expandButtonPressed: {
    backgroundColor: t.brand.subtle,
  },

  expandButtonText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
    flexShrink: 1,
  },

  // =========================================================================
  // Swipe actions (guide 13.6)
  // =========================================================================
  swipeActions: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    marginBottom: space.md,
    marginLeft: space.sm,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
  },

  swipeButton: {
    width: 72,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },

  swipeSecondary: {
    backgroundColor: t.surface.cardActive,
  },

  swipeSecondaryPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  swipePrimary: {
    backgroundColor: t.brand.fill,
  },

  swipePrimaryPressed: {
    backgroundColor: t.brand.fillPressed,
  },

  swipeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },

  swipeTextOnFill: {
    color: t.brand.onFill,
  },

  // =========================================================================
  // Footer loading
  // =========================================================================
  footerLoader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },

  footerLoaderText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
});

export type GRNListStyles = ReturnType<typeof makeGRNListStyles>;

export default makeGRNListStyles;
