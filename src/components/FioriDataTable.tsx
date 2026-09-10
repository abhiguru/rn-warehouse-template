/**
 * FioriDataTable - SAP Fiori Data Table Component
 *
 * Reusable data table with sticky header and sticky first column.
 * Follows SAP Fiori for iOS Design Guidelines.
 *
 * @see design/sap-fiori-specs/20-data-table.md
 *
 * Features:
 * - Sticky header row
 * - Sticky first column with shadow
 * - Horizontal scrolling for additional columns
 * - Alternating row colors
 * - Sort indicators
 * - Row press handling
 */

import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Vibration,
  ViewStyle,
  TextStyle,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { styles, FIORI_DATA_TABLE } from './FioriDataTable.styles';
import { listColors as colors } from '@/theme/listColors';

// ============================================================================
// TYPES
// ============================================================================

export interface FioriDataTableColumn<T> {
  key: keyof T | string;
  label: string;
  width?: number;
  minWidth?: number;
  sticky?: boolean;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (value: any, row: T, index: number) => React.ReactNode;
  getCellStyle?: (value: any, row: T) => ViewStyle;
  getTextStyle?: (value: any, row: T) => TextStyle;
}

export interface FioriDataTableProps<T> {
  columns: FioriDataTableColumn<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;

  // Layout
  stickyFirstColumn?: boolean;
  alternateRowColors?: boolean;

  // Dimensions
  headerRowHeight?: number;
  dataRowHeight?: number;

  // Interactions
  onRowPress?: (row: T, index: number) => void;

  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnKey: string) => void;

  // Loading states
  loading?: boolean;
  loadingMore?: boolean;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing?: boolean;

  // Empty state
  emptyMessage?: string;

  // Accessibility
  accessibilityLabel?: string;
}

// ============================================================================
// ROW COMPONENT - Renders a single row with sticky cell and scrollable cells
// ============================================================================
interface TableRowProps<T> {
  row: T;
  index: number;
  stickyColumn: FioriDataTableColumn<T> | null;
  scrollableColumns: FioriDataTableColumn<T>[];
  dataRowHeight: number;
  alternateRowColors: boolean;
  onRowPress?: (row: T, index: number) => void;
  scrollX: React.MutableRefObject<number>;
  horizontalScrollRef: React.RefObject<ScrollView | null>;
}

function TableRow<T extends Record<string, any>>({
  row,
  index,
  stickyColumn,
  scrollableColumns,
  dataRowHeight,
  alternateRowColors,
  onRowPress,
  scrollX,
  horizontalScrollRef,
}: TableRowProps<T>) {
  const rowScrollRef = useRef<ScrollView>(null);

  const handleRowPress = useCallback(() => {
    if (onRowPress) {
      Vibration.vibrate(10);
      onRowPress(row, index);
    }
  }, [onRowPress, row, index]);

  const getCellValue = (key: string) => row[key as keyof T];

  const getAlignStyle = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'left': return styles.dataCellTextLeft;
      case 'right': return styles.dataCellTextRight;
      default: return styles.dataCellTextCenter;
    }
  };

  const renderCellContent = (column: FioriDataTableColumn<T>) => {
    const value = getCellValue(column.key as string);
    if (column.render) {
      return column.render(value, row, index);
    }
    const textStyle = column.getTextStyle?.(value, row);
    return (
      <Text style={[styles.dataCellText, getAlignStyle(column.align), textStyle]} numberOfLines={1}>
        {value?.toString() ?? '-'}
      </Text>
    );
  };

  const isAlt = alternateRowColors && index % 2 === 1;

  return (
    <TouchableOpacity
      style={styles.tableRowContainer}
      onPress={handleRowPress}
      disabled={!onRowPress}
      activeOpacity={0.7}
    >
      {/* Sticky Cell */}
      {stickyColumn && (
        <View
          style={[
            styles.stickyDataCell,
            { height: dataRowHeight },
            isAlt && styles.rowAlt,
          ]}
        >
          {stickyColumn.render ? (
            stickyColumn.render(getCellValue(stickyColumn.key as string), row, index)
          ) : (
            <Text style={styles.itemNameText} numberOfLines={1}>
              {getCellValue(stickyColumn.key as string)?.toString() ?? '-'}
            </Text>
          )}
        </View>
      )}

      {/* Scrollable Cells */}
      <ScrollView
        ref={rowScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        contentOffset={{ x: scrollX.current, y: 0 }}
        style={styles.scrollableRowArea}
      >
        <View style={[styles.dataRow, { height: dataRowHeight }, isAlt && styles.rowAlt]}>
          {scrollableColumns.map((column) => {
            const value = getCellValue(column.key as string);
            const cellStyle = column.getCellStyle?.(value, row);
            return (
              <View
                key={column.key as string}
                style={[
                  styles.dataCell,
                  { width: column.width || FIORI_DATA_TABLE.dimensions.columnMinWidth },
                  cellStyle,
                ]}
              >
                {renderCellContent(column)}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </TouchableOpacity>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function FioriDataTableComponent<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  stickyFirstColumn = true,
  alternateRowColors = true,
  headerRowHeight = FIORI_DATA_TABLE.dimensions.headerRowHeight,
  dataRowHeight = FIORI_DATA_TABLE.dimensions.dataRowHeight,
  onRowPress,
  sortColumn,
  sortDirection,
  onSort,
  loading = false,
  loadingMore = false,
  onEndReached,
  onEndReachedThreshold = 0.5,
  onRefresh,
  refreshing = false,
  emptyMessage = 'No data available',
  accessibilityLabel = 'Data table',
}: FioriDataTableProps<T>) {
  const horizontalScrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const flatListRef = useRef<FlatList<T>>(null);

  // Separate sticky column from scrollable columns
  const { stickyColumn, scrollableColumns } = useMemo(() => {
    if (stickyFirstColumn && columns.length > 0) {
      return {
        stickyColumn: { ...columns[0], sticky: true },
        scrollableColumns: columns.slice(1),
      };
    }
    return { stickyColumn: null, scrollableColumns: columns };
  }, [columns, stickyFirstColumn]);

  // Handle sort header press
  const handleSortPress = useCallback((columnKey: string) => {
    if (onSort) {
      Vibration.vibrate(5);
      onSort(columnKey);
    }
  }, [onSort]);

  // Handle horizontal scroll
  const handleHorizontalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = event.nativeEvent.contentOffset.x;
    // Force re-render to sync row scrolls
    flatListRef.current?.recordInteraction();
  }, []);

  // Render sort icon
  const renderSortIcon = useCallback((columnKey: string, sortable?: boolean) => {
    if (!sortable) return null;
    const isActive = sortColumn === columnKey;
    const iconName = isActive
      ? (sortDirection === 'asc' ? 'arrow-up' : 'arrow-down')
      : 'sort';
    return (
      <Icon name={iconName} size={14} color={isActive ? colors.primary : colors.textTertiary} />
    );
  }, [sortColumn, sortDirection]);

  // Render header cell
  const renderHeaderCell = useCallback((column: FioriDataTableColumn<T>, isSticky = false) => {
    const cellStyle = isSticky
      ? [styles.stickyHeaderCell, { height: headerRowHeight }]
      : [styles.headerCell, { width: column.width || FIORI_DATA_TABLE.dimensions.columnMinWidth }];

    const content = (
      <View style={cellStyle}>
        <Text style={styles.headerCellText}>{column.label}</Text>
        {renderSortIcon(column.key as string, column.sortable)}
      </View>
    );

    if (column.sortable && onSort) {
      return (
        <TouchableOpacity
          key={column.key as string}
          onPress={() => handleSortPress(column.key as string)}
          activeOpacity={0.7}
        >
          {content}
        </TouchableOpacity>
      );
    }
    return <View key={column.key as string}>{content}</View>;
  }, [renderSortIcon, handleSortPress, onSort, headerRowHeight]);

  // Render row item
  const renderItem = useCallback(({ item, index }: { item: T; index: number }) => (
    <TableRow
      row={item}
      index={index}
      stickyColumn={stickyColumn}
      scrollableColumns={scrollableColumns}
      dataRowHeight={dataRowHeight}
      alternateRowColors={alternateRowColors}
      onRowPress={onRowPress}
      scrollX={scrollX}
      horizontalScrollRef={horizontalScrollRef}
    />
  ), [stickyColumn, scrollableColumns, dataRowHeight, alternateRowColors, onRowPress]);

  // Render footer
  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.footerLoaderText}>Loading more...</Text>
      </View>
    );
  }, [loadingMore]);

  // Empty state
  if (!loading && data.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Icon name="table-off" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLabel={accessibilityLabel}>
      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Header Row */}
      <View style={styles.headerContainer}>
        {/* Sticky Header Cell */}
        {stickyColumn && renderHeaderCell(stickyColumn, true)}

        {/* Scrollable Header Cells */}
        <ScrollView
          ref={horizontalScrollRef}
          horizontal
          showsHorizontalScrollIndicator={true}
          bounces={false}
          onScroll={handleHorizontalScroll}
          scrollEventThrottle={16}
          style={styles.scrollableHeaderArea}
        >
          <View style={[styles.headerRow, { height: headerRowHeight }]}>
            {scrollableColumns.map((column) => renderHeaderCell(column, false))}
          </View>
        </ScrollView>
      </View>

      {/* Data Rows */}
      <FlatList
        ref={flatListRef}
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListFooterComponent={renderFooter}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
          ) : undefined
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        showsVerticalScrollIndicator={true}
        getItemLayout={(_, index) => ({
          length: dataRowHeight,
          offset: dataRowHeight * index,
          index,
        })}
      />
    </View>
  );
}

// Memoized export
export const FioriDataTable = React.memo(FioriDataTableComponent) as typeof FioriDataTableComponent;

export default FioriDataTable;
