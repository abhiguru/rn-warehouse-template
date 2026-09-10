/**
 * Sensor History Chart Component
 * Dual-line chart showing temperature and humidity trends
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { useFioriColors } from '@/theme/fioriColors';
import theme from '@/theme';
import type { SensorHistoryReading, SensorChartDataPoint } from '@/types/sensor-history.types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SensorHistoryChartProps {
  readings: SensorHistoryReading[];
  aggregationInterval: string;
  periodDays: number;
}

// Chart colors
const TEMP_COLOR = theme.colors.orange[500];
const HUMIDITY_COLOR = theme.colors.blue[400];

export const SensorHistoryChart: React.FC<SensorHistoryChartProps> = ({
  readings,
  aggregationInterval,
  periodDays,
}) => {
  const fiori = useFioriColors();
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Format timestamp for label
  const formatLabel = (timestamp: string, compact: boolean = true): string => {
    const date = new Date(timestamp);
    if (periodDays <= 14) {
      // Show day/month for short periods
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      });
    } else if (periodDays <= 90) {
      // Show month/day for medium periods
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: compact ? 'numeric' : 'short',
      });
    } else {
      // Show month for long periods
      return date.toLocaleDateString('en-IN', {
        month: 'short',
        year: compact ? undefined : '2-digit',
      });
    }
  };

  // Prepare chart data
  const { tempData, humidityData, maxTemp, maxHumidity } = useMemo(() => {
    const labelIndices = getLabelIndices(readings.length, 5);

    const temp: SensorChartDataPoint[] = readings.map((r, index) => ({
      value: r.temperature ?? 0,
      label: labelIndices.has(index) ? formatLabel(r.timestamp) : '',
      dataPointText: r.temperature !== null ? `${r.temperature.toFixed(1)}°` : '-',
    }));

    const humidity: SensorChartDataPoint[] = readings.map((r) => ({
      value: r.humidity ?? 0,
      label: '', // Only show labels on temp line
      dataPointText: r.humidity !== null ? `${r.humidity.toFixed(0)}%` : '-',
    }));

    const maxT = Math.max(...readings.map((r) => r.temperature ?? 0), 1);
    const maxH = Math.max(...readings.map((r) => r.humidity ?? 0), 1);

    return {
      tempData: temp,
      humidityData: humidity,
      maxTemp: Math.ceil(maxT / 5) * 5 || 10,
      maxHumidity: Math.ceil(maxH / 10) * 10 || 100,
    };
  }, [readings, periodDays]);

  // Fullscreen data with more labels
  const fullscreenData = useMemo(() => {
    const labelIndices = getLabelIndices(readings.length, 10);

    const temp: SensorChartDataPoint[] = readings.map((r, index) => ({
      value: r.temperature ?? 0,
      label: labelIndices.has(index) ? formatLabel(r.timestamp, false) : '',
      dataPointText: r.temperature !== null ? `${r.temperature.toFixed(1)}°C` : '-',
    }));

    const humidity: SensorChartDataPoint[] = readings.map((r) => ({
      value: r.humidity ?? 0,
      label: '',
      dataPointText: r.humidity !== null ? `${r.humidity.toFixed(1)}%` : '-',
    }));

    return { temp, humidity };
  }, [readings, periodDays]);

  if (readings.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: fiori.colors.cardBackground }]}>
        <Ionicons name="analytics-outline" size={48} color={fiori.colors.textTertiary} />
        <Text style={[styles.emptyText, { color: fiori.colors.textSecondary }]}>
          No historical data available
        </Text>
      </View>
    );
  }

  // Calculate chart dimensions
  const chartWidth = SCREEN_WIDTH - 64;
  const availableArea = chartWidth - 60; // yAxis + margins
  const spacing = readings.length > 1 ? Math.max(15, availableArea / (readings.length - 1)) : 30;

  // Normalize humidity to same scale as temperature for visual overlay
  // We'll use temperature scale and show humidity as percentage of its own max
  const normalizedHumidityData = humidityData.map((h) => ({
    ...h,
    value: (h.value / maxHumidity) * maxTemp,
  }));

  const CompactChart = () => (
    <LineChart
      data={tempData}
      data2={normalizedHumidityData}
      width={chartWidth}
      height={140}
      color={TEMP_COLOR}
      color2={HUMIDITY_COLOR}
      thickness={2}
      thickness2={2}
      hideDataPoints={readings.length > 20}
      dataPointsColor={TEMP_COLOR}
      dataPointsColor2={HUMIDITY_COLOR}
      dataPointsRadius={3}
      curved
      areaChart
      startFillColor={TEMP_COLOR}
      endFillColor={fiori.colors.cardBackground}
      startOpacity={0.2}
      endOpacity={0.02}
      startFillColor2={HUMIDITY_COLOR}
      endFillColor2={fiori.colors.cardBackground}
      startOpacity2={0.15}
      endOpacity2={0.02}
      xAxisColor={fiori.colors.divider}
      yAxisColor={fiori.colors.divider}
      xAxisLabelTextStyle={[styles.axisLabel, { color: fiori.colors.textSecondary }]}
      yAxisTextStyle={[styles.axisLabel, { color: fiori.colors.textSecondary }]}
      noOfSections={4}
      maxValue={maxTemp}
      hideRules
      yAxisOffset={0}
      spacing={spacing}
      initialSpacing={15}
      endSpacing={15}
      adjustToWidth
    />
  );

  const FullscreenChart = () => {
    const fsWidth = Math.max(SCREEN_WIDTH - 40, readings.length * 40);
    const normalizedFsHumidity = fullscreenData.humidity.map((h) => ({
      ...h,
      value: (h.value / maxHumidity) * maxTemp,
    }));

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.fullscreenScroll}
      >
        <LineChart
          data={fullscreenData.temp}
          data2={normalizedFsHumidity}
          width={fsWidth}
          height={SCREEN_HEIGHT * 0.45}
          color={TEMP_COLOR}
          color2={HUMIDITY_COLOR}
          thickness={2}
          thickness2={2}
          dataPointsColor={TEMP_COLOR}
          dataPointsColor2={HUMIDITY_COLOR}
          dataPointsRadius={5}
          curved
          areaChart
          startFillColor={TEMP_COLOR}
          endFillColor={fiori.colors.cardBackground}
          startOpacity={0.25}
          endOpacity={0.02}
          startFillColor2={HUMIDITY_COLOR}
          endFillColor2={fiori.colors.cardBackground}
          startOpacity2={0.2}
          endOpacity2={0.02}
          xAxisColor={fiori.colors.divider}
          yAxisColor={fiori.colors.divider}
          xAxisLabelTextStyle={[styles.fullscreenAxisLabel, { color: fiori.colors.textSecondary }]}
          yAxisTextStyle={[styles.fullscreenAxisLabel, { color: fiori.colors.textSecondary }]}
          noOfSections={5}
          maxValue={maxTemp}
          rulesColor={fiori.colors.divider}
          rulesType="dashed"
          showVerticalLines
          verticalLinesColor={fiori.colors.divider}
          focusEnabled
          showDataPointOnFocus
          showStripOnFocus
          stripColor={`${TEMP_COLOR}30`}
          stripWidth={2}
          delayBeforeUnFocus={1500}
          focusedDataPointRadius={7}
          yAxisOffset={0}
          initialSpacing={20}
          endSpacing={30}
          spacing={35}
        />
      </ScrollView>
    );
  };

  // Get aggregation label
  const getIntervalLabel = (): string => {
    const labels: Record<string, string> = {
      '1 hour': 'Hourly',
      '2 hours': '2-hour',
      '4 hours': '4-hour',
      '1 day': 'Daily',
      '1 week': 'Weekly',
    };
    return labels[aggregationInterval] || aggregationInterval;
  };

  return (
    <>
      {/* Compact Chart Card */}
      <Pressable
        style={[styles.chartCard, { backgroundColor: fiori.colors.cardBackground }]}
        onPress={() => setIsFullscreen(true)}
      >
        <View style={styles.chartHeader}>
          <View>
            <Text style={[styles.chartTitle, { color: fiori.colors.textPrimary }]}>
              Historical Trend
            </Text>
            <Text style={[styles.chartSubtitle, { color: fiori.colors.textSecondary }]}>
              {getIntervalLabel()} averages
            </Text>
          </View>
          <View style={styles.expandHint}>
            <Ionicons name="expand-outline" size={16} color={fiori.colors.textTertiary} />
            <Text style={[styles.expandText, { color: fiori.colors.textTertiary }]}>Expand</Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: TEMP_COLOR }]} />
            <Text style={[styles.legendText, { color: fiori.colors.textSecondary }]}>Temperature</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: HUMIDITY_COLOR }]} />
            <Text style={[styles.legendText, { color: fiori.colors.textSecondary }]}>Humidity</Text>
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
            <Pressable style={styles.closeButton} onPress={() => setIsFullscreen(false)}>
              <Ionicons name="close" size={24} color={fiori.colors.textPrimary} />
            </Pressable>
            <Text style={[styles.fullscreenTitle, { color: fiori.colors.textPrimary }]}>
              Sensor History
            </Text>
            <View style={styles.closeButton} />
          </View>

          {/* Legend */}
          <View style={[styles.fullscreenLegend, { backgroundColor: fiori.colors.backgroundGrouped }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: TEMP_COLOR }]} />
              <Text style={[styles.legendText, { color: fiori.colors.textSecondary }]}>
                Temperature (°C)
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: HUMIDITY_COLOR }]} />
              <Text style={[styles.legendText, { color: fiori.colors.textSecondary }]}>
                Humidity (%)
              </Text>
            </View>
          </View>

          {/* Instructions */}
          <View style={[styles.instructions, { backgroundColor: fiori.colors.backgroundGrouped }]}>
            <Ionicons name="hand-left-outline" size={16} color={fiori.colors.textSecondary} />
            <Text style={[styles.instructionText, { color: fiori.colors.textSecondary }]}>
              Swipe to scroll • Tap data points for details
            </Text>
          </View>

          {/* Chart */}
          <View style={styles.fullscreenChartContainer}>
            <FullscreenChart />
          </View>

          {/* Scale indicators */}
          <View style={[styles.scaleIndicators, { borderTopColor: fiori.colors.divider }]}>
            <View style={styles.scaleItem}>
              <View style={[styles.scaleDot, { backgroundColor: TEMP_COLOR }]} />
              <Text style={[styles.scaleText, { color: fiori.colors.textSecondary }]}>
                Temp: 0 - {maxTemp}°C
              </Text>
            </View>
            <View style={styles.scaleItem}>
              <View style={[styles.scaleDot, { backgroundColor: HUMIDITY_COLOR }]} />
              <Text style={[styles.scaleText, { color: fiori.colors.textSecondary }]}>
                Humidity: 0 - {maxHumidity}%
              </Text>
            </View>
            <Text style={[styles.dataPointsText, { color: fiori.colors.textTertiary }]}>
              {readings.length} data points
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  chartCard: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  chartSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandText: {
    fontSize: 12,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
  },
  axisLabel: {
    fontSize: 9,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    margin: 16,
    borderRadius: 12,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
  },

  // Fullscreen styles
  fullscreenContainer: {
    flex: 1,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  fullscreenLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  instructionText: {
    fontSize: 12,
  },
  fullscreenChartContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  fullscreenScroll: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  fullscreenAxisLabel: {
    fontSize: 10,
  },
  scaleIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  scaleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scaleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scaleText: {
    fontSize: 12,
  },
  dataPointsText: {
    fontSize: 11,
  },
});

export default SensorHistoryChart;
