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
import { View, Text, FlatList, ActivityIndicator, Pressable, LayoutAnimation } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { DispatchRecord } from '@/services/grn-detail-service';
import { formatCount, formatDate, formatNumber, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import {
  HeaderCell,
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
  type TableLayout,
} from '@/components/common/DetailTable';
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
const dateText = (date: string | null | undefined) => (toDate(date) ? formatDate(date, 'short') : '—');
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

interface GroupRowProps {
  group: ItemGroup;
  expanded: boolean;
  onToggle: (id: string) => void;
  onViewDispatch: (dispatch_id: string) => void;
  table: TableLayout;
  widths: Widths;
}

const GroupRow = React.memo(function GroupRow({ group, expanded, onToggle, onViewDispatch, table, widths }: GroupRowProps) {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const { item, dispatches } = group;
  const expandable = dispatches.length > 0;
  const open = expandable && expanded;
  const details = lotLine(item);
  const countText = tr('grn.detailsTable.dispatchCount', { count: dispatches.length });
  const received = tr('grn.stock.receivedCount', { quantity: formatNumber(item.qty) });
  const { count: countWidth, bags: bagsWidth, date: dateWidth, lineBags: lineBagsWidth, nestedStacked } = widths;

  return (
    <View style={[styles.cardSides, open && styles.group]}>
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
          {details !== null ? <Text style={styles.secondary}>{nb(details)}</Text> : null}
          <Text style={styles.secondary}>{nb(countWidth === null ? `${received} · ${countText}` : received)}</Text>
        </View>
        {countWidth !== null ? (
          <Text style={[styles.number, { width: countWidth }]} {...ONE_LINE}>{formatNumber(dispatches.length)}</Text>
        ) : null}
        <Text style={[styles.number, { width: bagsWidth }]} {...ONE_LINE}>{formatNumber(group.bags)}</Text>
      </Pressable>

      {open ? (
        <View style={styles.details} testID={`grn-dispatch-lines-${item.id}`}>
          <View style={styles.nested}>
            <View style={styles.nestedHeader}>
              <HeaderCell style={styles.grow}>{tr('grn.detailsTable.dispatch')}</HeaderCell>
              {!nestedStacked ? <HeaderCell style={{ width: dateWidth }}>{tr('grn.detailsTable.date')}</HeaderCell> : null}
              <HeaderCell numeric style={{ width: lineBagsWidth }}>{tr('grn.detailsTable.bags')}</HeaderCell>
            </View>
            {dispatches.map((dispatch, index) => (
              <Pressable
                key={dispatch.id}
                onPress={() => onViewDispatch(dispatch.dispatch_id)}
                style={({ pressed }) => [styles.nestedRow, index > 0 && styles.nestedDivider, pressed && styles.rowPressed]}
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
                  {nestedStacked ? <Text style={styles.secondary}>{dateText(dispatch.disp_date)}</Text> : null}
                </View>
                {!nestedStacked ? (
                  <Text style={[styles.primary, { width: dateWidth }]} {...ONE_LINE}>{dateText(dispatch.disp_date)}</Text>
                ) : null}
                <Text style={[styles.number, { width: lineBagsWidth }]} {...ONE_LINE}>{formatNumber(dispatch.disp_quantity)}</Text>
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
  const table = useStackedWhen(screen, crowded(rowWidth(screen), countWidth === null ? [bagsWidth] : [countWidth, bagsWidth]));
  const lineBagsWidth = numberColumnWidth(
    screen,
    BAGS_WIDTH,
    groups.flatMap((group) => group.dispatches.map((d) => formatNumber(d.disp_quantity)))
  );
  const dateWidth = screen.numberWidth(DATE_WIDTH);
  const nestedStacked = table.stacked || crowded(nestedRowWidth(screen), [dateWidth, lineBagsWidth], 0);
  const shownCount = table.stacked ? null : countWidth;
  const widths = useMemo(
    () => ({ count: shownCount, bags: bagsWidth, date: dateWidth, lineBags: lineBagsWidth, nestedStacked }),
    [shownCount, bagsWidth, dateWidth, lineBagsWidth, nestedStacked]
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

  const distinct = new Set(groups.flatMap((group) => group.dispatches.map((d) => d.dispatch_id))).size;
  const dispatchCount = tr('grn.detailsTable.dispatchCount', { count: distinct });

  const header = (
    <View style={styles.cardTop}>
      <View style={styles.headerRow}>
        <RowChevron expandable={false} expanded={false} />
        <HeaderCell style={styles.grow}>{tr('grn.detailsTable.item')}</HeaderCell>
        {shownCount !== null ? <HeaderCell numeric style={{ width: shownCount }}>{tr('grn.detailsTable.dispatches')}</HeaderCell> : null}
        <HeaderCell numeric style={{ width: bagsWidth }}>{tr('grn.detailsTable.bagsDispatched')}</HeaderCell>
      </View>
    </View>
  );

  const footer = (
    <View style={styles.cardBottom}>
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
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={groups}
      keyExtractor={(group) => group.item.id}
      extraData={toggled}
      renderItem={({ item }) => (
        <GroupRow group={item} expanded={isOpen(item.item.id)} onToggle={toggle} onViewDispatch={onViewDispatch} table={table} widths={widths} />
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
