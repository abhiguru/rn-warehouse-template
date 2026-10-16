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
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, LayoutAnimation, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, formatWeightEach, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { groupBySourceGrn, itemTotals, type DispatchItem, type GrnGroup } from './dispatchDetailsModel';
import { grnDateText } from './DispatchItemsTab';
import { HeaderCell, RowChevron, makeTableStyles, useTableLayout, type TableLayout } from './DispatchTable';

export type { GrnGroup } from './dispatchDetailsModel';

interface DispatchGRNsTabProps {
  items: DispatchItem[];
  onViewGRN?: (grn_id: string) => void;
}

/** Column widths at font scale 1. */
const LINES_WIDTH = 56;
const BAGS_WIDTH = 76;
const MARK_WIDTH = 88;

const makeStyles = (t: ThemeTokens) => ({
  lineTable: {
    borderRadius: radius.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
    overflow: 'hidden' as const,
  },
  lineHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: t.background.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  lineRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    minHeight: 36,
    paddingHorizontal: space.sm,
    paddingVertical: space.s6,
  },
  lineDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  markCell: {
    minWidth: 0,
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

interface GroupRowProps {
  group: GrnGroup;
  expanded: boolean;
  onToggle: (key: string) => void;
  onViewGRN?: (grn_id: string) => void;
  table: TableLayout;
}

const GroupRow = React.memo(function GroupRow({ group, expanded, onToggle, onViewGRN, table }: GroupRowProps) {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const lines = tr('dispatch.details.table.lineCount', { count: group.lines.length });
  const grnId = group.grn_id;
  const canOpen = !!(grnId && onViewGRN);
  const linesWidth = table.numberWidth(LINES_WIDTH);
  const bagsWidth = table.numberWidth(BAGS_WIDTH);

  return (
    <View>
      <Pressable
        onPress={() => onToggle(group.key)}
        style={({ pressed }) => [styles.row, expanded && styles.rowOpen, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={tr('dispatch.details.table.grnRowLabel', { source: grnSpoken(group), lines, bags: bags(group.bags) })}
        accessibilityHint={tr('dispatch.details.table.showLines')}
        accessibilityState={{ expanded }}
        testID={`dispatch-grn-row-${group.key}`}
      >
        <RowChevron expandable expanded={expanded} />
        <View style={styles.grow}>
          <Text style={styles.primaryStrong}>{group.grn_no ?? '—'}</Text>
          <Text style={styles.secondary}>{grnDateText(group.grn_date)}</Text>
          {table.stacked ? <Text style={styles.secondary}>{lines}</Text> : null}
        </View>
        {!table.stacked ? (
          <Text style={[styles.number, { width: linesWidth }]}>{formatNumber(group.lines.length)}</Text>
        ) : null}
        <Text style={[styles.number, { width: bagsWidth }]}>{formatNumber(group.bags)}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.details} testID={`dispatch-grn-lines-${group.key}`}>
          <View style={own.lineTable}>
            <View style={own.lineHeader}>
              <HeaderCell style={styles.grow}>{tr('dispatch.details.table.item')}</HeaderCell>
              {!table.stacked ? (
                <HeaderCell style={[own.markCell, { width: table.numberWidth(MARK_WIDTH) }]}>{tr('dispatch.details.table.mark')}</HeaderCell>
              ) : null}
              <HeaderCell numeric style={{ width: bagsWidth }}>{tr('dispatch.details.table.bagsDispatched')}</HeaderCell>
            </View>
            {group.lines.map((line, index) => {
              const weight = formatWeightEach(line.weight);
              const mark = line.package_mark || null;
              // Stacked, the mark joins the weight under the item.
              const under = table.stacked ? [mark, weight].filter(Boolean).join(' · ') : weight;
              return (
                <View
                  key={line.id}
                  style={[own.lineRow, index > 0 && own.lineDivider]}
                  accessible
                  accessibilityLabel={tr('dispatch.details.table.lineRowLabel', {
                    item: line.item_name,
                    details: [mark, weight].filter(Boolean).map((part) => `, ${part}`).join(''),
                    bags: bags(line.dispatch_quantity),
                  })}
                  testID={`dispatch-grn-line-${line.id}`}
                >
                  <View style={styles.grow}>
                    <Text style={styles.primary}>{line.item_name}</Text>
                    {under ? <Text style={styles.secondary}>{under}</Text> : null}
                  </View>
                  {!table.stacked ? (
                    <Text style={[styles.primary, own.markCell, { width: table.numberWidth(MARK_WIDTH) }]}>{mark ?? '—'}</Text>
                  ) : null}
                  <Text style={[styles.number, { width: bagsWidth }]}>{formatNumber(line.dispatch_quantity)}</Text>
                </View>
              );
            })}
          </View>
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
        </View>
      ) : null}
    </View>
  );
});

export const DispatchGRNsTab: React.FC<DispatchGRNsTabProps> = ({
  items,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const table = useTableLayout();
  const groups = useMemo(() => groupBySourceGrn(items), [items]);
  const totals = useMemo(() => itemTotals(items), [items]);
  // One GRN starts open; several start closed. A key that is open stays open on refresh.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const single = groups.length === 1;
  const isOpen = useCallback((key: string) => (single ? !toggled.has(key) : toggled.has(key)), [single, toggled]);

  const toggle = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return (
      <View style={own.emptyContainer}>
        <Icon name="package-down" size={iconSize.hero} color={t.icon.secondary} style={own.emptyIcon} />
        <Text style={own.emptyTitle}>{tr('grn.sourceGrns.emptyTitle')}</Text>
        <Text style={own.emptySubtitle}>{tr('grn.sourceGrns.emptySubtitle')}</Text>
      </View>
    );
  }

  const linesWidth = table.numberWidth(LINES_WIDTH);
  const bagsWidth = table.numberWidth(BAGS_WIDTH);
  const lineCount = tr('dispatch.details.table.lineCount', { count: totals.lines });
  const grnCount = tr('dispatch.details.table.grnCount', { count: totals.grns });

  const header = (
    <View style={styles.headerRow}>
      <RowChevron expandable={false} expanded={false} />
      <HeaderCell style={styles.grow}>{tr('dispatch.details.table.sourceGrn')}</HeaderCell>
      {!table.stacked ? <HeaderCell numeric style={{ width: linesWidth }}>{tr('dispatch.details.table.itemLines')}</HeaderCell> : null}
      <HeaderCell numeric style={{ width: bagsWidth }}>{tr('dispatch.details.table.bagsDispatched')}</HeaderCell>
    </View>
  );

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
        <Text style={styles.secondary}>{table.stacked ? `${grnCount} · ${lineCount}` : grnCount}</Text>
      </View>
      {!table.stacked ? <Text style={[styles.numberStrong, { width: linesWidth }]}>{formatNumber(totals.lines)}</Text> : null}
      <Text style={[styles.numberStrong, { width: bagsWidth }]}>{formatNumber(totals.bags)}</Text>
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.card}
      data={groups}
      keyExtractor={(group) => group.key}
      extraData={toggled}
      renderItem={({ item }) => (
        <GroupRow group={item} expanded={isOpen(item.key)} onToggle={toggle} onViewGRN={onViewGRN} table={table} />
      )}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      showsVerticalScrollIndicator={false}
      maxToRenderPerBatch={10}
      windowSize={10}
      testID="dispatch-grns-table"
    />
  );
};
