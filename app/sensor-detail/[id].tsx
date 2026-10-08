/**
 * Sensor Detail Screen
 * Shows historical temperature/humidity charts for a specific sensor
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListColors } from '@/hooks/useListColors';
import { SensorService } from '@/services/sensor-service';
import { getSensorHistory, getAggregationLabel, getPeriodLabel } from '@/services/sensor-history-service';
import { SensorHistoryChart } from '@/components/sensors/SensorHistoryChart';
import type { SensorDevice } from '@/types/sensor.types';
import type {
  SensorHistoryPeriod,
  SensorHistoryData,
  SensorHistorySummary,
} from '@/types/sensor-history.types';

// All period options
const ALL_PERIOD_OPTIONS: { value: SensorHistoryPeriod; label: string; days: number }[] = [
  { value: 7, label: '7D', days: 7 },
  { value: 14, label: '14D', days: 14 },
  { value: 30, label: '30D', days: 30 },
  { value: 90, label: '90D', days: 90 },
  { value: 365, label: '1Y', days: 365 },
];

/**
 * Calculate how many days of historical data are available
 */
const getDaysOfDataAvailable = (earliestReadingAt: string | null): number => {
  if (!earliestReadingAt) return 0;
  const earliest = new Date(earliestReadingAt);
  const now = new Date();
  const diffMs = now.getTime() - earliest.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const SensorDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useListColors();

  // State
  const [device, setDevice] = useState<SensorDevice | null>(null);
  const [historyData, setHistoryData] = useState<SensorHistoryData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<SensorHistoryPeriod>(7);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate available periods based on earliest_reading_at
  const availablePeriods = useMemo(() => {
    const daysAvailable = getDaysOfDataAvailable(device?.earliest_reading_at ?? null);
    // Only show periods where we have at least some data (period <= days available)
    // Always show 7D as minimum if any data exists
    if (daysAvailable < 1) return [];
    return ALL_PERIOD_OPTIONS.filter((opt) => opt.days <= daysAvailable || opt.days === 7);
  }, [device?.earliest_reading_at]);

  // Fetch device info from current polling data
  const fetchDeviceInfo = useCallback(async () => {
    try {
      const result = await SensorService.pollSensorData();
      if (result.success && result.data) {
        const foundDevice = result.data.devices.find((d) => d.id === id);
        if (foundDevice) {
          setDevice(foundDevice);
        } else {
          setError('Device not found');
        }
      } else {
        setError(result.message || 'Failed to load device info');
      }
    } catch (err) {
      setError('Failed to load device info');
    }
  }, [id]);

  // Fetch historical data
  const fetchHistory = useCallback(async (period: SensorHistoryPeriod) => {
    if (!id) return;

    setHistoryLoading(true);
    setError(null);

    try {
      const result = await getSensorHistory(id, period);
      if (result.success && result.data) {
        setHistoryData(result.data);
      } else {
        setError(result.message || 'Failed to load history');
      }
    } catch (err) {
      setError('Failed to load historical data');
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchDeviceInfo();
      await fetchHistory(selectedPeriod);
      setLoading(false);
    };
    loadData();
  }, [fetchDeviceInfo, fetchHistory, selectedPeriod]);

  // Handle period change
  const handlePeriodChange = useCallback((period: SensorHistoryPeriod) => {
    setSelectedPeriod(period);
    fetchHistory(period);
  }, [fetchHistory]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDeviceInfo();
    await fetchHistory(selectedPeriod);
    setRefreshing(false);
  }, [fetchDeviceInfo, fetchHistory, selectedPeriod]);

  // Render period selector (only shows periods with available data)
  const renderPeriodSelector = () => {
    if (availablePeriods.length === 0) {
      return (
        <Text style={[styles.noPeriodsText, { color: colors.gray500 }]}>
          No historical data available
        </Text>
      );
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.periodContainer}
      >
        {availablePeriods.map((option) => {
          const isSelected = selectedPeriod === option.value;
          return (
            <Pressable
              key={option.value}
              style={[
                styles.periodChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.gray100,
                  borderColor: isSelected ? colors.primary : colors.gray200,
                },
              ]}
              onPress={() => handlePeriodChange(option.value)}
            >
              <Text
                style={[
                  styles.periodChipText,
                  { color: isSelected ? colors.white : colors.gray700 },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  // Render summary stats
  const renderSummary = (summary: SensorHistorySummary) => (
    <View style={[styles.summaryCard, { backgroundColor: colors.cellBackground }]}>
      <Text style={[styles.summaryTitle, { color: colors.gray900 }]}>
        Summary ({getPeriodLabel(selectedPeriod)})
      </Text>

      {/* Temperature Summary */}
      <View style={styles.summarySection}>
        <View style={styles.summaryHeader}>
          <Ionicons name="thermometer" size={18} color={colors.primary} />
          <Text style={[styles.summaryLabel, { color: colors.gray700 }]}>Temperature</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryItemLabel, { color: colors.gray500 }]}>Avg</Text>
            <Text style={[styles.summaryItemValue, { color: colors.gray900 }]}>
              {summary.avg_temperature?.toFixed(1) ?? '—'}°C
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryItemLabel, { color: colors.gray500 }]}>Min</Text>
            <Text style={[styles.summaryItemValue, { color: colors.statusPositive }]}>
              {summary.min_temperature?.toFixed(1) ?? '—'}°C
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryItemLabel, { color: colors.gray500 }]}>Max</Text>
            <Text style={[styles.summaryItemValue, { color: colors.statusNegative }]}>
              {summary.max_temperature?.toFixed(1) ?? '—'}°C
            </Text>
          </View>
        </View>
      </View>

      {/* Humidity Summary */}
      <View style={[styles.summarySection, { marginTop: 12 }]}>
        <View style={styles.summaryHeader}>
          <Ionicons name="water" size={18} color={colors.statusPositive} />
          <Text style={[styles.summaryLabel, { color: colors.gray700 }]}>Humidity</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryItemLabel, { color: colors.gray500 }]}>Avg</Text>
            <Text style={[styles.summaryItemValue, { color: colors.gray900 }]}>
              {summary.avg_humidity?.toFixed(1) ?? '—'}%
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryItemLabel, { color: colors.gray500 }]}>Min</Text>
            <Text style={[styles.summaryItemValue, { color: colors.statusPositive }]}>
              {summary.min_humidity?.toFixed(1) ?? '—'}%
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryItemLabel, { color: colors.gray500 }]}>Max</Text>
            <Text style={[styles.summaryItemValue, { color: colors.statusNegative }]}>
              {summary.max_humidity?.toFixed(1) ?? '—'}%
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.readingsCount, { color: colors.gray500 }]}>
        Based on {summary.total_readings} data points
      </Text>
    </View>
  );

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.statusBar, { height: insets.top, backgroundColor: colors.cellBackground }]} />
        <View style={[styles.header, { backgroundColor: colors.cellBackground }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.gray700} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.gray900 }]}>Sensor Details</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading sensor data...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error && !device) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.statusBar, { height: insets.top, backgroundColor: colors.cellBackground }]} />
        <View style={[styles.header, { backgroundColor: colors.cellBackground }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.gray700} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.gray900 }]}>Sensor Details</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.statusNegative} />
          <Text style={[styles.errorText, { color: colors.gray700 }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={onRefresh}
          >
            <Text style={[styles.retryButtonText, { color: colors.white }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      <View style={[styles.statusBar, { height: insets.top, backgroundColor: colors.cellBackground }]} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.gray200 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.gray700} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.gray900 }]} numberOfLines={1}>
          {device?.device_name || 'Sensor Details'}
        </Text>
        <Pressable style={styles.backButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Device Info Card */}
        {device && (
          <View style={[styles.deviceCard, { backgroundColor: colors.cellBackground }]}>
            <View style={styles.deviceHeader}>
              <Ionicons name="thermometer" size={24} color={colors.primary} />
              <View style={styles.deviceInfo}>
                <Text style={[styles.deviceName, { color: colors.gray900 }]}>{device.device_name}</Text>
                <Text style={[styles.deviceLocation, { color: colors.gray500 }]}>{device.location}</Text>
              </View>
            </View>

            {/* Current Readings */}
            <View style={styles.currentReadings}>
              <View style={[styles.readingBox, { backgroundColor: colors.gray50 }]}>
                <Ionicons name="thermometer" size={20} color={colors.primary} />
                <Text style={[styles.readingLabel, { color: colors.gray600 }]}>Temperature</Text>
                <Text style={[styles.readingValue, { color: colors.gray900 }]}>
                  {device.latest_temperature?.toFixed(1) ?? '--'}°C
                </Text>
              </View>
              <View style={[styles.readingBox, { backgroundColor: colors.gray50 }]}>
                <Ionicons name="water" size={20} color={colors.statusPositive} />
                <Text style={[styles.readingLabel, { color: colors.gray600 }]}>Humidity</Text>
                <Text style={[styles.readingValue, { color: colors.gray900 }]}>
                  {device.latest_humidity?.toFixed(1) ?? '--'}%
                </Text>
              </View>
            </View>

            {device.latest_reading_timestamp && (
              <Text style={[styles.timestamp, { color: colors.gray500 }]}>
                Last reading: {new Date(device.latest_reading_timestamp).toLocaleString()}
              </Text>
            )}
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodSection}>
          <Text style={[styles.sectionTitle, { color: colors.gray700 }]}>Historical Data</Text>
          {renderPeriodSelector()}
        </View>

        {/* Chart */}
        {historyLoading ? (
          <View style={[styles.chartLoading, { backgroundColor: colors.cellBackground }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.chartLoadingText, { color: colors.gray600 }]}>
              Loading {getPeriodLabel(selectedPeriod)} history...
            </Text>
          </View>
        ) : historyData ? (
          <>
            <SensorHistoryChart
              readings={historyData.readings}
              aggregationInterval={historyData.aggregation_interval}
              periodDays={historyData.period_days}
            />

            {/* Summary */}
            {renderSummary(historyData.summary)}
          </>
        ) : (
          <View style={[styles.noDataCard, { backgroundColor: colors.cellBackground }]}>
            <Ionicons name="analytics-outline" size={48} color={colors.gray400} />
            <Text style={[styles.noDataText, { color: colors.gray600 }]}>
              No historical data available
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginTop: 44, // Account for status bar
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Device Card
  deviceCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
  },
  deviceLocation: {
    fontSize: 13,
    marginTop: 2,
  },
  currentReadings: {
    flexDirection: 'row',
    gap: 12,
  },
  readingBox: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 4,
  },
  readingLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  readingValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },

  // Period Selector
  periodSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  periodContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  periodChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  noPeriodsText: {
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Chart loading
  chartLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 40,
    margin: 16,
    borderRadius: 12,
  },
  chartLoadingText: {
    fontSize: 14,
  },

  // Summary
  summaryCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  summarySection: {
    borderRadius: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryItemLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  summaryItemValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  readingsCount: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },

  // No data
  noDataCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    margin: 16,
    borderRadius: 12,
    gap: 12,
  },
  noDataText: {
    fontSize: 14,
  },
});

export default SensorDetailScreen;
