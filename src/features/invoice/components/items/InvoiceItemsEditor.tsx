/**
 * The invoice's items step as an editable table (style guide 13.7, "Editable tables"), after the
 * rate box of Item pricing.
 *
 * Each item + mark group is one card with its total in the heading. Under the heading come one part
 * for what all lines share (Charge for 2 or more lines, Labour and Tax: side by side in one row, each
 * with − / + under it, or stacked when the columns would not fit; SharedRateRow.tsx), the group total, and a toggle,
 * "Show dispatch details (N)". The dispatch lines are closed by default (a group of one line starts
 * open, since it has no "(all lines)" Charge row) and open at the bottom of the card: a table that
 * fits the screen (Dispatch | Charge ₹ | Amount, its columns described with the app's TanStack
 * column model, lineColumns.ts) with the Charge typed in its cell, or, from font scale 1.3 or when the
 * columns would crowd the first one, one small card per line. Where the lines differ in labour or tax
 * each line shows its own. Opening and closing has no animation: the rows are virtualized.
 *
 * The page is one keyboard-aware, virtualized FlashList. A card is drawn as several list rows
 * (head, shared part, total, toggle and, while open, column headings and one row per line; the last
 * part draws the card's bottom edge), so a change that adds, removes or resizes a part changes the
 * rows of that group only, and every part keeps its own key. A closed group draws no line rows, so the
 * Next key walks only the fields that are shown.
 *
 * What is typed: a valid number is applied at once, so the amounts follow the keys. Text that is
 * refused (out of range, more than 2 decimals, a minus sign, not a number) is kept in the field
 * but never counted: the value the field had when it gained focus is the one the form holds, so
 * no total ever shows a refused or partial value. The error shows when the field is left (also when
 * the keyboard hides, or when its group is closed), or when Next is pressed, which counts refused
 * text in every group, closed ones too; it opens the group of the first wrong field, scrolls to it and
 * focuses it. The field shows its text as typed while it has the focus. The layout (table or cards)
 * is held while any field has the focus and looked at again a moment after it is left (so is the choice
 * between the shared row and the stack, which comes from the same held layout).
 *
 * A − / + press under a shared field (`actions.step`) leaves the focused field first, as the keyboard
 * hiding does, then applies the stepped figure through the same `commit` as typing; no keyboard opens.
 * The + / − beside a dispatch line's own figure (`actions.stepCell`, LineStepper.tsx) do the same for that line's
 * cell: the press is what typing and accepting the figure in the cell does, so the line keeps its own figure
 * (`onItemUpdate`, which records the line's override). Both go through `stepKey`.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTableLayout } from '@/components/common/DetailTable';
import { useAppTable } from '@/components/table/appTable';
import { KeyboardAwareFlashList } from '@/components/lists/KeyboardAwareFlashList';
import { useScreenReader } from '@/hooks/useScreenReader';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { getLanguage, localizeDigits, t as tr } from '@/i18n';
import { iconSize } from '@/theme/tokens';
import { useAppSelector } from '@/store/hooks';
import { selectInvoiceFormBulkPricing } from '@/store/slices/invoiceFormSlice';
import type { GroupRates, InvoiceItemData } from '@/types/invoice.types';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { parseRateInput } from '@/features/invoice/utils/amountInput';
import {
  groupInvoiceItems,
  groupKeyOf,
  invoiceGroupTotals,
  type InvoiceItemGroup,
} from '@/features/invoice/utils/groupInvoiceItems';
import { GroupHead } from './GroupHead';
import { LineCard } from './LineCard';
import { LineRow } from './LineRow';
import { SharedBlock } from './SharedRateRow';
import { ColumnHeadings, GroupToggle, GroupTotal } from './TableParts';
import { lineColumnDefs, lineColumnsOf } from './lineColumns';
import { groupIsCards, itemsLayout, sameLayout, sharedSideBySide, type ItemsLayout } from './itemsLayout';
import {
  cellKey,
  fieldHeading,
  groupFieldKey,
  groupView,
  lineView,
  linesDifferInLabourOrTax,
  parseKey,
  planRows,
  samePlan,
  RATE_FIELDS,
  rateText,
  settle,
  sharedFieldsOf,
  stepDoneText,
  stepperState,
  steppedValue,
  type FieldState,
  type GroupMode,
  type GroupView,
  type ItemsActions,
  type ItemsRow,
  type RateField,
  type RowPlan,
  type SharedView,
  type StepDirection,
} from './itemsModel';
import { makeItemsStyles } from './itemsStyles';
import { useFieldWalk, useRefFactory } from './useFieldWalk';

export interface EditPricingParams {
  item_id: string;
  item_name: string;
  /** The tapped group's mark: with the item it tells the group's own lines (and their received days) from other groups. */
  package_mark: string;
  weight: number;
  charge: number;
  labour_rate: number;
  tax: number;
}

export interface RestoredRates {
  temp_id: string;
  charge: number;
  labour_rate: number;
  tax: number;
}

export interface InvoiceItemsEditorHandle {
  /**
   * Next: counts the fields whose text is refused, shows their errors, announces the count and
   * focuses the first one (scrolling it in if the list has not drawn it). 0 means all is well.
   */
  checkAll: () => number;
}

interface Props {
  items: InvoiceItemData[];
  /** The GRN is priced once: no duration, no labour. */
  oneTime?: boolean;
  /** The rates typed on a line itself, by line: a rate for the whole group skips them. */
  itemOverrides?: Record<string, string[]>;
  onItemUpdate: (tempId: string, field: string, value: number) => void;
  /** A group field was typed: the one rate to set on the group's lines. The other rates are not passed on. */
  onBulkEdit: (groupKey: string, pricing: GroupRates) => void;
  /**
   * Sets rates line by line without marking them typed (puts a group's lines back when its text is
   * refused). Required: without it a refused "(all lines)" value over "Mixed" lines could not be undone.
   */
  onRestoreRates: (rates: RestoredRates[]) => void;
  onEditPricing?: (params: EditPricingParams) => void;
  /** The screen's content above the groups. */
  ListHeaderComponent?: React.ReactElement | null;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

interface FocusRecord {
  /** The value the field had when it gained focus. */
  value: number;
  /** A group field: the lines it can change, as they were. */
  snapshot?: Array<{ temp_id: string; value: number }>;
  /** A group field: the rate that was applied to the group, if any (undoing the lines must not forget it). */
  applied?: number;
  /** Something other than that value was handed to the form since. */
  sent: boolean;
}

const rowKey = (row: ItemsRow) => row.key;
const rowType = (row: ItemsRow) => row.type;
const EMPTY_MAP: Record<string, string[]> = {};
/**
 * The text of one figure column, each distinct value formatted once (the text depends on the value
 * alone, and the layout only takes the widest text of a column, so repeats add nothing).
 */
function distinctTexts<T, V>(lines: readonly T[], valueOf: (line: T) => V, format: (value: V) => string): string[] {
  const values = new Set<V>();
  lines.forEach((line) => values.add(valueOf(line)));
  return Array.from(values, (value) => format(value));
}

/** The line tables' column model needs no rows: the rows are the list's own. */
const NO_LINES: InvoiceItemData[] = [];
/** How long after a field is left the layout may change again (a move to the next field comes sooner). */
const SETTLE_MS = 150;
/**
 * Where a row the walk scrolls to sits in the visible area, from its top (0) to its bottom (1): near the
 * top, so it is above the keyboard, which covers the lower part of the screen.
 */
export const SCROLL_VIEW_POSITION = 0.15;

/** "Potatoes, mark A12": the item with its mark, as a screen reader says it. */
const spokenItemOf = (group: InvoiceItemGroup): string => {
  const mark = group.package_mark?.trim() ?? '';
  return [group.item_name, mark ? tr('invoice.items.markA11y', { mark }) : null].filter(Boolean).join(', ');
};

export const InvoiceItemsEditor = React.memo(forwardRef<InvoiceItemsEditorHandle, Props>(function InvoiceItemsEditor(
  { items, oneTime = false, itemOverrides = EMPTY_MAP, onItemUpdate, onBulkEdit, onRestoreRates, onEditPricing, ListHeaderComponent, style, contentContainerStyle },
  ref
) {
  const styles = useThemedStyles(makeItemsStyles);
  const t = useTokens();
  const table = useTableLayout();
  const { fontScale } = useWindowDimensions();
  const language = getLanguage();
  const bulkPricing = useAppSelector(selectInvoiceFormBulkPricing);

  // Groups, with the lines of a group that did not change kept as they were.
  const previous = useRef<{ groups: InvoiceItemGroup[]; totals: Map<string, number> } | undefined>(undefined);
  const { groups, totals } = useMemo(() => {
    const next = groupInvoiceItems(items, previous.current?.groups);
    return { groups: next, totals: invoiceGroupTotals(next, previous.current) };
  }, [items]);
  useEffect(() => {
    previous.current = { groups, totals };
  }, [groups, totals]);

  const { groupsByKey, itemsById, groupOfLine } = useMemo(() => {
    const byKey = new Map<string, InvoiceItemGroup>();
    const byId = new Map<string, InvoiceItemData>();
    const groupOf = new Map<string, string>();
    groups.forEach((group) => {
      const groupKey = groupKeyOf(group);
      byKey.set(groupKey, group);
      group.allItems.forEach((line) => {
        byId.set(line.temp_id, line);
        groupOf.set(line.temp_id, groupKey);
      });
    });
    return { groupsByKey: byKey, itemsById: byId, groupOfLine: groupOf };
  }, [groups]);

  // Which groups show their dispatch lines. Every group starts closed when the step is first drawn (coming back from Review keeps them as they were), except a
  // group of one line (it has no "(all lines)" Charge row, so its charge could not be changed otherwise).
  // Only what the user toggled is kept; the rest follows the line count.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const openSet = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((group) => {
      const groupKey = groupKeyOf(group);
      if (toggled[groupKey] ?? group.allItems.length === 1) set.add(groupKey);
    });
    return set;
  }, [groups, toggled]);
  // The field Next found wrong in a closed group: focused once that group's rows are in the list.
  const focusAfterOpen = useRef<string | null>(null);

  // The layout (widths, table or cards) is worked out from a snapshot of the items that follows them
  // only while nothing is being touched or typed in. A key press that widens a figure would otherwise
  // move the column under the finger, turn the table into cards and drop the keyboard. From the touch
  // down on a cell until a moment after it is left the snapshot is frozen; a figure that is wider than
  // its column meanwhile may be cut with "…" until then. A change of the screen (width, text size) is not
  // held. The same layout object is kept while nothing in it changed, so memoized rows keep their props.
  const typing = useRef(false);
  const focusedKey = useRef<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, relayout] = useReducer((count: number) => count + 1, 0);
  const snapshot = useRef(items);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  if (!typing.current) snapshot.current = items;
  const layoutItems = snapshot.current;
  const liveLayout = useMemo(
    () =>
      itemsLayout(
        table,
        fontScale,
        {
          charge: distinctTexts(layoutItems, (line) => line.charge, (v) => rateText('charge', v)),
          labour: distinctTexts(layoutItems, (line) => line.labour_rate, (v) => rateText('labour_rate', v)),
          tax: distinctTexts(layoutItems, (line) => line.tax, (v) => rateText('tax', v)),
          amount: distinctTexts(layoutItems, (line) => line.item_total, (v) => formatInvoiceAmount(v)),
        },
        {
          charge: fieldHeading('charge'),
          labour: fieldHeading('labour_rate'),
          tax: fieldHeading('tax'),
          amount: tr('invoice.items.colAmount'),
        }
      ),
    [table, fontScale, layoutItems, language]
  );
  const held = useRef(liveLayout);
  if (!sameLayout(held.current, liveLayout)) held.current = liveLayout;
  // While a screen reader is on the lines are cards: TalkBack's explore-by-touch does not reach a table
  // cell (its wrapper ignores touches, which Android's view group also applies to the hover events), while
  // a card's input takes them. Like a change of text size, a switch while the step is open is not held.
  const screenReader = useScreenReader();
  const heldLayout = held.current;
  const layout = useMemo<ItemsLayout>(
    () => (screenReader && !heldLayout.cards ? { ...heldLayout, cards: true, rateColumns: false } : heldLayout),
    [screenReader, heldLayout]
  );
  const mounted = useRef(true);
  useEffect(() => {
    // Set again here: StrictMode mounts, cleans up and mounts again.
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(settleTimer.current);
    };
  }, []);

  // A group whose lines differ in labour or tax shows them line by line, and keeps doing so while
  // it is on the screen: typing a line's labour equal to the others must not take the field away.
  const perLineGroups = useRef(new Set<string>()).current;
  // The plan holds no figures, so while only a figure changes the earlier plan is kept: the list gets the
  // same data and does not lay its rows out again (the rows read their figures when they are drawn).
  const keptPlan = useRef<RowPlan | undefined>(undefined);
  const { plan, modes } = useMemo(() => {
    const byGroup = new Map<string, GroupMode>();
    const modeOf = (group: InvoiceItemGroup): GroupMode => {
      const groupKey = groupKeyOf(group);
      if (linesDifferInLabourOrTax(group)) perLineGroups.add(groupKey);
      const perLine = perLineGroups.has(groupKey);
      const mode = { perLine, cards: groupIsCards(layout, perLine) };
      byGroup.set(groupKey, mode);
      return mode;
    };
    const built = planRows(groups, modeOf, oneTime, openSet);
    const kept = keptPlan.current && samePlan(keptPlan.current, built) ? keptPlan.current : built;
    keptPlan.current = kept;
    return { plan: kept, modes: byGroup };
  }, [groups, layout, oneTime, perLineGroups, openSet]);

  // The line table's columns: TanStack decides the headings, widths and which cells a row has; the rows
  // themselves are parts of this list, so only the rows on screen are drawn. `useAppTable` returns a new
  // object on every render, so the memos below follow the column definitions only (useTable has already
  // set the new columns on the table during this render, so reading them here is current).
  const plainColumns = useMemo(() => lineColumnDefs(layout.widths, false, oneTime), [layout.widths, oneTime, language]);
  const perLineColumns = useMemo(() => lineColumnDefs(layout.widths, true, oneTime), [layout.widths, oneTime, language]);
  const plainTable = useAppTable({ data: NO_LINES, columns: plainColumns });
  const perLineTable = useAppTable({ data: NO_LINES, columns: perLineColumns });
  const plainCols = useMemo(() => lineColumnsOf(plainTable), [plainColumns]); // eslint-disable-line react-hooks/exhaustive-deps
  const perLineCols = useMemo(() => lineColumnsOf(perLineTable), [perLineColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each group's view is the same object while its figures are the same, so its rows are not drawn again.
  const viewCache = useRef(new Map<string, GroupView>());
  const views = useMemo(() => {
    const result = new Map<string, GroupView>();
    groups.forEach((group) => {
      const groupKey = groupKeyOf(group);
      const next = groupView(group, bulkPricing[groupKey], itemOverrides);
      const before = viewCache.current.get(groupKey);
      if (!before) {
        result.set(groupKey, next);
        return;
      }
      const same = {} as GroupView;
      RATE_FIELDS.forEach((field) => {
        const a = before[field];
        const b = next[field];
        same[field] = a.text === b.text && a.mixed === b.mixed && a.keepOwn === b.keepOwn ? a : b;
      });
      result.set(groupKey, RATE_FIELDS.every((field) => same[field] === before[field]) ? before : same);
    });
    viewCache.current = result;
    return result;
  }, [groups, bulkPricing, itemOverrides]);

  // The text and error of every field that differs from the stored rate.
  const [fields, setFields] = useState<Record<string, FieldState>>({});

  // How many figures of each group's lines hold refused text; a closed group says so on its toggle.
  const refusedByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    Object.keys(fields).forEach((key) => {
      if (!fields[key].error) return;
      const parsed = parseKey(key);
      const groupKey = parsed.kind === 'cell' ? groupOfLine.get(parsed.id) : undefined;
      if (groupKey) counts.set(groupKey, (counts.get(groupKey) ?? 0) + 1);
    });
    return counts;
  }, [fields, groupOfLine]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const focusRecords = useRef(new Map<string, FocusRecord>()).current;

  // A field that is no longer in the invoice (its line or group left it, or an "(all lines)"
  // row gave way to the lines' own) takes its text and error with it, so Next is never refused for
  // a field nobody can reach. A closed group keeps its refused text.
  useEffect(() => {
    // Every field of the invoice counts as present, also those of a closed group's lines (not in `rowOf`).
    const present = new Set(plan.allOrder);
    setFields((prev) => {
      const keys = Object.keys(prev).filter((key) => !present.has(key));
      if (keys.length === 0) return prev;
      const next = { ...prev };
      keys.forEach((key) => delete next[key]);
      return next;
    });
    Array.from(focusRecords.keys()).filter((key) => !present.has(key)).forEach((key) => focusRecords.delete(key));
  }, [plan, focusRecords]);

  const listRef = useRef<{ scrollToIndex: (params: { index: number; animated?: boolean; viewPosition?: number; viewOffset?: number }) => Promise<void> | void } | null>(null);
  // Where a stacked "(all lines)" field starts below the top of its row (set by the block while the fields are stacked,
  // removed when they are side by side): all three fields of a block share one row index, and the keyboard covers
  // the lower part of the screen, so the walk scrolls further down the row for a field below the first.
  const stackedOffsets = useRef(new Map<string, number>()).current;
  const walk = useFieldWalk({
    order: plan.order,
    rowOf: plan.rowOf,
    scrollToRow: (index, key) => {
      const offset = key === undefined ? 0 : stackedOffsets.get(key) ?? 0;
      listRef.current?.scrollToIndex({ index, animated: false, viewPosition: SCROLL_VIEW_POSITION, ...(offset > 0 ? { viewOffset: -offset } : {}) });
    },
  });

  // The latest props and state, for the actions below.
  const latest = useRef({ openSet, groupOfLine, itemsById, groupsByKey, itemOverrides, bulkPricing, views, onItemUpdate, onBulkEdit, onRestoreRates, onEditPricing, plan, walk });
  latest.current = { openSet, groupOfLine, itemsById, groupsByKey, itemOverrides, bulkPricing, views, onItemUpdate, onBulkEdit, onRestoreRates, onEditPricing, plan, walk };

  // Next found a wrong field in a closed group and opened it: now its row is in the plan, scroll to it and focus it.
  useEffect(() => {
    const key = focusAfterOpen.current;
    if (key !== null && plan.rowOf.has(key)) {
      focusAfterOpen.current = null;
      latest.current.walk.focusKey(key);
    }
  }, [plan]);

  /**
   * The field is left, gone, or its press ended: the layout may change again a moment later, unless
   * another field has taken (or is about to take) the focus.
   */
  const released = useCallback((key?: string) => {
    if (key !== undefined && focusedKey.current === key) focusedKey.current = null;
    if (!typing.current) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (focusedKey.current !== null || latest.current.walk.anyFocused()) return;
      typing.current = false;
      // Nothing to look at again when the items are the ones the layout was made from.
      if (itemsRef.current !== snapshot.current) relayout();
    }, SETTLE_MS);
  }, []);

  // The keyboard goes away (the Android Back key): the field it was for lets go of the focus, so its
  // error shows and the next tap selects its text again.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      const key = focusedKey.current;
      if (key) latest.current.walk.blurKey(key);
    });
    return () => subscription.remove();
  }, []);

  const dropIfValid = useCallback((key: string) => {
    // Called only for a field whose ref was released and not set again at once (the native text input
    // releases and sets the ref on every key, which `useRefFactory` does not pass on): the field is gone.
    // A field that is only focused is never dropped here, so what is typed is not taken away.
    if (!mounted.current) return;
    released(key);
    setFields((prev) => {
      const state = prev[key];
      if (!state || settle(parseKey(key).field, state.text).error) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [released]);
  const refFor = useRefFactory(walk.register, dropIfValid);

  const actions = useMemo<ItemsActions>(() => {
    /** What the field holds now, noted once per focus. */
    const recordOf = (key: string): FocusRecord => {
      const known = focusRecords.get(key);
      if (known) return known;
      const { kind, id, field } = parseKey(key);
      const { itemsById: byId, groupsByKey: byKey, itemOverrides: overrides } = latest.current;
      const record: FocusRecord =
        kind === 'cell'
          ? { value: byId.get(id)?.[field] ?? 0, sent: false }
          : {
              value: 0,
              applied: latest.current.bulkPricing[id]?.[field],
              snapshot: (byKey.get(id)?.allItems ?? [])
                .filter((line) => !(overrides[line.temp_id] ?? []).includes(field))
                .map((line) => ({ temp_id: line.temp_id, value: line[field] })),
              sent: false,
            };
      focusRecords.set(key, record);
      return record;
    };

    const commit = (key: string, value: number) => {
      const { kind, id, field } = parseKey(key);
      if (kind === 'cell') latest.current.onItemUpdate(id, field, value);
      else latest.current.onBulkEdit(id, { [field]: value });
    };

    /** Puts the form back to what the field held when it gained focus. */
    const revert = (key: string, record: FocusRecord) => {
      const { kind, id, field } = parseKey(key);
      if (kind === 'cell') {
        latest.current.onItemUpdate(id, field, record.value);
        return;
      }
      const snapshot = record.snapshot ?? [];
      const { onRestoreRates: restore, onBulkEdit: bulk, itemsById: byId } = latest.current;
      const rates: RestoredRates[] = [];
      snapshot.forEach(({ temp_id, value }) => {
        const line = byId.get(temp_id);
        if (line) rates.push({ temp_id, charge: line.charge, labour_rate: line.labour_rate, tax: line.tax, [field]: value });
      });
      restore(rates);
      // Putting the lines back forgets the rate applied to the group; it was not changed, so it is applied again
      // (the lines already have it, and the lines with their own rate keep theirs).
      if (record.applied !== undefined) bulk(id, { [field]: record.applied });
    };

    /**
     * A + / − press for the field `key` (the "(all lines)" field of a group, or the cell of one line), stepping from `view`.
     * A burst of presses holds the layout as typing does; it is looked at once, SETTLE_MS after the last press.
     */
    const stepKey = (key: string, field: RateField, direction: StepDirection, view: SharedView | undefined) => {
      typing.current = true;
      clearTimeout(settleTimer.current);
      const { walk: fieldWalk } = latest.current;
      if (!view) {
        released();
        return;
      }
      // Not while the field is "Mixed" or holds refused text (the buttons are disabled then too), or at an end.
      const before = stepperState(field, view, fieldsRef.current[key]);
      if (before.value === null || !(direction < 0 ? before.canDecrease : before.canIncrease)) {
        released();
        return;
      }
      // A field with the focus is left first, as the keyboard hiding does: its text is settled and its error shown.
      // The keyboard is not opened for the press.
      const focused = focusedKey.current;
      if (focused) {
        fieldWalk.blurKey(focused);
        api.blur(focused);
      }
      const next = steppedValue(field, before.value, direction);
      // The same path as an accepted entry in the field (`commit`): for a group field one rate for the group, lines with
      // their own keep theirs; for a line's cell that line's own figure.
      setFields((prev) => {
        const state = prev[key];
        if (!state || settle(field, state.text).error) return prev;
        const rest = { ...prev };
        delete rest[key];
        return rest;
      });
      commit(key, next);
      AccessibilityInfo.announceForAccessibility(stepDoneText(field, next, localizeDigits));
      released();
    };

    const api: ItemsActions = {
      focus: (key) => {
        typing.current = true;
        focusedKey.current = key;
        clearTimeout(settleTimer.current);
        focusRecords.delete(key);
        recordOf(key);
      },

      change: (key, typed) => {
        const { field } = parseKey(key);
        const record = recordOf(key);
        const parsed = parseRateInput(field, typed);
        setFields((prev) => ({ ...prev, [key]: { text: parsed.text, error: parsed.error, shown: false } }));
        if (parsed.value !== null) {
          record.sent = true;
          commit(key, parsed.value);
        } else if (record.sent) {
          // Refused or unfinished: no total uses it; the form holds what the field held on focus.
          record.sent = false;
          revert(key, record);
        }
      },

      hold: (key, held) => {
        if (held) {
          typing.current = true;
          clearTimeout(settleTimer.current);
        } else {
          // A touch that is not a tap (a swipe over the cells) ends here; a tap has the focus by then.
          released();
        }
      },

      start: (key) => latest.current.walk.scrollTo(key),

      blur: (key) => {
        released(key);
        focusRecords.delete(key);
        const { field } = parseKey(key);
        setFields((prev) => {
          const state = prev[key];
          if (!state) return prev;
          const settled = settle(field, state.text);
          if (!settled.error) {
            const next = { ...prev };
            delete next[key];
            return next;
          }
          return { ...prev, [key]: { text: state.text, error: settled.error, shown: true } };
        });
      },

      submit: (key) => latest.current.walk.next(key),

      toggle: (groupKey) => {
        const { openSet: openNow, groupOfLine: groupOf, walk: fieldWalk } = latest.current;
        const isOpen = openNow.has(groupKey);
        if (isOpen) {
          // Closing: a cell of this group with the focus is left first, like the keyboard hiding does, so its text
          // is settled and its error shown before the cell goes.
          const key = focusedKey.current;
          if (key) {
            const parsed = parseKey(key);
            if (parsed.kind === 'cell' && groupOf.get(parsed.id) === groupKey) {
              fieldWalk.blurKey(key);
              api.blur(key);
            }
          }
        }
        setToggled((prev) => ({ ...prev, [groupKey]: !isOpen }));
      },

      stackedOffset: (key, offset) => {
        if (offset === null) stackedOffsets.delete(key);
        else stackedOffsets.set(key, offset);
      },

      step: (groupKey, field, direction) => stepKey(groupFieldKey(groupKey, field), field, direction, latest.current.views.get(groupKey)?.[field]),

      stepCell: (tempId, field, direction) => {
        const line = latest.current.itemsById.get(tempId);
        stepKey(cellKey(tempId, field), field, direction, line ? lineView(field, line[field]) : undefined);
      },

      editPricing: (groupKey) => {
        const { onEditPricing: open, groupsByKey: byKey } = latest.current;
        const group = byKey.get(groupKey);
        // The first line's values, and its weight: the price that opens is the one of that weight.
        const first = group?.allItems[0];
        if (!open || !group || !first) return;
        open({
          item_id: group.item_id,
          item_name: group.item_name,
          package_mark: group.package_mark,
          weight: first.weight,
          charge: first.charge,
          labour_rate: first.labour_rate,
          tax: first.tax,
        });
      },

      refFor,
    };
    return api;
  }, [focusRecords, refFor, released]);

  useImperativeHandle(
    ref,
    () => ({
      checkAll: () => {
        const current = fieldsRef.current;
        // Every field of the invoice counts, those of closed groups too; a refused text of a row that has gone cannot block Next.
        const order = latest.current.plan.allOrder;
        const place = new Map(order.map((key, index) => [key, index] as const));
        const wrong = Object.keys(current)
          .filter((key) => place.has(key) && settle(parseKey(key).field, current[key].text).error)
          .sort((a, b) => place.get(a)! - place.get(b)!);
        if (wrong.length === 0) return 0;
        setFields((prev) => {
          const next = { ...prev };
          wrong.forEach((key) => {
            next[key] = { text: prev[key].text, error: settle(parseKey(key).field, prev[key].text).error, shown: true };
          });
          return next;
        });
        AccessibilityInfo.announceForAccessibility(tr('invoice.items.fixRates', { count: wrong.length }));
        const first = wrong[0];
        if (latest.current.plan.rowOf.has(first)) {
          latest.current.walk.focusKey(first);
        } else {
          // The first wrong field is in a closed group: open it; the effect above scrolls to the field and focuses it.
          const parsed = parseKey(first);
          const groupKey = parsed.kind === 'cell' ? latest.current.groupOfLine.get(parsed.id) : parsed.id;
          if (groupKey) {
            focusAfterOpen.current = first;
            setToggled((prev) => ({ ...prev, [groupKey]: true }));
          }
        }
        return wrong.length;
      },
    }),
    []
  );

  const canEditPricing = !!onEditPricing;
  // The keyboard's key says "done" on the last field of the page and "next" on every other.
  const lastKey = plan.order[plan.order.length - 1];
  const renderRow = useCallback(
    ({ item: row }: { item: ItemsRow }) => {
      const group = groupsByKey.get(row.groupKey);
      if (!group) return null;
      const mode = modes.get(row.groupKey)!;
      switch (row.type) {
        case 'head':
          return (
            <GroupHead
              group={group}
              groupKey={row.groupKey}
              total={totals.get(row.groupKey) ?? 0}
              canEditPricing={canEditPricing}
              showHint={mode.cards || !openSet.has(row.groupKey)}
              actions={actions}
              styles={styles}
            />
          );
        case 'cols':
          return <ColumnHeadings groupKey={row.groupKey} columns={row.perLine ? perLineCols : plainCols} styles={styles} />;
        case 'line': {
          const line = itemsById.get(row.tempId);
          if (!line) return null;
          return (
            <LineRow
              item={line}
              columns={row.perLine ? perLineCols : plainCols}
              oneTime={oneTime}
              last={row.last}
              charge={fields[cellKey(line.temp_id, 'charge')]}
              labour={fields[cellKey(line.temp_id, 'labour_rate')]}
              tax={fields[cellKey(line.temp_id, 'tax')]}
              lastKey={lastKey}
              actions={actions}
              styles={styles}
            />
          );
        }
        case 'card': {
          const line = itemsById.get(row.tempId);
          if (!line) return null;
          return (
            <LineCard
              item={line}
              perLine={row.perLine}
              oneTime={oneTime}
              last={row.last}
              charge={fields[cellKey(line.temp_id, 'charge')]}
              labour={fields[cellKey(line.temp_id, 'labour_rate')]}
              tax={fields[cellKey(line.temp_id, 'tax')]}
              lastKey={lastKey}
              actions={actions}
              styles={styles}
            />
          );
        }
        case 'block': {
          const stateOf = (field: RateField): FieldState | undefined => fields[groupFieldKey(row.groupKey, field)];
          return (
            <SharedBlock
              groupKey={row.groupKey}
              itemName={group.item_name}
              fields={row.fields}
              spokenItem={spokenItemOf(group)}
              oneTime={oneTime}
              views={views.get(row.groupKey)!}
              charge={stateOf('charge')}
              labour={stateOf('labour_rate')}
              tax={stateOf('tax')}
              heading={row.lines >= 2 ? tr('invoice.items.allDispatches') : null}
              sideBySide={sharedSideBySide(layout, row.fields.length)}
              lastKey={lastKey}
              actions={actions}
              styles={styles}
            />
          );
        }
        case 'total':
          return <GroupTotal groupKey={row.groupKey} lines={group.allItems.length} total={totals.get(row.groupKey) ?? 0} styles={styles} />;
        case 'toggle': {
          return <GroupToggle groupKey={row.groupKey} spokenItem={spokenItemOf(group)} lines={row.lines} open={row.open} refused={row.open ? 0 : refusedByGroup.get(row.groupKey) ?? 0} actions={actions} styles={styles} />;
        }
      }
    },
    [groupsByKey, modes, totals, canEditPricing, actions, styles, layout, oneTime, itemsById, fields, views, lastKey, plainCols, perLineCols, refusedByGroup, openSet]
  );

  // FlashList spreads its style into an object: it takes one plain style, not an array.
  const listStyle = useMemo(() => StyleSheet.flatten(style), [style]);
  const listContentStyle = useMemo(() => {
    const { gap: _gap, rowGap: _rowGap, columnGap: _columnGap, ...rest } = StyleSheet.flatten(contentContainerStyle) ?? {};
    return rest;
  }, [contentContainerStyle]);
  const setListRef = useCallback((list: unknown) => {
    listRef.current = list as typeof listRef.current;
  }, []);

  return (
    <KeyboardAwareFlashList
      data={plan.rows}
      extraData={fields}
      renderItem={renderRow}
      keyExtractor={rowKey}
      getItemType={rowType}
      innerRef={setListRef}
      ListHeaderComponent={ListHeaderComponent ? <View style={styles.listHeader}>{ListHeaderComponent}</View> : null}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Icon name="table-off" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyTitle}>{tr('invoice.form.noItemsTitle')}</Text>
          <Text style={styles.emptyText}>{tr('invoice.items.emptyText')}</Text>
        </View>
      }
      style={listStyle}
      contentContainerStyle={listContentStyle}
      showsVerticalScrollIndicator
      enableAutomaticScroll
      extraScrollHeight={120}
      keyboardShouldPersistTaps="handled"
      // A drag closes the keyboard, which blurs the field (useBlurOnKeyboardHide): no focus stays on a view that scrolls away.
      keyboardDismissMode="on-drag"
    />
  );
}));

export default InvoiceItemsEditor;
