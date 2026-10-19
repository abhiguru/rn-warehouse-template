/**
 * The invoice's items step as an editable table (style guide 13.7, "Editable tables"), after the
 * rate box of Item pricing.
 *
 * Each item + mark group is one card with its total in the heading. Its lines are always shown, in
 * a table that fits the screen (Dispatch | Qty | Charge ₹ | Amount) with the Charge typed in its
 * cell, or, from font scale 1.3 or when the columns would crowd the first one, as one small card
 * per line. Under the lines come rows for what all lines share: Charge (2 or more lines), Labour
 * and Tax. Where the lines differ in labour or tax each line shows its own.
 *
 * The page is one keyboard-aware, virtualized FlashList. A card is drawn as several list rows
 * (head, column headings, one row per line, shared rows, total), so a change that adds, removes or
 * resizes a part (table or cards, an error line, the "Mixed" note) changes the rows of that group
 * only, and every part keeps its own key.
 *
 * What is typed: a valid number is applied at once, so the amounts follow the keys. Text that is
 * refused (out of range, more than 2 decimals, a minus sign, not a number) is kept in the field
 * but never counted: the value the field had when it gained focus is the one the form holds, so
 * no total ever shows a refused or partial value. The error shows when the field is left (also when
 * the keyboard hides), or when Next is pressed, which also scrolls to the first wrong field and
 * focuses it. The field shows its text as typed while it has the focus. The layout (table or cards)
 * is held while any field has the focus and looked at again a moment after it is left.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTableLayout } from '@/components/common/DetailTable';
import { KeyboardAwareFlashList } from '@/components/lists/KeyboardAwareFlashList';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { getLanguage, t as tr } from '@/i18n';
import { iconSize } from '@/theme/tokens';
import { useAppSelector } from '@/store/hooks';
import { selectInvoiceFormBulkPricing } from '@/store/slices/invoiceFormSlice';
import type { GroupRates, InvoiceItemData } from '@/types/invoice.types';
import { formatNumber } from '@/utils/formatters';
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
import { SharedBlock, SharedRateRow } from './SharedRateRow';
import { ColumnHeadings, GroupTotal } from './TableParts';
import { groupIsCards, itemsLayout, sameLayout } from './itemsLayout';
import {
  cellKey,
  fieldHeading,
  groupFieldKey,
  groupView,
  linesDifferInLabourOrTax,
  parseKey,
  planRows,
  RATE_FIELDS,
  rateText,
  settle,
  sharedFieldsOf,
  type FieldState,
  type GroupMode,
  type GroupView,
  type ItemsActions,
  type ItemsRow,
  type RateField,
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
/** How long after a field is left the layout may change again (a move to the next field comes sooner). */
const SETTLE_MS = 150;
/**
 * Where a row the walk scrolls to sits in the visible area, from its top (0) to its bottom (1): near the
 * top, so it is above the keyboard, which covers the lower part of the screen.
 */
export const SCROLL_VIEW_POSITION = 0.15;

export const InvoiceItemsEditor = forwardRef<InvoiceItemsEditorHandle, Props>(function InvoiceItemsEditor(
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

  const { groupsByKey, itemsById } = useMemo(() => {
    const byKey = new Map<string, InvoiceItemGroup>();
    const byId = new Map<string, InvoiceItemData>();
    groups.forEach((group) => {
      byKey.set(groupKeyOf(group), group);
      group.allItems.forEach((line) => byId.set(line.temp_id, line));
    });
    return { groupsByKey: byKey, itemsById: byId };
  }, [groups]);

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
          qty: layoutItems.map((line) => formatNumber(line.qty)),
          charge: layoutItems.map((line) => rateText('charge', line.charge)),
          labour: layoutItems.map((line) => rateText('labour_rate', line.labour_rate)),
          tax: layoutItems.map((line) => rateText('tax', line.tax)),
          amount: layoutItems.map((line) => formatInvoiceAmount(line.item_total)),
        },
        {
          qty: tr('invoice.lineItem.colQty'),
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
  const layout = held.current;
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  // A group whose lines differ in labour or tax shows them line by line, and keeps doing so while
  // it is on the screen: typing a line's labour equal to the others must not take the field away.
  const perLineGroups = useRef(new Set<string>()).current;
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
    return { plan: planRows(groups, modeOf, oneTime), modes: byGroup };
  }, [groups, layout, oneTime, perLineGroups]);

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
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const focusRecords = useRef(new Map<string, FocusRecord>()).current;

  // A field that is no longer on the screen (its line or group left the invoice, or an "(all lines)"
  // row gave way to the lines' own) takes its text and error with it, so Next is never refused for
  // a field nobody can see.
  useEffect(() => {
    const present = plan.rowOf;
    setFields((prev) => {
      const keys = Object.keys(prev).filter((key) => !present.has(key));
      if (keys.length === 0) return prev;
      const next = { ...prev };
      keys.forEach((key) => delete next[key]);
      return next;
    });
    Array.from(focusRecords.keys()).filter((key) => !present.has(key)).forEach((key) => focusRecords.delete(key));
  }, [plan, focusRecords]);

  const listRef = useRef<{ scrollToIndex: (params: { index: number; animated?: boolean; viewPosition?: number }) => Promise<void> | void } | null>(null);
  const walk = useFieldWalk({
    order: plan.order,
    rowOf: plan.rowOf,
    scrollToRow: (index) => {
      listRef.current?.scrollToIndex({ index, animated: false, viewPosition: SCROLL_VIEW_POSITION });
    },
  });

  // The latest props and state, for the actions below.
  const latest = useRef({ itemsById, groupsByKey, itemOverrides, bulkPricing, onItemUpdate, onBulkEdit, onRestoreRates, onEditPricing, plan, walk });
  latest.current = { itemsById, groupsByKey, itemOverrides, bulkPricing, onItemUpdate, onBulkEdit, onRestoreRates, onEditPricing, plan, walk };

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
    // The field that has the focus keeps its entry whatever happens to its ref (a row that is drawn
    // again releases and sets it): what is typed is not taken away from the person typing.
    const hasFocus = focusedKey.current === key;
    released(key);
    if (hasFocus) return;
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

    return {
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
  }, [focusRecords, refFor, released]);

  useImperativeHandle(
    ref,
    () => ({
      checkAll: () => {
        const current = fieldsRef.current;
        const order = latest.current.plan.order;
        const wrong = Object.keys(current)
          // Only fields on the screen count: a refused text of a row that has gone cannot block Next.
          .filter((key) => order.includes(key) && settle(parseKey(key).field, current[key].text).error)
          .sort((a, b) => order.indexOf(a) - order.indexOf(b));
        if (wrong.length === 0) return 0;
        setFields((prev) => {
          const next = { ...prev };
          wrong.forEach((key) => {
            next[key] = { text: prev[key].text, error: settle(parseKey(key).field, prev[key].text).error, shown: true };
          });
          return next;
        });
        AccessibilityInfo.announceForAccessibility(tr('invoice.items.fixRates', { count: wrong.length }));
        latest.current.walk.focusKey(wrong[0]);
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
              showHint={mode.cards}
              actions={actions}
              styles={styles}
            />
          );
        case 'cols':
          return <ColumnHeadings groupKey={row.groupKey} widths={layout.widths} perLine={row.perLine} oneTime={oneTime} styles={styles} />;
        case 'line': {
          const line = itemsById.get(row.tempId);
          if (!line) return null;
          return (
            <LineRow
              item={line}
              widths={layout.widths}
              perLine={row.perLine}
              oneTime={oneTime}
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
              charge={fields[cellKey(line.temp_id, 'charge')]}
              labour={fields[cellKey(line.temp_id, 'labour_rate')]}
              tax={fields[cellKey(line.temp_id, 'tax')]}
              lastKey={lastKey}
              actions={actions}
              styles={styles}
            />
          );
        }
        case 'shared':
          return (
            <SharedRateRow
              groupKey={row.groupKey}
              itemName={group.item_name}
              field={row.field}
              lines={row.lines}
              oneTime={oneTime}
              view={views.get(row.groupKey)![row.field]}
              state={fields[groupFieldKey(row.groupKey, row.field)]}
              lastKey={lastKey}
              widths={layout.widths}
              actions={actions}
              styles={styles}
            />
          );
        case 'block': {
          const stateOf = (field: RateField): FieldState | undefined => fields[groupFieldKey(row.groupKey, field)];
          return (
            <SharedBlock
              groupKey={row.groupKey}
              itemName={group.item_name}
              fields={row.fields}
              lines={row.lines}
              oneTime={oneTime}
              views={views.get(row.groupKey)!}
              charge={stateOf('charge')}
              labour={stateOf('labour_rate')}
              tax={stateOf('tax')}
              lastKey={lastKey}
              actions={actions}
              styles={styles}
            />
          );
        }
        case 'total':
          return <GroupTotal groupKey={row.groupKey} lines={group.allItems.length} total={totals.get(row.groupKey) ?? 0} styles={styles} />;
      }
    },
    [groupsByKey, modes, totals, canEditPricing, actions, styles, layout, oneTime, itemsById, fields, views, lastKey]
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
});

export default InvoiceItemsEditor;
