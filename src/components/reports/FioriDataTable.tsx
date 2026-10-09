/**
 * SAP Fiori Data Table (reports/ import path).
 *
 * The app has one data table, `components/FioriDataTable`
 * (docs/STYLE_GUIDE.md §13.7). This path keeps its original API for report
 * screens: the first column is pinned, the table takes the height of its rows
 * (for use inside a scrolling report) and sits in a hairline frame.
 */
import React from 'react';
import {
  FioriDataTable as BaseDataTable,
  type FioriDataTableColumn,
  type FioriDataTableProps,
} from '../FioriDataTable';

export type DataTableColumn = FioriDataTableColumn<Record<string, any>>;

export type DataTableProps = FioriDataTableProps<Record<string, any>>;

export const FioriDataTable: React.FC<DataTableProps> = ({
  fillHeight = false,
  framed = true,
  ...props
}) => <BaseDataTable<Record<string, any>> fillHeight={fillHeight} framed={framed} {...props} />;

export default FioriDataTable;
