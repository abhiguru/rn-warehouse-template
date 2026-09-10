/**
 * GRNListFiori Styles
 *
 * SAP Fiori design system implementation for GRN list.
 * Uses Object Cell layout pattern with semantic status colors.
 *
 * NOTE: Colors are now applied inline via useListColors() hook
 * for dark mode support. This file only contains layout/sizing styles.
 */

import { StyleSheet, Platform } from 'react-native';

// SAP Fiori spacing scale
const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// SAP Fiori typography
const typography = {
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  footer: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  attribute: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
  attributeLabel: {
    fontSize: 10,
    fontWeight: '500' as const,
    lineHeight: 14,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
  },
  stockValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
};

export const styles = StyleSheet.create({
  // =========================================================================
  // Container & Header
  // =========================================================================
  container: {
    flex: 1,
    // backgroundColor: applied inline
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    // backgroundColor: applied inline
    borderBottomWidth: 1,
    // borderBottomColor: applied inline
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    // color: applied inline
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  addBtn: {
    // backgroundColor: applied inline
    margin: 0,
  },

  filterBtnContainer: {
    position: 'relative',
  },

  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    // backgroundColor: applied inline
  },

  avatarSurface: {
    width: 36,
    height: 36,
    borderRadius: 18,
    // backgroundColor: applied inline
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    // color: applied inline
  },

  // =========================================================================
  // Filter Chips
  // =========================================================================
  filterChipsContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    // backgroundColor: applied inline
    borderBottomWidth: 1,
    // borderBottomColor: applied inline
  },

  filterChipsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  filterCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  filterCountText: {
    fontSize: 13,
    fontWeight: '500',
    // color: applied inline
  },

  clearAllText: {
    fontSize: 13,
    fontWeight: '500',
    // color: applied inline
  },

  filterChipsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  filterChip: {
    // backgroundColor: applied inline
  },

  filterChipText: {
    fontSize: 12,
    // color: applied inline
  },

  // =========================================================================
  // Sort Controls
  // =========================================================================
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    // backgroundColor: applied inline
    borderBottomWidth: 1,
    // borderBottomColor: applied inline
    gap: spacing.sm,
  },

  sortLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  sortLabelText: {
    fontSize: 12,
    fontWeight: '500',
    // color: applied inline
  },

  sortOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flex: 1,
  },

  // Expand All Toggle Button
  expandAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    gap: spacing.xs,
    marginLeft: 'auto',
    // backgroundColor: applied inline
  },

  expandAllText: {
    fontSize: 12,
    fontWeight: '500',
    // color: applied inline
  },

  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    // backgroundColor: applied inline
    gap: spacing.xs,
  },

  sortOptionActive: {
    // backgroundColor: applied inline (not used anymore, handled inline)
  },

  sortOptionText: {
    fontSize: 12,
    fontWeight: '500',
    // color: applied inline
  },

  sortOptionTextActive: {
    // color: applied inline (not used anymore, handled inline)
    fontWeight: '600',
  },

  // =========================================================================
  // Section Headers (SAP Fiori Section Header spec)
  // @see design/sap-fiori-specs/14-section-header.md
  // =========================================================================
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 32, // Fiori: 32pt min height
    paddingHorizontal: spacing.md, // Fiori: 16pt horizontal padding
    paddingTop: spacing.sm, // Fiori: 8pt top padding
    paddingBottom: spacing.xs, // Fiori: 4pt bottom padding
    marginTop: spacing.sm,
    backgroundColor: 'transparent', // Fiori: transparent or #F7F9FA
  },

  sectionTitle: {
    fontSize: 13, // Fiori: 13pt
    fontWeight: '600', // Fiori: Semibold
    // color: applied inline
    textTransform: 'uppercase', // Fiori: uppercase
    letterSpacing: 0.5, // Fiori: 0.5pt letter spacing
  },

  sectionBadge: {
    marginLeft: spacing.sm,
    // backgroundColor: applied inline
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },

  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    // color: applied inline
  },

  // =========================================================================
  // List Container
  // =========================================================================
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingBottom: 100,
  },

  // =========================================================================
  // SAP Fiori Object Cell Card
  // =========================================================================
  card: {
    marginBottom: spacing.sm,
    // backgroundColor: applied inline
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  cardPressed: {
    // backgroundColor: applied inline
  },

  cardSelected: {
    // backgroundColor: applied inline
    borderLeftWidth: 4,
    // borderLeftColor: applied inline
  },

  cardContentWrapper: {
    overflow: 'hidden',
    borderRadius: 12,
  },

  // Object Cell Row (main layout)
  objectCellRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    gap: spacing.md,
  },

  // =========================================================================
  // Status Icon (Left, 40dp)
  // =========================================================================
  statusIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    // backgroundColor and borderColor: applied inline
  },

  // Status icon styles removed - colors applied inline via getStatusIconStyle()

  // =========================================================================
  // Main Content (Center, Flex)
  // =========================================================================
  mainContent: {
    flex: 1,
    gap: spacing.xs,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  titleText: {
    ...typography.title,
    // color: applied inline
  },

  subtitleRow: {
    marginTop: spacing.xxs,
  },

  subtitleText: {
    ...typography.subtitle,
    // color: applied inline
  },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },

  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },

  footerText: {
    ...typography.footer,
    // color: applied inline
  },

  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    // backgroundColor: applied inline
    marginHorizontal: spacing.xs,
  },

  itemCountBadge: {
    // backgroundColor: applied inline
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: 10,
    marginLeft: spacing.xs,
  },

  itemCountText: {
    fontSize: 11,
    fontWeight: '600',
    // color: applied inline
  },

  // =========================================================================
  // Attribute Stack (Right, Fixed Width)
  // =========================================================================
  attributeStack: {
    alignItems: 'flex-end',
    gap: spacing.sm,
    minWidth: 72,
  },

  // Status Badge
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    minWidth: 56,
    alignItems: 'center',
    // backgroundColor: applied inline via getStatusBadgeStyle()
  },

  // Status badge color styles removed - colors applied inline via getStatusBadgeStyle()

  statusBadgeText: {
    ...typography.badge,
    // color: applied inline
  },

  // Stock Value Display
  stockValueContainer: {
    alignItems: 'flex-end',
  },

  stockValueText: {
    ...typography.stockValue,
    // color: applied inline via getStockValueStyle()
  },

  // Stock value color styles removed - colors applied inline via getStockValueStyle()

  stockLabel: {
    ...typography.attributeLabel,
    // color: applied inline
    marginTop: spacing.xxs,
  },

  // Weight Display
  weightDisplay: {
    alignItems: 'flex-end',
  },

  weightText: {
    ...typography.footer,
    // color: applied inline
  },

  // =========================================================================
  // Expanded Items Table (SAP Fiori Data Table Spec)
  // Spec: design/sap-fiori-specs/20-data-table.md
  // =========================================================================
  expandedSection: {
    borderTopWidth: 1,
    // borderTopColor: applied inline
  },

  tableHeader: {
    flexDirection: 'row',
    // backgroundColor: applied inline
    paddingVertical: spacing.sm, // 8pt vertical
    paddingHorizontal: spacing.md, // 12pt horizontal
    borderBottomWidth: 1,
    // borderBottomColor: applied inline
    minHeight: 44, // Fiori spec: 44pt min touch target
  },

  tableHeaderCell: {
    fontSize: 13, // Fiori spec: 13pt Semibold
    fontWeight: '600',
    // color: applied inline
    letterSpacing: 0.3,
  },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm, // 8pt vertical
    paddingHorizontal: spacing.md, // 12pt horizontal
    minHeight: 44, // Fiori spec: 44pt min, 48-56pt comfortable
    // backgroundColor: applied inline
  },

  tableRowAlt: {
    // backgroundColor: applied inline
  },

  tableCell: {
    justifyContent: 'center',
  },

  colItem: {
    flex: 2.5,
  },

  colQty: {
    width: 48,
    textAlign: 'right',
  },

  colWeight: {
    width: 48,
    textAlign: 'right',
    marginLeft: spacing.sm,
  },

  colStock: {
    width: 52,
    alignItems: 'center',
    marginLeft: spacing.sm,
  },

  cellValue: {
    fontSize: 15, // Fiori spec: 15pt Regular for data
    fontWeight: '400',
    // color: applied inline
  },

  itemName: {
    fontSize: 15, // Fiori spec: 15pt Regular for data
    // color: applied inline
    fontWeight: '500',
  },

  itemMark: {
    fontSize: 11,
    // color: applied inline
    marginTop: 2,
  },

  // Table stock badges with Fiori semantic colors
  tableStockBadge: {
    minWidth: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignItems: 'center',
    // backgroundColor: applied inline via getTableStockBadgeStyle()
  },

  // Table stock badge color styles removed - colors applied inline via getTableStockBadgeStyle()

  tableStockBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    // color: applied inline
  },

  // =========================================================================
  // Expand/Collapse Button
  // =========================================================================
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    // borderTopColor: applied inline
    gap: spacing.xs,
    minHeight: 48,
  },

  expandButtonPressed: {
    // backgroundColor: applied inline
  },

  expandButtonText: {
    fontSize: 13,
    fontWeight: '500',
    // color: applied inline
  },

  // =========================================================================
  // Swipe Actions
  // =========================================================================
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.sm,
  },

  swipeButton: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },

  swipePrint: {
    // backgroundColor: applied inline
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },

  swipeView: {
    // backgroundColor: applied inline
  },

  swipeEdit: {
    // backgroundColor: applied inline
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },

  swipeText: {
    fontSize: 10,
    fontWeight: '600',
    // color: applied inline
  },

  // =========================================================================
  // Skeleton Loading
  // =========================================================================
  skeletonCard: {
    marginBottom: spacing.sm,
    // backgroundColor: applied inline
    borderRadius: 12,
    padding: spacing.lg,
  },

  skeletonObjectCell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },

  skeletonStatusIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    // backgroundColor: applied inline
  },

  skeletonContent: {
    flex: 1,
    gap: spacing.sm,
  },

  skeletonTitle: {
    width: '60%',
    height: 16,
    borderRadius: 4,
    // backgroundColor: applied inline
  },

  skeletonSubtitle: {
    width: '80%',
    height: 14,
    borderRadius: 4,
    // backgroundColor: applied inline
  },

  skeletonFooter: {
    width: '50%',
    height: 12,
    borderRadius: 4,
    // backgroundColor: applied inline
  },

  skeletonAttributes: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },

  skeletonBadge: {
    width: 56,
    height: 24,
    borderRadius: 6,
    // backgroundColor: applied inline
  },

  skeletonStockValue: {
    width: 40,
    height: 24,
    borderRadius: 4,
    // backgroundColor: applied inline
  },

  // =========================================================================
  // Empty State
  // =========================================================================
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },

  emptyIconSurface: {
    width: 96,
    height: 96,
    borderRadius: 48,
    // backgroundColor: applied inline
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    // color: applied inline
    marginBottom: spacing.sm,
    textAlign: 'center',
  },

  emptySubtitle: {
    fontSize: 14,
    // color: applied inline
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },

  emptyButton: {
    borderRadius: 8,
  },

  emptyButtonContent: {
    paddingVertical: spacing.xxs,
  },

  // =========================================================================
  // Footer Loading
  // =========================================================================
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },

  footerLoaderText: {
    fontSize: 13,
    // color: applied inline
  },

  // =========================================================================
  // Snackbar
  // =========================================================================
  snackbar: {
    marginBottom: 80,
  },
});

export default styles;
