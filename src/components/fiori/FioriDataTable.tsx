/**
 * SAP Fiori Data Table Component
 * @see design/sap-fiori-specs/20-data-table.md
 *
 * A horizontally scrollable data table with sticky header and optional sticky first column.
 * Supports inline editing, multi-selection, and proper Fiori styling.
 */
import React, { useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Vibration,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

// Fiori Data Table Spec Dimensions
const FIORI_TABLE = {
  headerHeight: 44,
  rowHeight: 48,
  minColumnWidth: 80,
  cellPaddingH: 12,
  cellPaddingV: 8,
  headerFontSize: 13,
  dataFontSize: 15,
};

// Fiori Data Table Colors
const FIORI_COLORS = {
  headerBg: '#F7F9FA',
  headerText: '#1D2D3E',
  rowBgDefault: '#FFFFFF',
  rowBgAlternate: '#F7F9FA',
  rowBgSelected: '#FFF4E6',
  rowBgHighlight: '#FFF4E6',
  activeCellStroke: '#f69000',
  border: '#E5E5E5',
  errorBg: '#FFF4F2',
  errorBorder: '#D32030',
  readOnlyBg: '#F5F6F7',
  selectionCheckbox: '#f69000',
};

export interface DataTableColumn {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  sticky?: boolean;
  sortable?: boolean;
  editable?: boolean;
  dataType?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'time' | 'duration';
  align?: 'left' | 'center' | 'right';
  renderCell?: (value: any, row: Record<string, any>, rowIndex: number) => React.ReactNode;
  renderHeader?: () => React.ReactNode;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  data: Record<string, any>[];
  keyExtractor: (item: Record<string, any>, index: number) => string;

  // Selection
  selectable?: boolean;
  multiSelect?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;

  // Editing
  editable?: boolean;
  onCellEdit?: (rowId: string, columnKey: string, value: any) => void;
  editingCell?: { rowId: string; columnKey: string } | null;
  onEditingCellChange?: (cell: { rowId: string; columnKey: string } | null) => void;

  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;

  // Actions
  onRowPress?: (row: Record<string, any>, index: number) => void;

  // Layout
  stickyHeader?: boolean;
  alternateRowColors?: boolean;

  // Empty state
  emptyMessage?: string;

  // Footer
  renderFooter?: () => React.ReactNode;
}

export const FioriDataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  keyExtractor,
  selectable = false,
  multiSelect = false,
  selectedIds = [],
  onSelectionChange,
  editable = false,
  onCellEdit,
  editingCell,
  onEditingCellChange,
  sortColumn,
  sortDirection,
  onSort,
  onRowPress,
  stickyHeader = true,
  alternateRowColors = true,
  emptyMessage = 'No data available',
  renderFooter,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const stickyScrollRef = useRef<ScrollView>(null);
  const [syncingScroll, setSyncingScroll] = useState(false);

  // Separate sticky and scrollable columns
  const stickyColumns = columns.filter((col) => col.sticky);
  const scrollableColumns = columns.filter((col) => !col.sticky);

  // Calculate sticky column width
  const stickyColumnWidth = stickyColumns.reduce(
    (sum, col) => sum + (col.width || col.minWidth || FIORI_TABLE.minColumnWidth),
    0
  );

  // Handle scroll sync between sticky and scrollable areas
  const handleMainScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (syncingScroll) return;
      setSyncingScroll(true);
      const offsetY = event.nativeEvent.contentOffset.y;
      stickyScrollRef.current?.scrollTo({ y: offsetY, animated: false });
      setTimeout(() => setSyncingScroll(false), 16);
    },
    [syncingScroll]
  );

  const handleStickyScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (syncingScroll) return;
      setSyncingScroll(true);
      const offsetY = event.nativeEvent.contentOffset.y;
      scrollViewRef.current?.scrollTo({ y: offsetY, animated: false });
      setTimeout(() => setSyncingScroll(false), 16);
    },
    [syncingScroll]
  );

  // Handle row selection
  const handleRowSelect = useCallback(
    (rowId: string) => {
      if (!onSelectionChange) return;
      Vibration.vibrate(10);

      if (multiSelect) {
        const newSelection = selectedIds.includes(rowId)
          ? selectedIds.filter((id) => id !== rowId)
          : [...selectedIds, rowId];
        onSelectionChange(newSelection);
      } else {
        onSelectionChange(selectedIds.includes(rowId) ? [] : [rowId]);
      }
    },
    [multiSelect, selectedIds, onSelectionChange]
  );

  // Handle cell edit
  const handleCellPress = useCallback(
    (rowId: string, columnKey: string, column: DataTableColumn) => {
      if (!editable || !column.editable) return;
      Vibration.vibrate(15);
      onEditingCellChange?.({ rowId, columnKey });
    },
    [editable, onEditingCellChange]
  );

  // Handle cell value change
  const handleCellChange = useCallback(
    (rowId: string, columnKey: string, value: string, dataType?: string) => {
      if (!onCellEdit) return;

      let parsedValue: string | number = value;
      if (dataType === 'number' || dataType === 'currency' || dataType === 'percent') {
        parsedValue = parseFloat(value) || 0;
      }

      onCellEdit(rowId, columnKey, parsedValue);
    },
    [onCellEdit]
  );

  // Render header cell
  const renderHeaderCell = (column: DataTableColumn, isSticky: boolean) => {
    const width = column.width || column.minWidth || FIORI_TABLE.minColumnWidth;
    const isSorted = sortColumn === column.key;

    return (
      <TouchableOpacity
        key={column.key}
        style={[
          styles.headerCell,
          { width },
          isSticky && styles.stickyCell,
          column.align === 'center' && styles.cellAlignCenter,
          column.align === 'right' && styles.cellAlignRight,
        ]}
        onPress={() => column.sortable && onSort?.(column.key)}
        disabled={!column.sortable}
        activeOpacity={column.sortable ? 0.7 : 1}
      >
        {column.renderHeader ? (
          column.renderHeader()
        ) : (
          <View style={styles.headerContent}>
            <Text style={styles.headerText} numberOfLines={2}>
              {column.label}
            </Text>
            {column.sortable && isSorted && (
              <Icon
                name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={FIORI_COLORS.headerText}
                style={styles.sortIcon}
              />
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render data cell - memoized to prevent unnecessary re-renders
  // @see PO2 - TableRow Component Defined Inside Parent
  const renderDataCell = useCallback(
    (
      column: DataTableColumn,
      row: Record<string, any>,
      rowIndex: number,
      rowId: string,
      isSticky: boolean
    ) => {
    const width = column.width || column.minWidth || FIORI_TABLE.minColumnWidth;
    const value = row[column.key];
    const isEditing = editingCell?.rowId === rowId && editingCell?.columnKey === column.key;
    const isSelected = selectedIds.includes(rowId);

    // Custom cell renderer
    if (column.renderCell) {
      return (
        <View
          key={column.key}
          style={[
            styles.dataCell,
            { width },
            isSticky && styles.stickyCell,
            isSelected && styles.cellSelected,
          ]}
        >
          {column.renderCell(value, row, rowIndex)}
        </View>
      );
    }

    // Format value based on data type
    let displayValue = value?.toString() || '';
    if (column.dataType === 'currency') {
      displayValue = `₹${Number(value || 0).toFixed(2)}`;
    } else if (column.dataType === 'percent') {
      displayValue = `${value || 0}%`;
    }

    // Editable cell
    if (editable && column.editable) {
      return (
        <TouchableOpacity
          key={column.key}
          style={[
            styles.dataCell,
            { width },
            isSticky && styles.stickyCell,
            isSelected && styles.cellSelected,
            isEditing && styles.cellEditing,
            column.align === 'center' && styles.cellAlignCenter,
            column.align === 'right' && styles.cellAlignRight,
          ]}
          onPress={() => handleCellPress(rowId, column.key, column)}
          activeOpacity={0.7}
        >
          {isEditing ? (
            <View style={styles.editInputContainer}>
              {column.dataType === 'currency' && <Text style={styles.inputPrefix}>₹</Text>}
              <TextInput
                style={[
                  styles.editInput,
                  column.dataType === 'currency' && styles.editInputWithPrefix,
                  column.dataType === 'percent' && styles.editInputWithSuffix,
                ]}
                value={value?.toString() || ''}
                onChangeText={(text) => handleCellChange(rowId, column.key, text, column.dataType)}
                keyboardType={
                  column.dataType === 'number' ||
                  column.dataType === 'currency' ||
                  column.dataType === 'percent'
                    ? 'decimal-pad'
                    : 'default'
                }
                autoFocus
                selectTextOnFocus
                onBlur={() => onEditingCellChange?.(null)}
              />
              {column.dataType === 'percent' && <Text style={styles.inputSuffix}>%</Text>}
            </View>
          ) : (
            <Text
              style={[
                styles.dataText,
                column.align === 'right' && styles.textAlignRight,
                column.align === 'center' && styles.textAlignCenter,
              ]}
              numberOfLines={2}
            >
              {displayValue}
            </Text>
          )}
        </TouchableOpacity>
      );
    }

    // Read-only cell
    return (
      <View
        key={column.key}
        style={[
          styles.dataCell,
          { width },
          isSticky && styles.stickyCell,
          isSelected && styles.cellSelected,
          column.align === 'center' && styles.cellAlignCenter,
          column.align === 'right' && styles.cellAlignRight,
        ]}
      >
        <Text
          style={[
            styles.dataText,
            column.align === 'right' && styles.textAlignRight,
            column.align === 'center' && styles.textAlignCenter,
          ]}
          numberOfLines={2}
        >
          {displayValue}
        </Text>
      </View>
    );
    },
    [editingCell, selectedIds, editable, handleCellPress, handleCellChange, onEditingCellChange]
  );

  // Render row - memoized to prevent unnecessary re-renders
  // @see PO2 - TableRow Component Defined Inside Parent
  const renderRow = useCallback(
    (row: Record<string, any>, rowIndex: number) => {
      const rowId = keyExtractor(row, rowIndex);
      const isSelected = selectedIds.includes(rowId);
      const isAlternate = alternateRowColors && rowIndex % 2 === 1;

      return (
        <TouchableOpacity
          key={rowId}
          style={[
            styles.dataRow,
            isAlternate && styles.dataRowAlternate,
            isSelected && styles.dataRowSelected,
          ]}
          onPress={() => {
            if (selectable) {
              handleRowSelect(rowId);
            } else if (onRowPress) {
              onRowPress(row, rowIndex);
            }
          }}
          activeOpacity={selectable || onRowPress ? 0.7 : 1}
          disabled={!selectable && !onRowPress}
        >
          {/* Selection checkbox */}
          {selectable && (
            <View style={styles.checkboxCell}>
              <Icon
                name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={isSelected ? FIORI_COLORS.selectionCheckbox : FIORI_COLORS.border}
              />
            </View>
          )}

          {/* Data cells */}
          {columns.map((column) => renderDataCell(column, row, rowIndex, rowId, column.sticky || false))}
        </TouchableOpacity>
      );
    },
    [keyExtractor, selectedIds, alternateRowColors, selectable, handleRowSelect, onRowPress, columns, renderDataCell]
  );

  // Empty state
  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="table-off" size={48} color={FIORI_COLORS.border} />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  // Simple table without sticky column (most common case)
  if (stickyColumns.length === 0) {
    return (
      <View style={styles.container}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View>
            {/* Header */}
            {stickyHeader && (
              <View style={styles.headerRow}>
                {selectable && <View style={[styles.checkboxCell, styles.headerCell]} />}
                {columns.map((col) => renderHeaderCell(col, false))}
              </View>
            )}

            {/* Data rows */}
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={true}
              style={styles.dataContainer}
            >
              {data.map((row, index) => renderRow(row, index))}
            </ScrollView>
          </View>
        </ScrollView>

        {/* Footer */}
        {renderFooter && renderFooter()}
      </View>
    );
  }

  // Table with sticky first column
  return (
    <View style={styles.container}>
      <View style={styles.tableWrapper}>
        {/* Sticky column area */}
        <View style={[styles.stickyArea, { width: stickyColumnWidth + (selectable ? 44 : 0) }]}>
          {/* Sticky header */}
          {stickyHeader && (
            <View style={styles.headerRow}>
              {selectable && <View style={[styles.checkboxCell, styles.headerCell]} />}
              {stickyColumns.map((col) => renderHeaderCell(col, true))}
            </View>
          )}

          {/* Sticky data column */}
          <ScrollView
            ref={stickyScrollRef}
            showsVerticalScrollIndicator={false}
            onScroll={handleStickyScroll}
            scrollEventThrottle={16}
          >
            {data.map((row, index) => {
              const rowId = keyExtractor(row, index);
              const isSelected = selectedIds.includes(rowId);
              const isAlternate = alternateRowColors && index % 2 === 1;

              return (
                <TouchableOpacity
                  key={rowId}
                  style={[
                    styles.dataRow,
                    isAlternate && styles.dataRowAlternate,
                    isSelected && styles.dataRowSelected,
                  ]}
                  onPress={() => selectable && handleRowSelect(rowId)}
                  activeOpacity={selectable ? 0.7 : 1}
                  disabled={!selectable}
                >
                  {selectable && (
                    <View style={styles.checkboxCell}>
                      <Icon
                        name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={24}
                        color={isSelected ? FIORI_COLORS.selectionCheckbox : FIORI_COLORS.border}
                      />
                    </View>
                  )}
                  {stickyColumns.map((col) =>
                    renderDataCell(col, row, index, rowId, true)
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Scrollable columns area */}
        <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false}>
          <View>
            {/* Scrollable header */}
            {stickyHeader && (
              <View style={styles.headerRow}>
                {scrollableColumns.map((col) => renderHeaderCell(col, false))}
              </View>
            )}

            {/* Scrollable data */}
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={true}
              onScroll={handleMainScroll}
              scrollEventThrottle={16}
            >
              {data.map((row, index) => {
                const rowId = keyExtractor(row, index);
                const isSelected = selectedIds.includes(rowId);
                const isAlternate = alternateRowColors && index % 2 === 1;

                return (
                  <View
                    key={rowId}
                    style={[
                      styles.dataRow,
                      isAlternate && styles.dataRowAlternate,
                      isSelected && styles.dataRowSelected,
                    ]}
                  >
                    {scrollableColumns.map((col) =>
                      renderDataCell(col, row, index, rowId, false)
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      {/* Footer */}
      {renderFooter && renderFooter()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI_COLORS.rowBgDefault,
  },
  tableWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  dataContainer: {
    flex: 1,
  },

  // Sticky area
  stickyArea: {
    borderRightWidth: 1,
    borderRightColor: FIORI_COLORS.border,
    backgroundColor: FIORI_COLORS.rowBgDefault,
    zIndex: 1,
    // Shadow for sticky column
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  stickyCell: {
    backgroundColor: FIORI_COLORS.rowBgDefault,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    backgroundColor: FIORI_COLORS.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: FIORI_COLORS.border,
    minHeight: FIORI_TABLE.headerHeight,
  },
  headerCell: {
    paddingHorizontal: FIORI_TABLE.cellPaddingH,
    paddingVertical: FIORI_TABLE.cellPaddingV,
    justifyContent: 'center',
    minHeight: FIORI_TABLE.headerHeight,
    backgroundColor: FIORI_COLORS.headerBg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: FIORI_TABLE.headerFontSize,
    fontWeight: '600',
    color: FIORI_COLORS.headerText,
    lineHeight: 18,
  },
  sortIcon: {
    marginLeft: 4,
  },

  // Data rows
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: FIORI_COLORS.border,
    minHeight: FIORI_TABLE.rowHeight,
    backgroundColor: FIORI_COLORS.rowBgDefault,
  },
  dataRowAlternate: {
    backgroundColor: FIORI_COLORS.rowBgAlternate,
  },
  dataRowSelected: {
    backgroundColor: FIORI_COLORS.rowBgSelected,
  },

  // Data cells
  dataCell: {
    paddingHorizontal: FIORI_TABLE.cellPaddingH,
    paddingVertical: FIORI_TABLE.cellPaddingV,
    justifyContent: 'center',
    minHeight: FIORI_TABLE.rowHeight,
  },
  dataText: {
    fontSize: FIORI_TABLE.dataFontSize,
    fontWeight: '400',
    color: FIORI_COLORS.headerText,
    lineHeight: 20,
  },
  cellAlignCenter: {
    alignItems: 'center',
  },
  cellAlignRight: {
    alignItems: 'flex-end',
  },
  textAlignRight: {
    textAlign: 'right',
  },
  textAlignCenter: {
    textAlign: 'center',
  },
  cellSelected: {
    backgroundColor: FIORI_COLORS.rowBgSelected,
  },
  cellEditing: {
    borderWidth: 2,
    borderColor: FIORI_COLORS.activeCellStroke,
    borderRadius: 4,
    padding: FIORI_TABLE.cellPaddingH - 2,
  },

  // Checkbox
  checkboxCell: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: FIORI_TABLE.rowHeight,
  },

  // Edit input
  editInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  editInput: {
    flex: 1,
    fontSize: FIORI_TABLE.dataFontSize,
    color: FIORI_COLORS.headerText,
    padding: 0,
    margin: 0,
    textAlign: 'right',
  },
  editInputWithPrefix: {
    paddingLeft: 4,
  },
  editInputWithSuffix: {
    paddingRight: 4,
  },
  inputPrefix: {
    fontSize: FIORI_TABLE.dataFontSize,
    color: FIORI_COLORS.headerText,
    fontWeight: '600',
  },
  inputSuffix: {
    fontSize: FIORI_TABLE.dataFontSize,
    color: FIORI_COLORS.headerText,
    fontWeight: '600',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    backgroundColor: FIORI_COLORS.rowBgDefault,
  },
  emptyText: {
    marginTop: 16,
    fontSize: FIORI_TABLE.dataFontSize,
    color: theme.colors.fiori.text.secondary,
    textAlign: 'center',
  },
});

export default FioriDataTable;
