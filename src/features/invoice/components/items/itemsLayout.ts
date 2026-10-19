/**
 * Sizes of the invoice items step (pure, unit-tested). One width per figure column for the whole
 * step, sized to the widest figure at the current text size, so no figure splits or moves from
 * row to row. The first column (Dispatch) takes what is left.
 *
 * The lines of a group are a table Dispatch | Charge | Amount (Qty is not a column: it is read under the
 * dispatch number) while the columns leave the first column enough room (and the text is below CARD_SCALE).
 * An editable column (Charge, Labour, Tax) is as wide as its figure plus the cell's chrome plus the + above −
 * beside it (LINE_STEPPER). A table that no longer fits becomes cards, each line a small card with its fields.
 *
 * In a line card an editable figure is a short input sized for the largest figure expected (`lineInputs`), with
 * + − side by side right after it; the table keeps the stacked pair.
 *
 * The "(all lines)" figures of a group are one row of columns (field, with − / + under it) while every column
 * is wide enough for its widest figure and two touch targets; otherwise they are stacked (`sharedSideBySide`).
 */
import { crowded, numberColumnWidth, rowWidth, type TableLayout } from '@/components/common/DetailTable';
import { CELL_MAX_FONT_SCALE } from '@/components/table/EditableNumberCell';
import { VERTICAL_PAIR_WIDTH } from '@/components/fiori/StepperInput';
import { space, touchTarget, typography } from '@/theme/tokens';

/** From this font scale the lines are cards (as the rate box of Item pricing does). */
export const CARD_SCALE = 1.3;
/** The ring (2) and the padding (xs) on each side of a cell's text. */
export const CELL_CHROME = 2 * (2 + space.xs);
/** The + above − at the right of an editable cell of a line (one touch target wide): each Charge / Labour / Tax column includes it. */
export const LINE_STEPPER = VERTICAL_PAIR_WIDTH;

/** Widths at font scale 1 for the figures a rate holds (₹999.99, 100 %, ₹99,999.00).
 * A figure typed wider than its column is cut with "…" until the field is left: the editor holds the layout meanwhile. */
const BASE = { charge: 64, labour: 56, tax: 44, amount: 84 } as const;

export type FigureColumn = keyof typeof BASE;

export interface ItemsFigures {
  charge: readonly string[];
  labour: readonly string[];
  tax: readonly string[];
  /** Line totals, drawn in weight 600. */
  amount: readonly string[];
}

export interface ItemsHeadings {
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
  /** The width of a line card's short input (its frame included) for Charge, Labour and Tax: the widest figure expected, at the field's text size. */
  lineInputs: LineInputWidths;
}

export type LineInputWidths = Record<'charge' | 'labour_rate' | 'tax', number>;

/** The gap between the columns of the shared row. */
export const SHARED_GAP = space.sm;
/** A field's frame: its outline (2 when focused) and padding on each side (`Input`). */
const FIELD_CHROME = 2 * (space.md + 1);

/**
 * The widest figures expected in a line card's field: Charge and Labour 9999.99 (the Charge entry limit), Tax 99.99.
 * The step's own figures are added, so a stored rate above these (12000.00) shows in full and is not clipped.
 */
const LINE_INPUT_FIGURES: Record<keyof LineInputWidths, readonly string[]> = {
  charge: ['9999.99'],
  labour_rate: ['9999.99'],
  tax: ['99.99'],
};

const headingWidth = (table: TableLayout, heading: string) =>
  numberColumnWidth(table, 0, [], [heading], typography.footnote.fontSize ?? 13);

const cellColumn = (table: TableLayout, base: number, values: readonly string[], heading: string) =>
  Math.max(numberColumnWidth(table, base, values), headingWidth(table, heading)) + CELL_CHROME + LINE_STEPPER;

export function itemsLayout(
  table: TableLayout,
  fontScale: number,
  figures: ItemsFigures,
  headings: ItemsHeadings
): ItemsLayout {
  const widths: ItemsWidths = {
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
  const cards = fontScale >= CARD_SCALE || crowded(row, [widths.charge, widths.amount], 0, scale);
  const rateColumns =
    !cards && !crowded(row, [widths.charge, widths.labour, widths.tax, widths.amount], 0, scale);
  // A line card's input follows the text size (no cap): the widest of the expected figure and the stored ones.
  const lineInput = (names: readonly string[]) =>
    numberColumnWidth(table, 0, names, [], typography.body.fontSize ?? 16) + FIELD_CHROME;
  const lineInputs: LineInputWidths = {
    charge: lineInput([...LINE_INPUT_FIGURES.charge, ...figures.charge]),
    labour_rate: lineInput([...LINE_INPUT_FIGURES.labour_rate, ...figures.labour]),
    tax: lineInput([...LINE_INPUT_FIGURES.tax, ...figures.tax]),
  };
  return { widths, row, cards, rateColumns, sharedColumn, sharedStacked: table.stacked, lineInputs };
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
  a.lineInputs.charge === b.lineInputs.charge &&
  a.lineInputs.labour_rate === b.lineInputs.labour_rate &&
  a.lineInputs.tax === b.lineInputs.tax &&
  (Object.keys(a.widths) as FigureColumn[]).every((column) => a.widths[column] === b.widths[column]);
