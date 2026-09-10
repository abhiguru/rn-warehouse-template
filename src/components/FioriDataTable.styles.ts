/**
 * FioriDataTable Styles
 *
 * SAP Fiori Data Table design system implementation.
 * @see design/sap-fiori-specs/20-data-table.md
 */

import { StyleSheet, Platform } from 'react-native';
import { listColors as colors } from '@/theme/listColors';

// ============================================================================
// FIORI DATA TABLE DESIGN TOKENS
// Based on SAP Fiori Data Table Specification (20-data-table.md)
// ============================================================================
export const FIORI_DATA_TABLE = {
  dimensions: {
    headerRowHeight: 44,        // Fiori spec: 44pt min touch target
    dataRowHeight: 48,          // Fiori spec: 48-56pt comfortable
    columnMinWidth: 80,         // Fiori spec: 80pt
    stickyColumnWidth: 120,     // Width for sticky first column
    cellPaddingH: 12,           // Fiori spec: 12pt horizontal
    cellPaddingV: 8,            // Fiori spec: 8pt vertical
  },
  typography: {
    header: {
      fontSize: 13,             // Fiori spec: 13pt
      fontWeight: '600' as const, // Fiori spec: Semibold
    },
    data: {
      fontSize: 15,             // Fiori spec: 15pt
      fontWeight: '400' as const, // Fiori spec: Regular
    },
    dataMedium: {
      fontSize: 15,
      fontWeight: '500' as const,
    },
    subtext: {
      fontSize: 11,
      fontWeight: '400' as const,
    },
  },
  colors: {
    headerBackground: colors.gray50,        // #F7F9FA
    rowBackground: colors.cellBackground,   // #FFFFFF
    rowBackgroundAlt: colors.gray50,        // #F7F9FA
    selectionBackground: colors.primaryLight, // #FFF4E6
    border: colors.cellDivider,             // #E5E5E5
    headerText: colors.textPrimary,         // #1D2D3E
    cellText: colors.textSecondary,         // #556B82
    cellTextPrimary: colors.textPrimary,
    cellTextTertiary: colors.textTertiary,
    primary: colors.primary,
  },
  shadows: {
    stickyColumn: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
} as const;

// ============================================================================
// STYLES
// ============================================================================
export const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: colors.cellBackground,
  },

  // Loading overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },

  // Header Container - contains sticky header cell and scrollable header
  headerContainer: {
    flexDirection: 'row',
    backgroundColor: FIORI_DATA_TABLE.colors.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: FIORI_DATA_TABLE.colors.border,
  },

  // Scrollable header area
  scrollableHeaderArea: {
    flex: 1,
  },

  // Table Row Container - contains sticky cell and scrollable cells
  tableRowContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: FIORI_DATA_TABLE.colors.border,
  },

  // Scrollable row area
  scrollableRowArea: {
    flex: 1,
  },

  // Data Table Container - enables sticky column (legacy)
  dataTableContainer: {
    flexDirection: 'row',
    flex: 1,
  },

  // ==========================================================================
  // STICKY FIRST COLUMN
  // ==========================================================================
  stickyColumn: {
    width: FIORI_DATA_TABLE.dimensions.stickyColumnWidth,
    backgroundColor: colors.cellBackground,
    borderRightWidth: 1,
    borderRightColor: FIORI_DATA_TABLE.colors.border,
    zIndex: 10,
    ...FIORI_DATA_TABLE.shadows.stickyColumn,
  },

  stickyHeaderCell: {
    height: FIORI_DATA_TABLE.dimensions.headerRowHeight,
    justifyContent: 'center',
    paddingHorizontal: FIORI_DATA_TABLE.dimensions.cellPaddingH,
    backgroundColor: FIORI_DATA_TABLE.colors.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: FIORI_DATA_TABLE.colors.border,
  },

  stickyDataCell: {
    height: FIORI_DATA_TABLE.dimensions.dataRowHeight,
    justifyContent: 'center',
    paddingHorizontal: FIORI_DATA_TABLE.dimensions.cellPaddingH,
    backgroundColor: FIORI_DATA_TABLE.colors.rowBackground,
    borderBottomWidth: 1,
    borderBottomColor: FIORI_DATA_TABLE.colors.border,
  },

  stickyDataCellPressed: {
    backgroundColor: colors.cellBackgroundPressed,
  },

  // Item name and subtext in sticky column
  itemNameText: {
    ...FIORI_DATA_TABLE.typography.dataMedium,
    color: FIORI_DATA_TABLE.colors.cellTextPrimary,
  },

  itemSubtext: {
    ...FIORI_DATA_TABLE.typography.subtext,
    color: FIORI_DATA_TABLE.colors.cellTextTertiary,
    marginTop: 2,
  },

  // ==========================================================================
  // SCROLLABLE AREA
  // ==========================================================================
  scrollableArea: {
    flex: 1,
  },

  scrollableContent: {
    flexGrow: 1,
  },

  // ==========================================================================
  // HEADER ROW
  // ==========================================================================
  headerRow: {
    flexDirection: 'row',
    height: FIORI_DATA_TABLE.dimensions.headerRowHeight,
    backgroundColor: FIORI_DATA_TABLE.colors.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: FIORI_DATA_TABLE.colors.border,
  },

  headerCell: {
    justifyContent: 'center',
    paddingHorizontal: FIORI_DATA_TABLE.dimensions.cellPaddingH,
    paddingVertical: FIORI_DATA_TABLE.dimensions.cellPaddingV,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  headerCellText: {
    ...FIORI_DATA_TABLE.typography.header,
    color: FIORI_DATA_TABLE.colors.headerText,
  },

  headerCellSortable: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ==========================================================================
  // DATA ROWS
  // ==========================================================================
  dataRow: {
    flexDirection: 'row',
    height: FIORI_DATA_TABLE.dimensions.dataRowHeight,
    backgroundColor: FIORI_DATA_TABLE.colors.rowBackground,
    borderBottomWidth: 1,
    borderBottomColor: FIORI_DATA_TABLE.colors.border,
  },

  rowAlt: {
    backgroundColor: FIORI_DATA_TABLE.colors.rowBackgroundAlt,
  },

  rowPressed: {
    backgroundColor: colors.cellBackgroundPressed,
  },

  rowSelected: {
    backgroundColor: FIORI_DATA_TABLE.colors.selectionBackground,
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  // ==========================================================================
  // DATA CELLS
  // ==========================================================================
  dataCell: {
    justifyContent: 'center',
    paddingHorizontal: FIORI_DATA_TABLE.dimensions.cellPaddingH,
    paddingVertical: FIORI_DATA_TABLE.dimensions.cellPaddingV,
  },

  dataCellText: {
    ...FIORI_DATA_TABLE.typography.data,
    color: FIORI_DATA_TABLE.colors.cellText,
  },

  dataCellTextLeft: {
    textAlign: 'left',
  },

  dataCellTextCenter: {
    textAlign: 'center',
  },

  dataCellTextRight: {
    textAlign: 'right',
  },

  // ==========================================================================
  // COLUMN WIDTHS
  // ==========================================================================
  colGrnNo: {
    width: 80,
  },

  colCustomer: {
    width: 100,
  },

  colDate: {
    width: 80,
  },

  colQty: {
    width: 60,
  },

  colWeight: {
    width: 70,
  },

  colStock: {
    width: 70,
  },

  colRack: {
    width: 70,
  },

  // ==========================================================================
  // STOCK BADGE
  // ==========================================================================
  stockBadge: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stockBadgePositive: {
    backgroundColor: colors.statusPositive,
  },

  stockBadgeCritical: {
    backgroundColor: colors.statusCritical,
  },

  stockBadgeNegative: {
    backgroundColor: colors.statusNegative,
  },

  stockBadgeNeutral: {
    backgroundColor: colors.statusNone,
  },

  stockBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textInverse,
  },

  // ==========================================================================
  // EMPTY STATE
  // ==========================================================================
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },

  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // ==========================================================================
  // FOOTER LOADING
  // ==========================================================================
  footerLoader: {
    height: FIORI_DATA_TABLE.dimensions.dataRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: FIORI_DATA_TABLE.colors.border,
    backgroundColor: colors.cellBackground,
  },

  footerLoaderText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});

export default styles;
