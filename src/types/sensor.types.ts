// Temperature/Humidity Sensor Type Definitions
// The shapes of get_sensor_polling_data and get_sensor_device (backend migration 74).

/**
 * Per-sensor alert settings (`sensor_devices.alert_config`, jsonb). Only the temperature
 * limits are read by the app: the detail chart draws them as dashed lines, and Edit sensor
 * sets them (update_sensor_device).
 */
export interface SensorAlertConfig {
  /** Highest allowed temperature, °C. */
  temperature_max?: number | null;
  /** Lowest allowed temperature, °C. */
  temperature_min?: number | null;
  [key: string]: unknown;
}

export interface SensorDevice {
  id: string;
  device_name: string;
  mac_address: string;
  location: string;
  active: boolean;
  /** The server also sends 'offline' (offline or no recent data) and 'unknown' (never heard from). */
  health_status: 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown';
  battery_status: 'OK' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
  /** OFFLINE when the hub is offline, STALE when nothing came within the threshold, else ONLINE. */
  connectivity_status: 'ONLINE' | 'OFFLINE' | 'STALE' | 'UNKNOWN';
  is_stale: boolean;
  last_reading_at: string | null;
  staleness_threshold_minutes: number;
  consecutive_failures: number;
  latest_temperature: number | null;
  latest_humidity: number | null;
  latest_reading_timestamp: string | null;
  earliest_reading_at: string | null; // Earliest reading for determining available history
  /** When the latest values were observed (the bridge's time). Staleness is measured from it. */
  measured_at?: string | null;
  /** When the latest temperature, and the latest humidity, were observed: one may be older than the other. */
  temperature_at?: string | null;
  humidity_at?: string | null;
  /** Whether the sensor's hub is reachable by the bridge. */
  hub_online?: boolean | null;
  battery_low?: boolean | null;
  signal_level?: number | null;
  /** The last time the bridge heard from the sensor, with or without new values. */
  last_seen_at?: string | null;
  alert_config?: SensorAlertConfig | null;
  /** The latest values have not changed within the threshold, though the sensor may still be heard from. */
  values_stale?: boolean | null;
  /**
   * The newest temperature is above the sensor's highest limit (HIGH) or below its lowest (LOW).
   * Servers before the temperature limits do not send it: no flag means not out of range.
   */
  temperature_alert?: 'HIGH' | 'LOW' | null;
}

/** The hub a sensor reports through. */
export interface SensorHub {
  id: string;
  host: string | null;
  firmware: string | null;
  online: boolean | null;
  last_seen_at: string | null;
}

/** One sensor as get_sensor_device gives it. */
export interface SensorDeviceDetail extends SensorDevice {
  first_reading_at: string | null;
  hub: SensorHub | null;
}

/** What get_sensor_device answers: the sensor, or DEVICE_NOT_FOUND. */
export interface SensorDeviceResponse {
  success: boolean;
  data?: SensorDeviceDetail;
  error_code?: string;
  error?: string;
  message?: string;
}

/** The detail screen's answer: `device` is null when the facility has no such sensor. */
export interface SensorDeviceResult {
  device: SensorDeviceDetail | null;
}

export interface SensorReading {
  id: string;
  device_id: string;
  device_name: string;
  temperature: number | null;
  humidity: number | null;
  recorded_at: string;
  measured_at?: string;
}

export interface SensorDashboard {
  total_active_sensors: number;
  online_sensors: number;
  offline_sensors: number;
  stale_sensors: number;
  low_battery_count: number;
  critical_battery_count: number;
  sensors_with_failures: number;
  most_recent_sync: string | null;
}

export interface SensorPollingResponse {
  success: boolean;
  poll_timestamp: string;
  devices: SensorDevice[];
  new_readings: SensorReading[];
  dashboard: SensorDashboard;
}
