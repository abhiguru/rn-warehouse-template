/**
 * The pure parts of the invoice items editor: field keys, the text a rate shows, what a group's
 * "(all lines)" fields show, and the list rows a group is drawn as: head, shared rows, total, the
 * toggle and, only while the group is open, column headings and one row per line.
 */
import { formatIdentifier, t as tr, type TranslationKey } from '@/i18n';
import { roundMoney } from '@/utils/invoiceCalculations';
import { parseRateInput, type RateField } from '@/features/invoice/utils/amountInput';
import { groupKeyOf, type InvoiceItemGroup } from '@/features/invoice/utils/groupInvoiceItems';
import type { GroupRates, InvoiceItemData } from '@/types/invoice.types';

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
  if (parsed.value === null && parsed.error === null) return { ...parsed, error: tr('invoice.validation.rateNotNumber') };
  return parsed;
}

/** What one "(all lines)" field shows. */
export interface SharedView {
  /** The rate the lines share (or the one applied to the group), as text; '' while the lines differ or are free. */
  text: string;
  /** The lines differ: the placeholder says "Mixed". */
  mixed: boolean;
  /** Lines that keep a rate typed on the line itself. */
  keepOwn: number;
}
export type GroupView = Record<RateField, SharedView>;

/**
 * The group's shared rates as the form holds them: the rate applied to the group, else the rate all
 * lines share, else "Mixed". Never an average: an average is the rate of no line.
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
    let text: string;
    let mixed = false;
    if (appliedRate !== undefined) text = rateText(field, appliedRate);
    else if (rates.some((rate) => rate !== rates[0])) {
      text = '';
      mixed = true;
    } else text = rates[0] > 0 ? rateText(field, rates[0]) : '';
    const shown = appliedRate ?? (mixed ? undefined : rates[0]);
    // Lines that keep a rate typed on the line itself: those that differ from a shown rate, or, while "Mixed", all of them.
    const typed = group.allItems.filter((line) => (overrides[line.temp_id] ?? []).includes(field));
    const keepOwn = shown === undefined ? typed.length : typed.filter((line) => roundMoney(Number(line[field]) || 0) !== roundMoney(shown)).length;
    view[field] = { text, mixed, keepOwn };
  });
  return view;
}

/** Whether the lines of a group differ in labour or tax: then each line shows its own. */
export const linesDifferInLabourOrTax = (group: InvoiceItemGroup): boolean =>
  group.allItems.some(
    (line) =>
      roundMoney(line.labour_rate) !== roundMoney(group.allItems[0].labour_rate) ||
      roundMoney(line.tax) !== roundMoney(group.allItems[0].tax)
  );

export type SharedField = RateField;

export type ItemsRow =
  | { type: 'head'; key: string; groupKey: string }
  | { type: 'cols'; key: string; groupKey: string; perLine: boolean }
  | { type: 'line'; key: string; groupKey: string; tempId: string; perLine: boolean; last: boolean }
  | { type: 'card'; key: string; groupKey: string; tempId: string; perLine: boolean; last: boolean }
  | { type: 'shared'; key: string; groupKey: string; field: SharedField; lines: number }
  | { type: 'block'; key: string; groupKey: string; fields: SharedField[]; lines: number }
  | { type: 'total'; key: string; groupKey: string }
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
  /** The lines are cards. */
  cards: boolean;
  /** Labour and tax are the lines' own (a column or a field of each line), not "(all lines)" rows. */
  perLine: boolean;
}

/** The shared fields a group shows: Charge for 2 or more lines, Labour (not one-time) and Tax while the lines share them. */
export function sharedFieldsOf(lines: number, mode: GroupMode, oneTime: boolean): SharedField[] {
  const fields: SharedField[] = [];
  if (lines >= 2) fields.push('charge');
  if (!mode.perLine) {
    if (!oneTime) fields.push('labour_rate');
    fields.push('tax');
  }
  return fields;
}

/**
 * The rows of the page. A group is: head, the shared rows (or the block in cards mode), total, the toggle and,
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
    const lineFields: RateField[] = mode.perLine ? (oneTime ? ['charge', 'tax'] : ['charge', 'labour_rate', 'tax']) : ['charge'];
    add({ type: 'head', key: `head|${groupKey}`, groupKey });
    const shared = sharedFieldsOf(group.allItems.length, mode, oneTime);
    if (mode.cards) {
      if (shared.length > 0) {
        add({ type: 'block', key: `block|${groupKey}`, groupKey, fields: shared, lines: group.allItems.length }, shared.map((f) => groupFieldKey(groupKey, f)));
      }
    } else {
      shared.forEach((field) =>
        add({ type: 'shared', key: `shared|${groupKey}|${field}`, groupKey, field, lines: group.allItems.length }, [groupFieldKey(groupKey, field)])
      );
    }
    add({ type: 'total', key: `total|${groupKey}`, groupKey });
    add({ type: 'toggle', key: `toggle|${groupKey}`, groupKey, open: isOpen, lines: group.allItems.length });
    if (isOpen && !mode.cards) add({ type: 'cols', key: `cols|${groupKey}`, groupKey, perLine: mode.perLine });
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
          ? { type: 'card', key: `card|${line.temp_id}`, groupKey, tempId: line.temp_id, perLine: mode.perLine, last }
          : { type: 'line', key: `line|${line.temp_id}`, groupKey, tempId: line.temp_id, perLine: mode.perLine, last },
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
  editPricing: (groupKey: string) => void;
  /** A stable ref callback for the input of a field. */
  refFor: (key: string) => (node: import('react-native').TextInput | null) => void;
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
export const groupCellLabel = (field: RateField, itemName: string, oneTime: boolean): string =>
  tr('invoice.items.groupCellA11y', { field: tr(FIELD_NAME[field]), item: itemName, unit: unitOf(field, oneTime) });

const ALL_LINES: Record<RateField, TranslationKey> = {
  charge: 'invoice.items.chargeAll',
  labour_rate: 'invoice.items.labourAll',
  tax: 'invoice.items.taxAll',
};
/** The visible label of a shared row: "Labour (₹) (all lines)", or the plain heading for a group of one line. */
export const sharedLabel = (field: RateField, lines: number): string => (lines >= 2 ? tr(ALL_LINES[field]) : fieldHeading(field));

const KEEP_OWN: Record<RateField, TranslationKey> = {
  charge: 'invoice.items.keepOwnCharge',
  labour_rate: 'invoice.items.keepOwnLabour',
  tax: 'invoice.items.keepOwnTax',
};
export const keepOwnNote = (field: RateField, count: number): string => tr(KEEP_OWN[field], { count });
