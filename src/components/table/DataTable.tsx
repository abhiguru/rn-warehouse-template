/**
 * The app's one table renderer (style guide §13.7). It draws a TanStack Table built with `useAppTable` (appTable.ts)
 * in the shared table styles of `common/DetailTable`: React Native has no <table>, so the header group, the row model
 * and the cells (`table.FlexRender`) become Views.
 *
 * - `variant="card"`: an object-page table, header and footer in the card, `list="flat"` a FlatList for a tab's long
 *   list or `list="map"` inside a parent ScrollView.
 * - `variant="nested"`: a table inside another table's open row, or inside a form.
 * - Expanding: a row that `getCanExpand()` is a button with a chevron; open, its `renderDetail` panel shows under it
 *   in one shaded group with the accent bar (OpenBar), as before.
 * - Sorting: a column with `enableSorting: true` has a pressable header with an arrow; TalkBack says the column and
 *   whether it is sorted. The cycle is not sorted → ascending → descending. Footers stay totals of every row.
 * - A table with rows that open something (`renderDetail` or `onRowPress`) draws a row that cannot (no dispatches yet,
 *   no invoice id) as a disabled button, as the hand-written tables did; `rowPressable` says which rows can press.
 *
 * Column layout comes from the column meta: `width` ('grow' or dp) and `numeric`. A table that stacks columns at
 * large text builds the narrower column set itself (and puts the moved figure in the item cell).
 */
import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Pressable,
  View,
  type AccessibilityProps,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { HeaderCell, OpenBar, RowChevron, makeTableStyles } from '@/components/common/DetailTable';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { iconSize, space, touchTarget, type ThemeTokens } from '@/theme/tokens';
import { functionalUpdate, type ExpandedState, type RowData, type Updater } from '@tanstack/react-table';
import type { AppColumnMeta, AppRow, AppTable } from './appTable';

/** One TalkBack action (React Native's strict TypeScript API does not export `AccessibilityActionInfo`). */
type AccessibilityActionInfo = NonNullable<AccessibilityProps['accessibilityActions']>[number];

export interface DataTableProps<TData extends RowData> {
  table: AppTable<TData>;
  variant?: 'card' | 'nested';
  list?: 'flat' | 'map';
  /** The detail panel of an open row (rows that `getCanExpand()`). */
  renderDetail?: (row: AppRow<TData>) => ReactNode;
  /** A row that does not expand opens something when pressed (an invoice, a dispatch). */
  onRowPress?: (row: AppRow<TData>) => void;
  /** False for a row that cannot open anything (an invoice without an id); default: every row can. */
  rowPressable?: (row: AppRow<TData>) => boolean;
  /** TalkBack actions of the row as one element (the row itself does nothing when pressed). */
  rowActions?: (row: AppRow<TData>) => AccessibilityActionInfo[] | undefined;
  onRowAction?: (row: AppRow<TData>, actionName: string) => void;
  /** Extra style of every row (a compact row). */
  rowStyle?: StyleProp<ViewStyle>;
  /** The row as one TalkBack element. */
  rowLabel?: (row: AppRow<TData>) => string;
  rowHint?: (row: AppRow<TData>) => string | undefined;
  rowTestID?: (row: AppRow<TData>) => string;
  detailTestID?: (row: AppRow<TData>) => string;
  /** Shown above the header inside the list (a count heading). */
  above?: ReactNode;
  /** The totals row (and anything after it), inside the card's bottom. */
  footer?: ReactNode;
  /** Show the chevron column even when no row can expand (keeps a table's columns where they were). */
  chevronColumn?: boolean;
  testID?: string;
  /** Extra style of the card of `list="map"`. */
  style?: StyleProp<ViewStyle>;
  /** Every heading on one line; default: in a nested table. A column's `meta.headerOneLine` wins. */
  headerOneLine?: boolean;
  /** No heading row (nested only): a two-column list of label and amount whose labels need no heading (the Invoices list card). */
  hideHeader?: boolean;
  flatListProps?: Partial<FlatListProps<AppRow<TData>>>;
}

const makeStyles = (th: ThemeTokens) => ({
  sortable: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xxs, minHeight: touchTarget, marginVertical: -space.sm },
  sortableNumeric: { justifyContent: 'flex-end' as const },
  sortIcon: { color: th.brand.tint },
});

const widthStyle = (meta: AppColumnMeta | undefined, grow: object) => {
  const size = meta?.width === 'grow' || meta?.width === undefined ? grow : meta.width === 'auto' ? undefined : { width: meta.width };
  return meta?.marginLeft ? [size, { marginLeft: meta.marginLeft }] : size;
};

/** The ids of the rows that are open by themselves until the user flips them. */
const openOf = (defaults: ReadonlySet<string>, flipped: ReadonlySet<string>): Record<string, boolean> => {
  const open: Record<string, boolean> = {};
  defaults.forEach(id => {
    if (!flipped.has(id)) open[id] = true;
  });
  flipped.forEach(id => {
    if (!defaults.has(id)) open[id] = true;
  });
  return open;
};

/**
 * The expanded state of a table whose start state follows its data: `defaultOpen` rows are open until the user
 * closes them, any other row is closed until the user opens it. `initialState.expanded` is read once, when the table
 * is made, but "the first line with dispatches", "a lone group" change when the data arrives or is read again, and a
 * row the user has flipped stays flipped across that. Spread the result into `useAppTable`.
 */
export function useDefaultOpen(defaultOpen: readonly string[]) {
  const key = defaultOpen.join('\u0000');
  const defaults = useMemo<ReadonlySet<string>>(() => new Set(defaultOpen), [key]);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const expanded = useMemo(() => openOf(defaults, flipped), [defaults, flipped]);
  const onExpandedChange = useCallback(
    (updater: Updater<ExpandedState>) =>
      setFlipped(current => {
        const next = functionalUpdate(updater, openOf(defaults, current));
        const isOpen = (id: string) => next === true || next[id] === true;
        const ids = new Set<string>([...defaults, ...current, ...(next === true ? [] : Object.keys(next))]);
        const flips = new Set<string>();
        ids.forEach(id => {
          if (isOpen(id) !== defaults.has(id)) flips.add(id);
        });
        return flips;
      }),
    [defaults]
  );
  return { state: { expanded }, onExpandedChange };
}

export function DataTable<TData extends RowData>({
  table,
  variant = 'card',
  list = 'map',
  renderDetail,
  onRowPress,
  rowPressable,
  rowActions,
  onRowAction,
  rowStyle,
  rowLabel,
  rowHint,
  rowTestID,
  detailTestID,
  above,
  footer,
  chevronColumn,
  testID,
  style,
  headerOneLine,
  hideHeader,
  flatListProps,
}: DataTableProps<TData>) {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const th = useTokens();
  const rows = table.getRowModel().rows;
  const nested = variant === 'nested';
  const map = !nested && list === 'map';
  // A table with rows that open something draws the rows that cannot as disabled buttons.
  const interactive = !!renderDetail || !!onRowPress;
  const showChevron = !nested && (chevronColumn ?? rows.some(r => r.getCanExpand()));

  const header = hideHeader ? null : table.getHeaderGroups().map(group => (
    <View key={group.id} style={nested ? styles.nestedHeader : styles.headerRow}>
      {showChevron ? <RowChevron expandable={false} expanded={false} /> : null}
      {group.headers.map(h => {
        const meta = h.column.columnDef.meta as AppColumnMeta | undefined;
        const text = typeof h.column.columnDef.header === 'string' ? h.column.columnDef.header : meta?.label ?? h.column.id;
        const cell = <HeaderCell numeric={meta?.numeric} oneLine={meta?.headerOneLine ?? headerOneLine ?? nested} style={h.column.getCanSort() ? undefined : widthStyle(meta, styles.grow)}>{text}</HeaderCell>;
        if (!h.column.getCanSort()) return <React.Fragment key={h.id}>{cell}</React.Fragment>;
        const sorted = h.column.getIsSorted();
        const state = sorted === 'asc' ? t('common.table.sortedAsc') : sorted === 'desc' ? t('common.table.sortedDesc') : t('common.table.notSorted');
        return (
          <Pressable
            key={h.id}
            style={[widthStyle(meta, styles.grow), own.sortable, meta?.numeric && own.sortableNumeric]}
            onPress={() => h.column.toggleSorting()}
            accessibilityRole="button"
            accessibilityLabel={t('common.table.sortBy', { column: meta?.label ?? text, state })}
            testID={`${testID ?? 'table'}-sort-${h.column.id}`}
          >
            {cell}
            <Icon name={sorted === 'asc' ? 'arrow-up' : sorted === 'desc' ? 'arrow-down' : 'swap-vertical'} size={iconSize.xs} color={sorted ? th.brand.tint : th.icon.secondary} />
          </Pressable>
        );
      })}
    </View>
  ));

  const cells = (row: AppRow<TData>) =>
    row
      .getAllCells()
      .filter(cell => !(cell.column.columnDef.meta as AppColumnMeta | undefined)?.headerOnly)
      .map(cell => (
        <View key={cell.id} style={widthStyle(cell.column.columnDef.meta as AppColumnMeta | undefined, styles.grow)}>
          <table.FlexRender cell={cell} />
        </View>
      ));

  const renderRow = (row: AppRow<TData>, index: number) => {
    const expandable = row.getCanExpand();
    const open = expandable && row.getIsExpanded();
    const pressable = !expandable && !!onRowPress && (rowPressable?.(row) ?? true);
    if (nested) {
      const rowStyles = [styles.nestedRow, rowStyle, index > 0 && styles.nestedDivider];
      if (!onRowPress) {
        return (
          <View key={row.id} accessible={!!rowLabel} accessibilityLabel={rowLabel?.(row)} testID={rowTestID?.(row)}>
            <View style={rowStyles}>{cells(row)}</View>
          </View>
        );
      }
      return (
        <Pressable
          key={row.id}
          onPress={pressable ? () => onRowPress(row) : undefined}
          disabled={!pressable}
          accessibilityRole={pressable ? 'button' : undefined}
          accessibilityLabel={rowLabel?.(row)}
          accessibilityHint={pressable ? rowHint?.(row) : undefined}
          testID={rowTestID?.(row)}
        >
          {({ pressed }) => <View style={[rowStyles, pressed && pressable && styles.rowPressed]}>{cells(row)}</View>}
        </Pressable>
      );
    }
    const press = expandable
      ? () => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          row.toggleExpanded();
        }
      : pressable
        ? () => onRowPress?.(row)
        : undefined;
    const content = (
      <>
        {showChevron ? <RowChevron expandable={expandable} expanded={open} /> : null}
        {cells(row)}
      </>
    );
    const actions = rowActions?.(row);
    const onAction = actions && onRowAction ? (e: { nativeEvent: { actionName: string } }) => onRowAction(row, e.nativeEvent.actionName) : undefined;
    return (
      <View key={row.id} style={[!map && styles.cardSides, open && styles.group]}>
        {interactive ? (
          <Pressable
            onPress={press}
            disabled={!press}
            style={({ pressed }) => [styles.row, rowStyle, open && styles.rowOpen, pressed && styles.rowPressed]}
            accessibilityRole={press ? 'button' : undefined}
            accessibilityLabel={rowLabel?.(row)}
            accessibilityHint={press ? rowHint?.(row) : undefined}
            accessibilityState={expandable ? { expanded: open } : undefined}
            testID={rowTestID?.(row)}
          >
            {content}
          </Pressable>
        ) : (
          <View
            style={[styles.row, rowStyle]}
            accessible={!!rowLabel}
            accessibilityLabel={rowLabel?.(row)}
            accessibilityHint={rowHint?.(row)}
            accessibilityActions={actions}
            onAccessibilityAction={onAction}
            testID={rowTestID?.(row)}
          >
            {content}
          </View>
        )}
        {open && renderDetail ? (
          <View style={styles.details} testID={detailTestID?.(row)}>
            {renderDetail(row)}
          </View>
        ) : null}
        {open ? <OpenBar /> : null}
      </View>
    );
  };

  if (nested) {
    return (
      <View style={[styles.nested, style]} testID={testID}>
        {header}
        {rows.map(renderRow)}
        {footer}
      </View>
    );
  }

  if (map) {
    // One piece: the card draws the outline and the shadow; its parts draw none of their own.
    return (
      <View style={[styles.card, style]} testID={testID}>
        {above}
        {header}
        {rows.map(renderRow)}
        {footer}
      </View>
    );
  }

  const top = (
    <>
      {above}
      <View style={styles.cardTop}>{header}</View>
    </>
  );
  const bottom = <View style={styles.cardBottom}>{footer}</View>;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={row => row.id}
      // A sort or an open row redraws the rows that changed.
      extraData={table.state}
      renderItem={({ item, index }) => renderRow(item, index)}
      ListHeaderComponent={top}
      ListFooterComponent={bottom}
      showsVerticalScrollIndicator={false}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      windowSize={10}
      testID={testID}
      {...flatListProps}
    />
  );
}

export default DataTable;
