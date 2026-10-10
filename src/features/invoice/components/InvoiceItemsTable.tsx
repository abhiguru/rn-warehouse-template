/**
 * Invoice items table (style guide §13.7).
 *
 * Displays invoice items grouped by item name + package mark. Each group has
 * group pricing fields and a data table of its dispatch lines with editable
 * charge, labour and tax cells.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Platform, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { byLanguage, fontWeight, iconSize, layout, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { InvoiceItemData, GroupedInvoiceItems } from '@/types/invoice.types';
import { useAppSelector } from '@/store/hooks';
import { selectInvoiceFormBulkPricing } from '@/store/slices/invoiceFormSlice';
import { roundMoney, formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatCount, formatDate, formatWeight } from '@/utils/formatters';
import { getLanguage, localizeDigits, t as tr, formatIdentifier } from '@/i18n';
import { InlineValidation } from '@/components/fiori';
import { RateInput } from '@/features/invoice/components/RateInput';
import { parseRateInput, type RateField } from '@/features/invoice/utils/amountInput';

type GroupRateTexts = Record<RateField, string>;
const RATE_FIELDS: RateField[] = ['charge', 'labour_rate', 'tax'];
const EMPTY_GROUP_RATES: GroupRateTexts = { charge: '', labour_rate: '', tax: '' };

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
  container: {
    flex: 1,
    gap: space.md,
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
  weight: number;
  charge: number;
  labour_rate: number;
  tax: number;
}

interface InvoiceItemsTableProps {
  items: InvoiceItemData[];
  onItemUpdate: (tempId: string, field: string, value: number) => void;
  onBulkEdit: (groupKey: string, pricing: { charge: number; labour_rate: number; tax: number }) => void;
  onEditPricing?: (params: EditPricingParams) => void;
  renderItem?: (item: InvoiceItemData) => React.ReactElement;
  /** Told whether a rate field currently holds text that was not accepted, so the step can hold "Next". */
  onInputErrorChange?: (hasError: boolean) => void;
}

export const InvoiceItemsTable: React.FC<InvoiceItemsTableProps> = ({
  items,
  onItemUpdate,
  onBulkEdit,
  onEditPricing,
  onInputErrorChange,
}) => {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const language = getLanguage();
  // Column widths: text left, numbers right. They differ by language too.
  const cols = useMemo(() => {
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
  }, [fontScale, language]);
  const t = useTokens();

  // Get bulk pricing from Redux
  const bulkPricingFromRedux = useAppSelector(selectInvoiceFormBulkPricing);

  // Track which groups are expanded
  const [expandedItemGroups, setExpandedItemGroups] = useState<Set<string>>(new Set());

  // Track editing cell
  const [editingCell, setEditingCell] = useState<{ tempId: string; field: string } | null>(null);

  // Track bulk pricing inputs for each item group
  const [bulkPricingInputs, setBulkPricingInputs] = useState<Record<string, GroupRateTexts>>({});

  // Text in a rate field that was not accepted, by field. A group field is
  // keyed `group|<groupKey>|<field>`, a table cell `cell|<temp_id>|<field>`.
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
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

  // The group rates as the form holds them: the WEIGHTED average of the
  // group's lines, or the group rates the user applied.
  // Weighted averages ensure that applying group values produces the same totals as individual items
  const groupRateDefaults = useMemo(() => {
    const initialInputs: Record<string, GroupRateTexts> = {};

    // Group items by group key and calculate weighted averages
    const groupTotals: Record<string, {
      // For charge: weight by qty * duration (since amount = qty * charge * duration)
      chargeWeightedSum: number;
      chargeWeightTotal: number;
      // For labour: weight by qty (since labour_amount = qty * labour_rate)
      labourWeightedSum: number;
      labourWeightTotal: number;
      // For tax: weight by (amount + labour_amount) since tax applies to subtotal
      taxWeightedSum: number;
      taxWeightTotal: number;
    }> = {};

    items.forEach((item) => {
      const groupKey = `${item.item_id}:::${item.package_mark}`;
      if (!groupTotals[groupKey]) {
        groupTotals[groupKey] = {
          chargeWeightedSum: 0,
          chargeWeightTotal: 0,
          labourWeightedSum: 0,
          labourWeightTotal: 0,
          taxWeightedSum: 0,
          taxWeightTotal: 0,
        };
      }

      const chargeWeight = item.qty * item.duration;
      const labourWeight = item.qty;
      const taxWeight = item.amount + item.labour_amount; // subtotal before tax

      groupTotals[groupKey].chargeWeightedSum += item.charge * chargeWeight;
      groupTotals[groupKey].chargeWeightTotal += chargeWeight;

      groupTotals[groupKey].labourWeightedSum += item.labour_rate * labourWeight;
      groupTotals[groupKey].labourWeightTotal += labourWeight;

      groupTotals[groupKey].taxWeightedSum += item.tax * taxWeight;
      groupTotals[groupKey].taxWeightTotal += taxWeight;
    });

    // Calculate weighted averages for each group
    Object.keys(groupTotals).forEach((groupKey) => {
      const totals = groupTotals[groupKey];

      const weightedCharge = totals.chargeWeightTotal > 0
        ? totals.chargeWeightedSum / totals.chargeWeightTotal
        : 0;
      const weightedLabour = totals.labourWeightTotal > 0
        ? totals.labourWeightedSum / totals.labourWeightTotal
        : 0;
      const weightedTax = totals.taxWeightTotal > 0
        ? totals.taxWeightedSum / totals.taxWeightTotal
        : 0;

      initialInputs[groupKey] = {
        charge: weightedCharge > 0 ? weightedCharge.toFixed(2) : '',
        labour_rate: weightedLabour > 0 ? weightedLabour.toFixed(2) : '',
        // Two decimals at most, as stored: "2.5" must not start as "3", which the
        // next change of the group's charge or labour rate would give to every line.
        tax: weightedTax > 0 ? String(roundMoney(weightedTax)) : '',
      };
    });

    // Override with Redux bulk pricing values if they exist (user explicitly set group pricing)
    Object.keys(bulkPricingFromRedux).forEach((groupKey) => {
      const pricing = bulkPricingFromRedux[groupKey];
      initialInputs[groupKey] = {
        charge: String(pricing.charge),
        labour_rate: String(pricing.labour_rate),
        tax: String(pricing.tax),
      };
    });

    return initialInputs;
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

  // #23 Fix: Extended type with pre-computed allItems to avoid flatMap in render
  type GroupedInvoiceItemsWithAllItems = GroupedInvoiceItems & { allItems: InvoiceItemData[] };

  // Group items by Item Group (item_id + package_mark)
  // Pre-compute allItems here to avoid flatMap in render path
  const groupedItems = useMemo(() => {
    const groups: GroupedInvoiceItemsWithAllItems[] = [];
    const itemMap = new Map<string, GroupedInvoiceItemsWithAllItems>();

    items.forEach((item) => {
      const groupKey = `${item.item_id}:::${item.package_mark}`;

      if (!itemMap.has(groupKey)) {
        itemMap.set(groupKey, {
          item_id: item.item_id,
          item_name: item.item_name,
          package_mark: item.package_mark,
          total_weight: item.weight,
          gr_quantity: item.grn_original_qty,
          total_dispatched: 0,
          rack: item.rack,
          dispatches: [],
          allItems: [], // Pre-computed flat list of all items in group
        });
      }

      const itemGroup = itemMap.get(groupKey)!;

      let dispatchGroup = itemGroup.dispatches.find((d) => d.dispatch_id === item.dispatch_id);
      if (!dispatchGroup) {
        dispatchGroup = {
          dispatch_no: item.dispatch_no,
          dispatch_id: item.dispatch_id,
          dispatch_date: item.dispatch_date,
          items: [],
        };
        itemGroup.dispatches.push(dispatchGroup);
      }

      dispatchGroup.items.push(item);
      itemGroup.allItems.push(item); // Add to pre-computed flat list
      itemGroup.total_dispatched += item.qty;
    });

    itemMap.forEach((group) => groups.push(group));
    return groups;
  }, [items]);

  // Calculate totals
  const calculateItemGroupTotal = (itemGroup: GroupedInvoiceItems) => {
    return itemGroup.dispatches.reduce(
      (sum, dispatch) => sum + dispatch.items.reduce((dispSum, item) => dispSum + item.item_total, 0),
      0
    );
  };

  // Handle bulk pricing input changes
  const handleBulkPricingChange = useCallback(
    (groupKey: string, field: RateField, typed: string) => {
      // Digits typed as ૦-૯ are kept as 0-9.
      const parsed = parseRateInput(field, typed);
      const newInputs = { ...(bulkPricingInputs[groupKey] || EMPTY_GROUP_RATES), [field]: parsed.text };

      setBulkPricingInputs((prev) => ({ ...prev, [groupKey]: newInputs }));
      setInputError(`group|${groupKey}|${field}`, parsed.error);

      // Text that is not a rate inside the range is not applied to the lines.
      if (parsed.value === null) return;
      const applied = parsed.value;
      const rate = (name: RateField) => (name === field ? applied : parseRateInput(name, newInputs[name]).value ?? 0);

      onBulkEdit(groupKey, { charge: rate('charge'), labour_rate: rate('labour_rate'), tax: rate('tax') });
    },
    [bulkPricingInputs, onBulkEdit, setInputError]
  );

  // A group field that is left with text that was not accepted shows the applied rate again.
  const handleBulkPricingBlur = useCallback(
    (groupKey: string, field: RateField) => {
      const key = `group|${groupKey}|${field}`;
      if (!inputErrors[key]) return;
      setInputError(key, null);
      setBulkPricingInputs((prev) => ({
        ...prev,
        [groupKey]: { ...(prev[groupKey] || EMPTY_GROUP_RATES), [field]: groupRateDefaults[groupKey]?.[field] ?? '' },
      }));
    },
    [inputErrors, groupRateDefaults, setInputError]
  );

  // Toggle group expansion
  const toggleItemGroup = useCallback((groupKey: string) => {
    setExpandedItemGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  }, []);

  // Handle edit pricing button press
  const handleEditPricingPress = useCallback((itemGroup: GroupedInvoiceItemsWithAllItems) => {
    if (!onEditPricing) return;

    // Get first item to extract pricing values (all items in group share same item)
    const firstItem = itemGroup.allItems[0];
    if (!firstItem) return;

    onEditPricing({
      item_id: itemGroup.item_id,
      item_name: itemGroup.item_name,
      weight: itemGroup.total_weight,
      charge: firstItem.charge,
      labour_rate: firstItem.labour_rate,
      tax: firstItem.tax,
    });
  }, [onEditPricing]);

  // Empty state
  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="table-off" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>{tr('invoice.form.noItemsTitle')}</Text>
        <Text style={styles.emptyText}>{tr('invoice.table.emptyText')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {groupedItems.map((itemGroup) => {
        const groupKey = `${itemGroup.item_id}:::${itemGroup.package_mark}`;
        const isExpanded = expandedItemGroups.has(groupKey);
        const groupTotal = calculateItemGroupTotal(itemGroup);
        const currentInputs = bulkPricingInputs[groupKey] || EMPTY_GROUP_RATES;
        const groupRateError = RATE_FIELDS.map((field) => inputErrors[`group|${groupKey}|${field}`]).find(Boolean);
        const groupFieldStyle = (field: RateField) => [
          styles.field,
          !!inputErrors[`group|${groupKey}|${field}`] && styles.fieldError,
        ];

        // #23 Fix: Use pre-computed allItems instead of flatMap in render
        const { allItems } = itemGroup;
        const dispatchCount = formatCount(allItems.length, 'dispatch', 'dispatches');
        const groupTotalText = formatInvoiceAmount(groupTotal);

        // The message for a table cell of this group whose text was not accepted.
        const cellError = allItems
          .flatMap((line) => RATE_FIELDS.map((field) => inputErrors[`cell|${line.temp_id}|${field}`]))
          .find(Boolean);

        const renderEditableCell = (
          item: InvoiceItemData,
          field: RateField,
          columnStyle: object,
          label: string,
          display: string
        ) => {
          const isEditing = editingCell?.tempId === item.temp_id && editingCell?.field === field;
          const cellKey = `cell|${item.temp_id}|${field}`;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.tableDataCell,
                columnStyle,
                styles.editableCell,
                pressed && !isEditing && styles.editableCellPressed,
                isEditing && styles.editingCell,
                !!inputErrors[cellKey] && styles.cellError,
              ]}
              onPress={() => setEditingCell({ tempId: item.temp_id, field })}
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
                  onCommit={(value) => onItemUpdate(item.temp_id, field, value)}
                  onErrorChange={(error) => setInputError(cellKey, error)}
                  autoFocus
                  selectTextOnFocus
                  onBlur={() => setEditingCell(null)}
                />
              ) : (
                <Text style={styles.tableDataText} {...oneLine}>{display}</Text>
              )}
            </Pressable>
          );
        };

        return (
          <View key={groupKey} style={styles.groupCard}>
            {/* Group header - tappable */}
            <Pressable
              style={({ pressed }) => [styles.groupHeader, pressed && styles.groupHeaderPressed]}
              onPress={() => toggleItemGroup(groupKey)}
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
              <Icon
                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                size={iconSize.lg}
                color={t.icon.secondary}
              />
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
                {onEditPricing && (
                  <Pressable
                    style={({ pressed }) => [styles.editPricingButton, pressed && styles.editPricingButtonPressed]}
                    onPress={() => handleEditPricingPress(itemGroup)}
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
                      value={localizeDigits(currentInputs.charge ?? '')}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'charge', text)}
                      onBlur={() => handleBulkPricingBlur(groupKey, 'charge')}
                      placeholder={localizeDigits('0')}
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
                      value={localizeDigits(currentInputs.labour_rate ?? '')}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'labour_rate', text)}
                      onBlur={() => handleBulkPricingBlur(groupKey, 'labour_rate')}
                      placeholder={localizeDigits('0')}
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
                      value={localizeDigits(currentInputs.tax ?? '')}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'tax', text)}
                      onBlur={() => handleBulkPricingBlur(groupKey, 'tax')}
                      placeholder={localizeDigits('0')}
                      placeholderTextColor={t.text.placeholder}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.affix}>%</Text>
                  </View>
                </View>
              </View>
              <InlineValidation message={groupRateError || ''} variant="error" visible={!!groupRateError} />
            </View>

            {/* Expanded data table */}
            {isExpanded && (
              <View style={styles.tableContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
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
                    {allItems.map((item) => (
                      <View key={item.temp_id} style={styles.tableDataRow}>
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

                        {renderEditableCell(
                          item,
                          'charge',
                          cols.colCharge,
                          tr('invoice.label.charge'),
                          item.charge > 0 ? formatNumber(item.charge) : '—'
                        )}
                        {renderEditableCell(
                          item,
                          'labour_rate',
                          cols.colLabour,
                          tr('invoice.label.labourRate'),
                          item.labour_rate > 0 ? formatNumber(item.labour_rate) : '—'
                        )}
                        {renderEditableCell(
                          item,
                          'tax',
                          cols.colTax,
                          tr('invoice.itemCard.taxA11y'),
                          item.tax > 0 ? formatNumber(item.tax, 1) : '—'
                        )}

                        {/* Total - calculated */}
                        <View style={[styles.tableDataCell, cols.colTotal]}>
                          <Text style={[styles.tableDataText, styles.tableTotalText]} {...oneLine}>
                            {formatInvoiceAmount(item.item_total)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>

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
            )}

            {/* Collapsed state - show the dispatch count */}
            {!isExpanded && (
              <Pressable
                style={({ pressed }) => [styles.collapsedInfo, pressed && styles.collapsedInfoPressed]}
                onPress={() => toggleItemGroup(groupKey)}
                accessibilityRole="button"
                accessibilityState={{ expanded: false }}
              >
                <Icon name="table" size={iconSize.sm} color={t.brand.tint} />
                <Text style={styles.collapsedText}>{tr('invoice.table.showDispatches', { count: allItems.length })}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default InvoiceItemsTable;
