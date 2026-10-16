/**
 * InvoiceLineItemsTab - the lines of an invoice as one table (docs/STYLE_GUIDE.md §13.7,
 * common/DetailTable), after the GRN page's Dispatches table.
 *
 * | Item                             | Bags |     Amount |
 * | › Potatoes                       |  120 |  ₹1,890.00 |
 * |   PM · 50 kg each                |      |            |
 * |   Rate ₹9.00 · Labour ₹3.00 · Tax 5%     |            |
 *
 * - One summary row per GRN lot (groupItemsByGrnItem); a lot without a GRN item id is a row of
 *   its own. A row opens to its dispatch lines (Dispatch | Bags | Amount): the dispatch number
 *   opens the dispatch, its date and the days and months charged sit under it, and the tax in
 *   the amount under the amount. A single lot starts open.
 * - Amounts are the server's line totals with tax (get_invoice_items_detailed), worked out here
 *   by the same rules only when they did not load. The footer adds the rows; the invoice total,
 *   after its rounding and discount, is on the Breakdown tab, and the note says so.
 * - Virtualized (FlatList); empty and loading states as before.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, LayoutAnimation } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { calculateItemAmounts, roundMoney, formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatCount, formatDate, formatNumber, formatWeightEach, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { HeaderCell, RowChevron, makeTableStyles, useTableLayout, type TableLayout } from '@/components/common/DetailTable';

// Legacy interface for backward compatibility
export interface InvoiceLineItem {
  id: string;
  item_name: string;
  duration?: string;
  no_of_days?: number;
  charge: number;
  /** Tax RATE in percent. */
  tax: number;
  /** The line's tax amount as the server computed it. */
  server_tax_amount?: number;
  /** The line's total (base plus tax) as the server computed it. */
  server_total_amount?: number;
  /** The line's GRN is priced ONE_TIME: no duration, no labour. Used only when the server amounts are absent. */
  one_time?: boolean;
  grn_id?: string;
  gr_no?: string;
  // GRN Item reference for grouping
  grn_item_id?: string;
  // Dispatch details
  dispatch_id?: string;
  dispatch_no?: string;  // e.g., "I2660"
  dispatch_date?: string;
  dispatch_qty?: number;
  // Storage details
  package_mark?: string;
  rack?: string;
  grn_quantity?: number;
  grn_date?: string;
  weight?: number;
  packaging?: string;
  // Rates
  labour_rate?: number;
  charge_per_unit?: number;
}

/** One dispatch line of a lot. */
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
  /** Before tax. */
  line_item_amount: number;
  /** The line's tax amount. */
  tax: number;
}

/** A GRN lot with its dispatch lines on this invoice. */
export interface InvoiceLineItemGroupData {
  grn_item_id: string;
  item_name: string;
  packaging?: string;
  weight: number;
  grn_quantity: number;
  total_dispatch_qty: number;
  charge_per_unit: number;
  /** Undefined when the lines of the lot have different tax rates. */
  tax_rate?: number;
  labour_rate: number;
  total_base_amount: number;
  total_tax_amount: number;
  total_amount: number;
  package_mark?: string;
  rack?: string;
  grn_id?: string;
  gr_no?: string;
  dispatch_items: DispatchLineItem[];
}

interface InvoiceLineItemsTabProps {
  items: InvoiceLineItem[];
  loading?: boolean;
  /** Opens the GRN, by id when known (the route's key), else by number. */
  on_view_grn?: (grn: string) => void;
  on_view_dispatch?: (dispatch_id: string) => void;
}

// Helper function to group items by GRN item
export const groupItemsByGrnItem = (items: InvoiceLineItem[]): InvoiceLineItemGroupData[] => {
  const groupMap = new Map<string, InvoiceLineItemGroupData>();

  items.forEach((item) => {
    // Lines of one GRN item form a group. Without the GRN item id there is no
    // telling whether two lines belong together (two lots can share a name and
    // a received quantity), so such a line stays a group of its own.
    const groupKey = item.grn_item_id || `line:${item.id}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        grn_item_id: item.grn_item_id || groupKey,
        item_name: item.item_name,
        packaging: item.packaging,
        weight: item.weight || 0,
        grn_quantity: item.grn_quantity || 0,
        total_dispatch_qty: 0,
        charge_per_unit: item.charge_per_unit || item.charge || 0,
        tax_rate: item.tax || 0,
        labour_rate: item.labour_rate || 0,
        total_base_amount: 0,
        total_tax_amount: 0,
        total_amount: 0,
        package_mark: item.package_mark,
        rack: item.rack,
        grn_id: item.grn_id,
        gr_no: item.gr_no,
        dispatch_items: [],
      });
    }

    const group = groupMap.get(groupKey)!;

    const parsedDuration = item.duration ? parseFloat(item.duration) : NaN;
    const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 1;
    const dispatch_qty = item.dispatch_qty || 0;
    const charge_per_unit = item.charge_per_unit || item.charge || group.charge_per_unit || 0;
    const labour_rate = item.labour_rate || group.labour_rate || 0;

    const taxRate = item.tax || 0;
    // The amounts are the server's (get_invoice_items_detailed computes each
    // line as it computes the invoice total). Only when they did not load are
    // they worked out here, by the same rules, as a stand-in.
    const hasServerAmounts =
      typeof item.server_tax_amount === 'number' && typeof item.server_total_amount === 'number';
    const computed = calculateItemAmounts(dispatch_qty, charge_per_unit, labour_rate, taxRate, duration, item.one_time);
    const taxAmount = hasServerAmounts ? item.server_tax_amount! : computed.tax_amount;
    const lineTotal = hasServerAmounts ? item.server_total_amount! : computed.item_total;
    const baseAmount = hasServerAmounts ? roundMoney(lineTotal - taxAmount) : computed.taxable_amount;

    // A group-level rate is only meaningful when every dispatch uses the same rate.
    if (group.tax_rate !== undefined && group.tax_rate !== taxRate) {
      group.tax_rate = undefined;
    }

    group.dispatch_items.push({
      id: item.id,
      dispatch_no: item.dispatch_no,
      dispatch_id: item.dispatch_id,
      dispatch_date: item.dispatch_date,
      dispatch_qty,
      grn_date: item.grn_date,
      no_of_days: item.no_of_days || 0,
      duration,
      charge_per_unit,
      labour_rate,
      line_item_amount: baseAmount,
      tax: taxAmount,
    });
    group.total_dispatch_qty += dispatch_qty;
    group.total_base_amount = roundMoney(group.total_base_amount + baseAmount);
    group.total_tax_amount = roundMoney(group.total_tax_amount + taxAmount);
    group.total_amount = roundMoney(group.total_amount + lineTotal);
  });

  return Array.from(groupMap.values());
};

/** Bags column width at font scale 1. */
const BAGS_WIDTH = 60;

const makeStyles = (t: ThemeTokens) => ({
  amount: {
    flexShrink: 0,
    minWidth: 88,
  },
  amountCell: {
    flexShrink: 0,
    minWidth: 88,
    alignItems: 'flex-end' as const,
  },
  smallRight: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  /** Under the totals row, inside the card: the note and the GRN link. */
  cardEnd: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: space.xs,
  },
  action: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    marginLeft: -space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
  },
  actionPressed: {
    backgroundColor: t.brand.subtle,
  },
  actionText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    minHeight: 400,
    gap: space.sm,
    backgroundColor: t.background.base,
  },
  emptyTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const, marginTop: space.sm },
  emptySubtitle: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    backgroundColor: t.background.base,
    gap: space.md,
  },
  loadingText: { ...typography.body, color: t.text.secondary },
});

const bags = (qty: number) => formatCount(qty, 'bag');
const dateText = (date: string | undefined) => (toDate(date) ? formatDate(date, 'short') : '—');

/** "PM · 50 kg each", or null when the lot has neither. */
const lotLine = (group: Pick<InvoiceLineItemGroupData, 'package_mark' | 'weight'>): string | null => {
  const parts = [group.package_mark || null, formatWeightEach(group.weight)].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** "Rate ₹9.00 · Labour ₹3.00 · Tax 5%"; labour and tax only when there are any, tax only when one rate. */
const rateLine = (group: InvoiceLineItemGroupData): string =>
  [
    tr('invoice.detailsTable.rate', { amount: formatInvoiceAmount(group.charge_per_unit) }),
    group.labour_rate > 0 ? tr('invoice.detailsTable.labour', { amount: formatInvoiceAmount(group.labour_rate) }) : null,
    group.tax_rate !== undefined && group.tax_rate > 0 ? tr('invoice.detailsTable.tax', { value: group.tax_rate }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

const periodText = (line: DispatchLineItem) =>
  `${formatCount(line.no_of_days, 'day')} · ${formatCount(Math.round(line.duration * 10) / 10, 'month')}`;

interface GroupRowProps {
  group: InvoiceLineItemGroupData;
  expanded: boolean;
  onToggle: (id: string) => void;
  onViewDispatch?: (dispatch_id: string) => void;
  table: TableLayout;
}

const GroupRow = React.memo(function GroupRow({ group, expanded, onToggle, onViewDispatch, table }: GroupRowProps) {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const details = lotLine(group);
  const rates = rateLine(group);
  const bagsWidth = table.numberWidth(BAGS_WIDTH);
  const lines = group.dispatch_items;

  return (
    <View style={expanded ? styles.group : undefined}>
      <Pressable
        onPress={() => onToggle(group.grn_item_id)}
        style={({ pressed }) => [styles.row, expanded && styles.rowOpen, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={tr('invoice.detailsTable.groupRowLabel', {
          item: group.item_name,
          details: [details, rates].filter(Boolean).map((part) => `, ${part}`).join(''),
          bags: bags(group.total_dispatch_qty),
          amount: formatInvoiceAmount(group.total_amount),
        })}
        accessibilityHint={expanded ? tr('invoice.lineItem.hidesDispatchesHint') : tr('invoice.lineItem.showsDispatchesHint')}
        accessibilityState={{ expanded }}
        testID={`invoice-group-row-${group.grn_item_id}`}
      >
        <RowChevron expandable expanded={expanded} />
        <View style={styles.grow}>
          <Text style={styles.primary}>{group.item_name}</Text>
          {details !== null ? <Text style={styles.secondary}>{details}</Text> : null}
          <Text style={styles.secondary}>{table.stacked ? `${rates} · ${bags(group.total_dispatch_qty)}` : rates}</Text>
        </View>
        {!table.stacked ? <Text style={[styles.number, { width: bagsWidth }]}>{formatNumber(group.total_dispatch_qty)}</Text> : null}
        <Text style={[styles.number, own.amount]}>{formatInvoiceAmount(group.total_amount)}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.details} testID={`invoice-group-lines-${group.grn_item_id}`}>
          <View style={styles.nested}>
            <View style={styles.nestedHeader}>
              <HeaderCell style={styles.grow}>{tr('invoice.detailsTable.dispatch')}</HeaderCell>
              {!table.stacked ? <HeaderCell numeric style={{ width: bagsWidth }}>{tr('invoice.detailsTable.bags')}</HeaderCell> : null}
              <HeaderCell numeric style={own.amount}>{tr('invoice.detailsTable.amount')}</HeaderCell>
            </View>
            {lines.map((line, index) => {
              const id = line.dispatch_id;
              const canOpen = !!(id && onViewDispatch);
              const lineTotal = roundMoney(line.line_item_amount + line.tax);
              return (
                <Pressable
                  key={line.id}
                  onPress={() => {
                    if (id) onViewDispatch?.(id);
                  }}
                  disabled={!canOpen}
                  style={({ pressed }) => [styles.nestedRow, index > 0 && styles.nestedDivider, pressed && canOpen && styles.rowPressed]}
                  accessible
                  accessibilityRole={canOpen ? 'button' : undefined}
                  accessibilityLabel={tr('invoice.detailsTable.lineRowLabel', {
                    number: formatIdentifier(line.dispatch_no || '—'),
                    date: dateText(line.dispatch_date),
                    bags: bags(line.dispatch_qty),
                    period: periodText(line),
                    amount: formatInvoiceAmount(lineTotal),
                  })}
                  accessibilityHint={canOpen ? tr('invoice.lineItem.opensDispatchHint') : undefined}
                  testID={`invoice-line-${line.id}`}
                >
                  <View style={styles.grow}>
                    <Text style={canOpen ? styles.link : styles.primary}>{line.dispatch_no || '—'}</Text>
                    <Text style={styles.secondary}>{dateText(line.dispatch_date)}</Text>
                    <Text style={styles.secondary}>
                      {table.stacked ? `${periodText(line)} · ${bags(line.dispatch_qty)}` : periodText(line)}
                    </Text>
                  </View>
                  {!table.stacked ? <Text style={[styles.number, { width: bagsWidth }]}>{formatNumber(line.dispatch_qty)}</Text> : null}
                  <View style={own.amountCell}>
                    <Text style={styles.number}>{formatInvoiceAmount(lineTotal)}</Text>
                    {line.tax > 0 ? (
                      <Text style={own.smallRight}>{tr('invoice.detailsTable.inclTax', { amount: formatInvoiceAmount(line.tax) })}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.secondary}>
            {tr('invoice.detailsTable.baseAndTax', {
              base: formatInvoiceAmount(group.total_base_amount),
              tax: formatInvoiceAmount(group.total_tax_amount),
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

export const InvoiceLineItemsTab: React.FC<InvoiceLineItemsTabProps> = ({
  items,
  loading = false,
  on_view_grn,
  on_view_dispatch,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const table = useTableLayout();

  const groups = useMemo(() => groupItemsByGrnItem(items), [items]);
  // A single lot starts open; a tap flips any lot.
  const single = groups.length === 1;
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = useCallback((id: string) => (single ? !toggled.has(id) : toggled.has(id)), [single, toggled]);
  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading && items.length === 0) {
    return (
      <View style={own.loadingContainer} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={own.loadingText}>{tr('invoice.details.loadingItems')}</Text>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={own.emptyContainer}>
        <Icon name="file-document-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={own.emptyTitle} accessibilityRole="header">{tr('invoice.details.noLineItems')}</Text>
        <Text style={own.emptySubtitle}>{tr('invoice.details.noLineItemsLong')}</Text>
      </View>
    );
  }

  const bagsWidth = table.numberWidth(BAGS_WIDTH);
  const totalBags = groups.reduce((sum, group) => sum + group.total_dispatch_qty, 0);
  const totalAmount = roundMoney(groups.reduce((sum, group) => sum + group.total_amount, 0));
  const groupCount = tr('invoice.detailsTable.groupCount', { count: groups.length });
  const lineCount = tr('invoice.detailsTable.lineCount', { count: items.length });
  // Every line of an invoice comes from one GRN; open it by id when known.
  const grn = groups.find((group) => group.grn_id || group.gr_no);
  const grnRef = grn?.grn_id || grn?.gr_no;

  const header = (
    <View style={styles.headerRow}>
      <RowChevron expandable={false} expanded={false} />
      <HeaderCell style={styles.grow}>{tr('invoice.detailsTable.item')}</HeaderCell>
      {!table.stacked ? <HeaderCell numeric style={{ width: bagsWidth }}>{tr('invoice.detailsTable.bags')}</HeaderCell> : null}
      <HeaderCell numeric style={own.amount}>{tr('invoice.detailsTable.amount')}</HeaderCell>
    </View>
  );

  const footer = (
    <View>
      <View
        style={styles.footerRow}
        accessible
        accessibilityLabel={tr('invoice.detailsTable.totalLabel', {
          groups: groupCount,
          lines: lineCount,
          bags: bags(totalBags),
          amount: formatInvoiceAmount(totalAmount),
        })}
        testID="invoice-lines-total"
      >
        <RowChevron expandable={false} expanded={false} />
        <View style={styles.grow}>
          <Text style={styles.primaryStrong}>{tr('invoice.detailsTable.total')}</Text>
          <Text style={styles.secondary}>{`${groupCount} · ${lineCount}`}</Text>
          {table.stacked ? <Text style={styles.secondary}>{bags(totalBags)}</Text> : null}
        </View>
        {!table.stacked ? <Text style={[styles.numberStrong, { width: bagsWidth }]}>{formatNumber(totalBags)}</Text> : null}
        <Text style={[styles.numberStrong, own.amount]}>{formatInvoiceAmount(totalAmount)}</Text>
      </View>
      <View style={own.cardEnd}>
        <Text style={styles.secondary} testID="invoice-lines-note">{tr('invoice.detailsTable.linesNote')}</Text>
        {grnRef && on_view_grn ? (
          <Pressable
            onPress={() => on_view_grn(grnRef)}
            style={({ pressed }) => [own.action, pressed && own.actionPressed]}
            accessibilityRole="button"
            accessibilityLabel={tr('invoice.label.viewGrnNumber', { number: formatIdentifier(grn?.gr_no || '') })}
            accessibilityHint={tr('invoice.details.opensGrnHint')}
            testID="invoice-lines-view-grn"
          >
            <Text style={own.actionText}>{tr('invoice.label.viewGrnNumber', { number: formatIdentifier(grn?.gr_no || '') })}</Text>
            <Icon name="chevron-right" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      data={groups}
      keyExtractor={(group) => group.grn_item_id}
      extraData={toggled}
      renderItem={({ item }) => (
        <GroupRow group={item} expanded={isOpen(item.grn_item_id)} onToggle={toggle} onViewDispatch={on_view_dispatch} table={table} />
      )}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      contentContainerStyle={styles.card}
      showsVerticalScrollIndicator={false}
      maxToRenderPerBatch={10}
      windowSize={10}
      testID="invoice-lines-table"
    />
  );
};
