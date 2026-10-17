/**
 * The app's one TanStack Table v9 setup (style guide §13.7; owner, 2026-10-17: "apply tanstack to the tables"). Made
 * once at module scope with `createTableHook`, as the package's create-table-hook skill says for tables that share
 * conventions: every detail and report table expands rows, some sort, and all carry the same column meta.
 *
 * - Expanding: a row's detail panel (`getRowCanExpand` per table; the start state via `initialState.expanded`).
 * - Sorting: off unless a column sets `enableSorting: true`; one column at a time; not sorted → ascending → descending.
 * - Column meta: how the shared renderer (`DataTable`) lays a column out.
 *
 * Draw a table with `DataTable`; build its columns with `createAppColumnHelper<Row>()`.
 */
import {
  createExpandedRowModel,
  createSortedRowModel,
  createTableHook,
  metaHelper,
  rowExpandingFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ReactTable,
  type Row,
  type RowData,
} from '@tanstack/react-table';

/** How DataTable lays a column out. */
export interface AppColumnMeta {
  /** 'grow' takes the rest of the row (the item column); a number is a fixed width in dp; 'auto' is the width of its text. */
  width?: 'grow' | 'auto' | number;
  /** Space before the column in dp (a muted column set off from the one before it). */
  marginLeft?: number;
  /**
   * The column has a heading but no cell in the rows: its figure is drawn inside another cell (an amount that
   * moved under the item at large text), the heading stays over the end of the row.
   */
  headerOnly?: boolean;
  /** The heading on one line that shrinks rather than wraps (default: yes in a nested table, no in a card). */
  headerOneLine?: boolean;
  /** Right-aligned number column (header aligned the same way). */
  numeric?: boolean;
  /** The column's name for TalkBack when its header is not plain text, e.g. in the sort label. */
  label?: string;
}

export const appFeatures = tableFeatures({
  columnMeta: metaHelper<AppColumnMeta>(),
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
});

export type AppFeatures = typeof appFeatures;
export type AppTable<TData extends RowData> = ReactTable<AppFeatures, TData, any>;
export type AppRow<TData extends RowData> = Row<AppFeatures, TData>;

export const { useAppTable, createAppColumnHelper } = createTableHook({
  features: appFeatures,
  // Sorting is per column: a table shows sort headers only where a column sets `enableSorting: true`. (The table
  // option `enableSorting: false` would switch every column off, whatever the column says.)
  defaultColumn: { enableSorting: false },
  enableMultiSort: false,
  enableSortingRemoval: true,
  // A tap sorts ascending first, whatever the column's type (a total too).
  sortDescFirst: false,
});
