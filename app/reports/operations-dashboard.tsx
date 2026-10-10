/**
 * Operations Dashboard Report Screen (S1)
 *
 * Staff-only dashboard showing cross-customer KPIs and recent activity.
 * Layout follows the report pattern in docs/STYLE_GUIDE.md §14.10: period
 * selector, KPI grid, then cards with the activity list and period averages.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  ReportHeader,
  KPIGrid,
  PeriodSelector,
  ReportEmptyState,
  getDateRangeForPeriod,
  type KPIItem,
} from '@/components/reports';
import { getOperationsDashboard } from '@/services/reporting';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import type {
  OperationsDashboardData,
  RecentActivityItem,
  ReportPeriod,
} from '@/types/report.types';
import { formatDate, formatNumber } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import { t as tr, localizeDigits } from '@/i18n';

const logger = createLogger('OperationsDashboard');

// A function, not a constant: the text follows the app language (docs/I18N.md rule 2).
const loadError = () => tr('reports.operations.loadError');

const oneDecimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

// ============================================================================
// Styles
// ============================================================================
const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background.base,
    },
    loadingContainer: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: space.xxxl,
    },
    cardContainer: {
      marginTop: space.lg,
      marginHorizontal: layout.marginCompact,
    },
    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      ...t.shadow[2],
    },
    cardInner: {
      borderRadius: radius.card,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    cardHeaderIcon: {
      width: layout.avatar.sm,
      height: layout.avatar.sm,
      borderRadius: radius.button,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.brand.subtle,
    },
    cardHeaderTitle: {
      ...typography.headline,
      color: t.text.primary,
      flex: 1,
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      minHeight: layout.objectCellMinHeight,
      gap: space.md,
    },
    activityDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    activityIcon: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.pill,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.status.neutral.background,
    },
    activityContent: {
      flex: 1,
      justifyContent: 'center',
    },
    activityRef: {
      ...typography.headline,
      color: t.text.primary,
    },
    activityCustomer: {
      ...typography.subhead,
      color: t.text.secondary,
      marginTop: space.xxs,
    },
    activityTime: {
      ...typography.caption1,
      color: t.text.secondary,
    },
    trendBody: {
      flexDirection: 'row',
      paddingVertical: space.xl,
      paddingHorizontal: space.lg,
    },
    trendItem: {
      flex: 1,
      alignItems: 'center',
    },
    trendLabel: {
      ...typography.footnote,
      color: t.text.secondary,
      marginBottom: space.s6,
      textAlign: 'center',
    },
    trendValue: {
      ...typography.title2,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    trendDivider: {
      width: StyleSheet.hairlineWidth,
      marginHorizontal: space.md,
      backgroundColor: t.border.divider,
    },
    emptyActivity: {
      ...typography.subhead,
      color: t.text.secondary,
      padding: space.lg,
    },
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// Card Header
// ============================================================================
interface CardHeaderProps {
  icon: string;
  title: string;
  styles: Styles;
  t: ThemeTokens;
}

const CardHeader: React.FC<CardHeaderProps> = ({ icon, title, styles, t }) => (
  <View style={styles.cardHeader}>
    <View style={styles.cardHeaderIcon}>
      <Icon name={icon} size={iconSize.md} color={t.brand.tint} />
    </View>
    <Text style={styles.cardHeaderTitle} accessibilityRole="header">
      {title}
    </Text>
  </View>
);

// ============================================================================
// Object Cell - Activity Item
// ============================================================================
interface ActivityItemProps {
  activity: RecentActivityItem;
  isLast?: boolean;
  styles: Styles;
  t: ThemeTokens;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, isLast = false, styles, t }) => {
  const isGrn = activity.type === 'grn';
  const typeLabel = isGrn ? tr('common.grn') : tr('common.dispatch');

  return (
    <View
      style={[styles.activityItem, !isLast && styles.activityDivider]}
      accessible
      accessibilityLabel={tr('reports.operations.activityA11y', {
        type: typeLabel,
        ref: activity.ref,
        customer: activity.customer,
        time: activity.time,
      })}
    >
      <View style={styles.activityIcon}>
        <Icon
          name={isGrn ? 'package-down' : 'truck-delivery-outline'}
          size={iconSize.md}
          color={t.status.neutral.text}
        />
      </View>

      <View style={styles.activityContent}>
        <Text style={styles.activityRef} numberOfLines={2}>
          {activity.ref}
        </Text>
        <Text style={styles.activityCustomer} numberOfLines={1}>
          {tr('reports.operations.activitySubtitle', { type: typeLabel, customer: activity.customer })}
        </Text>
      </View>

      <Text style={styles.activityTime}>{activity.time}</Text>
    </View>
  );
};

export default function OperationsDashboardScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Role-based access (J12 fix)
  const { isStaff } = useRoleBasedAccess();

  const [data, setData] = useState<OperationsDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('last120days');
  const [dateRange, setDateRange] = useState(() => getDateRangeForPeriod('last120days'));

  const fetchData = useCallback(async (showRefreshIndicator = false) => {
    if (!isStaff) {
      setError(tr('reports.operations.staffOnlyError'));
      setIsLoading(false);
      return;
    }

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await getOperationsDashboard({
        fromDate: dateRange.from,
        toDate: dateRange.to,
      });

      if (response.success && response.data) {
        setData(response.data);
      } else {
        logger.warn('Load failed', { error: response.error });
        setError(loadError());
      }
    } catch (err) {
      logger.error('Error fetching data', err);
      setError(loadError());
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isStaff, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  const handlePeriodChange = useCallback((period: ReportPeriod, range: { from: string; to: string }) => {
    setSelectedPeriod(period);
    setDateRange(range);
  }, []);

  // Build KPI items from dashboard data
  const operationsKPIs: KPIItem[] = useMemo(() => {
    if (!data?.kpis) return [];

    const kpis = data.kpis;
    return [
      { icon: 'package-down', value: kpis.total_grns, label: tr('reports.operations.grns'), variant: 'primary' },
      { icon: 'truck-delivery-outline', value: kpis.total_dispatches, label: tr('reports.operations.dispatches'), variant: 'primary' },
      { icon: 'clipboard-list-outline', value: kpis.pending_orders, label: tr('reports.operations.pendingOrders'), variant: 'neutral' },
      { icon: 'account-group-outline', value: kpis.active_customers, label: tr('reports.operations.activeCustomers'), variant: 'neutral' },
    ];
  }, [data?.kpis]);

  const inventoryKPIs: KPIItem[] = useMemo(() => {
    if (!data?.kpis) return [];

    const kpis = data.kpis;
    return [
      { icon: 'warehouse', value: formatNumber(kpis.total_stock_qty), label: tr('reports.operations.totalStock'), variant: 'primary' },
      {
        icon: 'scale-balance',
        value: formatNumber(kpis.total_stock_weight, 2),
        label: tr('reports.operations.totalWeight'),
        variant: 'primary',
        unit: tr('reports.operations.kg'),
      },
    ];
  }, [data?.kpis]);

  const subtitle = tr('reports.period.dateRange', { from: formatDate(dateRange.from), to: formatDate(dateRange.to) });

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[t.brand.tint]}
      tintColor={t.brand.tint}
    />
  );

  // Access denied state
  if (!isStaff) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.operationsDashboard')} />
        <ReportEmptyState
          icon="lock-outline"
          message={tr('reports.operations.staffOnly')}
          description={tr('reports.operations.staffOnlyDescription')}
        />
      </View>
    );
  }

  // Loading skeleton
  if (isLoading && !data) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.operationsDashboard')} />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'package-down', value: '-', label: tr('reports.operations.grns'), variant: 'primary' },
              { icon: 'truck-delivery-outline', value: '-', label: tr('reports.operations.dispatches'), variant: 'primary' },
              { icon: 'clipboard-list-outline', value: '-', label: tr('reports.operations.pendingOrders'), variant: 'neutral' },
              { icon: 'account-group-outline', value: '-', label: tr('reports.operations.activeCustomers'), variant: 'neutral' },
            ]}
            isLoading={true}
            compact
          />
        </View>
      </View>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <View style={styles.container}>
        <ReportHeader title={tr('reports.titles.operationsDashboard')} />
        <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />
        <ReportEmptyState
          icon="alert-circle-outline"
          tone="error"
          message={tr('reports.shared.errorTitle')}
          description={error}
          actionLabel={tr('common.retry')}
          onAction={() => fetchData()}
        />
      </View>
    );
  }

  const average = (points: { count: number }[]) =>
    localizeDigits(
      points.length > 0 ? oneDecimal.format(points.reduce((sum, d) => sum + d.count, 0) / points.length) : '0'
    );

  return (
    <View style={styles.container}>
      <ReportHeader title={tr('reports.titles.operationsDashboard')} subtitle={subtitle} />
      <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={handlePeriodChange} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* Operations KPIs */}
        <KPIGrid items={operationsKPIs} isLoading={isLoading} compact />

        {/* Inventory KPIs */}
        <KPIGrid items={inventoryKPIs} isLoading={isLoading} compact />

        {/* Period averages */}
        {data?.trends && (
          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardInner}>
                <CardHeader icon="chart-line" title={tr('reports.operations.periodAverages')} styles={styles} t={t} />
                <View style={styles.trendBody}>
                  <View style={styles.trendItem} accessible accessibilityLabel={tr('reports.shared.labelValue', {
                      label: tr('reports.operations.grnsPerDay'),
                      value: average(data.trends.grn_daily),
                    })}>
                    <Text style={styles.trendLabel}>{tr('reports.operations.grnsPerDay')}</Text>
                    <Text style={styles.trendValue}>{average(data.trends.grn_daily)}</Text>
                  </View>
                  <View style={styles.trendDivider} />
                  <View
                    style={styles.trendItem}
                    accessible
                    accessibilityLabel={tr('reports.shared.labelValue', {
                      label: tr('reports.operations.dispatchesPerDay'),
                      value: average(data.trends.dispatch_daily),
                    })}
                  >
                    <Text style={styles.trendLabel}>{tr('reports.operations.dispatchesPerDay')}</Text>
                    <Text style={styles.trendValue}>{average(data.trends.dispatch_daily)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Recent Activity */}
        {data && (
          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardInner}>
                <CardHeader icon="history" title={tr('reports.operations.recentActivity')} styles={styles} t={t} />
                {data.recent_activity && data.recent_activity.length > 0 ? (
                  data.recent_activity.map((activity, index) => (
                    <ActivityItem
                      key={`${activity.ref}-${index}`}
                      activity={activity}
                      isLast={index === data.recent_activity.length - 1}
                      styles={styles}
                      t={t}
                    />
                  ))
                ) : (
                  <Text style={styles.emptyActivity}>
                    {tr('reports.operations.noActivity')}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
