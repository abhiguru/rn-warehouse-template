/**
 * GRNDispatchesTab - dispatches of the GRN's lots as one expandable table
 * (docs/STYLE_GUIDE.md §13.7, common/DetailTable)
 *
 * | Item               | Dispatches | Bags dispatched |
 * | › Potatoes         |          2 |              40 |
 * |   PM · 50 kg each  |            |                 |
 * |   100 received     |            |                 |
 *
 * - One summary row per GRN line, in the server's order. A row with dispatches opens to them
 *   (Dispatch | Date | Bags, oldest first); each opens the dispatch. A line not dispatched yet
 *   shows 0 and does not open. The first line with dispatches starts open, as before.
 * - Footer: the bags dispatched and the number of distinct dispatches (one dispatch can take
 *   several lots, so it is not the sum of the column).
 * - Loading, failure (with Retry) and empty states as before.
 * - Built on the app's table setup (components/table): useAppTable, drawn by DataTable; the lines under an item are a
 *   nested table of their own.
 */

import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { DispatchRecord } from '@/services/grn-detail-service';
import { formatCount, formatDate, formatNumber, formatSpokenDate, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import {
  ONE_LINE,
  RowChevron,
  crowded,
  makeTableStyles,
  nb,
  nestedRowWidth,
  numberColumnWidth,
  rowWidth,
  useStackedWhen,
  useTableLayout,
} from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable, useDefaultOpen } from '@/components/table/DataTable';
import { GRNItem, lotLine } from './GRNItemsTab';

interface GRNDispatchesTabProps {
  /** GRN items array */
  items: GRNItem[];
  /** Dispatches grouped by item ID */
  dispatchesByItem: Record<string, DispatchRecord[]>;
  /** Loading state */
  loading?: boolean;
  /** Visible failure state; never represent a failed request as empty history. */
  error?: string | null;
  /** Retry the failed history request. */
  onRetry?: () => void;
  /** Opens a dispatch; the dispatch page by default. */
  onViewDispatch?: (dispatch_id: string) => void;
}

/** Column widths at font scale 1. */
const COUNT_WIDTH = 76;
const BAGS_WIDTH = 76;
const DATE_WIDTH = 72;

const makeStyles = (t: ThemeTokens) => ({
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxxl,
    gap: space.md,
    backgroundColor: t.background.base,
  },
  emptyIcon: {
    marginBottom: space.xs,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  emptyMessage: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  retryButton: {
    marginTop: space.md,
    minHeight: touchTarget,
    minWidth: 120,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  retryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  retryText: {
    ...typography.callout,
    color: t.brand.tint,
  },
});

const bags = (qty: number) => formatCount(qty, 'bag');
const dateText = (date: string | null | undefined) => (toDate(date) ? formatDate(date) : '—');
const openDispatch = (dispatchId: string) => router.push(`/dispatch-details/${dispatchId}`);

interface ItemGroup {
  item: GRNItem;
  dispatches: DispatchRecord[];
  bags: number;
}

/**
 * Column widths for the whole table. `count`: the Dispatches column, shown only on a wide screen
 * (its heading is wider than its one-digit counts; on a phone the count goes under the item).
 * `nestedStacked`: the date goes under the dispatch number in the lines under an item.
 */
interface Widths {
  count: number | null;
  bags: number;
  date: number;
  lineBags: number;
  nestedStacked: boolean;
}

const groupHelper = createAppColumnHelper<ItemGroup>();
const lineHelper = createAppColumnHelper<DispatchRecord>();

interface DispatchLinesProps {
  dispatches: DispatchRecord[];
  widths: Widths;
  onViewDispatch: (dispatch_id: string) => void;
}

/** The lines under an open item: Dispatch | Date | Bags (the date under the number when stacked), each opens the dispatch. */
const DispatchLines: React.FC<DispatchLinesProps> = ({ dispatches, widths, onViewDispatch }) => {
  const styles = useThemedStyles(makeTableStyles);
  const { date: dateWidth, lineBags: lineBagsWidth, nestedStacked } = widths;

  const columns = useMemo(
    () =>
      lineHelper.columns([
        lineHelper.accessor('disp_no', {
          id: 'dispatch',
          header: tr('grn.detailsTable.dispatch'),
          meta: { width: 'grow' },
          cell: (info) => (
            <>
              <Text style={styles.link}>{formatIdentifier(info.row.original.disp_no)}</Text>
              {nestedStacked ? <Text style={styles.secondary}>{dateText(info.row.original.disp_date)}</Text> : null}
            </>
          ),
        }),
        ...(nestedStacked
          ? []
          : [
              lineHelper.accessor('disp_date', {
                id: 'date',
                header: tr('grn.detailsTable.date'),
                meta: { width: dateWidth },
                cell: (info) => <Text style={styles.primary} {...ONE_LINE}>{dateText(info.row.original.disp_date)}</Text>,
              }),
            ]),
        lineHelper.accessor('disp_quantity', {
          id: 'bags',
          header: tr('grn.detailsTable.bags'),
          meta: { width: lineBagsWidth, numeric: true },
          cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.disp_quantity)}</Text>,
        }),
      ]),
    [nestedStacked, dateWidth, lineBagsWidth, styles]
  );
  const grid = useAppTable({ data: dispatches, columns, getRowId: (dispatch) => dispatch.id });

  return (
    <DataTable
      table={grid}
      variant="nested"
      headerOneLine={false}
      onRowPress={(row) => onViewDispatch(row.original.dispatch_id)}
      rowLabel={(row) =>
        tr('grn.dispatches.rowLabelDateFirst', {
          number: formatIdentifier(row.original.disp_no),
          date: toDate(row.original.disp_date) ? formatSpokenDate(row.original.disp_date) : '—',
          bags: bags(row.original.disp_quantity),
        })
      }
      rowHint={() => tr('grn.dispatches.openHint')}
      rowTestID={(row) => `grn-dispatch-line-${row.original.id}`}
    />
  );
};

export const GRNDispatchesTab: React.FC<GRNDispatchesTabProps> = ({
  items,
  dispatchesByItem,
  loading = false,
  error = null,
  onRetry,
  onViewDispatch = openDispatch,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const screen = useTableLayout();

  const groups = useMemo<ItemGroup[]>(
    () =>
      items.map((item) => {
        const dispatches = dispatchesByItem[item.id] || [];
        return { item, dispatches, bags: dispatches.reduce((sum, d) => sum + (Number(d.disp_quantity) || 0), 0) };
      }),
    [items, dispatchesByItem]
  );
  const totalBags = groups.reduce((sum, group) => sum + group.bags, 0);
  // Every column as wide as its widest value; big numbers move the middle column under the first.
  const bagsWidth = numberColumnWidth(screen, BAGS_WIDTH, groups.map((group) => formatNumber(group.bags)), [formatNumber(totalBags)]);
  const countWidth = screen.wide ? numberColumnWidth(screen, COUNT_WIDTH, groups.map((group) => formatNumber(group.dispatches.length))) : null;
  const table = useStackedWhen(screen, crowded(rowWidth(screen), countWidth === null ? [bagsWidth] : [countWidth, bagsWidth], undefined, screen.scale));
  const lineBagsWidth = numberColumnWidth(
    screen,
    BAGS_WIDTH,
    groups.flatMap((group) => group.dispatches.map((d) => formatNumber(d.disp_quantity)))
  );
  const dateWidth = screen.numberWidth(DATE_WIDTH);
  const nestedStacked = table.stacked || crowded(nestedRowWidth(screen), [dateWidth, lineBagsWidth], 0, screen.scale);
  const shownCount = table.stacked ? null : countWidth;
  const widths = useMemo(
    () => ({ count: shownCount, bags: bagsWidth, date: dateWidth, lineBags: lineBagsWidth, nestedStacked }),
    [shownCount, bagsWidth, dateWidth, lineBagsWidth, nestedStacked]
  );
  const firstWithDispatches = groups.find((group) => group.dispatches.length > 0)?.item.id;

  const columns = useMemo(
    () =>
      groupHelper.columns([
        groupHelper.accessor((group) => group.item.item_name, {
          id: 'item',
          header: tr('grn.detailsTable.item'),
          meta: { width: 'grow' },
          cell: (info) => {
            const { item, dispatches } = info.row.original;
            const details = lotLine(item);
            const countText = tr('grn.detailsTable.dispatchCount', { count: dispatches.length });
            const received = tr('grn.stock.receivedCount', { quantity: formatNumber(item.qty) });
            return (
              <>
                <Text style={styles.primary}>{item.item_name}</Text>
                {details !== null ? <Text style={styles.secondary}>{nb(details)}</Text> : null}
                <Text style={styles.secondary}>{nb(shownCount === null ? `${received} · ${countText}` : received)}</Text>
              </>
            );
          },
        }),
        ...(shownCount === null
          ? []
          : [
              groupHelper.accessor((group) => group.dispatches.length, {
                id: 'dispatches',
                header: tr('grn.detailsTable.dispatches'),
                meta: { width: shownCount, numeric: true },
                cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.dispatches.length)}</Text>,
              }),
            ]),
        groupHelper.accessor('bags', {
          id: 'bags',
          header: tr('grn.detailsTable.bagsDispatched'),
          meta: { width: bagsWidth, numeric: true },
          cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.bags)}</Text>,
        }),
      ]),
    [shownCount, bagsWidth, styles]
  );
  // The first line with dispatches starts open; a tap flips any line. A line with no dispatches does not open.
  const open = useDefaultOpen(firstWithDispatches === undefined ? [] : [firstWithDispatches]);
  const grid = useAppTable({
    data: groups,
    columns,
    getRowId: (group) => group.item.id,
    getRowCanExpand: (row) => row.original.dispatches.length > 0,
    ...open,
  });

  if (loading) {
    return (
      <View style={own.centered} accessibilityLabel={tr('grn.dispatches.loadingLabel')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={own.loadingText}>{tr('grn.dispatches.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={own.centered}>
        <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} style={own.emptyIcon} />
        <Text style={own.emptyTitle} accessibilityRole="header">
          {tr('grn.dispatches.loadFailedTitle')}
        </Text>
        <Text style={own.emptyMessage}>{error}</Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('grn.dispatches.retryLabel')}
            onPress={onRetry}
            style={({ pressed }) => [own.retryButton, pressed && own.retryButtonPressed]}
          >
            <Text style={own.retryText}>{tr('common.retry')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (firstWithDispatches === undefined) {
    return (
      <View style={own.centered}>
        <Icon name="truck-delivery-outline" size={iconSize.hero} color={t.icon.secondary} style={own.emptyIcon} />
        <Text style={own.emptyTitle}>{tr('grn.dispatches.emptyTitle')}</Text>
        <Text style={own.emptyMessage}>{tr('grn.dispatches.emptyMessage')}</Text>
      </View>
    );
  }

  const distinct = new Set(groups.flatMap((group) => group.dispatches.map((d) => d.dispatch_id))).size;
  const dispatchCount = tr('grn.detailsTable.dispatchCount', { count: distinct });

  const footer = (
    <View
        style={styles.footerRow}
        accessible
        accessibilityLabel={tr('grn.detailsTable.dispatchesTotalLabel', { dispatches: dispatchCount, bags: bags(totalBags) })}
        testID="grn-dispatches-total"
      >
        <RowChevron expandable={false} expanded={false} />
        <View style={styles.grow}>
          <Text style={styles.primaryStrong}>{tr('grn.detailsTable.total')}</Text>
          <Text style={styles.secondary}>{nb(dispatchCount)}</Text>
        </View>
        {shownCount !== null ? <View style={{ width: shownCount }} /> : null}
        <Text style={[styles.numberStrong, { width: bagsWidth }]} {...ONE_LINE}>{formatNumber(totalBags)}</Text>
    </View>
  );

  return (
    <DataTable
      table={grid}
      list="flat"
      renderDetail={(row) => <DispatchLines dispatches={row.original.dispatches} widths={widths} onViewDispatch={onViewDispatch} />}
      rowLabel={(row) => {
        const { item, dispatches } = row.original;
        const details = lotLine(item);
        return tr('grn.detailsTable.dispatchItemRowLabel', {
          item: item.item_name,
          details: details ? `, ${details}` : '',
          dispatches: tr('grn.detailsTable.dispatchCount', { count: dispatches.length }),
          dispatched: formatNumber(row.original.bags),
          received: formatNumber(item.qty),
        });
      }}
      rowHint={() => tr('grn.detailsTable.showDispatches')}
      rowTestID={(row) => `grn-dispatch-row-${row.original.item.id}`}
      detailTestID={(row) => `grn-dispatch-lines-${row.original.item.id}`}
      footer={footer}
      testID="grn-dispatches-table"
    />
  );
};

export default GRNDispatchesTab;
