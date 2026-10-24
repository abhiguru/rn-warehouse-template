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
 *   its own. A row opens to its dispatch lines as the same sideways table as the invoice form's
 *   "Step 2 of 3 - Items" -> "Show dispatch details" (owner decision, 2026-10-19; style guide 13.7),
 *   read-only: Dispatch (pinned, opens the dispatch) | Date | Months | Days | Qty | Charge | Labour |
 *   Tax | Amount, one shared sideways position for the lot (features/invoice/components/items/
 *   ReadOnlyLineTable.tsx). A single lot starts open.
 * - Amounts are the server's line totals with tax (get_invoice_items_detailed), worked out here
 *   by the same rules only when they did not load. The footer adds the rows; the invoice total,
 *   after its rounding and discount, is on the Breakdown tab, and the note says so.
 * - Virtualized (FlatList); empty and loading states as before.
 * - Built on the app's table setup (components/table): useAppTable, drawn by DataTable; the lines under a lot
 *   are the read-only sideways line table.
 */

import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { calculateItemAmounts, roundMoney, formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatCount, formatNumber, formatWeightEach } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import {
  ONE_LINE,
  RowChevron,
  crowded,
  makeTableStyles,
  nb,
  numberColumnWidth,
  rowWidth,
  useStackedWhen,
  useTableLayout,
} from '@/components/common/DetailTable';
import type { ItemsLayout } from '@/features/invoice/components/items/itemsLayout';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable, useDefaultOpen } from '@/components/table/DataTable';
import { ReadOnlyLineTable, readOnlyLayout, type ReadOnlyLine } from '@/features/invoice/components/items/ReadOnlyLineTable';

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
  /** The line's tax RATE in percent. */
  tax_rate: number;
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
  /** The lot's GRN is priced ONE_TIME: no months, no labour. */
  one_time: boolean;
  total_dispatch_qty: number;
  /** Undefined when the lines of the lot have different charges (the summary then shows no rate). */
  charge_per_unit?: number;
  /** Undefined when the lines of the lot have different tax rates. */
  tax_rate?: number;
  /** Undefined when the lines of the lot have different labour figures. */
  labour_rate?: number;
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
        one_time: !!item.one_time,
        total_dispatch_qty: 0,
        charge_per_unit: undefined,
        tax_rate: item.tax || 0,
        labour_rate: undefined,
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
    // The line's own figures (a charge or labour of 0 is a figure), never another line's or the lot's.
    const charge_per_unit = item.charge_per_unit ?? item.charge ?? 0;
    const labour_rate = item.labour_rate ?? 0;

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

    // A group-level rate is only meaningful when every dispatch uses the same rate (the first line sets it).
    if (group.dispatch_items.length === 0) {
      group.charge_per_unit = charge_per_unit;
      group.labour_rate = labour_rate;
    } else {
      if (group.charge_per_unit !== undefined && group.charge_per_unit !== charge_per_unit) group.charge_per_unit = undefined;
      if (group.labour_rate !== undefined && group.labour_rate !== labour_rate) group.labour_rate = undefined;
    }
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
      tax_rate: taxRate,
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

/** Bags and Amount column widths at font scale 1; both grow with their widest value. */
/** Fits the design edge, "9,999" in weight 600, and the heading "Bags" (owner, 2026-10-16). */
const BAGS_WIDTH = 44;
/** Fits the design edge, "₹99,999.00" in weight 600 (81 dp at font scale 1; owner, 2026-10-16); larger amounts widen it. */
const AMOUNT_WIDTH = 84;
/** In a stacked table, an amount column wider than this share of the row goes on its own line. */
const LAST_COLUMN_SHARE = 0.45;

const makeStyles = (t: ThemeTokens) => ({
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

/** "PM · 50 kg each", or null when the lot has neither. */
const lotLine = (group: Pick<InvoiceLineItemGroupData, 'package_mark' | 'weight'>): string | null => {
  const parts = [group.package_mark || null, formatWeightEach(group.weight)].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** "Rate ₹9.00 · Labour ₹3.00 · Tax 5%"; each part only when every line of the lot agrees, labour (never in a one-time lot) and tax only when there are any. */
const rateLine = (group: InvoiceLineItemGroupData): string =>
  [
    group.charge_per_unit !== undefined ? tr('invoice.detailsTable.rate', { amount: formatInvoiceAmount(group.charge_per_unit) }) : null,
    !group.one_time && group.labour_rate !== undefined && group.labour_rate > 0
      ? tr('invoice.detailsTable.labour', { amount: formatInvoiceAmount(group.labour_rate) })
      : null,
    group.tax_rate !== undefined && group.tax_rate > 0 ? tr('invoice.detailsTable.tax', { value: group.tax_rate }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

const groupHelper = createAppColumnHelper<InvoiceLineItemGroupData>();

/** A lot's dispatch lines as the read-only table shows them. */
const toReadOnlyLines = (group: InvoiceLineItemGroupData): ReadOnlyLine[] =>
  group.dispatch_items.map((line) => ({
    id: line.id,
    dispatchNo: line.dispatch_no,
    dispatchId: line.dispatch_id,
    dispatchDate: line.dispatch_date,
    qty: line.dispatch_qty,
    days: line.no_of_days,
    months: line.duration,
    charge: line.charge_per_unit,
    labour: line.labour_rate,
    taxRate: line.tax_rate,
    amount: roundMoney(line.line_item_amount + line.tax),
  }));

interface DispatchLinesProps {
  group: InvoiceLineItemGroupData;
  lines: readonly ReadOnlyLine[];
  /** The table geometry over all the invoice's lots. */
  layout: ItemsLayout;
  onViewDispatch?: (dispatch_id: string) => void;
}

/** The dispatch lines under an open lot: the read-only sideways table of the invoice form's Step 2, and the base and tax of the lot. */
const DispatchLines = React.memo(function DispatchLines({ group, lines, layout, onViewDispatch }: DispatchLinesProps) {
  const styles = useThemedStyles(makeTableStyles);
  return (
    <>
      <ReadOnlyLineTable groupKey={group.grn_item_id} lines={lines} oneTime={group.one_time} layout={layout} onViewDispatch={onViewDispatch} />
      <Text style={styles.secondary}>
        {nb(
          tr('invoice.detailsTable.baseAndTax', {
            base: formatInvoiceAmount(group.total_base_amount),
            tax: formatInvoiceAmount(group.total_tax_amount),
          })
        )}
      </Text>
    </>
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
  const screen = useTableLayout();

  const groups = useMemo(() => groupItemsByGrnItem(items), [items]);
  // The lines of each lot and the table geometry over ALL lots, so the columns line up from lot to lot (as in Step 2).
  const lotLines = useMemo(() => new Map(groups.map((group) => [group.grn_item_id, toReadOnlyLines(group)])), [groups]);
  const lineLayout = useMemo(
    () => readOnlyLayout(screen, groups.map((group) => ({ lines: lotLines.get(group.grn_item_id) ?? [], oneTime: group.one_time }))),
    [screen, groups, lotLines]
  );
  const totalBags = groups.reduce((sum, group) => sum + group.total_dispatch_qty, 0);
  const totalAmount = roundMoney(groups.reduce((sum, group) => sum + group.total_amount, 0));
  // Each column as wide as its widest value or total; amounts that leave the item column under
  // 25 % of the row move the bags under the item (owner, 2026-10-16), as large text does.
  const bagsWidth = numberColumnWidth(screen, BAGS_WIDTH, groups.map((group) => formatNumber(group.total_dispatch_qty)), [formatNumber(totalBags)]);
  const amountWidth = numberColumnWidth(screen, AMOUNT_WIDTH, groups.map((group) => formatInvoiceAmount(group.total_amount)), [formatInvoiceAmount(totalAmount)]);
  const table = useStackedWhen(screen, crowded(rowWidth(screen), [bagsWidth, amountWidth], undefined, screen.scale));
  // Stacked, an amount column that would still crowd the first, or take most of the row beside
  // several lines of text (large amounts at large text), goes under the item: the text gets the full width.
  const amountUnder =
    table.stacked &&
    (crowded(rowWidth(screen), [amountWidth], undefined, screen.scale) || amountWidth > rowWidth(screen) * LAST_COLUMN_SHARE);
  // A single lot starts open; a tap flips any lot.
  const open = useDefaultOpen(groups.length === 1 ? [groups[0].grn_item_id] : []);

  const columns = useMemo(
    () =>
      groupHelper.columns([
        groupHelper.accessor('item_name', {
          id: 'item',
          header: tr('invoice.detailsTable.item'),
          meta: { width: 'grow' },
          cell: (info) => {
            const group = info.row.original;
            const details = lotLine(group);
            const rates = rateLine(group);
            return (
              <>
                <Text style={styles.primary}>{group.item_name}</Text>
                {details !== null ? <Text style={styles.secondary}>{nb(details)}</Text> : null}
                {table.stacked || rates !== '' ? (
                  <Text style={styles.secondary}>{nb(table.stacked ? [rates, bags(group.total_dispatch_qty)].filter(Boolean).join(' · ') : rates)}</Text>
                ) : null}
                {amountUnder ? <Text style={styles.number} {...ONE_LINE}>{formatInvoiceAmount(group.total_amount)}</Text> : null}
              </>
            );
          },
        }),
        ...(table.stacked
          ? []
          : [
              groupHelper.accessor('total_dispatch_qty', {
                id: 'bags',
                header: tr('invoice.detailsTable.bags'),
                meta: { width: bagsWidth, numeric: true },
                cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.total_dispatch_qty)}</Text>,
              }),
            ]),
        groupHelper.accessor('total_amount', {
          id: 'amount',
          header: tr('invoice.detailsTable.amount'),
          // Under the item the amount has no column of its own, only its heading over the end of the row.
          meta: { width: amountUnder ? 'auto' : amountWidth, numeric: true, headerOnly: amountUnder },
          cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatInvoiceAmount(info.row.original.total_amount)}</Text>,
        }),
      ]),
    [table.stacked, amountUnder, bagsWidth, amountWidth, styles]
  );
  const grid = useAppTable({ data: groups, columns, getRowId: (group) => group.grn_item_id, getRowCanExpand: () => true, ...open });

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

  const groupCount = tr('invoice.detailsTable.groupCount', { count: groups.length });
  const lineCount = tr('invoice.detailsTable.lineCount', { count: items.length });
  // Every line of an invoice comes from one GRN; open it by id when known.
  const grn = groups.find((group) => group.grn_id || group.gr_no);
  const grnRef = grn?.grn_id || grn?.gr_no;

  const footer = (
    <>
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
          <Text style={styles.secondary}>{nb(`${groupCount} · ${lineCount}`)}</Text>
          {table.stacked ? <Text style={styles.secondary}>{nb(bags(totalBags))}</Text> : null}
          {amountUnder ? <Text style={styles.numberStrong} {...ONE_LINE}>{formatInvoiceAmount(totalAmount)}</Text> : null}
        </View>
        {!table.stacked ? (
          <Text style={[styles.numberStrong, { width: bagsWidth }]} {...ONE_LINE}>{formatNumber(totalBags)}</Text>
        ) : null}
        {!amountUnder ? (
          <Text style={[styles.numberStrong, { width: amountWidth }]} {...ONE_LINE}>{formatInvoiceAmount(totalAmount)}</Text>
        ) : null}
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
    </>
  );

  return (
    <DataTable
      table={grid}
      list="flat"
      renderDetail={(row) => (
        <DispatchLines
          group={row.original}
          lines={lotLines.get(row.original.grn_item_id) ?? []}
          layout={lineLayout}
          onViewDispatch={on_view_dispatch}
        />
      )}
      rowLabel={(row) => {
        const group = row.original;
        return tr('invoice.detailsTable.groupRowLabel', {
          item: group.item_name,
          details: [lotLine(group), rateLine(group)].filter(Boolean).map((part) => `, ${part}`).join(''),
          bags: bags(group.total_dispatch_qty),
          amount: formatInvoiceAmount(group.total_amount),
        });
      }}
      rowHint={(row) => (row.getIsExpanded() ? tr('invoice.lineItem.hidesDispatchesHint') : tr('invoice.lineItem.showsDispatchesHint'))}
      rowTestID={(row) => `invoice-group-row-${row.original.grn_item_id}`}
      detailTestID={(row) => `invoice-group-lines-${row.original.grn_item_id}`}
      footer={footer}
      testID="invoice-lines-table"
    />
  );
};
