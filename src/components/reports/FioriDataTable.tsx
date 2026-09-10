/**
 * SAP Fiori Data Table Component
 *
 * Based on SAP Fiori for iOS Design Guidelines (design/sap-fiori-specs/20-data-table.md)
 *
 * Features:
 * - Sticky header row
 * - Optional sticky first column
 * - Horizontal scrolling
 * - Alternating row colors
 * - Proper touch targets (44pt min)
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import theme from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface DataTableColumn {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sticky?: boolean; // Only first column can be sticky
  render?: (value: any, row: Record<string, any>, rowIndex: number) => React.ReactNode;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  data: Record<string, any>[];
  keyExtractor?: (row: Record<string, any>, index: number) => string;
  stickyFirstColumn?: boolean;
  alternateRowColors?: boolean;
  showRowNumbers?: boolean;
  emptyMessage?: string;
  compact?: boolean; // Smaller row heights for dense data
}

// ============================================================================
// Design Tokens (from SAP Fiori spec)
// ============================================================================

const TOKENS = {
  colors: {
    headerBackground: theme.colors.gray[50], // #F7F9FA
    headerText: theme.colors.fiori.text.primary, // #1D2D3E
    rowBackground: '#FFFFFF',
    rowBackgroundAlt: theme.colors.gray[50], // #F7F9FA
    border: '#E5E5E5',
    textPrimary: theme.colors.fiori.text.primary,
    textSecondary: theme.colors.fiori.text.secondary,
  },
  dimensions: {
    headerRowHeight: 44,
    dataRowHeight: 48,
    dataRowHeightCompact: 40,
    columnMinWidth: 80,
    cellPaddingH: 12,
    cellPaddingV: 8,
    stickyColumnWidth: 120,
  },
  typography: {
    header: {
      fontSize: 13,
      fontWeight: '600' as const,
    },
    data: {
      fontSize: 14,
      fontWeight: '400' as const,
    },
  },
};

// ============================================================================
// Component
// ============================================================================

export const FioriDataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  keyExtractor = (_, index) => String(index),
  stickyFirstColumn = true,
  alternateRowColors = true,
  showRowNumbers = false,
  emptyMessage = 'No data',
  compact = false,
}) => {
  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const rowHeight = compact ? TOKENS.dimensions.dataRowHeightCompact : TOKENS.dimensions.dataRowHeight;

  // Separate sticky column from scrollable columns
  const stickyColumn = stickyFirstColumn ? columns[0] : null;
  const scrollableColumns = stickyFirstColumn ? columns.slice(1) : columns;

  // Calculate column widths
  const getColumnWidth = (col: DataTableColumn) => {
    return col.width || col.minWidth || TOKENS.dimensions.columnMinWidth;
  };

  const stickyColumnWidth = stickyColumn
    ? (stickyColumn.width || TOKENS.dimensions.stickyColumnWidth)
    : 0;

  // Render cell content
  const renderCell = (
    column: DataTableColumn,
    row: Record<string, any>,
    rowIndex: number,
    isHeader: boolean = false
  ) => {
    if (isHeader) {
      return (
        <Text
          style={[
            styles.headerText,
            column.align === 'right' && styles.textRight,
            column.align === 'center' && styles.textCenter,
          ]}
          numberOfLines={1}
        >
          {column.label}
        </Text>
      );
    }

    const value = row[column.key];

    if (column.render) {
      return column.render(value, row, rowIndex);
    }

    return (
      <Text
        style={[
          styles.dataText,
          column.align === 'right' && styles.textRight,
          column.align === 'center' && styles.textCenter,
        ]}
        numberOfLines={2}
      >
        {value ?? '-'}
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        {/* Sticky Header Cell */}
        {stickyColumn && (
          <View
            style={[
              styles.stickyCell,
              styles.headerCell,
              { width: stickyColumnWidth },
            ]}
          >
            {renderCell(stickyColumn, {}, -1, true)}
          </View>
        )}

        {/* Scrollable Header Cells */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollableHeader}
          scrollEnabled={false} // Synced with body scroll
        >
          <View style={styles.headerRowInner}>
            {scrollableColumns.map((col) => (
              <View
                key={col.key}
                style={[
                  styles.headerCell,
                  { width: getColumnWidth(col) },
                ]}
              >
                {renderCell(col, {}, -1, true)}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Data Rows */}
      <View style={styles.bodyContainer}>
        {/* Sticky Column */}
        {stickyColumn && (
          <View style={[styles.stickyColumnContainer, { width: stickyColumnWidth }]}>
            {data.map((row, rowIndex) => (
              <View
                key={keyExtractor(row, rowIndex)}
                style={[
                  styles.stickyCell,
                  styles.dataCell,
                  { height: rowHeight },
                  alternateRowColors && rowIndex % 2 === 1 && styles.rowAlt,
                ]}
              >
                {renderCell(stickyColumn, row, rowIndex)}
              </View>
            ))}
          </View>
        )}

        {/* Scrollable Data Columns */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.scrollableBody}
          contentContainerStyle={styles.scrollableBodyContent}
        >
          <View>
            {data.map((row, rowIndex) => (
              <View
                key={keyExtractor(row, rowIndex)}
                style={[
                  styles.dataRow,
                  { height: rowHeight },
                  alternateRowColors && rowIndex % 2 === 1 && styles.rowAlt,
                ]}
              >
                {scrollableColumns.map((col) => (
                  <View
                    key={col.key}
                    style={[
                      styles.dataCell,
                      { width: getColumnWidth(col) },
                    ]}
                  >
                    {renderCell(col, row, rowIndex)}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    overflow: 'hidden',
    backgroundColor: TOKENS.colors.rowBackground,
  },

  // Empty state
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.rowBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  emptyText: {
    fontSize: 14,
    color: TOKENS.colors.textSecondary,
  },

  // Header row
  headerRow: {
    flexDirection: 'row',
    backgroundColor: TOKENS.colors.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    minHeight: TOKENS.dimensions.headerRowHeight,
  },
  headerRowInner: {
    flexDirection: 'row',
  },
  headerCell: {
    paddingHorizontal: TOKENS.dimensions.cellPaddingH,
    paddingVertical: TOKENS.dimensions.cellPaddingV,
    justifyContent: 'center',
  },
  headerText: {
    fontSize: TOKENS.typography.header.fontSize,
    fontWeight: TOKENS.typography.header.fontWeight,
    color: TOKENS.colors.headerText,
  },
  scrollableHeader: {
    flex: 1,
  },

  // Body
  bodyContainer: {
    flexDirection: 'row',
  },
  stickyColumnContainer: {
    borderRightWidth: 1,
    borderRightColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.rowBackground,
  },
  stickyCell: {
    borderRightWidth: 1,
    borderRightColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.rowBackground,
  },
  scrollableBody: {
    flex: 1,
  },
  scrollableBodyContent: {
    flexGrow: 1,
  },

  // Data rows
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TOKENS.colors.border,
  },
  dataCell: {
    paddingHorizontal: TOKENS.dimensions.cellPaddingH,
    paddingVertical: TOKENS.dimensions.cellPaddingV,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TOKENS.colors.border,
  },
  dataText: {
    fontSize: TOKENS.typography.data.fontSize,
    fontWeight: TOKENS.typography.data.fontWeight,
    color: TOKENS.colors.textPrimary,
  },
  rowAlt: {
    backgroundColor: TOKENS.colors.rowBackgroundAlt,
  },

  // Text alignment
  textRight: {
    textAlign: 'right',
  },
  textCenter: {
    textAlign: 'center',
  },
});

export default FioriDataTable;
