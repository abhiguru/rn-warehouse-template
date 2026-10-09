/**
 * FioriDataTable styles (docs/STYLE_GUIDE.md §13.7).
 *
 * `makeDataTableStyles(t)` is the themed stylesheet used by the table through
 * `useThemedStyles`. `FIORI_DATA_TABLE` keeps the table's sizes and type
 * styles, all taken from the metrics tokens.
 *
 * `styles` and `FIORI_DATA_TABLE.colors`/`shadows` are legacy static values
 * fixed to the default brand in light mode; they only exist so older imports
 * keep compiling and are deleted in migration phase 6.
 */

import { StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { DEFAULT_BRAND } from '@/store/slices/themeSlice';
import {
  fontWeight,
  getTokens,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const staticTokens = getTokens(DEFAULT_BRAND, 'light');

// ============================================================================
// SIZES AND TYPE
// ============================================================================
export const FIORI_DATA_TABLE = {
  dimensions: {
    /** Header row height. */
    headerRowHeight: layout.rowMinHeight,
    /** Body row height (§13.7: at least 44). */
    dataRowHeight: layout.rowMinHeight,
    /** Interactive row height (pressable, selectable or editable rows). */
    interactiveRowHeight: touchTarget,
    /** Read-only compact row height. */
    compactRowHeight: 36,
    columnMinWidth: 80,
    stickyColumnWidth: 120,
    /** Width of the selection and row-number columns. */
    controlColumnWidth: touchTarget,
    cellPaddingH: space.md,
    cellPaddingV: space.sm,
    /** Width of the fade shown at the horizontal scroll edge. */
    fadeWidth: space.xxl,
  },
  typography: {
    header: { ...typography.footnote, fontWeight: fontWeight.semibold },
    data: typography.subhead,
    dataMedium: { ...typography.subhead, fontWeight: fontWeight.medium },
    subtext: typography.caption1,
  },
  /** Legacy static colours (default brand, light mode). Use tokens instead. */
  colors: {
    headerBackground: staticTokens.background.base,
    rowBackground: staticTokens.surface.card,
    rowBackgroundAlt: staticTokens.surface.card,
    selectionBackground: staticTokens.surface.selected,
    border: staticTokens.border.divider,
    headerText: staticTokens.text.secondary,
    cellText: staticTokens.text.primary,
    cellTextPrimary: staticTokens.text.primary,
    cellTextTertiary: staticTokens.text.secondary,
    primary: staticTokens.brand.tint,
  },
  /** Legacy static shadow. The table no longer draws a sticky-column shadow. */
  shadows: {
    stickyColumn: staticTokens.shadow[0] as ViewStyle,
  },
} as const;

const D = FIORI_DATA_TABLE.dimensions;
const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

// ============================================================================
// THEMED STYLES
// ============================================================================
export const makeDataTableStyles = (t: ThemeTokens) => ({
  // Container
  container: {
    flex: 1,
    backgroundColor: t.surface.card,
  },
  contentContainer: {
    backgroundColor: t.surface.card,
  },
  framed: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.separator,
    overflow: 'hidden' as const,
  },
  tableBody: {
    flexDirection: 'row' as const,
  },
  tableBodyFill: {
    flex: 1,
  },

  // Loading bar shown while data reloads
  loadingOverlay: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  loadingText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Header container (legacy name)
  headerContainer: {
    flexDirection: 'row' as const,
    backgroundColor: t.background.base,
    borderBottomWidth: 1,
    borderBottomColor: t.border.separator,
  },
  scrollableHeaderArea: {
    flex: 1,
  },
  tableRowContainer: {
    flexDirection: 'row' as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  scrollableRowArea: {
    flex: 1,
  },
  dataTableContainer: {
    flexDirection: 'row' as const,
    flex: 1,
  },

  // Sticky (pinned) columns
  stickyColumn: {
    backgroundColor: t.surface.card,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border.separator,
    zIndex: 1,
  },
  stickyBodyClip: {
    flex: 1,
    overflow: 'hidden' as const,
  },
  stickyHeaderCell: {
    justifyContent: 'center' as const,
    paddingHorizontal: D.cellPaddingH,
    backgroundColor: t.background.base,
  },
  stickyDataCell: {
    justifyContent: 'center' as const,
    paddingHorizontal: D.cellPaddingH,
    backgroundColor: t.surface.card,
  },
  stickyDataCellPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  itemNameText: {
    ...FIORI_DATA_TABLE.typography.dataMedium,
    color: t.text.primary,
  },
  itemSubtext: {
    ...FIORI_DATA_TABLE.typography.subtext,
    color: t.text.secondary,
    marginTop: space.xxs,
  },

  // Scrollable area
  scrollableArea: {
    flex: 1,
  },
  scrollableContent: {
    flexGrow: 1,
  },
  scrollableInner: {
    flexGrow: 1,
  },
  list: {
    flex: 1,
  },

  // Header row: footnote 600, text.secondary, background.base, separator below
  headerRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.background.base,
    borderBottomWidth: 1,
    borderBottomColor: t.border.separator,
  },
  headerCell: {
    justifyContent: 'flex-start' as const,
    paddingHorizontal: D.cellPaddingH,
    paddingVertical: space.xs,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  headerCellAlignRight: {
    justifyContent: 'flex-end' as const,
  },
  headerCellAlignCenter: {
    justifyContent: 'center' as const,
  },
  headerCellPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  headerCellText: {
    ...FIORI_DATA_TABLE.typography.header,
    color: t.text.secondary,
    flexShrink: 1,
  },
  headerCellSortable: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },

  // Body rows: no alternate shading, divider below
  dataRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  rowAlt: {
    backgroundColor: t.surface.card,
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  rowSelected: {
    backgroundColor: t.surface.selected,
  },
  lastRow: {
    borderBottomWidth: 0,
  },

  // Totals row: weight 600, separator above
  totalsRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface.card,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  totalsText: {
    fontWeight: fontWeight.semibold,
  },

  // Cells
  dataCell: {
    justifyContent: 'center' as const,
    paddingHorizontal: D.cellPaddingH,
    paddingVertical: space.xs,
  },
  dataCellAlignRight: {
    alignItems: 'flex-end' as const,
  },
  dataCellAlignCenter: {
    alignItems: 'center' as const,
  },
  dataCellText: {
    ...FIORI_DATA_TABLE.typography.data,
    color: t.text.primary,
  },
  dataCellNumeric: tabular,
  dataCellTextLeft: {
    textAlign: 'left' as const,
  },
  dataCellTextCenter: {
    textAlign: 'center' as const,
  },
  dataCellTextRight: {
    textAlign: 'right' as const,
  },
  controlCell: {
    width: D.controlColumnWidth,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowNumberText: {
    ...typography.footnote,
    ...tabular,
    color: t.text.secondary,
  },

  // Editable cells
  editableCell: {
    borderRadius: radius.field,
  },
  editableCellPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  editInput: {
    ...typography.subhead,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
    paddingVertical: 0,
  },

  // Column widths (legacy)
  colGrnNo: { width: 80 },
  colCustomer: { width: 100 },
  colDate: { width: 80 },
  colQty: { width: 60 },
  colWeight: { width: 70 },
  colStock: { width: 70 },
  colRack: { width: 70 },

  // Status tag (legacy name "stock badge")
  stockBadge: {
    minWidth: space.huge,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stockBadgePositive: {
    backgroundColor: t.status.positive.background,
  },
  stockBadgeCritical: {
    backgroundColor: t.status.critical.background,
  },
  stockBadgeNegative: {
    backgroundColor: t.status.negative.background,
  },
  stockBadgeNeutral: {
    backgroundColor: t.status.neutral.background,
  },
  stockBadgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
  },

  // Skeleton rows while the first page loads
  skeletonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: D.cellPaddingH,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  skeletonBlock: {
    height: space.md,
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.huge,
    paddingHorizontal: space.xxl,
    backgroundColor: t.surface.card,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },

  // Footer spinner while the next page loads
  footerLoader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    backgroundColor: t.surface.card,
  },
  footerLoaderText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Fade at the horizontal scroll edge (opacity steps of the card colour)
  fade: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: D.fadeWidth,
    flexDirection: 'row' as const,
  },
  fadeStep: {
    flex: 1,
    backgroundColor: t.surface.card,
  },
});

export type DataTableStyles = ReturnType<typeof makeDataTableStyles>;

/** Legacy static stylesheet (default brand, light mode). Use makeDataTableStyles. */
export const styles = StyleSheet.create(makeDataTableStyles(staticTokens));

export default styles;
