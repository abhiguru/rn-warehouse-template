// Sensor Historical Data Type Definitions

/** Days back. 183 (6 months), 365 and 730 (2 years) are read from the hourly summary when the backend has it (migration 136). */
export type SensorHistoryPeriod = 7 | 14 | 30 | 90 | 183 | 365 | 730;

export interface SensorHistoryReading {
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  /** The lowest and highest of the point's interval, for a long period read from the hourly summary. */
  temperature_min?: number | null;
  temperature_max?: number | null;
  humidity_min?: number | null;
  humidity_max?: number | null;
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
  /**
   * How many raw readings the summary's lowest, average and highest are of (the server's
   * `metadata.raw_reading_count`). `summary.total_readings` counts the chart's points instead.
   */
  raw_reading_count?: number;
}

export interface SensorHistoryMetadata {
  from_date: string;
  to_date: string;
  raw_reading_count: number;
}

/** What getSensorHistory answers; a `ReportServiceResult<SensorHistoryData>` for `useReportQuery`. */
export interface SensorHistoryResponse {
  success: boolean;
  data?: SensorHistoryData | null;
  metadata?: SensorHistoryMetadata;
  message?: string;
  /** The server's code for a failure; an access refusal's is one `isAccessRefusal` reads. */
  error?: string;
}

// Chart data format for react-native-gifted-charts
export interface SensorChartDataPoint {
  /** Undefined for a missing reading; the chart leaves a gap there. */
  value: number | undefined;
  label: string;
  dataPointText?: string;
}
