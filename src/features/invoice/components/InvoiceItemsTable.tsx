/**
 * Invoice items table (style guide §13.7).
 *
 * Displays invoice items grouped by item name + package mark. Each group has
 * group pricing fields and a data table of its dispatch lines with editable
 * charge, labour and tax cells.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { InvoiceItemData, GroupedInvoiceItems } from '@/types/invoice.types';
import { useAppSelector } from '@/store/hooks';
import { selectInvoiceFormBulkPricing } from '@/store/slices/invoiceFormSlice';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';

/** Table rows with editable cells keep the full 44 minimum (§13.7). */
const ROW_MIN_HEIGHT = 44;

const COLUMN_WIDTH = {
  dispatch: 104,
  qty: 64,
  duration: 76,
  charge: 88,
  labour: 88,
  tax: 64,
  total: 120,
} as const;

// Safe date formatting helper: "9 Oct 26"
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
};

// Format number with Indian grouping - show decimals only if needed
const formatNumber = (value: number, maxDecimals: number = 2): string => {
  if (!value) return '0';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxDecimals }).format(value);
};

const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

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
    letterSpacing: 0.5,
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

  // Column widths: text left, numbers right
  colDispatch: { width: COLUMN_WIDTH.dispatch, alignItems: 'flex-start' as const },
  colQty: { width: COLUMN_WIDTH.qty, alignItems: 'flex-end' as const },
  colDuration: { width: COLUMN_WIDTH.duration, alignItems: 'flex-end' as const },
  colCharge: { width: COLUMN_WIDTH.charge, alignItems: 'flex-end' as const },
  colLabour: { width: COLUMN_WIDTH.labour, alignItems: 'flex-end' as const },
  colTax: { width: COLUMN_WIDTH.tax, alignItems: 'flex-end' as const },
  colTotal: { width: COLUMN_WIDTH.total, alignItems: 'flex-end' as const },

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
}

export const InvoiceItemsTable: React.FC<InvoiceItemsTableProps> = ({
  items,
  onItemUpdate,
  onBulkEdit,
  onEditPricing,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Get bulk pricing from Redux
  const bulkPricingFromRedux = useAppSelector(selectInvoiceFormBulkPricing);

  // Track which groups are expanded
  const [expandedItemGroups, setExpandedItemGroups] = useState<Set<string>>(new Set());

  // Track editing cell
  const [editingCell, setEditingCell] = useState<{ tempId: string; field: string } | null>(null);

  // Track bulk pricing inputs for each item group
  const [bulkPricingInputs, setBulkPricingInputs] = useState<
    Record<string, { charge: string; labour_rate: string; tax: string }>
  >({});

  // Initialize bulk pricing inputs - calculate WEIGHTED average of all items in group
  // Weighted averages ensure that applying group values produces the same totals as individual items
  useEffect(() => {
    const initialInputs: Record<string, { charge: string; labour_rate: string; tax: string }> = {};

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
        tax: weightedTax > 0 ? weightedTax.toFixed(0) : '',
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

    setBulkPricingInputs(initialInputs);
  }, [bulkPricingFromRedux, items]);

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
    (groupKey: string, field: 'charge' | 'labour_rate' | 'tax', text: string) => {
      const newInputs = {
        ...(bulkPricingInputs[groupKey] || { charge: '', labour_rate: '', tax: '' }),
        [field]: text,
      };

      setBulkPricingInputs((prev) => ({ ...prev, [groupKey]: newInputs }));

      const charge = parseFloat(newInputs.charge) || 0;
      const labour_rate = parseFloat(newInputs.labour_rate) || 0;
      const tax = parseFloat(newInputs.tax) || 0;

      onBulkEdit(groupKey, { charge, labour_rate, tax });
    },
    [bulkPricingInputs, onBulkEdit]
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

  // Handle cell edit
  const handleCellValueChange = useCallback(
    (tempId: string, field: string, text: string) => {
      const value = parseFloat(text) || 0;
      onItemUpdate(tempId, field, value);
    },
    [onItemUpdate]
  );

  // Empty state
  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="table-off" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>No items to invoice</Text>
        <Text style={styles.emptyText}>Items from the selected dispatches appear here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {groupedItems.map((itemGroup) => {
        const groupKey = `${itemGroup.item_id}:::${itemGroup.package_mark}`;
        const isExpanded = expandedItemGroups.has(groupKey);
        const groupTotal = calculateItemGroupTotal(itemGroup);
        const currentInputs = bulkPricingInputs[groupKey] || { charge: '', labour_rate: '', tax: '' };

        // #23 Fix: Use pre-computed allItems instead of flatMap in render
        const { allItems } = itemGroup;
        const dispatchCount = plural(allItems.length, 'dispatch', 'dispatches');
        const groupTotalText = formatInvoiceAmount(groupTotal);

        const renderEditableCell = (
          item: InvoiceItemData,
          field: 'charge' | 'labour_rate' | 'tax',
          columnStyle: object,
          label: string,
          display: string
        ) => {
          const isEditing = editingCell?.tempId === item.temp_id && editingCell?.field === field;
          const rawValue = item[field];
          return (
            <Pressable
              style={({ pressed }) => [
                styles.tableDataCell,
                columnStyle,
                styles.editableCell,
                pressed && !isEditing && styles.editableCellPressed,
                isEditing && styles.editingCell,
              ]}
              onPress={() => setEditingCell({ tempId: item.temp_id, field })}
              accessibilityRole="button"
              accessibilityLabel={`${label}, dispatch ${item.dispatch_no}, ${display}`}
              accessibilityHint="Edits the value"
            >
              {isEditing ? (
                <TextInput
                  style={styles.cellInput}
                  accessibilityLabel={`${label}, dispatch ${item.dispatch_no}`}
                  value={rawValue > 0 ? rawValue.toString() : ''}
                  onChangeText={(text) => handleCellValueChange(item.temp_id, field, text)}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  onBlur={() => setEditingCell(null)}
                />
              ) : (
                <Text style={styles.tableDataText}>{display}</Text>
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
              accessibilityLabel={`${itemGroup.item_name}, mark ${itemGroup.package_mark}, ${formatNumber(itemGroup.total_weight)} kg, GRN quantity ${formatNumber(itemGroup.gr_quantity)}, dispatched ${formatNumber(itemGroup.total_dispatched)}, total ${groupTotalText}`}
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
                    <Text style={styles.metaText}>{formatNumber(itemGroup.total_weight)} kg</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaText}>GRN qty {formatNumber(itemGroup.gr_quantity)}</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaText}>Dispatched {formatNumber(itemGroup.total_dispatched)}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.groupTotal}>
                <Text style={styles.groupTotalLabel}>Total</Text>
                <Text style={styles.groupTotalValue}>{groupTotalText}</Text>
              </View>
            </Pressable>

            {/* Group pricing section */}
            <View style={styles.bulkPricingSection}>
              <View style={styles.bulkPricingHeader}>
                <Text style={styles.bulkPricingLabel} accessibilityRole="header">Group pricing</Text>
                {onEditPricing && (
                  <Pressable
                    style={({ pressed }) => [styles.editPricingButton, pressed && styles.editPricingButtonPressed]}
                    onPress={() => handleEditPricingPress(itemGroup)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit pricing for ${itemGroup.item_name}`}
                  >
                    <Icon name="pencil-outline" size={iconSize.md} color={t.brand.tint} />
                  </Pressable>
                )}
                <Text style={styles.bulkPricingHint}>Applies to all {plural(allItems.length, 'line', 'lines')}</Text>
              </View>
              <View style={styles.bulkPricingInputs}>
                {/* Charge */}
                <View style={styles.bulkInputWrapper}>
                  <Text style={styles.inputLabel}>Charge</Text>
                  <View style={styles.field}>
                    <Text style={styles.affix}>₹</Text>
                    <TextInput
                      style={styles.bulkInput}
                      accessibilityLabel={`Storage charge for ${itemGroup.item_name}`}
                      value={currentInputs.charge}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'charge', text)}
                      placeholder="0"
                      placeholderTextColor={t.text.placeholder}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                {/* Labour */}
                <View style={styles.bulkInputWrapper}>
                  <Text style={styles.inputLabel}>Labour</Text>
                  <View style={styles.field}>
                    <Text style={styles.affix}>₹</Text>
                    <TextInput
                      style={styles.bulkInput}
                      accessibilityLabel={`Labour rate for ${itemGroup.item_name}`}
                      value={currentInputs.labour_rate}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'labour_rate', text)}
                      placeholder="0"
                      placeholderTextColor={t.text.placeholder}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                {/* Tax */}
                <View style={styles.bulkInputWrapper}>
                  <Text style={styles.inputLabel}>Tax</Text>
                  <View style={styles.field}>
                    <TextInput
                      style={styles.bulkInput}
                      accessibilityLabel={`Tax percent for ${itemGroup.item_name}`}
                      value={currentInputs.tax}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'tax', text)}
                      placeholder="0"
                      placeholderTextColor={t.text.placeholder}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.affix}>%</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Expanded data table */}
            {isExpanded && (
              <View style={styles.tableContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
                  <View>
                    {/* Header row */}
                    <View style={styles.tableHeaderRow}>
                      <View style={[styles.tableHeaderCell, styles.colDispatch]}>
                        <Text style={styles.tableHeaderText}>Dispatch</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colQty]}>
                        <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>Qty</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colDuration]}>
                        <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>Duration</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colCharge]}>
                        <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>Charge (₹)</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colLabour]}>
                        <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>Labour (₹)</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colTax]}>
                        <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>Tax (%)</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colTotal]}>
                        <Text style={[styles.tableHeaderText, styles.tableHeaderTextNumeric]}>Total</Text>
                      </View>
                    </View>

                    {/* Data rows */}
                    {allItems.map((item) => (
                      <View key={item.temp_id} style={styles.tableDataRow}>
                        {/* Dispatch info */}
                        <View style={[styles.tableDataCell, styles.colDispatch]}>
                          <Text style={styles.dispatchNo}>{item.dispatch_no}</Text>
                          <Text style={styles.dispatchDate}>{formatDate(item.dispatch_date)}</Text>
                        </View>

                        {/* Qty - read only */}
                        <View style={[styles.tableDataCell, styles.colQty]}>
                          <Text style={styles.tableDataText}>{formatNumber(item.qty)}</Text>
                        </View>

                        {/* Duration - read only */}
                        <View
                          style={[styles.tableDataCell, styles.colDuration]}
                          accessible
                          accessibilityLabel={`${formatNumber(item.duration, 1)} months, ${plural(item.no_of_days, 'day', 'days')}`}
                        >
                          <Text style={styles.tableDataText}>{formatNumber(item.duration, 1)} mo</Text>
                          <Text style={styles.secondaryText}>{plural(item.no_of_days, 'day', 'days')}</Text>
                        </View>

                        {renderEditableCell(
                          item,
                          'charge',
                          styles.colCharge,
                          'Charge',
                          item.charge > 0 ? formatNumber(item.charge) : '—'
                        )}
                        {renderEditableCell(
                          item,
                          'labour_rate',
                          styles.colLabour,
                          'Labour rate',
                          item.labour_rate > 0 ? formatNumber(item.labour_rate) : '—'
                        )}
                        {renderEditableCell(
                          item,
                          'tax',
                          styles.colTax,
                          'Tax percent',
                          item.tax > 0 ? formatNumber(item.tax, 1) : '—'
                        )}

                        {/* Total - calculated */}
                        <View style={[styles.tableDataCell, styles.colTotal]}>
                          <Text style={[styles.tableDataText, styles.tableTotalText]}>
                            {formatInvoiceAmount(item.item_total)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {/* Totals row */}
                <View
                  style={styles.tableFooter}
                  accessible
                  accessibilityLabel={`Group total for ${dispatchCount}, ${groupTotalText}`}
                >
                  <Text style={styles.tableFooterLabel}>Group total · {dispatchCount}</Text>
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
                <Text style={styles.collapsedText}>Show {dispatchCount}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default InvoiceItemsTable;
