/**
 * Dispatch activity report (C3): the dispatches of a period, with the items
 * on each and the GRN each item left from.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10): useReportScope says
 * whose dispatches, useReportFilters holds the period, search and sort,
 * useReportQuery the data, and ReportScaffold draws every state. A warehouse
 * role sees every customer and opens one by pushing this route with
 * `?customerId=`, so the phone's back button and the header's agree.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ReportCustomerCard,
  ReportCustomerPicker,
  ReportDateHeading,
  ReportLastCustomer,
  ReportNoCustomer,
  ReportScaffold,
  type KPIItem,
  type ReportHeaderAction,
} from '@/components/reports';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import { isLongestPeriod, type ReportPeriod } from '@/features/filters/configs/reports';
import {
  DISPATCH_ACTIVITY_CUSTOMER,
  DISPATCH_ACTIVITY_CUSTOMERS,
  dispatchCustomersView,
  dispatchRecordsView,
} from '@/features/filters/configs/reports/dispatchActivity';
import { reportPdfSort } from '@/features/reports/reportPdfSort';
import { reportById } from '@/features/reports/reportRegistry';
import { exportHeaderActions, longestPeriodAction } from '@/features/reports/reportActions';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope, type ReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier } from '@/i18n';
import { getAllDispatchActivity, getCustomerDispatchActivity } from '@/services/reporting';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { AllDispatchActivityData, CustomerDispatchRow, DispatchActivityData, DispatchActivityRecord, DispatchItemDetail } from '@/types/report.types';
import { formatCount, formatDate, formatNumber } from '@/utils/formatters';

const REPORT_ID = 'dispatch-activity';

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

  // The card's head: the part that shows the items, and beside it the control that opens the dispatch.
  head: { flexDirection: 'row' as const, alignItems: 'stretch' as const },
  toggle: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    gap: space.md,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  objectIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  objectContent: { flex: 1, gap: space.xxs },
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  footnote: { ...typography.footnote, color: t.text.secondary },
  figures: { alignItems: 'flex-end' as const },
  figureValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
  figureLabel: { ...typography.caption1, color: t.text.secondary },
  openButton: {
    width: touchTarget,
    minHeight: touchTarget,
    marginRight: space.xs,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // Item rows inside a dispatch card (no shadow: card on card)
  items: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.divider },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
    backgroundColor: t.background.base,
  },
  itemRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
  itemContent: { flex: 1 },
  itemTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  itemTitle: { ...typography.subhead, fontWeight: fontWeight.medium, color: t.text.primary, flexShrink: 1 },
  itemFootnote: { ...typography.footnote, color: t.text.secondary, marginTop: space.xxs },
  itemFigures: { alignItems: 'flex-end' as const },
  itemQtyRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: space.xxs },
  itemQty: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  itemSecondary: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
  // Neutral tag for the package mark (guide §13.5 InfoChip)
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    alignSelf: 'flex-start' as const,
    backgroundColor: t.status.neutral.background,
  },
  tagText: { ...typography.caption1, fontWeight: fontWeight.semibold, color: t.status.neutral.text },
});

// ============================================================================
// Whose dispatches
// ============================================================================

export default function DispatchActivityScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.dispatchActivity')} />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.dispatchActivity')} onPick={scope.chooseCustomer} />;
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

/** "No dispatches in this period", and a longer period to try unless there is none. */
const emptyState = (period: ReportPeriod, oneCustomer: boolean) => ({
  icon: 'truck-delivery-outline' as const,
  title: tr('reports.dispatchActivity.emptyTitle'),
  description: isLongestPeriod(period)
    ? undefined
    : tr(oneCustomer ? 'reports.dispatchActivity.emptyCustomerDescription' : 'reports.dispatchActivity.emptyDescription'),
});

// ============================================================================
// Every customer
// ============================================================================

const customerKey = (customer: CustomerDispatchRow) => customer.customer_id;

function CustomersReport({ scope }: { scope: ReportScope }) {
  const filters = useReportFilters(DISPATCH_ACTIVITY_CUSTOMERS);
  const { period, view } = filters.request;
  const query = useReportQuery<AllDispatchActivityData>({
    key: [REPORT_ID, 'customers', period.from, period.to],
    fetch: () => getAllDispatchActivity({ fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.dispatchActivity.loadError'),
  });
  const { data } = query;
  const rows = useMemo(() => dispatchCustomersView(data?.by_customer ?? [], view), [data, view]);
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'truck-delivery-outline', value: data.summary.total_dispatches, label: tr('reports.customerActivity.dispatches'), variant: 'primary' },
        { icon: 'package-variant', value: data.summary.total_quantity, label: tr('reports.dispatchActivity.bagsDispatched'), variant: 'secondary' },
      ],
    [data]
  );

  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, from: period.from, to: period.to, sort: reportPdfSort(REPORT_ID, 'customers', view.sort) }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title }),
    // The PDF does not apply the search: the person is told before the export (useReportExport).
    unappliedSearch: () => (view.words.length > 0 ? { query: filters.search, count: rows.length } : null),
  });
  const actions = useMemo(() => exportHeaderActions({ exportPdf, busy, available }), [exportPdf, busy, available]);

  const { openCustomer, lastCustomer } = scope;
  const renderRow = useCallback(
    (customer: CustomerDispatchRow) => <CustomerRow customer={customer} words={view.words} onOpen={openCustomer} />,
    [view.words, openCustomer]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.dispatchActivity')}
      subtitle={tr('reports.shared.allCustomers')}
      actions={actions}
      filters={{ config: DISPATCH_ACTIVITY_CUSTOMERS, state: filters }}
      query={query}
      kpis={kpis}
      status={{ range: period, shown: rows.length, total: data?.by_customer.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={view.words}
      noun="customers"
      empty={{ ...emptyState(period, false), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.dispatchActivity.errorTitle')}
    >
      {lastCustomer && !filters.search ? (
        <ReportLastCustomer customer={lastCustomer} onPress={openCustomer} accessibilityHint={tr('reports.dispatchActivity.customerHint')} />
      ) : null}
    </ReportScaffold>
  );
}

interface CustomerRowProps {
  customer: CustomerDispatchRow;
  words: string[];
  onOpen: (customer: ReportCustomerRef) => void;
}

const CustomerRow = memo(function CustomerRow({ customer, words, onOpen }: CustomerRowProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <ReportCustomerCard
          customerId={customer.customer_id}
          title={customer.customer_name}
          highlightWords={words}
          subtitle={formatCount(customer.dispatch_count, 'dispatch', 'dispatches')}
          value={customer.total_quantity}
          valueLabel={tr('reports.dispatchActivity.bagUnit', { count: customer.total_quantity })}
          onPress={() => onOpen({ id: customer.customer_id, name: customer.customer_name })}
          accessibilityHint={tr('reports.dispatchActivity.customerHint')}
        />
      </View>
    </View>
  );
});

// ============================================================================
// One customer's dispatches
// ============================================================================

/** A dispatch card, or the date over the dispatches of that day (only while sorted by date). */
type DispatchRow = { kind: 'date'; date: string } | { kind: 'dispatch'; dispatch: DispatchActivityRecord; key: string };

const dayOf = (dispatch: DispatchActivityRecord) => (dispatch.disp_date ?? '').slice(0, 10);
/** A dispatch's own id; the number and date for a row the server sent without one. */
const dispatchKey = (dispatch: DispatchActivityRecord) => dispatch.disp_id || `${dispatch.disp_no}-${dispatch.disp_date}`;

function withDateHeadings(dispatches: DispatchActivityRecord[]): DispatchRow[] {
  const rows: DispatchRow[] = [];
  dispatches.forEach((dispatch, index) => {
    if (index === 0 || dayOf(dispatches[index - 1]) !== dayOf(dispatch)) rows.push({ kind: 'date', date: dayOf(dispatch) });
    rows.push({ kind: 'dispatch', dispatch, key: dispatchKey(dispatch) });
  });
  return rows;
}

const dispatchRowKey = (row: DispatchRow) => (row.kind === 'date' ? `date-${row.date}` : `dispatch-${row.key}`);
const dispatchRowType = (row: DispatchRow) => row.kind;
const openDispatch = (dispatchId: string) => {
  if (dispatchId) router.push(`/dispatch-details/${dispatchId}`);
};
const openGrn = (grnId: string) => {
  if (grnId) router.push(`/grn-details/${grnId}`);
};

interface CustomerReportProps {
  customerId: string;
  customerName: string;
  onChangeCustomer?: () => void;
}

function CustomerReport({ customerId, customerName, onChangeCustomer }: CustomerReportProps) {
  // Date, Dispatch number and Bags. A sort by weight that this phone remembers from an earlier
  // version is no longer offered, so the report opens on its default (useReportFilters → currentSort).
  const filters = useReportFilters(DISPATCH_ACTIVITY_CUSTOMER, { scope: customerId });
  const { period, view } = filters.request;
  const query = useReportQuery<DispatchActivityData>({
    key: [REPORT_ID, 'customer', customerId, period.from, period.to],
    fetch: () => getCustomerDispatchActivity({ customerId, fromDate: period.from, toDate: period.to }),
    fallbackError: tr('reports.dispatchActivity.loadError'),
  });
  const { data } = query;
  const dispatches = useMemo(() => dispatchRecordsView(data?.dispatches ?? [], view), [data, view]);
  // Headings by day only make sense while the dispatches are in date order (§14.5).
  const byDate = view.sort?.field === 'date';
  const rows = useMemo<DispatchRow[]>(
    () => (byDate ? withDateHeadings(dispatches) : dispatches.map(dispatch => ({ kind: 'dispatch', dispatch, key: dispatchKey(dispatch) }))),
    [dispatches, byDate]
  );
  // The figures are the whole period's, not what the search leaves.
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'truck-delivery-outline', value: data.summary.total_dispatches, label: tr('reports.customerActivity.dispatches'), variant: 'secondary' },
        { icon: 'package-variant', value: data.summary.total_quantity, label: tr('reports.dispatchActivity.bagsDispatched'), variant: 'primary' },
      ],
    [data]
  );
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({
      report: REPORT_ID,
      customer_id: customerId,
      from: period.from,
      to: period.to,
      sort: reportPdfSort(REPORT_ID, 'customer', view.sort),
    }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
    // The PDF does not apply the search: the person is told before the export (useReportExport).
    unappliedSearch: () => (view.words.length > 0 ? { query: filters.search, count: dispatches.length } : null),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline' as const, label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      ...exportHeaderActions({ exportPdf, busy, available }),
    ],
    [onChangeCustomer, exportPdf, busy, available]
  );

  // Which cards show their items. It stays with this screen, so a new sort or search keeps it.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((key: string) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const renderRow = useCallback(
    (row: DispatchRow) =>
      row.kind === 'date' ? (
        <ReportDateHeading date={row.date} />
      ) : (
        <DispatchCard
          dispatch={row.dispatch}
          rowKey={row.key}
          words={view.words}
          showDate={!byDate}
          expanded={expanded.has(row.key)}
          onToggle={toggle}
          onOpen={openDispatch}
          onOpenGrn={openGrn}
        />
      ),
    [view.words, byDate, expanded, toggle]
  );
  const extraData = useMemo(() => [view.words, expanded], [view.words, expanded]);

  return (
    <ReportScaffold
      title={tr('reports.titles.dispatchActivity')}
      subtitle={customerName || undefined}
      actions={actions}
      filters={{ config: DISPATCH_ACTIVITY_CUSTOMER, state: filters }}
      query={query}
      kpis={kpis}
      status={{ range: period, shown: dispatches.length, total: data?.dispatches.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={dispatchRowKey}
      getRowType={dispatchRowType}
      extraData={extraData}
      noun="dispatches"
      empty={{ ...emptyState(period, true), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.dispatchActivity.errorTitle')}
    />
  );
}

/**
 * The items a search found on a dispatch whose items are not shown: only for
 * words the card's own text does not already show (§14.6).
 */
function hiddenMatches(dispatch: DispatchActivityRecord, words: string[], shown: string[]): string[] {
  const unseen = words.filter(word => !shown.some(text => text.toLowerCase().includes(word)));
  if (unseen.length === 0) return [];
  const found = new Set<string>();
  for (const item of dispatch.items ?? []) {
    if (item.item_name && matchesAnyWord(item.item_name, unseen)) found.add(item.item_name);
  }
  return [...found].slice(0, 3);
}

interface DispatchCardProps {
  dispatch: DispatchActivityRecord;
  rowKey: string;
  /** Lower-cased search words, shown in bold. */
  words: string[];
  /** The date is on the card when no heading above it gives it. */
  showDate: boolean;
  expanded: boolean;
  onToggle: (rowKey: string) => void;
  onOpen: (dispatchId: string) => void;
  onOpenGrn: (grnId: string) => void;
}

const DispatchCard = memo(function DispatchCard({ dispatch, rowKey, words, showDate, expanded, onToggle, onOpen, onOpenGrn }: DispatchCardProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const title = tr('reports.customerActivity.dispatchNumber', { number: formatIdentifier(dispatch.disp_no) });
  const supervisor = dispatch.supervisor_name || '—';
  const items = dispatch.items ?? [];
  // No weight: the one the server sends for a dispatch is a total (bags × the weight of one bag),
  // and total weights are not shown (style guide §12.3).
  // With the items open, the search's words show in them; closed, the card names the items it found.
  const matched = expanded ? [] : hiddenMatches(dispatch, words, [title, supervisor]);
  const label = [
    tr('reports.dispatchActivity.cardLabel', {
      number: formatIdentifier(dispatch.disp_no),
      date: formatDate(dispatch.disp_date),
      supervisor,
      bags: formatCount(dispatch.total_qty, 'bag'),
    }),
    ...matched,
  ]
    .filter(Boolean)
    .join(', ');

  // A document number is never cut short (§4).
  const titleText = <HighlightedText style={styles.title} text={title} words={words} />;
  const supervisorText = <HighlightedText style={styles.subtitle} numberOfLines={2} text={supervisor} words={words} />;
  const dateText = showDate ? <Text style={styles.footnote}>{formatDate(dispatch.disp_date, 'short')}</Text> : null;
  const matchedText =
    matched.length > 0 ? <HighlightedText style={styles.footnote} numberOfLines={2} text={matched.join(' · ')} words={words} /> : null;
  const bags = (
    <View style={styles.figures}>
      <Text style={styles.figureValue}>{formatNumber(dispatch.total_qty)}</Text>
      <Text style={styles.figureLabel}>{tr('reports.dispatchActivity.bagUnit', { count: dispatch.total_qty })}</Text>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        {/* Two targets side by side, never one inside the other: the head shows the items, the chevron opens the dispatch. */}
        <View style={styles.head}>
          <Pressable
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
            onPress={() => onToggle(rowKey)}
            accessibilityRole="button"
            // One element for a screen reader, the date included: a heading above the card is not read with it.
            accessibilityLabel={label}
            accessibilityHint={tr(expanded ? 'reports.dispatchActivity.hideItemsHint' : 'reports.dispatchActivity.showItemsHint')}
            accessibilityState={{ expanded }}
          >
            <View style={styles.objectIcon}>
              <Icon name="truck-delivery-outline" size={iconSize.md} color={t.brand.tint} />
            </View>
            <View style={styles.objectContent}>
              {titleText}
              {supervisorText}
              {dateText}
              {matchedText}
            </View>
            {bags}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
          {dispatch.disp_id ? (
            <Pressable
              style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
              onPress={() => onOpen(dispatch.disp_id)}
              accessibilityRole="button"
              accessibilityLabel={tr('reports.dispatchActivity.openDispatch', { number: formatIdentifier(dispatch.disp_no) })}
            >
              <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
            </Pressable>
          ) : null}
        </View>

        {expanded && items.length > 0 ? (
          <View style={styles.items}>
            {items.map((item, index) => (
              <ItemRow key={`${rowKey}-${index}`} item={item} words={words} isLast={index === items.length - 1} onOpenGrn={onOpenGrn} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
});

interface ItemRowProps {
  item: DispatchItemDetail;
  words: string[];
  isLast: boolean;
  onOpenGrn: (grnId: string) => void;
}

function ItemRow({ item, words, isLast, onOpenGrn }: ItemRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const grn = tr('reports.shared.grnNumber', { number: formatIdentifier(item.source_grn) });
  // Numbers are compared, never used as the left side of &&: 0 would be drawn as text.
  const ofQuantity = Number(item.orig_qty) > 0 && item.orig_qty !== item.qty ? formatNumber(item.orig_qty) : null;
  const bags = formatCount(item.qty, 'bag');
  // Everything the row shows, in the order it shows it. The line's weight is not among it: the
  // server sends the line's total (bags × the weight of one bag), and total weights are not shown.
  const label = [
    item.item_name,
    ofQuantity ? tr('reports.dispatchActivity.bagsOf', { bags, quantity: ofQuantity }) : bags,
    grn,
    item.rack ? tr('reports.shared.rack', { rack: item.rack }) : null,
    item.package_mark ? tr('reports.shared.markA11y', { mark: item.package_mark }) : null,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View style={styles.itemContent}>
        <View style={styles.itemTitleRow}>
          <HighlightedText style={styles.itemTitle} numberOfLines={2} text={item.item_name} words={words} />
          {item.package_mark ? (
            <View style={styles.tag}>
              <Text style={styles.tagText} maxFontSizeMultiplier={1.6}>
                {item.package_mark}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.itemFootnote} numberOfLines={1}>
          {[grn, item.rack].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.itemFigures}>
        <View style={styles.itemQtyRow}>
          <Text style={styles.itemQty}>{formatNumber(item.qty)}</Text>
          {ofQuantity ? <Text style={styles.itemSecondary}>{tr('reports.dispatchActivity.ofQuantity', { quantity: ofQuantity })}</Text> : null}
        </View>
      </View>
      {item.source_grn_id ? <Icon name="chevron-right" size={iconSize.sm} color={t.icon.secondary} /> : null}
    </>
  );

  if (item.source_grn_id) {
    const grnId = item.source_grn_id;
    return (
      <Pressable
        style={({ pressed }) => [styles.itemRow, !isLast && styles.itemRowBorder, pressed && styles.pressed]}
        onPress={() => onOpenGrn(grnId)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={tr('reports.dispatchActivity.sourceGrnHint')}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.itemRow, !isLast && styles.itemRowBorder]} accessible accessibilityLabel={label}>
      {content}
    </View>
  );
}
