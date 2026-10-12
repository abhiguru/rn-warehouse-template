/**
 * StockTrendChart: a customer's stock at the end of each month of a report's
 * period, as a line, with a full-screen view that shows the same values as a
 * chart or as a table (docs/STYLE_GUIDE.md §11.3, "charts have a text summary
 * and a table alternative"; §13.11).
 *
 * - One series, in the first chart colour; axes and grid in `border.divider`,
 *   axis labels `caption1` `text.secondary`, the y axis in the language's
 *   number format with its unit over it.
 * - The card is one button that opens the full screen; its label is the text
 *   summary. With no months to draw, the card says so and is not a button.
 * - The chart / table switch is a segmented control whose segments are each a
 *   full touch target (§11.2), not a short segment padded by hitSlop inside a
 *   parent that clips it.
 *
 * It draws no card of its own: the screen puts it in one.
 */
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-gifted-charts';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t as tr } from '@/i18n';
import { fontWeight, iconSize, layout, radius, singleLineText, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { MonthlyTrendPoint } from '@/types/report.types';
import { formatCount, formatMonth, formatNumber, toDate } from '@/utils/formatters';

export interface StockTrendChartProps {
  /** Months of the period, oldest first. */
  trends: MonthlyTrendPoint[];
}

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
  tableHeader: {
    flexDirection: 'row' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.background.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  tableHeaderText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.secondary },
  tableRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.s6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  tableCell: { ...typography.subhead, color: t.text.primary },
  colLabel: { flex: 1 },
  colNumber: { flex: 1, textAlign: 'right' as const, fontVariant: ['tabular-nums' as const] },
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

export function StockTrendChart({ trends }: StockTrendChartProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  if (trends.length === 0) {
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
  const shown = labelIndices(trends.length, 4);
  const values = trends.map(point => point.stock_level_end || 0);
  const lineData = trends.map((point, index) => ({
    value: values[index],
    label: shown.has(index) ? shortMonth(point.month) : '',
    dataPointText: formatNumber(values[index]),
  }));
  const fullData = trends.map((point, index) => ({ value: values[index], label: shortMonth(point.month), dataPointText: formatNumber(values[index]) }));

  const highest = Math.max(...values, 1);
  const roundedMax = Math.ceil(highest / 100) * 100 || 100;
  const first = values[0];
  const latest = values[values.length - 1];
  const summary =
    trends.length === 1
      ? tr('reports.customerActivity.trend.summaryOne', { month: monthYear(trends[0].month), stock: formatNumber(latest) })
      : tr('reports.customerActivity.trend.summaryRange', {
          first: formatNumber(first),
          firstMonth: monthYear(trends[0].month),
          latest: formatNumber(latest),
          lastMonth: monthYear(trends[trends.length - 1].month),
          highest: formatNumber(highest),
        });

  // Wide enough for the largest axis number as the language writes it.
  const yAxisLabelWidth = Math.max(32, formatAxisLabel(String(roundedMax)).length * 8 + 4);
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
    maxValue: roundedMax,
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
          <Text style={styles.axisUnit}>{tr('reports.shared.units')}</Text>
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
            spacing={spacing}
            initialSpacing={20}
            endSpacing={20}
            adjustToWidth
          />
        </View>
        <Text style={styles.summary}>{summary}</Text>
      </Pressable>

      <Modal visible={fullscreen} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
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
                  <Text style={styles.axisUnit}>{tr('reports.shared.units')}</Text>
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
                  <Text style={[styles.tableHeaderText, styles.colLabel]}>{tr('reports.customerActivity.trend.month')}</Text>
                  <Text style={[styles.tableHeaderText, styles.colNumber]}>{tr('reports.customerActivity.trend.stockAtMonthEnd')}</Text>
                </View>
                <FlatList
                  data={trends}
                  keyExtractor={item => item.month}
                  renderItem={({ item }) => (
                    <View style={styles.tableRow} accessible accessibilityLabel={`${monthYear(item.month)}, ${formatNumber(item.stock_level_end || 0)}`}>
                      <Text style={[styles.tableCell, styles.colLabel]}>{monthYear(item.month)}</Text>
                      <Text style={[styles.tableCell, styles.colNumber]}>{formatNumber(item.stock_level_end || 0)}</Text>
                    </View>
                  )}
                />
              </>
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
            <View style={styles.total} accessible accessibilityLabel={tr('reports.customerActivity.trend.periodLabel', { value: formatCount(trends.length, 'month') })}>
              <Text style={styles.totalLabel}>{tr('reports.customerActivity.trend.period')}</Text>
              <Text style={styles.totalValue}>{formatCount(trends.length, 'month')}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default StockTrendChart;
