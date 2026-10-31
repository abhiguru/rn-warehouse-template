/**
 * The pure parts of the invoice items editor: field keys, the text a rate shows, what a group's
 * "(all lines)" fields show, what their − / + steppers do (and those beside a line card's own figures), and the list rows a group is drawn as: head,
 * the shared figures (one part, side by side or stacked), the toggle and, only while the group
 * is open, the column headings of the sideways-scrolling line table and one row per line (a card per line while a screen reader is on).
 */
import { formatIdentifier, localizeDigits, t as tr, type TranslationKey } from '@/i18n';
import { roundMoney } from '@/utils/invoiceCalculations';
import { parseRateInput, rateRangeMessage, RATE_MAX, type RateField } from '@/features/invoice/utils/amountInput';
import { groupKeyOf, type InvoiceItemGroup } from '@/features/invoice/utils/groupInvoiceItems';
import type { GroupRates, InvoiceItemData } from '@/types/invoice.types';
import type { TextInputRef } from '@/types/nativeRefs';

export type { RateField };
export const RATE_FIELDS: readonly RateField[] = ['charge', 'labour_rate', 'tax'];

/** What the editor knows of a field whose text differs from the stored rate. */
export interface FieldState {
  /** The typed text, with 0-9 digits. */
  text: string;
  /** Why the text is refused, or null when it is a number in range. */
  error: string | null;
  /** The error is shown (the field was left, or Next was pressed). */
  shown: boolean;
}

export const cellKey = (tempId: string, field: RateField) => `cell|${tempId}|${field}`;
export const groupFieldKey = (groupKey: string, field: RateField) => `group|${groupKey}|${field}`;

export interface ParsedKey {
  kind: 'cell' | 'group';
  id: string;
  field: RateField;
}
export function parseKey(key: string): ParsedKey {
  const first = key.indexOf('|');
  const last = key.lastIndexOf('|');
  return { kind: key.slice(0, first) as ParsedKey['kind'], id: key.slice(first + 1, last), field: key.slice(last + 1) as RateField };
}

/** A rate as a cell shows it once left: charge and labour with two decimals ("12.50"), tax as stored ("2.5"). */
export const rateText = (field: RateField, rate: number): string => {
  const value = Number.isFinite(rate) ? rate : 0;
  return field === 'tax' ? String(roundMoney(value)) : value.toFixed(2);
};

/** The text of a typed field read the way Next and leaving the field read it: an unfinished number is wrong too. */
export function settle(field: RateField, typed: string): { value: number | null; error: string | null; text: string } {
  const parsed = parseRateInput(field, typed);
  // An emptied field is not 0: it says the range, so that the 0 is typed. An unfinished number ("." ) is not a number.
  if (parsed.value === null && parsed.error === null) return { ...parsed, error: parsed.text === '' ? rateRangeMessage(field) : tr('invoice.validation.rateNotNumber') };
  return parsed;
}

/** What one "(all lines)" field shows. */
export interface SharedView {
  /** The rate the lines share (or the one applied to the group), as text; '' while the lines differ or are free. */
  text: string;
  /** The lines without their own figure differ: the placeholder says "Mixed" (Labour and Tax; Charge shows `average` instead). Where some lines keep their own and the others share one, `text` is that shared figure. */
  mixed: boolean;
  /** Charge only: the lines differ, so `text` is their average charge weighted by bag-months (by bags for a one-time GRN). */
  average: boolean;
  /** Whether a figure typed or stepped here reaches any line: false only when every line keeps its own typed charge. */
  applies: boolean;
  /** Lines that keep a rate of their own: marked in `itemOverrides`, typed on the line or saved differently on an edited invoice, and so differing from the shown figure. */
  keepOwn: number;
  /**
   * The rounded rate that the lines WITHOUT their own typed rate all share, which is what a group press sets and so what
   * the steppers step from while an average is shown; null when those lines differ or there are none.
   */
  stepFrom: number | null;
}
export type GroupView = Record<RateField, SharedView>;

/**
 * The charge that, applied to every line, gives the same storage total as the lines' own charges: the mean charge
 * weighted by bag-months, Σ(charge x qty x duration) / Σ(qty x duration), or by bags for a one-time GRN,
 * Σ(charge x qty) / Σ(qty); the plain mean when the weights add up to 0. Each line is read as `calculateItemAmounts`
 * reads it (a bad qty or charge counts as 0, a duration that is not above 0 as 1), and the result is rounded to 2 places.
 */
export function weightedCharge(lines: readonly InvoiceItemData[]): number {
  let weighted = 0;
  let weights = 0;
  let sum = 0;
  lines.forEach((line) => {
    // Number() first, as the form holds text-like or missing values too; the same guards as `calculateItemAmounts`.
    const rawQty = Number(line.qty);
    const rawCharge = Number(line.charge);
    const rawMonths = Number(line.duration);
    const qty = isNaN(rawQty) || rawQty < 0 ? 0 : rawQty;
    const charge = isNaN(rawCharge) || rawCharge < 0 ? 0 : rawCharge;
    const months = isNaN(rawMonths) || rawMonths <= 0 ? 1 : rawMonths;
    const weight = line.one_time ? qty : qty * months;
    weighted += charge * weight;
    weights += weight;
    sum += charge;
  });
  return roundMoney(weights > 0 ? weighted / weights : lines.length > 0 ? sum / lines.length : 0);
}

/**
 * The group's shared rates as the form holds them: the rate applied to the group, else the rate all
 * lines share, else (Labour, Tax) the shared figure of the lines not marked as having their own, when some are marked and
 * the rest agree, else "Mixed". Charge is the exception (owner, 2026-10-19): while its lines differ it shows their
 * weighted average (`weightedCharge`, flagged `average`), because that is the one charge that gives the same storage total.
 */
export function groupView(
  group: InvoiceItemGroup,
  applied: GroupRates | undefined,
  overrides: Record<string, string[]>
): GroupView {
  const view = {} as GroupView;
  RATE_FIELDS.forEach((field) => {
    const rates = group.allItems.map((line) => roundMoney(Number(line[field]) || 0));
    const appliedRate = applied?.[field];
    // Lines that keep a rate typed on the line itself (or marked when a saved invoice was opened), and the rest.
    const typed = group.allItems.filter((line) => (overrides[line.temp_id] ?? []).includes(field));
    const takers = group.allItems.filter((line) => !(overrides[line.temp_id] ?? []).includes(field));
    const takerRates = takers.map((line) => roundMoney(Number(line[field]) || 0));
    const stepFrom = takerRates.length > 0 && takerRates.every((rate) => rate === takerRates[0]) ? takerRates[0] : null;
    const differ = rates.some((rate) => rate !== rates[0]);
    // Labour and Tax: while some lines keep their own figure and the others all share one, the field shows that shared figure
    // (owner, 2026-10-19), not "Mixed"; "Mixed" is for lines without their own figure that differ among themselves.
    const sharedByTakers = field !== 'charge' && typed.length > 0 && stepFrom !== null ? stepFrom : undefined;
    let text: string;
    let mixed = false;
    let average = false;
    if (field === 'charge' && differ) {
      text = rateText(field, weightedCharge(group.allItems));
      average = true;
    } else if (appliedRate !== undefined) text = rateText(field, appliedRate);
    else if (sharedByTakers !== undefined) text = sharedByTakers > 0 ? rateText(field, sharedByTakers) : '';
    else if (differ) {
      text = '';
      mixed = true;
    } else text = rates[0] > 0 ? rateText(field, rates[0]) : '';
    const shown = appliedRate ?? sharedByTakers ?? (differ ? undefined : rates[0]);
    // Lines that keep their own rate: those that differ from a shown rate, or, while the lines differ and none is shown, all of them.
    const keepOwn = shown === undefined ? typed.length : typed.filter((line) => roundMoney(Number(line[field]) || 0) !== roundMoney(shown)).length;
    view[field] = { text, mixed, average, applies: typed.length < group.allItems.length, keepOwn, stepFrom };
  });
  return view;
}

export type SharedField = RateField;

export type ItemsRow =
  | { type: 'head'; key: string; groupKey: string }
  | { type: 'cols'; key: string; groupKey: string }
  | { type: 'line'; key: string; groupKey: string; tempId: string; last: boolean }
  | { type: 'card'; key: string; groupKey: string; tempId: string; last: boolean }
  | { type: 'block'; key: string; groupKey: string; fields: SharedField[]; lines: number }
  | { type: 'toggle'; key: string; groupKey: string; open: boolean; lines: number };

export interface RowPlan {
  rows: ItemsRow[];
  /** The Next key walks the fields in this order: the fields that are shown (those of a closed group's lines are not). */
  order: string[];
  /** Every field of the invoice in page order, as if every group were open: Next counts refused text in closed groups too. */
  allOrder: string[];
  /** The list row that holds a field. */
  rowOf: Map<string, number>;
}

export interface GroupMode {
  /** The lines are cards (only while a screen reader is on); otherwise they are rows of the sideways table. */
  cards: boolean;
}

/**
 * The shared fields a group shows: Charge and Labour for 2 or more lines (not for a one-time GRN, which has no
 * Labour; a single line has them in its own cells), Tax always (owner, 2026-10-19: it has no cell of its own).
 * They show whatever the lines hold ("Mixed" where they differ).
 */
export function sharedFieldsOf(lines: number, oneTime: boolean): SharedField[] {
  const fields: SharedField[] = [];
  if (lines >= 2) fields.push('charge');
  if (lines >= 2 && !oneTime) fields.push('labour_rate');
  fields.push('tax');
  return fields;
}

/**
 * The rows of the page. A group is: head, the shared block (the "(all lines)" figures in one part, in both
 * modes; the field walk keeps their order), the toggle and,
 * only when `open` has the group, the column headings (table mode) and one row per line, the last of which
 * draws the card's bottom edge. A closed group has no line rows, so their fields are not in `order`/`rowOf`.
 */
export function planRows(
  groups: readonly InvoiceItemGroup[],
  modeOf: (group: InvoiceItemGroup) => GroupMode,
  oneTime: boolean,
  open: ReadonlySet<string>
): RowPlan {
  const rows: ItemsRow[] = [];
  const order: string[] = [];
  const allOrder: string[] = [];
  const rowOf = new Map<string, number>();
  const add = (row: ItemsRow, keys: string[] = []) => {
    keys.forEach((key) => {
      rowOf.set(key, rows.length);
      order.push(key);
      allOrder.push(key);
    });
    rows.push(row);
  };
  groups.forEach((group) => {
    const groupKey = groupKeyOf(group);
    const mode = modeOf(group);
    const isOpen = open.has(groupKey);
    // The Next key walks a line's Charge, then its Labour (a one-time GRN has none), then the next line.
    const lineFields: RateField[] = oneTime ? ['charge'] : ['charge', 'labour_rate'];
    add({ type: 'head', key: `head|${groupKey}`, groupKey });
    const shared = sharedFieldsOf(group.allItems.length, oneTime);
    if (shared.length > 0) {
      add({ type: 'block', key: `block|${groupKey}`, groupKey, fields: shared, lines: group.allItems.length }, shared.map((f) => groupFieldKey(groupKey, f)));
    }
    add({ type: 'toggle', key: `toggle|${groupKey}`, groupKey, open: isOpen, lines: group.allItems.length });
    if (isOpen && !mode.cards) add({ type: 'cols', key: `cols|${groupKey}`, groupKey });
    group.allItems.forEach((line: InvoiceItemData, index) => {
      const keys = lineFields.map((field) => cellKey(line.temp_id, field));
      if (!isOpen) {
        // Not shown, but still the invoice's: Next must find refused text here.
        allOrder.push(...keys);
        return;
      }
      const last = index === group.allItems.length - 1;
      add(
        mode.cards
          ? { type: 'card', key: `card|${line.temp_id}`, groupKey, tempId: line.temp_id, last }
          : { type: 'line', key: `line|${line.temp_id}`, groupKey, tempId: line.temp_id, last },
        keys
      );
    });
  });
  return { rows, order, allOrder, rowOf };
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((value, index) => value === b[index]);

const sameRow = (a: ItemsRow, b: ItemsRow): boolean => {
  const keys = Object.keys(a) as Array<keyof ItemsRow>;
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const x: unknown = a[key];
    const y: unknown = (b as Record<string, unknown>)[key];
    return Array.isArray(x) && Array.isArray(y) ? sameList(x, y) : x === y;
  });
};

/**
 * Whether two plans are the same page: the same rows (keys, kinds, flags) in the same order and the same
 * fields in the same rows. A row holds no figures (the rows read those when they are drawn), so a typed
 * figure leaves the plan the same and the earlier one can be kept: the list is not given new data.
 */
export function samePlan(a: RowPlan, b: RowPlan): boolean {
  if (a === b) return true;
  if (a.rows.length !== b.rows.length || a.rowOf.size !== b.rowOf.size) return false;
  if (!sameList(a.order, b.order) || !sameList(a.allOrder, b.allOrder)) return false;
  for (const [key, index] of a.rowOf) if (b.rowOf.get(key) !== index) return false;
  return a.rows.every((row, index) => sameRow(row, b.rows[index]));
}

/** The functions the rows call. One object for the life of the editor, so memoized rows keep their props. */
export interface ItemsActions {
  focus: (key: string) => void;
  change: (key: string, typed: string) => void;
  blur: (key: string) => void;
  /** A table cell is pressed (true) or let go (false): the layout is held from the touch down, before the focus arrives. */
  hold: (key: string, held: boolean) => void;
  /** A table cell is tapped: its row is scrolled up, before the input is focused. */
  start: (key: string) => void;
  /** The keyboard's Next key. */
  submit: (key: string) => void;
  /** The toggle of a group: opens or closes its dispatch lines (a focused cell of the group is left first). */
  toggle: (groupKey: string) => void;
  /**
   * A − / + press under an "(all lines)" field: the field it belongs to is settled first (a focused field is left, as
   * the keyboard hiding does), then the stepped figure is applied as if it had been typed there and accepted.
   */
  step: (groupKey: string, field: RateField, direction: StepDirection) => void;
  /**
   * A + / − press beside a line card's own figure (screen reader cards): the same as `step`, but for that line's field: the stepped figure is
   * applied as if it had been typed in the cell and accepted (so the line keeps its own figure).
   */
  stepCell: (tempId: string, field: RateField, direction: StepDirection) => void;
  /** A stacked shared field reports how far below the top of its row it starts (null when the fields are side by side or it unmounts). */
  stackedOffset: (key: string, offset: number | null) => void;
  /** A stable ref callback for the input of a field. */
  refFor: (key: string) => (node: TextInputRef | null) => void;
}

const FIELD_HEADING: Record<RateField, TranslationKey> = {
  charge: 'invoice.items.colCharge',
  labour_rate: 'invoice.items.colLabour',
  tax: 'invoice.items.colTax',
};
/** A field's heading with its unit: "Charge (₹)", "Labour (₹)", "Tax (%)". */
export const fieldHeading = (field: RateField): string => tr(FIELD_HEADING[field]);

const FIELD_NAME: Record<RateField, TranslationKey> = {
  charge: 'invoice.label.charge',
  labour_rate: 'invoice.label.labour',
  tax: 'invoice.label.tax',
};
const unitOf = (field: RateField, oneTime: boolean): string =>
  field === 'tax' ? tr('invoice.items.unitTax') : field === 'labour_rate' ? tr('invoice.items.unitLabour') : tr(oneTime ? 'invoice.items.unitChargeOneTime' : 'invoice.items.unitCharge');

/** "Charge, dispatch I0042, rupees per bag per month" */
export const cellLabel = (field: RateField, dispatchNo: string, oneTime: boolean): string =>
  tr('invoice.items.cellA11y', { field: tr(FIELD_NAME[field]), number: formatIdentifier(dispatchNo), unit: unitOf(field, oneTime) });

/** "Charge, Example Potatoes, all lines, rupees per bag per month" */
export const groupCellLabel = (field: RateField, itemName: string, oneTime: boolean, average = false): string =>
  tr(average ? 'invoice.items.groupAverageA11y' : 'invoice.items.groupCellA11y', { field: tr(FIELD_NAME[field]), item: itemName, unit: unitOf(field, oneTime) });

/** Tax has no cell of its own, so no line keeps its own tax and it has no note. */
const KEEP_OWN: Partial<Record<RateField, TranslationKey>> = {
  charge: 'invoice.items.keepOwnCharge',
  labour_rate: 'invoice.items.keepOwnLabour',
};
export const keepOwnNote = (field: RateField, count: number): string | undefined => {
  const key = KEEP_OWN[field];
  return key ? tr(key, { count }) : undefined;
};

/** The note under a Charge that shows the average: "Average of 3 lines", then, when some lines keep their own charge, that note on a second line. */
export const averageNote = (lines: number, keepOwn: number): string => {
  const average = tr('invoice.items.averageNote', { count: lines });
  return keepOwn > 0 ? `${average}\n${keepOwnNote('charge', keepOwn)}` : average;
};

/** Announced after a press under an average: the figure set on the lines that take it (the field then shows the new average). */
export const stepDoneAverageText = (value: number, localize: (text: string) => string): string =>
  tr('invoice.items.stepDoneAverage', { value: localize(rateText('charge', value)) });

/** What is announced after a press: "Charge 5.25 rupees", "Tax 3.5 percent" (the field's name and unit in words, digits of the language). */
export const stepDoneText = (field: RateField, value: number, localize: (text: string) => string): string =>
  tr('invoice.items.stepDone', {
    field: tr(FIELD_NAME[field]),
    value: localize(rateText(field, value)),
    unit: tr(field === 'tax' ? 'invoice.items.unitTax' : 'invoice.items.stepUnitMoney'),
  });

/** The amount a − / + press changes a shared figure by: 0.25 rupees for charge and labour, 1 percent for tax. */
export const STEP: Record<RateField, number> = { charge: 0.25, labour_rate: 0.25, tax: 1 };
export type StepDirection = -1 | 1;

/** What the − / + under a shared field can do now. `value` is null while there is no single figure to step from. */
export interface StepperState {
  value: number | null;
  canDecrease: boolean;
  canIncrease: boolean;
  /** The figure is above the field's entry maximum (a stored rate or saved invoice): + is off and − brings it to the maximum. */
  aboveMax: boolean;
}

/**
 * The figure the steppers step from, and which of them work. None does while the lines differ ("Mixed", no single figure;
 * under a Charge average the figure is `stepFrom`, the rate the lines without their own charge share, or none), when every
 * line keeps its own charge,
 * or while the field holds text that is refused or unfinished. Text that is a number in range is applied already, so it is the figure.
 */
export function stepperState(field: RateField, view: SharedView, state: FieldState | undefined): StepperState {
  let value: number | null;
  if (state) {
    const settled = settle(field, state.text);
    value = settled.error || settled.value === null ? null : settled.value;
    // An emptied field over "Mixed" (or the average) has no figure: it is not 0 to step from.
    if (state.text === '' && (view.mixed || view.average)) value = view.average ? view.stepFrom : null;
  } else if (view.average) value = view.stepFrom; // not the average: a press sets only the lines without their own charge
  else value = view.mixed ? null : roundMoney(Number(view.text) || 0);
  // A press changes nothing when every line keeps its own figure.
  if (value === null || !view.applies) return { value, canDecrease: false, canIncrease: false, aboveMax: false };
  return { value, canDecrease: value > 0, canIncrease: value < RATE_MAX[field], aboveMax: value > RATE_MAX[field] };
}

/**
 * A figure one step up or down, rounded to two decimals (as the fields keep them) and held in 0 to the field's maximum.
 * A stored figure above the maximum (e.g. 12000.00 against 9999.99) goes straight to the maximum on −, not a step down from it.
 */
export const steppedValue = (field: RateField, from: number, direction: StepDirection): number =>
  from > RATE_MAX[field] ? RATE_MAX[field] : Math.min(RATE_MAX[field], Math.max(0, roundMoney(from + direction * STEP[field])));

/** The field's entry maximum as spoken in a label: "₹9999.99" or "100%", in the language's digits. */
export const maxAmountText = (field: RateField): string =>
  tr(field === 'tax' ? 'invoice.items.stepAmountTax' : 'invoice.items.stepAmountMoney', { amount: localizeDigits(String(RATE_MAX[field])) });

/** What the + / − beside a dispatch line's figure steps from: the line's own rate, as the cell shows it (neither "Mixed" nor an average applies). */
export const lineView = (field: RateField, rate: number): SharedView => ({ text: rateText(field, rate), mixed: false, average: false, applies: true, keepOwn: 0, stepFrom: roundMoney(rate) });

const STEP_NAME: Record<RateField, TranslationKey> = {
  charge: 'invoice.items.stepNameCharge',
  labour_rate: 'invoice.items.stepNameLabour',
  tax: 'invoice.items.stepNameTax',
};

/** "Raise the charge by ₹0.25, dispatch I0042" / "Lower the labour by ₹0.25, dispatch I0042" (a line has no Tax figure to step): the spoken labels of a line's buttons. */
export function lineStepLabels(field: Exclude<RateField, 'tax'>, dispatchNo: string, aboveMax = false): { increase: string; decrease: string } {
  const amount = localizeDigits(String(STEP[field]));
  const params = {
    name: tr(STEP_NAME[field]),
    amount: tr('invoice.items.stepAmountMoney', { amount }),
    number: formatIdentifier(dispatchNo),
  };
  // Above the maximum, − lowers the figure to the maximum (say so, with the maximum), not by a step.
  const toMax = { ...params, amount: maxAmountText(field) };
  return {
    increase: tr('invoice.items.stepLineIncrease', params),
    decrease: aboveMax ? tr('invoice.items.stepLineLowerToMax', toMax) : tr('invoice.items.stepLineDecrease', params),
  };
}
