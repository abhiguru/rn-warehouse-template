/**
 * Sizes of the invoice items step (pure, unit-tested). One width per figure column for the whole
 * step, sized to the widest figure at the current text size, so no figure splits or moves from
 * row to row. The first column (Dispatch) takes what is left.
 *
 * The lines of a group are a table while the columns leave the first column enough room (and the
 * text is below CARD_SCALE); otherwise each line is a small card with its fields.
 *
 * The "(all lines)" figures of a group are one row of columns (field, with − / + under it) while every column
 * is wide enough for its widest figure and two touch targets; otherwise they are stacked (`sharedSideBySide`).
 */
import { crowded, numberColumnWidth, rowWidth, type TableLayout } from '@/components/common/DetailTable';
import { CELL_MAX_FONT_SCALE } from '@/components/table/EditableNumberCell';
import { space, touchTarget, typography } from '@/theme/tokens';

/** From this font scale the lines are cards (as the rate box of Item pricing does). */
export const CARD_SCALE = 1.3;
/** The ring (2) and the padding (xs) on each side of a cell's text. */
export const CELL_CHROME = 2 * (2 + space.xs);

/** Widths at font scale 1 for the figures a rate holds (₹999.99, 100 %, 9,999 bags, ₹99,999.00).
 * A figure typed wider than its column is cut with "…" until the field is left: the editor holds the layout meanwhile. */
const BASE = { qty: 44, charge: 64, labour: 56, tax: 44, amount: 84 } as const;

export type FigureColumn = keyof typeof BASE;

export interface ItemsFigures {
  qty: readonly string[];
  charge: readonly string[];
  labour: readonly string[];
  tax: readonly string[];
  /** Line totals, drawn in weight 600. */
  amount: readonly string[];
}

export interface ItemsHeadings {
  qty: string;
  charge: string;
  labour: string;
  tax: string;
  amount: string;
}

export type ItemsWidths = Record<FigureColumn, number>;

export interface ItemsLayout {
  widths: ItemsWidths;
  /** Width of a row's content. */
  row: number;
  /** Every line is a card. */
  cards: boolean;
  /** A group whose lines differ in labour or tax can show them as columns. */
  rateColumns: boolean;
  /** The least width of a column of the shared row: the widest figure in a field, or two touch targets and the gap between them for − / +. */
  sharedColumn: number;
  /** The text is so large (TABLE_STACK_SCALE) that the shared figures are always stacked. */
  sharedStacked: boolean;
}

/** The gap between the columns of the shared row. */
export const SHARED_GAP = space.sm;
/** A field's frame: its outline (2 when focused) and padding on each side (`Input`). */
const FIELD_CHROME = 2 * (space.md + 1);

const headingWidth = (table: TableLayout, heading: string) =>
  numberColumnWidth(table, 0, [], [heading], typography.footnote.fontSize ?? 13);

const cellColumn = (table: TableLayout, base: number, values: readonly string[], heading: string) =>
  Math.max(numberColumnWidth(table, base, values), headingWidth(table, heading)) + CELL_CHROME;

export function itemsLayout(
  table: TableLayout,
  fontScale: number,
  figures: ItemsFigures,
  headings: ItemsHeadings
): ItemsLayout {
  const widths: ItemsWidths = {
    qty: Math.max(numberColumnWidth(table, BASE.qty, figures.qty), headingWidth(table, headings.qty)),
    charge: cellColumn(table, BASE.charge, figures.charge, headings.charge),
    labour: cellColumn(table, BASE.labour, figures.labour, headings.labour),
    tax: cellColumn(table, BASE.tax, figures.tax, headings.tax),
    amount: Math.max(numberColumnWidth(table, BASE.amount, [], figures.amount), headingWidth(table, headings.amount)) + space.xs,
  };
  const row = rowWidth(table);
  const scale = table.scale;
  // The field's text is the body size and never grows past CELL_MAX_FONT_SCALE (its `maxFontSizeMultiplier`).
  const fieldTable = { scale: Math.min(table.scale, CELL_MAX_FONT_SCALE), numberWidth: table.numberWidth };
  const figure = numberColumnWidth(fieldTable, 0, [...figures.charge, ...figures.labour, ...figures.tax], [], typography.body.fontSize ?? 16);
  const sharedColumn = Math.max(2 * touchTarget + space.sm, figure + FIELD_CHROME);
  const cards = fontScale >= CARD_SCALE || crowded(row, [widths.qty, widths.charge, widths.amount], 0, scale);
  const rateColumns =
    !cards && !crowded(row, [widths.qty, widths.charge, widths.labour, widths.tax, widths.amount], 0, scale);
  return { widths, row, cards, rateColumns, sharedColumn, sharedStacked: table.stacked };
}

/** Whether a group's lines are cards: the step's layout says so, or the group needs rate columns that do not fit. */
export const groupIsCards = (layout: ItemsLayout, perLineRates: boolean): boolean =>
  layout.cards || (perLineRates && !layout.rateColumns);

/** Whether a shared row of `count` fields (1 to 3) fits as columns: each is at least `sharedColumn` wide, else the fields are stacked. */
export const sharedSideBySide = (layout: ItemsLayout, count: number): boolean =>
  !layout.sharedStacked && count >= 1 && (layout.row - SHARED_GAP * (count - 1)) / count >= layout.sharedColumn;

/** Whether two layouts are the same, so the earlier object can be kept and memoized rows keep their props. */
export const sameLayout = (a: ItemsLayout, b: ItemsLayout): boolean =>
  a.row === b.row &&
  a.cards === b.cards &&
  a.rateColumns === b.rateColumns &&
  a.sharedColumn === b.sharedColumn &&
  a.sharedStacked === b.sharedStacked &&
  (Object.keys(a.widths) as FigureColumn[]).every((column) => a.widths[column] === b.widths[column]);
