/**
 * Stock aging report (C5): how long each customer's stock has been in store.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10), like GRN activity:
 * useReportScope says whose stock, useReportFilters holds the search, sort and
 * bucket choice, useReportQuery the data, and ReportScaffold draws every state.
 * The report is of today's stock, so it has no period. A warehouse role opens
 * a customer by pushing this route with `?customerId=`.
 *
 * Each age bucket carries its status, icon and words (§3.5): 0–120 days
 * positive, 121–240 informative, 241–364 critical and over 364 negative.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  AGING_BUCKET_STATUS,
  AgingBucketBar,
  ReportCustomerCard,
  ReportCustomerPicker,
  ReportLastCustomer,
  ReportNoCustomer,
  ReportScaffold,
  agingBucketLabel,
  agingBucketsFrom,
  animateExpand,
  type AgingBucketId,
  type KPIItem,
  type ReportHeaderAction,
} from '@/components/reports';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { StatusTag } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import {
  STOCK_AGING_CUSTOMER,
  STOCK_AGING_CUSTOMERS,
  bucketForDays,
  groupStockAgingLines,
  lineBucket,
  stockAgingCustomersView,
  stockAgingItemsView,
  type StockAgingGroup,
  type StockAgingLine,
} from '@/features/filters/configs/reports/stockAging';
import { reportById } from '@/features/reports/reportRegistry';
import { reportPdfSort } from '@/features/reports/reportPdfSort';
import { exportHeaderActions } from '@/features/reports/reportActions';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope, type ReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier } from '@/i18n';
import { getAllStockAging, getCustomerStockAging } from '@/services/reporting/stock-aging-service';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { fontWeight, iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { AgingBucketData, AllStockAgingData, CustomerAgingSummary, StockAgingData } from '@/types/report.types';
import { formatCount, formatIndiaDate, formatIndiaSpokenDate, formatNumber } from '@/utils/formatters';

const REPORT_ID = 'stock-aging';

const makeStyles = (t: ThemeTokens) => ({
  // A card per row, spaced by its own bottom margin.
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardClip: { borderRadius: radius.card, overflow: 'hidden' as const },
  barCard: { padding: space.lg, marginTop: space.xs, marginBottom: space.md },
  // Under a customer's tiles: what its Items tiles count.
  itemsByName: { ...typography.footnote, color: t.text.secondary, marginHorizontal: layout.marginCompact, marginBottom: space.xs },
  rowPressed: { backgroundColor: t.surface.cardPressed },

  // An item
  groupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  groupIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  cellContent: { flex: 1, gap: space.xxs, alignItems: 'flex-start' as const },
  cellTitle: { ...typography.headline, color: t.text.primary },
  cellSubtitle: { ...typography.subhead, color: t.text.secondary },
  footnote: { ...typography.footnote, color: t.text.secondary },
  stockInfo: { alignItems: 'flex-end' as const, flexShrink: 0 },
  stockValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
  stockLabel: { ...typography.caption1, color: t.text.secondary },
  // An opened item whose lots are rows of the list under it: the card is the top of one
  // frame and the lot rows the rest. No shadow, which would fall across the rows under it;
  // a hairline frame instead. The last lot row rounds the frame off and spaces the next card.
  cardOpen: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: t.border.divider,
  },
  cardClipOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  lineCell: {
    marginHorizontal: layout.marginCompact,
    backgroundColor: t.surface.card,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
  },
  lineCellFirst: { borderTopWidth: StyleSheet.hairlineWidth },
  lineCellLast: {
    marginBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    overflow: 'hidden' as const,
  },

  // A GRN line under an item
  lineDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
  lineRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight + space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  lineTitle: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
  lineSubtitle: { ...typography.footnote, color: t.text.secondary },
  lineStock: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
  lineDetails: { paddingBottom: space.md },
  detailDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: space.lg, marginVertical: space.xs, backgroundColor: t.border.divider },
  viewGrn: { marginTop: space.md, paddingHorizontal: space.lg },
});

const days = (count: number) => formatCount(count, 'day');
/** "1 unit", "12 units" (Gujarati: "૧ નંગ", "૧૨ નંગ"). */
const units = (count: number) => formatCount(count, 'unit');

/**
 * The figures over the rows. Two tiles count, and the red bar of the bucket card
 * shows bags: the bar still draws the server's quantities by age. The RPC's
 * items_over_365_days counts from 365 and is not shown.
 *
 * The two levels count different things, and their tiles say which (SR-04):
 * - The server's counts are of stock lines, that is lots (an item stored on two GRNs
 *   counts twice): `total_items`, and `by_bucket['364+'].item_count` too. The
 *   all-customers level has no item list (its rows are customers) and shows those
 *   figures as "Stock lots" and "Lots over 364 days", as the stock aging PDF does.
 * - A customer's own screen passes `items`, the counts of its item cards, which group
 *   the lots by item name (there is no stable item id): `count` is the "Items" tile,
 *   and `over364` the items with at least one lot in the over-364 bucket, the tile
 *   "Items over 364 days". A note under the tiles says items are counted by name.
 * So an item on two old lots is 2 lots on the overview and 1 item on its customer's
 * screen: the counts differ on purpose, and the labels never claim the same unit.
 */
function agingKpis(
  summary: { total_items: number; average_age_days: number },
  byBucket: Record<string, Pick<AgingBucketData, 'item_count'>>,
  items?: { count: number; over364: number }
): KPIItem[] {
  const average: KPIItem = {
    icon: 'calendar-clock',
    value: summary.average_age_days,
    label: tr('reports.stockAging.averageAge'),
    unit: tr('reports.stockAging.daysUnit'),
    variant: 'neutral',
  };
  if (items) {
    return [
      { icon: 'cube-outline', value: items.count, label: tr('common.items'), variant: 'primary' },
      average,
      { icon: 'alert', value: items.over364, label: tr('reports.stockAging.itemsOver364'), variant: 'warning' },
    ];
  }
  return [
    { icon: 'cube-outline', value: summary.total_items, label: tr('reports.stockAging.lots'), variant: 'primary' },
    average,
    { icon: 'alert', value: byBucket['364+']?.item_count ?? 0, label: tr('reports.stockAging.lotsOver364'), variant: 'warning' },
  ];
}

/** The Items tiles of a customer count its item cards, which group the lots by item name (agingKpis). */
function ItemsByNameNote() {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.itemsByName}>{tr('reports.stockAging.itemsByName')}</Text>;
}

function BucketCard({ byBucket }: { byBucket: AllStockAgingData['by_bucket'] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, styles.barCard]}>
      <AgingBucketBar title={tr('reports.stockAging.stockAge')} buckets={agingBucketsFrom(byBucket)} />
    </View>
  );
}

// ============================================================================
// Whose stock
// ============================================================================

export default function StockAgingScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.stockAging')} />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.stockAging')} onPick={scope.chooseCustomer} />;
    case 'customers':
      return <CustomersReport scope={scope} />;
    case 'customer':
      // Keyed by the customer, so nothing of one customer's view is carried into another's.
      return (
        <CustomerReport
          key={level.customerId}
          customerId={level.customerId}
          customerName={level.customerName}
          onChangeCustomer={scope.changeCustomer}
        />
      );
  }
}

// ============================================================================
// Every customer
// ============================================================================

const customerKey = (customer: CustomerAgingSummary) => customer.customer_id;

function CustomersReport({ scope }: { scope: ReportScope }) {
  const filters = useReportFilters(STOCK_AGING_CUSTOMERS);
  const { view } = filters.request;
  const query = useReportQuery<AllStockAgingData>({
    key: [REPORT_ID, 'customers'],
    fetch: () => getAllStockAging(),
    fallbackError: tr('reports.stockAging.loadError'),
  });
  const { data } = query;
  const rows = useMemo(() => stockAgingCustomersView(data?.by_customer ?? [], view), [data, view]);
  const kpis = useMemo(() => data && agingKpis(data.summary, data.by_bucket), [data]);
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, sort: reportPdfSort(REPORT_ID, 'customers', view.sort) }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title }),
    // The PDF does not apply the search: the person is told before the export (useReportExport).
    unappliedSearch: () => (view.words.length > 0 ? { query: filters.search, count: rows.length } : null),
  });
  const actions = useMemo(() => exportHeaderActions({ exportPdf, busy, available }), [exportPdf, busy, available]);

  const { openCustomer, lastCustomer } = scope;
  const renderRow = useCallback(
    (customer: CustomerAgingSummary) => <CustomerRow customer={customer} words={view.words} onOpen={openCustomer} />,
    [view.words, openCustomer]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.stockAging')}
      subtitle={tr('reports.shared.allCustomers')}
      actions={actions}
      filters={{ config: STOCK_AGING_CUSTOMERS, state: filters }}
      query={query}
      kpis={kpis}
      kpiPlaceholders={3}
      status={{ shown: rows.length, total: data?.by_customer.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={view.words}
      noun="customers"
      empty={{ icon: 'package-variant-closed', title: tr('reports.shared.noStockYet'), description: tr('reports.shared.noStockYetDescription') }}
      errorTitle={tr('reports.stockAging.errorTitle')}
    >
      {data && data.by_customer.length > 0 ? <BucketCard byBucket={data.by_bucket} /> : null}
      {lastCustomer && !filters.search ? (
        <ReportLastCustomer customer={lastCustomer} onPress={openCustomer} accessibilityHint={tr('reports.stockAging.opensCustomerHint')} />
      ) : null}
    </ReportScaffold>
  );
}

interface CustomerRowProps {
  customer: CustomerAgingSummary;
  words: string[];
  onOpen: (customer: ReportCustomerRef) => void;
}

const CustomerRow = memo(function CustomerRow({ customer, words, onOpen }: CustomerRowProps) {
  const styles = useThemedStyles(makeStyles);
  const bucket = bucketForDays(customer.average_age_days);
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <ReportCustomerCard
          customerId={customer.customer_id}
          title={customer.customer_name}
          highlightWords={words}
          // The average age only: the tag already gives its bucket. A long age ("Average age 245 days")
          // wraps to a second line rather than being cut (§4).
          subtitle={tr('reports.stockAging.averageAgeOf', { age: days(customer.average_age_days) })}
          subtitleLines={2}
          value={customer.total_stock}
          valueLabel={tr('reports.shared.units', { count: customer.total_stock })}
          // The tag is the bucket of the customer's average age, and says so.
          status={{ status: AGING_BUCKET_STATUS[bucket], label: tr('reports.stockAging.averageBucket', { bucket: agingBucketLabel(bucket) }) }}
          onPress={() => onOpen({ id: customer.customer_id, name: customer.customer_name })}
          accessibilityHint={tr('reports.stockAging.opensCustomerHint')}
        />
      </View>
    </View>
  );
});

// ============================================================================
// One customer's items
// ============================================================================

/**
 * The rows of one customer's list: an item card, and while it is open a row for each
 * of its lots under it (P2F-UI-2). An item can be on hundreds of lots, and drawn
 * inside its card they would all be mounted at once in one list cell; as rows of
 * their own the list draws only those on screen.
 */
type AgingListRow =
  | { kind: 'group'; key: string; group: StockAgingGroup }
  | {
      kind: 'line';
      /** The item row's key, then the lot's own: stable for the same answer. */
      key: string;
      /** The item (group key) the lot is under. */
      parentId: string;
      line: StockAgingLine;
      isFirst: boolean;
      isLast: boolean;
    };

const rowKey = (row: AgingListRow) => row.key;
const rowType = (row: AgingListRow) => row.kind;

/** An item's row and, while it is open, a row for each of its lots under it. */
function groupWithLines(group: StockAgingGroup, isOpen: boolean): AgingListRow[] {
  const key = `group:${group.key}`;
  const head: AgingListRow = { kind: 'group', key, group };
  if (!isOpen) return [head];
  return [
    head,
    ...group.lines.map((line, index) => ({
      kind: 'line' as const,
      key: `${key}|line:${line.lineKey}`,
      parentId: group.key,
      line,
      isFirst: index === 0,
      isLast: index === group.lines.length - 1,
    })),
  ];
}

/** A set with one key added or taken out. */
function toggled(set: ReadonlySet<string> | undefined, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

interface CustomerReportProps {
  customerId: string;
  customerName: string;
  onChangeCustomer?: () => void;
}

function CustomerReport({ customerId, customerName, onChangeCustomer }: CustomerReportProps) {
  const filters = useReportFilters(STOCK_AGING_CUSTOMER, { scope: customerId });
  const { view } = filters.request;
  const query = useReportQuery<StockAgingData>({
    key: [REPORT_ID, 'customer', customerId],
    fetch: () => getCustomerStockAging({ customerId }),
    fallbackError: tr('reports.stockAging.loadError'),
  });
  const { data } = query;
  const groups = useMemo(() => groupStockAgingLines(data?.items ?? []), [data]);
  // The items the search and the bucket leave; the list's rows add the lots of the open ones.
  const shown = useMemo(() => stockAgingItemsView(groups, view), [groups, view]);
  // The figures are the whole stock's, not what the search or the bucket leaves. Both item tiles
  // count item cards (`groups`, before any search or filter), not the server's stock lines: the
  // oldest-stock tile counts the items with at least one lot over 364 days (the bar beside it
  // shows the bags those lots hold).
  const kpis = useMemo(
    () =>
      data &&
      agingKpis(data.summary, data.by_bucket, { count: groups.length, over364: groups.filter(group => group.oldestBucket === 'over-364').length }),
    [data, groups]
  );
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({
      report: REPORT_ID,
      customer_id: customerId,
      sort: reportPdfSort(REPORT_ID, 'customer', view.sort),
      // The Stock age choice: the server keeps the same lines (one older than the field is asked first, useReportExport).
      ...(view.bucket !== 'all' && { bucket: view.bucket }),
    }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
    // The PDF does not apply the search: the person is told before the export (useReportExport).
    unappliedSearch: () => (view.words.length > 0 ? { query: filters.search, count: shown.length } : null),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline' as const, label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      ...exportHeaderActions({ exportPdf, busy, available }),
    ],
    [onChangeCustomer, exportPdf, busy, available]
  );

  // Which items are open, and which lines of each: a line is one item on one GRN, so two
  // lines of the same GRN open separately. Each item's open lines are their own set, so
  // opening a line draws only its item again.
  const reduceMotion = useReducedMotion();
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [openLines, setOpenLines] = useState<Readonly<Record<string, ReadonlySet<string>>>>({});
  const toggleGroup = useCallback(
    (key: string) => {
      animateExpand(reduceMotion);
      setOpenGroups(previous => toggled(previous, key));
    },
    [reduceMotion]
  );
  const toggleLine = useCallback(
    (group: string, line: string) => {
      animateExpand(reduceMotion);
      setOpenLines(previous => ({ ...previous, [group]: toggled(previous[group], line) }));
    },
    [reduceMotion]
  );

  const rows = useMemo(() => shown.flatMap(group => groupWithLines(group, openGroups.has(group.key))), [shown, openGroups]);

  const renderRow = useCallback(
    (row: AgingListRow) =>
      row.kind === 'group' ? (
        <ItemGroupRow group={row.group} words={view.words} expanded={openGroups.has(row.group.key)} onToggle={toggleGroup} />
      ) : (
        <StockLineRow
          line={row.line}
          groupKey={row.parentId}
          words={view.words}
          expanded={openLines[row.parentId]?.has(row.line.lineKey) ?? false}
          isFirst={row.isFirst}
          isLast={row.isLast}
          onToggle={toggleLine}
        />
      ),
    [view.words, openGroups, openLines, toggleGroup, toggleLine]
  );
  const extraData = useMemo(() => ({ words: view.words, openGroups, openLines }), [view.words, openGroups, openLines]);

  return (
    <ReportScaffold
      title={tr('reports.titles.stockAging')}
      subtitle={customerName || undefined}
      actions={actions}
      filters={{ config: STOCK_AGING_CUSTOMER, state: filters }}
      query={query}
      kpis={kpis}
      kpiPlaceholders={3}
      // Items, not rows: the lots of an open item are rows too.
      status={{ shown: shown.length, total: groups.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={rowKey}
      getRowType={rowType}
      extraData={extraData}
      noun="items"
      empty={{ icon: 'package-variant-closed', title: tr('reports.shared.noStockForCustomer'), description: tr('reports.shared.noStockForCustomerDescription') }}
      errorTitle={tr('reports.stockAging.errorTitle')}
    >
      {data && data.items.length > 0 ? (
        <>
          <ItemsByNameNote />
          <BucketCard byBucket={data.by_bucket} />
        </>
      ) : null}
    </ReportScaffold>
  );
}

/** Status tag with an age, in the colour, icon and words of the age's bucket. */
function AgeTag({ bucket, label }: { bucket: AgingBucketId; label: string }) {
  return <StatusTag status={AGING_BUCKET_STATUS[bucket]} label={label} />;
}

const grnTitle = (line: StockAgingLine) =>
  [tr('reports.shared.grnNumber', { number: formatIdentifier(line.gr_no) }), line.rack ? tr('reports.shared.rack', { rack: String(line.rack) }) : null]
    .filter(Boolean)
    .join(' · ');

interface ItemGroupRowProps {
  group: StockAgingGroup;
  /** Lower-cased search words, shown in bold. */
  words: string[];
  /** Open: its lots are the list's rows under it (see AgingListRow). */
  expanded: boolean;
  onToggle: (groupKey: string) => void;
}

const ItemGroupRow = memo(function ItemGroupRow({ group, words, expanded, onToggle }: ItemGroupRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const grns = formatCount(group.lines.length, 'GRN');
  const oldest = tr('reports.stockAging.oldestAge', { age: days(group.oldestDays) });
  // A GRN number the search found inside a closed item is named on the card (§14.6).
  const found = !expanded && words.length > 0
    ? group.lines.map(line => tr('reports.shared.grnNumber', { number: formatIdentifier(line.gr_no) })).filter(text => matchesAnyWord(text, words)).slice(0, 3)
    : [];

  return (
    <View style={[styles.card, expanded && styles.cardOpen]}>
      <View style={[styles.cardClip, expanded && styles.cardClipOpen]}>
        <Pressable
          style={({ pressed }) => [styles.groupHeader, pressed && styles.rowPressed]}
          onPress={() => onToggle(group.key)}
          accessibilityRole="button"
          accessibilityLabel={[
            tr('reports.stockAging.groupA11y', { name: group.itemName, grns, units: units(group.totalStock), age: days(group.oldestDays) }),
            ...found,
          ].join(', ')}
          accessibilityState={{ expanded }}
        >
          <View style={styles.groupIcon}>
            <Icon name="cube-outline" size={iconSize.lg} color={t.brand.tint} />
          </View>
          <View style={styles.cellContent}>
            <HighlightedText style={styles.cellTitle} numberOfLines={2} text={group.itemName} words={words} />
            <Text style={styles.cellSubtitle}>{grns}</Text>
            {found.length > 0 ? <HighlightedText style={styles.footnote} text={found.join(' · ')} words={words} /> : null}
            <AgeTag bucket={group.oldestBucket} label={oldest} />
          </View>
          <View style={styles.stockInfo}>
            <Text style={styles.stockValue}>{formatNumber(group.totalStock)}</Text>
            <Text style={styles.stockLabel}>{tr('reports.shared.units', { count: group.totalStock })}</Text>
          </View>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>
      </View>
    </View>
  );
});

interface StockLineRowProps {
  line: StockAgingLine;
  groupKey: string;
  words: string[];
  expanded: boolean;
  /** The first lot under its item: draws the line under the item's card. */
  isFirst: boolean;
  /** The last lot under its item: rounds the frame off and spaces the next card. */
  isLast: boolean;
  onToggle: (groupKey: string, lineKey: string) => void;
}

const openGrn = (grnId: string) => {
  if (grnId) router.push(`/grn-details/${grnId}`);
};

/** One lot of an open item, as a row of the list under the item's card. */
const StockLineRow = memo(function StockLineRow({ line, groupKey, words, expanded, isFirst, isLast, onToggle }: StockLineRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const title = grnTitle(line);
  const received = formatIndiaDate(line.grn_date);
  const dispatch = line.dispatch_info;

  return (
    <View style={[styles.lineCell, isFirst && styles.lineCellFirst, isLast ? styles.lineCellLast : styles.lineDivider]}>
      <Pressable
        style={({ pressed }) => [styles.lineRow, pressed && styles.rowPressed]}
        onPress={() => onToggle(groupKey, line.lineKey)}
        accessibilityRole="button"
        accessibilityLabel={tr('reports.stockAging.entryA11y', { title, date: formatIndiaSpokenDate(line.grn_date), age: days(line.aging_days), units: units(line.current_stock) })}
        accessibilityState={{ expanded }}
      >
        <View style={styles.cellContent}>
          {/* A document number is never cut short (§4). */}
          <HighlightedText style={styles.lineTitle} text={title} words={words} />
          <Text style={styles.lineSubtitle}>{tr('reports.shared.receivedOn', { date: received })}</Text>
          <AgeTag bucket={lineBucket(line)} label={tr('reports.stockAging.ageOld', { age: days(line.aging_days) })} />
        </View>
        <Text style={styles.lineStock}>{formatNumber(line.current_stock)}</Text>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
      </Pressable>

      {expanded ? (
        <View style={styles.lineDetails}>
          {/* Key-value cells stack the key over the value at large text (§11.4). */}
          <KeyValueCell keyLabel={tr('reports.stockAging.receivedQuantity')} value={formatNumber(line.original_qty)} />
          <KeyValueCell keyLabel={tr('common.packageMark')} value={line.package_mark || '—'} />
          {dispatch ? (
            <>
              <View style={styles.detailDivider} />
              <KeyValueCell
                keyLabel={tr('reports.stockAging.dispatched')}
                value={tr('reports.stockAging.dispatchedIn', {
                  quantity: formatNumber(dispatch.total_dispatched),
                  dispatches: formatCount(dispatch.dispatch_count, 'dispatch', 'dispatches'),
                })}
              />
              {dispatch.last_dispatch_date ? (
                <KeyValueCell keyLabel={tr('reports.stockAging.lastDispatch')} value={formatIndiaDate(dispatch.last_dispatch_date)} />
              ) : null}
              {dispatch.avg_days_between_dispatches ? (
                <KeyValueCell keyLabel={tr('reports.stockAging.averageBetweenDispatches')} value={days(Math.round(dispatch.avg_days_between_dispatches))} />
              ) : null}
            </>
          ) : null}
          <View style={styles.viewGrn}>
            <Button type="secondary" size="fullWidth" onPress={() => openGrn(line.grn_id)}>
              {tr('reports.stockAging.viewGrn', { number: formatIdentifier(line.gr_no) })}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
});
