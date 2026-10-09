/**
 * Customer Activity Report Screen (C6)
 *
 * Consolidated customer-centric view of all activity: GRN, Dispatch, Stock, Invoice.
 * Level 1: Customer list with activity summary
 * Level 2: Customer dashboard with charts and quick access cards
 *
 * Layout follows the report pattern in docs/STYLE_GUIDE.md §14.10 (period
 * selector, KPIs, charts, then detail lists) and the chart rules in §13.11.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  LayoutAnimation,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-gifted-charts';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import {
  ReportHeader,
  KPIGrid,
  ReportEmptyState,
  PeriodSelector,
  type KPIItem,
} from '@/components/reports';
import {
  getAllCustomerActivity,
  getCustomerActivityDetail,
} from '@/services/reporting/customer-activity-service';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import type {
  AllCustomerActivityData,
  CustomerActivityRow,
  CustomerActivityDetailData,
  MonthlyTrendPoint,
  CustomerActivityPeriod,
} from '@/types/report.types';
import { formatNumber, formatCurrency, parseLocalISODate } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CustomerActivity');

const LIST_ERROR = "Couldn't load customer activity. Check your connection and try again.";
const DETAIL_ERROR = "Couldn't load this customer's activity. Check your connection and try again.";
const NO_CUSTOMER = 'No customer is linked to your account. Ask your facility to link one.';

// ============================================================================
// Status (guide §3.5)
// ============================================================================

type StatusKind = 'negative' | 'critical' | 'positive' | 'neutral';

const STATUS_ICON: Record<StatusKind, string> = {
  negative: 'alert-circle',
  critical: 'alert',
  positive: 'check-circle',
  neutral: 'circle-outline',
};

interface StatusInfo {
  kind: StatusKind;
  label: string;
}

/** Stock age buckets: newest positive, middle buckets critical, oldest negative. */
const AGING_STATUS: Record<string, StatusKind> = {
  '0-120': 'positive',
  '121-240': 'critical',
  '241-364': 'critical',
  '364+': 'negative',
};

const AGING_LABEL: Record<string, string> = {
  '0-120': '0–120 days',
  '121-240': '121–240 days',
  '241-364': '241–364 days',
  '364+': 'Over 364 days',
};

/** Invoice status: pending → critical, paid → positive. */
function invoiceStatus(status: string): StatusInfo {
  if (status === 'paid') return { kind: 'positive', label: 'Paid' };
  if (status === 'pending') return { kind: 'critical', label: 'Pending' };
  return { kind: 'neutral', label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown' };
}

// Period options - standardized across all reports
const PERIOD_OPTIONS: { id: CustomerActivityPeriod; days: number }[] = [
  { id: 'last120days', days: 120 },
  { id: 'last240days', days: 240 },
  { id: 'last364days', days: 364 },
  { id: 'last420days', days: 420 },
];

// ============================================================================
// Helper Functions
// ============================================================================

function toDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalISODate(value) : new Date(value);
}

/** "9 Oct 2026" (guide §12.3) */
function formatDay(value: string): string {
  if (!value) return '';
  const date = toDate(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Active today" or "Last active 9 Oct 2026" */
function formatLastActivity(value: string): string {
  if (!value) return '';
  const date = toDate(value);
  if (isNaN(date.getTime())) return '';
  if (date.toDateString() === new Date().toDateString()) return 'Active today';
  return `Last active ${formatDay(value)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortMonth(monthStr: string): string {
  const [, month] = monthStr.split('-');
  return MONTHS[parseInt(month, 10) - 1] || monthStr;
}

/** "Oct 2026" */
function formatMonthYear(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const name = MONTHS[parseInt(month, 10) - 1];
  return name ? `${name} ${year}` : monthStr;
}

function plural(count: number, one: string, many: string): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

/** Stable avatar colour index for a customer (guide §3.2). */
function avatarIndex(key: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % count;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ============================================================================
// Styles
// ============================================================================

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background.base },
    loadingContainer: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: space.xxxl },
    section: {
      marginTop: space.lg,
      paddingHorizontal: layout.marginCompact,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: space.sm,
      paddingBottom: space.xs,
      minHeight: 32,
    },
    sectionHeaderToggle: {
      minHeight: touchTarget,
    },
    sectionHeaderPressed: { opacity: 0.6 },
    sectionHeaderText: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: t.text.secondary,
    },
    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      ...t.shadow[2],
    },
    cardClip: {
      borderRadius: radius.card,
      overflow: 'hidden',
    },
    cardPadded: {
      padding: space.lg,
      gap: space.md,
    },

    // Customer cell
    customerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      gap: space.md,
      backgroundColor: t.surface.card,
    },
    customerCardPressed: { backgroundColor: t.surface.cardPressed },
    customerAvatar: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.pill,
      justifyContent: 'center',
      alignItems: 'center',
    },
    customerInitials: {
      ...typography.subhead,
      fontWeight: fontWeight.semibold,
      color: t.mode === 'dark' ? t.overlay.onImage : t.text.primary,
    },
    customerContent: { flex: 1 },
    customerName: { ...typography.headline, color: t.text.primary },
    customerSubtitle: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
    customerMetrics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.md,
      rowGap: space.xxs,
      marginTop: space.xs,
    },
    metric: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    metricText: { ...typography.footnote, color: t.text.secondary, fontVariant: ['tabular-nums'] },
    customerStock: { alignItems: 'flex-end' },
    customerStockValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums'] },
    customerStockLabel: { ...typography.caption1, color: t.text.secondary },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.marginCompact + layout.avatar.md + space.md,
      backgroundColor: t.border.divider,
    },

    // Chart card
    chartPressable: { padding: space.lg, gap: space.sm },
    chartPressed: { backgroundColor: t.surface.cardPressed },
    chartHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space.sm,
    },
    chartTitle: { ...typography.headline, color: t.text.primary, flex: 1 },
    expandHint: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    expandHintText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.brand.tint },
    chartAxisLabel: { ...typography.caption1, color: t.text.secondary },
    chartAxisLabelX: { width: 32 },
    chartSummary: { ...typography.footnote, color: t.text.secondary },

    // Fullscreen chart
    fullscreenContainer: { flex: 1, backgroundColor: t.background.base },
    fullscreenHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.xs,
      paddingBottom: space.xs,
      backgroundColor: t.surface.header,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    closeButton: {
      width: touchTarget,
      height: touchTarget,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.pill,
    },
    closeButtonPressed: { backgroundColor: t.brand.subtle },
    fullscreenTitle: { ...typography.headline, color: t.text.primary, flex: 1, textAlign: 'center' },
    toolbar: {
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.md,
      gap: space.md,
      backgroundColor: t.surface.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.separator,
    },
    segmented: {
      flexDirection: 'row',
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: t.border.button,
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      backgroundColor: t.surface.card,
    },
    segmentDivider: { borderLeftWidth: 1, borderLeftColor: t.border.button },
    segmentPressed: { backgroundColor: t.brand.subtle },
    segmentSelected: { backgroundColor: t.brand.fill },
    segmentText: { ...typography.callout, color: t.text.primary },
    segmentTextSelected: { fontWeight: fontWeight.semibold, color: t.brand.onFill },
    instructions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    instructionText: { ...typography.caption1, color: t.text.secondary, flex: 1 },
    fullscreenBody: { flex: 1, backgroundColor: t.surface.card },
    fullscreenChartContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.marginCompact },
    fullscreenChartScroll: { alignItems: 'center', paddingVertical: space.xl },
    tableHeader: {
      flexDirection: 'row',
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.sm,
      backgroundColor: t.background.base,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.separator,
    },
    tableHeaderText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.secondary },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 36,
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.s6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    tableCell: { ...typography.subhead, color: t.text.primary },
    colLabel: { flex: 1 },
    colNumber: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
    fullscreenSummary: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: space.lg,
      paddingHorizontal: layout.marginCompact,
      backgroundColor: t.surface.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.separator,
    },
    summaryItem: { alignItems: 'center' },
    summaryLabel: { ...typography.footnote, color: t.text.secondary, marginBottom: space.xs },
    summaryValue: { ...typography.title3, color: t.text.primary, fontVariant: ['tabular-nums'] },

    // Aging buckets
    bucketRow: { gap: space.xs },
    bucketTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    bucketLabel: { ...typography.subhead, color: t.text.primary, flex: 1 },
    bucketValue: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums'] },
    bucketCount: { ...typography.footnote, color: t.text.secondary, fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'right' },
    bucketTrack: {
      height: space.sm,
      borderRadius: radius.pill,
      overflow: 'hidden',
      backgroundColor: t.brand.subtleStrong,
    },
    bucketFill: { height: '100%', borderRadius: radius.pill },

    // Quick access
    quickAccessGrid: { gap: space.sm },
    quickAccessHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    quickAccessHeaderPressed: { backgroundColor: t.surface.cardPressed },
    quickAccessIcon: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.button,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.brand.subtle,
    },
    quickAccessContent: { flex: 1 },
    quickAccessTitle: { ...typography.headline, color: t.text.primary },
    quickAccessCount: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
    quickAccessAction: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
    quickAccessActionText: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.brand.tint },
    quickAccessPreview: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.divider,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
    },
    previewItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.s6, gap: space.md },
    previewItemContent: { flex: 1 },
    previewItemLabel: { ...typography.subhead, fontWeight: fontWeight.medium, color: t.text.primary },
    previewItemSublabel: { ...typography.caption1, color: t.text.secondary },
    previewItemRight: { alignItems: 'flex-end', gap: space.xxs },
    previewItemValue: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums'] },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
      paddingHorizontal: space.s6,
      paddingVertical: space.xxs,
      borderRadius: radius.field,
    },
    tagText: { ...typography.caption1, fontWeight: fontWeight.semibold },
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// Components
// ============================================================================

function StatusTag({ status, styles, t }: { status: StatusInfo; styles: Styles; t: ThemeTokens }) {
  const tone = t.status[status.kind];
  return (
    <View style={[styles.tag, { backgroundColor: tone.background }]}>
      <Icon name={STATUS_ICON[status.kind]} size={iconSize.sm} color={tone.text} />
      <Text style={[styles.tagText, { color: tone.text }]} maxFontSizeMultiplier={1.6}>
        {status.label}
      </Text>
    </View>
  );
}

const SectionHeader: React.FC<{
  title: string;
  onToggle?: () => void;
  isExpanded?: boolean;
  styles: Styles;
  t: ThemeTokens;
}> = ({ title, onToggle, isExpanded, styles, t }) => {
  if (!onToggle) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText} accessibilityRole="header">
          {title}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.sectionHeader, styles.sectionHeaderToggle, pressed && styles.sectionHeaderPressed]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: !!isExpanded }}
    >
      <Text style={styles.sectionHeaderText} accessibilityRole="header">
        {title}
      </Text>
      <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
    </Pressable>
  );
};

// Customer Card for list view (Level 1)
interface CustomerCardProps {
  customer: CustomerActivityRow;
  onPress: () => void;
  styles: Styles;
  t: ThemeTokens;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onPress, styles, t }) => {
  const subtitle = [customer.customer_city, formatLastActivity(customer.last_activity_date)]
    .filter(Boolean)
    .join(' · ');
  const grns = plural(customer.total_grns, 'GRN', 'GRNs');
  const dispatches = plural(customer.total_dispatches, 'dispatch', 'dispatches');
  const invoiced = `${formatCurrency(customer.total_invoice_amount, { maximumFractionDigits: 0 })} invoiced`;
  const stock = formatNumber(customer.current_stock);

  return (
    <Pressable
      style={({ pressed }) => [styles.customerCard, pressed && styles.customerCardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${customer.customer_name}, ${subtitle}, ${stock} in stock, ${grns}, ${dispatches}, ${invoiced}`}
      accessibilityHint="Opens this customer's activity"
    >
      <View
        style={[
          styles.customerAvatar,
          { backgroundColor: t.avatar[avatarIndex(customer.customer_id, t.avatar.length)] },
        ]}
      >
        <Text style={styles.customerInitials} maxFontSizeMultiplier={1.6}>
          {initials(customer.customer_name)}
        </Text>
      </View>
      <View style={styles.customerContent}>
        <Text style={styles.customerName} numberOfLines={2}>
          {customer.customer_name}
        </Text>
        {subtitle ? (
          <Text style={styles.customerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.customerMetrics}>
          <View style={styles.metric}>
            <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.metricText}>{grns}</Text>
          </View>
          <View style={styles.metric}>
            <Icon name="truck-delivery-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.metricText}>{dispatches}</Text>
          </View>
          <View style={styles.metric}>
            <Icon name="file-document-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.metricText}>{invoiced}</Text>
          </View>
        </View>
      </View>
      <View style={styles.customerStock}>
        <Text style={styles.customerStockValue}>{stock}</Text>
        <Text style={styles.customerStockLabel}>in stock</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
    </Pressable>
  );
};

// Stock Trend Line Chart Component with Fullscreen Modal
interface StockTrendChartProps {
  trends: MonthlyTrendPoint[];
  styles: Styles;
  t: ThemeTokens;
}

const StockTrendChart: React.FC<StockTrendChartProps> = ({ trends, styles, t }) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  // Use all available trend data (already filtered by selected period from API)
  const chartTrends = trends;
  // Single series: first colour of the chart palette (guide §13.11)
  const seriesColour = t.chart[0];

  if (chartTrends.length === 0) return null;

  // Show only 4 labels max to prevent truncation (first, last, and 2 in between)
  const maxLabels = 4;
  const totalPoints = chartTrends.length;

  const getLabelIndices = (total: number, max: number): Set<number> => {
    if (total <= max) {
      return new Set(Array.from({ length: total }, (_, i) => i));
    }
    const indices = new Set<number>();
    indices.add(0); // First
    indices.add(total - 1); // Last
    const step = (total - 1) / (max - 1);
    for (let i = 1; i < max - 1; i++) {
      indices.add(Math.round(step * i));
    }
    return indices;
  };

  const labelIndices = getLabelIndices(totalPoints, maxLabels);

  // Compact view: limited labels
  const lineData = chartTrends.map((p, index) => ({
    value: p.stock_level_end || 0,
    label: labelIndices.has(index) ? formatShortMonth(p.month) : '',
    dataPointText: formatNumber(p.stock_level_end || 0),
  }));

  // Fullscreen view: all labels
  const fullscreenLineData = chartTrends.map((p) => ({
    value: p.stock_level_end || 0,
    label: formatShortMonth(p.month),
    dataPointText: formatNumber(p.stock_level_end || 0),
  }));

  const maxValue = Math.max(...lineData.map((d) => d.value), 1);
  const roundedMax = Math.ceil(maxValue / 100) * 100 || 100;
  const first = lineData[0]?.value ?? 0;
  const latest = lineData[lineData.length - 1]?.value ?? 0;
  const firstMonth = formatMonthYear(chartTrends[0].month);
  const lastMonth = formatMonthYear(chartTrends[chartTrends.length - 1].month);
  const summary =
    chartTrends.length === 1
      ? `Stock at the end of ${lastMonth}: ${formatNumber(latest)}.`
      : `Stock went from ${formatNumber(first)} in ${firstMonth} to ${formatNumber(latest)} in ${lastMonth}. Highest ${formatNumber(maxValue)}.`;

  // Calculate available width: screen - section padding (32) - card padding (32) - safety buffer (20)
  const chartWidth = screenWidth - 32 - 32 - 20;
  const yAxisWidth = 40;
  const spacingBuffer = 40;
  const availableChartArea = chartWidth - yAxisWidth - spacingBuffer;
  const dynamicSpacing = lineData.length > 1 ? Math.max(20, availableChartArea / (lineData.length - 1)) : 40;

  const axisProps = {
    color: seriesColour,
    dataPointsColor: seriesColour,
    curved: true,
    xAxisColor: t.border.divider,
    yAxisColor: t.border.divider,
    rulesColor: t.border.divider,
    xAxisLabelTextStyle: [styles.chartAxisLabel, styles.chartAxisLabelX],
    yAxisTextStyle: styles.chartAxisLabel,
    maxValue: roundedMax,
    yAxisOffset: 0,
  };

  const close = () => {
    setIsFullscreen(false);
    setView('chart');
  };

  const fullscreenWidth = Math.max(screenWidth - 40, fullscreenLineData.length * 60);

  return (
    <>
      {/* Compact Card View */}
      <Pressable
        style={({ pressed }) => [styles.chartPressable, pressed && styles.chartPressed]}
        onPress={() => setIsFullscreen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Stock level trend. ${summary}`}
        accessibilityHint="Opens the full-screen chart and a table of values"
      >
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle} accessibilityRole="header">
            Stock level trend
          </Text>
          <View style={styles.expandHint}>
            <Icon name="arrow-expand" size={iconSize.sm} color={t.brand.tint} />
            <Text style={styles.expandHintText}>Expand</Text>
          </View>
        </View>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <LineChart
            {...axisProps}
            data={lineData}
            width={chartWidth}
            height={120}
            thickness={2}
            hideDataPoints={lineData.length > 8}
            dataPointsRadius={4}
            noOfSections={3}
            hideRules
            spacing={dynamicSpacing}
            initialSpacing={20}
            endSpacing={20}
            adjustToWidth
          />
        </View>
        <Text style={styles.chartSummary}>{summary}</Text>
      </Pressable>

      {/* Fullscreen Modal */}
      <Modal visible={isFullscreen} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
        <View style={styles.fullscreenContainer}>
          <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} active={isFullscreen} />

          {/* Header */}
          <View style={[styles.fullscreenHeader, { paddingTop: insets.top + space.xs }]}>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close stock level trend"
            >
              <Icon name="close" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
            <Text style={styles.fullscreenTitle} accessibilityRole="header">
              Stock level trend
            </Text>
            <View style={styles.closeButton} />
          </View>

          <View style={styles.toolbar}>
            <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Show as">
              {(['chart', 'table'] as const).map((option, index) => {
                const selected = view === option;
                return (
                  <Pressable
                    key={option}
                    style={({ pressed }) => [
                      styles.segment,
                      index > 0 && styles.segmentDivider,
                      pressed && !selected && styles.segmentPressed,
                      selected && styles.segmentSelected,
                    ]}
                    hitSlop={{ top: 6, bottom: 6 }}
                    onPress={() => setView(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={option === 'chart' ? 'Chart' : 'Table of values'}
                  >
                    <Icon
                      name={option === 'chart' ? 'chart-line' : 'table'}
                      size={iconSize.sm}
                      color={selected ? t.brand.onFill : t.icon.primary}
                    />
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {option === 'chart' ? 'Chart' : 'Table'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {view === 'chart' && (
              <View style={styles.instructions}>
                <Icon name="gesture-swipe-horizontal" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.instructionText}>Swipe to scroll. Tap a point to see its value.</Text>
              </View>
            )}
          </View>

          <View style={styles.fullscreenBody}>
            {view === 'chart' ? (
              <View style={styles.fullscreenChartContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.fullscreenChartScroll}
                >
                  <LineChart
                    {...axisProps}
                    data={fullscreenLineData}
                    width={fullscreenWidth}
                    height={screenHeight * 0.5}
                    thickness={3}
                    dataPointsRadius={6}
                    textColor={t.text.primary}
                    textFontSize={typography.caption1.fontSize}
                    textShiftY={-10}
                    textShiftX={-5}
                    noOfSections={5}
                    rulesType="dashed"
                    showVerticalLines
                    verticalLinesColor={t.border.divider}
                    focusEnabled
                    showDataPointOnFocus
                    showStripOnFocus
                    showTextOnFocus
                    stripColor={t.border.separator}
                    stripWidth={2}
                    delayBeforeUnFocus={1500}
                    focusedDataPointRadius={8}
                    focusedDataPointColor={seriesColour}
                    initialSpacing={20}
                    endSpacing={35}
                    spacing={50}
                  />
                </ScrollView>
              </View>
            ) : (
              <>
                <View style={styles.tableHeader} accessibilityRole="header">
                  <Text style={[styles.tableHeaderText, styles.colLabel]}>Month</Text>
                  <Text style={[styles.tableHeaderText, styles.colNumber]}>Stock at month end</Text>
                </View>
                <FlatList
                  data={chartTrends}
                  keyExtractor={(item) => item.month}
                  renderItem={({ item }) => (
                    <View
                      style={styles.tableRow}
                      accessible
                      accessibilityLabel={`${formatMonthYear(item.month)}, ${formatNumber(item.stock_level_end || 0)}`}
                    >
                      <Text style={[styles.tableCell, styles.colLabel]}>{formatMonthYear(item.month)}</Text>
                      <Text style={[styles.tableCell, styles.colNumber]}>{formatNumber(item.stock_level_end || 0)}</Text>
                    </View>
                  )}
                />
              </>
            )}
          </View>

          {/* Summary */}
          <View style={[styles.fullscreenSummary, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.summaryItem} accessible accessibilityLabel={`Latest ${formatNumber(latest)}`}>
              <Text style={styles.summaryLabel}>Latest</Text>
              <Text style={styles.summaryValue}>{formatNumber(latest)}</Text>
            </View>
            <View style={styles.summaryItem} accessible accessibilityLabel={`Highest ${formatNumber(maxValue)}`}>
              <Text style={styles.summaryLabel}>Highest</Text>
              <Text style={styles.summaryValue}>{formatNumber(maxValue)}</Text>
            </View>
            <View style={styles.summaryItem} accessible accessibilityLabel={`Period ${plural(fullscreenLineData.length, 'month', 'months')}`}>
              <Text style={styles.summaryLabel}>Period</Text>
              <Text style={styles.summaryValue}>{plural(fullscreenLineData.length, 'month', 'months')}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

// Aging Bucket Bar Component
interface AgingBucketBarProps {
  bucket: string;
  data: { item_count: number; total_quantity: number; percentage: number };
  maxPercentage: number;
  styles: Styles;
  t: ThemeTokens;
}

const AgingBucketBar: React.FC<AgingBucketBarProps> = ({ bucket, data, maxPercentage, styles, t }) => {
  const kind = AGING_STATUS[bucket] ?? 'neutral';
  const tone = t.status[kind];
  const percentage = data.percentage ?? 0;
  const quantity = data.total_quantity ?? 0;
  const barWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;
  const label = AGING_LABEL[bucket] ?? `${bucket} days`;

  return (
    <View
      style={styles.bucketRow}
      accessible
      accessibilityLabel={`${label}: ${percentage.toFixed(1)}%, ${formatNumber(quantity)} units`}
    >
      <View style={styles.bucketTop}>
        <Icon name={STATUS_ICON[kind]} size={iconSize.sm} color={tone.text} />
        <Text style={styles.bucketLabel}>{label}</Text>
        <Text style={styles.bucketValue}>{`${percentage.toFixed(1)}%`}</Text>
        <Text style={styles.bucketCount}>{formatNumber(quantity)}</Text>
      </View>
      <View style={styles.bucketTrack}>
        <View style={[styles.bucketFill, { width: `${barWidth}%`, backgroundColor: tone.element }]} />
      </View>
    </View>
  );
};

// Quick Access Card Component
interface QuickAccessCardProps {
  icon: string;
  title: string;
  countLabel: string;
  onPress: () => void;
  children?: React.ReactNode;
  styles: Styles;
  t: ThemeTokens;
}

const QuickAccessCard: React.FC<QuickAccessCardProps> = ({
  icon,
  title,
  countLabel,
  onPress,
  children,
  styles,
  t,
}) => (
  <View style={styles.card}>
    <View style={styles.cardClip}>
      <Pressable
        style={({ pressed }) => [styles.quickAccessHeader, pressed && styles.quickAccessHeaderPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${countLabel}. View all`}
      >
        <View style={styles.quickAccessIcon}>
          <Icon name={icon} size={iconSize.md} color={t.brand.tint} />
        </View>
        <View style={styles.quickAccessContent}>
          <Text style={styles.quickAccessTitle}>{title}</Text>
          <Text style={styles.quickAccessCount}>{countLabel}</Text>
        </View>
        <View style={styles.quickAccessAction}>
          <Text style={styles.quickAccessActionText}>View all</Text>
          <Icon name="chevron-right" size={iconSize.sm} color={t.brand.tint} />
        </View>
      </Pressable>
      {children && <View style={styles.quickAccessPreview}>{children}</View>}
    </View>
  </View>
);

// Preview Item Row
interface PreviewItemProps {
  label: string;
  sublabel: string;
  value: string;
  status?: StatusInfo;
  styles: Styles;
  t: ThemeTokens;
}

const PreviewItem: React.FC<PreviewItemProps> = ({ label, sublabel, value, status, styles, t }) => (
  <View
    style={styles.previewItem}
    accessible
    accessibilityLabel={[label, sublabel, value, status?.label].filter(Boolean).join(', ')}
  >
    <View style={styles.previewItemContent}>
      <Text style={styles.previewItemLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.previewItemSublabel} numberOfLines={1}>
        {sublabel}
      </Text>
    </View>
    <View style={styles.previewItemRight}>
      <Text style={styles.previewItemValue}>{value}</Text>
      {status && <StatusTag status={status} styles={styles} t={t} />}
    </View>
  </View>
);

// ============================================================================
// Main Screen
// ============================================================================

export default function CustomerActivityScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

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
          logger.warn('List load failed', { error: response.error });
          setError(LIST_ERROR);
        }
      } catch (err) {
        logger.error('List load exception', err);
        setError(LIST_ERROR);
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
          logger.warn('Detail load failed', { error: response.error });
          setError(DETAIL_ERROR);
        }
      } catch (err) {
        logger.error('Detail load exception', err);
        setError(DETAIL_ERROR);
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
      setError(NO_CUSTOMER);
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
      { icon: 'account-group-outline', value: s.total_customers, label: 'Customers', variant: 'primary' },
      { icon: 'warehouse', value: formatNumber(s.total_current_stock), label: 'Stock', variant: 'primary' },
    ];
  }, [allData?.summary]);

  // KPIs for single customer detail view (3 KPIs in 1 row)
  const detailKpis: KPIItem[] = useMemo(() => {
    if (!detailData?.summary) return [];
    const s = detailData.summary;
    return [
      { icon: 'warehouse', value: formatNumber(s.current_stock), label: 'Stock', variant: 'primary' },
      { icon: 'package-down', value: s.total_grns, label: 'GRNs', variant: 'primary' },
      { icon: 'truck-delivery-outline', value: s.total_dispatches, label: 'Dispatches', variant: 'primary' },
    ];
  }, [detailData?.summary]);

  const isListView = shouldShowListView && viewMode === 'all';
  const hasData = isListView ? allData : detailData;

  const periodSelector = (
    <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={(period) => handlePeriodChange(period)} />
  );

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[t.brand.tint]}
      tintColor={t.brand.tint}
    />
  );

  // Loading
  if (isLoading && !hasData) {
    return (
      <View style={styles.container}>
        <ReportHeader title="Customer activity" />
        {periodSelector}
        <View style={styles.loadingContainer}>
          <KPIGrid
            items={[
              { icon: 'account-group-outline', value: '-', label: 'Customers', variant: 'primary' },
              { icon: 'warehouse', value: '-', label: 'Stock', variant: 'primary' },
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
    const noCustomer = error === NO_CUSTOMER;
    return (
      <View style={styles.container}>
        <ReportHeader title="Customer activity" />
        {periodSelector}
        <ReportEmptyState
          icon={noCustomer ? 'account-off-outline' : 'alert-circle-outline'}
          tone={noCustomer ? 'default' : 'error'}
          message={noCustomer ? 'No customer linked' : 'Something went wrong'}
          description={error}
          actionLabel={noCustomer ? undefined : 'Try again'}
          onAction={noCustomer ? undefined : handleRefresh}
        />
      </View>
    );
  }

  // Level 1: All Customers View
  if (isListView && allData) {
    const hasCustomers = allData.customers.length > 0;

    return (
      <View style={styles.container}>
        <ReportHeader title="Customer activity" subtitle={isStaff ? 'All customers' : 'My customers'} />
        {periodSelector}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <KPIGrid items={allCustomersKpis} isLoading={isLoading} compact />

          {hasCustomers ? (
            <View style={styles.section}>
              <SectionHeader title="Customers" styles={styles} t={t} />
              <View style={styles.card}>
                <View style={styles.cardClip}>
                  {allData.customers.map((customer, index) => (
                    <React.Fragment key={customer.customer_id}>
                      <CustomerCard
                        customer={customer}
                        onPress={() => handleCustomerSelect(customer)}
                        styles={styles}
                        t={t}
                      />
                      {index < allData.customers.length - 1 && <View style={styles.divider} />}
                    </React.Fragment>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <ReportEmptyState
              icon="account-off-outline"
              message="No customer activity"
              description="No GRNs, dispatches or invoices in this period. Try a longer period."
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // Level 2: Single Customer Detail View
  if (detailData) {
    const hasChartData = detailData.monthly_trends.length > 0;
    const grnCount = detailData.recent_grns.length;
    const dispatchCount = detailData.recent_dispatches.length;
    const itemCount = detailData.top_stock_items.length;
    const invoiceCount = detailData.recent_invoices.length;

    return (
      <View style={styles.container}>
        <ReportHeader
          title="Customer activity"
          subtitle={detailData.customer_name}
          onBack={shouldShowListView ? handleBackToAll : undefined}
        />
        {periodSelector}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <KPIGrid items={detailKpis} isLoading={isLoading} compact />

          {/* Charts Section (Collapsible) */}
          {hasChartData && (
            <View style={styles.section}>
              <SectionHeader
                title="Charts"
                onToggle={toggleCharts}
                isExpanded={chartsExpanded}
                styles={styles}
                t={t}
              />
              {chartsExpanded && (
                <View style={styles.card}>
                  <View style={styles.cardClip}>
                    <StockTrendChart trends={detailData.monthly_trends} styles={styles} t={t} />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Stock Aging Distribution */}
          {Object.keys(detailData.by_bucket).length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Stock age" styles={styles} t={t} />
              <View style={[styles.card, styles.cardPadded]}>
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
                        bucket={key}
                        data={bucket}
                        maxPercentage={maxPercentage}
                        styles={styles}
                        t={t}
                      />
                    );
                  });
                })()}
              </View>
            </View>
          )}

          {/* Quick Access Section */}
          <View style={styles.section}>
            <SectionHeader title="Quick access" styles={styles} t={t} />
            <View style={styles.quickAccessGrid}>
              {/* Recent GRNs */}
              <QuickAccessCard
                icon="package-down"
                title="Recent GRNs"
                countLabel={plural(grnCount, 'GRN', 'GRNs')}
                onPress={() => navigateToReport('grn-activity')}
                styles={styles}
                t={t}
              >
                {detailData.recent_grns.slice(0, 3).map((grn) => (
                  <PreviewItem
                    key={grn.grn_id}
                    label={`GRN ${grn.gr_no}`}
                    sublabel={formatDay(grn.grn_date)}
                    value={`${formatNumber(grn.current_stock)} of ${formatNumber(grn.total_qty)} in stock`}
                    styles={styles}
                    t={t}
                  />
                ))}
              </QuickAccessCard>

              {/* Recent Dispatches */}
              <QuickAccessCard
                icon="truck-delivery-outline"
                title="Recent dispatches"
                countLabel={plural(dispatchCount, 'dispatch', 'dispatches')}
                onPress={() => navigateToReport('dispatch-activity')}
                styles={styles}
                t={t}
              >
                {detailData.recent_dispatches.slice(0, 3).map((disp) => (
                  <PreviewItem
                    key={disp.dispatch_id}
                    label={`Dispatch ${disp.dispatch_no}`}
                    sublabel={formatDay(disp.dispatch_date)}
                    value={formatNumber(disp.total_qty)}
                    styles={styles}
                    t={t}
                  />
                ))}
              </QuickAccessCard>

              {/* Top Stock Items */}
              <QuickAccessCard
                icon="cube-outline"
                title="Top stock items"
                countLabel={plural(itemCount, 'item', 'items')}
                onPress={() => navigateToReport('stock-aging')}
                styles={styles}
                t={t}
              >
                {detailData.top_stock_items.slice(0, 3).map((item, idx) => (
                  <PreviewItem
                    key={`${item.item_name}-${idx}`}
                    label={item.item_name}
                    sublabel={plural(item.grn_count, 'GRN', 'GRNs')}
                    value={formatNumber(item.total_stock)}
                    styles={styles}
                    t={t}
                  />
                ))}
              </QuickAccessCard>

              {/* Recent Invoices */}
              <QuickAccessCard
                icon="file-document-outline"
                title="Recent invoices"
                countLabel={plural(invoiceCount, 'invoice', 'invoices')}
                onPress={() => navigateToReport('invoice-history')}
                styles={styles}
                t={t}
              >
                {detailData.recent_invoices.slice(0, 3).map((inv) => (
                  <PreviewItem
                    key={inv.invoice_id}
                    label={`Invoice ${inv.invoice_number}`}
                    sublabel={formatDay(inv.invoice_date)}
                    value={formatCurrency(inv.net_total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    status={invoiceStatus(inv.status)}
                    styles={styles}
                    t={t}
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
    <View style={styles.container}>
      <ReportHeader title="Customer activity" />
      {periodSelector}
      <ReportEmptyState
        icon="account-off-outline"
        message="No customer activity"
        description="No GRNs, dispatches or invoices in this period. Try a longer period."
      />
    </View>
  );
}
