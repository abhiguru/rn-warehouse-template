/**
 * DispatchItemsTab - the dispatch's lines as a table (docs/STYLE_GUIDE.md §13.7)
 *
 * | Item                 | Source GRN | Bags dispatched |
 * | Basmati Rice         | 0161       |              25 |
 * |   PM · 50 kg each    | 15 Oct     |                 |
 *
 * - One row per dispatch line: two lots of the same item are two rows.
 * - The mark and the weight of one bag sit under the item; the GRN date under its number.
 * - The GRN number opens the GRN only when the line has a GRN id.
 * - A row with a received quantity expands to show it.
 * - Footer: bags dispatched, item lines and distinct source GRNs.
 * - Virtualized (FlatList); loading and empty states as before.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, LayoutAnimation } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, formatWeightEach, toDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { itemTotals, type DispatchItem } from './dispatchDetailsModel';
import { HeaderCell, RowChevron, makeTableStyles, useTableLayout, type TableLayout } from '@/components/common/DetailTable';

export type { DispatchItem } from './dispatchDetailsModel';

interface DispatchItemsTabProps {
  items: DispatchItem[];
  loading?: boolean;
  onViewGRN?: (grn_id: string) => void;
}

/** Bags column width at font scale 1: room for "12,500" and a two-line heading. */
const BAGS_WIDTH = 76;

const makeStyles = (t: ThemeTokens) => ({
  grnColumn: {
    flex: 0.8,
    minWidth: 0,
  },
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
  receivedLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
});

const bags = (qty: number) => formatCount(qty, 'bag');

/** "PM · 50 kg each", or null when the lot has neither. */
export function lotDetails(item: Pick<DispatchItem, 'package_mark' | 'weight'>): string | null {
  const parts = [item.package_mark, formatWeightEach(item.weight)].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The GRN date for display, "—" when the GRN has none (never today). */
export const grnDateText = (date: string | null): string => (toDate(date) ? formatDate(date, 'short') : '—');

function grnSpoken(item: Pick<DispatchItem, 'grn_no' | 'grn_date'>): string {
  if (!item.grn_no) return tr('dispatch.details.table.grnUnavailable');
  const date = toDate(item.grn_date) ? formatDate(item.grn_date, 'short') : tr('dispatch.details.table.dateUnavailable');
  return tr('dispatch.details.grnLabelWithDate', { number: formatIdentifier(item.grn_no), date });
}

interface ItemRowProps {
  item: DispatchItem;
  expanded: boolean;
  onToggle: (id: string) => void;
  onViewGRN?: (grn_id: string) => void;
  table: TableLayout;
}

const ItemRow = React.memo(function ItemRow({ item, expanded, onToggle, onViewGRN, table }: ItemRowProps) {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const details = lotDetails(item);
  const expandable = item.original_quantity !== undefined;
  const grnId = item.grn_id;
  const canOpenGrn = !!(grnId && onViewGRN);
  const openGrn = () => {
    if (grnId && onViewGRN) onViewGRN(grnId);
  };

  const grnCell = (
    <Pressable
      onPress={openGrn}
      disabled={!canOpenGrn}
      // The row is one element for a screen reader; it offers this as an action instead.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={({ pressed }) => [styles.linkTarget, pressed && canOpenGrn && styles.linkPressed]}
      testID={`dispatch-item-grn-${item.id}`}
    >
      <Text style={canOpenGrn ? styles.link : styles.primary}>{item.grn_no ?? '—'}</Text>
      <Text style={styles.secondary}>{grnDateText(item.grn_date)}</Text>
    </Pressable>
  );

  const label = tr('dispatch.details.table.itemRowLabel', {
    item: item.item_name,
    details: details ? `, ${details}` : '',
    source: grnSpoken(item),
    bags: bags(item.dispatch_quantity),
  });
  const actions = canOpenGrn
    ? [{ name: 'openGrn', label: tr('dispatch.details.table.openGrnAction', { number: formatIdentifier(item.grn_no) }) }]
    : undefined;

  return (
    <View>
      <Pressable
        onPress={expandable ? () => onToggle(item.id) : undefined}
        disabled={!expandable}
        style={({ pressed }) => [styles.row, expandable && expanded && styles.rowOpen, pressed && expandable && styles.rowPressed]}
        accessible
        accessibilityRole={expandable ? 'button' : undefined}
        accessibilityLabel={label}
        accessibilityHint={expandable ? tr('dispatch.details.table.showReceived') : undefined}
        accessibilityState={expandable ? { expanded } : undefined}
        accessibilityActions={actions}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'openGrn') openGrn();
        }}
        testID={`dispatch-item-row-${item.id}`}
      >
        <RowChevron expandable={expandable} expanded={expanded} />
        <View style={styles.grow}>
          <Text style={styles.primary}>{item.item_name}</Text>
          {details !== null ? <Text style={styles.secondary}>{details}</Text> : null}
          {table.stacked ? <View style={own.stackedGrn}>{grnCell}</View> : null}
        </View>
        {!table.stacked ? <View style={own.grnColumn}>{grnCell}</View> : null}
        <Text style={[styles.number, { width: table.numberWidth(BAGS_WIDTH) }]}>{formatNumber(item.dispatch_quantity)}</Text>
      </Pressable>
      {expandable && expanded ? (
        <View style={styles.details} testID={`dispatch-item-details-${item.id}`}>
          <View style={own.receivedLine}>
            <Icon name="package-variant-closed" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.secondary}>{tr('dispatch.details.received', { bags: bags(item.original_quantity ?? 0) })}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

export const DispatchItemsTab: React.FC<DispatchItemsTabProps> = ({
  items,
  loading = false,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const table = useTableLayout();
  const totals = useMemo(() => itemTotals(items), [items]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bagsWidth = table.numberWidth(BAGS_WIDTH);

  const header = (
    <View style={styles.headerRow}>
      <RowChevron expandable={false} expanded={false} />
      <HeaderCell style={styles.grow}>{tr('dispatch.details.table.item')}</HeaderCell>
      {!table.stacked ? <HeaderCell style={own.grnColumn}>{tr('dispatch.details.table.sourceGrn')}</HeaderCell> : null}
      <HeaderCell numeric style={{ width: bagsWidth }}>{tr('dispatch.details.table.bagsDispatched')}</HeaderCell>
    </View>
  );

  const lineCount = tr('dispatch.details.table.lineCount', { count: totals.lines });
  const grnCount = tr('dispatch.details.table.grnCount', { count: totals.grns });
  const footer = (
    <View>
      <View
        style={styles.footerRow}
        accessible
        accessibilityLabel={tr('dispatch.details.table.itemsTotalLabel', { lines: lineCount, grns: grnCount, bags: bags(totals.bags) })}
        testID="dispatch-items-total"
      >
        <RowChevron expandable={false} expanded={false} />
        <View style={styles.grow}>
          <Text style={styles.primaryStrong}>{tr('dispatch.details.table.total')}</Text>
          <Text style={styles.secondary}>{table.stacked ? `${lineCount} · ${grnCount}` : lineCount}</Text>
        </View>
        {!table.stacked ? (
          <View style={own.grnColumn}>
            <Text style={styles.primaryStrong}>{grnCount}</Text>
          </View>
        ) : null}
        <Text style={[styles.numberStrong, { width: bagsWidth }]}>{formatNumber(totals.bags)}</Text>
      </View>
      {loading ? (
        <View style={own.loadingFooter}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={own.loadingText}>{tr('dispatch.details.loadingItems')}</Text>
        </View>
      ) : null}
    </View>
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
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.card}
      data={items}
      keyExtractor={(item) => item.id}
      extraData={expanded}
      renderItem={({ item }) => (
        <ItemRow item={item} expanded={expanded.has(item.id)} onToggle={toggle} onViewGRN={onViewGRN} table={table} />
      )}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      showsVerticalScrollIndicator={false}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      windowSize={10}
      testID="dispatch-items-table"
    />
  );
};
