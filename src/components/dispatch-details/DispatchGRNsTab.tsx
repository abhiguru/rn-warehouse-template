/**
 * DispatchGRNsTab - the dispatch's source GRNs as an expandable table (docs/STYLE_GUIDE.md §13.7)
 *
 * | Source GRN | Item lines | Bags dispatched |
 * | › 0161     |          2 |              65 |
 * |   15 Oct   |            |                 |
 *
 * - Groups are keyed by GRN id (dispatchDetailsModel.groupBySourceGrn); a line without one
 *   is its own group and cannot be opened.
 * - Tapping a row shows its lines (Item / Mark / Bags dispatched, the weight of one bag
 *   under the item) and a separate "View GRN" action. A single GRN starts expanded.
 * - Item lines count dispatch lines, so two lots of one item count two. Every quantity
 *   is this dispatch's. Footer: totals. Virtualized (FlatList).
 * - Built on the app's table setup (components/table): useAppTable, drawn by DataTable; the lines under a GRN are a
 *   nested table of their own.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, formatWeightEach, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { groupBySourceGrn, itemTotals, type DispatchItem, type GrnGroup } from './dispatchDetailsModel';
import { grnDateText } from './DispatchItemsTab';
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

export type { GrnGroup } from './dispatchDetailsModel';

interface DispatchGRNsTabProps {
  items: DispatchItem[];
  onViewGRN?: (grn_id: string) => void;
}

/** Column widths at font scale 1. */
const LINES_WIDTH = 56;
const BAGS_WIDTH = 76;
const MARK_WIDTH = 88;
/** Average glyph width of a mark, in em (subhead). */
const MARK_EM = 0.58;

const makeStyles = (t: ThemeTokens) => ({
  /** Read-only lines: the compact row height, a one-line row in its middle. */
  lineCompact: {
    minHeight: 36,
    paddingVertical: space.sm,
  },
  /** The mark: muted (the column is set off from the item name by its meta.marginLeft). */
  markText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  viewGrn: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    marginLeft: -space.sm,
    borderRadius: radius.button,
  },
  viewGrnPressed: {
    backgroundColor: t.brand.subtle,
  },
  viewGrnText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xl,
    minHeight: 400,
    backgroundColor: t.background.base,
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
});

const bags = (qty: number) => formatCount(qty, 'bag');

function grnSpoken(group: Pick<GrnGroup, 'grn_no' | 'grn_date'>): string {
  if (!group.grn_no) return tr('dispatch.details.table.grnUnavailable');
  const date = toDate(group.grn_date) ? formatDate(group.grn_date, 'short') : tr('dispatch.details.table.dateUnavailable');
  return tr('dispatch.details.grnLabelWithDate', { number: formatIdentifier(group.grn_no), date });
}

/** Column widths for the whole table, so every row lines up; `nestedStacked` for the lines under a GRN. */
interface Widths {
  lines: number;
  bags: number;
  mark: number;
  lineBags: number;
  nestedStacked: boolean;
}

const groupHelper = createAppColumnHelper<GrnGroup>();
const lineHelper = createAppColumnHelper<DispatchItem>();

interface GrnLinesProps {
  group: GrnGroup;
  widths: Widths;
  onViewGRN?: (grn_id: string) => void;
}

/** The lines under an open GRN (Item | Mark | Bags dispatched) and its View GRN action. */
const GrnLines: React.FC<GrnLinesProps> = ({ group, widths, onViewGRN }) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const { mark: markWidth, lineBags: lineBagsWidth, nestedStacked } = widths;
  const grnId = group.grn_id;
  const canOpen = !!(grnId && onViewGRN);

  const columns = useMemo(
    () =>
      lineHelper.columns([
        lineHelper.accessor('item_name', {
          id: 'item',
          header: tr('dispatch.details.table.item'),
          meta: { width: 'grow' },
          cell: (info) => {
            const line = info.row.original;
            const weight = formatWeightEach(line.weight);
            const mark = line.package_mark || null;
            // Stacked, the mark joins the weight under the item.
            const under = nestedStacked ? [mark, weight].filter(Boolean).join(' · ') : weight;
            return (
              <>
                <Text style={styles.primary}>{line.item_name}</Text>
                {under ? <Text style={styles.secondary}>{nb(under)}</Text> : null}
              </>
            );
          },
        }),
        ...(nestedStacked
          ? []
          : [
              lineHelper.accessor('package_mark', {
                id: 'mark',
                header: tr('dispatch.details.table.mark'),
                meta: { width: markWidth, marginLeft: space.xs },
                cell: (info) => <Text style={own.markText}>{info.row.original.package_mark || '—'}</Text>,
              }),
            ]),
        lineHelper.accessor('dispatch_quantity', {
          id: 'bags',
          header: tr('dispatch.details.table.bagsDispatched'),
          meta: { width: lineBagsWidth, numeric: true },
          cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.dispatch_quantity)}</Text>,
        }),
      ]),
    [nestedStacked, markWidth, lineBagsWidth, styles, own]
  );
  const grid = useAppTable({ data: group.lines, columns, getRowId: (line) => line.id });

  return (
    <>
      <DataTable
        table={grid}
        variant="nested"
        headerOneLine={false}
        rowStyle={own.lineCompact}
        rowLabel={(row) => {
          const line = row.original;
          const weight = formatWeightEach(line.weight);
          const mark = line.package_mark || null;
          return tr('dispatch.details.table.lineRowLabel', {
            item: line.item_name,
            details: [mark, weight].filter(Boolean).map((part) => `, ${part}`).join(''),
            bags: bags(line.dispatch_quantity),
          });
        }}
        rowTestID={(row) => `dispatch-grn-line-${row.original.id}`}
      />
      {canOpen ? (
        <Pressable
          onPress={() => {
            if (grnId) onViewGRN?.(grnId);
          }}
          style={({ pressed }) => [own.viewGrn, pressed && own.viewGrnPressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('dispatch.grnSheet.viewGrnNumbered', { number: formatIdentifier(group.grn_no) })}
          accessibilityHint={tr('dispatch.details.opensGrn')}
          testID={`dispatch-grn-view-${group.key}`}
        >
          <Text style={own.viewGrnText}>{tr('dispatch.grnSheet.viewGrn')}</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.brand.tint} />
        </Pressable>
      ) : null}
    </>
  );
};

export const DispatchGRNsTab: React.FC<DispatchGRNsTabProps> = ({
  items,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const screen = useTableLayout();
  const groups = useMemo(() => groupBySourceGrn(items), [items]);
  const totals = useMemo(() => itemTotals(items), [items]);
  // Every column as wide as its widest value; big numbers move the middle column under the first.
  const linesWidth = numberColumnWidth(screen, LINES_WIDTH, groups.map((group) => formatNumber(group.lines.length)), [formatNumber(totals.lines)]);
  const bagsWidth = numberColumnWidth(screen, BAGS_WIDTH, groups.map((group) => formatNumber(group.bags)), [formatNumber(totals.bags)]);
  const table = useStackedWhen(screen, crowded(rowWidth(screen), [linesWidth, bagsWidth], undefined, screen.scale));
  const stacked = table.stacked;
  const lineBagsWidth = numberColumnWidth(screen, BAGS_WIDTH, items.map((line) => formatNumber(line.dispatch_quantity)));
  // The mark column grows with its longest mark, up to a third of the lines' row; longer marks wrap.
  const nestedRow = nestedRowWidth(screen);
  const longestMark = items.reduce((max, line) => Math.max(max, (line.package_mark ?? '').length), 0);
  const markWidth = Math.min(
    Math.max(screen.numberWidth(MARK_WIDTH), Math.ceil(longestMark * (typography.subhead.fontSize ?? 15) * MARK_EM * screen.scale)),
    Math.floor(nestedRow / 3)
  );
  const nestedStacked = table.stacked || crowded(nestedRow, [markWidth, lineBagsWidth], 0, screen.scale);
  const widths = useMemo(
    () => ({ lines: linesWidth, bags: bagsWidth, mark: markWidth, lineBags: lineBagsWidth, nestedStacked }),
    [linesWidth, bagsWidth, markWidth, lineBagsWidth, nestedStacked]
  );
  // One GRN starts open; several start closed. A key that is open stays open on refresh.
  const open = useDefaultOpen(groups.length === 1 ? [groups[0].key] : []);

  const columns = useMemo(
    () =>
      groupHelper.columns([
        groupHelper.accessor((group) => group.grn_no ?? '—', {
          id: 'grn',
          header: tr('dispatch.details.table.sourceGrn'),
          meta: { width: 'grow' },
          cell: (info) => {
            const group = info.row.original;
            return (
              <>
                <Text style={styles.primaryStrong}>{group.grn_no ?? '—'}</Text>
                <Text style={styles.secondary}>{grnDateText(group.grn_date)}</Text>
                {stacked ? <Text style={styles.secondary}>{nb(tr('dispatch.details.table.lineCount', { count: group.lines.length }))}</Text> : null}
              </>
            );
          },
        }),
        ...(stacked
          ? []
          : [
              groupHelper.accessor((group) => group.lines.length, {
                id: 'lines',
                header: tr('dispatch.details.table.itemLines'),
                meta: { width: linesWidth, numeric: true },
                cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.lines.length)}</Text>,
              }),
            ]),
        groupHelper.accessor('bags', {
          id: 'bags',
          header: tr('dispatch.details.table.bagsDispatched'),
          meta: { width: bagsWidth, numeric: true },
          cell: (info) => <Text style={styles.number} {...ONE_LINE}>{formatNumber(info.row.original.bags)}</Text>,
        }),
      ]),
    [stacked, linesWidth, bagsWidth, styles]
  );
  const grid = useAppTable({ data: groups, columns, getRowId: (group) => group.key, getRowCanExpand: () => true, ...open });

  if (groups.length === 0) {
    return (
      <View style={own.emptyContainer}>
        <Icon name="package-down" size={iconSize.hero} color={t.icon.secondary} style={own.emptyIcon} />
        <Text style={own.emptyTitle}>{tr('grn.sourceGrns.emptyTitle')}</Text>
        <Text style={own.emptySubtitle}>{tr('grn.sourceGrns.emptySubtitle')}</Text>
      </View>
    );
  }

  const lineCount = tr('dispatch.details.table.lineCount', { count: totals.lines });
  const grnCount = tr('dispatch.details.table.grnCount', { count: totals.grns });

  const footer = (
    <View
        style={styles.footerRow}
        accessible
        accessibilityLabel={tr('dispatch.details.table.grnsTotalLabel', { grns: grnCount, lines: lineCount, bags: bags(totals.bags) })}
        testID="dispatch-grns-total"
      >
        <RowChevron expandable={false} expanded={false} />
        <View style={styles.grow}>
          <Text style={styles.primaryStrong}>{tr('dispatch.details.table.total')}</Text>
          <Text style={styles.secondary}>{nb(table.stacked ? `${grnCount} · ${lineCount}` : grnCount)}</Text>
        </View>
        {!table.stacked ? (
          <Text style={[styles.numberStrong, { width: linesWidth }]} {...ONE_LINE}>{formatNumber(totals.lines)}</Text>
        ) : null}
        <Text style={[styles.numberStrong, { width: bagsWidth }]} {...ONE_LINE}>{formatNumber(totals.bags)}</Text>
    </View>
  );

  return (
    <DataTable
      table={grid}
      list="flat"
      renderDetail={(row) => <GrnLines group={row.original} widths={widths} onViewGRN={onViewGRN} />}
      rowLabel={(row) =>
        tr('dispatch.details.table.grnRowLabel', {
          source: grnSpoken(row.original),
          lines: tr('dispatch.details.table.lineCount', { count: row.original.lines.length }),
          bags: bags(row.original.bags),
        })
      }
      rowHint={() => tr('dispatch.details.table.showLines')}
      rowTestID={(row) => `dispatch-grn-row-${row.original.key}`}
      detailTestID={(row) => `dispatch-grn-lines-${row.original.key}`}
      footer={footer}
      testID="dispatch-grns-table"
    />
  );
};
