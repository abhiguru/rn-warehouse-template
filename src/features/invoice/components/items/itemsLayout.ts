/**
 * Sizes of the invoice items step (pure, unit-tested). One width per figure column for the whole
 * step, sized to the widest figure at the current text size, so no figure splits or moves from
 * row to row. The first column (Dispatch) takes what is left.
 *
 * The lines of a group are a table while the columns leave the first column enough room (and the
 * text is below CARD_SCALE); otherwise each line is a small card with its fields.
 */
import { crowded, numberColumnWidth, rowWidth, type TableLayout } from '@/components/common/DetailTable';
import { space, typography } from '@/theme/tokens';

/** From this font scale the lines are cards (as the rate box of Item pricing does). */
export const CARD_SCALE = 1.3;
/** The ring (2) and the padding (xs) on each side of a cell's text. */
export const CELL_CHROME = 2 * (2 + space.xs);

/** Widths at font scale 1 for the figures a rate holds (₹999.99, 100 %, 9,999 bags, ₹99,999.00). */
const BASE = { qty: 44, charge: 64, labour: 56, tax: 44, amount: 84 } as const;

/** The Amount column always has room for this, so ordinary typing (a charge of 999.99 on 9,999 bags) never needs it wider. */
export const AMOUNT_FLOOR = '₹99,999.00';

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
}

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
    amount: Math.max(numberColumnWidth(table, BASE.amount, [], [...figures.amount, AMOUNT_FLOOR]), headingWidth(table, headings.amount)) + space.xs,
  };
  const row = rowWidth(table);
  const scale = table.scale;
  const cards = fontScale >= CARD_SCALE || crowded(row, [widths.qty, widths.charge, widths.amount], 0, scale);
  const rateColumns =
    !cards && !crowded(row, [widths.qty, widths.charge, widths.labour, widths.tax, widths.amount], 0, scale);
  return { widths, row, cards, rateColumns };
}

/** Whether a group's lines are cards: the step's layout says so, or the group needs rate columns that do not fit. */
export const groupIsCards = (layout: ItemsLayout, perLineRates: boolean): boolean =>
  layout.cards || (perLineRates && !layout.rateColumns);

/** Whether two layouts are the same, so the earlier object can be kept and memoized rows keep their props. */
export const sameLayout = (a: ItemsLayout, b: ItemsLayout): boolean =>
  a.row === b.row &&
  a.cards === b.cards &&
  a.rateColumns === b.rateColumns &&
  (Object.keys(a.widths) as FigureColumn[]).every((column) => a.widths[column] === b.widths[column]);
