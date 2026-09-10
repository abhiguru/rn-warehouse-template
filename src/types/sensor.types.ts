// Temperature/Humidity Sensor Type Definitions

export interface SensorDevice {
  id: string;
  device_name: string;
  mac_address: string;
  location: string;
  active: boolean;
  health_status: 'healthy' | 'warning' | 'critical';
  battery_status: 'GOOD' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
  connectivity_status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  is_stale: boolean;
  last_reading_at: string | null;
  staleness_threshold_minutes: number;
  consecutive_failures: number;
  latest_temperature: number | null;
  latest_humidity: number | null;
  latest_reading_timestamp: string | null;
  earliest_reading_at: string | null; // Earliest reading for determining available history
}

export interface SensorReading {
  id: string;
  device_id: string;
  device_name: string;
  temperature: number;
  humidity: number;
  recorded_at: string;
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

export interface SensorServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
