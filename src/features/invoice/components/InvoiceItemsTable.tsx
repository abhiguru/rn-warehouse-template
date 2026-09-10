/**
 * Invoice Items Table - SAP Fiori Compliant
 * @see design/sap-fiori-specs/20-data-table.md
 *
 * Displays invoice items grouped by Item Name + Package Mark.
 * Each group contains a Fiori-compliant data table for dispatch items.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { InvoiceItemData, GroupedInvoiceItems } from '@/types/invoice.types';
import { useAppSelector } from '@/store/hooks';
import { selectInvoiceFormBulkPricing } from '@/store/slices/invoiceFormSlice';

// Fiori Data Table Spec Constants
const FIORI = {
  // Dimensions
  headerHeight: 44,
  rowHeight: 48,
  cellPaddingH: 12,
  cellPaddingV: 8,
  headerFontSize: 13,
  dataFontSize: 15,
  // Colors
  headerBg: '#F7F9FA',
  headerText: '#1D2D3E',
  rowBgDefault: '#FFFFFF',
  rowBgAlternate: '#F7F9FA',
  rowBgSelected: '#FFF4E6',
  activeCellStroke: '#f69000',
  border: '#E5E5E5',
  readOnlyBg: '#F5F6F7',
};

// Safe date formatting helper
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 'Invalid' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return 'Invalid';
  }
};

// Format number - show decimals only if needed
const formatNumber = (value: number, maxDecimals: number = 2): string => {
  if (value === 0) return '0';
  // Check if value has meaningful decimals
  const rounded = Math.round(value * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals);
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
};

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
        <Icon name="table-off" size={48} color={FIORI.border} />
        <Text style={styles.emptyText}>No items to display</Text>
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

        return (
          <View key={groupKey} style={styles.groupCard}>
            {/* Group Header - Tappable */}
            <TouchableOpacity
              style={styles.groupHeader}
              onPress={() => toggleItemGroup(groupKey)}
              activeOpacity={0.7}
            >
              <Icon
                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                size={24}
                color={theme.colors.white}
              />
              <View style={styles.groupHeaderContent}>
                <Text style={styles.groupTitle} numberOfLines={1}>
                  {itemGroup.item_name}
                </Text>
                <View style={styles.groupMeta}>
                  <View style={styles.metaBadge}>
                    <Icon name="package-variant" size={12} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.metaText}>{itemGroup.package_mark}</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <Icon name="weight-kilogram" size={12} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.metaText}>{itemGroup.total_weight} kg</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaText}>GR: {itemGroup.gr_quantity}</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaText}>Disp: {itemGroup.total_dispatched}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.groupTotalBadge}>
                <Text style={styles.groupTotalLabel}>Total</Text>
                <Text style={styles.groupTotalValue} numberOfLines={1} adjustsFontSizeToFit>
                  ₹{formatNumber(groupTotal)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Bulk Pricing Section */}
            <View style={styles.bulkPricingSection}>
              <View style={styles.bulkPricingHeader}>
                <Icon name="clipboard-edit-outline" size={16} color={theme.colors.gray[700]} />
                <Text style={styles.bulkPricingLabel}>Group Pricing</Text>
                {/* Edit Pricing Button */}
                {onEditPricing && (
                  <TouchableOpacity
                    style={styles.editPricingButton}
                    onPress={() => handleEditPricingPress(itemGroup)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="pencil" size={14} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}
                <Text style={styles.bulkPricingHint}>(applies to all {allItems.length} items)</Text>
              </View>
              <View style={styles.bulkPricingInputs}>
                {/* Charge */}
                <View style={styles.bulkInputWrapper}>
                  <Text style={styles.inputLabel}>Charge</Text>
                  <View style={styles.inputWithIcon}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={styles.bulkInput}
                      value={currentInputs.charge}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'charge', text)}
                      placeholder="0"
                      placeholderTextColor={theme.colors.gray[400]}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                {/* Labour */}
                <View style={styles.bulkInputWrapper}>
                  <Text style={styles.inputLabel}>Labour</Text>
                  <View style={styles.inputWithIcon}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={styles.bulkInput}
                      value={currentInputs.labour_rate}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'labour_rate', text)}
                      placeholder="0"
                      placeholderTextColor={theme.colors.gray[400]}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                {/* Tax */}
                <View style={styles.bulkInputWrapper}>
                  <Text style={styles.inputLabel}>Tax %</Text>
                  <View style={styles.inputWithIcon}>
                    <TextInput
                      style={styles.bulkInput}
                      value={currentInputs.tax}
                      onChangeText={(text) => handleBulkPricingChange(groupKey, 'tax', text)}
                      placeholder="0"
                      placeholderTextColor={theme.colors.gray[400]}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.percentSymbol}>%</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Expanded Data Table */}
            {isExpanded && (
              <View style={styles.tableContainer}>
                {/* Fiori Data Table Header */}
                <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false}>
                  <View>
                    {/* Header Row */}
                    <View style={styles.tableHeaderRow}>
                      <View style={[styles.tableHeaderCell, styles.colDispatch]}>
                        <Text style={styles.tableHeaderText}>Dispatch</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colQty]}>
                        <Text style={styles.tableHeaderText}>Qty</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colDuration]}>
                        <Text style={styles.tableHeaderText}>Duration</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colCharge]}>
                        <Text style={styles.tableHeaderText}>Charge ₹</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colLabour]}>
                        <Text style={styles.tableHeaderText}>Labour ₹</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colTax]}>
                        <Text style={styles.tableHeaderText}>Tax %</Text>
                      </View>
                      <View style={[styles.tableHeaderCell, styles.colTotal]}>
                        <Text style={styles.tableHeaderText}>Total ₹</Text>
                      </View>
                    </View>

                    {/* Data Rows */}
                    {allItems.map((item, index) => {
                      const isAlternate = index % 2 === 1;
                      const isChargeEditing =
                        editingCell?.tempId === item.temp_id && editingCell?.field === 'charge';
                      const isLabourEditing =
                        editingCell?.tempId === item.temp_id && editingCell?.field === 'labour_rate';
                      const isTaxEditing =
                        editingCell?.tempId === item.temp_id && editingCell?.field === 'tax';

                      return (
                        <View
                          key={item.temp_id}
                          style={[styles.tableDataRow, isAlternate && styles.tableDataRowAlternate]}
                        >
                          {/* Dispatch Info */}
                          <View style={[styles.tableDataCell, styles.colDispatch]}>
                            <Text style={styles.dispatchNo}>{item.dispatch_no}</Text>
                            <Text style={styles.dispatchDate}>{formatDate(item.dispatch_date)}</Text>
                          </View>

                          {/* Qty - Read Only */}
                          <View style={[styles.tableDataCell, styles.colQty]}>
                            <Text style={styles.tableDataText}>{item.qty}</Text>
                          </View>

                          {/* Duration - Read Only */}
                          <View style={[styles.tableDataCell, styles.colDuration]}>
                            <Text style={styles.tableDataText}>{formatNumber(item.duration, 1)}m</Text>
                            <Text style={styles.daysText}>{item.no_of_days}d</Text>
                          </View>

                          {/* Charge - Editable */}
                          <TouchableOpacity
                            style={[
                              styles.tableDataCell,
                              styles.colCharge,
                              styles.editableCell,
                              isChargeEditing && styles.editingCell,
                            ]}
                            onPress={() => setEditingCell({ tempId: item.temp_id, field: 'charge' })}
                            activeOpacity={0.7}
                          >
                            {isChargeEditing ? (
                              <TextInput
                                style={styles.cellInput}
                                value={item.charge > 0 ? item.charge.toString() : ''}
                                onChangeText={(text) =>
                                  handleCellValueChange(item.temp_id, 'charge', text)
                                }
                                keyboardType="decimal-pad"
                                autoFocus
                                selectTextOnFocus
                                onBlur={() => setEditingCell(null)}
                              />
                            ) : (
                              <Text style={styles.editableText}>
                                {item.charge > 0 ? formatNumber(item.charge) : '-'}
                              </Text>
                            )}
                          </TouchableOpacity>

                          {/* Labour - Editable */}
                          <TouchableOpacity
                            style={[
                              styles.tableDataCell,
                              styles.colLabour,
                              styles.editableCell,
                              isLabourEditing && styles.editingCell,
                            ]}
                            onPress={() =>
                              setEditingCell({ tempId: item.temp_id, field: 'labour_rate' })
                            }
                            activeOpacity={0.7}
                          >
                            {isLabourEditing ? (
                              <TextInput
                                style={styles.cellInput}
                                value={item.labour_rate > 0 ? item.labour_rate.toString() : ''}
                                onChangeText={(text) =>
                                  handleCellValueChange(item.temp_id, 'labour_rate', text)
                                }
                                keyboardType="decimal-pad"
                                autoFocus
                                selectTextOnFocus
                                onBlur={() => setEditingCell(null)}
                              />
                            ) : (
                              <Text style={styles.editableText}>
                                {item.labour_rate > 0 ? formatNumber(item.labour_rate) : '-'}
                              </Text>
                            )}
                          </TouchableOpacity>

                          {/* Tax - Editable */}
                          <TouchableOpacity
                            style={[
                              styles.tableDataCell,
                              styles.colTax,
                              styles.editableCell,
                              isTaxEditing && styles.editingCell,
                            ]}
                            onPress={() => setEditingCell({ tempId: item.temp_id, field: 'tax' })}
                            activeOpacity={0.7}
                          >
                            {isTaxEditing ? (
                              <TextInput
                                style={styles.cellInput}
                                value={item.tax > 0 ? item.tax.toString() : ''}
                                onChangeText={(text) =>
                                  handleCellValueChange(item.temp_id, 'tax', text)
                                }
                                keyboardType="decimal-pad"
                                autoFocus
                                selectTextOnFocus
                                onBlur={() => setEditingCell(null)}
                              />
                            ) : (
                              <Text style={styles.editableText}>
                                {item.tax > 0 ? formatNumber(item.tax, 1) : '-'}
                              </Text>
                            )}
                          </TouchableOpacity>

                          {/* Total - Calculated */}
                          <View style={[styles.tableDataCell, styles.colTotal]}>
                            <Text style={styles.totalText} numberOfLines={1} adjustsFontSizeToFit>
                              ₹{formatNumber(item.item_total)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Table Footer - Group Summary */}
                <View style={styles.tableFooter}>
                  <Text style={styles.tableFooterLabel}>
                    {allItems.length} dispatch{allItems.length !== 1 ? 'es' : ''} • Group Total
                  </Text>
                  <Text style={styles.tableFooterTotal} numberOfLines={1} adjustsFontSizeToFit>
                    ₹{formatNumber(groupTotal)}
                  </Text>
                </View>
              </View>
            )}

            {/* Collapsed State - Show item count */}
            {!isExpanded && (
              <View style={styles.collapsedInfo}>
                <Icon name="table" size={16} color={theme.colors.gray[500]} />
                <Text style={styles.collapsedText}>
                  {allItems.length} dispatch{allItems.length !== 1 ? 'es' : ''} • Tap to expand
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

// Fiori-compliant styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: theme.spacing.md,
  },

  // Empty State
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: FIORI.dataFontSize,
    color: theme.colors.fiori.text.secondary,
  },

  // Group Card
  groupCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
  },

  // Group Header
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  groupHeaderContent: {
    flex: 1,
  },
  groupTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.white,
    marginBottom: 4,
  },
  groupMeta: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.white,
  },
  editPricingButton: {
    backgroundColor: theme.colors.orange[50],
    borderRadius: 6,
    padding: 6,
    marginLeft: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.orange[200],
  },
  groupTotalBadge: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 100,
    flexShrink: 0,
  },
  groupTotalLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  groupTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.white,
    minWidth: 80,
  },

  // Bulk Pricing Section
  bulkPricingSection: {
    backgroundColor: FIORI.headerBg,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: FIORI.border,
  },
  bulkPricingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  bulkPricingLabel: {
    fontSize: FIORI.headerFontSize,
    fontWeight: '600',
    color: FIORI.headerText,
  },
  bulkPricingHint: {
    fontSize: 11,
    color: theme.colors.gray[500],
  },
  bulkPricingInputs: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  bulkInputWrapper: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.gray[600],
    marginBottom: 4,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  bulkInput: {
    flex: 1,
    height: 44,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    fontSize: 14,
    color: FIORI.headerText,
    textAlign: 'center',
    ...Platform.select({
      android: {
        textAlignVertical: 'center',
        includeFontPadding: false,
        paddingTop: 10,
        paddingBottom: 10,
      },
    }),
  },
  currencySymbol: {
    position: 'absolute',
    left: 8,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.gray[600],
    zIndex: 1,
  },
  percentSymbol: {
    position: 'absolute',
    right: 8,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.gray[600],
  },

  // Data Table Container
  tableContainer: {
    backgroundColor: theme.colors.white,
  },

  // Table Header Row
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: FIORI.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: FIORI.border,
    minHeight: FIORI.headerHeight,
  },
  tableHeaderCell: {
    paddingHorizontal: FIORI.cellPaddingH,
    paddingVertical: FIORI.cellPaddingV,
    justifyContent: 'center',
    minHeight: FIORI.headerHeight,
  },
  tableHeaderText: {
    fontSize: FIORI.headerFontSize,
    fontWeight: '600',
    color: FIORI.headerText,
  },

  // Table Data Row
  tableDataRow: {
    flexDirection: 'row',
    backgroundColor: FIORI.rowBgDefault,
    borderBottomWidth: 1,
    borderBottomColor: FIORI.border,
    minHeight: FIORI.rowHeight,
  },
  tableDataRowAlternate: {
    backgroundColor: FIORI.rowBgAlternate,
  },
  tableDataCell: {
    paddingHorizontal: FIORI.cellPaddingH,
    paddingVertical: FIORI.cellPaddingV,
    justifyContent: 'center',
    minHeight: FIORI.rowHeight,
  },
  tableDataText: {
    fontSize: FIORI.dataFontSize,
    color: FIORI.headerText,
  },

  // Column Widths
  colDispatch: { width: 100 },
  colQty: { width: 60, alignItems: 'center' },
  colDuration: { width: 70, alignItems: 'center' },
  colCharge: { width: 80, alignItems: 'flex-end' },
  colLabour: { width: 80, alignItems: 'flex-end' },
  colTax: { width: 60, alignItems: 'flex-end' },
  colTotal: { width: 90, alignItems: 'flex-end' },

  // Dispatch cell
  dispatchNo: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.blue[700],
  },
  dispatchDate: {
    fontSize: 11,
    color: theme.colors.gray[500],
  },
  daysText: {
    fontSize: 11,
    color: theme.colors.gray[500],
  },

  // Editable cells
  editableCell: {
    backgroundColor: theme.colors.white,
    borderRadius: 4,
    marginVertical: 4,
    marginHorizontal: 2,
  },
  editingCell: {
    borderWidth: 2,
    borderColor: FIORI.activeCellStroke,
  },
  editableText: {
    fontSize: FIORI.dataFontSize,
    color: FIORI.headerText,
    fontWeight: '500',
  },
  cellInput: {
    flex: 1,
    height: 36,
    fontSize: FIORI.dataFontSize,
    color: FIORI.headerText,
    textAlign: 'right',
    paddingVertical: 0,
    paddingHorizontal: 4,
    margin: 0,
    ...Platform.select({
      android: {
        textAlignVertical: 'center',
        includeFontPadding: false,
      },
    }),
  },

  // Total column
  totalText: {
    fontSize: FIORI.dataFontSize,
    fontWeight: '600',
    color: theme.colors.fiori.semantic.positive,
  },

  // Table Footer
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  tableFooterLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  tableFooterTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.white,
  },

  // Collapsed state
  collapsedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    backgroundColor: FIORI.rowBgAlternate,
  },
  collapsedText: {
    fontSize: 13,
    color: theme.colors.gray[600],
  },
});

export default InvoiceItemsTable;
