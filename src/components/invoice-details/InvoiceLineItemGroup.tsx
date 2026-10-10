/**
 * InvoiceLineItemGroup Component
 *
 * Expandable object cell for one GRN item with its dispatch line items
 * (style guide §13.6 and §13.7):
 * - Collapsible header with the item, quantities, rates and amounts
 * - Read-only data table of dispatches with a pinned first column,
 *   right-aligned tabular numbers, no alternate shading and a totals row
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  LayoutAnimation,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatNumber, formatDate, formatCount, formatWeight } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { t as tr } from '@/i18n';

// Read-only compact table metrics (§5.2 density, §13.7)
const TABLE = {
  headerRowHeight: 44,
  dataRowHeight: 48,
  cellPaddingH: space.md,
  stickyColumnWidth: 104,
  colQty: 72,
  colDays: 64,
  colDuration: 88,
  colRate: 104,
  colAmount: 120,
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
  grn_id?: string;
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
// STYLES
// ============================================================================
const tabular = ['tabular-nums' as const];

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.md,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  headerPressable: {},
  headerPressed: { backgroundColor: t.surface.cardPressed },
  headerSection: { padding: space.lg },
  headerTop: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.md },
  itemIconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  headerTitleArea: { flex: 1 },
  itemName: { ...typography.headline, color: t.text.primary },
  packagingLabel: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  metricsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: space.md,
    gap: space.lg,
  },
  metricItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  metricLabel: { ...typography.footnote, color: t.text.secondary },
  metricValue: {
    ...typography.footnote,
    color: t.text.primary,
    fontWeight: fontWeight.semibold,
    fontVariant: tabular,
  },
  summaryRow: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.lg,
  },
  financialRow: {
    flexDirection: 'row' as const,
    marginTop: space.md,
    gap: space.md,
  },
  financialItem: { flex: 1, alignItems: 'flex-end' as const, gap: space.xxs },
  financialLabel: { ...typography.footnote, color: t.text.secondary },
  amount: {
    ...typography.subhead,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: tabular,
  },
  totalAmount: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: tabular,
  },
  dispatchCountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.sm,
  },
  dispatchCountText: { ...typography.subhead, color: t.text.secondary, flex: 1 },
  expandedSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.divider },
  dataTableContainer: { flexDirection: 'row' as const },
  stickyColumn: {
    width: TABLE.stickyColumnWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border.separator,
    backgroundColor: t.surface.card,
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row' as const,
    height: TABLE.headerRowHeight,
    backgroundColor: t.background.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  stickyHeaderCell: {
    height: TABLE.headerRowHeight,
    justifyContent: 'center' as const,
    paddingHorizontal: TABLE.cellPaddingH,
    backgroundColor: t.background.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  headerCell: { justifyContent: 'center' as const, paddingHorizontal: TABLE.cellPaddingH },
  headerCellText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.secondary },
  headerCellTextRight: { textAlign: 'right' as const },
  stickyDataCell: {
    height: TABLE.dataRowHeight,
    justifyContent: 'center' as const,
    paddingHorizontal: TABLE.cellPaddingH,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  stickyDataCellPressed: { backgroundColor: t.surface.cardPressed },
  dispatchNoText: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.brand.tint, fontVariant: tabular },
  dispatchNoTextPlain: { color: t.text.primary },
  dispatchDateText: { ...typography.caption1, color: t.text.secondary, marginTop: space.xxs },
  dataRow: {
    flexDirection: 'row' as const,
    height: TABLE.dataRowHeight,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  lastRow: { borderBottomWidth: 0 },
  dataCell: { justifyContent: 'center' as const, paddingHorizontal: TABLE.cellPaddingH },
  dataCellText: {
    ...typography.subhead,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: tabular,
  },
  taxSubtext: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'right' as const,
    marginTop: space.xxs,
    fontVariant: tabular,
  },
  colQty: { width: TABLE.colQty },
  colDays: { width: TABLE.colDays },
  colDuration: { width: TABLE.colDuration },
  colRate: { width: TABLE.colRate },
  colAmount: { width: TABLE.colAmount },
  tableFooter: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
    gap: space.xs,
  },
  footerLabel: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
  footerValues: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.md },
  footerValueItem: { flexGrow: 1, alignItems: 'flex-end' as const, gap: space.xxs },
  footerValueLabel: { ...typography.caption1, color: t.text.secondary },
  footerValueText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: tabular,
  },
  grnReferenceButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: touchTarget,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  grnReferenceButtonPressed: { backgroundColor: t.surface.cardPressed },
  grnLabel: { ...typography.body, color: t.brand.tint, flex: 1 },
});

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// COMPONENT
// ============================================================================
const InvoiceLineItemGroupComponent: React.FC<InvoiceLineItemGroupProps> = ({
  group,
  default_expanded = false,
}) => {
  const [expanded, setExpanded] = useState(default_expanded);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => !prev);
  }, []);

  const handleViewGRN = useCallback(() => {
    const grnReference = group.grn_id || group.gr_no;
    if (grnReference && group.on_view_grn) {
      group.on_view_grn(grnReference);
    }
  }, [group.grn_id, group.gr_no, group.on_view_grn]);

  const dispatchItems = group.dispatch_items ?? [];
  const dispatchCount = dispatchItems.length;
  const dispatchCountText = formatCount(dispatchCount, 'dispatch', 'dispatches');

  return (
    <View style={styles.card}>
      {/* Header - tap to expand or collapse */}
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={tr('invoice.lineItem.groupA11y', {
          item: group.item_name,
          dispatches: dispatchCountText,
          total: formatInvoiceAmount(group.total_amount),
        })}
        accessibilityHint={expanded ? tr('invoice.lineItem.hidesDispatchesHint') : tr('invoice.lineItem.showsDispatchesHint')}
      >
        <View style={styles.headerSection}>
          <View style={styles.headerTop}>
            <View style={styles.itemIconContainer}>
              <Icon name="cube-outline" size={iconSize.md} color={t.brand.tint} />
            </View>
            <View style={styles.headerTitleArea}>
              <Text style={styles.itemName} numberOfLines={2}>
                {group.item_name}
              </Text>
              {group.packaging && (
                <Text style={styles.packagingLabel}>{group.packaging}</Text>
              )}
            </View>
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={iconSize.lg}
              color={t.icon.secondary}
            />
          </View>

          {/* Key metrics */}
          <View style={styles.metricsRow}>
            {group.weight > 0 && (
              <View style={styles.metricItem}>
                <Icon name="weight" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.metricValue}>{formatWeight(group.weight)}</Text>
              </View>
            )}
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>{tr('invoice.lineItem.received')}</Text>
              <Text style={styles.metricValue}>{formatNumber(group.grn_quantity)}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>{tr('invoice.lineItem.dispatched')}</Text>
              <Text style={styles.metricValue}>{formatNumber(group.total_dispatch_qty)}</Text>
            </View>
          </View>

          {/* Rates */}
          <View style={styles.summaryRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>{tr('invoice.lineItem.chargePerUnit')}</Text>
              <Text style={styles.metricValue}>{formatInvoiceAmount(group.charge_per_unit)}</Text>
            </View>
            {group.labour_rate > 0 && (
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{tr('invoice.label.labour')}</Text>
                <Text style={styles.metricValue}>{formatInvoiceAmount(group.labour_rate)}</Text>
              </View>
            )}
            {group.tax_rate !== undefined && group.tax_rate > 0 && (
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{tr('invoice.label.tax')}</Text>
                <Text style={styles.metricValue}>{tr('invoice.label.percent', { value: group.tax_rate })}</Text>
              </View>
            )}
          </View>

          {/* Amounts */}
          <View style={styles.financialRow}>
            <View style={styles.financialItem}>
              <Text style={styles.financialLabel}>{tr('invoice.lineItem.base')}</Text>
              <Text style={styles.amount}>{formatInvoiceAmount(group.total_base_amount)}</Text>
            </View>
            <View style={styles.financialItem}>
              <Text style={styles.financialLabel}>{tr('invoice.label.tax')}</Text>
              <Text style={styles.amount}>{formatInvoiceAmount(group.total_tax_amount)}</Text>
            </View>
            <View style={styles.financialItem}>
              <Text style={styles.financialLabel}>{tr('common.total')}</Text>
              <Text style={styles.totalAmount}>{formatInvoiceAmount(group.total_amount)}</Text>
            </View>
          </View>

          {/* Dispatch count */}
          <View style={styles.dispatchCountRow}>
            <Icon name="truck-delivery-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.dispatchCountText}>{dispatchCountText}</Text>
          </View>
        </View>
      </Pressable>

      {/* Expanded dispatch items - read-only data table */}
      {expanded && (
        <View style={styles.expandedSection}>
          <View style={styles.dataTableContainer}>
            {/* Pinned first column */}
            <View style={styles.stickyColumn}>
              <View style={styles.stickyHeaderCell}>
                <Text style={styles.headerCellText}>{tr('common.dispatch')}</Text>
              </View>
              {dispatchItems.map((item, index) => {
                const canOpen = !!(item.dispatch_id && item.on_view_dispatch);
                return (
                  <Pressable
                    key={`sticky-${item.id}-${index}`}
                    style={({ pressed }) => [
                      styles.stickyDataCell,
                      pressed && canOpen && styles.stickyDataCellPressed,
                      index === dispatchCount - 1 && styles.lastRow,
                    ]}
                    onPress={() => {
                      if (item.dispatch_id && item.on_view_dispatch) {
                        item.on_view_dispatch(item.dispatch_id);
                      }
                    }}
                    disabled={!canOpen}
                    accessibilityRole={canOpen ? 'link' : undefined}
                    accessibilityLabel={tr('invoice.lineItem.dispatchRowA11y', {
                      number: item.dispatch_no || '',
                      date: formatDate(item.dispatch_date, 'short'),
                    })}
                    accessibilityHint={canOpen ? tr('invoice.lineItem.opensDispatchHint') : undefined}
                  >
                    <Text style={[styles.dispatchNoText, !canOpen && styles.dispatchNoTextPlain]}>
                      {item.dispatch_no || '—'}
                    </Text>
                    <Text style={styles.dispatchDateText}>
                      {formatDate(item.dispatch_date, 'short')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Scrollable columns */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              bounces={false}
              style={localStyles.scrollableArea}
              contentContainerStyle={localStyles.scrollableContent}
            >
              <View>
                <View style={styles.headerRow}>
                  <View style={[styles.headerCell, styles.colQty]}>
                    <Text style={[styles.headerCellText, styles.headerCellTextRight]}>{tr('invoice.lineItem.colQty')}</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colDays]}>
                    <Text style={[styles.headerCellText, styles.headerCellTextRight]}>{tr('invoice.lineItem.colDays')}</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colDuration]}>
                    <Text style={[styles.headerCellText, styles.headerCellTextRight]}>{tr('invoice.lineItem.colMonths')}</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colRate]}>
                    <Text style={[styles.headerCellText, styles.headerCellTextRight]}>{tr('invoice.lineItem.colRate')}</Text>
                  </View>
                  <View style={[styles.headerCell, styles.colAmount]}>
                    <Text style={[styles.headerCellText, styles.headerCellTextRight]}>{tr('common.amount')}</Text>
                  </View>
                </View>

                {dispatchItems.map((item, index) => (
                  <DispatchDataTableRow
                    key={`row-${item.id}-${index}`}
                    item={item}
                    isLast={index === dispatchCount - 1}
                    styles={styles}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Totals row */}
          <View style={styles.tableFooter}>
            <Text style={styles.footerLabel} accessibilityRole="header">{tr('invoice.lineItem.totals')}</Text>
            <View style={styles.footerValues}>
              <View style={styles.footerValueItem}>
                <Text style={styles.footerValueLabel}>{tr('invoice.lineItem.colQty')}</Text>
                <Text style={styles.footerValueText}>{formatNumber(group.total_dispatch_qty)}</Text>
              </View>
              <View style={styles.footerValueItem}>
                <Text style={styles.footerValueLabel}>{tr('invoice.lineItem.base')}</Text>
                <Text style={styles.footerValueText}>{formatInvoiceAmount(group.total_base_amount)}</Text>
              </View>
              <View style={styles.footerValueItem}>
                <Text style={styles.footerValueLabel}>{tr('invoice.label.tax')}</Text>
                <Text style={styles.footerValueText}>{formatInvoiceAmount(group.total_tax_amount)}</Text>
              </View>
              <View style={styles.footerValueItem}>
                <Text style={styles.footerValueLabel}>{tr('common.total')}</Text>
                <Text style={styles.footerValueText}>{formatInvoiceAmount(group.total_amount)}</Text>
              </View>
            </View>
          </View>

          {/* GRN reference link */}
          {group.gr_no && group.on_view_grn && (
            <Pressable
              style={({ pressed }) => [styles.grnReferenceButton, pressed && styles.grnReferenceButtonPressed]}
              onPress={handleViewGRN}
              accessibilityRole="link"
              accessibilityLabel={tr('invoice.label.viewGrnNumber', { number: String(group.gr_no) })}
            >
              <Icon name="package-down" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.grnLabel}>{tr('invoice.label.viewGrnNumber', { number: String(group.gr_no) })}</Text>
              <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// DISPATCH DATA TABLE ROW
// ============================================================================
interface DispatchDataTableRowProps {
  item: DispatchLineItem;
  isLast: boolean;
  styles: Styles;
}

const DispatchDataTableRow = React.memo<DispatchDataTableRowProps>(({
  item,
  isLast,
  styles,
}) => (
  <View
    style={[styles.dataRow, isLast && styles.lastRow]}
    accessible
    accessibilityLabel={tr(item.tax > 0 ? 'invoice.lineItem.rowWithTaxA11y' : 'invoice.lineItem.rowA11y', {
      qty: formatNumber(item.dispatch_qty),
      days: formatNumber(item.no_of_days),
      months: formatNumber(item.duration, 1),
      rate: formatInvoiceAmount(item.charge_per_unit),
      amount: formatInvoiceAmount(item.line_item_amount),
      tax: formatInvoiceAmount(item.tax),
    })}
  >
    <View style={[styles.dataCell, styles.colQty]}>
      <Text style={styles.dataCellText}>{formatNumber(item.dispatch_qty)}</Text>
    </View>
    <View style={[styles.dataCell, styles.colDays]}>
      <Text style={styles.dataCellText}>{formatNumber(item.no_of_days)}</Text>
    </View>
    <View style={[styles.dataCell, styles.colDuration]}>
      <Text style={styles.dataCellText}>{formatNumber(item.duration, 1)}</Text>
    </View>
    <View style={[styles.dataCell, styles.colRate]}>
      <Text style={styles.dataCellText}>{formatInvoiceAmount(item.charge_per_unit)}</Text>
    </View>
    <View style={[styles.dataCell, styles.colAmount]}>
      <Text style={styles.dataCellText}>{formatInvoiceAmount(item.line_item_amount)}</Text>
      {item.tax > 0 && (
        <Text style={styles.taxSubtext}>{tr('invoice.lineItem.plusTax', { amount: formatInvoiceAmount(item.tax) })}</Text>
      )}
    </View>
  </View>
));
DispatchDataTableRow.displayName = 'DispatchDataTableRow';

// Colour-free layout
const localStyles = StyleSheet.create({
  scrollableArea: { flex: 1 },
  scrollableContent: { flexGrow: 1 },
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
