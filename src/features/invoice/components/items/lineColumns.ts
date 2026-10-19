/**
 * The column model of an open card's line table (style guide 13.7): Dispatch | Charge (₹) |
 * (Labour | Tax) | Amount (Qty is read under the dispatch number), described with the app's TanStack setup (`createAppColumnHelper`, `useAppTable`).
 * TanStack decides the headings, the widths (column meta) and which cells a row has. The rows are not
 * drawn by `DataTable`: they are parts of the page's virtualized list (`LineRow`, `ColumnHeadings`), which
 * read the columns from here, so an open card of hundreds of lines still draws only the rows on screen.
 */
import { createAppColumnHelper, type AppTable } from '@/components/table/appTable';
import { t as tr } from '@/i18n';
import type { InvoiceItemData } from '@/types/invoice.types';
import type { ItemsWidths } from './itemsLayout';
import { fieldHeading } from './itemsModel';

export type LineColumnId = 'dispatch' | 'charge' | 'labour_rate' | 'tax' | 'amount';

/** What a part of the list needs to know of one column. */
export interface LineColumn {
  id: LineColumnId;
  header: string;
  /** 'grow' takes the rest of the row (Dispatch); a number is the width in dp. */
  width: 'grow' | number;
  numeric: boolean;
}

const helper = createAppColumnHelper<InvoiceItemData>();

/** The columns for a group whose lines show their own Labour and Tax (`perLine`) or not; Labour is left out of a one-time GRN. */
export function lineColumnDefs(widths: ItemsWidths, perLine: boolean, oneTime: boolean) {
  const cols = [
    helper.display({ id: 'dispatch', header: tr('common.dispatch'), meta: { width: 'grow' } }),
    helper.display({ id: 'charge', header: fieldHeading('charge'), meta: { width: widths.charge, numeric: true } }),
  ];
  if (perLine && !oneTime) {
    cols.push(helper.display({ id: 'labour_rate', header: fieldHeading('labour_rate'), meta: { width: widths.labour, numeric: true } }));
  }
  if (perLine) cols.push(helper.display({ id: 'tax', header: fieldHeading('tax'), meta: { width: widths.tax, numeric: true } }));
  cols.push(helper.display({ id: 'amount', header: tr('invoice.items.colAmount'), meta: { width: widths.amount, numeric: true } }));
  return helper.columns(cols);
}

/** The table's leaf columns, in order, as the list parts read them. */
export function lineColumnsOf(table: AppTable<InvoiceItemData>): LineColumn[] {
  return table.getAllLeafColumns().map((column) => {
    const meta = column.columnDef.meta;
    return {
      id: column.id as LineColumnId,
      header: typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id,
      width: typeof meta?.width === 'number' ? meta.width : 'grow',
      numeric: !!meta?.numeric,
    };
  });
}
