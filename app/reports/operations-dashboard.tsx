/**
 * Operations dashboard (S1): the facility's figures for a period, across every
 * customer, for administrators and supervisors.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10): useReportFilters
 * holds the period (the filter bar's period chip, shared by every report),
 * useReportQuery the data, and ReportScaffold draws every state. The figures
 * come in two groups that say what they cover (SR-14): the period's GRNs and
 * dispatches ("In 15 Jun – 12 Oct"), and what is true now whatever the period
 * ("Right now": pending orders, customers with stock, the stock). The stock's
 * total weight is not shown: total weights are shown nowhere (§12.3).
 * Under them: the period's daily averages (its total over every day of it that
 * has happened, quiet days included), then the latest GRNs and dispatches of any
 * date, as the server sends them.
 * There is no search, sort or customer. The server answers a role it refuses
 * in the body of its answer; that shows as the failed state with the reason.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { ReportEmptyState, ReportHeader, ReportScaffold } from '@/components/reports';
import type { ReportKpiGroup } from '@/components/reports/ReportScaffold';
import { OPERATIONS_DASHBOARD } from '@/features/filters/configs/reports/operationsDashboard';
import { periodDays } from '@/features/filters/configs/reports/shared';
import { describeDateRange } from '@/features/filters/filterModel';
import { longestPeriodAction } from '@/features/reports/reportActions';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier, localizeDigits } from '@/i18n';
import { getOperationsDashboard } from '@/services/reporting';
import { fontWeight, iconSize, layout, radius, space, trackedText, typography, type ThemeTokens } from '@/theme/tokens';
import type { OperationsDashboardData, RecentActivityItem } from '@/types/report.types';
import { formatIndiaDate, formatRelativeTime, todayInIST } from '@/utils/formatters';

const REPORT_ID = 'operations-dashboard';

const oneDecimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },

  card: {
    marginHorizontal: layout.marginCompact,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardClip: { borderRadius: radius.card, overflow: 'hidden' as const },
  averagesCard: { marginTop: space.sm },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  cardHeaderIcon: {
    width: layout.avatar.sm,
    height: layout.avatar.sm,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  cardHeaderTitle: { ...typography.headline, color: t.text.primary, flex: 1 },
  averages: { flexDirection: 'row' as const, paddingVertical: space.xl, paddingHorizontal: space.lg },
  average: { flex: 1, alignItems: 'center' as const },
  averageLabel: { ...typography.footnote, color: t.text.secondary, marginBottom: space.s6, textAlign: 'center' as const },
  averageValue: { ...typography.title2, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'center' as const },
  averageDivider: { width: 1, marginHorizontal: space.md, backgroundColor: t.border.divider },

  sectionHeading: {
    paddingTop: space.xl,
    paddingBottom: space.sm,
    paddingHorizontal: layout.marginCompact + space.xs,
  },
  sectionHeadingText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
  },

  // A recent GRN or dispatch: read-only, so no chevron and no pressed state.
  activity: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  activityCard: { marginBottom: space.sm },
  activityIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.neutral.background,
  },
  activityContent: { flex: 1, gap: space.xxs },
  activityRef: { ...typography.headline, color: t.text.primary },
  activitySubtitle: { ...typography.subhead, color: t.text.secondary },
  activityTime: { ...typography.caption1, color: t.text.secondary },
});

// ============================================================================
// Who may see it
// ============================================================================

export default function OperationsDashboardScreen() {
  // The app offers it to managers only (src/config/roles.ts); the server decides again.
  const { isManager } = useRoleBasedAccess();
  return isManager ? <OperationsDashboardReport /> : <StaffOnly />;
}

function StaffOnly() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <ReportHeader title={tr('reports.titles.operationsDashboard')} />
      <ReportEmptyState icon="lock-outline" message={tr('reports.operations.staffOnly')} description={tr('reports.operations.staffOnlyDescription')} />
    </View>
  );
}

// ============================================================================
// The dashboard
// ============================================================================

/**
 * A day's average over the period, to one decimal: the sum of the daily counts over
 * `days`, every day of the period that has happened (`periodDays`). The server sends
 * only the days that had events, so the number of points is not the number of days:
 * seven GRNs on one day of a week are 1 a day, not 7.
 *
 * An average that is not zero but too small for one decimal reads "<0.1", never "0":
 * five GRNs in 120 days are not none.
 */
const average = (points: { count: number }[], days: number) => {
  const value = points.reduce((sum, point) => sum + point.count, 0) / days;
  const shown = oneDecimal.format(value);
  return localizeDigits(value > 0 && shown === '0' ? `<${oneDecimal.format(0.1)}` : shown);
};

const activityKey = (activity: RecentActivityItem, index: number) => `${activity.type}-${activity.ref}-${index}`;

function OperationsDashboardReport() {
  const filters = useReportFilters(OPERATIONS_DASHBOARD);
  const { period } = filters.request;
  const query = useReportQuery<OperationsDashboardData>({
    key: [REPORT_ID, period.from, period.to],
    fetch: async () => {
      const result = await getOperationsDashboard({ fromDate: period.from, toDate: period.to });
      // The server refuses a role in the body of its answer; the service names that STAFF_ONLY.
      return result.error === 'STAFF_ONLY' ? { ...result, success: false, message: tr('reports.operations.staffOnlyError') } : result;
    },
    fallbackError: tr('reports.operations.loadError'),
  });
  const { data } = query;

  // The server counts GRNs and dispatches over the period; pending orders, the customers with
  // stock and the stock are today's, whatever the period. Each group says which. The answer
  // also carries the stock's total weight (`total_stock_weight`); it is not drawn.
  const kpiGroups = useMemo<ReportKpiGroup[] | undefined>(() => {
    if (!data) return undefined;
    const { kpis: figures } = data;
    return [
      {
        title: tr('reports.operations.inPeriod', { period: describeDateRange(period) }),
        items: [
          { icon: 'package-down', value: figures.total_grns, label: tr('reports.operations.grns'), variant: 'primary' },
          { icon: 'truck-delivery-outline', value: figures.total_dispatches, label: tr('reports.operations.dispatches'), variant: 'primary' },
        ],
      },
      {
        title: tr('reports.operations.rightNow'),
        items: [
          { icon: 'clipboard-list-outline', value: figures.pending_orders, label: tr('reports.operations.pendingOrders'), variant: 'neutral' },
          { icon: 'account-group-outline', value: figures.active_customers, label: tr('reports.operations.activeCustomers'), variant: 'neutral' },
          { icon: 'warehouse', value: figures.total_stock_qty, label: tr('reports.operations.totalStock'), variant: 'primary' },
        ],
      },
    ];
  }, [data, period]);

  const renderRow = useCallback((activity: RecentActivityItem) => <ActivityRow activity={activity} />, []);

  return (
    <ReportScaffold
      title={tr('reports.titles.operationsDashboard')}
      filters={{ config: OPERATIONS_DASHBOARD, state: filters }}
      query={query}
      kpiGroups={kpiGroups}
      // Two figures of the period and three of right now.
      kpiPlaceholders={5}
      status={{ range: period }}
      rows={data?.recent_activity ?? []}
      renderRow={renderRow}
      keyExtractor={activityKey}
      noun="GRNs"
      empty={{ icon: 'history', title: tr('reports.operations.noActivity'), action: longestPeriodAction(period, filters.setField) }}
      errorTitle={tr('reports.operations.errorTitle')}
    >
      {data ? (
        <>
          <PeriodAverages grnDaily={data.trends.grn_daily} dispatchDaily={data.trends.dispatch_daily} days={periodDays(period, todayInIST())} />
          {/* The server sends the latest GRNs and dispatches of any date, not those of the period. */}
          <SectionHeading title={tr('reports.operations.latestActivity')} />
        </>
      ) : null}
    </ReportScaffold>
  );
}

function PeriodAverages({ grnDaily, dispatchDaily, days }: { grnDaily: { count: number }[]; dispatchDaily: { count: number }[]; days: number }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const figures = [
    { label: tr('reports.operations.grnsPerDay'), value: average(grnDaily, days) },
    { label: tr('reports.operations.dispatchesPerDay'), value: average(dispatchDaily, days) },
  ];
  return (
    <View style={[styles.card, styles.averagesCard]}>
      <View style={styles.cardClip}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderIcon}>
            <Icon name="chart-line" size={iconSize.md} color={t.brand.tint} />
          </View>
          <Text style={styles.cardHeaderTitle} accessibilityRole="header">
            {tr('reports.operations.periodAverages')}
          </Text>
        </View>
        <View style={styles.averages}>
          {figures.map((figure, index) => (
            <React.Fragment key={figure.label}>
              {index > 0 ? <View style={styles.averageDivider} /> : null}
              <View style={styles.average} accessible accessibilityLabel={tr('reports.shared.labelValue', figure)}>
                <Text style={styles.averageLabel}>{figure.label}</Text>
                <Text style={styles.averageValue}>{figure.value}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

function SectionHeading({ title }: { title: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionHeadingText} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** The day an activity of a day or more ago fell on in India, as every date of a report is read. */
const indiaShortDate = (time: Date) => formatIndiaDate(time, 'short');

/**
 * The server sends the time of an activity as a timestamp. It is shown as "2 hr ago"
 * or a date; a value that is not a date (already worded by the server) is shown as it is.
 */
const activityTime = (value: string | null | undefined): string => {
  if (!value) return '';
  return Number.isNaN(new Date(value).getTime()) ? value : formatRelativeTime(value, indiaShortDate);
};

/**
 * One of the latest GRNs or dispatches. The server sends no document id with it, so it
 * opens nothing: no chevron, no button role, read as one element.
 */
const ActivityRow = memo(function ActivityRow({ activity }: { activity: RecentActivityItem }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const isGrn = activity.type === 'grn';
  const type = isGrn ? tr('common.grn') : tr('common.dispatch');
  const time = activityTime(activity.time);
  return (
    <View
      style={[styles.card, styles.activityCard]}
      accessible
      accessibilityLabel={tr('reports.operations.activityA11y', { type, ref: formatIdentifier(activity.ref), customer: activity.customer, time })}
    >
      <View style={styles.activity}>
        <View style={styles.activityIcon}>
          <Icon name={isGrn ? 'package-down' : 'truck-delivery-outline'} size={iconSize.md} color={t.status.neutral.text} />
        </View>
        <View style={styles.activityContent}>
          {/* A document number is never cut short (§4). */}
          <Text style={styles.activityRef}>{formatIdentifier(activity.ref)}</Text>
          <Text style={styles.activitySubtitle} numberOfLines={2}>
            {tr('reports.operations.activitySubtitle', { type, customer: activity.customer })}
          </Text>
          {/* On its own line: beside the number it took the room the number needs. */}
          {time ? <Text style={styles.activityTime}>{time}</Text> : null}
        </View>
      </View>
    </View>
  );
});
