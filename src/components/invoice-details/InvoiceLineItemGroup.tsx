/**
 * InvoiceLineItemGroup Component - 100% SAP Fiori Compliant
 *
 * Expandable accordion showing GRN item grouped with related dispatch line items
 * Based on SAP Fiori for iOS Design Guidelines
 *
 * @see design/sap-fiori-specs/13-card.md
 * @see design/sap-fiori-specs/20-data-table.md
 *
 * Features:
 * - Collapsible header with common item details
 * - Fiori Data Table for dispatch items with sticky header
 * - Horizontal scrolling with sticky first column
 * - Alternating row colors
 * - Financial calculations display
 * - Animated expand/collapse
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
  Vibration,
  ViewStyle,
} from 'react-native';
import { Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatCurrency, formatNumber, formatDate } from '@/utils/formatters';
import { useListColors, ListColors } from '@/hooks/useListColors';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// Based on SAP Fiori Data Table Specification (20-data-table.md)
// ============================================================================
const FIORI_STATIC = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  // Data Table dimensions from spec
  dataTable: {
    headerRowHeight: 44,                 // Fiori spec: 44pt min touch target
    dataRowHeight: 48,                   // Fiori spec: 48-56pt comfortable
    columnMinWidth: 80,                  // Fiori spec: 80pt
    cellPaddingH: 12,                    // Fiori spec: 12pt horizontal
    cellPaddingV: 8,                     // Fiori spec: 8pt vertical
    stickyColumnWidth: 100,              // Width for sticky first column
  },
  typography: {
    // Data table specific
    tableHeader: {
      fontSize: 13,                      // Fiori spec: 13pt
      fontWeight: '600' as const,        // Fiori spec: Semibold
    },
    tableData: {
      fontSize: 15,                      // Fiori spec: 15pt
      fontWeight: '400' as const,        // Fiori spec: Regular
    },
    tableDataMedium: {
      fontSize: 15,
      fontWeight: '500' as const,
    },
    // Card typography
    headline: {
      fontSize: 16,
      fontWeight: '600' as const,
      letterSpacing: 0.15,
    },
    body: {
      fontSize: 14,
      fontWeight: '400' as const,
    },
    bodyMedium: {
      fontSize: 14,
      fontWeight: '600' as const,
    },
    caption: {
      fontSize: 12,
      fontWeight: '500' as const,
    },
    badge: {
      fontSize: 10,
      fontWeight: '700' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
  },
  dimensions: {
    cardRadius: 16,
    cardPadding: 16,
    avatarSize: 40,
    touchTarget: 44,
  },
  shadows: {
    card: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }) as ViewStyle,
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

// Individual dispatch line item within a group
export interface DispatchLineItem {
  id: string;
  dispatch_no?: string;
  dispatch_id?: string;
  dispatch_date?: string;
  dispatch_qty: number;
  grn_date?: string;
  no_of_days: number;
  duration: number;
  charge_per_unit: number;
  labour_rate: number;
  line_item_amount: number;
  tax: number;
  // For navigation
  on_view_dispatch?: (dispatch_id: string) => void;
}

// Grouped item (GRN item with common details)
export interface InvoiceLineItemGroupData {
  grn_item_id: string;
  item_name: string;
  packaging?: string;
  weight: number;
  grn_quantity: number;
  total_dispatch_qty: number;
  charge_per_unit: number;
  tax_rate?: number;
  labour_rate: number;
  // Calculated totals
  total_base_amount: number;
  total_tax_amount: number;
  total_amount: number;
  // Rate structure info
  rate_structure?: string;
  // Storage details
  package_mark?: string;
  rack?: string;
  gr_no?: string;
  // Dispatch line items
  dispatch_items: DispatchLineItem[];
  // Navigation
  on_view_grn?: (gr_no: string) => void;
}

interface InvoiceLineItemGroupProps {
  group: InvoiceLineItemGroupData;
  default_expanded?: boolean;
}

// ============================================================================
// DYNAMIC STYLES FACTORY
// ============================================================================
const createDynamicStyles = (colors: ListColors) => StyleSheet.create({
  card: {
    marginHorizontal: FIORI_STATIC.spacing.lg,
    marginBottom: FIORI_STATIC.spacing.md,
    backgroundColor: colors.cellBackground,
    borderRadius: FIORI_STATIC.dimensions.cardRadius,
    borderWidth: 1,
    borderColor: colors.cellDivider,
    overflow: 'hidden',
    ...FIORI_STATIC.shadows.card,
  },
  itemIconContainer: {
    width: FIORI_STATIC.dimensions.avatarSize,
    height: FIORI_STATIC.dimensions.avatarSize,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: FIORI_STATIC.spacing.md,
  },
  itemName: {
    ...FIORI_STATIC.typography.headline,
    color: colors.gray900,
    lineHeight: 22,
  },
  packagingLabel: {
    ...FIORI_STATIC.typography.caption,
    color: colors.gray500,
    marginTop: 2,
  },
  expandIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gray50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricBadgeTeal: {
    backgroundColor: colors.statusPositiveLight,
    paddingHorizontal: FIORI_STATIC.spacing.sm,
    paddingVertical: FIORI_STATIC.spacing.xs,
    borderRadius: 8,
  },
  metricBadgePrimary: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: FIORI_STATIC.spacing.sm,
    paddingVertical: FIORI_STATIC.spacing.xs,
    borderRadius: 8,
  },
  metricLabel: {
    ...FIORI_STATIC.typography.badge,
    color: colors.gray500,
  },
  metricValue: {
    fontSize: 13,
    color: colors.gray600,
    fontWeight: '700',
  },
  summaryRow: {
    marginTop: FIORI_STATIC.spacing.md,
    paddingTop: FIORI_STATIC.spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cellDivider,
  },
  rateLabel: {
    fontSize: 11,
    color: colors.gray500,
    fontWeight: '500',
  },
  rateValue: {
    fontSize: 13,
    color: colors.gray900,
    fontWeight: '600',
  },
  financialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: FIORI_STATIC.spacing.md,
    borderRadius: 10,
    backgroundColor: colors.gray50,
    overflow: 'hidden',
  },
  financialDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.cellDivider,
  },
  financialLabel: {
    ...FIORI_STATIC.typography.badge,
    color: colors.gray500,
    marginBottom: 2,
  },
  baseAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray900,
  },
  taxAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  totalAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.success,
  },
  dispatchCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: FIORI_STATIC.spacing.md,
    paddingTop: FIORI_STATIC.spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cellDivider,
    gap: 6,
  },
  dispatchCountText: {
    ...FIORI_STATIC.typography.caption,
    color: colors.gray600,
    flex: 1,
  },
  tapHint: {
    fontSize: 11,
    color: colors.gray500,
    fontWeight: '500',
  },
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: colors.cellDivider,
  },
  stickyColumn: {
    width: FIORI_STATIC.dataTable.stickyColumnWidth,
    borderRightWidth: 1,
    borderRightColor: colors.cellDivider,
    backgroundColor: colors.cellBackground,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
    zIndex: 1,
  },
  stickyHeaderCell: {
    height: FIORI_STATIC.dataTable.headerRowHeight,
    justifyContent: 'center',
    paddingHorizontal: FIORI_STATIC.dataTable.cellPaddingH,
    backgroundColor: colors.gray50,
    borderBottomWidth: 1,
    borderBottomColor: colors.cellDivider,
  },
  stickyDataCell: {
    height: FIORI_STATIC.dataTable.dataRowHeight,
    justifyContent: 'center',
    paddingHorizontal: FIORI_STATIC.dataTable.cellPaddingH,
    backgroundColor: colors.cellBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cellDivider,
  },
  dispatchNoText: {
    ...FIORI_STATIC.typography.tableDataMedium,
    color: colors.primary,
  },
  dispatchDateText: {
    fontSize: 11,
    color: colors.gray500,
    marginTop: 2,
  },
  headerRow: {
    flexDirection: 'row',
    height: FIORI_STATIC.dataTable.headerRowHeight,
    backgroundColor: colors.gray50,
    borderBottomWidth: 1,
    borderBottomColor: colors.cellDivider,
  },
  headerCellText: {
    ...FIORI_STATIC.typography.tableHeader,
    color: colors.gray900,
  },
  rowAlt: {
    backgroundColor: colors.gray50,
  },
  tableFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingLeft: FIORI_STATIC.spacing.lg,
    paddingRight: FIORI_STATIC.spacing.xl,
    paddingVertical: FIORI_STATIC.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cellDivider,
  },
  footerLabel: {
    ...FIORI_STATIC.typography.tableHeader,
    color: colors.primary,
  },
  footerValueLabel: {
    fontSize: 11,
    color: colors.gray500,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  footerValueText: {
    ...FIORI_STATIC.typography.tableDataMedium,
    color: colors.gray900,
    fontSize: 14,
  },
  footerTotalAmount: {
    color: colors.success,
    fontWeight: '700',
    fontSize: 15,
  },
  grnReferenceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.spacing.lg,
    paddingVertical: FIORI_STATIC.spacing.md,
    backgroundColor: colors.blueLight,
    gap: FIORI_STATIC.spacing.sm,
  },
  grnIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.cellBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grnLabel: {
    ...FIORI_STATIC.typography.caption,
    color: colors.gray600,
  },
  grnNumber: {
    fontSize: 13,
    color: colors.blue,
    fontWeight: '600',
    flex: 1,
  },
});

// ============================================================================
// COMPONENT
// ============================================================================
const InvoiceLineItemGroupComponent: React.FC<InvoiceLineItemGroupProps> = ({
  group,
  default_expanded = false,
}) => {
  const [expanded, setExpanded] = useState(default_expanded);

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => createDynamicStyles(colors), [colors]);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => !prev);
  }, []);

  const handleViewGRN = useCallback(() => {
    if (group.gr_no && group.on_view_grn) {
      group.on_view_grn(group.gr_no);
    }
  }, [group.gr_no, group.on_view_grn]);

  return (
    <View style={dynamicStyles.card}>
      {/* Header Section - Tappable to expand/collapse */}
      <TouchableOpacity
        onPress={toggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${group.item_name}, ${expanded ? 'collapse' : 'expand'} to see ${group.dispatch_items?.length ?? 0} dispatch items`}
      >
        <View style={styles.headerSection}>
          {/* Item Icon & Name */}
          <View style={styles.headerTop}>
            <View style={dynamicStyles.itemIconContainer}>
              <Icon name="package-variant" size={20} color={colors.primary} />
            </View>
            <View style={styles.headerTitleArea}>
              <Text style={dynamicStyles.itemName} numberOfLines={2}>
                {group.item_name}
              </Text>
              {group.packaging && (
                <Text style={dynamicStyles.packagingLabel}>{group.packaging}</Text>
              )}
            </View>
            <View style={dynamicStyles.expandIcon}>
              <Icon
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={colors.gray500}
              />
            </View>
          </View>

          {/* Key Metrics Row */}
          <View style={styles.metricsRow}>
            {/* Weight */}
            {group.weight > 0 && (
              <View style={styles.metricItem}>
                <Icon name="weight" size={14} color={colors.gray500} />
                <Text style={dynamicStyles.metricValue}>{formatNumber(group.weight)} kg</Text>
              </View>
            )}
            {/* GRN Qty */}
            <View style={[styles.metricItem, dynamicStyles.metricBadgeTeal]}>
              <Icon name="arrow-down-bold-circle" size={14} color={colors.success} />
              <Text style={dynamicStyles.metricLabel}>GRN</Text>
              <Text style={[dynamicStyles.metricValue, { color: colors.success }]}>
                {formatNumber(group.grn_quantity)}
              </Text>
            </View>
            {/* Total Dispatch Qty */}
            <View style={[styles.metricItem, dynamicStyles.metricBadgePrimary]}>
              <Icon name="arrow-up-bold-circle" size={14} color={colors.primary} />
              <Text style={dynamicStyles.metricLabel}>Disp</Text>
              <Text style={[dynamicStyles.metricValue, { color: colors.primary }]}>
                {formatNumber(group.total_dispatch_qty)}
              </Text>
            </View>
          </View>

          {/* Rates & Totals Summary */}
          <View style={dynamicStyles.summaryRow}>
            <View style={styles.rateSection}>
              <View style={styles.rateItem}>
                <Text style={dynamicStyles.rateLabel}>Charge/Unit</Text>
                <Text style={dynamicStyles.rateValue}>{formatCurrency(group.charge_per_unit)}</Text>
              </View>
              {group.labour_rate > 0 && (
                <View style={styles.rateItem}>
                  <Text style={dynamicStyles.rateLabel}>Labour</Text>
                  <Text style={dynamicStyles.rateValue}>{formatCurrency(group.labour_rate)}</Text>
                </View>
              )}
              {group.tax_rate !== undefined && group.tax_rate > 0 && (
                <View style={styles.rateItem}>
                  <Text style={dynamicStyles.rateLabel}>Tax</Text>
                  <Text style={dynamicStyles.rateValue}>{group.tax_rate}%</Text>
                </View>
              )}
            </View>
          </View>

          {/* Financial Summary Bar */}
          <Surface style={dynamicStyles.financialBar} elevation={0}>
            <View style={styles.financialItem}>
              <Text style={dynamicStyles.financialLabel}>BASE</Text>
              <Text style={dynamicStyles.baseAmount}>{formatCurrency(group.total_base_amount)}</Text>
            </View>
            <View style={dynamicStyles.financialDivider} />
            <View style={styles.financialItem}>
              <Text style={dynamicStyles.financialLabel}>TAX</Text>
              <Text style={dynamicStyles.taxAmount}>{formatCurrency(group.total_tax_amount)}</Text>
            </View>
            <View style={dynamicStyles.financialDivider} />
            <View style={styles.financialItem}>
              <Text style={dynamicStyles.financialLabel}>TOTAL</Text>
              <Text style={dynamicStyles.totalAmount}>{formatCurrency(group.total_amount)}</Text>
            </View>
          </Surface>

          {/* Dispatch Count Indicator */}
          <View style={dynamicStyles.dispatchCountRow}>
            <Icon name="truck-fast-outline" size={16} color={colors.gray500} />
            <Text style={dynamicStyles.dispatchCountText}>
              {group.dispatch_items?.length ?? 0} {(group.dispatch_items?.length ?? 0) === 1 ? 'dispatch' : 'dispatches'}
            </Text>
            <Text style={dynamicStyles.tapHint}>
              {expanded ? 'Tap to collapse' : 'Tap to expand'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded Dispatch Items - Fiori Data Table */}
      {expanded && (
        <View style={dynamicStyles.expandedSection}>
          {/* Data Table with Horizontal Scroll */}
          <View style={styles.dataTableContainer}>
            {/* Sticky First Column (Dispatch Info) */}
            <View style={dynamicStyles.stickyColumn}>
              {/* Sticky Header Cell */}
              <View style={dynamicStyles.stickyHeaderCell}>
                <Text style={dynamicStyles.headerCellText}>Dispatch</Text>
              </View>
              {/* Sticky Data Cells */}
              {(group.dispatch_items ?? []).map((item, index) => (
                <TouchableOpacity
                  key={`sticky-${item.id}-${index}`}
                  style={[
                    dynamicStyles.stickyDataCell,
                    index % 2 === 1 && dynamicStyles.rowAlt,
                    index === (group.dispatch_items?.length ?? 0) - 1 && styles.lastRow,
                  ]}
                  onPress={() => {
                    if (item.dispatch_id && item.on_view_dispatch) {
                      Vibration.vibrate(10);
                      item.on_view_dispatch(item.dispatch_id);
                    }
                  }}
                  disabled={!item.dispatch_id || !item.on_view_dispatch}
                  activeOpacity={0.7}
                >
                  <Text style={dynamicStyles.dispatchNoText}>
                    {item.dispatch_no ? `#${item.dispatch_no}` : '-'}
                  </Text>
                  <Text style={dynamicStyles.dispatchDateText}>
                    {formatDate(item.dispatch_date)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Scrollable Columns */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              bounces={false}
              style={styles.scrollableArea}
              contentContainerStyle={styles.scrollableContent}
            >
              <View>
                {/* Header Row */}
                <View style={dynamicStyles.headerRow}>
                  <View style={[styles.headerCell, styles.colQty]}>
                    <Text style={dynamicStyles.headerCellText}>Qty</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colDays]}>
                    <Text style={dynamicStyles.headerCellText}>Days</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colDuration]}>
                    <Text style={dynamicStyles.headerCellText}>Duration</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colRate]}>
                    <Text style={dynamicStyles.headerCellText}>Rate</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colAmount]}>
                    <Text style={dynamicStyles.headerCellText}>Amount</Text>
                  </View>
                </View>

                {/* Data Rows */}
                {(group.dispatch_items ?? []).map((item, index) => (
                  <DispatchDataTableRow
                    key={`row-${item.id}-${index}`}
                    item={item}
                    isAlt={index % 2 === 1}
                    isLast={index === (group.dispatch_items?.length ?? 0) - 1}
                    colors={colors}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Table Footer - Totals Row */}
          <View style={dynamicStyles.tableFooter}>
            <View style={styles.footerLabelCell}>
              <Icon name="sigma" size={16} color={colors.primary} />
              <Text style={dynamicStyles.footerLabel}>Totals</Text>
            </View>
            <View style={styles.footerValues}>
              <View style={styles.footerValueItem}>
                <Text style={dynamicStyles.footerValueLabel}>Qty</Text>
                <Text style={dynamicStyles.footerValueText}>
                  {formatNumber(group.total_dispatch_qty)}
                </Text>
              </View>
              <View style={styles.footerValueItem}>
                <Text style={dynamicStyles.footerValueLabel}>Base</Text>
                <Text style={dynamicStyles.footerValueText}>
                  {formatCurrency(group.total_base_amount)}
                </Text>
              </View>
              <View style={styles.footerValueItem}>
                <Text style={dynamicStyles.footerValueLabel}>Tax</Text>
                <Text style={[dynamicStyles.footerValueText, { color: colors.primary }]}>
                  {formatCurrency(group.total_tax_amount)}
                </Text>
              </View>
              <View style={[styles.footerValueItem, styles.footerValueItemLast]}>
                <Text style={dynamicStyles.footerValueLabel}>Total</Text>
                <Text style={[dynamicStyles.footerValueText, dynamicStyles.footerTotalAmount]}>
                  {formatCurrency(group.total_amount)}
                </Text>
              </View>
            </View>
          </View>

          {/* GRN Reference Link */}
          {group.gr_no && group.on_view_grn && (
            <TouchableOpacity
              style={dynamicStyles.grnReferenceButton}
              onPress={handleViewGRN}
              activeOpacity={0.7}
            >
              <View style={dynamicStyles.grnIcon}>
                <Icon name="file-document-outline" size={16} color={colors.blue} />
              </View>
              <Text style={dynamicStyles.grnLabel}>View GRN</Text>
              <Text style={dynamicStyles.grnNumber}>{group.gr_no}</Text>
              <Icon name="chevron-right" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// DISPATCH DATA TABLE ROW - Fiori Data Table Spec Compliant
// ============================================================================
interface DispatchDataTableRowProps {
  item: DispatchLineItem;
  isAlt: boolean;
  isLast: boolean;
  colors: ListColors;
}

const DispatchDataTableRow = React.memo<DispatchDataTableRowProps>(({
  item,
  isAlt,
  isLast,
  colors,
}) => {
  // Debug: log duration value
  if (__DEV__) console.log('[InvoiceLineItemGroup] DispatchDataTableRow - duration:', item.duration, 'no_of_days:', item.no_of_days);

  // Dynamic styles for this row
  const rowDynamicStyles = useMemo(() => StyleSheet.create({
    dataRow: {
      flexDirection: 'row',
      height: FIORI_STATIC.dataTable.dataRowHeight,
      backgroundColor: colors.cellBackground,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    rowAlt: {
      backgroundColor: colors.gray50,
    },
    dataCellText: {
      ...FIORI_STATIC.typography.tableData,
      color: colors.gray900,
      textAlign: 'center',
    },
    amountCellText: {
      ...FIORI_STATIC.typography.tableDataMedium,
      color: colors.success,
      textAlign: 'right',
    },
    taxSubtext: {
      fontSize: 11,
      color: colors.gray500,
      textAlign: 'right',
      marginTop: 2,
    },
  }), [colors]);

  return (
    <View
      style={[
        rowDynamicStyles.dataRow,
        isAlt && rowDynamicStyles.rowAlt,
        isLast && styles.lastRow,
      ]}
    >
      {/* Qty Cell */}
      <View style={[styles.dataCell, styles.colQty]}>
        <Text style={rowDynamicStyles.dataCellText}>
          {formatNumber(item.dispatch_qty)}
        </Text>
      </View>

      {/* Days Cell */}
      <View style={[styles.dataCell, styles.colDays]}>
        <Text style={rowDynamicStyles.dataCellText}>{item.no_of_days}</Text>
      </View>

      {/* Duration Cell */}
      <View style={[styles.dataCell, styles.colDuration]}>
        <Text style={rowDynamicStyles.dataCellText}>{formatNumber(item.duration, 1)}m</Text>
      </View>

      {/* Rate Cell */}
      <View style={[styles.dataCell, styles.colRate]}>
        <Text style={rowDynamicStyles.dataCellText}>
          {formatCurrency(item.charge_per_unit)}
        </Text>
      </View>

      {/* Amount Cell */}
      <View style={[styles.dataCell, styles.colAmount]}>
        <Text style={rowDynamicStyles.amountCellText}>
          {formatCurrency(item.line_item_amount)}
        </Text>
        {item.tax > 0 && (
          <Text style={rowDynamicStyles.taxSubtext}>+{formatCurrency(item.tax)}</Text>
        )}
      </View>
    </View>
  );
});

// ============================================================================
// STYLES (Static layout only - colors are in dynamicStyles)
// Based on design/sap-fiori-specs/20-data-table.md
// ============================================================================
const styles = StyleSheet.create({
  // Header Section
  headerSection: {
    padding: FIORI_STATIC.dimensions.cardPadding,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerTitleArea: {
    flex: 1,
    paddingRight: FIORI_STATIC.spacing.sm,
  },

  // Metrics Row
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: FIORI_STATIC.spacing.md,
    gap: FIORI_STATIC.spacing.sm,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI_STATIC.spacing.xs,
  },

  // Summary Row
  rateSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FIORI_STATIC.spacing.lg,
  },
  rateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Financial Bar
  financialItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },

  // Data Table Container - enables sticky column
  dataTableContainer: {
    flexDirection: 'row',
  },

  // Scrollable Area
  scrollableArea: {
    flex: 1,
  },
  scrollableContent: {
    flexGrow: 1,
  },

  // Header Cell
  headerCell: {
    justifyContent: 'center',
    paddingHorizontal: FIORI_STATIC.dataTable.cellPaddingH,
    paddingVertical: FIORI_STATIC.dataTable.cellPaddingV,
  },

  // Last Row - no bottom border
  lastRow: {
    borderBottomWidth: 0,
  },

  // Data Cell
  dataCell: {
    justifyContent: 'center',
    paddingHorizontal: FIORI_STATIC.dataTable.cellPaddingH,
    paddingVertical: FIORI_STATIC.dataTable.cellPaddingV,
  },

  // Column Widths - Fiori spec: min 80pt
  colQty: {
    width: FIORI_STATIC.dataTable.columnMinWidth,
  },
  colDays: {
    width: FIORI_STATIC.dataTable.columnMinWidth,
  },
  colDuration: {
    width: FIORI_STATIC.dataTable.columnMinWidth,
  },
  colRate: {
    width: 90,
  },
  colAmount: {
    width: 100,
  },

  // Table Footer
  footerLabelCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI_STATIC.spacing.sm,
    minWidth: 70,
    marginRight: FIORI_STATIC.spacing.sm,
  },
  footerValues: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerValueItem: {
    alignItems: 'center',
    minWidth: 55,
    paddingHorizontal: FIORI_STATIC.spacing.xs,
  },
  // Last item (Total) needs more space on the right
  footerValueItemLast: {
    alignItems: 'flex-end', // Right-align the total
    minWidth: 70,
    paddingRight: 0,
  },
});

// Custom areEqual comparator for performance optimization
const areEqual = (
  prevProps: InvoiceLineItemGroupProps,
  nextProps: InvoiceLineItemGroupProps
): boolean => {
  const prevGroup = prevProps.group;
  const nextGroup = nextProps.group;

  // Safety check for undefined groups
  if (!prevGroup || !nextGroup) return prevGroup === nextGroup;

  // Compare default_expanded prop
  if (prevProps.default_expanded !== nextProps.default_expanded) return false;

  // Compare key identifiers and totals
  if (prevGroup.grn_item_id !== nextGroup.grn_item_id) return false;
  if (prevGroup.total_amount !== nextGroup.total_amount) return false;
  if (prevGroup.total_base_amount !== nextGroup.total_base_amount) return false;
  if (prevGroup.total_tax_amount !== nextGroup.total_tax_amount) return false;

  // Compare quantities
  if (prevGroup.grn_quantity !== nextGroup.grn_quantity) return false;
  if (prevGroup.total_dispatch_qty !== nextGroup.total_dispatch_qty) return false;

  // Compare dispatch items count (with null safety)
  const prevItemsLength = prevGroup.dispatch_items?.length ?? 0;
  const nextItemsLength = nextGroup.dispatch_items?.length ?? 0;
  if (prevItemsLength !== nextItemsLength) return false;

  // Compare rates
  if (prevGroup.charge_per_unit !== nextGroup.charge_per_unit) return false;
  if (prevGroup.labour_rate !== nextGroup.labour_rate) return false;
  if (prevGroup.tax_rate !== nextGroup.tax_rate) return false;

  return true;
};

// Export memoized component with custom comparator
export const InvoiceLineItemGroup = React.memo(InvoiceLineItemGroupComponent, areEqual);
