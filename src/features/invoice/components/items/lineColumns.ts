/**
 * The column model of an open card's line table (style guide 13.7), which scrolls sideways (owner decision, 2026-10-19):
 * Dispatch (pinned) | Date | Months | Days | Qty | Charge (₹) | Labour (₹) | Tax (%) | Amount, described with the app's TanStack
 * setup (`createAppColumnHelper`, `useAppTable`). TanStack decides the headings, the widths (column meta) and which
 * cells a row has; Labour is left out of a one-time GRN. The rows are not drawn by `DataTable`: they are parts of
 * the page's virtualized list (`LineRow`, `ColumnHeadings`), which read the columns from here, so an open card of
 * hundreds of lines still draws only the rows on screen. `lineColumnsOf` also places each scrolling column (its `x`
 * in the scrolling part), which the focus reveal and the clamp of the sideways scroll use.
 */
import { createAppColumnHelper, type AppTable } from '@/components/table/appTable';
import { t as tr } from '@/i18n';
import type { InvoiceItemData } from '@/types/invoice.types';
import { CELL_CHROME, END_GAP, type LineColumnId, type LineWidths } from './itemsLayout';
import { fieldHeading } from './itemsModel';

export type { LineColumnId };

/** What a part of the list needs to know of one column. */
export interface LineColumn {
  id: LineColumnId;
  header: string;
  /** The column's outer width in dp. */
  width: number;
  /** Right-aligned figure (Months, Days, Qty, the three rates, Amount); Date, and Months of a one-time GRN ("One-time"), are left-aligned text. */
  numeric: boolean;
  /** Left edge in the scrolling part (0 for the pinned Dispatch column, which is not in it). */
  x: number;
}

/** The pinned Dispatch column, the scrolling ones and the width of the scrolling part. */
export interface LineTable {
  pinned: LineColumn;
  scrolling: readonly LineColumn[];
  content: number;
}

const helper = createAppColumnHelper<InvoiceItemData>();

/** The columns for the table; Labour is left out of a one-time GRN. */
export function lineColumnDefs(widths: LineWidths, oneTime: boolean) {
  const text = (id: LineColumnId, header: string) => helper.display({ id, header, meta: { width: widths[id] } });
  const figure = (id: LineColumnId, header: string) => helper.display({ id, header, meta: { width: widths[id], numeric: true } });
  const cols = [
    text('dispatch', tr('common.dispatch')),
    text('date', tr('common.date')),
    // A figure column (right-aligned, tabular) except for a one-time GRN, where the cell says "One-time" in words.
    (oneTime ? text : figure)('duration', tr('invoice.items.colMonths')),
    figure('days', tr('invoice.items.colDays')),
    figure('qty', tr('invoice.items.colQty')),
    figure('charge', fieldHeading('charge')),
  ];
  if (!oneTime) cols.push(figure('labour_rate', fieldHeading('labour_rate')));
  cols.push(figure('tax', fieldHeading('tax')), figure('amount', tr('invoice.items.colAmount')));
  return helper.columns(cols);
}

/** The table's leaf columns, in order, as the list parts read them. */
export function lineColumnsOf(table: AppTable<InvoiceItemData>): LineTable {
  let x = 0;
  const all = table.getAllLeafColumns().map((column): LineColumn => {
    const meta = column.columnDef.meta;
    const width = typeof meta?.width === 'number' ? meta.width : 0;
    const id = column.id as LineColumnId;
    const placed: LineColumn = {
      id,
      header: typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id,
      width,
      numeric: !!meta?.numeric,
      x: id === 'dispatch' ? 0 : x,
    };
    if (id !== 'dispatch') x += width;
    return placed;
  });
  return { pinned: all[0], scrolling: all.slice(1), content: x };
}

/** Space kept at the right of a column's text so the heading and the figures line up: a rate's cell has its ring and padding, Amount the room at the end of the table. */
export const columnInset = (id: LineColumnId): number =>
  id === 'charge' || id === 'labour_rate' || id === 'tax' ? CELL_CHROME / 2 : id === 'amount' ? END_GAP : 0;
