/**
 * Operations dashboard (S1): the facility's figures for a period, across every
 * customer, for administrators and supervisors.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10): useReportFilters
 * holds the period (the filter bar's period chip, shared by every report),
 * useReportQuery the data, and ReportScaffold draws every state. Under the
 * figures: the period's daily averages, then the recent GRNs and dispatches.
 * There is no search, sort or customer. The server answers a role it refuses
 * in the body of its answer; that shows as the failed state with the reason.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReportEmptyState, ReportHeader, ReportScaffold, type KPIItem } from '@/components/reports';
import { OPERATIONS_DASHBOARD } from '@/features/filters/configs/reports/operationsDashboard';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier, localizeDigits } from '@/i18n';
import { getOperationsDashboard } from '@/services/reporting';
import { fontWeight, iconSize, layout, radius, space, trackedText, typography, type ThemeTokens } from '@/theme/tokens';
import type { OperationsDashboardData, RecentActivityItem } from '@/types/report.types';
import { formatNumber, formatRelativeTime } from '@/utils/formatters';

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

/** The average of a day's counts over the period, to one decimal. */
const average = (points: { count: number }[]) =>
  localizeDigits(points.length > 0 ? oneDecimal.format(points.reduce((sum, point) => sum + point.count, 0) / points.length) : '0');

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

  const kpis = useMemo<KPIItem[] | undefined>(() => {
    if (!data) return undefined;
    const { kpis: figures } = data;
    return [
      { icon: 'package-down', value: figures.total_grns, label: tr('reports.operations.grns'), variant: 'primary' },
      { icon: 'truck-delivery-outline', value: figures.total_dispatches, label: tr('reports.operations.dispatches'), variant: 'primary' },
      { icon: 'clipboard-list-outline', value: figures.pending_orders, label: tr('reports.operations.pendingOrders'), variant: 'neutral' },
      { icon: 'account-group-outline', value: figures.active_customers, label: tr('reports.operations.activeCustomers'), variant: 'neutral' },
      { icon: 'warehouse', value: figures.total_stock_qty, label: tr('reports.operations.totalStock'), variant: 'primary' },
      {
        icon: 'scale-balance',
        value: formatNumber(figures.total_stock_weight, 2),
        label: tr('reports.operations.totalWeight'),
        variant: 'primary',
        unit: tr('reports.operations.kg'),
      },
    ];
  }, [data]);

  const renderRow = useCallback((activity: RecentActivityItem) => <ActivityRow activity={activity} />, []);

  return (
    <ReportScaffold
      title={tr('reports.titles.operationsDashboard')}
      filters={{ config: OPERATIONS_DASHBOARD, state: filters }}
      query={query}
      kpis={kpis}
      kpiPlaceholders={6}
      status={{ range: period }}
      rows={data?.recent_activity ?? []}
      renderRow={renderRow}
      keyExtractor={activityKey}
      noun="GRNs"
      empty={{ icon: 'history', title: tr('reports.operations.noActivity') }}
      errorTitle={tr('reports.operations.errorTitle')}
    >
      {data ? (
        <>
          <PeriodAverages grnDaily={data.trends.grn_daily} dispatchDaily={data.trends.dispatch_daily} />
          <SectionHeading title={tr('reports.operations.recentActivity')} />
        </>
      ) : null}
    </ReportScaffold>
  );
}

function PeriodAverages({ grnDaily, dispatchDaily }: { grnDaily: { count: number }[]; dispatchDaily: { count: number }[] }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const figures = [
    { label: tr('reports.operations.grnsPerDay'), value: average(grnDaily) },
    { label: tr('reports.operations.dispatchesPerDay'), value: average(dispatchDaily) },
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

/**
 * The server sends the time of an activity as a timestamp. It is shown as "2 hr ago"
 * or a date; a value that is not a date (already worded by the server) is shown as it is.
 */
const activityTime = (value: string | null | undefined): string => {
  if (!value) return '';
  return Number.isNaN(new Date(value).getTime()) ? value : formatRelativeTime(value);
};

/**
 * A recent GRN or dispatch. The server sends no document id with it, so it
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
