/**
 * Sensor History Chart Component
 * Dual-line chart showing temperature and humidity trends.
 *
 * Follows docs/STYLE_GUIDE.md §13.11: series colours come from `tokens.chart` in
 * order (temperature first, humidity second), thresholds are dashed lines in
 * `status.critical.element` / `status.negative.element` with labels, axes and grid
 * use `border.divider` and axis labels `caption1` in `text.secondary`. The card
 * shows a text summary, and the full-screen view has a values table.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
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
import type { SensorHistoryReading, SensorChartDataPoint } from '@/types/sensor-history.types';
import { formatCount, formatDate, formatDateTime, formatTemperature, toDate } from '@/utils/formatters';

/** A limit drawn on the temperature scale as a dashed, labelled line. */
export interface SensorChartThreshold {
  /** Temperature in °C */
  value: number;
  /** `critical` = near the limit, `negative` = alarm */
  level: 'critical' | 'negative';
  /** Label shown on the line, e.g. "Max 8°C" */
  label: string;
}

interface SensorHistoryChartProps {
  readings: SensorHistoryReading[];
  aggregationInterval: string;
  periodDays: number;
  /** Optional temperature thresholds (at most two are drawn). */
  thresholds?: SensorChartThreshold[];
}

// ============================================================================
// Formatting (guide §12.3)
// ============================================================================

export { formatTemperature };

/** Humidity as a whole percentage: 85% */
export function formatHumidity(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

/** "9 Oct 2026" or "9 Oct 2026, 4:05 pm" (guide §12.3) */
function formatReadingTime(timestamp: string, withTime: boolean): string {
  return withTime ? formatDateTime(timestamp) : formatDate(timestamp);
}

/** A reading value, or null when the sensor sent nothing for that interval. */
function present(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !isNaN(value);
}

/** Temperature axis: bottom, top and number of sections. */
export interface TemperatureDomain {
  min: number;
  max: number;
  sections: number;
}

/**
 * The temperature axis comes from the data: the lowest and highest reading
 * (and any threshold), padded by a tenth of the range (at least 1°C) and
 * rounded out to whole steps. Zero is on the axis only when the data
 * crosses it, so a −20°C cold room is not squashed against a 0°C floor.
 */
export function temperatureDomain(
  readings: SensorHistoryReading[],
  thresholds: number[] = [],
  sections = 4
): TemperatureDomain {
  const values = [...readings.map(r => r.temperature).filter(present), ...thresholds];
  if (values.length === 0) return { min: 0, max: 10, sections };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.1, 1);
  const rawStep = (hi - lo + 2 * pad) / sections;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(m => m >= rawStep) ?? 10 * magnitude;
  let min = Math.floor((lo - pad) / step) * step;
  let max = Math.ceil((hi + pad) / step) * step;
  // Padding alone must not pull zero onto the axis when every value is on one side of it.
  if (lo >= 0 && min < 0) min = 0;
  if (hi <= 0 && max > 0) max = 0;
  return { min, max, sections: Math.max(1, Math.round((max - min) / step)) };
}

/** Y-axis label with a true minus sign: "−20". */
function formatAxisLabel(label: string): string {
  const n = Number(label);
  if (isNaN(n)) return label;
  const rounded = Math.round(n * 10) / 10;
  const text = String(Math.abs(rounded));
  return rounded < 0 ? `\u2212${text}` : text;
}

const INTERVAL_LABELS: Record<string, string> = {
  '1 hour': 'Hourly',
  '2 hours': '2-hour',
  '4 hours': '4-hour',
  '1 day': 'Daily',
  '1 week': 'Weekly',
};

interface SeriesStats {
  min: number;
  max: number;
  avg: number;
}

function statsOf(values: Array<number | null>): SeriesStats | null {
  const present = values.filter((v): v is number => v !== null && !isNaN(v));
  if (present.length === 0) return null;
  const sum = present.reduce((a, b) => a + b, 0);
  return { min: Math.min(...present), max: Math.max(...present), avg: sum / present.length };
}

/** Plain-language summary of the chart, shown under it and read by screen readers. */
export function summariseReadings(readings: SensorHistoryReading[], intervalLabel: string): string {
  const temp = statsOf(readings.map(r => r.temperature));
  const hum = statsOf(readings.map(r => r.humidity));
  const parts: string[] = [];
  if (temp) {
    parts.push(
      `Temperature ${formatTemperature(temp.min)} to ${formatTemperature(temp.max)}, average ${formatTemperature(temp.avg)}.`
    );
  }
  if (hum) {
    parts.push(
      `Humidity ${formatHumidity(hum.min)} to ${formatHumidity(hum.max)}, average ${formatHumidity(hum.avg)}.`
    );
  }
  const count = readings.length;
  parts.push(`${formatCount(count, 'reading')}, ${intervalLabel.toLowerCase()} averages.`);
  return parts.join(' ');
}

// ============================================================================
// Styles
// ============================================================================

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    chartCard: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      padding: space.lg,
      marginHorizontal: layout.marginCompact,
      marginVertical: space.sm,
      ...t.shadow[2],
    },
    chartCardPressed: {
      backgroundColor: t.surface.cardPressed,
    },
    chartHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: space.sm,
      marginBottom: space.sm,
    },
    chartHeaderText: {
      flex: 1,
    },
    chartTitle: {
      ...typography.headline,
      color: t.text.primary,
    },
    chartSubtitle: {
      ...typography.footnote,
      color: t.text.secondary,
      marginTop: space.xxs,
    },
    expandHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      minHeight: touchTarget,
    },
    expandText: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      color: t.brand.tint,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.lg,
      marginBottom: space.md,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s6,
    },
    legendSwatch: {
      width: space.md,
      height: 3,
      borderRadius: radius.pill,
    },
    legendText: {
      ...typography.caption1,
      color: t.text.secondary,
    },
    axisLabel: {
      ...typography.caption1,
      color: t.text.secondary,
    },
    thresholdLabel: {
      ...typography.caption1,
      fontWeight: fontWeight.semibold,
    },
    summary: {
      ...typography.footnote,
      color: t.text.secondary,
      marginTop: space.md,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      padding: space.huge,
      marginHorizontal: layout.marginCompact,
      marginVertical: space.sm,
      borderRadius: radius.card,
      backgroundColor: t.surface.card,
      ...t.shadow[2],
    },
    emptyTitle: {
      ...typography.headline,
      color: t.text.primary,
      textAlign: 'center',
    },
    emptyText: {
      ...typography.subhead,
      color: t.text.secondary,
      textAlign: 'center',
    },

    // Full screen
    fullscreenContainer: {
      flex: 1,
      backgroundColor: t.background.base,
    },
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
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    closeButtonPressed: {
      backgroundColor: t.brand.subtle,
    },
    fullscreenTitle: {
      ...typography.headline,
      color: t.text.primary,
      flex: 1,
      textAlign: 'center',
    },
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
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: space.xs,
      backgroundColor: t.surface.card,
    },
    segmentDivider: {
      borderLeftWidth: 1,
      borderLeftColor: t.border.button,
    },
    segmentPressed: {
      backgroundColor: t.brand.subtle,
    },
    segmentSelected: {
      backgroundColor: t.brand.fill,
    },
    segmentText: {
      ...typography.callout,
      color: t.text.primary,
    },
    segmentTextSelected: {
      fontWeight: fontWeight.semibold,
      color: t.brand.onFill,
    },
    instructions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    instructionText: {
      ...typography.caption1,
      color: t.text.secondary,
      flex: 1,
    },
    fullscreenChartContainer: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: space.sm,
      backgroundColor: t.surface.card,
    },
    fullscreenScroll: {
      alignItems: 'center',
      paddingVertical: space.lg,
    },
    tableHeader: {
      flexDirection: 'row',
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.sm,
      backgroundColor: t.background.base,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.separator,
    },
    tableHeaderText: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      color: t.text.secondary,
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 36,
      paddingHorizontal: layout.marginCompact,
      paddingVertical: space.s6,
      backgroundColor: t.surface.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    tableCell: {
      ...typography.subhead,
      color: t.text.primary,
    },
    colTime: {
      flex: 2,
    },
    colNumber: {
      flex: 1,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    footer: {
      paddingHorizontal: layout.marginCompact,
      paddingTop: space.md,
      backgroundColor: t.surface.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.separator,
      gap: space.xs,
    },
    footerText: {
      ...typography.footnote,
      color: t.text.secondary,
    },
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// Pieces
// ============================================================================

function Legend({ styles, tempColour, humidityColour, withUnits }: {
  styles: Styles; tempColour: string; humidityColour: string; withUnits?: boolean;
}) {
  return (
    <View style={styles.legend} accessible accessibilityLabel="Legend: temperature line and humidity line">
      <View style={styles.legendItem}>
        <View style={[styles.legendSwatch, { backgroundColor: tempColour }]} />
        <Text style={styles.legendText}>{withUnits ? 'Temperature (°C)' : 'Temperature'}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendSwatch, { backgroundColor: humidityColour }]} />
        <Text style={styles.legendText}>
          {withUnits ? 'Humidity (%, scaled to the temperature axis)' : 'Humidity'}
        </Text>
      </View>
    </View>
  );
}

type FullscreenView = 'chart' | 'table';

// ============================================================================
// Component
// ============================================================================

export const SensorHistoryChart: React.FC<SensorHistoryChartProps> = ({
  readings,
  aggregationInterval,
  periodDays,
  thresholds = [],
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenView, setFullscreenView] = useState<FullscreenView>('chart');

  // Series colours: chart palette in order (guide §3.2, §13.11)
  const tempColour = t.chart[0];
  const humidityColour = t.chart[1];

  // Calculate which indices should show labels (max 5 for compact, more for fullscreen)
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

  // Axis label: "9 Oct" for up to 90 days, then the month ("Oct", or "Oct 2026" full screen)
  const formatLabel = (timestamp: string, compact: boolean = true): string => {
    const date = toDate(timestamp);
    if (!date) return '';
    if (periodDays <= 90) return formatDate(date, 'short');
    const [, month, year] = formatDate(date, 'medium').split(' ');
    return compact ? month : `${month} ${year}`;
  };

  // Prepare chart data. A missing reading has no value, so the line breaks
  // there (interpolateMissingValues is off) instead of dropping to zero.
  const thresholdValues = thresholds.slice(0, 2).map(line => line.value);
  const domain = useMemo(
    () => temperatureDomain(readings, thresholdValues),
    [readings, thresholdValues.join(',')]
  );
  const maxHumidity = useMemo(() => {
    const maxH = Math.max(...readings.map(r => r.humidity).filter(present), 1);
    return Math.ceil(maxH / 10) * 10 || 100;
  }, [readings]);

  const buildSeries = (maxLabels: number, compactLabels: boolean) => {
    const labelIndices = getLabelIndices(readings.length, maxLabels);
    const span = domain.max - domain.min;
    const temp: SensorChartDataPoint[] = readings.map((r, index) => ({
      value: present(r.temperature) ? r.temperature : undefined,
      label: labelIndices.has(index) ? formatLabel(r.timestamp, compactLabels) : '',
      dataPointText: formatTemperature(r.temperature),
    }));
    // Humidity is drawn on the temperature scale so both lines share one axis:
    // 0% sits at the bottom of the axis and the top humidity step at the top.
    const humidity: SensorChartDataPoint[] = readings.map((r) => ({
      value: present(r.humidity) ? domain.min + (r.humidity / maxHumidity) * span : undefined,
      label: '', // Only show labels on temp line
      dataPointText: formatHumidity(r.humidity),
    }));
    return { temp, humidity };
  };

  const compactData = useMemo(() => buildSeries(5, true), [readings, periodDays, domain, maxHumidity]);
  // Fullscreen data with more labels
  const fullscreenData = useMemo(() => buildSeries(10, false), [readings, periodDays, domain, maxHumidity]);

  const intervalLabel = INTERVAL_LABELS[aggregationInterval] || aggregationInterval;
  const summary = useMemo(() => summariseReadings(readings, intervalLabel), [readings, intervalLabel]);

  if (readings.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="chart-line" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>No history for this period</Text>
        <Text style={styles.emptyText}>Readings appear here once the sensor reports them.</Text>
      </View>
    );
  }

  // Calculate chart dimensions
  const chartWidth = screenWidth - 64;
  const availableArea = chartWidth - 60; // yAxis + margins
  const spacing = readings.length > 1 ? Math.max(15, availableArea / (readings.length - 1)) : 30;

  // Thresholds as dashed reference lines (guide §13.11)
  const thresholdProps = (fontScale: 'compact' | 'full') => {
    const lines = thresholds.slice(0, 2);
    const props: Record<string, unknown> = {};
    lines.forEach((line, i) => {
      const colour = line.level === 'negative' ? t.status.negative.element : t.status.critical.element;
      const textColour = line.level === 'negative' ? t.status.negative.text : t.status.critical.text;
      const n = i + 1;
      props[`showReferenceLine${n}`] = true;
      props[`referenceLine${n}Position`] = line.value;
      props[`referenceLine${n}Config`] = {
        color: colour,
        thickness: fontScale === 'full' ? 2 : 1,
        dashWidth: 6,
        dashGap: 4,
        labelText: line.label,
        labelTextStyle: [styles.thresholdLabel, { color: textColour }],
      };
    });
    return props;
  };

  const sharedChartProps = {
    color: tempColour,
    color2: humidityColour,
    thickness: 2,
    thickness2: 2,
    dataPointsColor: tempColour,
    dataPointsColor2: humidityColour,
    curved: true,
    xAxisColor: t.border.divider,
    yAxisColor: t.border.divider,
    rulesColor: t.border.divider,
    xAxisLabelTextStyle: styles.axisLabel,
    yAxisTextStyle: styles.axisLabel,
    // gifted-charts measures maxValue up from yAxisOffset, so pass the span.
    yAxisOffset: domain.min,
    maxValue: domain.max - domain.min,
    noOfSections: domain.sections,
    showFractionalValues: true,
    roundToDigits: 1,
    formatYLabel: formatAxisLabel,
    interpolateMissingValues: false,
  };

  const fsWidth = Math.max(screenWidth - 40, readings.length * 40);
  const showTime = !['1 day', '1 week'].includes(aggregationInterval);

  const closeFullscreen = () => {
    setIsFullscreen(false);
    setFullscreenView('chart');
  };

  const renderTableRow = ({ item }: { item: SensorHistoryReading }) => {
    const time = formatReadingTime(item.timestamp, showTime);
    return (
      <View
        style={styles.tableRow}
        accessible
        accessibilityLabel={`${time}, temperature ${formatTemperature(item.temperature)}, humidity ${formatHumidity(item.humidity)}`}
      >
        <Text style={[styles.tableCell, styles.colTime]}>{time}</Text>
        <Text style={[styles.tableCell, styles.colNumber]}>{formatTemperature(item.temperature)}</Text>
        <Text style={[styles.tableCell, styles.colNumber]}>{formatHumidity(item.humidity)}</Text>
      </View>
    );
  };

  return (
    <>
      {/* Compact Chart Card */}
      <Pressable
        style={({ pressed }) => [styles.chartCard, pressed && styles.chartCardPressed]}
        onPress={() => setIsFullscreen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Historical trend. ${summary}`}
        accessibilityHint="Opens the full-screen chart and a table of values"
      >
        <View style={styles.chartHeader}>
          <View style={styles.chartHeaderText}>
            <Text style={styles.chartTitle} accessibilityRole="header">
              Historical trend
            </Text>
            <Text style={styles.chartSubtitle}>{intervalLabel} averages</Text>
          </View>
          <View style={styles.expandHint}>
            <Icon name="arrow-expand" size={iconSize.sm} color={t.brand.tint} />
            <Text style={styles.expandText}>Expand</Text>
          </View>
        </View>

        <Legend styles={styles} tempColour={tempColour} humidityColour={humidityColour} />

        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <LineChart
            {...sharedChartProps}
            {...thresholdProps('compact')}
            data={compactData.temp}
            data2={compactData.humidity}
            width={chartWidth}
            height={140}
            hideDataPoints={readings.length > 20}
            dataPointsRadius={3}
            hideRules
            spacing={spacing}
            initialSpacing={15}
            endSpacing={15}
            adjustToWidth
          />
        </View>

        <Text style={styles.summary}>{summary}</Text>
      </Pressable>

      {/* Fullscreen Modal */}
      <Modal
        visible={isFullscreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeFullscreen}
      >
        <View style={styles.fullscreenContainer}>
          <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} active={isFullscreen} />

          {/* Header */}
          <View style={[styles.fullscreenHeader, { paddingTop: insets.top + space.xs }]}>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
              onPress={closeFullscreen}
              accessibilityRole="button"
              accessibilityLabel="Close sensor history"
            >
              <Icon name="close" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
            <Text style={styles.fullscreenTitle} accessibilityRole="header">
              Sensor history
            </Text>
            <View style={styles.closeButton} />
          </View>

          {/* Chart / table switch and legend */}
          <View style={styles.toolbar}>
            <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Show as">
              {(['chart', 'table'] as const).map((view, index) => {
                const selected = fullscreenView === view;
                return (
                  <Pressable
                    key={view}
                    style={({ pressed }) => [
                      styles.segment,
                      index > 0 && styles.segmentDivider,
                      pressed && !selected && styles.segmentPressed,
                      selected && styles.segmentSelected,
                    ]}
                    hitSlop={{ top: 6, bottom: 6 }}
                    onPress={() => setFullscreenView(view)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={view === 'chart' ? 'Chart' : 'Table of values'}
                  >
                    <Icon
                      name={view === 'chart' ? 'chart-line' : 'table'}
                      size={iconSize.sm}
                      color={selected ? t.brand.onFill : t.icon.primary}
                    />
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {view === 'chart' ? 'Chart' : 'Table'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {fullscreenView === 'chart' && (
              <>
                <Legend styles={styles} tempColour={tempColour} humidityColour={humidityColour} withUnits />
                <View style={styles.instructions}>
                  <Icon name="gesture-swipe-horizontal" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.instructionText}>Swipe to scroll. Tap a point to see its value.</Text>
                </View>
              </>
            )}
          </View>

          {fullscreenView === 'chart' ? (
            <View style={styles.fullscreenChartContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={styles.fullscreenScroll}
              >
                <LineChart
                  {...sharedChartProps}
                  {...thresholdProps('full')}
                  data={fullscreenData.temp}
                  data2={fullscreenData.humidity}
                  width={fsWidth}
                  height={screenHeight * 0.45}
                  dataPointsRadius={5}
                  rulesType="dashed"
                  showVerticalLines
                  verticalLinesColor={t.border.divider}
                  focusEnabled
                  showDataPointOnFocus
                  showStripOnFocus
                  stripColor={t.border.separator}
                  stripWidth={2}
                  delayBeforeUnFocus={1500}
                  focusedDataPointRadius={7}
                  initialSpacing={20}
                  endSpacing={30}
                  spacing={35}
                />
              </ScrollView>
            </View>
          ) : (
            <View style={styles.fullscreenChartContainer}>
              <View style={styles.tableHeader} accessibilityRole="header">
                <Text style={[styles.tableHeaderText, styles.colTime]}>{showTime ? 'Date and time' : 'Date'}</Text>
                <Text style={[styles.tableHeaderText, styles.colNumber]}>Temperature</Text>
                <Text style={[styles.tableHeaderText, styles.colNumber]}>Humidity</Text>
              </View>
              <FlatList
                data={readings}
                keyExtractor={(item, index) => `${item.timestamp}-${index}`}
                renderItem={renderTableRow}
                initialNumToRender={30}
              />
            </View>
          )}

          {/* Summary */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Text style={styles.footerText}>{summary}</Text>
            <Text style={styles.footerText}>
              {`Temperature axis ${formatTemperature(domain.min)} to ${formatTemperature(domain.max)}. Humidity 0 to ${maxHumidity}% is scaled to the same axis.`}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default SensorHistoryChart;
