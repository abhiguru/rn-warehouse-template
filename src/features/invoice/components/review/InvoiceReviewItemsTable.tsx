/**
 * The ITEMS section of the invoice Review step: one row per item group (Item | Qty | Amount) in a nested table,
 * and a Total row under it (docs/STYLE_GUIDE.md §13.7, "Where tables are used"). Widths and stacking follow the
 * invoice page's Items tab (components/invoice-details/InvoiceLineItemsTab.tsx): the figures sit on one line in
 * columns as wide as their widest value; when the columns would crowd the item, the quantity goes under the item and,
 * when it would still crowd, the amount goes there too.
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { space, touchTarget } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import type { InvoiceItemData } from '@/types/invoice.types';
import { roundMoney, formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatCount, formatNumber, formatWeightEach } from '@/utils/formatters';
import { t as tr } from '@/i18n';
import {
  LAST_COLUMN_SHARE,
  crowded,
  makeTableStyles,
  nb,
  nestedRowWidth,
  numberColumnWidth,
  useStackedWhen,
  useTableLayout,
} from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { groupInvoiceItems, groupKeyOf, invoiceGroupTotal, type InvoiceItemGroup } from '@/features/invoice/utils/groupInvoiceItems';

/** A figure on one line at the normal size: the columns are sized to fit it, so it is never squeezed or cut. */
const FIGURE_LINE = { numberOfLines: 1 } as const;

/** Qty and Amount column widths at font scale 1; both grow with their widest value. */
const QTY_WIDTH = 44;
const AMOUNT_WIDTH = 84;

interface GroupRow {
  key: string;
  group: InvoiceItemGroup;
  qty: number;
  amount: number;
}

const rowHelper = createAppColumnHelper<GroupRow>();

const makeStyles = (t: ThemeTokens) => ({
  total: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.table.separator,
  },
  totalStacked: { flexDirection: 'column' as const, alignItems: 'flex-start' as const, justifyContent: 'center' as const, gap: space.xxs, paddingVertical: space.sm },
});

/** "BL/17 · 50 kg each", or null when the group has neither. */
const lotLine = (group: InvoiceItemGroup): string | null => {
  const weight = group.weights_each.length === 1 ? formatWeightEach(group.weights_each[0]) : null;
  const parts = [group.package_mark || null, weight].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
};

export interface InvoiceReviewItemsTableProps {
  items: readonly InvoiceItemData[];
  testID?: string;
}

// Memoized: the step draws again for reasons that do not touch the lines (a dialog, the discount field), and the
// table is the costly part of the step.
export const InvoiceReviewItemsTable = React.memo(function InvoiceReviewItemsTable({ items, testID = 'invoice-review-items-table' }: InvoiceReviewItemsTableProps) {
  const table = useThemedStyles(makeTableStyles);
  const styles = useThemedStyles(makeStyles);
  const screen = useTableLayout();

  const rows = useMemo<GroupRow[]>(
    () =>
      groupInvoiceItems(items).map((group) => ({
        key: groupKeyOf(group),
        group,
        qty: group.allItems.reduce((sum, line) => sum + (line.qty || 0), 0),
        amount: roundMoney(invoiceGroupTotal(group)),
      })),
    [items]
  );
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);

  const qtyWidth = numberColumnWidth(screen, QTY_WIDTH, rows.map((row) => formatNumber(row.qty)), [formatNumber(totalQty)]) + space.xs;
  // The Total row shows the bags only: the one money total is in CHARGES, so two different totals never share a card.
  const amountWidth = numberColumnWidth(screen, AMOUNT_WIDTH, rows.map((row) => formatInvoiceAmount(row.amount))) + space.xs;
  const row = nestedRowWidth(screen);
  const layout = useStackedWhen(screen, crowded(row, [qtyWidth, amountWidth], 0, screen.scale));
  const stacked = layout.stacked;
  // Stacked, an amount that would still crowd the item, or take most of the row, goes under the item.
  const amountUnder = stacked && (crowded(row, [amountWidth], 0, screen.scale) || amountWidth > row * LAST_COLUMN_SHARE);

  const columns = useMemo(
    () =>
      rowHelper.columns([
        rowHelper.accessor((r) => r.group.item_name, {
          id: 'item',
          header: tr('common.item'),
          meta: { width: 'grow' },
          cell: (info) => {
            const { group, qty, amount } = info.row.original;
            const lot = lotLine(group);
            return (
              <>
                <Text style={table.primary}>{group.item_name}</Text>
                {lot !== null ? <Text style={table.secondary}>{nb(lot)}</Text> : null}
                {stacked ? <Text style={table.secondary}>{nb(formatCount(qty, 'bag'))}</Text> : null}
                {amountUnder ? <Text style={table.number} {...FIGURE_LINE}>{formatInvoiceAmount(amount)}</Text> : null}
              </>
            );
          },
        }),
        ...(stacked
          ? []
          : [
              rowHelper.accessor('qty', {
                id: 'qty',
                header: tr('invoice.review.qtyColumn'),
                meta: { width: qtyWidth, numeric: true },
                cell: (info) => <Text style={table.number} {...FIGURE_LINE}>{formatNumber(info.row.original.qty)}</Text>,
              }),
            ]),
        rowHelper.accessor('amount', {
          id: 'amount',
          header: tr('common.amount'),
          meta: { width: amountUnder ? 'auto' : amountWidth, numeric: true, headerOnly: amountUnder },
          cell: (info) => <Text style={table.number} {...FIGURE_LINE}>{formatInvoiceAmount(info.row.original.amount)}</Text>,
        }),
      ]),
    [stacked, amountUnder, qtyWidth, amountWidth, table]
  );
  const grid = useAppTable({ data: rows, columns, getRowId: (r) => r.key });

  const groupCount = tr('invoice.detailsTable.groupCount', { count: rows.length });
  const lineCount = tr('invoice.detailsTable.lineCount', { count: items.length });

  return (
    <DataTable
      table={grid}
      variant="nested"
      testID={testID}
      rowLabel={(r) => {
        const { group, qty, amount } = r.original;
        const lot = lotLine(group);
        return tr('invoice.detailsTable.groupRowLabel', {
          item: group.item_name,
          details: lot ? `, ${lot}` : '',
          bags: formatCount(qty, 'bag'),
          amount: formatInvoiceAmount(amount),
        });
      }}
      rowTestID={(r) => `invoice-review-group-${r.original.key}`}
      footer={
        <View
          style={[styles.total, stacked && styles.totalStacked]}
          accessible
          accessibilityLabel={tr('invoice.review.itemsTotalLabel', {
            groups: groupCount,
            lines: lineCount,
            bags: formatCount(totalQty, 'bag'),
          })}
          testID="invoice-review-items-total"
        >
          <Text style={[table.primaryStrong, !stacked && table.grow]}>{tr('common.total')}</Text>
          {stacked ? <Text style={table.secondary}>{nb(formatCount(totalQty, 'bag'))}</Text> : null}
          {!stacked ? <Text style={[table.numberStrong, { width: qtyWidth }]} {...FIGURE_LINE}>{formatNumber(totalQty)}</Text> : null}
          {/* Under the Amount column, where the amounts of the rows above end, nothing: the money total is in CHARGES. */}
          {!stacked ? <View style={{ width: amountWidth }} /> : null}
        </View>
      }
    />
  );
});
