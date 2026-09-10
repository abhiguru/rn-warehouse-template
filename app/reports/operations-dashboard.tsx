/**
 * Operations Dashboard Report Screen (S1)
 *
 * Staff-only dashboard showing cross-customer KPIs and recent activity.
 * 100% SAP Fiori compliant following design specs.
 *
 * @see design/sap-fiori-specs/01-object-cell.md - Object Cell pattern
 * @see design/sap-fiori-specs/13-card.md - Card structure
 * @see design/sap-fiori-specs/14-section-header.md - Section Header pattern
 * @see design/sap-fiori-specs/18-tags-badges.md - Tags/Badges
 * @see design/sap-fiori-specs/12-empty-state.md - Empty State pattern
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
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
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import type {
  OperationsDashboardData,
  RecentActivityItem,
  ReportPeriod,
} from '@/types/report.types';
import { formatNumber, formatWeight, formatDate } from '@/utils/formatters';

// ============================================================================
// SAP Fiori Design Tokens - Static dimensions/typography (no colors)
// @see src/theme/index.ts - FioriColors interface
// @see src/theme/fioriColors.ts - Dynamic colors via useFioriColors hook
// ============================================================================
const FIORI_STATIC = {
  // Dimensions from Fiori spec
  dimensions: {
    objectCellMinHeight: 72,
    objectCellImageSize: 44,
    objectCellImageRadius: 10,
    cardCornerRadius: 12,
    cardPadding: 16,
    cardBodyPadding: 16,
    sectionHeaderHeight: 32,
    touchTarget: 44,
    iconButtonSize: 24,
    activityIconSize: 36,
  },
  // Typography from Fiori spec
  typography: {
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    title: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 18,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 16,
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    trendValue: {
      fontSize: 22,
      fontWeight: '700' as const,
    },
  },
};

// ============================================================================
// Fiori Card Header Component
// @see design/sap-fiori-specs/13-card.md
// ============================================================================
interface FioriCardHeaderProps {
  icon: string;
  iconColor: string;
  iconBgColor: string;
  title: string;
}

const FioriCardHeader: React.FC<FioriCardHeaderProps> = ({
  icon,
  iconColor,
  iconBgColor,
  title,
}) => {
  const fiori = useFioriColors();
  return (
    <View style={[
      styles.fioriCardHeader,
      {
        backgroundColor: fiori.colors.cardBackground,
        borderBottomColor: fiori.colors.divider,
      },
    ]}>
      <View style={[styles.fioriCardHeaderIcon, { backgroundColor: iconBgColor }]}>
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.fioriCardHeaderTitle, { color: fiori.colors.textPrimary }]}>
        {title}
      </Text>
    </View>
  );
};

// ============================================================================
// Fiori Object Cell - Activity Item
// @see design/sap-fiori-specs/01-object-cell.md
// ============================================================================
interface ActivityItemProps {
  activity: RecentActivityItem;
  isLast?: boolean;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, isLast = false }) => {
  const fiori = useFioriColors();
  const isGrn = activity.type === 'grn';

  return (
    <View style={[
      styles.fioriActivityItem,
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: fiori.colors.divider },
    ]}>
      {/* A. Detail Image (36pt for compact cells) */}
      <View
        style={[
          styles.fioriActivityIcon,
          { backgroundColor: isGrn ? fiori.colors.successLight : fiori.colors.infoLight },
        ]}
      >
        <Icon
          name={isGrn ? 'package-variant' : 'truck-fast'}
          size={18}
          color={isGrn ? fiori.colors.success : fiori.colors.info}
        />
      </View>

      {/* C. Main Content */}
      <View style={styles.fioriActivityContent}>
        <Text style={[styles.fioriActivityRef, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
          {activity.ref}
        </Text>
        <Text style={[styles.fioriActivityCustomer, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
          {activity.customer}
        </Text>
      </View>

      {/* E. Attributes - Time */}
      <Text style={[styles.fioriActivityTime, { color: fiori.colors.textSecondary }]}>{activity.time}</Text>
    </View>
  );
};

export default function OperationsDashboardScreen() {
  const fiori = useFioriColors();

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
      setError('This report is for staff only');
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
        setError(response.error || 'Failed to load operations dashboard');
      }
    } catch (err) {
      console.error('[OperationsDashboard] Error fetching data:', err);
      setError('An unexpected error occurred');
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
      {
        icon: 'package-variant',
        value: kpis.total_grns,
        label: 'GRNs',
        variant: 'success',
      },
      {
        icon: 'truck-fast',
        value: kpis.total_dispatches,
        label: 'Dispatches',
        variant: 'secondary',
      },
      {
        icon: 'clipboard-list',
        value: kpis.pending_orders,
        label: 'Pending Orders',
        variant: 'warning',
      },
      {
        icon: 'account-group',
        value: kpis.active_customers,
        label: 'Active Customers',
        variant: 'primary',
      },
    ];
  }, [data?.kpis]);

  const inventoryKPIs: KPIItem[] = useMemo(() => {
    if (!data?.kpis) return [];

    const kpis = data.kpis;
    return [
      {
        icon: 'cube-outline',
        value: formatNumber(kpis.total_stock_qty),
        label: 'Total Stock',
        variant: 'primary',
      },
      {
        icon: 'scale-balance',
        value: formatNumber(kpis.total_stock_weight, 2),
        label: 'Total Weight',
        variant: 'accent',
        unit: 'kg',
      },
    ];
  }, [data?.kpis]);

  const getSubtitle = (): string => {
    return `${formatDate(dateRange.from, 'short')} - ${formatDate(dateRange.to, 'short')}`;
  };

  // Access denied state
  if (!isStaff) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Operations Dashboard" />
        <ReportEmptyState
          icon="lock-outline"
          message="Access Denied"
          description="This report is available for staff members only."
        />
      </View>
    );
  }

  // Loading skeleton
  if (isLoading && !data) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Operations Dashboard" />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'package-variant', value: '-', label: 'GRNs', variant: 'success' },
              { icon: 'truck-fast', value: '-', label: 'Dispatches', variant: 'secondary' },
              { icon: 'clipboard-list', value: '-', label: 'Pending Orders', variant: 'warning' },
              { icon: 'account-group', value: '-', label: 'Active Customers', variant: 'primary' },
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
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Operations Dashboard" />
        <PeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
        />
        <ReportEmptyState
          icon="alert-circle-outline"
          message="Failed to load data"
          description={error}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
      <ReportHeader title="Operations Dashboard" subtitle={getSubtitle()} />
      <PeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodChange={handlePeriodChange}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[fiori.colors.tint]}
            tintColor={fiori.colors.tint}
          />
        }
      >
        {/* Operations KPIs */}
        <KPIGrid items={operationsKPIs} isLoading={isLoading} compact />

        {/* Inventory KPIs */}
        <KPIGrid items={inventoryKPIs} isLoading={isLoading} compact />

        {/* Recent Activity - Fiori List Card */}
        {data?.recent_activity && data.recent_activity.length > 0 && (
          <View style={styles.fioriCardContainer}>
            <View style={[
              styles.fioriCard,
              {
                backgroundColor: fiori.colors.cardBackground,
                borderColor: fiori.colors.divider,
              },
            ]}>
              {/* Card Header */}
              <FioriCardHeader
                icon="history"
                iconColor={fiori.colors.tint}
                iconBgColor={fiori.colors.tintLight}
                title="Recent Activity"
              />
              {/* Card Body - Activity List */}
              <View style={styles.fioriCardBody}>
                {data.recent_activity.map((activity, index) => (
                  <ActivityItem
                    key={`${activity.ref}-${index}`}
                    activity={activity}
                    isLast={index === data.recent_activity.length - 1}
                  />
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Trend Summary - Fiori Data Table Card */}
        {data?.trends && (
          <View style={styles.fioriCardContainer}>
            <View style={[
              styles.fioriCard,
              {
                backgroundColor: fiori.colors.cardBackground,
                borderColor: fiori.colors.divider,
              },
            ]}>
              {/* Card Header */}
              <FioriCardHeader
                icon="trending-up"
                iconColor={fiori.colors.success}
                iconBgColor={fiori.colors.successLight}
                title="Period Trends"
              />
              {/* Card Body - Trend Data */}
              <View style={styles.fioriTrendBody}>
                <View style={styles.fioriTrendItem}>
                  <Text style={[styles.fioriTrendLabel, { color: fiori.colors.textSecondary }]}>
                    Daily Avg GRNs
                  </Text>
                  <Text style={[styles.fioriTrendValue, { color: fiori.colors.textPrimary }]}>
                    {data.trends.grn_daily.length > 0
                      ? (data.trends.grn_daily.reduce((sum, d) => sum + d.count, 0) / data.trends.grn_daily.length).toFixed(1)
                      : '0'}
                  </Text>
                </View>
                <View style={[styles.fioriTrendDivider, { backgroundColor: fiori.colors.divider }]} />
                <View style={styles.fioriTrendItem}>
                  <Text style={[styles.fioriTrendLabel, { color: fiori.colors.textSecondary }]}>
                    Daily Avg Dispatches
                  </Text>
                  <Text style={[styles.fioriTrendValue, { color: fiori.colors.textPrimary }]}>
                    {data.trends.dispatch_daily.length > 0
                      ? (data.trends.dispatch_daily.reduce((sum, d) => sum + d.count, 0) / data.trends.dispatch_daily.length).toFixed(1)
                      : '0'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// SAP Fiori Compliant Styles
// ============================================================================
// @see design/sap-fiori-specs/01-object-cell.md
// @see design/sap-fiori-specs/13-card.md
// @see design/sap-fiori-specs/14-section-header.md
// ============================================================================
const styles = StyleSheet.create({
  // =========================================================================
  // Layout
  // =========================================================================
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // =========================================================================
  // Fiori Card Container (13-card.md)
  // =========================================================================
  fioriCardContainer: {
    marginTop: 16,
    marginHorizontal: FIORI_STATIC.dimensions.cardPadding,
  },
  fioriCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },

  // =========================================================================
  // Fiori Card Header (13-card.md - B. Header)
  // =========================================================================
  fioriCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fioriCardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fioriCardHeaderTitle: {
    fontSize: FIORI_STATIC.typography.cardTitle.fontSize,
    fontWeight: FIORI_STATIC.typography.cardTitle.fontWeight,
  },

  // =========================================================================
  // Fiori Card Body (13-card.md - C. Body)
  // =========================================================================
  fioriCardBody: {
    paddingVertical: 4,
  },

  // =========================================================================
  // Fiori Activity Item (Object Cell - 01-object-cell.md)
  // =========================================================================
  fioriActivityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  fioriActivityIcon: {
    width: FIORI_STATIC.dimensions.activityIconSize,
    height: FIORI_STATIC.dimensions.activityIconSize,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fioriActivityContent: {
    flex: 1,
    justifyContent: 'center',
  },
  fioriActivityRef: {
    fontSize: 15,
    fontWeight: '500',
  },
  fioriActivityCustomer: {
    fontSize: FIORI_STATIC.typography.footnote.fontSize,
    marginTop: 2,
  },
  fioriActivityTime: {
    fontSize: FIORI_STATIC.typography.caption.fontSize,
  },

  // =========================================================================
  // Fiori Trend Card Body
  // =========================================================================
  fioriTrendBody: {
    flexDirection: 'row',
    paddingVertical: 20,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
  },
  fioriTrendItem: {
    flex: 1,
    alignItems: 'center',
  },
  fioriTrendLabel: {
    fontSize: FIORI_STATIC.typography.caption.fontSize,
    marginBottom: 6,
    textAlign: 'center',
  },
  fioriTrendValue: {
    fontSize: FIORI_STATIC.typography.trendValue.fontSize,
    fontWeight: FIORI_STATIC.typography.trendValue.fontWeight,
  },
  fioriTrendDivider: {
    width: 1,
    marginHorizontal: 12,
  },
});
