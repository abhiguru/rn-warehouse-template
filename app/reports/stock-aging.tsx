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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
import { formatCount, formatIndiaDate, formatNumber } from '@/utils/formatters';

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
  groupLines: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.divider },

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

/**
 * The figures over the rows. The KPI for the oldest stock counts the items of the
 * bar's own over-364 bucket and says so ("Items over 364 days"), so it and the
 * red bar always agree. The RPC's items_over_365_days counts from 365 and is not shown.
 */
function agingKpis(summary: { total_items: number; average_age_days: number }, byBucket: Record<string, Pick<AgingBucketData, 'item_count'>>): KPIItem[] {
  return [
    { icon: 'cube-outline', value: summary.total_items, label: tr('common.items'), variant: 'primary' },
    { icon: 'calendar-clock', value: summary.average_age_days, label: tr('reports.stockAging.averageAge'), unit: tr('reports.stockAging.daysUnit'), variant: 'neutral' },
    { icon: 'alert', value: byBucket['364+']?.item_count ?? 0, label: tr('reports.stockAging.itemsOver364'), variant: 'warning' },
  ];
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
          valueLabel={tr('reports.shared.units')}
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

const groupKey = (group: StockAgingGroup) => group.key;

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
  const filters = useReportFilters(STOCK_AGING_CUSTOMER);
  const { view } = filters.request;
  const query = useReportQuery<StockAgingData>({
    key: [REPORT_ID, 'customer', customerId],
    fetch: () => getCustomerStockAging({ customerId }),
    fallbackError: tr('reports.stockAging.loadError'),
  });
  const { data } = query;
  const groups = useMemo(() => groupStockAgingLines(data?.items ?? []), [data]);
  const rows = useMemo(() => stockAgingItemsView(groups, view), [groups, view]);
  // The figures are the whole stock's, not what the search or the bucket leaves.
  const kpis = useMemo(() => data && agingKpis(data.summary, data.by_bucket), [data]);
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, customer_id: customerId, sort: reportPdfSort(REPORT_ID, 'customer', view.sort) }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline', label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
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

  const renderRow = useCallback(
    (group: StockAgingGroup) => (
      <ItemGroupRow
        group={group}
        words={view.words}
        expanded={openGroups.has(group.key)}
        openLines={openLines[group.key]}
        onToggle={toggleGroup}
        onToggleLine={toggleLine}
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
      status={{ shown: rows.length, total: groups.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={groupKey}
      extraData={extraData}
      noun="items"
      empty={{ icon: 'package-variant-closed', title: tr('reports.shared.noStockForCustomer'), description: tr('reports.shared.noStockForCustomerDescription') }}
      errorTitle={tr('reports.stockAging.errorTitle')}
    >
      {data && data.items.length > 0 ? <BucketCard byBucket={data.by_bucket} /> : null}
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
  expanded: boolean;
  openLines: ReadonlySet<string> | undefined;
  onToggle: (groupKey: string) => void;
  onToggleLine: (groupKey: string, lineKey: string) => void;
}

const ItemGroupRow = memo(function ItemGroupRow({ group, words, expanded, openLines, onToggle, onToggleLine }: ItemGroupRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const grns = formatCount(group.lines.length, 'GRN');
  const oldest = tr('reports.stockAging.oldestAge', { age: days(group.oldestDays) });
  // A GRN number the search found inside a closed item is named on the card (§14.6).
  const found = !expanded && words.length > 0
    ? group.lines.map(line => tr('reports.shared.grnNumber', { number: formatIdentifier(line.gr_no) })).filter(text => matchesAnyWord(text, words)).slice(0, 3)
    : [];

  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <Pressable
          style={({ pressed }) => [styles.groupHeader, pressed && styles.rowPressed]}
          onPress={() => onToggle(group.key)}
          accessibilityRole="button"
          accessibilityLabel={[
            tr('reports.stockAging.groupA11y', { name: group.itemName, grns, units: formatNumber(group.totalStock), age: days(group.oldestDays) }),
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
            <Text style={styles.stockLabel}>{tr('reports.shared.units')}</Text>
          </View>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>

        {expanded ? (
          <View style={styles.groupLines}>
            {group.lines.map((line, index) => (
              <StockLineRow
                key={line.lineKey}
                line={line}
                groupKey={group.key}
                words={words}
                expanded={openLines?.has(line.lineKey) ?? false}
                isLast={index === group.lines.length - 1}
                onToggle={onToggleLine}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
});

interface StockLineRowProps {
  line: StockAgingLine;
  groupKey: string;
  words: string[];
  expanded: boolean;
  isLast: boolean;
  onToggle: (groupKey: string, lineKey: string) => void;
}

const openGrn = (grnId: string) => {
  if (grnId) router.push(`/grn-details/${grnId}`);
};

const StockLineRow = memo(function StockLineRow({ line, groupKey, words, expanded, isLast, onToggle }: StockLineRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const title = grnTitle(line);
  const received = formatIndiaDate(line.grn_date, 'short');
  const dispatch = line.dispatch_info;

  return (
    <View style={!isLast ? styles.lineDivider : undefined}>
      <Pressable
        style={({ pressed }) => [styles.lineRow, pressed && styles.rowPressed]}
        onPress={() => onToggle(groupKey, line.lineKey)}
        accessibilityRole="button"
        accessibilityLabel={tr('reports.stockAging.entryA11y', { title, date: received, age: days(line.aging_days), units: formatNumber(line.current_stock) })}
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
