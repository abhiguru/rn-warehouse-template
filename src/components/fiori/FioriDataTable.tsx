/**
 * SAP Fiori Data Table (fiori/ import path).
 *
 * The app has one data table, `components/FioriDataTable`
 * (docs/STYLE_GUIDE.md §13.7). This path keeps its original API: only columns
 * marked `sticky` are pinned, the table fills its parent, and selection,
 * inline editing, sorting and a footer are supported.
 */
import React from 'react';
import {
  FioriDataTable as BaseDataTable,
  type FioriDataTableColumn,
  type FioriDataTableProps,
} from '../FioriDataTable';

export type DataTableColumn = FioriDataTableColumn<Record<string, any>>;

export type DataTableProps = FioriDataTableProps<Record<string, any>>;

export const FioriDataTable: React.FC<DataTableProps> = ({ stickyFirstColumn = false, ...props }) => (
  <BaseDataTable<Record<string, any>> stickyFirstColumn={stickyFirstColumn} {...props} />
);

export default FioriDataTable;
