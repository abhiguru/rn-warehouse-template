/**
 * StockTrendChart: a customer's stock at the end of each month of a report's
 * period, as a line, with a full-screen view that shows the same values as a
 * chart or as a table (docs/STYLE_GUIDE.md §11.3, "charts have a text summary
 * and a table alternative"; §13.11).
 *
 * - A month that is over has the figure the server worked out for its end. The
 *   month in progress has no end yet: its point is the stock now, the figure of
 *   the screen's Stock tile (`currentStock`), so the line ends where the tile
 *   is and "Latest" and "Highest" cannot contradict it (`trendStockLevels`).
 *   The summary, the table row and its read-out call that point the stock "as
 *   of" today, never a month end; months after this one (a financial year that
 *   runs to March) are not drawn at all (`visibleTrend`, SR-11).
 * - One series, in the first chart colour; axes and grid in `border.divider`,
 *   axis labels `caption1` `text.secondary`, the y axis in the language's
 *   number format with its unit (bags) over it. "Highest" is the highest
 *   of the points drawn, not the axis top (a period of 0 says 0). The axis
 *   leaves a fifth above the highest point, so its label is not cut off at
 *   the top (`chartAxis`).
 * - The card is one button that opens the full screen; its label is the text
 *   summary. With no months to draw, the card says so and is not a button.
 * - The chart / table switch is a segmented control whose segments are each a
 *   full touch target (§11.2), not a short segment padded by hitSlop inside a
 *   parent that clips it.
 *
 * It draws no card of its own: the screen puts it in one.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-gifted-charts';
import { useReducedMotion } from 'react-native-reanimated';
import { makeTableStyles } from '@/components/common/DetailTable';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t as tr } from '@/i18n';
import { fontWeight, iconSize, layout, radius, singleLineText, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { MonthlyTrendPoint } from '@/types/report.types';
import { formatCount, formatIndiaDate, formatMonth, formatNumber, indiaDay, toDate } from '@/utils/formatters';

export interface StockTrendChartProps {
  /** Months of the period, oldest first. */
  trends: MonthlyTrendPoint[];
  /**
   * The customer's stock now, as the screen's Stock tile shows it. It is the point of the month
   * in progress. Left out, every month keeps the server's figure.
   */
  currentStock?: number;
}

/** The month it is in India, as a trend names its months ("2026-10"). */
const monthNow = () => indiaDay(new Date()).slice(0, 7);

/** A trend month the calendar can place ("2026-10"). */
const isMonth = (month: string) => /^\d{4}-\d{2}$/.test(month);

/**
 * The stock drawn for each month of a trend.
 *
 * The server sends, for every month, what was received less what was dispatched up to the month's
 * last day. For a month that is over that is its month-end stock. For the month in progress it is
 * a second reckoning of the stock now, and it need not equal the stock the server keeps on its
 * GRNs, which is what the Stock tile shows: on a phone the tile said 4,460 while the trend ended
 * at 4,360 and called 4,444 its highest. The stock now has one figure, so the month in progress
 * takes `currentStock`. A later month is not given it (`visibleTrend` leaves such months out).
 */
export function trendStockLevels(trends: readonly MonthlyTrendPoint[], currentStock?: number, thisMonth: string = monthNow()): number[] {
  const stockNow = typeof currentStock === 'number' && Number.isFinite(currentStock) ? currentStock : null;
  return trends.map(point => (stockNow !== null && point.month === thisMonth ? stockNow : point.stock_level_end || 0));
}

export interface VisibleTrend {
  /** The months to draw: those of the period up to this one. */
  points: MonthlyTrendPoint[];
  /** Their stock, as `trendStockLevels` gives it. */
  values: number[];
  /** The month in progress among them, or -1: its figure is the stock as of today, not a month end. */
  nowIndex: number;
}

/**
 * The months a trend draws. The server sends every month of the period, also those to come ("This
 * financial year" runs to March): those have no stock yet, so they are left out rather than drawn
 * at today's figure as if it were their month end. A month the calendar cannot place is kept.
 */
export function visibleTrend(trends: readonly MonthlyTrendPoint[], currentStock?: number, thisMonth: string = monthNow()): VisibleTrend {
  const points = trends.filter(point => !(isMonth(point.month) && point.month > thisMonth));
  return { points, values: trendStockLevels(points, currentStock, thisMonth), nowIndex: points.findIndex(point => point.month === thisMonth) };
}

/** The steps an axis may take, times a power of ten. */
const NICE_STEPS = [1, 2, 2.5, 5];
/** The smallest step: a flat or small line still gets a readable scale. */
const MIN_AXIS_STEP = 100;
/** The top of the axis is at least this much over the highest point, so its label has room. */
const AXIS_HEADROOM = 1.2;

/**
 * The top and the step of a chart's y axis: `sections` equal steps of 1, 2, 2.5 or 5 times a power
 * of ten (at least 100), reaching at least a fifth above `highest`. The label over the highest point
 * then sits inside the chart instead of being cut at its top edge.
 */
export function chartAxis(highest: number, sections: number): { maxValue: number; stepValue: number } {
  const needed = Math.max((Math.max(highest, 0) * AXIS_HEADROOM) / sections, MIN_AXIS_STEP);
  const scale = 10 ** Math.floor(Math.log10(needed));
  const stepValue = NICE_STEPS.map(step => step * scale).find(step => step >= needed) ?? 10 * scale;
  return { maxValue: stepValue * sections, stepValue };
}

/** The steps of the card's small chart and of the full-screen one. */
const COMPACT_SECTIONS = 3;
const FULL_SECTIONS = 5;

/** "Oct 2026" for a "2026-10" trend month (guide §12.3). */
const monthYear = (month: string) => (toDate(`${month}-01`) ? formatMonth(`${month}-01`, 'short') : month);
/** "Oct": the month alone, for the axis. */
const shortMonth = (month: string) => (toDate(`${month}-01`) ? formatMonth(`${month}-01`, 'narrow') : month);
/** An axis number as the language writes numbers ("1,200", "૧,૨૦૦"). */
export const formatAxisLabel = (label: string): string => {
  const value = Number(label);
  return Number.isFinite(value) ? formatNumber(Math.round(value)) : localizeDigits(label);
};

/** Which of `total` points get a month label: at most `max`, always the first and the last. */
function labelIndices(total: number, max: number): Set<number> {
  if (total <= max) return new Set(Array.from({ length: total }, (_, index) => index));
  const indices = new Set([0, total - 1]);
  const step = (total - 1) / (max - 1);
  for (let index = 1; index < max - 1; index += 1) indices.add(Math.round(step * index));
  return indices;
}

const makeStyles = (t: ThemeTokens) => ({
  card: { padding: space.lg, gap: space.sm },
  cardPressed: { backgroundColor: t.surface.cardPressed },
  header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: space.sm },
  title: { ...typography.headline, color: t.text.primary, flex: 1 },
  expand: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  expandText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.brand.tint },
  axisUnit: { ...typography.caption1, color: t.text.secondary },
  axisLabel: { ...typography.caption1, color: t.text.secondary },
  axisLabelX: { width: 32 },
  summary: { ...typography.footnote, color: t.text.secondary },
  empty: { ...typography.subhead, color: t.text.secondary },

  // Full screen
  screen: { flex: 1, backgroundColor: t.background.base },
  screenHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.xs,
    paddingBottom: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  close: { width: touchTarget, height: touchTarget, justifyContent: 'center' as const, alignItems: 'center' as const, borderRadius: radius.pill },
  closePressed: { backgroundColor: t.brand.subtle },
  screenTitle: { ...typography.headline, color: t.text.primary, flex: 1, textAlign: 'center' as const },
  toolbar: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    gap: space.md,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  segmented: { flexDirection: 'row' as const, borderRadius: radius.button, borderWidth: 1, borderColor: t.border.button, overflow: 'hidden' as const },
  // Each segment is a whole touch target: the parent clips, so a hitSlop would not reach outside it.
  segment: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.card,
  },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: t.border.button },
  segmentPressed: { backgroundColor: t.brand.subtle },
  segmentSelected: { backgroundColor: t.brand.fill },
  segmentText: { ...typography.callout, color: t.text.primary },
  segmentTextSelected: { fontWeight: fontWeight.semibold, color: t.brand.onFill },
  instructions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  instructionText: { ...typography.caption1, color: t.text.secondary, flex: 1 },
  body: { flex: 1, backgroundColor: t.surface.card },
  chartArea: { flex: 1, justifyContent: 'center' as const, paddingHorizontal: layout.marginCompact },
  chartScroll: { alignItems: 'flex-start' as const, paddingVertical: space.xl, gap: space.xs },
  tableCell: { ...typography.subhead, color: t.text.primary },
  // Under the month in progress: its figure is the stock as of today, not a month end.
  asOf: { ...typography.caption1, color: t.text.secondary },
  tableNote: { ...typography.footnote, color: t.text.secondary, paddingHorizontal: space.md, paddingVertical: space.md },
  totals: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    paddingTop: space.lg,
    paddingHorizontal: layout.marginCompact,
    backgroundColor: t.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
  },
  total: { alignItems: 'center' as const },
  totalLabel: { ...typography.footnote, color: t.text.secondary, marginBottom: space.xs },
  totalValue: { ...typography.title3, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
});

/** A row of the table view: the month, and the stock the chart draws for it (the month in progress is "as of" today). */
interface TrendRow {
  id: string;
  month: string;
  stock: number;
  now: boolean;
}

const trendHelper = createAppColumnHelper<TrendRow>();

/**
 * The table view of the full screen: Month | Stock at month end, one row per point of the chart. Built on the app's
 * TanStack Table setup and drawn by the shared `DataTable` (§13.7); not sortable, the months are in time order.
 */
function TrendTable({ points, values, nowIndex, asOf }: { points: MonthlyTrendPoint[]; values: number[]; nowIndex: number; asOf: string }) {
  const styles = useThemedStyles(makeStyles);
  const cell = useThemedStyles(makeTableStyles);
  const rows = useMemo<TrendRow[]>(
    () => points.map((point, index) => ({ id: point.month, month: monthYear(point.month), stock: values[index], now: index === nowIndex })),
    [points, values, nowIndex]
  );
  const columns = useMemo(
    () =>
      trendHelper.columns([
        trendHelper.accessor('month', {
          header: tr('reports.customerActivity.trend.month'),
          meta: { width: 'grow' },
          cell: info => (
            <View>
              <Text style={styles.tableCell}>{info.getValue()}</Text>
              {info.row.original.now ? <Text style={styles.asOf}>{tr('reports.customerActivity.trend.asOf', { date: asOf })}</Text> : null}
            </View>
          ),
        }),
        trendHelper.accessor('stock', {
          header: tr('reports.customerActivity.trend.stockAtMonthEnd'),
          meta: { width: 'grow', numeric: true },
          cell: info => <Text style={cell.number}>{formatNumber(info.getValue())}</Text>,
        }),
      ]),
    [styles, cell, asOf]
  );
  const table = useAppTable({ columns, data: rows, getRowId: row => row.id });

  return (
    <DataTable
      table={table}
      variant="card"
      list="flat"
      // The values the chart draws, the month in progress included: that one is not a month end.
      rowLabel={row =>
        row.original.now
          ? tr('reports.customerActivity.trend.rowNowA11y', { month: row.original.month, date: asOf, stock: formatNumber(row.original.stock) })
          : `${row.original.month}, ${formatNumber(row.original.stock)}`
      }
      rowTestID={row => `stock-trend-row-${row.id}`}
      footer={
        nowIndex >= 0 ? (
          <Text style={styles.tableNote}>
            {tr('reports.customerActivity.trend.footnoteNow', { month: rows[nowIndex].month, date: asOf })}
          </Text>
        ) : null
      }
      testID="stock-trend-table"
    />
  );
}

export function StockTrendChart({ trends, currentStock }: StockTrendChartProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  // Reduce Motion: the full-screen chart fades in instead of sliding (§9).
  const reduceMotion = useReducedMotion();
  // One list of months and values for the line, the table, the summary and the figures under the chart.
  const { points, values, nowIndex } = useMemo(() => visibleTrend(trends, currentStock), [trends, currentStock]);

  if (points.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">
          {tr('reports.customerActivity.trend.title')}
        </Text>
        <Text style={styles.empty}>{tr('reports.customerActivity.trend.empty')}</Text>
      </View>
    );
  }

  const seriesColour = t.chart[0];
  const shown = labelIndices(points.length, 4);
  const lineData = points.map((point, index) => ({
    value: values[index],
    label: shown.has(index) ? shortMonth(point.month) : '',
    dataPointText: formatNumber(values[index]),
  }));
  const fullData = points.map((point, index) => ({ value: values[index], label: shortMonth(point.month), dataPointText: formatNumber(values[index]) }));

  // The highest point drawn: 0 when every month was 0. The axis has its own floor,
  // so a flat line still has a scale, and that floor is never shown as a value.
  const highest = Math.max(...values, 0);
  const compactAxis = chartAxis(highest, COMPACT_SECTIONS);
  const fullAxis = chartAxis(highest, FULL_SECTIONS);
  const first = values[0];
  const latest = values[values.length - 1];
  const last = points.length - 1;
  // The trend ends with the month in progress: its figure is the stock as of today (India's day).
  const endsNow = nowIndex >= 0 && nowIndex === last;
  const asOf = formatIndiaDate(new Date(), 'short');
  const summary = (() => {
    if (points.length === 1) {
      return endsNow
        ? tr('reports.customerActivity.trend.summaryNow', { date: asOf, stock: formatNumber(latest) })
        : tr('reports.customerActivity.trend.summaryOne', { month: monthYear(points[0].month), stock: formatNumber(latest) });
    }
    if (!endsNow) {
      return tr('reports.customerActivity.trend.summaryRange', {
        first: formatNumber(first),
        firstMonth: monthYear(points[0].month),
        latest: formatNumber(latest),
        lastMonth: monthYear(points[last].month),
        highest: formatNumber(highest),
      });
    }
    // The last month that is over has a month end; the one in progress has the stock as of today.
    const lastEnd = { lastEnd: formatNumber(values[last - 1]), lastMonth: monthYear(points[last - 1].month), latest: formatNumber(latest), date: asOf };
    return points.length === 2
      ? tr('reports.customerActivity.trend.summaryOneNow', lastEnd)
      : tr('reports.customerActivity.trend.summaryRangeNow', { ...lastEnd, first: formatNumber(first), firstMonth: monthYear(points[0].month), highest: formatNumber(highest) });
  })();

  // Wide enough for the largest axis number of either chart, as the language writes it.
  const yAxisLabelWidth = Math.max(32, formatAxisLabel(String(Math.max(compactAxis.maxValue, fullAxis.maxValue))).length * 8 + 4);
  const chartWidth = screenWidth - 2 * layout.marginCompact - 2 * space.lg - yAxisLabelWidth;
  const spacing = lineData.length > 1 ? Math.max(20, (chartWidth - 40) / (lineData.length - 1)) : 40;
  const axisProps = {
    color: seriesColour,
    dataPointsColor: seriesColour,
    curved: true,
    xAxisColor: t.border.divider,
    yAxisColor: t.border.divider,
    rulesColor: t.border.divider,
    xAxisLabelTextStyle: [styles.axisLabel, styles.axisLabelX],
    yAxisTextStyle: styles.axisLabel,
    yAxisLabelWidth,
    yAxisOffset: 0,
    formatYLabel: formatAxisLabel,
  };

  const close = () => {
    setFullscreen(false);
    setView('chart');
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => setFullscreen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr('reports.customerActivity.trend.label', { summary })}
        accessibilityHint={tr('reports.customerActivity.trend.hint')}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{tr('reports.customerActivity.trend.title')}</Text>
          <View style={styles.expand}>
            <Icon name="arrow-expand" size={iconSize.sm} color={t.brand.tint} />
            <Text style={styles.expandText}>{tr('reports.customerActivity.trend.expand')}</Text>
          </View>
        </View>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={styles.axisUnit}>{tr('filters.unit.bags')}</Text>
          <LineChart
            {...axisProps}
            data={lineData}
            width={chartWidth}
            height={120}
            thickness={2}
            hideDataPoints={lineData.length > 8}
            dataPointsRadius={4}
            maxValue={compactAxis.maxValue}
            stepValue={compactAxis.stepValue}
            noOfSections={COMPACT_SECTIONS}
            hideRules
            spacing={spacing}
            initialSpacing={20}
            endSpacing={20}
            adjustToWidth
          />
        </View>
        <Text style={styles.summary}>{summary}</Text>
      </Pressable>

      <Modal visible={fullscreen} animationType={reduceMotion ? 'fade' : 'slide'} presentationStyle="fullScreen" onRequestClose={close}>
        <View style={styles.screen}>
          <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} active={fullscreen} />
          <View style={[styles.screenHeader, { paddingTop: insets.top + space.xs }]}>
            <Pressable
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={tr('reports.customerActivity.trend.close')}
            >
              <Icon name="close" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
            <Text style={styles.screenTitle} accessibilityRole="header">
              {tr('reports.customerActivity.trend.title')}
            </Text>
            <View style={styles.close} />
          </View>

          <View style={styles.toolbar}>
            <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={tr('reports.customerActivity.trend.showAs')}>
              {(['chart', 'table'] as const).map((option, index) => {
                const selected = view === option;
                return (
                  <Pressable
                    key={option}
                    style={({ pressed }) => [styles.segment, index > 0 && styles.segmentDivider, pressed && !selected && styles.segmentPressed, selected && styles.segmentSelected]}
                    onPress={() => setView(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={tr(option === 'chart' ? 'reports.customerActivity.trend.chart' : 'reports.customerActivity.trend.tableOfValues')}
                  >
                    <Icon name={option === 'chart' ? 'chart-line' : 'table'} size={iconSize.sm} color={selected ? t.brand.onFill : t.icon.primary} />
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} {...singleLineText()}>
                      {tr(option === 'chart' ? 'reports.customerActivity.trend.chart' : 'reports.customerActivity.trend.table')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {view === 'chart' ? (
              <View style={styles.instructions}>
                <Icon name="gesture-swipe-horizontal" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.instructionText}>{tr('reports.customerActivity.trend.instructions')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.body}>
            {view === 'chart' ? (
              <View style={styles.chartArea}>
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chartScroll}>
                  <Text style={styles.axisUnit}>{tr('filters.unit.bags')}</Text>
                  <LineChart
                    {...axisProps}
                    data={fullData}
                    width={Math.max(screenWidth - 40, fullData.length * 60)}
                    height={screenHeight * 0.5}
                    thickness={3}
                    dataPointsRadius={6}
                    textColor={t.text.primary}
                    textFontSize={typography.caption1.fontSize}
                    textShiftY={-10}
                    textShiftX={-5}
                    maxValue={fullAxis.maxValue}
                    stepValue={fullAxis.stepValue}
                    noOfSections={FULL_SECTIONS}
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
              <TrendTable points={points} values={values} nowIndex={nowIndex} asOf={asOf} />
            )}
          </View>

          <View style={[styles.totals, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.total} accessible accessibilityLabel={tr('reports.customerActivity.trend.latestLabel', { value: formatNumber(latest) })}>
              <Text style={styles.totalLabel}>{tr('reports.customerActivity.trend.latest')}</Text>
              <Text style={styles.totalValue}>{formatNumber(latest)}</Text>
            </View>
            <View style={styles.total} accessible accessibilityLabel={tr('reports.customerActivity.trend.highestLabel', { value: formatNumber(highest) })}>
              <Text style={styles.totalLabel}>{tr('reports.customerActivity.trend.highest')}</Text>
              <Text style={styles.totalValue}>{formatNumber(highest)}</Text>
            </View>
            <View style={styles.total} accessible accessibilityLabel={tr('reports.customerActivity.trend.periodLabel', { value: formatCount(points.length, 'month') })}>
              <Text style={styles.totalLabel}>{tr('reports.customerActivity.trend.period')}</Text>
              <Text style={styles.totalValue}>{formatCount(points.length, 'month')}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default StockTrendChart;
