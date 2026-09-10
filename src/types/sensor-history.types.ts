// Sensor Historical Data Type Definitions

export type SensorHistoryPeriod = 7 | 14 | 30 | 90 | 365;

export interface SensorHistoryReading {
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
}

export interface SensorHistorySummary {
  avg_temperature: number | null;
  min_temperature: number | null;
  max_temperature: number | null;
  avg_humidity: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
  total_readings: number;
}

export interface SensorHistoryData {
  device_id: string;
  device_name: string;
  location: string;
  period_days: number;
  aggregation_interval: string;
  readings: SensorHistoryReading[];
  summary: SensorHistorySummary;
}

export interface SensorHistoryMetadata {
  from_date: string;
  to_date: string;
  raw_reading_count: number;
}

export interface SensorHistoryResponse {
  success: boolean;
  data?: SensorHistoryData;
  metadata?: SensorHistoryMetadata;
  message?: string;
  error?: string;
}

// Chart data format for react-native-gifted-charts
export interface SensorChartDataPoint {
  value: number;
  label: string;
  dataPointText?: string;
}
