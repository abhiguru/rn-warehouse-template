/**
 * Temperature & Humidity Sensors Screen
 *
 * SAP Fiori Design System
 * Displays real-time sensor data with auto-polling
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  AppState,
  AppStateStatus,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useListColors } from '@/hooks/useListColors';
import { SensorService } from '@/services/sensor-service';
import {
  SensorDevice,
  SensorDashboard,
  SensorReading,
} from '@/types/sensor.types';
import { useAppSelector } from '@/store/hooks';

// ============================================================================
// SAP Fiori Design Constants
// ============================================================================
const FIORI = {
  // Card
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  // Dashboard Cards
  dashboard: {
    primaryCard: {
      borderRadius: 16,
      padding: 16,
      gap: 8,
    },
    statusCard: {
      borderRadius: 12,
      padding: 12,
      gap: 4,
    },
  },
  // Chip
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    gap: 6,
  },
  // Typography
  typography: {
    headerTitle: { fontSize: 20, fontWeight: '700' as const },
    cardTitle: { fontSize: 16, fontWeight: '600' as const },
    cardLabel: { fontSize: 11, fontWeight: '500' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    cardValue: { fontSize: 24, fontWeight: '700' as const },
    readingLabel: { fontSize: 11, fontWeight: '500' as const, textTransform: 'uppercase' as const },
    readingValue: { fontSize: 22, fontWeight: '700' as const },
    timestamp: { fontSize: 12, fontWeight: '400' as const },
  },
  // Icon
  icon: {
    button: 24,
    card: 28,
    status: 12,
    battery: 20,
    reading: 20,
  },
  // Button
  button: {
    size: 44,
  },
} as const;

const POLL_INTERVAL = 10 * 1000; // 10 seconds
const LAST_POLL_KEY = 'sensor_last_poll_timestamp';

const SensorsScreen: React.FC = () => {
  const { userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const colors = useListColors();

  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [dashboard, setDashboard] = useState<SensorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);
  const [nextPollIn, setNextPollIn] = useState<number>(POLL_INTERVAL);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);

  // Fetch sensor data
  const fetchSensorData = useCallback(
    async (isRefresh = false, sinceTimestamp?: string) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        }

        const result = await SensorService.pollSensorData(sinceTimestamp);

        if (result.success && result.data) {
          setDevices(result.data.devices);
          setDashboard(result.data.dashboard);

          // Store the poll timestamp
          await AsyncStorage.setItem(
            LAST_POLL_KEY,
            result.data.poll_timestamp
          );
          setLastPollTime(result.data.poll_timestamp);

          // Reset countdown
          setNextPollIn(POLL_INTERVAL);

          if (__DEV__) console.log('[SensorsScreen] Poll successful:', {
            devices: result.data.devices.length,
            newReadings: result.data.new_readings.length,
            timestamp: result.data.poll_timestamp,
          });
        } else {
          setErrorMessage(result.message || 'Failed to load sensor data');
          setErrorVisible(true);
        }
      } catch (error) {
        console.error('[SensorsScreen] Exception:', error);
        setErrorMessage('Failed to load sensor data');
        setErrorVisible(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      // First poll - no timestamp (get all data)
      await fetchSensorData(false);
    };

    loadInitialData();
  }, [fetchSensorData]);

  // Setup polling interval
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Set up new interval
    pollIntervalRef.current = setInterval(async () => {
      const lastPoll = await AsyncStorage.getItem(LAST_POLL_KEY);
      if (__DEV__) console.log('[SensorsScreen] Auto-polling (10 second interval)');
      await fetchSensorData(false, lastPoll || undefined);
    }, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchSensorData]);

  // Countdown timer for next poll
  useEffect(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setNextPollIn((prev) => {
        const next = prev - 1000;
        return next < 0 ? POLL_INTERVAL : next;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Handle app state changes (pause polling when app is in background)
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          // App has come to foreground - trigger a poll
          if (__DEV__) console.log('[SensorsScreen] App foregrounded - polling');
          AsyncStorage.getItem(LAST_POLL_KEY).then((lastPoll) => {
            fetchSensorData(false, lastPoll || undefined);
          });
        }
        appState.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [fetchSensorData]);

  const onRefresh = useCallback(async () => {
    const lastPoll = await AsyncStorage.getItem(LAST_POLL_KEY);
    await fetchSensorData(true, lastPoll || undefined);
  }, [fetchSensorData]);

  const getHealthColor = useCallback((status: string) => {
    switch (status) {
      case 'healthy':
        return colors.statusPositive;
      case 'warning':
        return colors.statusCritical;
      case 'critical':
        return colors.statusNegative;
      default:
        return colors.gray400;
    }
  }, [colors]);

  const getBatteryIcon = (status: string): 'battery-full' | 'battery-half' | 'warning' | 'help-circle' => {
    switch (status) {
      case 'GOOD':
        return 'battery-full';
      case 'LOW':
        return 'battery-half';
      case 'CRITICAL':
        return 'warning';
      default:
        return 'help-circle';
    }
  };

  const getBatteryColor = useCallback((status: string) => {
    switch (status) {
      case 'GOOD':
        return colors.statusPositive;
      case 'LOW':
        return colors.statusCritical;
      case 'CRITICAL':
        return colors.statusNegative;
      default:
        return colors.gray400;
    }
  }, [colors]);

  const formatNextPoll = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  const renderDashboard = () => {
    if (!dashboard) return null;

    return (
      <View style={[styles.dashboardSection, { backgroundColor: colors.cellBackground }]}>
        {/* Status Overview */}
        <View style={styles.statusRow}>
          <View style={[styles.statusCard, styles.primaryCard, { backgroundColor: colors.primary }]}>
            <Ionicons name="hardware-chip-outline" size={FIORI.icon.card} color={colors.white} />
            <Text style={[styles.primaryCardLabel, { color: colors.white }]}>Total Sensors</Text>
            <Text style={[styles.primaryCardValue, { color: colors.white }]}>{dashboard.total_active_sensors}</Text>
          </View>

          <View style={styles.statusColumn}>
            <View style={[styles.statusCard, { backgroundColor: colors.cellBackground }]}>
              <Ionicons name="checkmark-circle" size={FIORI.icon.status + 8} color={colors.statusPositive} />
              <Text style={[styles.cardLabel, { color: colors.gray600 }]}>Online</Text>
              <Text style={[styles.cardValue, { color: colors.gray900 }]}>{dashboard.online_sensors}</Text>
            </View>

            <View style={[styles.statusCard, { backgroundColor: colors.cellBackground }]}>
              <Ionicons name="close-circle" size={FIORI.icon.status + 8} color={colors.statusNegative} />
              <Text style={[styles.cardLabel, { color: colors.gray600 }]}>Offline</Text>
              <Text style={[styles.cardValue, { color: colors.gray900 }]}>{dashboard.offline_sensors}</Text>
            </View>
          </View>
        </View>

        {/* Alert Chips */}
        {(dashboard.stale_sensors > 0 ||
          dashboard.low_battery_count > 0 ||
          dashboard.critical_battery_count > 0) && (
          <View style={styles.alertsRow}>
            {dashboard.stale_sensors > 0 && (
              <View style={[styles.chip, { borderColor: colors.statusCritical, backgroundColor: colors.statusCriticalLight }]}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.statusCritical} />
                <Text style={[styles.chipText, { color: colors.statusCriticalDark }]}>{dashboard.stale_sensors} Stale</Text>
              </View>
            )}
            {dashboard.low_battery_count > 0 && (
              <View style={[styles.chip, { borderColor: colors.statusCritical, backgroundColor: colors.statusCriticalLight }]}>
                <Ionicons name="battery-half" size={16} color={colors.statusCritical} />
                <Text style={[styles.chipText, { color: colors.statusCriticalDark }]}>{dashboard.low_battery_count} Low Battery</Text>
              </View>
            )}
            {dashboard.critical_battery_count > 0 && (
              <View style={[styles.chip, { borderColor: colors.statusNegative, backgroundColor: colors.statusNegativeLight }]}>
                <Ionicons name="warning" size={16} color={colors.statusNegative} />
                <Text style={[styles.chipText, { color: colors.statusNegativeDark }]}>{dashboard.critical_battery_count} Critical</Text>
              </View>
            )}
          </View>
        )}

        {/* Polling Info */}
        <View style={[styles.pollingInfo, { backgroundColor: colors.gray50 }]}>
          <View style={styles.pollingRow}>
            <Ionicons name="time-outline" size={16} color={colors.gray600} />
            <Text style={[styles.pollingText, { color: colors.gray700 }]}>Next poll in {formatNextPoll(nextPollIn)}</Text>
          </View>
          {dashboard.most_recent_sync && (
            <Text style={[styles.syncText, { color: colors.gray500 }]}>
              Last sync: {new Date(dashboard.most_recent_sync).toLocaleTimeString()}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderDevice = ({ item: device }: { item: SensorDevice }) => {
    const isOffline =
      device.connectivity_status === 'OFFLINE' || device.is_stale;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.deviceCard,
          { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider },
          pressed && { opacity: 0.8 },
        ]}
        onPress={() => router.push(`/sensor-detail/${device.id}`)}
      >
        {/* Device Header */}
        <View style={styles.deviceHeader}>
          <View style={styles.deviceTitleRow}>
            <Ionicons
              name={isOffline ? 'thermometer-outline' : 'thermometer'}
              size={24}
              color={isOffline ? colors.gray400 : colors.primary}
            />
            <View style={styles.deviceInfo}>
              <Text style={[styles.deviceName, { color: colors.gray900 }]}>{device.device_name}</Text>
              <Text style={[styles.deviceLocation, { color: colors.gray500 }]}>{device.location}</Text>
            </View>
          </View>

          {/* Status Indicators */}
          <View style={styles.statusIndicators}>
            <Ionicons
              name="ellipse"
              size={FIORI.icon.status}
              color={getHealthColor(device.health_status)}
            />
            <Ionicons
              name={getBatteryIcon(device.battery_status)}
              size={FIORI.icon.battery}
              color={getBatteryColor(device.battery_status)}
            />
          </View>
        </View>

        {/* Temperature & Humidity */}
        {!isOffline && device.latest_temperature !== null ? (
          <>
            <View style={styles.readingsRow}>
              <View style={[styles.readingCard, { backgroundColor: colors.gray50 }]}>
                <Ionicons
                  name="thermometer"
                  size={FIORI.icon.reading}
                  color={colors.primary}
                />
                <Text style={[styles.readingLabel, { color: colors.gray600 }]}>Temperature</Text>
                <Text style={[styles.readingValue, { color: colors.gray900 }]}>
                  {device.latest_temperature.toFixed(1)}°C
                </Text>
              </View>

              <View style={[styles.readingCard, { backgroundColor: colors.gray50 }]}>
                <Ionicons
                  name="water"
                  size={FIORI.icon.reading}
                  color={colors.statusPositive}
                />
                <Text style={[styles.readingLabel, { color: colors.gray600 }]}>Humidity</Text>
                <Text style={[styles.readingValue, { color: colors.gray900 }]}>
                  {device.latest_humidity?.toFixed(1) || '0.0'}%
                </Text>
              </View>
            </View>

            {device.latest_reading_timestamp && (
              <Text style={[styles.timestampText, { color: colors.gray500 }]}>
                Updated: {new Date(device.latest_reading_timestamp).toLocaleString()}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.offlineContainer}>
            <Ionicons
              name="cloud-offline-outline"
              size={32}
              color={colors.gray400}
            />
            <Text style={[styles.offlineText, { color: colors.gray500 }]}>
              {device.is_stale ? 'Stale Data' : 'Offline'}
            </Text>
            {device.last_reading_at && (
              <Text style={[styles.lastSeenText, { color: colors.gray400 }]}>
                Last seen: {new Date(device.last_reading_at).toLocaleString()}
              </Text>
            )}
          </View>
        )}

        {/* Tap indicator */}
        <View style={styles.tapIndicator}>
          <Ionicons name="chevron-forward" size={20} color={colors.gray400} />
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="thermometer-outline" size={64} color={colors.gray300} />
      <Text style={[styles.emptyText, { color: colors.gray700 }]}>No sensors available</Text>
      <Text style={[styles.emptySubtext, { color: colors.gray500 }]}>Check your sensor configuration</Text>
    </View>
  );

  const renderHeader = () => (
    <>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: colors.cellBackground }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="arrow-back" size={FIORI.icon.button} color={colors.gray700} />
        </Pressable>
        <Text style={[styles.title, { color: colors.gray900 }]} numberOfLines={1}>
          Temperature & Humidity
        </Text>
        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [
            styles.refreshButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="refresh" size={FIORI.icon.button} color={colors.primary} />
        </Pressable>
      </View>
      {renderDashboard()}
    </>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        {/* Status Bar Background */}
        <View style={[styles.statusBarCover, { height: insets.top, backgroundColor: colors.cellBackground }]} />

        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading sensor data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Status Bar Background */}
      <View style={[styles.statusBarCover, { height: insets.top, backgroundColor: colors.cellBackground }]} />

      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(device) => device.id}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Error Snackbar */}
      {errorVisible && (
        <View style={[styles.snackbar, { backgroundColor: colors.gray900 }]}>
          <Text style={[styles.snackbarText, { color: colors.white }]}>{errorMessage}</Text>
          <Pressable
            onPress={() => {
              setErrorVisible(false);
              onRefresh();
            }}
            style={({ pressed }) => [
              styles.snackbarButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.snackbarButtonText, { color: colors.primary }]}>Retry</Text>
          </Pressable>
          <Pressable
            onPress={() => setErrorVisible(false)}
            style={({ pressed }) => [
              styles.snackbarCloseButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons name="close" size={20} color={colors.white} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// Styles - SAP Fiori Design System (colors applied inline for dark mode)
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBarCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  header: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: FIORI.button.size,
    height: FIORI.button.size,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: FIORI.button.size / 2,
  },
  refreshButton: {
    width: FIORI.button.size,
    height: FIORI.button.size,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: FIORI.button.size / 2,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  title: {
    flex: 1,
    fontSize: FIORI.typography.headerTitle.fontSize,
    fontWeight: FIORI.typography.headerTitle.fontWeight,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  dashboardSection: {
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusColumn: {
    flex: 1,
    gap: 12,
  },
  statusCard: {
    borderRadius: FIORI.dashboard.statusCard.borderRadius,
    padding: FIORI.dashboard.statusCard.padding,
    gap: FIORI.dashboard.statusCard.gap,
    alignItems: 'flex-start',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  primaryCard: {
    flex: 1,
  },
  primaryCardLabel: {
    fontSize: FIORI.typography.cardLabel.fontSize,
    fontWeight: FIORI.typography.cardLabel.fontWeight,
    textTransform: FIORI.typography.cardLabel.textTransform,
    letterSpacing: FIORI.typography.cardLabel.letterSpacing,
    opacity: 0.9,
  },
  primaryCardValue: {
    fontSize: FIORI.typography.cardValue.fontSize,
    fontWeight: FIORI.typography.cardValue.fontWeight,
  },
  cardLabel: {
    fontSize: FIORI.typography.cardLabel.fontSize,
    fontWeight: FIORI.typography.cardLabel.fontWeight,
    textTransform: FIORI.typography.cardLabel.textTransform,
    letterSpacing: FIORI.typography.cardLabel.letterSpacing,
  },
  cardValue: {
    fontSize: FIORI.typography.cardValue.fontSize,
    fontWeight: FIORI.typography.cardValue.fontWeight,
  },
  alertsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: FIORI.chip.height,
    borderRadius: FIORI.chip.borderRadius,
    paddingHorizontal: FIORI.chip.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.chip.gap,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pollingInfo: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  pollingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pollingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  syncText: {
    fontSize: 12,
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  deviceCard: {
    borderRadius: FIORI.card.borderRadius,
    padding: FIORI.card.padding,
    gap: FIORI.card.gap,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    fontSize: FIORI.typography.cardTitle.fontSize,
    fontWeight: FIORI.typography.cardTitle.fontWeight,
  },
  deviceLocation: {
    fontSize: 14,
  },
  statusIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readingsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  readingCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    alignItems: 'center',
  },
  readingLabel: {
    fontSize: FIORI.typography.readingLabel.fontSize,
    fontWeight: FIORI.typography.readingLabel.fontWeight,
    textTransform: FIORI.typography.readingLabel.textTransform,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  readingValue: {
    fontSize: FIORI.typography.readingValue.fontSize,
    fontWeight: FIORI.typography.readingValue.fontWeight,
  },
  timestampText: {
    fontSize: FIORI.typography.timestamp.fontSize,
    fontWeight: FIORI.typography.timestamp.fontWeight,
    textAlign: 'center',
  },
  offlineContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  tapIndicator: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -10,
  },
  offlineText: {
    fontSize: 16,
    fontWeight: '600',
  },
  lastSeenText: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    textAlign: 'center',
  },
  // Snackbar (Fiori style)
  snackbar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  snackbarText: {
    flex: 1,
    fontSize: 14,
  },
  snackbarButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  snackbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  snackbarCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
});

export default SensorsScreen;
