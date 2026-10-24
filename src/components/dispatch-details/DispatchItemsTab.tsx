/**
 * DispatchItemsTab - the dispatch's lines as a table (docs/STYLE_GUIDE.md §13.7)
 *
 * | Item                 | GRN/Received | Bags dispatched |
 * | Basmati Rice         | 0161/100     |              25 |
 * |   50 kg each         | PM           |                 |
 *
 * - One row per dispatch line: two lots of the same item are two rows.
 * - The weight of one bag sits under the item. The source GRN number and the bags received on
 *   the lot share a cell ("0161/100", owner's choice of 2026-10-16), with the lot's package mark
 *   under them (in place of the GRN date, which the GRNs tab shows).
 * - The GRN cell opens the GRN only when the line has a GRN id.
 * - Footer: bags dispatched, item lines and distinct source GRNs.
 * - Bags dispatched sorts from its heading (not sorted, ascending, descending); the footer stays the sum of every line.
 * - Built on the app's table setup (components/table): useAppTable, drawn by DataTable.
 * - Virtualized (FlatList); loading and empty states as before.
 */

import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, formatWeightEach, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { itemTotals, type DispatchItem } from './dispatchDetailsModel';
import {
  CUT_LINE,
  ONE_LINE,
  crowded,
  makeTableStyles,
  nb,
  numberColumnWidth,
  rowWidth,
  useStackedWhen,
  useTableLayout,
  type TableLayout,
} from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';

export type { DispatchItem } from './dispatchDetailsModel';

interface DispatchItemsTabProps {
  items: DispatchItem[];
  loading?: boolean;
  onViewGRN?: (grn_id: string) => void;
}

/** Bags column width at font scale 1: room for "12,500" and a two-line heading. */
const BAGS_WIDTH = 76;

const makeStyles = (t: ThemeTokens) => ({
  stackedGrn: {
    marginTop: space.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxxl,
    minHeight: 400,
  },
  emptyIcon: {
    marginBottom: space.md,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxxl,
    gap: space.md,
    backgroundColor: t.background.base,
  },
  loadingFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    padding: space.xl,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
});

const bags = (qty: number) => formatCount(qty, 'bag');

/** "0161/100": the GRN number and the bags received on the lot; "—" without a number. */
export function sourceText(item: Pick<DispatchItem, 'grn_no' | 'original_quantity'>): string {
  const number = item.grn_no ?? '—';
  return item.original_quantity !== undefined ? `${number}/${formatNumber(item.original_quantity)}` : number;
}

/** Average glyph widths, in em, of the GRN cell (semibold subhead) and of the heading (footnote). */
const SOURCE_EM = 0.62;
const HEADING_EM = 0.6;

/**
 * The width of the GRN/Received column: wide enough for its longest "GRN/received", footer and
 * heading at this text size, so none wraps (owner, 2026-10-16). A mark longer than that is cut
 * with "…" (owner, 2026-10-16); the GRNs tab shows it in full. When this column and the bags
 * column would crowd the item column, the GRN cell moves under the item instead.
 */
export function sourceColumnWidth(
  items: readonly Pick<DispatchItem, 'grn_no' | 'original_quantity'>[],
  table: Pick<TableLayout, 'scale'>,
  extra: readonly string[] = [],
  heading = ''
): number {
  const longest = (texts: string[]) => texts.reduce((max, text) => Math.max(max, text.length), 0);
  const source = longest([...items.map(sourceText), ...extra]) * (typography.subhead.fontSize ?? 15) * SOURCE_EM;
  const title = heading.length * (typography.footnote.fontSize ?? 13) * HEADING_EM;
  return Math.ceil(Math.max(source, title) * table.scale) + space.xs;
}

/** The GRN date for display, "—" when the GRN has none (never today). */
export const grnDateText = (date: string | null): string => (toDate(date) ? formatDate(date, 'short') : '—');

/** "GRN 0161, Received 100 bags, Mark PM" for a screen reader. */
function sourceSpoken(item: Pick<DispatchItem, 'grn_no' | 'original_quantity' | 'package_mark'>): string {
  return [
    item.grn_no
      ? tr('dispatch.details.table.grnNumbered', { number: formatIdentifier(item.grn_no) })
      : tr('dispatch.details.table.grnUnavailable'),
    item.original_quantity !== undefined ? tr('dispatch.details.received', { bags: bags(item.original_quantity) }) : null,
    item.package_mark ? tr('grn.item.markWithValue', { mark: item.package_mark }) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

const helper = createAppColumnHelper<DispatchItem>();

export const DispatchItemsTab: React.FC<DispatchItemsTabProps> = ({
  items,
  loading = false,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const screen = useTableLayout();
  const totals = useMemo(() => itemTotals(items), [items]);

  const lineCount = tr('dispatch.details.table.lineCount', { count: totals.lines });
  const grnCount = tr('dispatch.details.table.grnCount', { count: totals.grns });
  const grnHeading = tr('dispatch.details.table.sourceGrnReceived');
  const bagsWidth = numberColumnWidth(screen, BAGS_WIDTH, items.map((item) => formatNumber(item.dispatch_quantity)), [formatNumber(totals.bags)]);
  const grnWidth = sourceColumnWidth(items, screen, [grnCount], grnHeading);
  // A long GRN/received or a big quantity would squeeze the item names: the GRN cell goes under the item.
  const table = useStackedWhen(screen, crowded(rowWidth(screen), [grnWidth, bagsWidth], 0, screen.scale));
  const stacked = table.stacked;
  const openGrn = (item: DispatchItem) => {
    if (item.grn_id && onViewGRN) onViewGRN(item.grn_id);
  };


  const grnCell = (item: DispatchItem) => {
    const grnId = item.grn_id;
    const canOpenGrn = !!(grnId && onViewGRN);
    return (
      <Pressable
        onPress={() => openGrn(item)}
        disabled={!canOpenGrn}
        // The row is one element for a screen reader; it offers this as an action instead.
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={({ pressed }) => [styles.linkTarget, pressed && canOpenGrn && styles.linkPressed]}
        testID={`dispatch-item-grn-${item.id}`}
      >
        <Text style={canOpenGrn ? styles.link : styles.primary} {...ONE_LINE}>{sourceText(item)}</Text>
        {item.package_mark ? <Text style={styles.secondary} {...CUT_LINE}>{item.package_mark}</Text> : null}
      </Pressable>
    );
  };

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('item_name', {
          id: 'item',
          header: tr('dispatch.details.table.item'),
          meta: { width: 'grow' },
          cell: (info) => {
            const item = info.row.original;
            const weight = formatWeightEach(item.weight);
            return (
              <>
                <Text style={styles.primary}>{item.item_name}</Text>
                {weight !== null ? <Text style={styles.secondary}>{nb(weight)}</Text> : null}
                {stacked ? <View style={own.stackedGrn}>{grnCell(item)}</View> : null}
              </>
            );
          },
        }),
        ...(stacked
          ? []
          : [
              helper.accessor('grn_no', {
                id: 'grn',
                header: grnHeading,
                meta: { width: grnWidth, headerOneLine: true },
                cell: (info) => grnCell(info.row.original),
              }),
            ]),
        helper.accessor('dispatch_quantity', {
          id: 'bags',
          header: tr('dispatch.details.table.bagsDispatched'),
          enableSorting: true,
          sortFn: 'basic',
          meta: { width: bagsWidth, numeric: true },
          cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.dispatch_quantity)}</Text>,
        }),
      ]),
    [stacked, grnWidth, bagsWidth, grnHeading, styles, own, onViewGRN]
  );
  const grid = useAppTable({ data: items, columns, getRowId: (item) => item.id });

  const footer = (
    <>
      <View
        style={styles.footerRow}
        accessible
        accessibilityLabel={tr('dispatch.details.table.itemsTotalLabel', { lines: lineCount, grns: grnCount, bags: bags(totals.bags) })}
        testID="dispatch-items-total"
      >
        <View style={styles.grow}>
          <Text style={styles.primaryStrong}>{tr('dispatch.details.table.total')}</Text>
          <Text style={styles.secondary}>{nb(stacked ? `${lineCount} · ${grnCount}` : lineCount)}</Text>
        </View>
        {!stacked ? (
          <View style={{ width: grnWidth }}>
            <Text style={styles.primaryStrong} {...ONE_LINE}>{grnCount}</Text>
          </View>
        ) : null}
        <Text style={[styles.numberStrong, { width: bagsWidth }]} {...ONE_LINE}>{formatNumber(totals.bags)}</Text>
      </View>
      {loading ? (
        <View style={own.loadingFooter}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={own.loadingText}>{tr('dispatch.details.loadingItems')}</Text>
        </View>
      ) : null}
    </>
  );

  if (loading && items.length === 0) {
    return (
      <View style={own.loadingContainer} accessibilityLabel={tr('dispatch.details.loadingItemsLabel')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={own.loadingText}>{tr('dispatch.details.loadingItems')}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.list, own.emptyContainer]}>
        <Icon name="cube-outline" size={iconSize.hero} color={t.icon.secondary} style={own.emptyIcon} />
        <Text style={own.emptyTitle}>{tr('dispatch.details.itemsEmptyTitle')}</Text>
        <Text style={own.emptySubtitle}>{tr('dispatch.details.itemsEmptyMessage')}</Text>
      </View>
    );
  }

  return (
    <DataTable
      table={grid}
      list="flat"
      rowLabel={(row) => {
        const item = row.original;
        const weight = formatWeightEach(item.weight);
        return tr('dispatch.details.table.itemRowLabel', {
          item: item.item_name,
          details: weight ? `, ${weight}` : '',
          source: sourceSpoken(item),
          bags: bags(item.dispatch_quantity),
        });
      }}
      rowActions={(row) =>
        row.original.grn_id && onViewGRN
          ? [{ name: 'openGrn', label: tr('dispatch.details.table.openGrnAction', { number: formatIdentifier(row.original.grn_no) }) }]
          : undefined
      }
      onRowAction={(row, actionName) => {
        if (actionName === 'openGrn') openGrn(row.original);
      }}
      rowTestID={(row) => `dispatch-item-row-${row.original.id}`}
      footer={footer}
      testID="dispatch-items-table"
    />
  );
};
