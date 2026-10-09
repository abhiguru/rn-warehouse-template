/**
 * FioriDataTable - the one data table of the app (docs/STYLE_GUIDE.md §13.7).
 *
 * `fiori/FioriDataTable` and `reports/FioriDataTable` are thin wrappers around
 * this component, so all three import paths render the same table.
 *
 * - Header: footnote 600 in text.secondary on background.base, separator below.
 *   Sortable columns show a sort icon and announce the current order.
 * - Body: subhead in text.primary, rows at least 44 high (36 for read-only
 *   compact tables), divider between rows, no alternate shading.
 * - Numbers are right-aligned with tabular figures; text is left-aligned.
 * - Optional totals row in weight 600 with a separator above.
 * - Pinned (sticky) columns stay put while the rest scrolls horizontally;
 *   a fade shows at the scroll edge while more columns are hidden.
 * - Editable cells use GhostTextInput.
 *
 * Two layouts: `fillHeight` (default) fills its parent and scrolls vertically
 * with a virtualised list, pull to refresh and infinite scroll; with
 * `fillHeight={false}` the table takes the height of its rows, for use inside
 * a scrolling screen.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize } from '@/theme/tokens';
import { formatCurrency } from '@/utils/formatters';
import { GhostTextInput } from './GhostTextInput';
import { FIORI_DATA_TABLE, makeDataTableStyles, type DataTableStyles } from './FioriDataTable.styles';

// ============================================================================
// TYPES
// ============================================================================

export type FioriDataTableDataType =
  | 'text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'time'
  | 'duration';

export interface FioriDataTableColumn<T> {
  key: keyof T | string;
  label: string;
  width?: number;
  minWidth?: number;
  /** Pin this column on the left while the others scroll. */
  sticky?: boolean;
  /** Defaults to right for number, currency and percent columns, else left. */
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  /** Editable when the table's `editable` is also set. */
  editable?: boolean;
  dataType?: FioriDataTableDataType;
  /** Custom cell content. */
  render?: (value: any, row: T, index: number) => React.ReactNode;
  /** Alias of `render` (fiori/FioriDataTable API). */
  renderCell?: (value: any, row: T, index: number) => React.ReactNode;
  /** Custom header content. */
  renderHeader?: () => React.ReactNode;
  getCellStyle?: (value: any, row: T) => ViewStyle;
  getTextStyle?: (value: any, row: T) => TextStyle;
}

export interface FioriDataTableProps<T> {
  columns: FioriDataTableColumn<T>[];
  data: T[];
  /** Defaults to the row index. */
  keyExtractor?: (item: T, index: number) => string;

  // Layout
  /** Pin the first column. Columns with `sticky: true` are always pinned. */
  stickyFirstColumn?: boolean;
  /** Show the header row (default true). */
  stickyHeader?: boolean;
  /** @deprecated Alternate shading is not used (§13.7); ignored. */
  alternateRowColors?: boolean;
  /** Fill the parent and scroll vertically (default true). */
  fillHeight?: boolean;
  /** Draw a hairline frame with card corners around the table. */
  framed?: boolean;
  /** Read-only rows of 36 (ignored when rows are interactive). */
  compact?: boolean;
  /** Show a leading row-number column. */
  showRowNumbers?: boolean;

  // Dimensions
  headerRowHeight?: number;
  dataRowHeight?: number;

  // Interactions
  onRowPress?: (row: T, index: number) => void;

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
  onSort?: (columnKey: string) => void;

  // Loading states
  loading?: boolean;
  loadingMore?: boolean;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing?: boolean;

  // Totals
  /** Values for a totals row, by column key. */
  totals?: Partial<Record<string, React.ReactNode>>;

  // Empty state
  emptyMessage?: string;

  // Footer below the table
  renderFooter?: () => React.ReactNode;

  // Accessibility
  accessibilityLabel?: string;
}

type Row = Record<string, any>;
type Column = FioriDataTableColumn<Row>;

const D = FIORI_DATA_TABLE.dimensions;
const NUMERIC_TYPES: FioriDataTableDataType[] = ['number', 'currency', 'percent'];
const ROW_NUMBER_KEY = '__rowNumber';
const SKELETON_ROWS = 5;
const FADE_STEPS = [0.15, 0.4, 0.7, 0.9];

const isNumericColumn = (column: Column) =>
  column.dataType !== undefined && NUMERIC_TYPES.includes(column.dataType);

const columnAlign = (column: Column): 'left' | 'center' | 'right' =>
  column.align ?? (isNumericColumn(column) ? 'right' : 'left');

const columnWidth = (column: Column, pinned: boolean) =>
  column.width || column.minWidth || (pinned ? D.stickyColumnWidth : D.columnMinWidth);

const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** Display text for a plain cell value (§12.3 formats). */
export function formatCellValue(value: unknown, dataType?: FioriDataTableDataType): string {
  if (value === null || value === undefined || value === '') return '-';
  if (dataType === 'currency') {
    const amount = Number(value);
    return Number.isFinite(amount) ? formatCurrency(amount, { minimumFractionDigits: 2 }) : String(value);
  }
  if (dataType === 'percent') return `${value}%`;
  if (dataType === 'number' && typeof value === 'number') return numberFormat.format(value);
  return String(value);
}

// ============================================================================
// COMPONENT
// ============================================================================

function FioriDataTableComponent<T extends Record<string, any>>(props: FioriDataTableProps<T>) {
  const {
    columns: rawColumns,
    data: rawData,
    keyExtractor: rawKeyExtractor,
    stickyFirstColumn = true,
    stickyHeader = true,
    fillHeight = true,
    framed = false,
    compact = false,
    showRowNumbers = false,
    headerRowHeight = D.headerRowHeight,
    dataRowHeight,
    onRowPress: rawOnRowPress,
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
    loading = false,
    loadingMore = false,
    onEndReached,
    onEndReachedThreshold = 0.5,
    onRefresh,
    refreshing = false,
    totals,
    emptyMessage = 'No data to show.',
    renderFooter,
    accessibilityLabel = 'Data table',
  } = props;

  // The implementation works on plain rows; the public API stays generic.
  const columns = rawColumns as unknown as Column[];
  const data = rawData as unknown as Row[];
  const onRowPress = rawOnRowPress as unknown as ((row: Row, index: number) => void) | undefined;
  const keyExtractor = useCallback(
    (row: Row, index: number) =>
      rawKeyExtractor ? rawKeyExtractor(row as T, index) : String(index),
    [rawKeyExtractor]
  );

  const styles = useThemedStyles(makeDataTableStyles);
  const t = useTokens();

  const interactive = selectable || !!onRowPress || (editable && columns.some(c => c.editable));
  const rowHeight =
    dataRowHeight ??
    (interactive ? D.interactiveRowHeight : compact ? D.compactRowHeight : D.dataRowHeight);

  // Pinned columns: explicitly sticky ones, else the first when stickyFirstColumn
  const { pinnedColumns, scrollColumns } = useMemo(() => {
    const explicit = columns.filter(c => c.sticky);
    let pinned: Column[];
    let rest: Column[];
    if (explicit.length > 0) {
      pinned = explicit;
      rest = columns.filter(c => !c.sticky);
    } else if (stickyFirstColumn && columns.length > 1) {
      pinned = [columns[0]];
      rest = columns.slice(1);
    } else {
      pinned = [];
      rest = columns;
    }
    if (showRowNumbers) {
      const rowNumber: Column = { key: ROW_NUMBER_KEY, label: '#', width: D.controlColumnWidth, align: 'right' };
      if (pinned.length > 0) pinned = [rowNumber, ...pinned];
      else rest = [rowNumber, ...rest];
    }
    return { pinnedColumns: pinned, scrollColumns: rest };
  }, [columns, stickyFirstColumn, showRowNumbers]);

  const hasPinned = pinnedColumns.length > 0 || (selectable && columns.length > 0);
  const pinnedWidth =
    pinnedColumns.reduce((sum, c) => sum + columnWidth(c, true), 0) + (selectable ? D.controlColumnWidth : 0);

  // ---------------------------------------------------------------------------
  // Pressed row (shared by the pinned and scrolling halves of a row)
  // ---------------------------------------------------------------------------
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const handleRowPress = useCallback(
    (row: Row, index: number, rowId: string) => {
      if (selectable && onSelectionChange) {
        if (multiSelect) {
          onSelectionChange(
            selectedIds.includes(rowId) ? selectedIds.filter(id => id !== rowId) : [...selectedIds, rowId]
          );
        } else {
          onSelectionChange(selectedIds.includes(rowId) ? [] : [rowId]);
        }
        return;
      }
      onRowPress?.(row, index);
    },
    [selectable, onSelectionChange, multiSelect, selectedIds, onRowPress]
  );

  const handleCellChange = useCallback(
    (rowId: string, columnKey: string, text: string, dataType?: FioriDataTableDataType) => {
      if (!onCellEdit) return;
      const value = dataType && NUMERIC_TYPES.includes(dataType) ? parseFloat(text) || 0 : text;
      onCellEdit(rowId, columnKey, value);
    },
    [onCellEdit]
  );

  const noSuggestion = useCallback(async () => null, []);

  // ---------------------------------------------------------------------------
  // Horizontal scroll edge fade
  // ---------------------------------------------------------------------------
  const [hScroll, setHScroll] = useState({ x: 0, width: 0, content: 0 });
  const onHScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setHScroll(s => (Math.abs(s.x - x) < 1 ? s : { ...s, x }));
  }, []);
  const onHLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setHScroll(s => (s.width === width ? s : { ...s, width }));
  }, []);
  const onHContentSize = useCallback((content: number) => {
    setHScroll(s => (s.content === content ? s : { ...s, content }));
  }, []);
  const showFade = hScroll.width > 0 && hScroll.x + hScroll.width < hScroll.content - 1;

  // Vertical offset shared with the pinned column (fill layout)
  const scrollY = useRef(new Animated.Value(0)).current;
  const pinnedTranslate = useMemo(() => Animated.multiply(scrollY, -1), [scrollY]);
  const onVScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY]
  );

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------
  const sortLabel = (column: Column) => {
    if (sortColumn !== column.key) return `${column.label}, not sorted`;
    return `${column.label}, sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'}`;
  };

  const renderHeaderCell = (column: Column, pinned: boolean) => {
    const width = columnWidth(column, pinned);
    const align = columnAlign(column);
    const isSorted = sortColumn === column.key;
    const canSort = !!column.sortable && !!onSort;
    const key = String(column.key);
    const cellStyle = [
      styles.headerCell,
      align === 'right' && styles.headerCellAlignRight,
      align === 'center' && styles.headerCellAlignCenter,
      { width, height: headerRowHeight },
    ];
    const content = column.renderHeader ? (
      column.renderHeader()
    ) : (
      <>
        <Text style={styles.headerCellText} numberOfLines={2}>
          {column.label}
        </Text>
        {column.sortable && (
          <Icon
            name={isSorted ? (sortDirection === 'asc' ? 'arrow-up' : 'arrow-down') : 'sort'}
            size={iconSize.sm}
            color={isSorted ? t.brand.tint : t.icon.secondary}
          />
        )}
      </>
    );

    if (canSort) {
      return (
        <Pressable
          key={key}
          style={({ pressed }) => [cellStyle, pressed && styles.headerCellPressed]}
          onPress={() => onSort?.(key)}
          accessibilityRole="button"
          accessibilityLabel={sortLabel(column)}
          accessibilityHint="Changes the sort order"
        >
          {content}
        </Pressable>
      );
    }
    return (
      <View
        key={key}
        style={cellStyle}
        accessibilityRole="header"
        accessibilityLabel={key === ROW_NUMBER_KEY ? 'Row number' : column.label}
      >
        {content}
      </View>
    );
  };

  const renderHeaderRow = (cols: Column[], pinned: boolean) => (
    <View style={[styles.headerRow, { height: headerRowHeight }]}>
      {pinned && selectable && <View style={[styles.controlCell, { height: headerRowHeight }]} />}
      {cols.map(c => renderHeaderCell(c, pinned))}
    </View>
  );

  const renderCell = (column: Column, row: Row, rowIndex: number, rowId: string, pinned: boolean) => {
    const key = String(column.key);
    const width = columnWidth(column, pinned);
    const align = columnAlign(column);
    const alignCell = [
      align === 'right' && styles.dataCellAlignRight,
      align === 'center' && styles.dataCellAlignCenter,
    ];
    const alignText =
      align === 'right' ? styles.dataCellTextRight : align === 'center' ? styles.dataCellTextCenter : styles.dataCellTextLeft;

    if (key === ROW_NUMBER_KEY) {
      return (
        <View key={key} style={[styles.dataCell, styles.dataCellAlignRight, { width }]}>
          <Text style={styles.rowNumberText}>{rowIndex + 1}</Text>
        </View>
      );
    }

    const value = row[key];
    const cellStyle = column.getCellStyle?.(value, row);
    const customRender = column.render ?? column.renderCell;
    const numeric = isNumericColumn(column) || typeof value === 'number';
    const textStyle = [
      pinned && pinnedColumns.length > 0 && !numeric ? styles.itemNameText : styles.dataCellText,
      alignText,
      numeric && styles.dataCellNumeric,
      column.getTextStyle?.(value, row),
    ];

    if (customRender) {
      return (
        <View key={key} style={[styles.dataCell, alignCell, { width }, cellStyle]}>
          {customRender(value, row, rowIndex)}
        </View>
      );
    }

    if (editable && column.editable) {
      const isEditing = editingCell?.rowId === rowId && editingCell?.columnKey === key;
      if (isEditing) {
        return (
          <View key={key} style={[styles.dataCell, { width }, cellStyle]}>
            <GhostTextInput
              value={value?.toString() ?? ''}
              onChangeText={text => handleCellChange(rowId, key, text, column.dataType)}
              getSuggestion={noSuggestion}
              keyboardType={isNumericColumn(column) ? 'decimal-pad' : 'default'}
              autoFocus
              selectTextOnFocus
              isFocused
              inputStyle={styles.editInput}
              onBlur={() => onEditingCellChange?.(null)}
              accessibilityLabel={column.label}
            />
          </View>
        );
      }
      return (
        <Pressable
          key={key}
          style={({ pressed }) => [
            styles.dataCell,
            styles.editableCell,
            alignCell,
            { width },
            cellStyle,
            pressed && styles.editableCellPressed,
          ]}
          onPress={() => onEditingCellChange?.({ rowId, columnKey: key })}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${column.label}, ${formatCellValue(value, column.dataType)}`}
        >
          <Text style={textStyle} numberOfLines={1}>
            {formatCellValue(value, column.dataType)}
          </Text>
        </Pressable>
      );
    }

    return (
      <View key={key} style={[styles.dataCell, alignCell, { width }, cellStyle]}>
        <Text style={textStyle} numberOfLines={1}>
          {formatCellValue(value, column.dataType)}
        </Text>
      </View>
    );
  };

  const rowSummary = (row: Row) =>
    columns
      .map(c => {
        const value = row[String(c.key)];
        return value === null || value === undefined || typeof value === 'object'
          ? null
          : `${c.label} ${formatCellValue(value, c.dataType)}`;
      })
      .filter(Boolean)
      .join(', ');

  const renderRowPart = (row: Row, rowIndex: number, cols: Column[], pinned: boolean, carriesLabel: boolean) => {
    const rowId = keyExtractor(row, rowIndex);
    const isSelected = selectedIds.includes(rowId);
    const rowStyle = [
      styles.dataRow,
      { height: rowHeight },
      isSelected && styles.rowSelected,
      pressedKey === rowId && styles.rowPressed,
    ];
    const children = (
      <>
        {pinned && selectable && (
          <View style={[styles.controlCell, { height: rowHeight }]}>
            <Icon
              name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={iconSize.lg}
              color={isSelected ? t.brand.tint : t.border.field}
            />
          </View>
        )}
        {cols.map(c => renderCell(c, row, rowIndex, rowId, pinned))}
      </>
    );

    const a11y = carriesLabel
      ? { accessible: true, accessibilityLabel: rowSummary(row) }
      : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

    if (selectable || onRowPress) {
      return (
        <Pressable
          key={rowId}
          style={rowStyle}
          onPress={() => handleRowPress(row, rowIndex, rowId)}
          onPressIn={() => setPressedKey(rowId)}
          onPressOut={() => setPressedKey(null)}
          accessibilityRole={selectable ? 'checkbox' : 'button'}
          accessibilityState={selectable ? { checked: isSelected } : undefined}
          {...a11y}
        >
          {children}
        </Pressable>
      );
    }
    return (
      <View key={rowId} style={rowStyle} {...a11y}>
        {children}
      </View>
    );
  };

  const renderTotalsPart = (cols: Column[], pinned: boolean) => {
    if (!totals) return null;
    return (
      <View style={[styles.totalsRow, { height: rowHeight }]}>
        {pinned && selectable && <View style={styles.controlCell} />}
        {cols.map(column => {
          const key = String(column.key);
          const width = columnWidth(column, pinned);
          const value = totals[key];
          const align = columnAlign(column);
          return (
            <View
              key={key}
              style={[
                styles.dataCell,
                align === 'right' && styles.dataCellAlignRight,
                align === 'center' && styles.dataCellAlignCenter,
                { width },
              ]}
            >
              {React.isValidElement(value) ? (
                value
              ) : value === undefined || value === null ? null : (
                <Text
                  style={[
                    styles.dataCellText,
                    styles.totalsText,
                    styles.dataCellNumeric,
                    align === 'right' && styles.dataCellTextRight,
                  ]}
                  numberOfLines={1}
                >
                  {typeof value === 'string' || typeof value === 'number'
                    ? formatCellValue(value, column.dataType)
                    : value}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderLoadingMore = () =>
    loadingMore ? (
      <View style={[styles.footerLoader, { height: rowHeight }]}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>Loading more…</Text>
      </View>
    ) : null;

  const fade = showFade ? (
    <View style={styles.fade} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      {FADE_STEPS.map(opacity => (
        <View key={opacity} style={[styles.fadeStep, { opacity }]} />
      ))}
    </View>
  ) : null;

  const containerStyle = [fillHeight ? styles.container : styles.contentContainer, framed && styles.framed];

  // ---------------------------------------------------------------------------
  // Loading (first page) and empty states
  // ---------------------------------------------------------------------------
  if (data.length === 0) {
    if (loading) {
      return (
        <View
          style={containerStyle}
          accessible
          accessibilityLabel={`${accessibilityLabel}, loading`}
          accessibilityState={{ busy: true }}
        >
          {stickyHeader && (
            <View style={[styles.headerRow, { height: headerRowHeight }]}>
              {columns.slice(0, 3).map(c => (
                <View key={String(c.key)} style={[styles.headerCell, { flex: 1, height: headerRowHeight }]}>
                  <Text style={styles.headerCellText} numberOfLines={1}>
                    {c.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <View key={i} style={[styles.skeletonRow, { height: rowHeight }]}>
              <View style={[styles.skeletonBlock, { flex: 2 }]} />
              <View style={[styles.skeletonBlock, { flex: 1 }]} />
              <View style={[styles.skeletonBlock, { flex: 1 }]} />
            </View>
          ))}
        </View>
      );
    }
    return (
      <View style={[containerStyle, styles.emptyContainer]} accessible accessibilityLabel={emptyMessage}>
        <Icon name="table-off" size={iconSize.xl} color={t.icon.secondary} />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const reloading = loading ? (
    <View style={styles.loadingOverlay} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <ActivityIndicator size="small" color={t.brand.tint} />
      <Text style={styles.loadingText}>Loading…</Text>
    </View>
  ) : null;

  const footerSpacerHeight = loadingMore ? rowHeight : 0;

  // ---------------------------------------------------------------------------
  // Fill layout: virtualised list, pinned column follows the vertical scroll
  // ---------------------------------------------------------------------------
  if (fillHeight) {
    return (
      <View style={containerStyle} accessibilityLabel={accessibilityLabel}>
        {reloading}
        <View style={[styles.tableBody, styles.tableBodyFill]}>
          {hasPinned && (
            <View style={[styles.stickyColumn, { width: pinnedWidth }]}>
              {stickyHeader && renderHeaderRow(pinnedColumns, true)}
              <View style={styles.stickyBodyClip}>
                <Animated.View style={{ transform: [{ translateY: pinnedTranslate }] }}>
                  {data.map((row, i) => renderRowPart(row, i, pinnedColumns, true, true))}
                  {renderTotalsPart(pinnedColumns, true)}
                  {footerSpacerHeight > 0 && <View style={{ height: footerSpacerHeight }} />}
                </Animated.View>
              </View>
            </View>
          )}
          <View style={styles.scrollableArea}>
            <ScrollView
              horizontal
              bounces={false}
              showsHorizontalScrollIndicator
              onScroll={onHScroll}
              scrollEventThrottle={32}
              onLayout={onHLayout}
              onContentSizeChange={onHContentSize}
              contentContainerStyle={styles.scrollableContent}
            >
              <View style={styles.scrollableInner}>
                {stickyHeader && renderHeaderRow(scrollColumns, false)}
                <Animated.FlatList
                  style={styles.list}
                  data={data}
                  extraData={[pressedKey, selectedIds, editingCell]}
                  keyExtractor={keyExtractor}
                  renderItem={({ item, index }: { item: Row; index: number }) =>
                    renderRowPart(item, index, scrollColumns, false, !hasPinned)
                  }
                  getItemLayout={(_: unknown, index: number) => ({
                    length: rowHeight,
                    offset: rowHeight * index,
                    index,
                  })}
                  onScroll={onVScroll}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator
                  ListFooterComponent={
                    <>
                      {renderTotalsPart(scrollColumns, false)}
                      {renderLoadingMore()}
                    </>
                  }
                  onEndReached={onEndReached}
                  onEndReachedThreshold={onEndReachedThreshold}
                  refreshControl={
                    onRefresh ? (
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={t.brand.tint}
                        colors={[t.brand.tint]}
                        progressBackgroundColor={t.surface.card}
                      />
                    ) : undefined
                  }
                />
              </View>
            </ScrollView>
            {fade}
          </View>
        </View>
        {renderFooter?.()}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Content layout: the table takes the height of its rows
  // ---------------------------------------------------------------------------
  return (
    <View style={containerStyle} accessibilityLabel={accessibilityLabel}>
      {reloading}
      <View style={styles.tableBody}>
        {hasPinned && (
          <View style={[styles.stickyColumn, { width: pinnedWidth }]}>
            {stickyHeader && renderHeaderRow(pinnedColumns, true)}
            {data.map((row, i) => renderRowPart(row, i, pinnedColumns, true, true))}
            {renderTotalsPart(pinnedColumns, true)}
            {footerSpacerHeight > 0 && <View style={{ height: footerSpacerHeight }} />}
          </View>
        )}
        <View style={styles.scrollableArea}>
          <ScrollView
            horizontal
            bounces={false}
            showsHorizontalScrollIndicator
            onScroll={onHScroll}
            scrollEventThrottle={32}
            onLayout={onHLayout}
            onContentSizeChange={onHContentSize}
            contentContainerStyle={styles.scrollableContent}
          >
            <View style={styles.scrollableInner}>
              {stickyHeader && renderHeaderRow(scrollColumns, false)}
              {data.map((row, i) => renderRowPart(row, i, scrollColumns, false, !hasPinned))}
              {renderTotalsPart(scrollColumns, false)}
              {renderLoadingMore()}
            </View>
          </ScrollView>
          {fade}
        </View>
      </View>
      {renderFooter?.()}
    </View>
  );
}

// Memoized export
export const FioriDataTable = React.memo(FioriDataTableComponent) as typeof FioriDataTableComponent;

export type { DataTableStyles };

export default FioriDataTable;
