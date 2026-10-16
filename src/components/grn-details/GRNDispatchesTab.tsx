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
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, LayoutAnimation, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { DispatchRecord } from '@/services/grn-detail-service';
import { formatCount, formatDate, formatNumber, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { HeaderCell, RowChevron, makeTableStyles, useTableLayout, type TableLayout } from '@/components/common/DetailTable';
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
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  lineDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
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
const dateText = (date: string | null | undefined) => (toDate(date) ? formatDate(date, 'short') : '—');
const openDispatch = (dispatchId: string) => router.push(`/dispatch-details/${dispatchId}`);

interface ItemGroup {
  item: GRNItem;
  dispatches: DispatchRecord[];
  bags: number;
}

interface GroupRowProps {
  group: ItemGroup;
  expanded: boolean;
  onToggle: (id: string) => void;
  onViewDispatch: (dispatch_id: string) => void;
  table: TableLayout;
}

const GroupRow = React.memo(function GroupRow({ group, expanded, onToggle, onViewDispatch, table }: GroupRowProps) {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const { item, dispatches } = group;
  const expandable = dispatches.length > 0;
  const open = expandable && expanded;
  const details = lotLine(item);
  const countText = tr('grn.detailsTable.dispatchCount', { count: dispatches.length });
  const received = tr('grn.stock.receivedCount', { quantity: formatNumber(item.qty) });
  const countWidth = table.numberWidth(COUNT_WIDTH);
  const bagsWidth = table.numberWidth(BAGS_WIDTH);

  return (
    <View>
      <Pressable
        onPress={expandable ? () => onToggle(item.id) : undefined}
        disabled={!expandable}
        style={({ pressed }) => [styles.row, open && styles.rowOpen, pressed && expandable && styles.rowPressed]}
        accessible
        accessibilityRole={expandable ? 'button' : undefined}
        accessibilityLabel={tr('grn.detailsTable.dispatchItemRowLabel', {
          item: item.item_name,
          details: details ? `, ${details}` : '',
          dispatches: countText,
          dispatched: formatNumber(group.bags),
          received: formatNumber(item.qty),
        })}
        accessibilityHint={expandable ? tr('grn.detailsTable.showDispatches') : undefined}
        accessibilityState={expandable ? { expanded: open } : undefined}
        testID={`grn-dispatch-row-${item.id}`}
      >
        <RowChevron expandable={expandable} expanded={open} />
        <View style={styles.grow}>
          <Text style={styles.primary}>{item.item_name}</Text>
          {details !== null ? <Text style={styles.secondary}>{details}</Text> : null}
          <Text style={styles.secondary}>{table.stacked ? `${received} · ${countText}` : received}</Text>
        </View>
        {!table.stacked ? <Text style={[styles.number, { width: countWidth }]}>{formatNumber(dispatches.length)}</Text> : null}
        <Text style={[styles.number, { width: bagsWidth }]}>{formatNumber(group.bags)}</Text>
      </Pressable>

      {open ? (
        <View style={styles.details} testID={`grn-dispatch-lines-${item.id}`}>
          <View style={own.lineTable}>
            <View style={own.lineHeader}>
              <HeaderCell style={styles.grow}>{tr('grn.detailsTable.dispatch')}</HeaderCell>
              {!table.stacked ? <HeaderCell style={{ width: table.numberWidth(DATE_WIDTH) }}>{tr('grn.detailsTable.date')}</HeaderCell> : null}
              <HeaderCell numeric style={{ width: bagsWidth }}>{tr('grn.detailsTable.bags')}</HeaderCell>
            </View>
            {dispatches.map((dispatch, index) => (
              <Pressable
                key={dispatch.id}
                onPress={() => onViewDispatch(dispatch.dispatch_id)}
                style={({ pressed }) => [own.lineRow, index > 0 && own.lineDivider, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={tr('grn.dispatches.rowLabelDateFirst', {
                  number: formatIdentifier(dispatch.disp_no),
                  date: dateText(dispatch.disp_date),
                  bags: bags(dispatch.disp_quantity),
                })}
                accessibilityHint={tr('grn.dispatches.openHint')}
                testID={`grn-dispatch-line-${dispatch.id}`}
              >
                <View style={styles.grow}>
                  <Text style={styles.link}>{formatIdentifier(dispatch.disp_no)}</Text>
                  {table.stacked ? <Text style={styles.secondary}>{dateText(dispatch.disp_date)}</Text> : null}
                </View>
                {!table.stacked ? (
                  <Text style={[styles.primary, { width: table.numberWidth(DATE_WIDTH) }]}>{dateText(dispatch.disp_date)}</Text>
                ) : null}
                <Text style={[styles.number, { width: bagsWidth }]}>{formatNumber(dispatch.disp_quantity)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
});

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
  const table = useTableLayout();

  const groups = useMemo<ItemGroup[]>(
    () =>
      items.map((item) => {
        const dispatches = dispatchesByItem[item.id] || [];
        return { item, dispatches, bags: dispatches.reduce((sum, d) => sum + (Number(d.disp_quantity) || 0), 0) };
      }),
    [items, dispatchesByItem]
  );
  const firstWithDispatches = groups.find((group) => group.dispatches.length > 0)?.item.id;
  // The first line with dispatches starts open; a tap flips any line.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = useCallback(
    (id: string) => (id === firstWithDispatches ? !toggled.has(id) : toggled.has(id)),
    [firstWithDispatches, toggled]
  );
  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const countWidth = table.numberWidth(COUNT_WIDTH);
  const bagsWidth = table.numberWidth(BAGS_WIDTH);
  const totalBags = groups.reduce((sum, group) => sum + group.bags, 0);
  const distinct = new Set(groups.flatMap((group) => group.dispatches.map((d) => d.dispatch_id))).size;
  const dispatchCount = tr('grn.detailsTable.dispatchCount', { count: distinct });

  const header = (
    <View style={styles.headerRow}>
      <RowChevron expandable={false} expanded={false} />
      <HeaderCell style={styles.grow}>{tr('grn.detailsTable.item')}</HeaderCell>
      {!table.stacked ? <HeaderCell numeric style={{ width: countWidth }}>{tr('grn.detailsTable.dispatches')}</HeaderCell> : null}
      <HeaderCell numeric style={{ width: bagsWidth }}>{tr('grn.detailsTable.bagsDispatched')}</HeaderCell>
    </View>
  );

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
        <Text style={styles.secondary}>{dispatchCount}</Text>
      </View>
      {!table.stacked ? <View style={{ width: countWidth }} /> : null}
      <Text style={[styles.numberStrong, { width: bagsWidth }]}>{formatNumber(totalBags)}</Text>
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.card}
      data={groups}
      keyExtractor={(group) => group.item.id}
      extraData={toggled}
      renderItem={({ item }) => (
        <GroupRow group={item} expanded={isOpen(item.item.id)} onToggle={toggle} onViewDispatch={onViewDispatch} table={table} />
      )}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      showsVerticalScrollIndicator={false}
      maxToRenderPerBatch={10}
      windowSize={10}
      testID="grn-dispatches-table"
    />
  );
};

export default GRNDispatchesTab;
