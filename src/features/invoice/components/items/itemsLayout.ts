/**
 * Sizes of the invoice items step (pure, unit-tested). The lines of an open card are one table that scrolls
 * sideways (owner decision, 2026-10-19, a single exception to "a table never scrolls sideways"): Dispatch (pinned)
 * | Date | Months | Days | Qty | Charge | Labour | Tax | Amount (Tax is read-only: it is set in "All dispatches" only).
 * Each column is as wide as its widest text and heading at the current text size (`LineWidths`, worked out once per
 * layout from the held snapshot of the items, not per row), whatever the screen width: there is no crowding check and
 * no switch to cards because of width or text size. Months is the exception: it is only as wide as its widest figure
 * and normal cell padding, and its heading shrinks to fit (`ONE_LINE`). Every column starts with the same gap
 * (`COL_GAP`, space.lg); Date, Months, Days and Qty are centred in their columns, the money columns and Tax right-aligned. The Labour box is sized for 999.99 (or its widest stored figure) and its heading may wrap to two lines, so the column is as wide as the box or its longest heading word. The lines are cards only while a screen reader is on (the editor sets `cards`).
 *
 * In a line card (screen reader) an editable figure (Charge, Labour) is a short input sized for the largest figure expected
 * (`lineInputs`), with + − side by side right after it.
 *
 * The "(all lines)" figures of a group are one row of columns (field, with − / + under it) while every column
 * is wide enough for its widest figure and two touch targets; otherwise they are stacked (`sharedSideBySide`).
 */
import { numberColumnWidth, rowWidth, TABLE_OUTLINE, type TableLayout } from '@/components/common/DetailTable';
import { CELL_MAX_FONT_SCALE } from '@/components/table/EditableNumberCell';
import { space, touchTarget, typography } from '@/theme/tokens';

/** The ring (2) and the padding (xs) on each side of a cell's text. */
export const CELL_CHROME = 2 * (2 + space.xs);
/** Space before the text of every scrolling column: the one even gap between two columns (owner, 2026-10-19). */
export const COL_GAP = space.lg;
/** Padding each side of a Months figure (the cell padding of an editable cell, `space.xs`). */
export const MONTHS_PAD = 2 * space.xs;
/** Space after the last column, so its figure does not touch the card's edge when scrolled to the end. */
export const END_GAP = space.md;

/** Widths at font scale 1 for the figures a column holds (₹999.99, 100 %, ₹99,999.00, 365 days, 99,999 bags).
 * A figure typed wider than its column is cut with "…" until the field is left: the editor holds the layout meanwhile. */
const BASE = { charge: 64, labour_rate: 56, amount: 84, days: 32, qty: 40, months: 32 } as const;

export type LineColumnId = 'dispatch' | 'date' | 'duration' | 'days' | 'qty' | 'charge' | 'labour_rate' | 'tax' | 'amount';
/** The columns of the table, left to right; Labour is left out of a one-time GRN. */
export const LINE_COLUMN_IDS: readonly LineColumnId[] = ['dispatch', 'date', 'duration', 'days', 'qty', 'charge', 'labour_rate', 'tax', 'amount'];

export interface ItemsFigures {
  /** The texts of each column over all lines (each distinct text once is enough). */
  dispatch: readonly string[];
  date: readonly string[];
  duration: readonly string[];
  days: readonly string[];
  qty: readonly string[];
  charge: readonly string[];
  labour: readonly string[];
  /** The stored tax rates: the Tax column (read-only) and the "All dispatches" fields are sized to the widest one. */
  tax: readonly string[];
  /** Line totals, drawn in weight 600. */
  amount: readonly string[];
}

export interface ItemsHeadings {
  dispatch: string;
  date: string;
  duration: string;
  days: string;
  qty: string;
  charge: string;
  labour: string;
  tax: string;
  amount: string;
}

/** The outer width of each column in dp: the pinned Dispatch column includes its right padding and divider, the others their `COL_GAP` before the text. */
export type LineWidths = Record<LineColumnId, number>;

/** What the sideways table needs of its geometry. */
export interface LineTableLayout {
  widths: LineWidths;
  /** The scrolling columns together: the columns shown (Labour is left out of a one-time GRN). */
  content: number;
  /** The pinned Dispatch column's width. */
  pinned: number;
  /** The width the scrolling part has on this screen (an estimate for the hint; the rows measure the real one). */
  viewport: number;
  /** The columns are wider than the screen: the hint "Swipe the table sideways" is shown. */
  sideways: boolean;
}

export interface ItemsLayout {
  lines: LineTableLayout;
  /** Width of a row's content. */
  row: number;
  /** Every line is a card: only while a screen reader is on (set by the editor, never by this module). */
  cards: boolean;
  /** The least width of a column of the shared row: the widest figure in a field, or two touch targets and the gap between them for − / +. */
  sharedColumn: number;
  /** The text is so large (TABLE_STACK_SCALE) that the shared figures are always stacked. */
  sharedStacked: boolean;
  /** The width of a line card's short input (its frame included) for Charge and Labour: the widest figure expected, at the field's text size. */
  lineInputs: LineInputWidths;
}

export type LineInputWidths = Record<'charge' | 'labour_rate', number>;

/** The gap between the columns of the shared row. */
export const SHARED_GAP = space.sm;
/** A field's frame: its outline (2 when focused) and padding on each side (`Input`). */
const FIELD_CHROME = 2 * (space.md + 1);

/**
 * The widest figures expected in a line card's field: Charge and Labour 9999.99 (the Charge entry limit).
 * The step's own figures are added, so a stored rate above these (12000.00) shows in full and is not clipped.
 */
const LINE_INPUT_FIGURES: Record<keyof LineInputWidths, readonly string[]> = {
  charge: ['9999.99'],
  labour_rate: ['9999.99'],
};

/** The widest Labour figure the table's box is made for (Charge's is 9999.99); a wider stored figure widens the box. */
const LABOUR_BOX_FIGURE = '999.99';

const headingWidth = (table: TableLayout, heading: string) =>
  numberColumnWidth(table, 0, [], [heading], typography.footnote.fontSize ?? 13);

/** The Date column: its widest text or heading, plus the gap before it. */
const textColumn = (table: TableLayout, values: readonly string[], heading: string) =>
  Math.max(numberColumnWidth(table, 0, values), headingWidth(table, heading)) + COL_GAP;

/**
 * The Months column (owner, 2026-10-19): its widest figure ("1.6") with the base of a short figure column and normal cell
 * padding on each side, plus the gap before it. The heading does not size it: it shrinks (ONE_LINE) to stay on one line.
 */
const monthsColumn = (table: TableLayout, values: readonly string[]) =>
  numberColumnWidth(table, BASE.months, values) + MONTHS_PAD + COL_GAP;

/** A figure column (Days, Qty): the guide's `numberColumnWidth` for its base and texts, or its heading, plus the gap before it. */
const figureColumn = (table: TableLayout, base: number, values: readonly string[], heading: string) =>
  Math.max(numberColumnWidth(table, base, values), headingWidth(table, heading)) + COL_GAP;

/** A Charge or Labour column: a figure column that also holds the editable cell's ring and padding. */
const cellColumn = (table: TableLayout, base: number, values: readonly string[], heading: string) =>
  Math.max(numberColumnWidth(table, base, values), headingWidth(table, heading)) + CELL_CHROME + COL_GAP;

/** The longest word of a heading ("Labour" of "Labour (₹)"): what a heading that may wrap needs. */
const longestWordWidth = (table: TableLayout, heading: string) =>
  Math.max(0, ...heading.split(/\s+/).map((word) => headingWidth(table, word)));

/** The Labour column (owner, 2026-10-19): its box fits 999.99 or the widest stored figure, and the heading wraps, so the column is the box or the heading's longest word, plus the cell's ring and the gap. */
const labourColumn = (table: TableLayout, values: readonly string[], heading: string) =>
  Math.max(numberColumnWidth(table, 0, [LABOUR_BOX_FIGURE, ...values]), longestWordWidth(table, heading)) + CELL_CHROME + COL_GAP;

/** The Tax column: read-only, so its widest figure or heading, plus the gap before it. */
const taxColumn = (table: TableLayout, values: readonly string[], heading: string) =>
  Math.max(numberColumnWidth(table, 0, values), headingWidth(table, heading)) + COL_GAP;

export function itemsLayout(
  table: TableLayout,
  figures: ItemsFigures,
  headings: ItemsHeadings,
  oneTime = false
): ItemsLayout {
  const widths: LineWidths = {
    // The dispatch numbers are in weight 600: the widest number or the heading, then the padding and the divider before the scrolling part.
    dispatch: Math.max(numberColumnWidth(table, 0, [], figures.dispatch), headingWidth(table, headings.dispatch)) + space.sm + TABLE_OUTLINE,
    date: textColumn(table, figures.date, headings.date),
    duration: monthsColumn(table, figures.duration),
    days: figureColumn(table, BASE.days, figures.days, headings.days),
    qty: figureColumn(table, BASE.qty, figures.qty, headings.qty),
    charge: cellColumn(table, BASE.charge, figures.charge, headings.charge),
    labour_rate: labourColumn(table, figures.labour, headings.labour),
    tax: taxColumn(table, figures.tax, headings.tax),
    amount: Math.max(numberColumnWidth(table, BASE.amount, [], figures.amount), headingWidth(table, headings.amount)) + COL_GAP + END_GAP,
  };
  const content = LINE_COLUMN_IDS.filter((id) => id !== 'dispatch' && !(oneTime && id === 'labour_rate')).reduce((sum, id) => sum + widths[id], 0);
  const row = rowWidth(table);
  // The scrolling part starts after the row's left padding (space.md) and the pinned column, and runs to the card's edge.
  const viewport = Math.max(0, row + space.md - widths.dispatch);
  // The field's text is the body size and never grows past CELL_MAX_FONT_SCALE (its `maxFontSizeMultiplier`).
  const fieldTable = { scale: Math.min(table.scale, CELL_MAX_FONT_SCALE), numberWidth: table.numberWidth };
  const figure = numberColumnWidth(fieldTable, 0, [...figures.charge, ...figures.labour, ...figures.tax], [], typography.body.fontSize ?? 16);
  const sharedColumn = Math.max(2 * touchTarget + space.sm, figure + FIELD_CHROME);
  // A line card's input follows the text size (no cap): the widest of the expected figure and the stored ones.
  const lineInput = (names: readonly string[]) =>
    numberColumnWidth(table, 0, names, [], typography.body.fontSize ?? 16) + FIELD_CHROME;
  const lineInputs: LineInputWidths = {
    charge: lineInput([...LINE_INPUT_FIGURES.charge, ...figures.charge]),
    labour_rate: lineInput([...LINE_INPUT_FIGURES.labour_rate, ...figures.labour]),
  };
  return {
    lines: { widths, content, pinned: widths.dispatch, viewport, sideways: content > viewport },
    row,
    cards: false,
    sharedColumn,
    sharedStacked: table.stacked,
    lineInputs,
  };
}

/** Whether a shared row of `count` fields (1 to 3) fits as columns: each is at least `sharedColumn` wide, else the fields are stacked. */
export const sharedSideBySide = (layout: ItemsLayout, count: number): boolean =>
  !layout.sharedStacked && count >= 1 && (layout.row - SHARED_GAP * (count - 1)) / count >= layout.sharedColumn;

/** Whether two layouts are the same, so the earlier object can be kept and memoized rows keep their props. */
export const sameLayout = (a: ItemsLayout, b: ItemsLayout): boolean =>
  a.row === b.row &&
  a.cards === b.cards &&
  a.lines.viewport === b.lines.viewport &&
  a.lines.content === b.lines.content &&
  a.sharedColumn === b.sharedColumn &&
  a.sharedStacked === b.sharedStacked &&
  a.lineInputs.charge === b.lineInputs.charge &&
  a.lineInputs.labour_rate === b.lineInputs.labour_rate &&
  LINE_COLUMN_IDS.every((column) => a.lines.widths[column] === b.lines.widths[column]);
