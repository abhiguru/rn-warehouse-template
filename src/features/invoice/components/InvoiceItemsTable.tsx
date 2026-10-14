/**
 * Invoice items table (style guide §13.7).
 *
 * Displays invoice items grouped by item name + package mark. Each group has
 * group pricing fields and a data table of its dispatch lines with editable
 * charge, labour and tax cells.
 *
 * The table is the page's scroll container: a keyboard-aware FlashList with
 * one row per group and, for an open group, one row for its table, so only
 * the rows near the screen are drawn. An open table draws LINE_WINDOW lines
 * and more on "Show more" (its seven columns share one horizontal scroll, so
 * its lines cannot be list rows of their own). Rows are memoized and get one
 * stable `actions` object, so a key press redraws the group or line it
 * changes, not the whole table. Typed text, cursor and errors live in the
 * table's state, so a row that scrolls away and back keeps them.
 */
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Platform, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { byLanguage, fontWeight, iconSize, layout, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { InvoiceItemData, type GroupRates } from '@/types/invoice.types';
import { useAppSelector } from '@/store/hooks';
import { selectInvoiceFormBulkPricing } from '@/store/slices/invoiceFormSlice';
import { roundMoney, formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatCount, formatDate, formatWeight } from '@/utils/formatters';
import { getLanguage, localizeDigits, t as tr, formatIdentifier } from '@/i18n';
import { InlineValidation } from '@/components/fiori';
import { RateInput, type RateDraftChange, type RateSelection } from '@/features/invoice/components/RateInput';
import { KeyboardAwareFlashList } from '@/components/lists/KeyboardAwareFlashList';
import { parseRateInput, type RateField } from '@/features/invoice/utils/amountInput';
import {
  groupInvoiceItems,
  groupKeyOf,
  invoiceGroupKey,
  invoiceGroupTotals,
  type InvoiceItemGroup,
} from '@/features/invoice/utils/groupInvoiceItems';

type GroupRateTexts = Record<RateField, string>;
const RATE_FIELDS: RateField[] = ['charge', 'labour_rate', 'tax'];
const EMPTY_GROUP_RATES: GroupRateTexts = { charge: '', labour_rate: '', tax: '' };
type GroupRateFlags = Record<RateField, boolean>;
const NO_MIXED_RATES: GroupRateFlags = { charge: false, labour_rate: false, tax: false };

/** A rate as a group field shows it: nothing for 0 (the placeholder shows the zero). */
const groupRateText = (field: RateField, rate: number): string => {
  if (!(rate > 0)) return '';
  // Tax with two decimals at most, as stored: "2.5" must not be shown as "3".
  return field === 'tax' ? String(roundMoney(rate)) : rate.toFixed(2);
};

/** Table rows with editable cells keep the full 44 minimum (§13.7). */
const ROW_MIN_HEIGHT = 44;

const COLUMN_WIDTH = {
  dispatch: 104,
  qty: 80,
  duration: 76,
  charge: 88,
  labour: 88,
  tax: 64,
  total: 120,
} as const;

/** Gujarati words and digits are wider: `૧.૬ મહિના` does not fit the Latin duration column. */
const COLUMN_WIDTH_GUJARATI = { ...COLUMN_WIDTH, duration: 96 } as const;

/** Columns stop growing here; beyond it the table is already far wider than the screen. */
const MAX_COLUMN_FONT_SCALE = 2;

type ColumnKey = keyof typeof COLUMN_WIDTH;

/**
 * Column widths for the device font size. The text inside a cell grows with the
 * font size, so the space between the cell paddings grows with it; the paddings do not.
 */
export const invoiceTableColumnWidths = (fontScale: number): Record<ColumnKey, number> => {
  const base = byLanguage<Record<ColumnKey, number>>(COLUMN_WIDTH, COLUMN_WIDTH_GUJARATI);
  const scale = Math.min(Math.max(fontScale, 1), MAX_COLUMN_FONT_SCALE);
  const padding = space.md * 2;
  const widths = {} as Record<ColumnKey, number>;
  (Object.keys(base) as ColumnKey[]).forEach((key) => {
    widths[key] = Math.round(padding + (base[key] - padding) * scale);
  });
  return widths;
};

// Format number with Indian grouping - show decimals only if needed
const formatNumber = (value: number, maxDecimals: number = 2): string => {
  if (!value) return localizeDigits('0');
  return localizeDigits(new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxDecimals }).format(value));
};


/** A value too long for its column shrinks instead of breaking onto a second line. */
const oneLine = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 } as const;

const tabular = { fontVariant: ['tabular-nums' as const] };

const makeStyles = (t: ThemeTokens) => ({
  // The screen's content above and below the groups, spaced as the page was
  listHeader: {
    gap: space.lg,
    paddingBottom: space.lg,
  },
  listFooter: {
    paddingTop: space.lg,
  },
  // Between two groups
  groupGap: {
    height: space.md,
  },

  // Empty state
  emptyContainer: {
    padding: space.giant,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },

  // Group card
  groupCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  // An open group is two list rows, the group and its table, drawn as one card
  groupCardOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  tableCard: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  // Group header
  groupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    padding: space.lg,
    gap: space.sm,
    backgroundColor: t.surface.card,
  },
  groupHeaderPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  groupHeaderContent: {
    flex: 1,
  },
  groupTitle: {
    ...typography.headline,
    color: t.text.primary,
    marginBottom: space.xs,
  },
  groupMeta: {
    flexDirection: 'row' as const,
    gap: space.xs,
    flexWrap: 'wrap' as const,
  },
  metaBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.neutral.background,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    gap: space.xs,
  },
  metaText: {
    ...typography.caption1,
    ...tabular,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
  },
  groupTotal: {
    alignItems: 'flex-end' as const,
    flexShrink: 0,
  },
  groupTotalLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  groupTotalValue: {
    ...typography.headline,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
  },

  // Group pricing section
  bulkPricingSection: {
    backgroundColor: t.background.base,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  bulkPricingHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
    marginBottom: space.sm,
  },
  bulkPricingLabel: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
  },
  bulkPricingHint: {
    ...typography.caption1,
    color: t.text.secondary,
    flexShrink: 1,
  },
  editPricingButton: {
    width: touchTarget,
    height: touchTarget,
    marginVertical: -space.md,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  editPricingButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  bulkPricingInputs: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  bulkInputWrapper: {
    flex: 1,
  },
  inputLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 44,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.sm,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  affix: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  bulkInput: {
    ...typography.body,
    ...tabular,
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: space.xs,
    color: t.text.primary,
    textAlign: 'right' as const,
    ...Platform.select({
      android: {
        textAlignVertical: 'center' as const,
        includeFontPadding: false,
      },
    }),
  },

  // Data table
  tableContainer: {
    backgroundColor: t.surface.card,
  },
  tableHeaderRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.background.base,
    borderBottomWidth: 1,
    borderBottomColor: t.border.separator,
    minHeight: ROW_MIN_HEIGHT,
  },
  tableHeaderCell: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: 'center' as const,
  },
  tableHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  tableTotalText: {
    fontWeight: fontWeight.semibold,
  },
  tableHeaderTextNumeric: {
    textAlign: 'right' as const,
  },
  tableDataRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    minHeight: ROW_MIN_HEIGHT,
  },
  tableDataCell: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: 'center' as const,
    minHeight: ROW_MIN_HEIGHT,
  },
  tableDataText: {
    ...typography.subhead,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
  },

  // Dispatch cell
  dispatchNo: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  secondaryText: {
    ...typography.caption1,
    ...tabular,
    color: t.text.secondary,
    textAlign: 'right' as const,
  },
  dispatchDate: {
    ...typography.caption1,
    color: t.text.secondary,
  },

  // Editable cells: ghost border, shown only while editing (§13.2)
  editableCell: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.field,
  },
  editableCellPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  editingCell: {
    borderColor: t.border.fieldFocus,
    backgroundColor: t.surface.field,
  },
  cellError: {
    borderColor: t.status.negative.border,
  },
  cellInput: {
    ...typography.subhead,
    ...tabular,
    alignSelf: 'stretch' as const,
    minHeight: 36,
    color: t.text.primary,
    textAlign: 'right' as const,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    ...Platform.select({
      android: {
        textAlignVertical: 'center' as const,
        includeFontPadding: false,
      },
    }),
  },

  // Totals row
  tableFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: ROW_MIN_HEIGHT,
    backgroundColor: t.surface.card,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  tableFooterLabel: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    flexShrink: 1,
  },
  tableFooterTotal: {
    ...typography.headline,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
  },

  // Collapsed state
  collapsedInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingVertical: space.sm,
  },
  collapsedInfoPressed: {
    backgroundColor: t.brand.subtle,
  },
  collapsedText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});

interface EditPricingParams {
  item_id: string;
  item_name: string;
  /** The tapped group's mark: with the item it tells the group's own lines (and their received days) from other groups. */
  package_mark: string;
  weight: number;
  charge: number;
  labour_rate: number;
  tax: number;
}

interface InvoiceItemsTableProps {
  items: InvoiceItemData[];
  onItemUpdate: (tempId: string, field: string, value: number) => void;
  /** A group field was typed: the one rate to set on the group's lines. The other rates are not passed on. */
  onBulkEdit: (groupKey: string, pricing: GroupRates) => void;
  onEditPricing?: (params: EditPricingParams) => void;
  renderItem?: (item: InvoiceItemData) => React.ReactElement;
  /** Told whether a rate field currently holds text that was not accepted, so the step can hold "Next". */
  onInputErrorChange?: (hasError: boolean) => void;
  /**
   * The table is the page's scroll container (a list inside a scroll view
   * would draw every row): the screen's content above the groups goes here.
   */
  ListHeaderComponent?: React.ReactElement | null;
  /** The screen's content below the groups. */
  ListFooterComponent?: React.ReactElement | null;
  style?: StyleProp<ViewStyle>;
  /** Padding of the page; a gap in it is left out (the rows are spaced by the table). */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

type Styles = ReturnType<typeof makeStyles>;
type ColumnStyles = ReturnType<typeof makeColumnStyles>;

/** Lines drawn when a group opens, and added by each "Show more". */
export const LINE_WINDOW = 50;

/** A row of the list: a group's header and rates, or the open table of its lines. */
type TableRow =
  | { type: 'group'; key: string; groupKey: string }
  | { type: 'table'; key: string; groupKey: string; shown: number };

interface CellDraft {
  text?: string;
  selection?: RateSelection;
}
interface EditingCell {
  tempId: string;
  field: RateField;
}

/** What a group's three rate fields show. */
type GroupFieldsView = Record<RateField, { text: string; mixed: boolean; error: string | undefined }>;

/** The functions the rows call. One object for the life of the table, so memoized rows keep their props. */
interface TableActions {
  toggle: (groupKey: string) => void;
  changeRate: (groupKey: string, field: RateField, typed: string) => void;
  blurRate: (groupKey: string, field: RateField) => void;
  editPricing: (groupKey: string) => void;
  showMore: (groupKey: string) => void;
  editCell: (tempId: string, field: RateField) => void;
  commitCell: (tempId: string, field: RateField, value: number) => void;
  cellError: (tempId: string, field: RateField, error: string | null) => void;
  draft: (tempId: string, field: RateField, change: RateDraftChange) => void;
  focusCell: (tempId: string, field: RateField) => void;
  blurCell: (tempId: string, field: RateField) => void;
  rememberOffset: (groupKey: string, x: number) => void;
  offsetOf: (groupKey: string) => number;
}

const cellKeyOf = (tempId: string, field: RateField) => `cell|${tempId}|${field}`;
/** The temp_id in a `cell|<temp_id>|<field>` key. */
const tempIdOfCellKey = (key: string) => key.slice(5, key.lastIndexOf('|'));

const EMPTY_RECORD: Record<string, never> = {};

const shallowEqual = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
};
const sameGroupView = (a: GroupFieldsView, b: GroupFieldsView) =>
  RATE_FIELDS.every((field) => a[field].text === b[field].text && a[field].mixed === b[field].mixed && a[field].error === b[field].error);

/**
 * Per key, the object given last time when the new one is equal to it: rows
 * get the same props object while what they show has not changed.
 */
function useStable<V>(same: (a: V, b: V) => boolean) {
  const cache = useRef(new Map<string, V>()).current;
  return useCallback(
    (key: string, next: V): V => {
      const previous = cache.get(key);
      if (previous !== undefined && same(previous, next)) return previous;
      cache.set(key, next);
      return next;
    },
    [cache, same]
  );
}

/** Splits `cell|<temp_id>|<field>` entries by the group of their line. */
function byGroup<V>(entries: Record<string, V>, groupOf: Map<string, string>): Map<string, Record<string, V>> {
  const result = new Map<string, Record<string, V>>();
  Object.keys(entries).forEach((key) => {
    if (!key.startsWith('cell|')) return;
    const groupKey = groupOf.get(tempIdOfCellKey(key));
    if (groupKey === undefined) return;
    let group = result.get(groupKey);
    if (!group) result.set(groupKey, (group = {}));
    group[key] = entries[key];
  });
  return result;
}

const makeColumnStyles = (fontScale: number) => {
  const width = invoiceTableColumnWidths(fontScale);
  return StyleSheet.create({
    colDispatch: { width: width.dispatch, alignItems: 'flex-start' },
    colQty: { width: width.qty, alignItems: 'flex-end' },
    colDuration: { width: width.duration, alignItems: 'flex-end' },
    colCharge: { width: width.charge, alignItems: 'flex-end' },
    colLabour: { width: width.labour, alignItems: 'flex-end' },
    colTax: { width: width.tax, alignItems: 'flex-end' },
    colTotal: { width: width.total, alignItems: 'flex-end' },
  });
};

export const InvoiceItemsTable: React.FC<InvoiceItemsTableProps> = ({
  items,
  onItemUpdate,
  onBulkEdit,
  onEditPricing,
  onInputErrorChange,
  ListHeaderComponent,
  ListFooterComponent,
  style,
  contentContainerStyle,
}) => {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const language = getLanguage();
  // Column widths: text left, numbers right. They differ by language too.
  const cols = useMemo(() => makeColumnStyles(fontScale), [fontScale, language]);
  const t = useTokens();

  // Get bulk pricing from Redux
  const bulkPricingFromRedux = useAppSelector(selectInvoiceFormBulkPricing);

  // Track which groups are expanded, and how many lines an open group draws
  const [expandedItemGroups, setExpandedItemGroups] = useState<Set<string>>(new Set());
  const [shownLines, setShownLines] = useState<Record<string, number>>({});

  // The cell being edited, and the cell that takes the focus when it mounts after a tap
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [focusCell, setFocusCell] = useState<string | null>(null);

  // Track bulk pricing inputs for each item group
  const [bulkPricingInputs, setBulkPricingInputs] = useState<Record<string, GroupRateTexts>>({});

  // Text in a rate field that was not accepted, by field. A group field is
  // keyed `group|<groupKey>|<field>`, a table cell `cell|<temp_id>|<field>`.
  // A cell's typed text and cursor live beside it (`cellDrafts`), so a cell
  // that the list takes off the screen keeps both, and its error still holds
  // the step.
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [cellDrafts, setCellDrafts] = useState<Record<string, CellDraft>>({});
  const setInputError = useCallback((key: string, error: string | null) => {
    setInputErrors((prev) => {
      if ((prev[key] ?? null) === error) return prev;
      const next = { ...prev };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
  }, []);
  const hasInputError = Object.keys(inputErrors).length > 0;
  useEffect(() => {
    onInputErrorChange?.(hasInputError);
  }, [hasInputError, onInputErrorChange]);

  // The group rates as the form holds them: a rate the user applied to the
  // group, else the rate that all lines of the group share. Where the lines
  // differ the field is empty and says "Mixed". It never shows an average: an
  // average is the rate of no line, and a group edit would give it to all of
  // them (a free line beside a paid one would become paid).
  const { groupRateDefaults, mixedGroupRates } = useMemo(() => {
    const texts: Record<string, GroupRateTexts> = {};
    const mixed: Record<string, GroupRateFlags> = {};
    const ratesByGroup: Record<string, Record<RateField, number[]>> = {};

    items.forEach((item) => {
      const groupKey = invoiceGroupKey(item);
      const rates = (ratesByGroup[groupKey] ??= { charge: [], labour_rate: [], tax: [] });
      RATE_FIELDS.forEach((field) => rates[field].push(roundMoney(Number(item[field]) || 0)));
    });

    Object.keys(ratesByGroup).forEach((groupKey) => {
      const applied = bulkPricingFromRedux[groupKey] ?? {};
      texts[groupKey] = { ...EMPTY_GROUP_RATES };
      mixed[groupKey] = { ...NO_MIXED_RATES };

      RATE_FIELDS.forEach((field) => {
        // The user set this rate for the group.
        const appliedRate = applied[field];
        if (appliedRate !== undefined) {
          texts[groupKey][field] = String(appliedRate);
          return;
        }
        const rates = ratesByGroup[groupKey][field];
        if (rates.some((rate) => rate !== rates[0])) {
          mixed[groupKey][field] = true;
          return;
        }
        texts[groupKey][field] = groupRateText(field, rates[0]);
      });
    });

    return { groupRateDefaults: texts, mixedGroupRates: mixed };
  }, [bulkPricingFromRedux, items]);

  // Show them in the fields, but leave alone a field whose text already means
  // the same number ("6." while 6 is applied) or is still being corrected:
  // replacing it would take the decimal point away between two key presses.
  useEffect(() => {
    setBulkPricingInputs((prev) => {
      const next: Record<string, GroupRateTexts> = {};
      Object.keys(groupRateDefaults).forEach((groupKey) => {
        const typed = prev[groupKey];
        const texts = { ...groupRateDefaults[groupKey] };
        if (typed) {
          RATE_FIELDS.forEach((field) => {
            const current = parseRateInput(field, typed[field]);
            if (current.error || current.value === parseRateInput(field, texts[field]).value) {
              texts[field] = typed[field];
            }
          });
        }
        next[groupKey] = texts;
      });
      return next;
    });
  }, [groupRateDefaults]);

  // Group items by Item Group (item_id + package_mark), with the flat list of
  // each group's lines. Groups whose lines did not change keep their object,
  // and their total.
  const previous = useRef<{ groups: InvoiceItemGroup[]; totals: Map<string, number> } | undefined>(undefined);
  const { groupedItems, groupTotals } = useMemo(() => {
    const groups = groupInvoiceItems(items, previous.current?.groups);
    return { groupedItems: groups, groupTotals: invoiceGroupTotals(groups, previous.current) };
  }, [items]);
  useEffect(() => {
    previous.current = { groups: groupedItems, totals: groupTotals };
  }, [groupedItems, groupTotals]);

  const { groupsByKey, groupOfLine } = useMemo(() => {
    const byKey = new Map<string, InvoiceItemGroup>();
    const ofLine = new Map<string, string>();
    groupedItems.forEach((group) => {
      const groupKey = groupKeyOf(group);
      byKey.set(groupKey, group);
      group.allItems.forEach((line) => ofLine.set(line.temp_id, groupKey));
    });
    return { groupsByKey: byKey, groupOfLine: ofLine };
  }, [groupedItems]);

  // A line that left the invoice takes its typed text, its error and its edit with it.
  useEffect(() => {
    const gone = (key: string) => key.startsWith('cell|') && !groupOfLine.has(tempIdOfCellKey(key));
    const goneGroup = (key: string) => key.startsWith('group|') && !groupsByKey.has(key.slice(6, key.lastIndexOf('|')));
    const prune = <V,>(prev: Record<string, V>) => {
      const keys = Object.keys(prev).filter((key) => gone(key) || goneGroup(key));
      if (keys.length === 0) return prev;
      const next = { ...prev };
      keys.forEach((key) => delete next[key]);
      return next;
    };
    setInputErrors(prune);
    setCellDrafts(prune);
    setEditingCell((prev) => (prev && !groupOfLine.has(prev.tempId) ? null : prev));
    setFocusCell((prev) => (prev && gone(prev) ? null : prev));
  }, [groupOfLine, groupsByKey]);

  // The latest props and state, for the actions below.
  const latest = useRef({ onBulkEdit, onItemUpdate, onEditPricing, inputErrors, groupRateDefaults, groupsByKey, groupOfLine, expandedItemGroups, editingCell });
  latest.current = { onBulkEdit, onItemUpdate, onEditPricing, inputErrors, groupRateDefaults, groupsByKey, groupOfLine, expandedItemGroups, editingCell };
  const scrollOffsets = useRef(new Map<string, number>()).current;

  const actions = useMemo<TableActions>(() => {
    /** Ends the drafts and errors of the given cells. */
    const clearCells = (isCleared: (cellKey: string) => boolean) => {
      const prune = <V,>(prev: Record<string, V>) => {
        const keys = Object.keys(prev).filter((key) => key.startsWith('cell|') && isCleared(key));
        if (keys.length === 0) return prev;
        const next = { ...prev };
        keys.forEach((key) => delete next[key]);
        return next;
      };
      setCellDrafts(prune);
      setInputErrors(prune);
    };

    return {
      toggle: (groupKey) => {
        const { expandedItemGroups: expanded, groupOfLine: ofLine, editingCell: editing } = latest.current;
        if (expanded.has(groupKey)) {
          // A closed group's cells are no longer on the screen: what was typed there ends.
          clearCells((key) => ofLine.get(tempIdOfCellKey(key)) === groupKey);
          if (editing && ofLine.get(editing.tempId) === groupKey) {
            setEditingCell(null);
            setFocusCell(null);
          }
        }
        setExpandedItemGroups((prev) => {
          const next = new Set(prev);
          if (next.has(groupKey)) next.delete(groupKey);
          else next.add(groupKey);
          return next;
        });
      },

      changeRate: (groupKey, field, typed) => {
        // Digits typed as ૦-૯ are kept as 0-9.
        const parsed = parseRateInput(field, typed);
        setBulkPricingInputs((prev) => ({ ...prev, [groupKey]: { ...(prev[groupKey] || EMPTY_GROUP_RATES), [field]: parsed.text } }));
        setInputError(`group|${groupKey}|${field}`, parsed.error);

        // Text that is not a rate inside the range is not applied to the lines.
        if (parsed.value === null) return;

        // Only the rate that was typed: the two other rates stay on each line as they are.
        latest.current.onBulkEdit(groupKey, { [field]: parsed.value });
      },

      // A group field that is left with text that was not accepted shows the applied rate again.
      blurRate: (groupKey, field) => {
        const key = `group|${groupKey}|${field}`;
        if (!latest.current.inputErrors[key]) return;
        const shown = latest.current.groupRateDefaults[groupKey]?.[field] ?? '';
        setInputError(key, null);
        setBulkPricingInputs((prev) => ({ ...prev, [groupKey]: { ...(prev[groupKey] || EMPTY_GROUP_RATES), [field]: shown } }));
      },

      editPricing: (groupKey) => {
        const { onEditPricing: open, groupsByKey: groups } = latest.current;
        const itemGroup = groups.get(groupKey);
        // Get first item to extract pricing values (all items in group share same item)
        const firstItem = itemGroup?.allItems[0];
        if (!open || !itemGroup || !firstItem) return;
        open({
          item_id: itemGroup.item_id,
          item_name: itemGroup.item_name,
          package_mark: itemGroup.package_mark,
          weight: itemGroup.total_weight,
          charge: firstItem.charge,
          labour_rate: firstItem.labour_rate,
          tax: firstItem.tax,
        });
      },

      showMore: (groupKey) => {
        setShownLines((prev) => ({ ...prev, [groupKey]: (prev[groupKey] ?? LINE_WINDOW) + LINE_WINDOW }));
      },

      editCell: (tempId, field) => {
        const cellKey = cellKeyOf(tempId, field);
        const editing = latest.current.editingCell;
        if (editing && editing.tempId === tempId && editing.field === field) return;
        // Opening another cell ends the text and the error of the one that was open.
        if (editing) {
          const openKey = cellKeyOf(editing.tempId, editing.field);
          clearCells((key) => key === openKey);
        }
        setEditingCell({ tempId, field });
        setFocusCell(cellKey);
      },

      commitCell: (tempId, field, value) => latest.current.onItemUpdate(tempId, field, value),

      cellError: (tempId, field, error) => setInputError(cellKeyOf(tempId, field), error),

      draft: (tempId, field, change) => {
        const cellKey = cellKeyOf(tempId, field);
        setCellDrafts((prev) => {
          if (change.text === null) {
            if (!(cellKey in prev)) return prev;
            const next = { ...prev };
            delete next[cellKey];
            return next;
          }
          const current = prev[cellKey];
          const merged: CellDraft = {
            ...current,
            ...(change.text !== undefined ? { text: change.text } : null),
            ...(change.selection ? { selection: change.selection } : null),
          };
          if (current && current.text === merged.text && current.selection === merged.selection) return prev;
          return { ...prev, [cellKey]: merged };
        });
      },

      // The focus came: a cell drawn again later (after scrolling) does not take it again.
      focusCell: (tempId, field) => {
        const cellKey = cellKeyOf(tempId, field);
        setFocusCell((prev) => (prev === cellKey ? null : prev));
      },

      blurCell: (tempId, field) => {
        const cellKey = cellKeyOf(tempId, field);
        clearCells((key) => key === cellKey);
        // Only this cell closes: a blur that comes after another cell was tapped leaves that one open.
        setEditingCell((prev) => (prev && prev.tempId === tempId && prev.field === field ? null : prev));
        setFocusCell((prev) => (prev === cellKey ? null : prev));
      },

      rememberOffset: (groupKey, x) => {
        scrollOffsets.set(groupKey, x);
      },
      offsetOf: (groupKey) => scrollOffsets.get(groupKey) ?? 0,
    };
  }, [scrollOffsets, setInputError]);

  // What each group's rate fields show, as the same object while it does not change.
  const stableGroupView = useStable<GroupFieldsView>(sameGroupView);
  const stableCellRecord = useStable<Record<string, unknown>>(shallowEqual);
  const groupViews = useMemo(() => {
    const views = new Map<string, GroupFieldsView>();
    groupedItems.forEach((group) => {
      const groupKey = groupKeyOf(group);
      const inputs = bulkPricingInputs[groupKey] || EMPTY_GROUP_RATES;
      const view = {} as GroupFieldsView;
      RATE_FIELDS.forEach((field) => {
        view[field] = {
          text: inputs[field] ?? '',
          mixed: !!mixedGroupRates[groupKey]?.[field],
          error: inputErrors[`group|${groupKey}|${field}`],
        };
      });
      views.set(groupKey, stableGroupView(groupKey, view));
    });
    return views;
  }, [groupedItems, bulkPricingInputs, mixedGroupRates, inputErrors, stableGroupView]);

  // The cell errors and drafts of each group, as the same object while they do not change.
  const { cellErrorsByGroup, cellDraftsByGroup } = useMemo(() => {
    const errors = byGroup(inputErrors, groupOfLine);
    const drafts = byGroup(cellDrafts, groupOfLine);
    errors.forEach((record, groupKey) => errors.set(groupKey, stableCellRecord(`errors|${groupKey}`, record) as Record<string, string>));
    drafts.forEach((record, groupKey) => drafts.set(groupKey, stableCellRecord(`drafts|${groupKey}`, record) as Record<string, CellDraft>));
    return { cellErrorsByGroup: errors, cellDraftsByGroup: drafts };
  }, [inputErrors, cellDrafts, groupOfLine, stableCellRecord]);

  // One row per group, and one more for the table of each open group.
  const rows = useMemo(() => {
    const result: TableRow[] = [];
    groupedItems.forEach((group) => {
      const groupKey = groupKeyOf(group);
      result.push({ type: 'group', key: `group|${groupKey}`, groupKey });
      if (expandedItemGroups.has(groupKey)) {
        result.push({ type: 'table', key: `table|${groupKey}`, groupKey, shown: shownLines[groupKey] ?? LINE_WINDOW });
      }
    });
    return result;
  }, [groupedItems, expandedItemGroups, shownLines]);

  const canEditPricing = !!onEditPricing;
  const editingGroup = editingCell ? groupOfLine.get(editingCell.tempId) : undefined;
  const focusGroup = focusCell ? groupOfLine.get(tempIdOfCellKey(focusCell)) : undefined;

  const renderRow = useCallback(
    ({ item: row }: { item: TableRow }) => {
      const group = groupsByKey.get(row.groupKey);
      if (!group) return null;
      const total = groupTotals.get(row.groupKey) ?? 0;
      if (row.type === 'group') {
        return (
          <InvoiceGroupRow
            key={row.groupKey}
            group={group}
            groupKey={row.groupKey}
            expanded={expandedItemGroups.has(row.groupKey)}
            total={total}
            fields={groupViews.get(row.groupKey)!}
            canEditPricing={canEditPricing}
            actions={actions}
            styles={styles}
            t={t}
          />
        );
      }
      return (
        // Keyed by group: a recycled row never carries one group's state into another.
        <InvoiceLinesTable
          key={row.groupKey}
          group={group}
          groupKey={row.groupKey}
          shown={row.shown}
          total={total}
          editing={editingGroup === row.groupKey ? editingCell : null}
          focusCell={focusGroup === row.groupKey ? focusCell : null}
          cellErrors={cellErrorsByGroup.get(row.groupKey) ?? EMPTY_RECORD}
          cellDrafts={cellDraftsByGroup.get(row.groupKey) ?? EMPTY_RECORD}
          actions={actions}
          cols={cols}
          styles={styles}
        />
      );
    },
    [
      groupsByKey, groupTotals, expandedItemGroups, groupViews, canEditPricing, actions, styles, t,
      editingGroup, editingCell, focusGroup, focusCell, cellErrorsByGroup, cellDraftsByGroup, cols,
    ]
  );

  // A gap between two groups; none between a group and its own table.
  const Separator = useCallback(
    ({ trailingItem }: { trailingItem?: TableRow }) => (trailingItem?.type === 'group' ? <View style={styles.groupGap} /> : null),
    [styles]
  );

  // FlashList spreads its style into an object: it takes one plain style, not an array.
  const listStyle = useMemo(() => StyleSheet.flatten(style), [style]);

  // The page's padding without a gap: in a list, a gap would also open between the header and the rows.
  const listContentStyle = useMemo(() => {
    const { gap: _gap, rowGap: _rowGap, columnGap: _columnGap, ...rest } = StyleSheet.flatten(contentContainerStyle) ?? {};
    return rest;
  }, [contentContainerStyle]);

  return (
    <KeyboardAwareFlashList
      data={rows}
      renderItem={renderRow}
      keyExtractor={rowKey}
      getItemType={rowType}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={ListHeaderComponent ? <View style={styles.listHeader}>{ListHeaderComponent}</View> : null}
      ListFooterComponent={ListFooterComponent ? <View style={styles.listFooter}>{ListFooterComponent}</View> : null}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Icon name="table-off" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyTitle}>{tr('invoice.form.noItemsTitle')}</Text>
          <Text style={styles.emptyText}>{tr('invoice.table.emptyText')}</Text>
        </View>
      }
      style={listStyle}
      contentContainerStyle={listContentStyle}
      showsVerticalScrollIndicator
      enableAutomaticScroll
      extraScrollHeight={120}
      keyboardShouldPersistTaps="handled"
    />
  );
};

const rowKey = (row: TableRow) => row.key;
const rowType = (row: TableRow) => row.type;

interface InvoiceGroupRowProps {
  group: InvoiceItemGroup;
  groupKey: string;
  expanded: boolean;
  total: number;
  fields: GroupFieldsView;
  canEditPricing: boolean;
  actions: TableActions;
  styles: Styles;
  t: ThemeTokens;
}

/** A group's header, its rate fields and, while it is closed, the button that opens its table. */
const InvoiceGroupRow = React.memo(function InvoiceGroupRow({
  group: itemGroup,
  groupKey,
  expanded: isExpanded,
  total: groupTotal,
  fields,
  canEditPricing,
  actions,
  styles,
  t,
}: InvoiceGroupRowProps) {
  const { allItems } = itemGroup;
  const groupTotalText = formatInvoiceAmount(groupTotal);
  const groupRateError = RATE_FIELDS.map((field) => fields[field].error).find(Boolean);
  const groupFieldStyle = (field: RateField) => [styles.field, !!fields[field].error && styles.fieldError];
  // An empty group field says why it is empty: the lines have 0, or they differ.
  const groupPlaceholder = (field: RateField) => (fields[field].mixed ? tr('invoice.table.mixed') : localizeDigits('0'));
  const toggle = () => actions.toggle(groupKey);

  return (
    <View style={[styles.groupCard, isExpanded && styles.groupCardOpen]}>
      {/* Group header - tappable */}
      <Pressable
        style={({ pressed }) => [styles.groupHeader, pressed && styles.groupHeaderPressed]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={tr('invoice.table.groupA11y', {
          item: itemGroup.item_name,
          mark: itemGroup.package_mark,
          weight: formatWeight(itemGroup.total_weight),
          grnQty: formatNumber(itemGroup.gr_quantity),
          dispatched: formatNumber(itemGroup.total_dispatched),
          total: groupTotalText,
        })}
      >
        <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={iconSize.lg} color={t.icon.secondary} />
        <View style={styles.groupHeaderContent}>
          <Text style={styles.groupTitle} numberOfLines={2}>
            {itemGroup.item_name}
          </Text>
          <View style={styles.groupMeta}>
            <View style={styles.metaBadge}>
              <Icon name="tag-outline" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.metaText}>{itemGroup.package_mark}</Text>
            </View>
            <View style={styles.metaBadge}>
              <Icon name="weight-kilogram" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.metaText}>{formatWeight(itemGroup.total_weight)}</Text>
            </View>
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>{tr('invoice.table.grnQty', { qty: formatNumber(itemGroup.gr_quantity) })}</Text>
            </View>
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>{tr('invoice.table.dispatchedQty', { qty: formatNumber(itemGroup.total_dispatched) })}</Text>
            </View>
          </View>
        </View>
        <View style={styles.groupTotal}>
          <Text style={styles.groupTotalLabel}>{tr('common.total')}</Text>
          <Text style={styles.groupTotalValue}>{groupTotalText}</Text>
        </View>
      </Pressable>

      {/* Group pricing section */}
      <View style={styles.bulkPricingSection}>
        <View style={styles.bulkPricingHeader}>
          <Text style={styles.bulkPricingLabel} accessibilityRole="header">{tr('invoice.table.groupPricing')}</Text>
          {canEditPricing && (
            <Pressable
              style={({ pressed }) => [styles.editPricingButton, pressed && styles.editPricingButtonPressed]}
              onPress={() => actions.editPricing(groupKey)}
              accessibilityRole="button"
              accessibilityLabel={tr('invoice.table.editPricingA11y', { item: itemGroup.item_name })}
            >
              <Icon name="pencil-outline" size={iconSize.md} color={t.brand.tint} />
            </Pressable>
          )}
          <Text style={styles.bulkPricingHint}>{tr('invoice.table.appliesToAll', { count: allItems.length })}</Text>
        </View>
        <View style={styles.bulkPricingInputs}>
          {/* Charge */}
          <View style={styles.bulkInputWrapper}>
            <Text style={styles.inputLabel}>{tr('invoice.label.charge')}</Text>
            <View style={groupFieldStyle('charge')}>
              <Text style={styles.affix}>₹</Text>
              <TextInput
                style={styles.bulkInput}
                accessibilityLabel={tr('invoice.table.chargeForA11y', { item: itemGroup.item_name })}
                value={localizeDigits(fields.charge.text)}
                onChangeText={(text) => actions.changeRate(groupKey, 'charge', text)}
                onBlur={() => actions.blurRate(groupKey, 'charge')}
                placeholder={groupPlaceholder('charge')}
                placeholderTextColor={t.text.placeholder}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          {/* Labour */}
          <View style={styles.bulkInputWrapper}>
            <Text style={styles.inputLabel}>{tr('invoice.label.labour')}</Text>
            <View style={groupFieldStyle('labour_rate')}>
              <Text style={styles.affix}>₹</Text>
              <TextInput
                style={styles.bulkInput}
                accessibilityLabel={tr('invoice.table.labourRateForA11y', { item: itemGroup.item_name })}
                value={localizeDigits(fields.labour_rate.text)}
                onChangeText={(text) => actions.changeRate(groupKey, 'labour_rate', text)}
                onBlur={() => actions.blurRate(groupKey, 'labour_rate')}
                placeholder={groupPlaceholder('labour_rate')}
                placeholderTextColor={t.text.placeholder}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          {/* Tax */}
          <View style={styles.bulkInputWrapper}>
            <Text style={styles.inputLabel}>{tr('invoice.label.tax')}</Text>
            <View style={groupFieldStyle('tax')}>
              <TextInput
                style={styles.bulkInput}
                accessibilityLabel={tr('invoice.table.taxPercentForA11y', { item: itemGroup.item_name })}
                value={localizeDigits(fields.tax.text)}
                onChangeText={(text) => actions.changeRate(groupKey, 'tax', text)}
                onBlur={() => actions.blurRate(groupKey, 'tax')}
                placeholder={groupPlaceholder('tax')}
                placeholderTextColor={t.text.placeholder}
                keyboardType="decimal-pad"
              />
              <Text style={styles.affix}>%</Text>
            </View>
          </View>
        </View>
        <InlineValidation message={groupRateError || ''} variant="error" visible={!!groupRateError} />
      </View>

      {/* Collapsed state - show the dispatch count */}
      {!isExpanded && (
        <Pressable
          style={({ pressed }) => [styles.collapsedInfo, pressed && styles.collapsedInfoPressed]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
        >
          <Icon name="table" size={iconSize.sm} color={t.brand.tint} />
          <Text style={styles.collapsedText}>{tr('invoice.table.showDispatches', { count: allItems.length })}</Text>
        </Pressable>
      )}
    </View>
  );
});

interface InvoiceLinesTableProps {
  group: InvoiceItemGroup;
  groupKey: string;
  /** How many lines are drawn: LINE_WINDOW more with each "Show more". */
  shown: number;
  total: number;
  /** The cell being edited when it is in this group. */
  editing: EditingCell | null;
  /** The cell that takes the focus when it mounts, when it is in this group. */
  focusCell: string | null;
  cellErrors: Record<string, string>;
  cellDrafts: Record<string, CellDraft>;
  actions: TableActions;
  cols: ColumnStyles;
  styles: Styles;
}

/** An open group's table: the dispatch lines (up to `shown`) in one horizontal scroll, and the group total. */
const InvoiceLinesTable = React.memo(function InvoiceLinesTable({
  group,
  groupKey,
  shown,
  total,
  editing,
  focusCell,
  cellErrors,
  cellDrafts,
  actions,
  cols,
  styles,
}: InvoiceLinesTableProps) {
  const { allItems } = group;
  const lines = allItems.length > shown ? allItems.slice(0, shown) : allItems;
  const dispatchCount = formatCount(allItems.length, 'dispatch', 'dispatches');
  const groupTotalText = formatInvoiceAmount(total);
  // The table opens where it was left when the list draws it again.
  const [initialOffset] = useState(() => ({ x: actions.offsetOf(groupKey), y: 0 }));

  // The message for a table cell of this group whose text was not accepted (first line first).
  const cellError =
    cellErrors === EMPTY_RECORD
      ? undefined
      : allItems.flatMap((line) => RATE_FIELDS.map((field) => cellErrors[cellKeyOf(line.temp_id, field)])).find(Boolean);

  // Each line's own errors and drafts, as the same object while they do not change.
  const stableLineRecord = useStable<Record<string, unknown>>(shallowEqual);
  const lineState = (tempId: string, record: Record<string, unknown>, kind: string) => {
    if (record === EMPTY_RECORD) return EMPTY_RECORD;
    const own: Record<string, unknown> = {};
    let any = false;
    RATE_FIELDS.forEach((field) => {
      const value = record[cellKeyOf(tempId, field)];
      if (value !== undefined) {
        own[field] = value;
        any = true;
      }
    });
    return any ? stableLineRecord(`${kind}|${tempId}`, own) : EMPTY_RECORD;
  };

  return (
    <View style={[styles.groupCard, styles.tableCard]}>
      <View style={styles.tableContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          bounces={false}
          contentOffset={initialOffset}
          scrollEventThrottle={16}
          onScroll={(event) => actions.rememberOffset(groupKey, event.nativeEvent.contentOffset.x)}
        >
          <View>
            {/* Header row */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.tableHeaderCell, cols.colDispatch]}>
                <Text style={styles.tableHeaderText}>{tr('common.dispatch')}</Text>
              </View>
              <View style={[styles.tableHeaderCell, cols.colQty]}>
                <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>{tr('invoice.lineItem.colQty')}</Text>
              </View>
              <View style={[styles.tableHeaderCell, cols.colDuration]}>
                <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>{tr('invoice.label.duration')}</Text>
              </View>
              <View style={[styles.tableHeaderCell, cols.colCharge]}>
                <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>{tr('invoice.table.colCharge')}</Text>
              </View>
              <View style={[styles.tableHeaderCell, cols.colLabour]}>
                <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>{tr('invoice.table.colLabour')}</Text>
              </View>
              <View style={[styles.tableHeaderCell, cols.colTax]}>
                <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>{tr('invoice.itemCard.taxLabel')}</Text>
              </View>
              <View style={[styles.tableHeaderCell, cols.colTotal]}>
                <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>{tr('common.total')}</Text>
              </View>
            </View>

            {/* Data rows */}
            {lines.map((item) => {
              const cellKeyPrefix = `cell|${item.temp_id}|`;
              return (
                <InvoiceLineRow
                  key={item.temp_id}
                  item={item}
                  editingField={editing?.tempId === item.temp_id ? editing.field : null}
                  focusField={focusCell?.startsWith(cellKeyPrefix) ? (focusCell.slice(cellKeyPrefix.length) as RateField) : null}
                  errors={lineState(item.temp_id, cellErrors, 'errors') as Partial<Record<RateField, string>>}
                  drafts={lineState(item.temp_id, cellDrafts, 'drafts') as Partial<Record<RateField, CellDraft>>}
                  actions={actions}
                  cols={cols}
                  styles={styles}
                />
              );
            })}
          </View>
        </ScrollView>

        {allItems.length > lines.length && (
          <Pressable
            style={({ pressed }) => [styles.collapsedInfo, pressed && styles.collapsedInfoPressed]}
            onPress={() => actions.showMore(groupKey)}
            accessibilityRole="button"
          >
            <Text style={styles.collapsedText}>{tr('common.showMore')}</Text>
          </Pressable>
        )}

        <InlineValidation message={cellError || ''} variant="error" visible={!!cellError} />

        {/* Totals row */}
        <View
          style={styles.tableFooter}
          accessible
          accessibilityLabel={tr('invoice.table.groupTotalA11y', { dispatches: dispatchCount, total: groupTotalText })}
        >
          <Text style={styles.tableFooterLabel}>{tr('invoice.table.groupTotal', { dispatches: dispatchCount })}</Text>
          <Text style={styles.tableFooterTotal}>{groupTotalText}</Text>
        </View>
      </View>
    </View>
  );
});

interface InvoiceLineRowProps {
  item: InvoiceItemData;
  editingField: RateField | null;
  focusField: RateField | null;
  errors: Partial<Record<RateField, string>>;
  drafts: Partial<Record<RateField, CellDraft>>;
  actions: TableActions;
  cols: ColumnStyles;
  styles: Styles;
}

/** One dispatch line of an open table, with its three editable rate cells. */
const InvoiceLineRow = React.memo(function InvoiceLineRow({ item, editingField, focusField, errors, drafts, actions, cols, styles }: InvoiceLineRowProps) {
  const renderEditableCell = (field: RateField, columnStyle: object, label: string, display: string) => {
    const isEditing = editingField === field;
    const draft = drafts[field];
    return (
      <Pressable
        style={({ pressed }) => [
          styles.tableDataCell,
          columnStyle,
          styles.editableCell,
          pressed && !isEditing && styles.editableCellPressed,
          isEditing && styles.editingCell,
          !!errors[field] && styles.cellError,
        ]}
        onPress={() => actions.editCell(item.temp_id, field)}
        accessibilityRole="button"
        accessibilityLabel={tr('invoice.table.cellA11y', { label, number: formatIdentifier(item.dispatch_no), value: display })}
        accessibilityHint={tr('invoice.table.editsValueHint')}
      >
        {isEditing ? (
          <RateInput
            style={styles.cellInput}
            accessibilityLabel={tr('invoice.table.cellInputA11y', { label, number: formatIdentifier(item.dispatch_no) })}
            field={field}
            value={item[field]}
            draft={draft?.text}
            selection={draft?.selection}
            onDraftChange={(change) => actions.draft(item.temp_id, field, change)}
            onCommit={(value) => actions.commitCell(item.temp_id, field, value)}
            onErrorChange={(error) => actions.cellError(item.temp_id, field, error)}
            // Only the first time the cell is drawn after a tap; a cell drawn again after scrolling does not take the focus.
            autoFocus={focusField === field}
            onFocus={() => actions.focusCell(item.temp_id, field)}
            selectTextOnFocus
            onBlur={() => actions.blurCell(item.temp_id, field)}
          />
        ) : (
          <Text style={styles.tableDataText} {...oneLine}>{display}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.tableDataRow}>
      {/* Dispatch info */}
      <View style={[styles.tableDataCell, cols.colDispatch]}>
        <Text style={styles.dispatchNo}>{item.dispatch_no}</Text>
        <Text style={styles.dispatchDate}>{formatDate(item.dispatch_date, 'short')}</Text>
      </View>

      {/* Qty - read only */}
      <View style={[styles.tableDataCell, cols.colQty]}>
        <Text style={styles.tableDataText} {...oneLine}>{formatNumber(item.qty)}</Text>
      </View>

      {/* Duration - read only */}
      <View
        style={[styles.tableDataCell, cols.colDuration]}
        accessible
        accessibilityLabel={`${formatCount(Math.round(item.duration * 10) / 10, 'month')}, ${formatCount(item.no_of_days, 'day')}`}
      >
        <Text style={styles.tableDataText} {...oneLine}>{tr('invoice.table.monthsShort', { months: formatNumber(item.duration, 1) })}</Text>
        <Text style={styles.secondaryText} {...oneLine}>{formatCount(item.no_of_days, 'day')}</Text>
      </View>

      {renderEditableCell('charge', cols.colCharge, tr('invoice.label.charge'), item.charge > 0 ? formatNumber(item.charge) : '—')}
      {renderEditableCell('labour_rate', cols.colLabour, tr('invoice.label.labourRate'), item.labour_rate > 0 ? formatNumber(item.labour_rate) : '—')}
      {renderEditableCell('tax', cols.colTax, tr('invoice.itemCard.taxA11y'), item.tax > 0 ? formatNumber(item.tax, 1) : '—')}

      {/* Total - calculated */}
      <View style={[styles.tableDataCell, cols.colTotal]}>
        <Text style={[styles.tableDataText, styles.tableTotalText]} {...oneLine}>
          {formatInvoiceAmount(item.item_total)}
        </Text>
      </View>
    </View>
  );
});

export default InvoiceItemsTable;
