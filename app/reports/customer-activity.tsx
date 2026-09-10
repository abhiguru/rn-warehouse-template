/**
 * Customer Activity Report Screen (C6)
 *
 * Consolidated customer-centric view of all activity: GRN, Dispatch, Stock, Invoice.
 * Level 1: Customer list with activity summary
 * Level 2: Customer dashboard with charts and quick access cards
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  RefreshControl,
  LayoutAnimation,
  Dimensions,
  Modal,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-gifted-charts';
import { ReportHeader, KPIGrid, ReportEmptyState, type KPIItem } from '@/components/reports';
import {
  getAllCustomerActivity,
  getCustomerActivityDetail,
} from '@/services/reporting/customer-activity-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import theme from '@/theme';
import { useFioriColors } from '@/theme/fioriColors';
import type {
  AllCustomerActivityData,
  CustomerActivityRow,
  CustomerActivityDetailData,
  MonthlyTrendPoint,
  CustomerActivityPeriod,
} from '@/types/report.types';
import { formatNumber, formatCurrency, formatDate } from '@/utils/formatters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;

// ============================================================================
// SAP Fiori Design Tokens (Static - dimensions and typography only)
// ============================================================================
const FIORI_STATIC = {
  dimensions: {
    objectCellMinHeight: 72,
    objectCellImageSize: 44,
    objectCellImageRadius: 10,
    cardCornerRadius: 12,
    cardPadding: 16,
    sectionHeaderHeight: 32,
    touchTarget: 44,
  },
  typography: {
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    title: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
    subtitle: { fontSize: 14, lineHeight: 18 },
    footnote: { fontSize: 13, lineHeight: 16 },
    caption: { fontSize: 12, lineHeight: 16 },
  },
};

// Chart colors
const CHART_COLORS = {
  grn: theme.colors.blue[400],
  dispatch: theme.colors.orange[500],
  stock: theme.colors.green[500],
  invoice: theme.colors.yellow[500],
};

// Aging bucket color mapping - returns function to get dynamic colors
const getAgingColorConfig = (fiori: ReturnType<typeof useFioriColors>) => ({
  '0-120': { bg: fiori.colors.successLight, text: fiori.colors.success, icon: 'check-circle' },
  '121-240': { bg: fiori.colors.warningLight, text: fiori.colors.warning, icon: 'clock-outline' },
  '241-364': { bg: fiori.colors.warningLight, text: fiori.colors.warning, icon: 'alert' },
  '364+': { bg: fiori.colors.destructiveLight, text: fiori.colors.destructive, icon: 'alert-circle' },
});

const getAgingColor = (bucket: string, fiori: ReturnType<typeof useFioriColors>) => {
  const colors = getAgingColorConfig(fiori);
  return colors[bucket as keyof typeof colors] || colors['0-120'];
};

// Period options - standardized across all reports
const PERIOD_OPTIONS: { id: CustomerActivityPeriod; label: string; days: number }[] = [
  { id: 'last120days', label: '120d', days: 120 },
  { id: 'last240days', label: '240d', days: 240 },
  { id: 'last364days', label: '364d', days: 364 },
  { id: 'last420days', label: '420d', days: 420 },
];

// ============================================================================
// Helper Functions
// ============================================================================

function getRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function formatShortMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(month, 10) - 1] || monthStr;
}

// ============================================================================
// Components
// ============================================================================

const FioriSectionHeader: React.FC<{ title: string; onToggle?: () => void; isExpanded?: boolean }> = ({
  title,
  onToggle,
  isExpanded,
}) => {
  const fiori = useFioriColors();
  return (
    <Pressable
      style={styles.fioriSectionHeader}
      onPress={onToggle}
      disabled={!onToggle}
    >
      <Text style={[styles.fioriSectionHeaderText, { color: fiori.colors.textSecondary }]}>{title.toUpperCase()}</Text>
      {onToggle && (
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={fiori.colors.textSecondary}
        />
      )}
    </Pressable>
  );
};

// Period Selector Component
interface PeriodSelectorProps {
  selected: CustomerActivityPeriod;
  onSelect: (period: CustomerActivityPeriod) => void;
}

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ selected, onSelect }) => {
  const fiori = useFioriColors();
  return (
    <View style={[styles.periodSelectorContainer, { backgroundColor: fiori.colors.cardBackground, borderBottomColor: fiori.colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.periodSelectorContent}
      >
        {PERIOD_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.periodChip,
              { backgroundColor: fiori.colors.backgroundGrouped, borderColor: fiori.colors.border },
              selected === option.id && { backgroundColor: fiori.colors.tint, borderColor: fiori.colors.tint },
            ]}
            onPress={() => onSelect(option.id)}
          >
            <Text
              style={[
                styles.periodChipText,
                { color: fiori.colors.textSecondary },
                selected === option.id && { color: fiori.colors.iconOnPrimary },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

// Customer Card for list view (Level 1)
interface CustomerCardProps {
  customer: CustomerActivityRow;
  onPress: () => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onPress }) => {
  const fiori = useFioriColors();
  return (
    <Pressable
      style={({ pressed }) => [styles.customerCard, pressed && { backgroundColor: fiori.colors.cardBackgroundPressed }]}
      onPress={onPress}
    >
      <View style={[styles.customerAvatar, { backgroundColor: fiori.colors.tintLight }]}>
        <Icon name="account-outline" size={22} color={fiori.colors.tint} />
      </View>
      <View style={styles.customerContent}>
        <Text style={[styles.customerName, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
          {customer.customer_name}
        </Text>
        <Text style={[styles.customerSubtitle, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
          {customer.customer_city || 'N/A'} {customer.last_activity_date ? `• ${getRelativeTime(customer.last_activity_date)}` : ''}
        </Text>
        <View style={styles.customerMetrics}>
          <Text style={[styles.customerMetricItem, { color: fiori.colors.textTertiary }]}>
            <Icon name="file-document-outline" size={12} color={fiori.colors.textTertiary} /> {customer.total_grns}
          </Text>
          <Text style={[styles.customerMetricItem, { color: fiori.colors.textTertiary }]}>
            <Icon name="truck-delivery-outline" size={12} color={fiori.colors.textTertiary} /> {customer.total_dispatches}
          </Text>
          <Text style={[styles.customerMetricItem, { color: fiori.colors.textTertiary }]}>
            {formatCurrency(customer.total_invoice_amount)}
          </Text>
        </View>
      </View>
      <View style={styles.customerStock}>
        <Text style={[styles.customerStockValue, { color: fiori.colors.tint }]}>{formatNumber(customer.current_stock)}</Text>
        <Text style={[styles.customerStockLabel, { color: fiori.colors.textSecondary }]}>stock</Text>
      </View>
      <Icon name="chevron-right" size={20} color={fiori.colors.textSecondary} />
    </Pressable>
  );
};

// Stock Trend Line Chart Component with Fullscreen Modal
interface StockTrendChartProps {
  trends: MonthlyTrendPoint[];
}

const StockTrendChart: React.FC<StockTrendChartProps> = ({ trends }) => {
  const fiori = useFioriColors();
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Use all available trend data (already filtered by selected period from API)
  const chartTrends = trends;

  if (chartTrends.length === 0) return null;

  // Prepare data for gifted-charts
  // Show only 4 labels max to prevent truncation (first, last, and 2 in between)
  const maxLabels = 4;
  const totalPoints = chartTrends.length;

  // Calculate which indices should have labels
  const getLabelIndices = (total: number, max: number): Set<number> => {
    if (total <= max) {
      return new Set(Array.from({ length: total }, (_, i) => i));
    }
    const indices = new Set<number>();
    indices.add(0); // First
    indices.add(total - 1); // Last
    // Evenly distribute remaining labels
    const step = (total - 1) / (max - 1);
    for (let i = 1; i < max - 1; i++) {
      indices.add(Math.round(step * i));
    }
    return indices;
  };

  const labelIndices = getLabelIndices(totalPoints, maxLabels);

  // Compact view: limited labels
  const lineData = chartTrends.map((t, index) => ({
    value: t.stock_level_end || 0,
    label: labelIndices.has(index) ? formatShortMonth(t.month) : '',
    dataPointText: formatNumber(t.stock_level_end || 0),
  }));

  // Fullscreen view: all labels
  const fullscreenLineData = chartTrends.map((t) => ({
    value: t.stock_level_end || 0,
    label: formatShortMonth(t.month),
    dataPointText: formatNumber(t.stock_level_end || 0),
  }));

  const maxValue = Math.max(...lineData.map((d) => d.value), 1);
  const roundedMax = Math.ceil(maxValue / 100) * 100 || 100;

  // Compact chart for card view
  // Calculate available width: screen - section padding (32) - chartsCard padding (32) - safety buffer (20)
  const chartWidth = SCREEN_WIDTH - 32 - 32 - 20;
  // Dynamic spacing to fit all data points within available width
  const yAxisWidth = 40; // Approximate width for y-axis labels
  const spacingBuffer = 40; // initialSpacing + endSpacing
  const availableChartArea = chartWidth - yAxisWidth - spacingBuffer;
  const dynamicSpacing = lineData.length > 1
    ? Math.max(20, availableChartArea / (lineData.length - 1))
    : 40;

  const CompactChart = () => (
    <LineChart
      data={lineData}
      width={chartWidth}
      height={120}
      color={CHART_COLORS.stock}
      thickness={2}
      hideDataPoints={lineData.length > 8}
      dataPointsColor={CHART_COLORS.stock}
      dataPointsRadius={4}
      curved
      areaChart
      startFillColor={CHART_COLORS.stock}
      endFillColor={fiori.colors.cardBackground}
      startOpacity={0.3}
      endOpacity={0.05}
      xAxisColor={fiori.colors.divider}
      yAxisColor={fiori.colors.divider}
      xAxisLabelTextStyle={[styles.chartAxisLabel, { color: fiori.colors.textSecondary }]}
      yAxisTextStyle={[styles.chartAxisLabel, { color: fiori.colors.textSecondary }]}
      noOfSections={3}
      maxValue={roundedMax}
      hideRules
      yAxisOffset={0}
      spacing={dynamicSpacing}
      initialSpacing={20}
      endSpacing={20}
      adjustToWidth
    />
  );

  // Fullscreen chart with scroll and zoom
  const FullscreenChart = () => {
    const fullscreenWidth = Math.max(SCREEN_WIDTH - 40, fullscreenLineData.length * 60);

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.fullscreenChartScroll}
      >
        <LineChart
          data={fullscreenLineData}
          width={fullscreenWidth}
          height={Dimensions.get('window').height * 0.5}
          color={CHART_COLORS.stock}
          thickness={3}
          dataPointsColor={CHART_COLORS.stock}
          dataPointsRadius={6}
          textColor={fiori.colors.textPrimary}
          textFontSize={12}
          textShiftY={-10}
          textShiftX={-5}
          curved
          areaChart
          startFillColor={CHART_COLORS.stock}
          endFillColor={fiori.colors.cardBackground}
          startOpacity={0.3}
          endOpacity={0.05}
          xAxisColor={fiori.colors.divider}
          yAxisColor={fiori.colors.divider}
          xAxisLabelTextStyle={[styles.fullscreenAxisLabel, { color: fiori.colors.textSecondary }]}
          yAxisTextStyle={[styles.fullscreenAxisLabel, { color: fiori.colors.textSecondary }]}
          noOfSections={5}
          maxValue={roundedMax}
          rulesColor={fiori.colors.divider}
          rulesType="dashed"
          showVerticalLines
          verticalLinesColor={fiori.colors.divider}
          focusEnabled
          showDataPointOnFocus
          showStripOnFocus
          showTextOnFocus
          stripColor={`${CHART_COLORS.stock}30`}
          stripWidth={2}
          delayBeforeUnFocus={1500}
          focusedDataPointRadius={8}
          focusedDataPointColor={CHART_COLORS.stock}
          yAxisOffset={0}
          initialSpacing={20}
          endSpacing={35}
          spacing={50}
        />
      </ScrollView>
    );
  };

  return (
    <>
      {/* Compact Card View */}
      <Pressable
        style={styles.chartContainer}
        onPress={() => setIsFullscreen(true)}
      >
        <View style={styles.chartHeader}>
          <Text style={[styles.chartTitle, { color: fiori.colors.textPrimary }]}>Stock Level Trend</Text>
          <View style={styles.expandHint}>
            <Icon name="arrow-expand" size={14} color={fiori.colors.textTertiary} />
            <Text style={[styles.expandHintText, { color: fiori.colors.textTertiary }]}>Tap to expand</Text>
          </View>
        </View>
        <CompactChart />
      </Pressable>

      {/* Fullscreen Modal */}
      <Modal
        visible={isFullscreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsFullscreen(false)}
      >
        <View style={[styles.fullscreenContainer, { backgroundColor: fiori.colors.cardBackground }]}>
          <StatusBar barStyle="dark-content" />

          {/* Header */}
          <View style={[styles.fullscreenHeader, { borderBottomColor: fiori.colors.divider }]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsFullscreen(false)}
            >
              <Icon name="close" size={24} color={fiori.colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.fullscreenTitle, { color: fiori.colors.textPrimary }]}>Stock Level Trend</Text>
            <View style={styles.closeButton} />
          </View>

          {/* Instructions */}
          <View style={[styles.fullscreenInstructions, { backgroundColor: fiori.colors.backgroundGrouped }]}>
            <Icon name="gesture-swipe-horizontal" size={18} color={fiori.colors.textSecondary} />
            <Text style={[styles.instructionText, { color: fiori.colors.textSecondary }]}>Swipe to scroll • Tap on data points for details</Text>
          </View>

          {/* Chart */}
          <View style={styles.fullscreenChartContainer}>
            <FullscreenChart />
          </View>

          {/* Summary */}
          <View style={[styles.fullscreenSummary, { borderTopColor: fiori.colors.divider, backgroundColor: fiori.colors.backgroundGrouped }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: fiori.colors.textSecondary }]}>Latest</Text>
              <Text style={[styles.summaryValue, { color: fiori.colors.textPrimary }]}>
                {formatNumber(fullscreenLineData[fullscreenLineData.length - 1]?.value || 0)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: fiori.colors.textSecondary }]}>Highest</Text>
              <Text style={[styles.summaryValue, { color: fiori.colors.textPrimary }]}>
                {formatNumber(maxValue)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: fiori.colors.textSecondary }]}>Period</Text>
              <Text style={[styles.summaryValue, { color: fiori.colors.textPrimary }]}>{fullscreenLineData.length} months</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

// Aging Bucket Bar Component
interface AgingBucketBarProps {
  label: string;
  data: { item_count: number; total_quantity: number; percentage: number };
  maxPercentage: number;
}

const AgingBucketBar: React.FC<AgingBucketBarProps> = ({ label, data, maxPercentage }) => {
  const fiori = useFioriColors();
  const colors = getAgingColor(label, fiori);
  const percentage = data.percentage ?? 0;
  const quantity = data.total_quantity ?? 0;
  const barWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <View style={styles.bucketRow}>
      <View style={styles.bucketLabelContainer}>
        <View style={[styles.bucketDot, { backgroundColor: colors.text }]} />
        <Text style={[styles.bucketLabel, { color: fiori.colors.textSecondary }]}>{label} days</Text>
      </View>
      <View style={[styles.bucketBarContainer, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <View style={[styles.bucketBar, { width: `${barWidth}%`, backgroundColor: colors.bg }]}>
          <View style={[styles.bucketBarFill, { backgroundColor: colors.text }]} />
        </View>
      </View>
      <Text style={[styles.bucketValue, { color: fiori.colors.textPrimary }]}>{percentage.toFixed(1)}%</Text>
      <Text style={[styles.bucketCount, { color: fiori.colors.textSecondary }]}>{formatNumber(quantity)}</Text>
    </View>
  );
};

// Quick Access Card Component
interface QuickAccessCardProps {
  icon: string;
  iconColor: string;
  title: string;
  count: number;
  countLabel: string;
  onPress: () => void;
  children?: React.ReactNode;
}

const QuickAccessCard: React.FC<QuickAccessCardProps> = ({
  icon,
  iconColor,
  title,
  count,
  countLabel,
  onPress,
  children,
}) => {
  const fiori = useFioriColors();
  return (
    <View style={[styles.quickAccessCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
      <Pressable
        style={({ pressed }) => [styles.quickAccessHeader, pressed && { backgroundColor: fiori.colors.cardBackgroundPressed }]}
        onPress={onPress}
      >
        <View style={[styles.quickAccessIcon, { backgroundColor: `${iconColor}15` }]}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.quickAccessContent}>
          <Text style={[styles.quickAccessTitle, { color: fiori.colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.quickAccessCount, { color: fiori.colors.textSecondary }]}>
            {count} {countLabel}
          </Text>
        </View>
        <View style={styles.quickAccessAction}>
          <Text style={[styles.quickAccessActionText, { color: fiori.colors.tint }]}>View All</Text>
          <Icon name="chevron-right" size={16} color={fiori.colors.tint} />
        </View>
      </Pressable>
      {children && <View style={[styles.quickAccessPreview, { borderTopColor: fiori.colors.divider, backgroundColor: fiori.colors.backgroundGrouped }]}>{children}</View>}
    </View>
  );
};

// Preview Item Row
interface PreviewItemProps {
  label: string;
  sublabel: string;
  value: string;
  valueColor?: string;
}

const PreviewItem: React.FC<PreviewItemProps> = ({ label, sublabel, value, valueColor }) => {
  const fiori = useFioriColors();
  return (
    <View style={styles.previewItem}>
      <View style={styles.previewItemContent}>
        <Text style={[styles.previewItemLabel, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.previewItemSublabel, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
          {sublabel}
        </Text>
      </View>
      <Text style={[styles.previewItemValue, { color: fiori.colors.textPrimary }, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
};

// ============================================================================
// Main Screen
// ============================================================================

export default function CustomerActivityScreen() {
  const fiori = useFioriColors();

  // Role-based access (J12 fix)
  const {
    isStaff,
    singleAssignedCustomerId,
    shouldShowListView,
  } = useRoleBasedAccess();

  const [allData, setAllData] = useState<AllCustomerActivityData | null>(null);
  const [detailData, setDetailData] = useState<CustomerActivityDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerActivityRow | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<CustomerActivityPeriod>('last120days');
  const [chartsExpanded, setChartsExpanded] = useState(true);

  const periodDays = useMemo(() => {
    return PERIOD_OPTIONS.find((p) => p.id === selectedPeriod)?.days || 420;
  }, [selectedPeriod]);

  // Helper to get days from period
  const getDaysFromPeriod = (period: CustomerActivityPeriod): number => {
    return PERIOD_OPTIONS.find((p) => p.id === period)?.days || 120;
  };

  // Fetch all customers data
  const fetchAllCustomersData = useCallback(
    async (showRefresh = false, overrideDays?: number) => {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const daysToUse = overrideDays ?? periodDays;
      try {
        const response = await getAllCustomerActivity({ daysBack: daysToUse });
        if (response.success && response.data) {
          // Backend now filters by user permissions via auth.uid()
          setAllData(response.data);
        } else {
          setError(response.error || 'Failed to load customer activity');
        }
      } catch (err) {
        setError('An unexpected error occurred');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [periodDays]
  );

  // Fetch single customer detail
  const fetchCustomerDetail = useCallback(
    async (customerId: string, showRefresh = false, overrideDays?: number) => {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const daysToUse = overrideDays ?? periodDays;
      try {
        const response = await getCustomerActivityDetail({ customerId, daysBack: daysToUse });
        if (response.success && response.data) {
          setDetailData(response.data);
        } else {
          setError(response.error || 'Failed to load customer details');
        }
      } catch (err) {
        setError('An unexpected error occurred');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [periodDays]
  );

  // Initial fetch
  useEffect(() => {
    if (shouldShowListView) {
      fetchAllCustomersData();
    } else if (singleAssignedCustomerId) {
      setViewMode('single');
      fetchCustomerDetail(singleAssignedCustomerId);
    } else {
      setError('No customer assigned to your account');
      setIsLoading(false);
    }
  }, [shouldShowListView, singleAssignedCustomerId, fetchAllCustomersData, fetchCustomerDetail]);

  // Handle period change
  const handlePeriodChange = useCallback(
    (period: CustomerActivityPeriod) => {
      setSelectedPeriod(period);
      // Pass the new period's days directly to avoid stale closure issue
      const newDays = getDaysFromPeriod(period);
      if (viewMode === 'all') {
        fetchAllCustomersData(false, newDays);
      } else if (selectedCustomer) {
        fetchCustomerDetail(selectedCustomer.customer_id, false, newDays);
      } else if (singleAssignedCustomerId) {
        fetchCustomerDetail(singleAssignedCustomerId, false, newDays);
      }
    },
    [viewMode, selectedCustomer, singleAssignedCustomerId, fetchAllCustomersData, fetchCustomerDetail]
  );

  const handleRefresh = useCallback(() => {
    if (viewMode === 'all') {
      fetchAllCustomersData(true);
    } else if (selectedCustomer) {
      fetchCustomerDetail(selectedCustomer.customer_id, true);
    } else if (singleAssignedCustomerId) {
      fetchCustomerDetail(singleAssignedCustomerId, true);
    }
  }, [viewMode, selectedCustomer, singleAssignedCustomerId, fetchAllCustomersData, fetchCustomerDetail]);

  const handleCustomerSelect = useCallback(
    (customer: CustomerActivityRow) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedCustomer(customer);
      setViewMode('single');
      setDetailData(null);
      fetchCustomerDetail(customer.customer_id);
    },
    [fetchCustomerDetail]
  );

  const handleBackToAll = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode('all');
    setSelectedCustomer(null);
    setDetailData(null);
    setChartsExpanded(true);
  }, []);

  const toggleCharts = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChartsExpanded((prev) => !prev);
  }, []);

  // Navigate to existing reports with customer filter
  const navigateToReport = useCallback(
    (reportType: 'grn-activity' | 'dispatch-activity' | 'stock-aging' | 'invoice-history') => {
      const customerId = selectedCustomer?.customer_id || singleAssignedCustomerId;
      const customerName = detailData?.customer_name || selectedCustomer?.customer_name || '';
      if (customerId) {
        const params = new URLSearchParams({
          customerId,
          ...(customerName && { customerName }),
        });
        router.push(`/reports/${reportType}?${params.toString()}`);
      } else {
        router.push(`/reports/${reportType}`);
      }
    },
    [selectedCustomer, singleAssignedCustomerId, detailData?.customer_name]
  );

  // KPIs for all customers view
  const allCustomersKpis: KPIItem[] = useMemo(() => {
    if (!allData?.summary) return [];
    const s = allData.summary;
    return [
      { icon: 'account-group', value: s.total_customers, label: 'Customers', variant: 'primary' },
      { icon: 'package-variant-closed', value: formatNumber(s.total_current_stock), label: 'Stock', variant: 'secondary' },
    ];
  }, [allData?.summary]);

  // KPIs for single customer detail view (3 KPIs in 1 row)
  const detailKpis: KPIItem[] = useMemo(() => {
    if (!detailData?.summary) return [];
    const s = detailData.summary;
    return [
      { icon: 'package-variant-closed', value: formatNumber(s.current_stock), label: 'Stock', variant: 'primary' },
      { icon: 'file-document-outline', value: s.total_grns, label: 'GRNs', variant: 'secondary' },
      { icon: 'truck-delivery-outline', value: s.total_dispatches, label: 'Dispatches', variant: 'accent' },
    ];
  }, [detailData?.summary]);

  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allData : detailData;

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Customer Activity" />
        <PeriodSelector selected={selectedPeriod} onSelect={handlePeriodChange} />
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'account-group', value: '-', label: 'Customers', variant: 'primary' },
              { icon: 'package-variant-closed', value: '-', label: 'Stock', variant: 'secondary' },
            ]}
            isLoading={true}
            compact
          />
        </View>
      </View>
    );
  }

  // Error
  if (error && !hasData) {
    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Customer Activity" />
        <PeriodSelector selected={selectedPeriod} onSelect={handlePeriodChange} />
        <ReportEmptyState icon="alert-circle-outline" message="Failed to load data" description={error} />
      </View>
    );
  }

  // Level 1: All Customers View
  if (isListView && allData) {
    const hasCustomers = allData.customers.length > 0;

    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader title="Customer Activity" subtitle={isStaff ? 'All Customers' : 'My Customers'} />
        <PeriodSelector selected={selectedPeriod} onSelect={handlePeriodChange} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[fiori.colors.tint]}
            />
          }
        >
          <KPIGrid items={allCustomersKpis} isLoading={isLoading} compact />

          {hasCustomers ? (
            <View style={styles.section}>
              <FioriSectionHeader title="Customers" />
              <View style={[styles.customersCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
                {allData.customers.map((customer, index) => (
                  <React.Fragment key={customer.customer_id}>
                    <CustomerCard customer={customer} onPress={() => handleCustomerSelect(customer)} />
                    {index < allData.customers.length - 1 && <View style={[styles.divider, { backgroundColor: fiori.colors.divider }]} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : (
            <ReportEmptyState
              icon="account-off-outline"
              message="No Customers Found"
              description="No customer activity data available."
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // Level 2: Single Customer Detail View
  if (detailData) {
    const hasChartData = detailData.monthly_trends.length > 0;

    return (
      <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
        <ReportHeader
          title="Customer Activity"
          subtitle={detailData.customer_name}
          onBack={shouldShowListView ? handleBackToAll : undefined}
        />
        <PeriodSelector selected={selectedPeriod} onSelect={handlePeriodChange} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[fiori.colors.tint]}
            />
          }
        >
          <KPIGrid items={detailKpis} isLoading={isLoading} compact />

          {/* Charts Section (Collapsible) */}
          {hasChartData && (
            <View style={styles.section}>
              <FioriSectionHeader
                title="Charts"
                onToggle={toggleCharts}
                isExpanded={chartsExpanded}
              />
              {chartsExpanded && (
                <View style={[styles.chartsCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
                  <StockTrendChart trends={detailData.monthly_trends} />
                </View>
              )}
            </View>
          )}

          {/* Stock Aging Distribution */}
          {Object.keys(detailData.by_bucket).length > 0 && (
            <View style={styles.section}>
              <FioriSectionHeader title="Stock Aging Distribution" />
              <View style={[styles.bucketsCard, { backgroundColor: fiori.colors.cardBackground, borderColor: fiori.colors.border }]}>
                {(() => {
                  const maxPercentage = Math.max(
                    ...Object.values(detailData.by_bucket).map((b) => b.percentage ?? 0),
                    1
                  );
                  return ['0-120', '121-240', '241-364', '364+'].map((key) => {
                    const bucket = detailData.by_bucket[key];
                    if (!bucket) return null;
                    return (
                      <AgingBucketBar
                        key={key}
                        label={key}
                        data={bucket}
                        maxPercentage={maxPercentage}
                      />
                    );
                  });
                })()}
              </View>
            </View>
          )}

          {/* Quick Access Section */}
          <View style={styles.section}>
            <FioriSectionHeader title="Quick Access" />
            <View style={styles.quickAccessGrid}>
              {/* Recent GRNs */}
              <QuickAccessCard
                icon="file-document-outline"
                iconColor={CHART_COLORS.grn}
                title="Recent GRNs"
                count={detailData.recent_grns.length}
                countLabel="items"
                onPress={() => navigateToReport('grn-activity')}
              >
                {detailData.recent_grns.slice(0, 3).map((grn) => (
                  <PreviewItem
                    key={grn.grn_id}
                    label={grn.gr_no}
                    sublabel={formatDate(grn.grn_date, 'short')}
                    value={`${formatNumber(grn.current_stock)}/${formatNumber(grn.total_qty)}`}
                  />
                ))}
              </QuickAccessCard>

              {/* Recent Dispatches */}
              <QuickAccessCard
                icon="truck-delivery-outline"
                iconColor={CHART_COLORS.dispatch}
                title="Recent Dispatches"
                count={detailData.recent_dispatches.length}
                countLabel="items"
                onPress={() => navigateToReport('dispatch-activity')}
              >
                {detailData.recent_dispatches.slice(0, 3).map((disp) => (
                  <PreviewItem
                    key={disp.dispatch_id}
                    label={disp.dispatch_no}
                    sublabel={formatDate(disp.dispatch_date, 'short')}
                    value={formatNumber(disp.total_qty)}
                  />
                ))}
              </QuickAccessCard>

              {/* Top Stock Items */}
              <QuickAccessCard
                icon="package-variant-closed"
                iconColor={CHART_COLORS.stock}
                title="Top Stock Items"
                count={detailData.top_stock_items.length}
                countLabel="items"
                onPress={() => navigateToReport('stock-aging')}
              >
                {detailData.top_stock_items.slice(0, 3).map((item, idx) => (
                  <PreviewItem
                    key={`${item.item_name}-${idx}`}
                    label={item.item_name}
                    sublabel={`${item.grn_count} GRNs`}
                    value={formatNumber(item.total_stock)}
                  />
                ))}
              </QuickAccessCard>

              {/* Recent Invoices */}
              <QuickAccessCard
                icon="receipt"
                iconColor={CHART_COLORS.invoice}
                title="Recent Invoices"
                count={detailData.recent_invoices.length}
                countLabel="items"
                onPress={() => navigateToReport('invoice-history')}
              >
                {detailData.recent_invoices.slice(0, 3).map((inv) => (
                  <PreviewItem
                    key={inv.invoice_id}
                    label={inv.invoice_number}
                    sublabel={formatDate(inv.invoice_date, 'short')}
                    value={formatCurrency(inv.net_total)}
                    valueColor={inv.status === 'paid' ? fiori.colors.success : fiori.colors.destructive}
                  />
                ))}
              </QuickAccessCard>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Fallback empty state
  return (
    <View style={[styles.container, { backgroundColor: fiori.colors.backgroundGrouped }]}>
      <ReportHeader title="Customer Activity" />
      <PeriodSelector selected={selectedPeriod} onSelect={handlePeriodChange} />
      <ReportEmptyState
        icon="account-off-outline"
        message="No Data"
        description="No customer activity data available."
      />
    </View>
  );
}

// ============================================================================
// Styles (colors removed - applied dynamically via useFioriColors)
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  section: {
    marginTop: 16,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
  },

  // Section Header
  fioriSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: FIORI_STATIC.dimensions.sectionHeaderHeight,
  },
  fioriSectionHeaderText: {
    fontSize: FIORI_STATIC.typography.sectionHeader.fontSize,
    fontWeight: FIORI_STATIC.typography.sectionHeader.fontWeight,
    letterSpacing: FIORI_STATIC.typography.sectionHeader.letterSpacing,
    textTransform: FIORI_STATIC.typography.sectionHeader.textTransform,
  },

  // Period Selector
  periodSelectorContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  periodSelectorContent: {
    flexDirection: 'row',
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 10,
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  periodChipText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Customer Card
  customersCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  customerAvatar: {
    width: FIORI_STATIC.dimensions.objectCellImageSize,
    height: FIORI_STATIC.dimensions.objectCellImageSize,
    borderRadius: FIORI_STATIC.dimensions.objectCellImageRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerContent: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '600' },
  customerSubtitle: { fontSize: 13, marginTop: 2 },
  customerMetrics: { flexDirection: 'row', gap: 12, marginTop: 4 },
  customerMetricItem: { fontSize: 12 },
  customerStock: { alignItems: 'flex-end' },
  customerStockValue: { fontSize: 16, fontWeight: '700' },
  customerStockLabel: { fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },

  // Charts Section
  chartsCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    padding: FIORI_STATIC.dimensions.cardPadding,
    ...theme.shadows.sm,
  },
  chartContainer: {
    paddingVertical: 8,
  },
  chart: {
    borderRadius: 8,
    marginLeft: -16,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
  },
  chartDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandHintText: {
    fontSize: 11,
  },
  chartAxisLabel: {
    fontSize: 10,
    width: 30, // Ensure enough width for 3-letter month abbreviations
  },

  // Fullscreen Chart Modal
  fullscreenContainer: {
    flex: 1,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  fullscreenInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  instructionText: {
    fontSize: 13,
  },
  fullscreenChartContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fullscreenChartScroll: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  fullscreenAxisLabel: {
    fontSize: 12,
  },
  fullscreenSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Stock Aging Buckets
  bucketsCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    padding: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
    ...theme.shadows.sm,
  },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bucketLabelContainer: { flexDirection: 'row', alignItems: 'center', width: 90, gap: 6 },
  bucketDot: { width: 8, height: 8, borderRadius: 4 },
  bucketLabel: { fontSize: 12 },
  bucketBarContainer: { flex: 1, height: 20, borderRadius: 4, overflow: 'hidden' },
  bucketBar: { height: '100%', borderRadius: 4, justifyContent: 'center' },
  bucketBarFill: { width: 3, height: '60%', borderRadius: 2, marginLeft: 4 },
  bucketValue: { width: 45, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  bucketCount: { width: 50, textAlign: 'right', fontSize: 11 },

  // Quick Access Section
  quickAccessGrid: {
    gap: 12,
  },
  quickAccessCard: {
    borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  quickAccessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    gap: 12,
  },
  quickAccessIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAccessContent: { flex: 1 },
  quickAccessTitle: { fontSize: 15, fontWeight: '600' },
  quickAccessCount: { fontSize: 13, marginTop: 2 },
  quickAccessAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quickAccessActionText: { fontSize: 13, fontWeight: '500' },
  quickAccessPreview: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
    paddingVertical: 8,
  },

  // Preview Items
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  previewItemContent: { flex: 1 },
  previewItemLabel: { fontSize: 13, fontWeight: '500' },
  previewItemSublabel: { fontSize: 11 },
  previewItemValue: { fontSize: 13, fontWeight: '600' },
});
