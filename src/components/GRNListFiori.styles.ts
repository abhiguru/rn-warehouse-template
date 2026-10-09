/**
 * GRNListFiori styles
 *
 * List report (style guide 14.1) with object cells (13.6). Built from the
 * semantic tokens for the current brand and mode; use with
 * `useThemedStyles(makeGRNListStyles)`. The factory is module-level so the
 * stylesheet is cached and shared by every card.
 */

import { StyleSheet } from 'react-native';
import {
  fontWeight,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

const tabular = ['tabular-nums' as const];

export const makeGRNListStyles = (t: ThemeTokens) => ({
  // =========================================================================
  // Container & header
  // =========================================================================
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },

  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },

  headerTitle: {
    ...typography.title2,
    color: t.text.primary,
  },

  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },

  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  iconButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  filterBadge: {
    position: 'absolute' as const,
    top: space.xs,
    right: space.xs,
    minWidth: 18,
    height: 18,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  filterBadgeText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },

  avatar: {
    width: layout.avatar.sm,
    height: layout.avatar.sm,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  avatarText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    // Avatar initials: text.primary in light mode, white in dark (guide 3.2)
    color: t.mode === 'dark' ? t.overlay.onImage : t.text.primary,
  },

  // =========================================================================
  // Applied filters bar
  // =========================================================================
  filterChipsContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },

  filterChipsHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },

  filterCountBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },

  filterCountText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  clearAllButton: {
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
  },

  clearAllButtonPressed: {
    backgroundColor: t.brand.subtle,
  },

  clearAllText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  filterChipsList: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },

  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingLeft: space.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
  },

  filterChipText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
    flexShrink: 1,
  },

  filterChipRemove: {
    width: touchTarget,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // =========================================================================
  // Sort controls
  // =========================================================================
  sortRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
    gap: space.sm,
  },

  sortLabel: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },

  sortLabelText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  sortOptions: {
    flexDirection: 'row' as const,
    gap: space.sm,
    flex: 1,
  },

  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 32,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
    gap: space.xs,
  },

  chipPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  chipSelected: {
    backgroundColor: t.brand.subtle,
    borderColor: t.brand.subtle,
  },

  chipText: {
    ...typography.caption1,
    color: t.text.primary,
  },

  chipTextSelected: {
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  expandAllBtn: {
    marginLeft: 'auto' as const,
  },

  // =========================================================================
  // Section headers
  // =========================================================================
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xs,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },

  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },

  sectionBadge: {
    marginLeft: space.sm,
    backgroundColor: t.status.neutral.background,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    minWidth: 24,
    alignItems: 'center' as const,
  },

  sectionCount: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
    fontVariant: tabular,
  },

  // =========================================================================
  // List container
  // =========================================================================
  listContent: {
    flexGrow: 1,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
    // Room for the floating create button
    paddingBottom: 56 + space.xxxl,
  },

  // =========================================================================
  // Object cell card
  // =========================================================================
  card: {
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
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

  statusIconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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

  footerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
  },

  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  footerDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: t.icon.secondary,
    marginHorizontal: space.xs,
  },

  attributeStack: {
    alignItems: 'flex-end' as const,
    gap: space.xs,
    minWidth: 72,
  },

  // Status tag (guide 13.5): status background + status text + icon
  statusTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },

  statusTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
  },

  stockValueText: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: tabular,
    textAlign: 'right' as const,
  },

  stockLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },

  weightText: {
    ...typography.footnote,
    color: t.text.secondary,
    fontVariant: tabular,
  },

  // =========================================================================
  // Expanded items table (guide 13.7)
  // =========================================================================
  expandedSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },

  tableHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
    minHeight: 36,
  },

  tableHeaderCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },

  tableRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minHeight: layout.rowMinHeight,
    backgroundColor: t.surface.card,
  },

  tableRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },

  tableCell: {
    justifyContent: 'center' as const,
  },

  colItem: {
    flex: 2.5,
  },

  colQty: {
    width: 48,
    textAlign: 'right' as const,
  },

  colWeight: {
    width: 56,
    textAlign: 'right' as const,
    marginLeft: space.sm,
  },

  colStock: {
    width: 72,
    alignItems: 'flex-end' as const,
    textAlign: 'right' as const,
    marginLeft: space.sm,
  },

  cellValue: {
    ...typography.subhead,
    color: t.text.primary,
    fontVariant: tabular,
  },

  itemName: {
    ...typography.subhead,
    color: t.text.primary,
  },

  itemMark: {
    ...typography.caption1,
    color: t.text.secondary,
  },

  // =========================================================================
  // Expand / collapse button
  // =========================================================================
  expandButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.xs,
    minHeight: touchTarget,
  },

  expandButtonPressed: {
    backgroundColor: t.brand.subtle,
  },

  expandButtonText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  // =========================================================================
  // Swipe actions
  // =========================================================================
  swipeActions: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    marginBottom: space.sm,
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
  // Skeleton loading (guide 13.6)
  // =========================================================================
  skeletonCard: {
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    ...t.shadow[2],
  },

  skeletonObjectCell: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
  },

  skeletonStatusIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.button,
    backgroundColor: t.surface.cardActive,
  },

  skeletonContent: {
    flex: 1,
    gap: space.sm,
  },

  skeletonTitle: {
    width: '60%' as const,
    height: 16,
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },

  skeletonSubtitle: {
    width: '80%' as const,
    height: 14,
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },

  skeletonFooter: {
    width: '50%' as const,
    height: 12,
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },

  skeletonAttributes: {
    alignItems: 'flex-end' as const,
    gap: space.sm,
  },

  skeletonBadge: {
    width: 56,
    height: 20,
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },

  skeletonStockValue: {
    width: 40,
    height: 20,
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },

  // =========================================================================
  // Empty and error states (guide 13.6)
  // =========================================================================
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    gap: space.sm,
  },

  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },

  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.lg,
  },

  // =========================================================================
  // Floating create button (guide 14.1)
  // =========================================================================
  fab: {
    position: 'absolute' as const,
    right: layout.marginCompact,
    bottom: layout.marginCompact,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...t.shadow[3],
  },

  fabPressed: {
    backgroundColor: t.brand.fillPressed,
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

  // =========================================================================
  // Snackbar (guide 13.9)
  // =========================================================================
  snackbar: {
    marginBottom: space.lg,
    backgroundColor: t.surface.inverse,
    borderRadius: radius.button,
    ...t.shadow[3],
  },

  snackbarText: {
    ...typography.subhead,
    color: t.text.inverse,
  },
});

export type GRNListStyles = ReturnType<typeof makeGRNListStyles>;

export default makeGRNListStyles;
