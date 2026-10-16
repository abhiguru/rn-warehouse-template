/**
 * GRNItemsTab - the GRN's lots as a table (docs/STYLE_GUIDE.md §13.7, common/DetailTable)
 *
 * | Item               | Received | In stock |
 * | › Potatoes         |      100 |       80 |
 * |   PM · 50 kg each  |          |          |
 *
 * - One row per GRN line (lot), in the server's order (line ids are time-based: the order of
 *   entry). The mark and the weight of one bag sit under the item; a Low stock tag under them
 *   (the In stock column already says "in stock" and "0").
 * - Tapping a row shows the bags dispatched, the rack and the packaging, and "View dispatches".
 * - Three columns, as the style guide asks on phones; at large text Received moves under the
 *   item. Footer: item lines and both totals.
 * - Virtualized (FlatList); loading and empty states as before.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, LayoutAnimation } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { StatusTag } from '@/components/ui';
import { formatCount, formatNumber, formatWeightEach } from '@/utils/formatters';
import { getGRNStockStatus } from '@/features/grn/utils/grnStockStatus';
import { t as tr } from '@/i18n';
import { HeaderCell, RowChevron, makeTableStyles, useTableLayout, type TableLayout } from '@/components/common/DetailTable';

// ============================================================================
// TYPES - Using snake_case to match backend RPC types
// ============================================================================
export interface GRNItem {
  id: string;
  item_name: string;
  qty: number;
  stock: number;
  dispatch_summary?: {
    total_dispatched: number;
    dispatch_count?: number;
  };
  weight?: number | null;
  packaging?: string | null;
  rack?: string | null;
  package_mark?: string | null;
  processed_images?: Array<{
    id: string;
    image_url: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    uploaded_at?: string;
  }>;
}

interface GRNItemsTabProps {
  items: GRNItem[];
  loading?: boolean;
  onViewItemImages?: (item: GRNItem) => void;
  onViewItemDispatches?: (item: GRNItem) => void;
}

/** Number column width at font scale 1: room for "12,500" and the heading "Received". */
const NUMBER_WIDTH = 60;

const makeStyles = (t: ThemeTokens) => ({
  tag: {
    alignSelf: 'flex-start' as const,
    marginTop: space.xs,
  },
  /** A detail under an open row: its icon centred under the chevron, its text under the item name. */
  detailLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  detailIcon: {
    width: iconSize.md,
    textAlign: 'center' as const,
  },
  action: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    // The text lines up with the details above.
    marginLeft: iconSize.md,
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
  // Empty state (style guide §13.6)
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xxxl,
    paddingVertical: space.giant,
    gap: space.sm,
    backgroundColor: t.background.base,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.giant,
    gap: space.sm,
    backgroundColor: t.background.base,
  },
  loadingFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
    gap: space.sm,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
});

const bags = (qty: number) => formatCount(qty, 'bag');

/** Bags dispatched from the lot: the server's summary, else received less stock. */
export const dispatchedOf = (item: GRNItem): number =>
  item.dispatch_summary?.total_dispatched ?? Math.max(0, Number(item.qty || 0) - Number(item.stock || 0));

/** "PM · 50 kg each", or null when the lot has neither (a weight of 0 is none). */
export function lotLine(item: Pick<GRNItem, 'package_mark' | 'weight'>): string | null {
  const parts = [item.package_mark || null, formatWeightEach(Number(item.weight))].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface ItemRowProps {
  item: GRNItem;
  expanded: boolean;
  onToggle: (id: string) => void;
  onViewDispatches?: (item: GRNItem) => void;
  table: TableLayout;
}

const ItemRow = React.memo(function ItemRow({ item, expanded, onToggle, onViewDispatches, table }: ItemRowProps) {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const details = lotLine(item);
  const status = getGRNStockStatus(item.stock, item.qty);
  // The In stock column already says "in stock" and "0"; only Low stock, which a number alone
  // does not show, gets a tag (a long "Fully dispatched" tag was cut at font scale 1.3).
  const tag = status && status.status === 'critical' ? status : null;
  const dispatched = dispatchedOf(item);
  const width = table.numberWidth(NUMBER_WIDTH);
  const label = [
    tr('grn.detailsTable.itemRowLabel', {
      item: item.item_name,
      details: details ? `, ${details}` : '',
      received: formatNumber(item.qty),
      stock: formatNumber(item.stock),
    }),
    tag?.label,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={expanded ? styles.group : undefined}>
      <Pressable
        onPress={() => onToggle(item.id)}
        style={({ pressed }) => [styles.row, expanded && styles.rowOpen, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={tr('grn.detailsTable.showItemDetails')}
        accessibilityState={{ expanded }}
        testID={`grn-item-row-${item.id}`}
      >
        <RowChevron expandable expanded={expanded} />
        <View style={styles.grow}>
          <Text style={styles.primary}>{item.item_name}</Text>
          {details !== null ? <Text style={styles.secondary}>{details}</Text> : null}
          {table.stacked ? <Text style={styles.secondary}>{tr('grn.stock.receivedCount', { quantity: formatNumber(item.qty) })}</Text> : null}
          {tag ? <StatusTag status={tag.status} label={tag.label} icon={tag.icon} style={own.tag} /> : null}
        </View>
        {!table.stacked ? <Text style={[styles.number, { width }]}>{formatNumber(item.qty)}</Text> : null}
        <Text style={[styles.number, { width }]}>{formatNumber(item.stock)}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.details} testID={`grn-item-details-${item.id}`}>
          <View style={own.detailLine}>
            <Icon name="truck-delivery-outline" size={iconSize.sm} color={t.icon.secondary} style={own.detailIcon} />
            <Text style={styles.secondary}>{tr('grn.detailsTable.dispatchedBags', { bags: bags(dispatched) })}</Text>
          </View>
          {item.rack ? (
            <View style={own.detailLine}>
              <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} style={own.detailIcon} />
              <Text style={styles.secondary}>{tr('grn.item.rackWithValue', { rack: item.rack })}</Text>
            </View>
          ) : null}
          {item.packaging ? (
            <View style={own.detailLine}>
              <Icon name="package-variant-closed" size={iconSize.sm} color={t.icon.secondary} style={own.detailIcon} />
              <Text style={styles.secondary}>{tr('grn.detailsTable.packaging', { packaging: item.packaging })}</Text>
            </View>
          ) : null}
          {dispatched > 0 && onViewDispatches ? (
            <Pressable
              onPress={() => onViewDispatches(item)}
              style={({ pressed }) => [own.action, pressed && own.actionPressed]}
              accessibilityRole="button"
              accessibilityLabel={tr('grn.detailsTable.viewDispatches')}
              accessibilityHint={tr('grn.detailsTable.viewDispatchesHint')}
              testID={`grn-item-dispatches-${item.id}`}
            >
              <Text style={own.actionText}>{tr('grn.detailsTable.viewDispatches')}</Text>
              <Icon name="chevron-right" size={iconSize.md} color={t.brand.tint} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

// ============================================================================
// COMPONENT
// ============================================================================
export const GRNItemsTab: React.FC<GRNItemsTabProps> = ({
  items,
  loading = false,
  onViewItemDispatches,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const t = useTokens();
  const table = useTableLayout();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const totals = useMemo(
    () => ({
      received: items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
      stock: items.reduce((sum, item) => sum + (Number(item.stock) || 0), 0),
    }),
    [items]
  );

  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Initial loading state
  if (loading && items.length === 0) {
    return (
      <View style={own.loadingContainer} accessibilityRole="progressbar" accessibilityLabel={tr('grn.itemsTab.loadingLabel')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={own.loadingText}>{tr('grn.itemsTab.loading')}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={own.emptyContainer}>
        <Icon name="cube-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={own.emptyTitle} accessibilityRole="header">
          {tr('grn.itemsTab.emptyTitle')}
        </Text>
        <Text style={own.emptySubtitle}>{tr('grn.itemsTab.emptySubtitle')}</Text>
      </View>
    );
  }

  const width = table.numberWidth(NUMBER_WIDTH);
  const lineCount = tr('grn.detailsTable.lineCount', { count: items.length });

  const header = (
    <View style={styles.headerRow}>
      <RowChevron expandable={false} expanded={false} />
      <HeaderCell style={styles.grow}>{tr('grn.detailsTable.item')}</HeaderCell>
      {!table.stacked ? <HeaderCell numeric style={{ width }}>{tr('grn.stock.received')}</HeaderCell> : null}
      <HeaderCell numeric style={{ width }}>{tr('grn.stock.inStock')}</HeaderCell>
    </View>
  );

  const footer = (
    <View>
      <View
        style={styles.footerRow}
        accessible
        accessibilityLabel={tr('grn.detailsTable.itemsTotalLabel', {
          lines: lineCount,
          received: formatNumber(totals.received),
          stock: formatNumber(totals.stock),
        })}
        testID="grn-items-total"
      >
        <RowChevron expandable={false} expanded={false} />
        <View style={styles.grow}>
          <Text style={styles.primaryStrong}>{tr('grn.detailsTable.total')}</Text>
          <Text style={styles.secondary}>
            {table.stacked ? `${lineCount} · ${tr('grn.stock.receivedCount', { quantity: formatNumber(totals.received) })}` : lineCount}
          </Text>
        </View>
        {!table.stacked ? <Text style={[styles.numberStrong, { width }]}>{formatNumber(totals.received)}</Text> : null}
        <Text style={[styles.numberStrong, { width }]}>{formatNumber(totals.stock)}</Text>
      </View>
      {loading ? (
        <View style={own.loadingFooter} accessibilityRole="progressbar" accessibilityLabel={tr('grn.itemsTab.loadingLabel')}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={own.loadingText}>{tr('grn.itemsTab.loading')}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.card}
      data={items}
      keyExtractor={(item) => item.id}
      extraData={expanded}
      renderItem={({ item }) => (
        <ItemRow item={item} expanded={expanded.has(item.id)} onToggle={toggle} onViewDispatches={onViewItemDispatches} table={table} />
      )}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      showsVerticalScrollIndicator={false}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      windowSize={10}
      testID="grn-items-table"
    />
  );
};
